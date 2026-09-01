// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/env.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// This site reads four variables and the portal reads six. Its own origin is
// DOCS_URL, and SITE_URL is here because it is the portal, per 5e.
//
// What differs from the portal's copy, and why:
//   - the variable list is this site's, and DOCS_URL is added
//   - an unknown variable points at this site's files, and at the generator
//   - a missing variable points at this site's .env.example
//   - docsUrl() is added, and 5e's pair is stated where it is read
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
  // **The portal, and not this site.** It is the WebAuthn relying party id,
  // per 5e, and the far end of every cross link in section 16. Pointing it at
  // the docs site breaks every passkey registered on the portal, which is the
  // one thing 5e exists to allow.
  'SITE_URL',
  // This site's own origin. A passkey response is verified against it and the
  // cookies are scoped by it. Locally http://localhost:3001, so the two sites
  // can run side by side.
  'DOCS_URL',
];

// The portal's webhook secret, cron secret and bot username are deliberately
// absent. Nothing here answers a Google Apps Script, runs a cron, or talks to
// Telegram, and a variable a site does not use is one more value somebody has
// to keep in step for nothing.

/**
 * Read a required variable, or throw naming it.
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  if (!KNOWN.includes(name)) {
    throw new Error(
      `Environment variable ${name} is not one of the documented variables. ` +
        `Add it to docs-site/.env.example with a comment saying where to get ` +
        `it, and to the env.js rule in gen-docs-lib.js at the repo root. This ` +
        `file is generated: an edit here is undone by the next run.`
    );
  }

  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Environment variable ${name} is missing or empty. ` +
        `Set it in .env.local for local development and in the Vercel project ` +
        `settings for preview and production. See docs-site/.env.example for ` +
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

/**
 * This site's own origin, with any trailing slash removed.
 *
 * **The pair with siteUrl() above is the one 5e says is worth a test of its
 * own.** The relying party id comes from SITE_URL, which on this site is the
 * portal's host. The expected origin of a passkey response comes from here.
 * The wrong way round either breaks the docs sign in or accepts an assertion
 * made somewhere else entirely, and only one of those two failures is loud.
 */
export function docsUrl() {
  return requireEnv('DOCS_URL').replace(/\/+$/, '');
}

export const ENV_NAMES = Object.freeze([...KNOWN]);
