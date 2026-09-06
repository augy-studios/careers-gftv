// 16g's capture run. Every screenshot the documentation points at, taken with
// Playwright against a portal with seeded data in it.
//
//   BASE=https://careers.globalfurry.tv node scripts/capture.mjs
//   BASE=... node scripts/capture.mjs --only=portal-search-desktop-light
//   BASE=... node scripts/capture.mjs --dry-run --only=portal-login-desktop-light
//   node scripts/capture.mjs --list
//
// **It runs on demand, from somebody's laptop, and never on a deploy.** 16g says
// so and Vercel could not run it anyway; `scripts/package.json` beside this file
// is what keeps `playwright` and `sharp` out of the two projects that do deploy.
//
// ---------------------------------------------------------------------------
// What it points at, and the one place this departs from 16g
// ---------------------------------------------------------------------------
//
// 16g says "against a local or staging instance, never against production", and
// **this build has no such instance**. `seed.mjs` opens by saying why:
// main-site/.env.example asks for the existing GFTV Supabase project rather than
// a new one, so "local testing" and "the live site" are the same rows, and a
// preview deployment reads the same database while breaking passkeys.
//
// So the run is production with the seed in it, which is decision 27's sitting:
// `node seed.mjs --yes --anyway` opens it and `node seed.mjs --clear --yes`
// closes it, and the captures happen in between. Settled 4 September 2026 and
// written up as this phase's deviation from 16g.
//
// **What makes that safe is checked rather than remembered**, and it is the
// first thing this script does: it loads the board and refuses to go on unless
// it finds a seeded posting. A capture run against an unseeded board would
// photograph real applicants into a guide, which is the exact sentence 16g's
// rule was written to prevent, and it is the failure a person is most likely to
// walk into — everything looks normal, and the pictures are wrong.
//
// The two things no seed can cover are masked instead, per the manifest:
// whoever ran the capture, and the staff access list, which is gftv.asia's realm
// and the one table this build may only read.
//
// ---------------------------------------------------------------------------
// What it writes
// ---------------------------------------------------------------------------
//
//   public/screenshots/<name>.webp     a portal-* shot, public
//   api/_content/<section>/<name>.webp a poster-* or admin-* shot, gated
//
// and then **it swaps the `pending:` marker in every page that pointed at a shot
// it took**. 16g asks for placeholder slots "until the first capture run", so
// the run is what ends them; doing it by hand across 25 markers in 22 files is
// how a set ships with three pages still saying pending. `--no-swap` leaves them
// alone for anybody who wants to look at the files first.
//
// `node scripts/build.js` is what proves the result: a marker naming a shot that
// is not in the manifest, an entry no page points at, and a gated shot sitting
// in the public directory are all build failures rather than review comments.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { SHOTS, ALWAYS_MASKED, VIEWPORTS, filesFor, markdownSrc } from './screenshots.manifest.js';
import {
  CLOCK,
  LOCALE,
  TIMEZONE,
  STILL_CSS,
  TIMEOUT_MS,
  WEBP_QUALITY,
  MASK_COLOR,
} from './playwright.config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(HERE, '..');
const REPO = resolve(DOCS, '..');

/* -------------------------------------------------------------------------
 * Arguments and the environment
 * ---------------------------------------------------------------------- */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const ONLY = value('only')?.split(',').map((entry) => entry.trim()) ?? null;
const HEADED = flag('headed');
const ALLOW_UNSEEDED = flag('allow-unseeded');

/**
 * A run that writes nowhere near the repository.
 *
 * **It exists so that the first execution of this script is not the sitting.**
 * Everything else here is proved by reading: the manifest's selectors against
 * the portal's source, the file placement against the build's refusals, the
 * arguments against a `--list`. None of that starts a browser, and the two
 * defects found on the last read-through were both things only a run would have
 * shown — a mask filled with Playwright's magenta default, and a layer gated on
 * a localStorage hint nothing set.
 *
 * So: the same code path, the same encoding, the same names, into a directory
 * outside the repository, and no marker swapped. `--out` says where; the
 * default is a temporary directory and the path is printed at the end.
 */
const DRY = flag('dry-run');
const OUT = value('out') ?? (DRY ? join(tmpdir(), 'careers-gftv-capture') : null);

// A dry run never swaps, whatever else was passed: the pages must not come to
// point at files that are not in the tree.
const NO_SWAP = flag('no-swap') || DRY;

if (flag('list')) {
  for (const shot of SHOTS) {
    console.log(
      `${shot.name.padEnd(44)} ${shot.tier.padEnd(7)} ${(shot.as ?? 'signed out').padEnd(11)} ${shot.path}`
    );
  }
  process.exit(0);
}

/**
 * The credentials, read from a file rather than required from the shell.
 *
 * `seed.mjs`'s reasoning, and the same loader: somebody who has set the project
 * up has written these down once already, and being asked for them again is how
 * a password ends up in a shell history. `.env.test` at the repository root is
 * where the test scripts' credentials live and it is gitignored;
 * `main-site/.env.local` is where the site's own are.
 */
function loadEnvFiles() {
  for (const file of [join(REPO, '.env.test'), join(REPO, 'main-site/.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, name, raw] = match;
      if (process.env[name]) continue;
      process.env[name] = raw.trim().replace(/^["']|["']$/g, '');
    }
  }
}

// **The arguments are checked before the environment**, so that a mistyped shot
// name is answered with the shot name and not with a lecture about BASE. What a
// person got wrong is what they should be told about.
if (ONLY) {
  const unknown = ONLY.filter((name) => !SHOTS.some((shot) => shot.name === name));
  if (unknown.length > 0) {
    console.error(`No such shot: ${unknown.join(', ')}`);
    console.error('node capture.mjs --list says what there is.');
    process.exit(1);
  }
}

const planned = SHOTS.filter((shot) => !ONLY || ONLY.includes(shot.name));
const needs = new Set(planned.map((shot) => shot.as).filter(Boolean));

loadEnvFiles();

function requireEnv(name, why) {
  const found = process.env[name];
  if (!found) {
    console.error(`Set ${name}. ${why}`);
    process.exit(1);
  }
  return found;
}

// **No default, deliberately.** `gen-screenshots.js` defaults to the live portal
// because an install shot is of the public board; this one signs in and opens
// lists of applicants, so the address is something a person types on purpose.
const BASE = requireEnv(
  'BASE',
  'It is the portal this run photographs, and there is no default: this script ' +
    'signs in and opens the dashboard, so where it points is a decision and not a fallback.'
);

const STAFF = needs.has('staff')
  ? {
      username: requireEnv('STAFF_USER', 'A gftv.asia staff account. The staff shots sign in as it.'),
      password: requireEnv('STAFF_PASS', 'Its password. It is never written into a committed file.'),
    }
  : null;

// **Not `APPLICANT_USER`, and the difference is the whole of 16g's fourth
// bullet.** `tests/README.md` has an `APPLICANT_USER` for the suites, and it is
// a real account with real rows left behind by earlier runs. What a screenshot
// needs is one of `seed.mjs`'s invented people, so the variables are the seed's
// own: `SEED_PASSWORD` is what the seed writes the password from, and
// `sample-applicant` is the account it writes.
const APPLICANT = needs.has('applicant')
  ? {
      username: process.env.SEED_USER ?? 'sample-applicant',
      password: requireEnv(
        'SEED_PASSWORD',
        "One of seed.mjs's invented people, and not the APPLICANT_USER the test suites " +
          'take: that one is a real account with real rows. Run the seed with ' +
          'SEED_PASSWORD set, so the password survives to the next run.'
      ),
    }
  : null;

/* -------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------- */

const taken = [];
const missed = [];

/* -------------------------------------------------------------------------
 * The seed check
 * ---------------------------------------------------------------------- */

/**
 * Whether the board is showing seeded postings.
 *
 * Every posting `seed.mjs` writes says SAMPLE POSTING in both languages, and it
 * says so for exactly this reason: it is the one thing a page can be asked that
 * distinguishes a seeded board from a real one without a database connection.
 *
 * **A run against an unseeded board is refused and not warned about.** A warning
 * is read after the pictures are taken.
 */
async function seedIsPresent(page) {
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('#results:not([aria-busy]) .job-card', { timeout: TIMEOUT_MS });
  } catch {
    return false;
  }
  return page.evaluate(() => /SAMPLE POSTING/i.test(document.querySelector('#results')?.textContent ?? ''));
}

/* -------------------------------------------------------------------------
 * The contexts
 * ---------------------------------------------------------------------- */

/**
 * A browser context set up so that two runs produce the same bytes.
 *
 * The theme is written into localStorage before first paint rather than left to
 * `prefers-color-scheme`, because the portal's switcher is two axes and stores
 * an explicit choice: a context declaring a colour scheme would be answering a
 * question the site does not ask. The keys are the pre-paint script's own, in
 * every page's head.
 */
async function makeContext(browser, { viewport, theme }) {
  const size = VIEWPORTS[viewport];

  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    locale: LOCALE,
    timezoneId: TIMEZONE,
    reducedMotion: 'reduce',
    colorScheme: theme,
  });

  await context.addInitScript(
    ([mode]) => {
      try {
        localStorage.setItem('gftv-careers.mode', mode);
        localStorage.setItem('gftv-careers.colorTheme', 'classic');
        localStorage.setItem('gftv-careers.locale', 'en');
      } catch {
        // A context with storage blocked draws the default, which is light. The
        // dark shots would be wrong and the light ones right, and the run says
        // which theme it asked for either way.
      }
    },
    [theme]
  );

  await context.addInitScript(STILL_CSS_SCRIPT, STILL_CSS);

  return context;
}

/**
 * The stylesheet that stops everything moving, added as an init script so it is
 * in the document before the first frame instead of after the first paint.
 */
function STILL_CSS_SCRIPT(css) {
  const add = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head?.appendChild(style);
  };
  if (document.head) add();
  else document.addEventListener('DOMContentLoaded', add, { once: true });
}

/** Sign in as an applicant. `/login`, which is the page the guide describes. */
async function signInApplicant(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { timeout: TIMEOUT_MS });
  await page.fill('#identifier', APPLICANT.username);
  await page.fill('#password', APPLICANT.password);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: TIMEOUT_MS });
}

/**
 * Sign in as staff.
 *
 * **It stops and waits when a second factor is asked for**, which is the honest
 * handling: a staff account with 2FA cannot be driven from a script and should
 * not be. Run with `--headed` and finish the step in the window; the script
 * carries on when the dashboard appears.
 */
async function signInStaff(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: TIMEOUT_MS });
  await page.fill('#username', STAFF.username);
  await page.fill('#password', STAFF.password);
  await page.click('#staffLoginForm button[type="submit"]');

  try {
    await page.waitForURL('**/admin', { timeout: TIMEOUT_MS });
    return;
  } catch {
    if (!HEADED) {
      throw new Error(
        'The staff sign in did not reach /admin. If the account has a second factor, ' +
          'run again with --headed and complete it in the window.'
      );
    }
  }

  console.log('  waiting for the second factor, in the browser window…');
  await page.waitForURL('**/admin', { timeout: 5 * 60 * 1000 });
}

/* -------------------------------------------------------------------------
 * The routines a shot may name
 * ---------------------------------------------------------------------- */

/**
 * Named routines, because a manifest holding code is a manifest nobody can
 * check. Each one drives the page into the state a shot is of, and each is
 * written against markup this repository owns.
 */
const ACTS = {
  /** The board, then the first posting, then the Apply control. */
  async openApplyDialog(page) {
    await page.waitForSelector('#results:not([aria-busy]) .job-card', { timeout: TIMEOUT_MS });
    await page.click('#results .job-card a');
    await page.waitForSelector('#applyButton', { timeout: TIMEOUT_MS });
    await page.click('#applyButton');
  },

  /**
   * The recovery code dialog, with ten invented codes.
   *
   * **Nothing is registered and no code is generated.** 16g forbids capturing a
   * live code and asks for a seeded fake with a caption saying so. The module is
   * imported into the page and called with invented values, so the picture is
   * the real dialog and the run writes nothing anywhere.
   */
  async showExampleCodes(page) {
    await page.waitForSelector('#registerForm', { timeout: TIMEOUT_MS });
    await page.evaluate(async () => {
      const { showRecoveryCodes } = await import('/assets/js/recovery-codes.js');
      const codes = [
        'K7QM-2XPD-9RTA', 'B4HN-6WLC-3JYS', 'M9ZE-1FQV-8KDR', 'T2XC-5PBN-7GHW',
        'R6JW-4DKM-2QSF', 'N8VP-3ZLT-6BCX', 'H1YD-9MRQ-4WKG', 'C5TB-7NFJ-1PZM',
        'W3QK-8SVH-5DLN', 'G7RM-2CJX-9TBP',
      ];
      showRecoveryCodes({ codes, set: 'recovery' });
    });
  },

  /** The postings list, then the first row's editor. */
  async openFirstPosting(page) {
    await page.waitForSelector('#jobList tr', { timeout: TIMEOUT_MS });
    await page.click('#jobList tr a');
    await page.waitForSelector('#editorShared', { timeout: TIMEOUT_MS });
  },

  /** The same editor, on a translation tab rather than the base row. */
  async openTranslationTab(page) {
    await ACTS.openFirstPosting(page);
    await page.click('#editorTabs button:nth-of-type(2)');
    await page.waitForSelector('#editorTabBody', { timeout: TIMEOUT_MS });
  },

  /** The editor, scrolled to the form, sheet and prefill fields. */
  async scrollToFormFields(page) {
    await ACTS.openFirstPosting(page);
    await page.locator('#jobForm').scrollIntoViewIfNeeded();
  },

  /** The tracking table, then one application's detail. */
  async openFirstApplication(page) {
    await page.waitForSelector('#applicationList tr', { timeout: TIMEOUT_MS });
    await page.click('#applicationList tr button');
    await page.waitForSelector('dialog[open]', { timeout: TIMEOUT_MS });
  },

  /** The applicant list, then one account. */
  async openFirstApplicant(page) {
    await page.waitForSelector('#applicantList tr', { timeout: TIMEOUT_MS });
    await page.click('#applicantList tr button');
    await page.waitForSelector('dialog[open]', { timeout: TIMEOUT_MS });
  },

  /** The staff access list, then one row's panel. */
  async openFirstStaffRow(page) {
    await page.waitForSelector('#staffList tr', { timeout: TIMEOUT_MS });
    await page.click('#staffList tr button');
    await page.waitForSelector('dialog[open]', { timeout: TIMEOUT_MS });
  },

  /** The analytics page, scrolled to the unmatched submissions below it. */
  async scrollToUnmatched(page) {
    await page.locator('#unmatchedSection').scrollIntoViewIfNeeded();
  },

  /** The translations page, on the audit panel rather than the queue. */
  async openAuditPanel(page) {
    await page.waitForSelector('#auditPanel', { timeout: TIMEOUT_MS });
    await page.locator('#auditPanel').scrollIntoViewIfNeeded();
  },

  /** The dashboard on a phone, with the sections drawer open. */
  async openSectionsDrawer(page) {
    await page.click('[data-admin-menu]');
    await page.waitForSelector('#adminNav[data-open="true"]', { timeout: TIMEOUT_MS });
  },

  /**
   * A posting with the suggestion layer switched on.
   *
   * **Two flags and not one, and the second is the one that is easy to miss.**
   * `gftv-careers.annotating` is the reading preference, set before the page
   * loads rather than toggled in front of the camera. But `offerAnnotationLayer`
   * in `shell.js` returns immediately unless `hasStaffHint()` or
   * `hasHelperHint()` is true, and those are hints `api.js` writes only after an
   * account page has read the roster — deliberately, so that every page of the
   * site does not spend a request asking whether this reader is a helper. A
   * fresh context has neither, so the module is never imported and no underline
   * is ever drawn.
   *
   * The hint is a hint and not the gate: `/api/translations/annotations` is
   * still asked, against the staff session this shot carries, and answers
   * `can: false` to anybody who may not use the layer. So setting it here buys a
   * request and not an entitlement.
   */
  async openFirstPostingWithSuggestions(page) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('gftv-careers.annotating', 'on');
        localStorage.setItem('gftv-careers.staffSeen', 'true');
      } catch {
        /* the underlines are absent, and the wait below says so */
      }
    });
    await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#results:not([aria-busy]) .job-card', { timeout: TIMEOUT_MS });
    await page.click('#results .job-card a');
  },
};

/* -------------------------------------------------------------------------
 * One shot
 * ---------------------------------------------------------------------- */

async function capture(browser, shot, sessions) {
  const context = await makeContext(browser, shot);

  // The clock, frozen, so a relative label reads the same on the next run. Set
  // on the context before any page exists, which is what covers a label computed
  // during the first paint.
  await context.clock.setFixedTime(new Date(CLOCK));

  // The session, replayed rather than signed in again per shot: 25 sign ins
  // against a live deployment is 25 rate limited requests and a run that takes
  // longer than the person watching it.
  if (shot.as) await context.addCookies(sessions[shot.as]);

  const page = await context.newPage();

  try {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' });

    // **`gone` first, then the routine, then `waitFor`**, and the order is not
    // arbitrary: a routine presses something, and pressing something on a shell
    // that has not drawn yet is a click on nothing. Both shells *remove* their
    // loading row rather than hiding it, so its absence is what says the page is
    // there — waiting only for a list would photograph a skeleton beside it.
    // A routine that navigates does its own waiting on the other side.
    if (shot.gone) {
      await page.waitForSelector(shot.gone, { state: 'detached', timeout: TIMEOUT_MS });
    }

    if (shot.act) await ACTS[shot.act](page);

    await page.waitForSelector(shot.waitFor, { timeout: TIMEOUT_MS });

    // Fonts, because a shot taken before they land is a shot of the fallback
    // stack and is a different picture every run depending on the cache. The
    // `.then(() => true)` is not decoration: `document.fonts.ready` resolves
    // with the FontFaceSet, which does not survive being sent back out of the
    // page, and returning it would fail every shot on serialisation.
    await page.evaluate(() => document.fonts?.ready.then(() => true) ?? true);

    const mask = [...ALWAYS_MASKED, ...shot.mask].map((selector) => page.locator(selector));
    const options = { mask, maskColor: MASK_COLOR, animations: 'disabled', type: 'png' };

    const png = shot.clip
      ? await page.locator(shot.clip).screenshot(options)
      : await page.screenshot({ ...options, fullPage: shot.full });

    const webp = await sharp(png).webp({ quality: WEBP_QUALITY }).toBuffer();

    // **The same names either way**, so a dry run's output directory is the
    // shape the tree would have taken and not a flat pile. A shot that lands in
    // the wrong place is visible here as well as in the build.
    for (const relativePath of filesFor(shot)) {
      const file = join(OUT ?? DOCS, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, webp);
    }

    taken.push(shot);
    const size = `${(webp.length / 1024).toFixed(0)} KB`;
    console.log(`  ✓ ${shot.name.padEnd(44)} ${size.padStart(8)}  ${filesFor(shot).length} file(s)`);
  } catch (cause) {
    missed.push({ shot, why: String(cause?.message ?? cause).split('\n')[0] });
    console.log(`  ✗ ${shot.name}`);
    console.log(`      ${String(cause?.message ?? cause).split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------------------
 * The pending markers
 * ---------------------------------------------------------------------- */

/**
 * Swap `pending:<name>` for the real address in every page that points at a shot
 * this run took.
 *
 * Both trees, because a public page and a gated one write the source differently
 * and `markdownSrc` is the one function that knows which. A shot that was missed
 * keeps its marker, so a half finished run leaves the pages honest rather than
 * pointing at files that are not there.
 */
function swapMarkers() {
  // Three trees since part 9. A translated page carries the same screenshots as
  // the English one it translates -- the picture is the same picture, and only
  // the caption is in another language -- so a marker left behind in
  // `translations/` would be a 华文 reader seeing "screenshot pending" under a
  // shot that was taken months ago. The swap is by shot name, so all three
  // trees move together with no second list to keep.
  const roots = [join(DOCS, 'content'), join(DOCS, 'api/_content'), join(DOCS, 'translations')];
  const changed = [];
  const files = [];

  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const here = join(directory, entry.name);
      if (entry.isDirectory()) walk(here);
      else if (entry.name.toLowerCase().endsWith('.md')) files.push(here);
    }
  };

  for (const root of roots) walk(root);

  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    let after = before;

    for (const shot of taken) {
      after = after.split(`(pending:${shot.name})`).join(`(${markdownSrc(shot)})`);
      after = after.split(`(pending:${shot.name} `).join(`(${markdownSrc(shot)} `);
    }

    if (after !== before) {
      writeFileSync(file, after);
      changed.push(file);
    }
  }

  return changed;
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

// **Imported here and not at the top**, so that `--list` and the argument
// checking above run in a clone where `npm install` has never been executed in
// this directory. Somebody adding a shot wants to see the list before they own
// 400 MB of browser.
const { chromium } = await import('playwright');
const { default: sharp } = await import('sharp');

const browser = await chromium.launch({ headless: !HEADED });

console.log(`Capturing ${planned.length} of ${SHOTS.length} shots against ${BASE}`);
if (DRY) console.log(`  dry run: writing into ${OUT}, swapping nothing`);

// The seed check, first, in its own throwaway context.
{
  const context = await browser.newContext({ baseURL: BASE, locale: LOCALE });
  const page = await context.newPage();
  const seeded = await seedIsPresent(page);
  await context.close();

  if (!seeded && !ALLOW_UNSEEDED) {
    console.error(
      '\nThe board is not showing a seeded posting, so this run was stopped.\n\n' +
        '  node seed.mjs --yes --anyway    writes the sample people and postings\n' +
        '  node seed.mjs --clear --yes     removes them again afterwards\n\n' +
        'Every seeded posting says SAMPLE POSTING, which is what was looked for. ' +
        'Capturing without it photographs real applicants into a guide, which is ' +
        "16g's one rule about this run. --allow-unseeded is for somebody who has " +
        'read that sentence and is capturing a public page only.'
    );
    await browser.close();
    process.exit(1);
  }
  if (!seeded) console.log('  the seed was not found, and --allow-unseeded was passed');
}

// One sign in per actor, and the cookies reused for every shot that needs it.
const sessions = {};
for (const actor of needs) {
  const context = await browser.newContext({ baseURL: BASE, locale: LOCALE });
  const page = await context.newPage();
  console.log(`  signing in as the ${actor} account`);
  if (actor === 'staff') await signInStaff(page);
  else await signInApplicant(page);
  sessions[actor] = await context.cookies();
  await context.close();
}

for (const shot of planned) await capture(browser, shot, sessions);

await browser.close();

/* -------------------------------------------------------------------------
 * What happened
 * ---------------------------------------------------------------------- */

console.log(`\n${taken.length} captured, ${missed.length} missed.`);

if (!NO_SWAP && taken.length > 0) {
  const changed = swapMarkers();
  console.log(
    changed.length === 0
      ? 'No pending markers left to swap.'
      : `Swapped the pending markers in ${changed.length} page(s).`
  );
}

if (missed.length > 0) {
  console.log('\nMissed:');
  for (const item of missed) console.log(`  ${item.shot.name}: ${item.why}`);
  console.log('\nEach of those keeps its pending marker, so the pages stay honest.');
}

console.log(
  DRY
    ? `\nDry run. Nothing in the repository moved. The files are under ${OUT}.`
    : '\nNext: node scripts/build.js, which checks the manifest against the pages.'
);

process.exit(missed.length > 0 ? 1 : 0);
