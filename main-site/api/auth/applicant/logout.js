// POST /api/auth/applicant/logout
//
// Deletes the session row and clears the session cookie. The device cookie is
// deliberately left in place: 5d makes it a separate long lived cookie so that
// signing out does not mean answering the second factor again on your own
// laptop. Revoking a device is its own explicit action, on trusted-devices.
//
// POST rather than GET, so a link or an image in someone else's page cannot
// sign a person out.

import { ok, methodNotAllowed, failInternal } from '../../_lib/respond.js';
import { endSession } from '../../_lib/session.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  try {
    // No session is not an error. The outcome the caller asked for, that they
    // are signed out, is true either way.
    await endSession(req, res, 'applicant');
    return ok(res, { signed_out: true });
  } catch (cause) {
    return failInternal(res, cause, 'applicant logout');
  }
}
