// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/logout.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical.
//
// Nothing differs from the portal's copy but this banner.
// POST /api/auth/staff/logout
//
// Deletes the gftvjobs_staff_sessions row and clears the staff session cookie.
// Since migration 038 that row is this build's own and is no longer one of the
// gftvhello writes section 2 permits.
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
