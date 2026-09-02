// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/totp.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical, and it is the one route that writes gftvhello_users.totp_secret.
// The issuer in the otpauth URI is the portal's name on both sites
// deliberately: there is one secret on one account, and two entries in
// somebody's authenticator would be two names for one credential.
//
// Nothing differs from the portal's copy but this banner.
// POST /api/auth/staff/totp   { action } start, confirm, or remove
//
// The authenticator app half of 5f, and **the one route in this repository that
// writes gftvhello_users.totp_secret**. Section 2's second named exception,
// settled as phase 13 decision 7 on 2 September 2026: 5f asks for enrolment and
// removal on the settings page and asks for removal again in the danger zone,
// the secret lives in one column and nowhere else, and the feature and the
// prohibition could not both stand.
//
// **It is one account, and every answer here says so.** Enrolling changes what
// gftv.asia asks for at its own sign in; removing takes it away there too. The
// page says that before either button, this route repeats it in the response,
// and an audit row goes in before the write because nothing notifies anybody.
//
// The ceremony:
//
//   start     verify the current password, generate a secret, return it with
//             the otpauth URI. Nothing is written.
//   confirm   verify the current password again, verify a code against the
//             secret, then write it.
//   remove    verify the current password, and a fresh code where the account
//             still has one. Writes null.
//
// **Why the pending secret goes to the browser and comes back.** There is
// nowhere to park it: gftvhello_totp_challenges belongs to the login flow and
// has no column for one, and inventing a table for a value that lives for
// ninety seconds is a migration for a scratchpad. The round trip is not the
// leak it looks like -- the secret is the QR code, so the browser has it either
// way -- but it does mean the secret this route writes is one the caller chose.
// What stands in the way of that mattering is the password, checked on both
// steps: somebody who can supply it can enrol any authenticator they like
// through the ordinary screen anyway, and somebody who cannot gets nowhere.
// The code check is therefore not a security step at all. It is there so that
// nobody enrols a second factor their app never actually stored, which is the
// failure that locks the account holder out rather than an attacker in.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireStaff, revokeAllTrustedDevices } from '../../_lib/session.js';
import {
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
  hasTotp,
} from '../../_lib/totp.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { validateSixDigits, FIELD } from '../../_lib/validate.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { setStaffTotpSecret, held } from '../../_lib/staff-account.js';
import { encodeQr } from '../../_lib/qr.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

/**
 * What an authenticator app calls this account.
 *
 * **The portal's name and not the site's**, on both sites deliberately. There
 * is one secret on one account, and two entries in somebody's authenticator
 * reading "Careers@GFTV" and "Careers@GFTV docs" would be two names for a
 * credential that is one thing -- and would send whoever deleted the wrong one
 * looking for a second factor that never existed.
 */
const ISSUER = 'Careers@GFTV';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  const userId = session.user.id;
  const enrolled = hasTotp(session.user.totp_secret);

  // **Held at start, not at confirm.** Every action here ends in a write to
  // gftvhello_users, and refusing at the last step would mean somebody scans a
  // QR, types a code, and is turned away holding an authenticator entry for an
  // account that never stored it.
  if (held(res)) return;

  try {
    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
    if (await limited(res, 'two_factor', subjects)) return;

    const password = async () => {
      const correct = await verifyRealmPassword('staff', userId, body.current_password);
      if (!correct) await recordFailures('two_factor', subjects, LIMITS.twoFactor);
      return correct;
    };

    if (body.action === 'start') {
      if (enrolled) {
        // Replacing one is removing it and enrolling again, in that order and
        // through the screens that say what each costs. Silently overwriting
        // the secret would leave somebody holding an app that still shows codes
        // and no longer opens anything.
        return fail(res, ERR.CONFLICT, 'This account already has an authenticator app.', {
          details: { reason: 'already_enrolled' },
        });
      }

      if (!(await password())) {
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const secret = generateTotpSecret();
      const uri = otpauthUri({ username: session.user.username, issuer: ISSUER, secret });

      return ok(res, {
        secret,
        otpauth: uri,
        // **The QR is drawn here and never fetched from anywhere.** Phase 11
        // settled this for the linking code and a TOTP secret is the same
        // question with a sharper answer: the URI below carries the shared
        // secret in the clear, so handing it to an image service would put a
        // second factor in somebody else's access log. api/_lib/qr.js answers a
        // matrix and the browser draws it.
        qr: encodeQr(uri),
        issuer: ISSUER,
        // Nothing has been written. Said in the response so a client cannot
        // report a half finished enrolment as a finished one.
        enrolled: false,
      });
    }

    if (body.action === 'confirm') {
      if (enrolled) {
        return fail(res, ERR.CONFLICT, 'This account already has an authenticator app.', {
          details: { reason: 'already_enrolled' },
        });
      }

      if (!(await password())) {
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
      if (secret === '') {
        return fail(res, ERR.BAD_REQUEST, 'Start again from the beginning.', {
          details: { secret: FIELD.REQUIRED },
        });
      }

      const code = validateSixDigits(body.code);
      if (!code.ok) {
        return fail(res, ERR.BAD_REQUEST, 'Type the six digit code from your app.', {
          details: { code: code.code },
        });
      }

      if (!verifyTotp(code.value, secret)) {
        await recordFailures('two_factor', subjects, LIMITS.twoFactor);
        return fail(res, ERR.UNAUTHORISED, 'That code was not right. Check the time on your phone and try again.', {
          details: { code: FIELD.INVALID },
        });
      }

      await auditStaff(session.user, AUDIT.TOTP_ENROLLED, {
        reaches: 'gftvhello_users.totp_secret',
      });

      const written = await setStaffTotpSecret(userId, secret);
      if (!written) {
        return fail(res, ERR.SERVER_ERROR, 'That could not be saved. Try again.');
      }

      await clearAll('two_factor', subjects);

      return ok(res, {
        enrolled: true,
        // 5f's page has already said this. Repeated for the same reason the
        // password change repeats it.
        reaches_gftv_asia: true,
      });
    }

    if (body.action === 'remove') {
      if (!enrolled) {
        return fail(res, ERR.NOT_FOUND, 'This account has no authenticator app.');
      }

      if (!(await password())) {
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      // **A fresh code as well as the password**, which 5f asks for in front of
      // every danger zone action and which belongs here for the same reason:
      // turning a second factor off is the one change an attacker holding a
      // stolen password most wants to make, and the code is the thing they do
      // not have. Somebody who has genuinely lost the app has the recovery path
      // 5g built and the backup codes beside it.
      const code = validateSixDigits(body.code);
      if (!code.ok) {
        return fail(res, ERR.BAD_REQUEST, 'Type the six digit code from your app.', {
          details: { code: code.code },
        });
      }

      if (!verifyTotp(code.value, session.user.totp_secret)) {
        await recordFailures('two_factor', subjects, LIMITS.twoFactor);
        return fail(res, ERR.UNAUTHORISED, 'That code was not right.', {
          details: { code: FIELD.INVALID },
        });
      }

      await auditStaff(session.user, AUDIT.TOTP_REMOVED, {
        reaches: 'gftvhello_users.totp_secret',
      });

      const written = await setStaffTotpSecret(userId, null);
      if (!written) {
        return fail(res, ERR.SERVER_ERROR, 'That could not be saved. Try again.');
      }

      // 5d: disabling 2FA revokes every trusted device. A device was trusted on
      // the strength of a second factor that no longer exists, so the trust it
      // is standing on has gone with it.
      await revokeAllTrustedDevices('staff', userId);
      await clearAll('two_factor', subjects);

      return ok(res, {
        enrolled: false,
        reaches_gftv_asia: true,
        devices_revoked: true,
      });
    }

    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff totp');
  }
}
