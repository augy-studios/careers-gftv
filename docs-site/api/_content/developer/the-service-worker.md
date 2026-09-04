---
title: The service worker
access: developer
order: 13
summary: Two workers, the caching strategies, the IndexedDB stores, the action queue, and the rule about VERSION.
---

# The service worker

**Two sites, two workers, and one rule that applies to both.**

> [!DANGER]
> **Bump `VERSION` at the top of `sw.js` on every change to that site.** Not
> once per phase, and not only when the worker itself changes. Any edit under
> `main-site/` is a new build. A worker that has not been bumped keeps serving
> the previous one to everybody who has visited before. A shipped change is then
> invisible to exactly the people who come back most.

`vercel.json` serves `sw.js` with `Cache-Control: no-cache` on both sites, so
the browser always refetches it. The file still has to differ for that to do
anything.

## The portal's worker

`main-site/sw.js`. It was a deliberate pass through until phase 10, and it now
answers every request from one of these paths.

| Request | What happens |
|---|---|
| A navigation to a precached route | The cached shell, with no network. |
| A navigation to `/status` | Network first, and the cached copy only when that fails. |
| A navigation to `/jobs/{id}` | Stale while revalidate, capped at 100 postings. |
| Any other navigation | Network, and `/offline` when that fails. |
| `/assets/**`, the icons, the manifest | Cache first. |
| `/api/public/**` | Stale while revalidate. |
| `/api/public/feature-status` | Network only, and read on the way past. |
| Anything else under `/api/` | Network only, never cached. |
| Any cross origin request | Not intercepted at all. |
| Anything that is not a `GET` | Not intercepted at all. |

### Four rules that are easy to break

**A response carrying `private` or `no-store` never enters the Cache API.** Two
routes answer that way for an archived posting and for a staff preview, and both
look exactly like public routes from inside a worker. `isCacheable()` is the
single place that decision is made.

**Nothing cross origin is intercepted**, which is also how Storage avatars stay
out of the cache. The dashboard renders other people's faces.

**`skipWaiting` and `clients.claim` are called only when a person asks.**
Neither appears in `install` or `activate`. The page posts `skip-waiting` when a
reader accepts the update prompt, and that is the only route to either.

**The shell cache is versioned and the data caches are not.** A `VERSION` bump
is a new cache filled from the network and the old one dropped. The postings and
public answer caches survive it. Emptying them on every deploy would clear the
board for a reader who is offline at the wrong moment.

### The precache list

**It is the most dangerous object in the site.** Run `node check-precache.js`
before shipping, the way you run `check-i18n.js`. It resolves every entry the
way `cleanUrls` does, and exits non-zero on one that is not on disk.

The list is added one entry at a time and never through `cache.addAll`. That
method rejects as a whole on the first bad path: the install fails, and every
offline behaviour is silently off. Between the two, a wrong entry costs one file
and says so.

### Both kill switches

`offline` and `install` are feature keys on phase 10, so an admin can flip either
from the maintenance page. The worker reads the answer out of the feature status
response every page already fetches, and keeps the last one it saw.

**Both go both ways, and two things are load bearing for that.** A switch that
cannot be undone is not a switch. The reason this one exists is a worker that
has gone wrong on somebody else's phone.

- **The feature status request is handled above the kill switch.** If it
  short-circuited to the network like everything else, the worker would stop
  listening the moment it was switched off. No admin could switch it back on.
- **The caches are dropped and refilled on the edge**, and not per request.
  Dropping on every request raced the refill that switching it back on starts.

## This site's worker

`docs-site/sw.js`, since phase 14 part 4. **The portal's worker was not a
template for it.** That file is an action queue, a postings cache and the
maintenance switches, none of which exist here. This one has a tier, which the
portal has no equivalent of.

**You do not maintain the precache list.** `scripts/build.js` writes it into
`dist/sw.js` from the pages it has just built, so adding a guide is nothing to
remember. `node check-precache.js` checks both halves and skips this one with a
sentence when `dist/` is not there.

| What | Strategy |
|---|---|
| Guides, the search index, every API answer | Network first. |
| `/assets/*`, the fonts, the images | Cache first. |
| `/api/auth/*` | Never cached, in either direction. |

**Network first for anything a reader reads** is the decision this site turns
on. A procedure served from a cache after the step changed is the failure worth
designing against.

**The gated guides are cached, per reader, and that needs care.** The cache is
named for the tier it was filled at. The shell posts the tier on every load, and
the worker drops any gated cache that is not the current one. Signing out posts
`signed-out`, and the worker deletes all of them.

> [!WARNING]
> Changing either of those two paths changes what a shared machine keeps after
> somebody signs out. That is why it was a decision and not a default.

**There is no `/offline` page here.** The shell is the fallback, so an uncached
address draws the chrome and says the page is not available. A reader cannot
tell which pipeline a missing page came from. That is the rule holding in the
condition where it would be easiest to break.

## The client half

`main-site/assets/js/connection-bar.js` registers the worker, owns the update
prompt, and draws the bar. It is shared: `gen-docs-lib.js` copies it here, and
the three places the two sites differ are arguments and not edits.

**The bar has three states and one bar.** Being offline outranks being unable to
reach the site, which outranks an update, because two stacked bars stop being
unobtrusive.

| State | When | Dismissible |
|---|---|---|
| `offline` | `navigator.onLine` is false | No. It goes when the connection returns. |
| `unreachable` | Online, and two API calls in a row failed | No, the same. |
| `update` | A new worker is waiting | Yes, for that page view. |

**The two connection wordings are the point and not a nicety.** `onLine` false
is a reliable "there is definitely no network". `onLine` true means only that an
interface is up, so an outage on perfect wifi reads as online. A banner saying
"you are offline" would send that reader to reset a working router.

## The applicant's own data

**Nothing authenticated goes in the Cache API.** The applicant's saved roles,
applications, tasks, profile and avatar live in IndexedDB instead, in
`assets/js/idb.js`.

- **The user id is part of the key**, and not a field beside it. A read for one
  applicant cannot return another's row even if the wipe failed.
- **A null session wipes; a failed one does not.** That request fails every time
  there is no connection. Treating it as a sign out would throw the offline copy
  away at the moment it is the only copy there is.
- **Every function fails quietly.** IndexedDB is unavailable in some private
  browsing modes, so a read returns null and a write does nothing.

## The action queue

**Two actions and no more**, both from the handoff modal: the rating, and the
yes or no. Queued when the request fails with a network error, and sent when the
connection returns.

**A queued answer is pending and not done.** The reapply cooldown is never
started from a local queue entry, and the Apply control has a `queued` state for
exactly that.

**Every action is idempotent**, so a replay cannot double count.

> [!WARNING]
> `sw.js` carries a second copy of the keep-or-drop rule, deliberately.
> Background Sync runs in the worker, and a worker is a classic script that
> cannot import a module. `queueVerdict` there must stay in step with
> `verdictFor` in `queue.js`. Two checks in the phase 10 run exist only to catch
> that pair drifting.

## Checking it

**`node tests/phase10-test.mjs --only=worker`** stands up the portal over
localhost, which is a secure origin as far as registration is concerned. It
drives a real browser through install, the precache, offline navigation, the
fallback and the update prompt. No deployment, no credentials, no network.

**`node tests/phase14-test.mjs --only=install`** does the same for this site,
and pulls the network out with Playwright afterwards.

**Run one of them before pushing a change to either worker.** A fetch handler
that throws makes every page on the origin fail for anybody who already has the
worker. No amount of reading the file finds that.
