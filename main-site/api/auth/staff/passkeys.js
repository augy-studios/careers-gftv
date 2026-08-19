// GET    /api/auth/staff/passkeys        list them
// POST   /api/auth/staff/passkeys        start or finish registering one
// DELETE /api/auth/staff/passkeys?id=...  remove one
//
// The staff half of passkeys. Same two step ceremony as the applicant side,
// against gftvjobs_staff_passkeys.
//
// That table is a gftvjobs_ one on purpose. Section 2 forbids adding to the
// gftvhello_ namespace, so this follows gftvjobs_admin_access: gftvhello_users
// is referenced and never written to. The consequence is worth saying plainly
// to whoever registers one, and the settings page does: a passkey created here
// works on this portal and not at gftv.asia, because a passkey belongs to the
// domain that made it.
//
// A staff account can therefore have three second factors: its existing TOTP
// app, a passkey registered here, and the backup codes that get past either.
//
// Adding and removing both ask for the current password, so a session alone
// cannot change what it takes to get a session. Verifying that password is a
// read of gftvhello_users.password_hash, which section 2 permits: the
// prohibition is on writing.

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
  if (methodNotAllowed(req, res, ['GET', 'POST', 'DELETE'])) return;

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

    if (req.method === 'DELETE') {
      const url = new URL(req.url ?? '/', 'https://careers.invalid');
      const id = url.searchParams.get('id');
      if (!id) return fail(res, ERR.BAD_REQUEST, 'Say which passkey to remove.');

      const body = await readJson(req, res);
      if (!body) return;

      const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
      if (await limited(res, 'passkey', subjects)) return;

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

    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
    if (await limited(res, 'passkey', subjects)) return;

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
