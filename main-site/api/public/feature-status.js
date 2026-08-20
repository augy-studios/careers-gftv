// GET /api/public/feature-status
//
// The maintenance overrides, read by anybody. Section 9 and 8.12.
//
// It carries only which shipped features are currently off and the public note
// on each. The phase list stays in build-status.json and is not duplicated here,
// which is the whole reason the two are separate: the phase list is a static
// file three consumers already read, and this is the one thing the browser needs
// that a static file cannot answer.
//
// **A failure to read this leaves the site working with everything on.** That is
// deliberate and is the direction to fail in. The alternative, a client that
// blanks a control it could not get a status for, would turn a settings blip
// into a site that looks broken, which is precisely the state this endpoint
// exists to describe rather than to cause.
//
// Cached for a short window and never longer, per section 9. Thirty seconds on
// the edge plus the minute settings.js already caches means a flip reaches
// everybody inside about ninety seconds, which is the same order as the minute
// 8.12 accepts, and it costs one query per instance per minute rather than one
// per page view.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { publicFeatureStatus } from '../_lib/maintenance.js';

export default async function handler(req, res) {
  // HEAD alongside GET on anything a stranger may fetch, per the rule phase 4
  // added after the phase 3 routes answered 405 to a monitor.
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const status = await publicFeatureStatus();

    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=30, stale-while-revalidate=60'
    );

    return ok(res, status);
  } catch (cause) {
    return failInternal(res, cause, 'feature status');
  }
}
