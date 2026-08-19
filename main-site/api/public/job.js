// GET /api/public/job?id={uuid or slug}&locale={en|zh}
//
// One posting as JSON, in one language. Section 9 lists "job detail by uuid"
// and "slug to uuid lookup for the redirect" as public routes; both are here,
// since the only difference between them is what shape the caller passed.
//
// The posting page does not call this. It is rendered by api/job-page.js, which
// inlines the same payload into the document so the page draws without a second
// round trip. This route exists for everything that is not that page: the
// service worker's cache in phase 10, the saved jobs and applications lists in
// phase 6, and anyone reading the board through the API.
//
// Public and session free, like the rest of api/public, with one exception that
// is not really one: an archived posting is visible only to an applicant with
// history, per 7g, so this route reads the session in that single case and
// marks the response private when it does.
//
// The Google Form URL is not in this payload and cannot be: api/_lib/
// job-detail.js does not select the column.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { localeFromRequest } from '../_lib/validate.js';
import { searchParams } from '../_lib/jobs.js';
import { getApplicantSession } from '../_lib/session.js';
import {
  fetchJobRecord,
  hasHistoryWithJob,
  isVisible,
  isUuid,
  isSlug,
  publicJobDetail,
} from '../_lib/job-detail.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  const locale = localeFromRequest(req);
  const params = searchParams(req);
  const segment = String(params.get('id') ?? '').trim();

  if (!isUuid(segment) && !isSlug(segment)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');
  }

  try {
    const record = await fetchJobRecord(
      isUuid(segment) ? { id: segment } : { slug: segment }
    );

    // The same answer for a posting that does not exist and one the caller may
    // not see. Anything else confirms a draft exists to whoever asks.
    if (!record) return notFound(res);

    const { job } = record;

    let hasHistory = false;
    if (job.status === 'archived') {
      const session = await getApplicantSession(req);
      hasHistory = await hasHistoryWithJob(job.id, session?.user?.id ?? null);
    }

    if (!isVisible(job, hasHistory)) return notFound(res);

    return ok(
      res,
      {
        job: publicJobDetail(record, locale),
        // The canonical address, so a caller that arrived by slug knows where
        // the posting actually lives rather than working it out.
        canonical_path: `/jobs/${job.id}`,
        // True when the caller asked by slug, which is the lookup section 9
        // names separately. A client can use it to correct its own URL.
        redirected: !isUuid(segment),
      },
      { headers: { 'Cache-Control': job.status === 'archived' ? PRIVATE : CACHE } }
    );
  } catch (cause) {
    return failInternal(res, cause, 'public job');
  }
}

function notFound(res) {
  return fail(res, ERR.NOT_FOUND, 'That posting does not exist.', {
    headers: { 'Cache-Control': 'no-store' },
  });
}

const CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PRIVATE = 'private, no-store';
