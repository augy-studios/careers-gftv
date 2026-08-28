// Raising and resolving tasks, from the admin's side. Sections 8.3 and 7g.
//
// api/_lib/tasks.js is the applicant's half and stays exactly as phase 6 left
// it: it reads, it unions in the derived apply prompts, and it never writes.
// This is the writing half, and it is separate for the same reason the two job
// modules are: the read model an applicant is served and the one an admin works
// in have different scopes, and sharing a file is how the wider one leaks into
// the narrower.
//
// The one rule that decides everything here:
//
//   **A task's question set is frozen the moment it is written.** 7g says so,
//   and every path in this file writes questions exactly once, at raise time. A
//   posting's template is copied onto the task rather than referenced, so
//   editing the template changes only what the next applicant is asked and can
//   never orphan an answer already given. There is no update path for the
//   column, deliberately: the way to ask a different question is a new task.
//
// And the rule phase 11 part 5 added, which is the same shape:
//
//   **Raising a task is what queues a Telegram notification.** Section 15's
//   three kinds each match something written here, so the mapping lives in one
//   place and every raise site gets delivery without asking for it. A queue
//   failure never fails a raise, because the task is the record and Telegram is
//   a second channel for it.
//
// And the one that is easy to lose in a review:
//
//   **Nothing here ever inserts an apply prompt into gftvjobs_tasks.** The
//   prompts are derived from gftvjobs_analytics at read time, per 7g and
//   migration 008, and the analytics row stays the single source of truth for
//   whether an answer is owed. A posting's question set raises its *own* task
//   alongside the prompt; it does not extend it.

import { supabase, T } from './supabase.js';
import { hasQuestions } from './questions.js';
import { OPEN_STATUSES, TASK_TYPES } from './tasks.js';
import { KIND, queueNotifications } from './telegram.js';

/** What the admin views read back after a write. */
const TASK_COLUMNS = [
  'id',
  'applicant_id',
  'job_id',
  'application_id',
  'task_type',
  'title',
  'body',
  'status',
  'questions',
  'answers',
  'response_text',
  'responded_at',
  'raised_by',
  'resolved_by',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Which notification kind a task of each type is delivered as.
 *
 * **One mapping, here, rather than a queue call at each raise site.** Section
 * 15's three kinds each correspond to something this file already writes, and
 * putting the decision anywhere else would mean a raise site added in a later
 * phase quietly delivering nothing: the task would appear on the dashboard and
 * the chat would stay silent, which is the failure nobody reports because
 * nothing looks broken. Raising a task and telling the applicant about it are
 * one act, so they are one function.
 *
 * A type with no entry here is `task_raised`, which is what `info_request` is
 * and what anything added later will be until somebody decides otherwise. That
 * is the safe default: a message saying something is waiting is true of every
 * task by definition.
 *
 * **A notice is `application_status_changed` and nothing else is.** Only
 * `raiseDecisionNotice` writes one, so an accept or a reject with the message
 * its poster wrote is the entire set, settled 29 August 2026. A status moved
 * without a message stays silent in Telegram exactly as it stays silent on the
 * dashboard, because Telegram is a second channel for what the portal recorded
 * and never a channel of its own.
 */
const NOTIFY_KIND = Object.freeze({
  invite: KIND.invite,
  notice: KIND.applicationStatusChanged,
  info_request: KIND.taskRaised,
});

/**
 * What the bot renders a message from, taken from the task that was written.
 *
 * **The payload is a copy and not a reference**, the same instinct that freezes
 * a question set at raise time. The bot renders from what was true when this was
 * queued, so a posting renamed an hour later does not rewrite the message an
 * applicant is about to receive, and the drain needs no read of its own beyond
 * the link it has to check anyway.
 *
 * **The role title inside it is the posting's own**, in the language it is
 * stored in, exactly as the task title on `/account/tasks` is. The bot writes
 * the sentence around it in the applicant's language and leaves the title alone,
 * which is the rule every other surface in this build already follows.
 */
function notificationFor(task, input) {
  const extra = input.notify ?? {};
  return {
    applicantId: task.applicant_id,
    kind: NOTIFY_KIND[task.task_type] ?? KIND.taskRaised,
    payload: {
      task_id: task.id,
      task_type: task.task_type,
      title: task.title,
      body: task.body ?? null,
      job_id: task.job_id ?? null,
      job_title: extra.jobTitle ?? null,
      department: extra.department ?? null,
      raised_at: task.created_at ?? new Date().toISOString(),
    },
  };
}

/**
 * Raise one task on one applicant.
 *
 * @param {{
 *   applicantId: string,
 *   jobId?: string|null,
 *   applicationId?: string|null,
 *   type: string,
 *   title: string,
 *   body?: string|null,
 *   questions?: object[],
 *   raisedBy?: string|null,
 *   notify?: { jobTitle?: string|null, department?: string|null }
 * }} input
 * @returns {Promise<object>} the task row
 */
export async function raiseTask(input) {
  const type = TASK_TYPES.includes(input.type) ? input.type : 'info_request';

  const row = {
    applicant_id: input.applicantId,
    job_id: input.jobId ?? null,
    application_id: input.applicationId ?? null,
    task_type: type,
    title: input.title,
    body: input.body ?? null,
    // Written once, here, and never updated. See the note at the top.
    questions: Array.isArray(input.questions) ? input.questions : [],
    status: 'open',
    raised_by: input.raisedBy ?? null,
  };

  const { data, error } = await supabase.from(T.tasks).insert(row).select(TASK_COLUMNS).single();
  if (error) throw error;

  // The task is written first and the notification second, which is the same
  // ordering phase 9's webhook uses and for the same reason: a failure leaves a
  // record somebody can act on rather than a message about something that does
  // not exist. queueNotifications never throws, so this cannot fail a raise.
  await queueNotifications([notificationFor(data, input)]);

  return data;
}

/**
 * Raise several tasks in one write, for the multi-recipient send in 8.3.
 *
 * Each task gets its own independently frozen copy of the set, per the first
 * decision of 21 August 2026. One insert rather than a loop, so a send to
 * fifteen ticked applicants is one round trip and either all of them are
 * written or none is.
 *
 * @param {Array<Parameters<typeof raiseTask>[0]>} inputs
 * @returns {Promise<object[]>}
 */
export async function raiseTasks(inputs) {
  if (inputs.length === 0) return [];

  const rows = inputs.map((input) => ({
    applicant_id: input.applicantId,
    job_id: input.jobId ?? null,
    application_id: input.applicationId ?? null,
    task_type: TASK_TYPES.includes(input.type) ? input.type : 'info_request',
    title: input.title,
    body: input.body ?? null,
    questions: Array.isArray(input.questions) ? input.questions : [],
    status: 'open',
    raised_by: input.raisedBy ?? null,
  }));

  const { data, error } = await supabase.from(T.tasks).insert(rows).select(TASK_COLUMNS);
  if (error) throw error;

  const written = data ?? [];

  // One insert for the whole send, matching the one above it. Each task is
  // paired with its input by applicant rather than by position: everything the
  // input still contributes is the posting it is about, and matching on the
  // order rows happen to come back in would be trusting PostgREST for something
  // it has never promised.
  const extras = new Map(inputs.map((input) => [input.applicantId, input]));
  await queueNotifications(
    written.map((task) => notificationFor(task, extras.get(task.applicant_id) ?? {}))
  );

  return written;
}

/**
 * The auto-raise from a posting's question set, per 7g.
 *
 * Called from api/applications/start.js, which is where 7a already writes the
 * tracking row. Three things about it worth stating, because each one is a
 * decision somebody could reasonably reverse without noticing what it cost:
 *
 *   **It never fails the handoff.** Somebody standing in front of an
 *   application form must not be stopped by a question we wanted to ask. A
 *   failure is logged and the apply goes ahead.
 *
 *   **One task per application, not one per click.** 7f lets somebody reapply
 *   after a cooldown, and 7a lets a start click repeat, so the guard is on the
 *   application id: an applicant who clicks Apply twice in a minute is asked
 *   once. Reapplying months later is a new application row and is asked again,
 *   which is right, because the posting's questions may have changed.
 *
 *   **raised_by is null.** Nobody raised it. Deviation 28 has the applicant
 *   side reading a username off that column and saying "the team asked" when
 *   there is none, which is exactly true here.
 *
 * @param {{ id: string, title: string, task_questions?: unknown }} job
 * @param {string} applicantId
 * @param {string} applicationId
 * @returns {Promise<object|null>} the task, or null when there was nothing to raise
 */
export async function raisePostingQuestions(job, applicantId, applicationId) {
  if (!hasQuestions(job?.task_questions)) return null;

  try {
    const { data: existing, error: readError } = await supabase
      .from(T.tasks)
      .select('id')
      .eq('application_id', applicationId)
      .eq('task_type', 'info_request')
      .limit(1);

    if (readError) throw readError;
    if ((existing ?? []).length > 0) return null;

    return await raiseTask({
      applicantId,
      jobId: job.id,
      applicationId,
      type: 'info_request',
      // The title is the posting's own, in the language it is stored in. The
      // page draws its own sentence around it, so this is a label rather than a
      // sentence the server wrote in English, which is the same rule every
      // other endpoint follows.
      title: job.title,
      body: null,
      questions: job.task_questions,
      raisedBy: null,
    });
  } catch (cause) {
    console.error('[careers-gftv] auto-raised task:', cause);
    return null;
  }
}

/**
 * Resolve a task, per 8.3: the admin reads the reply and closes it.
 *
 * The applicant side never resolves one, and never has: api/tasks/respond.js
 * moves a row to awaiting_admin and stops there. This is the other end of that.
 *
 * @param {string} taskId
 * @param {string} staffId
 * @returns {Promise<object|null>} null when there is no such open task
 */
export async function resolveTask(taskId, staffId) {
  const { data, error } = await supabase
    .from(T.tasks)
    .update({
      status: 'resolved',
      resolved_by: staffId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    // Filtered on the open statuses rather than read then written, so resolving
    // a task twice is one row updated and one row not, rather than a second
    // resolved_at overwriting the first.
    .in('status', OPEN_STATUSES)
    .select(TASK_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * The open tasks for a set of applicants, for the tracking list.
 *
 * 8.3: "Show any open task inline on the tracking row so an admin can see at a
 * glance who has been asked for something and has not come back."
 *
 * @param {string[]} applicantIds
 * @returns {Promise<Map<string, object[]>>}
 */
export async function openTasksFor(applicantIds) {
  const map = new Map();
  const unique = [...new Set(applicantIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from(T.tasks)
    .select('id, applicant_id, job_id, task_type, title, status, questions, responded_at, created_at')
    .in('applicant_id', unique)
    .in('status', OPEN_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    // A tracking list that cannot say who has an open task is still a usable
    // tracking list.
    console.warn('[careers-gftv] open tasks for tracking:', error);
    return map;
  }

  for (const row of data ?? []) {
    const list = map.get(row.applicant_id) ?? [];
    list.push({
      id: row.id,
      job_id: row.job_id,
      task_type: row.task_type,
      title: row.title,
      status: row.status,
      // Whether it is waiting on us or on them, which is the thing the inline
      // marker is actually for.
      awaiting_admin: row.status === 'awaiting_admin',
      has_questions: hasQuestions(row.questions),
      created_at: row.created_at,
    });
    map.set(row.applicant_id, list);
  }

  return map;
}

/**
 * Every task on one applicant, for the detail view.
 * @param {string} applicantId
 * @param {{ jobId?: string|null }} [options]
 */
export async function tasksForApplicant(applicantId, options = {}) {
  let query = supabase
    .from(T.tasks)
    .select(TASK_COLUMNS)
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (options.jobId) query = query.eq('job_id', options.jobId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** One task, whoever it belongs to. Admin scope, so no applicant filter. */
export async function fetchTask(taskId) {
  const { data, error } = await supabase
    .from(T.tasks)
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
