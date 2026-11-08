// POST /api/auth/staff/verify-2fa
//
// Steps 6 and 7 of 5a. The browser posts the challenge token from the password
// step plus one of three things.
//
//   Passkey      a WebAuthn assertion against gftvjobs_staff_passkeys, added
//                in phase 2. Two requests: { action: "options" } for the
//                challenge, then { action: "passkey" } with the assertion.
//   TOTP         verified against gftvhello_users.totp_secret with one step
//                either side, per 5a.
//   Backup code  verified against gftvhello_backup_codes by bcrypt, and the
//                matching row is deleted on use. Single use, always.
//
// On success the challenge row is deleted, a trusted device row is written if
// the box was ticked, and only then is a session issued. The challenge row is
// the authorisation to be here: without a valid unexpired one, a correct code
// is worth nothing.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifyTotp, hasTotp } from '../../_lib/totp.js';
import { startAuthentication, finishAuthentication } from '../../_lib/webauthn.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { findMatchingCode, verifyAgainstNothing } from '../../_lib/password.js';
import { supabase, TABLES } from '../../_lib/supabase.js';
import {
  HELLO,
  createStaffSession,
  hasPortalAccess,
  trustStaffDevice,
  deviceLabel,
  publicStaff,
} from '../../_lib/session.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForIdentifier,
} from '../../_lib/rate-limit.js';

const GENERIC = 'That code was not right.';

/**
 * Finish a staff sign in with the second factor. Spends the challenge from the
 * password step first, so it cannot be replayed, then checks the passkey,
 * authenticator code or backup code, and only then creates the session and,
 * when asked, remembers the device.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  let challenge;

  if (typeof body.challenge === 'string') {
    challenge = body.challenge;
  } else {
    challenge = '';
  }

  let code;

  if (typeof body.code === 'string') {
    code = body.code;
  } else {
    code = '';
  }

  const isPasskey = body.action === 'options' || body.action === 'passkey';

  if (challenge === '' || (code === '' && !isPasskey)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, GENERIC);
  }

  const subjects = [subjectForIp(request), subjectForIdentifier(challenge)];
  if (await limited(response, 'staff_2fa', subjects)) return;

  try {
    const { data: row, error } = await supabase
      .from(TABLES.staffTotpChallenges)
      .select(
        `${HELLO.challenges.userId}, ${HELLO.challenges.expiresAt},
         user:${TABLES.staffUsers} ( id, username, is_approved, is_admin, is_editor, totp_secret )`
      )
      .eq(HELLO.challenges.token, challenge)
      .maybeSingle();

    if (error) return failInternal(response, error, 'verify 2fa lookup');

    const user = row?.user ?? null;
    const expired = row && new Date(row[HELLO.challenges.expiresAt]).getTime() <= Date.now();

    if (!row || !user || expired) {
      if (expired) {
        await supabase
          .from(TABLES.staffTotpChallenges)
          .delete()
          .eq(HELLO.challenges.token, challenge);
      }
      await verifyAgainstNothing(code);
      await recordFailures('staff_2fa', subjects, LIMITS.twoFactor);
      // The reason is carried as a code rather than only in the sentence, so
      // the page can send them back to the password step in their own
      // language instead of leaving them retyping codes at a challenge that no
      // longer exists.
      return fail(response, ERROR_CODES.UNAUTHORISED, 'That sign in has expired. Start again.', {
        details: { reason: 'challenge_expired' },
      });
    }

    // Re-checked here rather than trusted from the password step, since access
    // could have been revoked in between and section 8 requires the rule to be
    // applied on every request that grants anything.
    if (user.is_approved !== true || !(await hasPortalAccess(user))) {
      await supabase
        .from(TABLES.staffTotpChallenges)
        .delete()
        .eq(HELLO.challenges.token, challenge);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    // Asking for the passkey options is not an attempt at anything, so it
    // neither consumes the challenge nor counts against the limiter.
    if (body.action === 'options') {
      const options = await startAuthentication({
        realm: 'staff',
        userId: user.id,
        loginToken: challenge,
      });

      if (!options) {
        return fail(response, ERROR_CODES.BAD_REQUEST, 'There is no passkey on this account.');
      }

      return ok(response, { options });
    }

    const digits = code.replace(/\D/g, '');
    let verified = false;
    let usedBackupCode = false;

    if (body.action === 'passkey') {
      const result = await finishAuthentication({
        realm: 'staff',
        userId: user.id,
        response: body.response,
        loginToken: challenge,
      });
      verified = result.ok;
    }

    // A six digit input is tried as a TOTP code. Anything else can only be a
    // backup code, which is formatted k7m2-9xqp and never all digits.
    if (!verified && !isPasskey && digits.length === 6 && hasTotp(user.totp_secret)) {
      verified = verifyTotp(digits, user.totp_secret);
    }

    if (!verified && !isPasskey) {
      const { data: codes, error: codesError } = await supabase
        .from(TABLES.staffBackupCodes)
        .select(`${HELLO.backupCodes.id}, ${HELLO.backupCodes.codeHash}`)
        .eq(HELLO.backupCodes.userId, user.id);

      if (codesError) return failInternal(response, codesError, 'verify 2fa backup codes');

      const rows = (codes ?? []).map((storedCode) => ({
        id: storedCode[HELLO.backupCodes.id],
        code_hash: storedCode[HELLO.backupCodes.codeHash],
      }));

      let matchedId = null;
      if (rows.length > 0) {
        matchedId = await findMatchingCode(code, rows);
      } else {
        // An account with no backup codes pays for one comparison anyway, so
        // it does not answer faster than one with ten.
        await verifyAgainstNothing(code);
      }

      if (matchedId) {
        // Deleted on use, per 5a step 6. Single use only, and the delete has to
        // succeed before the code counts as spent.
        const { error: deleteError } = await supabase
          .from(TABLES.staffBackupCodes)
          .delete()
          .eq(HELLO.backupCodes.id, matchedId);

        if (deleteError) return failInternal(response, deleteError, 'verify 2fa consume');

        verified = true;
        usedBackupCode = true;
      }
    }

    if (!verified) {
      await recordFailures('staff_2fa', subjects, LIMITS.twoFactor);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    // Step 7, in order: the challenge goes first, so a replay of this request
    // cannot ride a second code through.
    await supabase.from(TABLES.staffTotpChallenges).delete().eq(HELLO.challenges.token, challenge);

    await clearAll('staff_2fa', subjects);

    if (body.trust_device === true) {
      await trustStaffDevice(response, user.id, deviceLabel(request));
    }

    await createStaffSession(response, user.id, body.stay_signed_in === true);

    let secondFactor;

    if (body.action === 'passkey') {
      secondFactor = 'passkey';
    } else if (usedBackupCode) {
      secondFactor = 'backup_code';
    } else {
      secondFactor = 'totp';
    }

    await auditStaff(user, AUDIT.STAFF_SIGNED_IN, {
      second_factor: secondFactor,
      device_trusted: body.trust_device === true,
      stay_signed_in: body.stay_signed_in === true,
    });

    return ok(response, {
      user: publicStaff(user),
      used_backup_code: usedBackupCode,
      device_trusted: body.trust_device === true,
    });
  } catch (cause) {
    return failInternal(response, cause, 'verify 2fa');
  }
}
