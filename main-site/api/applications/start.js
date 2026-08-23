// POST /api/applications/start
//
// Section 7a. A logged in applicant clicks Apply, and this hands them over.
//
// The order of the four steps is 7a's, and each one is checked before the next
// runs, so a refusal never leaves a half written trail:
//
//   1. Verify the session, the posting, the closing date, and the global
//      applications toggle.
//   2. Insert the gftvjobs_analytics row, at did_apply false and
//      response_state pending.
//   3. Upsert the gftvjobs_applications tracking row and write its event row.
//   4. Return the prefilled form URL and the id of the analytics row.
//
// Four rules that are easy to lose, and one of them is the whole point of the
// route existing:
//
//   **A logged out request returns 401 and writes no analytics row.** The gate
//   is here, on the server, not on the button. This is the only endpoint in the
//   build that ever emits a Google Form URL, and api/_lib/job-detail.js is
//   careful never to select the column so no public payload can leak it.
//
//   **The cooldown is enforced here, not only by hiding the button**, per 7f. A
//   request inside a cooldown returns a clear error and writes nothing.
//
//   **A pending answer blocks a second handoff**, per 7c, so two prompts cannot
//   stack on one posting. The refusal carries the pending row id, so the client
//   can reopen the modal the applicant already has rather than telling them off.
//
//   **Never infer an application from the click.** Everything written here says
//   somebody was handed over. Only api/applications/respond.js and the phase 9
//   webhook may say they applied.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { getApplicantSession } from '../_lib/session.js';
import { localeFromRequest } from '../_lib/validate.js';
import { isUuid } from '../_lib/job-detail.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import {
  REFUSAL,
  applicationsOpen,
  buildFormUrl,
  fetchApplication,
  fetchApplyJob,
  fetchPending,
  logApplyClick,
  publicApplication,
  refusalFor,
  refusalForApplicant,
  resolveForm,
  startApplication,
} from '../_lib/apply.js';
import { isInCooldown } from '../_lib/settings.js';
import { raisePostingQuestions } from '../_lib/admin-tasks.js';
import { markInviteApplied } from '../_lib/invites.js';
import { unavailable } from '../_lib/maintenance.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // 8.12's shared guard, before anything else is read. Off means off, including
  // the API: a disabled Apply button stops nobody with a stale tab.
  if (await unavailable(res, 'apply')) return;

  const session = await getApplicantSession(req);
  if (!session) {
    return fail(
      res,
      ERR.UNAUTHORISED,
      'Sign in to your applicant account to apply for this role.'
    );
  }

  // Per account only, and this is the one write in the build that is not also
  // limited per IP. GFTV runs stands at conventions, where a room full of
  // people share one address behind NAT, and a shared bucket there would lock
  // out the seventh person to apply from the same wifi. The abuse this bucket
  // is for is one account filling gftvjobs_analytics, which the account subject
  // bounds on its own, and making many accounts from one address is already
  // bounded by the register bucket, which does limit per IP because the thing
  // it is guarding is different.
  const subjects = [subjectForUser('applicant', session.user.id)];
  if (await limited(res, 'apply', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  const jobId = String(body.job_id ?? '').trim();
  if (!isUuid(jobId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a posting we can start an application for.', {
      details: { job_id: 'invalid' },
    });
  }

  // The language the reader is in, so a posting with its own Mandarin form
  // hands over the Mandarin one, per 3a and migration 014.
  const locale = localeFromRequest(req);

  try {
    const job = await fetchApplyJob(jobId);

    // A draft posting 404s here for the same reason it 404s at its URL: this
    // route must not confirm that one exists to anybody who guesses a uuid.
    if (!job || job.status === 'draft') {
      return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');
    }

    const refusal = refusalFor(job, await applicationsOpen());
    if (refusal) return refuse(res, refusal);

    // Both of these are about this applicant rather than the posting, so they
    // come after the posting's own state and before anything is written.
    const [existing, pending] = await Promise.all([
      fetchApplication(jobId, session.user.id),
      fetchPending(session.user.id, { jobId, limit: 1 }),
    ]);

    // Permanent, and checked before the cooldown so an accepted applicant is
    // never shown a date. 8.3: accepting closes the posting to that applicant
    // for good.
    const personal = refusalForApplicant(existing);
    if (personal) return refuse(res, personal);

    if (pending.length > 0) {
      return refuse(res, REFUSAL.PENDING, { pending_id: pending[0].id });
    }

    if (await isInCooldown(existing)) {
      return refuse(res, REFUSAL.COOLDOWN, {
        applied_at: existing.applied_at,
        cooldown_until: existing.cooldown_until,
      });
    }

    const form = await resolveForm(job, locale);
    if (!form.url) return refuse(res, REFUSAL.NO_FORM);

    // 7a's order, and it is not arbitrary: the analytics row is what the modal
    // is answered against, so it exists before the applicant can possibly
    // answer. The tracking row can be reconstructed from it; the reverse is not
    // true, because analytics is the append only log and applications is not.
    const event = await logApplyClick(jobId, session.user.id, req.headers?.referer ?? null);
    const application = await startApplication(jobId, session.user.id, existing);

    // 7g's posting question set, per the second decision of 21 August 2026. The
    // auto-raise goes here, where the tracking row is already being written, so
    // it is one more step in a request that exists rather than anything
    // scheduled. It is deliberately not bolted onto the handoff modal: 7c calls
    // that modal a light tap on the shoulder rather than an ambush, and a
    // required form hanging off it would make dismissing it cost something.
    //
    // Not awaited into the response's correctness: a failure to raise the task
    // is logged and the handoff still happens. Somebody standing in front of an
    // application form should not be stopped by a question we wanted to ask.
    await raisePostingQuestions(job, session.user.id, application.id);

    // 8.5's invite marker, if this person was invited to this posting. Same
    // shape as the line above and for the same reason: it is a marker on
    // somebody else's row, it cannot be allowed to stop the handoff, and this
    // is the one place in the build that knows an invite led somewhere. Nothing
    // else ever moves an invite to applied.
    await markInviteApplied(jobId, session.user.id);

    // Counted on the way out rather than on a failure, like the report bucket:
    // what is worth bounding is how many handoffs one account can start in an
    // hour, not how many times it guessed something wrong.
    await recordFailures('apply', subjects, LIMITS.apply);

    return ok(
      res,
      {
        analytics_id: event.id,
        // The one place in this build where a form URL crosses the wire, and
        // only ever to the session it was built for.
        form_url: buildFormUrl(form.url, form.prefill, session.user),
        job: { id: job.id, title: job.title },
        application: await publicApplication(
          { ...application, job_id: jobId },
          null
        ),
      },
      { status: 201 }
    );
  } catch (cause) {
    return failInternal(res, cause, 'application start');
  }
}

/**
 * A refusal the client can render in the reader's own language.
 *
 * The reason is a stable code in details rather than a distinct error code,
 * because every one of these is the same kind of answer to the client, "you
 * cannot apply, here is why", and the wording belongs in the dictionary rather
 * than in this file.
 */
function refuse(res, reason, extra = {}) {
  return fail(res, ERR.CONFLICT, MESSAGES[reason] ?? 'This role is not accepting applications.', {
    details: { reason, ...extra },
  });
}

// English, like every message from this API. The client prefers its own
// translated string keyed on the reason and falls back to these, which is why
// they are written as sentences a person could read rather than as codes.
const MESSAGES = Object.freeze({
  [REFUSAL.NOT_OPEN]: 'This role is not accepting applications.',
  [REFUSAL.EXPIRED]: 'Applications for this role have closed.',
  [REFUSAL.APPLICATIONS_CLOSED]: 'Applications are paused across the site at the moment.',
  [REFUSAL.NO_FORM]: 'This role has no application form set up yet.',
  [REFUSAL.COOLDOWN]: 'You have already applied for this role recently.',
  [REFUSAL.PENDING]:
    'You have an unanswered question about your last application to this role.',
  // No date, deliberately. This is the one refusal that does not end.
  [REFUSAL.ACCEPTED]: 'You have already been accepted for this role.',
});
