// GET /api/auth/applicant/session
//
// Who, if anyone, is signed in as an applicant in this browser. Every page
// with a header calls it once to decide whether to show "Sign in" or the
// account menu.
//
// Answers 200 with a null user rather than 401 when nobody is signed in. Being
// signed out is a normal state for a public job board, not a failure, and a
// 401 in the console on every anonymous page view would train everyone to
// ignore them.

import { ok, methodNotAllowed, failInternal } from '../../_lib/respond.js';
import { getApplicantSession, publicApplicant } from '../../_lib/session.js';
import { codeCounts, codesLow, LOW_CODE_WARNING } from '../../_lib/accounts.js';
import { hasPasskeys } from '../../_lib/webauthn.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  try {
    const session = await getApplicantSession(req);

    if (!session) {
      return ok(res, { user: null });
    }

    const [codes, secondFactor] = await Promise.all([
      codeCounts('applicant', session.user.id),
      hasPasskeys('applicant', session.user.id),
    ]);

    return ok(res, {
      user: publicApplicant(session.user),
      expires_at: session.expiresAt ?? null,
      // A count in gftvjobs_passkeys, not a column on the user row. The
      // totp_secret column exists for a factor this realm never used.
      two_factor_enabled: secondFactor,
      codes,
      // 5c: "a warning below three and a prompt to regenerate". The threshold
      // travels with the counts so the client does not hardcode it.
      codes_low: codesLow(codes.recovery),
      low_code_threshold: LOW_CODE_WARNING,
    });
  } catch (cause) {
    return failInternal(res, cause, 'applicant session');
  }
}
