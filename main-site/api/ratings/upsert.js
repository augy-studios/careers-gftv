// POST /api/ratings/upsert
//
// The five stars in the handoff modal, per 7c. One rating per applicant per
// posting, and a second rating updates the first, per migration 007.
//
// What the rating is about, because it is easy to read the modal and assume
// otherwise: it rates **the posting**, not the role and not the team. Whether
// the advert explained the work, said what was wanted, and was worth reading.
// That is why it is admin facing only and never shown on a posting: a visible
// score would discourage applications to a role a handful of people rated low,
// and 8.4 suppresses the average below three ratings for the same reason.
//
// Independent of the apply answer, in both directions. Rating without answering
// is normal and is kept. Answering without rating is normal and is kept. The
// modal never blocks on either, so neither does this route.
//
// Not rate limited, deliberately, and this is the one write in the build that
// is not. The unique constraint on (job_id, applicant_id) means an account can
// only ever hold one row per posting, so there is no growth to bound: a script
// hammering this rewrites its own rows and adds nothing. What it could do is
// rate every posting on the board, which is eight rows today and is a thing an
// admin can see and undo, unlike a table filling up.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { hasHistoryWithJob, isUuid, isVisible } from '../_lib/job-detail.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await getApplicantSession(req);
  if (!session) {
    return fail(res, ERR.UNAUTHORISED, 'Sign in to your applicant account to rate a posting.');
  }

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const jobId = String(body.job_id ?? '').trim();
  if (!isUuid(jobId)) details.job_id = 'invalid';

  // Migration 007 constrains this to 1 to 5 at the database. Checked here as
  // well so a bad value is a field error the modal can point at rather than a
  // database error the client cannot read.
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) details.rating = 'invalid';

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That rating could not be saved.', { details });
  }

  try {
    if (!(await canRate(jobId, session.user.id))) {
      return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');
    }

    const { data, error } = await supabase
      .from(T.ratings)
      .upsert(
        { job_id: jobId, applicant_id: session.user.id, rating },
        { onConflict: 'job_id,applicant_id' }
      )
      .select('rating, updated_at')
      .single();

    if (error) return failInternal(res, error, 'rating');

    return ok(res, { rating: data.rating, updated_at: data.updated_at });
  } catch (cause) {
    return failInternal(res, cause, 'rating');
  }
}

/**
 * Whether this applicant may rate this posting.
 *
 * The same visibility rule as the posting page, per 7g: published and closed
 * render for everybody, archived renders only for somebody with history, and a
 * draft is a 404 for all. Anything a reader can read, they can rate.
 *
 * Deliberately not "only postings you have applied to". The stars sit in the
 * handoff modal today, so in practice every rating follows an apply click, but
 * tying the endpoint to that would mean phase 10's offline rating, which
 * section 0c's status entry already promises, has to unpick this check first.
 */
async function canRate(jobId, applicantId) {
  const { data, error } = await supabase
    .from(T.jobs)
    .select('id, status')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  const hasHistory =
    data.status === 'archived' ? await hasHistoryWithJob(data.id, applicantId) : false;

  return isVisible(data, hasHistory);
}
