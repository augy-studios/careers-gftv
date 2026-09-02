// POST /api/auth/applicant/verify-2fa
//
// The applicant realm's second step, added with passkeys in phase 2. It is the
// same shape as the staff endpoint in 5a, which is deliberate: two realms with
// two different flows would be two things to get right.
//
//   { action: "options" }   returns the options for navigator.credentials.get
//   { action: "passkey" }   sends the assertion back
//   { code: "483920" }      the six digit code from Telegram
//   { code: "k7m2-9xqp" }   a 2FA backup code instead
//
// **One field takes both kinds of code**, which 7g asks for in as many words:
// "A code from gftvjobs_2fa_backup_codes is accepted at this step in place of a
// Telegram code." One box rather than two, because somebody who cannot reach
// their phone is already having a bad enough minute without also having to work
// out which of two identical looking fields their fallback belongs in. The
// shapes cannot collide — six digits against two groups of letters and digits
// with a hyphen — so the endpoint tries the Telegram code first and the backup
// set second, and either answer is a pass.
//
// The challenge token from the password step authorises all three. Without a
// valid unexpired one, a perfectly good passkey assertion is worth nothing
// here, which is what stops the second factor from becoming a way past the
// first.
//
// Backup codes come from gftvjobs_2fa_backup_codes and only from there. A code
// out of gftvjobs_recovery_codes must never satisfy this endpoint: that set
// gets past the password, and letting it also get past the second factor would
// collapse the two into one, which 5c separates them precisely to avoid.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { supabase, T } from '../../_lib/supabase.js';
import { consumeCode, codeCounts, codesLow } from '../../_lib/accounts.js';
import { verifyAgainstNothing } from '../../_lib/password.js';
import { verifyLoginCode, spendOutstandingCodes } from '../../_lib/telegram.js';
import { clearCookie, COOKIE } from '../../_lib/cookies.js';
import { startAuthentication, finishAuthentication } from '../../_lib/webauthn.js';
import {
  createApplicantSession,
  trustApplicantDevice,
  deviceLabel,
  publicApplicant,
} from '../../_lib/session.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForIdentifier,
} from '../../_lib/rate-limit.js';

const GENERIC = 'That was not right. Try again.';
const EXPIRED = 'That sign in has expired. Start again.';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = await readJson(req, res);
  if (!body) return;

  const token = typeof body.challenge === 'string' ? body.challenge : '';
  if (token === '') return fail(res, ERR.UNAUTHORISED, EXPIRED);

  const subjects = [subjectForIp(req), subjectForIdentifier(token)];
  if (await limited(res, 'applicant_2fa', subjects)) return;

  try {
    const { data: challenge, error } = await supabase
      .from(T.loginChallenges)
      .select(
        `id, user_id, stay_signed_in, expires_at,
         user:${T.users} ( id, username, display_name, email, avatar_url, phone, locale, totp_secret, is_active, must_change_password, created_at )`
      )
      .eq('token', token)
      .maybeSingle();

    if (error) return failInternal(res, error, 'applicant verify-2fa lookup');

    const expired =
      challenge && new Date(challenge.expires_at).getTime() <= Date.now();

    if (!challenge || !challenge.user || expired) {
      if (expired) {
        await supabase.from(T.loginChallenges).delete().eq('id', challenge.id);
      }
      await recordFailures('applicant_2fa', subjects, LIMITS.twoFactor);
      return fail(res, ERR.UNAUTHORISED, EXPIRED, {
        details: { reason: 'challenge_expired' },
      });
    }

    const user = challenge.user;

    if (user.is_active === false) {
      await supabase.from(T.loginChallenges).delete().eq('id', challenge.id);
      return fail(res, ERR.FORBIDDEN, 'That account has been deactivated.');
    }

    // Asking for the options is not an attempt at anything, so it neither
    // consumes the challenge nor counts against the limiter.
    if (body.action === 'options') {
      const options = await startAuthentication({
        realm: 'applicant',
        userId: user.id,
        loginToken: token,
      });

      if (!options) {
        return fail(res, ERR.BAD_REQUEST, 'There is no passkey on this account.');
      }

      return ok(res, { options });
    }

    let verified = false;
    let usedBackupCode = false;

    if (body.action === 'passkey') {
      const result = await finishAuthentication({
        realm: 'applicant',
        userId: user.id,
        response: body.response,
        loginToken: token,
      });
      verified = result.ok;
    } else if (typeof body.code === 'string' && body.code !== '') {
      // Six digits is a Telegram code and anything else is a backup code, but
      // the branch is on what matched rather than on what it looked like: a
      // backup code that happens to normalise to six characters is still tried
      // against its own set, and a Telegram code is never compared against ten
      // bcrypt rows it could not possibly match.
      verified = await verifyLoginCode(user.id, body.code);

      if (!verified) {
        verified = await consumeCode('applicant', user.id, 'backup', body.code);
        usedBackupCode = verified;
      }
    } else {
      await verifyAgainstNothing('');
    }

    if (!verified) {
      await recordFailures('applicant_2fa', subjects, LIMITS.twoFactor);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    // The challenge goes first, so a replay of this request cannot ride a
    // second assertion through.
    await supabase.from(T.loginChallenges).delete().eq('id', challenge.id);
    await clearAll('applicant_2fa', subjects);

    // Whatever satisfied the step, the pushed code and the one tap link that
    // came with it are finished. A passkey sign in would otherwise leave both
    // live in a chat window for the rest of their five minutes, for a sign in
    // that has already happened. A failure here is logged rather than thrown:
    // this person is through, and refusing them at this point would be the
    // tidy-up taking the sign in down with it.
    try {
      await spendOutstandingCodes(user.id);
    } catch (cause) {
      console.error('[careers-gftv] verify-2fa spend codes:', cause);
    }
    clearCookie(res, COOKIE.magicLinkNonce);

    // 5d: offered only now, never on the password screen. The label is the
    // coarse one from the user agent, and it rides back in the response so the
    // page can offer it as the starting point for a nickname rather than asking
    // somebody to name a device from an empty box. A failed insert is not a
    // trusted device: `device_trusted` follows what the write actually did.
    let deviceTrusted = false;
    let trustedLabel = null;

    if (body.trust_device === true) {
      trustedLabel = deviceLabel(req);
      deviceTrusted = await trustApplicantDevice(res, user.id, trustedLabel);
      if (!deviceTrusted) trustedLabel = null;
    }

    await createApplicantSession(res, user.id, challenge.stay_signed_in === true);

    const counts = await codeCounts('applicant', user.id);

    return ok(res, {
      user: publicApplicant(user),
      used_backup_code: usedBackupCode,
      device_trusted: deviceTrusted,
      device_label: trustedLabel,
      codes: counts,
      codes_low: codesLow(counts.backup),
    });
  } catch (cause) {
    return failInternal(res, cause, 'applicant verify-2fa');
  }
}
