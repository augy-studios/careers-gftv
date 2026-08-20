// POST /api/applications/withdraw
//
// Section 7e. The applicant pulls out of an application they started or
// submitted. Built in phase 6 rather than phase 5 because /account/applications
// is the only page in the design that offers it, and an endpoint with no caller
// is worse than a line in next-steps.md.
//
// What 7e asks for, and what each part costs:
//
//   **The status becomes withdrawn and an event row records it.** The tracking
//   row is the state; the event log is how it got there.
//
//   **The cooldown is cleared**, "so someone who pulls out is not locked out of
//   a role they change their mind about". applied_at goes with it: leaving the
//   date behind would have the posting page tell somebody they applied on the
//   fourth while offering them the button to apply again, which is two answers
//   to one question.
//
//   **Withdrawing does not delete their Google Form response.** The portal never
//   had it. The page says so on screen before the button is pressed, per 7e, and
//   this route does not pretend otherwise.
//
// One thing 7e does not mention and which 7c makes necessary. An unanswered
// apply prompt blocks a fresh handoff, per api/applications/start.js, so
// withdrawing while a prompt is outstanding would clear the cooldown and leave
// the applicant blocked anyway, which is exactly the lockout 7e exists to
// prevent. So withdrawing answers any outstanding prompt for that posting, as
// No: did_apply stays false, response_state becomes answered and answer_source
// applicant. That is the honest reading of the action rather than a convenient
// one. Somebody who has just told us they are pulling out has answered "did you
// apply for this role" as clearly as the modal ever gets, and phase 8's funnel
// keeps the distinction it cares about, which is a confirmed Yes.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireApplicant } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import {
  APPLY_CLICK,
  fetchApplication,
  fetchPending,
  publicApplication,
  writeApplicationEvent,
} from '../_lib/apply.js';
import { bucketFor } from '../_lib/dashboard.js';
import { unavailable } from '../_lib/maintenance.js';

const WITHDRAWN = 'withdrawn';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // 8.12's shared guard. Off means off, including the API: a disabled
  // control stops nobody with a stale tab or a phase 10 queued action.
  if (await unavailable(res, 'my_applications')) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'withdraw', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  // Named by posting rather than by tracking row id. There is one row per
  // applicant per posting, per migration 006, so the posting identifies it
  // exactly, and the client already has the posting id on screen. It also means
  // no tracking row id is ever emitted to a browser, so none can be guessed at.
  const jobId = String(body.job_id ?? '').trim();
  if (!isUuid(jobId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a posting we can withdraw from.', {
      details: { job_id: 'invalid' },
    });
  }

  try {
    const application = await fetchApplication(jobId, session.user.id);

    // Scoped by applicant on the way in, so a posting somebody has no row for
    // answers the same way one that does not exist does.
    if (!application) {
      return fail(res, ERR.NOT_FOUND, 'You have no application to withdraw for that role.');
    }

    if (application.status === WITHDRAWN) {
      // Idempotent. Two tabs, or an impatient second click, and the honest
      // answer to "I already did that" is the current state rather than an
      // error page.
      return ok(res, {
        already_withdrawn: true,
        application: {
          ...(await publicApplication({ ...application, job_id: jobId })),
          bucket: bucketFor(WITHDRAWN),
        },
      });
    }

    const { data: updated, error } = await supabase
      .from(T.applications)
      .update({ status: WITHDRAWN, applied_at: null, cooldown_until: null })
      .eq('id', application.id)
      // Filtered on the applicant as well as on the row id. The row was read
      // under this session a moment ago, and repeating the scope on the write
      // means the update cannot be widened by anything that goes wrong between
      // the two.
      .eq('applicant_id', session.user.id)
      .select('id, status, started_at, applied_at, cooldown_until')
      .maybeSingle();

    if (error) return failInternal(res, error, 'withdraw');
    if (!updated) return fail(res, ERR.NOT_FOUND, 'You have no application to withdraw for that role.');

    await writeApplicationEvent(updated.id, application.status, WITHDRAWN, 'applicant');
    await answerOutstandingPrompts(jobId, session.user.id);
    await recordFailures('withdraw', subjects, LIMITS.withdraw);

    return ok(res, {
      already_withdrawn: false,
      application: {
        ...(await publicApplication({ ...updated, job_id: jobId })),
        bucket: bucketFor(updated.status),
      },
    });
  } catch (cause) {
    return failInternal(res, cause, 'withdraw');
  }
}

/**
 * Close off any unanswered prompt for this posting, as a No.
 *
 * Filtered on response_state pending as well as on the applicant and the
 * posting, so a row the modal answered a moment ago is left exactly as it is and
 * a confirmed Yes is never overwritten by a later withdrawal. did_apply is not
 * touched: it is false on a pending row by definition, and writing it here would
 * be the one place in the build that could turn a true back into a false.
 *
 * A failure is logged and swallowed. The withdrawal has happened and is what the
 * applicant asked for; refusing it because a prompt could not be tidied away
 * would be strictly worse than a prompt that asks one more question.
 */
async function answerOutstandingPrompts(jobId, applicantId) {
  const pending = await fetchPending(applicantId, { jobId });
  if (pending.length === 0) return;

  const { error } = await supabase
    .from(T.analytics)
    .update({
      response_state: 'answered',
      answer_source: 'applicant',
      responded_at: new Date().toISOString(),
    })
    .eq('applicant_id', applicantId)
    .eq('job_id', jobId)
    .eq('event_type', APPLY_CLICK)
    .eq('response_state', 'pending');

  if (error) console.warn('[careers-gftv] withdraw prompt cleanup:', error);
}
