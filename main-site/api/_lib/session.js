// Sessions and trusted devices, for both realms.
//
// The two realms are fully separate: separate tables, separate cookies,
// separate helpers. Nothing here lets a staff session satisfy an applicant
// check or the other way round, and there is no shared "current user".
//
//   Staff      gftvhello_users + gftvhello_sessions, cookie gftv_staff_session
//   Applicant  gftvjobs_users  + gftvjobs_sessions,  cookie gftv_applicant_session
//
// Phase 1 wrote the read path. Phase 2 added the creation path, logout,
// wholesale invalidation, and the trusted device handling from 5d.
//
// About the gftvhello column names, and why they are collected in one object
// below: this repo does not own the gftvhello namespace and cannot migrate it,
// so every name it uses against those tables started as an assumption from
// section 5a. One of them was wrong, and a staff sign in failed on the live
// site because of it. HELLO is where a mismatch is one edit rather than a
// search across the staff routes, and the sign in path no longer names a
// primary key at all: see the note on HELLO.

import { supabase, T } from './supabase.js';
import { COOKIE, readCookie, setCookie, clearCookie } from './cookies.js';
import { ERR, fail } from './respond.js';
import { randomToken, sha256 } from './tokens.js';

/**
 * The gftvhello column names this portal reads and writes.
 *
 * Only the session, challenge, trusted device, and backup code rows are ever
 * written, per section 2. gftvhello_users is read only, always.
 *
 * These names are no longer assumptions. They were, until a staff sign in
 * failed on the live site with 42703, and the four real schemas were then read
 * off the database. Two of them did not match what section 5a implied:
 *
 *   gftvhello_totp_challenges   token is the primary key. There is no id.
 *   gftvhello_trusted_devices   the token column is device_token, and there is
 *                               no last_used_at and no label at all.
 *
 * The other two were as expected: gftvhello_sessions and gftvhello_backup_codes
 * both carry a uuid id, plus the columns below.
 *
 * Confirmed, 19 August 2026:
 *
 *   sessions      id, user_id, token (unique), expires_at, created_at
 *   challenges    token (pk), user_id, expires_at
 *   devices       id, user_id, device_token (unique), expires_at
 *   backupCodes   id, user_id, code_hash, created_at
 *
 * If any of these changes on the gftv.asia side, this object is the one edit.
 */
export const HELLO = Object.freeze({
  sessions: { id: 'id', userId: 'user_id', token: 'token', expiresAt: 'expires_at' },
  // No id on this one. The token is the primary key.
  challenges: { userId: 'user_id', token: 'token', expiresAt: 'expires_at' },
  // device_token, not token. No last_used_at, and no label: see
  // listTrustedDevices for what that costs and how it is handled.
  devices: {
    id: 'id',
    userId: 'user_id',
    token: 'device_token',
    expiresAt: 'expires_at',
  },
  backupCodes: { id: 'id', userId: 'user_id', codeHash: 'code_hash' },
});

/**
 * Session lengths from 5d. "Stay signed in" is about the session and nothing
 * else. It is a separate control from "trust this device", which is about the
 * second factor, and the two must never be collapsed into one checkbox.
 */
export const SESSION_HOURS_SHORT = 12;
export const SESSION_DAYS_LONG = 30;
export const TRUSTED_DEVICE_DAYS = 30;

/** How long a 2FA challenge stays open. Long enough to fetch a phone. */
export const CHALLENGE_MINUTES = 10;

/**
 * Expiry for a new session.
 * @param {boolean} staySignedIn
 * @returns {Date}
 */
export function sessionExpiry(staySignedIn) {
  const ms = staySignedIn
    ? SESSION_DAYS_LONG * 24 * 60 * 60 * 1000
    : SESSION_HOURS_SHORT * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

/** Expiry for a trusted device, always 30 days from now. */
export function deviceExpiry() {
  return new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------
 * Reading a session
 * ---------------------------------------------------------------------- */

/**
 * Read the applicant session, or null.
 *
 * Expired rows are deleted on read rather than left to the cron, so a session
 * that has just lapsed cannot be used in the window before the sweep.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<null | { sessionId: string, user: object }>}
 */
export async function getApplicantSession(req) {
  const token = readCookie(req, COOKIE.applicantSession);
  if (!token) return null;

  const { data, error } = await supabase
    .from(T.sessions)
    .select(
      `id, expires_at,
       user:${T.users} ( id, username, display_name, email, avatar_url, phone, locale, totp_secret, is_active, created_at )`
    )
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] getApplicantSession:', error);
    return null;
  }
  if (!data || !data.user) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from(T.sessions).delete().eq('id', data.id);
    return null;
  }

  // A deactivated account keeps its rows but cannot act. Section 8.9 lets an
  // admin deactivate and reactivate.
  if (data.user.is_active === false) return null;

  return { sessionId: data.id, user: data.user, expiresAt: data.expires_at };
}

/**
 * Read the staff session, or null. Does not check portal access on its own,
 * since section 8 requires that to be re-checked per request. Use
 * requireStaff, which does both.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<null | { sessionId: string, user: object }>}
 */
export async function getStaffSession(req) {
  const token = readCookie(req, COOKIE.staffSession);
  if (!token) return null;

  const { data, error } = await supabase
    .from(T.staffSessions)
    .select(
      `${HELLO.sessions.id}, ${HELLO.sessions.expiresAt},
       user:${T.staffUsers} ( id, username, is_approved, is_admin, is_editor, totp_secret )`
    )
    .eq(HELLO.sessions.token, token)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] getStaffSession:', error);
    return null;
  }
  if (!data || !data.user) return null;

  const sessionId = data[HELLO.sessions.id];
  const expiresAt = data[HELLO.sessions.expiresAt];

  if (new Date(expiresAt).getTime() <= Date.now()) {
    // Deleting an expired session row is within the narrow set of gftvhello
    // writes section 2 allows.
    await supabase.from(T.staffSessions).delete().eq(HELLO.sessions.id, sessionId);
    return null;
  }

  return { sessionId, user: data.user, expiresAt };
}

/* -------------------------------------------------------------------------
 * Creating and ending a session
 * ---------------------------------------------------------------------- */

/**
 * Insert an applicant session row and set the cookie.
 *
 * The token is 32 bytes of CSPRNG output stored as issued, per the note in
 * tokens.js: it is looked up by exact value and hashing it would buy nothing
 * while breaking the format the gftvhello pair already uses.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @param {boolean} staySignedIn
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createApplicantSession(res, userId, staySignedIn) {
  const token = randomToken(32);
  const expiresAt = sessionExpiry(Boolean(staySignedIn));

  const { error } = await supabase.from(T.sessions).insert({
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw new Error(`could not create the applicant session: ${error.message}`);

  setCookie(res, COOKIE.applicantSession, token, { expires: expiresAt });
  return { token, expiresAt };
}

/**
 * Insert a staff session row and set the cookie. One of the four gftvhello
 * writes this portal is allowed to make.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @param {boolean} staySignedIn
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createStaffSession(res, userId, staySignedIn) {
  const token = randomToken(32);
  const expiresAt = sessionExpiry(Boolean(staySignedIn));

  const { error } = await supabase.from(T.staffSessions).insert({
    [HELLO.sessions.userId]: userId,
    [HELLO.sessions.token]: token,
    [HELLO.sessions.expiresAt]: expiresAt.toISOString(),
  });

  if (error) throw new Error(`could not create the staff session: ${error.message}`);

  setCookie(res, COOKIE.staffSession, token, { expires: expiresAt });
  return { token, expiresAt };
}

/**
 * Delete a session row. The device cookie is deliberately left alone: 5d says
 * it survives logout, so signing out does not mean answering the second factor
 * again on your own laptop.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} sessionId
 */
export async function destroySession(realm, sessionId) {
  const table = realm === 'staff' ? T.staffSessions : T.sessions;
  const idColumn = realm === 'staff' ? HELLO.sessions.id : 'id';
  const { error } = await supabase.from(table).delete().eq(idColumn, sessionId);
  if (error) console.error('[careers-gftv] destroySession:', error);
}

/**
 * End the session in the request and clear its cookie.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {'staff'|'applicant'} realm
 */
export async function endSession(req, res, realm) {
  const cookieName = realm === 'staff' ? COOKIE.staffSession : COOKIE.applicantSession;
  const token = readCookie(req, cookieName);

  if (token) {
    const table = realm === 'staff' ? T.staffSessions : T.sessions;
    const column = realm === 'staff' ? HELLO.sessions.token : 'token';
    const { error } = await supabase.from(table).delete().eq(column, token);
    if (error) console.error('[careers-gftv] endSession:', error);
  }

  clearCookie(res, cookieName);
}

/**
 * Delete every session for one account. Required by 5c after a password reset,
 * and by the password change in 7g.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {{ keepSessionId?: string }} [options] so changing your password does
 *        not sign you out of the tab you changed it in.
 */
export async function invalidateAllSessions(realm, userId, options = {}) {
  const table = realm === 'staff' ? T.staffSessions : T.sessions;
  const userColumn = realm === 'staff' ? HELLO.sessions.userId : 'user_id';

  const idColumn = realm === 'staff' ? HELLO.sessions.id : 'id';

  let query = supabase.from(table).delete().eq(userColumn, userId);
  if (options.keepSessionId) query = query.neq(idColumn, options.keepSessionId);

  const { error } = await query;
  if (error) console.error('[careers-gftv] invalidateAllSessions:', error);
}

/* -------------------------------------------------------------------------
 * Trusted devices, 5d
 * ---------------------------------------------------------------------- */

// One cookie holds one device token per realm. The applicant table stores
// sha256(userId + ':' + token) rather than sha256(token), for two reasons.
//
// First, it keeps the unique constraint on device_token_hash usable when two
// accounts trust the same browser, which 5d explicitly allows.
//
// Second, it means a stolen row discloses nothing that can be replayed against
// another account even if that account shares the browser.
//
// The trade-off, stated rather than discovered later: 5d requires the token to
// rotate on every successful use, and there is one cookie. On a browser where
// two accounts are both trusted, signing into one rotates the token and leaves
// the other account's row pointing at the previous value, so that account
// answers the second factor once more and is then re-trusted. That is the safe
// direction to fail in, and a shared browser is the case 5d already tells
// people not to tick the box on.

function applicantDeviceHash(userId, token) {
  return sha256(`${userId}:${token}`);
}

/**
 * Whether this browser is a trusted device for this applicant. Rotates the
 * token and pushes the expiry out when it is.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function useApplicantTrustedDevice(req, res, userId) {
  const token = readCookie(req, COOKIE.applicantDevice);
  if (!token) return false;

  const { data, error } = await supabase
    .from(T.trustedDevices)
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('device_token_hash', applicantDeviceHash(userId, token))
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] useApplicantTrustedDevice:', error);
    return false;
  }
  if (!data) return false;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from(T.trustedDevices).delete().eq('id', data.id);
    return false;
  }

  await rotateApplicantDevice(res, userId, data.id);
  return true;
}

async function rotateApplicantDevice(res, userId, rowId) {
  const next = randomToken(32);
  const expiresAt = deviceExpiry();

  const { error } = await supabase
    .from(T.trustedDevices)
    .update({
      device_token_hash: applicantDeviceHash(userId, next),
      last_used_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', rowId);

  if (error) {
    // The old token stays valid, so the worst case is that the rotation is
    // skipped this time rather than that the device is locked out.
    console.error('[careers-gftv] rotateApplicantDevice:', error);
    return;
  }

  setCookie(res, COOKIE.applicantDevice, next, { expires: expiresAt });
}

/**
 * Record this browser as trusted for this applicant. Only ever called after
 * the second factor has been satisfied, per 5d.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @param {string|null} label
 */
export async function trustApplicantDevice(res, userId, label = null) {
  const token = randomToken(32);
  const expiresAt = deviceExpiry();

  const { error } = await supabase.from(T.trustedDevices).insert({
    user_id: userId,
    device_token_hash: applicantDeviceHash(userId, token),
    label,
    last_used_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[careers-gftv] trustApplicantDevice:', error);
    return;
  }

  setCookie(res, COOKIE.applicantDevice, token, { expires: expiresAt });
}

/**
 * Whether this browser is a trusted device for this staff account. Rotates on
 * use, exactly as the applicant side does.
 *
 * The gftvhello table stores the token in the clear, per 5d, since it is an
 * existing table with compatibility to preserve. Every lookup is filtered by
 * user as well as by token, so a token belonging to another account on the
 * same browser can never match.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function useStaffTrustedDevice(req, res, userId) {
  const token = readCookie(req, COOKIE.staffDevice);
  if (!token) return false;

  const { data, error } = await supabase
    .from(T.staffTrustedDevices)
    .select(`${HELLO.devices.expiresAt}`)
    .eq(HELLO.devices.userId, userId)
    .eq(HELLO.devices.token, token)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] useStaffTrustedDevice:', error);
    return false;
  }
  if (!data) return false;

  const expiresAt = data[HELLO.devices.expiresAt];
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;

  const next = randomToken(32);
  const nextExpiry = deviceExpiry();

  // No last_used_at to write: the column does not exist on this table and
  // section 2 forbids adding one. Pushing expires_at out is the only trace a
  // use leaves, which is also what makes it recoverable in listTrustedDevices.
  const { error: updateError } = await supabase
    .from(T.staffTrustedDevices)
    .update({
      [HELLO.devices.token]: next,
      [HELLO.devices.expiresAt]: nextExpiry.toISOString(),
    })
    // By the token this portal issued, not by an assumed primary key. The
    // filter on user is what makes it exactly one row.
    .eq(HELLO.devices.userId, userId)
    .eq(HELLO.devices.token, token);

  if (updateError) {
    console.error('[careers-gftv] useStaffTrustedDevice rotate:', updateError);
    return true;
  }

  setCookie(res, COOKIE.staffDevice, next, { expires: nextExpiry });
  return true;
}

/**
 * Record this browser as trusted for this staff account.
 * @param {import('http').ServerResponse} res
 * @param {string} userId
 * @param {string|null} label
 */
export async function trustStaffDevice(res, userId, label = null) {
  const token = randomToken(32);
  const expiresAt = deviceExpiry();

  // The label is accepted and dropped. gftvhello_trusted_devices has no column
  // for it, and section 2 forbids adding one. The parameter stays so the two
  // realms have the same shape and the applicant side can still use it.
  void label;

  const { error } = await supabase.from(T.staffTrustedDevices).insert({
    [HELLO.devices.userId]: userId,
    [HELLO.devices.token]: token,
    [HELLO.devices.expiresAt]: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[careers-gftv] trustStaffDevice:', error);
    return;
  }

  setCookie(res, COOKIE.staffDevice, token, { expires: expiresAt });
}

/**
 * Revoke every trusted device for one account. Required by 5c after a reset
 * and by 5d after a password change.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 */
export async function revokeAllTrustedDevices(realm, userId) {
  const table = realm === 'staff' ? T.staffTrustedDevices : T.trustedDevices;
  const column = realm === 'staff' ? HELLO.devices.userId : 'user_id';

  const { error } = await supabase.from(table).delete().eq(column, userId);
  if (error) console.error('[careers-gftv] revokeAllTrustedDevices:', error);
}

/**
 * Revoke one trusted device, by row id, checked against the owner so an id
 * from another account cannot be revoked.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {string} deviceId
 * @returns {Promise<boolean>} whether a row was removed
 */
export async function revokeTrustedDevice(realm, userId, deviceId) {
  const table = realm === 'staff' ? T.staffTrustedDevices : T.trustedDevices;
  const userColumn = realm === 'staff' ? HELLO.devices.userId : 'user_id';
  const idColumn = realm === 'staff' ? HELLO.devices.id : 'id';

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq(userColumn, userId)
    .eq(idColumn, deviceId)
    .select(idColumn);

  if (error) {
    console.error('[careers-gftv] revokeTrustedDevice:', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * List the trusted devices for an account, for the settings page in 5d.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 */
export async function listTrustedDevices(realm, userId) {
  const isStaff = realm === 'staff';
  const table = isStaff ? T.staffTrustedDevices : T.trustedDevices;
  const userColumn = isStaff ? HELLO.devices.userId : 'user_id';

  // The token itself is never selected, in either realm. The gftvhello table
  // holds it in the clear and it must not leave the server.
  //
  // The staff table has neither a label nor a last_used_at, so the staff list
  // is thinner than 5d describes and there is nowhere to put the missing
  // columns without altering a table section 2 says not to touch.
  //
  // Last used is recovered rather than stored. Every successful use rotates the
  // token and sets expires_at to exactly 30 days out, so expires_at minus 30
  // days is when the device was last used, to the second. That holds because
  // this portal is the only thing that writes the column that way; if
  // gftv.asia ever writes it differently the value becomes an approximation,
  // which is why it is derived here and not presented as a stored fact.
  const columns = isStaff
    ? `${HELLO.devices.id}, ${HELLO.devices.expiresAt}`
    : 'id, label, last_used_at, created_at, expires_at';

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq(userColumn, userId)
    .order(isStaff ? HELLO.devices.expiresAt : 'created_at', { ascending: false });

  if (error) {
    console.error('[careers-gftv] listTrustedDevices:', error);
    return [];
  }

  return (data ?? []).map((row) => {
    if (!isStaff) {
      return {
        id: row.id,
        label: row.label ?? null,
        last_used_at: row.last_used_at ?? null,
        expires_at: row.expires_at ?? null,
      };
    }

    const expiresAt = row[HELLO.devices.expiresAt] ?? null;
    const lastUsed = expiresAt
      ? new Date(
          new Date(expiresAt).getTime() - TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;

    return {
      id: row[HELLO.devices.id],
      label: null,
      last_used_at: lastUsed,
      expires_at: expiresAt,
    };
  });
}

/**
 * A label for a new trusted device, from the user agent. Coarse on purpose:
 * enough for someone to recognise their own laptop in a list, and not a
 * fingerprint. No IP address, per the section 6 rule.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function deviceLabel(req) {
  const ua = String(req.headers?.['user-agent'] ?? '');

  const platform = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS'
        : /Mac OS X/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Unknown device';

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'browser';

  return `${platform}, ${browser}`;
}

/* -------------------------------------------------------------------------
 * Access rules and guards
 * ---------------------------------------------------------------------- */

/**
 * The portal access rule, in one place.
 *
 * 1. is_approved must be true. Always required, and no overlay waives it.
 * 2. If gftvjobs_admin_access has a row for this user, its granted value
 *    decides. That table exists so section 8.8 can grant and revoke without
 *    writing to gftvhello_users, which section 2 forbids.
 * 3. Otherwise, is_admin or is_editor, per section 10 item 2.
 *
 * @param {{ id: string, is_approved?: boolean, is_admin?: boolean, is_editor?: boolean }} staffUser
 * @returns {Promise<boolean>}
 */
export async function hasPortalAccess(staffUser) {
  if (!staffUser || staffUser.is_approved !== true) return false;

  const { data, error } = await supabase
    .from(T.adminAccess)
    .select('granted')
    .eq('staff_user_id', staffUser.id)
    .maybeSingle();

  if (error) {
    // Fail closed. An unreadable overlay must never widen access.
    console.error('[careers-gftv] hasPortalAccess:', error);
    return false;
  }

  if (data) return data.granted === true;

  return staffUser.is_admin === true || staffUser.is_editor === true;
}

/**
 * Guard an applicant route. Answers the request and returns null when there is
 * no valid session.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<null | { sessionId: string, user: object }>}
 */
export async function requireApplicant(req, res) {
  const session = await getApplicantSession(req);
  if (session) return session;

  fail(res, ERR.UNAUTHORISED, 'Sign in to your applicant account to do that.');
  return null;
}

/**
 * Guard an admin route. Verifies the session and re-checks the access flags on
 * every request, per section 8. Never trust a client side role value.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ notFoundOnFailure?: boolean }} [options] 8a serves the admin docs
 *        as 404 rather than 401, so their existence is not confirmed to
 *        anyone poking around.
 * @returns {Promise<null | { sessionId: string, user: object }>}
 */
export async function requireStaff(req, res, options = {}) {
  const deny = () => {
    if (options.notFoundOnFailure) {
      fail(res, ERR.NOT_FOUND, 'Not found.');
    } else {
      fail(res, ERR.UNAUTHORISED, 'Sign in with a staff account to do that.');
    }
    return null;
  };

  const session = await getStaffSession(req);
  if (!session) return deny();

  if (!(await hasPortalAccess(session.user))) return deny();

  return session;
}

/**
 * The public shape of an applicant, for /session and /profile. Never includes
 * the password hash or the TOTP secret.
 *
 * Deliberately says nothing about the second factor. It used to report
 * two_factor_enabled from totp_secret, which is permanently null in this realm
 * and so answered "no" for somebody who had just registered a passkey. Whether
 * an applicant has a second factor is a count in gftvjobs_passkeys, which is a
 * query rather than a column on this row, so the routes that need it ask for
 * it and this function does not guess.
 *
 * @param {object} user
 */
export function publicApplicant(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_url: user.avatar_url ?? null,
    phone: user.phone ?? null,
    locale: user.locale ?? 'en',
    created_at: user.created_at ?? null,
  };
}

/**
 * The public shape of a staff account.
 * @param {object} user
 */
export function publicStaff(user) {
  return {
    id: user.id,
    username: user.username,
    is_admin: user.is_admin === true,
    is_editor: user.is_editor === true,
  };
}
