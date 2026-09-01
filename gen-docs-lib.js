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
      'which site wrote a row, so this endpoint lists and revokes both sites\'',
      'devices for the account. The header of the source file is the account of',
      'that, and it is the same account on both copies.'
    ),
  },
];

/**
 * Directories the generator owns, and the hand written files allowed to sit in
 * them. Anything else found there is a failure: a file nobody generated, beside
 * a dozen that were, is how the next person concludes the directory is theirs
 * to edit.
 */
const OWNED_DIRECTORIES = ['api/_lib', 'api/auth/staff'];
const OWN = [];

/* -------------------------------------------------------------------------
 * Generating
 * ---------------------------------------------------------------------- */

function banner(entry, globalHits) {
  const differences = [
    ...(entry.rules ?? []).map((rule) => rule.why),
    ...globalHits.map((rule) => rule.why),
  ];

  const lines = [
    '// GENERATED FILE. Do not edit this copy.',
    '//',
    `// Written by gen-docs-lib.js from main-site/${entry.path}.`,
    '// Change that file and run:  node gen-docs-lib.js',
    '//',
    '// It exists because Vercel builds each project from its own root directory, so',
    "// this site cannot import the portal's modules. 5h: duplicate them, and keep",
    '// the two copies identical.',
    '//',
  ];

  if (entry.note) {
    for (const line of entry.note.split('\n')) lines.push(`// ${line}`);
    lines.push('//');
  }

  if (differences.length > 0) {
    lines.push("// What differs from the portal's copy, and why:");
    for (const why of differences) lines.push(`//   - ${why}`);
  } else {
    lines.push("// Nothing differs from the portal's copy but this banner.");
  }

  lines.push('');
  return lines.join('\n');
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

  return { written, stale, missing, failures };
}

/** Files sitting in a generated directory that nothing here put there. */
async function strays() {
  const expected = new Set([...FILES.map((entry) => entry.path), ...OWN]);
  const found = [];

  for (const directory of OWNED_DIRECTORIES) {
    let names;
    try {
      names = await readdir(join(HERE, 'docs-site', directory));
    } catch {
      continue;
    }

    for (const name of names) {
      if (!name.endsWith('.js')) continue;
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
