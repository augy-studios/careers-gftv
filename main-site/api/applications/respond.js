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

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import {
  APPLY_CLICK,
  confirmApplication,
  fetchApplication,
  publicApplication,
} from '../_lib/apply.js';
import { unavailable } from '../_lib/maintenance.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // 8.12's shared guard. Off means off, including the API: a disabled
  // control stops nobody with a stale tab or a phase 10 queued action.
  if (await unavailable(res, 'apply_prompt')) return;

  const session = await getApplicantSession(req);
  if (!session) {
    return fail(res, ERR.UNAUTHORISED, 'Sign in to your applicant account to answer that.');
  }

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const analyticsId = String(body.analytics_id ?? '').trim();
  if (!isUuid(analyticsId)) details.analytics_id = 'invalid';

  const answer = String(body.answer ?? '').trim().toLowerCase();
  if (answer !== 'yes' && answer !== 'no') details.answer = 'invalid';

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That answer could not be recorded.', { details });
  }

  try {
    // Read by id and by owner together. An id from another account matches
    // nothing, so there is no branch that could confirm the row exists to
    // somebody who does not own it.
    const { data: row, error } = await supabase
      .from(T.analytics)
      .select('id, job_id, response_state, did_apply, answer_source, responded_at')
      .eq('id', analyticsId)
      .eq('applicant_id', session.user.id)
      .eq('event_type', APPLY_CLICK)
      .maybeSingle();

    if (error) return failInternal(res, error, 'application respond');
    if (!row) return fail(res, ERR.NOT_FOUND, 'That question could not be found.');

    const application = await fetchApplication(row.job_id, session.user.id);

    if (row.response_state !== 'pending') {
      // Already answered, or closed off by the phase 9 cron after 14 days.
      // Nothing to write; say what the state is and let the modal close.
      return ok(res, {
        already_answered: true,
        did_apply: row.did_apply === true,
        application: application
          ? await publicApplication({ ...application, job_id: row.job_id })
          : null,
      });
    }

    const applied = answer === 'yes';
    const now = new Date().toISOString();

    // Filtered on pending as well as on id, so two answers racing each other
    // write one row between them rather than one each.
    const { data: updated, error: updateError } = await supabase
      .from(T.analytics)
      .update({
        did_apply: applied,
        response_state: 'answered',
        answer_source: 'applicant',
        responded_at: now,
      })
      .eq('id', row.id)
      .eq('response_state', 'pending')
      .select('id')
      .maybeSingle();

    if (updateError) return failInternal(res, updateError, 'application respond');

    // The other answer won the race and has already done whatever it does. Say
    // so rather than starting a second cooldown on top of the first.
    if (!updated) {
      return ok(res, {
        already_answered: true,
        did_apply: row.did_apply === true,
        application: application
          ? await publicApplication({ ...application, job_id: row.job_id })
          : null,
      });
    }

    // No means no row moves and no date is set. That is not an omission: 7f is
    // explicit that clicking No starts nothing.
    let current = application;
    if (applied && application) current = await confirmApplication(application, 'applicant');

    return ok(res, {
      already_answered: false,
      did_apply: applied,
      application: current ? await publicApplication({ ...current, job_id: row.job_id }) : null,
    });
  } catch (cause) {
    return failInternal(res, cause, 'application respond');
  }
}
