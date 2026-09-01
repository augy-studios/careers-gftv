// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/auth/staff/session.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical.
//
// Nothing differs from the portal's copy but this banner.
// GET /api/auth/staff/session
//
// Who, if anyone, is signed in as staff. The admin shell calls it before
// drawing anything.
//
// The access rule is re-applied here rather than trusted from the session row,
// per section 8: revoking somebody's access has to take effect on their next
// request, not on their next sign in. A session that no longer passes the rule
// answers exactly as no session at all does.

import { ok, methodNotAllowed, failInternal } from '../../_lib/respond.js';
import { getStaffSession, hasPortalAccess, publicStaff } from '../../_lib/session.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  try {
    const session = await getStaffSession(req);
    if (!session) return ok(res, { user: null });

    if (!(await hasPortalAccess(session.user))) return ok(res, { user: null });

    return ok(res, {
      user: publicStaff(session.user),
      expires_at: session.expiresAt ?? null,
      two_factor_enabled: Boolean(session.user.totp_secret),
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff session');
  }
}
