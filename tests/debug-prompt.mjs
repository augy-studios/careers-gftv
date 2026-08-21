// Does the applicant's "have you applied?" modal open over the staff dashboard
// when one browser holds both sessions? Item 6a says both realms coexisting is
// the supported case.
//
//   node tests/debug-prompt.mjs <applicant-username>
//
// The applicant needs an unanswered apply prompt for there to be anything to
// open. The tab matters: the "once a visit" guard is in sessionStorage, so the
// modal is only skipped in a tab that has already shown it, which is why this
// opens a fresh one per page.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';

/** A required environment variable. No default: a staff password with a
    fallback in a committed file is a staff password in the repository. */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}. See tests/README.md.`);
    process.exit(1);
  }
  return value;
}

const USER = process.argv[2];
const PASS = requireEnv('APPLICANT_PASS');

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });

// PATCH=1 serves the working tree's shell.js, so a fix can be checked against
// the live site before it is deployed.
if (process.env.PATCH === '1') {
  await ctx.route('**/assets/js/shell.js', async (route) => {
    const body = await readFile(join(HERE, 'main-site', 'assets', 'js', 'shell.js'), 'utf8');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body,
    });
  });
}

const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#identifier', USER);
await page.fill('#password', PASS);
await page.click('#loginForm button[type="submit"]');
await page.waitForTimeout(6000);
console.log('applicant signed in, at', page.url());

const pending = await page.request.get(`${BASE}/api/applications/pending`);
console.log('pending prompts:', (await pending.text()).slice(0, 300));

await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', requireEnv('STAFF_USER'));
await page.fill('#password', requireEnv('STAFF_PASS'));
await page.click('#staffLoginForm button[type="submit"]');
await page.waitForURL('**/admin', { timeout: 20000 });
await page.waitForTimeout(5000);

// A new tab, which is the ordinary case: sessionStorage is per tab, so the
// "once a visit" guard has not been set in it.
// The public pages are the control: the prompt must still open there, or the
// fix has traded one problem for a worse one.
for (const path of ['/admin', '/admin/jobs', '/admin/applications', '/search', '/account']) {
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await tab.waitForTimeout(6000);
  const state = await tab.evaluate(() => {
    const el = document.querySelector('#applyDialog');
    if (!el) return null;
    const blocks = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      open: el.open,
      title: document.querySelector('#applyDialogTitle')?.textContent?.trim(),
      centreOfScreenIsTheDialog: Boolean(el.contains(blocks) || blocks === el),
    };
  });
  console.log(`${path.padEnd(22)} applyDialog:`, JSON.stringify(state));
  await tab.close();
}

await browser.close();
