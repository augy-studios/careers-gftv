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
// **Not cached on the edge, and that is a correction.** It was
// s-maxage=30 with stale-while-revalidate=60, which with the minute
// settings.js cached for meant a flip took about ninety seconds to reach a
// reader. That is the wrong trade for this endpoint specifically: it is the
// one an admin checks by reloading a public page immediately after switching
// something off during an outage, and ninety seconds of the old answer reads
// exactly like the switch not working.
//
// The cost is bounded without the edge cache. This is one small request per
// page load, the same as it was, and the query behind it collapses to one per
// instance per five seconds through FRESH_MS in api/_lib/maintenance.js. What
// the edge cache was buying was not load, it was latency on a payload of a few
// dozen bytes.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { publicFeatureStatus } from '../_lib/maintenance.js';

export default async function handler(req, res) {
  // HEAD alongside GET on anything a stranger may fetch, per the rule phase 4
  // added after the phase 3 routes answered 405 to a monitor.
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const status = await publicFeatureStatus();

    // no-store rather than a short max-age: a browser reusing this from its own
    // cache on the next page load would put the delay back where it was, one
    // reader at a time and invisibly.
    res.setHeader('Cache-Control', 'no-store');

    return ok(res, status);
  } catch (cause) {
    return failInternal(res, cause, 'feature status');
  }
}
