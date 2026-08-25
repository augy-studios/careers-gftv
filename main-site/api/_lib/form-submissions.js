// The Google Form submission webhook, server side. Section 13.
//
// This is the first thing in the build whose caller is a machine holding a
// shared secret rather than a person holding a cookie, and the difference runs
// through every decision in here.
//
// **What it is for.** 7c's handoff modal asks the applicant whether they
// applied, and their answer is a self reported claim. An Apps Script bound to
// each form posts the response id and the respondent's email the moment a form
// is actually submitted, which turns did_apply from a claim into a record.
// Section 13: "the webhook becomes the authoritative source when the two
// disagree."
//
// Only the email, the response id, and the timestamp are ever sent. The answers
// themselves never leave Google, per section 10, and nothing here would know
// what to do with them if they arrived.
//
// Four rules this file keeps, each of which is a decision rather than
// implementation:
//
//   **A confirmation overrides an earlier No or a timeout.** This is the only
//   place in the build where an answer a person gave is changed by something
//   else, and section 13 step 5 asks for it in those words: a recorded
//   submission beats silence or a misclick. Because it is that, it is recorded
//   as that — answer_source becomes 'webhook' and the event row's source is
//   'webhook', so the timeline says plainly that the applicant did not do this.
//
//   **It never moves a cooldown that is already running.** Step 5 says set
//   applied_at and cooldown_until "if they are not already set", and the settled
//   decision in next-steps.md says a cooldown already being served never moves.
//   confirmApplication writes both unconditionally, which is right for the
//   applicant clicking Yes and wrong here, so the guard is at this end: a
//   tracking row that already carries an applied_at is left holding its dates.
//
//   **The caller has no locale.** Every other write in this build inherits one
//   from a session. Everything written here is read by staff — an event row note
//   on the admin timeline, an audit row — so it is English, deliberately and not
//   by omission. Nothing here writes anything an applicant reads.
//
//   **A duplicate delivery is not an error.** The unique constraint on
//   (job_id, form_response_id) from migration 008 is the idempotency, in the
//   schema rather than in the handler, and step 3 says to answer 200 and stop
//   when it fires. Apps Script retries on every 5xx and on some timeouts, so
//   this is the ordinary case rather than the strange one.

import { supabase, T } from './supabase.js';
import { isUuid } from './admin.js';
import { validateEmail } from './validate.js';
import { cooldownUntil } from './settings.js';
import {
  APPLY_CLICK,
  confirmApplication,
  fetchApplication,
  writeApplicationEvent,
} from './apply.js';

/** Postgres unique violation, which is step 3's duplicate delivery. */
const UNIQUE_VIOLATION = '23505';

/**
 * The longest a Google Form response id may be.
 *
 * Google's are around 40 characters of base64-ish text. The cap is here because
 * the column is unbounded text and the caller is a machine: a field with no
 * ceiling on an endpoint that inserts a row is how a table gets filled with one
 * very large row per delivery.
 */
const RESPONSE_ID_MAX = 200;

/* -------------------------------------------------------------------------
 * Step 2, validating the payload
 * ---------------------------------------------------------------------- */

/**
 * Check a delivery's shape.
 *
 * Returns field codes rather than English, like every other validator in this
 * build, even though the caller is a script that will not render them. They go
 * into the 400's details so that whoever is setting a form up can see which
 * field the script got wrong, which is the only moment anybody reads them.
 *
 * submitted_at is accepted as anything Date.parse understands and stored as an
 * ISO string, because the Apps Script in section 13 sends
 * `getTimestamp().toISOString()` and a form set up by hand may not.
 *
 * @param {unknown} body
 * @returns {{ ok: true, values: { jobId: string, formResponseId: string, email: string, submittedAt: string } }
 *          | { ok: false, details: Record<string, string> }}
 */
export function validateSubmission(body) {
  const details = {};
  const values = {};

  const jobId = String(body?.job_id ?? '').trim();
  if (!isUuid(jobId)) details.job_id = 'invalid';
  else values.jobId = jobId;

  const responseId = String(body?.form_response_id ?? '').trim();
  if (responseId === '') details.form_response_id = 'required';
  else if (responseId.length > RESPONSE_ID_MAX) details.form_response_id = 'too_long';
  else values.formResponseId = responseId;

  // The email is the whole matching key, so a blank one is a validation failure
  // rather than an unmatched row. The Apps Script sends '' when the form does
  // not collect an address and has no question titled Email, and that is a form
  // set up wrongly: it can never match anybody, and answering 200 to it would
  // fill the unmatched list with rows no admin could ever resolve.
  const email = validateEmail(body?.email);
  if (!email.ok) details.email = email.code;
  else values.email = email.value;

  const submitted = body?.submitted_at;
  const parsed = typeof submitted === 'string' ? Date.parse(submitted) : Number.NaN;
  if (!Number.isFinite(parsed)) details.submitted_at = 'invalid';
  else values.submittedAt = new Date(parsed).toISOString();

  if (Object.keys(details).length > 0) return { ok: false, details };
  return { ok: true, values };
}

/* -------------------------------------------------------------------------
 * Step 3, the row
 * ---------------------------------------------------------------------- */

/**
 * Insert the submission, or report that it is a duplicate.
 *
 * The unique constraint is asked to detect the duplicate rather than a select
 * being run first, because a select-then-insert is a race with itself: two
 * retries arriving together would both see nothing and both insert. Letting the
 * constraint answer means the database decides, which is the only place that can.
 *
 * @param {{ jobId: string, formResponseId: string, email: string, submittedAt: string, matchedApplicantId?: string|null }} submission
 * @returns {Promise<{ duplicate: boolean, row: object|null }>}
 */
export async function recordSubmission(submission) {
  const { data, error } = await supabase
    .from(T.formSubmissions)
    .insert({
      job_id: submission.jobId,
      form_response_id: submission.formResponseId,
      email: submission.email,
      submitted_at: submission.submittedAt,
      matched_applicant_id: submission.matchedApplicantId ?? null,
    })
    .select('id, job_id, matched_applicant_id, received_at')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { duplicate: true, row: null };
    throw error;
  }

  return { duplicate: false, row: data };
}

/* -------------------------------------------------------------------------
 * Step 4, the match
 * ---------------------------------------------------------------------- */

/**
 * The applicant account for an address, matched case insensitively per step 4.
 *
 * ilike rather than eq on a lowercased column, because migration 002 stores the
 * address as typed and puts its unique index on lower(email); the index on
 * lower(email) is what makes this cheap. The value is escaped by PostgREST, and
 * the wildcards ilike would otherwise honour are removed first so an address
 * containing a percent sign cannot match a different account.
 *
 * A deactivated account still matches. Somebody whose account was switched off
 * after they submitted a form still submitted it, and the record should say so;
 * what their account can do is a separate question answered at sign in.
 *
 * @param {string} email
 * @returns {Promise<{ id: string, username: string, email: string }|null>}
 */
export async function matchApplicant(email) {
  const literal = String(email).replace(/[%_\\]/g, '\\$&');

  const { data, error } = await supabase
    .from(T.users)
    .select('id, username, email')
    .ilike('email', literal)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

/* -------------------------------------------------------------------------
 * Step 5, the confirmation
 * ---------------------------------------------------------------------- */

/**
 * What a confirmation did, for the response body and for the audit metadata.
 * @typedef {{
 *   analytics_id: string|null,
 *   analytics_updated: boolean,
 *   overrode: string|null,
 *   application_id: string|null,
 *   application_status: string|null,
 *   application_created: boolean,
 *   cooldown_kept: boolean
 * }} ConfirmationResult
 */

/**
 * Mark a matched applicant's application to this posting as genuinely
 * submitted, per step 5.
 *
 * Runs in two halves that are deliberately independent, because the case that
 * makes them independent is the one step 5 spells out: somebody who reached the
 * form by a shared link has no analytics row at all, and the tracking row still
 * has to be created. Neither half is a precondition of the other.
 *
 * @param {string} jobId
 * @param {{ id: string, username: string }} applicant
 * @returns {Promise<ConfirmationResult>}
 */
export async function confirmFromWebhook(jobId, applicant) {
  const result = {
    analytics_id: null,
    analytics_updated: false,
    overrode: null,
    application_id: null,
    application_status: null,
    application_created: false,
    cooldown_kept: false,
  };

  /* The analytics half. ------------------------------------------------- */

  // The most recent apply click for this pairing, whatever state it is in.
  // APPLY_CLICK is filtered on for the reason apply.js gives at its definition:
  // 8.4's view rows sit in the same table at response_state pending, and a
  // webhook that confirmed one would be recording that somebody applied because
  // they read the posting.
  const { data: rows, error } = await supabase
    .from(T.analytics)
    .select('id, did_apply, response_state, answer_source')
    .eq('job_id', jobId)
    .eq('applicant_id', applicant.id)
    .eq('event_type', APPLY_CLICK)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = rows?.[0] ?? null;

  if (row) {
    result.analytics_id = row.id;

    if (row.did_apply === true) {
      // Already confirmed, by the applicant or by an earlier delivery. Nothing
      // to override and nothing to write: this is what makes a second delivery
      // of a different response id for the same person a no-op rather than a
      // second cooldown.
      result.overrode = null;
    } else {
      // What is being overridden, recorded before it is gone. 'answered' with
      // did_apply false is an explicit No; 'no_response' is the cron's timeout;
      // 'pending' is silence, which overrides nothing.
      result.overrode =
        row.response_state === 'answered'
          ? 'no'
          : row.response_state === 'no_response'
            ? 'timeout'
            : null;

      const { data: updated, error: updateError } = await supabase
        .from(T.analytics)
        .update({
          did_apply: true,
          response_state: 'answered',
          answer_source: 'webhook',
          responded_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('did_apply', false)
        .select('id')
        .maybeSingle();

      if (updateError) throw updateError;

      // Filtered on did_apply false as well as on id, so a delivery racing the
      // applicant's own Yes writes one answer between them rather than one each.
      // Losing that race is not a failure: the row says applied either way.
      result.analytics_updated = Boolean(updated);
      if (!updated) result.overrode = null;
    }
  }

  /* The tracking half. -------------------------------------------------- */

  let application = await fetchApplication(jobId, applicant.id);

  if (!application) {
    // Step 5's shared link case. The row is created at 'submitted' directly
    // rather than at 'started' and then moved, because there was never a start
    // click to record and a timeline reading started-then-submitted in the same
    // second would invent one.
    const now = new Date();

    const { data: created, error: insertError } = await supabase
      .from(T.applications)
      .insert({
        job_id: jobId,
        applicant_id: applicant.id,
        status: 'submitted',
        applied_at: now.toISOString(),
        cooldown_until: await cooldownUntil(now),
      })
      .select('id, status, started_at, applied_at, cooldown_until')
      .single();

    if (insertError) throw insertError;

    application = created;
    result.application_created = true;

    await writeApplicationEvent(
      created.id,
      null,
      'submitted',
      'webhook',
      'Confirmed by the application form. No apply click was recorded, so this posting was most likely reached by a shared link.'
    );
  } else if (application.applied_at) {
    // Step 5: set the dates "if they are not already set". They are, so they
    // stay. A cooldown already being served never moves, and re-confirming
    // through a second delivery must not extend one by ninety days.
    result.cooldown_kept = true;
  } else {
    // CONFIRMABLE rather than RESETTABLE, which confirmApplication handles: a
    // rejection that landed while the form sat open must not be undone by this.
    application = await confirmApplication(application, 'webhook');
  }

  result.application_id = application.id;
  result.application_status = application.status;

  return result;
}

/**
 * Record which account a submission belongs to.
 *
 * Deliberately written *after* the confirmation rather than as part of the
 * insert, and that ordering is the webhook's whole recovery story. If the
 * confirmation throws — a database blip mid-delivery — the row stays in step
 * 6's unmatched list carrying the applicant's own address, an admin sees it on
 * the analytics page, and linking it by hand runs the confirmation again. The
 * alternative, matching on insert, would leave a row that looks handled, is
 * not, and appears in no list anybody reads.
 *
 * Filtered on the column still being null so the manual action and a retry
 * cannot fight over one row.
 *
 * @param {string} submissionId
 * @param {string} applicantId
 */
export async function attachApplicant(submissionId, applicantId) {
  const { error } = await supabase
    .from(T.formSubmissions)
    .update({ matched_applicant_id: applicantId })
    .eq('id', submissionId)
    .is('matched_applicant_id', null);

  // Never fails the delivery. The confirmation has already happened, which is
  // the part that matters; an unattached row shows up as unmatched and an admin
  // linking it re-runs a confirmation that is idempotent by construction.
  if (error) console.error('[careers-gftv] attach submission:', error);
}

/* -------------------------------------------------------------------------
 * Step 6, the unmatched list
 * ---------------------------------------------------------------------- */

/** How many unmatched rows the analytics page carries. */
const UNMATCHED_LIMIT = 50;

/**
 * Submissions that matched no account, newest first, per step 6.
 *
 * "Someone applying with a different email than they registered with is the
 * normal cause", which is why this is a list an admin works through rather than
 * an error state: the row is a real submission and the only thing missing is
 * which account it belongs to.
 *
 * Migration 008's partial index on received_at where matched_applicant_id is
 * null is exactly this query.
 *
 * @param {{ jobId?: string|null, limit?: number }} [options]
 */
export async function unmatchedSubmissions(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || UNMATCHED_LIMIT, 1), UNMATCHED_LIMIT);

  let query = supabase
    .from(T.formSubmissions)
    .select(`id, job_id, email, submitted_at, received_at, job:${T.jobs} ( id, title )`)
    .is('matched_applicant_id', null)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (options.jobId) query = query.eq('job_id', options.jobId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    job_id: row.job_id,
    job_title: row.job?.title ?? null,
    email: row.email,
    submitted_at: row.submitted_at,
    received_at: row.received_at,
  }));
}

/* -------------------------------------------------------------------------
 * The manual link, from section 13's fallbacks
 * ---------------------------------------------------------------------- */

/**
 * Attach an unmatched submission to an account by hand, and run the same
 * confirmation the webhook would have run had it matched.
 *
 * Section 13's fallbacks: "Add an admin action to manually mark a tracking row
 * as submitted, for the unmatched-email case." This is that action, done from
 * the submission rather than from the tracking row, because the submission is
 * the evidence and the tracking row may not exist yet.
 *
 * The address on the submission is not copied onto the account. The whole
 * situation is that the two differ, and an admin deciding they are the same
 * person is not the same as that person telling us their address changed.
 *
 * @param {string} submissionId
 * @param {string} applicantId
 * @returns {Promise<{ ok: false, reason: string } | { ok: true, submission: object, confirmation: ConfirmationResult }>}
 */
export async function linkSubmission(submissionId, applicantId) {
  const { data: submission, error } = await supabase
    .from(T.formSubmissions)
    .select('id, job_id, email, submitted_at, matched_applicant_id')
    .eq('id', submissionId)
    .maybeSingle();

  if (error) throw error;
  if (!submission) return { ok: false, reason: 'not_found' };
  if (submission.matched_applicant_id) return { ok: false, reason: 'already_matched' };

  const { data: applicant, error: userError } = await supabase
    .from(T.users)
    .select('id, username')
    .eq('id', applicantId)
    .maybeSingle();

  if (userError) throw userError;
  if (!applicant) return { ok: false, reason: 'no_such_applicant' };

  // The link is written first and the confirmation second, in that order on
  // purpose: if the confirmation throws, the row is still attributed to the
  // right person and an admin can see that it was, rather than finding it back
  // in the unmatched list with a half applied change behind it.
  const { error: updateError } = await supabase
    .from(T.formSubmissions)
    .update({ matched_applicant_id: applicant.id })
    .eq('id', submission.id)
    .is('matched_applicant_id', null);

  if (updateError) throw updateError;

  const confirmation = await confirmFromWebhook(submission.job_id, applicant);

  return { ok: true, submission, confirmation };
}
