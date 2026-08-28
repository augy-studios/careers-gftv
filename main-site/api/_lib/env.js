// Environment variable access for every function in this directory.
//
// Section 2 of the specification: "If any variable is missing at startup, fail
// loudly with a message naming the variable rather than throwing an undefined
// key error deep in a request."
//
// That is what requireEnv does. It is called at module import time by the
// modules that need each value, so a missing variable surfaces as a clear
// function-level failure on the first request rather than as an obscure error
// three calls deep.
//
// The names here are fixed and shared across all GFTV projects. Do not rename
// SUPABASE_SERVICE_KEY to SUPABASE_SERVICE_ROLE_KEY or anything else, and do
// not add a variable without a line in .env.example saying where to get it.

const KNOWN = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SITE_URL',
  'FORM_WEBHOOK_SECRET',
  'CRON_SECRET',
  // Phase 11, and the only optional one in the list. It is read through
  // optionalEnv with the username section 15 fixes as the default, so it is
  // named here for the documentation rather than to be required: unset is the
  // normal state, and setting it points a preview deployment at a test bot.
  'TELEGRAM_BOT_USERNAME',
];

/**
 * Read a required variable, or throw naming it.
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  if (!KNOWN.includes(name)) {
    throw new Error(
      `Environment variable ${name} is not one of the documented variables. ` +
        `Add it to main-site/.env.example with a comment saying where to get ` +
        `it, and to the list in api/_lib/env.js, before using it.`
    );
  }

  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Environment variable ${name} is missing or empty. ` +
        `Set it in .env.local for local development and in the Vercel project ` +
        `settings for preview and production. See main-site/.env.example for ` +
        `where to get the value.`
    );
  }

  return value.trim();
}

/**
 * Read an optional variable, with no throw when it is absent.
 * @param {string} name
 * @param {string|null} fallback
 * @returns {string|null}
 */
export function optionalEnv(name, fallback = null) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Check everything at once. Used by a health endpoint and by local start up
 * so a misconfigured deployment is obvious before anybody hits a route.
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkEnv() {
  const missing = KNOWN.filter((name) => {
    const value = process.env[name];
    return typeof value !== 'string' || value.trim() === '';
  });

  return { ok: missing.length === 0, missing };
}

/** The site's own origin, with any trailing slash removed. */
export function siteUrl() {
  return requireEnv('SITE_URL').replace(/\/+$/, '');
}

export const ENV_NAMES = Object.freeze([...KNOWN]);
