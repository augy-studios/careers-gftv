// Phase 12 verification. From next-steps.md section 2.
//
//   node tests/phase12-test.mjs                     everything that needs nothing
//   node tests/phase12-test.mjs --only=responsive   one or more sections
//
// **Phase 12 is a sweep, not a feature, and that is what this file is for.**
// Every phase before it could be checked by asking whether the new thing works.
// There is no new thing here, so what stands in its place is a written list of
// surfaces with a width against each: a pass with no list is a pass nobody can
// repeat, and "it looked fine" is the likeliest way to ship something wrong in
// a phase like this one.
//
// **The public sections need no deployment, no credentials and no network**,
// the arrangement phases 10 and 11 settled into: `main-site/` is served from
// this working tree over http://127.0.0.1, which is a secure origin as far as
// a browser is concerned. **The admin sections cannot be**, because an admin
// page is a session and a database rather than a document, so they run against
// a deployment with a staff credential and are skipped by name rather than
// failed when there is not one.
//
// Two reductions, both deliberate and both written down rather than implied:
//
//   **Layout is measured in one theme, not four.** The two axes change colours
//   and nothing else — no font, no size, no spacing — so a layout that holds in
//   one holds in all four. What the four combinations do change is contrast,
//   which is measured rather than looked at, and that is part 3's job.
//
//   **The docs site is not here.** Section 12 asks for the responsive check on
//   both sites; `docs-site/` is a scaffold with no pages until phase 13, so its
//   pass goes with the pages it is a pass over. Settled 30 August 2026, and
//   recorded in section 6 rather than silently skipped.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', 'main-site');

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

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

/* -------------------------------------------------------------------------
 * What section 3 fixes, and what this file therefore walks
 * ---------------------------------------------------------------------- */

// 3: "Test at 320, 375, 414, 768, 1024, and 1440."
const WIDTHS = [320, 375, 414, 768, 1024, 1440];

// 3: "No horizontal scrolling at any width down to 320px."
const SCROLL_SLACK = 1;

// A table cell narrower than this is what makes a heading break after its
// first letter. Inherited from layout-check.mjs, which found it by looking.
const CELL_FLOOR = 88;

// Both languages, because 华文 sets its own font stack and Chinese headings do
// not wrap where English ones do. `gftv-careers.locale` is what the inline
// bootstrap in every page reads before first paint.
const LOCALES = ['en', 'zh'];

const PUBLIC_PAGES = ['/', '/search', '/about', '/faq', '/status', '/login', '/register'];

// Signed out, all five redirect to /login, so a run without a credential would
// measure the login page five times and report it as coverage.
const ACCOUNT_PAGES = [
  '/account',
  '/account/applications',
  '/account/saved',
  '/account/tasks',
  '/account/settings',
];

const ADMIN_PAGES = [
  '/admin',
  '/admin/jobs',
  '/admin/applications',
  '/admin/departments',
  '/admin/tags',
  '/admin/maintenance',
];

/* -------------------------------------------------------------------------
 * What the pages are measured with
 * ---------------------------------------------------------------------- */

// **A responsive pass over empty pages proves the chrome and nothing else.**
// The first shape of this file answered every /api/ call with a 503, so /search
// was measured with no result cards in it and the widths were being asked about
// a heading and a filter panel. Content is what overflows.
//
// So the two endpoints that carry content are answered with fixtures, and they
// hold the worst the build allows rather than something typical: a title that
// does not break, a tag at its length limit, a department name longer than its
// column, a uuid, and a posting with no translation so the badge is drawn. A
// page that holds these holds anything an admin can enter.
//
// Everything else still gets a 503, on purpose and loudly: an endpoint nobody
// thought about is a page measured in its error state, and the error state is
// the narrower page. It is better for that to be visible than tidy.

const LONG_TITLE = {
  en: 'Volunteer Subtitle Reviewer and Terminology Coordinator, Mandarin',
  zh: '义务字幕审校暨术语统筹专员（华文）',
};

// 40 characters, which is what validateDeviceName and the tag editor allow.
const LONG_TAG = { en: 'Subtitling, terminology and style guide', zh: '字幕、术语与文体风格指南规范说明' };

function fixtureJob(index, locale) {
  const long = index === 0;
  return {
    id: `aaaaaaaa-bbbb-cccc-dddd-${String(index).padStart(12, '0')}`,
    slug: long ? 'volunteer-subtitle-reviewer-and-terminology-coordinator-mandarin' : `role-${index}`,
    title: long ? LONG_TITLE[locale] : `${locale === 'zh' ? '职位' : 'Role'} ${index}`,
    summary:
      locale === 'zh'
        ? '协助审校字幕与术语，确保用词在各集之间保持一致，并与制作团队沟通。'
        : 'Review subtitles and terminology, keep wording consistent between episodes, and work with the production team.',
    headline: '',
    department: long
      ? {
          id: 'dddddddd-0000-0000-0000-000000000001',
          name: locale === 'zh' ? '内容本地化与字幕制作部' : 'Content Localisation and Subtitling',
          slug: 'content-localisation',
        }
      : null,
    location: long ? 'Singapore' : null,
    is_remote: long,
    commitment_type: ['volunteer', 'part_time', 'contract', 'internship', 'full_time'][index % 5],
    is_paid: index % 4 === 0,
    status: 'published',
    published_at: '2026-08-20T02:00:00.000Z',
    // Null means open until filled, which the client renders as a sentence
    // rather than a blank, and a sentence is wider than a date.
    closes_at: index % 3 === 0 ? null : '2026-12-31T16:00:00.000Z',
    tags: long
      ? [{ id: 'tttttttt-0000-0000-0000-000000000001', slug: 'subtitling', name: LONG_TAG[locale], colour: 'blue' }]
      : [],
    // False puts the English only badge on the card, which is a card with one
    // more thing on it than the others.
    has_translation: locale === 'en' ? true : index !== 0,
  };
}

function searchFixture(locale) {
  const jobs = Array.from({ length: 20 }, (_, index) => fixtureJob(index, locale));
  return {
    jobs,
    total: 41,
    page: 1,
    page_size: 20,
    pages: 3,
    match_mode: 'none',
    query: '',
    sort: 'newest',
  };
}

function facetsFixture(locale) {
  return {
    locale,
    total: 41,
    departments: [
      {
        id: 'dddddddd-0000-0000-0000-000000000001',
        slug: 'content-localisation',
        name: locale === 'zh' ? '内容本地化与字幕制作部' : 'Content Localisation and Subtitling',
        count: 17,
      },
      { id: 'dddddddd-0000-0000-0000-000000000002', slug: 'production', name: locale === 'zh' ? '制作部' : 'Production', count: 24 },
    ],
    tags: [
      { id: 'tttttttt-0000-0000-0000-000000000001', slug: 'subtitling', name: LONG_TAG[locale], colour: 'blue' },
      { id: 'tttttttt-0000-0000-0000-000000000002', slug: 'editing', name: locale === 'zh' ? '剪辑' : 'Editing', colour: 'green' },
    ],
    commitments: [
      { key: 'volunteer', count: 30 },
      { key: 'part_time', count: 11 },
    ],
    chips: [],
    chip_days: 14,
  };
}

/* -------------------------------------------------------------------------
 * The site, served from the working tree
 * ---------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveRoute(pathname) {
  if (pathname === '/') return join(SITE, 'index.html');
  const bare = pathname.replace(/^\/|\/$/g, '');
  for (const candidate of [bare, `${bare}.html`, `${bare}/index.html`]) {
    const full = join(SITE, candidate);
    if (await isFile(full)) return full;
  }
  return null;
}

async function serveSite(locale = 'en') {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      const fixture =
        url.pathname === '/api/public/search'
          ? searchFixture(locale)
          : url.pathname === '/api/public/facets'
            ? facetsFixture(locale)
            : null;

      if (fixture) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, data: fixture }));
      }

      // Anything without a fixture. 503 rather than 404 on purpose: every page
      // in this build draws its own "could not be read" state for a failed
      // request, and that state is part of what the layout has to hold. A 404
      // would be read as an empty result, which is the narrower page and the
      // easier test.
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end('{"error":{"code":"UNAVAILABLE","message":"no fixture for this route"}}');
    }

    const file = await resolveRoute(url.pathname);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // A worker left over from the phase 10 file's runs would serve its own
      // precached copies instead of the working tree.
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
}

/* -------------------------------------------------------------------------
 * The measurement
 * ---------------------------------------------------------------------- */

/** What one page at one width is asked, in the page's own context.
 *
 *  Three questions, and each one is a rule in section 3 rather than a
 *  preference. Everything is reported with the offending element's ancestor
 *  chain, because "this page scrolls sideways" without it is a finding nobody
 *  can act on. */
function measure(floorPx) {
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

    // **Two lines of text in a control whose label is short.** A long label
    // wrapping is a long label; a short one wrapping is a cramped control, and
    // only the second is a finding.
    //
    // Counting words is how that was decided until 华文 arrived, and 华文 does
    // not put spaces between them: every Chinese label is one "word", so every
    // Chinese label that wrapped was reported as cramped. The first fixture run
    // flagged a sixteen character tag name on /search for exactly that reason,
    // which is a long label doing what long labels do. Four Han characters is
    // about a word, so that is what one counts as.
    const spaced = text.split(/\s+/).filter(Boolean).length;
    const han = (text.match(/[㐀-鿿]/g) ?? []).length;
    const words = han > 0 ? Math.ceil(han / 4) : spaced;

    if (box.height > lineHeight * 2.2 && words <= 3) {
      cramped.push(`"${text.slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
  }

  return { scrolled, target, widest, tight: tight.slice(0, 6), cramped: cramped.slice(0, 6) };
}

/** One page at one width, settled and measured. */
async function walk(page, base, path, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });

  // Every page here draws itself after a fetch, and a page measured before it
  // has drawn is a page measured empty — the widest thing it has is a spinner.
  // networkidle rather than a timeout: this server answers instantly and the
  // API returns 503 as fast as it can, so there is nothing to wait out.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.querySelector('#applyDialog')?.close());

  return page.evaluate(measure, CELL_FLOOR);
}

/** A browser context with the language and theme already chosen.
 *
 *  Set before the first paint, because every page in this build reads
 *  `gftv-careers.locale` in an inline script in its own head and hides itself
 *  until the dictionary lands for anything but English. Setting it after a load
 *  would measure the English page and call it 华文. */
async function contextFor(browser, base, locale) {
  const ctx = await browser.newContext({
    baseURL: base,
    serviceWorkers: 'block',
    locale: locale === 'zh' ? 'zh-SG' : 'en-GB',
  });

  await ctx.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(`${key}.locale`, value);
        localStorage.setItem(`${key}.mode`, 'light');
        localStorage.setItem(`${key}.colorTheme`, 'classic');
      } catch {
        /* a context with storage blocked is a context this run cannot use */
      }
    },
    ['gftv-careers', locale]
  );

  return ctx;
}

/** Every width for one page, reported as one check per rule rather than one
 *  per width: six near identical failures say the same thing once. */
function report(label, results) {
  const scrolls = results.filter((r) => r.scrolled > SCROLL_SLACK);
  check(
    `${label} does not scroll sideways at any width`,
    scrolls.length === 0,
    scrolls.map((r) => `${r.width}px by ${r.scrolled}px: ${r.widest?.chain ?? 'unknown'}`).join('; ')
  );

  const tight = results.filter((r) => r.tight.length > 0);
  check(
    `${label} has no table cell under ${CELL_FLOOR}px`,
    tight.length === 0,
    tight.map((r) => `${r.width}px: ${r.tight.join(', ')}`).join('; ')
  );

  const cramped = results.filter((r) => r.cramped.length > 0);
  check(
    `${label} has no short button label wrapping`,
    cramped.length === 0,
    cramped.map((r) => `${r.width}px: ${r.cramped.join(', ')}`).join('; ')
  );
}

/* =========================================================================
 * 1. The public pages, at every width in both languages
 * ====================================================================== */

define('responsive', 'The public pages at six widths, in both languages', async () => {
  console.log(`      ${WIDTHS.join(', ')} across ${PUBLIC_PAGES.length} pages, en and 华文`);

  const browser = await chromium.launch();

  try {
    for (const locale of LOCALES) {
      // One server per language, because the fixtures answer in the language
      // the run is measuring. A board of English cards measured as the 华文
      // pass would prove nothing about Chinese line breaking, which is most of
      // why the second pass exists.
      const server = await serveSite(locale);
      const ctx = await contextFor(browser, server.base, locale);
      const page = await ctx.newPage();

      // **The pass is proved to be the pass it claims to be, before it runs.**
      // Nothing else here would notice a 华文 run that had quietly measured the
      // English page: the widths are the same, the tables are the same, and it
      // would report the same clean six. Section 3's rule that a check must
      // assert the thing rather than something next to it.
      await page.goto(`${server.base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const applied = await page.evaluate(() => ({
        locale: document.documentElement.getAttribute('data-locale'),
        lang: document.documentElement.getAttribute('lang'),
        heading: (document.querySelector('h1')?.textContent ?? '').trim(),
      }));
      const chinese = /[一-鿿]/.test(applied.heading);
      check(
        `the ${locale} pass is actually rendering ${locale}`,
        applied.locale === locale &&
          applied.lang === (locale === 'zh' ? 'zh-Hans-SG' : 'en') &&
          chinese === (locale === 'zh'),
        `data-locale ${applied.locale}, lang ${applied.lang}, h1 "${applied.heading.slice(0, 40)}"`
      );

      // **And the fixtures are proved to have arrived**, for the same reason.
      // A board with no cards on it holds every width comfortably, so a search
      // page that quietly failed to render would report the cleanest six in the
      // file. This is the check that the rest of the section is measuring
      // something.
      await page.setViewportSize({ width: 1440, height: 800 });
      await page.goto(`${server.base}/search`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const drawn = await page.evaluate(() => ({
        cards: document.querySelectorAll('.job-card:not([aria-hidden="true"])').length,
        longest: [...document.querySelectorAll('.job-card')]
          .map((el) => (el.textContent ?? '').trim().length)
          .sort((a, b) => b - a)[0] ?? 0,
      }));
      check(
        `the ${locale} board is drawn from the fixtures, not from an empty state`,
        drawn.cards >= 20,
        `${drawn.cards} cards, longest ${drawn.longest} characters`
      );

      for (const path of PUBLIC_PAGES) {
        const results = [];
        for (const width of WIDTHS) {
          results.push({ width, ...(await walk(page, server.base, path, width)) });
        }
        report(`${path} in ${locale}`, results);
      }

      await ctx.close();
      server.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 2. A landscape phone, where the sticky furniture shows up
 * ====================================================================== */

define('landscape', 'A landscape phone, where a sticky header costs the most', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();

  // 3 asks for both orientations. Turned sideways, a phone is a wide viewport
  // that is 375 tall, and the risk there is not the width — the widths above
  // cover that — it is everything pinned to an edge eating a screen that has
  // very little height to give. Half the viewport left for content is the line.
  const VIEWPORT = { width: 736, height: 375 };

  try {
    const ctx = await contextFor(browser, server.base, 'en');
    const page = await ctx.newPage();
    await page.setViewportSize(VIEWPORT);

    for (const path of PUBLIC_PAGES) {
      await page.goto(`${server.base}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      const taken = await page.evaluate(() => {
        // **The union of what is on screen, not the sum of what exists.** The
        // first shape of this check added the heights up and reported 436px of
        // a 375px viewport as pinned, on every page, which is not a finding —
        // it is a measurement that cannot be true. What it was counting is
        // `nav#siteNav`, the off canvas menu: full height, `position: fixed`,
        // neither hidden nor displayless, and sitting entirely off the left
        // edge because it is closed. A closed drawer takes no space, and two
        // stacked bars that overlap do not take their heights added together.
        const spans = [];
        for (const el of document.querySelectorAll('body *')) {
          const style = getComputedStyle(el);
          if (style.position !== 'fixed' && style.position !== 'sticky') continue;
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const box = el.getBoundingClientRect();
          if (box.height === 0 || box.width === 0) continue;
          // On screen in both axes, or it is costing the reader nothing.
          if (box.right <= 0 || box.left >= innerWidth) continue;
          if (box.bottom <= 0 || box.top >= innerHeight) continue;
          spans.push([Math.max(0, box.top), Math.min(innerHeight, box.bottom)]);
        }

        spans.sort((a, b) => a[0] - b[0]);
        let worst = 0;
        let edge = 0;
        for (const [top, bottom] of spans) {
          if (bottom <= edge) continue;
          worst += bottom - Math.max(top, edge);
          edge = bottom;
        }
        return Math.round(worst);
      });

      check(
        `${path} leaves half a landscape phone for its content`,
        taken <= VIEWPORT.height / 2,
        `${taken}px of ${VIEWPORT.height}px is pinned`
      );
    }

    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
});

/* =========================================================================
 * 3. The admin pages, which need a deployment and a staff credential
 * ====================================================================== */

define('responsive-admin', 'The admin pages at six widths, against a deployment', async () => {
  const user = process.env.STAFF_USER;
  const pass = process.env.STAFF_PASS;
  const base = process.env.BASE ?? 'https://careers.globalfurry.tv';

  // The credential is read here and not at the top of the file. Phase 9's file
  // called requireEnv at module level and made its one credential free section
  // unrunnable without a password it never used.
  if (!user || !pass) {
    skip(
      'the admin pages at six widths',
      'set STAFF_USER and STAFF_PASS. An admin page is a session and a database, ' +
        'not a document, so unlike the sections above this one cannot be served from the tree.'
    );
    return;
  }

  console.log(`      ${base}, ${WIDTHS.join(', ')} across ${ADMIN_PAGES.length} pages`);

  const browser = await chromium.launch();

  try {
    for (const locale of LOCALES) {
    // Both languages, and it is not ceremony: the row that overflowed by 4px in
    // English is decided by six label lengths, and 华文 sets six different ones.
    const ctx = await browser.newContext({
      baseURL: base,
      serviceWorkers: 'block',
      locale: locale === 'zh' ? 'zh-SG' : 'en-GB',
    });

    await ctx.addInitScript(
      ([key, value]) => {
        try {
          localStorage.setItem(`${key}.locale`, value);
          localStorage.setItem(`${key}.mode`, 'light');
          localStorage.setItem(`${key}.colorTheme`, 'classic');
        } catch {
          /* a context with storage blocked is a context this run cannot use */
        }
      },
      ['gftv-careers', locale]
    );

    // **A CSS fix for what this section finds cannot be proved by this section
    // until it is deployed, which is the wrong way round.** `PATCH_CSS=1`
    // serves the working tree's stylesheets in place of the deployment's, so a
    // rule written in answer to a finding is checked before it is pushed rather
    // than after. Borrowed from layout-check.mjs, which needed it first.
    if (process.env.PATCH_CSS === '1') {
      console.log('      PATCH_CSS=1: stylesheets are the working tree\'s, not the deployment\'s');
      await ctx.route('**/assets/css/*.css', async (route) => {
        const { pathname } = new URL(route.request().url());
        try {
          const body = await readFile(join(SITE, pathname.replace(/^\//, '')), 'utf8');
          return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body });
        } catch {
          return route.fallback();
        }
      });
    }

    const page = await ctx.newPage();

    await page.goto(`${base}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#staffLoginForm', { timeout: 20000 });
    await page.fill('#username', user);
    await page.fill('#password', pass);
    await page.click('#staffLoginForm button[type="submit"]');
    await page.waitForURL('**/admin', { timeout: 20000 }).catch(() => {});

    const signedIn = page.url().includes('/admin') && !page.url().includes('/admin/login');
    check(`a staff session was established, in ${locale}`, signedIn, page.url());
    if (!signedIn) {
      await ctx.close();
      continue;
    }

    // **The label this phase hides between 1024 and 1279 is hidden from the
    // layout and not from the accessibility tree**, and that distinction is one
    // `display: none` away from being lost by somebody tidying the rule up
    // later. Nothing else here would notice: the row would still fit, and a
    // button announced as "button" is what would ship.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const label = await page
      .locator('#navSuggest span[data-i18n]')
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return { text: (el.textContent ?? '').trim(), display: style.display, visibility: style.visibility };
      })
      .catch(() => null);
    check(
      `the suggestions toggle keeps its name at 1024, in ${locale}`,
      Boolean(label) && label.text !== '' && label.display !== 'none' && label.visibility !== 'hidden',
      label ? `"${label.text}" display ${label.display}, visibility ${label.visibility}` : 'no label element'
    );

    for (const path of ADMIN_PAGES) {
      const results = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
        // A deployment, so this waits on the network rather than on a local
        // file. A table that has not arrived is a table that cannot be too
        // narrow, which is the failure this section would otherwise miss.
        await page.waitForLoadState('networkidle').catch(() => {});
        results.push({ width, ...(await page.evaluate(measure, CELL_FLOOR)) });
      }
      report(`${path} in ${locale}`, results);
    }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 4. The applicant's own pages, which need an applicant credential
 * ====================================================================== */

define('responsive-account', 'The account pages at six widths, against a deployment', async () => {
  const user = process.env.APPLICANT_USER;
  const pass = process.env.APPLICANT_PASS;
  const base = process.env.BASE ?? 'https://careers.globalfurry.tv';

  if (!user || !pass) {
    skip(
      'the account pages at six widths',
      'set APPLICANT_USER and APPLICANT_PASS. Signed out these five routes redirect to /login, ' +
        'so a run without them measures the login page five times and reports it as coverage.'
    );
    return;
  }

  console.log(`      ${base}, ${WIDTHS.join(', ')} across ${ACCOUNT_PAGES.length} pages`);

  const browser = await chromium.launch();

  try {
    for (const locale of LOCALES) {
      const ctx = await browser.newContext({
        baseURL: base,
        serviceWorkers: 'block',
        locale: locale === 'zh' ? 'zh-SG' : 'en-GB',
      });

      await ctx.addInitScript(
        ([key, value]) => {
          try {
            localStorage.setItem(`${key}.locale`, value);
            localStorage.setItem(`${key}.mode`, 'light');
            localStorage.setItem(`${key}.colorTheme`, 'classic');
          } catch {
            /* a context with storage blocked is a context this run cannot use */
          }
        },
        ['gftv-careers', locale]
      );

      if (process.env.PATCH_CSS === '1') {
        await ctx.route('**/assets/css/*.css', async (route) => {
          const { pathname } = new URL(route.request().url());
          try {
            const body = await readFile(join(SITE, pathname.replace(/^\//, '')), 'utf8');
            return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body });
          } catch {
            return route.fallback();
          }
        });
      }

      const page = await ctx.newPage();

      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#loginForm', { timeout: 20000 });
      await page.fill('#identifier', user);
      await page.fill('#password', pass);
      await page.click('#loginForm button[type="submit"]');
      await page.waitForURL('**/account**', { timeout: 20000 }).catch(() => {});

      const signedIn = page.url().includes('/account');
      check(`an applicant session was established, in ${locale}`, signedIn, page.url());
      if (!signedIn) {
        await ctx.close();
        continue;
      }

      // **This row is the longest one in the build**, which is why these pages
      // are worth their own section rather than being assumed to behave like
      // the public ones. It carries a display name of arbitrary length, and
      // `.nav-account-name` caps it with an ellipsis rather than wrapping,
      // because a name that wraps takes the row with it. That rule has never
      // been checked at a width where the row is tight.
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const name = await page
        .locator('.nav-account-name')
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            text: (el.textContent ?? '').trim(),
            overflow: style.overflow,
            ellipsis: style.textOverflow,
            lines: Math.round(el.getBoundingClientRect().height / (parseFloat(style.lineHeight) || 20)),
          };
        })
        .catch(() => null);
      check(
        `the account name is capped rather than wrapped at 1024, in ${locale}`,
        Boolean(name) && name.lines <= 1 && name.ellipsis === 'ellipsis',
        name ? `"${name.text}" ${name.lines} line(s), text-overflow ${name.ellipsis}` : 'no account name element'
      );

      for (const path of ACCOUNT_PAGES) {
        const results = [];
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle').catch(() => {});
          results.push({ width, ...(await page.evaluate(measure, CELL_FLOOR)) });
        }
        report(`${path} in ${locale}`, results);
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 12 verification, the polish pass');
  console.log('  the public sections need no deployment, no credentials, and no network');
  console.log('  responsive-admin needs a deployment and a staff credential, and says so when it skips');

  const unknown = (ONLY ?? []).filter((name) => !SECTIONS.some((entry) => entry.name === name));
  if (unknown.length > 0) {
    console.error(`\nNo such section: ${unknown.join(', ')}`);
    console.error(`Sections: ${SECTIONS.map((entry) => entry.name).join(', ')}`);
    process.exit(1);
  }

  for (const entry of SECTIONS) {
    if (ONLY && !ONLY.includes(entry.name)) continue;
    section(entry.title);
    try {
      await entry.fn();
    } catch (cause) {
      bad(`${entry.name} threw`, String(cause?.stack ?? cause));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const item of failures) console.log(`  ${item.section} — ${item.name}`);
  }
  if (skips.length > 0) {
    console.log('\nSkipped:');
    for (const item of skips) console.log(`  ${item.section} — ${item.name}: ${item.why}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
