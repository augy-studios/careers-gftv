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

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifySecret, verifyAgainstNothing } from '../../_lib/password.js';
import { findApplicantByIdentifier, codeCounts } from '../../_lib/accounts.js';
import {
  createApplicantSession,
  useApplicantTrustedDevice,
  publicApplicant,
  CHALLENGE_MINUTES,
} from '../../_lib/session.js';
import { hasPasskeys } from '../../_lib/webauthn.js';
import {
  linkState,
  requestLoginCode,
  CODE_TIME_TO_LIVE_MILLISECONDS,
} from '../../_lib/telegram.js';
import { randomToken } from '../../_lib/tokens.js';
import { setCookie, COOKIE } from '../../_lib/cookies.js';
import { supabase, TABLES } from '../../_lib/supabase.js';
import { validatePublishedLocale } from '../../_lib/locales.js';
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

/**
 * Sign an applicant in with a username or email and a password. Refuses a
 * deactivated account, and either creates the session straight away or, when the
 * account has a second factor or the device is not trusted, issues a challenge
 * for the second step and says which methods may answer it.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  let identifier;

  if (typeof body.identifier === 'string') {
    identifier = body.identifier.trim();
  } else {
    identifier = '';
  }

  let password;

  if (typeof body.password === 'string') {
    password = body.password;
  } else {
    password = '';
  }

  if (identifier === '' || password === '') {
    return fail(response, ERROR_CODES.BAD_REQUEST, GENERIC);
  }

  // Per IP and per identifier, so neither a spray across accounts from one
  // machine nor a run at one account from many machines is unlimited.
  const subjects = [subjectForIp(request), subjectForIdentifier(identifier)];
  if (await limited(response, 'login', subjects)) return;

  try {
    const user = await findApplicantByIdentifier(identifier);

    if (!user) {
      await verifyAgainstNothing(password);
      await recordFailures('login', subjects, LIMITS.login);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    const correct = await verifySecret(password, user.password_hash);
    if (!correct) {
      await recordFailures(
        'login',
        [...subjects, subjectForUser('applicant', user.id)],
        LIMITS.login
      );
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    // Only said once the password is right, so it is not an account oracle.
    // Section 8.9 lets an admin deactivate an account.
    if (user.is_active === false) {
      return fail(
        response,
        ERROR_CODES.FORBIDDEN,
        'That account has been deactivated. Contact the team if you think that is wrong.'
      );
    }

    await clearAll('login', [...subjects, subjectForUser('applicant', user.id)]);

    // The browser's language is the source of truth for rendering, and the
    // column exists so the Telegram bot knows which language to write in, per
    // 3a. Signing in is one of the moments the two can be brought back in
    // step at no cost. Done before the second factor branch, because it is
    // about the account rather than about this sign in.
    const locale = await validatePublishedLocale(body.locale);
    if (locale.ok && locale.value !== user.locale) {
      const { error } = await supabase
        .from(TABLES.users)
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
    let trusted;

    if (secondFactor) {
      trusted = await useApplicantTrustedDevice(request, response, user.id);
    } else {
      trusted = false;
    }

    if (!secondFactor || trusted) {
      await createApplicantSession(response, user.id, body.stay_signed_in === true);

      return ok(response, {
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

    const { error: challengeError } = await supabase.from(TABLES.loginChallenges).insert({
      user_id: user.id,
      token: challenge,
      stay_signed_in: body.stay_signed_in === true,
      expires_at: expiresAt.toISOString(),
    });

    if (challengeError) return failInternal(response, challengeError, 'applicant login challenge');

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
        setCookie(response, COOKIE.magicLinkNonce, nonce, {
          expires: new Date(Date.now() + CODE_TIME_TO_LIVE_MILLISECONDS),
        });
        codeSent = true;
      } catch (cause) {
        console.error('[careers-gftv] login code request:', cause);
      }
    }

    let passkeyOption;

    if (passkey) {
      passkeyOption = ['passkey'];
    } else {
      passkeyOption = [];
    }

    let telegramCodeOption;

    if (telegramFactor) {
      telegramCodeOption = ['telegram_code'];
    } else {
      telegramCodeOption = [];
    }

    const methods = [...passkeyOption, ...telegramCodeOption, 'backup_code'];

    return ok(response, {
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
    return failInternal(response, cause, 'applicant login');
  }
}
