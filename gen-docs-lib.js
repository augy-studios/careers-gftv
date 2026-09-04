// Write the docs site's copies of the portal's shared modules.
//
//   node gen-docs-lib.js          write them
//   node gen-docs-lib.js --check  fail if any copy is out of date
//
// **Why this file exists.** Vercel builds each project from its own root
// directory and cannot reach outside it, so `docs-site/api/` cannot import
// `main-site/api/_lib/`. 5h answers that by duplicating the shared session
// helpers into `docs-site/api/_lib/` and keeping the two copies identical. A
// duplicate nobody chose is the most dangerous thing in phase 13, because the
// failure mode is silent: a fix lands in one copy and not the other, months
// apart, and nothing anywhere says so.
//
// So the copy is generated rather than kept by hand, and the differences
// between the two sites are written down here as rules instead of living as
// edits somebody has to notice. Three properties follow from that, and they are
// the point of the whole file:
//
//   **A copy is never edited.** Every generated file opens saying so and naming
//   the source. Editing one is undone by the next run, which is a great deal
//   louder than an edit that survives in one place only.
//
//   **A rule that no longer matches is an error, not a silent no-op.** Every
//   rule states how many times it must match, and the generator refuses to
//   write anything when one of them matches a different number of times. If the
//   portal edits a line a rule depends on, this stops and names it, and
//   somebody decides what the docs site should do about that change. That is
//   the check the phase actually needed: not "are the two files the same",
//   which they are deliberately not, but "is the difference between them still
//   the one that was intended".
//
//   **A file in a generated directory is generated, or it is named below.**
//   OWN lists the hand written exceptions, and there are none yet. Anything
//   else appearing there fails the check, because a hand written file sitting
//   beside a dozen generated ones is how the next person concludes the whole
//   directory is theirs to edit.
//
// `--check` belongs in whatever runs before a deploy, beside `check-i18n.js`
// and `check-precache.js`.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');

/** Multi-line find and replace text, written as lines so nothing is escaped. */
const text = (...parts) => parts.join('\n');

/* -------------------------------------------------------------------------
 * Rules that apply to every file
 * ---------------------------------------------------------------------- */

const GLOBAL = [
  {
    // Console prefixes. Both sites log into the same Vercel account and the
    // same terminal during local development, and a line that does not say
    // which application produced it is a line somebody attributes to the wrong
    // one. Not every file logs, so this rule is allowed to match nothing.
    find: '[careers-gftv]',
    replace: '[careers-gftv-docs]',
    why: 'log lines are prefixed [careers-gftv-docs]',
  },
];

/* -------------------------------------------------------------------------
 * The files, and what differs in each
 * ---------------------------------------------------------------------- */

/**
 * Every entry is a path under `main-site/`, copied to the same path under
 * `docs-site/`. The paths match on purpose: it keeps the relative imports
 * identical, so a copy differs from its source only where a rule says it does.
 *
 * Each rule's find text must appear exactly once, unless the rule says
 * otherwise with `times`.
 */
const FILES = [
  {
    path: 'api/_lib/site.js',
    note: text(
      'One line, and the whole of what makes this copy say it is the docs site.',
      'Both of the places that record which application did something read it:',
      "the audit row's metadata per 5f and 5g, and a passkey's registered_on per",
      "5f. It is a file rather than a constant in each of them so this generator",
      'has one rule to keep instead of two that must agree.'
    ),
    rules: [
      {
        why: 'this build is the docs site',
        find: "export const SITE = 'portal';",
        replace: "export const SITE = 'docs';",
      },
    ],
  },
  {
    path: 'api/_lib/respond.js',
    note: 'Identical. The same status codes and the same JSON shapes.',
  },
  {
    path: 'api/_lib/validate.js',
    note: 'Identical.',
  },
  {
    path: 'api/_lib/tokens.js',
    note: 'Identical. CSPRNG tokens, hashing, and code formatting.',
  },
  {
    path: 'api/_lib/password.js',
    note: 'Identical. The same bcrypt hashes in the same gftvhello_users rows.',
  },
  {
    path: 'api/_lib/totp.js',
    note: 'Identical. A second factor belongs to the account, not to a site.',
  },
  {
    path: 'api/_lib/env.js',
    note: text(
      'This site reads four variables and the portal reads six. Its own origin is',
      'DOCS_URL, and SITE_URL is here because it is the portal, per 5e.'
    ),
    rules: [
      {
        why: "the variable list is this site's, and DOCS_URL is added",
        find: text(
          'const KNOWN = [',
          "  'SUPABASE_URL',",
          "  'SUPABASE_SERVICE_KEY',",
          "  'SITE_URL',",
          "  'FORM_WEBHOOK_SECRET',",
          "  'CRON_SECRET',",
          '  // Phase 11, and the only optional one in the list. It is read through',
          '  // optionalEnv with the username section 15 fixes as the default, so it is',
          '  // named here for the documentation rather than to be required: unset is the',
          '  // normal state, and setting it points a preview deployment at a test bot.',
          "  'TELEGRAM_BOT_USERNAME',",
          '];'
        ),
        replace: text(
          'const KNOWN = [',
          "  'SUPABASE_URL',",
          "  'SUPABASE_SERVICE_KEY',",
          '  // **The portal, and not this site.** It is the WebAuthn relying party id,',
          '  // per 5e, and the far end of every cross link in section 16. Pointing it at',
          '  // the docs site breaks every passkey registered on the portal, which is the',
          '  // one thing 5e exists to allow.',
          "  'SITE_URL',",
          "  // This site's own origin. A passkey response is verified against it and the",
          '  // cookies are scoped by it. Locally http://localhost:3001, so the two sites',
          '  // can run side by side.',
          "  'DOCS_URL',",
          '];',
          '',
          "// The portal's webhook secret, cron secret and bot username are deliberately",
          '// absent. Nothing here answers a Google Apps Script, runs a cron, or talks to',
          '// Telegram, and a variable a site does not use is one more value somebody has',
          '// to keep in step for nothing.'
        ),
      },
      {
        why: "an unknown variable points at this site's files, and at the generator",
        find: text(
          '        `Add it to main-site/.env.example with a comment saying where to get ` +',
          '        `it, and to the list in api/_lib/env.js, before using it.`'
        ),
        replace: text(
          '        `Add it to docs-site/.env.example with a comment saying where to get ` +',
          '        `it, and to the env.js rule in gen-docs-lib.js at the repo root. This ` +',
          '        `file is generated: an edit here is undone by the next run.`'
        ),
      },
      {
        why: "a missing variable points at this site's .env.example",
        find: '        `settings for preview and production. See main-site/.env.example for ` +',
        replace: '        `settings for preview and production. See docs-site/.env.example for ` +',
      },
      {
        why: "docsUrl() is added, and 5e's pair is stated where it is read",
        find: 'export const ENV_NAMES = Object.freeze([...KNOWN]);',
        replace: text(
          '/**',
          " * This site's own origin, with any trailing slash removed.",
          ' *',
          ' * **The pair with siteUrl() above is the one 5e says is worth a test of its',
          ' * own.** The relying party id comes from SITE_URL, which on this site is the',
          " * portal's host. The expected origin of a passkey response comes from here.",
          ' * The wrong way round either breaks the docs sign in or accepts an assertion',
          ' * made somewhere else entirely, and only one of those two failures is loud.',
          ' */',
          'export function docsUrl() {',
          "  return requireEnv('DOCS_URL').replace(/\\/+$/, '');",
          '}',
          '',
          'export const ENV_NAMES = Object.freeze([...KNOWN]);'
        ),
      },
    ],
  },
  {
    path: 'api/_lib/supabase.js',
    note: text(
      "The staff session table is this site's own, per 5h. Everything else is the",
      'same project, the same service key, and the same rows.'
    ),
    rules: [
      {
        why: 'staff sessions are gftvjobs_docs_sessions, per 5h and migration 038',
        find: "  staffSessions: 'gftvjobs_staff_sessions',",
        replace: text(
          '  // **gftvjobs_docs_sessions, and never gftvjobs_staff_sessions.** 5h: its own',
          '  // cookie and its own table, so a docs sign in is never mistaken for a',
          '  // gftv.asia one and signing out of one site does not sign you out of the',
          '  // other. The key stays staffSessions so every reader of it is unchanged,',
          '  // and 038 gave the two tables the same shape, which is what makes that safe.',
          "  staffSessions: 'gftvjobs_docs_sessions',"
        ),
      },
      {
        why: 'Supabase requests are labelled as this application',
        find: "    headers: { 'x-application-name': 'careers-gftv' },",
        replace: "    headers: { 'x-application-name': 'careers-gftv-docs' },",
      },
    ],
  },
  {
    path: 'api/_lib/cookies.js',
    note: text(
      'Its own session and device cookie names, per 5h, and its own idea of what',
      'local development is. Host scoped, and nothing is set on the parent domain.'
    ),
    rules: [
      {
        why: 'the header names the cookies this site actually sets',
        find: text(
          '// Four cookies exist across the two realms, and they never share a name:',
          '//',
          '//   gftv_staff_session       staff session, expiry matches the session row',
          '//   gftv_staff_device        staff trusted device token, long lived',
          '//   gftv_applicant_session   applicant session, expiry matches the session row',
          '//   gftv_applicant_device    applicant trusted device token, long lived'
        ),
        replace: text(
          "// Two cookies are set here, and both are this host's own:",
          '//',
          '//   gftv_docs_session        docs staff session, expiry matches the row',
          '//   gftv_docs_device         docs trusted device token, long lived',
          '//',
          '// Trusting a device here does not trust it on the portal, per 5h, and 16b',
          '// says to put that beside the checkbox rather than let somebody conclude the',
          '// checkbox failed.',
          '//',
          '// The applicant pair is still in the object below and is never set: this site',
          '// has one realm. It stays because the file is a generated duplicate of the',
          "// portal's, and a copy that quietly drops things is a copy nobody can",
          '// compare.'
        ),
      },
      {
        why: 'the session and device cookies are gftv_docs_*',
        find: text(
          "  staffSession: 'gftv_staff_session',",
          "  staffDevice: 'gftv_staff_device',"
        ),
        replace: text("  staffSession: 'gftv_docs_session',", "  staffDevice: 'gftv_docs_device',"),
      },
      {
        // Phase 13 part 6. The staff forgot password flow in 5g runs on both
        // sites and binds its ticket to one browser with a nonce cookie, so the
        // name follows the session and device cookies above for the same
        // reason: a reset started on one site must not have its nonce
        // overwritten by a reset started on the other.
        why: "the reset nonce is this host's own, gftv_docs_reset_nonce",
        find: "  staffResetNonce: 'gftv_staff_reset_nonce',",
        replace: "  staffResetNonce: 'gftv_docs_reset_nonce',",
      },
      {
        why: "local development is judged by this site's origin, not the portal's",
        find: "  const site = process.env.SITE_URL ?? '';",
        replace: text(
          "  // DOCS_URL rather than SITE_URL: the cookie being set is this site's, and",
          '  // SITE_URL here is the portal, which can perfectly well be the production',
          '  // one while this is running on localhost.',
          "  const site = process.env.DOCS_URL ?? '';"
        ),
      },
    ],
  },
  {
    path: 'api/_lib/audit.js',
    note: text(
      'Identical since part 2. Every row it writes is still stamped as this site,',
      'per 5f and 5g, but the stamp is site.js above and this file only imports',
      'it. It carried the rule itself in part 1, and lost it the moment a second',
      'file needed the same fact.'
    ),
  },
  {
    path: 'api/_lib/rate-limit.js',
    note: text(
      'Identical, and the table is shared on purpose. The limits are per account',
      'and per address, so attempts against one account count together across both',
      'sites. The routes pass the same action names for that reason.'
    ),
  },
  {
    path: 'api/_lib/accounts.js',
    note: 'Identical. One set of gftvhello_users rows, read the same way.',
  },
  {
    path: 'api/_lib/webauthn.js',
    note: text(
      "5e's one real difference: the relying party id is the portal's host and the",
      "expected origin is this site's. Everything else, the credential tables",
      'included, is shared.'
    ),
    rules: [
      {
        why: 'docsUrl is imported for the expected origin',
        find: "import { siteUrl } from './env.js';",
        replace: "import { siteUrl, docsUrl } from './env.js';",
      },
      {
        why: 'the docblock says which host SITE_URL names on this site',
        find: text(
          ' * Derived from SITE_URL rather than configured separately, so it is right in',
          ' * every environment without a second variable to keep in step. Locally that is',
          ' * "localhost", which WebAuthn permits over plain http as the one exception to',
          ' * its https requirement.'
        ),
        replace: text(
          ' * Derived from SITE_URL rather than configured separately, so it is right in',
          ' * every environment without a second variable to keep in step. **On this site',
          ' * SITE_URL is the portal**, which is the point of it: both sites claim the',
          " * portal's host as the relying party id, because careers.globalfurry.tv is a",
          ' * registrable suffix of docs.careers.globalfurry.tv and is not a public',
          ' * suffix, so one enrolment covers both. Locally that is "localhost", which',
          ' * WebAuthn permits over plain http as the one exception to its https',
          ' * requirement.'
        ),
      },
      {
        why: 'the expected origin is DOCS_URL while the id stays SITE_URL',
        find: text(
          'export function relyingParty() {',
          '  const url = new URL(siteUrl());',
          '  return { id: url.hostname, origin: url.origin, name: RP_NAME };',
          '}'
        ),
        replace: text(
          'export function relyingParty() {',
          '  // **The pair, and the one thing on this site that is not a copy.** The id is',
          "  // the portal's host, so a passkey registered there is offered here. The",
          "  // origin is this site's own, because a response is verified against where it",
          '  // was actually created. Swapped, this either breaks the docs sign in loudly',
          '  // or accepts an assertion from the wrong origin quietly.',
          '  return {',
          '    id: new URL(siteUrl()).hostname,',
          '    origin: new URL(docsUrl()).origin,',
          '    name: RP_NAME,',
          '  };',
          '}'
        ),
      },
    ],
  },
  {
    path: 'api/_lib/session.js',
    note: text(
      'Identical, which is the argument for generating the two files above it. The',
      'cookie and the table are named in cookies.js and supabase.js, so the session',
      'logic itself needs no rule at all.'
    ),
  },
  {
    path: 'api/auth/staff/login.js',
    note: text(
      'Identical. The same accounts, the same access rule, and the same refusal to',
      'issue a session before a second factor has been satisfied.'
    ),
  },
  {
    path: 'api/auth/staff/verify-2fa.js',
    note: text(
      'Identical, and the challenge table is shared on purpose. 5e: "the challenge',
      'tables are shared, since a challenge is a short lived random string with no',
      'privileges of its own". A challenge issued by the portal can therefore be',
      'answered here, which buys nobody anything: it is handed to the browser that',
      'has just passed the password step, and redeeming it still costs a second',
      'factor. What it does mean is that a passkey assertion made against this',
      "origin verifies here and not on the portal, because webauthn.js's expected",
      'origin is this site while the relying party id is not.'
    ),
  },
  {
    path: 'api/auth/staff/logout.js',
    note: 'Identical.',
  },
  {
    path: 'api/auth/staff/session.js',
    note: 'Identical.',
  },
  {
    path: 'api/auth/staff/passkeys.js',
    note: text(
      'Identical. The credential table is shared and so is the relying party id,',
      'so a passkey registered here is offered on the portal and the other way',
      'round. Which of the two made it is registered_on, written from site.js, and',
      'the row is the only place that fact exists.'
    ),
  },
  {
    path: 'api/auth/staff/trusted-devices.js',
    note: text(
      'Identical, and the table is shared while the cookie is not. Trusting a',
      'browser here does not trust it on the portal, per 5h, because the device',
      'cookie is host scoped -- but gftvhello_trusted_devices has no column saying',
      "which site wrote a row, so this endpoint lists and revokes both sites'",
      'devices for the account. The header of the source file is the account of',
      'that, and it is the same account on both copies.'
    ),
  },

  /* ---------------------------------------------------------------------
   * Phase 13 part 6. 5f's account settings suite, and 5g's recovery flow.
   *
   * **Every one of these is identical, and that is the finding of the part.**
   * Part 2 said the same thing about the second factor and gave the reason:
   * the cookie is settled in cookies.js, the table in supabase.js, the relying
   * party pair in webauthn.js and which site this is in site.js, so by the time
   * a route or a page module is reached there is nothing left for it to know.
   * Fourteen more files and no new rule.
   * ------------------------------------------------------------------- */

  {
    path: 'api/_lib/staff-account.js',
    note: text(
      'Identical. **The only file in either project that writes gftvhello_users**,',
      "which is why it is one file: section 2's two named exceptions are",
      'password_hash per 5g and totp_secret per phase 13 decision 7, and collecting',
      'both here makes a third one a diff somebody reviews. The sessions half',
      'reads both staff session tables by name, on both sites, because 5f asks',
      'where the account is signed in and the answer spans the two.'
    ),
  },
  {
    path: 'api/_lib/qr.js',
    note: text(
      "Identical. The TOTP enrolment QR is drawn from this site's own function",
      'and never fetched, which is phase 11 part 4\'s rule about a credential',
      'never leaving this build to be rendered, arriving at a sharper case: the',
      'otpauth URI carries the shared secret in the clear.'
    ),
  },
  {
    path: 'api/auth/staff/account.js',
    note: text(
      "Identical. It answers the whole settings page in one call and stamps SITE",
      'into the response, so the page says which site it is on without working it',
      'out from its own hostname.'
    ),
  },
  {
    path: 'api/auth/staff/totp.js',
    note: text(
      'Identical, and it is the one route that writes gftvhello_users.totp_secret.',
      'The issuer in the otpauth URI is the portal\'s name on both sites',
      'deliberately: there is one secret on one account, and two entries in',
      "somebody's authenticator would be two names for one credential."
    ),
  },
  {
    path: 'api/auth/staff/recovery-codes.js',
    note: text(
      "Identical. Both code sets, per 5g: the recovery set is this build's own",
      'table and the backup set is gftv.asia\'s, which is why only one of the two',
      'answers reaches_gftv_asia.'
    ),
  },
  {
    path: 'api/auth/staff/danger.js',
    note: text(
      "Identical. 5f's six actions, and two of them cross both sites by the same",
      'facts the panels above describe: one relying party id for passkeys, one',
      'shared trusted device table. Signing out everywhere names both session',
      'tables, which is the only place 5h has to be spelled out twice.'
    ),
  },
  {
    path: 'api/auth/staff/forgot-password.js',
    note: text(
      "Identical. 5g's flow runs on both sites against the same accounts and the",
      'same codes, and the ticket it issues is bound to the browser by the nonce',
      'cookie cookies.js renames.'
    ),
  },
  {
    path: 'api/auth/staff/reset-password.js',
    note: text(
      'Identical, and it is where the flow above writes password_hash. The audit',
      'row it puts in first carries the site stamp from audit.js, which is how',
      '5g\'s "which site it came from" is answered without this file knowing.'
    ),
  },

  {
    // Phase 13 part 4. **The tokens are not copied by hand at any price.**
    // Phase 12 part 3 measured every colour in this file against 1.4.3 and
    // 1.4.11 in all four combinations of theme and mode, found seven things,
    // and added a token. A second palette that started as a copy of this one
    // would be a second palette nobody ever measures again, and the failure
    // would be invisible: it looks right, and it is 3.9:1.
    path: 'assets/css/theme.css',
    comment: 'css',
    note: text(
      'Identical, and it is the whole reason this generator learned to write a',
      'CSS banner. 16d: "two axis theming exactly as the main site, same tokens,',
      'same data-color-theme and data-mode attributes, light default, WCAG AA in',
      'every combination." Same tokens means the same file.',
      '',
      'The docs site draws its own components out of these, and part 3 of phase 12',
      'is the standing warning about that: a ratio cannot tell you a state is drawn',
      'only in hue, and every component here is new.'
    ),
  },
  {
    path: 'assets/js/theme.js',
    comment: 'js',
    note: text(
      'Identical. The two axes, the three mode preferences, the time based mode,',
      'and the legacy key migration. The localStorage keys are the same names on',
      'purpose and cannot collide: storage is scoped per origin, so this site',
      "reads its own values and a reader's portal choice does not follow them",
      'here. What that costs is stated in docs-site/README.md, since somebody will',
      'notice their theme did not come with them.'
    ),
  },
  {
    path: 'assets/js/i18n.js',
    comment: 'js',
    note: text(
      'The dictionary machinery, per decision 5: the shell is written with keys',
      'and an English dictionary now, and 华文 lands in phase 14 beside the pages',
      'it belongs to. LOCALES still names both languages, which is correct and',
      'costs nothing -- there is no switcher in this header, per 16d, so zh is',
      'never selected and zh.json is never fetched.'
    ),
    rules: [
      {
        why: 'there is no account here to mirror a language choice onto',
        find: text(
          '  // Section 3a, and the reason gftvjobs_users.locale exists. localStorage is',
          '  // the source of truth for rendering, and the server cannot read it. The',
          '  // Telegram bot in phase 11 has to start conversations with people who are',
          '  // not looking at the site, so the choice is mirrored onto the account',
          '  // whenever there is one to mirror it onto.',
          '  //',
          '  // Deliberately not awaited: the language has already been applied, and a',
          '  // slow or failed write must not hold up the page. Signed out callers get a',
          '  // 200 saying nothing was stored.',
          '  storeLocaleOnAccount(locale);'
        ),
        replace: text(
          '  // Nothing to mirror the choice onto. The portal writes it to',
          '  // gftvjobs_users here, per 3a, because the Telegram bot has to start',
          '  // conversations with people who are not looking at the site. This site',
          "  // has one realm, its accounts are gftvhello_users rows that section 2",
          '  // forbids writing to, and nothing on it ever speaks first. The choice',
          '  // lives in this browser and nowhere else.'
        ),
      },
      {
        why: 'and so the function that did it is not carried across',
        find: text(
          '/**',
          ' * Mirror the language choice onto the signed in account, if there is one.',
          ' *',
          ' * Skipped on the first application of the stored preference, which happens on',
          ' * every page load: that is not somebody changing language, and a request per',
          ' * page view to record a value that has not changed is waste. Only an actual',
          ' * change is written.',
          ' */',
          'let lastStoredLocale = null;',
          '',
          'function storeLocaleOnAccount(locale) {',
          '  if (lastStoredLocale === null) {',
          '    lastStoredLocale = locale;',
          '    return;',
          '  }',
          '  if (lastStoredLocale === locale) return;',
          '  lastStoredLocale = locale;',
          '',
          "  fetch('/api/auth/applicant/locale', {",
          "    method: 'POST',",
          "    credentials: 'same-origin',",
          "    headers: { 'Content-Type': 'application/json' },",
          '    body: JSON.stringify({ locale }),',
          '    keepalive: true,',
          '  }).catch(() => {',
          '    // Offline, or signed out with the network refusing. The choice is stored',
          '    // in this browser either way, which is what rendering depends on.',
          '  });',
          '}',
          ''
        ),
        replace: '',
      },
    ],
  },
/* ---------------------------------------------------------------------
   * Phase 13 part 6, the browser half. **The page is these modules and an
   * empty container**, per 5f's "specify it once and mount it twice" and
   * decision 8: staff-account.js builds every panel, so there is no second
   * markup on this site to fall out of step with the portal's.
   *
   * The class names it writes are the portal's, and docs.css defines the same
   * names in this site's own language. **That stylesheet is the adapter**, and
   * it is why not one of these eight files needs a rule: a transform that
   * rewrote class names in generated JavaScript would be a second thing to keep
   * in step, and the thing it would keep in step is already a stylesheet.
   * ------------------------------------------------------------------- */

  {
    path: 'assets/js/api.js',
    comment: 'js',
    note: text(
      'Identical. One fetch wrapper, the same JSON shape respond.js answers in,',
      'and the same connection events. Its applicant helpers are carried across',
      'unused, for the reason cookies.js carries the applicant cookie names: a',
      'copy that quietly drops things is a copy nobody can compare.'
    ),
  },
  {
    path: 'assets/js/icons.js',
    comment: 'js',
    note: 'Identical. Inline SVG, no imports, and no network.',
  },
  {
    // Phase 14 part 1. It came across for chrome-modals.js below and for
    // nothing else, which is why the docs site got this far without it:
    // danger-confirm.js builds its own <dialog> element and never asked.
    path: 'assets/js/dialog.js',
    comment: 'js',
    note: text(
      'Identical. One modal shell for the whole build -- a native <dialog>, so the',
      'inert page behind it, the focus trap and Escape are the browser\'s and not a',
      'copy of somebody\'s. It imports i18n.js and icons.js and nothing else, both',
      'of which were already here.'
    ),
  },
  {
    // Phase 14 part 4, and the reason this file exists at all. It was the top
    // half of the portal's offline.js until this site shipped a worker of its
    // own; update-bar-spec.md is portable by its own first lines, so the choice
    // was one implementation or two, and this is the one.
    path: 'assets/js/connection-bar.js',
    comment: 'js',
    note: text(
      'Identical. Registering a worker, the update prompt, and the two connection',
      'wordings are the same job on both sites, so the three places they differ are',
      'arguments instead of edits: where the bar goes, whether "cannot reach us"',
      'has a status page to link to, and what else redraws with it. It imports',
      'i18n.js and icons.js, both of which were already here.'
    ),
  },
  {
    path: 'assets/js/chrome-modals.js',
    comment: 'js',
    note: text(
      'Identical, and the reason it is a file at all. gftv-theme.md section 3 is',
      'markup: it prescribes this modal, its two sections, and the .icon-btn that',
      'opens it. This site had the tokens generated in and none of the chrome, so',
      'part 1 moved the four functions out of the portal\'s shell.js -- which draws',
      'a navigation drawer, a footer and a build status notice this site wants none',
      'of -- and copies them here whole.',
      '',
      '**No rule, because the two headers use the same two ids.** Both functions',
      'find their opener with document.querySelector("#themeButton") and',
      '"#languageButton", so the docs header carries those ids and this file needs',
      'to know nothing about which site it is on. theme.css, generated in since',
      'part 4, already defined .icon-btn, .modal, .swatch, .mode-toggle and',
      '.locale-btn -- this site had been shipping the styles of controls it had',
      'never built.'
    ),
  },
  {
    path: 'assets/js/format.js',
    comment: 'js',
    note: text(
      'Identical. Dates in Singapore order, which is the same answer shell.js',
      'reaches with its own two line map -- that one stays separate because it',
      'predates this file being generated and needs nothing else in here.'
    ),
  },
  {
    path: 'assets/js/run-action.js',
    comment: 'js',
    note: text(
      'Identical, and it is a load bearing forty lines: never call an async',
      'handler bare from a listener. Four places in this build now use it.'
    ),
  },
  {
    path: 'assets/js/passkeys.js',
    comment: 'js',
    note: text(
      'Identical. The WebAuthn ceremony in the browser, which needs no imports',
      'and nothing site specific: 5e settles the relying party pair on the',
      'server, and this file only carries what the API answered to the platform',
      'and back.'
    ),
  },
  {
    path: 'assets/js/danger-confirm.js',
    comment: 'js',
    note: text(
      "Identical. 7g's three steps, which 5f's danger zone adopts unchanged, plus",
      'the fourth panel for a fresh second factor. The staff page passes an',
      'onCodeStep that sends nothing and only replaces the note under the field:',
      'a TOTP code is already on the phone, where a Telegram one has to be asked',
      'for.'
    ),
  },
  {
    path: 'assets/js/recovery-codes.js',
    comment: 'js',
    note: text(
      "Identical. 5c's shown once dialog with its copy, download, and saved",
      'checkbox, and 5g asks for the staff sets to work "exactly as 5c describes".',
      'Its endpoint became an argument in part 6 for that reason; the applicant',
      'default is never used here and is left in place rather than transformed',
      'away.'
    ),
  },
  {
    path: 'assets/js/staff-forgot-password.js',
    comment: 'js',
    note: text(
      "Identical. 5g's flow, at /admin/forgot-password on the portal and at",
      '/forgot-password here, from one module for the reason 5f gives about the',
      'settings page: two copies of a screen that sets a password is how one of',
      'them ends up asking for less than the other.'
    ),
  },
  {
    path: 'assets/js/staff-account.js',
    comment: 'js',
    note: text(
      "Identical, and it is the whole of 16c: the page at /account on this site",
      'and at /admin/security on the portal, built from one file. What the two',
      'sites tell it is three data attributes on the container -- where to send a',
      'signed out reader, where back goes, and the gftv.asia account page 5f',
      'links to for the fields this project may not edit.'
    ),
  },
];

/**
 * Files copied byte for byte, with no banner, because there is nowhere in one to
 * put a comment. Everything else about them is the FILES rule: the copy is
 * written by this generator, `--check` fails when it drifts, and it is never
 * edited in place.
 *
 * `to` is where the copy goes when that is not the source's own path. Only the
 * brand images need it: the portal serves them from its root because it has no
 * build step, and this site's root is `dist/`, which is emptied and rebuilt.
 * `public/` is the directory the build copies into the root of it.
 */
const ASSETS = [
  {
    path: 'assets/fonts/ProximaNova-Regular.woff2',
    note: 'The one font file this repository carries. theme.css names it by path.',
  },
  // The brand images, phase 14 part 2b. **Copied rather than linked across.**
  // Two Vercel projects means two origins, and a docs site whose tab icon is
  // fetched from the portal is a docs site with a blank tab whenever the portal
  // is renamed, moved, or having a bad afternoon. Copying puts them under the
  // same rule as every other shared file: this generator writes them and
  // `--check` fails when the portal's change has not reached here.
  //
  // Three of the seven, and the four left behind are the manifest's. `HLC-192`,
  // `HLC-512` and the two maskable variants exist for an installed application
  // icon; this site has no manifest and no worker, per phase 13 decision 3, so
  // copying them would be four files nothing on this site names.
  {
    path: 'favicon.ico',
    to: 'public/favicon.ico',
    note: 'The tab icon. One GFTV, so one icon in both tabs.',
  },
  {
    path: 'HLC-180.png',
    to: 'public/HLC-180.png',
    note: 'apple-touch-icon, for a page saved to an iOS home screen.',
  },
  {
    path: 'HLC-main.png',
    to: 'public/HLC-main.png',
    note: text(
      'The image on a link card, and the same file the portal points at, so both',
      'cards carry the same mark. Every page of this site shares one: a per page',
      'image would be 76 captures to keep current.',
      'It pairs with twitter:card = summary, which is the small thumbnail card and',
      'not summary_large_image, so the mark sits beside the title instead of',
      'becoming a banner over it.'
    ),
  },
];

/**
 * Directories the generator owns, and the hand written files allowed to sit in
 * them. Anything else found there is a failure: a file nobody generated, beside
 * a dozen that were, is how the next person concludes the directory is theirs
 * to edit.
 */
const OWNED_DIRECTORIES = [
  'api/_lib',
  'api/auth/staff',
  // Phase 13 part 4. The shell's own modules live here beside three generated
  // ones, which is exactly the mixture this check exists to keep honest.
  'assets/css',
  'assets/js',
  'assets/fonts',
  // Phase 14 part 2b. The build copies everything here into the root of
  // `dist/`, so a file that appears in it becomes a public address with no
  // review. The scan reads one level, so 16g's `public/screenshots/` is out of
  // its way and stays this site's own.
  'public',
];

/** What counts as a file in one of those directories. */
const OWNED_EXTENSIONS = ['.js', '.css', '.woff2', '.png', '.ico'];

/**
 * The gate, from phase 13 part 3, and the only three files in either directory
 * that are this site's own.
 *
 * **They are not generated because the portal has no equivalent to generate them
 * from.** The portal has one staff area behind one access rule; this site has
 * four tiers of reader behind that same rule, and a page list read off two
 * content trees. Writing the portal a copy of either, so that this one could be
 * derived from it, would be inventing a module over there to satisfy a rule made
 * for the modules that were already shared.
 *
 * The rule that stays true: nothing in these directories is a hand written file
 * nobody declared. Each of the three opens by saying it is this site's own and
 * naming this list, so the two kinds of file are never confused for each other.
 */
const OWN = [
  // The gate, phase 13 part 3.
  'api/_lib/tiers.js',
  'api/_lib/pages.js',
  'api/_lib/reader.js',
  // What the build leaves behind for the functions, phase 13 part 5. The portal
  // has no equivalent for the plainest of reasons: it has no build step, which
  // is the rule 16e makes this site the stated exception to.
  'api/_lib/generated.js',
  // The shell, phase 13 part 4. The layout, its behaviour, and the renderer the
  // two pipelines share. The portal has no equivalent of any of the three: its
  // markdown.js renders a posting body, which is paragraphs and bullets and no
  // heading, and a documentation page is nothing but headings.
  'assets/css/docs.css',
  'assets/js/shell.js',
  'assets/js/markdown.js',
  // The sign in form, phase 13 part 6. **Not generated, and the reason it is
  // not is the one thing worth saying about it.** 5f asks for the account
  // settings suite to be one implementation mounted twice, and 5g's reset flow
  // follows it, so both of those are the portal's modules generated in. Nothing
  // says the same about a sign in form, and the portal's staff login is marked
  // up inside admin/login/index.html: sharing it would have meant rewriting a
  // working sign in on a live site to serve a page that had never had one. The
  // endpoints are shared, which is where 5h says the two are meant to agree.
  'assets/js/docs-login.js',
  // The service worker, phase 14 part 4. **Not generated, and the portal's is
  // not a template for it.** main-site/sw.js is 1,032 lines of an IndexedDB
  // action queue, a postings cache with an eviction policy, and the maintenance
  // switches; this site has none of those and has a tier, which the portal has
  // no equivalent of. What the two share is the shape of the lifecycle, and
  // sharing a shape is not sharing a file. The precache list is written into
  // this one by scripts/build.js, which is the other reason it could not be a
  // copy: the portal has no build step to write anything.
  'sw.js',
  // The developer guide's download table, phase 14 part 7. The portal has no
  // equivalent and could not: what it draws is a data file the content route
  // sent inside a gated page, and the portal has no gate, no tiers and no
  // content route. It is the one module on either site that handles a string it
  // did not render through markdown.js, which is why it builds every node
  // itself and assigns no markup anywhere.
  'assets/js/test-scripts.js',
];

/* -------------------------------------------------------------------------
 * Generating
 * ---------------------------------------------------------------------- */

function banner(entry, globalHits) {
  const differences = [
    ...(entry.rules ?? []).map((rule) => rule.why),
    ...globalHits.map((rule) => rule.why),
  ];

  const lines = [
    'GENERATED FILE. Do not edit this copy.',
    '',
    `Written by gen-docs-lib.js from main-site/${entry.path}.`,
    'Change that file and run:  node gen-docs-lib.js',
    '',
    'It exists because Vercel builds each project from its own root directory, so',
    "this site cannot import the portal's modules. 5h: duplicate them, and keep",
    'the two copies identical.',
    '',
  ];

  if (entry.note) {
    for (const line of entry.note.split('\n')) lines.push(line);
    lines.push('');
  }

  if (differences.length > 0) {
    lines.push("What differs from the portal's copy, and why:");
    for (const why of differences) lines.push(`  - ${why}`);
  } else {
    lines.push("Nothing differs from the portal's copy but this banner.");
  }

  // A stylesheet has no line comment, so the same banner is wrapped in a block
  // one. The marker text is identical in both, which is what lets a reader --
  // and a grep -- recognise a generated file without knowing its language.
  if (entry.comment === 'css') {
    return ['/*', ...lines.map((line) => (line === '' ? ' *' : ` * ${line}`)), ' */', '', ''].join('\n');
  }

  return [...lines.map((line) => (line === '' ? '//' : `// ${line}`)), ''].join('\n');
}

/**
 * Apply one file's rules, refusing when a rule matches the wrong number of
 * times. That refusal is the check: the two copies are meant to differ in
 * exactly these places, so a rule that no longer matches means the portal has
 * changed something this site was quietly depending on.
 */
function transform(entry, source) {
  let out = source;
  const problems = [];
  const globalHits = [];

  for (const rule of GLOBAL) {
    if (out.includes(rule.find)) {
      out = out.split(rule.find).join(rule.replace);
      globalHits.push(rule);
    }
  }

  for (const rule of entry.rules ?? []) {
    const wanted = rule.times ?? 1;
    const hits = out.split(rule.find).length - 1;

    if (hits !== wanted) {
      problems.push(
        `    ${rule.why}\n` +
          `      expected ${wanted} match${wanted === 1 ? '' : 'es'}, found ${hits}\n` +
          '      the first line it looks for:\n' +
          `        ${rule.find.split('\n')[0]}`
      );
      continue;
    }

    out = out.split(rule.find).join(rule.replace);
  }

  return { out: `${banner(entry, globalHits)}${out}`, problems };
}

/**
 * Normalised on read so a working tree checked out with CRLF produces the same
 * bytes as one checked out with LF, and --check does not fail on a git setting.
 */
async function read(site, path) {
  const source = await readFile(join(HERE, site, path), 'utf8');
  return source.replace(/\r\n/g, '\n');
}

/** Where an asset's copy goes, which is its own path unless it says otherwise. */
const assetTarget = (entry) => entry.to ?? entry.path;

/** The byte for byte copies. Same three properties, no transform to get wrong. */
async function copyAssets(written, stale, missing) {
  for (const entry of ASSETS) {
    const source = await readFile(join(HERE, 'main-site', entry.path));
    const path = assetTarget(entry);

    let existing = null;
    try {
      existing = await readFile(join(HERE, 'docs-site', path));
    } catch {
      existing = null;
    }

    if (existing !== null && existing.equals(source)) continue;

    if (CHECK) {
      (existing === null ? missing : stale).push(path);
      continue;
    }

    const target = join(HERE, 'docs-site', path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
    written.push(path);
  }
}

async function generate() {
  const written = [];
  const stale = [];
  const missing = [];
  const failures = [];

  for (const entry of FILES) {
    // Nothing catches a missing source. An entry naming a file the portal does
    // not have is a mistake in this manifest, and a generator that shrugged at
    // one would let the docs site quietly lose a module.
    const source = await read('main-site', entry.path);
    const { out, problems } = transform(entry, source);

    if (problems.length > 0) {
      failures.push(`  main-site/${entry.path}\n${problems.join('\n')}`);
      continue;
    }

    let existing = null;
    try {
      existing = await read('docs-site', entry.path);
    } catch {
      existing = null;
    }

    if (existing === out) continue;

    if (CHECK) {
      (existing === null ? missing : stale).push(entry.path);
      continue;
    }

    const target = join(HERE, 'docs-site', entry.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, out, 'utf8');
    written.push(entry.path);
  }

  if (failures.length === 0) await copyAssets(written, stale, missing);

  return { written, stale, missing, failures };
}

/** Files sitting in a generated directory that nothing here put there. */
async function strays() {
  const expected = new Set([
    ...FILES.map((entry) => entry.path),
    ...ASSETS.map(assetTarget),
    ...OWN,
  ]);
  const found = [];

  for (const directory of OWNED_DIRECTORIES) {
    let names;
    try {
      names = await readdir(join(HERE, 'docs-site', directory));
    } catch {
      continue;
    }

    for (const name of names) {
      if (!OWNED_EXTENSIONS.some((extension) => name.endsWith(extension))) continue;
      const path = `${directory}/${name}`;
      if (!expected.has(path)) found.push(path);
    }
  }

  return found;
}

/* -------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------- */

const { written, stale, missing, failures } = await generate();
const unexpected = await strays();

if (failures.length > 0) {
  console.error('A rule no longer matches its source, so nothing was written.\n');
  console.error(failures.join('\n\n'));
  console.error(
    '\nThe portal has changed a line the docs site was depending on. Decide what' +
      '\nthis site should do about that change, update the rule in gen-docs-lib.js,' +
      '\nand run it again. Do not edit the generated copy.'
  );
  process.exit(1);
}

if (unexpected.length > 0) {
  console.error('Files in a generated directory that the generator did not write:\n');
  for (const path of unexpected) console.error(`  docs-site/${path}`);
  console.error(
    "\nEither add it to FILES so it is generated from the portal's copy, or to OWN" +
      "\nwhen it is genuinely this site's own. A hand written file sitting beside the" +
      '\ngenerated ones is how the whole directory stops being trusted.'
  );
  process.exit(1);
}

if (CHECK) {
  if (stale.length === 0 && missing.length === 0) {
    console.log(`docs-site is current: ${FILES.length} generated files.`);
    process.exit(0);
  }

  console.error('The docs site copies are out of date.\n');
  for (const path of missing) console.error(`  missing  docs-site/${path}`);
  for (const path of stale) console.error(`  stale    docs-site/${path}`);
  console.error('\nRun: node gen-docs-lib.js');
  process.exit(1);
}

if (written.length === 0) {
  console.log('Nothing to do. Every copy was already current.');
} else {
  console.log(`Wrote ${written.length} file${written.length === 1 ? '' : 's'}:`);
  for (const path of written) console.log(`  docs-site/${path}`);
}

const here = relative(process.cwd(), HERE);
if (here !== '') console.log(`\n(repo root: ${here})`);
