// Language: English, Chinese in Singapore Mandarin (华文), Malay and Tamil.
//
// Deliberately built to mirror theme.js. Same localStorage key namespace, same
// apply-and-store shape, same "the modal never closes itself" behaviour. A
// reader who has found one switcher already understands the other.
//
// The choice lives in localStorage and nowhere else. It is not in the URL, by
// decision, which has one consequence worth knowing about instead of
// discovering later: a link shared by a Mandarin reader opens in whatever
// language the recipient has stored, and search engines only ever see the
// English version of a page. Section 3a of the specification records that.
//
// Strings live in /assets/i18n/{locale}.json and not in this file, so a
// wording fix does not mean touching code. English is always loaded as the
// fallback, so a key missing from the Chinese dictionary shows English and
// not a raw key or an empty element.
//
// **A dictionary existing does not put it on the control.** Phase 15 part 1:
// LOCALES names every dictionary in /assets/i18n, and a language is offered
// only while it is published, which is a feature key in build-status.json
// that the shell reads and hands in through setPublishedLocales. Until then
// everything here is published, so a page that never calls it behaves as it
// did with two languages. The docs site is that page.

const APP_KEY = 'gftv-careers';

export const LOCALES = [
  { id: 'en', label: 'English', native: 'English', htmlLang: 'en' },
  // 华文 over 中文 or 简体中文: Singapore names the written language
  // 华文, and GFTV is a Singapore organisation. zh-Hans-SG tags the document as
  // Singapore Simplified Chinese, which is what the copy actually is. Prefix
  // matching means anything keyed on zh or zh-Hans still applies.
  { id: 'zh', label: 'Chinese', native: '华文', htmlLang: 'zh-Hans-SG' },
  // Phase 15. Bahasa Melayu is what the language calls itself in Singapore,
  // where it is the national language, and தமிழ் is Tamil in its own script.
  // Neither carries a region subtag: the portal ships one of each, and there
  // is no Singapore variant of either script to tag the document as.
  { id: 'ms', label: 'Malay', native: 'Bahasa Melayu', htmlLang: 'ms' },
  { id: 'ta', label: 'Tamil', native: 'தமிழ்', htmlLang: 'ta' },
];

// Which of LOCALES the portal offers right now, by id. Everything until the
// shell says otherwise, for the reason in the header.
let published = new Set(LOCALES.map((l) => l.id));

/**
 * Narrow the offered languages to the published ones. Called once by shell.js
 * after the build status and the maintenance overrides have loaded.
 *
 * The default language is always kept, since it is the fallback layer and
 * cannot be switched off. Anything listening for the control's contents, the
 * language modal above all, hears about it on gftv:localespublished.
 *
 * @param {string[]} ids
 */
export function setPublishedLocales(ids) {
  const next = new Set([DEFAULT_LOCALE]);
  for (const id of ids) if (LOCALES.some((l) => l.id === id)) next.add(id);
  published = next;
  document.dispatchEvent(
    new CustomEvent('gftv:localespublished', { detail: { locales: publishedLocales() } })
  );
}

/** The offered languages, in LOCALES order. */
export function publishedLocales() {
  return LOCALES.filter((l) => published.has(l.id));
}

/** Whether a language is offered right now. */
export function isPublished(id) {
  return published.has(id);
}

// The language postings themselves are written in, and the fallback layer for
// every dictionary lookup. Exported because the board needs it: the
// "English only" badge is meaningless to a reader already in English, since a
// posting has no translation row for the default language by definition.
export const DEFAULT_LOCALE = 'en';
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
  // A stored choice of a language that is not offered falls back to English,
  // quietly. 3a's rule for a missing dictionary, applied to a present one.
  return published.has(value) ? value : DEFAULT_LOCALE;
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

// Keys already reported, so one missing string in a redraw loop does not
// print a thousand times.
const warnedKeys = new Set();

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

  if (typeof value !== 'string') {
    // Falling back to the key is deliberate and stays. What was missing is any
    // sign that it happened: footer.buildStatus rendered its own name in the
    // footer from phase 1 and nothing said so.
    //
    // Only warned once the English dictionary has actually loaded. Before that
    // every key is legitimately absent, and warning then would bury the real
    // ones under the noise of ordinary start up.
    if (dictionaries.has(DEFAULT_LOCALE) && !warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn(`[careers-gftv] no dictionary entry for "${key}"`);
    }
    return key;
  }

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
 * `remember: false` applies without storing, in this browser or on the
 * account. It is for the one caller that is not somebody choosing: the shell
 * moving a reader to English because their stored language has been switched
 * off. Their choice stays stored, so it is honoured again the day the switch
 * goes back on.
 *
 * @param {string} id
 * @param {{ remember?: boolean }} [options]
 * @returns {Promise<string>} the locale actually applied
 */
export async function applyLocale(id, { remember = true } = {}) {
  const locale = published.has(id) ? id : DEFAULT_LOCALE;
  // A fallback is not a choice. Asking for a language that is not offered
  // applies English and stores nothing, so whatever was stored is still there
  // when the language is.
  if (locale !== id) remember = false;

  // English is always present as the fallback layer.
  await loadDictionary(DEFAULT_LOCALE);
  if (locale !== DEFAULT_LOCALE) await loadDictionary(locale);

  activeLocale = locale;

  const info = localeInfo(locale);
  document.documentElement.setAttribute('lang', info.htmlLang);
  document.documentElement.setAttribute('data-locale', locale);

  if (remember) {
    try {
      localStorage.setItem(KEY_LOCALE, locale);
    } catch {
      // Storage blocked. The page is still translated for this visit.
    }
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
  if (remember) storeLocaleOnAccount(locale);

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
