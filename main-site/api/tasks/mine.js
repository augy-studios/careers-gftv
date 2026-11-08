// GET /api/tasks/mine[?task_id={uuid}]
//
// Section 7g's outstanding tasks: "A single inbox for anything the portal needs
// the applicant to deal with. It exists so a request from an admin has somewhere
// to land, now that notifications are in-portal only."
//
// **Two sources, unioned here at read time.** Admin raised rows come from
// gftvjobs_tasks; unanswered apply prompts are derived live from
// gftvjobs_analytics and are never copied into that table. The reasoning is in
// api/_lib/tasks.js and in migration 008, and it is the one thing about this
// page that must not be simplified later.
//
// ?task_id is 7g's deep link, /account/tasks?task={task_id}. Ownership is
// checked against the session by scoping the query rather than by comparing
// afterwards, so a task id from another account answers exactly the way one that
// does not exist does.

import { ok, fail, ERROR_CODES, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requireApplicant } from '../_lib/session.js';
import { requestLocale } from '../_lib/locales.js';
import { isUuid } from '../_lib/job-detail.js';
import { jobSummaries } from '../_lib/dashboard.js';
import { fetchPending } from '../_lib/apply.js';
import { fetchTasks, promptTask, publicTask, sortTasks, staffLabels } from '../_lib/tasks.js';

/**
 * List the signed in applicant's tasks and unanswered questions, newest first,
 * with the posting each is about and who raised it.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD'])) return;

  response.setHeader('Cache-Control', 'no-store');

  const url = new URL(request.url ?? '/', 'https://careers.invalid');
  const taskId = url.searchParams.get('task_id');

  if (taskId !== null && !isUuid(taskId)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a task id.', {
      details: { task_id: 'invalid' },
    });
  }

  // Unlike the two apply routes that run on public pages, this one is 401 for a
  // signed out caller. Nothing draws it except the account area, which is
  // already behind a session, so an empty list here would hide a real problem.
  const session = await requireApplicant(request, response);
  if (!session) return;

  const locale = await requestLocale(request);

  try {
    // A deep link asks about one row and nothing else, so the prompts are not
    // fetched for it. The prompt half of the union has its own link form,
    // /jobs/{uuid}?prompt={id}, per 7c.
    const tasksRequest = fetchTasks(session.user.id, { taskId });

    let promptsRequest;
    if (taskId) {
      promptsRequest = Promise.resolve([]);
    } else {
      promptsRequest = fetchPending(session.user.id);
    }

    const [rows, prompts] = await Promise.all([tasksRequest, promptsRequest]);

    if (taskId && rows.length === 0) {
      return fail(response, ERROR_CODES.NOT_FOUND, 'That task could not be found.');
    }

    const jobIds = [...rows.map((row) => row.job_id), ...prompts.map((row) => row.job_id)].filter(
      Boolean
    );

    const [jobs, raisers] = await Promise.all([
      jobSummaries(jobIds, locale),
      staffLabels(rows.map((row) => row.raised_by)),
    ]);

    const items = sortTasks([
      ...rows.map((row) => publicTask(row, jobs, raisers, locale)),
      // A prompt whose posting has been hard deleted is dropped rather than
      // drawn as an item about nothing. An admin raised task keeps its place
      // with job null, because its message still means something without the
      // posting it referred to.
      ...prompts.filter((row) => jobs.has(row.job_id)).map((row) => promptTask(row, jobs)),
    ]);

    return ok(response, {
      tasks: items,
      open_count: items.filter((item) => item.is_open).length,
    });
  } catch (cause) {
    return failInternal(response, cause, 'my tasks');
  }
}
