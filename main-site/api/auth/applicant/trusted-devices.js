// GET  /api/auth/applicant/trusted-devices   list them
// POST /api/auth/applicant/trusted-devices   { action } rename, revoke, revoke_all
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
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';
import { FIELD, validateDeviceName } from '../../_lib/validate.js';
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
  renameCurrentApplicantDevice,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  TRUSTED_DEVICE_DAYS,
} from '../../_lib/session.js';

/**
 * List the devices this applicant chose to trust, or rename or revoke one, or
 * revoke them all.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'POST'])) return;

  const session = await requireApplicant(request, response);
  if (!session) return;

  try {
    if (request.method === 'GET') {
      return ok(response, {
        devices: await listTrustedDevices('applicant', session.user.id),
        trust_days: TRUSTED_DEVICE_DAYS,
      });
    }

    const body = await readJson(request, response);
    if (!body) return;

    // Naming the device you are sitting at is answered before the password gate
    // below rather than behind it, because it is not a security downgrade: it
    // changes what a list calls this browser and nothing about what the browser
    // can do. The nickname is asked for in a modal seconds after a sign in, and
    // a password box that appears there teaches exactly the habit 5d's own
    // wording is trying to avoid.
    if (body.action === 'rename') {
      const name = validateDeviceName(body.label);
      if (!name.ok) {
        return fail(response, ERROR_CODES.BAD_REQUEST, 'Give this device a name.', {
          details: { label: name.code },
        });
      }

      // Identified by the device cookie inside renameCurrentApplicantDevice, so
      // this can only ever be the browser making the request.
      const renamed = await renameCurrentApplicantDevice(request, session.user.id, name.value);
      if (!renamed) {
        return fail(response, ERROR_CODES.NOT_FOUND, 'This browser is not a trusted device.');
      }

      return ok(response, { label: name.value });
    }

    // Revoking is a security downgrade: it is what somebody would do to make
    // the second factor stop being asked for. A session alone is not enough.
    const subjects = [subjectForIp(request), subjectForUser('applicant', session.user.id)];
    if (await limited(response, 'password_change', subjects)) return;

    const correct = await verifyRealmPassword('applicant', session.user.id, body.current_password);
    if (!correct) {
      await recordFailures('password_change', subjects, LIMITS.passwordChange);
      return fail(response, ERROR_CODES.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    if (body.action === 'revoke_all') {
      await revokeAllTrustedDevices('applicant', session.user.id);
      await auditApplicant(
        session.user,
        AUDIT.TRUSTED_DEVICES_REVOKED_ALL,
        {},
        {
          targetTable: 'gftvjobs_trusted_devices',
        }
      );

      return ok(response, { revoked_all: true });
    }

    // Read before it is tested. The duplicated guard that used to sit above this
    // declaration made every single device revoke throw a ReferenceError from
    // the temporal dead zone and answer 500, while revoke all worked, which is
    // why nothing on the page looked broken until somebody used the per row
    // button. Found on 30 August 2026.
    let id;

    if (typeof body.id === 'string') {
      id = body.id;
    } else {
      id = '';
    }

    if (!id) {
      return fail(
        response,
        ERROR_CODES.BAD_REQUEST,
        'Say which device to revoke, or ask for all of them.'
      );
    }

    // Scoped to the signed in account inside revokeTrustedDevice, so an id
    // belonging to somebody else answers the same way an unknown one does.
    const removed = await revokeTrustedDevice('applicant', session.user.id, id);
    if (!removed) return fail(response, ERROR_CODES.NOT_FOUND, 'That device is not on the list.');

    await auditApplicant(
      session.user,
      AUDIT.TRUSTED_DEVICE_REVOKED,
      {},
      {
        targetTable: 'gftvjobs_trusted_devices',
        targetId: id,
      }
    );

    return ok(response, { revoked: id });
  } catch (cause) {
    return failInternal(response, cause, 'applicant trusted devices');
  }
}
