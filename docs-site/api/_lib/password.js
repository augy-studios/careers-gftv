// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/password.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The same bcrypt hashes in the same gftvhello_users rows.
//
// Nothing differs from the portal's copy but this banner.
// Passwords and codes, both hashed with bcrypt.
//
// bcrypt rather than argon2 or scrypt because gftvhello_users already holds
// bcrypt hashes and section 2 requires that existing accounts keep working.
// Using the same algorithm for the applicant realm means one implementation
// rather than two, and one place to raise the cost factor later.
//
// Three kinds of secret go through this file:
//
//   Passwords        applicant passwords we create, staff passwords we only
//                    ever verify. Never written to a gftvhello row.
//   Recovery codes   gftvjobs_recovery_codes, a full account credential.
//   Backup codes     gftvjobs_2fa_backup_codes and gftvhello_backup_codes,
//                    good for the second factor only.
//
// The codes are low entropy by design, since a person has to type one, which
// is exactly why they get a slow hash rather than SHA-256.

import bcrypt from 'bcryptjs';
import { normaliseCode } from './tokens.js';

/**
 * Cost factor. 12 is roughly 250ms on the Vercel Node runtime, which is slow
 * enough to matter to an attacker and fast enough that a login does not feel
 * stalled. Raising it does not invalidate existing hashes: bcrypt records the
 * cost in the hash, so old ones keep verifying at their own factor.
 */
const ROUNDS = 12;

/**
 * The password rule, in one place. Section 5b asks for a stated minimum. The
 * number is repeated on screen through the auth.passwordHint dictionary key,
 * so change both together.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * A hash to compare against when no account was found.
 *
 * Returning early on an unknown username would answer measurably faster than a
 * wrong password does, which is a username oracle no matter how generic the
 * error text is. Verifying against this instead costs the same as a real
 * failure. It is a real bcrypt hash of a value nothing can supply, since the
 * plaintext is thrown away here.
 */
const DUMMY_HASH = '$2a$12$9S.9kxE/etBNq4UBisxl7ORP75tDZWrG9w7T9znqxqiW15PvNmdI6';

/**
 * Hash a password or a code.
 * @param {string} plain
 * @returns {Promise<string>}
 */
export function hashSecret(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

/**
 * Verify a password or a code against a stored hash.
 *
 * A null or malformed hash still costs a full bcrypt round against the dummy,
 * so "this account has no password set" is not timeable either.
 *
 * @param {string} plain
 * @param {string|null|undefined} hash
 * @returns {Promise<boolean>}
 */
export async function verifySecret(plain, hash) {
  const candidate = typeof hash === 'string' && hash.startsWith('$2') ? hash : DUMMY_HASH;
  const matched = await bcrypt.compare(String(plain ?? ''), candidate);
  return candidate === DUMMY_HASH ? false : matched;
}

/**
 * Burn one bcrypt round without a stored hash to compare against. Called on
 * the unknown account branch of every login, so that branch costs what the
 * wrong password branch costs.
 * @param {string} plain
 * @returns {Promise<false>}
 */
export async function verifyAgainstNothing(plain) {
  await bcrypt.compare(String(plain ?? ''), DUMMY_HASH);
  return false;
}

/**
 * Check a proposed password against the stated rule.
 *
 * Length only, deliberately. Composition rules push people towards Password1!
 * and are worse than a longer minimum. The upper bound is there because bcrypt
 * ignores everything past 72 bytes and an unbounded input is a cheap way to
 * make the server do work.
 *
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function checkPasswordStrength(value) {
  if (typeof value !== 'string' || value === '') {
    return { ok: false, code: 'password_required' };
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, code: 'password_too_short' };
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, code: 'password_too_long' };
  }
  return { ok: true };
}

/**
 * Find which of a set of stored code hashes a typed code matches, or null.
 *
 * One bcrypt compare per row, which is why a set is ten codes and not a
 * thousand. Every row is compared even after a match is found, so the time
 * taken does not reveal the position of the matching code.
 *
 * @param {string} typed the code as the person typed it
 * @param {{ id: string, code_hash: string }[]} rows
 * @returns {Promise<string|null>} the matching row id
 */
export async function findMatchingCode(typed, rows) {
  const normalised = normaliseCode(typed);
  if (normalised.length === 0) return null;

  // Codes are stored hashed in their normalised form, so a code typed with
  // spaces, capitals, or no hyphen still matches what was issued.
  let matchedId = null;
  for (const row of rows) {
    const isMatch = await verifySecret(normalised, row.code_hash);
    if (isMatch && matchedId === null) matchedId = row.id;
  }
  return matchedId;
}

/**
 * Hash a freshly generated set of codes for storage.
 *
 * The column the account id goes in is an argument because the four code tables
 * do not agree on it: three call it `user_id` and
 * `gftvjobs_staff_recovery_codes` calls it `staff_user_id`, matching the two
 * session tables migration `038` created beside it. accounts.js is the only
 * caller and it reads the name out of CODE_SET, so the disagreement is recorded
 * in one table there instead of being remembered here.
 *
 * @param {string[]} codes as shown to the person, with the hyphen
 * @param {string} userId
 * @param {string} [column] which column holds the account id
 * @returns {Promise<Record<string, string>[]>}
 */
export async function hashCodeSet(codes, userId, column = 'user_id') {
  return Promise.all(
    codes.map(async (code) => ({
      [column]: userId,
      code_hash: await hashSecret(normaliseCode(code)),
    }))
  );
}
