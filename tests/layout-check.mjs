// Layout checks at narrow widths, for the rule in section 3 that a table may
// scroll inside its own box and the page body may not.
//
//   STAFF_USER=... STAFF_PASS='...' node tests/layout-check.mjs
//   PATCH_CSS=1 STAFF_USER=... STAFF_PASS='...' node tests/layout-check.mjs
//
// PATCH_CSS=1 serves main-site/assets/css/app.css from the working tree, so a
// CSS change can be checked against the live site before it is deployed.
//
// What it reports for each page and width:
//
//   scrollsSideways   whether window.scrollTo(5000, 0) actually moves the page
//   widest            the element whose right edge defines the document's
//                     scrollable width, with its ancestor chain, which is the
//                     only quick way to find what is sticking out
//   tightCells        table cells narrower than the floor, which is what makes
//                     a heading break after its first letter
//   crampedButtons    buttons whose text is wrapping onto a second line

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';
const WIDTHS = (process.env.WIDTHS ?? '360,480,768').split(',').map(Number);


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

const PUBLIC_PAGES = ['/', '/search', '/about', '/faq', '/status', '/login', '/register'];

// Only reached with an applicant session, which this script does not hold: they
// redirect to /login and the check runs against that instead. Pass
// APPLICANT_USER and APPLICANT_PASS to have them checked properly.
const ACCOUNT_PAGES = [
  '/account',
  '/account/applications',
  '/account/saved',
  '/account/tasks',
  '/account/settings',
];
const STAFF_PAGES = [
  '/admin',
  '/admin/jobs',
  '/admin/jobs/edit',
  '/admin/applications',
  '/admin/departments',
  '/admin/tags',
  '/admin/maintenance',
];

let failures = 0;

const browser = await chromium.launch();

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      baseURL: BASE,
      viewport: { width, height: 800 },
      locale: 'en-GB',
    });

    if (process.env.PATCH_CSS === '1') {
      await ctx.route('**/assets/css/*.css', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const body = await readFile(join(HERE, 'main-site', path.replace(/^\//, '')), 'utf8');
        return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body });
      });

      // The pages too, so a container class added in the HTML counts. Only the
      // document request, and only where the file exists in the working tree.
      // fallback rather than continue, so anything this does not handle reaches
      // the CSS handler above instead of going straight to the network.
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
    await page.waitForURL('**/admin', { timeout: 20000 }).catch(() => {});

    const applicant = process.env.APPLICANT_USER;
    if (applicant) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('#identifier', applicant);
      await page.fill('#password', process.env.APPLICANT_PASS ?? '');
      await page.click('#loginForm button[type="submit"]');
      await page.waitForURL('**/account**', { timeout: 20000 }).catch(() => {});
    }

    console.log(`\n${'='.repeat(70)}\n${width}px\n${'='.repeat(70)}`);

    const pages = [...PUBLIC_PAGES, ...STAFF_PAGES, ...(applicant ? ACCOUNT_PAGES : [])];

    for (const path of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.evaluate(() => document.querySelector('#applyDialog')?.close());

      const report = await page.evaluate((floorPx) => {
        window.scrollTo(5000, 0);
        const scrolled = window.scrollX;
        window.scrollTo(0, 0);

        const target = document.scrollingElement.scrollWidth;
        let widest = null;
        if (scrolled > 0) {
          for (const el of document.querySelectorAll('*')) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.right < target - 4 || box.right > target + 4) continue;
            const chain = [];
            let node = el;
            while (node && node !== document.documentElement) {
              chain.push(
                `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}` +
                  `${node.className ? '.' + String(node.className).split(' ').filter(Boolean)[0] : ''}`
              );
              node = node.parentElement;
            }
            widest = { right: Math.round(box.right), chain: chain.join(' < ') };
            break;
          }
        }

        const tight = [];
        for (const cell of document.querySelectorAll('th, td')) {
          const box = cell.getBoundingClientRect();
          const text = (cell.textContent ?? '').trim();
          if (text === '' || box.width === 0) continue;
          if (cell.querySelector('input[type="checkbox"]')) continue;
          if (box.width < floorPx) {
            tight.push(`${cell.tagName.toLowerCase()} "${text.slice(0, 24)}" ${Math.round(box.width)}px`);
          }
        }

        const cramped = [];
        for (const button of document.querySelectorAll('.btn, button')) {
          const text = (button.textContent ?? '').trim();
          if (text.length < 2) continue;
          const box = button.getBoundingClientRect();
          if (box.height === 0) continue;
          const lineHeight = parseFloat(getComputedStyle(button).lineHeight) || 20;
          // Two lines of text in a control whose label is three words or fewer
          // is the wrap this is looking for.
          if (box.height > lineHeight * 2.2 && text.split(/\s+/).length <= 3) {
            cramped.push(`"${text.slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
          }
        }

        return { scrolled, target, widest, tight: tight.slice(0, 6), cramped: cramped.slice(0, 6) };
      }, 88);

      const bad = report.scrolled > 0 || report.tight.length > 0 || report.cramped.length > 0;
      if (bad) failures += 1;

      console.log(`${bad ? '✗' : '✓'} ${path}`);
      if (report.scrolled > 0) {
        console.log(`    scrolls sideways by ${report.scrolled}px (document is ${report.target}px)`);
        if (report.widest) console.log(`    widest: ${report.widest.chain}`);
      }
      if (report.tight.length > 0) console.log(`    tight cells: ${report.tight.join(' | ')}`);
      if (report.cramped.length > 0) console.log(`    wrapped buttons: ${report.cramped.join(' | ')}`);
    }

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? 'No layout problems found.' : `${failures} page/width combinations have something to fix.`}`);
