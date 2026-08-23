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

  let rows = data ?? [];

  // Searching by applicant is done here rather than in the query, and that is a
  // real limitation stated rather than hidden: PostgREST cannot filter a parent
  // row by a pattern on an embedded one without a view, so this matches inside
  // the page that came back. A search that spans pages needs the view, which is
  // a migration, and 8.3's filters are by job, status, and date range. The box
  // narrows what is on screen and the page says so.
  if (options.q) {
    const needle = options.q.toLowerCase();
    rows = rows.filter((row) => {
      const applicant = row.applicant ?? {};
      return (
        String(applicant.username ?? '').toLowerCase().includes(needle) ||
        String(applicant.display_name ?? '').toLowerCase().includes(needle) ||
        String(applicant.email ?? '').toLowerCase().includes(needle)
      );
    });
  }

  return { rows, total: count ?? 0 };
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
