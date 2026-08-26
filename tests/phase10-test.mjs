// Phase 10 verification run, from next-steps.md section 2.
//
//   node tests/phase10-test.mjs                  everything that can run
//   node tests/phase10-test.mjs --only=worker    one or more sections
//   BASE=https://... node tests/phase10-test.mjs against a preview deployment
//
// Keeping phase 8 and 9's habits: a define() per section so --only= works, a
// detail string on every check, skip() rather than silence, and no fixed wait
// after an action that makes a request.
//
// **This phase cannot be verified the way the nine before it were.** Every one
// of those could be checked by asking the deployment a question. A service
// worker cannot: it is not on the deployment until it is pushed, and by then a
// wrong precache list has already shipped — and it fails by silently turning
// every offline behaviour off rather than by breaking anything visible.
//
// So the `worker` section stands up main-site/ over http://localhost, which is
// a secure origin as far as service worker registration is concerned, and
// drives a real browser through install, activate, offline navigation, the
// fallback, and the update prompt. **It needs no deployment, no credentials,
// and no network**, which is phase 9's lesson applied before it could bite: a
// requireEnv at module level runs before --only= is read, and a section
// documented as needing nothing then exits on a missing password. Nothing in
// this file reads a credential above a section.
//
// What it still cannot check, and what section 14's last line asks for anyway:
// a real Android install and iOS Safari, which is stricter. Those are in
// main-site/README.md's offline test checklist and are done by hand.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', 'main-site');
const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';

const ONLY = (() => {
  const arg = process.argv.find((value) => value.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();

/**
 * A required environment variable.
 *
 * No default, deliberately. A staff password with a fallback in a committed
 * file is a staff password in the repository, whatever the fallback is for.
 *
 * **Called from inside a section and never at module level.** Phase 9's file
 * called it above the --only= handling, so its one credential-free section
 * could not be run without a staff password that it never used.
 *
 * Nothing calls this yet: the only section so far needs no account at all. It
 * is here so that the sections landing with parts 6 to 9 have one shape to
 * follow, and so the rule above is written down where they will be written.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}. See tests/README.md.`);
    process.exit(1);
  }
  return value;
}

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

/* -------------------------------------------------------------------------
 * A static server over main-site/
 *
 * Only what the worker needs: cleanUrls, a content type, and the two headers
 * vercel.json sets on sw.js. There is no API behind it, so every /api/ call
 * answers 404 — which is the point for these checks. What is under test is
 * which requests the worker answers from a cache and which it refuses to.
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

/** cleanUrls, as vercel.json has it. */
async function resolveRoute(pathname) {
  if (pathname === '/') return join(SITE, 'index.html');
  const bare = pathname.replace(/^\/|\/$/g, '');
  for (const candidate of [bare, `${bare}.html`, `${bare}/index.html`]) {
    const full = join(SITE, candidate);
    if (await isFile(full)) return full;
  }
  return null;
}

/**
 * @returns {Promise<{ base: string, requested: string[], bump: (on: boolean) => void, close: () => void }>}
 */
async function serveSite() {
  const requested = [];
  let bumping = false;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requested.push(url.pathname);

    const file = await resolveRoute(url.pathname);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }

    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' };

    if (url.pathname === '/sw.js') {
      headers['Cache-Control'] = 'no-cache';
      headers['Service-Worker-Allowed'] = '/';

      // Serve a worker with a different VERSION, without editing the file in
      // the repository. That is the whole update story: a new build is a new
      // VERSION and nothing else about the file has to change.
      if (bumping) {
        const body = (await readFile(file, 'utf8')).replace(
          /const VERSION = '[^']+'/,
          "const VERSION = 'careers-gftv-test-bumped'"
        );
        res.writeHead(200, headers);
        return res.end(body);
      }
    }

    res.writeHead(200, headers);
    res.end(await readFile(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requested,
    bump: (on) => {
      bumping = on;
    },
    close: () => server.close(),
  };
}

/**
 * Poll rather than wait a fixed time. A fixed wait after an action is a race.
 *
 * A destroyed execution context is treated as "not yet" rather than as an
 * error, because in this phase the page genuinely can reload underneath a
 * poll: offline.js reloads on `controllerchange`, so accepting an update — or
 * posting `skip-waiting` by hand, as the worker section does — navigates. That
 * is the code working, and a poll that threw on it would be reporting the
 * feature as broken because it works.
 */
async function until(page, predicate, { timeout = 10000, every = 250 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (cause) {
      if (!/Execution context was destroyed|Target closed/.test(String(cause))) throw cause;
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(every);
  }
}

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

define('worker', 'The service worker, against a local copy of main-site', async () => {
  const server = await serveSite();
  console.log(`      serving main-site at ${server.base}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base });
  const page = await ctx.newPage();

  try {
    /* Install and precache ------------------------------------------------ */

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const active = await until(
      page,
      async () => Boolean((await navigator.serviceWorker.getRegistration())?.active),
      { timeout: 30000 }
    );
    check('1. the worker installs and activates', active);

    if (!active) {
      skip('2 to 25', 'the worker never activated, so nothing below can be read.');
      return;
    }

    // The precache is filled inside install's waitUntil, which has already
    // resolved by the time the worker is active. Read the cache, not a clock.
    const filled = await until(
      page,
      async () => {
        const names = await caches.keys();
        const shell = names.find((n) => n.startsWith('careers-gftv-shell-'));
        if (!shell) return false;
        return (await (await caches.open(shell)).keys()).length > 90;
      },
      { timeout: 30000 }
    );
    check('2. the precache fills', filled);

    const cacheState = await page.evaluate(async () => {
      const out = {};
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        out[name] = (await cache.keys()).map((request) => new URL(request.url).pathname);
      }
      return out;
    });

    const shellName = Object.keys(cacheState).find((n) => n.startsWith('careers-gftv-shell-'));
    const shell = cacheState[shellName] ?? [];

    check('3. the shell cache is named for the version', Boolean(shellName), shellName ?? 'absent');

    // Read from the file rather than hardcoded, so adding an entry to sw.js
    // does not silently make this check meaningless.
    const expected = (await readFile(join(SITE, 'sw.js'), 'utf8'))
      .slice(
        (await readFile(join(SITE, 'sw.js'), 'utf8')).indexOf('const PRECACHE = ['),
        (await readFile(join(SITE, 'sw.js'), 'utf8')).indexOf('\n];')
      )
      .replace(/\/\/[^\n]*/g, '')
      .match(/'[^']+'/g)?.length ?? 0;

    check(
      `4. every one of the ${expected} precache entries stored`,
      shell.length === expected,
      `stored ${shell.length}`
    );

    check(
      '5. both dictionaries are precached, not the active one',
      shell.includes('/assets/i18n/en.json') && shell.includes('/assets/i18n/zh.json'),
      'section 14: switching language offline must not produce an untranslated page'
    );
    check('6. the offline fallback page is precached', shell.includes('/offline'));
    check(
      '7. the font is precached',
      shell.includes('/assets/fonts/ProximaNova-Regular.woff2'),
      'a font from a third party host could not be, which is why it is self hosted'
    );
    check(
      '8. build-status.json is precached',
      shell.includes('/assets/build-status.json'),
      'without it an offline page loses the notice bar and the disabled control pattern'
    );
    check(
      '9. the og:image is not precached',
      !shell.includes('/HLC-main.png'),
      'half a megabyte only a crawler ever fetches'
    );

    /* Section 14: skipWaiting and claim only behind the prompt ------------- */

    check(
      '10. it does not claim the page that installed it',
      !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))),
      'section 14: use skipWaiting and clients.claim only behind the update prompt'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    check(
      '11. it controls the page after a reload',
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    );

    /* Offline ------------------------------------------------------------- */

    await ctx.setOffline(true);
    const before = server.requested.length;

    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    check(
      '12. /search is served offline from the shell',
      (await page.locator('#resultSummary').count()) === 1,
      await page.title()
    );

    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    check('13. /about is served offline', /about/i.test(await page.title()), await page.title());

    await page.goto('/search?q=editor&commitment=part_time', { waitUntil: 'domcontentloaded' });
    check(
      '14. a query string still hits the cached /search',
      (await page.locator('#resultSummary').count()) === 1,
      'matched on the path: the query is read by search-page.js, not by the server'
    );

    // The account shell is served, and then its own module redirects to /login
    // because the session check fails offline. That redirect is the page's and
    // not the worker's, and it is what parts 7 and 9 have to fix. What belongs
    // to this section is only that the HTML never touched the network.
    const beforeAccount = server.requested.length;
    await page.goto('/account/saved').catch(() => null);
    check(
      '15. an account shell is served offline without reaching the server',
      server.requested.length === beforeAccount,
      `${server.requested.length - beforeAccount} requests reached the server`
    );

    // Let that redirect land before navigating again. Without this it arrives
    // in the middle of the next goto and the check below reads the sign in page
    // instead of the fallback — the same shape as "a fixed wait after a click
    // is a race", with the race being against a navigation nobody asked for.
    await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => null);

    await page.goto('/not-a-real-route-at-all', { waitUntil: 'domcontentloaded' });
    const heading = (await page.textContent('h1').catch(() => ''))?.trim() ?? '';
    check(
      '16. an uncached route falls back to the offline page',
      /not saved for offline reading/i.test(heading),
      heading
    );
    check(
      '17. and the address bar keeps the route that was asked for',
      page.url().endsWith('/not-a-real-route-at-all'),
      `${page.url()} — this is what lets the fallback's retry control be a reload`
    );

    check(
      '18. nothing reached the server while offline',
      server.requested.length === before,
      server.requested.slice(before).join(' ')
    );

    /* A posting page ------------------------------------------------------ */

    await ctx.setOffline(false);

    // There is no API behind the local server, so this 404s. That is the check:
    // isCacheable refuses anything that is not a 200, and a posting that could
    // not be read must not become a cached posting that cannot be read.
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000', {
      waitUntil: 'domcontentloaded',
    });

    const postingsAfter = await page.evaluate(async () =>
      (await (await caches.open('careers-gftv-postings')).keys()).length
    );
    check(
      '19. a posting that answered 404 is not cached',
      postingsAfter === 0,
      `${postingsAfter} entries in the postings cache`
    );

    /* What is never cached ------------------------------------------------ */

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const everything = await page.evaluate(async () => {
      const out = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
      }
      return out;
    });

    check(
      '20. nothing authenticated or administrative was cached',
      !everything.some(
        (path) =>
          path.startsWith('/api/admin') ||
          path.startsWith('/api/auth') ||
          path.startsWith('/api/account') ||
          path === '/api/public/feature-status'
      ),
      'the Cache API is per origin and this origin is shared with the other GFTV apps'
    );

    /* The update path ----------------------------------------------------- */

    server.bump(true);

    const update = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      for (let attempt = 0; attempt < 20 && !registration.waiting; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return {
        waiting: Boolean(registration.waiting),
        controllerIsStillTheOldOne:
          navigator.serviceWorker.controller?.scriptURL === registration.active?.scriptURL,
      };
    });

    check('21. a new VERSION installs and waits', update.waiting);
    check(
      '22. and the page is not swapped underneath the reader',
      update.controllerIsStillTheOldOne,
      'section 14: let the applicant reload rather than swapping the page under them'
    );

    const swapped = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration.waiting) return false;
      const changed = new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), {
          once: true,
        });
        setTimeout(() => resolve(false), 8000);
      });
      // What offline.js's update prompt does when the reader accepts it. Sent
      // by hand here so this section can check the worker's own contract
      // without going through the interface; the `client` section checks the
      // interface. One consequence to know about: offline.js is on this page
      // too, and it reloads on controllerchange, so this line navigates.
      registration.waiting.postMessage('skip-waiting');
      return changed;
    });
    check('23. posting skip-waiting swaps the worker', swapped);

    // That reload has to land before anything else is read off the page.
    await page.waitForLoadState('domcontentloaded').catch(() => null);

    // controllerchange fires when clients.claim resolves, which can beat the
    // activate handler's own waitUntil to the finish. Poll for the tidy up.
    const tidied = await until(
      page,
      async () =>
        (await caches.keys()).filter((name) => name.startsWith('careers-gftv-shell-')).length === 1
    );

    const remaining = await page.evaluate(async () => await caches.keys());
    check(
      '24. exactly one shell cache survives, and it is the new one',
      tidied && remaining.some((name) => name.includes('careers-gftv-test-bumped')),
      remaining.join(', ')
    );
    check(
      '25. the unversioned data caches survive the update',
      remaining.includes('careers-gftv-public') &&
        remaining.includes('careers-gftv-postings') &&
        remaining.includes('careers-gftv-state'),
      `${remaining.join(', ')} — postings and public answers are data, not build output`
    );
  } finally {
    await browser.close();
    server.close();
  }
});

define('client', 'The update prompt and the connection banner', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base });
  const page = await ctx.newPage();

  const bar = () => page.locator('.connection-notice');
  const barText = async () =>
    ((await bar().count()) > 0 ? (await bar().textContent()) : '')?.replace(/\s+/g, ' ').trim();

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await until(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), {
      timeout: 30000,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    /* One registration, one owner ----------------------------------------- */

    const inlineRegistrations = await page.evaluate(
      () =>
        [...document.querySelectorAll('script:not([src])')].filter((s) =>
          s.textContent.includes('serviceWorker.register')
        ).length
    );
    check(
      '26. no page carries its own inline registration any more',
      inlineRegistrations === 0,
      `${inlineRegistrations} inline register() blocks in the markup`
    );

    check('27. nothing is in the bar while online and reachable', (await bar().count()) === 0, await barText());

    /* Offline -------------------------------------------------------------- */

    await ctx.setOffline(true);
    const shown = await until(page, () => Boolean(document.querySelector('.connection-notice')), {
      timeout: 8000,
    });
    check('28. the banner appears when the connection drops', shown, await barText());
    check(
      '29. and says you are offline',
      /you are offline/i.test((await barText()) ?? ''),
      await barText()
    );
    check(
      '30. it sits above the phase notice',
      await page.evaluate(() => {
        const connection = document.querySelector('.connection-notice');
        const phase = document.querySelector('.phase-notice');
        if (!connection || !phase) return !!connection;
        return connection.compareDocumentPosition(phase) & Node.DOCUMENT_POSITION_FOLLOWING;
      }),
      'both are prepended, so without an explicit order they swap on a redraw'
    );

    /* The wording follows a language change -------------------------------- */

    await page.evaluate(async () => {
      const module = await import('/assets/js/i18n.js');
      await module.applyLocale('zh');
    });
    await page.waitForTimeout(400);
    check(
      '31. the banner follows a language change with no reload',
      /离线/.test((await barText()) ?? ''),
      await barText()
    );
    await page.evaluate(async () => {
      const module = await import('/assets/js/i18n.js');
      await module.applyLocale('en');
    });

    /* Back online ---------------------------------------------------------- */

    await ctx.setOffline(false);
    const cleared = await until(page, () => !document.querySelector('.connection-notice'), {
      timeout: 8000,
    });
    check(
      '32. it is removed the moment connectivity returns',
      cleared,
      'section 14 says the moment, not on the next request'
    );

    /* The second wording: online, but the site is not answering -------------- */

    // navigator.onLine stays true and every API call throws, which is a Vercel
    // outage on perfect wifi. Telling that reader they are offline would send
    // them to reset a router that is working.
    await ctx.route('**/api/**', (route) => route.abort('failed'));

    await page.evaluate(async () => {
      const { api } = await import('/assets/js/api.js');
      await api('/api/public/facets');
      await api('/api/public/facets');
    });
    await page.waitForTimeout(300);

    const unreachable = await barText();
    check(
      '33. two failed calls while online raise the second wording',
      /cannot reach/i.test(unreachable ?? ''),
      unreachable
    );
    check(
      '34. and it does not claim the reader is offline',
      !/you are offline/i.test(unreachable ?? ''),
      unreachable
    );

    await ctx.unroute('**/api/**');
    await page.evaluate(async () => {
      const { api } = await import('/assets/js/api.js');
      await api('/api/public/facets');
    });
    await page.waitForTimeout(300);
    check(
      '35. one answer from the site clears it, whatever its status',
      (await bar().count()) === 0,
      `${await barText()} — a 404 from the local server is the site answering`
    );

    /* The update prompt ----------------------------------------------------- */

    server.bump(true);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });

    const prompted = await until(
      page,
      () => document.querySelector('.connection-notice')?.dataset.state === 'update',
      { timeout: 15000 }
    );
    check('36. a waiting worker raises the update prompt', prompted, await barText());
    check(
      '37. and the page is not reloaded until the reader asks',
      await page.evaluate(() => Boolean(document.querySelector('[data-sw-update]'))),
      'section 14: let the applicant reload rather than swapping the page under them'
    );

    const reloaded = page.waitForNavigation({ timeout: 15000 }).then(() => true).catch(() => false);
    await page.click('[data-sw-update]');
    check('38. accepting it reloads the page', await reloaded);

    await until(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
    const runningVersion = await page.evaluate(async () => {
      const { workerVersion } = await import('/assets/js/offline.js');
      return workerVersion();
    });
    check(
      '39. and the new worker is the one now in control',
      runningVersion === 'careers-gftv-test-bumped',
      String(runningVersion)
    );
  } finally {
    await browser.close();
    server.close();
  }
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 10 verification');
  console.log(`  deployment sections: ${BASE}`);
  console.log('  the worker section needs no deployment, no credentials, and no network');

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
