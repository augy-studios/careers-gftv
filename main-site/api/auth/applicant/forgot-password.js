// POST /api/auth/applicant/forgot-password
//
// Step 2 of the flow in 5c, and now the step after it as well. This endpoint
// proves who somebody is; reset-password sets the password. Keeping those two
// apart is what stops a single request from being a complete account takeover
// primitive, and it is why the password is never accepted here.
//
//   { identifier, code }               a recovery code. Issues a ticket.
//   { ticket, action: "options" }      passkey options, when one is needed.
//   { ticket, action: "passkey", … }   the assertion.
//   { ticket, code }                   a 2FA backup code instead.
//
// The second factor step exists because passkeys arrived after 5c was written.
// That section made one recovery code a full account credential on the basis
// that there was no second factor to protect; now there is, and a reset that
// walked past it would undo the passkey for anybody holding a code. See
// migration 027.
//
// An account with no passkey never sees the extra step. Its ticket is issued
// already satisfied, and the flow is exactly what 5c describes.
//
// Three rules from 5c are load bearing and are easy to soften by accident:
//
//   1. The same generic error for a wrong code and an unknown account. There
//      is one failure sentence for that branch and one status code.
//   2. Never reveal whether the account exists. An unknown identifier still
//      costs a bcrypt comparison, so it does not answer faster either.
//   3. Only gftvjobs_recovery_codes satisfies the first step, and only
//      gftvjobs_2fa_backup_codes satisfies the second. They are separate
//      tables so that this cannot be got wrong by filtering.
//
// The ticket is bound to the browser by a nonce in its own cookie, so somebody
// who obtains the ticket value alone cannot use it from anywhere else.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { findApplicantByIdentifier, verifyCode, consumeCode } from '../../_lib/accounts.js';
import { verifyAgainstNothing } from '../../_lib/password.js';
import { randomToken, sha256, timingSafeEqualStrings } from '../../_lib/tokens.js';
import { COOKIE, readCookie, setCookie } from '../../_lib/cookies.js';
import { supabase, TABLES } from '../../_lib/supabase.js';
import { hasPasskeys, startAuthentication, finishAuthentication } from '../../_lib/webauthn.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForIdentifier,
} from '../../_lib/rate-limit.js';

/** How long the ticket lasts. Long enough to choose a password, and no longer. */
const TICKET_MINUTES = 15;

const GENERIC = 'That account and code did not match. Check both and try again.';
const SECOND_FACTOR_GENERIC = 'That was not right. Try again.';
const EXPIRED = 'That took too long. Start again from the beginning.';

export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  // A ticket in the body means this is the second factor step. Without one it
  // is the recovery code step.
  if (typeof body.ticket === 'string' && body.ticket !== '') {
    return secondFactorStep(request, response, body);
  }

  return recoveryCodeStep(request, response, body);
}

/* -------------------------------------------------------------------------
 * Step one: the recovery code
 * ---------------------------------------------------------------------- */

async function recoveryCodeStep(request, response, body) {
  let identifier;

  if (typeof body.identifier === 'string') {
    identifier = body.identifier.trim();
  } else {
    identifier = '';
  }

  let code;

  if (typeof body.code === 'string') {
    code = body.code;
  } else {
    code = '';
  }

  if (identifier === '' || code === '') {
    return fail(response, ERROR_CODES.BAD_REQUEST, GENERIC);
  }

  // 5c: "Rate limit code entry per account and per IP, and lock the flow for
  // an hour after repeated failures." The account subject is the identifier as
  // typed, hashed, since a real account id is not known on the failing path.
  const subjects = [subjectForIp(request), subjectForIdentifier(identifier)];
  if (await limited(response, 'recovery_code', subjects)) return;

  try {
    const user = await findApplicantByIdentifier(identifier);

    if (!user || user.is_active === false) {
      await verifyAgainstNothing(code);
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    const codeId = await verifyCode('applicant', user.id, 'recovery', code);
    if (!codeId) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    // Whether there is a second factor to satisfy at all. An account with no
    // passkey has its ticket issued already satisfied, because there is
    // nothing for it to prove and demanding one would lock out exactly the
    // people this flow exists for.
    const secondFactorNeeded = await hasPasskeys('applicant', user.id);

    const ticket = randomToken(32);
    const nonce = randomToken(32);
    const expiresAt = new Date(Date.now() + TICKET_MINUTES * 60 * 1000);

    let secondFactorAt;

    if (secondFactorNeeded) {
      secondFactorAt = null;
    } else {
      secondFactorAt = new Date().toISOString();
    }

    const { error } = await supabase.from(TABLES.passwordResets).insert({
      user_id: user.id,
      ticket_hash: sha256(ticket),
      browser_nonce_hash: sha256(nonce),
      recovery_code_id: codeId,
      second_factor_at: secondFactorAt,
      expires_at: expiresAt.toISOString(),
    });

    if (error) return failInternal(response, error, 'forgot password ticket');

    setCookie(response, COOKIE.resetNonce, nonce, { expires: expiresAt });
    await clearAll('recovery_code', subjects);

    let methods;

    if (secondFactorNeeded) {
      methods = ['passkey', 'backup_code'];
    } else {
      methods = [];
    }

    return ok(response, {
      ticket,
      second_factor_required: secondFactorNeeded,
      methods: methods,
      expires_at: expiresAt.toISOString(),
      // Shown on the next screen so the person knows whose password they are
      // about to set, on a flow that deliberately says nothing until this
      // point. They have already proved they hold a recovery code.
      username: user.username,
    });
  } catch (cause) {
    return failInternal(response, cause, 'forgot password');
  }
}

/* -------------------------------------------------------------------------
 * Step two: the second factor, for an account that has one
 * ---------------------------------------------------------------------- */

async function secondFactorStep(request, response, body) {
  const ticket = body.ticket;
  const nonce = readCookie(request, COOKIE.resetNonce);

  const subjects = [subjectForIp(request), subjectForIdentifier(ticket)];
  if (await limited(response, 'recovery_code', subjects)) return;

  if (!nonce) return fail(response, ERROR_CODES.UNAUTHORISED, EXPIRED);

  try {
    const { data: reset, error } = await supabase
      .from(TABLES.passwordResets)
      .select('id, user_id, browser_nonce_hash, second_factor_at, expires_at, used_at')
      .eq('ticket_hash', sha256(ticket))
      .maybeSingle();

    if (error) return failInternal(response, error, 'forgot password second factor lookup');

    const unusable =
      !reset ||
      reset.used_at !== null ||
      new Date(reset.expires_at).getTime() <= Date.now() ||
      !timingSafeEqualStrings(reset.browser_nonce_hash, sha256(nonce));

    if (unusable) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(response, ERROR_CODES.UNAUTHORISED, EXPIRED, {
        details: { reason: 'ticket_expired' },
      });
    }

    // Asking for the options is not an attempt at anything, so it does not
    // count against the limiter.
    if (body.action === 'options') {
      const options = await startAuthentication({
        realm: 'applicant',
        userId: reset.user_id,
        loginToken: ticket,
      });

      if (!options) {
        return fail(response, ERROR_CODES.BAD_REQUEST, 'There is no passkey on this account.');
      }

      return ok(response, { options });
    }

    let verified = false;

    if (body.action === 'passkey') {
      const result = await finishAuthentication({
        realm: 'applicant',
        userId: reset.user_id,
        response: body.response,
        loginToken: ticket,
      });
      verified = result.ok;
    } else if (typeof body.code === 'string' && body.code !== '') {
      // The 2FA set, and only that set. A recovery code has already been spent
      // getting this far and must not also satisfy the second factor: that
      // would collapse the two sets into one, which is the exact thing 5c
      // separates them to prevent.
      verified = await consumeCode('applicant', reset.user_id, 'backup', body.code);
    } else {
      await verifyAgainstNothing('');
    }

    if (!verified) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(response, ERROR_CODES.UNAUTHORISED, SECOND_FACTOR_GENERIC);
    }

    const { error: markError } = await supabase
      .from(TABLES.passwordResets)
      .update({ second_factor_at: new Date().toISOString() })
      .eq('id', reset.id);

    if (markError) return failInternal(response, markError, 'forgot password second factor');

    await clearAll('recovery_code', subjects);

    return ok(response, { second_factor_satisfied: true });
  } catch (cause) {
    return failInternal(response, cause, 'forgot password second factor');
  }
}
