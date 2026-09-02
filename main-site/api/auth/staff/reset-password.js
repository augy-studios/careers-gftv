// POST /api/auth/staff/reset-password
//
// Step 3 of 5g, the half that sets the password. forgot-password proved who
// somebody is and issued a ticket; this spends it.
//
// **This is the write section 2 names as its first exception**, and 5g says
// what it costs in a sentence this route repeats to its caller: "A staff
// password reset performed here changes the password at gftv.asia too, because
// it is one account. The confirmation screen must say that in those words. An
// admin who thinks they are resetting a careers portal password and finds
// themselves locked out of the main portal will not thank anybody."
//
// What it does, in 5c step 3's order, which 5g inherits whole:
//
//   consume the recovery code       single use, the row deleted and not flagged
//   invalidate every session        on both sites, per 5h
//   revoke every trusted device     per 5d, and the table is shared
//   write the audit row             before the password write, per 5g
//
// **And two things it deliberately does not do.** It does not sign anybody in,
// which is where it parts company with the applicant flow: that one hands
// somebody a session because there is nothing else standing between them and
// their dashboard, and this one is a staff account behind a second factor that
// has just had every session and every trusted device on it ended. Signing in
// again, second factor and all, is the point. And it notifies nothing, because
// this project has no email -- which is exactly why 5g calls the audit row not
// optional.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { checkPasswordStrength } from '../../_lib/password.js';
import { deleteCode, codeCounts, codesLow, LOW_CODE_WARNING } from '../../_lib/accounts.js';
import { sha256, timingSafeEqualStr } from '../../_lib/tokens.js';
import { COOKIE, readCookie, clearCookie } from '../../_lib/cookies.js';
import { supabase, T } from '../../_lib/supabase.js';
import { revokeAllTrustedDevices } from '../../_lib/session.js';
import { recordAudit, AUDIT } from '../../_lib/audit.js';
import { setStaffPassword, revokeStaffSessions, held } from '../../_lib/staff-account.js';
import { FIELD } from '../../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForIdentifier,
} from '../../_lib/rate-limit.js';

const GENERIC = 'That reset could not be completed. Start again from the beginning.';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // Held as well as forgot-password, and not only because it writes. A ticket
  // outstanding when the hold is lifted has to be spendable, and a ticket
  // issued while it was on cannot exist -- so the two guards are the same
  // guard and neither is redundant.
  if (held(res)) return;

  const body = await readJson(req, res);
  if (!body) return;

  const ticket = typeof body.ticket === 'string' ? body.ticket : '';
  const nonce = readCookie(req, COOKIE.staffResetNonce);

  const subjects = [subjectForIp(req), subjectForIdentifier(ticket)];
  if (await limited(res, 'recovery_code', subjects)) return;

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
      .from(T.staffPasswordResets)
      .select(
        'id, staff_user_id, browser_nonce_hash, recovery_code_id, second_factor_at, expires_at, used_at'
      )
      .eq('ticket_hash', sha256(ticket))
      .maybeSingle();

    if (error) return failInternal(res, error, 'staff reset password lookup');

    // second_factor_at is migration 027's rule, carried into 040 from the start
    // because section 6 said to. A ticket for an account with a passkey or an
    // authenticator app is issued unsatisfied and stays unusable until
    // forgot-password has seen one. Checking it here, at the point the password
    // is actually set, is what makes the second factor unskippable rather than
    // a screen somebody can navigate around.
    const unusable =
      !reset ||
      reset.used_at !== null ||
      reset.second_factor_at === null ||
      new Date(reset.expires_at).getTime() <= Date.now() ||
      !timingSafeEqualStr(reset.browser_nonce_hash, sha256(nonce));

    if (unusable) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      clearCookie(res, COOKIE.staffResetNonce);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    // The username, for the audit row. Read before the write rather than after
    // it, so the row can name the account whatever the write does next.
    const { data: account } = await supabase
      .from(T.staffUsers)
      .select('id, username')
      .eq('id', reset.staff_user_id)
      .maybeSingle();

    // **Before the password write, per 5g: "Every reset writes an audit row
    // before it executes, naming the account, the time, and which site it came
    // from, and notifies nothing, because this project has no email. That audit
    // row is the only trace, so it is not optional."**
    //
    // recordAudit directly rather than auditStaff, because there is no session
    // here: the actor is the account being reset, established by a recovery
    // code and a second factor and nothing else. The site stamp is audit.js's
    // own and arrives without being asked for.
    await recordAudit({
      realm: 'staff',
      actorId: reset.staff_user_id,
      actorLabel: account?.username ?? null,
      action: AUDIT.STAFF_PASSWORD_RESET,
      targetTable: T.staffUsers,
      targetId: reset.staff_user_id,
      reason: 'Staff account recovery code, per 5g.',
      metadata: {
        via: 'recovery_code',
        reaches: 'gftvhello_users.password_hash',
        sessions_invalidated: true,
        trusted_devices_revoked: true,
      },
    });

    const written = await setStaffPassword(reset.staff_user_id, body.password);
    if (!written) return fail(res, ERR.SERVER_ERROR, 'That could not be saved. Try again.');

    // Marked used before the code is consumed, because consuming the code
    // cascades this row away and the marking would then have nothing to write
    // to. Either way the ticket cannot be presented twice.
    await supabase
      .from(T.staffPasswordResets)
      .update({ used_at: new Date().toISOString() })
      .eq('id', reset.id);

    if (reset.recovery_code_id) await deleteCode('staff', 'recovery', reset.recovery_code_id);

    // Both sites, and every device. 5c step 3 asks for both, and 5h is why the
    // first one has to name two tables.
    await revokeStaffSessions(reset.staff_user_id);
    await revokeAllTrustedDevices('staff', reset.staff_user_id);

    clearCookie(res, COOKIE.staffResetNonce);

    const counts = await codeCounts('staff', reset.staff_user_id);

    return ok(res, {
      reset: true,
      // Never. See the header: this account signs in again, second factor and
      // all, which is the difference between this flow and the applicant one.
      signed_in: false,
      username: account?.username ?? null,
      codes: counts,
      // 5c step 4: "If the account has fewer than three recovery codes left
      // afterwards, push them straight to regenerate." The sign in page is
      // where that push lands, because there is no session to put them behind.
      codes_low: codesLow(counts.recovery),
      low_code_threshold: LOW_CODE_WARNING,
      reaches_gftv_asia: true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff reset password');
  }
}
