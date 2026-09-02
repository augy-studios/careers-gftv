// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/cookies.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Its own session and device cookie names, per 5h, and its own idea of what
// local development is. Host scoped, and nothing is set on the parent domain.
//
// What differs from the portal's copy, and why:
//   - the header names the cookies this site actually sets
//   - the session and device cookies are gftv_docs_*
//   - the reset nonce is this host's own, gftv_docs_reset_nonce
//   - local development is judged by this site's origin, not the portal's
// Cookie reading and writing.
//
// Two cookies are set here, and both are this host's own:
//
//   gftv_docs_session        docs staff session, expiry matches the row
//   gftv_docs_device         docs trusted device token, long lived
//
// Trusting a device here does not trust it on the portal, per 5h, and 16b
// says to put that beside the checkbox rather than let somebody conclude the
// checkbox failed.
//
// The applicant pair is still in the object below and is never set: this site
// has one realm. It stays because the file is a generated duplicate of the
// portal's, and a copy that quietly drops things is a copy nobody can
// compare.
//
// The device cookie is separate from the session cookie on purpose, per 5d, so
// it survives logout. Logging out should not mean answering the second factor
// again on your own laptop.
//
// Everything is HttpOnly, Secure, SameSite=Lax, path /. Lax rather than Strict
// because a link into the site from Telegram or from a shared posting URL must
// still arrive signed in.

export const COOKIE = Object.freeze({
  staffSession: 'gftv_docs_session',
  staffDevice: 'gftv_docs_device',
  applicantSession: 'gftv_applicant_session',
  applicantDevice: 'gftv_applicant_device',
  // Set at magic link request time and checked on consumption, so a forwarded
  // link is useless to anyone else. See section 15.
  magicLinkNonce: 'gftv_magic_nonce',
  // Set when a recovery code is verified and checked when the new password is
  // submitted, so the reset ticket is bound to one browser. See 5c.
  resetNonce: 'gftv_reset_nonce',
  // The same thing for the staff flow in 5g, and a second name rather than a
  // shared one. The two realms sign in on one host, so a staff member who is
  // also an applicant -- which every member of this team is -- would otherwise
  // have one flow's nonce overwrite the other's mid reset. Everything else here
  // is already named per realm for the same reason.
  staffResetNonce: 'gftv_docs_reset_nonce',
});

/**
 * Parse the Cookie header into a plain object.
 * @param {import('http').IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  // Vercel provides req.cookies on its Node runtime. Fall back to parsing the
  // header so this also works under a plain Node server and in tests.
  if (req.cookies && typeof req.cookies === 'object') return req.cookies;

  const header = req.headers?.cookie;
  if (!header) return {};

  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/**
 * Read one cookie.
 * @param {import('http').IncomingMessage} req
 * @param {string} name
 * @returns {string|null}
 */
export function readCookie(req, name) {
  const value = parseCookies(req)[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Build a Set-Cookie value.
 * @param {string} name
 * @param {string} value
 * @param {{ expires?: Date, maxAge?: number, path?: string, sameSite?: 'Lax'|'Strict'|'None', httpOnly?: boolean, secure?: boolean }} [options]
 */
export function serialiseCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? '/'}`);
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);

  if (options.httpOnly !== false) parts.push('HttpOnly');

  // Secure is on everywhere except plain http localhost, where the browser
  // would otherwise drop the cookie and local development would not work.
  const secure = options.secure ?? !isLocalDev();
  if (secure) parts.push('Secure');

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join('; ');
}

/**
 * Append a Set-Cookie header without clobbering any already set.
 * @param {import('http').ServerResponse} res
 * @param {string} name
 * @param {string} value
 * @param {Parameters<typeof serialiseCookie>[2]} [options]
 */
export function setCookie(res, name, value, options = {}) {
  appendSetCookie(res, serialiseCookie(name, value, options));
}

/**
 * Expire a cookie. Same attributes as when it was set, or the browser keeps it.
 * @param {import('http').ServerResponse} res
 * @param {string} name
 * @param {Parameters<typeof serialiseCookie>[2]} [options]
 */
export function clearCookie(res, name, options = {}) {
  appendSetCookie(
    res,
    serialiseCookie(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    })
  );
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookie]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookie]);
  }
}

function isLocalDev() {
  // DOCS_URL rather than SITE_URL: the cookie being set is this site's, and
  // SITE_URL here is the portal, which can perfectly well be the production
  // one while this is running on localhost.
  const site = process.env.DOCS_URL ?? '';
  return site.startsWith('http://localhost') || site.startsWith('http://127.0.0.1');
}
