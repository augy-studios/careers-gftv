// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The portal has no equivalent and never will: it has one staff area behind one
// access rule, and this site has four tiers of reader behind one. Generating it
// from something over there would mean inventing the something.
//
// 16a, the gate, in one file. Four tiers, cumulative, so each one sees
// everything the tier below it sees:
//
//   public     anyone, signed out included
//   poster     staff with is_editor and not is_admin
//   admin      staff with is_admin
//   developer  the same accounts as admin, because "admins are the developers of
//              this project, so there is no separate developer flag and none is
//              to be invented"
//
// **Nothing here reads a request.** A tier is derived from a session row that
// session.js has already verified, which is 16a's third rule: "the role is
// derived from the session on the server, and never read from anything the
// client sent". Every caller passes the user object out of getStaffSession, and
// there is deliberately no function taking a role name as a string.

/**
 * The four values a page's `access` front matter key may carry, in order, with
 * the rank each one sits at. The rank is what comparisons use; the name is what
 * a page and a payload carry, since a number in front matter would be a second
 * thing to keep in step.
 */
export const TIER = Object.freeze({
  public: 0,
  poster: 1,
  admin: 2,
  developer: 3,
});

/** The four `access` values, in tier order. 16e: a page carries one of these. */
export const ACCESS_VALUES = Object.freeze(Object.keys(TIER));

/**
 * The rank of an access value, or null when it is not one of the four.
 *
 * Null rather than a default, on purpose. 16e: "fail the build on a page with
 * no access key. A page whose tier was forgotten must not default to public, and
 * defaulting to gated instead just means a page nobody notices is missing." The
 * same argument applies to a misspelling, so an unrecognised value is an error
 * for the caller to raise and never a tier.
 *
 * @param {unknown} access
 * @returns {number|null}
 */
export function tierRank(access) {
  if (typeof access !== 'string') return null;
  return Object.hasOwn(TIER, access) ? TIER[access] : null;
}

/**
 * What a reader may open, from their staff session.
 *
 * @param {null|{ is_admin?: boolean, is_editor?: boolean }} staffUser the user
 *        object from getStaffSession, **after** hasPortalAccess has passed. A
 *        caller that has not applied the access rule passes null.
 * @returns {'public'|'poster'|'developer'}
 *
 * **An account with staff access and no is_admin is a poster**, which covers
 * is_editor and covers an account let in by a gftvjobs_admin_access row with
 * neither flag set. That overlay decides whether somebody may use the staff
 * side at all; the flags decide how much of it. Somebody granted access and then
 * shown nothing but the public guides would read that as the grant having
 * failed, and what the poster guide documents is exactly what their account can
 * reach on the portal.
 *
 * **Admins land on developer and not on admin**, because the two are the same
 * accounts and the tiers are cumulative. The tier says what opens; roleLabel
 * below says what the account is, and they are different questions.
 */
export function readerTier(staffUser) {
  if (!staffUser) return 'public';
  return staffUser.is_admin === true ? 'developer' : 'poster';
}

/**
 * What to call a reader's role on screen, or null when they are signed out.
 *
 * 16b: "show the role in words a reader recognises, job poster or admin, rather
 * than a database flag name." So this is not readerTier's string: a reader is
 * never told they are a "developer", because that is a tier this site invented
 * and not a thing their account says about them.
 *
 * @param {null|{ is_admin?: boolean, is_editor?: boolean }} staffUser
 * @returns {null|'admin'|'job poster'}
 */
export function roleLabel(staffUser) {
  if (!staffUser) return null;
  return staffUser.is_admin === true ? 'admin' : 'job poster';
}

/**
 * Whether a reader at this tier may open a page at that access level.
 *
 * @param {string} readerAccess from readerTier
 * @param {unknown} pageAccess the page's `access` key
 * @returns {boolean}
 *
 * **False for a page whose access value is not one of the four**, which is the
 * direction that matters: a page carrying `acces: admin` resolves to null here
 * and is refused to everybody, including an admin. Loud in one place, and the
 * loader below refuses to list it at all.
 */
export function canRead(readerAccess, pageAccess) {
  const reader = tierRank(readerAccess);
  const page = tierRank(pageAccess);
  if (reader === null || page === null) return false;
  return reader >= page;
}
