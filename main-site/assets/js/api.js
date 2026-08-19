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
  } catch (cause) {
    // Offline, blocked, or aborted. Phase 10 gives this a proper offline
    // story; until then it is one honest sentence.
    if (cause?.name === 'AbortError') {
      return { ok: false, data: null, error: { code: 'aborted', message: '' } };
    }
    console.warn('[careers-gftv] request failed:', cause);
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
 * Returns null when nobody is signed in, which is a normal state rather than a
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

/** The staff session. Separate call, separate cookie, separate realm. */
export function staffSession() {
  return api('/api/auth/staff/session', { locale: false }).then((result) =>
    result.ok ? result.data : { user: null }
  );
}
