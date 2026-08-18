// Cookie reading and writing.
//
// Four cookies exist across the two realms, and they never share a name:
//
//   gftv_staff_session       staff session, expiry matches the session row
//   gftv_staff_device        staff trusted device token, long lived
//   gftv_applicant_session   applicant session, expiry matches the session row
//   gftv_applicant_device    applicant trusted device token, long lived
//
// The device cookie is separate from the session cookie on purpose, per 5d, so
// it survives logout. Logging out should not mean answering the second factor
// again on your own laptop.
//
// Everything is HttpOnly, Secure, SameSite=Lax, path /. Lax rather than Strict
// because a link into the site from Telegram or from a shared posting URL must
// still arrive signed in.

export const COOKIE = Object.freeze({
  staffSession: 'gftv_staff_session',
  staffDevice: 'gftv_staff_device',
  applicantSession: 'gftv_applicant_session',
  applicantDevice: 'gftv_applicant_device',
  // Set at magic link request time and checked on consumption, so a forwarded
  // link is useless to anyone else. See section 15.
  magicLinkNonce: 'gftv_magic_nonce',
  // Set when a recovery code is verified and checked when the new password is
  // submitted, so the reset ticket is bound to one browser. See 5c.
  resetNonce: 'gftv_reset_nonce',
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
  const site = process.env.SITE_URL ?? '';
  return site.startsWith('http://localhost') || site.startsWith('http://127.0.0.1');
}
