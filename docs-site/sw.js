// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The documentation site's service worker. Phase 14 part 4.
//
// BUMP VERSION ON EVERY CHANGE TO THIS SITE. Not once per phase, and not only
// when this file changes: it is the cache key, and a reader who has been here
// before is served the previous build until it moves.
//
// **The portal has a worker and this had none until now**, per phase 13
// decision 3, whose reason was that five placeholder pages are not worth a
// cache. Thirty pages and a staff tier are, and decision 3's own argument
// turned around on the way: what it worried about was a stale page, and a stale
// page is exactly what a network first worker does not produce.
//
// ---------------------------------------------------------------------------
// What is cached, and the one decision that needed asking about
// ---------------------------------------------------------------------------
//
// **The gated guides are cached too, per reader.** That was put up as a
// decision on 3 September 2026 and answered deliberately, because it is the
// expensive answer. 16e keeps gated content behind an authenticated route, so
// what is cached here is staff procedure sitting in the browser storage of
// whatever machine it was read on. Two things make it defensible:
//
//   **The cache is named for the tier it was filled for.** A reader whose tier
//   changes does not inherit the old one: the name no longer matches, and
//   `activate` and every tier message drop every gated cache that is not the
//   current one.
//
//   **Signing out deletes all of them.** shell.js posts `signed-out` before it
//   navigates, and this file does not wait to be asked twice.
//
// If either of those stops being true, this decision stops being safe. That is
// the whole of the argument and it is written here rather than in the memo,
// because the memo is not what somebody edits when they change a cache name.
//
// ---------------------------------------------------------------------------
// The strategies, and why network first is nearly everywhere
// ---------------------------------------------------------------------------
//
// A documentation site is read to find out what to do. A procedure served from
// a cache after the step changed is worse than a page that will not load, which
// is decision 3's own sentence and is the rule this file is built on.
//
//   **Guides, the search index, and every API answer: network first.** The
//   cache answers only when the network does not. Online, a reader is always
//   reading what was deployed.
//
//   **Assets: cache first.** `/assets/*`, the fonts and the three images are
//   build output and change only with a deploy, and a deploy bumps VERSION,
//   which is a new cache filled from the network. Fetching them again on every
//   page view would be a network request for a byte identical answer.
//
//   **`/api/auth/*`: never cached, at all.** A session is not a document.
//
// ---------------------------------------------------------------------------
// The precache list is written by the build
// ---------------------------------------------------------------------------
//
// `scripts/build.js` replaces the marker below with the addresses it has just
// written into `dist/`, so the list cannot drift from the tree. **This is the
// one place this site is better arranged than the portal**, whose list is
// written by hand and checked by `node check-precache.js` — and the difference
// is not a judgement about either, it is that this site has a build step and
// the portal does not.
//
// A reader offline on an address nobody precached gets the shell, which draws
// its chrome and says the page is not available offline. That is 16e's "a
// reader must not be able to tell which pipeline a page came from" holding in
// the one condition where it would be easiest to break.

const VERSION = 'careers-gftv-docs-phase14-v6';

/** Build output. Versioned, so a bump is a new cache filled from the network. */
const SHELL = `careers-gftv-docs-shell-${VERSION}`;

/**
 * One reader's gated pages, named for the tier they were fetched at.
 *
 * **Not versioned, and named for the tier instead.** These are answers rather
 * than build output, and throwing them away on every deploy would empty the
 * staff guides for somebody who is offline at the wrong moment. What they must
 * survive is a deploy; what they must not survive is a change of reader.
 */
const gatedCacheFor = (tier) => `careers-gftv-docs-gated-${tier}`;
const GATED_PREFIX = 'careers-gftv-docs-gated-';

/**
 * Where the tier this worker last cached for is remembered.
 *
 * The Cache API is a key value store and this is a key, not a route. It is in
 * its own unversioned cache so that a VERSION bump does not lose track of whose
 * gated pages are held, which would leave a cache nothing could match and
 * nothing would clear.
 */
const META = 'careers-gftv-docs-meta';
const TIER_KEY = '/__sw/tier';

/** Addresses under this never touch a cache, in either direction. */
const NEVER = /^\/api\/auth\//;

/** The API answers a signed in reader's guides come through. */
const GATED_API = /^\/api\/(content|nav|search-index)$/;

/**
 * The public search index, in any language.
 *
 * One static file per language since part 9, and every one of them precached.
 * The English keeps the name it has always had, so a reader who has never
 * changed language fetches exactly what they always did.
 */
const SEARCH_INDEX = /^\/search-index(\.[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)?\.json$/;

const PRECACHE = [
  /* BUILD:PRECACHE */
];

/* -------------------------------------------------------------------------
 * Install and activate
 * ---------------------------------------------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(fillShell());
  // No skipWaiting. The new worker waits until a reader accepts the update
  // prompt, per specification section 14 and update-bar-spec.md, and
  // update-bar.js posting `skip-waiting` is the only route to it.
});

/**
 * Fetch every precache entry into the shell cache, one at a time.
 *
 * The portal's reasoning, and it applies here unchanged: `cache.addAll` rejects
 * as a whole on the first bad entry, so one wrong path turns every offline
 * behaviour off and says nothing. This reports what it could not get and keeps
 * the rest.
 *
 * `cache: 'reload'` is what stops a brand new cache being filled out of the
 * browser's own HTTP cache with the previous build's files, which would defeat
 * the bump that created it.
 */
async function fillShell() {
  const cache = await caches.open(SHELL);
  const failed = [];

  await Promise.all(
    PRECACHE.map(async (path) => {
      try {
        const response = await fetch(new Request(path, { cache: 'reload' }));
        if (!response.ok) throw new Error(`${response.status}`);
        await cache.put(path, response);
      } catch (cause) {
        failed.push(`${path} (${cause?.message ?? cause})`);
      }
    })
  );

  if (failed.length > 0) {
    console.warn(
      `[careers-gftv-docs] ${failed.length} of ${PRECACHE.length} precache entries ` +
        `could not be stored. Offline is degraded, not off:\n  ${failed.join('\n  ')}`
    );
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const tier = await currentTier();
      const keep = new Set([SHELL, META, gatedCacheFor(tier)]);

      const keys = await caches.keys();
      await Promise.all(
        keys
          // Only this site's caches. An allowlist that deleted everything it
          // did not recognise would take another application's caches with it
          // if this origin ever carried one, which is a mistake the portal's
          // worker made once and its comment still records.
          .filter((key) => key.startsWith('careers-gftv-docs-') && !keep.has(key))
          .map((key) => caches.delete(key))
      );
    })()
  );
  // No clients.claim, for the same reason there is no skipWaiting above.
});

/* -------------------------------------------------------------------------
 * Who this worker is currently caching for
 * ---------------------------------------------------------------------- */

async function currentTier() {
  try {
    const cache = await caches.open(META);
    const stored = await cache.match(TIER_KEY);
    if (!stored) return 'public';
    const tier = (await stored.text()).trim();
    return tier || 'public';
  } catch {
    return 'public';
  }
}

/**
 * Record the reader's tier, and drop every gated cache that is not theirs.
 *
 * **Called on every page load and not only on a change**, because the cheap
 * thing to get wrong here is assuming this worker saw the change. A reader
 * whose access was revoked between two visits never posts a "changed" event;
 * they simply arrive as somebody else, and the comparison is what notices.
 */
async function rememberTier(tier) {
  const wanted = gatedCacheFor(tier);
  const cache = await caches.open(META);
  await cache.put(TIER_KEY, new Response(tier));

  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(GATED_PREFIX) && key !== wanted)
      .map((key) => caches.delete(key))
  );
}

/** Everything gated, gone. Signing out, and any failure that looks like it. */
async function forgetGated() {
  const cache = await caches.open(META);
  await cache.delete(TIER_KEY);

  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(GATED_PREFIX)).map((key) => caches.delete(key))
  );
}

/* -------------------------------------------------------------------------
 * Talking to the page
 * ---------------------------------------------------------------------- */

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : data?.type;

  if (type === 'version') {
    event.source?.postMessage({ type: 'version', version: VERSION });
    return;
  }

  // The one way either of these is ever called, per section 14.
  if (type === 'skip-waiting') {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
    return;
  }

  // shell.js, once /api/nav has said who is reading.
  if (type === 'tier') {
    event.waitUntil(rememberTier(String(data?.tier ?? 'public')));
    return;
  }

  // shell.js, before it navigates away from a sign out.
  if (type === 'signed-out') {
    event.waitUntil(forgetGated());
  }
});

/* -------------------------------------------------------------------------
 * Fetching
 * ---------------------------------------------------------------------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only this origin, and only GET. A cross origin request is somebody else's
  // to answer, and a POST is never a document.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (NEVER.test(url.pathname)) return;

  if (GATED_API.test(url.pathname)) {
    event.respondWith(apiFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(pageFirst(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || isImage(url.pathname)) {
    event.respondWith(assetFirst(request));
    return;
  }

  // The public index, in whichever language. `/search-index.json` is English
  // and `/search-index.zh.json` is the same file translated, per part 9; both
  // are build output and both are precached, so this is the offline path for a
  // reader who searches in either.
  if (SEARCH_INDEX.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL));
  }
});

const isImage = (pathname) => /\.(png|ico|webp|svg|jpg|jpeg)$/.test(pathname);

/**
 * A page. Network first, then this address from the cache, then the shell.
 *
 * **The shell is the fallback and the offline page is not a separate file.**
 * This site has one document that can draw any address, so an uncached page
 * offline gets the chrome, the sidebar it last saw, and a panel saying the page
 * is not available. A dedicated /offline page would be a second layout to keep
 * in step for the one case where being consistent matters most.
 */
async function pageFirst(request) {
  const cache = await caches.open(SHELL);

  try {
    const response = await fetch(request);
    // Only a real answer is worth keeping. A 404 stored under an address is a
    // reader being told a page does not exist, from a cache, after somebody
    // wrote it.
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;

    const shell = await cache.match('/shell.html');
    if (shell) return shell;

    return offlineResponse();
  }
}

/** Build output. Cache first, and the cache is emptied by a VERSION bump. */
async function assetFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    return offlineResponse();
  }
}

/** Network first into a named cache, for things that are answers. */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    return hit ?? offlineResponse();
  }
}

/**
 * A guide, its sidebar, or the staff search index.
 *
 * Network first into the cache named for this reader's tier. **A 404 is not
 * cached and neither is anything else that is not a 200**: on this site a 404
 * is what a reader above whose tier a page sits is told, and caching one would
 * mean a reader who is granted access still cannot open the page.
 *
 * The cached answer carries no session. It is being replayed to the browser
 * that fetched it, in the tier it was fetched at, and the clearing above is
 * what makes that the same person.
 *
 * **A public page's translation comes through here too, since part 9**, because
 * a 华文 reader fetches every page from the content route and a signed out
 * reader's tier is `public` like any other. So the cache named for the public
 * tier holds public content, which is what it says on it. The language is part
 * of the address, so the English and the 华文 of one page are two entries and
 * neither is ever served as the other.
 */
async function apiFirst(request) {
  const tier = await currentTier();
  return networkFirst(request, gatedCacheFor(tier));
}

/**
 * What is served when there is nothing at all.
 *
 * A 503 and not a 200, because this is not the page that was asked for. The
 * body is plain and untranslated on purpose: the dictionaries are precached, so
 * a reader who reaches this has no shell either, and reaching for `t()` from a
 * worker would be a second copy of the i18n layer for one sentence.
 */
function offlineResponse() {
  return new Response('This page is not available offline.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
