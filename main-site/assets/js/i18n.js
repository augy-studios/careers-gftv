// Language: English and Chinese, in Singapore Mandarin (华文).
//
// Deliberately built to mirror theme.js. Same localStorage key namespace, same
// apply-and-store shape, same "the modal never closes itself" behaviour. A
// reader who has found one switcher already understands the other.
//
// The choice lives in localStorage and nowhere else. It is not in the URL, by
// decision, which has one consequence worth knowing about rather than
// discovering later: a link shared by a Mandarin reader opens in whatever
// language the recipient has stored, and search engines only ever see the
// English version of a page. Section 3a of the specification records that.
//
// Strings live in /assets/i18n/{locale}.json rather than in this file, so a
// wording fix does not mean touching code. English is always loaded as the
// fallback, so a key missing from the Chinese dictionary shows English rather
// than a raw key or an empty element.

const APP_KEY = 'gftv-careers';

export const LOCALES = [
  { id: 'en', label: 'English', native: 'English', htmlLang: 'en' },
  // 华文 rather than 中文 or 简体中文: Singapore names the written language
  // 华文, and GFTV is a Singapore organisation. zh-Hans-SG tags the document as
  // Singapore Simplified Chinese, which is what the copy actually is. Prefix
  // matching means anything keyed on zh or zh-Hans still applies.
  { id: 'zh', label: 'Chinese', native: '华文', htmlLang: 'zh-Hans-SG' },
];

const DEFAULT_LOCALE = 'en';
const KEY_LOCALE = `${APP_KEY}.locale`;

const dictionaries = new Map();
let activeLocale = DEFAULT_LOCALE;

/* -------------------------------------------------------------------------
 * Preference
 * ---------------------------------------------------------------------- */

export function getStoredLocale() {
  let value = null;
  try {
    value = localStorage.getItem(KEY_LOCALE);
  } catch {
    // Storage blocked. Fall through to the default.
  }
  return LOCALES.some((l) => l.id === value) ? value : DEFAULT_LOCALE;
}

export function getLocale() {
  return activeLocale;
}

export function localeInfo(id = activeLocale) {
  return LOCALES.find((l) => l.id === id) ?? LOCALES[0];
}

/* -------------------------------------------------------------------------
 * Dictionaries
 * ---------------------------------------------------------------------- */

async function loadDictionary(locale) {
  if (dictionaries.has(locale)) return dictionaries.get(locale);

  try {
    const res = await fetch(`/assets/i18n/${locale}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${locale}.json returned ${res.status}`);
    const dict = await res.json();
    dictionaries.set(locale, dict);
    return dict;
  } catch (cause) {
    console.warn(`[careers-gftv] could not load the ${locale} dictionary:`, cause);
    dictionaries.set(locale, {});
    return {};
  }
}

/**
 * Translate one key.
 *
 * Falls back through the English dictionary and then to the key itself, so a
 * missing string degrades to readable English and, at worst, to something a
 * developer can search for. It never renders an empty element.
 *
 * @param {string} key dotted key, for example nav.findRole
 * @param {Record<string, string|number>} [vars] values for {placeholders}
 */
export function t(key, vars) {
  const active = dictionaries.get(activeLocale) ?? {};
  const fallback = dictionaries.get(DEFAULT_LOCALE) ?? {};

  let value = active[key];
  if (typeof value !== 'string') value = fallback[key];
  if (typeof value !== 'string') return key;

  if (!vars) return value;

  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/* -------------------------------------------------------------------------
 * Applying it to the page
 * ---------------------------------------------------------------------- */

/**
 * Replace the text of every element carrying a translation attribute.
 *
 *   data-i18n="key"                      sets textContent
 *   data-i18n-html="key"                 sets innerHTML, for strings with a
 *                                        link or emphasis inside them
 *   data-i18n-attr="title:key,alt:key2"  sets attributes
 *
 * data-i18n-html is safe here and only here, because every string it renders
 * comes from our own dictionary files. Never point it at anything a user can
 * write.
 *
 * @param {ParentNode} [root]
 */
export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr')
      .split(',')
      .forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
  });
}

/**
 * Switch language. Loads the dictionary, stamps the document, retranslates,
 * stores the choice, and tells the rest of the page.
 *
 * @param {string} id
 * @returns {Promise<string>} the locale actually applied
 */
export async function applyLocale(id) {
  const locale = LOCALES.some((l) => l.id === id) ? id : DEFAULT_LOCALE;

  // English is always present as the fallback layer.
  await loadDictionary(DEFAULT_LOCALE);
  if (locale !== DEFAULT_LOCALE) await loadDictionary(locale);

  activeLocale = locale;

  const info = localeInfo(locale);
  document.documentElement.setAttribute('lang', info.htmlLang);
  document.documentElement.setAttribute('data-locale', locale);

  try {
    localStorage.setItem(KEY_LOCALE, locale);
  } catch {
    // Storage blocked. The page is still translated for this visit.
  }

  translateDom(document);

  // Section 3a, and the reason gftvjobs_users.locale exists. localStorage is
  // the source of truth for rendering, and the server cannot read it. The
  // Telegram bot in phase 11 has to start conversations with people who are
  // not looking at the site, so the choice is mirrored onto the account
  // whenever there is one to mirror it onto.
  //
  // Deliberately not awaited: the language has already been applied, and a
  // slow or failed write must not hold up the page. Signed out callers get a
  // 200 saying nothing was stored.
  storeLocaleOnAccount(locale);

  // The page is held blank until this point for a non default language, so
  // nothing paints in English first. See the pre-paint script in every head.
  document.documentElement.removeAttribute('data-i18n-pending');

  // Anything that renders its own content, such as the status page, listens
  // for this and redraws.
  document.dispatchEvent(
    new CustomEvent('gftv:localechange', { detail: { locale } })
  );

  return locale;
}

/**
 * Mirror the language choice onto the signed in account, if there is one.
 *
 * Skipped on the first application of the stored preference, which happens on
 * every page load: that is not somebody changing language, and a request per
 * page view to record a value that has not changed is waste. Only an actual
 * change is written.
 */
let lastStoredLocale = null;

function storeLocaleOnAccount(locale) {
  if (lastStoredLocale === null) {
    lastStoredLocale = locale;
    return;
  }
  if (lastStoredLocale === locale) return;
  lastStoredLocale = locale;

  fetch('/api/auth/applicant/locale', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
    keepalive: true,
  }).catch(() => {
    // Offline, or signed out with the network refusing. The choice is stored
    // in this browser either way, which is what rendering depends on.
  });
}

/** Load and apply the stored preference. Called once by shell.js. */
export function initI18n() {
  return applyLocale(getStoredLocale());
}

/**
 * The locale to ask the API for. Every endpoint that returns content takes
 * this, and returns that language's wording in the ordinary field names.
 */
export function apiLocale() {
  return activeLocale;
}
