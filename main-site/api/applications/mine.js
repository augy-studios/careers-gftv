// GET /api/applications/mine[?job_id={uuid}][?with_jobs=true][?bucket=...]
//
// Section 9's "list mine", and now two callers with different appetites.
//
// **Thin by default**, which is how phase 5 built it and is what the posting
// page and the board want: tracking rows, no human readable content, no locale.
// The posting page has to know whether to draw an Apply button, a cooldown
// notice, or an unanswered prompt, and the board shows the same cooldown state
// on the card, per 7f, "so nobody clicks through only to be turned away".
// Neither of them wants a title they already have on screen.
//
// **Wide when asked**, which is phase 6's My applications page: with_jobs=true
// adds the posting summary each row is about and the bucket counts behind the
// tabs, and only then does the locale mean anything. Widening this route rather
// than writing a second one is what next-steps.md asked for; making it opt-in is
// what stops the board paying for four queries it has no use for on every load.
//
// The three rules that matter:
//
//   **in_cooldown is resolved on the server.** The client cannot know whether
//   the cooldown is switched off site wide, and comparing cooldown_until to the
//   clock would be wrong exactly in the case the setting was added for: at zero
//   days the stored dates are ignored rather than cleared.
//
//   **A signed out caller gets an empty list, not a 401.** The board calls this
//   on every load and most readers are not signed in.
//
//   **No status filter on the postings.** 7g: the list "must keep working for
//   postings that are closed, expired, or archived", so an applicant can always
//   reread what they applied for. The scope is the applicant's own rows.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { isUuid } from '../_lib/job-detail.js';
import { localeFromRequest } from '../_lib/validate.js';
import { BUCKETS, bucketFor, isBucket, jobSummaries } from '../_lib/dashboard.js';
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
  const withJobs = url.searchParams.get('with_jobs') === 'true';
  const bucket = url.searchParams.get('bucket') ?? 'all';

  if (jobId !== null && !isUuid(jobId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.', {
      details: { job_id: 'invalid' },
    });
  }

  if (!isBucket(bucket)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not one of the buckets.', {
      details: { bucket: 'invalid' },
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
        bucket: bucketFor(row.status),
        rating: ratings.get(row.job_id) ?? null,
      }))
    );

    if (!withJobs) return ok(res, { applications, applications_open: open });

    const summaries = await jobSummaries(
      applications.map((row) => row.job_id),
      localeFromRequest(req)
    );

    // A posting hard deleted in phase 7 takes its tracking row with it, per the
    // cascade in migration 006, so this should never drop anything. It is here
    // so a row with no posting behind it is skipped rather than drawn as a card
    // with a blank title, and it happens before the counts so a tab never
    // promises a row the list cannot show.
    const drawable = applications
      .filter((row) => summaries.has(row.job_id))
      .map((row) => ({ ...row, job: summaries.get(row.job_id) }));

    // Counted across every bucket rather than only the one being viewed, so the
    // tabs keep saying how many are in each while you are standing in another.
    // A count that only reads correctly on the tab you are on is worse than no
    // count.
    const counts = countBuckets(drawable);

    return ok(res, {
      applications: drawable.filter((row) => bucket === 'all' || row.bucket === bucket),
      applications_open: open,
      counts,
      bucket,
    });
  } catch (cause) {
    return failInternal(res, cause, 'my applications');
  }
}

/** How many rows are in each bucket, plus the total behind the All tab. */
function countBuckets(applications) {
  const counts = { all: applications.length };
  for (const name of Object.keys(BUCKETS)) counts[name] = 0;

  for (const row of applications) {
    // A status the buckets do not cover is still counted in All, which is what
    // stops a status added later from disappearing off this page entirely.
    if (row.bucket) counts[row.bucket] += 1;
  }

  return counts;
}
