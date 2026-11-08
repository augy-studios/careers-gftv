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

import { ok, fail, ERROR_CODES, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requestLocale } from '../_lib/locales.js';
import { searchParameters } from '../_lib/jobs.js';
import { getApplicantSession } from '../_lib/session.js';
import {
  fetchJobRecord,
  hasHistoryWithJob,
  isVisible,
  isUuid,
  isSlug,
  publicJobDetail,
} from '../_lib/job-detail.js';

/**
 * One posting as JSON, by id or by slug, in the reader's language where a
 * translation is ready. A posting the reader may not see answers exactly as a
 * missing one does.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD'])) return;

  const locale = await requestLocale(request);
  const parameters = searchParameters(request);
  const segment = String(parameters.get('id') ?? '').trim();

  if (!isUuid(segment) && !isSlug(segment)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a posting id.');
  }

  try {
    let lookup;

    if (isUuid(segment)) {
      lookup = { id: segment };
    } else {
      lookup = { slug: segment };
    }

    const record = await fetchJobRecord(lookup);

    // The same answer for a posting that does not exist and one the caller may
    // not see. Anything else confirms a draft exists to whoever asks.
    if (!record) return notFound(response);

    const { job } = record;

    let hasHistory = false;
    if (job.status === 'archived') {
      const session = await getApplicantSession(request);
      hasHistory = await hasHistoryWithJob(job.id, session?.user?.id ?? null);
    }

    if (!isVisible(job, hasHistory)) return notFound(response);

    let cacheControl = CACHE;
    if (job.status === 'archived') cacheControl = PRIVATE;

    return ok(
      response,
      {
        job: publicJobDetail(record, locale),
        // The canonical address, so a caller that arrived by slug knows where
        // the posting actually lives rather than working it out.
        canonical_path: `/jobs/${job.id}`,
        // True when the caller asked by slug, which is the lookup section 9
        // names separately. A client can use it to correct its own URL.
        redirected: !isUuid(segment),
      },
      { headers: { 'Cache-Control': cacheControl } }
    );
  } catch (cause) {
    return failInternal(response, cause, 'public job');
  }
}

function notFound(response) {
  return fail(response, ERROR_CODES.NOT_FOUND, 'That posting does not exist.', {
    headers: { 'Cache-Control': 'no-store' },
  });
}

const CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PRIVATE = 'private, no-store';
