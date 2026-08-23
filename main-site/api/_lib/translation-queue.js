// The translation queue, section 8.11.
//
// 7h collects the reports; this is where somebody acts on them. One queue for
// both origins, per 7i: "Annotations and form reports share one queue,
// distinguished by origin. An admin works through a single list whether the item
// came from a form or a selection."
//
// Six things here are decisions rather than queries, and each one is easy to
// undo by accident:
//
//   **There is no interface string editor, and the refusal is server side.**
//   7i says it twice and the decision table repeats it: the dictionaries are
//   files, which is what keeps the site build free and lets them precache for
//   offline. An interface report is shown with its key and the sentence that it
//   is a code change. applyWording refuses target_type 'interface' outright, so
//   a hidden control is not the only thing standing between an admin and a row
//   that would have no effect.
//
//   **A resolution requires a note; accepting does not.** 8.11: "A resolution
//   always requires a note, including a rejection." What 8.11 calls a resolution
//   is fixed and rejected. accepted is the middle state, "while it is being
//   worked on", and demanding a sentence to say you have started would be
//   inventing a rule the brief does not have. Migration 015's check constraint
//   draws the line in exactly the same place, so the interface and the database
//   agree rather than one being stricter than the other by accident.
//
//   **Reopening clears the resolution.** Moving a row back to open drops the
//   note, the resolver, and the time. api/translations/mine.js shows a
//   resolution note to the reporter whatever the status is, so a stale note left
//   on a reopened report would tell somebody they had been answered when they
//   had not.
//
//   **The current wording is read in both languages.** 8.11: "Opening a report
//   shows the current wording beside the suggestion, so an admin can see exactly
//   what would change without opening the posting in another tab." The source is
//   the base row, which holds the default language, and the reported language is
//   its translation row. Both, because a reader complaining about the Chinese is
//   usually comparing it against the English.
//
//   **A report against the default language edits the base row.** Migration 015
//   uses a foreign key rather than a check constraint on locale for exactly that
//   reason: the English can be the wrong one. So the write target is decided by
//   the locale, not assumed to be a translation row.
//
//   **An edit never sets is_ready.** That flag is the job editor's and 8.2's,
//   and it has a database constraint behind it. Fixing one sentence in a
//   translation nobody has marked ready must not quietly publish the rest of it.
//   An upsert that creates a translation row here creates it unready.

import { supabase, T } from './supabase.js';

/** Migration 015's four statuses, in the order 8.11 walks them. */
export const REPORT_STATUSES = Object.freeze(['open', 'accepted', 'fixed', 'rejected']);

/**
 * The two that are a resolution, and so require a note.
 *
 * Kept in step with migration 015's gftvjobs_translation_reports_resolution_complete,
 * which allows open and accepted without one.
 */
export const RESOLVED_STATUSES = Object.freeze(['fixed', 'rejected']);

/** Migration 015's target types. */
export const TARGET_TYPES = Object.freeze(['job', 'department', 'tag', 'interface']);

/** Migration 023's two origins. */
export const ORIGINS = Object.freeze(['form', 'annotation']);

/** How many rows the queue carries at once. */
export const PAGE_SIZE = 25;

/**
 * The fields an admin may rewrite from this page, per target type.
 *
 * An allowlist rather than "whatever the report names", for the same reason
 * admin-jobs.js keeps its own column list: the reported field arrives from a
 * row an applicant created, and a write target must never be one of those.
 *
 * sections is deliberately absent from the job list even though a report may
 * name it. It is a jsonb array of headings and bodies, and a single textarea
 * cannot edit one honestly. The queue sends the admin to the editor for it and
 * says so, which is better than a box that silently rewrites the first section.
 */
const EDITABLE_FIELDS = Object.freeze({
  job: Object.freeze([
    'title',
    'summary',
    'description',
    'responsibilities',
    'requirements',
    'nice_to_have',
    'location',
    'compensation_note',
    'og_description',
  ]),
  department: Object.freeze(['name', 'description']),
  tag: Object.freeze(['name', 'description']),
  interface: Object.freeze([]),
});

/** Whether this report points at something this page can rewrite in place. */
export function isEditable(targetType, field) {
  return (EDITABLE_FIELDS[targetType] ?? []).includes(field ?? '');
}

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

const REPORT_COLUMNS =
  'id, target_type, target_id, target_key, field, locale, reporter_id, note, ' +
  'suggested_text, origin, quote, quote_prefix, quote_suffix, status, ' +
  'resolution_note, resolved_by, resolved_at, created_at, updated_at';

/**
 * The queue, filtered and paged.
 *
 * "Open ones first, newest first", per 8.11, and the first half of that is a
 * filter here rather than an order. PostgREST has no CASE in an order clause, so
 * the only orders available are on a column, and ordering on status would give
 * accepted, fixed, open, rejected, which is alphabetical and meaningless. What
 * 8.11 wants is unfinished work in front of somebody.
 *
 * So the default view is the unfinished one: open and accepted, newest first,
 * and nothing else. `bucket` of 'all' is how an admin looks at what has already
 * been answered, and a `status` filter narrows to exactly one. A queue whose
 * default is everything ever raised is a queue nobody works through.
 *
 * @param {{ bucket?: 'unfinished'|'all', status?: string|null, locale?: string|null,
 *           targetType?: string|null, origin?: string|null,
 *           from: number, to: number }} options
 */
export async function listReports(options) {
  let query = supabase
    .from(T.translationReports)
    .select(REPORT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(options.from, options.to);

  if (options.status) query = query.eq('status', options.status);
  else if (options.bucket !== 'all') query = query.in('status', ['open', 'accepted']);

  if (options.locale) query = query.eq('locale', options.locale);
  if (options.targetType) query = query.eq('target_type', options.targetType);
  if (options.origin) query = query.eq('origin', options.origin);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const [reporters, targets] = await Promise.all([
    reporterNames(rows.map((row) => row.reporter_id)),
    targetNames(rows),
  ]);

  return {
    rows: rows.map((row) => reportRow(row, reporters, targets)),
    total: count ?? 0,
  };
}

/**
 * Counts per status, for the filter tabs.
 *
 * Four head requests rather than one grouped query, because PostgREST has no
 * group by and the alternative is selecting every report into a serverless
 * function to add them up there, which gets slower every week. Four counts
 * against 015's (status, created_at) index is the cheaper wrong shape, and it is
 * the same call 8.4 made about the funnel for the same reason.
 */
export async function reportCounts() {
  const results = await Promise.all(
    REPORT_STATUSES.map((status) =>
      supabase
        .from(T.translationReports)
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
    )
  );

  const counts = {};
  REPORT_STATUSES.forEach((status, index) => {
    const result = results[index];
    // Null rather than zero on a failure, per the rule api/admin/me.js states:
    // a zero is a claim about the state of something, and a failed request does
    // not entitle us to make one.
    counts[status] = result.error ? null : (result.count ?? 0);
  });

  return counts;
}

// The sidebar's own count of open reports is not here. It lives in
// api/admin/me.js beside the other two, because that route answers null rather
// than zero for a count it could not read, and everything in this file throws
// instead. One number is not worth a second error convention.

function reportRow(row, reporters, targets) {
  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    target_key: row.target_key,
    target_label: targets.get(targetKey(row)) ?? null,
    field: row.field,
    locale: row.locale,
    reporter: row.reporter_id ? (reporters.get(row.reporter_id) ?? null) : null,
    note: row.note,
    suggested_text: row.suggested_text,
    origin: row.origin ?? 'form',
    quote: row.quote,
    quote_prefix: row.quote_prefix,
    quote_suffix: row.quote_suffix,
    status: row.status,
    resolution_note: row.resolution_note,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    editable: isEditable(row.target_type, row.field),
  };
}

function targetKey(row) {
  return `${row.target_type}:${row.target_id ?? row.target_key ?? ''}`;
}

/**
 * Who raised each report.
 *
 * reporter_id is null for an account that has since been deleted, per 015's
 * "on delete set null": the record of why a wording changed survives the account
 * that raised it. The list shows that as a deleted account rather than as a
 * blank, which is a different fact from an anonymous report, of which there are
 * none.
 */
async function reporterNames(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.users)
    .select('id, username, display_name')
    .in('id', wanted);

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, username: row.username, display_name: row.display_name },
    ])
  );
}

/**
 * What each report points at, named in the default language.
 *
 * Three queries at most, one per content table, rather than one per row. An
 * interface report needs none: its key is the name.
 */
async function targetNames(rows) {
  const wanted = { job: new Set(), department: new Set(), tag: new Set() };

  for (const row of rows) {
    if (row.target_type === 'interface' || !row.target_id) continue;
    wanted[row.target_type]?.add(row.target_id);
  }

  const names = new Map();

  await Promise.all(
    [
      ['job', T.jobs, 'title'],
      ['department', T.departments, 'name'],
      ['tag', T.tags, 'name'],
    ].map(async ([type, table, column]) => {
      const ids = [...wanted[type]];
      if (ids.length === 0) return;

      const { data, error } = await supabase.from(table).select(`id, ${column}`).in('id', ids);
      if (error) throw error;

      for (const row of data ?? []) names.set(`${type}:${row.id}`, row[column]);
    })
  );

  return names;
}

/* -------------------------------------------------------------------------
 * One report, with the wording it is about
 * ---------------------------------------------------------------------- */

/**
 * One report, with everything an admin needs to decide without leaving the page.
 *
 * @param {string} reportId
 * @param {string} sourceLocale the default language, from gftvjobs_locales
 */
export async function fetchReport(reportId, sourceLocale) {
  const { data, error } = await supabase
    .from(T.translationReports)
    .select(REPORT_COLUMNS)
    .eq('id', reportId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [reporters, targets] = await Promise.all([
    reporterNames([data.reporter_id]),
    targetNames([data]),
  ]);

  const report = reportRow(data, reporters, targets);
  const wording = await currentWording(data, sourceLocale);

  return { ...report, wording, anchor: anchorState(data, wording.reported) };
}

/**
 * The wording as it stands, in the source language and in the reported one.
 *
 * `reported` is null when the language has no translation row at all, which is
 * a real answer rather than a missing one: the report is about text that is
 * falling back to the source. The page says that instead of showing an empty
 * box beside a suggestion.
 */
async function currentWording(row, sourceLocale) {
  if (row.target_type === 'interface') {
    // The dictionaries are files this cannot read, per 7i. The key is what the
    // admin takes to assets/i18n, and the page says so plainly.
    return { source: null, reported: null, is_source_locale: row.locale === sourceLocale };
  }

  const isSourceLocale = row.locale === sourceLocale;
  const base = await baseRow(row.target_type, row.target_id);
  const translation = isSourceLocale
    ? null
    : await translationRow(row.target_type, row.target_id, row.locale);

  const field = row.field;

  // One field, named by the report. A report that names none is "the whole
  // posting", per 7h's form, and gets nulls: there is no single wording to put
  // beside a suggestion, and inventing one by concatenating the row would show
  // an admin something nobody wrote.
  //
  // Nothing else off either row is sent. The base row is read whole because one
  // select is cheaper than one per field, but a payload carrying a posting's
  // status and its whole description to render one paragraph is a payload that
  // grows a new field every time the editor does.
  return {
    source: field ? textOf(base?.[field]) : null,
    reported: field ? textOf(isSourceLocale ? base?.[field] : translation?.[field]) : null,
    has_translation_row: isSourceLocale ? true : translation !== null,
    is_source_locale: isSourceLocale,
  };
}

/**
 * A field's value, if it is prose.
 *
 * 7h's form lets a reporter name `sections`, which is a jsonb array of headings
 * and bodies rather than a string. There is no honest way to show one beside a
 * suggestion in a single quote block, and rendering it anyway would put
 * "[object Object]" on an admin's screen. Null instead, which the panel reads
 * as nothing to compare and answers with the link to the editor.
 */
function textOf(value) {
  return typeof value === 'string' ? value : null;
}

/**
 * Whether an annotation's quote can still be found in the wording it points at.
 *
 * 7i: a suggestion "can be shown as detached rather than silently applied to the
 * wrong place when it cannot". The match is exact on the quote, and the prefix
 * and suffix only narrow it: a quote that appears once needs no disambiguation,
 * and a quote that appears several times is anchored by the run of text either
 * side, per the W3C TextQuoteSelector this follows.
 *
 * A form report has no quote and gets null, which the page reads as "this is not
 * an annotation" rather than as a failure to find one.
 */
function anchorState(row, wording) {
  if ((row.origin ?? 'form') !== 'annotation') return null;

  // An annotation on an interface string cannot be checked from here: the
  // wording is in assets/i18n, which this cannot read. Unknown is the honest
  // answer, and it is not the same as detached, which is a claim that the words
  // have gone.
  if (row.target_type === 'interface') return null;

  if (!row.quote) return 'detached';

  const text = typeof wording === 'string' ? wording : '';
  if (!text) return 'detached';

  const prefix = row.quote_prefix ?? '';
  const suffix = row.quote_suffix ?? '';

  if (prefix || suffix) {
    if (text.includes(`${prefix}${row.quote}${suffix}`)) return 'found';
  }

  // The quote alone, which is what the selector falls back to when the text
  // around it has been edited. Still a real anchor: the words being complained
  // about are still on the page.
  return text.includes(row.quote) ? 'found' : 'detached';
}

// The prose fields only, on both sides. Not sections, which is jsonb and is the
// editor's job, and nothing about the row's own state: this file compares two
// wordings and has no business knowing whether the posting is published.
const BASE_SELECT = Object.freeze({
  job: 'id, title, summary, description, responsibilities, requirements, nice_to_have, location, compensation_note, og_description',
  department: 'id, name, description',
  tag: 'id, name, description',
});

const TRANSLATION_TABLE = Object.freeze({
  job: T.jobTranslations,
  department: T.departmentTranslations,
  tag: T.tagTranslations,
});

const TRANSLATION_KEY = Object.freeze({
  job: 'job_id',
  department: 'department_id',
  tag: 'tag_id',
});

const TRANSLATION_SELECT = Object.freeze({
  job: 'locale, title, summary, description, responsibilities, requirements, nice_to_have, location, compensation_note, og_description, updated_at',
  department: 'locale, name, description, updated_at',
  tag: 'locale, name, description, updated_at',
});

const BASE_TABLE = Object.freeze({
  job: T.jobs,
  department: T.departments,
  tag: T.tags,
});

async function baseRow(targetType, targetId) {
  const table = BASE_TABLE[targetType];
  if (!table || !targetId) return null;

  const { data, error } = await supabase
    .from(table)
    .select(BASE_SELECT[targetType])
    .eq('id', targetId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function translationRow(targetType, targetId, locale) {
  const table = TRANSLATION_TABLE[targetType];
  if (!table || !targetId) return null;

  const { data, error } = await supabase
    .from(table)
    .select(TRANSLATION_SELECT[targetType])
    .eq(TRANSLATION_KEY[targetType], targetId)
    .eq('locale', locale)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* -------------------------------------------------------------------------
 * Acting on one
 * ---------------------------------------------------------------------- */

/**
 * Rewrite one field of the thing a report points at.
 *
 * The correction is text an admin typed into the box, which may or may not be
 * the suggestion. Nothing is ever applied from the report itself: 7h promises
 * the reporter that "an admin reads it first, every time", and a one click
 * apply is how that promise stops being true.
 *
 * A translation row that does not exist yet is created, unready. A department
 * or tag translation cannot be created with a blank name, per 014's check, so
 * a correction to the description of a language with no row is refused with a
 * reason rather than a constraint error.
 *
 * @param {object} report the stored row
 * @param {string} field
 * @param {string|null} text
 * @param {string} sourceLocale
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function applyWording(report, field, text, sourceLocale) {
  if (report.target_type === 'interface') {
    // 7i, twice: "Do not build an interface string editor." The control is
    // absent on the page and the endpoint refuses it here, because a hidden
    // control stops nobody with curl and a wrong idea about where the wording
    // lives.
    return { ok: false, reason: 'interface_is_code' };
  }

  if (!isEditable(report.target_type, field)) {
    return { ok: false, reason: 'not_editable' };
  }

  const value = typeof text === 'string' && text.trim() !== '' ? text.trim() : null;

  if (report.locale === sourceLocale) {
    const table = BASE_TABLE[report.target_type];
    // The base row's name and title are not nullable on any of the three
    // tables, so clearing one is refused rather than attempted.
    if (value === null && REQUIRED_BASE_FIELDS.includes(field)) {
      return { ok: false, reason: 'cannot_be_blank' };
    }

    const { error } = await supabase
      .from(table)
      .update({ [field]: value })
      .eq('id', report.target_id);

    if (error) throw error;
    return { ok: true };
  }

  const table = TRANSLATION_TABLE[report.target_type];
  const key = TRANSLATION_KEY[report.target_type];

  const existing = await translationRow(report.target_type, report.target_id, report.locale);

  if (!existing) {
    // 014 makes name not null on both reference tables, so a row cannot be
    // created by writing its description alone.
    if (report.target_type !== 'job' && field !== 'name') {
      return { ok: false, reason: 'needs_name_first' };
    }
    if (value === null) return { ok: false, reason: 'cannot_be_blank' };

    const { error } = await supabase.from(table).insert({
      [key]: report.target_id,
      locale: report.locale,
      [field]: value,
      // Never is_ready. A correction to one sentence must not publish the rest
      // of a translation nobody has read, per 8.2's rule that only an admin in
      // the editor makes a language live.
    });

    if (error) throw error;
    return { ok: true };
  }

  if (value === null && report.target_type !== 'job' && field === 'name') {
    return { ok: false, reason: 'cannot_be_blank' };
  }

  const { error } = await supabase
    .from(table)
    .update({ [field]: value })
    .eq(key, report.target_id)
    .eq('locale', report.locale);

  if (error) throw error;
  return { ok: true };
}

/**
 * Fields the base rows will not accept as null, per migrations 004 and 005.
 *
 * Only these two. A posting's summary and description are both nullable, so
 * clearing one from here is allowed and is occasionally the right correction:
 * an og_description that reads wrongly is better empty than wrong, because the
 * posting falls back to the first sentence of the description.
 */
const REQUIRED_BASE_FIELDS = Object.freeze(['title', 'name']);

/**
 * Move a report through the queue.
 *
 * The resolution is written as one update rather than as a status change and a
 * note, because migration 015's check constraint reads all three columns at
 * once: a fixed row without a note and a resolved_at is refused by the database,
 * which is the point of putting it there instead of in the interface alone.
 *
 * @param {string} reportId
 * @param {{ status: string, note: string|null, staffId: string }} change
 */
export async function resolveReport(reportId, change) {
  const resolving = RESOLVED_STATUSES.includes(change.status);

  const patch = {
    status: change.status,
    resolution_note: change.status === 'open' ? null : change.note,
    resolved_by: resolving ? change.staffId : null,
    resolved_at: resolving ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from(T.translationReports)
    .update(patch)
    .eq('id', reportId)
    .select('id, status, resolution_note, resolved_at')
    .maybeSingle();

  if (error) throw error;
  return data;
}
