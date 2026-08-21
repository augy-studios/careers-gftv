// Does registering an applicant work end to end, and what does the page say
// when it does not?
//
//   node tests/debug-register.mjs
//
// It prints every /api/ response and every field error on the page, which is
// the fastest way to tell a validation refusal from a page that never got as
// far as submitting. Written while working out why the harness thought
// registration had failed: it had not, the page was showing the recovery codes
// and waiting to be clicked through.
//
// It leaves the account it creates behind.

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';
const stamp = Date.now();

/** The account this script creates for itself, so it is not a credential. */
const PASSWORD = 'correct horse battery staple 7';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text());
});
page.on('response', async (r) => {
  if (r.url().includes('/api/')) {
    console.log('API', r.status(), r.url());
    try {
      console.log('   ', (await r.text()).slice(0, 400));
    } catch {}
  }
});

await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#registerForm');
await page.fill('#username', `smoke-dbg-${stamp}`.slice(0, 24));
await page.fill('#display_name', `Smoke Debug`);
await page.fill('#email', `smoke-dbg-${stamp}@example.invalid`);
await page.fill('#password', PASSWORD);
await page.fill('#password_confirm', PASSWORD);
await page.click('#registerForm button[type="submit"]');
await page.waitForTimeout(8000);
console.log('URL', page.url());
const errors = await page.evaluate(() =>
  [...document.querySelectorAll('.field-error, .callout, [role="alert"]')]
    .map((n) => n.textContent.trim())
    .filter(Boolean)
);
console.log('ERRORS', errors);
await browser.close();
