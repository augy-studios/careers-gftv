// GET /api/cron/daily
//
// Section 11's scheduled maintenance. Invoked by Vercel's scheduler on the
// `crons` entry in vercel.json, and by a person with the secret when they are
// testing it.
//
// **What proves this is the cron.** Vercel sends `Authorization: Bearer
// $CRON_SECRET` on a scheduled invocation when CRON_SECRET is set in the
// environment, and sends nothing at all when it is not. There is no session
// here and requireStaff is meaningless: the caller is a scheduler. So the check
// is the header, compared the same timing safe way the webhook compares its
// own, and **a request carrying no secret is refused**. This is a public URL
// like every other, and everything behind it is a write.
//
// **HEAD is deliberately not allowed**, which is the opposite of the rule the
// rest of this API follows. That rule is for things a stranger may fetch, where
// a monitor sending HEAD should get headers rather than a 405. Every method
// this route accepts closes postings, resolves rows, and deletes sessions, and
// a route that does that on a HEAD would run a full maintenance pass for any
// link checker that came past holding the secret.
//
// POST is accepted alongside GET so a person can trigger a run with curl
// without their shell's history holding a URL that looks safe to click.
//
// **The two vercel.json entries, since neither can carry a comment of its own.**
// `crons` fires this at 18:00 UTC, which is 02:00 the next morning in
// Singapore, where this portal's readers and its staff are: a posting whose
// closing date has passed is closed a couple of hours into that day rather than
// mid-afternoon. Vercel fires within roughly an hour of the stated time, which
// is why nothing here depends on the exact minute. `functions` raises this one
// route's maxDuration to 60 seconds, because it waits on Google for up to
// twenty forms and the default would kill it mid-pass.

import { fail, ok, ERR, methodNotAllowed } from '../_lib/respond.js';
import { requireEnv } from '../_lib/env.js';
import { timingSafeEqualStr } from '../_lib/tokens.js';
import { isFeatureOff } from '../_lib/maintenance.js';
import { DAILY, startRun, finishRun, runDailyMaintenance } from '../_lib/cron.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  res.setHeader('Cache-Control', 'no-store');

  /* The secret. ------------------------------------------------------------ */

  let expected;
  try {
    expected = requireEnv('CRON_SECRET');
  } catch (cause) {
    // Not configured. Refused rather than run: a deployment with no CRON_SECRET
    // is one where this endpoint is open to the internet, and running the pass
    // anyway would mean the first person to find the URL can close postings.
    console.error('[careers-gftv] cron is not configured:', cause);
    return fail(res, ERR.NOT_YET_AVAILABLE, 'The maintenance run is not configured.');
  }

  const header = req.headers.authorization;
  const presented = Array.isArray(header) ? header[0] : header;
  const token = typeof presented === 'string' ? presented.replace(/^Bearer\s+/i, '') : '';

  if (token === '' || !timingSafeEqualStr(token, expected)) {
    console.warn('[careers-gftv] cron: secret mismatch');
    return fail(res, ERR.UNAUTHORISED, 'That secret is not recognised.');
  }

  /* 8.12's guard, in the shape a cron needs. ------------------------------- */

  // unavailable() would answer 503 to a scheduler that is not reading it, and
  // the run would leave no trace. So the check is isFeatureOff and the outcome
  // is a *recorded* run saying it was switched off. Otherwise the overview's
  // last-run panel says "no run since Tuesday" for both "an admin turned this
  // off on Tuesday" and "the scheduler stopped firing on Tuesday", and those
  // need completely different responses from whoever reads it.
  if (await isFeatureOff('cron')) {
    const runId = await startRun(DAILY);
    await finishRun(runId, {
      ok: true,
      results: { skipped: true, reason: 'feature_off' },
      error: null,
    });

    return ok(res, { ran: false, reason: 'feature_off' });
  }

  /* The run. --------------------------------------------------------------- */

  // Opened before any work, so a run that dies halfway — a wall clock limit, a
  // process killed mid-pass — leaves a row with a started_at and no finished_at.
  // That is visibly different from a healthy run and from no run at all, and it
  // is the only way a broken pass ever announces itself.
  const runId = await startRun(DAILY);

  try {
    const { ok: allWell, results, failed } = await runDailyMaintenance();

    await finishRun(runId, {
      ok: allWell,
      results,
      error: failed.length > 0 ? `tasks failed: ${failed.join(', ')}` : null,
    });

    // 200 even when a task failed, and the body says which. The caller is a
    // scheduler whose only reaction to a 500 is to log it somewhere nobody
    // reads; the run record is where a failure is meant to surface, and it now
    // holds one. What a non-200 would buy is a red mark in Vercel's dashboard,
    // which is the one place section 11 already says not to rely on.
    return ok(res, { ran: true, ok: allWell, failed, results });
  } catch (cause) {
    // runDailyMaintenance guards each task itself, so reaching here means
    // something outside all four threw. The record still gets closed.
    console.error('[careers-gftv] cron daily:', cause);

    await finishRun(runId, {
      ok: false,
      results: {},
      error: cause instanceof Error ? cause.message : String(cause),
    });

    return ok(res, { ran: true, ok: false, failed: ['run'] });
  }
}
