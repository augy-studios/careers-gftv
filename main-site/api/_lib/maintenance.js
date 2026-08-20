// Maintenance switches, from 0c and 8.12. Added to the specification on
// 21 August 2026 and built in phase 7, ahead of the rest of the settings in
// 8.10, so there is a lever for turning a broken feature off before the phases
// that add the most surface.
//
// A feature that has shipped can break. Until now the only lever for that was a
// deploy. An admin can now flip any shipped feature off temporarily and back on
// the same way.
//
// Five things about it that are decisions rather than implementation, and the
// reason each one is here rather than somewhere more convenient:
//
//   **It never edits build-status.json.** That file is the record of what has
//   been built; an override is the record of what is working right now.
//   Conflating them would have a deploy silently undo an outage response. The
//   override is a row in gftvjobs_settings, which is also the only place an
//   admin can write to from a dashboard.
//
//   **Off means off, including the API.** requireFeature below is the shared
//   guard every flippable route calls, and it answers 503. A disabled button
//   stops nobody with the endpoint, a stale tab, or a phase 10 queued action,
//   and if a feature is off because it is broken then the endpoint is the
//   broken thing.
//
//   **Its own sentence, never the phase one.** notYetAvailable in respond.js
//   says "Will be available in Phase 6", which is a lie about a feature
//   somebody used last week and makes a real outage indistinguishable from an
//   unbuilt one. This has its own, plus whatever note the admin wrote, which is
//   public and is shown exactly as typed.
//
//   **The denylist is in code.** Sign in and registration in both realms, and
//   anything the maintenance page itself needs. Flipping sign in off locks every
//   applicant out with no way back, and can lock out the admin who would undo
//   it. The page shows those as permanently unavailable with the reason rather
//   than hiding them, so somebody looking for the switch finds out why there is
//   not one instead of concluding the page is broken.
//
//   **This is not applications_open and the two are never merged.**
//   applications_open is a policy choice, that we are not taking applications at
//   the moment. A maintenance flip says something is broken. They read
//   completely differently to an applicant, and which of the two it is is the
//   one thing somebody turned away actually wants to know.
//
// The staleness is settings.js's minute, which is the right window: a flip
// reaching everybody inside a minute is fast enough, and a table read per
// request would not be.

import { createRequire } from 'node:module';

import { getSetting, putSetting } from './settings.js';
import { ERR, fail } from './respond.js';

// The feature map, from the one file 0c makes the source of truth. Required
// rather than imported with an attribute so the bundler traces it into the
// function: the path is a literal, which is what makes that work.
//
// The server needs it for one thing only, and it is worth being clear about
// which: validating that a key somebody is trying to flip is a real feature
// whose phase has shipped. What the *client* draws comes from the same file
// fetched over HTTP, as it has since phase 1.
const require = createRequire(import.meta.url);
const buildStatus = require('../../assets/build-status.json');

/** The settings key the overrides live under. */
export const OVERRIDES_KEY = 'feature_overrides';

/**
 * Features that can never be flipped, with the reason each one is on the list.
 *
 * The reasons are shown on the page, so they are written for an admin to read
 * rather than as code comments. 8.12: "Show them greyed with the reason, so an
 * admin looking for the switch finds out why there is not one rather than
 * concluding the page is broken."
 */
export const DENYLIST = Object.freeze({
  applicant_login: 'Turning sign in off would lock every applicant out with no way back.',
  applicant_register: 'Registration is how somebody gets an account in the first place.',
  staff_login: 'Turning staff sign in off would lock you out of this page.',
  forgot_password: 'The only way back in for somebody who has lost their password.',
  recovery_codes: 'Part of getting back into an account, per 5c.',
  passkeys: 'A second factor. Turning it off would lock out anybody who has only that.',
  trusted_devices: 'Part of signing in, and turning it off would not stop a sign in anyway.',
  admin_dashboard: 'This page lives inside the dashboard.',
  admin_maintenance: 'This is that page. Switching it off would remove the way back.',
});

/** Whether a feature key may be flipped at all. */
export function isFlippable(key) {
  return !(key in DENYLIST);
}

/* -------------------------------------------------------------------------
 * The feature map, and which of it has shipped
 * ---------------------------------------------------------------------- */

/** Every feature key in the map, with the phase it belongs to. */
export function featureMap() {
  return buildStatus.features ?? {};
}

/** Phase number to status, from the same file. */
function phaseStatus() {
  const map = new Map();
  for (const phase of buildStatus.phases ?? []) map.set(phase.number, phase.status);
  return map;
}

/**
 * Whether a feature's phase has shipped.
 *
 * A feature that has not shipped is not listed on the maintenance page and
 * cannot be flipped: it is already off, and offering to turn it off again is
 * noise. It also means a stale override written before a renumbering cannot
 * quietly switch off something that is not the feature it names.
 *
 * @param {string} key
 */
export function hasShipped(key) {
  const phase = featureMap()[key];
  if (phase === undefined) return false;
  return phaseStatus().get(phase) === 'shipped';
}

/**
 * The feature keys an admin may flip, with their phase. Shipped, not on the
 * denylist, sorted by phase then key so the page reads in build order.
 */
export function flippableFeatures() {
  return Object.entries(featureMap())
    .filter(([key]) => isFlippable(key))
    .filter(([key]) => hasShipped(key))
    .map(([key, phase]) => ({ key, phase }))
    .sort((a, b) => a.phase - b.phase || a.key.localeCompare(b.key));
}

/**
 * The denylisted keys, with their reason and whether they have shipped. Shown
 * greyed rather than hidden.
 */
export function deniedFeatures() {
  return Object.entries(DENYLIST)
    .map(([key, reason]) => ({
      key,
      reason,
      phase: featureMap()[key] ?? null,
      shipped: hasShipped(key),
    }))
    .sort((a, b) => (a.phase ?? 99) - (b.phase ?? 99) || a.key.localeCompare(b.key));
}

/* -------------------------------------------------------------------------
 * Reading the overrides
 * ---------------------------------------------------------------------- */

/**
 * The current overrides, as a key to record map.
 *
 * Only features that are currently off are stored. Turning one back on removes
 * its entry, and the history of both is in the audit log, per 8.12: "Turning a
 * feature back on is as much an event as turning it off, and an outage nobody
 * recorded the end of is one nobody can measure."
 *
 * A record is { off: true, note, at, by }. `by` is the staff username, since
 * the page shows who set it and a uuid is not that.
 *
 * @returns {Promise<Record<string, { off: boolean, note: string|null, at: string|null, by: string|null }>>}
 */
export async function featureOverrides() {
  const value = await getSetting(OVERRIDES_KEY, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const overrides = {};

  for (const [key, record] of Object.entries(value)) {
    if (!record || typeof record !== 'object') continue;
    if (record.off !== true) continue;
    // A stale override naming something that is no longer flippable is ignored
    // rather than honoured. The denylist is the stronger statement of the two,
    // and an override that could switch sign in off because it was written
    // before the key was denylisted is exactly what the denylist is for.
    if (!isFlippable(key)) continue;

    overrides[key] = {
      off: true,
      note: typeof record.note === 'string' && record.note.trim() !== '' ? record.note : null,
      at: typeof record.at === 'string' ? record.at : null,
      by: typeof record.by === 'string' ? record.by : null,
    };
  }

  return overrides;
}

/**
 * Whether one feature is currently switched off.
 * @param {string} key
 */
export async function isFeatureOff(key) {
  if (!isFlippable(key)) return false;
  const overrides = await featureOverrides();
  return overrides[key]?.off === true;
}

/**
 * The public shape, for api/public/feature-status.
 *
 * Carries only which shipped features are off and the public note on each. The
 * phase list stays in build-status.json and is not duplicated here, per section
 * 9, so a client reads two small things rather than one big one and a failure
 * to read this leaves the site working with everything on.
 */
export async function publicFeatureStatus() {
  const overrides = await featureOverrides();

  const off = {};
  for (const [key, record] of Object.entries(overrides)) {
    off[key] = { note: record.note, since: record.at };
  }

  return { off };
}

/* -------------------------------------------------------------------------
 * The guard
 * ---------------------------------------------------------------------- */

/**
 * The sentence, in English, from 0c.
 *
 * The API is one deployment and carries no dictionary, so this is English and
 * the client prefers its own translated string, exactly as api.js already does
 * for every other error. The note is appended rather than translated, because
 * an admin wrote it in the middle of an outage and it is shown as typed.
 */
export function maintenanceMessage(note) {
  const base = 'Temporarily unavailable while we fix something.';
  return note ? `${base} ${note}` : base;
}

/**
 * Guard a route behind a flippable feature. Returns true when the request
 * should stop here.
 *
 * Called by each guarded route rather than applied by a wrapper, so what is
 * flippable is a list in one file and a route's guard is visible in the route.
 *
 *   if (await unavailable(res, 'saved_jobs')) return;
 *
 * The error code is the existing NOT_YET_AVAILABLE, which is already 503 and is
 * already the code every client branches on for "this is not something you can
 * do right now". The details say which of the two it is, since the one thing
 * somebody turned away wants to know is whether it is broken or unbuilt.
 *
 * A failure to read the overrides leaves the feature on. That is the direction
 * to fail in: a settings blip must not take the site down, and an outage that
 * lasts a minute longer than intended is a smaller problem than one caused by
 * the switch itself.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function unavailable(res, key) {
  const overrides = await featureOverrides();
  const record = overrides[key];
  if (!record?.off) return false;

  fail(res, ERR.NOT_YET_AVAILABLE, maintenanceMessage(record.note), {
    details: { reason: 'maintenance', feature: key, note: record.note },
  });
  return true;
}

/* -------------------------------------------------------------------------
 * Flipping one
 * ---------------------------------------------------------------------- */

/** The longest a public note may be. Long enough for two sentences. */
export const NOTE_MAX = 300;

/**
 * Turn a feature off or back on.
 *
 * Writes the whole map rather than one key, because gftvjobs_settings holds one
 * jsonb value per key and there is no partial update of it. The read and the
 * write are not atomic, so two admins flipping different features in the same
 * second could have one overwrite the other. That is accepted: this is a page
 * two people use during an outage, the audit log records both, and the
 * alternative is a table and a migration for a map with a handful of entries.
 *
 * @param {string} key
 * @param {boolean} off
 * @param {{ note?: string|null, staffUser: { id: string, username: string } }} context
 * @returns {Promise<Record<string, object>>} the overrides as they now stand
 */
export async function setFeatureOverride(key, off, context) {
  const current = await featureOverrides();

  if (off) {
    current[key] = {
      off: true,
      note: context.note ?? null,
      at: new Date().toISOString(),
      by: context.staffUser?.username ?? null,
    };
  } else {
    delete current[key];
  }

  await putSetting(OVERRIDES_KEY, current, {
    description:
      'Maintenance overrides from 8.12. Only features currently switched off appear here. Survives a deploy, because it is a row rather than a file.',
    staffId: context.staffUser?.id ?? null,
  });

  return current;
}
