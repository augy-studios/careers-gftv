// Talking to the API.
//
// Every response from api/ has the same shape, set in api/_lib/respond.js:
//
//   { "ok": true,  "data": ... }
//   { "ok": false, "error": { "code": "...", "message": "...", "details": {} } }
//
// This module is the only place that knows that. Everything else gets back
// { ok, data, error } and branches on error.code, never on a status number and
// never on the text of a message.
//
// The message from the server is written for a person to read, but it is
// always English: the API is one deployment and does not carry a dictionary.
// So the client prefers its own translated string for anything it recognises
// and falls back to the server's sentence for the rest. That fallback is why
// respond.js is careful about how those sentences are worded.

import { t, apiLocale } from './i18n.js';

/**
 * Call the API.
 *
 * @param {string} path for example /api/auth/applicant/login
 * @param {{ method?: string, body?: object, locale?: boolean, signal?: AbortSignal }} [options]
 *        locale defaults to true and appends the active language, which every
 *        endpoint returning content takes.
 * @returns {Promise<{ ok: boolean, data: any, error: null | { code: string, message: string, details?: object } }>}
 */
export async function api(path, options = {}) {
  const method = options.method ?? 'GET';

  const url = new URL(path, window.location.origin);
  if (options.locale !== false) url.searchParams.set('locale', apiLocale());

  const init = {
    method,
    // Same origin cookies carry the session. There is no token in
    // localStorage anywhere in this build, by design: an HttpOnly cookie is
    // not readable by script, and a token in storage is.
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  };

  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, init);
    // The site answered. Whatever the status: a 503 from a maintenance switch
    // and a 500 from a bad query are both the site being reachable, and the
    // connection banner has no business saying otherwise.
    announce('gftv:apireached');
  } catch (cause) {
    // Offline, blocked, or aborted.
    if (cause?.name === 'AbortError') {
      return { ok: false, data: null, error: { code: 'aborted', message: '' } };
    }
    console.warn('[careers-gftv] request failed:', cause);

    // Phase 10. Announced rather than reported to offline.js directly, which
    // keeps the dependency one way: that file imports nothing this one needs,
    // and this one knows nothing about a banner. An aborted request is
    // deliberately not announced — it is the page changing its mind, not the
    // network failing.
    announce('gftv:apifailed');

    return {
      ok: false,
      data: null,
      error: { code: 'network', message: t('error.network') },
    };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      data: null,
      error: { code: 'server_error', message: t('error.unexpected') },
    };
  }

  if (payload.ok === true) {
    return { ok: true, data: payload.data ?? null, error: null };
  }

  const error = payload.error ?? {};
  return {
    ok: false,
    data: null,
    error: {
      code: String(error.code ?? 'server_error'),
      message: translateError(error),
      details: error.details ?? null,
    },
  };
}

/**
 * Say whether the site answered, for anything listening.
 *
 * Phase 10's connection banner is the only listener today. A DOM event rather
 * than a call into offline.js on purpose: this module is imported by nearly
 * every page module, and giving it an import of its own that reaches back into
 * the shell would be a cycle waiting to happen.
 *
 * @param {'gftv:apireached'|'gftv:apifailed'} name
 */
function announce(name) {
  try {
    document.dispatchEvent(new CustomEvent(name));
  } catch {
    // Nothing here is worth failing a request over.
  }
}

/**
 * The sentence to show for an error.
 *
 * A key of error.<code> in the dictionary wins, so the common failures read in
 * the reader's own language. Anything without one falls back to the server's
 * English, which is better than a code on screen.
 */
function translateError(error) {
  const key = `error.${error.code}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return typeof error.message === 'string' && error.message !== ''
    ? error.message
    : t('error.unexpected');
}

/**
 * The applicant session, fetched once per page.
 *
 * Returns null when nobody is signed in, which is a normal state, not a
 * failure. Cached, because the header, the page, and anything else that asks
 * would otherwise each cost a request.
 */
let sessionPromise = null;

export function applicantSession({ refresh = false } = {}) {
  if (refresh || !sessionPromise) {
    sessionPromise = api('/api/auth/applicant/session', { locale: false }).then((result) =>
      result.ok ? result.data : { user: null }
    );
  }
  return sessionPromise;
}

/**
 * Whether this browser has ever held a staff session.
 *
 * A hint, not an authority, and the distinction is the whole of its safety: it
 * decides whether shell.js bothers *asking* the server who is signed in, and
 * nothing else. Every admin route re-checks the real session and the access
 * flags on every request, per section 8, so a forged value here buys a link to
 * a page that will refuse the caller.
 *
 * It exists because the header cannot otherwise offer staff a way back to
 * /admin without asking about a staff session on every page load for every
 * reader, almost none of whom have one. With the hint, the cost falls only on
 * browsers that have actually signed in.
 */
const STAFF_HINT_KEY = 'gftv-careers.staffSeen';

export function hasStaffHint() {
  try {
    return localStorage.getItem(STAFF_HINT_KEY) === 'true';
  } catch {
    return false;
  }
}

function setStaffHint(value) {
  try {
    if (value) localStorage.setItem(STAFF_HINT_KEY, 'true');
    else localStorage.removeItem(STAFF_HINT_KEY);
  } catch {
    // Storage blocked. The header simply never offers the admin link, and
    // /admin still works by typing it.
  }
}

/**
 * Record that this browser holds a staff session, for a caller that has just
 * proved it some other way.
 *
 * The dashboard is the caller, and it exists because of a chicken and egg
 * problem phase 7 walked into. The hint is what decides whether shell.js asks
 * about a staff session at all, and until phase 7 the only things that *set* it
 * were `staffSession()` calls on /admin/login and /admin/security. On a fresh
 * browser the sequence went: open /admin/login with no session, so the hint is
 * cleared; sign in; land on /admin, which asks /api/admin/me and never touches
 * this. The header's Admin item therefore never appeared, on a browser that had
 * just signed in, until the person happened to revisit one of those two pages.
 *
 * `mountAdminPage` calls this instead of making a second request, because a
 * successful /api/admin/me is already proof of a staff session with portal
 * access. It is still only a hint: the server re-checks everything per request,
 * and `staffSession()` corrects it in both directions on the next page that
 * asks.
 *
 * @param {boolean} seen
 */
export function noteStaffSession(seen) {
  setStaffHint(Boolean(seen));
}

/**
 * Whether this browser has ever held a translation helper's session.
 *
 * The same hint the staff link uses, for the same reason and with the same
 * limits. 7i's annotation layer is offered in the header on every page of the
 * site, and asking the server "are you a helper" on every page load for every
 * reader, to serve the handful of people who are, is the cost that pattern
 * exists to avoid. With the hint the question is only asked by a browser that
 * has seen the answer be yes at least once.
 *
 * **A hint, never an authority.** It decides whether to ask, and nothing else:
 * the endpoints re-check the helper row and the staff session on every request,
 * so a forged value here buys a toggle whose first request refuses it.
 *
 * **What it costs when it is wrong.** Somebody granted the role in another
 * browser sees no toggle here until they open their account area once, which is
 * where the roster is read and this is set. That is the same trade the staff
 * hint makes, and the account area is where somebody finds out they have been
 * granted anything.
 */
const HELPER_HINT_KEY = 'gftv-careers.helperSeen';

export function hasHelperHint() {
  try {
    return localStorage.getItem(HELPER_HINT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Record that this browser holds the helper role, for a caller that has just
 * been told so.
 *
 * @param {boolean} seen
 */
export function noteHelperSession(seen) {
  try {
    if (seen) localStorage.setItem(HELPER_HINT_KEY, 'true');
    else localStorage.removeItem(HELPER_HINT_KEY);
  } catch {
    // Storage blocked. The header never offers the layer, and the helper area
    // still works by opening it.
  }
}

/**
 * The staff session. Separate call, separate cookie, separate realm.
 *
 * The two realms are never merged into one "current user" anywhere in this
 * build, and this does not change that: it answers a different question with a
 * different cookie, and the header renders the two as separate items.
 */
export function staffSession() {
  return api('/api/auth/staff/session', { locale: false }).then((result) => {
    const data = result.ok ? result.data : { user: null };
    // Maintained here instead of at the login page, so it is corrected by
    // whichever page next asks. A session that has lapsed clears the hint on
    // the next check and the link stops being offered.
    setStaffHint(Boolean(data?.user));
    return data;
  });
}
