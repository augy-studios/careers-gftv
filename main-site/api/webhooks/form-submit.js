// POST /api/webhooks/form-submit
//
// Section 13. An Apps Script bound to a job's Google Form posts here the moment
// somebody submits it, and this turns did_apply from a self reported claim into
// a recorded fact.
//
// **Read this before changing the status codes.** Section 13 step 7: "Always
// return 200 for anything that is not an auth or validation failure. Apps
// Script retries are noisy and a 500 helps nobody." That is the opposite of
// every other route in this build, where a database failure is a 500, and it
// will look like a bug to anybody who arrives here from the rest of the API.
// It is not. A 5xx makes UrlFetchApp retry the same delivery repeatedly against
// a portal that is already having a bad day, and the delivery is idempotent
// anyway, so the retries buy nothing and cost a stampede.
//
// What that costs, stated rather than hidden: a delivery lost to a database
// failure is lost, because nothing will resend it. The recovery is the ordering
// in form-submissions.js — the submission row is written first and the match is
// attached last, so a confirmation that fails leaves the row sitting in step
// 6's unmatched list where an admin can see it and link it by hand.
//
// The order of the checks is the other thing worth not rearranging:
//
//   **The secret is compared before the body is read.** A caller who does not
//   hold it gets a 401 having cost this function one string comparison and no
//   database query at all. Putting a rate limit in front of that would add a
//   table read to every unauthenticated request, which makes an endpoint
//   cheaper to flood rather than harder.
//
//   **The maintenance guard sits after the secret**, so a caller who cannot
//   authenticate learns nothing about whether the portal has switched anything
//   off.
//
//   **The rate limit sits after validation**, because its subject is the form,
//   and which form this is only exists once the body has been read and checked.

import {
  ok,
  fail,
  ERR,
  methodNotAllowed,
  readJson,
} from '../_lib/respond.js';
import { requireEnv } from '../_lib/env.js';
import { timingSafeEqualStr } from '../_lib/tokens.js';
import { unavailable } from '../_lib/maintenance.js';
import { supabase, T } from '../_lib/supabase.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForForm,
} from '../_lib/rate-limit.js';
import {
  attachApplicant,
  confirmFromWebhook,
  matchApplicant,
  recordSubmission,
  validateSubmission,
} from '../_lib/form-submissions.js';

/**
 * The payload cap, per step 8.
 *
 * Four fields, none of them long. Two kilobytes is roughly ten times the
 * largest honest delivery and small enough that an endpoint holding a shared
 * secret cannot be used to push megabytes at a function.
 */
const MAX_BODY = 2 * 1024;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  res.setHeader('Cache-Control', 'no-store');

  /* Step 1, the secret. ---------------------------------------------------- */

  let expected;
  try {
    expected = requireEnv('FORM_WEBHOOK_SECRET');
  } catch (cause) {
    // The variable is missing from the environment. This is the one internal
    // failure that is not answered with a 200, because it is not a bad day for
    // the database, it is a deployment that cannot authenticate anybody: every
    // delivery would otherwise be accepted or rejected on the strength of an
    // empty string. 503 rather than 500 says "not configured", and it is the
    // one case where an Apps Script retry is genuinely useful, because
    // somebody setting the variable fixes it.
    console.error('[careers-gftv] form webhook is not configured:', cause);
    return fail(res, ERR.NOT_YET_AVAILABLE, 'The submission webhook is not configured.');
  }

  const presented = req.headers['x-portal-secret'];
  const supplied = Array.isArray(presented) ? presented[0] : presented;

  // Timing safe, and it compares digests rather than the strings, so a length
  // mismatch does not answer faster than a value mismatch. The same shape the
  // recovery codes and the reset tokens use.
  if (typeof supplied !== 'string' || !timingSafeEqualStr(supplied, expected)) {
    // "Log nothing sensitive", per step 1. Not the presented value, not its
    // length, and not the address it came from. That a mismatch happened is the
    // whole of what is useful, and it is the whole of what is written.
    console.warn('[careers-gftv] form webhook: secret mismatch');
    return fail(res, ERR.UNAUTHORISED, 'That secret is not recognised.');
  }

  /* 8.12's guard. ---------------------------------------------------------- */

  // form_webhook is in the feature map at phase 9, so an admin can switch this
  // off from /admin/maintenance on the day a form starts sending nonsense.
  // Section 13 calls the endpoint "enabled by default", which means no admin has
  // to switch it on — not that it is exempt from being switched off.
  if (await unavailable(res, 'form_webhook')) return;

  /* Step 2, the payload. --------------------------------------------------- */

  const body = await readJson(req, res, MAX_BODY);
  if (body === null) return;

  const checked = validateSubmission(body);
  if (!checked.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That submission could not be read.', {
      details: checked.details,
    });
  }

  const { jobId, formResponseId, email, submittedAt } = checked.values;

  /* Step 8, the ceiling. --------------------------------------------------- */

  const subjects = [subjectForForm(jobId)];
  if (await limited(res, 'formWebhook', subjects)) return;

  /* Steps 3 to 6. ---------------------------------------------------------- */

  try {
    // The posting has to exist, because the column is a foreign key and an
    // insert naming a deleted posting would throw rather than record anything.
    // A JOB_ID left pointing at a deleted posting is the ordinary cause and it
    // is a setup mistake, so it is answered plainly rather than swallowed: this
    // is the one thing in the response an admin setting up a form will read.
    const { data: job, error: jobError } = await supabase
      .from(T.jobs)
      .select('id, title')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) throw jobError;

    if (!job) {
      return ok(res, {
        recorded: false,
        reason: 'no_such_posting',
        message: 'No posting has that id. Check JOB_ID in the form\'s Script Properties.',
      });
    }

    // Step 3. The unique constraint from migration 008 is what makes a retried
    // delivery idempotent, and it is asked rather than checked for: a select
    // first would race with the retry it is trying to detect.
    const { duplicate, row } = await recordSubmission({
      jobId,
      formResponseId,
      email,
      submittedAt,
    });

    if (duplicate) {
      // Not an error. Apps Script retries on a timeout it has already been
      // served, and the second delivery of a response we have recorded is the
      // system working.
      return ok(res, { recorded: true, duplicate: true });
    }

    await recordFailures('formWebhook', subjects, LIMITS.formWebhook);

    // Step 4.
    const applicant = await matchApplicant(email);

    if (!applicant) {
      // Step 6. The row stays with matched_applicant_id null and appears on the
      // analytics page, where an admin can attach it to an account. Somebody
      // applying with a different address than they registered with is the
      // normal cause and is not a fault of anybody's.
      return ok(res, { recorded: true, duplicate: false, matched: false });
    }

    // Step 5.
    const confirmation = await confirmFromWebhook(jobId, applicant);

    // Last, deliberately. See the note on attachApplicant: a confirmation that
    // throws leaves this row unmatched and therefore visible, rather than
    // matched and quietly incomplete.
    await attachApplicant(row.id, applicant.id);

    return ok(res, {
      recorded: true,
      duplicate: false,
      matched: true,
      confirmed: confirmation.analytics_updated || confirmation.application_created,
      overrode: confirmation.overrode,
      application_status: confirmation.application_status,
    });
  } catch (cause) {
    // Step 7. Everything past authentication and validation answers 200,
    // including this. Logged loudly, because the server console is now the only
    // place this delivery exists.
    console.error('[careers-gftv] form webhook:', cause);
    return ok(res, { recorded: false, reason: 'internal' });
  }
}
