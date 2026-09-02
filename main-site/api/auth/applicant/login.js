// POST /api/auth/applicant/login
//
// Section 5b. Username or email, plus password. No approval check.
//
// A second step, when the account has a passkey or has switched Telegram 2FA
// on. Passkeys were added to this realm during phase 2 and were the only second
// factor it had; phase 11 part 3 finished the Telegram half that phase 2 left
// deliberately disabled. The totp_secret column stays unused throughout.
//
// An account with neither signs in exactly as it did before, in one step.
// Nobody is forced into a second factor they did not set up.
//
// **The two factors sit side by side and never replace each other.** Somebody
// with a passkey who then switches Telegram 2FA on is offered both, and either
// satisfies the step. Making one supersede the other would mean an account
// losing a factor it set up, silently, because it set up a second one.
//
// **Asking for the code is a write and it happens here, not on the client.**
// The row is written before this responds, so the browser being closed between
// the two steps cannot leave a code nobody asked for. The site does not wait
// for a Telegram send: it writes the request and returns, per section 15.
//
// **This route deliberately does not consult the `telegram_2fa` switch.** Every
// other route touching this feature does, and the difference is what refusing
// would mean here: not a control that says come back later, but an account that
// asked for two steps being either let through on one or locked out of a
// password it typed correctly. The switch still bites where it can afford to —
// the one tap link is refused on the way back in, and the code is on screen
// beside it.
//
// Section 9: "Generic error text on failed login so the response does not
// reveal whether a username exists." Every failure below answers with the same
// sentence and the same status, and an unknown account still pays for a bcrypt
// comparison so it does not answer faster than a wrong password does.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { verifySecret, verifyAgainstNothing } from '../../_lib/password.js';
import { findApplicantByIdentifier, codeCounts } from '../../_lib/accounts.js';
import {
  createApplicantSession,
  useApplicantTrustedDevice,
  publicApplicant,
  CHALLENGE_MINUTES,
} from '../../_lib/session.js';
import { hasPasskeys } from '../../_lib/webauthn.js';
import { linkState, requestLoginCode, CODE_TTL_MS } from '../../_lib/telegram.js';
import { randomToken } from '../../_lib/tokens.js';
import { setCookie, COOKIE } from '../../_lib/cookies.js';
import { supabase, T } from '../../_lib/supabase.js';
import { validateLocale } from '../../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForIdentifier,
  subjectForUser,
} from '../../_lib/rate-limit.js';

const GENERIC = 'That username or password was not right.';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = await readJson(req, res);
  if (!body) return;

  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (identifier === '' || password === '') {
    return fail(res, ERR.BAD_REQUEST, GENERIC);
  }

  // Per IP and per identifier, so neither a spray across accounts from one
  // machine nor a run at one account from many machines is unlimited.
  const subjects = [subjectForIp(req), subjectForIdentifier(identifier)];
  if (await limited(res, 'login', subjects)) return;

  try {
    const user = await findApplicantByIdentifier(identifier);

    if (!user) {
      await verifyAgainstNothing(password);
      await recordFailures('login', subjects, LIMITS.login);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    const correct = await verifySecret(password, user.password_hash);
    if (!correct) {
      await recordFailures(
        'login',
        [...subjects, subjectForUser('applicant', user.id)],
        LIMITS.login
      );
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    // Only said once the password is right, so it is not an account oracle.
    // Section 8.9 lets an admin deactivate an account.
    if (user.is_active === false) {
      return fail(
        res,
        ERR.FORBIDDEN,
        'That account has been deactivated. Contact the team if you think that is wrong.'
      );
    }

    await clearAll('login', [...subjects, subjectForUser('applicant', user.id)]);

    // The browser's language is the source of truth for rendering, and the
    // column exists so the Telegram bot knows which language to write in, per
    // 3a. Signing in is one of the moments the two can be brought back in
    // step at no cost. Done before the second factor branch, because it is
    // about the account rather than about this sign in.
    const locale = validateLocale(body.locale);
    if (locale.ok && locale.value !== user.locale) {
      const { error } = await supabase
        .from(T.users)
        .update({ locale: locale.value })
        .eq('id', user.id);
      if (error) console.error('[careers-gftv] login locale sync:', error);
      user.locale = locale.value;
    }

    // The second factor, when there is one. Either of the two is enough to make
    // this a two step sign in, and both are offered when both exist.
    // A failure to read either of these throws, and the outer catch answers 500.
    // That is deliberate and is the one place in this route that fails closed
    // rather than open: an unreadable link table must never be reported as "this
    // account has no second factor", because the account that would let straight
    // through on a password alone is exactly the one that asked for two steps.
    const [passkey, telegram] = await Promise.all([
      hasPasskeys('applicant', user.id),
      linkState(user.id),
    ]);

    const telegramFactor = telegram?.twofaEnabled === true;
    const secondFactor = passkey || telegramFactor;

    // 5d. A trusted device skips the second factor and never the password,
    // which was already checked above. The token rotates inside this call.
    const trusted = secondFactor
      ? await useApplicantTrustedDevice(req, res, user.id)
      : false;

    if (!secondFactor || trusted) {
      await createApplicantSession(res, user.id, body.stay_signed_in === true);

      return ok(res, {
        two_factor_required: false,
        used_trusted_device: trusted,
        user: publicApplicant(user),
        // 5c: the settings page warns below three, and so does the sign in
        // that put them there.
        codes: await codeCounts('applicant', user.id),
      });
    }

    // Past the password and waiting. No session, no cookie, nothing the
    // browser can use, which is the whole point of the challenge row.
    const challenge = randomToken(32);
    const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);

    const { error: challengeError } = await supabase.from(T.loginChallenges).insert({
      user_id: user.id,
      token: challenge,
      stay_signed_in: body.stay_signed_in === true,
      expires_at: expiresAt.toISOString(),
    });

    if (challengeError) return failInternal(res, challengeError, 'applicant login challenge');

    // The push, and the one tap link that rides with it. The nonce is set as a
    // cookie here and stored only as a hash, so the magic link works in this
    // browser and in no other, per section 15.
    //
    // A failure to ask for the code is not a failure to sign in. The step still
    // stands, the backup codes still work, and `/code` in the chat still issues
    // one, so this is logged and carried rather than thrown: refusing the whole
    // sign in because the outbox row could not be written would take the account
    // down over the convenience half of the step.
    let codeSent = false;
    if (telegramFactor) {
      try {
        const nonce = randomToken(32);
        await requestLoginCode(user.id, { nonce });
        setCookie(res, COOKIE.magicLinkNonce, nonce, {
          expires: new Date(Date.now() + CODE_TTL_MS),
        });
        codeSent = true;
      } catch (cause) {
        console.error('[careers-gftv] login code request:', cause);
      }
    }

    const methods = [
      ...(passkey ? ['passkey'] : []),
      ...(telegramFactor ? ['telegram_code'] : []),
      'backup_code',
    ];

    return ok(res, {
      two_factor_required: true,
      methods,
      // Whether a code was asked for, not whether one arrived. Nothing on this
      // side knows the second thing: the bot sends it, and section 15 is
      // explicit that the site never waits on that.
      code_requested: codeSent,
      challenge,
      expires_at: expiresAt.toISOString(),
    });
  } catch (cause) {
    return failInternal(res, cause, 'applicant login');
  }
}
