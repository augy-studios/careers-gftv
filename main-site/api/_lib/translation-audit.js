// The needs-translation audit, section 8.11.
//
// The queue in translation-queue.js is what readers have complained about. This
// is the other half of 8.11 and asks the opposite question: what has nobody
// translated yet, whether or not anybody has noticed. 8.11 asks for "every
// posting, department, and tag with no translation, plus every translation
// drafted but not marked ready, plus every translation whose optional fields are
// thinner than the source".
//
// **The comparison is a view and not a query here**, and 8.11 says why: the last
// of those three "compares across two tables, which is exactly why it needs a
// view". gftvjobs_needs_translation came with migration 032 in part 1 and does
// the whole comparison in the database, including deciding which fields are
// absent. This file filters, pages, and shapes it, and makes no editorial
// judgement of its own beyond that.
//
// Three things here are decisions rather than plumbing:
//
//   **The audit is per language.** The view crosses every active non default
//   language, so a list of every language at once would need a language column
//   on every row and counts that answer nothing: seventeen missing, spread how?
//   A language is chosen, the counts are that language's, and the totals mean
//   something.
//
//   **A finished translation is not in the view at all**, by design, so this
//   file never has to filter one out. That also means an empty list is the
//   real answer to "what is left in Chinese", which is why the page says so in
//   those words rather than with "no results".
//
//   **The order is by when the thing was last touched**, newest first, not by
//   state. The state order that would be useful is missing, then drafted, then
//   thin, and PostgREST has no CASE in an order clause, so ordering on the
//   column itself would give drafted, missing, thin: alphabetical and
//   meaningless. The state is a filter with a count beside it instead, which is
//   the same call listReports made about the queue's statuses.

import { supabase, T } from './supabase.js';

/** The three states migration 032's view can put a row in, in order of work left. */
export const AUDIT_STATES = Object.freeze(['missing', 'drafted', 'thin']);

/**
 * What the audit covers.
 *
 * Not TARGET_TYPES from the queue, which includes `interface`. The dictionaries
 * are files rather than rows, per 7i, so nothing in the database can say whether
 * a key has been translated; `npm run check-i18n` is what answers that and it is
 * run at a terminal rather than read off a page.
 */
export const AUDIT_TARGETS = Object.freeze(['job', 'department', 'tag']);

/** Same page size as the queue, so the two tabs page alike. */
export const AUDIT_PAGE_SIZE = 25;

const AUDIT_COLUMNS =
  'target_type, target_id, locale, source_label, source_status, state, missing_fields, updated_at';

/**
 * What is left to translate in one language.
 *
 * @param {{ locale: string, targetType?: string|null, state?: string|null,
 *           from: number, to: number }} options
 */
export async function listNeedsTranslation(options) {
  let query = supabase
    .from(T.needsTranslation)
    .select(AUDIT_COLUMNS, { count: 'exact' })
    .eq('locale', options.locale)
    .order('updated_at', { ascending: false })
    // The tie breaker is not decoration. updated_at on a missing row is the
    // source's, and a batch of postings created in one sitting share it to the
    // second, so without a second key two pages of results can contain the same
    // row and miss another. The view has no id of its own, and target_id is
    // unique within a target type and a language.
    .order('target_id', { ascending: true })
    .range(options.from, options.to);

  if (options.targetType) query = query.eq('target_type', options.targetType);
  if (options.state) query = query.eq('state', options.state);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []).map(auditRow), total: count ?? 0 };
}

/**
 * How many rows are in each state, for the line above the table.
 *
 * Three head requests rather than one grouped query, for the reason reportCounts
 * gives: PostgREST has no group by, and the alternative is selecting the whole
 * view into a serverless function to add it up there.
 *
 * The counts are narrowed by everything except the state itself, so choosing a
 * state does not move the numbers beside it and the three still add up to what
 * the unfiltered list would show.
 *
 * @param {{ locale: string, targetType?: string|null }} options
 */
export async function auditCounts(options) {
  const results = await Promise.all(
    AUDIT_STATES.map((state) => {
      let query = supabase
        .from(T.needsTranslation)
        .select('target_id', { count: 'exact', head: true })
        .eq('locale', options.locale)
        .eq('state', state);

      if (options.targetType) query = query.eq('target_type', options.targetType);
      return query;
    })
  );

  const counts = {};
  AUDIT_STATES.forEach((state, index) => {
    const result = results[index];
    // Null rather than zero on a failure, per the rule api/admin/me.js states: a
    // zero is a claim, and a failed request does not entitle us to make one.
    // Here it would be the worst kind of claim, because zero on this page means
    // the translation is finished.
    counts[state] = result.error ? null : (result.count ?? 0);
  });

  return counts;
}

/**
 * One row of the audit.
 *
 * missing_fields is null for a row in the `missing` state, where the answer is
 * everything and listing nine field names would be noise. The page says so in
 * words rather than drawing an empty list, and this keeps the null rather than
 * flattening it to an empty array, which would be the same shape as "a drafted
 * translation with nothing thin about it" and is a different fact.
 */
function auditRow(row) {
  return {
    target_type: row.target_type,
    target_id: row.target_id,
    locale: row.locale,
    label: row.source_label,
    source_status: row.source_status,
    state: row.state,
    missing_fields: Array.isArray(row.missing_fields) ? row.missing_fields : null,
    updated_at: row.updated_at,
  };
}

/**
 * The language the audit is about, from the query string.
 *
 * The default language is never one of them: it is what everything else is
 * translated *from*, and the view excludes it for that reason. An unknown or
 * absent code falls back to the first other active language rather than
 * answering nothing, so the tab opens on something useful with no parameters at
 * all. Null means this site has one language configured, which is a real state
 * on the day a second one is being set up and is not an error.
 *
 * @param {string|null|undefined} wanted
 * @param {Array<{ code: string, is_default?: boolean }>} locales from activeLocales()
 * @returns {{ code: string } | null}
 */
export function auditLocale(wanted, locales) {
  const others = (locales ?? []).filter((locale) => !locale.is_default);
  if (others.length === 0) return null;

  const code = String(wanted ?? '').trim();
  return others.find((locale) => locale.code === code) ?? others[0];
}
