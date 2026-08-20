// POST /api/tasks/respond   { task_id, action: 'reply' | 'dismiss', text?, answers? }
//
// The two things an applicant can do with a task, per 7g.
//
//   reply    an info_request. "Opening an info request expands an inline panel
//            with the admin's message and a single reply box." The row moves to
//            awaiting_admin, which is migration 008's rule: the applicant
//            replying moves it there, and only an admin moves it to resolved.
//   dismiss  a notice. "A one way message with nothing to submit", so the only
//            thing to do with it is acknowledge it and have it stop counting.
//
// **Keep replies to one round.** 7g: "The admin asks, the applicant replies
// once, the admin reads it and closes the task. This is deliberately not a
// messaging thread, and it should not grow into one without a decision to build
// that properly." So a row that has already been replied to refuses a second
// reply rather than appending, and the refusal is the design rather than a
// missing feature. If this ever needs to become a thread, it needs a table for
// the messages, not a longer column.
//
// Ownership is the applicant_id on the row, applied as a filter on both the read
// and the write. A task id from another account matches nothing at either step.
//
// **Phase 7 added the answers**, per 7g's question sets and section 9's list of
// what this endpoint has to check. The one round rule did not change: questions
// and free text go in one submission, and a task with answers on it still
// refuses a second reply.
//
// The rule that decides how they are checked, and it is section 9's own
// sentence: **the answers are validated against the set stored on that task**,
// never against what the browser sends back. "The browser was sent the questions
// and cannot be trusted to send back an answer to one of them." So the questions
// column is read here, checkAnswers takes it, and there is no path by which a
// request can supply the set it is checked against.



import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireApplicant } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import { validateText, FIELD } from '../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import { OPEN_STATUSES } from '../_lib/tasks.js';
import { checkAnswers, hasQuestions } from '../_lib/questions.js';
import { unavailable } from '../_lib/maintenance.js';

const ACTIONS = ['reply', 'dismiss'];

// Long enough for a real answer to "tell us more about your availability", short
// enough that this cannot become a file transfer. There is no upload here and
// there is not going to be one: the answers live in Google Forms, per section 10.
const REPLY_MAX = 4000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // 8.12's guard. Off means off, including the API.
  if (await unavailable(res, 'outstanding_tasks')) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'task_reply', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const taskId = String(body.task_id ?? '').trim();
  if (!isUuid(taskId)) details.task_id = FIELD.INVALID;

  const action = String(body.action ?? '').trim().toLowerCase();
  if (!ACTIONS.includes(action)) details.action = FIELD.INVALID;

  // Whether the free text is required is decided after the task is read,
  // because it depends on whether the task carries questions: a reply that
  // answers three questions and adds nothing else is a complete reply, and
  // demanding a sentence as well would be asking somebody to pad it out.
  const text = validateText(body.text, REPLY_MAX);
  if (!text.ok) details.text = text.code;

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That could not be sent.', { details });
  }

  try {
    const { data: task, error } = await supabase
      .from(T.tasks)
      .select('id, task_type, status, response_text, responded_at, questions')
      .eq('id', taskId)
      .eq('applicant_id', session.user.id)
      .maybeSingle();

    if (error) return failInternal(res, error, 'task respond');
    if (!task) return fail(res, ERR.NOT_FOUND, 'That task could not be found.');

    if (!OPEN_STATUSES.includes(task.status)) {
      return fail(res, ERR.CONFLICT, 'That task has already been closed.', {
        details: { reason: 'closed' },
      });
    }

    // responded_at rather than response_text, since phase 7. A reply that
    // answered three questions and wrote nothing in the box leaves
    // response_text null, and the old check would have let that one be replied
    // to twice, which is the one thing the one round rule exists to prevent.
    if (action === 'reply' && task.responded_at !== null) {
      return fail(res, ERR.CONFLICT, 'You have already replied to that one.', {
        details: { reason: 'already_replied' },
      });
    }

    let answers = null;

    if (action === 'reply') {
      const carriesQuestions = hasQuestions(task.questions);

      // Every required question answered, every choice one of that question's
      // own values, and nothing naming a question this task does not carry.
      const checked = checkAnswers(body.answers, task.questions);
      if (!checked.ok) {
        return fail(res, ERR.BAD_REQUEST, 'Some of those answers are missing or not valid.', {
          details: checked.details,
        });
      }
      answers = checked.value;

      // A task with no questions is the phase 6 reply box and still needs
      // something written in it. A task with questions is satisfied by the
      // answers, and the box beside them is the place to add anything else.
      if (!carriesQuestions && !text.value) {
        return fail(res, ERR.BAD_REQUEST, 'Write a reply before sending it.', {
          details: { text: FIELD.REQUIRED },
        });
      }
    }

    const update =
      action === 'reply'
        ? {
            response_text: text.value,
            answers,
            responded_at: new Date().toISOString(),
            status: 'awaiting_admin',
          }
        : { status: 'dismissed' };

    const { data: updated, error: updateError } = await supabase
      .from(T.tasks)
      .update(update)
      .eq('id', task.id)
      .eq('applicant_id', session.user.id)
      // Filtered on the statuses that are still open, so two tabs racing write
      // one answer between them rather than one each.
      .in('status', OPEN_STATUSES)
      .select('id, status, response_text, answers, responded_at, updated_at')
      .maybeSingle();

    if (updateError) return failInternal(res, updateError, 'task respond');

    if (!updated) {
      return fail(res, ERR.CONFLICT, 'That task has already been closed.', {
        details: { reason: 'closed' },
      });
    }

    await recordFailures('task_reply', subjects, LIMITS.taskReply);

    return ok(res, {
      id: updated.id,
      status: updated.status,
      response_text: updated.response_text ?? null,
      responded_at: updated.responded_at ?? null,
    });
  } catch (cause) {
    return failInternal(res, cause, 'task respond');
  }
}
