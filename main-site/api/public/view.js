// POST /api/public/view
//
// Records that a posting page was opened. The first thing in this build to
// write a `view` row into gftvjobs_analytics, which is half of what 8.4's
// funnel measures and the half that has never existed until now.
//
// **Why a write lives under api/public.** Everything else here reads, and the
// naming is about who may call it rather than about what it does: this is the
// public site telling us it rendered a posting, from a page that may have no
// session at all. Putting it under api/applications would file it with the
// apply flow, which it is not part of, and would suggest a session it does not
// need.
//
// Four things it refuses to do, and each one is a number that would otherwise
// be wrong on the analytics page:
//
//   **It does not count a draft.** A draft renders for nobody except a staff
//   member with ?preview=1, per deviation 48, so a view row against one could
//   only ever be an admin looking at their own work. job-page.js does not fire
//   for a preview either; this is the half that does not depend on the client
//   getting it right.
//
//   **It does not trust a job id it has not checked.** The id comes from the
//   browser, so a posting that does not exist, or one still in draft, is a 404
//   rather than a row. Without this, gftvjobs_analytics would accept rows for
//   any uuid anybody sent.
//
//   **It stores no address and no user agent**, per 007. The referrer is kept
//   because 8.4 asks where traffic came from, and it is capped and stored as
//   sent rather than parsed.
//
//   **It never fails the page.** Every answer is 200 or a refusal the client
//   ignores. A reader whose posting page reported an error because a counter
//   could not be written would be paying for a number nobody is waiting on.
//
// Dedupe is the client's job, per 007: "A view is fired once per session per
// posting, never on every render." That is a sessionStorage guard in
// job-page.js. This end enforces the ceiling instead, through the rate limit,
// because a server side dedupe would need to identify the reader, and not
// identifying readers is the whole shape of analytics in this build.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { isUuid } from '../_lib/admin.js';
import { recordView } from '../_lib/analytics.js';
import { LIMITS, limited, recordFailures, subjectForIp } from '../_lib/rate-limit.js';

/** Long enough for a real referrer, short enough that nobody stores an essay. */
const REFERRER_MAX = 300;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = await readJson(req, res);
    if (body === null) return;

    const jobId = String(body.job_id ?? '');
    if (!isUuid(jobId)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');

    // Per address, since most callers have no account. Counted on success, like
    // every other bucket in this build.
    const subjects = [subjectForIp(req)];
    if (await limited(res, 'view', subjects)) return;

    const { data: job, error } = await supabase
      .from(T.jobs)
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;

    // A draft is not viewable by anybody who is not previewing it, and a
    // preview is not a view. Both answer the same 404 a stranger would get from
    // the posting page itself, so this endpoint discloses nothing about which
    // uuids are real drafts.
    if (!job || job.status === 'draft') {
      return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');
    }

    // Optional, and never required. A signed out reader is the ordinary case on
    // a public board, and their view counts exactly as much as anybody's.
    const session = await getApplicantSession(req);

    await recordView({
      jobId: job.id,
      applicantId: session?.user?.id ?? null,
      referrer: referrerFrom(body),
    });

    await recordFailures('view', subjects, LIMITS.view);

    return ok(res, { recorded: true });
  } catch (cause) {
    return failInternal(res, cause, 'record view');
  }
}

/**
 * Where the reader came from, as the browser reported it.
 *
 * Taken from the body rather than from the Referer header, because the header
 * on this request says the posting page every time: the request is made by the
 * page itself. What 8.4 wants is where the *reader* came from, which only the
 * page knows.
 *
 * Trimmed to a length and otherwise stored as sent. It is not parsed, not
 * matched against a list of known sources, and not used for anything except
 * being read by a person, so there is nothing here that a crafted value could
 * confuse.
 */
function referrerFrom(body) {
  const value = String(body.referrer ?? '').trim();
  if (!value) return null;
  return value.slice(0, REFERRER_MAX);
}
