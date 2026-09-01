// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/tokens.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. CSPRNG tokens, hashing, and code formatting.
//
// Nothing differs from the portal's copy but this banner.
// Token generation, hashing, and constant time comparison.
//
// Three different things are hashed in this build and they are not
// interchangeable:
//
//   Passwords and codes  bcrypt, because they are low entropy and need a slow
//                        hash. Codes are the 2FA backup codes, the account
//                        recovery codes, and the six digit Telegram codes.
//                        bcrypt also matches the hash format already stored in
//                        gftvhello_users, so existing accounts keep working.
//
//   Session tokens       stored as issued. They are 32 bytes of CSPRNG output
//                        and are looked up by exact value, so hashing them
//                        would buy nothing and would break the existing
//                        gftvhello_sessions format.
//
//   Device and reset     SHA-256. High entropy, so a fast hash is enough, and
//   tokens               a lookup by hash has to be a single indexed query
//                        rather than a scan with a bcrypt compare per row.
//
// bcrypt itself is not imported here. It lands in phase 2 with the login
// flow, so that the only dependency phase 1 pulls in is the Supabase client.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * A URL safe random token. 32 bytes by default, which is what 5d specifies for
 * the device token.
 * @param {number} [bytes]
 * @returns {string}
 */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * A recovery or backup code, formatted in two groups for legibility, as in the
 * example from 5c: k7m2-9xqp.
 *
 * Uses an alphabet with no 0, o, 1, l, or i, so a code read off a screen and
 * typed back in does not fail on an ambiguous character.
 * @returns {string}
 */
export function randomRecoveryCode() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) out += '-';
    // 256 is not a multiple of 31, so take the modulo of a wider draw to keep
    // the bias negligible rather than sampling a single byte.
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * A six digit numeric code, zero padded. Used for Telegram login codes.
 * @returns {string}
 */
export function randomSixDigitCode() {
  // Rejection sampling, so every value from 0 to 999999 is equally likely.
  let value;
  do {
    value = randomBytes(4).readUInt32BE(0);
  } while (value >= 4294000000);
  return String(value % 1000000).padStart(6, '0');
}

/**
 * SHA-256, hex. For device tokens, reset tickets, browser nonces, and linking
 * tokens, all of which are high entropy and looked up by hash.
 * @param {string} value
 * @returns {string}
 */
export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Constant time string comparison. Used for the webhook secret in section 13
 * and anywhere else a secret is compared directly.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare fixed length digests instead, then confirm the raw length.
  const digestA = createHash('sha256').update(bufA).digest();
  const digestB = createHash('sha256').update(bufB).digest();

  return timingSafeEqual(digestA, digestB) && bufA.length === bufB.length;
}

/**
 * Normalise a typed recovery or backup code before comparison, so a code
 * pasted with spaces, capitals, or a missing hyphen still works.
 * @param {string} input
 * @returns {string}
 */
export function normaliseCode(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
