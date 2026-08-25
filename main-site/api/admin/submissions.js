// /api/admin/submissions
//
// Section 13 step 6's unmatched list, and the manual link from its fallbacks:
// "Add an admin action to manually mark a tracking row as submitted, for the
// unmatched-email case."
//
//   GET               submissions that matched no account, newest first
//   GET ?job=<uuid>   the same, for one posting
//   POST { action: 'link', submission_id, applicant_id }
//
// **Why this is not part of api/admin/analytics.js**, which is where the list
// is drawn. That route opens by saying it has no POST, because nothing on the
// analytics page changes anything, and it is right: a funnel is a question and
// not a decision. Linking a submission to an account *is* a decision — it moves
// somebody's tracking row to submitted and starts their reapply cooldown — so
// it goes in its own action based route rather than turning a read-only
// endpoint into a mixed one. The page reads two endpoints, which is cheaper
// than the answer to "why does the analytics route write".
//
// **Admins only, unlike the analytics page beside it.** 8.4 is deliberately
// open to job posters, and the reason it is safe to be is stated in that file:
// the funnel is counts, and nothing on the page names an applicant. This list
// breaks exactly that property — every row is a real person's email address,
// typed into a form. api/admin/stats.js already refuses to put an email on a
// page a job poster can see, and that reasoning does not stop applying because
// the email arrived from Google.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireAdmin, isUuid, params } from '../_lib/admin.js';
import { unavailable } from '../_lib/maintenance.js';
import { auditStaff, AUDIT } from '../_lib/audit.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import { unmatchedSubmissions, linkSubmission } from '../_lib/form-submissions.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireAdmin(req, res);
  if (!session) return;

  // The same feature key the webhook is guarded by. Switching form_webhook off
  // stops deliveries arriving; it should also stop this page offering to act on
  // what is already here, because the reason an admin switched it off is that
  // something about the form path is wrong.
  if (await unavailable(res, 'form_webhook')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await link(req, res, session);

    const search = params(req);
    const jobId = search.get('job');

    if (jobId && !isUuid(jobId)) {
      return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');
    }

    return ok(res, { unmatched: await unmatchedSubmissions({ jobId }) });
  } catch (cause) {
    return failInternal(res, cause, 'admin submissions');
  }
}

/**
 * Attach an unmatched submission to an account by hand.
 *
 * The reason this exists at all is the ordinary one section 13 names: somebody
 * applied with a different address than they registered with. It is not an
 * error state and the row is not suspect — the submission happened, and the
 * only thing missing is which account it belongs to.
 *
 * Audited, and that is not the default for this build: phase 7 settled that
 * ordinary dashboard editing is not an audit event. This is not ordinary
 * editing. An admin is asserting that two different email addresses are the
 * same person, on the strength of their own judgement, and the consequence is
 * that somebody's application is recorded as submitted and their reapply
 * cooldown starts. If that judgement is ever wrong, the log is the only thing
 * that says who made it.
 */
async function link(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  if (String(body.action ?? '') !== 'link') {
    return fail(res, ERR.BAD_REQUEST, 'That is not an action this endpoint takes.');
  }

  const submissionId = String(body.submission_id ?? '');
  const applicantId = String(body.applicant_id ?? '');

  const details = {};
  if (!isUuid(submissionId)) details.submission_id = 'invalid';
  if (!isUuid(applicantId)) details.applicant_id = 'invalid';

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That link could not be made.', { details });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;

  const result = await linkSubmission(submissionId, applicantId);

  if (!result.ok) {
    const message =
      result.reason === 'already_matched'
        ? 'That submission is already linked to an account.'
        : result.reason === 'no_such_applicant'
          ? 'That applicant account could not be found.'
          : 'That submission could not be found.';

    return fail(res, result.reason === 'already_matched' ? ERR.CONFLICT : ERR.NOT_FOUND, message);
  }

  await auditStaff(
    session.user,
    AUDIT.SUBMISSION_LINKED,
    {
      // The address as submitted, because that is the fact being asserted about:
      // an admin decided this address belongs to this account. Without it the
      // row records a decision with the evidence left out.
      email: result.submission.email,
      job_id: result.submission.job_id,
      applicant_id: applicantId,
      overrode: result.confirmation.overrode,
      application_status: result.confirmation.application_status,
      application_created: result.confirmation.application_created,
      cooldown_kept: result.confirmation.cooldown_kept,
    },
    { targetTable: 'gftvjobs_form_submissions', targetId: submissionId }
  );

  await recordFailures('admin', subjects, LIMITS.admin);

  return ok(res, {
    linked: true,
    overrode: result.confirmation.overrode,
    application_status: result.confirmation.application_status,
  });
}
