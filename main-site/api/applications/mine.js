// GET /api/applications/mine[?job_id={uuid}]
//
// Section 9's "list mine". This phase builds the half two surfaces need now:
// the posting page, which has to know whether to draw an Apply button, a
// cooldown notice, or an unanswered prompt, and the board, which per 7f shows
// the same cooldown state on the card "so nobody clicks through only to be
// turned away".
//
// Deliberately thin. It returns tracking rows and nothing human readable, so it
// takes no locale and needs none. Phase 6's My applications page wants titles,
// departments, and bucket tabs alongside these rows, and widening it there,
// with the page that displays them, is better than guessing the shape now.
//
// The two rules that matter:
//
//   **in_cooldown is resolved on the server.** The client cannot know whether
//   the cooldown is switched off site wide, and comparing cooldown_until to the
//   clock would be wrong exactly in the case the setting was added for: at zero
//   days the stored dates are ignored rather than cleared.
//
//   **A signed out caller gets an empty list, not a 401.** The board calls this
//   on every load and most readers are not signed in.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import {
  applicationsOpen,
  fetchOwnRatings,
  fetchPending,
  publicApplication,
} from '../_lib/apply.js';

// Enough for anybody. An applicant with more tracking rows than this has the
// oldest ones left off the board's annotation pass, which costs a cooldown
// badge on a card they can still be told about when they open the posting.
const MAX_ROWS = 200;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url ?? '/', 'https://careers.invalid');
  const jobId = url.searchParams.get('job_id');

  if (jobId !== null && !isUuid(jobId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.', {
      details: { job_id: 'invalid' },
    });
  }

  const session = await getApplicantSession(req);
  if (!session) {
    // applications_open is public information and the posting page needs it
    // whether or not anybody is signed in, so it is answered either way.
    return ok(res, { applications: [], applications_open: await applicationsOpen() });
  }

  try {
    let query = supabase
      .from(T.applications)
      .select('job_id, status, started_at, applied_at, cooldown_until')
      .eq('applicant_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS);

    if (jobId) query = query.eq('job_id', jobId);

    const [{ data, error }, pending, open] = await Promise.all([
      query,
      fetchPending(session.user.id, jobId ? { jobId } : {}),
      applicationsOpen(),
    ]);

    if (error) return failInternal(res, error, 'my applications');

    // job id -> the newest unanswered prompt for it. 7c allows several to be
    // outstanding across different postings, but only ever one per posting,
    // since a start is refused while one is open.
    const pendingByJob = new Map();
    for (const row of pending) {
      if (!pendingByJob.has(row.job_id)) pendingByJob.set(row.job_id, row.id);
    }

    // The applicant's own star rating rides along, so reopening a pending
    // prompt shows the stars they already chose rather than an empty row that
    // reads as though the rating had been lost.
    const ratings = await fetchOwnRatings(
      session.user.id,
      (data ?? []).map((row) => row.job_id)
    );

    const applications = await Promise.all(
      (data ?? []).map(async (row) => ({
        ...(await publicApplication(row, pendingByJob.get(row.job_id) ?? null)),
        rating: ratings.get(row.job_id) ?? null,
      }))
    );

    return ok(res, { applications, applications_open: open });
  } catch (cause) {
    return failInternal(res, cause, 'my applications');
  }
}
