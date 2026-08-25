// The analytics read model, section 8.4.
//
// "Per job funnel from gftvjobs_analytics. Views, apply clicks, answered yes,
// answered no, and still pending or timed out, with a click to yes conversion
// rate."
//
// The counting is in migration 033's two views and not here, for the reason
// that file gives at length. What this module does is the part that is a
// judgement rather than a sum, and there are three of those:
//
//   **The rate is a floor and is labelled as one.** Pending and timed out rows
//   are clicks whose outcome nobody knows. 8.4 counts them as not applied,
//   which can only understate the real conversion, never overstate it. The page
//   says so in words; this module makes sure the number it says it about is the
//   same one.
//
//   **An average below three ratings is not shown at all.** 8.4: "suppress the
//   average entirely below three ratings so a single opinion does not read as a
//   verdict". Suppressed here rather than in the browser, so the number never
//   reaches a page that could show it by accident.
//
//   **A posting with many clicks and few yeses is flagged.** 8.4 asks for it
//   and says why: "that usually means a broken or closed Google Form rather
//   than a bad posting". The thresholds are named constants below, because a
//   flag is a claim about somebody's posting and the reader deserves to be able
//   to find out what produced it.
//
// The CSV writer imports csvField from admin-applications.js rather than
// writing a second one. A posting title is written by an admin and a spreadsheet
// still reads a leading = as a formula.

import { supabase, T } from './supabase.js';
import { csvField } from './admin-applications.js';

/**
 * The ratings floor from 8.4. Below this the average is null and the count is
 * still shown, so a posting with two ratings reads as "2 ratings" rather than
 * as having none.
 */
export const RATING_MINIMUM = 3;

/**
 * What counts as "a lot of clicks and not many yeses", per 8.4's flag.
 *
 * Five clicks is the smallest number where a rate means anything at all on a
 * board this size, and a fifth of them answering yes is roughly half of what a
 * working posting does. Both are deliberately generous: a false flag costs an
 * admin one look at a form that turns out to be fine, and a missed one costs
 * every applicant who tried to apply through a broken link.
 */
export const FLAG_MIN_CLICKS = 5;
export const FLAG_MAX_RATE = 0.2;

/** How many days of history the detail chart draws. */
export const SERIES_DAYS = 90;

/** The columns the table can be sorted by, per 8.4's "sortable table". */
export const FUNNEL_SORTS = Object.freeze([
  'views',
  'apply_clicks',
  'answered_yes',
  'yes_rate',
  'rating_average',
  'published_at',
  'title',
]);

/**
 * The funnel for every posting, sorted and paged.
 *
 * @param {{
 *   status?: string|null,
 *   sort?: string|null,
 *   direction?: 'asc'|'desc',
 *   rangeFrom?: number,
 *   rangeTo?: number,
 * }} options
 * **The sort actually used comes back with the rows**, because it is not always
 * the one that was asked for: an unknown column falls back to `views` rather
 * than refusing, the same way every enum on the admin routes falls back through
 * enumParam. The fallback is the convention and is kept; what was missing until
 * 25 August 2026 is that nothing said it had happened, so a header sending a
 * column name that had been renamed looked like a column that had stopped
 * mattering. The audit route already answers this way about its language, and
 * for the same reason: a page cannot mislabel what it was shown if the payload
 * says what it is.
 *
 * @returns {Promise<{ rows: object[], total: number, sort: string, direction: 'asc'|'desc' }>}
 */
export async function jobFunnels(options = {}) {
  const sort = FUNNEL_SORTS.includes(options.sort ?? '') ? options.sort : 'views';
  const ascending = options.direction === 'asc';

  let query = supabase.from(T.jobFunnel).select('*', { count: 'exact' });

  if (options.status) query = query.eq('status', options.status);

  query = query
    // Nulls last in both directions, which is not what Postgres does by
    // default. A posting nobody has clicked has a null rate, and sorting by
    // "worst conversion" should show the postings that are converting badly
    // rather than the ones with no data to convert.
    .order(sort, { ascending, nullsFirst: false })
    // A stable tiebreak, so two postings with the same count do not swap places
    // between one page and the next.
    .order('job_id', { ascending: true })
    .range(options.rangeFrom ?? 0, options.rangeTo ?? 49);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []).map(funnelRow),
    total: count ?? 0,
    sort,
    direction: ascending ? 'asc' : 'desc',
  };
}

/** One posting's funnel, for the detail view. */
export async function jobFunnel(jobId) {
  const { data, error } = await supabase
    .from(T.jobFunnel)
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data ? funnelRow(data) : null;
}

/**
 * Shape one row, and apply the two judgements.
 *
 * Everything here is derived rather than stored, deliberately. The view counts
 * what happened; whether that adds up to "this posting looks broken" is a
 * policy this file owns and can change without a migration.
 */
function funnelRow(row) {
  const clicks = Number(row.apply_clicks ?? 0);
  const yes = Number(row.answered_yes ?? 0);
  const ratingCount = Number(row.rating_count ?? 0);

  // Null, not zero, when nobody has clicked. The view already answers this way
  // and the coercion below would quietly turn it into 0.
  const rate = row.yes_rate === null || row.yes_rate === undefined ? null : Number(row.yes_rate);

  return {
    job_id: row.job_id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    published_at: row.published_at,
    closes_at: row.closes_at,

    views: Number(row.views ?? 0),
    apply_clicks: clicks,
    answered_yes: yes,
    answered_no: Number(row.answered_no ?? 0),
    pending: Number(row.pending ?? 0),
    timed_out: Number(row.timed_out ?? 0),

    // 8.4's breakdown. Three qualities of evidence for the same claim: a
    // webhook yes is Google confirming a submission, an applicant yes is
    // somebody saying so, and an admin yes is a staff member recording it.
    yes_by_source: {
      applicant: Number(row.yes_applicant ?? 0),
      webhook: Number(row.yes_webhook ?? 0),
      admin: Number(row.yes_admin ?? 0),
    },

    yes_rate: rate,
    // Named on the payload rather than left for the client to remember. Every
    // consumer of this number has to say the same thing about it.
    rate_is_floor: true,

    rating_count: ratingCount,
    rating_average:
      ratingCount >= RATING_MINIMUM && row.rating_average !== null
        ? Number(row.rating_average)
        : null,
    rating_suppressed: ratingCount > 0 && ratingCount < RATING_MINIMUM,

    needs_attention: clicks >= FLAG_MIN_CLICKS && rate !== null && rate < FLAG_MAX_RATE,
  };
}

/**
 * Daily counts for one posting, with the empty days filled in.
 *
 * The view only has rows for days something happened, which is right for a
 * table and wrong for a chart: a gap drawn as a shorter bar and a gap drawn as
 * no bar are different claims, and a line that skips a week is a line that lies
 * about its own slope. So the days are generated here and matched up.
 *
 * @param {string} jobId
 * @param {number} days how far back to go
 */
export async function funnelSeries(jobId, days = SERIES_DAYS) {
  const span = Math.min(365, Math.max(7, Math.trunc(days) || SERIES_DAYS));

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (span - 1));

  const { data, error } = await supabase
    .from(T.jobFunnelDaily)
    .select('day, views, apply_clicks, answered_yes')
    .eq('job_id', jobId)
    .gte('day', start.toISOString().slice(0, 10))
    .order('day', { ascending: true });

  if (error) throw error;

  const found = new Map((data ?? []).map((row) => [row.day, row]));
  const series = [];

  for (let index = 0; index < span; index += 1) {
    const at = new Date(start.getTime());
    at.setUTCDate(at.getUTCDate() + index);
    const day = at.toISOString().slice(0, 10);
    const row = found.get(day);

    series.push({
      day,
      views: Number(row?.views ?? 0),
      apply_clicks: Number(row?.apply_clicks ?? 0),
      answered_yes: Number(row?.answered_yes ?? 0),
    });
  }

  return series;
}

/**
 * The funnel as CSV, per 8.4.
 *
 * Column names in English rather than the reader's language, exactly as 8.3's
 * export decided: a spreadsheet is worked on afterwards, and two exports of the
 * same data that cannot be compared because the headers differ are worse than
 * one nobody can read at a glance.
 *
 * yes_rate is written as the fraction the database holds rather than as a
 * percentage string, because a spreadsheet can format a number and cannot
 * un-format "18%".
 *
 * @param {object[]} rows from jobFunnels
 */
export function funnelCsv(rows) {
  const header = [
    'job_id',
    'title',
    'status',
    'published_at',
    'views',
    'apply_clicks',
    'answered_yes',
    'answered_no',
    'pending',
    'timed_out',
    'yes_applicant',
    'yes_webhook',
    'yes_admin',
    'yes_rate_floor',
    'rating_count',
    'rating_average',
    'needs_attention',
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.job_id,
        row.title,
        row.status,
        row.published_at,
        row.views,
        row.apply_clicks,
        row.answered_yes,
        row.answered_no,
        row.pending,
        row.timed_out,
        row.yes_by_source.applicant,
        row.yes_by_source.webhook,
        row.yes_by_source.admin,
        row.yes_rate,
        row.rating_count,
        // Suppressed here too. An export that carries the average a page
        // refuses to show is the same disclosure by another route.
        row.rating_average,
        row.needs_attention ? 'yes' : 'no',
      ]
        .map(csvField)
        .join(',')
    );
  }

  // CRLF, per RFC 4180 and what Excel expects.
  return `${lines.join('\r\n')}\r\n`;
}

/* -------------------------------------------------------------------------
 * Writing a view, per 8.4
 * ---------------------------------------------------------------------- */

/**
 * Record that somebody opened a posting.
 *
 * The first thing in this build to write a `view` row. Everything that reads
 * gftvjobs_analytics has filtered on event_type since phase 5 precisely so that
 * this day breaks nothing, and migration 033's views do the same.
 *
 * What a view row is not: it is not a session, not a person, and not a promise
 * that a human saw anything. It is one line saying a posting page was rendered
 * for somebody who was not previewing it. No IP address and no user agent, per
 * 007, and the applicant id only when there is already a session.
 *
 * Failure is swallowed. A posting page that 500s because the counter could not
 * be written would be trading the thing readers came for against a number
 * nobody is waiting on.
 *
 * @param {{ jobId: string, applicantId?: string|null, referrer?: string|null }} event
 */
export async function recordView(event) {
  const { error } = await supabase.from(T.analytics).insert({
    job_id: event.jobId,
    applicant_id: event.applicantId ?? null,
    event_type: 'view',
    // **Not 'pending', which is what phases 5 and 6 predicted this would be.**
    // The comments in apply.js and api/applications/pending.js say phase 8 will
    // write view rows "at response_state pending", and their advice that every
    // query must filter on event_type stands either way. But 007's pending
    // partial index exists to make two things cheap, and both are about apply
    // prompts: the outstanding prompt lookup on every page load, and phase 9's
    // fourteen day sweep. Putting a row in that index for every posting anybody
    // opens would make it the largest index in the database and the one thing
    // it must never contain.
    //
    // A view has no answer to wait for, so 'answered' with did_apply false and
    // no answer_source is the honest reading: nobody was asked anything, and
    // nothing is outstanding. The funnel counts answered_no on apply clicks
    // alone, so this cannot leak into it.
    response_state: 'answered',
    did_apply: false,
    referrer: event.referrer ?? null,
  });

  if (error) console.warn('[careers-gftv] view not recorded:', error);
}
