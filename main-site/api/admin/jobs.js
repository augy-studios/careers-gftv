// /api/admin/jobs
//
// Section 8.2, the whole of it: the list, the tabbed per language editor, the
// sections builder, the status controls, duplicating, and permanent deletion.
//
//   GET  ?id=<uuid>             one posting, with its translations and tags
//   GET  ?id=<uuid>&impact=true what a permanent deletion would take with it
//   GET  ?q=&status=&dept=&sort=&page=   the list
//   POST { action: 'create'|'update'|'status'|'duplicate'|'delete' }
//
// One route with an action rather than six files, following api/saved/toggle.js
// and the auth routes: the guard, the rate limit, and the shape of the reply are
// identical across all of them, and six files that share those are six places
// for them to drift.
//
// The rules this route is the enforcement point for, all from 8.2:
//
//   **Publishing is refused without a form and without a tag.** Migration 005
//   also refuses the first at the database, which is the right belt and braces:
//   the constraint is what makes it true, and the check here is what makes it a
//   sentence an admin can read instead of a 500.
//
//   **A posting is never deleted to take it down.** Closing and archiving both
//   keep every row. Permanent deletion is admins only, goes behind the three
//   step confirmation on the client, and re-checks the role here regardless.
//
//   **The default language's tab edits the posting; every other tab edits that
//   language's translation row.** Migration 014 forbids a translation row for
//   the default language, so a payload naming one is refused rather than
//   written and rejected by a constraint.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD } from '../_lib/validate.js';
import {
  isAdmin,
  isUuid,
  params,
  pageRange,
  enumParam,
  activeLocales,
  defaultLocale,
} from '../_lib/admin.js';
import {
  JOB_STATUSES,
  JOB_SORTS,
  listAdminJobs,
  adminJobRow,
  translationStates,
  fetchAdminJob,
  checkJobFields,
  checkTranslationFields,
  resolveSlug,
  replaceJobTags,
  publishBlockers,
  deletionImpact,
} from '../_lib/admin-jobs.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin jobs');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);
  const id = search.get('id');

  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

    if (search.get('impact') === 'true') {
      // Counted from the database rather than described, per 8.2. Available to
      // any staff member who can see the posting, because the panel is also
      // what tells a job poster why the control they cannot see exists.
      return ok(res, { id, impact: await deletionImpact(id) });
    }

    const job = await fetchAdminJob(id);
    if (!job) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

    const tagCount = job.tags.length;
    return ok(res, {
      job,
      locales: await activeLocales(),
      // Sent with the posting rather than worked out on the client, so the
      // publish button and the server agree about why it is disabled.
      publish_blockers: publishBlockers(job, tagCount),
    });
  }

  const { from, to, page, size } = pageRange(search, { size: 25, max: 100 });

  const q = (search.get('q') ?? '').trim().slice(0, 120) || null;
  const status = enumParam(search, 'status', JOB_STATUSES);
  const sort = enumParam(search, 'sort', JOB_SORTS);
  const departmentId = search.get('dept');

  const { rows, total } = await listAdminJobs({
    q,
    status,
    departmentId: isUuid(departmentId ?? '') ? departmentId : null,
    sort,
    from,
    to,
  });

  const [departments, states, locales] = await Promise.all([
    departmentMap(),
    translationStates(rows.map((row) => row.id)),
    // Sent with the list as well as with one posting, so the language column
    // can draw a pill for a language nobody has started rather than leaving the
    // cell empty. An absent translation is the state that column exists to show.
    activeLocales(),
  ]);

  return ok(res, {
    jobs: rows.map((row) => adminJobRow(row, departments, states)),
    locales,
    total,
    page,
    limit: size,
  });
}

/**
 * Departments as an id to summary map.
 *
 * The base row's name, not a translation. An admin list shows a posting as it
 * is stored, for the reason written out in api/admin/stats.js: a list that
 * resolved names into the reader's language while linking to an editor tabbed
 * by language would have the two disagree on the same screen.
 */
async function departmentMap() {
  const { data, error } = await supabase
    .from(T.departments)
    .select('id, name, slug')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, { id: row.id, name: row.name, slug: row.slug }]));
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['create', 'update', 'status', 'duplicate', 'delete'];

async function write(req, res, session) {
  const body = await readJson(req, res, 256 * 1024);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  const bucket = action === 'delete' ? 'adminDelete' : 'admin';
  if (await limited(res, bucket, subjects)) return;

  const done = () => recordFailures(bucket, subjects, LIMITS[bucket]);

  switch (action) {
    case 'create':
      return createJob(res, session, body, done);
    case 'update':
      return updateJob(res, session, body, done);
    case 'status':
      return changeJobStatus(res, session, body, done);
    case 'duplicate':
      return duplicateJob(res, session, body, done);
    default:
      return deleteJob(res, session, body, done);
  }
}

/**
 * Validate the base fields and the translations together.
 *
 * Both halves come back as one details object keyed by field, with translation
 * fields prefixed by their language, so the editor can put every error on the
 * tab it belongs to in one pass rather than saving three times to find three
 * problems.
 */
async function checkPayload(body, currentFormUrl) {
  const locales = await activeLocales();
  const codes = locales.map((locale) => locale.code);
  const base = await defaultLocale();

  const fields = checkJobFields(body.job ?? {}, {
    locales: codes,
    currentFormUrl,
  });

  const details = { ...(fields.details ?? {}) };
  const translations = {};

  for (const [locale, value] of Object.entries(body.translations ?? {})) {
    if (!codes.includes(locale)) {
      details[`translations.${locale}`] = FIELD.INVALID;
      continue;
    }
    // Migration 014's constraint, surfaced as a refusal rather than a 500. The
    // default language lives on the posting; a row here for it would be a
    // second, competing copy.
    if (locale === base) {
      details[`translations.${locale}`] = FIELD.INVALID;
      continue;
    }

    const checked = checkTranslationFields(value ?? {}, { ready: value?.is_ready === true });
    if (checked.details) {
      for (const [field, code] of Object.entries(checked.details)) {
        details[`${locale}.${field}`] = code;
      }
      continue;
    }

    translations[locale] = checked.values;
  }

  return {
    values: fields.values,
    translations,
    details: Object.keys(details).length > 0 ? details : null,
  };
}

/** Write the translation rows for one posting. */
async function saveTranslations(jobId, translations) {
  const rows = Object.entries(translations).map(([locale, values]) => ({
    job_id: jobId,
    locale,
    ...values,
  }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from(T.jobTranslations)
    .upsert(rows, { onConflict: 'job_id,locale' });

  if (error) throw error;
}

async function createJob(res, session, body, done) {
  const checked = await checkPayload(body, null);
  if (checked.details) {
    return fail(res, ERR.BAD_REQUEST, 'That posting could not be saved.', {
      details: checked.details,
    });
  }

  if (!checked.values.title) {
    return fail(res, ERR.BAD_REQUEST, 'A posting needs a title.', {
      details: { title: FIELD.REQUIRED },
    });
  }

  const slug = await resolveSlug({ slug: body.job?.slug, title: checked.values.title });
  if (!slug.ok) {
    return fail(res, ERR.CONFLICT, 'That web address is already in use.', {
      details: { slug: slug.code },
    });
  }

  const { data, error } = await supabase
    .from(T.jobs)
    .insert({
      ...checked.values,
      slug: slug.value,
      // Always a draft. Publishing is its own action with its own checks, and
      // a create that could publish would be a second path past them.
      status: 'draft',
      created_by: session.user.id,
    })
    .select('id, slug, title, status')
    .single();

  if (error) throw error;

  await saveTranslations(data.id, checked.translations);
  if (Array.isArray(body.tag_ids)) await replaceJobTags(data.id, body.tag_ids);

  await auditStaff(
    session.user,
    AUDIT.JOB_CREATED,
    { title: data.title, slug: data.slug },
    { targetTable: T.jobs, targetId: data.id }
  );

  await done();
  return ok(res, { job: data }, { status: 201 });
}

async function updateJob(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

  const { data: current, error: readError } = await supabase
    .from(T.jobs)
    .select('id, status, slug, title, application_form_url')
    .eq('id', id)
    .maybeSingle();

  if (readError) throw readError;
  if (!current) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

  const checked = await checkPayload(body, current.application_form_url);
  if (checked.details) {
    return fail(res, ERR.BAD_REQUEST, 'That posting could not be saved.', {
      details: checked.details,
    });
  }

  const patch = { ...checked.values };

  if (typeof body.job?.slug === 'string') {
    const slug = await resolveSlug({ slug: body.job.slug, title: patch.title ?? current.title }, id);
    if (!slug.ok) {
      return fail(res, ERR.CONFLICT, 'That web address is already in use.', {
        details: { slug: slug.code },
      });
    }
    patch.slug = slug.value;
  }

  // A published posting must keep its form, per migration 005's constraint.
  // Caught here so the answer is a field error rather than a database one.
  if (current.status === 'published' && 'application_form_url' in patch && !patch.application_form_url) {
    return fail(res, ERR.CONFLICT, 'A published posting has to keep its application form.', {
      details: { application_form_url: FIELD.REQUIRED },
    });
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from(T.jobs).update(patch).eq('id', id);
    if (error) throw error;
  }

  await saveTranslations(id, checked.translations);
  if (Array.isArray(body.tag_ids)) await replaceJobTags(id, body.tag_ids);

  // No audit row. An edit to a posting's wording is a row with an updated_at on
  // it already, and logging every keystroke's worth of saves would bury the
  // rows that matter. Publishing, deleting, and status changes are logged.

  await done();
  const job = await fetchAdminJob(id);
  return ok(res, { job, publish_blockers: publishBlockers(job, job.tags.length) });
}

/**
 * Publish, unpublish, close, or archive.
 *
 * The four are one action because they are one column, and separating them
 * would put the publish checks in one file and the archive rules in another.
 */
async function changeJobStatus(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

  const next = String(body.status ?? '');
  if (!JOB_STATUSES.includes(next)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a status a posting can be in.', {
      details: { status: FIELD.INVALID },
    });
  }

  const job = await fetchAdminJob(id);
  if (!job) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

  if (next === 'published') {
    const blockers = publishBlockers(job, job.tags.length);
    if (blockers.length > 0) {
      return fail(res, ERR.CONFLICT, 'That posting is not ready to publish.', {
        details: { blockers },
      });
    }
  }

  const patch = { status: next };

  // published_at is when it first went out, and it stays that way. Unpublishing
  // and republishing does not make a posting new, and the board sorts by this
  // column: rewriting it would push a role that has been open for a month to
  // the top of "latest openings" because somebody fixed a typo through a draft.
  if (next === 'published' && !job.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await supabase.from(T.jobs).update(patch).eq('id', id);
  if (error) throw error;

  await auditStaff(
    session.user,
    AUDIT.JOB_STATUS_CHANGED,
    { from: job.status, to: next, title: job.title },
    { targetTable: T.jobs, targetId: id }
  );

  await done();
  return ok(res, { id, status: next, published_at: patch.published_at ?? job.published_at });
}

/**
 * Duplicate a posting, per 8.2.
 *
 * The copy is a draft, carries the translations, the sections, and the tags, and
 * does not carry anything about the original's life: no published_at, no form
 * health check result, and none of its applications, which belong to the role
 * that was actually advertised.
 *
 * The form URL *is* copied. A duplicate is usually the same role running again,
 * per 7f's note that a reposted role gets a new uuid and therefore no cooldown,
 * and making somebody paste the form back in every time would be the sort of
 * friction that gets worked around by editing the original instead.
 */
async function duplicateJob(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

  const source = await fetchAdminJob(id);
  if (!source) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

  const title = `${source.title} (copy)`;
  const slug = await resolveSlug({ title });

  const copy = {
    slug: slug.value,
    title,
    department_id: source.department_id,
    summary: source.summary,
    description: source.description,
    responsibilities: source.responsibilities,
    requirements: source.requirements,
    nice_to_have: source.nice_to_have,
    sections: source.sections ?? [],
    og_description: source.og_description,
    commitment_type: source.commitment_type,
    location: source.location,
    is_remote: source.is_remote,
    is_paid: source.is_paid,
    compensation_note: source.compensation_note,
    openings: source.openings,
    application_form_url: source.application_form_url,
    form_prefill: source.form_prefill,
    response_sheet_url: source.response_sheet_url,
    task_questions: source.task_questions,
    closes_at: source.closes_at,
    status: 'draft',
    created_by: session.user.id,
  };

  const { data, error } = await supabase.from(T.jobs).insert(copy).select('id, slug, title').single();
  if (error) throw error;

  const translations = {};
  for (const [locale, row] of Object.entries(source.translations ?? {})) {
    const { locale: _locale, updated_at: _updatedAt, ...rest } = row;
    translations[locale] = rest;
  }
  await saveTranslations(data.id, translations);
  await replaceJobTags(
    data.id,
    source.tags.map((tag) => tag.id)
  );

  await auditStaff(
    session.user,
    AUDIT.JOB_CREATED,
    { title: data.title, slug: data.slug, duplicated_from: id },
    { targetTable: T.jobs, targetId: data.id }
  );

  await done();
  return ok(res, { job: data }, { status: 201 });
}

/**
 * Permanent deletion. Admins only, per 8.2.
 *
 * The client puts it behind the three step confirmation from 7g, and this
 * re-checks the role and asks for the slug to have been typed, so a request
 * arriving without the interface still cannot delete a posting by id alone.
 *
 * The audit row is written before the delete, per 7g and the note in migration
 * 012: actor_id has no foreign key precisely so a record can outlive what it
 * describes, and the row here has to outlive the posting.
 */
async function deleteJob(res, session, body, done) {
  if (!isAdmin(session.user)) {
    return fail(res, ERR.FORBIDDEN, 'Only an admin can permanently delete a posting.');
  }

  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

  const { data: job, error: readError } = await supabase
    .from(T.jobs)
    .select('id, slug, title, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) throw readError;
  if (!job) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

  // Typed exactly, like the username in the applicant's own danger zone. The
  // slug rather than the title, because a title is easy to copy by accident
  // from the row above and a slug has to be read off the posting being deleted.
  if (String(body.confirm ?? '').trim() !== job.slug) {
    return fail(res, ERR.BAD_REQUEST, 'Type the posting web address exactly to confirm.', {
      details: { confirm: FIELD.MISMATCH },
    });
  }

  const impact = await deletionImpact(id);

  await auditStaff(
    session.user,
    AUDIT.JOB_DELETED,
    { title: job.title, slug: job.slug, status: job.status, impact },
    { targetTable: T.jobs, targetId: id }
  );

  const { error } = await supabase.from(T.jobs).delete().eq('id', id);
  if (error) throw error;

  await done();
  return ok(res, { id, deleted: true, impact });
}
