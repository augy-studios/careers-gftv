// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/forgot-password.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. 5g's flow runs on both sites against the same accounts and the
// same codes, and the ticket it issues is bound to the browser by the nonce
// cookie cookies.js renames.
//
// Nothing differs from the portal's copy but this banner.
// POST /api/auth/staff/forgot-password
//
// 5g's forgot password flow, which "mirrors 5c step for step". This endpoint
// proves who somebody is; reset-password sets the password. Keeping the two
// apart is what stops one request from being a complete account takeover
// primitive, and it is why the new password is never accepted here.
//
//   { username, code }                 a staff recovery code. Issues a ticket.
//   { ticket, action: "options" }      passkey options, when one is needed.
//   { ticket, action: "passkey", … }   the assertion.
//   { ticket, code }                   an authenticator code or a backup code.
//
// **Read 5g before changing anything in here.** What this flow ends in is a
// write to gftvhello_users.password_hash, which is section 2's first named
// exception and reaches gftv.asia: it is one account, so a staff member who
// resets here has reset their password there too. Every screen in the flow says
// that in those words, and reset-password writes the audit row that is the only
// trace it leaves.
//
// Three rules from 5c are load bearing and are easy to soften by accident:
//
//   1. The same generic error for a wrong code and an unknown account. One
//      failure sentence for that branch and one status code.
//   2. Never reveal whether the account exists. An unknown username still costs
//      a bcrypt comparison, so it does not answer faster either. **That covers
//      an account with no portal access as well**, which is why this flow does
//      not say "you cannot use this site": telling somebody which gftv.asia
//      accounts reach the careers dashboard is a list nobody outside it needs.
//   3. Only gftvjobs_staff_recovery_codes satisfies the first step, and only
//      the second factor satisfies the second. 5g: "a code lying in a chat log
//      must not be able to do both."
//
// **And one rule that is 5g's own**: somebody with no recovery codes and no
// second factor still cannot get back in alone. Nothing here issues a ticket
// without a code, and there is deliberately no admin action that issues one --
// 8.9 gives the applicant realm a verified reset path and the staff realm must
// not have one, because these are the accounts the dashboard is behind. That
// path stays at gftv.asia.
//
// The ticket is bound to the browser by a nonce in its own cookie, so somebody
// who obtains the ticket value alone cannot use it from anywhere else.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { findStaffByUsername, verifyCode, consumeCode } from '../../_lib/accounts.js';
import { verifyAgainstNothing } from '../../_lib/password.js';
import { verifyTotp, hasTotp } from '../../_lib/totp.js';
import { randomToken, sha256, timingSafeEqualStr } from '../../_lib/tokens.js';
import { COOKIE, readCookie, setCookie } from '../../_lib/cookies.js';
import { supabase, T } from '../../_lib/supabase.js';
import { hasPortalAccess } from '../../_lib/session.js';
import { held } from '../../_lib/staff-account.js';
import {
  hasPasskeys,
  startAuthentication,
  finishAuthentication,
} from '../../_lib/webauthn.js';
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

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // **Held at the first step, and that placement is the whole point.** This
  // endpoint verifies a recovery code and reset-password spends it, so a hold
  // that only refused at the end would take a code off somebody who is already
  // locked out and give them nothing for it. Refusing here costs them nothing.
  if (held(res)) return;

  const body = await readJson(req, res);
  if (!body) return;

  if (typeof body.ticket === 'string' && body.ticket !== '') {
    return secondFactorStep(req, res, body);
  }

  return recoveryCodeStep(req, res, body);
}

/* -------------------------------------------------------------------------
 * Step one: the recovery code
 * ---------------------------------------------------------------------- */

async function recoveryCodeStep(req, res, body) {
  // Username only. 5a step 1 looks a staff account up by username and there is
  // no email sign in in this realm, so offering one here would be a second way
  // to address an account that the sign in itself does not have.
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const code = typeof body.code === 'string' ? body.code : '';

  if (username === '' || code === '') {
    return fail(res, ERR.BAD_REQUEST, GENERIC);
  }

  const subjects = [subjectForIp(req), subjectForIdentifier(username)];
  if (await limited(res, 'recovery_code', subjects)) return;

  try {
    const user = await findStaffByUsername(username);

    // Three ways to be nobody, answered identically: no such account, an
    // unapproved one, and one with no access to this portal. The bcrypt
    // comparison is still paid on every one of them.
    const usable = Boolean(user) && user.is_approved !== false && (await hasPortalAccess(user));

    if (!usable) {
      await verifyAgainstNothing(code);
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    const codeId = await verifyCode('staff', user.id, 'recovery', code);
    if (!codeId) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(res, ERR.UNAUTHORISED, GENERIC);
    }

    // Migration 027's two proofs rule, which section 6 told migration 040 to
    // carry from the start rather than learn twice. A staff account has two
    // possible second factors and either one is enough; an account with
    // neither has its ticket issued already satisfied, because there is nothing
    // to prove and demanding one would lock out exactly the people this flow
    // exists for.
    const passkeys = await hasPasskeys('staff', user.id);
    const totp = hasTotp(user.totp_secret);
    const secondFactorNeeded = passkeys || totp;

    const ticket = randomToken(32);
    const nonce = randomToken(32);
    const expiresAt = new Date(Date.now() + TICKET_MINUTES * 60 * 1000);

    const { error } = await supabase.from(T.staffPasswordResets).insert({
      staff_user_id: user.id,
      ticket_hash: sha256(ticket),
      browser_nonce_hash: sha256(nonce),
      recovery_code_id: codeId,
      second_factor_at: secondFactorNeeded ? null : new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    if (error) return failInternal(res, error, 'staff forgot password ticket');

    setCookie(res, COOKIE.staffResetNonce, nonce, { expires: expiresAt });
    await clearAll('recovery_code', subjects);

    return ok(res, {
      ticket,
      second_factor_required: secondFactorNeeded,
      methods: [
        ...(passkeys ? ['passkey'] : []),
        ...(totp ? ['totp'] : []),
        // The backup set is offered whenever a second factor is wanted at all,
        // because it is what somebody without their phone has. It is a
        // different set from the recovery code already spent, which is the
        // whole of why 5g keeps two.
        ...(secondFactorNeeded ? ['backup_code'] : []),
      ],
      expires_at: expiresAt.toISOString(),
      // Shown on the next screen so the person knows whose password they are
      // about to set, on a flow that deliberately says nothing until this
      // point. They have already proved they hold a recovery code.
      username: user.username,
      // Said here as well as on every screen: this is one account, and the
      // password about to be set is the gftv.asia one.
      reaches_gftv_asia: true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff forgot password');
  }
}

/* -------------------------------------------------------------------------
 * Step two: the second factor, for an account that has one
 * ---------------------------------------------------------------------- */

async function secondFactorStep(req, res, body) {
  const ticket = body.ticket;
  const nonce = readCookie(req, COOKIE.staffResetNonce);

  const subjects = [subjectForIp(req), subjectForIdentifier(ticket)];
  if (await limited(res, 'recovery_code', subjects)) return;

  if (!nonce) return fail(res, ERR.UNAUTHORISED, EXPIRED);

  try {
    const { data: reset, error } = await supabase
      .from(T.staffPasswordResets)
      .select('id, staff_user_id, browser_nonce_hash, second_factor_at, expires_at, used_at')
      .eq('ticket_hash', sha256(ticket))
      .maybeSingle();

    if (error) return failInternal(res, error, 'staff forgot password lookup');

    const unusable =
      !reset ||
      reset.used_at !== null ||
      new Date(reset.expires_at).getTime() <= Date.now() ||
      !timingSafeEqualStr(reset.browser_nonce_hash, sha256(nonce));

    if (unusable) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(res, ERR.UNAUTHORISED, EXPIRED, {
        details: { reason: 'ticket_expired' },
      });
    }

    // Asking for the options is not an attempt at anything, so it does not
    // count against the limiter.
    if (body.action === 'options') {
      const options = await startAuthentication({
        realm: 'staff',
        userId: reset.staff_user_id,
        loginToken: ticket,
      });

      if (!options) {
        return fail(res, ERR.BAD_REQUEST, 'There is no passkey on this account.');
      }

      return ok(res, { options });
    }

    let verified = false;

    if (body.action === 'passkey') {
      const result = await finishAuthentication({
        realm: 'staff',
        userId: reset.staff_user_id,
        response: body.response,
        loginToken: ticket,
      });
      verified = result.ok;
    } else if (typeof body.code === 'string' && body.code !== '') {
      const digits = body.code.replace(/\D/g, '');

      // The authenticator app first, when it is six digits and the account has
      // one. Order matters only for cost: a six digit backup code would fail
      // the TOTP check and then be tried against the set, which is one wasted
      // bcrypt round and no wrong answer.
      if (digits.length === 6) {
        const { data: account } = await supabase
          .from(T.staffUsers)
          .select('totp_secret')
          .eq('id', reset.staff_user_id)
          .maybeSingle();

        if (hasTotp(account?.totp_secret)) {
          verified = verifyTotp(digits, account.totp_secret);
        }
      }

      // The 2FA backup set, and only that set. A recovery code has already been
      // spent getting this far and must not also satisfy the second factor:
      // that would collapse 5g's two sets into one, which is the exact thing it
      // separates them to prevent.
      if (!verified) {
        verified = await consumeCode('staff', reset.staff_user_id, 'backup', body.code);
      }
    } else {
      await verifyAgainstNothing('');
    }

    if (!verified) {
      await recordFailures('recovery_code', subjects, LIMITS.recoveryCode);
      return fail(res, ERR.UNAUTHORISED, SECOND_FACTOR_GENERIC);
    }

    const { error: markError } = await supabase
      .from(T.staffPasswordResets)
      .update({ second_factor_at: new Date().toISOString() })
      .eq('id', reset.id);

    if (markError) return failInternal(res, markError, 'staff forgot password second factor');

    await clearAll('recovery_code', subjects);

    return ok(res, { second_factor_satisfied: true });
  } catch (cause) {
    return failInternal(res, cause, 'staff forgot password second factor');
  }
}
