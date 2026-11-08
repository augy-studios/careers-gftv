// POST /api/applications/respond
//
// Section 7c's third panel: "Have you applied for this role?", answered Yes or
// No. This is the only place in the build, other than the phase 9 webhook, that
// may set did_apply to true.
//
// What each answer does, from 7c, and the asymmetry between them is the point:
//
//   Yes  did_apply true, response_state answered, answer_source applicant,
//        responded_at now. The tracking row moves to submitted and the cooldown
//        in 7f starts.
//   No   response_state answered, answer_source applicant, responded_at now.
//        did_apply stays false, the tracking row stays at started, nothing is
//        locked, and the applicant is offered the form again.
//
// Dismissing the modal without answering is neither of these and never reaches
// this route. The row stays pending, which already counts as No everywhere it
// matters, and the modal reopens on the next visit. The only thing the explicit
// No buys is that the phase 8 analytics page can tell a real No from silence.
//
// Answering twice is not an error. Two tabs, or a slow network and an impatient
// second click, both produce it, and the honest answer to "I already told you"
// is the current state rather than a red message. The row is only ever written
// once, because the update is filtered on response_state pending.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  failInternal,
  readJson,
} from '../_lib/respond.js';
import { supabase, TABLES } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import {
  APPLY_CLICK,
  confirmApplication,
  fetchApplication,
  publicApplication,
} from '../_lib/apply.js';
import { unavailable } from '../_lib/maintenance.js';

/**
 * Record an applicant's answer to "Have you applied for this role?". Only the
 * applicant who clicked Apply can answer, and only once. A Yes confirms the
 * application and starts the cooldown; a No leaves it open.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  // 8.12's shared guard. Off means off, including the API: a disabled
  // control stops nobody with a stale tab or a phase 10 queued action.
  if (await unavailable(response, 'apply_prompt')) return;

  const session = await getApplicantSession(request);
  if (!session) {
    return fail(
      response,
      ERROR_CODES.UNAUTHORISED,
      'Sign in to your applicant account to answer that.'
    );
  }

  const body = await readJson(request, response);
  if (body === null) return;

  const details = {};

  const analyticsId = String(body.analytics_id ?? '').trim();
  if (!isUuid(analyticsId)) details.analytics_id = 'invalid';

  const answer = String(body.answer ?? '')
    .trim()
    .toLowerCase();
  if (answer !== 'yes' && answer !== 'no') details.answer = 'invalid';

  if (Object.keys(details).length > 0) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That answer could not be recorded.', {
      details,
    });
  }

  try {
    // Read by id and by owner together. An id from another account matches
    // nothing, so there is no branch that could confirm the row exists to
    // somebody who does not own it.
    const { data: row, error } = await supabase
      .from(TABLES.analytics)
      .select('id, job_id, response_state, did_apply, answer_source, responded_at')
      .eq('id', analyticsId)
      .eq('applicant_id', session.user.id)
      .eq('event_type', APPLY_CLICK)
      .maybeSingle();

    if (error) return failInternal(response, error, 'application respond');
    if (!row) return fail(response, ERROR_CODES.NOT_FOUND, 'That question could not be found.');

    const application = await fetchApplication(row.job_id, session.user.id);

    if (row.response_state !== 'pending') {
      // Already answered, or closed off by the phase 9 cron after 14 days.
      // Nothing to write; say what the state is and let the modal close.
      const didApply = row.did_apply === true;

      let publicApplicationState;

      if (application) {
        publicApplicationState = await publicApplication({ ...application, job_id: row.job_id });
      } else {
        publicApplicationState = null;
      }

      return ok(response, {
        already_answered: true,
        did_apply: didApply,
        application: publicApplicationState,
      });
    }

    const applied = answer === 'yes';
    const now = new Date().toISOString();

    // Filtered on pending as well as on id, so two answers racing each other
    // write one row between them rather than one each.
    const { data: updated, error: updateError } = await supabase
      .from(TABLES.analytics)
      .update({
        did_apply: applied,
        response_state: 'answered',
        answer_source: 'applicant',
        responded_at: now,
      })
      .eq('id', row.id)
      .eq('applicant_id', session.user.id)
      .eq('response_state', 'pending')
      .select('id')
      .maybeSingle();

    if (updateError) return failInternal(response, updateError, 'application respond');

    // The other answer won the race and has already done whatever it does. Say
    // so rather than starting a second cooldown on top of the first.
    if (!updated) {
      const didApply = row.did_apply === true;
      let publicApplicationState;

      if (application) {
        publicApplicationState = await publicApplication({ ...application, job_id: row.job_id });
      } else {
        publicApplicationState = null;
      }

      return ok(response, {
        already_answered: true,
        did_apply: didApply,
        application: publicApplicationState,
      });
    }

    // No means no row moves and no date is set. That is not an omission: 7f is
    // explicit that clicking No starts nothing.
    let current = application;
    if (applied && application) current = await confirmApplication(application, 'applicant');

    let currentApplication;

    if (current) {
      currentApplication = await publicApplication({ ...current, job_id: row.job_id });
    } else {
      currentApplication = null;
    }

    return ok(response, {
      already_answered: false,
      did_apply: applied,
      application: currentApplication,
    });
  } catch (cause) {
    return failInternal(response, cause, 'application respond');
  }
}
