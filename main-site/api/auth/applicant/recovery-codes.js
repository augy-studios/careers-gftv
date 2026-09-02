// GET  /api/auth/applicant/recovery-codes   how many are left in each set
// POST /api/auth/applicant/recovery-codes   generate one set, shown once
//
// Section 5c. Two separate sets that never do each other's job:
//
//   recovery  gets past the password, on the forgot password flow. A full
//             account credential.
//   backup    gets past the second factor only, once Telegram 2FA ships in
//             phase 11.
//
// Generating either one requires the current password. Regenerating a set
// invalidates every remaining code in that set and only that set, which is
// enforced by them being two tables rather than one with a purpose column.
//
// The codes come back in this response and are never recoverable afterwards.
// Nothing logs them, nothing stores them in the clear, and the client is
// responsible for the copy, the download, and the "I have saved these"
// checkbox that 5c asks for.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireApplicant } from '../../_lib/session.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';
import { FIELD } from '../../_lib/validate.js';
import {
  generateCodeSet,
  codeCounts,
  verifyRealmPassword,
  isCodeSet,
  CODES_PER_SET,
  LOW_CODE_WARNING,
  codesLow,
} from '../../_lib/accounts.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const counts = await codeCounts('applicant', session.user.id);
      return ok(res, {
        codes: counts,
        codes_low: codesLow(counts.recovery),
        low_code_threshold: LOW_CODE_WARNING,
        codes_per_set: CODES_PER_SET,
      });
    }

    const body = await readJson(req, res);
    if (!body) return;

    const which = String(body.set ?? 'recovery');
    if (!isCodeSet('applicant', which)) {
      return fail(res, ERR.BAD_REQUEST, 'That is not a set of codes this site has.', {
        details: { set: FIELD.INVALID },
      });
    }

    const subjects = [subjectForIp(req), subjectForUser('applicant', session.user.id)];
    if (await limited(res, 'code_generation', subjects)) return;

    const correct = await verifyRealmPassword('applicant', session.user.id, body.current_password);
    if (!correct) {
      await recordFailures('code_generation', subjects, LIMITS.codeGeneration);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    const codes = await generateCodeSet('applicant', session.user.id, which);

    await auditApplicant(session.user, AUDIT.RECOVERY_CODES_GENERATED, { set: which });

    return ok(res, {
      set: which,
      codes,
      counts: await codeCounts('applicant', session.user.id),
      // Repeated in the response as well as on screen, per 5c: there is no
      // email in this build, so these are the only self serve way back in.
      shown_once: true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'recovery codes');
  }
}
