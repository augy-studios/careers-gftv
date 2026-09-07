// GET /api/public/health
//
// Whether this deployment is configured. Phase 14 part 10a, section 5 item 29.
//
// ---------------------------------------------------------------------------
// Why this exists, which is one specific outage
// ---------------------------------------------------------------------------
//
// `SITE_URL` was never set on the docs Vercel project. `relyingParty()` reads
// it, exactly two routes call that, and exactly those two answered 500 to every
// staff account from phase 13 part 6 until somebody signed in by hand a
// fortnight later. Three things kept it invisible: the page's own failure state
// is honest and quiet, `--only=live`'s checks all ask as a stranger, and
// `checkEnv()` -- written for precisely this -- was called by nothing.
//
// **A stranger can ask this one.** That is the whole point. The outage class is
// "a variable is missing", and the fix is not a better error message, it is a
// check that can go red without anybody looking.
//
// ---------------------------------------------------------------------------
// What it says, and what it deliberately does not
// ---------------------------------------------------------------------------
//
// `{ ok, missing }` where `missing` is a **count**. Never the names, and never
// a value.
//
// The names are in `.env.example` in a public repository, so naming them here
// would leak little. It would still be publishing which part of a live
// deployment is broken to whoever asks first, and the count is enough for the
// only thing this endpoint is for: a check that goes red. Whoever fixes it
// reads the log line below, which names them, and which is written where the
// original `SITE_URL` stack trace already was.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { checkEnv } from '../_lib/env.js';

export default async function handler(req, res) {
  // HEAD alongside GET on anything a stranger may fetch, per the rule phase 4
  // added after the phase 3 routes answered 405 to a monitor.
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const state = checkEnv();

    if (!state.ok) {
      // The one place the names appear. Vercel's runtime log is where the
      // fortnight long outage was already fully described, so this is the same
      // place, said in a line somebody grepping for it will find.
      console.error(
        `[health] this deployment is missing ${state.missing.length} required ` +
          `environment variable(s): ${state.missing.join(', ')}`
      );
    }

    // Never cached. A cached answer to "are you configured" is an answer about
    // some earlier deployment.
    res.setHeader('Cache-Control', 'no-store');

    return ok(res, { ok: state.ok, missing: state.missing.length });
  } catch (cause) {
    return failInternal(res, cause, 'health');
  }
}
