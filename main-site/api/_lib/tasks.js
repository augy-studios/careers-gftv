// Outstanding tasks, from 7g. The read model for /account/tasks and for the
// count on the account navigation.
//
// **Two sources, unioned at read time, and they are never merged in storage.**
// 7g is explicit and migration 008 repeats it: unanswered apply prompts are
// derived live from gftvjobs_analytics rows at response_state pending, and are
// never copied into gftvjobs_tasks. The analytics row stays the single source of
// truth for whether an answer is owed, and duplicating it guarantees the two
// drift apart. So this module reads both tables and interleaves them, and
// nothing in this build ever inserts a prompt into the tasks table.
//
// The other rule that decides shapes here: **a translation report is not a
// task.** 7h is explicit that a report is outbound from the applicant rather
// than something the portal needs from them, so it never appears in this list
// and never counts towards the badge. /account/settings lists a reader their
// own reports, which is a different page for a different reason.
//
// The reply model is one round, per 7g and migration 008: an admin asks, the
// applicant replies once, the admin reads it and closes the task. This is not a
// messaging thread and should not grow into one without a decision to build that
// properly.

import { supabase, T } from './supabase.js';
import { APPLY_CLICK } from './apply.js';

/** Statuses that count as outstanding, for the list order and for the badge. */
export const OPEN_STATUSES = Object.freeze(['open', 'awaiting_admin']);

/** The two types migration 008 ships with. The column stays open to more. */
export const TASK_TYPES = Object.freeze(['info_request', 'notice']);

/**
 * The type given to a derived apply prompt.
 *
 * Not a value gftvjobs_tasks.task_type ever holds, and that is the point: it
 * exists only in the union this module builds, so a reader of the database
 * cannot mistake it for a stored row.
 */
export const APPLY_PROMPT_TYPE = 'apply_prompt';

// Everything the page draws. response_text is included because an applicant who
// has replied should be able to reread what they said rather than wondering
// whether it went anywhere.
const TASK_COLUMNS = [
  'id',
  'job_id',
  'application_id',
  'task_type',
  'title',
  'body',
  'status',
  'response_text',
  'responded_at',
  'raised_by',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * This applicant's tasks, newest first.
 *
 * Scoped by applicant_id on every call, with no parameter that could widen it.
 * A task id from another account matches nothing rather than answering
 * differently, so there is no branch that confirms somebody else's row exists.
 *
 * @param {string} applicantId
 * @param {{ taskId?: string|null, limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function fetchTasks(applicantId, options = {}) {
  let query = supabase
    .from(T.tasks)
    .select(TASK_COLUMNS)
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 200);

  if (options.taskId) query = query.eq('id', options.taskId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * One task, as the page reads it.
 *
 * @param {object} row
 * @param {Map<string, object>} jobs from jobSummaries
 * @param {Map<string, string>} raisers staff id to a label
 */
export function publicTask(row, jobs, raisers) {
  return {
    source: 'task',
    id: row.id,
    task_type: row.task_type,
    title: row.title,
    body: row.body ?? null,
    status: row.status,
    is_open: OPEN_STATUSES.includes(row.status),
    // Whether this task is waiting on the applicant, which is a different
    // question from whether it is open. A row at awaiting_admin is open and is
    // waiting on us, and telling somebody they still owe a reply they have
    // already written is the fastest way to make a task list ignorable.
    needs_reply: row.status === 'open' && row.task_type === 'info_request',
    response_text: row.response_text ?? null,
    responded_at: row.responded_at ?? null,
    raised_by: raisers.get(row.raised_by) ?? null,
    resolved_at: row.resolved_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    job: row.job_id ? (jobs.get(row.job_id) ?? null) : null,
  };
}

/**
 * An unanswered apply prompt, shaped as a task.
 *
 * It carries no title of its own, because it has none to carry: the analytics
 * row knows a posting and a time and nothing else. The wording is a dictionary
 * string on the client, built from the posting's title, which is why this is the
 * one item in the list whose title field is null rather than a sentence the
 * server wrote in English.
 *
 * @param {object} row an analytics row from fetchPending
 * @param {Map<string, object>} jobs
 */
export function promptTask(row, jobs) {
  return {
    source: 'prompt',
    id: row.id,
    task_type: APPLY_PROMPT_TYPE,
    title: null,
    body: null,
    status: 'open',
    is_open: true,
    needs_reply: true,
    response_text: null,
    responded_at: null,
    raised_by: null,
    resolved_at: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    job: jobs.get(row.job_id) ?? null,
  };
}

/**
 * How the list is ordered, per 7g: "Open items sort first, newest first, with
 * resolved ones collapsed under a recently completed section rather than
 * vanishing."
 *
 * Sorting the union here rather than in either query is the only way to get one
 * ordering across two tables, and it is cheap: this is one applicant's items,
 * not a page of a feed.
 */
export function sortTasks(items) {
  return items.sort((a, b) => {
    if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
    return Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0);
  });
}

/**
 * Labels for the staff who raised a set of tasks.
 *
 * The username and nothing else. gftvhello_users is read only from this portal
 * and an applicant has no relationship with an individual staff account, so
 * there is no reason to read anything else off that row and every reason not to.
 * A failure here leaves the label null, and the page says the team asked, which
 * is true and is what somebody with no label would assume anyway.
 *
 * @param {string[]} ids
 * @returns {Promise<Map<string, string>>}
 */
export async function staffLabels(ids) {
  const map = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from(T.staffUsers)
    .select('id, username')
    .in('id', unique);

  if (error) {
    console.warn('[careers-gftv] task raisers:', error);
    return map;
  }

  for (const row of data ?? []) map.set(row.id, row.username);
  return map;
}

/**
 * The number of outstanding items across both sources, for the badge in the
 * account navigation.
 *
 * Two count queries rather than the full lists, because the badge is drawn on
 * every page of the account area and does not need a single row of content.
 *
 * A failure counts as zero rather than throwing. A badge is an invitation to
 * look at a page, and an unreadable count must not take the page down with it.
 *
 * @param {string} applicantId
 * @returns {Promise<{ tasks: number, prompts: number, total: number }>}
 */
export async function openItemCount(applicantId) {
  const [tasks, prompts] = await Promise.all([
    supabase
      .from(T.tasks)
      .select('id', { count: 'exact', head: true })
      .eq('applicant_id', applicantId)
      .in('status', OPEN_STATUSES),

    supabase
      .from(T.analytics)
      .select('id', { count: 'exact', head: true })
      .eq('applicant_id', applicantId)
      // Filtered on event_type, from the first version, for the reason written
      // out in api/_lib/apply.js: phase 8 starts writing 'view' rows into this
      // table at response_state pending, and a badge that counted those would
      // tell every reader they had thirty outstanding tasks.
      .eq('event_type', APPLY_CLICK)
      .eq('response_state', 'pending'),
  ]);

  if (tasks.error) console.warn('[careers-gftv] open task count:', tasks.error);
  if (prompts.error) console.warn('[careers-gftv] open prompt count:', prompts.error);

  const taskCount = tasks.error ? 0 : (tasks.count ?? 0);
  const promptCount = prompts.error ? 0 : (prompts.count ?? 0);

  return { tasks: taskCount, prompts: promptCount, total: taskCount + promptCount };
}
