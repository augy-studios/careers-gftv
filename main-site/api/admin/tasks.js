// /api/admin/tasks
//
// Section 8.3's task composer, and 7g's question sets.
//
//   GET  ?applicant=<uuid>   every task on one applicant
//   GET  ?id=<uuid>          one task, with its answers paired to its questions
//   GET  ?open=true          everything waiting on somebody here
//   POST { action: 'raise'|'resolve' }
//
// The composer chooses who the set goes to, per the first decision of
// 21 August 2026, and both audiences land here:
//
//   **These applicants**, ticked from the filtered tracking list. Sending to
//   more than one confirms who first, per the same rule 8.5 applies to bulk
//   invites, and writes one independently frozen task each.
//
//   **This posting, from now on**, which stores the set on the posting through
//   api/admin/jobs.js and raises a task automatically for everybody who applies
//   after that. That half is not here: it hangs off api/applications/start.js,
//   where 7a already writes the tracking row.
//
// Two things this route will not do, both deliberate:
//
//   **It cannot edit a task's questions.** The set is frozen once sent, per 7g,
//   because editing it orphans answers already given. The composer says so
//   before the send rather than after, and there is no action here that would
//   let it be said afterwards.
//
//   **It never inserts an apply prompt.** Those are derived from
//   gftvjobs_analytics at read time and are never copied into gftvjobs_tasks,
//   per 7g and migration 008. A posting's question set raises its own task
//   alongside the prompt; it does not extend it.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText, localeFromRequest } from '../_lib/validate.js';
import { isUuid, params, activeLocales } from '../_lib/admin.js';
import { TASK_TYPES, OPEN_STATUSES } from '../_lib/tasks.js';
import { checkQuestionSet, readAnswers, readQuestions } from '../_lib/questions.js';
import { raiseTasks, resolveTask, fetchTask, tasksForApplicant } from '../_lib/admin-tasks.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

const TITLE_MAX = 200;
const BODY_MAX = 5000;

/** The most people one send may reach. The same ceiling as a bulk status change. */
const MAX_RECIPIENTS = 50;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin tasks');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/**
 * One task as the admin views read it.
 *
 * The questions are resolved into the admin's own language and the answers are
 * paired with the question each one answers, per 8.3: never a bare list of
 * values, so somebody reading it a month later does not have to work out what
 * was asked.
 */
function adminTask(row, locale) {
  return {
    id: row.id,
    applicant_id: row.applicant_id,
    job_id: row.job_id,
    application_id: row.application_id,
    task_type: row.task_type,
    title: row.title,
    body: row.body,
    status: row.status,
    is_open: OPEN_STATUSES.includes(row.status),
    awaiting_admin: row.status === 'awaiting_admin',
    questions: readQuestions(row.questions, locale),
    answers: readAnswers(row.questions, row.answers, locale),
    response_text: row.response_text,
    responded_at: row.responded_at,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function read(req, res) {
  const search = params(req);
  const locale = localeFromRequest(req);

  const id = search.get('id');
  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a task id.');
    const task = await fetchTask(id);
    if (!task) return fail(res, ERR.NOT_FOUND, 'That task could not be found.');
    return ok(res, { task: adminTask(task, locale) });
  }

  const applicantId = search.get('applicant');
  if (applicantId) {
    if (!isUuid(applicantId)) return fail(res, ERR.BAD_REQUEST, 'That is not an applicant id.');
    const jobId = search.get('job');
    const rows = await tasksForApplicant(applicantId, {
      jobId: isUuid(jobId ?? '') ? jobId : null,
    });
    return ok(res, { tasks: rows.map((row) => adminTask(row, locale)) });
  }

  // The queue: everything waiting on somebody here, replies first, because a
  // task at awaiting_admin is one an applicant has already answered and is
  // waiting on us.
  const { data, error } = await supabase
    .from(T.tasks)
    .select(
      `id, applicant_id, job_id, application_id, task_type, title, body, status,
       questions, answers, response_text, responded_at, resolved_at, created_at, updated_at,
       applicant:${T.users} ( id, username, display_name, avatar_url ),
       job:${T.jobs} ( id, title )`
    )
    .in('status', OPEN_STATUSES)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return ok(res, {
    tasks: (data ?? []).map((row) => ({
      ...adminTask(row, locale),
      applicant: row.applicant
        ? {
            id: row.applicant.id,
            username: row.applicant.username,
            display_name: row.applicant.display_name,
            avatar_url: row.applicant.avatar_url ?? null,
          }
        : null,
      job: row.job ? { id: row.job.id, title: row.job.title } : null,
    })),
  });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['raise', 'resolve'];

async function write(req, res, session) {
  const body = await readJson(req, res, 256 * 1024);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;
  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  return action === 'raise'
    ? raise(res, session, body, done)
    : resolve(res, session, body, done);
}

async function raise(res, session, body, done) {
  const details = {};

  const applicantIds = Array.isArray(body.applicant_ids)
    ? [...new Set(body.applicant_ids.filter((id) => isUuid(id)))]
    : [];

  if (applicantIds.length === 0) details.applicant_ids = FIELD.REQUIRED;
  if (applicantIds.length > MAX_RECIPIENTS) details.applicant_ids = FIELD.TOO_LONG;

  const type = String(body.task_type ?? 'info_request');
  if (!TASK_TYPES.includes(type)) details.task_type = FIELD.INVALID;

  const title = validateText(body.title, TITLE_MAX, { required: true });
  if (!title.ok) details.title = title.code;

  const text = validateText(body.body, BODY_MAX);
  if (!text.ok) details.body = text.code;

  const jobId = body.job_id ?? null;
  if (jobId !== null && !isUuid(String(jobId))) details.job_id = FIELD.INVALID;

  const locales = (await activeLocales()).map((locale) => locale.code);
  const questions = checkQuestionSet(body.questions ?? [], { locales });
  if (!questions.ok) {
    details.questions = questions.code;
    if (questions.index !== undefined) details.question_index = String(questions.index);
    if (questions.field) details.question_field = questions.field;
  }

  // A notice carries no questions, per deviation 29: a notice is closed by
  // being read, and one that asked something would be a task an applicant can
  // dismiss while somebody waits for the answer.
  if (type === 'notice' && questions.ok && questions.value.length > 0) {
    details.questions = FIELD.INVALID;
  }

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That task could not be sent.', { details });
  }

  // 8.5's rule, applied here because this reaches real people and each task is
  // frozen the moment it is written. The client shows exactly who will receive
  // it; a mismatch means the list moved underneath them.
  if (applicantIds.length > 1 && Number(body.confirm_count) !== applicantIds.length) {
    return fail(res, ERR.CONFLICT, 'Confirm who this will reach before sending it.', {
      details: { confirm_count: FIELD.MISMATCH, expected: applicantIds.length },
    });
  }

  // The application row each task hangs off, where there is one for this
  // posting. Not required: 8.3 raises a task from the tracking page, but a
  // notice about a posting somebody never applied to is still a thing to send.
  const applications = jobId ? await applicationsFor(jobId, applicantIds) : new Map();

  const tasks = await raiseTasks(
    applicantIds.map((applicantId) => ({
      applicantId,
      jobId: jobId ?? null,
      applicationId: applications.get(applicantId) ?? null,
      type,
      title: title.value,
      body: text.value,
      questions: questions.value,
      raisedBy: session.user.id,
    }))
  );

  await auditStaff(
    session.user,
    AUDIT.TASK_RAISED,
    {
      task_type: type,
      recipients: applicantIds.length,
      questions: questions.value.length,
      job_id: jobId ?? null,
    },
    { targetTable: T.tasks, targetId: tasks.length === 1 ? tasks[0].id : null }
  );

  await done();
  return ok(res, { raised: tasks.length, task_ids: tasks.map((task) => task.id) }, { status: 201 });
}

async function applicationsFor(jobId, applicantIds) {
  const { data, error } = await supabase
    .from(T.applications)
    .select('id, applicant_id')
    .eq('job_id', jobId)
    .in('applicant_id', applicantIds);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.applicant_id, row.id]));
}

async function resolve(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a task id.');

  const task = await resolveTask(id, session.user.id);
  if (!task) {
    // Either there is no such task or it is already closed. One answer for
    // both, because a task id is not a secret to an admin and the distinction
    // is not worth a second query.
    return fail(res, ERR.NOT_FOUND, 'There is no open task with that id.');
  }

  await auditStaff(
    session.user,
    AUDIT.TASK_RESOLVED,
    { task_type: task.task_type, replied: Boolean(task.responded_at) },
    { targetTable: T.tasks, targetId: id }
  );

  await done();
  return ok(res, { id, status: task.status, resolved_at: task.resolved_at });
}
