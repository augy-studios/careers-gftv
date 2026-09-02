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
// **This file gained an enrolment half in phase 13 part 6, and the sentence it
// replaces said the opposite.** It read: "Nothing here enrols a secret. The
// portal never writes to gftvhello_users, per section 2, so enrolment stays
// where it already happens." That was true of every phase up to this one.
//
// What changed is 5f, which asks the staff account settings suite for the
// authenticator app "enrolment status and last used, enrol and remove, per 5a",
// and asks its danger zone for removal a second time. A TOTP secret lives in
// exactly one column in this database, gftvhello_users.totp_secret, so there is
// no way to build what 5f asks for without writing it. Phase 13 decision 7
// settled that with the conflict on the table: **totp_secret is section 2's
// second named exception, beside password_hash from 5g, and there is no third.**
//
// The consequence is the one 5g states about the first exception, in the same
// shape: it is one account, so enrolling or removing here changes the second
// factor at gftv.asia too. Every page offering either action says that in words
// before it offers it, and every one writes an audit row before it executes.
//
// **What this file still does not do is choose the parameters.** The secret it
// generates has to be one the existing gftv.asia sign in can verify, so the
// three constants below are unchanged and are still read as that
// implementation's rather than as this one's.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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

/* -------------------------------------------------------------------------
 * Enrolment, phase 13 part 6
 * ---------------------------------------------------------------------- */

/** Bytes of entropy in a generated secret. RFC 4226 says at least 128 bits. */
const SECRET_BYTES = 20;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * A fresh base32 secret for an authenticator app.
 *
 * 160 bits, which is what RFC 4226 recommends for SHA-1 and what every
 * authenticator app expects to be handed. Unpadded: the `=` an encoder would
 * add is legal base32 and several apps refuse a secret carrying it, and
 * decodeBase32 above strips it anyway.
 *
 * @returns {string}
 */
export function generateTotpSecret() {
  const bytes = randomBytes(SECRET_BYTES);

  let bits = 0;
  let value = 0;
  let out = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];

  return out;
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The three parameters are written out rather than left to the app's defaults.
 * They are already the defaults everywhere, which is exactly why an app that
 * quietly assumed something else would be a code rejected with no visible
 * cause — and this is the one place the three constants leave this file, so a
 * change to them travels to the app instead of silently disagreeing with it.
 *
 * **The label carries the username and never the display name.** An
 * authenticator lists dozens of entries with no room to disambiguate, so what
 * goes in it has to be the thing that identifies the account when somebody is
 * signing in, and a display name is neither unique nor stable.
 *
 * @param {{ username: string, issuer: string, secret: string }} account
 * @returns {string}
 */
export function otpauthUri({ username, issuer, secret }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;

  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${parameters.toString()}`;
}

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
