// Reading gftvjobs_settings.
//
// Section 8.10: portal settings, read by the public site and written only from
// the admin dashboard. That write half is phase 8's. This is the read half,
// and it exists now because the reapply cooldown became a setting in migration
// 029 and a setting nothing can read is just a row.
//
// Two rules that shape everything here:
//
//   A settings read must never fail a request. Whatever the caller was doing,
//   it was not "read a setting", and a database blip on a table of five rows
//   should not turn into an error page. Every getter takes a fallback and
//   returns it rather than throwing.
//
//   The fallback is the documented policy, never the permissive value. If the
//   cooldown cannot be read, the answer is 90 days, not zero. Failing to the
//   default keeps a policy in force through an outage; failing to zero would
//   quietly switch it off at exactly the moment nobody is watching.
//
// Values keep their natural shape, except that anything holding human readable
// text is a per locale object, per migration 018. localised() below is for
// those; the cooldown is a number and does not go near it.

import { supabase, T } from './supabase.js';

/**
 * Three months, as section 7f specifies it, in days.
 *
 * Also the fallback when the setting cannot be read, which is why it is a
 * constant here rather than a literal at the call site: the value that holds
 * during an outage should be the same one written in the migration, and there
 * should be one place to change both.
 */
export const DEFAULT_REAPPLY_COOLDOWN_DAYS = 90;

/** Matches the ceiling in migration 029's check constraint. */
const MAX_COOLDOWN_DAYS = 3650;

// Settings change when an admin edits one, which is rarely, and they are read
// on every apply, which is often. Cached per function instance for a minute:
// long enough that a burst of applies costs one query, short enough that an
// admin who changes something sees it take effect while they are still looking
// at the page.
//
// Deliberately not cached for the life of the instance. Vercel keeps a warm
// instance for a long time, and "the setting I changed this morning still has
// not taken effect" is a much worse bug than one query a minute.
//
// A caller may ask for a fresher answer than this, and the maintenance
// overrides do: see FRESH_MS in maintenance.js. The write path invalidates the
// cache outright, but only on the instance that served the write, and a flip
// has to reach the others as well.
const CACHE_MS = 60 * 1000;

let cache = null;
let cachedAt = 0;

/**
 * Every setting, as a key to value map. Cached.
 *
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>|null>} null when the table could
 *          not be read at all, so a caller can tell "no value" from "no answer".
 */
export async function allSettings({ refresh = false, maxAgeMs = CACHE_MS } = {}) {
  if (!refresh && cache && Date.now() - cachedAt < maxAgeMs) return cache;

  const { data, error } = await supabase.from(T.settings).select('key, value');

  if (error) {
    console.warn('[careers-gftv] settings could not be read:', error);
    // The previous answer, if there is one, beats no answer. A stale setting is
    // closer to the truth than a fallback, and this is the only thing that
    // makes a blip invisible rather than briefly changing site policy.
    return cache;
  }

  cache = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  cachedAt = Date.now();
  return cache;
}

/**
 * One setting, with a fallback.
 * @param {string} key
 * @param {unknown} fallback returned when the key is absent or unreadable
 * @param {{ maxAgeMs?: number }} [options] how stale an answer this caller will
 *        accept. The default is the minute above, which is right for a policy
 *        value like the cooldown. The maintenance overrides pass something much
 *        shorter, because that one is read during an outage by somebody who has
 *        just flipped a switch and wants to see it take effect.
 */
export async function getSetting(key, fallback = null, options = {}) {
  const settings = await allSettings(options);
  if (!settings || !(key in settings)) return fallback;
  return settings[key];
}

/**
 * The wording for a per locale setting, per migration 018.
 *
 * Falls back through the requested language, then English, then the raw value
 * for a setting written before 018 turned it into an object. Never returns an
 * object, so a caller cannot accidentally render one.
 *
 * @param {string} key
 * @param {string} locale
 * @param {string} fallback
 */
export async function localisedSetting(key, locale, fallback = '') {
  const value = await getSetting(key, null);

  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value[locale] === 'string') return value[locale];
    if (typeof value.en === 'string') return value.en;
  }

  return fallback;
}

/* -------------------------------------------------------------------------
 * The reapply cooldown, per 7f and migration 029
 * ---------------------------------------------------------------------- */

/**
 * How many days an applicant waits before reapplying to the same posting.
 *
 * Zero is a legal answer and means the cooldown is off. Anything that is not a
 * whole number in range is treated as absent and answered with the default,
 * because the alternative is letting a bad row decide policy. Migration 029
 * constrains this at the database, so a bad value here means somebody wrote to
 * the table around the constraint.
 *
 * @returns {Promise<number>}
 */
export async function reapplyCooldownDays() {
  const value = await getSetting('reapply_cooldown_days', DEFAULT_REAPPLY_COOLDOWN_DAYS);
  const days = Number(value);

  if (!Number.isInteger(days) || days < 0 || days > MAX_COOLDOWN_DAYS) {
    if (value !== DEFAULT_REAPPLY_COOLDOWN_DAYS) {
      console.warn('[careers-gftv] reapply_cooldown_days is not usable:', value);
    }
    return DEFAULT_REAPPLY_COOLDOWN_DAYS;
  }

  return days;
}

/** Whether the cooldown is switched off entirely. */
export async function cooldownDisabled() {
  return (await reapplyCooldownDays()) === 0;
}

/**
 * The cooldown_until to store when an application is confirmed.
 *
 * Null when the cooldown is off, and null is the value that goes in the column.
 * Not now(), and not the confirmation date: a cooldown_until in the past would
 * make 7f's interface offer to tell somebody the date they may reapply, which
 * would be today, which is noise on a card that has enough to say already.
 *
 * @param {Date} [from] the confirmation time, defaulting to now
 * @returns {Promise<string|null>} an ISO timestamp, or null for no cooldown
 */
export async function cooldownUntil(from = new Date()) {
  const days = await reapplyCooldownDays();
  if (days === 0) return null;

  const until = new Date(from.getTime());
  until.setUTCDate(until.getUTCDate() + days);
  return until.toISOString();
}

/**
 * Whether an application row is still inside its cooldown.
 *
 * The single place phase 5's apply endpoint should ask, because it folds in the
 * part that is easy to miss: with the setting at zero the stored dates are
 * ignored rather than cleared, so turning the cooldown off takes effect at once
 * and turning it back on restores what was there.
 *
 * @param {{ cooldown_until?: string|null }|null} application
 * @returns {Promise<boolean>}
 */
export async function isInCooldown(application) {
  if (!application?.cooldown_until) return false;
  if (await cooldownDisabled()) return false;

  const until = Date.parse(application.cooldown_until);
  return Number.isFinite(until) && until > Date.now();
}

/** Drop the cache, for an admin write that must be visible immediately. */
export function invalidateSettings() {
  cache = null;
  cachedAt = 0;
}

/* -------------------------------------------------------------------------
 * Writing, added in phase 7 for 8.12
 * ---------------------------------------------------------------------- */

/**
 * Write one setting.
 *
 * The header of this file says the write half is phase 8's, and it mostly still
 * is: the settings page in 8.10 is phase 8's and nothing here is a substitute
 * for it. What arrives early is 8.12's maintenance switches, which are stored
 * as a setting because an admin cannot edit a file in the repo from a
 * dashboard, and which are in phase 7 so there is a lever for turning a broken
 * feature off before the phases that add the most surface.
 *
 * Unlike every read here, this one throws. A read that fails falls back to
 * policy and carries on; a write that fails and says nothing would leave an
 * admin looking at a switch they believe they have flipped.
 *
 * The cache is dropped rather than updated, so the next read goes to the table
 * and a partial write cannot leave a wrong value in memory for a minute.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {{ description?: string, staffId?: string|null }} [options] the
 *        description is written only when it is given, so an upsert cannot
 *        blank the sentence migration 012 seeded. staffId fills updated_by,
 *        which takes a gftvhello uuid and nothing else.
 */
export async function putSetting(key, value, options = {}) {
  const row = { key, value, updated_at: new Date().toISOString() };
  if (options.description) row.description = options.description;
  if (options.staffId) row.updated_by = options.staffId;

  const { error } = await supabase.from(T.settings).upsert(row, { onConflict: 'key' });

  if (error) throw new Error(`could not write the ${key} setting: ${error.message}`);

  invalidateSettings();
}
