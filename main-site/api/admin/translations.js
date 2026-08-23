// /api/admin/translations
//
// Section 8.11, the queue of translation problems and the tooling to act on
// them.
//
//   GET                      the queue, filtered and paged, with the status counts
//   GET  ?id=<uuid>          one report, with the wording it is about
//   POST { action: 'edit' }      rewrite one field of what it points at
//   POST { action: 'resolve' }   move it through the queue with a note
//
// **Not admins only**, and that is the same call phase 8 made about analytics.
// 8.8 and 8.9 say admins only and give their reasons; 8.11 does not. A job
// poster whose posting reads wrongly in Chinese is exactly the person who should
// be able to fix the sentence, and everything they can change from here they can
// already change in the editor. Section 10 item 1's "an admin has full control"
// is about an admin overriding a poster's work, not about keeping a poster out.
//
// **Nothing here writes an audit row**, and that is deliberate rather than
// forgotten. Phase 7 set the line: what is logged is what changes somebody
// else's world, and what is not is an admin editing wording, "which is a row
// with an updated_at on it already". A resolution is stronger than that: 015
// stores resolved_by, resolved_at, and the note on the report itself, precisely
// "so a row cannot quietly leave the queue without an accountable trail". A
// second copy in the audit log would be a second place to look and a second
// place to disagree.
//
// **An interface report is refused an edit here**, per 7i. The dictionaries are
// files; the wording is a code change and a deploy. The page says so, and this
// end refuses it as well, because a hidden control stops nobody.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { params, pageRange, enumParam, isUuid, defaultLocale } from '../_lib/admin.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import { supabase, T } from '../_lib/supabase.js';
import {
  PAGE_SIZE,
  REPORT_STATUSES,
  RESOLVED_STATUSES,
  TARGET_TYPES,
  ORIGINS,
  listReports,
  reportCounts,
  fetchReport,
  applyWording,
  resolveReport,
} from '../_lib/translation-queue.js';

/** Long enough for a paragraph of explanation, short of an essay. */
const NOTE_MAX = 2000;

/**
 * The ceiling on a corrected wording.
 *
 * A posting's description is the longest thing this can rewrite, and the column
 * is plain text with no limit of its own. This is a bound on a request rather
 * than an editorial rule, and it is set under readJson's 64KB body cap rather
 * than near it: Chinese is three bytes a character in UTF-8, so a limit counted
 * in characters has to leave room for the worst case or it refuses a valid
 * correction with a body-too-large rather than a field error.
 */
const WORDING_MAX = 12000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_translations')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin translations');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);
  const source = await defaultLocale();

  const id = search.get('id');
  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a report id.');

    const report = await fetchReport(id, source);
    if (!report) return fail(res, ERR.NOT_FOUND, 'That report could not be found.');

    return ok(res, { report, source_locale: source });
  }

  const { from, to, page, size } = pageRange(search, { size: PAGE_SIZE, max: 100 });

  const [{ rows, total }, counts] = await Promise.all([
    listReports({
      bucket: search.get('bucket') === 'all' ? 'all' : 'unfinished',
      status: enumParam(search, 'status', REPORT_STATUSES),
      // The language is checked against the query rather than a constant, so a
      // language added to gftvjobs_locales later filters without a deploy.
      locale: await localeParam(search),
      targetType: enumParam(search, 'target', TARGET_TYPES),
      origin: enumParam(search, 'origin', ORIGINS),
      from,
      to,
    }),
    reportCounts(),
  ]);

  return ok(res, {
    reports: rows,
    counts,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    source_locale: source,
  });
}

/**
 * A language code from the query string, checked against gftvjobs_locales.
 *
 * Not against LOCALES in validate.js, which is the hot path's fixed list. A
 * report may exist against a language that has since been deactivated, and an
 * admin filtering for it should still find it.
 */
async function localeParam(search) {
  const raw = (search.get('locale') ?? '').trim();
  if (!raw || !/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(raw)) return null;

  const { data, error } = await supabase.from(T.locales).select('code').eq('code', raw).maybeSingle();
  if (error) throw error;

  return data ? raw : null;
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['edit', 'resolve'];

/** Why an edit was refused, as a sentence rather than a code the page invents. */
const REFUSALS = {
  interface_is_code:
    'An interface string lives in assets/i18n and is changed by editing that file and deploying, not from here.',
  not_editable: 'That part cannot be rewritten from this page. Open it in the editor instead.',
  cannot_be_blank: 'That one cannot be left empty.',
  needs_name_first: 'Write the name in this language before its description.',
};

async function write(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;

  const reportId = String(body.report_id ?? '');
  if (!isUuid(reportId)) return fail(res, ERR.BAD_REQUEST, 'That is not a report id.');

  const source = await defaultLocale();
  const report = await fetchReport(reportId, source);
  if (!report) return fail(res, ERR.NOT_FOUND, 'That report could not be found.');

  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  if (action === 'edit') return edit(res, report, body, source, done);
  return resolve(res, session, report, body, source, done);
}

/**
 * Rewrite the wording a report is about.
 *
 * **An edit is not a resolution**, and the two are separate requests on purpose.
 * 8.11 makes the note the thing that closes a report, because "the reporter took
 * the trouble to tell you; closing it silently teaches them not to bother next
 * time". Folding the two together would make the note something an admin skips
 * by finishing the edit, which is exactly the failure the requirement exists to
 * prevent. The page moves the status straight to fixed after a successful edit
 * so the second step is one sentence and a click, rather than a thing to
 * remember.
 */
async function edit(res, report, body, source, done) {
  // **The field is the report's own, never the caller's.** This page fixes what
  // somebody complained about; anything else on that row is the editor's job and
  // has the editor's validation behind it. Taking the field from the request
  // would make this a general purpose single field writer that happens to need a
  // report id, which is not what 8.11 asks for and is a wider write surface than
  // the queue needs.
  const field = report.field ?? '';
  if (!field) {
    return fail(res, ERR.BAD_REQUEST, 'That report does not name a part to rewrite.', {
      details: { text: FIELD.INVALID, reason: 'not_editable' },
    });
  }

  const wording = validateText(body.text, WORDING_MAX);
  if (!wording.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That wording could not be saved.', {
      details: { text: wording.code },
    });
  }

  const result = await applyWording(
    {
      target_type: report.target_type,
      target_id: report.target_id,
      locale: report.locale,
    },
    field,
    wording.value,
    source
  );

  if (!result.ok) {
    return fail(res, ERR.BAD_REQUEST, REFUSALS[result.reason] ?? 'That could not be changed.', {
      details: { text: FIELD.INVALID, reason: result.reason },
    });
  }

  await done();

  // The report is re-read so the panel redraws against what is now stored
  // rather than against what the browser hoped it wrote. It also re-runs the
  // anchor check, so an annotation whose quote the edit has just removed shows
  // as detached at once instead of at the next page load.
  const updated = await fetchReport(report.id, source);
  return ok(res, { report: updated, saved: true });
}

/**
 * Move a report through the queue.
 *
 * The note is required on fixed and rejected, per 8.11, and optional on
 * accepted, which is the state for work in progress rather than a resolution.
 * Moving back to open clears the note entirely: a stale resolution note is read
 * by the reporter through api/translations/mine.js, and one left behind on a
 * reopened report would tell somebody they had been answered when they had not.
 */
async function resolve(res, session, report, body, source, done) {
  const status = String(body.status ?? '').trim();
  if (!REPORT_STATUSES.includes(status)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a state a report can be in.', {
      details: { status: FIELD.INVALID },
    });
  }

  const note = validateText(body.note, NOTE_MAX, {
    required: RESOLVED_STATUSES.includes(status),
  });
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'Say what happened before closing this.', {
      details: { note: note.code },
    });
  }

  await resolveReport(report.id, {
    status,
    note: note.value,
    staffId: session.user.id,
  });

  await done();

  const updated = await fetchReport(report.id, source);
  return ok(res, { report: updated });
}
