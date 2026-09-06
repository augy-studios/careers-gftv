---
title: 14. Offline behaviour
access: developer
order: 17
summary: The site must be a fully installable PWA that stays useful with no connection.
---

# 14. Offline behaviour

The site must be a fully installable PWA that stays useful with no connection. Be honest about the split: browsing, reading, and reviewing work offline, while anything that touches an account or Google Forms needs the network. Do not fake the parts that cannot work.

### Works offline

- The full app shell: home, `/search`, job detail, account pages, styles, fonts, icons, and the offline fallback page.
- Every posting already opened, readable in full from cache, whether or not anyone is signed in.
- The last successful `/search` result set, including its filters and tags, so the board is still browsable. Mark it with the time it was cached.
- Saved jobs, My applications, and the outstanding tasks list, from a local copy of the applicant's own data. Replying to a task queues like any other action.
- The rating stars and the Yes or No answer in the handoff modal, queued locally and sent when the connection returns.

### Needs the network, and says so plainly

- Signing in, registering, and 2FA. Show a clear offline state on those forms rather than letting a submit fail silently.
- Opening a Google Form, so the Apply button is disabled offline with the reason given.
- The admin dashboard. Cache its shell only, and show an offline notice instead of stale management data. Never let an admin act on a cached view of applications.
- Anything that would show another person's data.

### Caching strategy

- Precache the shell and static assets on install, keyed by a build version constant at the top of `sw.js`. **Bump it on every change to the site**, not once per phase and not only when `sw.js` itself changes, or returning visitors keep the previous build.
- Precache **both** `assets/i18n` dictionaries, not just the active one. They are small, and an applicant who switches language offline should not be met with an untranslated page.
- A cached posting is cached in both languages, since the API returns one language per request. Either cache both responses or cache the posting once with both languages present; do not let switching language offline empty the page.
- Static assets: cache first.
- Public job data, meaning listings, postings, departments, and tags: stale while revalidate. Serve the cached copy instantly, refresh in the background, and update the view if the data changed.
- Authenticated endpoints, sessions, and everything under `api/admin`: network only. Never put an authenticated response in the Cache API, because the cache is shared per origin and this is a portal with two account realms on a domain that already hosts other GFTV apps.
- Store the applicant's own data in IndexedDB instead, in a store keyed by their user id, and clear it completely on logout. On login, if the stored user id differs from the one signing in, wipe the database before writing anything.
- Cap the cached postings at a sensible number, around 100, and evict least recently viewed first.
- Serve `sw.js` with `Cache-Control: no-cache` in `vercel.json`, or a stale service worker will pin an old build indefinitely.

### Queued actions

- Queue the modal's rating and its Yes or No answer in IndexedDB when offline, with the analytics row id, the intended value, and a timestamp.
- Flush the queue with the Background Sync API where available, and on the next page load with a connection everywhere else, since Safari does not support Background Sync.
- Make every queued action idempotent so a replay cannot double count. The server already keys on the analytics row id, so a repeated answer overwrites rather than stacking.
- A queued answer still counts as pending until the server confirms it. Do not start the reapply cooldown from a local queue entry.
- Show queued items in the UI as awaiting sync rather than as done, and reconcile against the server response when it lands.

### Interface

- A persistent but unobtrusive offline banner when the connection drops, using `navigator.onLine` plus `online` and `offline` listeners. Remove it the moment connectivity returns.
- Any cached view carries a quiet "last updated" timestamp so nobody mistakes an old board for the current one.
- Controls that cannot work offline are disabled with a reason on the control itself, never a dead button that fails on click.
- An offline fallback page for an uncached route, offering the cached postings and saved jobs as somewhere to go.
- An update prompt when a new service worker is waiting, letting the applicant reload rather than swapping the page under them. Use `skipWaiting` and `clients.claim` only behind that prompt.

### Manifest and install

- `manifest.json` with the Careers@GFTV name and short name, `standalone` display, the GFTV theme and background colours from `gftv-theme.md`, maskable icons at 192 and 512, and `start_url` of `/`.
- Add `/search` as a shortcut, and `/account/tasks` as a second one.
- Test installability and the offline paths in Chrome and on Android, and verify the offline fallback works on iOS Safari, where service worker support is real but stricter.
