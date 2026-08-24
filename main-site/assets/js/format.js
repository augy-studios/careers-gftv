// Dates, counts, and the two rules about them that section 4 states outright.
//
// One module, because the home page, the board, and phase 4's posting page all
// have to answer the same two questions the same way, and the second of them is
// easy to get wrong in a way nobody notices until it is on screen:
//
//   1. A null closes_at means open until filled. Never blank, never the word
//      null, never coalesced to a date. It gets a sentence of its own.
//   2. Everything with a date in it has to re-render on a language change, or
//      an English "Posted 3 days ago" survives a switch to 华文. That is not
//      this module's job to enforce, but it is why nothing here caches.
//
// Nothing here is memoised for the same reason. An Intl formatter built once at
// import time would hold the language the page happened to boot in.

import { t, getLocale } from './i18n.js';

// Intl wants a BCP 47 tag, and our locale ids are not quite that. Both are
// Singapore, which is the point: dates read as 19 Aug 2026 and not in the
// American order, in either language.
const INTL_LOCALE = {
  en: 'en-SG',
  zh: 'zh-Hans-SG',
};

function intlLocale() {
  return INTL_LOCALE[getLocale()] ?? 'en-SG';
}

/**
 * A date, written out. Used where the exact day matters more than how long ago
 * it was, which is closing dates and nothing else.
 * @param {string|null|undefined} value an ISO timestamp
 */
export function formatDate(value) {
  const date = parse(value);
  if (!date) return '';

  return new Intl.DateTimeFormat(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * How many whole days from now until a timestamp. Negative for the past.
 *
 * Counted in calendar days instead of in 24 hour blocks, so a posting closing
 * at nine tomorrow morning says it closes tomorrow, not today, which is
 * what a reader means by the word.
 */
export function daysUntil(value) {
  const date = parse(value);
  if (!date) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfThen = new Date(date);
  startOfThen.setHours(0, 0, 0, 0);

  return Math.round((startOfThen - startOfToday) / 86400000);
}

/**
 * What a card says about when a posting closes.
 *
 * The null case is the whole reason this function exists. Section 4: where
 * closes_at is null, show "Open until filled" in place of a date, and never
 * leave the field blank or print "null".
 *
 * @param {string|null} closesAt
 * @returns {{ text: string, urgent: boolean, openEnded: boolean }}
 */
export function closingText(closesAt) {
  if (!closesAt) {
    return { text: t('job.openUntilFilled'), urgent: false, openEnded: true };
  }

  const days = daysUntil(closesAt);

  if (days === null) {
    // An unparseable timestamp. Saying nothing is better than saying NaN.
    return { text: '', urgent: false, openEnded: false };
  }

  if (days < 0) return { text: t('job.closedOn', { date: formatDate(closesAt) }), urgent: false, openEnded: false };
  if (days === 0) return { text: t('job.closesToday'), urgent: true, openEnded: false };
  if (days === 1) return { text: t('job.closesTomorrow'), urgent: true, openEnded: false };

  // Urgent up to a fortnight out, which is the same window the "closing soon"
  // chip uses. The two agreeing is deliberate: a posting the chip calls closing
  // soon should look it on the card as well.
  return {
    text: t('job.closesOn', { date: formatDate(closesAt) }),
    urgent: days <= 14,
    openEnded: false,
  };
}

/**
 * What a card says about when a posting went up.
 *
 * Relative for the first fortnight, because that is the window in which "how
 * long has this been sitting there" is the question being asked. After that an
 * actual date carries more.
 *
 * @param {string|null} publishedAt
 */
export function postedText(publishedAt) {
  if (!publishedAt) return '';

  const until = daysUntil(publishedAt);
  // Unparseable. Saying nothing beats saying "Posted today" about a timestamp
  // nobody could read, which is what treating null as zero would have done.
  if (until === null) return '';

  const days = -until;

  if (days <= 0) return t('job.postedToday');
  if (days === 1) return t('job.postedYesterday');
  if (days <= 14) return t('job.postedDaysAgo', { days });

  return t('job.postedOn', { date: formatDate(publishedAt) });
}

/**
 * A number, grouped for the reader's language. Result counts and tag counts go
 * through this instead of being interpolated raw, so 1,204 does not read as
 * 1204 in one language and 1,204 in the other.
 * @param {number} value
 */
export function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat(intlLocale()).format(number);
}

/**
 * The five keys migration 021 allows, in the order a picker offers them.
 *
 * Added in phase 7 for the editor, which needs the list, not one label,
 * per the note in section 6 of next-steps: the commitment picker is "limited to
 * migration 021's five keys". It lives here beside commitmentLabel so the list
 * and the wording cannot drift, and widening it is a new numbered migration
 * plus a dictionary entry, never an edit to this array alone.
 */
export const COMMITMENTS = Object.freeze([
  'volunteer',
  'part_time',
  'full_time',
  'contract',
  'internship',
]);

/**
 * The label for a commitment type key.
 *
 * The column holds a key from migration 021's fixed set and never a label, so
 * the wording is a dictionary entry like any other interface string. An unknown
 * key returns an empty string and not the key itself: a raw commitment key
 * on a card would look like a bug to a reader, and the card simply omits the
 * line instead.
 *
 * @param {string|null} key
 */
export function commitmentLabel(key) {
  if (!key) return '';
  const label = t(`commitment.${key}`);
  return label === `commitment.${key}` ? '' : label;
}

function parse(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
