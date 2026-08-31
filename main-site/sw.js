// Careers@GFTV service worker. Specification section 14.
//
// BUMP VERSION ON EVERY CHANGE TO THIS SITE. Not once per phase, and not only
// when this file itself changes: any edit under main-site/ means a new build,
// and a worker that is not bumped keeps serving the previous one to everybody
// who has visited before. vercel.json serves this file with
// Cache-Control: no-cache so the browser will always fetch it, but the file
// has to actually differ for that to matter.
//
// ---------------------------------------------------------------------------
// What this file does, in the order the requests arrive
// ---------------------------------------------------------------------------
//
//   navigation to a precached route   the cached shell, immediately
//   navigation to /status             network first, cached copy when offline
//   navigation to /jobs/{id}          stale while revalidate, capped at 100
//   navigation to anything else       network, and /offline when that fails
//   /assets/**, icons, the manifest   cache first
//   /api/public/**                    stale while revalidate
//   /api/public/feature-status        network only, and read on the way past
//   everything else under /api/       network only, never cached
//   any cross origin request          not intercepted at all
//   anything that is not a GET        not intercepted at all
//
// ---------------------------------------------------------------------------
// The four rules that are easy to break here
// ---------------------------------------------------------------------------
//
// **1. A response carrying `private` or `no-store` never enters the Cache API.**
// This is not a tidiness rule. api/job-page.js answers `public, s-maxage=60`
// for an ordinary posting and `private, no-store` with `Vary: Cookie` when the
// posting is archived or being previewed, because an archived posting renders
// only for an applicant with history. Caching that one would serve one
// applicant's posting to the next person to pick up the phone. isCacheable()
// below is the single place that decision is made, and every write goes
// through it.
//
// **2. Nothing authenticated is cached, and neither is anything cross origin.**
// The Cache API is per origin and this origin is shared with the other GFTV
// apps. Cross origin requests are not intercepted at all, which is also how
// Supabase Storage avatars stay out: an admin dashboard renders other people's
// faces, and a cache-on-use rule could not tell those from the reader's own.
// The applicant's own data lives in IndexedDB instead, keyed by their user id.
//
// **3. skipWaiting and clients.claim happen only when a person asks.** Section
// 14 is explicit: a new worker waits, the page offers a reload, and the swap
// happens after that. Neither call appears in install or activate. The page
// asks for it by posting `skip-waiting`, and that is the only route to either.
//
// **4. A missing precache entry costs one file, not the feature.** The list
// below is written by hand, and `node check-precache.js` at the repo root
// fails on an entry that is not on disk. Belt and braces, because the entries
// are added one at a time rather than through cache.addAll: with addAll a
// single bad path rejects the whole promise, the install fails, and every
// offline behaviour on the site silently never turns on.
//
// ---------------------------------------------------------------------------
// The caches, and which of them survive a version bump
// ---------------------------------------------------------------------------
//
//   shell-{VERSION}   the precached app shell and static assets. Versioned,
//                     and dropped on activate. This is the update mechanism:
//                     a new VERSION is a new cache, filled from the network.
//   public            public API answers, stale while revalidate. Not
//                     versioned: it is data, not build output, and throwing it
//                     away on every deploy would empty the board for a reader
//                     who is offline at the wrong moment.
//   postings          posting pages already opened, capped at 100. Not
//                     versioned, same reason.
//   state             the maintenance switches, as last seen. Not versioned,
//                     because a kill switch that forgets itself on the deploy
//                     that broke something is not a kill switch.

const VERSION = 'careers-gftv-phase13-v114';

const SHELL = `careers-gftv-shell-${VERSION}`;
const PUBLIC_DATA = 'careers-gftv-public';
const POSTINGS = 'careers-gftv-postings';
const STATE = 'careers-gftv-state';

// Anything not in here is deleted on activate. An allowlist rather than "delete
// everything that is not the current shell", because the three unversioned
// caches above have to survive an update, and because the pass through worker
// this replaces deleted every cache on the origin including other apps'.
const KEEP = new Set([SHELL, PUBLIC_DATA, POSTINGS, STATE]);

// Section 14: "cap the cached postings at a sensible number, around 100, and
// evict least recently viewed first".
const MAX_POSTINGS = 100;

// A posting's canonical address is its uuid, and a slug is a 301 alias, so this
// matches on the shape of the route rather than on the shape of the id.
const POSTING_PATH = /^\/jobs\/[^/]+$/;

// Where the last seen maintenance switches are kept inside the state cache. Not
// a real route: the Cache API is a key value store and this is a key.
const SWITCH_KEY = '/__sw/feature-switches';

// A lookup table of what each cached posting is called, in every language it is
// ready in, so the offline page can list them by name instead of by uuid.
//
// **Membership and order stay with the postings cache, not with this.** The
// Cache API answers keys() in insertion order, which touch() maintains as least
// recently viewed, and that is the one source of truth for what is held and
// what gets evicted. This is only the display data hanging off a path, pruned
// to match after every trim.
const INDEX_KEY = '/__sw/posting-index';

// Precached pages that are answered from the network first and from the cache
// only when that fails. Phase 12 part 7, and one entry so far.
//
// The test for this list is not "is it important". Every other precached page
// is a shell that asks for its own data after it loads, so an old copy of the
// markup is not an old answer; /status is rendered on the server and *is* the
// answer, so a cached copy is a claim about a moment that has passed.
const NETWORK_FIRST_PAGES = new Set(['/status']);

/* -------------------------------------------------------------------------
 * The precache list
 *
 * **Written by hand and checked by node check-precache.js.** Two things to
 * know before editing it.
 *
 * These are the addresses the browser asks for, not the files on disk.
 * cleanUrls is on, so it is '/search' and never '/search/index.html', and
 * phase 3's rule still holds: a route answering 200 is not evidence its
 * rewrite works.
 *
 * 404.html and placeholder.html are deliberately absent. Neither is ever
 * navigated to by address: Vercel serves the first for an unknown path and
 * rewrites unbuilt routes to the second, and offline this worker cannot tell
 * an unknown path from an unbuilt route from a page nobody has opened yet.
 * /offline is the honest answer to all three.
 *
 * HLC-main.png and the two maskable icons are absent for a different reason:
 * the first is the og:image, which only a crawler fetches, and the launcher
 * reads the maskable pair at install time rather than from here.
 * ---------------------------------------------------------------------- */

const PRECACHE = [
  // The public surface.
  '/',
  '/about',
  '/faq',
  '/forgot-password',
  '/login',
  '/offline',
  '/register',
  '/search',
  // Served by a function since phase 12 part 7, and precached all the same: the
  // worker fetches an address at install and keeps what answers, so this works
  // offline exactly as the file it replaced did. **It is network first**, see
  // NETWORK_FIRST_PAGES below, because what this page renders is now an answer
  // rather than a shell.
  '/status',

  // The account area. Precached for everybody, signed in or not: these are
  // static shells with no data in them, and the alternative is caching them the
  // first time a session appears, which is one more piece of state to be wrong
  // about.
  '/account',
  '/account/applications',
  '/account/saved',
  '/account/security',
  '/account/settings',
  '/account/tasks',
  '/account/translations',

  // The dashboard, shells only. Section 14: "cache its shell only, and show an
  // offline notice instead of stale management data. Never let an admin act on
  // a cached view of applications." Nothing under api/admin is ever cached.
  '/admin',
  '/admin/admins',
  '/admin/analytics',
  '/admin/applicants',
  '/admin/applications',
  '/admin/departments',
  '/admin/invites',
  '/admin/jobs',
  '/admin/jobs/edit',
  '/admin/login',
  '/admin/maintenance',
  '/admin/security',
  '/admin/settings',
  '/admin/tags',
  '/admin/translations',

  // Styles and the font. Proxima Nova is self hosted rather than pulled from a
  // CDN, which is what makes it precacheable at all.
  '/assets/css/theme.css',
  '/assets/css/app.css',
  '/assets/fonts/ProximaNova-Regular.woff2',

  // **Both dictionaries, not the active one**, per section 14. They are small,
  // and switching language offline must not produce an untranslated page.
  '/assets/i18n/en.json',
  '/assets/i18n/zh.json',

  // The phase list. Every page reads it for the notice bar and the disabled
  // control pattern, and it fails open to an empty list, so without this an
  // offline page would quietly lose both.
  '/assets/build-status.json',

  // The icons the interface itself uses, and the manifest.
  '/manifest.json',
  '/favicon.ico',
  '/HLC-180.png',
  '/HLC-192.png',

  // Every module. A precached page whose module is missing is a page that
  // renders its markup and then does nothing, which is worse than not caching
  // the page at all.
  '/assets/js/account-page.js',
  '/assets/js/account-row.js',
  '/assets/js/account-shell.js',
  '/assets/js/admin-admins-page.js',
  '/assets/js/admin-analytics-page.js',
  '/assets/js/admin-applicants-page.js',
  '/assets/js/admin-applications-page.js',
  '/assets/js/admin-departments-page.js',
  '/assets/js/admin-invites-page.js',
  '/assets/js/admin-job-editor.js',
  '/assets/js/admin-jobs-page.js',
  '/assets/js/admin-login-page.js',
  '/assets/js/admin-maintenance-page.js',
  '/assets/js/admin-page.js',
  '/assets/js/admin-questions.js',
  '/assets/js/admin-settings-page.js',
  '/assets/js/admin-shell.js',
  '/assets/js/admin-tags-page.js',
  '/assets/js/admin-translations-page.js',
  '/assets/js/annotate.js',
  '/assets/js/api.js',
  '/assets/js/applications-page.js',
  '/assets/js/apply-badges.js',
  '/assets/js/apply-dialog.js',
  '/assets/js/apply-prompt.js',
  '/assets/js/apply.js',
  '/assets/js/avatar.js',
  '/assets/js/build-status.js',
  '/assets/js/danger-confirm.js',
  '/assets/js/dialog.js',
  '/assets/js/forgot-password-page.js',
  '/assets/js/format.js',
  '/assets/js/forms.js',
  '/assets/js/home-page.js',
  '/assets/js/i18n.js',
  '/assets/js/icons.js',
  '/assets/js/idb.js',
  '/assets/js/job-card.js',
  '/assets/js/job-page.js',
  '/assets/js/login-page.js',
  '/assets/js/markdown.js',
  '/assets/js/offline-page.js',
  '/assets/js/offline.js',
  '/assets/js/passkeys.js',
  '/assets/js/queue.js',
  '/assets/js/recovery-codes.js',
  '/assets/js/register-page.js',
  '/assets/js/run-action.js',
  '/assets/js/save-button.js',
  '/assets/js/saved-page.js',
  '/assets/js/search-page.js',
  '/assets/js/security-page.js',
  '/assets/js/settings-page.js',
  '/assets/js/shell.js',
  '/assets/js/signin-prompt.js',
  '/assets/js/site-settings.js',
  '/assets/js/staff-security-page.js',
  '/assets/js/status-page.js',
  '/assets/js/tabs.js',
  '/assets/js/tasks-page.js',
  '/assets/js/telegram-link.js',
  '/assets/js/theme.js',
  '/assets/js/top-bars.js',
  '/assets/js/translation-report.js',
  '/assets/js/translations-page.js',
];

/* -------------------------------------------------------------------------
 * Install and activate
 * ---------------------------------------------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // A hundred files fetched for a worker an admin has switched off, and
      // dropped again the moment it is switched back on. The switch is read
      // from the state cache, which is not versioned for exactly this reason.
      if ((await switches()).offline) return;
      await fillShell();
    })()
  );
  // No skipWaiting. The new worker waits until somebody accepts the update
  // prompt, per section 14. Everything below is written to be correct while a
  // previous version is still the one in control.
});

/**
 * Fetch every precache entry into the shell cache, one at a time.
 *
 * `cache.addAll` would be shorter and is the wrong shape: it rejects as a whole
 * on the first bad entry, the install fails, and every offline behaviour is
 * silently off. This reports what it could not get and keeps the rest.
 *
 * `cache: 'reload'` on each request matters. Without it an install can be
 * populated out of the browser's own HTTP cache, so a worker bumped to a new
 * VERSION would fill its brand new cache with the previous build's files,
 * which is the exact failure the bump exists to prevent.
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
      `[careers-gftv] ${failed.length} of ${PRECACHE.length} precache entries ` +
        `could not be stored. Offline is degraded, not off:\n  ${failed.join('\n  ')}`
    );
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !KEEP.has(key)).map((key) => caches.delete(key)));
    })()
  );
  // No clients.claim, for the same reason there is no skipWaiting above.
});

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

  // The one way either of these is ever called. offline.js posts it when the
  // reader accepts the update prompt, and reloads on controllerchange.
  if (type === 'skip-waiting') {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
    return;
  }

  // Answered over a MessageChannel port when one is supplied, so a caller gets
  // its own reply rather than every page on the origin hearing it. offline.js
  // wraps both of these.
  const port = event.ports?.[0];

  if (type === 'cached-postings') {
    event.waitUntil(
      cachedPostings().then((postings) => port?.postMessage({ type, postings }))
    );
    return;
  }

  if (type === 'cached-at') {
    event.waitUntil(
      cachedAt(String(data?.path ?? '')).then((at) => port?.postMessage({ type, at }))
    );
  }
});

/* -------------------------------------------------------------------------
 * The maintenance switches, 8.12
 *
 * `offline` and `install` are feature keys on phase 10, so an admin can flip
 * either from /admin/maintenance. A switch that a worker already installed on
 * somebody's phone does not obey would be a flag nothing enforces, which is the
 * failure this build keeps hitting — and a bad service worker is the one bug
 * that outlives its own fix, because the thing serving the broken copy is the
 * thing you would have to reach to replace it.
 *
 * **It costs no extra request.** Every page already fetches
 * /api/public/feature-status on load, so this reads the answer on the way past
 * and keeps it. Offline there is no answer and the last one stands, which is
 * the same direction that endpoint fails in: everything on.
 *
 * **Both switches go both ways, and that took two things.** This endpoint is
 * handled above the kill switch in handle(), or the worker would stop listening
 * the moment it was switched off; and rememberSwitches refills the shell when
 * `offline` comes back on, because install is the only other thing that ever
 * fills it. A switch that cannot be undone without a deploy is not a switch.
 * ---------------------------------------------------------------------- */

/** The switches as last seen. `{ offline: true }` means offline is switched off. */
async function switches() {
  try {
    const cache = await caches.open(STATE);
    const stored = await cache.match(SWITCH_KEY);
    if (!stored) return {};
    return (await stored.json()) ?? {};
  } catch {
    // Fail open, in the same direction as the endpoint itself.
    return {};
  }
}

async function rememberSwitches(off) {
  const flags = {};
  for (const key of ['offline', 'install']) {
    if (off && Object.prototype.hasOwnProperty.call(off, key)) flags[key] = true;
  }

  const previous = await switches();

  const cache = await caches.open(STATE);
  await cache.put(
    SWITCH_KEY,
    new Response(JSON.stringify(flags), {
      headers: { 'Content-Type': 'application/json' },
    })
  );

  // **Both edges of the `offline` switch are handled here and nowhere else.**
  //
  // Dropping the caches used to happen in handle(), on every request that
  // arrived while the switch was off, which is a race rather than a policy:
  // switching it back on starts a refill, the requests already in flight from
  // the same page load are still dropping, and whichever lands last wins. The
  // switch is an edge, so it is acted on once, on the edge.
  //
  // Nothing can refill a cache while it is off, either — handle() returns the
  // network before it reaches anything that writes — so one drop is enough.
  if (!previous.offline && flags.offline) await dropCaches();

  // Switched back on, so refill what switching it off threw away. The shell
  // cache is filled by install and by nothing else, so without this a device
  // that saw the switch go off keeps no cache until some later deploy happens
  // to install a new worker: reversible on paper and not on the phone.
  if (previous.offline && !flags.offline) await fillShell();
}

/**
 * Network only, and read on the way past.
 *
 * The endpoint is no-store and stays that way: it is the one an admin reloads
 * during an outage to check the switch took, and a cached answer would read
 * exactly like the switch not working.
 */
async function featureStatus(event, request) {
  const response = await fetch(request);

  event.waitUntil(
    (async () => {
      try {
        const payload = await response.clone().json();
        if (payload?.ok === true) await rememberSwitches(payload.data?.off ?? {});
      } catch {
        // A body that could not be read is not a claim about anything.
      }
    })()
  );

  return response;
}

/**
 * Everything this worker keeps, dropped.
 *
 * Called when `offline` is found to be switched off. The shell cache goes with
 * it, so the next load comes from the network and the reader is on the site as
 * it is right now rather than the site as it was when the worker broke.
 */
async function dropCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key !== STATE).map((key) => caches.delete(key))
  );
}

/* -------------------------------------------------------------------------
 * Fetch
 * ---------------------------------------------------------------------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Not intercepted at all, and both are deliberate. A write must never be
  // replayed or answered from a cache, and a cross origin request covers
  // Supabase Storage, which is where every avatar in the build lives.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A range request is a partial read of something already being streamed.
  // Answering one from a whole cached body is how audio and video break.
  if (request.headers.has('range')) return;

  event.respondWith(handle(event, request, url));
});

async function handle(event, request, url) {
  const off = await switches();

  // **Read above the kill switch below, deliberately.** With `offline` switched
  // off every other request short-circuits to the network, and if this one did
  // too the worker would never see the switch being turned back on: it would be
  // a one way door on every device that had visited while it was off, surviving
  // deploys, because nothing else on the origin ever tells the worker anything.
  // Passing it through here costs nothing — this endpoint is network only in
  // both states and caches nothing either way.
  if (url.pathname === '/api/public/feature-status') return featureStatus(event, request);

  if (off.offline) {
    // The kill switch. Behave exactly as if this file were not registered:
    // straight to the network, nothing read from a cache and nothing written to
    // one. The caches themselves were dropped on the edge, in rememberSwitches,
    // rather than here — see the note there for why that is not the same thing.
    return fetch(request);
  }

  if (url.pathname === '/manifest.json' && off.install) {
    // Installation switched off. A 404 on the manifest is what actually stops
    // a browser offering the install, which removing a link tag from one page
    // would not: the tag is in thirty three files and in the server rendered
    // posting page as well.
    return new Response('', { status: 404, statusText: 'Installation is switched off' });
  }

  if (url.pathname.startsWith('/api/')) {
    // Public job data: listings, postings, departments, and tags. Everything
    // else under /api/ is a session, an account, or the dashboard.
    if (url.pathname.startsWith('/api/public/')) {
      return staleWhileRevalidate(event, request, PUBLIC_DATA);
    }
    return fetch(request);
  }

  if (request.mode === 'navigate') return navigation(event, request, url);

  return staticAsset(request, url);
}

/**
 * A navigation.
 *
 * The shell is served from the cache without asking the network, which is what
 * "precache the shell, keyed by a build version constant" means: the update
 * path is the VERSION bump, not a revalidation on every page view.
 */
async function navigation(event, request, url) {
  if (POSTING_PATH.test(url.pathname)) return posting(event, request, url);

  const shell = await caches.open(SHELL);

  // **The one precached page that must not be answered from the cache while
  // there is a network.** Every other entry in PRECACHE is a shell that fetches
  // its own data after it loads, so a copy from install time is as good as a
  // fresh one. /status stopped being that in phase 12 part 7: it is rendered on
  // the server and what it renders is an answer about right now, so a cached
  // copy served to somebody online would be a status page frozen at whenever
  // they last updated the worker — on the one page people open when things are
  // going wrong.
  //
  // Network first, cache second, and the cached copy is refreshed on every
  // successful load, so what an offline reader gets is the last state anybody
  // actually saw rather than the state at install. The page stamps the time it
  // was measured at the top, which is what makes a stale copy honest rather
  // than misleading.
  if (NETWORK_FIRST_PAGES.has(url.pathname)) {
    try {
      const response = await fetch(request);
      if (isCacheable(response)) await store(shell, url.pathname, response.clone());
      return response;
    } catch {
      const held = await shell.match(url.pathname);
      if (held) return held;
      const fallback = await shell.match('/offline');
      return fallback ?? Response.error();
    }
  }

  // Matched on the path and not on the request, so /search?q=editor is answered
  // by the cached /search. The query is read by search-page.js, not by the
  // server, so one cached shell serves every query.
  const cached = await shell.match(url.pathname);
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch {
    // Section 14's offline fallback. The address bar keeps the route that was
    // asked for, which is what lets that page's retry control be a reload.
    const fallback = await shell.match('/offline');
    return fallback ?? Response.error();
  }
}

/**
 * A posting page, stale while revalidate, capped at MAX_POSTINGS.
 *
 * Section 14 wants a cached posting readable in both languages. It already is:
 * api/job-page.js inlines the content for en and zh both, which is why
 * switching language on a posting redraws with no fetch. So one cached response
 * is the whole of it, and there is nothing to merge.
 */
async function posting(event, request, url) {
  const cache = await caches.open(POSTINGS);
  const cached = await cache.match(url.pathname);

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) {
        await store(cache, url.pathname, response.clone());
        await rememberPosting(url.pathname, response.clone());
        await trimPostings(cache);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Refresh in the background, and move this one to the end of the cache's
    // insertion order so the trim above evicts by least recently viewed rather
    // than by least recently fetched.
    event.waitUntil(
      network.then(() => touch(cache, url.pathname, cached.clone()))
    );
    return cached;
  }

  const fresh = await network;
  if (fresh) return fresh;

  const shell = await caches.open(SHELL);
  return (await shell.match('/offline')) ?? Response.error();
}

/** Static assets: cache first, and cache anything new on the way past. */
async function staticAsset(request, url) {
  const shell = await caches.open(SHELL);
  const cached = await shell.match(url.pathname);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) await shell.put(url.pathname, response.clone());
  return response;
}

/**
 * Serve the cached copy instantly, refresh behind it, per section 14.
 *
 * The refreshed copy is for the next read rather than this one. Section 14 also
 * asks the view to update if the data changed; that is the page's half and
 * lands with parts 6 and 7, which read the cached-at time this leaves behind.
 */
async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  return fresh ?? Response.error();
}

/* -------------------------------------------------------------------------
 * Background Sync, section 14
 *
 * "Flush the queue with the Background Sync API where available, and on the
 * next page load with a connection everywhere else, since Safari does not
 * support Background Sync."
 *
 * **This is the second copy of a small amount of logic, deliberately.**
 * assets/js/queue.js owns the queue: what goes in it, what the interface says
 * about it, and what a refusal means. A service worker is a classic script and
 * cannot import that module, and the obvious alternative — the worker asking an
 * open page to do the flush — would defeat the whole point, which is flushing
 * when there is no page open at all.
 *
 * So what lives here is the minimum: read the store, send, decide keep or drop.
 * Nothing about the interface, and **the verdict rule below has to stay in step
 * with `verdictFor` in queue.js**. Same arrangement as the pre-paint theme
 * script, which duplicates two constants from theme.js for the same kind of
 * reason.
 * ---------------------------------------------------------------------- */

const SYNC_TAG = 'careers-gftv-queue';

const QUEUE_PATHS = {
  rating: '/api/ratings/upsert',
  answer: '/api/applications/respond',
};

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushQueue());
});

/** Keep in step with verdictFor in assets/js/queue.js. */
function queueVerdict(payload, networkFailed) {
  if (networkFailed) return 'retry';
  if (payload?.ok === true) return 'done';

  const code = payload?.error?.code;
  if (code === 'not_yet_available' || code === 'rate_limited' || code === 'server_error') {
    return 'retry';
  }
  // queue.js calls this one 'signin', because it has an interface to say so in.
  // Out here the two are the same instruction: keep the row.
  if (code === 'unauthorised') return 'retry';
  return 'drop';
}

/** The queue store, opened without any of idb.js's other machinery. */
function openQueue() {
  return new Promise((resolve) => {
    let request;
    try {
      // The same name and version assets/js/idb.js uses. Opened without an
      // upgrade handler on purpose: this worker must never create the database
      // or migrate it, because the page owns that and a worker racing it would
      // be two writers of one schema.
      request = indexedDB.open('careers-gftv', 1);
    } catch {
      return resolve(null);
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function queueRows(db) {
  return new Promise((resolve) => {
    try {
      const request = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function dropRow(db, id) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('queue', 'readwrite');
      transaction.objectStore('queue').delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    } catch {
      resolve();
    }
  });
}

async function flushQueue() {
  const db = await openQueue();
  if (!db) return;

  const rows = (await queueRows(db)).sort((a, b) => a.createdAt - b.createdAt);
  let changed = false;

  for (const row of rows) {
    const path = QUEUE_PATHS[row.kind];
    if (!path) {
      await dropRow(db, row.id);
      changed = true;
      continue;
    }

    let payload = null;
    let networkFailed = false;

    try {
      // credentials same-origin by default in a worker, which is what carries
      // the session cookie. Every one of these is idempotent, so a send this
      // worker and an open page both attempt cannot double count.
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(row.body),
      });
      payload = await response.json().catch(() => null);
    } catch {
      networkFailed = true;
    }

    const verdict = queueVerdict(payload, networkFailed);

    if (verdict === 'done' || verdict === 'drop') {
      await dropRow(db, row.id);
      changed = true;
      continue;
    }

    // Nothing reached the site. The rest will fail the same way, and the sync
    // event will fire again when the browser thinks there is a connection.
    if (networkFailed) break;
  }

  if (!changed) return;

  // Any page that is open has a stale view of the queue. It refreshes rather
  // than being told what happened, because this handler deliberately knows
  // nothing about what the interface is showing.
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'queue-flushed' });
}

/* -------------------------------------------------------------------------
 * Writing to a cache
 * ---------------------------------------------------------------------- */

/**
 * Whether a response may be stored at all. **Every write goes through here.**
 *
 * The `private` and `no-store` test is the one that matters. api/job-page.js
 * and api/public/job.js both answer `private, no-store` with `Vary: Cookie` for
 * an archived posting, which renders only for an applicant with history, and
 * for a staff preview. Those two look exactly like public routes from out here
 * and are not, and the header is the only thing that says so.
 */
function isCacheable(response) {
  if (!response || response.status !== 200) return false;

  // basic is same origin. An opaque or opaqueredirect response has a status of
  // 0 and is already excluded above; this also refuses a redirect that was
  // followed, whose body belongs to a different address than the one asked for.
  if (response.type !== 'basic' && response.type !== 'default') return false;
  if (response.redirected) return false;

  const control = (response.headers.get('Cache-Control') ?? '').toLowerCase();
  if (control.includes('no-store') || control.includes('private')) return false;

  const vary = (response.headers.get('Vary') ?? '').toLowerCase();
  if (vary === '*' || vary.includes('cookie')) return false;

  return true;
}

/** Put, replacing whatever was there. */
async function store(cache, key, response) {
  await cache.put(key, response);
}

/**
 * Move an entry to the end of the cache's insertion order.
 *
 * `cache.keys()` answers in insertion order and there is nothing else in the
 * Cache API that records when an entry was last read, so delete-then-put is the
 * only way to keep a least recently *viewed* list rather than a least recently
 * *fetched* one. The gap between the two calls is real: a worker killed inside
 * it loses one cached posting, which is a page that has to be fetched again.
 */
async function touch(cache, key, response) {
  await cache.delete(key);
  await cache.put(key, response);
}

/** Section 14's cap. Oldest first, which after touch() means least recently viewed. */
async function trimPostings(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_POSTINGS;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  await pruneIndex(cache);
}

/* -------------------------------------------------------------------------
 * What each cached posting is called
 *
 * Section 14's offline fallback page offers "the cached postings and saved jobs
 * as somewhere to go", and a list of uuids is not somewhere to go. The titles
 * come out of the posting document itself, which already carries every language
 * it is ready in — that is what makes switching language on a posting a redraw
 * rather than a fetch, and it is what makes this list bilingual for free.
 * ---------------------------------------------------------------------- */

async function readIndex() {
  try {
    const cache = await caches.open(STATE);
    const stored = await cache.match(INDEX_KEY);
    if (!stored) return {};
    return (await stored.json()) ?? {};
  } catch {
    return {};
  }
}

async function writeIndex(index) {
  const cache = await caches.open(STATE);
  await cache.put(
    INDEX_KEY,
    new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } })
  );
}

/**
 * Note what a posting is called, in every language it is ready in.
 *
 * Read out of the inlined `#jobData` payload rather than out of the `<title>`
 * tag, which carries the English title only. The payload is escaped so that
 * `<` cannot appear inside it — page-shell.js writes `<` — which is why a
 * non greedy match up to the closing tag is safe here and would not be against
 * arbitrary HTML.
 *
 * A document this cannot read leaves the index alone rather than writing an
 * entry with no name. The posting is still cached and still opens; it is the
 * list on the fallback page that would be the poorer, and an entry reading
 * "undefined" would be worse than one that is absent.
 */
async function rememberPosting(path, response) {
  try {
    const html = await response.text();
    const match = html.match(
      /<script type="application\/json" id="jobData">([\s\S]*?)<\/script>/
    );
    if (!match) return;

    const payload = JSON.parse(match[1]);
    const titles = {};
    for (const [locale, content] of Object.entries(payload?.content ?? {})) {
      if (content?.title) titles[locale] = String(content.title);
    }
    if (Object.keys(titles).length === 0) return;

    const index = await readIndex();
    index[path] = {
      titles,
      isOpen: payload?.job?.is_open !== false,
      cachedAt: Date.now(),
    };
    await writeIndex(index);
  } catch {
    // A payload that could not be read is not a reason to fail the request the
    // reader is actually waiting on.
  }
}

/** Drop index entries for postings the cache no longer holds. */
async function pruneIndex(cache) {
  const held = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
  const index = await readIndex();

  let changed = false;
  for (const path of Object.keys(index)) {
    if (!held.has(path)) {
      delete index[path];
      changed = true;
    }
  }
  if (changed) await writeIndex(index);
}

/**
 * The cached postings, most recently viewed first.
 *
 * Order comes from the cache and names come from the index, which is the split
 * described where INDEX_KEY is declared. A posting held in the cache with no
 * index entry is skipped rather than listed unnamed.
 */
async function cachedPostings() {
  const cache = await caches.open(POSTINGS);
  const index = await readIndex();

  const keys = await cache.keys();
  const out = [];
  // keys() is oldest first, and this list wants the opposite.
  for (let at = keys.length - 1; at >= 0; at -= 1) {
    const path = new URL(keys[at].url).pathname;
    const entry = index[path];
    if (entry) out.push({ path, ...entry });
  }
  return out;
}

/**
 * When a cached copy of one address was stored.
 *
 * Section 14: "any cached view carries a quiet last updated timestamp so nobody
 * mistakes an old board for the current one." The page asks for it rather than
 * guessing, and gets null for anything not held — which is the honest answer
 * and is not the same as "just now".
 */
async function cachedAt(path) {
  const index = await readIndex();
  if (index[path]?.cachedAt) return index[path].cachedAt;

  for (const name of [POSTINGS, PUBLIC_DATA]) {
    const cache = await caches.open(name);
    const hit = await cache.match(path);
    if (!hit) continue;
    const date = hit.headers.get('date');
    if (date) return Date.parse(date);
  }
  return null;
}
