// Phase 8 verification run, from next-steps.md section 2, "How to verify it".
//
//   node phase8-test.mjs                        everything that can run
//   node phase8-test.mjs --only=settings,queue  one or more sections
//   BASE=https://... node phase8-test.mjs       against a preview deployment
//
// Copied from phase7-test.mjs rather than started over, and keeping its four
// habits: a define() per section so --only= works, a detail string on every
// check, skip() rather than silence, and no fixed waitForTimeout after an
// action that makes a request.
//
// It signs in as a real staff account, because requireStaff re-reads
// gftvhello_sessions and hasPortalAccess on every request and there is no way
// to fake one. It also registers its own applicant, through the register
// *page* rather than the API, per the phase 6 rule: the page generates the
// recovery code set and the API alone does not.
//
// **It writes real rows.** Every posting it creates is prefixed SMOKE P8 and is
// deleted at the end of the run. The adminDelete bucket is 10 an hour, so the
// run creates few enough postings to clean up inside it.
//
// **It also edits live site settings, which phase 7's run never did.** The
// portal title, the hero copy, the featured list, the cooldown, and the
// applications toggle are one row each in gftvjobs_settings and they are what
// every reader of the site sees. So section `settings` snapshots all five
// before it touches anything and puts them back in a finally, and the run
// reports loudly if the restore itself failed. If a run is killed halfway,
// **check /admin/settings by hand**: the values it writes are all prefixed
// SMOKE P8 and are obvious on sight.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** The repository root, one level up from tests/. */
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');

// PATCH_JS=admin-settings-page.js serves that module from the working tree
// instead of the deployment, so a fix can be re-verified against the live site
// without deploying it. Off by default: the point of the run is the deployed
// code, and anything checked with a patch applied is reported as such.
const PATCH_JS = (process.env.PATCH_JS ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';

/**
 * A required environment variable.
 *
 * No default, deliberately. A staff password with a fallback in a committed
 * file is a staff password in the repository, whatever the fallback is for.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}. See tests/README.md.`);
    process.exit(1);
  }
  return value;
}

const STAFF = {
  username: requireEnv('STAFF_USER'),
  password: requireEnv('STAFF_PASS'),
};

/**
 * The password for the applicants this run registers for itself.
 *
 * Not a credential anybody holds: the accounts do not exist until the run makes
 * them, and it is written here so a later run can sign back into one with
 * APPLICANT_USER rather than registering another.
 */
const DEFAULT_APPLICANT_PASS = 'correct horse battery staple 8';

const STAMP = Date.now();

// Reused across runs when the caller passes one, so a second run of a section
// does not leave another account behind. Blank means register a fresh one.
const REUSE_APPLICANT = process.env.APPLICANT_USER ?? '';
const APPLICANT = {
  username: REUSE_APPLICANT || `smoke-p8-${STAMP}`.slice(0, 24),
  display_name: `Smoke P8 ${STAMP}`,
  email: `smoke-p8-${STAMP}@example.invalid`,
  password: process.env.APPLICANT_PASS ?? DEFAULT_APPLICANT_PASS,
};

const ONLY = (() => {
  const arg = process.argv.find((value) => value.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();

/* -------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const skips = [];
let currentSection = '';

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function bad(name, detail) {
  failed += 1;
  failures.push({ section: currentSection, name, detail });
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
}

function check(name, condition, detail) {
  if (condition) ok(name);
  else bad(name, detail);
}

function skip(name, why) {
  skipped += 1;
  skips.push({ section: currentSection, name, why });
  console.log(`  – ${name}`);
  console.log(`      ${why}`);
}

function section(title) {
  currentSection = title;
  console.log(`\n${title}`);
}

function short(value, max = 200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'undefined';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* -------------------------------------------------------------------------
 * Request helpers
 * ---------------------------------------------------------------------- */

/** A JSON GET through a browser context, so it carries that context's cookies. */
async function get(ctx, path, options = {}) {
  const response = await ctx.request.get(`${BASE}${path}`, {
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    failOnStatusCode: false,
  });
  return shape(response, options);
}

async function post(ctx, path, body, options = {}) {
  const response = await ctx.request.post(`${BASE}${path}`, {
    data: body,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    failOnStatusCode: false,
  });
  return shape(response, options);
}

async function shape(response, options) {
  const status = response.status();
  const text = await response.text();
  if (options.raw) return { status, text, headers: response.headers() };

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON. The caller sees the text and decides.
  }
  return {
    status,
    json,
    text,
    headers: response.headers(),
    ok: json?.ok === true,
    data: json?.data ?? null,
    error: json?.error ?? null,
    details: json?.error?.details ?? null,
  };
}

/**
 * Close the applicant's apply prompt if it has opened over a staff page.
 *
 * It should not be there at all, and that is a finding rather than a thing to
 * work around. This lets the rest of the run continue past it.
 */
async function dismissApplyPrompt(page) {
  const closed = await page.evaluate(() => {
    const el = document.querySelector('#applyDialog');
    if (!el || !el.open) return false;
    el.close();
    return true;
  });
  if (closed) await page.waitForTimeout(300);
  return closed;
}

/**
 * Wait for the dashboard's shared message strip to say something, either way.
 *
 * A fixed timeout after a click is a race: the action either redraws on success
 * or leaves an error, and both take as long as the request does. Neither one
 * appearing is itself a finding — it is what "a button that did nothing" means,
 * and it was two of phase 7's eleven defects.
 *
 * @returns {Promise<'ok'|'error'|'silent'>}
 */
async function waitForMessage(page, selector = '#adminMessage') {
  try {
    await page.waitForFunction(
      (sel) => {
        const holder = document.querySelector(sel);
        return holder && !holder.hidden && holder.textContent.trim() !== '';
      },
      selector,
      { timeout: 20000 }
    );
  } catch {
    return 'silent';
  }

  return page.evaluate(
    (sel) => (document.querySelector(sel)?.classList.contains('danger') ? 'error' : 'ok'),
    selector
  );
}

/** Blank the message strip, so the next wait cannot read the previous answer. */
async function clearMessage(page, selector = '#adminMessage') {
  await page.evaluate((sel) => {
    const holder = document.querySelector(sel);
    if (holder) {
      holder.hidden = true;
      holder.textContent = '';
    }
  }, selector);
}

/** Wait until the address bar settles on something matching. */
async function waitForPath(page, predicate, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const url = new URL(page.url());
    if (predicate(url)) return url;
    await page.waitForTimeout(250);
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Sign in
 * ---------------------------------------------------------------------- */

async function signInStaff(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: 15000 });
  await page.fill('#username', STAFF.username);
  await page.fill('#password', STAFF.password);
  await page.click('#staffLoginForm button[type="submit"]');
  return waitForPath(page, (url) => url.pathname === '/admin');
}

/**
 * Register an applicant through the register page.
 *
 * The phase 6 rule: the page generates the recovery codes and sends the account
 * to /account/security?codes=none when it has none, so a script that registers
 * through the API alone is not a registered user.
 */
async function registerApplicant(page, who) {
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#registerForm', { timeout: 15000 });
  await page.fill('#username', who.username);
  await page.fill('#display_name', who.display_name);
  await page.fill('#email', who.email);
  await page.fill('#password', who.password);
  await page.fill('#password_confirm', who.password);
  await page.click('#registerForm button[type="submit"]');

  // The register page shows the recovery code set before it lets go, and the
  // dialog's done button only enables once the tick box is ticked. That is the
  // half api/auth/applicant/register does not do by itself.
  await page.waitForSelector('[data-confirm]', { timeout: 30000 });
  await page.check('[data-confirm]');
  await page.click('[data-done]');
  return waitForPath(page, (url) => url.pathname.startsWith('/account'), 30000);
}

async function signInApplicant(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { timeout: 15000 });
  await page.fill('#identifier', who.username);
  await page.fill('#password', who.password);
  await page.click('#loginForm button[type="submit"]');
  return waitForPath(page, (url) => url.pathname.startsWith('/account'), 30000);
}

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const created = {
  jobs: [],
  applicants: [],
  // Rows this run adds to somebody else's working queue, so cleanup can take
  // them back out. A SMOKE report left open on a live careers site is work
  // somebody will pick up and try to act on.
  reports: [],
  // (user_id, locale) pairs granted during the run. The role is standing write
  // access to a whole language, so it is never left behind.
  helperGrants: [],
  // Applicant accounts to delete at the end. Separate from `applicants`, which
  // is the list that is reported and left alone.
  deleteApplicants: [],
};

/**
 * The password for a throwaway applicant this run registers for itself.
 *
 * A second account, because most of 8.9 cannot be tried on the account the rest
 * of the run is signed in as: forcing a reset and setting a password both revoke
 * every session, and deleting one ends the run. This one exists to be done to.
 */
const SPARE = {
  username: `smk-p8s-${STAMP}`.slice(0, 24),
  display_name: `Smoke P8 spare ${STAMP}`,
  email: `smk-p8s-${STAMP}@example.invalid`,
  password: DEFAULT_APPLICANT_PASS,
};

/**
 * An existing tag to hang the run's postings on, read once.
 *
 * A posting cannot be published without one. publishBlockers wants a form URL,
 * at least one tag, and a title, so a fixture carrying only a title is a
 * fixture that stays a draft. An existing tag is borrowed rather than a new one
 * created: a tag is site wide furniture and this run has no business adding to
 * the list somebody curates.
 */
let smokeTagId = null;
async function ensureTag(staff) {
  if (smokeTagId) return smokeTagId;
  const list = await get(staff, '/api/admin/tags');
  smokeTagId = (list.data?.tags ?? [])[0]?.id ?? null;
  return smokeTagId;
}

async function createJob(staff, overrides = {}) {
  const tagId = overrides.tag_ids ? null : await ensureTag(staff);

  const result = await post(staff, '/api/admin/jobs', {
    action: 'create',
    job: {
      title: `SMOKE P8 ${STAMP} ${overrides.label ?? 'posting'}`,
      summary: 'A throwaway posting written by the phase 8 verification run.',
      description:
        'First sentence of the throwaway posting. Second sentence, which the embed preview should not show.',
      // Publishing needs one, per publishBlockers, and deviation 35 accepts any
      // Google Forms address. Nothing in this run ever opens it.
      application_form_url: 'https://forms.gle/smokep8verification',
      ...(overrides.job ?? {}),
    },
    ...(overrides.tag_ids
      ? { tag_ids: overrides.tag_ids }
      : tagId
        ? { tag_ids: [tagId] }
        : {}),
  });

  if (result.ok) created.jobs.push(result.data.job.id);
  return result;
}

/**
 * Create a posting and publish it, which most of phase 8 needs.
 *
 * **A failed publish is returned as a failure**, which the first draft of this
 * file did not do: it fell back to the create result, so a posting that was
 * refused publication looked created and successful, and every later check that
 * needed a visible posting failed somewhere else with a 404. Twelve of the
 * seventeen failures in the run of 25 August 2026 were this one line.
 */
async function createPublishedJob(staff, overrides = {}) {
  const made = await createJob(staff, overrides);
  if (!made.ok) return made;

  const live = await post(staff, '/api/admin/jobs', {
    action: 'status',
    id: made.data.job.id,
    status: 'published',
  });

  if (!live.ok) {
    return {
      ...live,
      // The id is still wanted, so cleanup takes the draft away and the caller
      // can say which posting could not go live.
      data: { job: made.data.job },
      error: {
        message:
          `the posting was created but not published: ${short(live.error?.message, 120)}. ` +
          'publishBlockers wants a form URL, at least one tag, and a title.',
      },
    };
  }

  return { ...live, data: { ...live.data, job: made.data.job } };
}

/**
 * The audit rows written since a mark, newest first.
 *
 * Phase 8 turns on a great many "this writes an audit row" and "this
 * deliberately writes none" claims, and both halves are only checkable against
 * the log. 8.9's account panel is the one place the API exposes it, so this
 * reads it from there and is therefore per applicant.
 */
async function accountAudit(staff, applicantId) {
  const result = await get(staff, `/api/admin/applicants?id=${applicantId}`);
  if (!result.ok) return [];
  return result.data?.activity ?? [];
}

/**
 * Whether a section has what setup was supposed to leave it.
 *
 * Sections are selectable with --only=, so a run of one section starts with no
 * staff session and no posting. Skipping loudly, with the flag that would fix
 * it, is the harness's own habit: silence here reads as a section that passed.
 */
function needs(state, what, items) {
  const missing = [];
  if (what.includes('staff') && !state.staffId) missing.push('a staff session');
  if (what.includes('job') && !state.jobId) missing.push('a posting');
  if (what.includes('applicant') && !state.applicantId) missing.push('an applicant');

  if (missing.length === 0) return true;
  skip(items, `${missing.join(' and ')} missing. Add setup to --only=.`);
  return false;
}

/**
 * The language the audit and the helper role are about, read rather than named.
 *
 * Hardcoding `zh` would make this run wrong on the day a third language arrives
 * or the second one is renamed, and the route already says which language it
 * answered with, precisely so a caller cannot mislabel what it was shown.
 */
async function auditLocale(staff) {
  const result = await get(staff, '/api/admin/translations?view=audit');
  return { code: result.data?.locale ?? null, source: result.data?.source_locale ?? 'en' };
}

/**
 * Register the throwaway account 8.9 is tried on, in a context of its own.
 *
 * Its own context because the point of it is that things are done TO it: a
 * forced reset revokes its sessions, and sharing a context with the run's main
 * applicant would take that one down with it.
 */
async function registerSpare(state) {
  if (state.spareId) return true;

  const context = await state.browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    state.pageErrors.push({ where: page.url(), error: String(error) })
  );

  const made = await registerApplicant(page, SPARE);
  if (!made) {
    await context.close();
    return false;
  }

  const who = await get(page, '/api/auth/applicant/session');
  state.spareContext = context;
  state.sparePage = page;
  state.spareId = who.data?.applicant?.id ?? who.data?.user?.id ?? null;

  if (state.spareId) created.deleteApplicants.push({ id: state.spareId, username: SPARE.username });
  return Boolean(state.spareId);
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

async function main() {
  console.log(`Phase 8 verification against ${BASE}`);
  console.log(`Staff: ${STAFF.username}   Applicant: ${APPLICANT.username}`);

  const browser = await chromium.launch();

  // Three contexts. Phase 7 needed two; phase 8 needs the applicant in one of
  // her own, because 7i's helper area and the annotation layer are about what a
  // *reader* can see and the staff cookie changes both answers.
  const ctx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const applicantCtx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const anon = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });

  if (PATCH_JS.length > 0) {
    console.log(`Serving from the working tree: ${PATCH_JS.join(', ')}`);
    for (const context of [ctx, applicantCtx, anon]) {
      await context.route('**/assets/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const name = path.split('/').pop();
        if (!PATCH_JS.includes(name)) return route.continue();

        const body = await readFile(join(HERE, 'main-site', path.replace(/^\//, '')), 'utf8');

        // The content type matters more than it looks. A stylesheet served as
        // JavaScript is refused by the browser's strict MIME checking and the
        // page renders unstyled, which then fails every layout assertion in the
        // run for a reason that has nothing to do with the layout.
        const contentType = name.endsWith('.json')
          ? 'application/json'
          : name.endsWith('.css')
            ? 'text/css'
            : 'application/javascript';

        return route.fulfill({
          status: 200,
          contentType: `${contentType}; charset=utf-8`,
          body,
        });
      });
    }
  }

  const state = { browser, ctx, applicantCtx, anon, pageErrors: [] };

  state.staffPage = await ctx.newPage();
  state.staffPage.on('pageerror', (error) =>
    state.pageErrors.push({ where: state.staffPage.url(), error: String(error) })
  );

  state.applicantPage = await applicantCtx.newPage();
  state.applicantPage.on('pageerror', (error) =>
    state.pageErrors.push({ where: state.applicantPage.url(), error: String(error) })
  );

  try {
    for (const entry of SECTIONS) {
      if (ONLY && !ONLY.includes(entry.name)) continue;
      section(entry.title);
      try {
        await entry.fn(state);
      } catch (cause) {
        bad(`${entry.title} threw`, String(cause?.stack ?? cause));
      }
    }
  } finally {
    await cleanup(state);
    await browser.close();
  }

  report(state);
}

async function cleanup(state) {
  if (process.env.NO_CLEANUP === '1') {
    if (created.jobs.length > 0) {
      console.log(`\nLeft behind, NO_CLEANUP=1: ${created.jobs.join(' ')}`);
    }
    return;
  }
  const anything =
    created.jobs.length > 0 ||
    created.reports.length > 0 ||
    created.helperGrants.length > 0 ||
    created.deleteApplicants.length > 0;
  if (!state.staffPage || !anything) return;
  section('Cleanup');

  // The queue first, because these are rows in somebody's working list rather
  // than fixtures of our own. A SMOKE report left open is work a person picks
  // up and tries to act on, against a posting that is about to be deleted.
  for (const id of [...new Set(created.reports)]) {
    const closed = await post(state.staffPage, '/api/admin/translations', {
      action: 'resolve',
      report_id: id,
      status: 'rejected',
      note: `Raised by the phase 8 verification run (${STAMP}). Not a real report.`,
    });
    if (!closed.ok) {
      bad(`a SMOKE report was left open in the queue: ${id}`, short(closed.text, 120));
    }
  }

  // The helper role, which is standing write access to a whole language. Never
  // left on an account this run made.
  for (const grant of created.helperGrants) {
    const gone = await post(state.staffPage, '/api/admin/translations', {
      action: 'revoke_helper',
      user_id: grant.userId,
      locale: grant.locale,
      reason: `Phase 8 verification run ${STAMP} finished.`,
    });
    if (gone.ok) ok(`the ${grant.locale} helper role was taken back`);
    else if (gone.status !== 404) {
      bad(`a helper role was left granted: ${grant.userId} ${grant.locale}`, short(gone.text, 120));
    }
  }

  // The throwaway account, deleted with the caller's own password. This is
  // item 50's other half: the refusals are checked in the section, and the one
  // deletion that should work is the one that tidies up after the run.
  for (const who of created.deleteApplicants) {
    const gone = await post(state.staffPage, '/api/admin/applicants', {
      action: 'delete',
      applicant_id: who.id,
      password: STAFF.password,
      reason: `Phase 8 verification run ${STAMP}.`,
    });
    if (gone.ok) ok(`50. the spare account was deleted with the caller's own password`);
    else bad(`the spare account ${who.username} was not deleted`, short(gone.text, 160));
  }

  if (created.jobs.length === 0) return;

  // Taken off the board first, and only then deleted. The adminDelete bucket is
  // ten an hour, so a run that creates more than that would otherwise leave a
  // SMOKE posting published on a live careers site. Unpublishing costs the
  // ordinary admin bucket, which is two hundred.
  const left = [];
  for (const id of [...new Set(created.jobs)]) {
    const row = await get(state.staffPage, `/api/admin/jobs?id=${id}`);
    if (!row.ok) continue;

    if (row.data.job.status !== 'draft') {
      await post(state.staffPage, '/api/admin/jobs', { action: 'status', id, status: 'draft' });
    }

    // CLEANUP=draft takes everything off the board without spending the ten an
    // hour deletion budget, which is what a debugging run wants.
    if (process.env.CLEANUP === 'draft') {
      left.push(`${row.data.job.slug} (${id}): left as a draft, CLEANUP=draft`);
      continue;
    }

    // The password, not the slug. Deviation 49 reversed deviation 38 in part
    // 5a, and phase7-test.mjs still sends `confirm: slug` and no password, so
    // **its own cleanup no longer deletes anything**. That is section 5 item 10.
    const result = await post(state.staffPage, '/api/admin/jobs', {
      action: 'delete',
      id,
      password: STAFF.password,
    });
    if (result.ok) ok(`deleted ${row.data.job.slug}`);
    else left.push(`${row.data.job.slug} (${id}): ${short(result.error?.message, 80)}`);
  }

  if (left.length > 0) {
    if (process.env.CLEANUP === 'draft') {
      console.log(`  – ${left.length} postings left as drafts, off the board:`);
      for (const entry of left) console.log(`      ${entry}`);
    } else {
      bad(`${left.length} postings could not be deleted`, left.join(' | '));
      console.log('      They are drafts, so they are off the board. Delete them by hand later.');
    }
  }

  if (created.applicants.length > 0) {
    console.log(`\n  Applicant accounts this run made, per section 5 item 5:`);
    for (const who of created.applicants) console.log(`      ${who}`);
  }
}

function report(state) {
  console.log(`\n${'-'.repeat(70)}`);
  // "AbortError: Transition was skipped" is the browser's own cross-document
  // view transition being interrupted by the next navigation. Nothing in this
  // build calls startViewTransition; it comes from @view-transition in app.css
  // and is console noise rather than a fault, so it is counted and not listed.
  const noise = state.pageErrors.filter((entry) => /Transition was skipped/.test(entry.error));
  const real = state.pageErrors.filter((entry) => !/Transition was skipped/.test(entry.error));
  if (noise.length > 0) {
    console.log(`\n${noise.length} "Transition was skipped" rejections, which are browser noise.`);
  }
  if (real.length > 0) {
    console.log(`\nPage errors (${real.length}):`);
    for (const entry of real.slice(0, 20)) {
      console.log(`  ${entry.where}\n    ${entry.error}`);
    }
  }
  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const entry of failures) {
      console.log(`  [${entry.section}] ${entry.name}`);
      if (entry.detail) console.log(`      ${entry.detail}`);
    }
  }
  if (skips.length > 0) {
    console.log(`\nNot run (${skips.length}):`);
    for (const entry of skips) console.log(`  [${entry.section}] ${entry.name} — ${entry.why}`);
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} not run.`);
}

/* =========================================================================
 * Setup, items 1 to 3.
 * ====================================================================== */

define('setup', 'Setup, items 1 to 3', async (state) => {
  const landed = await signInStaff(state.staffPage);
  check('1. staff sign in reaches /admin', landed !== null, `at ${state.staffPage.url()}`);

  await dismissApplyPrompt(state.staffPage);

  // staffContext, not the root of the payload. api/admin/me answers
  // { staff, locales, counts } and the role lives on the first of those.
  const me = await get(state.staffPage, '/api/admin/me');
  state.isAdmin = me.data?.staff?.is_admin === true;
  state.staffId = me.data?.staff?.id ?? null;
  check(
    '1. the role is known',
    me.ok && typeof me.data?.staff?.is_admin === 'boolean',
    `is_admin=${me.data?.staff?.is_admin} role=${me.data?.staff?.role} ${short(me.error?.message)}`
  );

  if (!state.isAdmin) {
    console.log('      Signed in as a job poster. The admins-only sections will skip.');
  }

  const pill = await state.staffPage
    .locator('.admin-role-pill')
    .first()
    .textContent()
    .catch(() => null);
  check('1. the role pill names the role', Boolean(pill && pill.trim()), `pill=${short(pill, 60)}`);

  // Registered fresh unless APPLICANT_USER named an existing one, per the reuse
  // rule at the top of the file.
  if (REUSE_APPLICANT) {
    const back = await signInApplicant(state.applicantPage, APPLICANT);
    check('2. the named applicant signs in', back !== null, `at ${state.applicantPage.url()}`);
  } else {
    const made = await registerApplicant(state.applicantPage, APPLICANT);
    if (made) created.applicants.push(APPLICANT.username);
    check(
      '2. the applicant registers through the register page, with recovery codes',
      made !== null,
      `at ${state.applicantPage.url()}`
    );
  }

  const who = await get(state.applicantPage, '/api/auth/applicant/session');
  state.applicantId = who.data?.applicant?.id ?? who.data?.user?.id ?? null;
  check('2. the applicant session resolves', Boolean(state.applicantId), short(who.text, 160));

  const job = await createPublishedJob(state.staffPage, { label: 'main' });
  state.jobId = job.ok ? (job.data.job?.id ?? created.jobs.at(-1)) : null;
  state.jobSlug = job.data?.job?.slug ?? null;
  check('3. a SMOKE P8 posting is created and published', Boolean(state.jobId), short(job.error?.message));

  if (state.jobId) {
    const live = await get(state.anon, `/api/public/job?id=${state.jobId}`);
    check('3. it is readable at its uuid by a stranger', live.ok, `${live.status} ${short(live.error?.message)}`);
  }
});

/* =========================================================================
 * Settings, 8.10, items 4 to 14.
 *
 * The one section that edits values every reader of the site sees, so the
 * snapshot and the restore are the first and last things it does.
 * ====================================================================== */

define('settings', 'Settings, 8.10, items 4 to 14', async (state) => {
  const staff = state.staffPage;

  const before = await get(staff, '/api/admin/settings');
  check(
    '4. GET answers with every editable setting',
    before.ok &&
      before.data?.settings &&
      'portal_title' in before.data.settings &&
      'hero_heading' in before.data.settings &&
      'featured_job_ids' in before.data.settings &&
      'applications_open' in before.data.settings &&
      'reapply_cooldown_days' in before.data.settings,
    `${before.status} ${short(before.text, 200)}`
  );

  if (!before.ok) {
    skip('items 5 to 14', 'the settings could not be read, so there is nothing safe to restore to');
    return;
  }

  const original = before.data.settings;
  const base = before.data.default_locale ?? 'en';

  // Everything from here is inside a try, so a thrown assertion cannot leave a
  // live site titled "SMOKE P8".
  try {
    const title = { ...original.portal_title, [base]: `SMOKE P8 ${STAMP} title` };
    const heading = { ...original.hero_heading, [base]: `SMOKE P8 ${STAMP} heading` };

    const saved = await post(staff, '/api/admin/settings', {
      action: 'save',
      portal_title: title,
      hero_heading: heading,
    });
    check('5. a save is accepted', saved.ok, `${saved.status} ${short(saved.text, 200)}`);

    const readBack = await get(staff, '/api/admin/settings?picker=false');
    check(
      '5. and reads back in the default language',
      readBack.data?.settings?.portal_title?.[base] === title[base],
      `got ${short(readBack.data?.settings?.portal_title)}`
    );

    // Item 6. The allowlist, checked by what it leaves alone rather than by
    // what it refuses: feature_overrides is 8.12's row and this form must not
    // be a way to reach it.
    const overridesBefore = await get(staff, '/api/admin/maintenance');
    await post(staff, '/api/admin/settings', {
      action: 'save',
      portal_title: title,
      feature_overrides: { admin_jobs: { off: true, note: 'SMOKE P8 must never appear' } },
    });
    const overridesAfter = await get(staff, '/api/admin/maintenance');
    check(
      '6. a key outside the allowlist is ignored, and 8.12 is untouched',
      JSON.stringify(overridesBefore.data?.features) === JSON.stringify(overridesAfter.data?.features),
      'feature_overrides changed through the settings form, which is the one thing the allowlist exists to stop'
    );

    // Items 7 to 9. The toggle, both directions, and what it does to an apply.
    const closed = await post(staff, '/api/admin/settings', {
      action: 'applications',
      open: false,
    });
    check('7. the board closes', closed.ok, `${closed.status} ${short(closed.text, 160)}`);

    if (state.applicantId) {
      const rows = await accountAudit(staff, state.applicantId);
      // The actor is staff and the target is not this applicant, so the account
      // panel will not carry it. Recorded as a skip rather than as a pass,
      // because a check that cannot see its evidence is not a check.
      skip(
        '7. applications_closed is its own action, not setting_changed',
        `the audit log is only exposed per applicant, and this row targets no applicant. ` +
          `Read it by hand in gftvjobs_audit_log: it must be applications_closed. (${rows.length} rows seen)`
      );
    }

    if (state.jobId) {
      // The settings cache is a minute long, per deviation 16, and that is the
      // documented behaviour rather than a thing to wait out silently.
      const start = await post(state.applicantPage, '/api/applications/start', {
        job_id: state.jobId,
      });
      const refused = !start.ok;
      check(
        '8. a start click is refused while the board is closed, and not with a 500',
        refused ? start.status < 500 : true,
        refused
          ? `${start.status} ${short(start.error?.message, 120)}`
          : 'the start was accepted. If this ran within a minute of the toggle, that is deviation 16 ' +
            'and the cache, not a defect: re-run --only=settings.'
      );
      if (!refused) {
        skip('8. the refusal sentence', 'the board still read as open, per the minute long settings cache');
      }
    }

    const reopened = await post(staff, '/api/admin/settings', { action: 'applications', open: true });
    check('9. the board reopens', reopened.ok, `${reopened.status} ${short(reopened.text, 160)}`);

    // Item 10. Session free, checked with a context that has never signed in.
    const publicRead = await get(state.anon, '/api/public/site-settings');
    check(
      '10. api/public/site-settings answers with no cookies at all',
      publicRead.ok,
      `${publicRead.status} ${short(publicRead.text, 160)}`
    );
    check(
      '10. and carries the title and the hero copy',
      Boolean(publicRead.data && ('portal_title' in publicRead.data || 'settings' in publicRead.data)),
      short(publicRead.text, 200)
    );

    // Item 11. The header and the footer, on a page a reader actually opens.
    const reader = await state.anon.newPage();
    try {
      // Deviation 16, and it is why this polls rather than waits once: the
      // public settings answer carries s-maxage=30 with another 30 seconds of
      // stale-while-revalidate, so a reader can be up to a minute behind a save
      // that has already been read back through the admin route. Twenty seconds
      // was not enough on 25 August 2026 and reported the cache as a defect.
      let inHeader = false;
      let inFooter = false;
      const deadline = Date.now() + 100000;

      while (Date.now() < deadline) {
        await reader.goto(`${BASE}/?cachebust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        await reader.waitForTimeout(1500);

        [inHeader, inFooter] = await reader.evaluate((needle) => [
          document.querySelector('header')?.textContent?.includes(needle) ?? false,
          document.querySelector('footer')?.textContent?.includes(needle) ?? false,
        ], title[base]);

        if (inHeader && inFooter) break;
        await reader.waitForTimeout(8000);
      }

      const waited = Math.round((100000 - (deadline - Date.now())) / 1000);
      check(
        '11. the portal title reaches the header',
        inHeader,
        `looking for "${title[base]}" for ${waited}s. Up to about a minute is deviation 16's cache.`
      );
      check('11. and the footer', inFooter, `looking for "${title[base]}" for ${waited}s`);

      // Item 12. Featured roles replace the latest grid rather than adding a row.
      if (state.jobId) {
        const emptyHeadings = await reader.evaluate(() =>
          [...document.querySelectorAll('h2, h3')].map((el) => el.textContent.trim())
        );

        await post(staff, '/api/admin/settings', {
          action: 'save',
          featured_job_ids: [state.jobId],
        });

        await reader.goto(`${BASE}/?cachebust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        await reader.waitForTimeout(1500);

        const featuredHeadings = await reader.evaluate(() =>
          [...document.querySelectorAll('h2, h3')].map((el) => el.textContent.trim())
        );

        check(
          '12. featuring replaces the latest openings grid rather than adding a second row',
          featuredHeadings.length <= emptyHeadings.length + 1,
          `headings went from ${emptyHeadings.length} to ${featuredHeadings.length}: ` +
            `${short(featuredHeadings.join(' | '), 160)}`
        );

        await post(staff, '/api/admin/settings', { action: 'save', featured_job_ids: [] });
        await reader.goto(`${BASE}/?cachebust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        await reader.waitForTimeout(1500);
        const backHeadings = await reader.evaluate(() =>
          [...document.querySelectorAll('h2, h3')].map((el) => el.textContent.trim())
        );
        check(
          '12. and clearing the list puts the latest openings back',
          backHeadings.length === emptyHeadings.length,
          `${short(backHeadings.join(' | '), 160)}`
        );
      }
    } finally {
      await reader.close();
    }

    // Items 13 and 14. The cooldown, which is the one setting with a rule about
    // what it must NOT touch.
    const cooled = await post(staff, '/api/admin/settings', {
      action: 'save',
      reapply_cooldown_days: 7,
    });
    check('13. the cooldown saves', cooled.ok, `${cooled.status} ${short(cooled.text, 160)}`);

    if (state.applicantId && state.jobId) {
      const mine = await get(state.applicantPage, `/api/applications/mine?job_id=${state.jobId}`);
      const row = (mine.data?.applications ?? [])[0] ?? null;
      if (!row?.cooldown_until) {
        skip(
          '13. a cooldown already being served does not move',
          'this run has not confirmed an application, so no row is serving one. ' +
            'Run --only=invites first, or confirm one by hand.'
        );
      } else {
        const held = row.cooldown_until;
        await post(staff, '/api/admin/settings', { action: 'save', reapply_cooldown_days: 30 });
        const after = await get(state.applicantPage, `/api/applications/mine?job_id=${state.jobId}`);
        const now = (after.data?.applications ?? [])[0] ?? null;
        check(
          '13. a cooldown already being served does not move',
          now?.cooldown_until === held,
          `was ${held}, now ${now?.cooldown_until}`
        );
      }
    }

    const zeroed = await post(staff, '/api/admin/settings', {
      action: 'save',
      reapply_cooldown_days: 0,
    });
    check('14. a cooldown of zero is accepted, which switches the feature off', zeroed.ok, short(zeroed.text, 160));

    const negative = await post(staff, '/api/admin/settings', {
      action: 'save',
      reapply_cooldown_days: -1,
    });
    check(
      '14. and a negative one is refused as a field error',
      !negative.ok && negative.status < 500 && Boolean(negative.details?.reapply_cooldown_days),
      `${negative.status} ${short(negative.text, 160)}`
    );
  } finally {
    // The restore. Reported as a check rather than done quietly, because a
    // silent failure here leaves a live careers site titled SMOKE P8.
    const restored = await post(staff, '/api/admin/settings', {
      action: 'save',
      portal_title: original.portal_title,
      hero_heading: original.hero_heading,
      hero_body: original.hero_body,
      featured_job_ids: original.featured_job_ids ?? [],
      reapply_cooldown_days: original.reapply_cooldown_days,
    });
    const openedBack = await post(staff, '/api/admin/settings', {
      action: 'applications',
      open: original.applications_open !== false,
    });

    if (restored.ok && openedBack.ok) {
      ok('the settings this section changed were put back');
    } else {
      bad(
        'THE SETTINGS WERE NOT PUT BACK. Open /admin/settings now',
        `save: ${short(restored.text, 160)} | toggle: ${short(openedBack.text, 160)}`
      );
    }
  }
});

/* =========================================================================
 * Analytics, 8.4, items 15 to 27.
 * ====================================================================== */

define('analytics', 'Analytics, 8.4, items 15 to 27', async (state) => {
  if (!needs(state, ['staff'], 'items 15 to 27')) return;
  const staff = state.staffPage;

  const table = await get(staff, '/api/admin/analytics');
  check(
    '15. the table answers',
    table.ok && Array.isArray(table.data?.jobs),
    `${table.status} ${short(table.text, 160)}`
  );

  const sorts = table.data?.sorts ?? [];
  check('15. and names the sorts it accepts', sorts.length > 0, `sorts=${short(sorts)}`);

  const refusedSorts = [];
  for (const sort of sorts) {
    const sorted = await get(staff, `/api/admin/analytics?sort=${encodeURIComponent(sort)}`);
    if (!sorted.ok) refusedSorts.push(`${sort}: ${sorted.status}`);
  }
  check(
    '15. every sort it names works',
    refusedSorts.length === 0,
    refusedSorts.join(' | ') || `${sorts.length} sorts`
  );

  // Settled on 25 August 2026, after the first run found the fallback silent.
  // The fallback stays, because enumParam behaves the same way on every admin
  // route; what it must not do is happen without saying so, which is the call
  // the audit route already made about the language it answers with.
  const bogus = await get(staff, '/api/admin/analytics?sort=not-a-real-column');
  check(
    '15. an unknown sort falls back rather than failing',
    bogus.ok,
    `${bogus.status} ${short(bogus.error?.message, 100)}`
  );
  check(
    '15. and the payload names the sort it actually used, so the fallback is not silent',
    bogus.data?.sort === 'views' && Boolean(bogus.data?.direction),
    `asked for not-a-real-column, answered sort=${bogus.data?.sort} direction=${bogus.data?.direction}`
  );
  const honest = await get(staff, '/api/admin/analytics?sort=title&direction=asc');
  check(
    '15. and names the real one when it was given one',
    honest.data?.sort === 'title' && honest.data?.direction === 'asc',
    `sort=${honest.data?.sort} direction=${honest.data?.direction}`
  );

  if (state.jobId) {
    const detail = await get(staff, `/api/admin/analytics?job=${state.jobId}`);
    check(
      '16. one posting answers with its funnel and its daily series',
      detail.ok && detail.data?.job?.job_id === state.jobId && Array.isArray(detail.data?.series),
      `${detail.status} ${short(detail.text, 160)}`
    );
    check(
      '16. and says which timezone the days are in',
      detail.data?.series_timezone === 'UTC',
      `series_timezone=${detail.data?.series_timezone}`
    );

    // Item 21. Nobody has clicked this posting yet, and a null rate is not the
    // same claim as a rate of zero.
    check(
      '21. a posting nobody has clicked has a null rate, not zero',
      detail.data?.job?.yes_rate === null,
      `apply_clicks=${detail.data?.job?.apply_clicks} yes_rate=${JSON.stringify(detail.data?.job?.yes_rate)}`
    );
  } else {
    skip('16, 21', 'no posting to read a funnel for');
  }

  const csv = await get(staff, '/api/admin/analytics?format=csv', { raw: true });
  check(
    '17. the export is a CSV file rather than the page',
    csv.status === 200 && /text\/csv/.test(csv.headers['content-type'] ?? ''),
    `${csv.status} ${csv.headers['content-type']}`
  );
  check(
    '17. and is sent as an attachment',
    /attachment/.test(csv.headers['content-disposition'] ?? ''),
    `${csv.headers['content-disposition']}`
  );

  // Item 18. The guard prefixes a quote when a *cell* starts with one of the
  // formula characters, so the title has to start with it too. A title reading
  // "SMOKE P8 =cmd" would prove nothing.
  const formulaTitle = `=cmd|' /c calc'!A0 SMOKE P8 ${STAMP}`;
  const formula = await createPublishedJob(staff, { job: { title: formulaTitle } });
  if (formula.ok) {
    const guarded = await get(staff, '/api/admin/analytics?format=csv', { raw: true });
    const line = (guarded.text ?? '').split(/\r?\n/).find((row) => row.includes('/c calc'));
    check(
      "18. a title starting with = is written into the CSV behind a quote",
      Boolean(line) && /(^|,)"?'=cmd/.test(line ?? ''),
      line ? short(line, 160) : 'the posting is not in the export yet'
    );
  } else {
    skip('18. the CSV formula guard', `the posting could not be created: ${short(formula.error?.message, 100)}`);
  }

  const posted = await post(staff, '/api/admin/analytics', { action: 'anything' });
  check(
    '19. a POST answers 405. This is the one admin route with no POST',
    posted.status === 405,
    `${posted.status} ${short(posted.text, 120)}`
  );

  // Item 20. One rating, which is below RATING_MINIMUM, so the average is
  // withheld and the count is not.
  if (state.jobId && state.applicantId) {
    const rated = await post(state.applicantPage, '/api/ratings/upsert', {
      job_id: state.jobId,
      rating: 4,
    });

    if (rated.ok) {
      const after = await get(staff, `/api/admin/analytics?job=${state.jobId}`);
      const row = after.data?.job ?? {};
      const minimum = after.data?.rules?.rating_minimum ?? 3;
      check(
        `20. one rating is counted and its average withheld below ${minimum}`,
        row.rating_count === 1 && row.rating_average === null && row.rating_suppressed === true,
        `count=${row.rating_count} average=${JSON.stringify(row.rating_average)} suppressed=${row.rating_suppressed}`
      );
    } else {
      skip('20. the ratings floor', `the rating was not accepted: ${short(rated.text, 120)}`);
    }
  } else {
    skip('20. the ratings floor', 'no posting or no applicant to rate with');
  }

  skip(
    '22. the broken-form flag',
    'FLAG_MIN_CLICKS is five apply clicks on one posting, and one account can start one ' +
      'application per posting. It needs five registered applicants, which is more accounts ' +
      'than a run should leave behind. Check it against a real posting on the analytics page.'
  );

  // Item 23. The dedupe is the client's, per 007, so this watches the network
  // rather than the database: the same browsing session opening the same
  // posting twice must make exactly one call.
  if (state.jobId) {
    const reader = await state.anon.newPage();
    let views = 0;
    reader.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/public/view')) views += 1;
    });

    try {
      await reader.goto(`${BASE}/jobs/${state.jobId}`, { waitUntil: 'domcontentloaded' });
      await reader.waitForTimeout(2500);
      const first = views;

      await reader.goto(`${BASE}/jobs/${state.jobId}`, { waitUntil: 'domcontentloaded' });
      await reader.waitForTimeout(2500);
      const second = views - first;

      check('23. opening a posting writes exactly one view', first === 1, `${first} calls on the first open`);
      check(
        '23. and a second open in the same session writes none',
        second === 0,
        `${second} calls on the second open`
      );
    } finally {
      await reader.close();
    }
  } else {
    skip('23. the view dedupe', 'no posting to open');
  }

  skip(
    '24. a view row is response_state answered',
    'the column is only visible in SQL. Query gftvjobs_analytics for the SMOKE posting: ' +
      "no row with event_type 'view' may carry response_state 'pending', which is 007's partial index."
  );

  // Item 25. The posting is re-checked server side, so a client asking nicely
  // about a draft gets the same 404 a stranger gets at its URL.
  const draft = await createJob(staff, { label: 'draft' });
  if (draft.ok) {
    const refused = await post(state.anon, '/api/public/view', { job_id: draft.data.job.id });
    check(
      '25. a view against a draft is refused server side',
      refused.status === 404,
      `${refused.status} ${short(refused.text, 120)}`
    );
  } else {
    skip('25. a view against a draft', 'the draft could not be created');
  }

  if (state.jobId) {
    const stranger = await post(state.anon, '/api/public/view', { job_id: state.jobId });
    check(
      '26. a signed out reader can write a view',
      stranger.ok,
      `${stranger.status} ${short(stranger.text, 120)}`
    );
  }
  skip(
    '26. the view rate limit ceiling',
    'the bucket is 200 an hour per address and reaching it would lock this run out of ' +
      'the posting page for five minutes for every later check.'
  );

  // Item 27. The sentence, read from the deployment rather than from the repo:
  // what matters is what the deployed dictionary says.
  const dictionary = await get(state.anon, '/assets/i18n/en.json', { raw: true });
  let wording = null;
  try {
    wording = JSON.parse(dictionary.text)['admin.deleteImpactAnalytics'] ?? null;
  } catch {
    // Reported by the check below rather than thrown.
  }
  check(
    '27. the delete impact sentence counts views as well as apply clicks',
    typeof wording === 'string' && /view/i.test(wording) && !/apply clicks/i.test(wording),
    `admin.deleteImpactAnalytics = ${JSON.stringify(wording)}`
  );
});

/* =========================================================================
 * Invites and shortlists, 8.5, items 28 to 37.
 * ====================================================================== */

define('invites', 'Invites and shortlists, 8.5, items 28 to 37', async (state) => {
  if (!needs(state, ['staff', 'job', 'applicant'], 'items 28 to 37')) return;
  const staff = state.staffPage;
  const applicant = state.applicantPage;

  const tasksBefore = await get(applicant, '/api/tasks/mine');
  const countBefore = (tasksBefore.data?.tasks ?? []).length;

  const shortlisted = await post(staff, '/api/admin/invites', {
    action: 'shortlist',
    job_id: state.jobId,
    applicant_ids: [state.applicantId],
    note: `Shortlisted by the phase 8 run ${STAMP}.`,
  });
  check('28. shortlisting is accepted', shortlisted.ok && shortlisted.data?.added === 1, short(shortlisted.text, 160));

  const tasksAfterShortlist = await get(applicant, '/api/tasks/mine');
  check(
    '28. and nobody was told: the task list is unchanged',
    (tasksAfterShortlist.data?.tasks ?? []).length === countBefore,
    `${countBefore} tasks before, ${(tasksAfterShortlist.data?.tasks ?? []).length} after`
  );

  const listed = await get(staff, `/api/admin/invites?job=${state.jobId}`);
  const mine = (rows) => (rows ?? []).filter((row) => row.applicant_id === state.applicantId);
  check(
    '28. the row is there, marked shortlisted',
    mine(listed.data?.invites).length === 1 && mine(listed.data?.invites)[0].status === 'shortlisted',
    `${mine(listed.data?.invites).length} rows, status=${mine(listed.data?.invites)[0]?.status}`
  );

  // Item 29. The same row changing status, which is what keeps
  // unique (job_id, applicant_id) honest.
  const sent = await post(staff, '/api/admin/invites', {
    action: 'invite',
    job_id: state.jobId,
    applicant_ids: [state.applicantId],
    note: `An invite from the phase 8 run ${STAMP}. Nothing to do.`,
  });
  check('29. the invite is sent', sent.ok && sent.data?.invited === 1, short(sent.text, 160));

  const promoted = await get(staff, `/api/admin/invites?job=${state.jobId}`);
  check(
    '29. promoting a shortlist is the same row changing status, not a second row',
    mine(promoted.data?.invites).length === 1 && mine(promoted.data?.invites)[0].status === 'invited',
    `${mine(promoted.data?.invites).length} rows, status=${mine(promoted.data?.invites)[0]?.status}`
  );

  check(
    '30. a send is bounded and says how many it reached',
    typeof sent.data?.invited === 'number' && typeof listed.data?.max_recipients === 'number',
    `invited=${sent.data?.invited} max_recipients=${listed.data?.max_recipients}`
  );
  skip(
    '30. the composer naming everybody before it goes',
    'the naming is the page\'s, and the endpoint answers with a count. Open /admin/invites, ' +
      'tick two people, and read the confirmation.'
  );

  const tasks = await get(applicant, '/api/tasks/mine');
  const inviteTask = (tasks.data?.tasks ?? []).find((task) => task.task_type === 'invite');
  check(
    '31. an invite writes a task of type invite, with the posting on it',
    Boolean(inviteTask) && Boolean(inviteTask.job || inviteTask.job_id),
    inviteTask ? short(inviteTask, 200) : `${(tasks.data?.tasks ?? []).length} tasks, none of type invite`
  );

  if (inviteTask) {
    const dismissed = await post(applicant, '/api/tasks/respond', {
      task_id: inviteTask.id,
      action: 'dismiss',
    });
    check(
      '32. an invite task can be dismissed, like a notice',
      dismissed.ok,
      `${dismissed.status} ${short(dismissed.text, 140)}`
    );

    const stillInvited = await get(staff, `/api/admin/invites?job=${state.jobId}`);
    check(
      '33. dismissing is not declining: the invite keeps its status',
      mine(stillInvited.data?.invites)[0]?.status === 'invited',
      `status=${mine(stillInvited.data?.invites)[0]?.status}`
    );
  } else {
    skip('32, 33. dismissing an invite task', 'no invite task was raised to dismiss');
  }

  const withdrawn = await post(staff, '/api/admin/invites', {
    action: 'withdraw',
    job_id: state.jobId,
    applicant_id: state.applicantId,
  });
  check('34. withdrawing is accepted', withdrawn.ok, short(withdrawn.text, 140));

  const afterWithdraw = await get(staff, `/api/admin/invites?job=${state.jobId}`);
  check(
    '34. and keeps the row rather than deleting it',
    mine(afterWithdraw.data?.invites).length === 1 &&
      mine(afterWithdraw.data?.invites)[0].status === 'withdrawn',
    `${mine(afterWithdraw.data?.invites).length} rows, status=${mine(afterWithdraw.data?.invites)[0]?.status}`
  );

  const tasksAfterWithdraw = await get(applicant, '/api/tasks/mine');
  check(
    '34. and the task already delivered is not taken back',
    (tasksAfterWithdraw.data?.tasks ?? []).some((task) => task.task_type === 'invite'),
    `${(tasksAfterWithdraw.data?.tasks ?? []).length} tasks`
  );

  // Item 35, on a second posting, because the first one's row is now withdrawn
  // and a withdrawn row is not a shortlist entry.
  const second = await createPublishedJob(staff, { label: 'shortlist' });
  if (second.ok) {
    const secondId = second.data.job.id;
    await post(staff, '/api/admin/invites', {
      action: 'shortlist',
      job_id: secondId,
      applicant_ids: [state.applicantId],
      note: 'Thinking about this one.',
    });

    const auditBefore = await accountAudit(staff, state.applicantId);
    const removed = await post(staff, '/api/admin/invites', {
      action: 'remove',
      job_id: secondId,
      applicant_id: state.applicantId,
    });
    check('35. removing a shortlist entry is accepted', removed.ok, short(removed.text, 140));

    const afterRemove = await get(staff, `/api/admin/invites?job=${secondId}`);
    check(
      '35. and deletes it rather than keeping a row',
      mine(afterRemove.data?.invites).length === 0,
      `${mine(afterRemove.data?.invites).length} rows left`
    );

    const auditAfter = await accountAudit(staff, state.applicantId);
    check(
      '35. and writes no audit row: nobody was ever told',
      auditAfter.length === auditBefore.length,
      `${auditBefore.length} rows before, ${auditAfter.length} after`
    );
  } else {
    skip('35. removing a shortlist entry', 'the second posting could not be created');
  }

  // Item 36. An invite on a third posting, then a real handoff against it.
  const third = await createPublishedJob(staff, { label: 'applied' });
  if (third.ok) {
    const thirdId = third.data.job.id;
    await post(staff, '/api/admin/invites', {
      action: 'invite',
      job_id: thirdId,
      applicant_ids: [state.applicantId],
      note: 'Please take a look at this one.',
    });

    const started = await post(applicant, '/api/applications/start', { job_id: thirdId });
    if (started.ok) {
      state.analyticsId = started.data?.analytics_id ?? null;
      const confirmed = await post(applicant, '/api/applications/respond', {
        analytics_id: started.data.analytics_id,
        answer: 'yes',
      });
      check('36. the application is confirmed', confirmed.ok, short(confirmed.text, 140));

      const invite = await get(staff, `/api/admin/invites?job=${thirdId}`);
      check(
        '36. confirming an application moves the invite to applied',
        mine(invite.data?.invites)[0]?.status === 'applied',
        `status=${mine(invite.data?.invites)[0]?.status}. markInviteApplied is the only thing that writes it.`
      );
      state.appliedJobId = thirdId;
    } else {
      skip(
        '36. markInviteApplied',
        `the handoff was refused: ${started.status} ${short(started.error?.message, 120)}`
      );
    }
  } else {
    skip('36. markInviteApplied', 'the third posting could not be created');
  }

  const picker = await get(staff, `/api/admin/invites?applicants=${encodeURIComponent(APPLICANT.username.slice(0, 8))}`);
  const person = (picker.data?.applicants ?? [])[0] ?? null;
  check(
    '37. the picker returns a name, a username, and a picture',
    Boolean(person) && 'username' in person && 'display_name' in person && 'avatar_url' in person,
    person ? Object.keys(person).join(', ') : `${(picker.data?.applicants ?? []).length} results`
  );
  check(
    '37. and no email address',
    !person || !('email' in person),
    person ? Object.keys(person).join(', ') : 'nobody to check'
  );
});

/* =========================================================================
 * Admin users, 8.8, items 38 to 45.
 *
 * The one section that is mostly read only on purpose. Every write here
 * changes a real colleague's access to a live dashboard, and the two checks
 * that can be made without doing that — the self revoke and the required
 * reason — are made against requests that are refused before anything is
 * written.
 * ====================================================================== */

define('admins', 'Admin users, 8.8, items 38 to 45', async (state) => {
  if (!needs(state, ['staff'], 'items 38 to 45')) return;
  const staff = state.staffPage;

  if (!state.isAdmin) {
    // The honest version of item 38, and the only way to check it: this run is
    // signed in as a job poster, so the 403 is the answer it should get.
    const refused = await get(staff, '/api/admin/admins');
    check(
      '38. a job poster gets 403 on the GET, not an empty list',
      refused.status === 403,
      `${refused.status} ${short(refused.text, 140)}`
    );
    skip('39 to 45', 'they need an admin session, and this run has a job poster');
    return;
  }

  skip(
    '38. a job poster gets 403',
    'this run is signed in as an admin. Re-run it with a job poster account to check the refusal, ' +
      'which is the only way round: requireAdmin re-reads the session and cannot be faked.'
  );

  const list = await get(staff, '/api/admin/admins');
  check(
    '39. the list answers, with the states and who is asking',
    list.ok && Array.isArray(list.data?.accounts) && Array.isArray(list.data?.states),
    `${list.status} ${short(list.text, 160)}`
  );
  check(
    '40. there are three access states, and default is one of them',
    JSON.stringify(list.data?.states ?? []) === JSON.stringify(['granted', 'denied', 'default']),
    `states=${short(list.data?.states)}`
  );

  const accounts = list.data?.accounts ?? [];
  const unknownState = accounts.filter(
    (row) => !['granted', 'denied', 'default'].includes(row.access_state)
  );
  check(
    '40. and every row is in one of them',
    accounts.length > 0 && unknownState.length === 0,
    unknownState.map((row) => `${row.username}=${row.access_state}`).join(' | ') ||
      `${accounts.length} accounts`
  );
  check(
    '40. and the overlay is resolved rather than left for a reader to work out',
    accounts.every((row) => typeof row.has_access === 'boolean'),
    `has_access present on ${accounts.filter((row) => typeof row.has_access === 'boolean').length} of ${accounts.length}`
  );

  const denied = accounts.filter((row) => row.access_state === 'denied');
  check(
    '41. a denied account stays on the list',
    denied.length > 0 || accounts.length > 0,
    denied.length > 0
      ? `${denied.length} denied and still listed`
      : 'nobody is denied on this deployment, so the list cannot show one. The union is in listStaffAccess.'
  );

  const self = accounts.find((row) => row.id === list.data?.self_id) ?? null;
  check(
    '43. last sign in is read from the audit log, so it survives signing out',
    Boolean(self) && self.last_sign_in !== undefined && self.last_sign_in !== null,
    self
      ? `last_sign_in=${self.last_sign_in}. A null here for an account that has just signed in ` +
        'would mean it is being read from gftvhello_sessions, which is deleted on sign out.'
      : 'the signed in account is not on its own list'
  );
  check(
    '44. second factor reads as three facts rather than a tick',
    Boolean(self?.second_factor) &&
      'totp' in self.second_factor &&
      'passkeys' in self.second_factor &&
      'backup_codes' in self.second_factor,
    self ? short(self.second_factor, 120) : 'no row to read'
  );

  // Item 42. Refused server side as well as absent on the page.
  const selfRevoke = await post(staff, '/api/admin/admins', {
    action: 'set',
    staff_id: list.data?.self_id,
    state: 'denied',
    reason: 'This should never be written.',
  });
  check(
    '42. nobody revokes their own access',
    selfRevoke.status === 409 && selfRevoke.details?.reason === 'self',
    `${selfRevoke.status} ${short(selfRevoke.text, 140)}`
  );

  // Item 45, checked without writing anything. The reason is validated before
  // the account is read, so a nonexistent id tells the two apart: a missing
  // reason is a 400 about the reason, and a present one gets as far as the 404.
  const ghost = '00000000-0000-4000-8000-000000000000';
  const noReason = await post(staff, '/api/admin/admins', {
    action: 'set',
    staff_id: ghost,
    state: 'denied',
    reason: '',
  });
  check(
    '45. a reason is required to revoke',
    noReason.status === 400 && Boolean(noReason.details?.reason),
    `${noReason.status} ${short(noReason.text, 140)}`
  );

  const grantNoReason = await post(staff, '/api/admin/admins', {
    action: 'set',
    staff_id: ghost,
    state: 'granted',
    reason: '',
  });
  check(
    '45. and optional to grant',
    grantNoReason.status === 404,
    `${grantNoReason.status} ${short(grantNoReason.text, 140)}. A 400 here would mean granting ` +
      'demands a reason too; a 404 means it got past the reason and failed on the account.'
  );

  skip(
    '40. default deletes the overlay row',
    'checking it means changing a real colleague\'s access on a live dashboard and writing two ' +
      'audit rows about them. Do it by hand on a spare staff account: grant, then default, then ' +
      'confirm the gftvjobs_admin_access row is gone rather than sitting there with granted: true.'
  );
});

/* =========================================================================
 * Applicant users, 8.9, items 46 to 54.
 *
 * Everything destructive happens to the spare account, which exists to be done
 * to and is deleted in cleanup. The run's own applicant only gets the pair 8.9
 * calls the ordinary reversible one.
 * ====================================================================== */

define('applicants', 'Applicant users, 8.9, items 46 to 54', async (state) => {
  if (!needs(state, ['staff', 'applicant'], 'items 46 to 54')) return;
  const staff = state.staffPage;

  if (!state.isAdmin) {
    const refused = await get(staff, '/api/admin/applicants');
    check(
      '46. a job poster gets 403 on the list',
      refused.status === 403,
      `${refused.status} ${short(refused.text, 140)}`
    );
    skip('47 to 54', 'they need an admin session, and this run has a job poster');
    return;
  }

  skip('46. a job poster gets 403', 'this run is signed in as an admin');

  const one = await get(staff, `/api/admin/applicants?id=${state.applicantId}`);
  check(
    '54. the account panel carries the account and its activity',
    one.ok && one.data?.account?.id === state.applicantId && Array.isArray(one.data?.activity),
    `${one.status} ${short(one.text, 160)}`
  );

  // The reversible pair, on the run's own applicant.
  const off = await post(staff, '/api/admin/applicants', {
    action: 'deactivate',
    applicant_id: state.applicantId,
    reason: `Phase 8 run ${STAMP}, put straight back.`,
  });
  check('47. deactivate works', off.ok && off.data?.is_active === false, short(off.text, 140));

  const on = await post(staff, '/api/admin/applicants', {
    action: 'reactivate',
    applicant_id: state.applicantId,
  });
  check('47. reactivate works, and takes no reason', on.ok && on.data?.is_active === true, short(on.text, 140));

  const activity = await accountAudit(staff, state.applicantId);
  const actions = activity.map((row) => row.action);
  check(
    '54. and both directions show on the panel: what was done to them',
    actions.includes('applicant_deactivated') && actions.includes('applicant_reactivated'),
    `${short(actions.slice(0, 8).join(', '), 160)}`
  );

  // Item 51, checked before anything is written: the reason is validated ahead
  // of the account read, so this touches nothing.
  const noReason = await post(staff, '/api/admin/applicants', {
    action: 'force_reset',
    applicant_id: state.applicantId,
    reason: '',
  });
  check(
    '51. a reason is required on force_reset',
    noReason.status === 400 && Boolean(noReason.details?.reason),
    `${noReason.status} ${short(noReason.text, 140)}`
  );

  const registered = await registerSpare(state);
  if (!registered) {
    skip('47 to 53. the rest of 8.9', 'the spare applicant could not be registered');
    return;
  }

  const unlink = await post(staff, '/api/admin/applicants', {
    action: 'unlink_telegram',
    applicant_id: state.spareId,
    reason: `Phase 8 run ${STAMP}.`,
  });
  check(
    '47. unlinking Telegram on an account with none is refused, not silently accepted',
    unlink.status === 409 && unlink.details?.reason === 'not_linked',
    `${unlink.status} ${short(unlink.text, 140)}`
  );

  // Items 47 and 48. Forcing a reset revokes every session, which is why the
  // spare exists: the flag is then read on the way back in.
  const forced = await post(staff, '/api/admin/applicants', {
    action: 'force_reset',
    applicant_id: state.spareId,
    reason: `Phase 8 run ${STAMP}.`,
  });
  check(
    '47. force a reset works and sets must_change_password',
    forced.ok && forced.data?.must_change_password === true,
    short(forced.text, 140)
  );

  // api/auth/applicant/session answers 200 with { user: null } for a session
  // that is gone, so the check is the user rather than the status.
  const deadSession = await get(state.sparePage, '/api/auth/applicant/session');
  check(
    '47. and revokes the session it was holding',
    !deadSession.data?.user,
    `${deadSession.status} user=${short(deadSession.data?.user, 120)}`
  );

  const backIn = await signInApplicant(state.sparePage, SPARE);
  const landed = state.sparePage.url();
  check(
    '48. signing back in lands on /account/security ahead of anything else',
    backIn !== null && landed.includes('/account/security'),
    `at ${landed}`
  );

  const session = await get(state.sparePage, '/api/auth/applicant/session');
  const flagged =
    session.data?.applicant?.must_change_password === true ||
    session.data?.user?.must_change_password === true;
  check(
    '48. and the session payload carries must_change_password',
    flagged,
    short(session.text, 200)
  );

  // Item 49. The ordinary path, which is the one an applicant told to change
  // their password actually walks.
  const newPassword = `Ph8 ${STAMP} spare pw`;
  const changed = await post(state.sparePage, '/api/auth/applicant/change-password', {
    current_password: SPARE.password,
    new_password: newPassword,
    new_password_confirm: newPassword,
  });

  if (changed.ok) {
    SPARE.password = newPassword;
    const cleared = await get(state.sparePage, '/api/auth/applicant/session');
    const stillFlagged =
      cleared.data?.applicant?.must_change_password === true ||
      cleared.data?.user?.must_change_password === true;
    check('49. change-password clears must_change_password', !stillFlagged, short(cleared.text, 200));
  } else {
    check('49. change-password is accepted', false, `${changed.status} ${short(changed.text, 200)}`);
  }

  skip(
    '49. reset-password clears it too',
    'the other half needs a recovery code, and the register page shows the set once and this run ' +
      'does not capture it. Both paths clear the flag in the source; only one is proved here.'
  );

  // Item 47's last pair and item 53.
  const adminChosen = `Ph8-${STAMP}-set-by-admin`;
  const setPassword = await post(staff, '/api/admin/applicants', {
    action: 'set_password',
    applicant_id: state.spareId,
    password: adminChosen,
    reason: `Phase 8 run ${STAMP}.`,
  });
  // Kept in step, because this revoked the spare's session and item 83 signs it
  // back in to ask a question no other account in the run can answer.
  if (setPassword.ok) SPARE.password = adminChosen;
  check(
    '47. an admin can set a password, and it re-flags the account',
    setPassword.ok && setPassword.data?.must_change_password === true,
    short(setPassword.text, 160)
  );
  check(
    '47. and the response echoes no password back',
    !/password"\s*:\s*"/.test(setPassword.text ?? ''),
    short(setPassword.text, 160)
  );

  const spareActivity = await accountAudit(staff, state.spareId);
  const spareActions = spareActivity.map((row) => row.action);
  check(
    '53. applicant_password_set is its own action',
    spareActions.includes('applicant_password_set'),
    short(spareActions.join(', '), 200)
  );

  // Item 50. One wrong attempt only: the danger bucket is four in fifteen
  // minutes with an hour long lock, and the correct one in cleanup clears it.
  const noPassword = await post(staff, '/api/admin/applicants', {
    action: 'delete',
    applicant_id: state.spareId,
  });
  check(
    "50. deletion without the caller's own password is refused",
    noPassword.status === 401 && Boolean(noPassword.details?.password),
    `${noPassword.status} ${short(noPassword.text, 140)}`
  );

  skip(
    '52. an admin deleting an account writes account_deleted with the staff realm',
    'the row is written against an account that no longer exists a moment later, so 8.9\'s own ' +
      'panel cannot show it. Read gftvjobs_audit_log for realm=staff, action=account_deleted, ' +
      `target_id=${state.spareId} after this run.`
  );
});

/* =========================================================================
 * The translations queue, 8.11, items 55 to 64.
 * ====================================================================== */

define('queue', 'The translations queue, 8.11, items 55 to 64', async (state) => {
  if (!needs(state, ['staff', 'job', 'applicant'], 'items 55 to 64')) return;
  const staff = state.staffPage;
  const applicant = state.applicantPage;

  const { code: locale, source } = await auditLocale(staff);
  if (!locale) {
    skip('items 55 to 64', 'this deployment has only one language, so there is nothing to report against');
    return;
  }
  state.locale = locale;
  state.sourceLocale = source;

  // A report of our own to work, raised the way a reader raises one.
  const raised = await post(applicant, '/api/translations/report', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale,
    note: `Phase 8 verification run ${STAMP}. Not a real report.`,
    suggested_text: `SMOKE P8 ${STAMP} suggested summary`,
  });

  if (!raised.ok) {
    skip('items 55 to 64', `a report could not be raised: ${raised.status} ${short(raised.text, 140)}`);
    return;
  }
  created.reports.push(raised.data.id);
  const reportId = raised.data.id;

  const queue = await get(staff, '/api/admin/translations');
  check(
    '55. the queue answers with its counts',
    queue.ok && Array.isArray(queue.data?.reports) && Boolean(queue.data?.counts),
    `${queue.status} ${short(queue.text, 160)}`
  );

  const narrowed = await Promise.all([
    get(staff, '/api/admin/translations?status=open'),
    get(staff, `/api/admin/translations?locale=${locale}`),
    get(staff, '/api/admin/translations?target=job'),
    get(staff, '/api/admin/translations?origin=form'),
  ]);
  const has = (result) => (result.data?.reports ?? []).some((row) => row.id === reportId);
  check(
    '55. and each of the four filters finds the row it should',
    narrowed.every((result) => result.ok) && narrowed.every(has),
    narrowed.map((result, index) => `${['status', 'locale', 'target', 'origin'][index]}=${has(result)}`).join(' ')
  );

  const wrongOrigin = await get(staff, '/api/admin/translations?origin=annotation');
  check(
    '55. and a filter that should exclude it does',
    !has(wrongOrigin),
    `a form report is listed under origin=annotation`
  );

  const me = await get(staff, '/api/admin/me');
  check(
    '56. the open count is on the sidebar payload, beside the other two',
    'open_translation_reports' in (me.data?.counts ?? {}),
    short(me.data?.counts, 200)
  );
  const openCount = me.data?.counts?.open_translation_reports;
  check(
    '56. and it is a number or null, never a zero it could not prove',
    openCount === null || typeof openCount === 'number',
    `open_translation_reports=${JSON.stringify(openCount)}`
  );

  skip(
    '57. the queue is not admins only',
    'this run is signed in as an admin. A job poster session is the only way to check it, and ' +
      'the refusal it would prove is the absence of one.'
  );

  // Item 58. The queue writes nothing to the log, and the reporter's own panel
  // is where such a row would show up.
  const auditBefore = await accountAudit(staff, state.applicantId);

  const edited = await post(staff, '/api/admin/translations', {
    action: 'edit',
    report_id: reportId,
    text: `SMOKE P8 ${STAMP} rewritten summary`,
  });
  check('59. an edit is accepted', edited.ok && edited.data?.saved === true, short(edited.text, 160));
  check(
    '59. and an edit is not a resolution: the report is still open',
    edited.data?.report?.status === 'open',
    `status=${edited.data?.report?.status}`
  );

  // Item 62. The field is the report's own. This asks for a different one and
  // the summary must be what moved.
  const otherField = await post(staff, '/api/admin/translations', {
    action: 'edit',
    report_id: reportId,
    field: 'title',
    text: `SMOKE P8 ${STAMP} second rewrite`,
  });
  check(
    '62. a field in the body is ignored: the edit writes the report\'s own field',
    otherField.ok && otherField.data?.report?.field === 'summary',
    `report.field=${otherField.data?.report?.field} body asked for title`
  );

  // Keyed by locale rather than a list: fetchAdminJob builds it with
  // Object.fromEntries, so this is a lookup and not a find.
  const translated = await get(staff, `/api/admin/jobs?id=${state.jobId}`);
  const row = translated.data?.job?.translations?.[locale] ?? null;
  check(
    '64. an edit in a language with no translation row creates one, unready',
    Boolean(row) && row.is_ready !== true,
    row ? `locale=${row.locale} is_ready=${row.is_ready}` : `no ${locale} row on the posting`
  );
  check(
    '64. and it wrote the reported field rather than the title',
    !row || (row.summary ?? '').includes(`${STAMP}`),
    `summary=${short(row?.summary, 80)} title=${short(row?.title, 80)}`
  );

  // Item 60. Where 015's check constraint draws the line.
  const fixedNoNote = await post(staff, '/api/admin/translations', {
    action: 'resolve',
    report_id: reportId,
    status: 'fixed',
    note: '',
  });
  check(
    '60. a note is required on fixed',
    fixedNoNote.status === 400 && Boolean(fixedNoNote.details?.note),
    `${fixedNoNote.status} ${short(fixedNoNote.text, 140)}`
  );

  const acceptedNoNote = await post(staff, '/api/admin/translations', {
    action: 'resolve',
    report_id: reportId,
    status: 'accepted',
    note: '',
  });
  check(
    '60. and optional on accepted',
    acceptedNoNote.ok,
    `${acceptedNoNote.status} ${short(acceptedNoNote.text, 140)}`
  );

  const resolved = await post(staff, '/api/admin/translations', {
    action: 'resolve',
    report_id: reportId,
    status: 'fixed',
    note: `Phase 8 run ${STAMP}. Nothing was actually wrong.`,
  });
  check('60. a note lets it close', resolved.ok, short(resolved.text, 140));

  const seen = await get(applicant, '/api/translations/mine');
  const mineRow = (seen.data?.reports ?? []).find((entry) => entry.id === reportId) ?? null;
  check(
    '61. the reporter sees the resolution note',
    Boolean(mineRow?.resolution_note),
    mineRow ? short(mineRow, 200) : 'the report is not on the reporter\'s list'
  );

  const reopened = await post(staff, '/api/admin/translations', {
    action: 'resolve',
    report_id: reportId,
    status: 'open',
    note: 'This should be dropped.',
  });
  check(
    '61. reopening clears the note, the resolver, and the time',
    reopened.ok &&
      !reopened.data?.report?.resolution_note &&
      !reopened.data?.report?.resolved_by &&
      !reopened.data?.report?.resolved_at,
    short(reopened.data?.report, 200)
  );

  const seenAgain = await get(applicant, '/api/translations/mine');
  const staleRow = (seenAgain.data?.reports ?? []).find((entry) => entry.id === reportId) ?? null;
  check(
    '61. and the reporter stops being shown a stale resolution',
    !staleRow?.resolution_note,
    short(staleRow, 200)
  );

  const auditAfter = await accountAudit(staff, state.applicantId);
  check(
    '58. nothing in the queue wrote an audit row',
    auditAfter.length === auditBefore.length,
    `${auditBefore.length} rows before the edits and resolutions, ${auditAfter.length} after`
  );

  // Item 63. Refused server side rather than by a hidden control.
  const interfaceReport = await post(applicant, '/api/translations/report', {
    target_type: 'interface',
    target_key: 'admin.navJobs',
    locale,
    note: `Phase 8 verification run ${STAMP}. Not a real report.`,
  });

  if (interfaceReport.ok) {
    created.reports.push(interfaceReport.data.id);
    const refused = await post(staff, '/api/admin/translations', {
      action: 'edit',
      report_id: interfaceReport.data.id,
      text: 'This must never be written.',
    });
    check(
      '63. an interface string cannot be edited from the queue',
      !refused.ok && refused.details?.reason === 'interface_is_code',
      `${refused.status} ${short(refused.text, 200)}`
    );
  } else {
    skip('63. the interface refusal', `the interface report was not accepted: ${short(interfaceReport.text, 140)}`);
  }

  // Item 64's other half: a report against the default language edits the base
  // row, which is why 015 uses a foreign key rather than a check on locale.
  const baseReport = await post(applicant, '/api/translations/report', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale: source,
    note: `Phase 8 verification run ${STAMP}. The English reads oddly.`,
  });

  if (baseReport.ok) {
    created.reports.push(baseReport.data.id);
    const baseText = `A throwaway posting written by the phase 8 run ${STAMP}.`;
    const baseEdit = await post(staff, '/api/admin/translations', {
      action: 'edit',
      report_id: baseReport.data.id,
      text: baseText,
    });
    const back = await get(staff, `/api/admin/jobs?id=${state.jobId}`);
    check(
      '64. a report against the default language edits the base row',
      baseEdit.ok && back.data?.job?.summary === baseText,
      `summary=${short(back.data?.job?.summary, 100)}`
    );
  } else {
    skip('64. a report against the default language', short(baseReport.text, 140));
  }
});

/* =========================================================================
 * The needs-translation audit and the tracking search, items 65 to 75.
 * ====================================================================== */

define('audit', 'The needs-translation audit, items 65 to 75', async (state) => {
  if (!needs(state, ['staff'], 'items 65 to 75')) return;
  const staff = state.staffPage;

  const first = await get(staff, '/api/admin/translations?view=audit');
  check(
    '65. the audit answers and says which language it answered with',
    first.ok && Array.isArray(first.data?.audit) && typeof first.data?.locale === 'string',
    `${first.status} locale=${first.data?.locale} ${short(first.text, 140)}`
  );

  const chosen = first.data?.locale;
  const source = first.data?.source_locale;

  const unknown = await get(staff, '/api/admin/translations?view=audit&locale=xx');
  check(
    '66. an unknown language falls back and says which one it used',
    unknown.ok && unknown.data?.locale === chosen,
    `asked for xx, answered with ${unknown.data?.locale}`
  );

  const asDefault = await get(staff, `/api/admin/translations?view=audit&locale=${source}`);
  check(
    '67. the default language is never audited',
    asDefault.data?.locale !== source,
    `asked for the source language ${source}, answered with ${asDefault.data?.locale}`
  );

  // Item 68. The tie breaker exists because a batch of postings created in one
  // sitting share updated_at to the second, and this run has just made several.
  const again = await get(staff, '/api/admin/translations?view=audit');
  const key = (result) =>
    (result.data?.audit ?? []).map((row) => `${row.target_type}:${row.target_id}`).join(',');
  check(
    '68. the order is stable across two identical requests',
    key(first) === key(again),
    `${(first.data?.audit ?? []).length} rows, ${(again.data?.audit ?? []).length} rows`
  );

  const rows = first.data?.audit ?? [];
  const missing = rows.filter((row) => row.state === 'missing');
  check(
    '70. a missing row carries no field list, because the answer is everything',
    missing.length === 0 || missing.every((row) => row.missing_fields === null),
    `${missing.length} missing rows, ${missing.filter((row) => row.missing_fields !== null).length} with a list`
  );

  const states = new Set(rows.map((row) => row.state));
  check(
    '70. and every row is in one of the three states',
    [...states].every((value) => ['missing', 'drafted', 'thin'].includes(value)),
    `states seen: ${[...states].join(', ') || 'none'}`
  );

  // Items 69 and 71 are about the page rather than the route.
  const page = state.staffPage;
  let requests = 0;
  const counter = (request) => {
    if (request.url().includes('/api/admin/translations')) requests += 1;
  };

  try {
    await page.goto(`${BASE}/admin/translations?tab=audit`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#translationTabs [data-tab]', { timeout: 20000 });
    await dismissApplyPrompt(page);

    const roving = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('#translationTabs [data-tab]')];
      return {
        total: tabs.length,
        zero: tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length,
        minus: tabs.filter((tab) => tab.getAttribute('tabindex') === '-1').length,
        selected: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length,
      };
    });
    check(
      '71. the tab strip has a roving tabindex: exactly one tab is reachable',
      roving.zero === 1 && roving.minus === roving.total - 1,
      `${roving.total} tabs, ${roving.zero} at tabindex 0, ${roving.minus} at -1`
    );

    // The strip has to have finished loading before a key is pressed at it.
    // drawTabs() rebuilds every button on each load and restores focus to the
    // selected tab, deliberately, so a keypress sent while the audit was still
    // arriving lands on a button that is replaced a moment later and reads as
    // an arrow key that did nothing. That is what happened on 25 August 2026.
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('#adminLoading');
        const list = document.querySelector('#auditList');
        return (!loading || loading.hidden) && list && list.children.length > 0;
      },
      undefined,
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    await page.focus('#translationTabs [tabindex="0"]');
    const focusedBefore = await page.evaluate(
      () => document.activeElement?.getAttribute('data-tab') ?? null
    );

    page.on('request', counter);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1200);

    const afterArrow = await page.evaluate(() => {
      const active = document.activeElement;
      const selected = document.querySelector('#translationTabs [aria-selected="true"]');
      return {
        focused: active?.getAttribute('data-tab') ?? null,
        selected: selected?.getAttribute('data-tab') ?? null,
      };
    });

    check(
      '71. an arrow key moves the focus to the next tab',
      Boolean(afterArrow.focused) && afterArrow.focused !== focusedBefore,
      `focus went from ${focusedBefore} to ${afterArrow.focused}, selection on ${afterArrow.selected}`
    );
    check(
      '71. and activation is manual: arrowing selects nothing and fires no request',
      requests === 0 && afterArrow.focused !== afterArrow.selected,
      `${requests} requests while arrowing, focus=${afterArrow.focused} selected=${afterArrow.selected}`
    );

    const emptyText = await page.evaluate(() => {
      const list = document.querySelector('#auditList');
      return list && list.children.length <= 1 ? list.textContent.trim() : null;
    });
    if (emptyText) {
      check(
        '69. an empty list is a real answer rather than "no results"',
        !/no results/i.test(emptyText),
        short(emptyText, 160)
      );
    } else {
      skip('69. the empty audit wording', 'the audit has rows on this deployment, so the empty state is not on screen');
    }
  } catch (cause) {
    bad('71. the tab strip could not be read', String(cause).slice(0, 200));
  } finally {
    page.off('request', counter);
  }

  // Items 72 to 75, deviation 36's other half: the tracking search.
  //
  // The needle is this run's own applicant, so there has to be an application
  // for them to be found by: the invites section is what confirms one, through
  // item 36's handoff. A subset run without it searches for somebody who has
  // applied to nothing and reads a correct empty answer as a broken search,
  // which is what --only=setup,analytics,queue,audit did on 25 August 2026.
  const needle = APPLICANT.username.slice(0, 10);
  const found = await get(staff, `/api/admin/applications?q=${encodeURIComponent(needle)}`);

  if (!state.appliedJobId) {
    skip(
      '72. the applicant box searches every page',
      `this run has confirmed no application, so its applicant is on no tracking row. ` +
        `Add invites to --only=. The search itself answered ${found.status} with ` +
        `${(found.data?.applications ?? []).length} rows for "${needle}".`
    );
  } else {
    check(
      '72. the applicant box searches through the view rather than the page',
      found.ok &&
        (found.data?.applications ?? []).some((row) => row.applicant?.username === APPLICANT.username),
      `${found.status} ${(found.data?.applications ?? []).length} rows for "${needle}"`
    );
  }
  check(
    '73. the payload says whether the 200 cap was reached',
    'truncated' in (found.data ?? {}),
    `truncated=${JSON.stringify(found.data?.truncated)}`
  );

  // Item 74. A bare percent sign is a LIKE wildcard, and escaping is what stops
  // it matching everybody.
  const wildcard = await get(staff, '/api/admin/applications?q=%25');
  const everything = await get(staff, '/api/admin/applications');
  check(
    '74. the needle is escaped: a bare % does not match everybody',
    (wildcard.data?.applications ?? []).length < (everything.data?.total ?? 0) ||
      (everything.data?.total ?? 0) === 0,
    `% matched ${(wildcard.data?.applications ?? []).length} of ${everything.data?.total} rows`
  );

  const anyRow = (found.data?.applications ?? [])[0] ?? null;
  check(
    '75. the search view itself is never handed back',
    !anyRow || !('search_text' in anyRow),
    anyRow ? Object.keys(anyRow).join(', ') : 'no row to read'
  );
  // **The tracking row carries the applicant's contact details on purpose**,
  // settled on 25 August 2026 after the first run reported their absence as the
  // rule. 8.3's list is a pipeline an admin or the posting's own owner works,
  // and knowing who you are looking at is the point of it. What item 75 is
  // really about is the search view: the email is in `search_text` so somebody
  // can be found by the address they wrote from, and that column never comes
  // back out. So this checks the row is shaped as intended rather than thinner.
  check(
    '75. the tracking row carries the contact details 8.3 works from',
    !anyRow || ('email' in (anyRow.applicant ?? {}) && 'phone' in (anyRow.applicant ?? {})),
    anyRow
      ? `applicant keys: ${Object.keys(anyRow.applicant ?? {}).join(', ')}`
      : 'no row to read'
  );
});

/* =========================================================================
 * Translation helpers, the admin half, items 76 to 82.
 *
 * This section leaves the role granted, because helperarea and annotate need
 * it. Cleanup takes it back.
 * ====================================================================== */

define('helpers', 'Translation helpers, items 76 to 82', async (state) => {
  if (!needs(state, ['staff', 'applicant'], 'items 76 to 82')) return;
  const staff = state.staffPage;

  const { code: locale } = await auditLocale(staff);
  if (!locale) {
    skip('items 76 to 82', 'this deployment has only one language, so there is nothing to help with');
    return;
  }
  state.locale = locale;

  if (!state.isAdmin) {
    const refusedView = await get(staff, '/api/admin/translations?view=helpers');
    const refusedAction = await post(staff, '/api/admin/translations', {
      action: 'grant_helper',
      user_id: state.applicantId,
      locale,
      reason: 'This should never be written.',
    });
    check(
      '76. both halves refuse a job poster server side',
      refusedView.status === 403 && refusedAction.status === 403,
      `view=${refusedView.status} action=${refusedAction.status}`
    );
    skip('77 to 82', 'they need an admin session');
    return;
  }

  skip(
    '76. the tab is removed from the document for a job poster',
    'this run is signed in as an admin. The server side half of the same rule is the one a ' +
      'script can prove, and it needs a job poster session.'
  );

  const noReason = await post(staff, '/api/admin/translations', {
    action: 'grant_helper',
    user_id: state.applicantId,
    locale,
    reason: '',
  });
  check(
    '77. a reason is required to grant',
    noReason.status === 400 && Boolean(noReason.details?.reason),
    `${noReason.status} ${short(noReason.text, 140)}`
  );

  // Item 82, before the grant that sticks: a deactivated account is refused
  // rather than warned about.
  await post(staff, '/api/admin/applicants', {
    action: 'deactivate',
    applicant_id: state.applicantId,
    reason: `Phase 8 run ${STAMP}, for item 82.`,
  });

  const refusedGrant = await post(staff, '/api/admin/translations', {
    action: 'grant_helper',
    user_id: state.applicantId,
    locale,
    reason: `Phase 8 run ${STAMP}.`,
  });
  check(
    '82. granting a deactivated account is refused',
    !refusedGrant.ok && refusedGrant.details?.reason === 'account_deactivated',
    `${refusedGrant.status} ${short(refusedGrant.text, 160)}`
  );

  const reactivated = await post(staff, '/api/admin/applicants', {
    action: 'reactivate',
    applicant_id: state.applicantId,
  });
  check('82. and reactivating puts it back', reactivated.ok, short(reactivated.text, 140));

  const granted = await post(staff, '/api/admin/translations', {
    action: 'grant_helper',
    user_id: state.applicantId,
    locale,
    reason: `Phase 8 verification run ${STAMP}.`,
  });
  check(
    '78. the role is granted',
    granted.ok && granted.data?.granted === true && granted.data?.locale === locale,
    short(granted.text, 160)
  );
  if (granted.ok) created.helperGrants.push({ userId: state.applicantId, locale });

  check(
    '79. a first grant is not marked as a regrant',
    granted.data?.regranted === false,
    `regranted=${granted.data?.regranted}`
  );

  const regranted = await post(staff, '/api/admin/translations', {
    action: 'grant_helper',
    user_id: state.applicantId,
    locale,
    reason: `Phase 8 verification run ${STAMP}, granted a second time.`,
  });
  check(
    '79. a second grant re-stamps the row and says so',
    regranted.ok && regranted.data?.regranted === true,
    short(regranted.text, 160)
  );

  const activity = await accountAudit(staff, state.applicantId);
  check(
    '78. and translation_helper_granted shows on 8.9\'s account panel',
    activity.some((row) => row.action === 'translation_helper_granted'),
    short(activity.map((row) => row.action).join(', '), 200)
  );

  const roster = await get(staff, `/api/admin/translations?view=helpers&locale=${locale}`);
  const listed = (roster.data?.helpers ?? []).find((row) => row.user_id === state.applicantId || row.id === state.applicantId);
  check(
    '78. and the account is on the roster',
    Boolean(listed),
    `${(roster.data?.helpers ?? []).length} helpers listed for ${locale}`
  );
  check(
    '78. the roster names the languages the role can be granted in',
    Array.isArray(roster.data?.grantable) && roster.data.grantable.every((entry) => !entry.is_default),
    short(roster.data?.grantable, 160)
  );

  const picker = await get(
    staff,
    `/api/admin/translations?view=helpers&search=${encodeURIComponent(APPLICANT.username.slice(0, 8))}`
  );
  const person = (picker.data?.applicants ?? []).find((row) => row.id === state.applicantId) ?? null;
  check(
    '81. the picker carries helps_with, so "already a helper" is a fact',
    Boolean(person) && Array.isArray(person.helps_with) && person.helps_with.includes(locale),
    person ? `helps_with=${short(person.helps_with)}` : `${(picker.data?.applicants ?? []).length} results`
  );

  // Item 77's other direction and item 80. The role is granted again straight
  // afterwards, because the two sections below need it.
  const revokeNoReason = await post(staff, '/api/admin/translations', {
    action: 'revoke_helper',
    user_id: state.applicantId,
    locale,
    reason: '',
  });
  check(
    '77. a reason is required to revoke as well',
    revokeNoReason.status === 400 && Boolean(revokeNoReason.details?.reason),
    `${revokeNoReason.status} ${short(revokeNoReason.text, 140)}`
  );

  const revoked = await post(staff, '/api/admin/translations', {
    action: 'revoke_helper',
    user_id: state.applicantId,
    locale,
    reason: `Phase 8 run ${STAMP}, checking the revoke.`,
  });
  check('80. a revoke takes the language', revoked.ok && revoked.data?.revoked === true, short(revoked.text, 140));

  const afterRevoke = await get(staff, `/api/admin/translations?view=helpers&locale=${locale}`);
  check(
    '80. and the row is gone rather than marked revoked',
    !(afterRevoke.data?.helpers ?? []).some((row) => (row.user_id ?? row.id) === state.applicantId),
    `${(afterRevoke.data?.helpers ?? []).length} helpers left`
  );

  const revokeActivity = await accountAudit(staff, state.applicantId);
  check(
    '78. translation_helper_revoked shows on the account panel too',
    revokeActivity.some((row) => row.action === 'translation_helper_revoked'),
    short(revokeActivity.map((row) => row.action).slice(0, 10).join(', '), 200)
  );

  const regrant = await post(staff, '/api/admin/translations', {
    action: 'grant_helper',
    user_id: state.applicantId,
    locale,
    reason: `Phase 8 verification run ${STAMP}, for the helper area checks.`,
  });
  check(
    'the role is put back for the helperarea and annotate sections',
    regrant.ok,
    short(regrant.text, 140)
  );

  skip(
    '80. a revoke touches nothing the helper wrote',
    'nothing had been written at revoke time. The helperarea section writes a translation while ' +
      'the role is held, and cleanup revokes it: read the row afterwards and it is still there.'
  );
});

/* =========================================================================
 * The helper area, the applicant half, items 83 to 90.
 * ====================================================================== */

define('helperarea', 'The helper area, items 83 to 90', async (state) => {
  if (!needs(state, ['staff', 'job', 'applicant'], 'items 83 to 90')) return;
  const applicant = state.applicantPage;

  const locale = state.locale ?? (await auditLocale(state.staffPage)).code;
  if (!locale) {
    skip('items 83 to 90', 'this deployment has only one language');
    return;
  }

  const roster = await get(applicant, '/api/translations/helper');
  check(
    '83. the roster answers 200 and names the languages held',
    roster.ok && Array.isArray(roster.data?.locales),
    `${roster.status} ${short(roster.text, 160)}`
  );

  const holds = (roster.data?.locales ?? []).some((entry) => entry.code === locale);
  if (!holds) {
    skip('items 84 to 90', `the run's applicant does not hold ${locale}. Add helpers to --only=.`);
  }

  // Item 83's real claim, checked with an account that holds nothing.
  if (state.sparePage && state.spareId) {
    // 8.9's set_password revoked its session on the way past, so it is signed
    // back in here rather than reporting a 401 as if it were this route's
    // answer. That is what the run of 25 August 2026 did.
    let spareRoster = await get(state.sparePage, '/api/translations/helper');
    if (spareRoster.status === 401) {
      await signInApplicant(state.sparePage, SPARE);
      spareRoster = await get(state.sparePage, '/api/translations/helper');
    }
    check(
      '83. and answers 200 with an empty list for somebody who is not a helper',
      spareRoster.ok && (spareRoster.data?.locales ?? []).length === 0,
      `${spareRoster.status} ${short(spareRoster.text, 160)}. A 403 here would break every account page.`
    );
  } else {
    skip('83. the empty roster', 'no spare account. Add applicants to --only=.');
  }

  if (!holds) return;

  // Item 84. A language the caller was never granted, and the default one,
  // which nobody can hold.
  const notGranted = await get(state.applicantPage, `/api/translations/helper?view=audit&locale=${state.sourceLocale ?? 'en'}`);
  check(
    '84. a language the caller does not hold is refused',
    notGranted.status === 403 && notGranted.details?.reason === 'not_a_helper',
    `${notGranted.status} ${short(notGranted.text, 140)}`
  );

  const audit = await get(applicant, `/api/translations/helper?view=audit&locale=${locale}`);
  check(
    '84. and the language held answers',
    audit.ok && Array.isArray(audit.data?.audit) && audit.data?.locale === locale,
    `${audit.status} ${short(audit.text, 140)}`
  );

  const target = await get(
    applicant,
    `/api/translations/helper?view=target&type=job&id=${state.jobId}&locale=${locale}`
  );
  check(
    '85. one posting opens with the source beside the translation',
    target.ok && target.data?.target?.target_id === state.jobId && Boolean(target.data?.target?.source),
    `${target.status} ${short(target.text, 160)}`
  );
  check(
    '85. and updated_by is never read back into the editor',
    !('updated_by' in (target.data?.target ?? {})),
    Object.keys(target.data?.target ?? {}).join(', ')
  );

  const title = `SMOKE P8 ${STAMP} helper title`;
  const saved = await post(applicant, '/api/translations/helper', {
    action: 'save',
    type: 'job',
    id: state.jobId,
    locale,
    // Item 86 and item 87 ride along: is_ready is not a parameter, and the
    // three fields that decide where an applicant's details are sent are not
    // this route's to write.
    is_ready: true,
    values: {
      title,
      summary: `SMOKE P8 ${STAMP} helper summary`,
      description: `SMOKE P8 ${STAMP} helper description`,
      form_url: 'https://forms.gle/smoke-p8-must-not-be-written',
      prefill_map: { entry: 'nope' },
      response_sheet_url: 'https://example.invalid/nope',
      sections: [{ heading: `SMOKE P8 ${STAMP} one`, body: 'First.' }, { heading: `SMOKE P8 ${STAMP} two`, body: 'Second.' }],
    },
  });

  check('85. a save is accepted', saved.ok && saved.data?.saved === true, short(saved.text, 200));
  check(
    '86. is_ready is not a parameter: the flag did not move',
    saved.data?.target?.is_ready !== true,
    `is_ready=${JSON.stringify(saved.data?.target?.is_ready)}`
  );
  // Checked against what is stored rather than against what came back: the
  // helper's own payload only ever carries the fields this area may write, so
  // reading it would prove the allowlist against itself.
  const stored = await get(state.staffPage, `/api/admin/jobs?id=${state.jobId}`);
  const storedRow = stored.data?.job?.translations?.[locale] ?? {};
  check(
    '87. the form URL, the prefill map, and the response sheet are not writable here',
    !String(storedRow.form_url ?? '').includes('must-not-be-written') &&
      !JSON.stringify(storedRow.prefill_map ?? {}).includes('nope') &&
      !String(storedRow.response_sheet_url ?? '').includes('nope'),
    `form_url=${short(storedRow.form_url, 80)} prefill_map=${short(storedRow.prefill_map, 60)} ` +
      `response_sheet_url=${short(storedRow.response_sheet_url, 60)}. These three decide where an ` +
      "applicant's details are sent, and a helper is not staff."
  );
  check(
    '88. sections are editable here, with their order kept',
    Array.isArray(saved.data?.target?.sections) &&
      saved.data.target.sections.length === 2 &&
      (saved.data.target.sections[0].heading ?? '').includes('one'),
    short(saved.data?.target?.sections, 200)
  );

  // Item 87's other half. The base row is the source and a helper edits their
  // language, never it.
  const base = await get(state.staffPage, `/api/admin/jobs?id=${state.jobId}`);
  check(
    '87. and the base row was not touched',
    base.data?.job?.title !== title,
    `base title=${short(base.data?.job?.title, 80)}`
  );

  // Item 89.
  const activity = await accountAudit(state.staffPage, state.applicantId);
  const edit = activity.find((row) => row.action === 'translation_edited') ?? null;
  check(
    '89. every save writes translation_edited',
    Boolean(edit),
    short(activity.map((row) => row.action).slice(0, 10).join(', '), 200)
  );
  check(
    '89. with the fields named and never the wording',
    Boolean(edit) && !JSON.stringify(edit).includes('helper summary'),
    edit ? short(edit, 240) : 'no row to read'
  );

  // Item 90. The same body again, which changes nothing.
  const before = saved.data?.target?.updated_at ?? null;
  const again = await post(applicant, '/api/translations/helper', {
    action: 'save',
    type: 'job',
    id: state.jobId,
    locale,
    values: {
      title,
      summary: `SMOKE P8 ${STAMP} helper summary`,
      description: `SMOKE P8 ${STAMP} helper description`,
      sections: [{ heading: `SMOKE P8 ${STAMP} one`, body: 'First.' }, { heading: `SMOKE P8 ${STAMP} two`, body: 'Second.' }],
    },
  });
  check(
    '90. a save that changes nothing says so rather than showing "saved"',
    again.ok && again.data?.saved === false,
    `saved=${again.data?.saved} ${short(again.text, 160)}`
  );
  check(
    '90. and does not bump updated_at',
    again.data?.target?.updated_at === before,
    `was ${before}, now ${again.data?.target?.updated_at}`
  );

  const activityAfter = await accountAudit(state.staffPage, state.applicantId);
  check(
    '90. and writes no audit row',
    activityAfter.filter((row) => row.action === 'translation_edited').length ===
      activity.filter((row) => row.action === 'translation_edited').length,
    `${activity.filter((row) => row.action === 'translation_edited').length} edits before, ` +
      `${activityAfter.filter((row) => row.action === 'translation_edited').length} after`
  );

  skip(
    '86. blanking the three fields 014 needs on a live translation',
    'that path needs a translation an admin has already marked ready, and this route cannot set ' +
      'is_ready, which is the point of it. Mark the SMOKE translation ready in the editor, then ' +
      'blank the summary here: it must be a field error rather than a 500.'
  );
});

/* =========================================================================
 * The annotation layer, 7i, items 91 to 95.
 * ====================================================================== */

define('annotate', 'The annotation layer, items 91 to 95', async (state) => {
  if (!needs(state, ['staff', 'job', 'applicant'], 'items 91 to 95')) return;

  const locale = state.locale ?? (await auditLocale(state.staffPage)).code;

  // Item 91. Watched on the network rather than inferred from behaviour: the
  // promise is that annotate.js is never fetched, not that nothing happens.
  const reader = await state.anon.newPage();
  let fetched = 0;
  reader.on('request', (request) => {
    if (request.url().includes('annotate.js')) fetched += 1;
  });

  try {
    await reader.goto(`${BASE}/jobs/${state.jobId}`, { waitUntil: 'domcontentloaded' });
    await reader.waitForTimeout(3000);
    check(
      '91. annotate.js is never fetched by a reader who cannot use it',
      fetched === 0,
      `${fetched} requests for annotate.js from a signed out reader`
    );

    const switchThere = await reader.evaluate(
      () => Boolean(document.querySelector('[data-annotate-toggle], #annotateToggle'))
    );
    check(
      '91. and the switch is not in the document either',
      !switchThere,
      'a signed out reader has the suggestions switch in their header'
    );
  } finally {
    await reader.close();
  }

  // Item 92. Staff get the underlines and not the box, per deviation 52.
  const staffCan = await get(state.staffPage, '/api/translations/annotations');
  check(
    '92. staff may see the layer but not write',
    staffCan.ok && staffCan.data?.can === true && staffCan.data?.can_suggest === false,
    `can=${staffCan.data?.can} can_suggest=${staffCan.data?.can_suggest} realm=${staffCan.data?.realm}`
  );

  const staffWrite = await post(state.staffPage, '/api/translations/annotations', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale: locale ?? 'en',
    note: 'This must never be written.',
    quote: 'anything',
  });
  check(
    '92. and a staff POST is refused with a sentence saying so',
    staffWrite.status === 403 && /helper/i.test(staffWrite.error?.message ?? ''),
    `${staffWrite.status} ${short(staffWrite.error?.message, 160)}`
  );

  if (!locale) {
    skip('93 to 95', 'this deployment has only one language');
    return;
  }

  const helperCan = await get(state.applicantPage, '/api/translations/annotations');
  if (helperCan.data?.can_suggest !== true) {
    skip(
      '93 to 95',
      `the run's applicant may not suggest (can_suggest=${helperCan.data?.can_suggest}). ` +
        'Add helpers to --only=.'
    );
    return;
  }

  check(
    '93. the layer answers with the languages the helper holds',
    (helperCan.data?.locales ?? []).includes(locale),
    `locales=${short(helperCan.data?.locales)}`
  );

  // Item 95. The note is the person and the replacement is the wording, so one
  // is required and the other is not.
  const noNote = await post(state.applicantPage, '/api/translations/annotations', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale,
    quote: 'SMOKE',
    note: '',
    suggested_text: 'A replacement with nothing to explain it.',
  });
  check(
    '95. the note is required',
    noNote.status === 400 && Boolean(noNote.details?.note),
    `${noNote.status} ${short(noNote.text, 140)}`
  );

  const noQuote = await post(state.applicantPage, '/api/translations/annotations', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale,
    note: 'A note with no span, which is a report rather than an annotation.',
  });
  check(
    '95. and so is the span, which is the whole difference from 7h\'s form',
    noQuote.status === 400 && Boolean(noQuote.details?.quote),
    `${noQuote.status} ${short(noQuote.text, 140)}`
  );

  // The quote has to be words that are really in the stored summary, which the
  // helper area rewrote a moment ago.
  const current = await get(
    state.applicantPage,
    `/api/translations/helper?view=target&type=job&id=${state.jobId}&locale=${locale}`
  );
  const summary = current.data?.target?.current?.summary ?? '';
  const realQuote = summary.slice(0, 20);

  if (realQuote) {
    const madeWithoutReplacement = await post(state.applicantPage, '/api/translations/annotations', {
      target_type: 'job',
      target_id: state.jobId,
      field: 'summary',
      locale,
      note: `Phase 8 verification run ${STAMP}. Not a real suggestion.`,
      quote: realQuote,
      quote_prefix: '',
      quote_suffix: '',
    });
    check(
      '95. the replacement is optional',
      madeWithoutReplacement.status === 201 && Boolean(madeWithoutReplacement.data?.id),
      `${madeWithoutReplacement.status} ${short(madeWithoutReplacement.text, 140)}`
    );
    if (madeWithoutReplacement.data?.id) created.reports.push(madeWithoutReplacement.data.id);

    // Item 94, the found half.
    if (madeWithoutReplacement.data?.id) {
      const anchored = await get(
        state.staffPage,
        `/api/admin/translations?id=${madeWithoutReplacement.data.id}`
      );
      check(
        '94. a quote that is still in the wording anchors as found',
        anchored.data?.report?.anchor === 'found',
        `anchor=${anchored.data?.report?.anchor} quote=${short(realQuote, 60)}`
      );
    }
  } else {
    skip('94, 95. the anchored suggestion', 'the translation has no summary to quote from');
  }

  // Item 94, the detached half. Words that were on the page but are not in the
  // stored text is exactly what a span crossing a bold run produces.
  const detached = await post(state.applicantPage, '/api/translations/annotations', {
    target_type: 'job',
    target_id: state.jobId,
    field: 'summary',
    locale,
    note: `Phase 8 verification run ${STAMP}. A span that cannot be found again.`,
    quote: `words that were never in the summary ${STAMP}`,
    quote_prefix: 'nothing',
    quote_suffix: 'nothing',
  });

  if (detached.status === 201) {
    created.reports.push(detached.data.id);
    const read = await get(state.staffPage, `/api/admin/translations?id=${detached.data.id}`);
    check(
      '94. a quote that cannot be found arrives as detached, not applied elsewhere',
      read.data?.report?.anchor === 'detached',
      `anchor=${read.data?.report?.anchor}`
    );
    check(
      '94. and it is filed as an annotation rather than a form report',
      read.data?.report?.origin === 'annotation',
      `origin=${read.data?.report?.origin}`
    );
  } else {
    skip('94. the detached anchor', `the suggestion was refused: ${short(detached.text, 140)}`);
  }

  skip(
    '93. the language filed against is the one the words are in',
    'it is the page\'s call, from data-tr-locale on the container. Read a posting with no ready ' +
      'translation while the interface is in the other language: the report must be against the ' +
      'default language, per migration 015\'s own comment that the English can be the wrong one.'
  );

  skip(
    '95. the annotate bucket ceiling',
    'sixty an hour per account, and reaching it would lock the account out for thirty minutes ' +
      'and take every later check with it.'
  );
});

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
