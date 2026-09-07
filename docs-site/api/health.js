// GET /api/health
//
// Whether this deployment is configured. Phase 14 part 10a, section 5 item 29.
//
// **The site this was written for is this one.** `SITE_URL` was never set on
// this Vercel project, `relyingParty()` reads it, and the two routes that call
// that answered 500 to every staff account from phase 13 part 6 until somebody
// signed in by hand a fortnight later. `checkEnv()` existed the whole time and
// nothing called it.
//
// The portal carries the twin of this file, deliberately not generated: the two
// import their own `env.js`, whose KNOWN lists differ, and a shared copy would
// have to be told which site it was on. See `main-site/api/public/health.js`
// for the argument about what this may say, which is the same argument.
//
// `{ ok, missing }` where `missing` is a **count**. Never the names, and never
// a value. The names go to the runtime log, which is where the original stack
// trace already was and where nobody was looking.

import { ok, methodNotAllowed, failInternal } from './_lib/respond.js';
import { checkEnv } from './_lib/env.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const state = checkEnv();

    if (!state.ok) {
      console.error(
        `[health] this deployment is missing ${state.missing.length} required ` +
          `environment variable(s): ${state.missing.join(', ')}`
      );
    }

    res.setHeader('Cache-Control', 'no-store');

    return ok(res, { ok: state.ok, missing: state.missing.length });
  } catch (cause) {
    return failInternal(res, cause, 'health');
  }
}
