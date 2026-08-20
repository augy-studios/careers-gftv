// POST /api/saved/toggle   { job_id, action: 'save' | 'unsave' }
//
// Section 7g's saved jobs, write side. One route with an action rather than two,
// following api/auth/*/trusted-devices.js: the guard, the validation, the
// ownership scope, and the rate limit are identical for both directions, and two
// files that share all of that are two places for them to drift.
//
// Three things this route decides:
//
//   **Saving requires a session**, per 7g. A logged out visitor gets the sign in
//   prompt from section 4 on the client side and 401 here, which is the same
//   check on the server rather than a hidden control.
//
//   **A posting has to be one this reader could actually be reading.** Without
//   that check, saving confirms a draft posting exists to anybody who guesses a
//   uuid, which is the one thing /jobs/{uuid} is careful not to do. It also
//   matters more here than anywhere else: a saved row is half of 7g's archived
//   posting visibility rule, so saving a posting is granting yourself the right
//   to keep reading it. That must not be a way in to something never published.
//
//   **Saving twice is not an error.** The unique constraint in migration 007
//   makes it one at the database level, so this upserts and answers with the
//   state either way. Two tabs and an impatient second click both produce it.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireApplicant } from '../_lib/session.js';
import {
  fetchJobRecord,
  hasHistoryWithJob,
  isVisible,
  isUuid,
} from '../_lib/job-detail.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';

const ACTIONS = ['save', 'unsave'];

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'save', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const jobId = String(body.job_id ?? '').trim();
  if (!isUuid(jobId)) details.job_id = 'invalid';

  const action = String(body.action ?? '').trim().toLowerCase();
  if (!ACTIONS.includes(action)) details.action = 'invalid';

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That could not be saved.', { details });
  }

  try {
    if (action === 'unsave') {
      // Unsaving is not checked against the posting's visibility. Removing your
      // own row is always allowed, and refusing it for a posting that has since
      // been archived would leave somebody unable to tidy their own list.
      const { error } = await supabase
        .from(T.savedJobs)
        .delete()
        .eq('applicant_id', session.user.id)
        .eq('job_id', jobId);

      if (error) return failInternal(res, error, 'unsave');

      return ok(res, { job_id: jobId, saved: false });
    }

    const record = await fetchJobRecord({ id: jobId });
    if (!record) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

    // The same rule /jobs/{uuid} applies, asked the same way. An archived
    // posting is visible to somebody who already has history with it, which
    // includes an existing saved row, so re-saving one stays possible.
    const hasHistory =
      record.job.status === 'archived'
        ? await hasHistoryWithJob(record.job.id, session.user.id)
        : false;

    if (!isVisible(record.job, hasHistory)) {
      return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');
    }

    const { data, error } = await supabase
      .from(T.savedJobs)
      .upsert(
        { applicant_id: session.user.id, job_id: jobId },
        { onConflict: 'applicant_id,job_id', ignoreDuplicates: true }
      )
      .select('created_at')
      .maybeSingle();

    if (error) return failInternal(res, error, 'save');

    await recordFailures('save', subjects, LIMITS.save);

    // ignoreDuplicates returns no row when there was already one, which is the
    // ordinary second click rather than a failure. The row exists either way,
    // which is the only thing the caller asked about.
    return ok(res, { job_id: jobId, saved: true, saved_at: data?.created_at ?? null });
  } catch (cause) {
    return failInternal(res, cause, 'saved toggle');
  }
}
