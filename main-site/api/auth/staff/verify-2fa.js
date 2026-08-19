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

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { verifyTotp, hasTotp } from '../../_lib/totp.js';
import { startAuthentication, finishAuthentication } from '../../_lib/webauthn.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { findMatchingCode, verifyAgainstNothing } from '../../_lib/password.js';
import { supabase, T } from '../../_lib/supabase.js';
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

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = await readJson(req, res);
  if (!body) return;

  const challenge = typeof body.challenge === 'string' ? body.challenge : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const isPasskey = body.action === 'options' || body.action === 'passkey';

  if (challenge === '' || (code === '' && !isPasskey)) {
    return fail(res, ERR.BAD_REQUEST, GENERIC);
  }

  const subjects = [subjectForIp(req), subjectForIdentifier(challenge)];
  if (await limited(res, 'staff_2fa', subjects)) return;

  try {
    const { data: row, error } = await supabase
      .from(T.staffTotpChallenges)
      .select(
        `${HELLO.challenges.userId}, ${HELLO.challenges.expiresAt},
         user:${T.staffUsers} ( id, username, is_approved, is_admin, is_editor, totp_secret )`
      )
      .eq(HELLO.challenges.token, challenge)
      .maybeSingle();

    if (error) return failInternal(res, error, 'verify 2fa lookup');

    const user = row?.user ?? null;
    const expired =
      row && new Date(row[HELLO.challenges.expiresAt]).getTime() <= Date.now();

    if (!row || !user || expired) {
      if (expired) {
        await supabase
          .from(T.staffTotpChallenges)
          .delete()
          .eq(HELLO.challenges.token, challenge);
      }
      await verifyAgainstNothing(code);
      await recordFailures('staff_2fa', subjects, LIMITS.twoFactor);
      // The reason is carried as a code rather than only in the sentence, so
      // the page can send them back to the password step in their own
      // language instead of leaving them retyping codes at a challenge that no
      // longer exists.
      return fail(res, ERR.UNAUTHORISED, 'That sign in has expired. Start again.', {
        details: { reason: 'challenge_expired' },
      });
    }

    // Re-checked here rather than trusted from the password step, since access
    // could have been revoked in between and section 8 requires the rule to be
    // applied on every request that grants anything.
    if (user.is_approved !== true || !(await hasPortalAccess(user))) {
      await supabase
        .from(T.staffTotpChallenges)
        .delete()
        .eq(HELLO.challenges.token, challenge);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
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
        return fail(res, ERR.BAD_REQUEST, 'There is no passkey on this account.');
      }

      return ok(res, { options });
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
        .from(T.staffBackupCodes)
        .select(`${HELLO.backupCodes.id}, ${HELLO.backupCodes.codeHash}`)
        .eq(HELLO.backupCodes.userId, user.id);

      if (codesError) return failInternal(res, codesError, 'verify 2fa backup codes');

      const rows = (codes ?? []).map((c) => ({
        id: c[HELLO.backupCodes.id],
        code_hash: c[HELLO.backupCodes.codeHash],
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
          .from(T.staffBackupCodes)
          .delete()
          .eq(HELLO.backupCodes.id, matchedId);

        if (deleteError) return failInternal(res, deleteError, 'verify 2fa consume');

        verified = true;
        usedBackupCode = true;
      }
    }

    if (!verified) {
      await recordFailures('staff_2fa', subjects, LIMITS.twoFactor);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    // Step 7, in order: the challenge goes first, so a replay of this request
    // cannot ride a second code through.
    await supabase
      .from(T.staffTotpChallenges)
      .delete()
      .eq(HELLO.challenges.token, challenge);

    await clearAll('staff_2fa', subjects);

    if (body.trust_device === true) {
      await trustStaffDevice(res, user.id, deviceLabel(req));
    }

    await createStaffSession(res, user.id, body.stay_signed_in === true);

    await auditStaff(user, AUDIT.STAFF_SIGNED_IN, {
      second_factor: body.action === 'passkey'
        ? 'passkey'
        : usedBackupCode
          ? 'backup_code'
          : 'totp',
      device_trusted: body.trust_device === true,
      stay_signed_in: body.stay_signed_in === true,
    });

    return ok(res, {
      user: publicStaff(user),
      used_backup_code: usedBackupCode,
      device_trusted: body.trust_device === true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'verify 2fa');
  }
}
