// Postings, from the admin's side. Section 8.2.
//
// api/_lib/job-detail.js is the public counterpart and the two are deliberately
// not shared. That file's PUBLIC_COLUMNS allowlist is the thing standing
// between a stranger and application_form_url, per section 4, and it exists so
// that a public payload cannot be widened by an edit to shaping code. An admin
// summary must not be built by relaxing it. So this file has its own list,
// wider on purpose, and neither can grow into the other by accident.
//
// The rules 8.2 sets out that are enforced here rather than in the interface,
// because an interface rule is one fetch away from not applying:
//
//   **A posting cannot be published without an application form**, which
//   migration 005 also enforces with a check constraint, and **not without at
//   least one tag**, which nothing in the database can enforce because the tags
//   are a join table.
//
//   **A posting is never deleted as part of taking it down.** Closing keeps it
//   public and read only; archiving takes it off the board while it still
//   resolves at its uuid for anybody with history, per 7g. Both keep every row.
//   Permanent deletion exists, is admins only, and counts what goes with it from
//   the database rather than describing it, because the cascades in 005 to 008
//   take the applications, the analytics rows, the ratings, and the saved rows.
//
//   **The slug is shared and is not translated.** It is a 301 alias and nothing
//   else, per the decision table, and the canonical address is the uuid.
//
//   **Publishing needs only the default language.** A posting may go out
//   untranslated and reads with the notice from 3a. What the database refuses is
//   a translation marked ready without a title, summary, and description, which
//   is surfaced here as a field error rather than left to fail on a constraint.

import { supabase, T } from './supabase.js';
import { FIELD, validateText } from './validate.js';
import { COMMITMENT_TYPES } from './jobs.js';
import { canPrefill } from './apply.js';
import { checkQuestionSet } from './questions.js';
import { slugify, freeSlug, slugTaken } from './admin.js';

/** The four statuses migration 005 allows. */
export const JOB_STATUSES = Object.freeze(['draft', 'published', 'closed', 'archived']);

/** What the postings list needs. Narrower than the editor, wider than public. */
const LIST_COLUMNS = [
  'id',
  'slug',
  'title',
  'status',
  'department_id',
  'commitment_type',
  'location',
  'is_remote',
  'is_paid',
  'openings',
  'published_at',
  'closes_at',
  'created_at',
  'updated_at',
  // 8.2 wants the health check result on the list as a warning badge. Nothing
  // writes it until phase 9's cron, and the column is there from 005.
  'form_check_state',
  'form_checked_at',
  'form_check_note',
  // Whether the posting carries a question set, per 8.3: "The posting list
  // should show which roles carry a set, since it is a thing an applicant is
  // asked that is not visible on the posting itself."
  'task_questions',
  // Not for display. The list badges a posting with no form, since that is the
  // one thing standing between a draft and being publishable.
  'application_form_url',
].join(', ');

/** Everything the editor writes, plus what it needs to show. */
const EDITOR_COLUMNS = [
  'id',
  'slug',
  'title',
  'department_id',
  'summary',
  'description',
  'responsibilities',
  'requirements',
  'nice_to_have',
  'sections',
  'og_description',
  'commitment_type',
  'location',
  'is_remote',
  'is_paid',
  'compensation_note',
  'openings',
  'status',
  'application_form_url',
  'form_prefill',
  'response_sheet_url',
  'task_questions',
  'form_check_state',
  'form_checked_at',
  'form_check_note',
  'published_at',
  'closes_at',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

/** The translation row's editable columns. */
const TRANSLATION_COLUMNS = [
  'locale',
  'title',
  'summary',
  'description',
  'responsibilities',
  'requirements',
  'nice_to_have',
  'location',
  'compensation_note',
  'sections',
  'og_description',
  'application_form_url',
  'form_prefill',
  'response_sheet_url',
  'is_ready',
  'updated_at',
].join(', ');

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

/** How the list may be sorted. */
export const JOB_SORTS = Object.freeze(['updated', 'created', 'title', 'closing']);

/**
 * The postings list, filtered and paged.
 *
 * Unlike the public search this is a plain PostgREST query rather than the
 * search RPC. The RPC is built for a reader: it filters to published, resolves
 * a language, and ranks by relevance. An admin list needs drafts, needs the
 * status column, and sorts by when something was touched, so borrowing it would
 * mean widening the RPC in exactly the direction section 4 spends its effort
 * closing.
 *
 * @param {{ q?: string|null, status?: string|null, departmentId?: string|null,
 *           sort?: string|null, from: number, to: number }} options
 */
export async function listAdminJobs(options) {
  let query = supabase
    .from(T.jobs)
    .select(LIST_COLUMNS, { count: 'exact' })
    .range(options.from, options.to);

  if (options.status) query = query.eq('status', options.status);
  if (options.departmentId) query = query.eq('department_id', options.departmentId);

  if (options.q) {
    // Title and slug only. ts_headline is not used here, per the trap in
    // next-steps: it is the one field the browser assigns as markup, and an
    // admin list with its own search must sanitise the same way or not
    // highlight at all. This does not highlight at all.
    //
    // The pattern is escaped for PostgREST's or() syntax, where a comma
    // separates the branches and a bare one inside a value would split it.
    const pattern = `%${options.q.replace(/[,()]/g, ' ')}%`;
    query = query.or(`title.ilike.${pattern},slug.ilike.${pattern}`);
  }

  switch (options.sort) {
    case 'created':
      query = query.order('created_at', { ascending: false });
      break;
    case 'title':
      query = query.order('title', { ascending: true });
      break;
    case 'closing':
      // Nulls last, per migration 005: a posting with no deadline is open until
      // filled and belongs at the end rather than the top.
      query = query.order('closes_at', { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order('updated_at', { ascending: false });
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * One posting as a row in the admin list.
 *
 * @param {object} row
 * @param {Map<string, object>} departments
 * @param {Map<string, string[]>} translationStates job id to the languages that
 *        are ready, so a half finished translation is visible without opening it
 */
export function adminJobRow(row, departments, translationStates) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    department: row.department_id ? (departments.get(row.department_id) ?? null) : null,
    commitment_type: row.commitment_type,
    location: row.location,
    is_remote: row.is_remote === true,
    is_paid: row.is_paid === true,
    openings: row.openings,
    published_at: row.published_at,
    // Null is open until filled. 8.2: "Show open ended postings distinctly in
    // the admin list so they are easy to audit, since nothing will ever close
    // them automatically."
    closes_at: row.closes_at,
    has_deadline: row.closes_at !== null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_form: Boolean(row.application_form_url),
    form_check_state: row.form_check_state,
    form_check_note: row.form_check_note ?? null,
    has_questions: Array.isArray(row.task_questions) && row.task_questions.length > 0,
    question_count: Array.isArray(row.task_questions) ? row.task_questions.length : 0,
    translations: translationStates.get(row.id) ?? [],
  };
}

/**
 * The translation state of each language, for a set of postings.
 *
 * 8.2: "A tab shows at a glance whether that language is complete, in progress,
 * or absent, and the same state shows in the postings list, so a half finished
 * translation is visible without opening it."
 *
 * complete is is_ready, which the database will only allow with a title, a
 * summary, and a description. Anything else with a row is in progress. A
 * language with no row is absent and simply does not appear in the list.
 *
 * @param {string[]} jobIds
 * @returns {Promise<Map<string, Array<{ locale: string, state: string }>>>}
 */
export async function translationStates(jobIds) {
  const states = new Map();
  if (jobIds.length === 0) return states;

  const { data, error } = await supabase
    .from(T.jobTranslations)
    .select('job_id, locale, is_ready')
    .in('job_id', jobIds);

  if (error) {
    // A list that cannot say which languages are done is still a usable list.
    console.warn('[careers-gftv] translation states:', error);
    return states;
  }

  for (const row of data ?? []) {
    const list = states.get(row.job_id) ?? [];
    list.push({ locale: row.locale, state: row.is_ready ? 'complete' : 'in_progress' });
    states.set(row.job_id, list);
  }

  return states;
}

/* -------------------------------------------------------------------------
 * One posting, for the editor
 * ---------------------------------------------------------------------- */

/**
 * One posting with its translations and tags.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function fetchAdminJob(jobId) {
  const { data, error } = await supabase
    .from(T.jobs)
    .select(EDITOR_COLUMNS)
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [translations, tags] = await Promise.all([
    supabase.from(T.jobTranslations).select(TRANSLATION_COLUMNS).eq('job_id', jobId),
    supabase.from(T.jobTags).select(`tag_id, tag:${T.tags} ( id, name, slug, colour )`).eq('job_id', jobId),
  ]);

  if (translations.error) throw translations.error;
  if (tags.error) throw tags.error;

  return {
    ...data,
    translations: Object.fromEntries(
      (translations.data ?? []).map((row) => [row.locale, row])
    ),
    tags: (tags.data ?? []).map((row) => row.tag).filter(Boolean),
  };
}

/* -------------------------------------------------------------------------
 * Validation
 * ---------------------------------------------------------------------- */

const TITLE_MAX = 200;
const SUMMARY_MAX = 500;
const BODY_MAX = 20000;
const LOCATION_MAX = 120;
const OG_MAX = 300;
const URL_MAX = 500;
const HEADING_MAX = 120;
const MAX_SECTIONS = 20;

/**
 * Whether a URL is a Google Forms address at all, per 8.2: "Validate that the
 * form URL is a real Google Forms address and refuse to publish a job without
 * one."
 *
 * Both shapes are accepted, and that is a deliberate departure from the
 * strictness of canPrefill. A forms.gle short link is a real Google Form and a
 * posting with no prefill map works perfectly well with one; refusing it would
 * block a legitimate posting to enforce a rule about a feature it is not using.
 * What is refused is a prefill map on a URL that cannot carry prefill, checked
 * below, which is the case 7b is actually about.
 *
 * @param {string} url
 */
export function isGoogleFormUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'forms.gle') return parsed.pathname.length > 1;
    if (parsed.hostname === 'docs.google.com') return parsed.pathname.startsWith('/forms/');
    return false;
  } catch {
    return false;
  }
}

function checkFormUrl(value, { required = false } = {}) {
  const text = validateText(value, URL_MAX);
  if (!text.ok) return text;
  if (text.value === null) {
    return required ? { ok: false, code: FIELD.REQUIRED } : { ok: true, value: null };
  }
  if (!isGoogleFormUrl(text.value)) return { ok: false, code: FIELD.INVALID };
  return { ok: true, value: text.value };
}

/**
 * A prefill map: Google Form entry ids to applicant fields.
 *
 * The allowlist of fields lives in apply.js, which is where the map is read.
 * This checks the shape only, so an admin finds out about a typo on save rather
 * than by an applicant getting a plain form.
 */
const ENTRY_KEY = /^entry\.\d{1,20}$/;
const PREFILL_FIELDS = Object.freeze(['email', 'display_name', 'username', 'phone']);

function checkPrefill(value, formUrl) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: FIELD.INVALID };

  const entries = Object.entries(value);
  if (entries.length === 0) return { ok: true, value: null };
  if (entries.length > 30) return { ok: false, code: FIELD.TOO_LONG };

  const cleaned = {};
  for (const [entry, field] of entries) {
    if (!ENTRY_KEY.test(entry)) return { ok: false, code: FIELD.INVALID };
    if (!PREFILL_FIELDS.includes(String(field))) return { ok: false, code: FIELD.INVALID };
    cleaned[entry] = String(field);
  }

  // 7b, and the one prefill rule worth failing a save over: a short link
  // silently drops the query parameters, so a map on one produces a form that
  // looks prefilled in the admin's head and is empty on the applicant's screen.
  if (!formUrl || !canPrefill(formUrl)) return { ok: false, code: FIELD.MISMATCH };

  return { ok: true, value: cleaned };
}

/**
 * The sections builder's value, per 8.2 and migration 019.
 *
 * An array of {heading, body}, in display order. Both are required on every
 * section, which is what gftvjobs_sections_valid enforces, so an empty one is
 * dropped rather than refused: a builder that adds a blank row and lets you
 * type into it should not fail to save because you added one and changed your
 * mind.
 */
function checkSections(value) {
  if (value === null || value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, code: FIELD.INVALID };
  if (value.length > MAX_SECTIONS) return { ok: false, code: FIELD.TOO_LONG };

  const cleaned = [];

  for (const section of value) {
    if (!section || typeof section !== 'object') return { ok: false, code: FIELD.INVALID };

    const heading = String(section.heading ?? '').replace(/\s+/g, ' ').trim();
    const body = String(section.body ?? '').trim();

    if (heading === '' && body === '') continue;
    if (heading === '' || body === '') return { ok: false, code: FIELD.REQUIRED };
    if (heading.length > HEADING_MAX) return { ok: false, code: FIELD.TOO_LONG };
    if (body.length > BODY_MAX) return { ok: false, code: FIELD.TOO_LONG };

    cleaned.push({ heading, body });
  }

  return { ok: true, value: cleaned };
}

/** A timestamp, or null for "no closing date". */
function checkDate(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, code: FIELD.INVALID };

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return { ok: false, code: FIELD.INVALID };

  return { ok: true, value: new Date(parsed).toISOString() };
}

/**
 * Validate the base row's fields, as the editor's default language tab submits
 * them.
 *
 * Returns a patch rather than a whole row, so a save that names three fields
 * writes three columns. That matters for the status field in particular: status
 * is changed through its own endpoint, which writes published_at alongside it,
 * and letting the editor set it directly would be a second path to publishing
 * that skips the publish checks.
 *
 * @param {object} body
 * @param {{ locales: readonly string[] }} context
 * @returns {{ values: object, details: Record<string,string>|null }}
 */
export function checkJobFields(body, context) {
  const details = {};
  const values = {};

  const set = (field, result) => {
    if (result.ok) values[field] = result.value;
    else details[field] = result.code;
  };

  if ('title' in body) {
    set('title', validateText(body.title, TITLE_MAX, { required: true }));
  }
  if ('summary' in body) set('summary', validateText(body.summary, SUMMARY_MAX));
  if ('description' in body) set('description', validateText(body.description, BODY_MAX));
  if ('responsibilities' in body) {
    set('responsibilities', validateText(body.responsibilities, BODY_MAX));
  }
  if ('requirements' in body) set('requirements', validateText(body.requirements, BODY_MAX));
  if ('nice_to_have' in body) set('nice_to_have', validateText(body.nice_to_have, BODY_MAX));
  if ('location' in body) set('location', validateText(body.location, LOCATION_MAX));
  if ('compensation_note' in body) {
    set('compensation_note', validateText(body.compensation_note, SUMMARY_MAX));
  }
  if ('og_description' in body) set('og_description', validateText(body.og_description, OG_MAX));
  if ('sections' in body) set('sections', checkSections(body.sections));
  if ('closes_at' in body) set('closes_at', checkDate(body.closes_at));

  if ('department_id' in body) {
    const value = body.department_id;
    if (value === null || value === '') values.department_id = null;
    else if (typeof value === 'string') values.department_id = value;
    else details.department_id = FIELD.INVALID;
  }

  if ('commitment_type' in body) {
    const value = body.commitment_type;
    if (value === null || value === '') values.commitment_type = null;
    else if (COMMITMENT_TYPES.includes(value)) values.commitment_type = value;
    else details.commitment_type = FIELD.INVALID;
  }

  if ('is_remote' in body) values.is_remote = body.is_remote === true;
  // Defaults to unpaid, per phase 2's note and the decision table: every
  // posting is unpaid today, and pay is a fact per posting rather than a
  // promise in the site's copy. An absent field on a new posting therefore
  // means false, which the column's own default already gives us.
  if ('is_paid' in body) values.is_paid = body.is_paid === true;

  if ('openings' in body) {
    const openings = Number(body.openings);
    if (Number.isInteger(openings) && openings >= 0 && openings <= 999) {
      values.openings = openings;
    } else {
      details.openings = FIELD.INVALID;
    }
  }

  if ('application_form_url' in body) {
    set('application_form_url', checkFormUrl(body.application_form_url));
  }
  if ('response_sheet_url' in body) {
    const sheet = validateText(body.response_sheet_url, URL_MAX);
    if (!sheet.ok) details.response_sheet_url = sheet.code;
    else if (sheet.value === null) values.response_sheet_url = null;
    else if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheet.value)) {
      details.response_sheet_url = FIELD.INVALID;
    } else values.response_sheet_url = sheet.value;
  }

  if ('form_prefill' in body) {
    // Checked against the form URL in the same submission where there is one,
    // and against the stored one otherwise. The caller passes the stored value
    // in through context when it has it.
    const url =
      'application_form_url' in values
        ? values.application_form_url
        : (context.currentFormUrl ?? null);
    set('form_prefill', checkPrefill(body.form_prefill, url));
  }

  if ('task_questions' in body) {
    const value = body.task_questions;
    if (value === null) {
      values.task_questions = null;
    } else {
      const checked = checkQuestionSet(value, { locales: context.locales });
      if (checked.ok) values.task_questions = checked.value;
      else details.task_questions = checked.code;
    }
  }

  return { values, details: Object.keys(details).length > 0 ? details : null };
}

/**
 * Validate one translation row's fields.
 *
 * The three the database insists on when is_ready is set are surfaced as field
 * errors rather than left to fail on the constraint, per 8.2. The optional
 * fields still fall back to the posting silently, which is what the
 * needs-translation audit in 8.11 exists to find.
 *
 * @param {object} body
 * @param {{ ready: boolean }} context
 */
export function checkTranslationFields(body, context) {
  const details = {};
  const values = {};

  const set = (field, result) => {
    if (result.ok) values[field] = result.value;
    else details[field] = result.code;
  };

  if ('title' in body) set('title', validateText(body.title, TITLE_MAX));
  if ('summary' in body) set('summary', validateText(body.summary, SUMMARY_MAX));
  if ('description' in body) set('description', validateText(body.description, BODY_MAX));
  if ('responsibilities' in body) {
    set('responsibilities', validateText(body.responsibilities, BODY_MAX));
  }
  if ('requirements' in body) set('requirements', validateText(body.requirements, BODY_MAX));
  if ('nice_to_have' in body) set('nice_to_have', validateText(body.nice_to_have, BODY_MAX));
  if ('location' in body) set('location', validateText(body.location, LOCATION_MAX));
  if ('compensation_note' in body) {
    set('compensation_note', validateText(body.compensation_note, SUMMARY_MAX));
  }
  if ('og_description' in body) set('og_description', validateText(body.og_description, OG_MAX));

  if ('sections' in body) {
    // A translation may carry a different number of sections from the base row,
    // per 8.2: "a translator who merges two has not done anything wrong, so do
    // not enforce a matching count."
    set('sections', checkSections(body.sections));
  }

  if ('application_form_url' in body) {
    set('application_form_url', checkFormUrl(body.application_form_url));
  }
  if ('form_prefill' in body) {
    const url =
      'application_form_url' in values
        ? values.application_form_url
        : (body.__current_form_url ?? null);
    set('form_prefill', checkPrefill(body.form_prefill, url));
  }
  if ('response_sheet_url' in body) {
    set('response_sheet_url', validateText(body.response_sheet_url, URL_MAX));
  }

  if (context.ready) {
    for (const field of ['title', 'summary', 'description']) {
      const value = field in values ? values[field] : body[field];
      if (!value || String(value).trim() === '') details[field] = FIELD.REQUIRED;
    }
  }

  values.is_ready = context.ready === true;

  return { values, details: Object.keys(details).length > 0 ? details : null };
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

/**
 * A slug for a posting, from the manual override or from the title.
 *
 * @param {{ slug?: unknown, title?: unknown }} body
 * @param {string|null} jobId the row being edited, which may keep its own slug
 */
export async function resolveSlug(body, jobId = null) {
  const manual = typeof body.slug === 'string' ? slugify(body.slug) : '';
  if (manual) {
    // A manual slug that is taken is an error rather than something to silently
    // suffix: the admin typed a specific address and should be told it is gone.
    if (await slugTaken(T.jobs, manual, jobId)) {
      return { ok: false, code: FIELD.TAKEN };
    }
    return { ok: true, value: manual };
  }

  const fromTitle = slugify(body.title ?? '');
  // A posting written in Chinese slugifies to nothing, which is fine: the uuid
  // is the canonical address and the slug is an alias. 'posting' plus a suffix
  // is a working alias, and an admin who wants a readable one can type it.
  return { ok: true, value: await freeSlug(T.jobs, fromTitle || 'posting', jobId) };
}

/**
 * Replace a posting's tags.
 *
 * Delete then insert rather than a diff, because gftvjobs_job_tags is a two
 * column join table with a compound primary key and the triggers in 007 that
 * maintain usage_count fire on both. A diff would save at most one statement
 * and would have to get the trigger accounting right by itself.
 *
 * @param {string} jobId
 * @param {string[]} tagIds
 */
export async function replaceJobTags(jobId, tagIds) {
  const unique = [...new Set(tagIds.filter(Boolean))].slice(0, 40);

  const { error: deleteError } = await supabase.from(T.jobTags).delete().eq('job_id', jobId);
  if (deleteError) throw deleteError;

  if (unique.length === 0) return;

  const { error } = await supabase
    .from(T.jobTags)
    .insert(unique.map((tagId) => ({ job_id: jobId, tag_id: tagId })));

  if (error) throw error;
}

/**
 * Whether a posting may be published, per 8.2.
 *
 * Two conditions, and both are refusals rather than warnings: a form, because
 * an applicant clicking Apply on a posting without one gets nothing, and a tag,
 * because the board's filters are tags and an untagged posting is findable only
 * by search.
 *
 * @param {object} job the row as it will be
 * @param {number} tagCount
 * @returns {string[]} the reasons it cannot be published, empty when it can
 */
export function publishBlockers(job, tagCount) {
  const blockers = [];
  if (!job.application_form_url) blockers.push('no_form');
  if (tagCount < 1) blockers.push('no_tags');
  if (!job.title || String(job.title).trim() === '') blockers.push('no_title');
  return blockers;
}

/**
 * What a permanent deletion would take with it, counted from the database.
 *
 * 8.2: "The panel at step 1 names exactly what goes with the posting, counted
 * from the database rather than described in the abstract." The cascades in
 * migrations 005 to 008 are what make these rows disappear, and an admin
 * deleting a posting that eleven people applied to should see the eleven.
 *
 * @param {string} jobId
 */
export async function deletionImpact(jobId) {
  const count = async (table, column = 'job_id') => {
    const { count: rows, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, jobId);
    if (error) throw error;
    return rows ?? 0;
  };

  const [applications, analytics, ratings, saved, tasks, invites, submissions] =
    await Promise.all([
      count(T.applications),
      count(T.analytics),
      count(T.ratings),
      count(T.savedJobs),
      count(T.tasks),
      count(T.invites),
      count(T.formSubmissions),
    ]);

  return {
    applications,
    analytics,
    ratings,
    saved,
    // Tasks are the one row here that is not deleted: migration 008 sets job_id
    // to null rather than cascading, so an applicant keeps a message about a
    // posting that no longer exists. Counted anyway, because it is a thing that
    // happens to somebody and the panel should not claim otherwise.
    tasks,
    invites,
    submissions,
  };
}
