// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/passkeys.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The credential table is shared and so is the relying party id,
// so a passkey registered here is offered on the portal and the other way
// round. Which of the two made it is registered_on, written from site.js, and
// the row is the only place that fact exists.
//
// Nothing differs from the portal's copy but this banner.
// GET  /api/auth/staff/passkeys   list them
// POST /api/auth/staff/passkeys   { action } start, finish, or remove
//
// The staff half of passkeys. Same two step ceremony as the applicant side,
// against gftvjobs_staff_passkeys.
//
// That table is a gftvjobs_ one on purpose. Section 2 forbids adding to the
// gftvhello_ namespace, so this follows gftvjobs_admin_access: gftvhello_users
// is referenced and never written to. The consequence is worth saying plainly
// to whoever registers one, and the settings page does: a passkey registered on
// either careers site works on both of them and on neither at gftv.asia,
// because a passkey belongs to the domain that made it and 5e has both sites
// claim the same one.
//
// **Which is why the row records where it was made.** registered_on, from
// migration 039 and the SITE constant, since one enrolment showing up in two
// places is otherwise a list a reader cannot account for. 5f asks for it on the
// page; this route is where the value is written.
//
// A staff account can therefore have three second factors: its existing TOTP
// app, a passkey registered here, and the backup codes that get past either.
//
// Adding and removing both ask for the current password, so a session alone
// cannot change what it takes to get a session. Verifying that password is a
// read of gftvhello_users.password_hash, which section 2 permits: the
// prohibition is on writing.
//
// Removing is a POST with an action rather than a DELETE, because the password
// travels in the body. A body on DELETE is legal and Node reads it, but it is
// unusual enough that proxies and CDNs are known to drop it, and the failure
// mode is silent: the password never arrives, the request is refused, and
// nothing anywhere says why. POST costs nothing and removes the question.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireStaff } from '../../_lib/session.js';
import { validateText, FIELD } from '../../_lib/validate.js';
import {
  listPasskeys,
  startRegistration,
  finishRegistration,
  deletePasskey,
  passkeyLabel,
  relyingParty,
} from '../../_lib/webauthn.js';
import { hasTotp } from '../../_lib/totp.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import {
  LIMITS,
  limited,
  recordFailures,
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
      return ok(res, {
        passkeys: await listPasskeys('staff', userId),
        relying_party: relyingParty().id,
        // So the page can say whether removing every passkey would leave the
        // account with a second factor at all.
        totp_enabled: hasTotp(session.user.totp_secret),
      });
    }

    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
    if (await limited(res, 'passkey', subjects)) return;

    if (body.action === 'remove') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return fail(res, ERR.BAD_REQUEST, 'Say which passkey to remove.');

      const correct = await verifyRealmPassword('staff', userId, body.current_password);
      if (!correct) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const removed = await deletePasskey('staff', userId, id);
      if (!removed) return fail(res, ERR.NOT_FOUND, 'That passkey is not on the list.');

      const remaining = await listPasskeys('staff', userId);

      await auditStaff(session.user, AUDIT.PASSKEY_REMOVED, {
        remaining: remaining.length,
      }, { targetTable: 'gftvjobs_staff_passkeys', targetId: id });

      return ok(res, {
        removed: id,
        second_factor_off:
          remaining.length === 0 && !hasTotp(session.user.totp_secret),
      });
    }

    if (body.action === 'start') {
      const correct = await verifyRealmPassword('staff', userId, body.current_password);
      if (!correct) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const options = await startRegistration({
        realm: 'staff',
        userId,
        username: session.user.username,
        displayName: session.user.username,
      });
      return ok(res, { options });
    }

    if (body.action === 'finish') {
      const label = validateText(body.label, 60);
      if (!label.ok) {
        return fail(res, ERR.BAD_REQUEST, 'That name is too long.', {
          details: { label: label.code },
        });
      }

      const result = await finishRegistration({
        realm: 'staff',
        userId,
        response: body.response,
        label: label.value ?? passkeyLabel(req),
      });

      if (!result.ok) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.BAD_REQUEST, 'That passkey could not be added. Try again.', {
          details: { reason: result.reason },
        });
      }

      await auditStaff(session.user, AUDIT.PASSKEY_ADDED, {
        label: result.passkey.label,
        backed_up: result.passkey.backed_up,
      }, { targetTable: 'gftvjobs_staff_passkeys', targetId: result.passkey.id });

      return ok(res, { passkey: result.passkey });
    }

    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff passkeys');
  }
}
