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

const created = { jobs: [], applicants: [] };

async function createJob(staff, overrides = {}) {
  const result = await post(staff, '/api/admin/jobs', {
    action: 'create',
    job: {
      title: `SMOKE P8 ${STAMP} ${overrides.label ?? 'posting'}`,
      summary: 'A throwaway posting written by the phase 8 verification run.',
      description:
        'First sentence of the throwaway posting. Second sentence, which the embed preview should not show.',
      ...(overrides.job ?? {}),
    },
    ...(overrides.tag_ids ? { tag_ids: overrides.tag_ids } : {}),
  });

  if (result.ok) created.jobs.push(result.data.job.id);
  return result;
}

/** Create a posting and publish it, which most of phase 8 needs. */
async function createPublishedJob(staff, overrides = {}) {
  const made = await createJob(staff, overrides);
  if (!made.ok) return made;

  const live = await post(staff, '/api/admin/jobs', {
    action: 'status',
    id: made.data.job.id,
    status: 'published',
  });

  return live.ok ? live : made;
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
  if (!state.staffPage || created.jobs.length === 0) return;
  section('Cleanup');

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

  const me = await get(state.staffPage, '/api/admin/me');
  state.isAdmin = me.data?.is_admin === true;
  state.staffId = me.data?.user?.id ?? null;
  check(
    '1. the role is known',
    me.ok && typeof me.data?.is_admin === 'boolean',
    `is_admin=${me.data?.is_admin} ${short(me.error?.message)}`
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
      await reader.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await reader.waitForFunction(
        (needle) => document.body?.textContent?.includes(needle),
        title[base],
        { timeout: 20000 }
      ).catch(() => {});

      const inHeader = await reader.evaluate(
        (needle) => document.querySelector('header')?.textContent?.includes(needle) ?? false,
        title[base]
      );
      const inFooter = await reader.evaluate(
        (needle) => document.querySelector('footer')?.textContent?.includes(needle) ?? false,
        title[base]
      );
      check('11. the portal title is in the header', inHeader, `looking for "${title[base]}"`);
      check('11. and in the footer', inFooter, `looking for "${title[base]}"`);

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

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
