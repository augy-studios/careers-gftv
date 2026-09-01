// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/trusted-devices.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical, and the table is shared while the cookie is not. Trusting a
// browser here does not trust it on the portal, per 5h, because the device
// cookie is host scoped -- but gftvhello_trusted_devices has no column saying
// which site wrote a row, so this endpoint lists and revokes both sites'
// devices for the account. The header of the source file is the account of
// that, and it is the same account on both copies.
//
// Nothing differs from the portal's copy but this banner.
// GET  /api/auth/staff/trusted-devices   list them
// POST /api/auth/staff/trusted-devices   { action } revoke or revoke_all
//
// The staff half of 5d. Same shape as the applicant endpoint, against the
// existing gftvhello_trusted_devices table, which stores the token in the
// clear and is not altered by this repo.
//
// That in the clear storage is why the listing selects columns by name and
// never with a star: the token must not leave the server, and a select('*')
// added later by habit would send it to the browser.
//
// **This list is the account's trusted devices, and not this site's.** As of
// phase 13 part 2 the docs site writes the same table with its own device
// cookie, so each site's settings page lists rows the other created, and
// revoking one here revokes it there. 5f asks for them "listed per site with a
// label saying which", and that is the one thing this table cannot answer: it
// has no label column and no site column, and section 2 forbids adding either
// to a gftvhello_ table. So the page says what is true instead of implying a
// scope it does not have. Trust is still earned per site -- the cookie is host
// scoped, and trusting the portal does not trust the docs site -- which is the
// half a reader is most likely to get wrong in the other direction.

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
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

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



    if (body.action === 'revoke_all') {
      await revokeAllTrustedDevices('staff', session.user.id);
      await auditStaff(session.user, AUDIT.TRUSTED_DEVICES_REVOKED_ALL, {}, {
        targetTable: 'gftvhello_trusted_devices',
      });

      return ok(res, { revoked_all: true });
    }

    const id = typeof body.id === 'string' ? body.id : '';
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
