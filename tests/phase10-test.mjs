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

define('store', "The applicant's own data in IndexedDB", async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base });
  const page = await ctx.newPage();

  // Driven through the real module in a real browser rather than through a
  // stub. IndexedDB's semantics — compound keys, transaction lifetimes, a blob
  // surviving a round trip — are the whole of what is being checked, and none
  // of them exist in a fake.
  const idb = (body) =>
    page.evaluate(async (source) => {
      const module = await import('/assets/js/idb.js');
      return new Function('idb', `return (async () => { ${source} })()`)(module);
    }, body);

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    check('40. IndexedDB is available', await idb('return idb.available();'));

    /* Keyed by user id, structurally ------------------------------------- */

    await idb(`
      await idb.syncUser('user-one');
      await idb.putMine('user-one', 'saved', [{ id: 'a' }, { id: 'b' }]);
    `);

    const mine = await idb(`return idb.readMine('user-one', 'saved');`);
    check(
      '41. what one applicant stored reads back',
      Array.isArray(mine?.data) && mine.data.length === 2,
      JSON.stringify(mine?.data)
    );
    check(
      '42. and comes back with the time it was cached',
      typeof mine?.cachedAt === 'number' && mine.cachedAt > 0,
      `cachedAt=${mine?.cachedAt} — section 14 wants a last updated line on every cached view`
    );

    const otherUser = await idb(`return idb.readMine('user-two', 'saved');`);
    check(
      '43. and is not readable under another user id',
      otherUser === null,
      `${JSON.stringify(otherUser)} — the user id is part of the key, not a field beside it`
    );

    /* A blob survives ------------------------------------------------------ */

    const blob = await idb(`
      await idb.putAvatar('user-one', '/x/abc.webp', new Blob([new Uint8Array([1,2,3,4])], { type: 'image/webp' }));
      const back = await idb.readAvatar('user-one');
      return { type: back?.blob?.type, size: back?.blob?.size, url: back?.url };
    `);
    check(
      '44. an avatar survives the round trip as bytes',
      blob?.type === 'image/webp' && blob?.size === 4 && blob?.url === '/x/abc.webp',
      JSON.stringify(blob)
    );

    /* A failed session is not a sign out ----------------------------------- */

    const afterNull = await idb(`
      await idb.syncUser(null);
      const row = await idb.readMine('user-one', 'saved');
      return { kept: row !== null, storedUserId: await idb.storedUserId() };
    `);
    check(
      '45. a null session wipes nothing',
      afterNull.kept && afterNull.storedUserId === 'user-one',
      `${JSON.stringify(afterNull)} — offline that request fails every time, ` +
        'and treating it as a sign out would throw away the only copy there is'
    );

    /* A different applicant on the same browser ---------------------------- */

    const swapped = await idb(`
      const result = await idb.syncUser('user-two');
      return {
        wiped: result.wiped,
        oldRow: await idb.readMine('user-one', 'saved'),
        oldAvatar: await idb.readAvatar('user-one'),
        storedUserId: await idb.storedUserId(),
      };
    `);
    check('46. signing in as somebody else wipes the database', swapped.wiped);
    check(
      "47. and the previous applicant's rows are gone, avatar included",
      swapped.oldRow === null && swapped.oldAvatar === null,
      JSON.stringify(swapped)
    );
    check('48. the stored owner is now the new one', swapped.storedUserId === 'user-two');

    /* The wipe happens before a write, whoever calls first ------------------ */

    // syncUser is started and deliberately not awaited, then a write is made
    // immediately — the exact shape of shell.js starting the sync while a page
    // module gets to a write first. The gate inside idb.js is what makes the
    // ordering a property of the file rather than a habit of its callers.
    const raced = await idb(`
      await idb.putMine('user-two', 'tasks', ['before']);
      idb.syncUser('user-three');
      await idb.putMine('user-three', 'tasks', ['after']);
      return {
        old: await idb.readMine('user-two', 'tasks'),
        fresh: await idb.readMine('user-three', 'tasks'),
      };
    `);
    check(
      "49. a write racing the wipe does not survive it",
      raced.old === null,
      `${JSON.stringify(raced.old)} — the wipe is ordered before the write, not after it`
    );
    check(
      '50. and the new applicant\'s own write does',
      raced.fresh?.data?.[0] === 'after',
      JSON.stringify(raced.fresh)
    );

    /* Sign out -------------------------------------------------------------- */

    const wiped = await idb(`
      await idb.wipeAll();
      return await idb.describe();
    `);
    check(
      '51. wipeAll leaves nothing behind',
      wiped.kinds.length === 0 && wiped.queued === 0 && wiped.userId === null,
      JSON.stringify(wiped)
    );
  } finally {
    await browser.close();
    server.close();
  }
});

define('public', 'Public data offline: the board and the postings', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base });
  const page = await ctx.newPage();

  // A posting document shaped exactly as api/job-page.js renders one: the
  // inlined #jobData payload carrying content for both languages, which is what
  // makes a cached posting readable in either and what the worker reads the
  // titles out of. Served for /jobs/* by the route below.
  const posting = (id, en, zh) => `<!doctype html><html lang="en"><head>
<title>${en} | Careers@GFTV</title></head><body>
<script type="application/json" id="jobData">${JSON.stringify({
    job: { id, is_open: true, is_paid: false },
    content: { en: { title: en }, zh: { title: zh } },
    applications_open: true,
    preview: false,
  }).replace(/</g, '\\u003c')}<\/script>
<div id="jobDetail"></div></body></html>`;

  const POSTINGS = [
    ['11111111-1111-1111-1111-111111111111', 'Camera Operator', '摄影师'],
    ['22222222-2222-2222-2222-222222222222', 'Subtitle Editor', '字幕编辑'],
  ];

  await ctx.route('**/jobs/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const match = POSTINGS.find((entry) => entry[0] === id);
    if (!match) return route.fulfill({ status: 404, body: 'no' });
    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' },
      body: posting(...match),
    });
  });

  const board = { total: 2, jobs: [{ id: POSTINGS[0][0], title: 'Camera Operator', slug: 'camera' }] };
  await ctx.route('**/api/public/search*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: board }),
    })
  );

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await until(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), {
      timeout: 30000,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    /* Open two postings so they are held ---------------------------------- */

    for (const [id] of POSTINGS) {
      await page.goto(`/jobs/${id}`, { waitUntil: 'domcontentloaded' });
    }

    const held = await until(
      page,
      async () => (await (await caches.open('careers-gftv-postings')).keys()).length === 2,
      { timeout: 10000 }
    );
    check('52. an opened posting is held for offline reading', held);

    /* A cached posting reads in both languages ---------------------------- */

    await ctx.setOffline(true);
    await page.goto(`/jobs/${POSTINGS[0][0]}`, { waitUntil: 'domcontentloaded' });

    const both = await page.evaluate(() => {
      const payload = JSON.parse(document.querySelector('#jobData').textContent);
      return Object.keys(payload.content ?? {});
    });
    check(
      '53. and carries both languages, so switching offline does not empty it',
      both.includes('en') && both.includes('zh'),
      both.join(', ')
    );

    /* The offline page lists what is held --------------------------------- */

    await page.goto('/not-a-real-route', { waitUntil: 'domcontentloaded' });

    const listed = await until(
      page,
      () => document.querySelectorAll('#offlineHeldList li').length === 2,
      { timeout: 8000 }
    );
    check('54. the fallback page lists the postings it is holding', listed);

    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('#offlineHeldList a')].map((a) => a.textContent.trim())
    );
    check(
      '55. by name rather than by uuid',
      titles.includes('Camera Operator') && titles.includes('Subtitle Editor'),
      titles.join(' | ')
    );
    check(
      '56. most recently viewed first',
      titles[0] === 'Camera Operator',
      `${titles.join(' | ')} — the first entry is the one just reopened offline`
    );

    await page.evaluate(async () => {
      const module = await import('/assets/js/i18n.js');
      await module.applyLocale('zh');
    });
    await page.waitForTimeout(400);
    const zhTitles = await page.evaluate(() =>
      [...document.querySelectorAll('#offlineHeldList a')].map((a) => a.textContent.trim())
    );
    check(
      '57. and follows a language change without asking the worker again',
      zhTitles.includes('摄影师'),
      zhTitles.join(' | ')
    );
    await page.evaluate(async () => {
      const module = await import('/assets/js/i18n.js');
      await module.applyLocale('en');
    });

    /* The saved board ------------------------------------------------------ */

    await ctx.setOffline(false);
    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    await until(page, () => document.querySelectorAll('#results .job-card:not([aria-hidden])').length > 0, {
      timeout: 15000,
    });

    const savedWhileOnline = await page.evaluate(() =>
      document.querySelector('#boardCached')?.hidden !== false
    );
    check(
      '58. nothing claims to be a saved copy while the board is live',
      savedWhileOnline,
      'the line is cleared on every new search, not left over one that came back'
    );

    // The site is unreachable rather than the machine being offline, which is
    // the case the board has to survive without saying the wrong thing.
    await ctx.route('**/api/public/search*', (route) => route.abort('failed'));
    await page.goto('/search?q=camera', { waitUntil: 'domcontentloaded' });

    const shownSaved = await until(
      page,
      () => document.querySelector('#boardCached')?.hidden === false,
      { timeout: 10000 }
    );
    check('59. a failed search falls back to the last board that worked', shownSaved);

    const savedText = await page.textContent('#boardCached');
    check(
      '60. and says the filters do not match what was asked for',
      /do not match the filters/i.test(savedText ?? ''),
      `${savedText} — the board was saved with no query and this one asked for "camera"`
    );
    check(
      '61. and the cards from the saved board are on screen',
      (await page.locator('#results .job-card:not([aria-hidden])').count()) > 0
    );
  } finally {
    await browser.close();
    server.close();
  }
});

define('account', "The applicant's own pages with no connection", async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base });
  const page = await ctx.newPage();

  const USER = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', display_name: 'Sam Tan', username: 'samtan' };

  // A signed in applicant, served by routes rather than by a real login: what
  // is under test is what the pages do when those routes stop answering, and
  // standing up an account on the deployment to prove it would make this
  // section need credentials it has no other use for.
  const json = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });

  let online = true;
  const guard = (route, data) => (online ? route.fulfill(json(data)) : route.abort('failed'));

  // Registered first, and that is not a style choice: Playwright matches routes
  // in the reverse of the order they were added, so a catch-all added last
  // would answer everything and the four specific ones below would never run.
  await ctx.route('**/api/**', (route) => guard(route, {}));

  await ctx.route('**/api/auth/applicant/session*', (route) => guard(route, { user: USER }));
  await ctx.route('**/api/saved/mine*', (route) =>
    guard(route, {
      counts: { all: 1, open: 1, closed: 0 },
      saved: [
        {
          saved_at: '2026-08-20T00:00:00Z',
          job: { id: '11111111-1111-1111-1111-111111111111', title: 'Camera Operator', is_open: true, is_paid: false },
        },
      ],
    })
  );
  await ctx.route('**/api/applications/mine*', (route) =>
    guard(route, { counts: { all: 1 }, applications: [] })
  );
  await ctx.route('**/api/tasks/mine*', (route) => guard(route, { tasks: [] }));

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await until(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), {
      timeout: 30000,
    });
    // The worker does not claim the page that installed it, so nothing is
    // controlled until a reload — and without a controller there is no offline
    // fallback for the uncached route this section ends on.
    await page.reload({ waitUntil: 'domcontentloaded' });

    /* Online, the copy is kept ------------------------------------------- */

    await page.goto('/account/saved', { waitUntil: 'domcontentloaded' });
    await until(page, () => document.querySelectorAll('#savedList .account-row').length > 0, {
      timeout: 15000,
    });

    // The other two are visited online as well. A page that has never loaded
    // has nothing saved, and offline it is right for it to say so rather than
    // invent a copy — so they are opened here for the same reason a person
    // would have: they used the app before they lost the connection.
    for (const path of ['/account/applications', '/account/tasks']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await until(page, () => !document.querySelector('#accountLoading'), { timeout: 15000 });
    }
    await page.goto('/account/saved', { waitUntil: 'domcontentloaded' });
    await until(page, () => document.querySelectorAll('#savedList .account-row').length > 0, {
      timeout: 15000,
    });

    const kept = await page.evaluate(async (id) => {
      const { readMine } = await import('/assets/js/idb.js');
      const [saved, profile] = await Promise.all([readMine(id, 'saved'), readMine(id, 'profile')]);
      return { saved: saved?.data?.saved?.length ?? 0, name: profile?.data?.display_name ?? null };
    }, USER.id);

    check('62. a page that loaded keeps a copy of its own data', kept.saved === 1, JSON.stringify(kept));
    check('63. and the account shell keeps the profile beside it', kept.name === 'Sam Tan', kept.name);

    check(
      '64. nothing claims to be a saved copy while the page is live',
      (await page.locator('#accountCached').count()) === 0
    );

    /* Offline, the page still opens --------------------------------------- */

    online = false;
    await page.goto('/account/saved', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    check(
      '65. an account page does not bounce to sign in when the session cannot be asked',
      page.url().includes('/account/saved'),
      `${page.url()} — being unable to ask is not an answer, and /login is the one ` +
        'page in the build that cannot work offline'
    );
    check(
      '66. and draws the applicant from the profile saved on this device',
      (await page.textContent('body'))?.includes('Sam Tan'),
      'the identity in the account header'
    );
    check(
      '67. the saved roles are on screen from the local copy',
      (await page.locator('#savedList .account-row').count()) === 1
    );

    const line = await page.textContent('#accountCached').catch(() => null);
    check(
      '68. marked with the time it was cached',
      /saved on your device/i.test(line ?? ''),
      line ?? '(no line)'
    );

    check(
      '69. and the header does not offer to sign them in',
      (await page.locator('#siteNav a[href="/login"]').count()) === 0,
      'a page listing somebody\'s own roles under a Sign in link is the site ' +
        'disagreeing with itself about who is looking at it'
    );

    /* The other two pages -------------------------------------------------- */

    for (const [path, name] of [
      ['/account/applications', '70. My applications'],
      ['/account/tasks', '71. outstanding tasks'],
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      check(
        `${name} opens offline from its own copy`,
        page.url().includes(path) && (await page.locator('#accountCached').count()) === 1,
        page.url()
      );
    }

    /* The fallback page offers them --------------------------------------- */

    // Everything above ran with the machine online and the API refusing to
    // answer, which is the sharper of the two cases and the one the
    // `unreachable` flag exists for. The fallback page needs the other one:
    // the document request itself has to fail before the worker answers with
    // /offline instead of passing a 404 through.
    await ctx.setOffline(true);
    await page.goto('/nothing-here-at-all', { waitUntil: 'domcontentloaded' });
    const offered = await until(
      page,
      () => document.querySelectorAll('#offlineSavedList li').length > 0,
      { timeout: 8000 }
    );
    check('72. the fallback page offers the saved roles as somewhere to go', offered);
    check(
      '73. by name, linking to the posting',
      (await page.textContent('#offlineSavedList'))?.includes('Camera Operator'),
      await page.textContent('#offlineSavedList')
    );

    /* A real signed out answer still redirects ----------------------------- */

    await ctx.setOffline(false);
    online = true;
    await ctx.unroute('**/api/auth/applicant/session*');
    await ctx.route('**/api/auth/applicant/session*', (route) => route.fulfill(json({ user: null })));

    await page.goto('/account/saved', { waitUntil: 'domcontentloaded' });
    const bounced = await page.waitForURL(/\/login/, { timeout: 10000 }).then(() => true).catch(() => false);
    check(
      '74. a real signed out answer still redirects to sign in',
      bounced,
      `${page.url()} — only a failure to ask falls back, never an answer`
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
