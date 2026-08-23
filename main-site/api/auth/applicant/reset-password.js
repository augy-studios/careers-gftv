// POST /api/auth/applicant/reset-password
//
// The last step of 5c. Consumes the ticket from forgot-password and sets the
// new password.
//
// It never verifies anything about who the person is. The ticket is the proof,
// forgot-password is what issues it, and an account with a passkey does not
// get a usable one until that passkey or a 2FA backup code has been seen. See
// migration 027 for why that changed.
//
// On success, and in this order:
//
//   1. The new password is written.
//   2. The ticket is marked used.
//   3. The recovery code is consumed, which by the cascade in migration 024
//      also removes any other ticket issued against it.
//   4. Every session for the account is invalidated.
//   5. Every trusted device is revoked.
//
// Then a fresh 12 hour session is issued for this browser. Signing the person
// straight in is deliberate: 5c step 4 says that somebody left with fewer than
// three codes is pushed straight to regenerate, and they cannot regenerate
// while signed out. They have just proved they hold a recovery code, which is
// a full account credential by definition.
//
// The Telegram message 5c asks for on a password change belongs to phase 11.
// Nothing here fakes it.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { hashSecret, checkPasswordStrength } from '../../_lib/password.js';
import { FIELD } from '../../_lib/validate.js';
import { deleteCode, codeCounts, LOW_CODE_WARNING } from '../../_lib/accounts.js';
import { sha256, timingSafeEqualStr } from '../../_lib/tokens.js';
import { COOKIE, readCookie, clearCookie } from '../../_lib/cookies.js';
import { supabase, T } from '../../_lib/supabase.js';
import {
  createApplicantSession,
  invalidateAllSessions,
  revokeAllTrustedDevices,
  publicApplicant,
} from '../../_lib/session.js';
import { LIMITS, limited, recordFailures, subjectForIp } from '../../_lib/rate-limit.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';

const GENERIC = 'That reset could not be completed. Start again from the beginning.';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = await readJson(req, res);
  if (!body) return;

  const subjects = [subjectForIp(req)];
  if (await limited(res, 'recovery_code', subjects)) return;

  const ticket = typeof body.ticket === 'string' ? body.ticket : '';
  const nonce = readCookie(req, COOKIE.resetNonce);

  if (ticket === '' || !nonce) {
    return fail(res, ERR.UNAUTHORISED, GENERIC);
  }

  const strength = checkPasswordStrength(body.password);
  const details = {};
  if (!strength.ok) details.password = strength.code;
  if (typeof body.password_confirm !== 'string' || body.password_confirm !== body.password) {
    details.password_confirm = FIELD.MISMATCH;
  }
  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That new password could not be used.', { details });
  }

  try {
    const { data: reset, error } = await supabase
      .from(T.passwordResets)
      .select(
        'id, user_id, browser_nonce_hash, recovery_code_id, second_factor_at, expires_at, used_at'
      )
      .eq('ticket_hash', sha256(ticket))
      .maybeSingle();

    if (error) return failInternal(res, error, 'reset password lookup');

    // second_factor_at is the whole point of migration 027. A ticket for an
    // account with a passkey is issued unsatisfied, and stays unusable until
    // forgot-password has seen the passkey or a 2FA backup code. Checking it
    // here, at the point the password is actually set, is what makes the
    // second factor unskippable rather than a screen somebody can navigate
    // around.
    const unusable =
      !reset ||
      reset.used_at !== null ||
      reset.second_factor_at === null ||
      new Date(reset.expires_at).getTime() <= Date.now() ||
      !timingSafeEqualStr(reset.browser_nonce_hash, sha256(nonce));

    if (unusable) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      clearCookie(res, COOKIE.resetNonce);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    const { data: user, error: updateError } = await supabase
      .from(T.users)
      .update({
        password_hash: await hashSecret(body.password),
        // 8.9's forced reset is satisfied here as well as in change-password.
        // Somebody told to set a new password on their next sign in may well
        // arrive through the recovery code path instead, and leaving the flag
        // set would put them back on the reset screen with a password they
        // have just chosen.
        must_change_password: false,
      })
      .eq('id', reset.user_id)
      .select(
        'id, username, display_name, email, avatar_url, phone, locale, totp_secret, is_active, must_change_password, created_at'
      )
      .single();

    if (updateError) return failInternal(res, updateError, 'reset password update');

    // Marked used before the code is consumed, because consuming the code
    // cascades this row away and the marking would then have nothing to write
    // to. Either way the ticket cannot be presented twice.
    await supabase
      .from(T.passwordResets)
      .update({ used_at: new Date().toISOString() })
      .eq('id', reset.id);

    if (reset.recovery_code_id) await deleteCode('recovery', reset.recovery_code_id);

    await invalidateAllSessions('applicant', reset.user_id);
    await revokeAllTrustedDevices('applicant', reset.user_id);

    // The row that matters most in this table. A password reset by recovery
    // code is the one action in the applicant realm that changes a credential
    // without the old credential, so it leaves a record whatever else happens.
    await auditApplicant(user, AUDIT.PASSWORD_RESET, {
      via: 'recovery_code',
      sessions_invalidated: true,
      trusted_devices_revoked: true,
    });

    clearCookie(res, COOKIE.resetNonce);

    const counts = await codeCounts(reset.user_id);

    // Deactivated accounts do not get signed in. The password is still reset,
    // since an admin may be about to reactivate them.
    if (user.is_active === false) {
      return ok(res, { reset: true, signed_in: false, codes: counts });
    }

    await createApplicantSession(res, user.id, false);

    return ok(res, {
      reset: true,
      signed_in: true,
      user: publicApplicant(user),
      codes: counts,
      codes_low: counts.recovery < LOW_CODE_WARNING,
      low_code_threshold: LOW_CODE_WARNING,
    });
  } catch (cause) {
    return failInternal(res, cause, 'reset password');
  }
}
