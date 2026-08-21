// Isolate the slug guard. Does the "stop following the title" flag survive a
// redraw, and does typing a title on a translation tab rewrite the slug?
//
//   STAFF_USER=... STAFF_PASS='...' node tests/debug-slug.mjs
//
// It prints the slug and the title after each of eight steps, which is the
// whole diagnosis: the guard lives in a dataset flag on the slug input, and
// drawShared rebuilds that input on every redraw, so the flag dies with it.

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

const stamp = Date.now();

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });

// PATCH=1 serves the working tree's editor, so a fix can be checked against the
// live site before it is deployed.
if (process.env.PATCH === '1') {
  await ctx.route('**/assets/js/admin-job-editor.js', async (route) => {
    const body = await readFile(
      join(HERE, 'main-site', 'assets', 'js', 'admin-job-editor.js'),
      'utf8'
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body,
    });
  });
}

const page = await ctx.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', requireEnv('STAFF_USER'));
await page.fill('#password', requireEnv('STAFF_PASS'));
await page.click('#staffLoginForm button[type="submit"]');
await page.waitForURL('**/admin', { timeout: 20000 });

await page.goto(`${BASE}/admin/jobs/edit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#editorTabBody [data-field="title"]');

const log = async (label) =>
  console.log(
    `${label.padEnd(52)} slug="${await page.inputValue('#jobSlug')}"  title="${await page.inputValue(
      '#editorTabBody [data-field="title"]'
    )}"`
  );

await page.fill('#editorTabBody [data-field="title"]', `Slug Guard ${stamp}`);
await page.waitForTimeout(300);
await log('1. typed a title');

await page.fill('#jobSlug', 'i-typed-this-myself');
await page.waitForTimeout(200);
await log('2. typed a slug by hand');

await page.fill('#editorTabBody [data-field="title"]', `Slug Guard ${stamp} changed`);
await page.waitForTimeout(300);
await log('3. changed the title again (guard should hold)');

// A redraw of the shared panel. The language tab switch is the ordinary one.
await page.click('#editorTabs [data-locale="zh"]');
await page.waitForTimeout(600);
await log('4. switched to the 华文 tab');

await page.click('#editorTabs [data-locale="en"]');
await page.waitForTimeout(600);
await log('5. switched back to English');

await page.fill('#editorTabBody [data-field="title"]', `Slug Guard ${stamp} third`);
await page.waitForTimeout(300);
await log('6. changed the title after the redraw');

// And the translation tab's own title field.
await page.click('#editorTabs [data-locale="zh"]');
await page.waitForTimeout(600);
await page.fill('#jobSlug', 'still-mine');
await page.waitForTimeout(200);
await log('7. on 华文, retyped the slug');
await page.fill('#editorTabBody [data-field="title"]', '中文职位标题');
await page.waitForTimeout(400);
await log('8. typed a Chinese title on the 华文 tab');

await browser.close();
