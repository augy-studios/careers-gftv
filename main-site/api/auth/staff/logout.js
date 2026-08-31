// POST /api/auth/staff/logout
//
// Deletes the gftvjobs_staff_sessions row and clears the staff session cookie. One
// of the four gftvhello writes section 2 allows.
//
// The staff device cookie is left alone, per 5d. Signing out of the portal is
// not the same as saying this laptop is no longer yours, and revoking a device
// is its own action on trusted-devices.

import { ok, methodNotAllowed, failInternal } from '../../_lib/respond.js';
import { endSession } from '../../_lib/session.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  try {
    await endSession(req, res, 'staff');
    return ok(res, { signed_out: true });
  } catch (cause) {
    return failInternal(res, cause, 'staff logout');
  }
}
