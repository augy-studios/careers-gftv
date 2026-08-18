// Session reading for both realms.
//
// The two realms are fully separate: separate tables, separate cookies,
// separate helpers. Nothing here lets a staff session satisfy an applicant
// check or the other way round, and there is no shared "current user".
//
//   Staff      gftvhello_users + gftvhello_sessions, cookie gftv_staff_session
//   Applicant  gftvjobs_users  + gftvjobs_sessions,  cookie gftv_applicant_session
//
// Nothing in this file writes a session. Login lands in phase 2 and owns the
// creation side. This is the read path, plus the access rule, plus the session
// length constants, so that the rules live in one place from the start.
//
// Note before phase 2: the column names used against gftvhello_sessions here
// follow section 5b, which describes gftvjobs_sessions as "modelled on the
// gftvhello pair". Confirm the real column names in the Supabase table editor
// before the staff login flow is wired up.

import { supabase, T } from './supabase.js';
import { COOKIE, readCookie } from './cookies.js';
import { ERR, fail } from './respond.js';

/**
 * Session lengths from 5d. "Stay signed in" is about the session and nothing
 * else. It is a separate control from "trust this device", which is about the
 * second factor, and the two must never be collapsed into one checkbox.
 */
export const SESSION_HOURS_SHORT = 12;
export const SESSION_DAYS_LONG = 30;
export const TRUSTED_DEVICE_DAYS = 30;

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
       user:${T.users} ( id, username, display_name, email, avatar_url, phone, is_active, created_at )`
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

  return { sessionId: data.id, user: data.user };
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
      `id, expires_at,
       user:${T.staffUsers} ( id, username, is_approved, is_admin, is_editor, totp_secret )`
    )
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] getStaffSession:', error);
    return null;
  }
  if (!data || !data.user) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // The session row belongs to the login flow, so deleting an expired one is
    // within the narrow set of gftvhello writes this portal is allowed. See
    // section 2.
    await supabase.from(T.staffSessions).delete().eq('id', data.id);
    return null;
  }

  return { sessionId: data.id, user: data.user };
}

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
 * Delete a session row. Used by logout in phase 2.
 * @param {'staff'|'applicant'} realm
 * @param {string} sessionId
 */
export async function destroySession(realm, sessionId) {
  const table = realm === 'staff' ? T.staffSessions : T.sessions;
  const { error } = await supabase.from(table).delete().eq('id', sessionId);
  if (error) console.error('[careers-gftv] destroySession:', error);
}
