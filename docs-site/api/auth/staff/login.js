// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/login.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The same accounts, the same access rule, and the same refusal to
// issue a session before a second factor has been satisfied.
//
// Nothing differs from the portal's copy but this banner.
// POST /api/auth/staff/login
//
// Section 5a, steps 1 to 5 and step 8. The same gftv.asia accounts that sign in
// at the main site sign in here, against the existing gftvhello tables.
//
// What this endpoint may write is narrow and fixed by section 2: session rows,
// challenge rows, trusted device rows, and backup code rows. gftvhello_users is
// read only from this repo, always, and nothing here updates a last login or a
// failed attempt counter on it.
//
// The password step never issues a session when a second factor is required.
// That is step 5 of 5a and it is the whole point of the challenge row: a
// password alone must not leave the browser holding anything it can use.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifySecret, verifyAgainstNothing } from '../../_lib/password.js';
import { findStaffByUsername } from '../../_lib/accounts.js';
import { hasTotp } from '../../_lib/totp.js';
import { hasPasskeys } from '../../_lib/webauthn.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { supabase, TABLES } from '../../_lib/supabase.js';
import { randomToken } from '../../_lib/tokens.js';
import {
  HELLO,
  CHALLENGE_MINUTES,
  createStaffSession,
  hasPortalAccess,
  useStaffTrustedDevice,
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

const GENERIC = 'That username or password was not right.';

/**
 * Check a staff username and password. A wrong password, an unapproved account
 * and an account without portal access all get the same answer. A trusted device
 * signs straight in; otherwise a challenge is issued for the second factor.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  let username;

  if (typeof body.username === 'string') {
    username = body.username.trim();
  } else {
    username = '';
  }

  let password;

  if (typeof body.password === 'string') {
    password = body.password;
  } else {
    password = '';
  }

  const staySignedIn = body.stay_signed_in === true;

  if (username === '' || password === '') {
    return fail(response, ERROR_CODES.BAD_REQUEST, GENERIC);
  }

  const subjects = [subjectForIp(request), subjectForIdentifier(username)];
  if (await limited(response, 'staff_login', subjects)) return;

  try {
    const user = await findStaffByUsername(username);

    if (!user) {
      await verifyAgainstNothing(password);
      await recordFailures('staff_login', subjects, LIMITS.login);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    const correct = await verifySecret(password, user.password_hash);
    if (!correct) {
      await recordFailures('staff_login', subjects, LIMITS.login);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    // Steps 2 and 3. Both answer with the same sentence as a wrong password,
    // so this page cannot be used to work out which accounts exist or which of
    // them can reach the portal. hasPortalAccess is the one place that rule
    // lives, and it reads the gftvjobs_admin_access overlay rather than
    // writing to gftvhello_users.
    if (user.is_approved !== true || !(await hasPortalAccess(user))) {
      await recordFailures('staff_login', subjects, LIMITS.login);
      return fail(response, ERROR_CODES.UNAUTHORISED, GENERIC);
    }

    await clearAll('staff_login', subjects);

    // Step 4. A trusted device skips the second factor and nothing else: the
    // password above was still required. The token rotates on use inside this
    // call, per 5d.
    const trusted = await useStaffTrustedDevice(request, response, user.id);

    // What the account can answer with. TOTP is the existing gftv.asia factor
    // from 5a; a passkey is one registered on this portal, added in phase 2.
    // Either is enough to make this a two step sign in.
    const passkeys = await hasPasskeys('staff', user.id);
    const secondFactor = passkeys || hasTotp(user.totp_secret);

    // Steps 4 and 8. No second factor to satisfy, or one already satisfied by
    // this device, so the session is issued here.
    if (trusted || !secondFactor) {
      await createStaffSession(response, user.id, staySignedIn);

      let secondFactorValue;

      if (trusted) {
        secondFactorValue = 'trusted_device';
      } else {
        secondFactorValue = 'none';
      }

      await auditStaff(user, AUDIT.STAFF_SIGNED_IN, {
        second_factor: secondFactorValue,
        stay_signed_in: staySignedIn,
      });

      return ok(response, {
        two_factor_required: false,
        used_trusted_device: trusted,
        user: publicStaff(user),
      });
    }

    // Step 5. A challenge row and nothing else. No session, no cookie.
    const challenge = randomToken(32);
    const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);

    const { error } = await supabase.from(TABLES.staffTotpChallenges).insert({
      [HELLO.challenges.userId]: user.id,
      [HELLO.challenges.token]: challenge,
      [HELLO.challenges.expiresAt]: expiresAt.toISOString(),
    });

    if (error) return failInternal(response, error, 'staff login challenge');

    // So the page offers what this account actually has, rather than a code
    // box to somebody whose only second factor is a passkey.
    const methods = [];
    if (passkeys) methods.push('passkey');
    if (hasTotp(user.totp_secret)) methods.push('totp');
    methods.push('backup_code');

    return ok(response, {
      two_factor_required: true,
      // So the page offers what this account actually has, rather than a code
      // box to somebody whose only second factor is a passkey.
      methods,
      challenge,
      expires_at: expiresAt.toISOString(),
      // 5d: "Only offer trust this device once the second factor has actually
      // been satisfied, never on the password screen." The flag says the offer
      // is coming, not that it is available now.
      offer_trust_after_second_factor: true,
    });
  } catch (cause) {
    return failInternal(response, cause, 'staff login');
  }
}
