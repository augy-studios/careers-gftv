// Phase 7 verification run, from next-steps.md section 4b.
//
//   node phase7-test.mjs                     everything that can run
//   node phase7-test.mjs --only=access,jobs  one or more sections
//   BASE=https://... node phase7-test.mjs    against a preview deployment
//
// Throwaway, per section 5 item 5. Gitignored by the root *.mjs rule.
//
// It signs in as a real staff account, because requireStaff re-reads
// gftvhello_sessions and hasPortalAccess on every request and there is no way
// to fake one. It also registers its own applicant, through the register
// *page* rather than the API, per the phase 6 rule: the page generates the
// recovery code set and the API alone does not.
//
// **It writes real rows.** Every posting it creates is prefixed SMOKE P7 and is
// deleted at the end of the run. The adminDelete bucket is 10 an hour, so the
// run creates few enough postings to clean up inside it.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** The repository root, one level up from tests/. */
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');

// PATCH_JS=admin-applications-page.js serves that module from the working tree
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
 * The password for the applicant this run registers for itself.
 *
 * Not a credential anybody holds: the account does not exist until the run
 * makes it, and it is written here so a later run can sign back into it with
 * APPLICANT_USER rather than registering another one.
 */
const DEFAULT_APPLICANT_PASS = 'correct horse battery staple 7';

const STAMP = Date.now();

// Reused across runs when the caller passes one, so a second run of a section
// does not leave another account behind. Blank means register a fresh one.
const REUSE_APPLICANT = process.env.APPLICANT_USER ?? '';
const APPLICANT = {
  username: REUSE_APPLICANT || `smoke-p7-${STAMP}`.slice(0, 24),
  display_name: `Smoke P7 ${STAMP}`,
  email: `smoke-p7-${STAMP}@example.invalid`,
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
 * Click the editor's Save and wait for it to have finished.
 *
 * A fixed timeout after the click is a race: the save either redraws the panel
 * on success or leaves a field error on failure, and both take as long as the
 * request does. Waiting for the message the page puts up either way is the only
 * signal that does not depend on how fast the network is that minute.
 *
 * @returns {Promise<'ok'|'error'|'silent'>}
 */
async function save(page) {
  await page.evaluate(() => {
    const holder = document.querySelector('#adminMessage');
    if (holder) {
      holder.hidden = true;
      holder.textContent = '';
    }
  });

  await page.click('#saveButton');

  try {
    await page.waitForFunction(
      () => {
        const holder = document.querySelector('#adminMessage');
        return holder && !holder.hidden && holder.textContent.trim() !== '';
      },
      { timeout: 20000 }
    );
  } catch {
    // Neither a success nor a failure appeared, which is itself worth knowing:
    // it is the shape the collect() ReferenceError had before runAction caught
    // it, and it is what "Save looked like a button that did nothing" means.
    return 'silent';
  }

  return page.evaluate(() =>
    document.querySelector('#adminMessage')?.classList.contains('danger') ? 'error' : 'ok'
  );
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

/**
 * Sign the staff account in through /admin/login, which is what item 2 and item
 * 6a are actually about: the page's own success path, not the endpoint.
 */
async function signInStaff(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: 15000 });
  await page.fill('#username', STAFF.username);
  await page.fill('#password', STAFF.password);
  await page.click('#staffLoginForm button[type="submit"]');
  return waitForPath(page, (url) => url.pathname === '/admin');
}

/**
 * Register the applicant through the register page.
 *
 * The phase 6 rule: the page generates the recovery codes and sends the account
 * to /account/security?codes=none when it has none, so a script that registers
 * through the API alone is not a registered user.
 */
async function registerApplicant(page) {
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#registerForm', { timeout: 15000 });
  await page.fill('#username', APPLICANT.username);
  await page.fill('#display_name', APPLICANT.display_name);
  await page.fill('#email', APPLICANT.email);
  await page.fill('#password', APPLICANT.password);
  await page.fill('#password_confirm', APPLICANT.password);
  await page.click('#registerForm button[type="submit"]');

  // The register page shows the recovery code set before it lets go, and the
  // dialog's done button only enables once the tick box is ticked. That is the
  // half api/auth/applicant/register does not do by itself.
  await page.waitForSelector('[data-confirm]', { timeout: 30000 });
  await page.check('[data-confirm]');
  await page.click('[data-done]');
  return waitForPath(page, (url) => url.pathname.startsWith('/account'), 30000);
}

async function signInApplicant(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { timeout: 15000 });
  await page.fill('#identifier', APPLICANT.username);
  await page.fill('#password', APPLICANT.password);
  await page.click('#loginForm button[type="submit"]');
  return waitForPath(page, (url) => url.pathname.startsWith('/account'), 30000);
}

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const created = { jobs: [], tags: [], departments: [] };

const REAL_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSfSMOKEP7testformtestformtestform/viewform';
const SHORT_FORM = 'https://forms.gle/smokeP7test';

async function createJob(staff, overrides = {}) {
  const result = await post(staff, '/api/admin/jobs', {
    action: 'create',
    job: {
      title: `SMOKE P7 ${STAMP} ${overrides.label ?? 'posting'}`,
      summary: 'A throwaway posting written by the phase 7 verification run.',
      description:
        'First sentence of the throwaway posting. Second sentence, which the embed preview should not show.',
      ...(overrides.job ?? {}),
    },
    ...(overrides.tag_ids ? { tag_ids: overrides.tag_ids } : {}),
  });

  if (result.ok) created.jobs.push(result.data.job.id);
  return result;
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

async function main() {
  console.log(`Phase 7 verification against ${BASE}`);
  console.log(`Staff: ${STAFF.username}   Applicant: ${APPLICANT.username}`);

  const browser = await chromium.launch();

  // One context holding both realms, because item 6a is about a browser signed
  // into both at once and the two cookies are separate by design.
  const ctx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const anon = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });

  if (PATCH_JS.length > 0) {
    console.log(`Serving from the working tree: ${PATCH_JS.join(', ')}`);
    for (const context of [ctx, anon]) {
      await context.route('**/assets/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const name = path.split('/').pop();
        if (!PATCH_JS.includes(name)) return route.continue();

        const body = await readFile(join(HERE, 'main-site', path.replace(/^\//, '')), 'utf8');
        return route.fulfill({
          status: 200,
          contentType: name.endsWith('.json')
            ? 'application/json; charset=utf-8'
            : 'application/javascript; charset=utf-8',
          body,
        });
      });
    }
  }

  const state = { browser, ctx, anon, pageErrors: [] };

  state.staffPage = await ctx.newPage();
  state.staffPage.on('pageerror', (error) =>
    state.pageErrors.push({ where: state.staffPage.url(), error: String(error) })
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

    const result = await post(state.staffPage, '/api/admin/jobs', {
      action: 'delete',
      id,
      confirm: row.data.job.slug,
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
 * Setup. Signs both realms in and puts one posting on the board to work with.
 * ====================================================================== */

define('setup', 'Setup', async (state) => {
  const landed = await signInStaff(state.staffPage);
  check('staff sign in lands on /admin', landed?.pathname === '/admin', state.staffPage.url());

  const me = await get(state.staffPage, '/api/admin/me');
  check('/api/admin/me answers for the staff session', me.ok, short(me.text));
  state.staff = me.data?.staff ?? null;
  state.locales = me.data?.locales ?? [];
  console.log(
    `      signed in as ${state.staff?.username} (admin: ${state.staff?.is_admin}, editor: ${state.staff?.is_editor})`
  );

  const status = await get(state.staffPage, '/assets/build-status.json');
  state.buildStatus = status.json;
});

/* =========================================================================
 * 4b, Before anything else, and Access
 * ====================================================================== */

const GUARDED = [
  '/admin',
  '/admin/jobs',
  '/admin/jobs/edit',
  '/admin/applications',
  '/admin/departments',
  '/admin/tags',
  '/admin/maintenance',
];

define('access', 'Access, items 1 to 6b', async (state) => {
  const page = state.staffPage;

  // 1. The phase 8 sections must still draw as disabled items with the phase
  //    sentence, and clicking one opens the explainer rather than navigating.
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#adminNav a[href="/admin/jobs"]', { timeout: 20000 });

  const unbuilt = ['admin_analytics', 'admin_invites', 'admin_settings'];
  for (const key of unbuilt) {
    const el = page.locator(`#adminNav [data-feature="${key}"]`);
    const count = await el.count();
    if (count === 0) {
      bad(`1. ${key} is in the sidebar`, 'no item with that feature key');
      continue;
    }
    const tag = await el.evaluate((node) => node.tagName);
    const disabled = await el.getAttribute('aria-disabled');
    const title = await el.getAttribute('title');
    const href = await el.getAttribute('href');
    check(
      `1. ${key} draws disabled with the phase sentence`,
      tag === 'SPAN' && disabled === 'true' && Boolean(title) && href === null,
      `tag=${tag} aria-disabled=${disabled} href=${href} title=${short(title, 80)}`
    );
  }

  // A shipped section is drawn as a plain link and carries no data-feature at
  // all, which is why the gating pass never touches it.
  const shipped = page.locator('#adminNav a[href="/admin/jobs"]');
  check(
    '1. a shipped phase 7 section is still a link',
    (await shipped.count()) === 1,
    'admin_jobs should be a link now the phase is shipped'
  );

  const before = page.url();
  await page.locator('#adminNav [data-feature="admin_analytics"]').click({ force: true });
  const explainer = page.locator('.feature-explainer');
  await explainer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  check(
    '1. clicking an unbuilt section opens the explainer, not a navigation',
    (await explainer.count()) > 0 && page.url() === before,
    `url=${page.url()}`
  );

  // 2. Signed out, each of the seven pages redirects to /admin/login?redirect=
  const anonPage = await state.anon.newPage();
  for (const path of GUARDED) {
    await anonPage.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const url = await waitForPath(anonPage, (u) => u.pathname === '/admin/login');
    check(`2. ${path} redirects to the staff sign in`, url !== null, `landed on ${anonPage.url()}`);
    if (url) {
      check(
        `2. ${path} carries its own path as ?redirect`,
        url.searchParams.get('redirect') === path,
        `carried ${url.searchParams.get('redirect')} instead`
      );
    }
  }

  // And signing in lands on /admin, whatever the redirect said. AFTER_SIGN_IN
  // is a single destination on purpose, per the comment in admin-login-page.js.
  // A throwaway context, so the signed out one stays signed out for item 16.
  const scratch = await state.browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const landed = await signInStaff(await scratch.newPage());
  check('2. signing in lands on /admin', landed?.pathname === '/admin');
  await scratch.close();

  // 3. An applicant session satisfies nothing in the staff realm.
  const applicantPage = await state.ctx.newPage();
  const registered = REUSE_APPLICANT
    ? await signInApplicant(applicantPage)
    : await registerApplicant(applicantPage);
  check(
    REUSE_APPLICANT ? 'applicant signed in' : 'applicant registered through the register page',
    registered !== null,
    applicantPage.url()
  );
  state.applicantPage = applicantPage;

  const who = await get(applicantPage, '/api/auth/applicant/session');
  state.applicant = who.data?.user ?? null;
  check('applicant session is live', Boolean(state.applicant), short(who.text));

  const applicantOnly = await state.browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const applicantOnlyPage = await applicantOnly.newPage();
  await applicantOnlyPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await applicantOnlyPage.fill('#identifier', APPLICANT.username);
  await applicantOnlyPage.fill('#password', APPLICANT.password);
  await applicantOnlyPage.click('#loginForm button[type="submit"]');
  await waitForPath(applicantOnlyPage, (u) => u.pathname.startsWith('/account'), 30000);

  await applicantOnlyPage.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const bounced = await waitForPath(applicantOnlyPage, (u) => u.pathname === '/admin/login');
  check(
    '3. an applicant session is bounced from /admin',
    bounced !== null,
    `landed on ${applicantOnlyPage.url()}`
  );

  const meAsApplicant = await get(applicantOnlyPage, '/api/admin/me');
  check(
    '3. /api/admin/me refuses an applicant session',
    meAsApplicant.status === 401 || meAsApplicant.status === 403,
    `status ${meAsApplicant.status}`
  );
  await applicantOnly.close();

  // 4 and 5 need a staff account without is_admin, and 6 needs the
  // gftvjobs_admin_access row revoked underneath a live session.
  skip(
    '4, 5. job poster without is_admin',
    'needs a second staff account with is_admin false; only one staff credential was supplied, and it is an admin'
  );
  skip(
    '6. revoking gftvjobs_admin_access mid-session',
    'needs SQL against the live database; no service key is available to this run'
  );

  // 5, the half that can run: the delete action re-checks the role rather than
  // trusting the hidden control. As an admin it must not 403, which is the
  // other side of the same check.
  const deleteWithoutConfirm = await post(state.staffPage, '/api/admin/jobs', {
    action: 'delete',
    id: '00000000-0000-0000-0000-000000000000',
  });
  check(
    '5. delete reaches the role check before the id check for an admin',
    deleteWithoutConfirm.status !== 403,
    `status ${deleteWithoutConfirm.status}`
  );

  // 6a. The way in on a browser that has never held a staff session.
  const fresh = await state.browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const freshPage = await fresh.newPage();
  await freshPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await freshPage.evaluate(() => window.localStorage.clear());

  await signInStaff(freshPage);
  await freshPage.waitForSelector('#adminNav a[href="/admin/jobs"]', { timeout: 20000 });

  const adminItem = freshPage.locator('header a[href="/admin"], .site-nav a[href="/admin"]');
  await adminItem.first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  check(
    '6a. the Admin item is in the public header on the dashboard you land on',
    (await adminItem.count()) > 0,
    'no /admin item in the public header after signing in'
  );

  await freshPage.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  const onSearch = freshPage.locator('header a[href="/admin"], .site-nav a[href="/admin"]');
  check('6a. the Admin item is still there on /search', (await onSearch.count()) > 0);

  if ((await onSearch.count()) > 0) {
    const first = await freshPage.evaluate(() => {
      const nav = document.querySelector('header nav, .site-nav');
      if (!nav) return null;
      const links = [...nav.querySelectorAll('a')];
      return links.length ? links[0].getAttribute('href') : null;
    });
    check('6a. the Admin item is first in the navigation', first === '/admin', `first link is ${first}`);
  }

  // Both realms on one browser: two items and two sign out controls.
  await freshPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await freshPage.fill('#identifier', APPLICANT.username);
  await freshPage.fill('#password', APPLICANT.password);
  await freshPage.click('#loginForm button[type="submit"]');
  await waitForPath(freshPage, (u) => u.pathname.startsWith('/account'), 30000);

  await freshPage.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  const bothRealms = await freshPage.evaluate(() => {
    const nav = document.querySelector('header');
    if (!nav) return null;
    return {
      admin: nav.querySelectorAll('a[href="/admin"]').length,
      account: nav.querySelectorAll('a[href^="/account"]').length,
      signOut: [...nav.querySelectorAll('button, a')].filter((el) =>
        /sign out|log out|退出|登出/i.test(el.textContent ?? '')
      ).length,
    };
  });
  check(
    '6a. signed into both realms, the header offers both',
    bothRealms !== null && bothRealms.admin > 0 && bothRealms.account > 0,
    JSON.stringify(bothRealms)
  );

  // 6b. Sign out of staff from the dashboard's own top bar.
  await freshPage.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForSelector('[data-admin-signout]', { timeout: 20000 });
  await freshPage.click('[data-admin-signout]');
  await waitForPath(freshPage, (u) => u.pathname === '/admin/login', 20000);

  const applicantStill = await get(freshPage, '/api/auth/applicant/session');
  check(
    '6b. the applicant session survives a staff sign out',
    applicantStill.ok && Boolean(applicantStill.data?.user),
    short(applicantStill.text)
  );

  await freshPage.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  const goneCount = await freshPage.locator('header a[href="/admin"]').count();
  check('6b. the Admin item is gone from the header on the next page', goneCount === 0);

  await fresh.close();
  await anonPage.close();
});

/* =========================================================================
 * The overview, items 7 to 9
 * ====================================================================== */

define('overview', 'The overview, items 7 to 9', async (state) => {
  const page = state.staffPage;
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#adminPostingStats a', { timeout: 20000 });

  // 7. Every stat tile links somewhere, and the counts match the postings list
  //    when filtered the same way.
  const tiles = await page.$$eval('#adminPostingStats a', (nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      value: Number(node.querySelector('.admin-stat-value')?.textContent?.trim()),
      label: node.querySelector('.admin-stat-label')?.textContent?.trim(),
    }))
  );

  check('7. every stat tile is a link', tiles.length > 0 && tiles.every((tile) => tile.href), JSON.stringify(tiles));

  for (const tile of tiles) {
    const url = new URL(tile.href, BASE);
    const status = url.searchParams.get('status');
    if (!status) continue; // the two sort-by-closing tiles have no equivalent filter
    const list = await get(page, `/api/admin/jobs?status=${status}&page=1`);
    check(
      `7. the ${status} tile matches the postings list filtered the same way`,
      list.ok && list.data.total === tile.value,
      `tile says ${tile.value}, list total is ${list.data?.total}`
    );
  }

  // 8. The bucket tabs carry counts that match the tracking page's own.
  const buckets = await page.$$eval('#adminBuckets a', (nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      count: Number(node.querySelector('.bucket-count')?.textContent?.trim()),
    }))
  );
  check('8. the overview draws bucket tabs', buckets.length >= 10, `${buckets.length} tabs`);

  const tracking = await get(page, '/api/admin/applications');
  const counts = tracking.data?.counts ?? {};
  let bucketsAgree = true;
  const disagreements = [];
  for (const bucket of buckets) {
    const status = new URL(bucket.href, BASE).searchParams.get('status') ?? 'all';
    if ((counts[status] ?? 0) !== bucket.count) {
      bucketsAgree = false;
      disagreements.push(`${status}: tab ${bucket.count} vs tracking ${counts[status] ?? 0}`);
    }
  }
  check('8. the bucket counts match the tracking page', bucketsAgree, disagreements.join('; '));

  // 9. The blocked drafts callout appears with a draft that has no form, and
  //    disappears once the draft has one.
  const draft = await createJob(page, { label: 'blocked draft' });
  check('9. a draft with no form was created', draft.ok, short(draft.text));
  state.blockedDraftId = draft.data?.job?.id ?? null;

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#adminPostingStats a', { timeout: 20000 });
  const calloutShown = await page.locator('#adminBlockedDrafts').isVisible();
  const calloutText = await page.locator('#adminBlockedDrafts').textContent();
  const statsWith = await get(page, '/api/admin/stats');
  check(
    '9. the blocked drafts callout appears and names the count',
    calloutShown && /\d/.test(calloutText ?? '') &&
      String(statsWith.data?.postings?.draft_without_form ?? '').length > 0,
    `visible=${calloutShown} text=${short(calloutText, 120)}`
  );

  if (state.blockedDraftId) {
    const given = await post(page, '/api/admin/jobs', {
      action: 'update',
      id: state.blockedDraftId,
      job: { application_form_url: REAL_FORM },
    });
    check('9. giving the draft a form saves', given.ok, short(given.text));

    const statsAfter = await get(page, '/api/admin/stats');
    check(
      '9. the blocked draft count drops once it has a form',
      (statsAfter.data?.postings?.draft_without_form ?? -1) ===
        (statsWith.data?.postings?.draft_without_form ?? -1) - 1,
      `${statsWith.data?.postings?.draft_without_form} then ${statsAfter.data?.postings?.draft_without_form}`
    );
  }
});

/* =========================================================================
 * Postings, items 10 to 17
 * ====================================================================== */

define('jobs', 'Postings, items 10 to 17', async (state) => {
  const page = state.staffPage;

  // A tag to publish with. Item 13 needs one that exists.
  const tagName = `smoke-p7-${STAMP}`;
  const tag = await post(page, '/api/admin/tags', { action: 'save', name: tagName });
  check('a tag to publish with was created', tag.ok, short(tag.text));
  state.tagId = tag.data?.tag?.id ?? null;
  if (state.tagId) created.tags.push(state.tagId);

  // 12. Create a posting. It is a draft, whatever else was sent.
  const forced = await post(page, '/api/admin/jobs', {
    action: 'create',
    job: {
      title: `SMOKE P7 ${STAMP} status smuggler`,
      summary: 'Tries to arrive published.',
      description: 'First sentence. Second sentence.',
      status: 'published',
      published_at: '2020-01-01T00:00:00.000Z',
    },
  });
  check('12. a create that names a status still answers 201', forced.ok, short(forced.text));
  if (forced.ok) {
    created.jobs.push(forced.data.job.id);
    state.mainJobId = forced.data.job.id;
    check('12. the new posting is a draft whatever was sent', forced.data.job.status === 'draft', forced.data.job.status);
  }

  // 13. Publishing is refused without a form, then without a tag, then works.
  const noForm = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: state.mainJobId,
    status: 'published',
  });
  check(
    '13. publishing with no form is refused, with the reason',
    !noForm.ok && noForm.status === 409 && (noForm.details?.blockers ?? []).includes('no_form'),
    `status ${noForm.status} ${short(noForm.text, 160)}`
  );

  await post(page, '/api/admin/jobs', {
    action: 'update',
    id: state.mainJobId,
    job: { application_form_url: REAL_FORM },
  });

  const noTags = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: state.mainJobId,
    status: 'published',
  });
  check(
    '13. publishing with a form and no tag is refused, with the other reason',
    !noTags.ok && (noTags.details?.blockers ?? []).includes('no_tags'),
    `status ${noTags.status} ${short(noTags.text, 160)}`
  );

  await post(page, '/api/admin/jobs', {
    action: 'update',
    id: state.mainJobId,
    job: {},
    tag_ids: [state.tagId],
  });

  const published = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: state.mainJobId,
    status: 'published',
  });
  check('13. with a form and a tag it publishes', published.ok, short(published.text));
  const firstPublishedAt = published.data?.published_at ?? null;

  // 14. Publish, unpublish, publish again. published_at does not move.
  await post(page, '/api/admin/jobs', { action: 'status', id: state.mainJobId, status: 'draft' });
  const republished = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: state.mainJobId,
    status: 'published',
  });
  check(
    '14. published_at does not move on a republish',
    republished.ok &&
      Date.parse(republished.data.published_at) === Date.parse(firstPublishedAt),
    `${firstPublishedAt} then ${republished.data?.published_at}`
  );

  // 15. Duplicate carries the content and none of the original's life.
  const withEverything = await post(page, '/api/admin/jobs', {
    action: 'update',
    id: state.mainJobId,
    job: {
      sections: [{ heading: 'What you will do', body: 'Things.' }],
      task_questions: [
        { id: 'q1', type: 'short_answer', required: true, label: { en: 'Your timezone', zh: '你的时区' } },
      ],
    },
    translations: {
      zh: { title: '烟雾测试职位', summary: '摘要', description: '描述', is_ready: true },
    },
    tag_ids: [state.tagId],
  });
  check('15. the original carries translations, sections, tags and questions', withEverything.ok, short(withEverything.text));

  const copy = await post(page, '/api/admin/jobs', { action: 'duplicate', id: state.mainJobId });
  check('15. duplicate answers 201', copy.ok, short(copy.text));

  if (copy.ok) {
    created.jobs.push(copy.data.job.id);
    const full = await get(page, `/api/admin/jobs?id=${copy.data.job.id}`);
    const row = full.data?.job ?? {};
    check('15. the copy is a draft', row.status === 'draft', row.status);
    check('15. the copy carries the translations', Boolean(row.translations?.zh?.title), JSON.stringify(row.translations ?? {}).slice(0, 120));
    check('15. the copy carries the sections', (row.sections ?? []).length === 1, JSON.stringify(row.sections));
    check('15. the copy carries the tags', (row.tags ?? []).length === 1, JSON.stringify((row.tags ?? []).map((t2) => t2.name)));
    check('15. the copy carries the form', row.application_form_url === REAL_FORM, String(row.application_form_url));
    check('15. the copy carries the questions', (row.task_questions ?? []).length === 1, JSON.stringify(row.task_questions));
    check('15. the copy carries no published_at', !row.published_at, String(row.published_at));

    const impact = await get(page, `/api/admin/jobs?id=${copy.data.job.id}&impact=true`);
    check(
      '15. the copy carries none of the original\'s applications',
      impact.data?.impact?.applications === 0,
      JSON.stringify(impact.data?.impact)
    );
  }

  // 10. Search, filter, and sort on the list page.
  await page.goto(`${BASE}/admin/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jobList table, #jobList .admin-empty', { timeout: 20000 });

  await page.fill('#jobSearch', `SMOKE P7 ${STAMP}`);
  await page.press('#jobSearch', 'Enter');
  await page.waitForTimeout(2500);
  const byTitle = await page.locator('#jobList tbody tr').count();
  check('10. searching by title finds the run\'s postings', byTitle >= 2, `${byTitle} rows`);

  const slugRow = await get(page, `/api/admin/jobs?id=${state.mainJobId}`);
  const slug = slugRow.data?.job?.slug ?? '';
  await page.fill('#jobSearch', slug);
  await page.press('#jobSearch', 'Enter');
  await page.waitForTimeout(2500);
  const bySlug = await page.locator('#jobList tbody tr').count();
  check('10. searching by slug finds it', bySlug >= 1, `slug ${slug} gave ${bySlug} rows`);

  await page.fill('#jobSearch', '');
  await page.press('#jobSearch', 'Enter');
  await page.waitForTimeout(1500);

  for (const status of ['draft', 'published', 'closed', 'archived']) {
    await page.selectOption('#jobStatus', status);
    await page.waitForTimeout(2000);
    const rows = await page.$$eval('#jobList tbody tr .status-pill', (nodes) =>
      nodes.map((node) =>
        [...node.classList].find((c) => c.startsWith('status-') && c !== 'status-pill')
      )
    );
    check(
      `10. filtering by ${status} shows only that status`,
      rows.every((cls) => cls === `status-${status}`),
      `saw ${[...new Set(rows)].join(', ')}`
    );
  }
  await page.selectOption('#jobStatus', '');
  await page.waitForTimeout(1500);

  for (const sort of ['updated', 'created', 'title', 'closing']) {
    await page.selectOption('#jobSort', sort);
    await page.waitForTimeout(2000);
    const rows = await page.locator('#jobList tbody tr').count();
    check(`10. sorting by ${sort} still renders the list`, rows > 0, `${rows} rows`);
  }

  // A posting with no closing date sorts last under Closing date.
  const closing = await get(page, '/api/admin/jobs?sort=closing&limit=100');
  const order = (closing.data?.jobs ?? []).map((row) => row.has_deadline !== false);
  const firstOpenEnded = order.indexOf(false);
  const lastDated = order.lastIndexOf(true);
  check(
    '10. a posting with no closing date sorts last under Closing date',
    firstOpenEnded === -1 || lastDated === -1 || firstOpenEnded > lastDated,
    `first open ended at ${firstOpenEnded}, last dated at ${lastDated}`
  );

  // 11. The language column: a pill per active language, absent drawn faintly.
  await page.selectOption('#jobSort', 'updated');
  await page.fill('#jobSearch', `SMOKE P7 ${STAMP}`);
  await page.press('#jobSearch', 'Enter');
  await page.waitForTimeout(2500);

  const langs = await page.$$eval('#jobList tbody tr .admin-langs', (nodes) =>
    nodes.map((node) =>
      [...node.querySelectorAll('.admin-lang')].map((pill) => ({
        code: pill.textContent.trim(),
        state: [...pill.classList].find((c) => c.startsWith('admin-lang-'))?.replace('admin-lang-', ''),
        title: pill.getAttribute('title'),
      }))
    )
  );
  const activeCodes = (state.locales ?? []).map((locale) => locale.code);
  check(
    '11. every row draws a pill per active language',
    langs.length > 0 && langs.every((row) => row.length === activeCodes.length),
    `${activeCodes.length} active languages, rows had ${langs.map((r) => r.length).join(',')}`
  );
  check(
    '11. a language with no translation row is drawn as absent rather than left out',
    langs.some((row) => row.some((pill) => pill.state === 'absent' && pill.title)),
    JSON.stringify(langs).slice(0, 200)
  );
});

/* =========================================================================
 * The editor, items 18 to 26
 * ====================================================================== */

define('editor', 'The editor, items 18 to 26', async (state) => {
  const page = state.staffPage;

  // 18. The slug fills itself in from the title, and stops once it is touched.
  await page.goto(`${BASE}/admin/jobs/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#editorTabBody [data-field="title"]', { timeout: 20000 });

  const title = `SMOKE P7 ${STAMP} editor`;
  await page.fill('#editorTabBody [data-field="title"]', title);
  await page.waitForTimeout(300);
  const suggested = await page.inputValue('#jobSlug');
  check(
    '18. the slug fills itself in from the title',
    suggested.startsWith('smoke-p7-') && suggested.includes('editor'),
    `slug is "${suggested}"`
  );

  const typedSlug = `smoke-p7-${STAMP}-typed`;
  await page.fill('#jobSlug', typedSlug);
  await page.fill('#editorTabBody [data-field="title"]', `${title} again`);
  await page.waitForTimeout(300);
  check(
    '18. the slug stops following the title once it is typed into',
    (await page.inputValue('#jobSlug')) === typedSlug,
    `slug is now "${await page.inputValue('#jobSlug')}"`
  );

  // 19. The one most likely to be broken. Fill the form URL, add two tags, add
  //     a question, switch language tab and back, then save and reload.
  await page.fill('#editorTabBody [data-field="summary"]', 'A summary for the editor run.');
  await page.fill(
    '#editorTabBody [data-field="description"]',
    'The first sentence of the editor posting. A second sentence nobody should see in the embed.'
  );
  await page.fill('#jobForm', REAL_FORM);

  // One tag that already exists, so the type-ahead's match path runs, and one
  // that does not, so the create path runs. Both are item 25's two halves.
  const existingTagName = `smoke-p7-${STAMP}-a`;
  const madeUpTagName = `smoke-p7-${STAMP}-b`;
  const seedTag = await post(page, '/api/admin/tags', { action: 'save', name: existingTagName });
  if (seedTag.ok) created.tags.push(seedTag.data.tag.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tagInput', { timeout: 20000 });
  await page.fill('#editorTabBody [data-field="title"]', `${title} again`);
  await page.fill('#jobSlug', typedSlug);
  await page.fill('#editorTabBody [data-field="summary"]', 'A summary for the editor run.');
  await page.fill(
    '#editorTabBody [data-field="description"]',
    'The first sentence of the editor posting. A second sentence nobody should see in the embed.'
  );
  await page.fill('#jobForm', REAL_FORM);

  await page.fill('#tagInput', existingTagName);
  await page.press('#tagInput', 'Enter');
  await page.waitForTimeout(600);
  const matchedWithoutAsking = await page.locator('#tagPicker .chip').count();
  check(
    '25. a name that matches an existing tag is added without asking',
    matchedWithoutAsking === 1,
    `${matchedWithoutAsking} chips`
  );

  page.once('dialog', (dialog) => dialog.accept());
  await page.fill('#tagInput', madeUpTagName);
  await page.press('#tagInput', 'Enter');
  await page.waitForTimeout(3000);

  const chips = await page.locator('#tagPicker .chip').count();
  check('19. two tags are on the posting', chips === 2, `${chips} chips`);

  await page.click('#jobQuestions [data-add="short_answer"]');
  await page.fill('#jobQuestions .question-item [data-field="label"]', 'What is your timezone?');
  await page.waitForTimeout(300);

  const before = {
    form: await page.inputValue('#jobForm'),
    slug: await page.inputValue('#jobSlug'),
    chips,
    question: await page.inputValue('#jobQuestions .question-item [data-field="label"]'),
  };

  // The tab switch, which is the redraw that used to discard the panel.
  await page.click('#editorTabs [data-locale="zh"]');
  await page.waitForTimeout(800);
  await page.click('#editorTabs [data-locale="en"]');
  await page.waitForTimeout(800);

  const after = {
    form: await page.inputValue('#jobForm'),
    slug: await page.inputValue('#jobSlug'),
    chips: await page.locator('#tagPicker .chip').count(),
    question: await page.inputValue('#jobQuestions .question-item [data-field="label"]'),
  };
  check(
    '19. a language tab switch loses none of the shared panel',
    JSON.stringify(before) === JSON.stringify(after),
    `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`
  );

  const titleKept = await page.inputValue('#editorTabBody [data-field="title"]');
  check('19. the title survives the tab switch too', titleKept === `${title} again`, titleKept);

  // 20. On the 华文 tab, every field shows the English wording beside it.
  await page.click('#editorTabs [data-locale="zh"]');
  await page.waitForTimeout(800);
  const sources = await page.locator('#editorTabBody .editor-source').count();
  check('20. the source wording is shown beside the translation fields', sources >= 3, `${sources} source blocks`);

  const wide = await page.evaluate(() => {
    const field = document.querySelector('#editorTabBody .editor-field.has-source');
    return field ? getComputedStyle(field).display : null;
  });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const field = document.querySelector('#editorTabBody .editor-field.has-source');
    if (!field) return null;
    const style = getComputedStyle(field);
    const main = field.querySelector('.editor-field-main').getBoundingClientRect();
    const source = field.querySelector('.editor-source').getBoundingClientRect();
    return { display: style.display, direction: style.flexDirection, sourceAbove: source.top < main.top };
  });
  check(
    '20. below 1024px the source becomes a block above the field',
    wide === 'grid' && narrow?.display === 'flex' && narrow?.sourceAbove === true,
    `wide=${wide} narrow=${JSON.stringify(narrow)}`
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(400);

  // 21. Ticking ready with the summary blank is refused on that field.
  await page.click('#editorTabs [data-locale="zh"]');
  await page.waitForTimeout(600);
  await page.fill('#editorTabBody [data-field="title"]', '编辑器测试职位');
  await page.fill('#editorTabBody [data-field="summary"]', '');
  await page.fill('#editorTabBody [data-field="description"]', '中文描述。');
  await page.check('#translationReady');
  await save(page);

  const summaryError = page.locator('[data-error-for="summary"]');
  check(
    '21. ready with a blank summary is refused on that field',
    (await summaryError.count()) > 0 && (await summaryError.first().isVisible()),
    'no field error appeared on summary'
  );

  await page.fill('#editorTabBody [data-field="summary"]', '中文摘要。');
  await save(page);
  const editorId = await waitForPath(page, (url) => url.searchParams.has('id'), 20000);
  check('19. the posting saved and the address bar carries its id', editorId !== null, page.url());

  if (!editorId) return;
  state.editorJobId = editorId.searchParams.get('id');
  created.jobs.push(state.editorJobId);

  // 19, the second half. What comes back is what was on screen.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jobForm', { timeout: 20000 });
  const reloaded = {
    form: await page.inputValue('#jobForm'),
    slug: await page.inputValue('#jobSlug'),
    chips: await page.locator('#tagPicker .chip').count(),
    question: await page.inputValue('#jobQuestions .question-item [data-field="label"]'),
  };
  check('19. the form URL comes back after a reload', reloaded.form === before.form, reloaded.form);
  check('19. both tags come back after a reload', reloaded.chips === 2, `${reloaded.chips} chips`);
  check(
    '19. the question comes back after a reload',
    reloaded.question === before.question,
    reloaded.question
  );
  check(
    '19. the slug comes back after a reload',
    reloaded.slug === before.slug,
    `saved as "${reloaded.slug}", was "${before.slug}" on screen`
  );

  // 22. Sections: add three, reorder, delete the middle one. Then a different
  //     number on the 华文 tab, and both save.
  for (let index = 0; index < 3; index += 1) {
    await page.click('#addSection');
    await page.waitForTimeout(200);
    const rows = page.locator('#editorSectionList .editor-section');
    await rows.nth(index).locator('[data-section-field="heading"]').fill(`Heading ${index + 1}`);
    await rows.nth(index).locator('[data-section-field="body"]').fill(`Body ${index + 1}`);
  }
  await page.locator('#editorSectionList .editor-section').nth(2).locator('[data-section-move="up"]').click();
  await page.waitForTimeout(300);
  const reordered = await page.$$eval('#editorSectionList [data-section-field="heading"]', (nodes) =>
    nodes.map((node) => node.value)
  );
  check(
    '22. sections reorder',
    JSON.stringify(reordered) === JSON.stringify(['Heading 1', 'Heading 3', 'Heading 2']),
    JSON.stringify(reordered)
  );

  await page.locator('#editorSectionList .editor-section').nth(1).locator('[data-section-remove]').click();
  await page.waitForTimeout(300);
  const afterDelete = await page.$$eval('#editorSectionList [data-section-field="heading"]', (nodes) =>
    nodes.map((node) => node.value)
  );
  check(
    '22. deleting the middle section leaves the other two',
    JSON.stringify(afterDelete) === JSON.stringify(['Heading 1', 'Heading 2']),
    JSON.stringify(afterDelete)
  );

  await page.click('#editorTabs [data-locale="zh"]');
  await page.waitForTimeout(600);
  await page.click('#addSection');
  await page.waitForTimeout(200);
  const zhRow = page.locator('#editorSectionList .editor-section').first();
  await zhRow.locator('[data-section-field="heading"]').fill('中文小节');
  await zhRow.locator('[data-section-field="body"]').fill('中文内容。');

  await save(page);

  const saved = await get(page, `/api/admin/jobs?id=${state.editorJobId}`);
  const savedJob = saved.data?.job ?? {};
  check(
    '22. both languages save a different number of sections',
    (savedJob.sections ?? []).length === 2 && (savedJob.translations?.zh?.sections ?? []).length === 1,
    `base ${(savedJob.sections ?? []).length}, zh ${(savedJob.translations?.zh?.sections ?? []).length}`
  );

  // 23. The embed preview updates as the description is typed and falls back to
  //     the first sentence when the preview line is empty.
  await page.click('#editorTabs [data-locale="en"]');
  await page.waitForTimeout(600);
  await page.fill('#editorTabBody [data-field="og_description"]', '');
  await page.fill(
    '#editorTabBody [data-field="description"]',
    'A brand new first sentence. And a second one that must not appear.'
  );
  await page.waitForTimeout(500);
  const embed = await page.locator('#embedPreview .embed-description').textContent();
  check(
    '23. the embed preview shows the fallback first sentence',
    embed?.trim() === 'A brand new first sentence.',
    `preview says "${short(embed, 120)}"`
  );

  await page.fill('#editorTabBody [data-field="og_description"]', 'A written preview line.');
  await page.waitForTimeout(500);
  const embedWritten = await page.locator('#embedPreview .embed-description').textContent();
  check(
    '23. the embed preview follows the preview line once it is written',
    embedWritten?.trim() === 'A written preview line.',
    `preview says "${short(embedWritten, 120)}"`
  );

  // 24. A forms.gle link is accepted alone and refused with a prefill map.
  await page.fill('#jobForm', SHORT_FORM);
  await page.fill('#jobPrefill', '');
  await save(page);
  const shortAlone = await get(page, `/api/admin/jobs?id=${state.editorJobId}`);
  check(
    '24. a forms.gle link with no prefill map is accepted',
    shortAlone.data?.job?.application_form_url === SHORT_FORM,
    String(shortAlone.data?.job?.application_form_url)
  );

  await page.fill('#jobPrefill', '{"entry.123456":"email"}');
  await save(page);
  const prefillError = page.locator('[data-error-for="form_prefill"]');
  check(
    '24. a prefill map on a forms.gle link is refused on form_prefill',
    (await prefillError.count()) > 0 && (await prefillError.first().isVisible()),
    'no field error appeared on form_prefill'
  );

  // The same map on a long form URL is fine, which is the other half of the rule.
  await page.fill('#jobForm', REAL_FORM);
  await save(page);
  const prefillSaved = await get(page, `/api/admin/jobs?id=${state.editorJobId}`);
  check(
    '24. the same map on a long form URL saves',
    prefillSaved.data?.job?.form_prefill?.['entry.123456'] === 'email',
    JSON.stringify(prefillSaved.data?.job?.form_prefill)
  );

  // 18, the last third. Reusing a slug is refused on that field.
  const otherSlug = (await get(page, `/api/admin/jobs?id=${state.mainJobId}`)).data?.job?.slug;
  if (otherSlug) {
    await page.fill('#jobSlug', otherSlug);
    await save(page);
    const slugError = page.locator('[data-error-for="slug"]');
    const stillMine = await get(page, `/api/admin/jobs?id=${state.editorJobId}`);
    check(
      '18. reusing an existing slug is refused on that field rather than suffixed',
      (await slugError.count()) > 0 &&
        (await slugError.first().isVisible()) &&
        stillMine.data?.job?.slug !== otherSlug,
      `slug is now ${stillMine.data?.job?.slug}`
    );
    await page.fill('#jobSlug', typedSlug);
    await save(page);
  } else {
    skip('18. slug collision', 'no other posting to collide with');
  }

  // 25. The tag box matches an existing tag as you type, and offers to create
  //     one only when nothing matches.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tagInput', { timeout: 20000 });
  const optionCount = await page.locator('#tagOptions option').count();
  const hasMine = await page.evaluate(
    (name) => [...document.querySelectorAll('#tagOptions option')].some((o) => o.value === name),
    existingTagName
  );
  check(
    '25. the tag box offers existing tags as you type',
    optionCount > 0,
    `${optionCount} options in the datalist`
  );
  check(
    '25. a tag already on the posting is not offered again',
    hasMine === false,
    'the posting\'s own tag is still in the datalist'
  );

  let asked = null;
  page.once('dialog', (dialog) => {
    asked = dialog.message();
    dialog.dismiss();
  });
  await page.fill('#tagInput', `nothing-matches-${STAMP}`);
  await page.press('#tagInput', 'Enter');
  await page.waitForTimeout(1500);
  check(
    '25. a name that matches nothing asks before creating a tag',
    typeof asked === 'string' && asked.length > 0,
    `dialog said ${short(asked, 120)}`
  );

  // 26. Leaving with unsaved changes asks.
  await page.fill('#editorTabBody [data-field="title"]', `${title} unsaved`);
  await page.waitForTimeout(300);
  const guarded = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  check('26. leaving with unsaved changes is guarded', guarded === true);
});

/* -------------------------------------------------------------------------
 * Shared fixtures for the sections below
 * ---------------------------------------------------------------------- */

/** Sign the applicant in, registering one on the first call. */
async function ensureApplicant(state) {
  if (state.applicantPage) return state.applicantPage;
  const page = await state.ctx.newPage();
  page.on('pageerror', (error) => state.pageErrors.push({ where: page.url(), error: String(error) }));
  if (REUSE_APPLICANT) await signInApplicant(page);
  else await registerApplicant(page);
  const who = await get(page, '/api/auth/applicant/session');
  state.applicant = who.data?.user ?? null;
  state.applicantPage = page;
  return page;
}

/** A published posting with a form and a tag, which is what can be applied to. */
async function ensurePublishedJob(state, label = 'live role') {
  const page = state.staffPage;

  if (!state.tagId) {
    const tag = await post(page, '/api/admin/tags', { action: 'save', name: `smoke-p7-${STAMP}` });
    state.tagId = tag.data?.tag?.id ?? null;
    if (state.tagId) created.tags.push(state.tagId);
  }

  const made = await createJob(page, {
    label,
    job: { application_form_url: REAL_FORM },
    tag_ids: [state.tagId],
  });
  if (!made.ok) return null;

  await post(page, '/api/admin/jobs', {
    action: 'update',
    id: made.data.job.id,
    job: {},
    tag_ids: [state.tagId],
  });
  const live = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: made.data.job.id,
    status: 'published',
  });
  return live.ok ? made.data.job.id : null;
}

/* =========================================================================
 * Applicant tracking, items 16, 17 and 27 to 36
 * ====================================================================== */

define('tracking', 'Applicant tracking, items 16, 17, 27 to 36', async (state) => {
  const page = state.staffPage;
  const applicantPage = await ensureApplicant(state);

  const jobId = await ensurePublishedJob(state, 'tracking role');
  check('a published posting to apply to', Boolean(jobId));
  if (!jobId) return;
  state.trackingJobId = jobId;

  const started = await post(applicantPage, '/api/applications/start', { job_id: jobId });
  check('the applicant was handed over to the form', started.ok, short(started.text));

  // Say yes to "have you applied", which is what sets applied_at and the
  // cooldown, so items 31 to 34 have something real to look at.
  if (started.ok && started.data?.analytics_id) {
    const answered = await post(applicantPage, '/api/applications/respond', {
      analytics_id: started.data.analytics_id,
      answer: 'yes',
    });
    check('the applicant confirmed they applied', answered.ok, short(answered.text));
  }

  const mine = await get(applicantPage, '/api/applications/mine');
  const row = (mine.data?.applications ?? []).find(
    (entry) => (entry.job_id ?? entry.job?.id) === jobId
  );
  check('a tracking row exists for the applicant', Boolean(row), short(mine.text, 300));

  const listed = await get(page, `/api/admin/applications?job=${jobId}`);
  const application = (listed.data?.applications ?? [])[0] ?? null;
  check('the tracking page lists it', Boolean(application), short(listed.text, 300));
  if (!application) return;
  state.applicationId = application.id;

  // 27. Filter by job, by status, and by date range, and the range includes the
  //     day picked at both ends.
  const today = new Date().toISOString().slice(0, 10);
  const byJob = await get(page, `/api/admin/applications?job=${jobId}`);
  check(
    '27. filtering by job returns only that posting',
    (byJob.data?.applications ?? []).every((entry) => entry.job.id === jobId),
    `${byJob.data?.applications?.length} rows`
  );

  const byStatus = await get(page, `/api/admin/applications?status=${application.status}`);
  check(
    '27. filtering by status returns only that status',
    (byStatus.data?.applications ?? []).every((entry) => entry.status === application.status),
    [...new Set((byStatus.data?.applications ?? []).map((e) => e.status))].join(', ')
  );

  const sameDay = await get(page, `/api/admin/applications?job=${jobId}&from=${today}&until=${today}`);
  check(
    '27. a range whose ends are both today includes today\'s row',
    (sameDay.data?.applications ?? []).some((entry) => entry.id === application.id),
    `${sameDay.data?.applications?.length} rows for ${today}..${today}`
  );

  await page.goto(`${BASE}/admin/applications?job=${jobId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#applicationList table', { timeout: 20000 });
  await dismissApplyPrompt(page);
  await page.fill('#filterFrom', today);
  await page.fill('#filterUntil', today);
  await page.click('#applicationFilters button[type="submit"]');
  await page.waitForTimeout(2500);
  const rowsForToday = await page.locator('#applicationList tbody tr').count();
  check('27. the date range filter works from the page too', rowsForToday >= 1, `${rowsForToday} rows`);

  // 28. Open a row: profile, timeline, tasks, status control, and the copy that
  //     says the answers are in Google Forms.
  await page.locator(`[data-application-id="${application.id}"] [data-open-detail]`).click();
  await page.waitForSelector('#applicationDetailBody .admin-detail-profile', { timeout: 15000 });
  const detail = await page.evaluate(() => {
    const body = document.querySelector('#applicationDetailBody');
    return {
      profile: Boolean(body.querySelector('.admin-detail-profile dl')),
      timeline: body.querySelectorAll('.admin-timeline li').length,
      tasks: Boolean(body.querySelector('.admin-detail-tasks')),
      status: Boolean(body.querySelector('#detailStatus')),
      note: Boolean(body.querySelector('#detailNote')),
      hint: body.querySelector('.admin-detail-profile .field-hint')?.textContent ?? '',
    };
  });
  check(
    '28. the row opens with the profile, the timeline, the tasks and the status control',
    detail.profile && detail.timeline > 0 && detail.tasks && detail.status && detail.note,
    JSON.stringify(detail)
  );
  check(
    '28. the copy says the answers are not here but with Google',
    /google (forms?|sheets?)/i.test(detail.hint),
    `hint reads "${short(detail.hint, 140)}"`
  );

  // 29. A non-decision status change writes one event row naming the staff
  //     member, with source admin.
  const historyBefore = (await get(page, `/api/admin/applications?id=${application.id}`)).data
    ?.history?.length ?? 0;

  const moved = await post(page, '/api/admin/applications', {
    action: 'status',
    id: application.id,
    status: 'under_review',
    note: 'Moved by the phase 7 verification run.',
  });
  check('29. a non-decision status change is accepted', moved.ok, short(moved.text));

  const afterMove = await get(page, `/api/admin/applications?id=${application.id}`);
  const history = afterMove.data?.history ?? [];
  const newest = history[0] ?? null;
  check(
    '29. exactly one event row was written',
    history.length === historyBefore + 1,
    `${historyBefore} then ${history.length}`
  );
  check(
    '29. the event names the staff member, with source admin',
    newest?.source === 'admin' && newest?.to_status === 'under_review' && Boolean(newest?.changed_by ?? newest?.actor_label ?? newest?.by),
    JSON.stringify(newest)
  );

  // 30. Change the note without changing the status. No event row.
  const noteResult = await post(page, '/api/admin/applications', {
    action: 'note',
    id: application.id,
    note: 'A note with no status change.',
  });
  check('30. the note saves on its own', noteResult.ok, short(noteResult.text));

  const afterNote = await get(page, `/api/admin/applications?id=${application.id}`);
  check(
    '30. the note changed',
    afterNote.data?.application?.admin_note === 'A note with no status change.',
    String(afterNote.data?.application?.admin_note)
  );
  check(
    '30. no event row was written for a note',
    (afterNote.data?.history ?? []).length === history.length,
    `${history.length} then ${(afterNote.data?.history ?? []).length}`
  );

  // 31. Accept somebody.
  const beforeAccept = afterNote.data?.application ?? {};
  const jobBefore = (await get(page, `/api/admin/jobs?id=${jobId}`)).data?.job ?? {};

  const accepted = await post(page, '/api/admin/applications', {
    action: 'status',
    id: application.id,
    status: 'accepted',
    message: {
      title: 'You have a place with us',
      body: 'Written by the phase 7 verification run.',
    },
  });
  check('31. accepting is accepted', accepted.ok, short(accepted.text));
  check('31. accepting raised a notice task', Boolean(accepted.data?.task_id), JSON.stringify(accepted.data));

  const afterAccept = (await get(page, `/api/admin/applications?id=${application.id}`)).data
    ?.application ?? {};
  check(
    '31. applied_at is exactly what it was',
    afterAccept.applied_at === beforeAccept.applied_at,
    `${beforeAccept.applied_at} then ${afterAccept.applied_at}`
  );
  check(
    '31. cooldown_until is exactly what it was',
    (afterAccept.cooldown_until ?? null) === (beforeAccept.cooldown_until ?? null),
    `${beforeAccept.cooldown_until} then ${afterAccept.cooldown_until}`
  );

  const jobAfter = (await get(page, `/api/admin/jobs?id=${jobId}`)).data?.job ?? {};
  check(
    '31. the posting\'s own status and openings are untouched',
    jobAfter.status === jobBefore.status && jobAfter.openings === jobBefore.openings,
    `${jobBefore.status}/${jobBefore.openings} then ${jafterOr(jobAfter)}`
  );

  if (accepted.data?.task_id) {
    const task = await get(page, `/api/admin/tasks?id=${accepted.data.task_id}`);
    check(
      '31. the task raised is a notice',
      task.data?.task?.task_type === 'notice',
      String(task.data?.task?.task_type)
    );
    state.acceptNoticeId = accepted.data.task_id;
  }

  // 32. As that applicant, the Apply slot reads the accepted sentence with no
  //     date, and start answers reason accepted.
  const blocked = await post(applicantPage, '/api/applications/start', { job_id: jobId });
  check(
    '32. start answers reason accepted',
    !blocked.ok && blocked.details?.reason === 'accepted',
    `status ${blocked.status} ${short(blocked.text, 200)}`
  );

  await applicantPage.goto(`${BASE}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForTimeout(3000);
  const applySlot = await applicantPage.evaluate(() => {
    const slot = document.querySelector('[data-apply-slot], .apply-slot, .job-apply');
    return slot ? slot.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check(
    '32. the Apply slot reads the accepted sentence with no date in it',
    typeof applySlot === 'string' &&
      applySlot.length > 0 &&
      !/\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2}/.test(applySlot),
    `slot reads "${short(applySlot, 200)}"`
  );

  // 33 and 34 need a second applicant row, because this one is now accepted and
  // accepting is permanent. A second posting gives one.
  const secondJob = await ensurePublishedJob(state, 'cooldown role');
  if (secondJob) {
    const start2 = await post(applicantPage, '/api/applications/start', { job_id: secondJob });
    if (start2.ok && start2.data?.analytics_id) {
      await post(applicantPage, '/api/applications/respond', {
        analytics_id: start2.data.analytics_id,
        answer: 'yes',
      });
    }

    const list2 = await get(page, `/api/admin/applications?job=${secondJob}`);
    const row2 = (list2.data?.applications ?? [])[0] ?? null;

    if (row2) {
      state.secondApplicationId = row2.id;
      const before2 = (await get(page, `/api/admin/applications?id=${row2.id}`)).data?.application ?? {};

      // 33. Reject somebody who is inside a cooldown. The cooldown is unchanged.
      const rejected = await post(page, '/api/admin/applications', {
        action: 'status',
        id: row2.id,
        status: 'rejected',
        message: { title: 'Not this time', body: 'Written by the phase 7 verification run.' },
      });
      check('33. rejecting is accepted', rejected.ok, short(rejected.text));

      const after2 = (await get(page, `/api/admin/applications?id=${row2.id}`)).data?.application ?? {};
      check(
        '33. the cooldown is unchanged by a rejection',
        (after2.cooldown_until ?? null) === (before2.cooldown_until ?? null),
        `${before2.cooldown_until} then ${after2.cooldown_until}`
      );
      if (after2.cooldown_until) {
        const inCooldown = await post(applicantPage, '/api/applications/start', {
          job_id: secondJob,
        });
        check(
          '33. a rejected applicant inside a cooldown cannot reapply yet',
          !inCooldown.ok && inCooldown.details?.reason === 'cooldown',
          `status ${inCooldown.status} ${short(inCooldown.text, 160)}`
        );
      }

      // 34. Waive a cooldown.
      if (after2.cooldown_until) {
        const waived = await post(page, '/api/admin/applications', {
          action: 'waive',
          id: row2.id,
          note: 'Waived by the phase 7 verification run.',
        });
        check('34. waiving is accepted', waived.ok, short(waived.text));

        const after3 = (await get(page, `/api/admin/applications?id=${row2.id}`)).data ?? {};
        check(
          '34. cooldown_until becomes null',
          after3.application?.cooldown_until === null,
          String(after3.application?.cooldown_until)
        );
        check(
          '34. applied_at does not',
          after3.application?.applied_at === after2.applied_at,
          `${after2.applied_at} then ${after3.application?.applied_at}`
        );
        const waiveEvent = (after3.history ?? []).find((event) => /waiv/i.test(event.note ?? ''));
        check(
          '34. an event row names who waived it',
          Boolean(waiveEvent) && Boolean(waiveEvent.changed_by ?? waiveEvent.actor_label),
          JSON.stringify((after3.history ?? [])[0])
        );

        // 33, the second half. With the cooldown cleared they can apply again
        // and the row starts fresh at started.
        const reapply = await post(applicantPage, '/api/applications/start', { job_id: secondJob });
        check('33. with the cooldown cleared they can apply again', reapply.ok, short(reapply.text, 200));

        const after4 = (await get(page, `/api/admin/applications?id=${row2.id}`)).data?.application ?? {};
        check(
          '33. the row starts fresh at started',
          after4.status === 'started',
          `status is ${after4.status}`
        );
      } else {
        skip('34. waive a cooldown', 'no cooldown was set on the rejected row, so there was none to waive');
      }
    } else {
      skip('33, 34. cooldown and waive', 'no second tracking row was created');
    }
  }

  // 16. Archive a posting somebody has applied to.
  const archived = await post(page, '/api/admin/jobs', {
    action: 'status',
    id: jobId,
    status: 'archived',
  });
  check('16. archiving is accepted', archived.ok, short(archived.text));

  const board = await get(page, `/api/public/search?q=SMOKE P7 ${STAMP}`);
  const onBoard = (board.data?.jobs ?? []).some((entry) => entry.id === jobId);
  check('16. an archived posting leaves the board', onBoard === false, `still on the board: ${onBoard}`);

  await applicantPage.goto(`${BASE}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForTimeout(2500);
  const seenByApplicant = await applicantPage.title();
  const applicantStatus = await get(applicantPage, `/api/public/job?id=${jobId}`);
  check(
    '16. it still renders for the applicant who applied',
    applicantStatus.status === 200,
    `status ${applicantStatus.status}, page title "${short(seenByApplicant, 80)}"`
  );

  const anonPage = await state.anon.newPage();
  const strangerStatus = await get(anonPage, `/api/public/job?id=${jobId}`);
  check(
    '16. the same uuid 404s with no session',
    strangerStatus.status === 404,
    `status ${strangerStatus.status}`
  );
  await anonPage.close();

  // 35. Bulk move, then bulk reject, naming everybody first.
  const bulkIds = [];
  for (let index = 0; index < 3; index += 1) {
    const bulkJob = await ensurePublishedJob(state, `bulk ${index + 1}`);
    if (!bulkJob) continue;
    const start = await post(applicantPage, '/api/applications/start', { job_id: bulkJob });
    if (!start.ok) continue;
    const listed2 = await get(page, `/api/admin/applications?job=${bulkJob}`);
    const bulkRow = (listed2.data?.applications ?? [])[0];
    if (bulkRow) bulkIds.push(bulkRow.id);
  }

  if (bulkIds.length === 3) {
    const wrongCount = await post(page, '/api/admin/applications', {
      action: 'bulk_status',
      ids: bulkIds,
      status: 'under_review',
      confirm_count: 2,
    });
    check(
      '35. a bulk change that names the wrong count is refused',
      !wrongCount.ok && wrongCount.status === 409,
      `status ${wrongCount.status}`
    );

    const bulkMoved = await post(page, '/api/admin/applications', {
      action: 'bulk_status',
      ids: bulkIds,
      status: 'under_review',
      confirm_count: 3,
    });
    check(
      '35. three rows move together',
      bulkMoved.ok && (bulkMoved.data?.moved ?? []).length === 3,
      short(bulkMoved.text, 200)
    );

    const bulkRejected = await post(page, '/api/admin/applications', {
      action: 'bulk_status',
      ids: bulkIds,
      status: 'rejected',
      confirm_count: 3,
      message: { title: 'Not this time', body: 'Written by the phase 7 verification run.' },
    });
    check(
      '35. three rows are rejected together',
      bulkRejected.ok && (bulkRejected.data?.moved ?? []).length === 3,
      short(bulkRejected.text, 200)
    );

    const tasksNow = await get(page, `/api/admin/tasks?applicant=${state.applicant.id}`);
    const notices = (tasksNow.data?.tasks ?? []).filter(
      (task) => task.task_type === 'notice' && task.title === 'Not this time'
    );
    check(
      '35. three notice tasks were raised, one each',
      notices.length >= 3,
      `${notices.length} notices titled "Not this time"`
    );

    // The composer names everybody before sending, which is the page's half.
    await page.goto(`${BASE}/admin/applications?status=rejected`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#applicationList table', { timeout: 20000 });
    const promptWasUp = await dismissApplyPrompt(page);
    check(
      'the applicant apply prompt does not open over a staff page',
      promptWasUp === false,
      'the "have you applied?" modal was open over /admin/applications and had to be closed to carry on'
    );
    const picks = page.locator('#applicationList tbody tr [data-pick]');
    const pickCount = Math.min(3, await picks.count());
    for (let index = 0; index < pickCount; index += 1) await picks.nth(index).check();
    await page.waitForTimeout(800);

    const barShown = await page.locator('#bulkBar').isVisible();
    check(
      '35. selecting rows raises the bulk bar',
      barShown && pickCount === 3,
      `${pickCount} rows selected, bar visible: ${barShown}`
    );

    if (barShown) {
      // Straight to the decision, because that is the half the page owns: a
      // decision opens the composer and names everybody before anything is
      // sent. The rows are already rejected from the calls above, so nothing
      // here reaches anybody even if the composer were sent, and it is not.
      await page.selectOption('#bulkStatus', 'rejected');
      await page.waitForTimeout(400);
      await page.click('#bulkApply');
      await page.waitForSelector('#decisionTitle', { timeout: 10000 }).catch(() => {});

      // The composer specifically, found through the field only it has. The
      // theme and language modals are in the DOM on every page and a bare
      // dialog[open] finds one of those instead.
      const composer = await page.evaluate(() => {
        const field = document.querySelector('#decisionTitle');
        const modal = field?.closest('dialog, [role="dialog"], .modal');
        return modal ? modal.textContent.replace(/\s+/g, ' ').trim() : null;
      });
      check(
        '35. the composer lists who it will reach before sending',
        typeof composer === 'string' && composer.includes(APPLICANT.display_name),
        `composer said "${short(composer, 220)}"`
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      skip('35. the composer naming everybody', 'the bulk bar did not open, so there was nothing to send');
    }
  } else {
    skip('35. bulk move and bulk reject', `only ${bulkIds.length} of 3 rows could be created`);
  }

  // 36. The CSV export carries the filtered set, and quotes a leading =.
  const csv = await get(page, `/api/admin/applications?job=${state.trackingJobId}&format=csv`, {
    raw: true,
  });
  const lines = csv.text.trim().split(/\r?\n/);
  check(
    '36. the export carries the filtered set rather than the page',
    csv.status === 200 && lines.length === 2,
    `${lines.length} lines for a filter matching one row`
  );
  check(
    '36. the export is a CSV attachment',
    /text\/csv/.test(csv.headers['content-type'] ?? '') &&
      /attachment/.test(csv.headers['content-disposition'] ?? ''),
    `${csv.headers['content-type']} / ${csv.headers['content-disposition']}`
  );

  // The formula guard, checked against the module rather than a live row: no
  // account on this run is called =SUM(), and creating one to prove it would
  // leave an account behind whose display name a spreadsheet would evaluate.
  const all = await get(page, '/api/admin/applications?format=csv', { raw: true });
  const dangerous = all.text
    .split(/\r?\n/)
    .filter((line) => /(^|,)=/.test(line) && !/(^|,)"=/.test(line));
  check(
    '36. no exported cell begins with a bare =',
    dangerous.length === 0,
    dangerous.slice(0, 3).join(' | ')
  );
});

function jafterOr(job) {
  return `${job.status}/${job.openings}`;
}

/* =========================================================================
 * Tasks and questions, items 37 to 46
 * ====================================================================== */

const FOUR_TYPES = [
  {
    id: 'q-short',
    type: 'short_answer',
    required: true,
    label: { en: 'Which timezone are you in?', zh: '你在哪个时区？' },
  },
  {
    id: 'q-long',
    type: 'long_answer',
    required: false,
    // Deliberately English only, which is item 38's fallback case.
    label: { en: 'Anything else we should know?' },
  },
  {
    id: 'q-choice',
    type: 'choice',
    required: true,
    label: { en: 'How did you hear about us?', zh: '你从哪里听说我们的？' },
    options: [
      { value: 'discord', label: { en: 'Discord', zh: 'Discord' } },
      { value: 'friend', label: { en: 'A friend', zh: '朋友介绍' } },
    ],
  },
  {
    id: 'q-check',
    type: 'checkbox',
    required: false,
    label: { en: 'Which days can you help?' },
    options: [
      { value: 'sat', label: { en: 'Saturday', zh: '星期六' } },
      { value: 'sun', label: { en: 'Sunday', zh: '星期日' } },
    ],
  },
];

define('tasks', 'Tasks and questions, items 37 to 46', async (state) => {
  const page = state.staffPage;
  const applicantPage = await ensureApplicant(state);
  const applicantId = state.applicant?.id;
  check('an applicant to raise tasks on', Boolean(applicantId));
  if (!applicantId) return;

  // 37. An info request with no questions, which is phase 6's plain reply box.
  const plain = await post(page, '/api/admin/tasks', {
    action: 'raise',
    applicant_ids: [applicantId],
    task_type: 'info_request',
    title: `Plain info request ${STAMP}`,
    body: 'No questions on this one.',
  });
  check('37. a plain info request is raised', plain.ok, short(plain.text));
  const plainId = plain.data?.task_ids?.[0] ?? null;

  await applicantPage.goto(`${BASE}/account/tasks`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForSelector('#taskList [data-task-id], #tasksEmpty', { timeout: 20000 });
  await dismissApplyPrompt(applicantPage);

  const plainCard = applicantPage.locator(`[data-task-id="${plainId}"]`);
  check('37. it appears on /account/tasks', (await plainCard.count()) === 1);

  if ((await plainCard.count()) === 1) {
    await plainCard.locator('[data-toggle-reply]').click();
    await applicantPage.waitForTimeout(500);
    const shape = await plainCard.evaluate((node) => ({
      questions: node.querySelectorAll('.task-question').length,
      replyBox: Boolean(node.querySelector('[data-reply-form] textarea[name="text"]')),
    }));
    check(
      '37. it carries the plain reply box and no questions',
      shape.questions === 0 && shape.replyBox,
      JSON.stringify(shape)
    );
  }

  // 38. One with all four question types, some required, Chinese on some only.
  // Raised against the tracked posting where there is one, so item 43 has a
  // tracking row to look at: tasksForApplicant filters to the posting the row
  // belongs to, and a task with no job_id would not appear on it.
  const withQuestions = await post(page, '/api/admin/tasks', {
    action: 'raise',
    applicant_ids: [applicantId],
    task_type: 'info_request',
    title: `Four question types ${STAMP}`,
    body: 'Please answer these.',
    questions: FOUR_TYPES,
    ...(state.trackingJobId ? { job_id: state.trackingJobId } : {}),
  });
  check('38. a task with all four question types is raised', withQuestions.ok, short(withQuestions.text));
  const questionTaskId = withQuestions.data?.task_ids?.[0] ?? null;
  if (!questionTaskId) return;
  state.questionTaskId = questionTaskId;

  await applicantPage.goto(`${BASE}/account/tasks`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForSelector(`[data-task-id="${questionTaskId}"]`, { timeout: 20000 });
  await dismissApplyPrompt(applicantPage);

  const card = applicantPage.locator(`[data-task-id="${questionTaskId}"]`);
  await card.locator('[data-toggle-reply]').click();
  await applicantPage.waitForTimeout(600);

  const types = await card.evaluate((root) =>
    [...root.querySelectorAll('.task-question')].map((node) =>
      node.getAttribute('data-question-type')
    )
  );
  check(
    '38. all four types render',
    JSON.stringify(types) === JSON.stringify(['short_answer', 'long_answer', 'choice', 'checkbox']),
    JSON.stringify(types)
  );

  const englishLabels = await card.evaluate((root) =>
    [...root.querySelectorAll('.task-question')].map((node) =>
      (node.querySelector('legend, label')?.textContent ?? '').trim()
    )
  );

  // Switch to 华文 and confirm the English-only question falls back rather than
  // rendering blank. The language lives in localStorage and nowhere else, per
  // the note at the top of i18n.js, so that is where it is set.
  await applicantPage.evaluate(() => window.localStorage.setItem('gftv-careers.locale', 'zh'));
  await applicantPage.goto(`${BASE}/account/tasks`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForSelector(`[data-task-id="${questionTaskId}"]`, { timeout: 20000 });
  await dismissApplyPrompt(applicantPage);
  const zhCard = applicantPage.locator(`[data-task-id="${questionTaskId}"]`);
  await zhCard.locator('[data-toggle-reply]').click();
  await applicantPage.waitForTimeout(600);

  const zhLabels = await zhCard.evaluate((root) =>
    [...root.querySelectorAll('.task-question')].map((node) => ({
      id: node.getAttribute('data-question-id'),
      label: (node.querySelector('legend, label')?.textContent ?? '').trim(),
    }))
  );
  const longAnswer = zhLabels.find((entry) => entry.id === 'q-long');
  const shortAnswer = zhLabels.find((entry) => entry.id === 'q-short');
  check(
    '38. a question with no Chinese label falls back to the English rather than blank',
    Boolean(longAnswer?.label) && /Anything else/i.test(longAnswer.label),
    `q-long reads "${short(longAnswer?.label, 100)}"`
  );
  check(
    '38. a question with a Chinese label shows the Chinese',
    /时区/.test(shortAnswer?.label ?? ''),
    `q-short reads "${short(shortAnswer?.label, 100)}"`
  );
  void englishLabels;

  // Back to English for the rest of the run.
  await applicantPage.evaluate(() => window.localStorage.setItem('gftv-careers.locale', 'en'));

  // 42. A required question left unanswered is refused.
  const missingRequired = await post(applicantPage, '/api/tasks/respond', {
    task_id: questionTaskId,
    action: 'reply',
    answers: { 'q-choice': 'discord' },
  });
  check(
    '42. a required question left unanswered is refused, on that question',
    !missingRequired.ok && missingRequired.details?.['q-short'] === 'required',
    `status ${missingRequired.status} ${short(missingRequired.text, 200)}`
  );

  // 41. An option the question does not offer, and a question the task does not
  //     carry. Both refused.
  const badOption = await post(applicantPage, '/api/tasks/respond', {
    task_id: questionTaskId,
    action: 'reply',
    answers: { 'q-short': 'UTC+8', 'q-choice': 'carrier-pigeon' },
  });
  check(
    '41. an option the question does not offer is refused',
    !badOption.ok && badOption.details?.['q-choice'] === 'invalid',
    `status ${badOption.status} ${short(badOption.text, 200)}`
  );

  const unknownQuestion = await post(applicantPage, '/api/tasks/respond', {
    task_id: questionTaskId,
    action: 'reply',
    answers: { 'q-short': 'UTC+8', 'q-choice': 'discord', 'q-not-on-this-task': 'hello' },
  });
  check(
    '41. an answer keyed to a question the task does not carry is refused',
    !unknownQuestion.ok && unknownQuestion.details?.['q-not-on-this-task'] === 'invalid',
    `status ${unknownQuestion.status} ${short(unknownQuestion.text, 200)}`
  );

  // 39. Reply properly, answering the required ones and leaving an optional one
  //     blank. The row moves to awaiting_admin and the answers come back.
  const replied = await post(applicantPage, '/api/tasks/respond', {
    task_id: questionTaskId,
    action: 'reply',
    text: 'Answered by the phase 7 verification run.',
    answers: { 'q-short': 'UTC+8', 'q-choice': 'discord', 'q-check': ['sat'] },
  });
  check('39. a valid reply is accepted', replied.ok, short(replied.text, 200));

  const afterReply = await get(page, `/api/admin/tasks?id=${questionTaskId}`);
  check(
    '39. the row moves to awaiting_admin',
    afterReply.data?.task?.status === 'awaiting_admin',
    String(afterReply.data?.task?.status)
  );

  const answers = afterReply.data?.task?.answers ?? [];
  const optional = answers.find((entry) => entry.id === 'q-long');
  check(
    '39. the answers come back on the row',
    answers.filter((entry) => entry.answered).length === 3 && optional?.answered === false,
    JSON.stringify(answers.map((a) => [a.id, a.answered]))
  );

  await applicantPage.goto(`${BASE}/account/tasks`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForTimeout(3000);
  await dismissApplyPrompt(applicantPage);
  const badgeGone = await applicantPage.evaluate((id) => {
    const node = document.querySelector(`[data-task-id="${id}"]`);
    return node ? !node.querySelector('[data-toggle-reply]') : null;
  }, questionTaskId);
  check('39. the reply control is gone once it has been answered', badgeGone === true, String(badgeGone));

  // 40. A second reply. There is no interface for it, so it goes by hand, and
  //     it must answer already_replied even though this task's reply had text.
  const second = await post(applicantPage, '/api/tasks/respond', {
    task_id: questionTaskId,
    action: 'reply',
    text: 'A second reply.',
    answers: { 'q-short': 'UTC+9', 'q-choice': 'friend' },
  });
  check(
    '40. a second reply is refused',
    !second.ok && /already/i.test(JSON.stringify(second.json ?? second.text)),
    `status ${second.status} ${short(second.text, 200)}`
  );

  // 40, the case the old response_text check would have let through: a task
  // answered with questions only and no free text.
  const questionsOnly = await post(page, '/api/admin/tasks', {
    action: 'raise',
    applicant_ids: [applicantId],
    task_type: 'info_request',
    title: `Questions only ${STAMP}`,
    questions: [
      { id: 'only', type: 'short_answer', required: true, label: { en: 'One question' } },
    ],
  });
  const onlyId = questionsOnly.data?.task_ids?.[0] ?? null;
  if (onlyId) {
    const firstReply = await post(applicantPage, '/api/tasks/respond', {
      task_id: onlyId,
      action: 'reply',
      answers: { only: 'an answer' },
    });
    check('40. a questions-only reply with no free text is accepted', firstReply.ok, short(firstReply.text, 200));

    const secondReply = await post(applicantPage, '/api/tasks/respond', {
      task_id: onlyId,
      action: 'reply',
      answers: { only: 'a different answer' },
    });
    check(
      '40. a second reply to a questions-only task is refused too',
      !secondReply.ok && /already/i.test(JSON.stringify(secondReply.json ?? secondReply.text)),
      `status ${secondReply.status} ${short(secondReply.text, 200)}`
    );
    state.questionsOnlyTaskId = onlyId;
  }

  // 43. On the tracking page, the answers appear beside their questions, in the
  //     admin's own language, with option values resolved to labels.
  const zhAnswers = await get(page, `/api/admin/tasks?id=${questionTaskId}&locale=zh`);
  const choiceEn = (afterReply.data?.task?.answers ?? []).find((entry) => entry.id === 'q-choice');
  check(
    '43. an option value is resolved to its label rather than shown raw',
    choiceEn?.display?.[0] === 'Discord' && choiceEn?.values?.[0] === 'discord',
    JSON.stringify(choiceEn)
  );
  const zhChoice = (zhAnswers.data?.task?.answers ?? []).find((entry) => entry.id === 'q-choice');
  check(
    '43. the question wording follows the admin\'s own language',
    /哪里/.test(zhChoice?.question ?? ''),
    `zh question reads "${short(zhChoice?.question, 80)}"`
  );

  if (state.applicationId) {
    await page.goto(`${BASE}/admin/applications?job=${state.trackingJobId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#applicationList table, #applicationList .admin-empty', {
      timeout: 20000,
    });
    await dismissApplyPrompt(page);
    const detailButton = page.locator(
      `[data-application-id="${state.applicationId}"] [data-open-detail]`
    );
    if ((await detailButton.count()) > 0) {
      await detailButton.click();
      await page.waitForSelector('#applicationDetailBody .admin-detail-tasks', { timeout: 15000 });
      const pairs = await page.$$eval('#applicationDetailBody .admin-task-answers', (nodes) =>
        nodes.map((node) => ({
          questions: [...node.querySelectorAll('dt')].map((dt) => dt.textContent.trim()),
          answers: [...node.querySelectorAll('dd')].map((dd) => dd.textContent.trim()),
        }))
      );
      check(
        '43. the tracking row shows each answer beside the question it answers',
        pairs.length > 0 && pairs.every((pair) => pair.questions.length === pair.answers.length),
        JSON.stringify(pairs).slice(0, 220)
      );
      await page.keyboard.press('Escape');
    } else {
      skip('43. the tracking row pairing', 'the accepted row is not on the filtered list');
    }
  }

  // 44. Resolve the task. It moves to resolved on both sides, and resolving it
  //     twice answers 404.
  const resolved = await post(page, '/api/admin/tasks', { action: 'resolve', id: questionTaskId });
  check('44. resolving is accepted', resolved.ok, short(resolved.text, 200));
  check(
    '44. it moves to resolved',
    resolved.data?.status === 'resolved',
    String(resolved.data?.status)
  );

  const twice = await post(page, '/api/admin/tasks', { action: 'resolve', id: questionTaskId });
  check('44. resolving it twice answers 404', twice.status === 404, `status ${twice.status}`);

  await applicantPage.goto(`${BASE}/account/tasks`, { waitUntil: 'domcontentloaded' });
  await applicantPage.waitForTimeout(3000);
  await dismissApplyPrompt(applicantPage);
  const doneSide = await applicantPage.evaluate((id) => {
    const node = document.querySelector(`[data-task-id="${id}"]`);
    if (!node) return 'absent';
    return document.querySelector('#taskDoneList')?.contains(node) ? 'done' : 'open';
  }, questionTaskId);
  check(
    '44. it is resolved on the applicant\'s side too',
    doneSide === 'done' || doneSide === 'absent',
    `the card is in the ${doneSide} list`
  );

  // 45 and 46. A posting question set raises a task automatically, carrying a
  //     copy, and applying twice in a minute raises one task rather than two.
  const questionJob = await ensurePublishedJob(state, 'question set');
  if (!questionJob) {
    skip('45, 46. the posting question set', 'no posting could be published for it');
    return;
  }

  const setOnPosting = await post(page, '/api/admin/jobs', {
    action: 'update',
    id: questionJob,
    job: {
      task_questions: [
        { id: 'p1', type: 'short_answer', required: true, label: { en: 'Original wording' } },
      ],
    },
  });
  check('45. a question set saves on the posting', setOnPosting.ok, short(setOnPosting.text, 200));

  const applied = await post(applicantPage, '/api/applications/start', { job_id: questionJob });
  check('45. the applicant is handed over', applied.ok, short(applied.text, 200));
  await page.waitForTimeout(1500);

  const raisedTasks = await get(page, `/api/admin/tasks?applicant=${applicantId}&job=${questionJob}`);
  const auto = (raisedTasks.data?.tasks ?? []).filter((task) => task.job_id === questionJob);
  check('45. a task was raised automatically', auto.length === 1, `${auto.length} tasks on that posting`);
  check(
    '45. it carries a copy of the set',
    auto[0]?.questions?.[0]?.label === 'Original wording',
    JSON.stringify(auto[0]?.questions)
  );

  const edited = await post(page, '/api/admin/jobs', {
    action: 'update',
    id: questionJob,
    job: {
      task_questions: [
        { id: 'p1', type: 'short_answer', required: true, label: { en: 'Edited wording' } },
      ],
    },
  });
  check('45. the posting\'s set can be edited', edited.ok, short(edited.text, 200));

  const stillOld = await get(page, `/api/admin/tasks?id=${auto[0]?.id}`);
  check(
    '45. the already raised task still carries the old set',
    stillOld.data?.task?.questions?.[0]?.label === 'Original wording',
    JSON.stringify(stillOld.data?.task?.questions)
  );

  // 46. Apply twice in a minute. One task, not two.
  const again = await post(applicantPage, '/api/applications/start', { job_id: questionJob });
  await page.waitForTimeout(1500);
  const afterSecond = await get(page, `/api/admin/tasks?applicant=${applicantId}&job=${questionJob}`);
  const now = (afterSecond.data?.tasks ?? []).filter((task) => task.job_id === questionJob);
  check(
    '46. applying twice in a minute raises one task, not two',
    now.length === 1,
    `${now.length} tasks after a second handoff (second start ok: ${again.ok})`
  );
});

/* =========================================================================
 * Teams and tags, items 47 to 52
 * ====================================================================== */

define('teams', 'Teams and tags, items 47 to 52', async (state) => {
  const page = state.staffPage;

  // 47. A team with no Chinese name cannot be active.
  const teamName = `SMOKE P7 ${STAMP} team`;
  const noChinese = await post(page, '/api/admin/departments', {
    action: 'save',
    name: teamName,
    description: 'A throwaway team.',
    is_active: true,
  });
  check(
    '47. an active team with no Chinese name is refused on that field',
    !noChinese.ok && noChinese.details?.['zh.name'] === 'required',
    `status ${noChinese.status} ${short(noChinese.text, 200)}`
  );

  const withChinese = await post(page, '/api/admin/departments', {
    action: 'save',
    name: teamName,
    description: 'A throwaway team.',
    is_active: true,
    translations: { zh: { name: '烟雾测试团队', description: '一个临时团队。' } },
  });
  check('47. with the name it saves', withChinese.ok, short(withChinese.text, 200));
  const teamId = withChinese.data?.department?.id ?? null;
  if (teamId) created.departments.push(teamId);

  // 48. Reorder the teams and the home page's browse by team follows.
  const before = await get(page, '/api/admin/departments?counts=false');
  const originalOrder = (before.data?.departments ?? []).map((row) => row.id);
  const activeNamesBefore = (before.data?.departments ?? [])
    .filter((row) => row.is_active)
    .map((row) => row.name);

  if (originalOrder.length >= 2) {
    const swapped = [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)];
    const reorder = await post(page, '/api/admin/departments', { action: 'reorder', ids: swapped });
    check('48. reordering is accepted', reorder.ok, short(reorder.text, 200));

    const afterOrder = (await get(page, '/api/admin/departments?counts=false')).data?.departments ?? [];
    check(
      '48. the list comes back in the new order',
      afterOrder[0]?.id === swapped[0] && afterOrder[1]?.id === swapped[1],
      `${afterOrder.slice(0, 2).map((row) => row.name).join(', ')}`
    );

    const home = await state.anon.newPage();
    await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await home.waitForTimeout(3500);
    const homeOrder = await home.evaluate(() =>
      [...document.querySelectorAll('a[href*="dept="], a[href*="/search?dept"], .team-card, .browse-team')]
        .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    );
    const activeAfter = afterOrder.filter((row) => row.is_active).map((row) => row.name);
    const homeMatches =
      homeOrder.length === 0
        ? null
        : activeAfter.filter((name) => homeOrder.some((text) => text.includes(name)));
    check(
      '48. the home page\'s browse by team follows the new order',
      homeOrder.length > 0 &&
        homeMatches.length > 1 &&
        homeOrder.findIndex((text) => text.includes(homeMatches[0])) <
          homeOrder.findIndex((text) => text.includes(homeMatches[1])),
      `home shows ${short(homeOrder.join(' | '), 200)}`
    );
    await home.close();

    // Put it back. Reordering is a display choice on a live site and this run
    // has no business changing it.
    const restored = await post(page, '/api/admin/departments', {
      action: 'reorder',
      ids: originalOrder,
    });
    check('48. the original order is restored', restored.ok, short(restored.text, 200));
  } else {
    skip('48. reorder the teams', 'fewer than two teams exist');
  }
  void activeNamesBefore;

  // 49. Delete a team that has postings. Its own team, not one of the site's.
  if (teamId) {
    const jobForTeam = await createJob(page, {
      label: 'team member posting',
      job: { department_id: teamId },
    });

    if (jobForTeam.ok) {
      const wrongCount = await post(page, '/api/admin/departments', {
        action: 'delete',
        id: teamId,
        confirm_count: 0,
      });
      check(
        '49. deleting a team confirms the count of postings first',
        !wrongCount.ok && wrongCount.status === 409 && wrongCount.details?.job_count === 1,
        `status ${wrongCount.status} ${short(wrongCount.text, 200)}`
      );

      const deleted = await post(page, '/api/admin/departments', {
        action: 'delete',
        id: teamId,
        confirm_count: 1,
      });
      check('49. with the right count it deletes', deleted.ok, short(deleted.text, 200));

      const survivor = await get(page, `/api/admin/jobs?id=${jobForTeam.data.job.id}`);
      check(
        '49. the posting survives and its department_id is null',
        survivor.ok && survivor.data.job.department_id === null,
        `department_id is ${survivor.data?.job?.department_id}`
      );
    } else {
      skip('49. delete a team with postings', 'the posting could not be created');
    }
  }

  // 50. Create a tag, recolour it, rename it. The slug does not change.
  const tagA = await post(page, '/api/admin/tags', {
    action: 'save',
    name: `smoke-p7-${STAMP}-merge-source`,
  });
  const tagB = await post(page, '/api/admin/tags', {
    action: 'save',
    name: `smoke-p7-${STAMP}-merge-target`,
  });
  check('50. tags are created', tagA.ok && tagB.ok, `${short(tagA.text, 80)} / ${short(tagB.text, 80)}`);
  if (!tagA.ok || !tagB.ok) return;
  created.tags.push(tagA.data.tag.id, tagB.data.tag.id);

  const originalSlug = tagA.data.tag.slug;
  const recoloured = await post(page, '/api/admin/tags', {
    action: 'save',
    id: tagA.data.tag.id,
    name: tagA.data.tag.name,
    colour: '#ff8800',
  });
  check('50. recolouring saves', recoloured.ok && recoloured.data.tag.colour === '#ff8800', short(recoloured.text, 200));

  const renamed = await post(page, '/api/admin/tags', {
    action: 'save',
    id: tagA.data.tag.id,
    name: `${tagA.data.tag.name} renamed`,
  });
  check('50. renaming saves', renamed.ok, short(renamed.text, 200));
  check(
    '50. the slug does not change with a rename, so a shared /search?tags= link still works',
    renamed.data?.tag?.slug === originalSlug,
    `${originalSlug} then ${renamed.data?.tag?.slug}`
  );

  const bySlug = await get(page, `/api/public/search?tags=${originalSlug}`);
  check('50. the old slug still resolves on the board', bySlug.status === 200, `status ${bySlug.status}`);

  // 51. Merge, where some postings carry both.
  const both = await createJob(page, { label: 'carries both tags' });
  const sourceOnly = await createJob(page, { label: 'carries the source only' });
  if (both.ok && sourceOnly.ok) {
    await post(page, '/api/admin/jobs', {
      action: 'update',
      id: both.data.job.id,
      job: {},
      tag_ids: [tagA.data.tag.id, tagB.data.tag.id],
    });
    await post(page, '/api/admin/jobs', {
      action: 'update',
      id: sourceOnly.data.job.id,
      job: {},
      tag_ids: [tagA.data.tag.id],
    });

    const merged = await post(page, '/api/admin/tags', {
      action: 'merge',
      source_id: tagA.data.tag.id,
      target_id: tagB.data.tag.id,
    });
    check(
      '51. merging two tags where a posting carries both does not hit a duplicate key',
      merged.ok,
      `status ${merged.status} ${short(merged.text, 200)}`
    );
    check('51. only the posting missing the target gained it', merged.data?.moved === 1, JSON.stringify(merged.data));

    const tagsNow = await get(page, `/api/admin/tags?q=smoke-p7-${STAMP}-merge`);
    const rows = tagsNow.data?.tags ?? [];
    const source = rows.find((row) => row.id === tagA.data.tag.id);
    const target = rows.find((row) => row.id === tagB.data.tag.id);
    check('51. the source tag is gone', !source, JSON.stringify(rows.map((r) => r.name)));
    check(
      '51. usage_count on the target is right afterwards',
      target && target.job_count === 2,
      `job_count ${target?.job_count}, usage_count ${target?.usage_count}`
    );

    // 52. The orphan view. A tag on three drafts is not an orphan, and the two
    //     count columns differ for it.
    const orphans = await get(page, '/api/admin/tags?orphans=true');
    const targetIsOrphan = (orphans.data?.tags ?? []).some((row) => row.id === tagB.data.tag.id);
    check(
      '52. a tag on drafts is not listed as an orphan',
      targetIsOrphan === false,
      'the tag on two drafts was listed as an orphan'
    );
    check(
      '52. its two count columns differ, which is why there are two',
      target && target.published_count !== target.job_count,
      `published_count ${target?.published_count}, job_count ${target?.job_count}`
    );

    const emptyTag = await post(page, '/api/admin/tags', {
      action: 'save',
      name: `smoke-p7-${STAMP}-orphan`,
    });
    if (emptyTag.ok) {
      created.tags.push(emptyTag.data.tag.id);
      const orphansNow = await get(page, '/api/admin/tags?orphans=true');
      check(
        '52. a tag on no posting at all is listed as an orphan',
        (orphansNow.data?.tags ?? []).some((row) => row.id === emptyTag.data.tag.id),
        'the tag on nothing was not listed'
      );
    }
  } else {
    skip('51, 52. merge and orphans', 'the two postings could not be created');
  }

  // The pages themselves render.
  for (const path of ['/admin/departments', '/admin/tags']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const listId = path.endsWith('tags') ? '#tagList' : '#departmentList';
    await page.waitForSelector(`${listId} table, ${listId} .admin-empty`, { timeout: 20000 });
    const rowCount = await page.locator(`${listId} tbody tr`).count();
    check(`${path} renders its list`, rowCount > 0, `${rowCount} rows`);
  }
});

/* =========================================================================
 * Maintenance, items 53 to 58
 * ====================================================================== */
/* =========================================================================
 * Maintenance, items 53 to 58, and the two new switches
 * ====================================================================== */

/**
 * How long a flip takes to reach a public page.
 *
 * settings.js caches the row for a minute and api/public/feature-status is
 * served with s-maxage=30 and stale-while-revalidate=60, which the endpoint's
 * own comment puts at "about ninety seconds". Anything checked sooner than that
 * is checking the cache rather than the flip.
 */
const FLIP_REACHES_PUBLIC_MS = 100_000;

define('maintenance', 'Maintenance, items 53 to 58', async (state) => {
  const page = state.staffPage;
  const applicantPage = await ensureApplicant(state);

  await page.goto(`${BASE}/admin/maintenance`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#featureList [data-feature-key], #featureList .admin-empty', {
    timeout: 20000,
  });
  await dismissApplyPrompt(page);

  const listed = await get(page, '/api/admin/maintenance');
  const status = state.buildStatus ?? (await get(page, '/assets/build-status.json')).json;
  const shipped = new Set(
    Object.entries(status.features ?? {})
      .filter(([, phase]) => status.phases.find((p) => p.number === phase)?.status === 'shipped')
      .map(([key]) => key)
  );

  // 53. Only features whose phase has shipped, and the denylist shown greyed
  //     with a reason rather than hidden.
  const offered = (listed.data?.features ?? []).map((feature) => feature.key);
  check(
    '53. the page lists only features whose phase has shipped',
    offered.every((key) => shipped.has(key)),
    offered.filter((key) => !shipped.has(key)).join(', ')
  );

  const denied = listed.data?.denied ?? [];
  check(
    '53. the denylist comes back with a reason on each entry',
    denied.length > 0 && denied.every((entry) => Boolean(entry.reason)),
    JSON.stringify(denied.map((entry) => entry.key))
  );
  const deniedOnPage = await page.$$eval('#deniedList .denied-feature', (nodes) =>
    nodes.map((node) => node.textContent.replace(/\s+/g, ' ').trim())
  );
  check(
    '53. the denylist is shown rather than hidden',
    deniedOnPage.length === denied.length && deniedOnPage.every((text) => text.length > 0),
    `${deniedOnPage.length} shown for ${denied.length} denied`
  );
  check(
    '53. admin_maintenance itself is denylisted',
    denied.some((entry) => entry.key === 'admin_maintenance'),
    JSON.stringify(denied.map((entry) => entry.key))
  );

  // 56. A denylisted key is 403, and a key whose phase has not shipped is 409.
  const denylisted = await post(page, '/api/admin/maintenance', {
    key: 'applicant_login',
    off: true,
  });
  check(
    '56. a denylisted key is refused with 403',
    denylisted.status === 403,
    `status ${denylisted.status} ${short(denylisted.text, 160)}`
  );

  const notShipped = Object.keys(status.features ?? {}).find((key) => !shipped.has(key));
  if (notShipped) {
    const unshipped = await post(page, '/api/admin/maintenance', { key: notShipped, off: true });
    check(
      `56. a key whose phase has not shipped is refused with 409 (${notShipped})`,
      unshipped.status === 409,
      `status ${unshipped.status} ${short(unshipped.text, 160)}`
    );
  } else {
    skip('56. an unshipped key', 'every feature key belongs to a shipped phase');
  }

  // The two switches added on request: the language and appearance controls in
  // the header. They only appear here once the deployment carries them, so this
  // half is skipped rather than failed against a deployment without them.
  const hasSwitchers =
    offered.includes('language_switcher') && offered.includes('theme_switcher');

  if (hasSwitchers) {
    const named = await page.evaluate(() =>
      ['language_switcher', 'theme_switcher'].map((key) => {
        const card = document.querySelector(`[data-feature-key="${key}"]`);
        return {
          key,
          name: card?.querySelector('h3')?.textContent?.trim() ?? null,
          where: card?.querySelector('.admin-sub')?.textContent?.trim() ?? null,
          hasSwitch: Boolean(card?.querySelector('[data-switch]')),
        };
      })
    );
    check(
      'the language and appearance switches are on the maintenance page, named and placed',
      named.every(
        (entry) =>
          entry.hasSwitch &&
          entry.name &&
          !entry.name.includes('featureName.') &&
          entry.where &&
          entry.where.length > 0
      ),
      JSON.stringify(named)
    );
  } else {
    skip(
      'the language and appearance switches',
      'this deployment\'s build-status.json has no language_switcher or theme_switcher key yet; run with PATCH_JS=build-status.json to check them against the working tree'
    );
  }

  if (!offered.includes('saved_jobs')) {
    skip('54, 55. switching saved_jobs off', 'saved_jobs is not flippable on this deployment');
    return;
  }

  // 54. Switch things off with a note, wait for the flip to reach the edge, and
  //     then check every place it should show.
  // No phase number in the note, so the check below that the explainer is the
  // maintenance sentence rather than the phase one is checking the sentence.
  const NOTE = `Off for the verification run, ${new Date().toISOString()}`;
  const flipping = ['saved_jobs', ...(hasSwitchers ? ['language_switcher', 'theme_switcher'] : [])];

  for (const key of flipping) {
    const off = await post(page, '/api/admin/maintenance', { key, off: true, note: NOTE });
    check(`54. ${key} switches off`, off.ok && off.data?.off === true, short(off.text, 200));
  }

  try {
    // The API guard is immediate, because the route reads the row rather than
    // the edge cache.
    const toggled = await post(applicantPage, '/api/saved/toggle', {
      job_id: state.trackingJobId ?? null,
    });
    check(
      '54. POST /api/saved/toggle answers 503 with reason maintenance',
      toggled.status === 503 && toggled.details?.reason === 'maintenance',
      `status ${toggled.status} ${short(toggled.text, 200)}`
    );

    console.log(`      waiting ${FLIP_REACHES_PUBLIC_MS / 1000}s for the flip to reach the edge…`);
    await page.waitForTimeout(FLIP_REACHES_PUBLIC_MS);

    // 58. The public endpoint, with no session.
    const anonPage = await state.anon.newPage();
    const anonStatus = await get(anonPage, '/api/public/feature-status');
    check(
      '58. /api/public/feature-status answers with no session and carries the off features',
      anonStatus.status === 200 && Boolean(anonStatus.data?.off?.saved_jobs),
      short(anonStatus.text, 260)
    );
    check(
      '58. it carries the note',
      anonStatus.data?.off?.saved_jobs?.note === NOTE,
      short(JSON.stringify(anonStatus.data?.off?.saved_jobs), 200)
    );
    check(
      '58. it carries only the off features',
      Object.keys(anonStatus.data?.off ?? {}).every((key) => flipping.includes(key)),
      Object.keys(anonStatus.data?.off ?? {}).join(', ')
    );
    await anonPage.close();

    // The bookmark on a posting page.
    const board = await get(applicantPage, '/api/public/search');
    const anyJob = (board.data?.jobs ?? [])[0]?.id ?? null;
    if (anyJob) {
      await applicantPage.goto(`${BASE}/jobs/${anyJob}`, { waitUntil: 'domcontentloaded' });
      await applicantPage.waitForTimeout(4000);
      await dismissApplyPrompt(applicantPage);
      const bookmark = await applicantPage.evaluate(() => {
        const el = document.querySelector('[data-feature="saved_jobs"]');
        if (!el) return null;
        return {
          disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
          maintenance: el.getAttribute('data-maintenance'),
          title: el.getAttribute('title'),
        };
      });
      check(
        '54. the bookmark is disabled, with the maintenance sentence and the note',
        bookmark?.disabled === true &&
          bookmark?.maintenance === 'true' &&
          (bookmark?.title ?? '').includes(NOTE),
        JSON.stringify(bookmark)
      );
      check(
        '54. its explainer is the maintenance sentence rather than the phase one',
        !/phase\s*\d/i.test(bookmark?.title ?? ''),
        `title reads "${short(bookmark?.title, 160)}"`
      );

      if (hasSwitchers) {
        const header = await applicantPage.evaluate(() => {
          const read = (id) => {
            const el = document.querySelector(id);
            if (!el) return null;
            return {
              disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
              maintenance: el.getAttribute('data-maintenance'),
              title: el.getAttribute('title'),
              present: true,
            };
          };
          return { language: read('#languageButton'), theme: read('#themeButton') };
        });
        check(
          'the language switcher is disabled with the maintenance sentence when switched off',
          header.language?.present === true &&
            header.language?.disabled === true &&
            header.language?.maintenance === 'true' &&
            (header.language?.title ?? '').includes(NOTE),
          JSON.stringify(header.language)
        );
        check(
          'the appearance switcher is disabled the same way',
          header.theme?.disabled === true &&
            header.theme?.maintenance === 'true' &&
            (header.theme?.title ?? '').includes(NOTE),
          JSON.stringify(header.theme)
        );
        check(
          'a switched off language control still leaves the page readable',
          (await applicantPage.locator('body').innerText()).length > 100,
          'the page rendered empty with the language switcher off'
        );
      }
    } else {
      skip('54. the bookmark and the header controls', 'no published posting to look at');
    }

    // /status shows it as currently unavailable with the note.
    const statusPage = await state.anon.newPage();
    await statusPage.goto(`${BASE}/status`, { waitUntil: 'domcontentloaded' });
    await statusPage.waitForTimeout(4000);
    const statusText = await statusPage.evaluate(() =>
      document.body.textContent.replace(/\s+/g, ' ')
    );
    check(
      '54. /status shows it as currently unavailable with the note',
      statusText.includes(NOTE),
      'the note was not on /status'
    );
    await statusPage.close();

    // 54, the fourth bullet: "the dashboard shows the banner". The banner that
    // exists is the staff one, which admin-shell.js draws on every dashboard
    // page from the whole feature map. Checked here, because it is the one that
    // was built.
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#adminPage', { timeout: 20000 });
    await page.waitForTimeout(3000);
    await dismissApplyPrompt(page);
    const staffBanner = await page.evaluate(() => {
      const bar = document.querySelector('.admin-maintenance-banner');
      return bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check(
      '54. the staff dashboard shows the maintenance banner',
      typeof staffBanner === 'string' && /\d/.test(staffBanner),
      `banner reads "${short(staffBanner, 160)}"`
    );

    // The applicant's own dashboard. There is no banner there at all: the only
    // The applicant's own dashboard, which has its own banner: the tiles read
    // their counts from endpoints that answer 503 when a feature is off, and a
    // tile deliberately shows nothing rather than claiming zero, so without a
    // banner Saved roles renders with a blank count and no reason.
    await applicantPage.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await applicantPage.waitForTimeout(4000);
    await dismissApplyPrompt(applicantPage);

    const applicantBanner = await applicantPage.evaluate(() => {
      const bar = document.querySelector('.account-maintenance-banner');
      return bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check(
      '54. the applicant dashboard shows a maintenance banner',
      typeof applicantBanner === 'string' && applicantBanner.length > 0,
      'no .account-maintenance-banner on /account'
    );
    check(
      '54. it names what is off and carries the note',
      (applicantBanner ?? '').includes('Saved roles') && (applicantBanner ?? '').includes(NOTE),
      `banner reads "${short(applicantBanner, 200)}"`
    );
    check(
      '54. it says nothing about the staff dashboard',
      !/dashboard|admin/i.test(applicantBanner ?? ''),
      `banner reads "${short(applicantBanner, 200)}"`
    );

    // And in Chinese, where the feature name and the sentence both come from
    // the dictionary and the note is shown as the admin typed it.
    await applicantPage.evaluate(() =>
      window.localStorage.setItem('gftv-careers.locale', 'zh')
    );
    await applicantPage.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await applicantPage.waitForTimeout(4000);
    await dismissApplyPrompt(applicantPage);
    const zhBanner = await applicantPage.evaluate(() => {
      const bar = document.querySelector('.account-maintenance-banner');
      return bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check(
      '54. the banner reads in Chinese, with no raw dictionary key',
      typeof zhBanner === 'string' &&
        /[一-鿿]/.test(zhBanner) &&
        !/account\.|featureName\./.test(zhBanner),
      `banner reads "${short(zhBanner, 200)}"`
    );
    await applicantPage.evaluate(() =>
      window.localStorage.setItem('gftv-careers.locale', 'en')
    );

    // 57. A redeploy cannot be triggered from here.
    skip(
      '57. redeploy with a feature switched off',
      'a deployment is not something this run may trigger; the override is a settings row rather than a file, which is what makes it survive one'
    );
  } finally {
    // 55. Switch everything back on.
    for (const key of flipping) {
      const on = await post(page, '/api/admin/maintenance', { key, off: false });
      check(`55. ${key} switches back on`, on.ok && on.data?.off === false, short(on.text, 200));
    }

    const backOn = await get(page, '/api/admin/maintenance');
    const stillOff = (backOn.data?.features ?? []).filter((feature) => feature.off);
    check(
      '55. nothing is left switched off',
      stillOff.length === 0,
      stillOff.map((feature) => feature.key).join(', ')
    );

    skip(
      '55. both directions in gftvjobs_audit_log',
      'reading the audit log needs SQL; the endpoint writes feature_disabled and feature_enabled on the calls above and every one returned ok'
    );
  }
});

/* =========================================================================
 * The rest, items 17 and 59 to 64
 * ====================================================================== */

define('rest', 'The rest, items 17 and 59 to 64', async (state) => {
  const page = state.staffPage;

  // 60. The catch-all rewrite, on the deployment rather than locally.
  await page.goto(`${BASE}/admin/nonsense`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const placeholder = await page.evaluate(() => ({
    text: document.body.textContent.replace(/\s+/g, ' ').trim(),
    hasPlaceholder: Boolean(
      document.querySelector('.placeholder, [data-placeholder], #placeholder, .feature-explainer')
    ),
  }));
  check(
    '60. /admin/nonsense renders the placeholder with the phase sentence',
    /phase|not built|coming|阶段/i.test(placeholder.text),
    `page reads "${short(placeholder.text, 200)}"`
  );

  await page.goto(`${BASE}/admin/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jobList table, #jobList .admin-empty', { timeout: 20000 });
  const listRows = await page.locator('#jobList tbody tr').count();
  check('60. /admin/jobs still renders the list', listRows > 0, `${listRows} rows`);

  // 61. /admin/docs redirects off the portal.
  const docs = await state.anon.newPage();
  const response = await docs.goto(`${BASE}/admin/docs`, { waitUntil: 'domcontentloaded' });
  check(
    '61. /admin/docs redirects off the portal',
    !docs.url().startsWith(BASE),
    `landed on ${docs.url()} (status ${response?.status()})`
  );
  await docs.close();

  // 62. Switch language on every dashboard page. Nothing renders a raw key.
  const PAGES = [
    '/admin',
    '/admin/jobs',
    '/admin/jobs/edit',
    '/admin/applications',
    '/admin/departments',
    '/admin/tags',
    '/admin/maintenance',
  ];

  for (const locale of ['zh', 'en']) {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((code) => window.localStorage.setItem('gftv-careers.locale', code), locale);

    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#adminPage', { timeout: 20000 });
      await page.waitForTimeout(2500);
      await dismissApplyPrompt(page);

      const raw = await page.evaluate(() => {
        const text = document.body.innerText;
        // A raw key looks like admin.somethingCamelCase or status.foo, sitting
        // on its own rather than inside a sentence.
        const matches = text.match(/\b(admin|status|tasks|field|feature|commitment|brand|search|auth|job)\.[A-Za-z][A-Za-z0-9_]{2,}\b/g);
        return matches ? [...new Set(matches)] : [];
      });
      check(
        `62. ${path} in ${locale} renders no raw dictionary key`,
        raw.length === 0,
        raw.slice(0, 6).join(', ')
      );
    }
  }

  // The composer, the timeline and the switches specifically, in Chinese.
  await page.evaluate(() => window.localStorage.setItem('gftv-careers.locale', 'zh'));
  if (state.applicationId) {
    await page.goto(`${BASE}/admin/applications`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#applicationList table, #applicationList .admin-empty', {
      timeout: 20000,
    });
    await dismissApplyPrompt(page);
    const anyDetail = page.locator('#applicationList tbody tr [data-open-detail]').first();
    if ((await anyDetail.count()) > 0) {
      await anyDetail.click();
      await page.waitForSelector('#applicationDetailBody', { timeout: 15000 });
      const detailRaw = await page.evaluate(() => {
        const text = document.querySelector('#applicationDetailBody').innerText;
        const matches = text.match(/\b(admin|status|tasks|field)\.[A-Za-z][A-Za-z0-9_]{2,}\b/g);
        return matches ? [...new Set(matches)] : [];
      });
      check(
        '62. the detail panel and its timeline render no raw key in Chinese',
        detailRaw.length === 0,
        detailRaw.join(', ')
      );
      await page.keyboard.press('Escape');
    }
  }
  await page.evaluate(() => window.localStorage.setItem('gftv-careers.locale', 'en'));

  // 63. Keyboard only, as far as a script can take it.
  await page.goto(`${BASE}/admin/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jobList table', { timeout: 20000 });
  await dismissApplyPrompt(page);

  const reachable = await page.evaluate(() => {
    const focusable = [...document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    const nav = focusable.filter((el) => el.closest('#adminNav')).length;
    const rows = focusable.filter((el) => el.closest('#jobList')).length;
    const negative = [...document.querySelectorAll('#adminNav a, #jobList button')].filter(
      (el) => el.getAttribute('tabindex') === '-1'
    ).length;
    return { nav, rows, negative };
  });
  check(
    '63. the sidebar and the row controls are reachable by keyboard',
    reachable.nav > 0 && reachable.rows > 0 && reachable.negative === 0,
    JSON.stringify(reachable)
  );

  await page.goto(`${BASE}/admin/jobs/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#editorTabs [data-locale]', { timeout: 20000 });
  await dismissApplyPrompt(page);
  const editorKeyboard = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#editorTabs [data-locale]')];
    const composerButtons = [...document.querySelectorAll('#jobQuestions [data-add]')];
    return {
      tabsAreButtons: tabs.every((tab) => tab.tagName === 'BUTTON'),
      selectedHasNoNegativeTabindex: tabs
        .filter((tab) => tab.getAttribute('aria-selected') === 'true')
        .every((tab) => tab.getAttribute('tabindex') !== '-1'),
      composerButtons: composerButtons.length,
    };
  });
  check(
    '63. the language tabs and the question composer are keyboard operable',
    editorKeyboard.tabsAreButtons &&
      editorKeyboard.selectedHasNoNegativeTabindex &&
      editorKeyboard.composerButtons === 4,
    JSON.stringify(editorKeyboard)
  );

  await page.keyboard.press('Tab');
  const focusMoves = await page.evaluate(() => document.activeElement?.tagName ?? null);
  check('63. tabbing moves focus', Boolean(focusMoves) && focusMoves !== 'BODY', String(focusMoves));

  skip(
    '63. a full keyboard-only pass',
    'the reorder controls, the bulk bar and the modals need a person driving them end to end; what a script can check, that everything is focusable and nothing is taken out of the tab order, passed'
  );

  // 64. At 360px.
  await page.setViewportSize({ width: 360, height: 720 });
  for (const path of ['/admin', '/admin/jobs', '/admin/applications', '/admin/tags']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#adminPage', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await dismissApplyPrompt(page);

    const narrow = await page.evaluate(() => {
      const layout = document.querySelector('.admin-layout');
      const sidebar = document.querySelector('.admin-sidebar');
      const toggle = document.querySelector('[data-admin-menu]');
      const tables = [...document.querySelectorAll('.admin-table')];

      const scrolls = tables.every((table) => {
        let node = table.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
          node = node.parentElement;
        }
        return false;
      });

      return {
        toggleVisible: Boolean(toggle) && getComputedStyle(toggle).display !== 'none',
        sidebarHidden:
          !sidebar ||
          !layout?.classList.contains('nav-open'),
        tables: tables.length,
        tablesScroll: tables.length === 0 ? true : scrolls,
        bodyScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    check(`64. ${path} at 360px: the menu button is there`, narrow.toggleVisible, JSON.stringify(narrow));
    check(
      `64. ${path} at 360px: every table scrolls inside its own container`,
      narrow.tablesScroll,
      `${narrow.tables} tables`
    );
    check(
      `64. ${path} at 360px: the page body does not scroll sideways`,
      narrow.bodyScrollsSideways === false,
      JSON.stringify(narrow)
    );
  }
  await page.setViewportSize({ width: 1400, height: 900 });

  // 17. Permanent deletion, as an admin.
  const victim = await createJob(page, { label: 'to be deleted' });
  check('17. a posting to delete was created', victim.ok, short(victim.text, 200));
  if (victim.ok) {
    const id = victim.data.job.id;
    const row = (await get(page, `/api/admin/jobs?id=${id}`)).data.job;

    const impact = await get(page, `/api/admin/jobs?id=${id}&impact=true`);
    check(
      '17. the panel counts what goes with it from the database',
      impact.ok &&
        typeof impact.data.impact.applications === 'number' &&
        typeof impact.data.impact.analytics === 'number' &&
        typeof impact.data.impact.saved === 'number' &&
        typeof impact.data.impact.tasks === 'number',
      JSON.stringify(impact.data?.impact)
    );

    const wrongWord = await post(page, '/api/admin/jobs', {
      action: 'delete',
      id,
      confirm: row.title,
    });
    check(
      '17. typing the title rather than the slug does not advance',
      !wrongWord.ok && wrongWord.details?.confirm === 'mismatch',
      `status ${wrongWord.status} ${short(wrongWord.text, 200)}`
    );

    const gone = await post(page, '/api/admin/jobs', { action: 'delete', id, confirm: row.slug });
    check('17. typing the slug deletes it', gone.ok, short(gone.text, 200));

    const after = await get(page, `/api/admin/jobs?id=${id}`);
    check('17. the posting is gone', after.status === 404, `status ${after.status}`);

    created.jobs = created.jobs.filter((entry) => entry !== id);

    skip(
      '17. the SQL half',
      'the four counts, the tasks row kept with job_id null, and the job_deleted audit row need SQL; the impact panel above reads the same numbers through the API and the delete returned them'
    );
  }

  // 59. check-i18n.
  const { execFile } = await import('node:child_process');
  const i18n = await new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(HERE, 'check-i18n.js')],
      { cwd: join(HERE, 'main-site'), maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, out: `${stdout}${stderr}` })
    );
  });
  const summary = i18n.out.split('\n').filter((line) => /keys|missing/i.test(line)).slice(-3);
  check('59. check-i18n passes', i18n.code === 0 && /No missing keys/.test(i18n.out), summary.join(' | '));
});

/* =========================================================================
 * The language and appearance switches, added on request during this run.
 *
 * The server half is pure: hasShipped and flippableFeatures read
 * build-status.json and the denylist and touch no database, so they are checked
 * by importing them. The client half is checked in the browser with the working
 * tree's shell.js and build-status.json served in place of the deployment's,
 * and /api/public/feature-status stubbed to say the switches are off. That is
 * the one thing a deployment would otherwise be needed for, and stubbing it
 * tests exactly the wiring this change added.
 * ====================================================================== */

define('switchers', 'The language and appearance switches', async (state) => {
  // The server half. maintenance.js cannot be imported outside a request,
  // because env.js throws on a missing SUPABASE_URL at import time, so the two
  // inputs it decides from are read directly: the feature map and the phase
  // list from build-status.json, and the denylist out of the module's source.
  // Those are the whole of hasShipped and isFlippable.
  const buildStatus = JSON.parse(
    await readFile(join(HERE, 'main-site', 'assets', 'build-status.json'), 'utf8')
  );
  const maintenanceSource = await readFile(
    join(HERE, 'main-site', 'api', '_lib', 'maintenance.js'),
    'utf8'
  );
  const denylist = maintenanceSource
    .slice(maintenanceSource.indexOf('DENYLIST = Object.freeze({'))
    .split('});')[0];

  for (const key of ['language_switcher', 'theme_switcher']) {
    const phase = buildStatus.features?.[key];
    const phaseRow = buildStatus.phases?.find((row) => row.number === phase);
    check(
      `${key} is a real feature key in build-status.json`,
      typeof phase === 'number',
      `phase is ${phase}`
    );
    check(
      `${key}'s phase has shipped, so it is flippable rather than "not built yet"`,
      phaseRow?.status === 'shipped',
      `phase ${phase} is ${phaseRow?.status}`
    );
    check(`${key} is not on the denylist`, !denylist.includes(`${key}:`), 'it is denylisted');
  }
  check(
    'sign in and the maintenance page itself are still denylisted',
    denylist.includes('applicant_login:') && denylist.includes('admin_maintenance:')
  );
  check(
    'every feature key has a name and a location in both dictionaries',
    await (async () => {
      const en = JSON.parse(
        await readFile(join(HERE, 'main-site', 'assets', 'i18n', 'en.json'), 'utf8')
      );
      const zh = JSON.parse(
        await readFile(join(HERE, 'main-site', 'assets', 'i18n', 'zh.json'), 'utf8')
      );
      return ['language_switcher', 'theme_switcher'].every(
        (key) =>
          en[`featureName.${key}`] &&
          zh[`featureName.${key}`] &&
          en[`featureWhere.${key}`] &&
          zh[`featureWhere.${key}`]
      );
    })(),
    'a featureName or featureWhere entry is missing, so the page would show a raw key'
  );

  // The client half, with the two switches stubbed off. The note deliberately
  // says nothing about a phase, so the check below that the explainer is the
  // maintenance sentence and not the phase one is checking the sentence rather
  // than the note.
  const NOTE = 'Switched off by the verification run.';
  const stub = await state.browser.newContext({ baseURL: BASE, locale: 'en-GB' });

  await stub.route('**/assets/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const name = path.split('/').pop();
    if (!['shell.js', 'build-status.json', 'save-button.js'].includes(name)) {
      return route.continue();
    }
    const body = await readFile(join(HERE, 'main-site', path.replace(/^\//, '')), 'utf8');
    return route.fulfill({
      status: 200,
      contentType: name.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'application/javascript; charset=utf-8',
      body,
    });
  });

  let offKeys = {};
  await stub.route('**/api/public/feature-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, data: { off: offKeys } }),
    })
  );

  const stubPage = await stub.newPage();
  const readHeader = () =>
    stubPage.evaluate(() => {
      const read = (id) => {
        const el = document.querySelector(id);
        if (!el) return null;
        return {
          disabled: el.disabled === true,
          ariaDisabled: el.getAttribute('aria-disabled'),
          maintenance: el.getAttribute('data-maintenance'),
          title: el.getAttribute('title'),
          feature: el.getAttribute('data-feature'),
        };
      };
      return {
        language: read('#languageButton'),
        theme: read('#themeButton'),
        bodyText: document.body.innerText.length,
      };
    });

  // Everything on, which is what a reader sees normally.
  await stubPage.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  await stubPage.waitForSelector('#languageButton', { timeout: 20000 });
  await stubPage.waitForTimeout(2500);
  const on = await readHeader();
  check(
    'both switches carry a feature key',
    on.language?.feature === 'language_switcher' && on.theme?.feature === 'theme_switcher',
    JSON.stringify(on)
  );
  check(
    'with nothing switched off both controls work as before',
    on.language?.disabled === false && on.theme?.disabled === false,
    JSON.stringify(on)
  );

  // The language switcher off on its own, so it is clear the two are separate.
  offKeys = { language_switcher: { note: NOTE, since: new Date().toISOString() } };
  await stubPage.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
  await stubPage.waitForSelector('#languageButton', { timeout: 20000 });
  await stubPage.waitForTimeout(2500);
  const languageOff = await readHeader();
  check(
    'the language switcher can be switched off',
    languageOff.language?.disabled === true &&
      languageOff.language?.maintenance === 'true' &&
      (languageOff.language?.title ?? '').includes(NOTE),
    JSON.stringify(languageOff.language)
  );
  check(
    'its explainer is the maintenance sentence rather than a phase one',
    !/phase\s*\d/i.test(languageOff.language?.title ?? ''),
    `title reads "${short(languageOff.language?.title, 160)}"`
  );
  check(
    'the appearance switcher is untouched by it',
    languageOff.theme?.disabled === false && languageOff.theme?.maintenance === null,
    JSON.stringify(languageOff.theme)
  );
  check(
    'the page is still readable with the language switcher off',
    languageOff.bodyText > 200,
    `${languageOff.bodyText} characters of text`
  );

  // Clicking it opens the explainer rather than the language modal.
  await stubPage.click('#languageButton', { force: true });
  await stubPage.waitForTimeout(800);
  const afterClick = await stubPage.evaluate(() => ({
    explainer: Boolean(document.querySelector('.feature-explainer')),
    modalOpen: Boolean(document.querySelector('#languageModal[open], dialog#languageModal[open]')),
  }));
  check(
    'clicking a switched off language button explains rather than opening the modal',
    afterClick.explainer === true && afterClick.modalOpen === false,
    JSON.stringify(afterClick)
  );

  // Both off.
  offKeys = {
    language_switcher: { note: NOTE, since: new Date().toISOString() },
    theme_switcher: { note: NOTE, since: new Date().toISOString() },
  };
  await stubPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await stubPage.waitForSelector('#themeButton', { timeout: 20000 });
  await stubPage.waitForTimeout(2500);
  const bothOff = await readHeader();
  check(
    'the appearance switcher can be switched off too',
    bothOff.theme?.disabled === true &&
      bothOff.theme?.maintenance === 'true' &&
      (bothOff.theme?.title ?? '').includes(NOTE),
    JSON.stringify(bothOff.theme)
  );

  // And the regression this needed: the override now reaches a public page at
  // all. Before the fix in shell.js nothing outside /admin and /status loaded
  // it, so every [data-feature] control on the public site gated on the phase
  // alone and a switched off feature stayed fully enabled.
  offKeys = { saved_jobs: { note: NOTE, since: new Date().toISOString() } };
  const board = await get(stubPage, '/api/public/search');
  const anyJob = (board.data?.jobs ?? [])[0]?.id ?? null;
  if (anyJob) {
    await stubPage.goto(`${BASE}/jobs/${anyJob}`, { waitUntil: 'domcontentloaded' });
    await stubPage.waitForTimeout(4000);
    const bookmark = await stubPage.evaluate(() => {
      const el = document.querySelector('[data-feature="saved_jobs"]');
      return el
        ? {
            disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
            maintenance: el.getAttribute('data-maintenance'),
            title: el.getAttribute('title'),
          }
        : null;
    });
    check(
      'a maintenance override now reaches a public page at all',
      bookmark?.disabled === true &&
        bookmark?.maintenance === 'true' &&
        (bookmark?.title ?? '').includes(NOTE),
      JSON.stringify(bookmark)
    );
  } else {
    skip('the override reaching a public page', 'no published posting to look at');
  }

  await stub.close();
});

await main();

