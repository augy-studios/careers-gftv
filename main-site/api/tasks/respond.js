// POST /api/tasks/respond   { task_id, action: 'reply' | 'dismiss', text? }
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

const ACTIONS = ['reply', 'dismiss'];

// Long enough for a real answer to "tell us more about your availability", short
// enough that this cannot become a file transfer. There is no upload here and
// there is not going to be one: the answers live in Google Forms, per section 10.
const REPLY_MAX = 4000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

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

  const text = validateText(body.text, REPLY_MAX, { required: action === 'reply' });
  if (!text.ok) details.text = text.code;

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That could not be sent.', { details });
  }

  try {
    const { data: task, error } = await supabase
      .from(T.tasks)
      .select('id, task_type, status, response_text')
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

    if (action === 'reply' && task.response_text !== null) {
      return fail(res, ERR.CONFLICT, 'You have already replied to that one.', {
        details: { reason: 'already_replied' },
      });
    }

    const update =
      action === 'reply'
        ? {
            response_text: text.value,
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
      .select('id, status, response_text, responded_at, updated_at')
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
