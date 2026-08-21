// Screenshots of the dashboard at one width, with the working tree's CSS and
// HTML served in place of the deployment's.
//
//   OUT=./shots STAFF_USER=... STAFF_PASS='...' node tests/screenshot.mjs
//   WIDTH=1280 OUT=./shots node tests/screenshot.mjs
//
// A layout check says a page does not scroll sideways. It does not say the page
// looks right, and the two are different questions: every measurement in
// layout-check.mjs passed on a dashboard whose columns were forty pixels wide.
// This is for looking.

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';
const OUT = process.env.OUT ?? join(HERE, 'shots');
const WIDTH = Number(process.env.WIDTH ?? 390);
const LOCAL = process.env.LOCAL !== '0';


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

const STAFF = {
  username: requireEnv('STAFF_USER'),
  password: requireEnv('STAFF_PASS'),
};

const PAGES = [
  ['/admin', 'overview'],
  ['/admin/jobs', 'jobs'],
  ['/admin/jobs/edit', 'editor'],
  ['/admin/applications', 'applications'],
  ['/admin/departments', 'departments'],
  ['/admin/tags', 'tags'],
  ['/admin/maintenance', 'maintenance'],
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE,
  viewport: { width: WIDTH, height: 900 },
  deviceScaleFactor: 2,
  locale: 'en-GB',
});

if (LOCAL) {
  await ctx.route('**/assets/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    try {
      const body = await readFile(join(HERE, 'main-site', pathname.slice(1)), 'utf8');
      const type = pathname.endsWith('.css')
        ? 'text/css'
        : pathname.endsWith('.json')
          ? 'application/json'
          : 'application/javascript';
      return route.fulfill({ status: 200, contentType: `${type}; charset=utf-8`, body });
    } catch {
      return route.fallback();
    }
  });

  // fallback, not continue, so a request this does not serve still reaches the
  // handler registered before it.
  await ctx.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith('/api/')) return route.fallback();

    const relative =
      pathname === '/'
        ? 'index.html'
        : `${pathname.replace(/^\/|\/$/g, '')}${pathname.endsWith('.html') ? '' : '/index.html'}`;

    try {
      const body = await readFile(join(HERE, 'main-site', relative), 'utf8');
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    } catch {
      return route.fallback();
    }
  });
}

const page = await ctx.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#staffLoginForm', { timeout: 20000 });
await page.fill('#username', STAFF.username);
await page.fill('#password', STAFF.password);
await page.click('#staffLoginForm button[type="submit"]');
await page.waitForURL('**/admin', { timeout: 20000 });

for (const [path, name] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  // The applicant prompt opens over the dashboard on a browser holding both
  // sessions, and a screenshot of a modal is not what anybody asked for.
  await page.evaluate(() => document.querySelector('#applyDialog')?.close());
  await page.screenshot({ path: join(OUT, `${WIDTH}-${name}.png`) });
  console.log(`${WIDTH}-${name}.png`);
}

await browser.close();
