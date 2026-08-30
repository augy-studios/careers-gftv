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

// The floor itself, from the file that applies it, so the check and the build
// cannot disagree about what "too small" is. `icons.js` touches `document` only
// inside its functions, so importing it here costs nothing.
import { MIN_SIZE } from '../main-site/assets/js/icons.js';

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

// **Serve the working tree's assets in place of the deployment's**, so a fix
// written in answer to a finding is proved before it is pushed rather than
// after. `layout-check.mjs` calls this `PATCH_CSS` and patches stylesheets;
// phase 12 changes scripts too — the icon floor is in `icons.js` — so the name
// here says assets and the older spelling keeps working, because a habit worth
// borrowing is worth not breaking.
const PATCH = process.env.PATCH_ASSETS === '1' || process.env.PATCH_CSS === '1';

/** Stylesheets, scripts and pages from this working tree, for a context on a
 *  deployment. Anything not in the tree falls through to the network.
 *
 *  **Pages as well as assets, since part 2.** The accessibility fixes are as
 *  often a line of markup as a line of CSS — a heading that closes a gap in an
 *  outline, an attribute that names a control — and a fix that cannot be proved
 *  until it has shipped is the thing this flag exists to prevent. The admin
 *  pages are static documents like every other page here; only their data comes
 *  from the deployment, and that still does. */
async function patchAssets(ctx) {
  if (!PATCH) return false;

  // Registered first so it is consulted last: a stylesheet is not a document
  // and falls straight through to the handler below.
  await ctx.route('**/*', async (route) => {
    const request = route.request();
    // GET only. A form posting to a page must reach the deployment, or the
    // response would be this file's idea of the page instead of the answer.
    if (request.resourceType() !== 'document' || request.method() !== 'GET') return route.fallback();

    const file = await resolveRoute(new URL(request.url()).pathname);
    if (!file) return route.fallback();

    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: await readFile(file, 'utf8'),
    });
  });

  await ctx.route('**/assets/{css,js}/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    try {
      const body = await readFile(join(SITE, pathname.replace(/^\//, '')), 'utf8');
      return route.fulfill({
        status: 200,
        contentType: pathname.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'application/javascript; charset=utf-8',
        body,
      });
    } catch {
      return route.fallback();
    }
  });
  return true;
}

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

// `NAME_MAX` in api/admin/tags.js is 60, so this is a tag name an admin can
// actually save. 59 characters in English and 23 in 华文, which is the more
// interesting half: 23 Han characters set wider than 23 Latin ones and break
// in different places.
const LONG_TAG = {
  en: 'Subtitling, terminology and house style guide for reviewers',
  zh: '字幕、术语与文体风格指南及审校人员参考规范说明',
};

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

// **The combobox needs a list before it is a combobox.** Part 2 asks whether
// aria-expanded flips, whether the highlight moves with the arrow keys and
// whether aria-activedescendant names a real option, and none of those
// questions exist against an empty list. Three groups rather than one, because
// the list is a listbox containing groups and the arrow keys have to walk from
// the last option of one into the first of the next.
function suggestFixture(locale) {
  const zh = locale === 'zh';
  return {
    suggestions: {
      titles: [
        { label: LONG_TITLE[locale], value: 'aaaaaaaa-bbbb-cccc-dddd-000000000000', count: 0 },
        { label: zh ? '字幕审校员' : 'Subtitle reviewer', value: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', count: 0 },
      ],
      tags: [{ label: LONG_TAG[locale], value: 'subtitling', count: 12 }],
      departments: [
        {
          label: zh ? '内容本地化与字幕制作部' : 'Content Localisation and Subtitling',
          value: 'content-localisation',
          count: 17,
        },
      ],
    },
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
            : url.pathname === '/api/public/suggest'
              ? suggestFixture(locale)
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
function measure({ floorPx, iconFloor }) {
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

  // **No icon is drawn smaller than the floor.** Two things can put one below
  // it and they need one check between them: somebody asking for a size under
  // `MIN_SIZE`, which `icons.js` clamps, and a squeezed flex wrapper dragging
  // `max-width: 100%` down with it, which `[data-icon] { flex: none }` stops.
  // What a reader sees is the rendered box, so that is what is measured.
  const small = [];
  for (const svg of document.querySelectorAll('[data-icon] svg')) {
    const box = svg.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.width < iconFloor - 0.5 || box.height < iconFloor - 0.5) {
      const parent = svg.parentElement?.parentElement;
      small.push(
        `${Math.round(box.width)}x${Math.round(box.height)} in ` +
          `${parent?.tagName.toLowerCase() ?? '?'}.${String(parent?.className || '').split(' ')[0]}`
      );
    }
  }

  return {
    scrolled,
    target,
    widest,
    tight: tight.slice(0, 6),
    cramped: cramped.slice(0, 6),
    small: [...new Set(small)].slice(0, 6),
  };
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

  return page.evaluate(measure, { floorPx: CELL_FLOOR, iconFloor: MIN_SIZE });
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

  const small = results.filter((r) => r.small.length > 0);
  check(
    `${label} draws no icon under ${MIN_SIZE}px`,
    small.length === 0,
    small.map((r) => `${r.width}px: ${r.small.join(', ')}`).join('; ')
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
 * 3. The accessibility sweep, which is part 2
 * ====================================================================== */

/** Everything one page is asked about, in the page's own context.
 *
 *  **Seven rules, and none of them is a preference.** Each one is a thing a
 *  keyboard or a screen reader either can or cannot do, so each one fails with
 *  the element that broke it rather than with a count: "this page has an
 *  unnamed button" is not a finding anybody can act on.
 *
 *  The accessible name here is an approximation of the real algorithm and is
 *  deliberately generous — aria-label, aria-labelledby, a label element, the
 *  text inside, an image's alt, and finally title. Generous is the right
 *  direction for a check that fails a build: everything it reports is genuinely
 *  nameless, and the cost of the approximation is a name it credits that a
 *  browser might compute differently, which is a missed finding rather than a
 *  false one. */
function auditA11y({ focusable }) {
  // **`inert` is the other way of not being there, and it is invisible to
  // checkVisibility.** The admin sidebar closes by being made inert rather than
  // by being hidden — it is out of the tab order and out of the accessibility
  // tree, and still perfectly visible as far as CSS is concerned. The first
  // shape of this audit reported every link in it as focusable inside
  // aria-hidden, on all six admin pages in both languages, which is a finding
  // about the check and not about the page. Both mechanisms count as gone.
  const seen = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && el.closest('[inert]') === null;

  const describe = (el) => {
    const cls = String(el.className || '').split(' ').filter(Boolean)[0];
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  };

  const textOf = (el) => (el?.textContent ?? '').trim();

  function accessibleName(el) {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const joined = labelledby
        .split(/\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(' ');
      if (joined) return joined;
    }

    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (textOf(forLabel)) return textOf(forLabel);
      }
      const wrapping = el.closest('label');
      if (textOf(wrapping)) return textOf(wrapping);
      if (el.tagName === 'INPUT' && /^(submit|button|reset)$/.test(el.type) && el.value.trim()) {
        return el.value.trim();
      }
      // **A placeholder is not a name**, and this is the one place the check is
      // deliberately strict rather than generous: some browsers fall back to it,
      // which is exactly what makes an unlabelled field survive a hand test.
      return '';
    }

    if (textOf(el)) return textOf(el);

    const alt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    return '';
  }

  // 1. Everything a reader can reach with Tab can be named out loud.
  //
  // **`tabindex="-1"` is excluded whatever the tag is**, and the build's own
  // FOCUSABLE list does not do that: it says `[tabindex]:not([tabindex="-1"])`
  // for a bare element and then `input:not([disabled])` for an input, so an
  // input taken out of the tab order still matches. That is a question about a
  // tab order, so the answer has to be the tab order's.
  const unnamed = [];
  const reachable = [...document.querySelectorAll(focusable)].filter(
    (el) => seen(el) && el.getAttribute('tabindex') !== '-1'
  );
  for (const el of reachable) {
    if (accessibleName(el) === '') unnamed.push(describe(el));
  }

  // 2. **Nothing focusable inside aria-hidden.** The one rule in this list that
  //    is a contradiction rather than an omission: the page has told a screen
  //    reader the subtree does not exist and has left the keyboard able to walk
  //    into it. A closed off-canvas panel that is only moved off the edge is how
  //    this happens, every time.
  const hiddenFocusable = [];
  for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
    for (const el of hidden.querySelectorAll(focusable)) {
      if (!seen(el) || el.getAttribute('tabindex') === '-1') continue;
      hiddenFocusable.push(`${describe(el)} inside ${describe(hidden)}`);
    }
  }

  // 3. Every ARIA reference points at something that is on the page.
  const IDREF = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-activedescendant', 'aria-owns'];
  const dangling = [];
  for (const attr of IDREF) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) dangling.push(`${describe(el)} ${attr}="${id}"`);
      }
    }
  }
  for (const el of document.querySelectorAll('label[for]')) {
    const id = el.getAttribute('for');
    if (id && !document.getElementById(id)) dangling.push(`${describe(el)} for="${id}"`);
  }

  // 4. One id, one element. A duplicate makes every reference above a coin toss.
  const counts = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
  }
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `#${id} x${n}`);

  // 5. One h1, and no level skipped on the way down. A heading outline is how a
  //    screen reader reads a page it has not been to before.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(seen);
  const levels = headings.map((el) => Number(el.tagName[1]));
  const h1 = headings.filter((el) => el.tagName === 'H1');
  const skips = [];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) {
      skips.push(`h${levels[i - 1]} "${textOf(headings[i - 1]).slice(0, 20)}" to h${levels[i]} "${textOf(headings[i]).slice(0, 20)}"`);
    }
  }

  // 6. Every image says what it is, or says it is decoration. A missing alt is
  //    the only one of the three that is silence.
  const images = [];
  for (const img of document.querySelectorAll('img')) {
    if (!seen(img)) continue;
    if (img.hasAttribute('alt')) continue;
    if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') continue;
    images.push(`${describe(img)} ${img.getAttribute('src')?.slice(-30) ?? ''}`);
  }

  // 7. No positive tabindex anywhere. It reorders the whole document against
  //    the order it is written in, and one is enough to do it.
  const positive = [...document.querySelectorAll('[tabindex]')]
    .filter((el) => Number(el.getAttribute('tabindex')) > 0)
    .map((el) => `${describe(el)} tabindex="${el.getAttribute('tabindex')}"`);

  // 8. The skip link is the first thing Tab reaches, and it lands somewhere.
  const first = reachable[0] ?? null;
  const skip = document.querySelector('.skip-link');
  const skipTarget = skip ? document.getElementById((skip.getAttribute('href') ?? '').replace(/^#/, '')) : null;

  return {
    unnamed: [...new Set(unnamed)].slice(0, 8),
    hiddenFocusable: [...new Set(hiddenFocusable)].slice(0, 8),
    dangling: [...new Set(dangling)].slice(0, 8),
    duplicates: duplicates.slice(0, 8),
    h1Count: h1.length,
    skips: skips.slice(0, 4),
    images: images.slice(0, 6),
    positive: positive.slice(0, 6),
    skipLinkFirst: Boolean(skip) && first === skip,
    skipLinkLands: Boolean(skipTarget),
  };
}

/** The eight rules, reported once per page rather than once per width. */
function reportA11y(label, results) {
  const gather = (key) => results.filter((r) => r[key].length > 0);
  const lines = (key) => gather(key).map((r) => `${r.width}px: ${r[key].join(', ')}`).join('; ');

  check(`${label}: everything reachable by Tab has a name`, gather('unnamed').length === 0, lines('unnamed'));
  check(
    `${label}: nothing focusable sits inside aria-hidden`,
    gather('hiddenFocusable').length === 0,
    lines('hiddenFocusable')
  );
  check(`${label}: every ARIA reference resolves`, gather('dangling').length === 0, lines('dangling'));
  check(`${label}: no id is used twice`, gather('duplicates').length === 0, lines('duplicates'));
  check(
    `${label}: exactly one h1 at every width`,
    results.every((r) => r.h1Count === 1),
    results.map((r) => `${r.width}px: ${r.h1Count}`).join(', ')
  );
  check(`${label}: no heading level is skipped`, gather('skips').length === 0, lines('skips'));
  check(`${label}: every image has an alt or is marked decorative`, gather('images').length === 0, lines('images'));
  check(`${label}: no positive tabindex`, gather('positive').length === 0, lines('positive'));
  check(
    `${label}: the skip link is first and lands on something`,
    results.every((r) => r.skipLinkFirst && r.skipLinkLands),
    results.map((r) => `${r.width}px: first ${r.skipLinkFirst}, lands ${r.skipLinkLands}`).join('; ')
  );
}

// The drawer and the filter sheet are the two off-canvas panels on a public
// page, and 375 is where both of them are a sheet. 1024 is where neither is,
// and the two states are different documents as far as this sweep is concerned.
const A11Y_WIDTHS = [375, 1024];

// The same list dialog.js and shell.js use to decide what a focus trap contains.
// Imported by value rather than by reference because it is a string in a module
// this file has no reason to import for one constant.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

define('a11y', 'The public pages against the accessibility rules, in both languages', async () => {
  console.log(`      ${A11Y_WIDTHS.join(', ')} across ${PUBLIC_PAGES.length} pages, en and 华文`);

  const browser = await chromium.launch();

  try {
    for (const locale of LOCALES) {
      const server = await serveSite(locale);
      const ctx = await contextFor(browser, server.base, locale);
      const page = await ctx.newPage();

      // **Prove the audit can fail before trusting that it passed.** Part 1
      // learned this the expensive way: a clean first run is what a broken
      // measurement looks like from the outside. Two defects are injected into
      // a real page — a button with nothing to say, and a link left focusable
      // inside an aria-hidden container — and both have to be named.
      if (locale === 'en') {
        await page.goto(`${server.base}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.id = 'a11yProbe';
          probe.innerHTML =
            '<button type="button" id="probeNameless"></button>' +
            '<div aria-hidden="true"><a href="/faq" id="probeLink">Reachable</a></div>';
          document.body.append(probe);
        });
        const caught = await page.evaluate(auditA11y, { focusable: FOCUSABLE });
        await page.evaluate(() => document.querySelector('#a11yProbe')?.remove());
        check(
          'the audit reports a control with no accessible name',
          caught.unnamed.some((entry) => entry.includes('probeNameless')),
          caught.unnamed.join(', ') || 'nothing reported'
        );
        check(
          'the audit reports a focusable element inside aria-hidden',
          caught.hiddenFocusable.some((entry) => entry.includes('probeLink')),
          caught.hiddenFocusable.join(', ') || 'nothing reported'
        );
      }

      for (const path of PUBLIC_PAGES) {
        const results = [];
        for (const width of A11Y_WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`${server.base}${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.evaluate(() => document.querySelector('#applyDialog')?.close());
          results.push({
            width,
            ...(await page.evaluate(auditA11y, { focusable: FOCUSABLE })),
          });
        }
        reportA11y(`${path} in ${locale}`, results);
      }

      await ctx.close();
      server.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 4. The public surfaces a keyboard has to be able to drive
 * ====================================================================== */

// The sweep above asks whether a page is *described* correctly. It cannot ask
// whether anything *works*, and every surface on section 12's accessibility
// list is a behaviour: a combobox that never moves aria-activedescendant is a
// combobox that passes every static rule in the file and cannot be used with
// the arrow keys.
//
// Four of them are reachable from the working tree, which is why they are here
// rather than in the section below: the suggestion combobox, the filter panel
// as a bottom sheet, the dialog shell that phase 4's two modals are built on,
// and phase 10's connection bar with the sentence it puts beside a control it
// has disabled. The rest of the list is an admin session and a database, and
// goes with the pages it lives on.

define('a11y-keyboard', 'The combobox, the filter sheet, the dialog and the connection bar', async () => {
  const browser = await chromium.launch();

  try {
    for (const locale of LOCALES) {
      const server = await serveSite(locale);
      const ctx = await contextFor(browser, server.base, locale);
      const page = await ctx.newPage();

      /* --- The suggestion combobox ------------------------------------- */

      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`${server.base}/search`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      await page.click('#searchInput');
      // 华文 opens on one character and English on two, which minimumQueryLength
      // decides. Typing one letter in English would close the list and the
      // whole surface would report as broken for the wrong reason.
      await page.type('#searchInput', locale === 'zh' ? '字' : 'sub', { delay: 20 });
      const opened = await page
        .waitForSelector('#suggestions:not([hidden]) [role="option"]', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      check(`the combobox opens on a real query, in ${locale}`, opened, 'no option appeared');

      if (opened) {
        const readCombobox = () =>
          page.evaluate(() => {
            const input = document.querySelector('#searchInput');
            const active = input.getAttribute('aria-activedescendant');
            const options = [...document.querySelectorAll('#suggestions [role="option"]')];
            return {
              expanded: input.getAttribute('aria-expanded'),
              hidden: document.querySelector('#suggestions').hidden,
              count: options.length,
              active,
              activeExists: Boolean(active) && Boolean(document.getElementById(active)),
              selected: options.filter((el) => el.getAttribute('aria-selected') === 'true').length,
              selectedIsActive:
                Boolean(active) && document.getElementById(active)?.getAttribute('aria-selected') === 'true',
              focused: document.activeElement?.id ?? null,
              ids: options.map((el) => el.id),
            };
          });

        const listed = await readCombobox();
        check(
          `the combobox says it is expanded while the list is open, in ${locale}`,
          listed.expanded === 'true' && listed.hidden === false && listed.count === 4,
          `aria-expanded ${listed.expanded}, hidden ${listed.hidden}, ${listed.count} options`
        );

        await page.press('#searchInput', 'ArrowDown');
        const first = await readCombobox();
        check(
          `the arrow keys move a highlight the input names, in ${locale}`,
          first.activeExists && first.selected === 1 && first.selectedIsActive,
          `aria-activedescendant "${first.active}", exists ${first.activeExists}, ${first.selected} selected`
        );

        // **The focus never leaves the input.** That is the whole contract of a
        // combobox: the reader is typing, and the highlight moving is a change
        // of state rather than a change of place. A version that focused the
        // option would still highlight it, and the next keystroke would go
        // somewhere the reader is not looking.
        check(
          `the focus stays in the input while the list is walked, in ${locale}`,
          first.focused === 'searchInput',
          `focus on ${first.focused}`
        );

        // Down past the last option comes back to the first, and it walks out
        // of one group and into the next on the way: the list is three groups
        // and a reader arrowing through it should never feel them.
        for (let i = 0; i < 4; i += 1) await page.press('#searchInput', 'ArrowDown');
        const wrapped = await readCombobox();
        check(
          `the highlight wraps at the end of the last group, in ${locale}`,
          wrapped.active === wrapped.ids[0],
          `after five presses the highlight is "${wrapped.active}", first option is "${wrapped.ids[0]}"`
        );

        await page.press('#searchInput', 'Escape');
        const closed = await readCombobox();
        check(
          `Escape closes the list and takes the highlight with it, in ${locale}`,
          closed.hidden === true && closed.expanded === 'false' && closed.active === null,
          `hidden ${closed.hidden}, aria-expanded ${closed.expanded}, activedescendant ${closed.active}`
        );
      }

      /* --- The filter panel, which is a sheet below 1024 ---------------- */

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${server.base}/search`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      await page.click('#filterToggle');
      await page.waitForTimeout(400); // the sheet's own transition, not a race

      const sheetOpen = await page.evaluate(() => {
        const panel = document.querySelector('#filterPanel');
        return {
          expanded: document.querySelector('#filterToggle').getAttribute('aria-expanded'),
          hidden: panel.getAttribute('aria-hidden'),
          holdsFocus: panel.contains(document.activeElement),
          focused: document.activeElement?.className ?? null,
        };
      });
      check(
        `the filter sheet opens, says so, and takes the focus with it, in ${locale}`,
        sheetOpen.expanded === 'true' && sheetOpen.hidden === 'false' && sheetOpen.holdsFocus,
        `aria-expanded ${sheetOpen.expanded}, aria-hidden ${sheetOpen.hidden}, focus on ${sheetOpen.focused}`
      );

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      const sheetClosed = await page.evaluate(() => ({
        expanded: document.querySelector('#filterToggle').getAttribute('aria-expanded'),
        open: document.querySelector('#filterPanel').getAttribute('data-open'),
        focused: document.activeElement?.id ?? null,
      }));
      check(
        `Escape closes the sheet and puts the focus back on the toggle, in ${locale}`,
        sheetClosed.expanded === 'false' && sheetClosed.open === null && sheetClosed.focused === 'filterToggle',
        `aria-expanded ${sheetClosed.expanded}, data-open ${sheetClosed.open}, focus on ${sheetClosed.focused}`
      );

      /* --- The navigation drawer, which is a sheet at the same width ----- */

      // **Here because part 2 changed it.** The closed drawer used to be moved
      // off the right edge and left in the tab order, under an aria-hidden that
      // said it was not there; hiding it properly is what fixes that, and
      // hiding it properly is also what stops the panel taking the focus when
      // it opens. Both halves are checked, so the fix cannot be half applied.
      await page.click('#navToggle');
      await page.waitForTimeout(400);

      const drawerOpen = await page.evaluate(() => {
        const nav = document.querySelector('#siteNav');
        return {
          expanded: document.querySelector('#navToggle').getAttribute('aria-expanded'),
          hidden: nav.getAttribute('aria-hidden'),
          holdsFocus: nav.contains(document.activeElement),
        };
      });
      check(
        `the navigation drawer opens and takes the focus with it, in ${locale}`,
        drawerOpen.expanded === 'true' && drawerOpen.hidden === 'false' && drawerOpen.holdsFocus,
        `aria-expanded ${drawerOpen.expanded}, aria-hidden ${drawerOpen.hidden}, holds focus ${drawerOpen.holdsFocus}`
      );

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const drawerClosed = await page.evaluate(() => ({
        expanded: document.querySelector('#navToggle').getAttribute('aria-expanded'),
        focused: document.activeElement?.id ?? null,
        // Closed, the drawer is out of the tab order rather than merely off
        // the edge of the screen. This is the finding the static sweep made.
        reachable: [...document.querySelectorAll('#siteNav a, #siteNav button')].filter((el) =>
          el.checkVisibility({ checkVisibilityCSS: true })
        ).length,
      }));
      check(
        `Escape closes the drawer, restores the focus, and leaves nothing tabbable, in ${locale}`,
        drawerClosed.expanded === 'false' && drawerClosed.focused === 'navToggle' && drawerClosed.reachable === 0,
        `aria-expanded ${drawerClosed.expanded}, focus on ${drawerClosed.focused}, ` +
          `${drawerClosed.reachable} still reachable`
      );

      /* --- The dialog shell, through the sign in prompt ------------------ */

      // **One shell, three modals.** dialog.js is what phase 4's sign in prompt
      // and translation report are both built from, so driving one of them
      // drives the trap, the restoration and the labelling for all of them. The
      // save button on a card is the cheapest way in: signed out, it opens the
      // prompt rather than saving anything.
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`${server.base}/search`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      // Clicked through the browser rather than with element.click(), because
      // dialog.js remembers document.activeElement to give the focus back to
      // and a scripted click moves no focus at all. That is a fact about the
      // test and not about the page, and it fails as if it were the page.
      await page.evaluate(() => {
        document.querySelector('[data-save-job]').id = 'a11ySaveProbe';
      });
      await page.click('#a11ySaveProbe');

      const dialogUp = await page
        .waitForSelector('#signInPrompt:not(.hidden)', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      check(`the sign in prompt opens from a card, in ${locale}`, dialogUp, 'no dialog appeared');

      if (dialogUp) {
        const named = await page.evaluate(() => {
          const panel = document.querySelector('#signInPrompt .modal');
          const labelledby = panel.getAttribute('aria-labelledby');
          return {
            role: panel.getAttribute('role'),
            modal: panel.getAttribute('aria-modal'),
            label: (document.getElementById(labelledby ?? '')?.textContent ?? '').trim(),
            holdsFocus: panel.contains(document.activeElement),
          };
        });
        check(
          `the dialog is a modal with a name, and holds the focus, in ${locale}`,
          named.role === 'dialog' && named.modal === 'true' && named.label !== '' && named.holdsFocus,
          `role ${named.role}, aria-modal ${named.modal}, name "${named.label}", holds focus ${named.holdsFocus}`
        );

        // Tab from the last focusable thing comes back to the first rather than
        // stepping out onto the page the dialog is covering.
        const trapped = await page.evaluate((focusable) => {
          const panel = document.querySelector('#signInPrompt .modal');
          const items = [...panel.querySelectorAll(focusable)].filter((el) => el.checkVisibility());
          items[items.length - 1].focus();
          return { last: items.length - 1, count: items.length };
        }, FOCUSABLE);
        await page.keyboard.press('Tab');
        const afterTab = await page.evaluate((focusable) => {
          const panel = document.querySelector('#signInPrompt .modal');
          const items = [...panel.querySelectorAll(focusable)].filter((el) => el.checkVisibility());
          return { inside: panel.contains(document.activeElement), index: items.indexOf(document.activeElement) };
        }, FOCUSABLE);
        check(
          `Tab off the end of the dialog wraps rather than escaping it, in ${locale}`,
          afterTab.inside && afterTab.index === 0,
          `${trapped.count} focusable, landed at index ${afterTab.index}, inside ${afterTab.inside}`
        );

        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        const returned = await page.evaluate(() => ({
          hidden: document.querySelector('#signInPrompt').classList.contains('hidden'),
          focused: document.activeElement?.id ?? null,
        }));
        check(
          `Escape closes the dialog and gives the focus back to what opened it, in ${locale}`,
          returned.hidden && returned.focused === 'a11ySaveProbe',
          `hidden ${returned.hidden}, focus on ${returned.focused}`
        );
      }

      /* --- The connection bar, and the sentence beside a dead control ---- */

      await page.goto(`${server.base}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      // **Watch the bar arrive, because the defect is in the arriving.** A live
      // region prepended with its sentence already inside it is a region a
      // screen reader has nothing to compare against, and after the fact the
      // page looks identical either way. The observer records what the message
      // element held at the moment it was inserted.
      await page.evaluate(() => {
        window.__barProbe = { inserted: false, emptyOnInsert: null };
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (!(node instanceof HTMLElement) || !node.classList.contains('connection-notice')) continue;
              window.__barProbe.inserted = true;
              window.__barProbe.emptyOnInsert =
                (node.querySelector('[data-message]')?.textContent ?? '').trim() === '';
            }
          }
        }).observe(document.body, { childList: true });
      });

      await ctx.setOffline(true);
      const barUp = await page
        .waitForSelector('.connection-notice [data-message]:not(:empty)', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      check(`the connection bar appears when the network goes, in ${locale}`, barUp, 'no bar');

      if (barUp) {
        const bar = await page.evaluate(() => ({
          probe: window.__barProbe,
          role: document.querySelector('.connection-notice')?.getAttribute('role'),
          label: document.querySelector('.connection-notice')?.getAttribute('aria-label') ?? '',
          messageRole: document.querySelector('.connection-notice [data-message]')?.getAttribute('role'),
          text: (document.querySelector('.connection-notice [data-message]')?.textContent ?? '').trim(),
          state: document.querySelector('.connection-notice')?.dataset.state,
        }));
        check(
          `the bar's live region is on the page before its sentence is, in ${locale}`,
          bar.probe.inserted && bar.probe.emptyOnInsert === true,
          `inserted ${bar.probe.inserted}, empty on insert ${bar.probe.emptyOnInsert}`
        );
        check(
          `the bar is a named region with a polite message inside it, in ${locale}`,
          bar.role === 'region' && bar.label !== '' && bar.messageRole === 'status' && bar.text !== '',
          `role ${bar.role}, label "${bar.label}", message role ${bar.messageRole}, text "${bar.text.slice(0, 30)}"`
        );

        const gated = await page.evaluate(() => {
          const button = document.querySelector('#loginForm [data-needs-network-hint]');
          const described = (button?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
          const hint = button?.nextElementSibling;
          return {
            disabled: button?.disabled === true,
            ariaDisabled: button?.getAttribute('aria-disabled'),
            hintText: hint?.classList.contains('offline-hint') ? (hint.textContent ?? '').trim() : '',
            hintId: hint?.classList.contains('offline-hint') ? hint.id : '',
            described,
          };
        });
        check(
          `the reason beside a dead control is attached to it, in ${locale}`,
          gated.disabled &&
            gated.ariaDisabled === 'true' &&
            gated.hintText !== '' &&
            gated.hintId !== '' &&
            gated.described.includes(gated.hintId),
          `disabled ${gated.disabled}, hint "${gated.hintText.slice(0, 30)}" id "${gated.hintId}", ` +
            `described by [${gated.described.join(' ')}]`
        );
      }

      await ctx.setOffline(false);
      await page.waitForTimeout(300);
      const back = await page.evaluate(() => {
        const button = document.querySelector('#loginForm [data-needs-network-hint]');
        return {
          bar: Boolean(document.querySelector('.connection-notice')),
          disabled: button?.disabled === true,
          hint: Boolean(button?.nextElementSibling?.classList.contains('offline-hint')),
          described: button?.getAttribute('aria-describedby') ?? null,
        };
      });
      check(
        `coming back takes the bar, the reason and the reference with it, in ${locale}`,
        !back.bar && !back.disabled && !back.hint && back.described === null,
        `bar ${back.bar}, disabled ${back.disabled}, hint ${back.hint}, described ${back.described}`
      );

      await ctx.close();
      server.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 5. The same eight rules over the admin pages
 * ====================================================================== */

// **Read only, deliberately.** This section runs against the live deployment
// with a real staff session, so it looks and does not touch: it loads six pages
// and asks the eight questions the public sweep asks. Nothing here clicks a
// maintenance switch, sends a task or edits a posting. The interactive admin
// surfaces on section 12's list — the bulk bar, the question composer's
// reorder controls, the annotation sheet, the handoff modal, the account picker
// — are all writes against the real database, so they belong in the same
// sitting as phase 11's by-hand walk rather than in a file anybody can run.

define('a11y-admin', 'The admin pages against the same accessibility rules', async () => {
  const user = process.env.STAFF_USER;
  const pass = process.env.STAFF_PASS;
  const base = process.env.BASE ?? 'https://careers.globalfurry.tv';

  if (!user || !pass) {
    skip(
      'the admin pages against the accessibility rules',
      'set STAFF_USER and STAFF_PASS. Same reason as the responsive pass: an admin page is a ' +
        'session and a database rather than a document.'
    );
    return;
  }

  console.log(`      ${base}, ${A11Y_WIDTHS.join(', ')} across ${ADMIN_PAGES.length} pages`);

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

      if (await patchAssets(ctx)) {
        console.log("      PATCH_ASSETS: stylesheets and scripts are the working tree's");
      }

      const page = await ctx.newPage();

      await page.goto(`${base}/admin/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#staffLoginForm', { timeout: 20000 });
      await page.fill('#username', user);
      await page.fill('#password', pass);
      await page.click('#staffLoginForm button[type="submit"]');
      await page.waitForURL('**/admin', { timeout: 20000 }).catch(() => {});

      const signedIn = page.url().includes('/admin') && !page.url().includes('/admin/login');
      check(`a staff session was established for the sweep, in ${locale}`, signedIn, page.url());
      if (!signedIn) {
        await ctx.close();
        continue;
      }

      for (const path of ADMIN_PAGES) {
        const results = [];
        for (const width of A11Y_WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle').catch(() => {});
          results.push({ width, ...(await page.evaluate(auditA11y, { focusable: FOCUSABLE })) });
        }
        reportA11y(`${path} in ${locale}`, results);
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 6. The same eight rules over the applicant's own pages
 * ====================================================================== */

define('a11y-account', "The applicant's pages against the same accessibility rules", async () => {
  const user = process.env.APPLICANT_USER;
  const pass = process.env.APPLICANT_PASS;
  const base = process.env.BASE ?? 'https://careers.globalfurry.tv';

  if (!user || !pass) {
    skip(
      "the applicant's pages against the accessibility rules",
      'set APPLICANT_USER and APPLICANT_PASS. Signed out all five redirect to /login, so a run ' +
        'without them audits the login page five times and reports it as coverage.'
    );
    return;
  }

  console.log(`      ${base}, ${A11Y_WIDTHS.join(', ')} across ${ACCOUNT_PAGES.length} pages`);

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

      await patchAssets(ctx);

      const page = await ctx.newPage();

      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#loginForm', { timeout: 20000 });
      await page.fill('#identifier', user);
      await page.fill('#password', pass);
      await page.click('#loginForm button[type="submit"]');
      await page.waitForURL('**/account**', { timeout: 20000 }).catch(() => {});

      const signedIn = page.url().includes('/account');
      check(`an applicant session was established for the sweep, in ${locale}`, signedIn, page.url());
      if (!signedIn) {
        await ctx.close();
        continue;
      }

      // **An empty dashboard is the chrome, not the page**, and this section
      // proved it the expensive way on 30 August 2026: a freshly registered
      // account passed all five pages clean, and the moment it had an
      // application, three saved roles and two tasks on it, three of them
      // failed the heading outline. The counts are printed rather than
      // asserted, because whether the credential has content is a fact about
      // the credential and not about the build — but a clean run over five
      // empty lists is a clean run over five empty lists, and the numbers are
      // what say which of the two this was.
      const counted = [];

      for (const path of ACCOUNT_PAGES) {
        const results = [];
        for (const width of A11Y_WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle').catch(() => {});
          if (width === A11Y_WIDTHS[0]) {
            counted.push(
              `${path} ${await page.evaluate(() => document.querySelectorAll('.account-list > *, .job-card').length)}`
            );
          }
          results.push({ width, ...(await page.evaluate(auditA11y, { focusable: FOCUSABLE })) });
        }
        reportA11y(`${path} in ${locale}`, results);
      }

      console.log(`      ${locale} rows: ${counted.join(', ')}`);

      await ctx.close();
    }
  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * 7. The admin pages, which need a deployment and a staff credential
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

    if (await patchAssets(ctx)) {
      console.log("      PATCH_ASSETS: stylesheets and scripts are the working tree's");
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
        results.push({ width, ...(await page.evaluate(measure, { floorPx: CELL_FLOOR, iconFloor: MIN_SIZE })) });
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
 * 8. The applicant's own pages at six widths, which need the same credential
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

      await patchAssets(ctx);

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
          results.push({ width, ...(await page.evaluate(measure, { floorPx: CELL_FLOOR, iconFloor: MIN_SIZE })) });
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
