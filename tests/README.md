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
   `gftvjobs_staff_sessions` and re-checks `hasPortalAccess` on every request, so
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
| `install` | The manifest and the install surface: every icon and screenshot on disk at the size it is declared as, `purpose` on all four icons, the maskable pair, the two shortcuts, the colours, and the `apple-touch-icon` and manifest tags across all 33 pages and the server rendered posting page. Plus the two headers on `/sw.js` in `vercel.json` that the rest of the phase assumes. **The one section with no browser in it**: what a launcher does with this manifest is decided by what the files actually are, and a size that does not match the real pixels is dropped in silence. |
| `switches` | The two kill switches from decision 7, **in both directions**: the worker reading them off the response every page already fetches, `install` off answering 404 for the manifest and taking nothing else with it, `offline` off dropping every cache and going network only, and both coming back — including the shell being refilled, since install is the only other thing that ever fills it. Same, needs nothing. |

**This is the first phase that cannot be checked by asking the deployment a
question.** A service worker is not on the deployment until it is pushed, and by
then a wrong precache list has already shipped — and it fails by silently
turning every offline behaviour off rather than by breaking anything visible. So
the `worker` section stands up `main-site/` over `http://localhost`, which is a
secure origin as far as registration is concerned, and drives a real browser
through the whole cycle. There is no API behind that server, so every `/api/`
call answers 404, which is the point: what is under test is which requests the
worker answers from a cache and which it refuses to.

**Every section in this file needs nothing at all** — no deployment, no
credentials, no network — which is unique to this phase and is a consequence of
what it builds rather than a virtue. Run the whole file before pushing anything
that touches `sw.js`, together with `node check-precache.js` at the repo root.

```sh
node tests/phase10-test.mjs
node tests/phase10-test.mjs --only=worker,switches
```

**Nothing in this file reads a credential above a section.** Phase 9's file
called `requireEnv` at module level, before `--only=` had been read, so its one
credential-free section could not be run without a staff password it never used.

**A mistyped `--only=` exits 1 and lists the sections**, rather than running
nothing and reporting a clean pass. Worth copying into the other phase files:
this whole phase is about failures that are silent, and a run that checked
nothing looks exactly like a run where everything held.

### Phase 11's sections

`node tests/phase11-test.mjs`, same `--only=` habit. **The site half only.**
Deviation 91 settled that the Python on the VPS is checked by a person against
[the checklist in `telegram-bot/README.md`](../telegram-bot/README.md#the-by-hand-checklist),
and this file does not pretend otherwise: **nothing here starts the bot or sends
a message.** What is here is ordinary portal work on `/account/settings`,
`/login` and `/account/security`, plus four sections that read the bot's own
source as text. Those exist for one reason: what a person walking a chat window
can see is that an answer arrived, and what they cannot see is whether the two
halves still name the same kinds, the same columns and the same status words.

| Section | Covers |
|---|---|
| `qr` | The QR encoder written for the linking flow, round tripped through `jsqr`, an independent decoder and a devDependency that never reaches a browser. Every version from 1 to 9, the capacity boundary between two versions, multi byte text, and a refusal rather than a truncation past what version 9 holds. **Needs no deployment, no credentials, and no network.** |
| `panel` | The panel in a browser: the control disabled with the phase sentence while phase 11 has not shipped and live once it has, asking for a code, the deep link on screen and on the button, the page flipping to linked while it sits there, unlinking behind a confirmation, and a read that could not be made showing as its own state rather than as "not linked". **It also reads the `d` attribute back out of the drawn SVG, rebuilds the matrix and decodes that**, because the encoder and the path builder are two separate places the symbol can be wrong. Same, needs nothing. |
| `wiring` | What the two halves have to agree about: the new module in the precache list, all three controls carrying both reasons they can be disabled, every string in both languages, and **that the site's unlink and the bot's unlink still skip the same rows**. That rule is written twice in two languages against one table, and phase 10's lesson was that a duplicated rule needs a check that the copies still agree. Same, needs nothing. |
| `signin` | Part 3's second step, in a browser: an account with Telegram alone is not shown a passkey button it cannot use, an account with both is offered both, a code that was asked for is announced and one that could not be asked for names the fallback instead, and a refused one tap link says why on the page it lands on and takes its parameter off the URL. Same, needs nothing. |
| `twofa` | The switch on the settings panel: refused by name when the account has no 2FA backup codes, **put back rather than left sitting where somebody left it**, and staying on once the codes exist. A security control that reports a state the account does not have is the worst kind of wrong. Same, needs nothing. |
| `outbox` | Part 4's queue, from the portal's side: the five states the `/admin` panel can be in, drawn in a browser, and six things the two halves have to agree about — including the one that would be silent, **every kind the site queues being one the drain can render**. A kind this build cannot render is never claimed, which is the whole reason the two halves can be deployed hours apart. Same, needs nothing. |
| `notify` | Part 5's three kinds and the toggles. Every check reads a file rather than a page, because the disagreement it exists to catch — the site queuing a kind under one name and the bot reading another, or a notify column one side does not know about — is silent at both ends and would look exactly like a notification nobody happened to send. Same, needs nothing. |
| `commands` | Part 6's four lists, the same way. **The portal's own words**: nine application statuses compared value by value against `status.*` in both dictionaries, so a chat window never invents a sentence about somebody's application. Same, needs nothing. |
| `seam` | **The boundary between the two languages.** The bot writes a bcrypt hash in Python and the site reads it with bcryptjs, so the check is a real Python hash verified by the site's own `verifySecret` rather than a claim that the two agree; the failure it catches is a correct code refused at a login form with nothing in any log to explain it. Also the pending sentinel the site writes against the prefix the bot claims on, five minutes meaning five minutes on both sides, and that the magic link answers GET and nothing else. Same, needs nothing. |

**Service workers are blocked in the `panel` context, and that is deliberate.**
Every page here registers one, and an active worker serves
`/assets/build-status.json` from its own precache, where `page.route` never sees
the request. The stubbed phase list then silently stopped arriving after a
reload. It passed alone and failed in a full run, which is the worst shape a
check can have. What the worker does is phase 10's file's job.

### Phase 12's sections

`node tests/phase12-test.mjs`, same `--only=` habit. **Phase 12 has no new
feature, which is what this file is for**: every phase before it could be
checked by asking whether the new thing works, and there is nothing here to ask
that about. What stands in its place is a list of surfaces with a width against
each, at the six widths section 3 names — 320, 375, 414, 768, 1024 and 1440.

| Section | Covers |
|---|---|
| `responsive` | The seven public pages at all six widths in both languages, served from the working tree over `127.0.0.1`. Sideways scroll, table cells under the floor, and short button labels wrapping — each reported once per page with the offending element's ancestor chain rather than once per width. **The board is drawn from fixtures carrying the limits rather than the averages**: a 60 character tag name in both languages, a department longer than its column, a uuid, `closes_at` null so the "open until filled" sentence is drawn, and a posting with no translation so the badge is there. Every other endpoint answers 503, loudly, because a page measured in its error state is the narrower page. It asserts that the 华文 run is rendering 华文 and that the cards actually arrived, since both failures report the same clean six as a correct run. **Needs no deployment, no credentials, and no network.** |
| `landscape` | One 736 by 375 viewport. Turned sideways a phone is a wide screen with no height, so what is measured is not width but how much of it the pinned furniture takes: **the union of what is on screen**, half the viewport being the line. Summing heights instead reported 436px of a 375px viewport, because a closed off canvas drawer is full height, fixed, and entirely off the left edge. Same, needs nothing. |
| `responsive-admin` | Six admin pages, both languages, at the same six widths, **against a deployment with a staff credential**, because an admin page is a session and a database rather than a document. Skipped by name without `STAFF_USER` and `STAFF_PASS`. It also checks that the label phase 12 hides between 1024 and 1279 is hidden from the layout and not from the accessibility tree, which is one `display: none` away from being lost. |
| `a11y` | The same seven pages at 375 and 1024 in both languages, against eight rules: everything reachable by Tab has an accessible name, nothing focusable sits inside `aria-hidden`, every ARIA reference resolves, no id is used twice, exactly one `h1`, no heading level skipped, every image has an `alt` or is marked decorative, no positive `tabindex`, and the skip link is the first thing Tab reaches and lands on something. Two widths rather than six, because 375 is where the drawer and the filter panel are sheets and 1024 is where neither is, and those are the two documents. **It injects a nameless button and a focusable link under `aria-hidden` first and requires the audit to report both**, since a clean first run is what a broken measurement looks like from outside. Needs nothing. |
| `a11y-keyboard` | The four public surfaces that are a behaviour rather than a description, driven with the keyboard: the suggestion combobox (`aria-expanded`, `aria-activedescendant` naming a real option, exactly one selected, the focus staying in the input, the highlight wrapping out of the last group, Escape clearing it), the filter panel as a bottom sheet and the navigation drawer (each opens, says so, takes the focus, and gives it back on Escape, with nothing left tabbable behind), `dialog.js` through the sign in prompt (modal, named, focus trapped, focus returned), and phase 10's connection bar — **watched as it arrives**, because the defect part 2 found was that its live region was inserted with its sentence already inside it. Also the sentence beside a control the connection has disabled, which is now attached to that control rather than merely next to it. Needs nothing. |
| `a11y-admin` | The eight rules above over the six admin pages in both languages, **against a deployment with a staff credential**, skipped by name without one. **Read only on purpose**: it loads pages and asks questions, and never flips a maintenance switch, sends a task or edits a posting. The interactive admin surfaces on section 12's list — the bulk bar, the question composer's reorder controls, the annotation sheet, the handoff modal, the account picker — are all writes against the real database and belong in the same sitting as phase 11's by-hand walk. |
| `a11y-account` | The eight rules over the applicant's own five pages, with `APPLICANT_USER` and `APPLICANT_PASS`. It prints the row count of each page rather than asserting one, because whether the credential has content is a fact about the credential — but **a freshly registered account passed all five clean and three of them failed the moment it had rows**, so the numbers are what say which of the two a run was. See `create-applicant.mjs` below. |
| `responsive-account` | The applicant's own five pages, the same way, with `APPLICANT_USER` and `APPLICANT_PASS`. **Signed out all five redirect to `/login`**, so a run without a credential would measure the login page five times and report it as coverage — which is why this skips by name rather than running. It also checks `.nav-account-name` at 1024: a display name is arbitrary text of arbitrary length in a fixed width bar, capped with an ellipsis rather than wrapped, because a name that wraps takes the row with it. |
| `contrast` | Every colour part 3 names, in **all four theme combinations**, against 1.4.3 for text and 1.4.11 for a boundary or a state indicator: the four callout tones, the three language pills and the tab dots, both switch states, the star on and off, and ten text tokens — each on the three surfaces this build paints, `--bg`, a `.glass-card`'s `--surface`, and `--bg-alt`. **Nothing is read out of the stylesheet**: `--surface` is an alpha, `--callout-*-bg` is a `color-mix`, and a callout's border is `currentColor`, so every pair is `getComputedStyle` on a real element composited down its ancestor chain. Transitions are suppressed first, because a custom property flips on the instant while `body`'s background eases over `--transition`. **Needs no deployment, no credential and no network.** |
| `zh` | **What a check can decide about the Chinese before a reviewer is asked for an afternoon.** Every English and 华文 pair in the build, 1,930 of them: the dictionary, the seeded departments and tags, the hero, the fifteen phases and their shipped notes, everything the Telegram bot says, its command menu, and its profile text. Five rules over all of them — a placeholder neither dropped nor invented, markup opening and closing the same way in both languages, no string with English in it and nothing in 华文, Singapore Mandarin over Mainland usage, and a space between Latin and Han and never between Han and Han — plus the two sentences `strings.py` says it reproduces from the dictionaries word for word, which `check-i18n.js` covers on the site side and cannot see in a Python file. **Needs no deployment, no credential and no network**; it reads files and imports two Python modules, so those two files' own import-time guards come with them. |
| `zh`, the coverage half | **The check that would have caught the thing this section was written after.** `zh-review.html` had been rendering 223 of 1,728 interface strings: its group list was written in phase 3 and nine phases added 1,505 keys in twenty six groups nobody added to it, while the page's header counted all 1,728 and called itself every word of Chinese on the portal. So `zh` asserts every dictionary key is on the page, every source contributed rows — the hero and the seeded rows are read out of migrations with regular expressions and would hand back an empty list if one were reformatted — every collected row is actually rendered, and **no shipped file carries 华文 that the reviewer is not shown**, which `gen-review.js` answers from a list of sources and a list of exemptions each carrying its reason. |
| `discovery` | **Part 5's three files, and the switch behind them.** `robots.txt` in each of its three states, the sitemap built from fixtures, and `llms.txt`. The check that matters most is the smallest: `INDEXING` in `api/_lib/discovery.js` and the global `X-Robots-Tag` in `vercel.json` are one decision written in two places, and part 8 has to move both in one commit. It also checks that no static `robots.txt` or `sitemap.xml` has come back — the filesystem is matched before the rewrites, so one of those would win and the function would never run. **The public page list is derived rather than trusted**: the pages carrying no `noindex` meta are read out of the markup and compared with the sitemap's list in both directions, which is part 3's badge and part 4's review page arriving a third time. Two rules are handed something that breaks them first — a path under `/admin`, which throws, and a row whose id is not a posting id, which is dropped. **Needs no deployment, no credential and no network.** |
| `discovery-live` | **The half nothing local can answer.** A route returning 200 is not evidence its rewrite works, and this is the pair that rule was written for: `/robots.txt` was a static file for eleven phases. It fetches both addresses from the deployment, compares the robots body against the one this tree builds, reads `X-Robots-Tag` off a real response rather than out of `vercel.json`, and **compares the sitemap's postings against `/api/public/jobs.json`'s** — two places asking which postings are live, and nothing else would notice the day one of them changes. Needs the network and no credential; **skips by name while the deployment is still serving the old static file**, which is the state between writing part 5 and pushing it. **While `INDEXING` is false it checks the gate instead**: `/sitemap.xml` is a 404, because there is no sitemap for a site nobody may crawl, and the contents half says by name that it is waiting for part 8. That flip is the first time the sitemap's query runs against the database, so running this section belongs in that commit rather than after it. |
| `contrast`, the `fills` group | **Every rule that paints a background and puts text on it**: both button variants, the sidebar badge, the chip and the three status pills. This group is here because the section shipped without it and a `.admin-badge` at **1.10:1 in hello dark** was reported from a screenshot rather than by any check, which then turned up `.btn-primary` at 3.51:1 in hello light. A fill with a label on it is the commonest contrast failure there is and it was the one shape nothing was asking about. **A probe measures what is in it** — when a check is a list, the question to ask it is what shape is missing, not whether the entries pass. |

Every responsive section also checks that **no icon is drawn under `MIN_SIZE`**,
which the file imports from `main-site/assets/js/icons.js` so the check and the
build cannot disagree about what too small means.

**`inert` counts as gone, and so does `visibility: hidden`.** The build closes
its three off canvas panels two different ways — `admin-shell.js` makes the
sidebar `inert`, while `.site-nav` and `.filter-panel` are hidden in CSS — and
`Element.checkVisibility()` sees only the second. The audit asks about both,
which it did not on its first run: it reported every link in the admin sidebar
as focusable inside `aria-hidden`, on all six pages in both languages, and that
was a finding about the check.

**`PATCH_ASSETS=1` serves the working tree's stylesheets, scripts and pages in
place of the deployment's**, borrowed from `layout-check.mjs`, which calls it
`PATCH_CSS` and patches only stylesheets. Both spellings work here, and **pages
are patched too since part 2**, because an accessibility fix is as often a line
of markup as a line of CSS. Only GET navigations are served from the tree; a
form posting to a page still reaches the deployment.

```sh
PATCH_ASSETS=1 STAFF_USER=... STAFF_PASS='...' node tests/phase12-test.mjs --only=responsive-admin
```

Without it a fix written in answer to a finding cannot be proved until it has
been pushed, which is the wrong way round for a part whose whole output is CSS
and one constant. **Leaving it off is also the cleanest negative test there is**:
the deployment still carries whatever has not shipped yet, so a check that
passes patched and fails unpatched has just proved both halves of itself.

**Two things in `contrast` are measured and deliberately not asserted**, and
both print their number rather than being skipped, so an exemption stays a
decision somebody made rather than a hole nobody can see. The note callout's
border is 1.21:1 to 1.72:1 and stays there: 1.4.11 covers user interface
components, and a callout is static prose with a `--surface-active` fill that
already sets it apart. The star's fill is 1.82:1 to 2.09:1 in light mode and
stays there too: the stroke is what draws the star's shape, it is asserted at
3:1, and `app.css` argued this before part 3 arrived. Both are written up beside
the rules they excuse.

**This whole file writes nothing.** It signs in and navigates; it creates no
posting, no application, no tag and no task, so it is the one credentialed run
that needs no cleanup and does not touch the deletion budget below.

### Looking at the four themes

`node tests/capture-themes.mjs [output directory]`, defaulting to a gitignored
`theme-shots/`. **It is not a check and never passes or fails**: it produces
twenty JPEGs — five surfaces across the four theme combinations — for a person
to look at, and the person is the check.

It exists because `contrast` is arithmetic, and arithmetic cannot tell you that
a token which clears AA looks wrong. **It earned that on its first run.** In
hello light an unchecked switch draws its track from `--surface-active`, 70% of
the brand yellow, and a checked one from `--callout-ok-bg`, a 14% green tint, so
the *off* state is the louder of the two. Both clear 1.4.11 comfortably and no
check reports it, because it is a hierarchy problem rather than a contrast one.

The theme is set through the same `localStorage` keys the pre-paint script in
every `<head>` reads, so nothing is captured mid theme transition. The fifth
surface is a swatch sheet rather than a page: both switch states, the three
language pills, both stars and the four callout tones are a session and a
database away on a real page, so they are rendered from the same classes and
containers `contrast` measures.

### Making the applicant the account sections need

`node tests/create-applicant.mjs`, which is separate from the phase file for
exactly the reason above. It registers `APPLICANT_USER` **through the register
page** — phase 6's rule, since the page generates the recovery codes and
`api/auth/applicant/register` alone does not — then saves three postings,
applies to one, and with `STAFF_USER` set raises two tasks, one a plain reply
box and one a set of all four question types.

**The content is not decoration.** A freshly registered account passed the
whole accessibility sweep clean; the moment it had an application, three saved
roles and two tasks on it, `/account/applications`, `/account/saved` and
`/account/tasks` all failed the heading outline. An empty list measures the
chrome.

The password has to be **ten characters or more**, which is the whole of the
policy in `api/_lib/password.js`. Everything the script creates cascades away
when the account is deleted, per 7g, so the danger zone undoes all of it in one
action.

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

### Phase 13's sections

`node tests/phase13-test.mjs`, same `--only=` habit. **No section needs a
credential, and only `live` needs the network.** The rest is like phase 10's and
for a related reason: what phase 13 part 5 adds is a build, and a build is wrong
before it is deployed or it is not wrong at all. It is the phase's file, so parts
6 and 7 add to it; what is in it today is part 5.

**Run `live` after every docs deploy.** Parts 3 and 4 shipped a content route
that answered 404 to every request on the deployment and looked perfect against a
local stand in for two parts, which is what that section exists for.

| Section | Covers |
|---|---|
| `build` | What `docs-site/scripts/build.js` wrote: one static file per public page and none for a gated one, no markdown and neither content tree in the output, the shell and the assets present, and a built page carrying its own title, its data block and no front matter. |
| `index` | The split search index, which is the check 16e asks for by name: no sentence from a gated page in the public file, a poster's index holding no developer page, a signed out reader getting nothing at all. Plus the dates, in both directions — every committed page has one, and a page git cannot date has none. |
| `render` | The marks part 5 added: images, figures with captions, 16g's pending slots, a bare file name resolved against the page it is on, an unsafe src rendering as text, and the outline the build splits pages by. |
| `refusals` | Every way the build says no, each fired on purpose and checked for the message it names: a page with no `access` key, a misspelled one, a gated page pointing at a public image, an image with no file behind it, a picture in the public tree, an asset of a type this site will not serve, and one outside every section. |
| `shell` | A browser over the built output, with a local server standing in for the three routes. The static pipeline drawing its own chrome without fetching anything, search in both halves, the keyboard on the results, a gated page and its image through the authenticated route, and two widths with the results panel open. |
| `live` | **The same questions, asked of the deployment**, and the only section here that touches the network. It needs no credential, because everything it asks it asks as a stranger: the built pages are files, the content tree is not served as markdown, the route answers by parameter and not by path, a gated page is 404 and never 401, the public index holds nothing from the staff half, and the payload carries a date — which is the proof that `includeFiles` reached `api/_generated/` and that the build ran before the functions were packaged. `DOCS_BASE=` points it somewhere else. |

**It writes two fixtures into the gated content tree and removes them again**: a
1x1 png and a page that points at it, because there is no other way to prove a
gated image end to end while every page in both trees is still a placeholder.
Both paths are checked for absence first, so a run cannot overwrite something
somebody wrote, and the `finally` removes them and rebuilds the output. **A run
leaves the tree as it found it**, and it does rebuild `dist/`, so run the build
again yourself only if you had one in flight.

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
