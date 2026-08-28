// Applicant tracking, section 8.3. The pipeline an admin works a row through.
//
// What this page tracks, and the copy on it has to say so: **who was handed
// over to which form, not the answers themselves.** The answers stay in Google
// Forms, per section 10 item 1, and each posting links out to its response
// sheet for anybody who needs to read them. Nothing in this module reads or
// stores an application's content, because there is none to read.
//
// Three rules from the 21 August 2026 change set are enforced here, and each
// one is the sort of thing that gets undone by a well meaning edit:
//
//   **A status change never touches the cooldown**, per 7f. Moving somebody to
//   accepted or rejected leaves applied_at and cooldown_until exactly as they
//   are and they serve out what they were serving. Only three things write
//   those columns anywhere in this build: a confirmed application, a
//   withdrawal, and an explicit waive. **A rejection is not a waive.**
//
//   **Accepting and rejecting both raise a notice task**, per 7g, so the
//   applicant finds out. There is no template for the message: "we have gone
//   with somebody else" written by a person reads better than anything a
//   dropdown produces, and a rejection is the one message on this site most
//   worth writing properly.
//
//   **Neither touches the posting.** Its status and its openings count are the
//   admin's to change from 8.2. Accepting somebody does not close a role.

import { supabase, T } from './supabase.js';
import { writeApplicationEvent } from './apply.js';
import { raiseTask } from './admin-tasks.js';
// For the deletion impact panel only. Asked rather than compared to the clock,
// because with reapply_cooldown_days at zero the stored dates are ignored rather
// than cleared, per the decision table.
import { isInCooldown } from './settings.js';

/**
 * The nine statuses migration 006 allows, in pipeline order.
 *
 * 8.1 lists eight of these as bucket tabs and omits `accepted`, because it was
 * written before accepting existed as a distinct step: the accept and reject
 * rules arrived on 21 August 2026. The tab is added rather than the status
 * hidden, since a bucket somebody can be moved into and not filtered by is a
 * row that disappears from every view.
 */
export const APPLICATION_STATUSES = Object.freeze([
  'started',
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
]);

/** The two that raise a notice task and close the row one way or the other. */
export const DECISION_STATUSES = Object.freeze(['accepted', 'rejected']);

/** How the list may be sorted. */
export const APPLICATION_SORTS = Object.freeze(['updated', 'started', 'applied']);

const ROW_COLUMNS = `
  id, job_id, applicant_id, status, admin_note, started_at, applied_at,
  cooldown_until, updated_at,
  applicant:${T.users} ( id, username, display_name, email, phone, locale, avatar_url, is_active ),
  job:${T.jobs} ( id, title, slug, status, department_id, response_sheet_url )
`;

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

/**
 * The tracking list, filtered and paged.
 *
 * The filters are 8.3's: by job, by status, and by date range. The date range
 * is on started_at rather than updated_at, because "who applied in March" is
 * the question somebody is asking, and updated_at moves every time a status
 * does.
 *
 * @param {{ jobId?: string|null, status?: string|null, from?: string|null,
 *           until?: string|null, q?: string|null, sort?: string|null,
 *           rangeFrom: number, rangeTo: number }} options
 */
export async function listApplications(options) {
  let query = supabase
    .from(T.applications)
    .select(ROW_COLUMNS, { count: 'exact' })
    .range(options.rangeFrom, options.rangeTo);

  if (options.jobId) query = query.eq('job_id', options.jobId);
  if (options.status) query = query.eq('status', options.status);
  if (options.from) query = query.gte('started_at', options.from);
  if (options.until) query = query.lte('started_at', options.until);

  // 8.3's applicant box, and from 23 August 2026 it is a real filter rather
  // than one applied to the page that had already come back. That was deviation
  // 36, and migration 032 built gftvjobs_application_search to close it.
  let truncated = false;
  if (options.q) {
    const match = await matchingApplicationIds(options);
    if (match.ids.length === 0) return { rows: [], total: 0, truncated: false };

    truncated = match.truncated;
    query = query.in('id', match.ids);
  }

  switch (options.sort) {
    case 'started':
      query = query.order('started_at', { ascending: false });
      break;
    case 'applied':
      query = query.order('applied_at', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('updated_at', { ascending: false });
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, truncated };
}

/**
 * The most application ids one search will filter by.
 *
 * The ids go back out as an `in` filter, which travels in the query string, so
 * this is a bound on a URL as much as on a result set: two hundred uuids is
 * about seven kilobytes and a search matching more than that is not a search,
 * it is a browse. The caller is told when the cap was reached rather than
 * quietly shown the first two hundred, because a truncated match set with an
 * exact looking count is the sort of thing somebody makes a decision on.
 */
const MATCH_CAP = 200;

/**
 * Which applications match the applicant box, per 8.3.
 *
 * PostgREST cannot filter a parent row by a pattern on an embedded one, which
 * is why this is two queries and why migration 032 exists. The view flattens
 * the display name, the username, and the email onto the application row and
 * lowercases them once, so the match is an ilike against one column rather than
 * three ors against an embedded table.
 *
 * **The other filters are applied to the match query too**, which is why the
 * view carries job_id, status, and started_at. Matching every Tan in the
 * database and then intersecting with one posting would spend the cap on rows
 * that were never going to be shown.
 *
 * **The email is matched and never selected.** It is in search_text so that
 * looking somebody up by the address they wrote to you from works, and the
 * tracking list a job poster reads still shows only the name and the username.
 */
async function matchingApplicationIds(options) {
  let query = supabase
    .from(T.applicationSearch)
    .select('application_id')
    .ilike('search_text', `%${likeNeedle(options.q)}%`)
    // Ordered so that a capped set is the same 200 on page two as it was on page
    // one. A limit with no order is whatever Postgres hands back, which can
    // differ between two identical requests and would quietly reshuffle a
    // truncated search under somebody paging through it. Newest first, so the
    // 200 kept are the ones somebody is most likely to be looking for.
    .order('updated_at', { ascending: false })
    .order('application_id', { ascending: true })
    .limit(MATCH_CAP);

  if (options.jobId) query = query.eq('job_id', options.jobId);
  if (options.status) query = query.eq('status', options.status);
  if (options.from) query = query.gte('started_at', options.from);
  if (options.until) query = query.lte('started_at', options.until);

  const { data, error } = await query;
  if (error) throw error;

  const ids = (data ?? []).map((row) => row.application_id);
  return { ids, truncated: ids.length >= MATCH_CAP };
}

/**
 * What somebody typed, as a literal to match rather than as a pattern.
 *
 * An underscore is a real character in a username and a percent sign is a real
 * character in a display name, and both are wildcards in a LIKE. Escaped rather
 * than stripped, so searching for `a_b` finds `a_b` and not `axb`.
 *
 * The star is the exception and is dropped: PostgREST spells `%` as `*` in a
 * like filter and substitutes it before Postgres ever sees the pattern, so
 * there is no escape that survives. Nothing that can be in a username, an
 * email, or a real name is lost by it.
 */
function likeNeedle(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (char) => `\\${char}`)
    .replace(/\*/g, '');
}

/**
 * Counts per bucket, for the tabs in 8.1.
 *
 * One head query per status plus one for the total. Ten count queries sounds
 * like a lot and is not: each is an index only count on a table with one row
 * per applicant per posting, they run in parallel, and the alternative is a
 * group by through an RPC, which is a migration.
 *
 * @param {{ jobId?: string|null, from?: string|null, until?: string|null }} filters
 */
export async function bucketCounts(filters = {}) {
  const countFor = async (status) => {
    let query = supabase.from(T.applications).select('id', { count: 'exact', head: true });
    if (status) query = query.eq('status', status);
    if (filters.jobId) query = query.eq('job_id', filters.jobId);
    if (filters.from) query = query.gte('started_at', filters.from);
    if (filters.until) query = query.lte('started_at', filters.until);

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  const [all, ...perStatus] = await Promise.all([
    countFor(null),
    ...APPLICATION_STATUSES.map((status) => countFor(status)),
  ]);

  const counts = { all };
  APPLICATION_STATUSES.forEach((status, index) => {
    counts[status] = perStatus[index];
  });

  return counts;
}

/**
 * One tracking row as the list draws it.
 *
 * The applicant's contact details are here because 8.3's detail view shows the
 * applicant profile, and an admin working a pipeline needs to know who they are
 * looking at. Nothing about the application's content appears, because there is
 * none: it is in Google Forms.
 *
 * @param {object} row
 * @param {{ openTasks?: object[], inCooldown?: boolean }} extra
 */
export function adminApplicationRow(row, extra = {}) {
  const applicant = row.applicant ?? {};
  const job = row.job ?? {};

  return {
    id: row.id,
    status: row.status,
    admin_note: row.admin_note ?? null,
    started_at: row.started_at,
    applied_at: row.applied_at,
    cooldown_until: row.cooldown_until,
    in_cooldown: extra.inCooldown === true,
    updated_at: row.updated_at,
    applicant: {
      id: applicant.id ?? row.applicant_id,
      username: applicant.username ?? null,
      display_name: applicant.display_name ?? null,
      email: applicant.email ?? null,
      phone: applicant.phone ?? null,
      locale: applicant.locale ?? 'en',
      avatar_url: applicant.avatar_url ?? null,
      is_active: applicant.is_active !== false,
    },
    job: {
      id: job.id ?? row.job_id,
      title: job.title ?? null,
      slug: job.slug ?? null,
      status: job.status ?? null,
      // Admin facing only, per migration 005, and 8.3 asks for it: "Each job row
      // links out to its response sheet so admins can read the actual answers in
      // Google Sheets."
      response_sheet_url: job.response_sheet_url ?? null,
    },
    open_tasks: extra.openTasks ?? [],
  };
}

/* -------------------------------------------------------------------------
 * Changing a status
 * ---------------------------------------------------------------------- */

/**
 * Move one row to a new status, with an optional note.
 *
 * Writes the status and the note, appends an event row naming the staff member,
 * and touches nothing else. In particular it does not write applied_at or
 * cooldown_until, per 7f, and does not touch the posting.
 *
 * @param {object} application the current row, with id and status
 * @param {string} next
 * @param {string|null} note
 * @param {{ id: string, username: string }} staffUser
 * @returns {Promise<object>} the row as it now stands
 */
export async function changeStatus(application, next, note, staffUser) {
  const { data, error } = await supabase
    .from(T.applications)
    .update({
      status: next,
      // The note is the admin's running comment on the row, per migration 006.
      // Only overwritten when one was given, so a status change with nothing to
      // say does not wipe what the last admin wrote.
      ...(note ? { admin_note: note } : {}),
    })
    .eq('id', application.id)
    .select('id, job_id, applicant_id, status, admin_note, started_at, applied_at, cooldown_until, updated_at')
    .single();

  if (error) throw error;

  await writeApplicationEvent(application.id, application.status, next, 'admin', note, {
    changedBy: staffUser.id,
  });

  return data;
}

/**
 * Waive an active reapply cooldown on one row, per 7f and 8.3.
 *
 * Clears cooldown_until and writes an event row naming who did it. applied_at
 * is deliberately left alone: the application still happened, and clearing it
 * would make the funnel forget one.
 *
 * The event's to_status is the row's own status, unchanged, which is the one
 * place in this build an event row records something other than a move. That is
 * the honest record: 7f asks for an event naming who waived it, and inventing a
 * status to move to would be worse.
 *
 * @param {object} application
 * @param {{ id: string, username: string }} staffUser
 * @param {string|null} note
 */
export async function waiveCooldown(application, staffUser, note = null) {
  const { data, error } = await supabase
    .from(T.applications)
    .update({ cooldown_until: null })
    .eq('id', application.id)
    .select('id, status, applied_at, cooldown_until, updated_at')
    .single();

  if (error) throw error;

  await writeApplicationEvent(
    application.id,
    application.status,
    application.status,
    'admin',
    note ?? 'Reapply cooldown waived.',
    { changedBy: staffUser.id }
  );

  return data;
}

/**
 * The notice task that goes with an accept or a reject, per 8.3.
 *
 * The message is written by the poster and there is no template, so this takes
 * a title and a body and adds nothing of its own. The task is the record either
 * way; phase 11 also pushes it to Telegram for an applicant who linked an
 * account, per section 15.
 *
 * @param {object} application
 * @param {{ title: string, body: string|null }} message
 * @param {{ id: string }} staffUser
 */
export async function raiseDecisionNotice(application, message, staffUser) {
  return raiseTask({
    applicantId: application.applicant_id,
    jobId: application.job_id,
    applicationId: application.id,
    type: 'notice',
    title: message.title,
    body: message.body ?? null,
    // A notice carries no questions. 7g offers dismiss on a notice and nothing
    // else, per deviation 29, and a notice that asked something would be a task
    // an applicant could sweep off the list while somebody waited for it.
    questions: [],
    raisedBy: staffUser.id,
    // The role this decision is about, for the Telegram message. **The status
    // itself is deliberately not carried**: what an applicant reads is the
    // message its poster wrote, here as on the dashboard, and a status enum
    // rendered into a chat would be this build writing the decision copy the
    // route refuses to let it write.
    notify: { jobTitle: application.job?.title ?? null },
  });
}

/* -------------------------------------------------------------------------
 * History
 * ---------------------------------------------------------------------- */

/**
 * The status history for one row, newest first, per 8.3's timeline.
 * @param {string} applicationId
 */
export async function statusHistory(applicationId) {
  const { data, error } = await supabase
    .from(T.applicationEvents)
    .select('id, from_status, to_status, note, source, changed_by, created_at')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

/** One application with its applicant and posting, for the detail view. */
export async function fetchApplicationRow(applicationId) {
  const { data, error } = await supabase
    .from(T.applications)
    .select(ROW_COLUMNS)
    .eq('id', applicationId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* -------------------------------------------------------------------------
 * Permanent deletion, added 23 August 2026
 * ---------------------------------------------------------------------- */

/**
 * What deleting these rows would destroy, counted from the database.
 *
 * The same shape 8.2 uses before deleting a posting, and for the same reason:
 * "names exactly what goes with the posting, counted from the database rather
 * than described in the abstract". An admin about to do something irreversible
 * is owed a number, not an adjective.
 *
 * Four counts, and each one is a different answer:
 *
 *   **events** go with the row. migration 006 puts `on delete cascade` on
 *   gftvjobs_application_events.application_id, so the whole timeline of how
 *   this application got where it is disappears with it.
 *
 *   **cooldowns** is the one that is easy to miss and is the reason this
 *   function exists. applied_at and cooldown_until live on the row being
 *   deleted, so deleting it lets the applicant reapply at once. Section 3's
 *   rule is that exactly three things write those columns and a rejection is
 *   not a waive; deletion becomes a fourth, and the panel says so out loud
 *   rather than letting it be discovered later.
 *
 *   **tasks** survive. migration 008 puts `on delete set null` on
 *   gftvjobs_tasks.application_id, so an applicant keeps the questions and
 *   notices they were sent and those stop pointing at anything. Counted anyway,
 *   because an admin should know they are leaving them behind.
 *
 *   **analytics rows are not counted and are not touched.** gftvjobs_analytics
 *   has no foreign key to this table at all, per 007: it is the append only log
 *   and applications is not. So the 8.4 funnel survives a deletion intact,
 *   which is the one genuinely reassuring thing about this action.
 *
 * @param {string[]} ids
 */
export async function deletionImpact(ids) {
  if (ids.length === 0) return { rows: 0, events: 0, tasks: 0, cooldowns: 0 };

  const [events, tasks, rows] = await Promise.all([
    supabase
      .from(T.applicationEvents)
      .select('id', { count: 'exact', head: true })
      .in('application_id', ids),
    supabase.from(T.tasks).select('id', { count: 'exact', head: true }).in('application_id', ids),
    supabase.from(T.applications).select('id, cooldown_until').in('id', ids),
  ]);

  if (rows.error) throw rows.error;

  // Asked of isInCooldown rather than compared to the clock, per the rule at the
  // top of apply.js: with reapply_cooldown_days at zero the stored dates are
  // ignored rather than cleared, so a raw date comparison would warn about a
  // cooldown nobody is actually serving.
  let cooldowns = 0;
  for (const row of rows.data ?? []) {
    if (await isInCooldown(row)) cooldowns += 1;
  }

  return {
    rows: (rows.data ?? []).length,
    // Null rather than zero when the count could not be read, and the route
    // refuses the deletion on a null. An impact panel that cannot count is not
    // a panel showing zero.
    events: events.error ? null : (events.count ?? 0),
    tasks: tasks.error ? null : (tasks.count ?? 0),
    cooldowns,
  };
}

/**
 * Delete tracking rows permanently.
 *
 * One statement over an id list, unlike changeStatus in the bulk path above,
 * and the difference is the point: that one loops because each row needs its
 * own event row naming where it came from. There is nothing to record on a row
 * that is about to stop existing, and the audit row the route writes before
 * this covers the whole set.
 *
 * Nothing is written to the applicant. 8.3's decision messages exist because
 * accepting and rejecting are things a person needs to hear; a tracking row
 * being tidied out of a dashboard is not, and raising a task to announce it
 * would be worse than saying nothing.
 *
 * @param {string[]} ids
 * @returns {Promise<string[]>} the ids that were actually deleted
 */
export async function deleteApplications(ids) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase.from(T.applications).delete().in('id', ids).select('id');

  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

/* -------------------------------------------------------------------------
 * CSV, per 8.3
 * ---------------------------------------------------------------------- */

/**
 * One CSV field.
 *
 * Quoted whenever it contains anything a reader of the file would parse, and a
 * leading =, +, -, or @ is prefixed with a quote, because a spreadsheet reads
 * those as the start of a formula. Every value in this export comes from an
 * applicant's own profile, so that is not a theoretical concern: a display name
 * of =HYPERLINK(...) would otherwise execute when an admin opened the file.
 */
export function csvField(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * The filtered set as CSV, per 8.3.
 *
 * Column names rather than a header the interface translates: a CSV is opened
 * in a spreadsheet by somebody who then works with the column, and a header
 * that changes with the reader's language would make two exports of the same
 * data incomparable.
 *
 * @param {object[]} rows from adminApplicationRow
 */
export function applicationsCsv(rows) {
  const header = [
    'application_id',
    'job_title',
    'job_id',
    'applicant_username',
    'applicant_display_name',
    'applicant_email',
    'status',
    'started_at',
    'applied_at',
    'cooldown_until',
    'updated_at',
    'admin_note',
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.job.title,
        row.job.id,
        row.applicant.username,
        row.applicant.display_name,
        row.applicant.email,
        row.status,
        row.started_at,
        row.applied_at,
        row.cooldown_until,
        row.updated_at,
        row.admin_note,
      ]
        .map(csvField)
        .join(',')
    );
  }

  // CRLF, which is what RFC 4180 says and what Excel expects.
  return `${lines.join('\r\n')}\r\n`;
}
