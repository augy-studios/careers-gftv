// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/totp.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. A second factor belongs to the account, not to a site.
//
// Nothing differs from the portal's copy but this banner.
// TOTP, RFC 6238, for the staff realm only.
//
// Section 5a: verify against gftvhello_users.totp_secret with a one step
// window either side. That secret belongs to the existing gftv.asia sign in,
// so this file has to match whatever that implementation does rather than
// choose its own parameters. The defaults below are the ones every
// authenticator app assumes and the ones every common library ships with:
// SHA-1, six digits, a thirty second step. If a staff code is rejected while
// the app shows the right number, these three are the first thing to check
// against the gftv.asia implementation.
//
// Written by hand rather than pulled from npm. It is forty lines of HMAC and
// one dependency fewer in a serverless function.
//
// Nothing here enrols a secret. The portal never writes to gftvhello_users,
// per section 2, so enrolment stays where it already happens.

import { createHmac, timingSafeEqual } from 'node:crypto';

const DIGITS = 6;
const STEP_SECONDS = 30;
const ALGORITHM = 'sha1';

/** How many steps either side of now are accepted. Section 5a says one. */
const WINDOW = 1;

/**
 * Decode a base32 secret, the format authenticator apps and otpauth URLs use.
 *
 * Tolerates lower case, spaces, and the padding an exported secret sometimes
 * carries. Returns null on anything that is not base32, so a malformed secret
 * fails closed rather than verifying against garbage.
 *
 * @param {string} secret
 * @returns {Buffer|null}
 */
export function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(secret ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '');

  if (cleaned === '') return null;

  let bits = 0;
  let value = 0;
  const out = [];

  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index < 0) return null;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return out.length > 0 ? Buffer.from(out) : null;
}

/**
 * The code for one time step.
 * @param {Buffer} key
 * @param {number} counter
 * @returns {string} zero padded, DIGITS long
 */
function hotp(key, counter) {
  const buffer = Buffer.alloc(8);
  // The counter is 64 bit. JavaScript numbers are exact to 2^53, which covers
  // every timestamp this code will ever see, so the high half is written from
  // a floored division rather than with BigInt.
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(ALGORITHM, key).update(buffer).digest();

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Verify a code against a secret, accepting one step either side of now.
 *
 * The comparison is constant time, and every candidate step is compared even
 * after a match, so neither the code nor which step matched is timeable.
 *
 * @param {string} code as typed, spaces allowed
 * @param {string|null} secret base32, from gftvhello_users.totp_secret
 * @param {{ at?: Date }} [options] for tests
 * @returns {boolean}
 */
export function verifyTotp(code, secret, options = {}) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length !== DIGITS) return false;

  const key = decodeBase32(secret);
  if (!key) return false;

  const now = options.at instanceof Date ? options.at.getTime() : Date.now();
  const counter = Math.floor(now / 1000 / STEP_SECONDS);

  let matched = false;
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = hotp(key, counter + offset);
    if (constantTimeEqual(candidate, digits)) matched = true;
  }

  return matched;
}

/**
 * Whether an account has app based 2FA at all. A null secret means the login
 * skips the second step, per step 8 of 5a.
 * @param {string|null|undefined} secret
 */
export function hasTotp(secret) {
  return typeof secret === 'string' && secret.trim() !== '';
}

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
