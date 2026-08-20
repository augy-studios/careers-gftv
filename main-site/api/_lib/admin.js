// The admin dashboard's shared server side, phase 7.
//
// Section 8 ends with the rule this file exists to make unavoidable: "Every
// admin API route must verify the staff session server side and re-check the
// access flag on each request. Never trust a client-side role value."
// requireStaff in session.js already does the first half. What phase 7 adds is
// the second question, which section 8 asks separately of several sections:
// whether the caller is an admin or a job poster.
//
// Three things follow from that, and they are decisions rather than plumbing:
//
//   **Two roles, not a permission system.** 10 item 2 names exactly two:
//   admins, who have full control over everything this portal configures, and
//   job posters, who work with postings and the applicants who answered them.
//   Everything phase 7 builds is a job poster's except permanent deletion,
//   which is 8.2's and is admins only. A finer grained scheme would be
//   inventing policy the specification does not have.
//
//   **The role is read off the gftvhello row on every request**, never off
//   anything the browser sent, and never cached across requests. is_admin lives
//   at gftv.asia and is revoked there; a cached answer would keep somebody
//   admin for as long as the cache lasted.
//
//   **An admin only control is absent for a poster, not disabled.** 8.2 says so
//   about deletion, and the reason generalises: section 0c's disabled state
//   means "this is coming in a later phase", and using it for "you are not
//   allowed" would make a permission look like a build status. The routes here
//   still refuse either way, because a hidden control stops nobody.
//
// gftvhello_users stays read only, per section 2 and the decision table. This
// file reads is_admin and is_editor and writes nothing to that table ever.

import { supabase, T } from './supabase.js';
import { ERR, fail } from './respond.js';
import { requireStaff } from './session.js';

/**
 * The two roles from 10 item 2.
 *
 * A poster is anybody who reaches the dashboard without is_admin: either
 * is_editor at gftv.asia, or an account granted portal access through
 * gftvjobs_admin_access. hasPortalAccess in session.js is what decides they get
 * in at all; this decides what they see once they are.
 */
export const ROLE = Object.freeze({
  ADMIN: 'admin',
  POSTER: 'poster',
});

/**
 * The caller's role.
 * @param {{ is_admin?: boolean }} staffUser
 * @returns {'admin'|'poster'}
 */
export function roleFor(staffUser) {
  return staffUser?.is_admin === true ? ROLE.ADMIN : ROLE.POSTER;
}

/** Whether the caller may do the admins only things in 8.2, 8.8, and 8.9. */
export function isAdmin(staffUser) {
  return roleFor(staffUser) === ROLE.ADMIN;
}

/**
 * Guard an admin only route.
 *
 * Everything requireStaff does, plus is_admin. Answers 403 rather than 404 on
 * the role check, deliberately: the caller is signed in and is entitled to know
 * the difference between "there is no such thing" and "that one is not yours".
 * The 404 shape in requireStaff is for a caller with no session at all.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<null | { sessionId: string, user: object }>}
 */
export async function requireAdmin(req, res) {
  const session = await requireStaff(req, res);
  if (!session) return null;

  if (!isAdmin(session.user)) {
    fail(res, ERR.FORBIDDEN, 'Only an admin can do that.');
    return null;
  }

  return session;
}

/**
 * The staff identity the dashboard draws itself from.
 *
 * Sent by api/admin/me.js and by nothing else. The client uses it to decide
 * which sidebar items to draw and whether to offer the admins only controls,
 * and every route re-checks regardless, per the note at the top.
 */
export function staffContext(session) {
  return {
    id: session.user.id,
    username: session.user.username,
    role: roleFor(session.user),
    is_admin: session.user.is_admin === true,
    is_editor: session.user.is_editor === true,
  };
}

/* -------------------------------------------------------------------------
 * Reading a request
 * ---------------------------------------------------------------------- */

/**
 * The query string, parsed. The routes in this build are handed a Node request
 * rather than a framework's parsed object, so this is the one place that knows
 * the base URL is a placeholder.
 * @param {import('http').IncomingMessage} req
 * @returns {URLSearchParams}
 */
export function params(req) {
  try {
    return new URL(req.url ?? '/', 'https://careers.invalid').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** A uuid, as PostgREST needs one: anything else must never reach a filter. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * A whole number from the query string, clamped.
 * @param {URLSearchParams} search
 * @param {string} name
 * @param {number} fallback
 * @param {{ min?: number, max?: number }} [bounds]
 */
export function intParam(search, name, fallback, bounds = {}) {
  const raw = search.get(name);
  if (raw === null || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;

  const min = bounds.min ?? Number.MIN_SAFE_INTEGER;
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, value));
}

/**
 * A value from a fixed list, or null.
 * @param {URLSearchParams} search
 * @param {string} name
 * @param {readonly string[]} allowed
 */
export function enumParam(search, name, allowed) {
  const raw = (search.get(name) ?? '').trim();
  return allowed.includes(raw) ? raw : null;
}

/**
 * The page window for a list route.
 *
 * PostgREST takes an inclusive range, so the last index is one less than the
 * offset plus the size. Both are clamped here rather than at each call site,
 * because a list route that forgets the ceiling is one request away from
 * selecting the whole table.
 *
 * @param {URLSearchParams} search
 * @param {{ size?: number, max?: number }} [options]
 */
export function pageRange(search, options = {}) {
  const size = intParam(search, 'limit', options.size ?? 25, {
    min: 1,
    max: options.max ?? 100,
  });
  const page = intParam(search, 'page', 1, { min: 1, max: 10000 });
  const from = (page - 1) * size;
  return { page, size, from, to: from + size - 1 };
}

/* -------------------------------------------------------------------------
 * Slugs
 * ---------------------------------------------------------------------- */

/**
 * A slug from a title, per 8.2: "auto-generated from the title with a manual
 * override and a uniqueness check".
 *
 * ASCII only, and that is the case worth explaining rather than the rule. A
 * posting written in Chinese has a title with nothing in it this can keep, and
 * would produce an empty slug. The caller handles that by falling back to a
 * short random suffix, because the slug is a 301 alias and nothing else, per
 * the decision table: the canonical address is the uuid, so an unreadable slug
 * costs nothing, while a blank one would collide with every other blank one.
 *
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    // Strip combining marks, so "Café" becomes "cafe" rather than "caf".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Whether a slug is already taken, ignoring one row.
 *
 * @param {string} table
 * @param {string} slug
 * @param {string|null} exceptId the row being edited, which may keep its own
 * @returns {Promise<boolean>}
 */
export async function slugTaken(table, slug, exceptId = null) {
  let query = supabase.from(table).select('id').eq('slug', slug).limit(1);
  if (exceptId) query = query.neq('id', exceptId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * A free slug, from a preferred one.
 *
 * Tries the slug as given, then appends a short suffix. Loops rather than
 * counting up, because two admins publishing at once would otherwise both find
 * "-2" free and one of them would fail on the unique index anyway.
 *
 * @param {string} table
 * @param {string} preferred
 * @param {string|null} exceptId
 */
export async function freeSlug(table, preferred, exceptId = null) {
  const base = preferred || 'posting';
  if (!(await slugTaken(table, base, exceptId))) return base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const candidate = `${base.slice(0, 74)}-${suffix}`;
    if (!(await slugTaken(table, candidate, exceptId))) return candidate;
  }

  // Five collisions on a five character suffix is not a thing that happens, so
  // this is the shape of a bug rather than a retry: let the caller answer.
  throw new Error('could not find a free slug');
}

/* -------------------------------------------------------------------------
 * The languages the editor draws a tab for
 * ---------------------------------------------------------------------- */

// 8.2: "read from gftvjobs_locales rather than hardcoded, so a language added
// later appears without touching the editor". That is the whole reason this is
// a query rather than the LOCALES constant in validate.js, which exists for the
// hot path where a request's own locale is checked.
//
// Cached for a minute, like settings.js and for the same reason: adding a
// language is a database insert somebody makes while looking at the dashboard,
// and it should appear while they are still looking at it.
const LOCALE_CACHE_MS = 60 * 1000;

let localeCache = null;
let localeCachedAt = 0;

/**
 * Every active language, default first.
 *
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<Array<{ code: string, english_name: string, native_name: string, is_default: boolean }>>}
 */
export async function activeLocales({ refresh = false } = {}) {
  if (!refresh && localeCache && Date.now() - localeCachedAt < LOCALE_CACHE_MS) {
    return localeCache;
  }

  const { data, error } = await supabase
    .from(T.locales)
    .select('code, english_name, native_name, is_default, sort_order')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[careers-gftv] activeLocales:', error);
    // The previous answer beats no answer, and English beats nothing at all.
    // An editor with one tab is degraded; an editor with none is broken.
    return (
      localeCache ?? [
        { code: 'en', english_name: 'English', native_name: 'English', is_default: true },
      ]
    );
  }

  localeCache = (data ?? []).map((row) => ({
    code: row.code,
    english_name: row.english_name,
    native_name: row.native_name,
    is_default: row.is_default === true,
  }));
  localeCachedAt = Date.now();
  return localeCache;
}

/** The default language's code, per gftvjobs_locales. */
export async function defaultLocale() {
  const locales = await activeLocales();
  return locales.find((locale) => locale.is_default)?.code ?? 'en';
}

/** The non default languages, which are the ones with translation rows. */
export async function translationLocales() {
  const locales = await activeLocales();
  return locales.filter((locale) => !locale.is_default).map((locale) => locale.code);
}
