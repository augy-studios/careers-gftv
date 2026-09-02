// GET  /api/auth/staff/account   everything 5f's page draws
// POST /api/auth/staff/account   { action: "change_password" }
//
// The staff account settings suite, per 5f, mounted on the portal at
// /admin/security and on the docs site at /account. One implementation, two
// pages, per 16c and phase 13 decision 8.
//
// **The GET answers the whole page in one call**, the way api/admin/me answers
// the dashboard. Seven panels fetching seven endpoints is seven chances for a
// settings page to render half drawn, and every one of these reads is against
// the same account.
//
// **A panel that could not be read says so, and the request still succeeds.**
// Phase 10's third state, and this page is where it matters most: "you have no
// passkeys" and "we could not ask about your passkeys" are different sentences,
// and only one of them is ours to say to somebody deciding whether they can
// still get into their account. So every panel carries its own failure, nothing
// falls back to an empty list drawn as a complete one, and a count that could
// not be read is null and never 0.
//
// The actions live in their own routes -- totp.js, recovery-codes.js,
// passkeys.js, trusted-devices.js, danger.js -- and the one that is here is the
// password change, because it has no other home and because 5f's own bullet
// points at 5g for what it costs.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireStaff, listTrustedDevices, revokeAllTrustedDevices } from '../../_lib/session.js';
import { listPasskeys, relyingParty } from '../../_lib/webauthn.js';
import { hasTotp } from '../../_lib/totp.js';
import { verifyRealmPassword, codeCounts, codesLow, LOW_CODE_WARNING, CODES_PER_SET } from '../../_lib/accounts.js';
import { checkPasswordStrength, PASSWORD_MIN_LENGTH } from '../../_lib/password.js';
import { FIELD } from '../../_lib/validate.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { SITE } from '../../_lib/site.js';
import {
  staffProfile,
  setStaffPassword,
  listStaffSessions,
  revokeStaffSessions,
  held,
  HELLO_WRITES_ENABLED,
} from '../../_lib/staff-account.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  const userId = session.user.id;

  try {
    if (req.method === 'GET') {
      const [profile, passkeys, devices, codes, sessions] = await Promise.all([
        staffProfile(userId),
        listPasskeys('staff', userId),
        listTrustedDevices('staff', userId),
        codeCounts('staff', userId),
        listStaffSessions(userId, session.sessionId),
      ]);

      return ok(res, {
        // Which site is answering. The page says it out loud in two places --
        // beside the trusted devices, which are shared, and beside the sessions,
        // which are not -- and a page that had to work out which site it was on
        // from its own hostname would be a second answer to a question this
        // build already has one constant for.
        site: SITE,

        // Read only, per 5f. The page links across to gftv.asia rather than
        // drawing fields that cannot be saved.
        profile: {
          username: session.user.username,
          display_name: profile.display_name,
          email: profile.email,
          available: profile.available,
        },

        passkeys,
        relying_party: relyingParty().id,

        // Whether the account has an authenticator app at all. The secret
        // itself never leaves the server, and this is the only thing derived
        // from it that ever does.
        //
        // **There is no "last used" and 5f asks for one.** gftvhello_users has
        // nowhere to record it and section 2 says not to add a column, so the
        // page says the enrolment status and stops. A field invented from
        // whatever data happened to be nearby would be the failure this build
        // keeps naming, in the smallest possible shape.
        totp_enabled: hasTotp(session.user.totp_secret),

        codes,
        codes_low: {
          recovery: codesLow(codes.recovery),
          backup: codesLow(codes.backup),
        },
        low_code_threshold: LOW_CODE_WARNING,
        codes_per_set: CODES_PER_SET,

        // **The list is the account's, not this site's**, and deviation 125 is
        // the whole account of why. gftvhello_trusted_devices has no site
        // column and section 2 forbids adding one, so each site shows rows the
        // other created and a revoke here revokes there. Trust really is earned
        // per site -- the cookie is host scoped -- which is the half a reader is
        // more likely to get wrong in the other direction, so the page says
        // both.
        devices,

        // 5f: "where the account is signed in, on both sites". What a row can
        // say is what migration 038 put in it, which is the site and two dates
        // and no device at all. Decision 10.
        sessions: sessions.sessions,
        sessions_failed: sessions.failed,

        password_min_length: PASSWORD_MIN_LENGTH,

        // Whether the three things that reach gftv.asia may run yet. False on
        // the commit that introduced them, and the page draws those panels as
        // held with the reason on them instead of offering a button that
        // answers 503. See HELLO_WRITES_ENABLED.
        hello_writes_enabled: HELLO_WRITES_ENABLED,
      });
    }

    const body = await readJson(req, res);
    if (!body) return;

    if (body.action !== 'change_password') {
      return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
        details: { action: FIELD.INVALID },
      });
    }

    // Before the limiter as well as before the audit row: a held route must not
    // spend somebody's attempts on a request it was never going to serve.
    if (held(res)) return;

    const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
    if (await limited(res, 'password_change', subjects)) return;

    const strength = checkPasswordStrength(body.new_password);
    if (!strength.ok) {
      return fail(res, ERR.BAD_REQUEST, 'That password is too short.', {
        details: { new_password: strength.code },
      });
    }

    const correct = await verifyRealmPassword('staff', userId, body.current_password);
    if (!correct) {
      await recordFailures('password_change', subjects, LIMITS.passwordChange);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    // **The audit row goes in before the write, not after it.** 5f and 5g both
    // require it in those words, and the reason is that this is the only trace
    // the change leaves anywhere: there is no email in this build, so nothing
    // notifies the account holder and nothing notifies gftv.asia. A row written
    // afterwards is a row that is missing precisely when the write went wrong.
    await auditStaff(session.user, AUDIT.STAFF_PASSWORD_CHANGED, {
      // Said in the row as well as on screen, because whoever reads this log in
      // six months is looking at a portal audit table and the thing they need
      // to know is that the change did not stay inside it.
      reaches: 'gftvhello_users.password_hash',
    });

    const written = await setStaffPassword(userId, body.new_password);
    if (!written) {
      return fail(res, ERR.SERVER_ERROR, 'That could not be saved. Try again.');
    }

    // 5d: "Changing the password, resetting via recovery code, unlinking
    // Telegram, or disabling 2FA revokes all of them." Trusted devices are the
    // account's across both sites, so this reaches both by the same accident
    // that makes the list shared, and that is the direction to fail in.
    await revokeAllTrustedDevices('staff', userId);
    await revokeStaffSessions(userId, { keepSessionId: session.sessionId });

    // The bucket is cleared on success so somebody who mistyped their current
    // password twice and then got it right is not left sitting on a count.
    await clearAll('password_change', subjects);

    return ok(res, {
      changed: true,
      // The page has already said this before the button was pressed. It is
      // repeated here so that a client which somehow reached this endpoint
      // without saying it cannot report the change as a local one.
      reaches_gftv_asia: true,
      other_sessions_ended: true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff account');
  }
}
