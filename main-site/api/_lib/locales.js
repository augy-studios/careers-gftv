// Which languages the portal serves right now. Phase 15 part 1.
//
// 3a built the portal to take a language without a migration: a row in
// gftvjobs_locales, a dictionary file, and the content. Phase 15 adds the
// fourth thing, decided on 12 September 2026: **a language is published by a
// switch, and its file existing publishes nothing.** ms.json and ta.json sit in
// the repository as copies of the English from the first part, so the file
// itself can be sent to whoever is adding the language. While somebody is
// typing into a copy, the copy must not be on the language control, must not
// be a locale a posting can be translated into, and must not be a locale this
// API answers in. This file is the one place that decides.
//
// The switch is a feature key, `locale_<code>`, in build-status.json. That
// was chosen over a column, a setting or a list of its own because every page
// and the bot already read feature keys through the same two questions: has
// the key's phase shipped, and is the switch off. A language is published when
// both answers are the right way round. Before this phase flips, `locale_ms`
// is off everywhere because its phase has not shipped. After the flip it is
// still off, because the two new keys are in maintenance.js's HELD set: off
// until an admin switches them on, which is the day a translation is in.
// Malay and Tamil were always a plan and not a promise, and the phase ships
// the backbone. `locale_zh` is an ordinary key and is on unless switched off.
//
// **There is no list of languages anywhere else.** validate.js's LOCALES and
// i18n.js's LOCALES both name every dictionary that exists, and both are held
// to the feature keys by check-i18n.js. The bot derives its list from the same
// keys. gftvjobs_locales.is_active is a different question: whether staff and
// helpers can work in the language. An unpublished language is precisely the
// one that needs working in, so that column is not the switch and stays true
// for all four.
//
// Off means off, including the API. A request naming an unpublished locale is
// answered in English, and a body storing one is refused, for the same reason
// `unavailable()` answers 503: a control that hides a language while the
// endpoint serves it is a control that lies.

import { featureMap, featureOverrides, hasShipped } from './maintenance.js';
import { FIELD, LOCALES as DICTIONARIES, validateLocale } from './validate.js';

/** The language postings are written in, and the layer every lookup falls back to. */
export const DEFAULT_LOCALE = 'en';

/** The feature key prefix a language is switched by. */
export const LOCALE_KEY_PREFIX = 'locale_';

/** The feature key for a locale: `zh` is switched by `locale_zh`. */
export function localeKey(code) {
  return `${LOCALE_KEY_PREFIX}${code}`;
}

/**
 * Every locale the build carries a switch for, from build-status.json.
 *
 * Derived from the feature keys and not listed, so the switch and the list
 * cannot disagree. The order is the dictionary list's, which is the order the
 * control shows them in, and a key with no dictionary behind it is dropped here
 * and reported by check-i18n.js.
 */
export function knownLocales() {
  const keyed = new Set(
    Object.keys(featureMap())
      .filter((key) => key.startsWith(LOCALE_KEY_PREFIX))
      .map((key) => key.slice(LOCALE_KEY_PREFIX.length))
  );
  return DICTIONARIES.filter((code) => code === DEFAULT_LOCALE || keyed.has(code));
}

/**
 * The locales whose phase has shipped. Synchronous, because it reads only the
 * static file, and that is what makes it the right check for anything that
 * cannot wait on a settings read.
 */
export function shippedLocales() {
  return knownLocales().filter(
    (code) => code === DEFAULT_LOCALE || hasShipped(localeKey(code))
  );
}

/**
 * The locales the portal serves right now: shipped, and not switched off.
 *
 * The overrides are read through maintenance.js's five second cache, so this
 * costs a query per instance per five seconds at most, and a failure to read
 * them leaves every shipped language on, which is the direction every switch
 * in this build fails in.
 *
 * @returns {Promise<string[]>} default first, then the rest in dictionary order
 */
export async function publishedLocales() {
  const overrides = await featureOverrides();
  return shippedLocales().filter(
    (code) => code === DEFAULT_LOCALE || overrides[localeKey(code)]?.off !== true
  );
}

/** Whether one locale is served right now. */
export async function isPublished(code) {
  const published = await publishedLocales();
  return published.includes(code);
}

/**
 * The published, non default locales: the ones a posting can carry a
 * translation in and a reader can switch to.
 */
export async function publishedTranslationLocales() {
  const published = await publishedLocales();
  return published.filter((code) => code !== DEFAULT_LOCALE);
}

/* -------------------------------------------------------------------------
 * Validation, for routes
 * ---------------------------------------------------------------------- */

/**
 * A locale code from a body, checked against what is published.
 *
 * The shape check is validate.js's, so a code that is not a dictionary at all
 * fails the same way it always did. What this adds is the switch: a real
 * dictionary that is not published is refused with the same code, because to
 * the caller it is not a language this site has.
 *
 * @param {unknown} value
 * @returns {Promise<{ ok: true, value: string } | { ok: false, code: string }>}
 */
export async function validatePublishedLocale(value) {
  const checked = validateLocale(value);
  if (!checked.ok) return checked;
  if (!(await isPublished(checked.value))) return { ok: false, code: FIELD.INVALID };
  return checked;
}

/**
 * The locale for a request that returns content, defaulting to English.
 *
 * Section 9: "A caller that sends no locale gets English." An unpublished one
 * is treated as none, so a stored preference for a language an admin has just
 * switched off falls back to English quietly, which is 3a's rule for a missing
 * dictionary applied to a present one.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string>}
 */
export async function requestLocale(req) {
  let wanted = null;
  try {
    const url = new URL(req.url ?? '/', 'https://careers.invalid');
    const checked = validateLocale(url.searchParams.get('locale'));
    if (checked.ok) wanted = checked.value;
  } catch {
    // Unparseable URL. English it is.
  }
  if (wanted === null || wanted === DEFAULT_LOCALE) return DEFAULT_LOCALE;
  return (await isPublished(wanted)) ? wanted : DEFAULT_LOCALE;
}
