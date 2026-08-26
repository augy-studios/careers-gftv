# tests

Browser checks for the Careers@GFTV portal, driven by Playwright against a
running deployment rather than a local server.

**These run against a real site and write real rows.** There is no fixture
database and no test mode. Everything here signs in as a real staff account,
creates real postings, raises real tasks, and deletes what it made on the way
out. Read [What a run writes](#what-a-run-writes) before the first one.

## Why they are here rather than thrown away

Every phase up to phase 7 wrote its checks, ran them once, and discarded them,
on the reasoning that nothing between phases was regression tested anyway. That
changed on 21 August 2026: the scripts are kept so that anybody with a staff
account can re-run a phase's checks after a change, rather than reading the
phase memo and rebuilding them from scratch.

What that does **not** mean: this is not a suite that runs in CI, and it is not
a gate on a deploy. It needs credentials, it writes to production, and it takes
half an hour. It is a thing a developer runs deliberately, usually after
touching the dashboard or the apply flow, and reads the output of.

## Before the first run

You need three things.

1. **Node 20 or later**, and Playwright's Chromium. From the repository root:

   ```sh
   npm install
   npx playwright install chromium
   ```

   `playwright` is a dev dependency of the root `package.json`, which exists for
   exactly this. The scripts import it from there, which is why they live at
   this level of the repository rather than under `main-site/`.

2. **A staff account with portal access.** `requireStaff` re-reads
   `gftvhello_sessions` and re-checks `hasPortalAccess` on every request, so
   there is no way to fake one.

   **Run it once as each role.** The account's `is_admin` decides which half of
   items 4 and 5 runs, and the file covers both: as an admin it checks that
   Delete is offered and the route does not refuse it, and as a job poster it
   checks that Staff access, Applicant accounts and Delete are all *absent* —
   absent rather than disabled, since 0c's disabled state means "a later phase"
   — and that a well formed delete still answers 403. Neither run alone is the
   check. An admin is also needed for item 17 and for `cleanup-smoke.mjs`.

   One wrinkle worth knowing before it confuses you: the `adminDelete` rate
   limit is checked before the role, so an account whose ten an hour is spent
   answers 429 to a delete rather than 403. That only happens if the same
   account was deleting things as an admin earlier in the hour, which is exactly
   what demoting one account to test both halves does. The run reports it as not
   run rather than as a failure.

3. **Somewhere to point it.** Production by default. Prefer a preview
   deployment when there is one.

## Running

```sh
# Everything, against production.
STAFF_USER=yourname STAFF_PASS='...' node tests/phase7-test.mjs

# One or more sections.
STAFF_USER=... STAFF_PASS='...' node tests/phase7-test.mjs --only=jobs,editor

# Against a preview deployment.
BASE=https://careers-gftv-abc123.vercel.app STAFF_USER=... STAFF_PASS='...' \
  node tests/phase7-test.mjs
```

### Sections

`--only=` takes any comma separated list of these. `setup` signs in and is worth
including in every run; the others assume it has.

| Section | Covers |
|---|---|
| `setup` | Staff sign in and `/api/admin/me`. |
| `access` | The sidebar's unbuilt sections, the signed out redirects, the two realms, and the Admin item in the public header. |
| `overview` | The stat tiles, the bucket tabs, and the blocked drafts callout. |
| `jobs` | The postings list, creating, publishing, duplicating, and the language column. |
| `editor` | The slug, the two halves of the editor across a language tab switch, sections, the embed preview, prefill, and the tag type-ahead. |
| `tracking` | Applying, filters, the detail panel, status changes, accepting, rejecting, cooldowns, bulk changes, archiving, and the CSV export. |
| `tasks` | Info requests, the four question types, replying, the one round rule, answer validation, resolving, and posting question sets. |
| `teams` | Departments and tags: the Chinese name rule, reordering, deleting, merging, and the orphan view. |
| `maintenance` | The maintenance page, the denylist, switching a feature off and back on, and everywhere that should show. Includes a 100 second wait: a flip takes about ninety seconds to reach a public page, and anything checked sooner is checking the cache. |
| `switchers` | The language and appearance switches in the header, both halves. Needs no deployment: it reads the feature map and the denylist directly and stubs `/api/public/feature-status`. |
| `rest` | The catch-all rewrite, the docs redirect, both languages on every page, keyboard reachability, 360px, permanent deletion, and `check-i18n`. |

### Environment

**No credential has a default and none is written down here.** Every script
refuses to start without `STAFF_USER` and `STAFF_PASS` rather than falling back
to something, because a fallback in a committed file is a staff password in the
repository whatever it is there for. Keep them in your shell, not in a script.

| Variable | Default | What it does |
|---|---|---|
| `BASE` | `https://careers.globalfurry.tv` | Which deployment to test. |
| `STAFF_USER`, `STAFF_PASS` | **required** | The staff account to sign in as. |
| `POSTER_USER`, `POSTER_PASS` | — | A second staff account with the **job poster** role, not an admin. Phase 8 has nine checks that only exist as refusals — 8.8 and 8.9 are admins only end to end, the helpers tab is admins only, and 8.11's queue deliberately is not — and `requireAdmin` re-reads the session on every request, so nothing an admin session sends can prove any of them. Without it those checks skip and say so. The run refuses to use an account that turns out to be an admin. |
| `APPLICANT_USER`, `APPLICANT_PASS` | — | Reuse an applicant account instead of registering a fresh one. Useful for a second run, which otherwise leaves another account behind. |
| `CLEANUP=draft` | — | Take every posting the run made off the board without deleting it. Spends none of the ten an hour deletion budget, which is what a debugging run wants. |
| `NO_CLEANUP=1` | — | Leave everything exactly as it is. **Postings stay published.** Only for a run you are about to inspect by hand. |
| `PATCH_JS` | — | Comma separated file names under `main-site/assets/` to serve from the working tree instead of the deployment. Lets a fix be re-checked against the live site without deploying it. Anything checked this way is a check of your working tree, not of the deployment, so say so when reporting it. |
| `FORM_WEBHOOK_SECRET` | — | Phase 9 only. The shared secret the Apps Script sends as `x-portal-secret`. Without it the run still checks that a delivery with no secret and one with a wrong secret are both refused — which is the most important check in that section — and skips everything past them. Take the value from the Vercel project settings. |
| `CRON_SECRET` | — | Phase 9 only. The bearer token Vercel sends on a scheduled invocation. Same story: the refusals are checked without it and the run itself is skipped. |

### Phase 9's sections

`node tests/phase9-test.mjs`, with the same `--only=` habit.

| Section | Covers |
|---|---|
| `formcheck` | The nine states of the form health check, driven through an injected `fetch`. **Needs no deployment, no credentials, and no network** — it imports `main-site/api/_lib/form-check.js` directly and hands it fake responses. The only section in any phase that can run offline. |
| `setup` | Staff sign in, an applicant registered through the register page, and a throwaway published posting whose form URL has never existed. |
| `webhook` | Section 13 end to end: the two refusals, payload validation, a `JOB_ID` naming no posting, a matched delivery overriding an earlier No, a duplicate delivery, and the unmatched list. |
| `cron` | Section 11: the two refusals, HEAD being refused, a posting past its closing date closing, one with no closing date being left alone, the health check flagging a dead form, a second run changing nothing, and the run record reaching `/api/admin/stats`. |
| `panel` | The maintenance panel on `/admin`, the unmatched list on `/admin/analytics`, and the webhook checklist with its posting id in the job editor. |

**Phase 9's run triggers the real daily maintenance against the deployment.**
That is what the endpoint is for and it is idempotent, but it does mean any
posting on the board whose closing date has passed is closed a few hours earlier
than the schedule would have closed it, and expired sessions are swept. Both are
correct and neither is reversible. `--only=formcheck` avoids it entirely.

Unlike phase 8, phase 9's run is comfortably re-runnable inside the hour: it
makes three postings and about fifteen admin writes.

### Phase 10's sections

`node tests/phase10-test.mjs`, same `--only=` habit.

| Section | Covers |
|---|---|
| `worker` | The service worker: install, the precache, offline navigation, the fallback for an uncached route, what is never cached, and the update path driven by hand. **Needs no deployment, no credentials, and no network.** |
| `client` | `offline.js`: that no page registers the worker itself any more, the connection banner in both wordings and both languages, its removal the moment connectivity returns, and the update prompt through the interface rather than by postMessage. Same, needs nothing. |
| `public` | Public data offline: a posting held after being opened, that it carries both languages, the fallback page listing what is held by name and in the reader's language, and the board falling back to the last result set that worked with the right one of two sentences. Serves its own posting documents shaped as `api/job-page.js` renders them. Same, needs nothing. |
| `disabled` | Controls that need a connection: the reason on the control and beside it as text, restored the moment it returns, that a control disabled for another reason keeps its own sentence, that one gated by both stays disabled when the connection comes back, and that the dashboard shows a notice instead of redirecting or drawing a sidebar. Same, needs nothing. |
| `queue` | The action queue: the verdict rule for every kind of refusal, queueing with no connection, a flush stopping on the first network failure without losing anything, both actions going through when it returns, the answer being reconciled against the server reply rather than the local entry, an action for a gone posting being dropped, a lost session keeping one, and that the worker copy of the rule and the sync tag have not drifted. Same, needs nothing. |
| `account` | The applicant's own pages offline: that a copy is kept on a successful load, that an account page does not bounce to sign in when the session cannot be asked, that the identity and the lists come from the copy on the device, that the fallback page offers the saved roles, and that a real signed out answer still redirects. Stands up a signed in applicant through routes rather than through a real login. Same, needs nothing. |
| `store` | `idb.js`: that a row is not readable under another user id, that a blob survives the round trip, that a null session wipes nothing, that signing in as somebody else wipes everything, and that a write racing the wipe does not survive it. Driven through the real module in a real browser, because IndexedDB's semantics are the whole of what is being checked and none of them exist in a fake. Same, needs nothing. |

**This is the first phase that cannot be checked by asking the deployment a
question.** A service worker is not on the deployment until it is pushed, and by
then a wrong precache list has already shipped — and it fails by silently
turning every offline behaviour off rather than by breaking anything visible. So
the `worker` section stands up `main-site/` over `http://localhost`, which is a
secure origin as far as registration is concerned, and drives a real browser
through the whole cycle. There is no API behind that server, so every `/api/`
call answers 404, which is the point: what is under test is which requests the
worker answers from a cache and which it refuses to.

Run it before pushing anything that touches `sw.js`, together with
`node check-precache.js` at the repo root.

**Nothing in this file reads a credential above a section.** Phase 9's file
called `requireEnv` at module level, before `--only=` had been read, so its one
credential-free section could not be run without a staff password it never used.

## What a run writes

- **Postings**, all titled `SMOKE P7 <timestamp> …`. A full run makes about
  fourteen. Some are published for as long as the run takes, because publishing
  is one of the things being checked.
- **An applicant account**, `smoke-p7-<timestamp>`, registered through the
  register page. It is left behind; pass `APPLICANT_USER` on later runs to stop
  the pile growing.
- **Applications, tasks, tags, and one department**, all belonging to the above.
- **Audit rows**, which is correct and is not cleaned up. The audit log is
  meant to outlive what it describes.

### Cleaning up

The run deletes its own postings at the end. Permanent deletion is capped at ten
an hour per staff account, deliberately and per section 8.2, so a full run does
not have enough budget to delete everything it made. What it cannot delete it
**unpublishes first**, so nothing is left on the public board, and it prints the
list of what is left. Delete those from `/admin/jobs` in the next hour, or run:

```sh
STAFF_USER=... STAFF_PASS='...' node tests/cleanup-smoke.mjs
```

If a run dies part way through, the cleanup still runs: it is in a `finally`.
If the process is killed outright, search `/admin/jobs` for `SMOKE P7`.

## What these cannot check

Listed so nobody concludes from a clean run that everything is covered.

- **Anything needing SQL.** No service key is used, so the checks that the phase
  memo writes as queries are done through the API instead where an endpoint
  exposes the same numbers, and skipped where none does. The audit log in
  particular is never read.
- **A second staff account.** The checks that a job poster without `is_admin`
  sees no Delete control, and that the endpoint refuses one anyway, need a
  second credential.
- **Revoking access underneath a live session**, which needs a row deleted by
  hand while the run is going.
- **A redeploy**, so "the override survives a deploy" is reasoned about rather
  than observed.
- **A real Google Form.** Every seeded posting points at a form that does not
  exist, so prefill is checked as far as the validator and no further.
- **What an unfurler does.** The embed preview is checked against the same first
  sentence rule the server uses; whether Discord agrees needs a real paste.
- **A full keyboard-only pass.** The scripts check that nothing is taken out of
  the tab order and that every control is focusable. Driving the reorder
  controls, the bulk bar, and the modals end to end still needs a person.

## The debug scripts

Small, single purpose, and written while chasing one thing down. Kept because
each one is the shortest way to reproduce a specific failure, and because the
shape is worth copying the next time something needs isolating.

| Script | What it answers |
|---|---|
| `debug-register.mjs` | Does registration work end to end, and what does the page say when it does not? Prints every `/api/` response and every field error. |
| `debug-slug.mjs` | Does the editor's slug stop following the title once it has been typed into, and does it survive a redraw? Prints the slug and title after each step. |
| `debug-prompt.mjs` | Does the applicant's "have you applied?" modal open over the staff dashboard when one browser holds both sessions? Takes an applicant username as its argument. |

They take the same `BASE`, `STAFF_USER`, and `STAFF_PASS` as the harness.

## The other scripts

| Script | What it does |
|---|---|
| `layout-check.mjs` | Every page at 360, 480 and 768px: does the body scroll sideways, is any table cell too narrow to read, is any button's label wrapping. `PATCH_CSS=1` serves the working tree's CSS and HTML so a change can be checked before it is deployed. |
| `screenshot.mjs` | The same pages, captured, because a measurement that passes is not the same as a page that looks right. |
| `cleanup-smoke.mjs` | Deletes what a run left behind. `--dry-run` lists without touching anything. |

## These scripts on the docs site

The developer guide will hand readers these files directly rather than pointing
at the repository. Those pages are phase 14's, but the piece that does not
depend on them exists now:

```sh
node docs-site/scripts/embed-tests.mjs
```

It reads every `*.mjs` in this directory, takes each one's description and its
usage lines from the comment it already starts with, and prints the payload the
guide's download cards will be built from. So **start every script with a
comment that says what it does, then its example invocations indented under
it** — that comment is the documentation, and there is no second place to keep
it in step. `docs-site/README.md` has the rest, including why the downloads are
blob URLs and what that does and does not hide.

## Writing checks for a new phase

Copy `phase7-test.mjs` and keep four things.

1. **`define(name, title, fn)` per section**, so `--only=` works and a failing
   section does not stop the rest. Anything a section throws is caught and
   reported as a failure of that section.
2. **`check(name, condition, detail)` for every assertion**, with the detail
   filled in on failure. A check that prints only ✗ costs somebody the debugging
   run you just did.
3. **`skip(name, why)` rather than silence** for anything that cannot run. The
   count at the bottom is only honest if the things that did not run are in it.
4. **Every posting prefixed and cleaned up**, and every published one taken back
   off the board even when deletion fails.

The one rule worth carrying forward that is not obvious: **a script that
registers through the API is not a registered user.** The register *page*
generates the recovery code set immediately after signing somebody up, and the
endpoint alone does not, so `login-page.js` sends an account with zero recovery
codes to `/account/security?codes=none` and ignores the `?redirect=` entirely.
Register through the page, tick the box, and click through the dialog, which is
what `registerApplicant()` does.
