// The public half of 8.10, on the client.
//
// One module, one request per page load, shared by everything that needs it:
// shell.js wants the portal title for the header, and home-page.js wants the
// hero copy and the featured roles. Two modules each fetching the same endpoint
// would be two requests on the one page where both are true.
//
// Two rules it keeps, and both are about not making an ordinary reader pay for
// an admin's setting:
//
//   **The featured roles are only asked for on the home page**, because that is
//   the only page that renders them. Every other page gets the wording alone,
//   which is three short strings.
//
//   **The portal title is remembered locally**, so a renamed portal does not
//   flash the dictionary's name on every page load while the request is in
//   flight. The stored value is text and is written into textContent, never
//   into markup, so nothing a reader can edit in their own storage can become
//   an element. It is a convenience and never the source of truth: the network
//   answer replaces it whenever the two differ.
//
// A failed request is not an error state anywhere. Every value here has a
// perfectly good fallback already on the page, which is what the dictionary
// says, so a blip leaves the site reading exactly as it did before 8.10 existed.

import { api } from './api.js';
import { getLocale } from './i18n.js';

const STORE_PREFIX = 'gftv-careers.portalTitle.';

let request = null;
let requestedLocale = null;

/**
 * The site settings for the reader's language, fetched once per page.
 *
 * @returns {Promise<{ portal_title: string, hero_heading: string,
 *          hero_body: string, featured: object[] }|null>} null when the
 *          request failed, which every caller treats as "leave it alone".
 */
export function loadSiteSettings() {
  const locale = getLocale();

  // A language change makes the previous answer wrong, not stale: the
  // wording is resolved server side, so it is a different payload.
  if (request && requestedLocale === locale) return request;

  requestedLocale = locale;

  // The featured roles are rendered on the home page and nowhere else, so every
  // other page asks for the wording alone.
  const wantsFeatured = window.location.pathname.replace(/\/+$/, '') === '';

  request = api(`/api/public/site-settings${wantsFeatured ? '?featured=1' : ''}`).then(
    (result) => {
      if (!result.ok) return null;

      rememberPortalTitle(locale, result.data.portal_title ?? '');
      return result.data;
    }
  );

  return request;
}

/**
 * The portal title this browser saw last time, for the language being drawn.
 *
 * Read before the network answers, so the header is right on the second visit
 * and not after a flash of the old name. Empty when nothing is stored,
 * which means "use the dictionary".
 *
 * @param {string} [locale]
 * @returns {string}
 */
export function cachedPortalTitle(locale = getLocale()) {
  try {
    return window.localStorage.getItem(`${STORE_PREFIX}${locale}`) ?? '';
  } catch {
    // Storage can be unavailable in a private window or refused outright. The
    // dictionary name is a fine answer and this is not worth an error.
    return '';
  }
}

function rememberPortalTitle(locale, title) {
  try {
    const key = `${STORE_PREFIX}${locale}`;
    if (title) window.localStorage.setItem(key, title);
    else window.localStorage.removeItem(key);
  } catch {
    /* nothing to do: the value is a convenience */
  }
}
