// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// Who is asking, in the one form the gate understands.
//
// Four lines, and it is a file because two routes need them and a gate derived
// twice is a gate that can disagree with itself. Every route on this site that
// decides what to show starts here and nothing re-implements it.

import { getStaffSession, hasPortalAccess } from './session.js';
import { readerTier, roleLabel } from './tiers.js';

/**
 * Resolve the reader of a request: their staff account if they have one this
 * site still accepts, the tier that opens for them, and what to call their role.
 *
 * **The access rule is re-applied on every request** and never trusted from the
 * session row, exactly as `api/auth/staff/session.js` does it and for the reason
 * section 8 gives: revoking somebody's access has to take effect on their next
 * request, not on their next sign in. An account that no longer passes it reads
 * this site as a signed out reader does, which is also what its own session
 * endpoint tells it.
 *
 * **Anything that fails is a signed out reader.** There is no path through here
 * that widens what somebody may open, so a database that cannot be reached
 * costs a signed in reader the staff guides and costs a stranger nothing.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ user: object|null, tier: string, role: string|null }>}
 */
export async function reader(req) {
  const session = await getStaffSession(req);
  const user = session && (await hasPortalAccess(session.user)) ? session.user : null;

  return {
    user,
    tier: readerTier(user),
    role: roleLabel(user),
  };
}
