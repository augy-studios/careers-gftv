// Careers@GFTV service worker, phase 1 version.
//
// This is deliberately a pass through. The real offline behaviour is section
// 14 of the specification and lands in phase 10: precached shell, cache first
// static assets, stale while revalidate public job data, network only for
// anything authenticated, IndexedDB for the applicant's own data, and a queue
// for the rating and the apply answer.
//
// Shipping a caching service worker now would be worse than shipping none.
// Pages change on every phase, and a cache first worker would pin an old build
// on returning visitors for as long as it survived. So this version registers,
// takes control, clears any cache left by an earlier worker, and then stays out
// of the way entirely.
//
// It is registered rather than left out so that the update path in phase 10 is
// an ordinary service worker update rather than a first install on browsers
// that already have the template's worker from this domain.
//
// BUMP VERSION ON EVERY CHANGE TO THIS SITE. Not once per phase, and not only
// when this file itself changes: any edit under main-site/ means a new build,
// and a worker that is not bumped keeps serving the previous one to everybody
// who has visited before. vercel.json serves this file with
// Cache-Control: no-cache so the browser will always fetch it, but the file
// has to actually differ for that to matter.
//
// From phase 10, when this gains a precache list, keep that list in step with
// the files that exist as well. A precache entry naming a deleted file makes
// cache.addAll reject and the whole install fail.

const VERSION = 'careers-gftv-phase2-v20';

self.addEventListener('install', () => {
  // Nothing to precache yet.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove everything, including caches written by the PWA template this
      // repo started from.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// No fetch handler. Every request goes to the network exactly as it would with
// no service worker installed. Phase 10 adds the strategies from section 14
// here.

self.addEventListener('message', (event) => {
  if (event.data === 'version') {
    event.source?.postMessage({ version: VERSION });
  }
});
