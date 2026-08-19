// GET  /api/auth/applicant/trusted-devices   list them
// POST /api/auth/applicant/trusted-devices   { action } revoke or revoke_all
//
// Section 5d: "Account settings lists trusted devices with when each was added
// and last used, a revoke button per device, and a revoke all."
//
// A trusted device skips the second factor and nothing else. The password is
// still asked for on every sign in, and 5d puts the danger zone out of reach
// of trust entirely.
//
// The device token never appears in a response. On this side it is stored
// hashed, so it could not be returned even by accident; the staff side stores
// it in the clear and the listing there is written to leave it behind.

import {
  ok,
  fail,
  ERR,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';
import { FIELD } from '../../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';
import {
  requireApplicant,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  TRUSTED_DEVICE_DAYS,
} from '../../_lib/session.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      return ok(res, {
        devices: await listTrustedDevices('applicant', session.user.id),
        trust_days: TRUSTED_DEVICE_DAYS,
      });
    }

    // Revoking is a security downgrade: it is what somebody would do to make
    // the second factor stop being asked for. A session alone is not enough.
    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('applicant', session.user.id)];
    if (await limited(res, 'password_change', subjects)) return;

    const correct = await verifyRealmPassword(
      'applicant',
      session.user.id,
      body.current_password
    );
    if (!correct) {
      await recordFailures('password_change', subjects, LIMITS.passwordChange);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }


    if (body.action === 'revoke_all') {
      await revokeAllTrustedDevices('applicant', session.user.id);
      await auditApplicant(session.user, AUDIT.TRUSTED_DEVICES_REVOKED_ALL, {}, {
        targetTable: 'gftvjobs_trusted_devices',
      });

      return ok(res, { revoked_all: true });
    }

    if (!id) {
      return fail(res, ERR.BAD_REQUEST, 'Say which device to revoke, or ask for all of them.');
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return fail(res, ERR.BAD_REQUEST, 'Say which device to revoke, or ask for all of them.');
    }

    // Scoped to the signed in account inside revokeTrustedDevice, so an id
    // belonging to somebody else answers the same way an unknown one does.
    const removed = await revokeTrustedDevice('applicant', session.user.id, id);
    if (!removed) return fail(res, ERR.NOT_FOUND, 'That device is not on the list.');

    await auditApplicant(session.user, AUDIT.TRUSTED_DEVICE_REVOKED, {}, {
      targetTable: 'gftvjobs_trusted_devices',
      targetId: id,
    });

    return ok(res, { revoked: id });
  } catch (cause) {
    return failInternal(res, cause, 'applicant trusted devices');
  }
}
