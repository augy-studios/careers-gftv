// GET    /api/auth/staff/trusted-devices          list them
// DELETE /api/auth/staff/trusted-devices?id=...    revoke one
// DELETE /api/auth/staff/trusted-devices?all=true  revoke every one
//
// The staff half of 5d. Same shape as the applicant endpoint, against the
// existing gftvhello_trusted_devices table, which stores the token in the
// clear and is not altered by this repo.
//
// That in the clear storage is why the listing selects columns by name and
// never with a star: the token must not leave the server, and a select('*')
// added later by habit would send it to the browser.

import {
  ok,
  fail,
  ERR,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { FIELD } from '../../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';
import {
  requireStaff,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  TRUSTED_DEVICE_DAYS,
} from '../../_lib/session.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'DELETE'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      return ok(res, {
        devices: await listTrustedDevices('staff', session.user.id),
        trust_days: TRUSTED_DEVICE_DAYS,
      });
    }

    // Revoking is a security downgrade: it is what somebody would do to make
    // the second factor stop being asked for. A session alone is not enough.
    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('staff', session.user.id)];
    if (await limited(res, 'password_change', subjects)) return;

    const correct = await verifyRealmPassword(
      'staff',
      session.user.id,
      body.current_password
    );
    if (!correct) {
      await recordFailures('password_change', subjects, LIMITS.passwordChange);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    const url = new URL(req.url ?? '/', 'https://careers.invalid');

    if (url.searchParams.get('all') === 'true') {
      await revokeAllTrustedDevices('staff', session.user.id);
      await auditStaff(session.user, AUDIT.TRUSTED_DEVICES_REVOKED_ALL, {}, {
        targetTable: 'gftvhello_trusted_devices',
      });

      return ok(res, { revoked_all: true });
    }

    const id = url.searchParams.get('id');
    if (!id) {
      return fail(res, ERR.BAD_REQUEST, 'Say which device to revoke, or ask for all of them.');
    }

    const removed = await revokeTrustedDevice('staff', session.user.id, id);
    if (!removed) return fail(res, ERR.NOT_FOUND, 'That device is not on the list.');

    await auditStaff(session.user, AUDIT.TRUSTED_DEVICE_REVOKED, {}, {
      targetTable: 'gftvhello_trusted_devices',
      targetId: id,
    });

    return ok(res, { revoked: id });
  } catch (cause) {
    return failInternal(res, cause, 'staff trusted devices');
  }
}
