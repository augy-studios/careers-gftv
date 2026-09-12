---
title: 1. Done so far
access: developer
order: 1
summary: Migrations 001 to 013, the api/_lib/ helpers, and the build status
---

# 1. Done so far

## Phase 1, Foundations. Shipped.

Migrations `001` to `013`, the `api/_lib/` helpers, and the build status
mechanism from section 0c. Then `theme.css` and `app.css`, `shell.js`, and the
holding home page, `/status`, `placeholder.html`, and `404.html`.

## The multilingual change set. Committed as `2bbe967`. Not a phase.

Migrations `014` to `023`, `i18n.js`, the two dictionaries, the globe button,
and the page held blank until the dictionary applies. Took the phase plan from
eleven to fourteen.

## Phase 2, Authentication. Shipped, and proved on the live site.

`api/_lib/` gained `password.js`, `totp.js`, `webauthn.js`, `rate-limit.js`,
`validate.js`, `accounts.js`, `audit.js`, and the creation half of `session.js`.
`api/auth/staff/` and `api/auth/applicant/`, the full set. `/login`,
`/register`, `/forgot-password`, `/admin/login`, `/account/security`,
`/admin/security`. Migrations `024` to `027`.

## Phase 3, Browsing roles. Shipped, verified live on 20 August 2026.

Migration `028`. `api/public/search.js`, `suggest.js`, `facets.js`, and
`api/_lib/jobs.js`. The home page, `search/index.html`, `about/`, `faq/`.
`format.js`, `job-card.js`, `search-page.js`, `home-page.js`. 82 checks passed.

Two rules from that run are still live and not history:

- **Do not lower `gftvjobs_typo_threshold()`** to catch `edtior`. Catching a mid
  word transposition needs edit distance, which is a new numbered file.
- **A route returning 200 is not evidence its rewrite works.** Vercel matches
  the filesystem before it consults rewrites.

## Phase 4, Job postings. Shipped, deployed, and verified live.

No migration. `api/_lib/job-detail.js`, `page-shell.js`, `api/job-page.js`,
`api/public/job.js`, `jobs-feed.js`, `api/translations/report.js`. Client:
`job-page.js`, `markdown.js`, `dialog.js`, `signin-prompt.js`,
`translation-report.js`. 159 checks passed, 0 failed.

Three findings from that run are still rules:

- **HEAD belongs alongside GET** on anything a stranger may fetch. **Phase 9 is
  the one deliberate exception**, and the run on 26 August 2026 confirmed it:
  `HEAD /api/cron/daily` answers 405.
- **A confirmation must not live inside the form it replaces.**
- **A form with no method is a GET form.** Every credential form carries
  `method="post"`.

## Phase 5, Apply flow. Shipped, deployed, and verified live.

No migration. `api/_lib/apply.js`, `api/applications/start.js`, `respond.js`,
`pending.js`, `mine.js`, `api/ratings/upsert.js`. Client: `apply.js`,
`apply-dialog.js`, `apply-prompt.js`, `apply-badges.js`.

## Phase 6, Applicant dashboard. Shipped, deployed, and verified live.

No migration, and the bucket that is not one: `gftvjobs-avatars` is Storage and
not a table. A fresh environment needs `main-site/AVATARS.md` section 1 run by
hand before avatars work.

`api/_lib/dashboard.js`, `tasks.js`, `avatars.js`.
`api/applications/withdraw.js`, `api/saved/*`, `api/tasks/*`,
`api/account/avatar.js`, `api/account/danger/delete.js`,
`api/translations/mine.js`. Five pages under `/account`, and `account-shell.js`,
`account-row.js`, `save-button.js`, `avatar.js` and the five page modules. 70
checks passed, 0 failed.

The rule from that run worth keeping: **a script that registers through the API
is not a registered user.** The register *page* generates the recovery code set
immediately after signing somebody up. `api/auth/applicant/register` alone does
not. And `login-page.js` sends an account with zero recovery codes to
`/account/security?codes=none`, ignoring the `?redirect=` entirely.

## Phase 7, Admin core. Shipped, deployed, and verified live on 22 August 2026.

**Migration `031`.** `questions jsonb` and `answers jsonb` on `gftvjobs_tasks`,
`task_questions jsonb` on `gftvjobs_jobs`, and three validator functions.

**Server.** `api/_lib/admin.js`, `admin-jobs.js`, `admin-applications.js`,
`admin-tasks.js`, `questions.js`, and `maintenance.js`. Nine routes under
`api/admin/`, plus `api/public/feature-status.js`, each an action based POST
plus a GET.

**Pages.** `/admin`, `/admin/jobs`, `/admin/jobs/edit`, `/admin/applications`,
`/admin/departments`, `/admin/tags`, `/admin/maintenance`, and the nine client
modules behind them.

**Eleven defects, all invisible in the source.** `tests/phase7-test.mjs` is the
executable version of that account; five of them left rules behind, in section
3.

## Phase 8, Admin operations. Shipped, deployed, verified live on 25 August 2026.

**Migrations `032` to `035`, all applied by hand in the Supabase SQL editor and
confirmed. `036` is written and still not applied** — see section 5.

- `032`: the shortlist status on `gftvjobs_invites` and `must_change_password`
  on `gftvjobs_users`. And two views, `gftvjobs_needs_translation` and
  `gftvjobs_application_search`.
- `033`: `gftvjobs_job_funnel` and `gftvjobs_job_funnel_daily`, because
  PostgREST has no group by and the alternative got slower every week.
- `034`: `updated_by` on the three translation tables, which is what makes
  8.11's "what each has drafted" answerable at all.
- `035`: `revoke` and `security_invoker = on` for all four views, after
  Supabase's advisor reported them. **This is the one to remember.** RLS with no
  policies protects a table and does not reach a view, because a view runs as
  its owner. Both lines belong in the file that creates a view, not in a file
  somebody writes after an advisor complains.

**Eleven parts.** Settings and the public half nothing was reading; analytics
with the `view` event that had never existed; invites and shortlists; admin
users. Then applicant users; the translations queue; the needs-translation audit
and the real applicant search. Then translation helpers, the admin half; the
helper area; the annotation layer. And the seam, which is
`tests/phase8-test.mjs` and the corrections to `check-i18n.js` and
`main-site/README.md`.

Four things from it that phase 9 leaned on directly:

- **A migration applied is not a feature shipped.** `032` created two views on
  23 August and one of them was read by nothing for six parts. Before writing
  that something is done, grep for the thing that would have to read it. **This
  caught a real error in phase 9's own plan** — see deviation 58.
- **A flag nothing enforces is the failure this build keeps hitting.**
- **The one editing action in the build that is audited is a helper's save.**
  Phase 9 added the second, and deviation 62 says why.
- **`api/admin/me` sends `null` and not `0` for a count it could not read.** The
  cron's last-run panel keeps the same manners, in three states instead of two.

## Phase 9, Automation. Shipped, deployed, verified live on 26 August 2026.

**No migration.** Everything it needed already existed, which is the unusual
part and is worth stating. That is `gftvjobs_form_submissions` and its unique
constraint from `008`, and the three `form_check_*` columns from `005`. It is
also `answer_source` on `gftvjobs_analytics` from `007`, and
**`gftvjobs_cron_runs` from `012`**.

**Server.** `api/_lib/cron.js`, `form-check.js`, `form-submissions.js`.
`api/cron/daily.js`, `api/webhooks/form-submit.js`, `api/admin/submissions.js`.
A `formWebhook` bucket and `subjectForForm` in `rate-limit.js`, `lastRun` on
`api/admin/stats.js`, and `SUBMISSION_LINKED` in `audit.js`.

**Client.** The maintenance panel on `/admin`, with `formatDateTime` and
`hoursSince` in `format.js` behind it. The unmatched submissions panel and its
account picker on `/admin/analytics`. The collapsible webhook checklist with a
copy button in the job editor, and the two-state form check badge on
`/admin/jobs`. 25 dictionary keys per language, and one removed.

**Elsewhere.** `crons` and `functions` in `vercel.json`,
`apps-script/careers-form-webhook.gs`, the two new README sections, and
`tests/phase9-test.mjs`.

**The verification run, 26 August 2026.** Every product check passed. The three
things this phase could check that no earlier phase could all held:

1. **A duplicate delivery is a 200 and one row.** Migration `008`'s unique
   constraint doing its job.
2. **A webhook confirmation overrides a No**, and says so in its response. The
   funnel then counts the Yes against `webhook` and not against the applicant.
3. **The cron is idempotent.** The second run straight after closed nothing.

**Nothing in the phase was wrong. Three things around it were**, and all three
are fixed:

- **`tests/phase9-test.mjs` called `requireEnv` at module level**, before
  `--only=` was read, so the documented offline section could not run without a
  staff password. Both READMEs said it needed none. Now gated on `NEEDS_STAFF`.
- **The panel checks waited for the wrong thing.** `#adminCronRun` is in
  `admin/index.html`'s static markup, so `waitForSelector` resolved before
  `/api/admin/stats` had answered and `drawCron` had filled it. The panel was
  working the whole time; the test reported it as an empty box. Now a
  `waitForFunction` on the panel having text. See section 3.
- **`FORM_WEBHOOK_SECRET` was keyed in twice** in the local env file, so ten
  webhook checks failed as `unauthorised`. Worth keeping only for the diagnosis.
  The endpoint answers **503 "not configured"** when the variable is absent, and
  **401 "not recognised"** when it is present and wrong. So the status code says
  which of the two it is without anybody opening the Vercel dashboard.

## Phase 10, Offline. Shipped 27 August 2026, deployment checks still owed.

**No migration**, and the first phase that owns `sw.js` instead of only bumping
it.

**The worker.** `sw.js` in full: the precache list of 102 entries, a tolerant
install that adds one entry at a time, an activate working from an allowlist.
Then four strategies, the posting index, the Background Sync handler, and both
kill switches. `check-precache.js` at the repo root beside `check-i18n.js`.

**The client.** `offline.js` — one registration in place of thirty three inline
blocks, the update prompt, the connection bar in both wordings, and the network
gating pass. `idb.js`, the bottom of the stack, with the compound user id key.
`queue.js` for the two offline answers. `offline.html` and `offline-page.js`.
The install surface: `gen-icons.js`, `gen-screenshots.js`, the yellow plate, the
maskable pair, and a rewritten `manifest.json`.

**Elsewhere.** `api.js` gained the two connection events and the `unreachable`
flag. `account-shell.js` and `admin-shell.js` both stopped reading a failed
session as a signed out one, and `apply.js` gained an eighth state.

**`tests/phase10-test.mjs`: 125 checks in nine sections, and every one of them
needs no deployment, no credentials, and no network.** That is unique to this
phase, and it is a consequence of what it builds and not a virtue. A service
worker is not on the deployment until it is pushed, and by then a wrong precache
list has already shipped.

Five things from it that later phases inherit:

- **An authenticated response never enters the Cache API**, and neither does one
  carrying `private` or `no-store`. The second is the sharper half: the two
  routes it catches look public from inside a worker.
- **A failed request is a third state, not a No.** It bit twice, on both
  dashboards, and the fix was the same both times. The same shape as the rule
  that a count which could not be read is `null` and never `0`.
- **There are three reasons a control can be disabled**, and the third does not
  borrow the first two's machinery.
- **A switch has to work in both directions**, and deviation 89 is what happens
  when only one direction is built.
- **A seam finds what a part cannot.** The two sections that found things were
  the two that belonged to no part. Deviation 90.

## Phase 11, Telegram bot. Shipped 29 August 2026, the by-hand walk still owed.

**No migration.** Migration `011` created all three tables on day one, with the
purposes, the unique constraints and the per kind notify columns. Nothing in
seven parts needed anything added to them. **The one that mattered most going
in**: nothing anywhere had ever written `gftvjobs_notifications`. So every part
that said "the site queues a row" was writing that path for the first time.

**The bot.** `telegram-bot/`, about 5,100 lines of Python across fourteen files
and **three asyncio loops in one process**. Those are the command dispatcher, a
two second security loop for sign in codes, and the twenty second outbox drain.
Telethon and not the HTTP Bot API, SQLite for anything bot local, Supabase for
anything shared. And a single instance lock that refuses to start twice and
names the pid holding it. `commands.py` is the one copy of the command list.
`start` prints from it, Telegram's menu is registered from it, and both
documents that carry it are checked against it.

**The site.** `api/account/telegram` for section 15's applicant half, and
`api/_lib/telegram.js` with `KIND`, the two queue helpers and `outboxSummary()`.
The panel and its QR on `/account/settings`; the code and the one tap link on
`/login`. The second factor switch on `/account/security`, which is phase 2's
deliberately disabled wiring finished and turned on. The outbox panel on
`/admin`. `INVITE_DECLINED` in `audit.js`, written by the bot and not by this
codebase, as `TELEGRAM_LINKED` already was.

**Seven parts and four commits after them.** `72f2f55`, `6bdde23`, `8c24a7e`,
`5ca53a8`, `70fb44c`, `1af598a`. Then the flip to `shipped` as `9d9c4d8`, and
the VPS restart `af246d4`. Then the copy button `f95a1e0`, the login page pair
`f2a6b4d`, and the seam `7b0a3fa`.

**`tests/phase11-test.mjs`: 89 checks in nine sections, none of which needs a
deployment, a credential or a network.** It is the site half only. Deviation 91
traded a scripted suite for a person and a list, so the Python has no automated
coverage at all. What stands in its place is the 29 step checklist part 7 wrote
into `telegram-bot/README.md`, **and it has not been walked yet**. Section 5
item 17, and it is the only thing this phase still owes.

Five things from it that later phases inherit:

- **The site never calls the bot.** It writes a row and returns. Nothing awaits
  a Telegram send inside a request, however small it looks.
- **Correctness comes from the database and not from a test.** One conditional
  update claims a batch, so two instances cannot send one row twice even when a
  bad restart leaves both polling. Nothing in the bot reads and then writes.
- **A kind this build cannot render is never claimed**, which is the only reason
  the two halves can be deployed hours apart. Deviation 103.
- **Security messages are not queued and are not subject to the toggles**,
  because silencing them is what an attacker would want.
- **A list copied into documents needs a check, not a docstring.** `python
  commands.py --check` reads every copy, and a document carrying none fails.
  Deviations 91 and 116.
- **House style is a script, and one comparative is banned from copy.** The
  phrase itself is in `check-copy.js`, which is where a rule about copy belongs
  and is why this line does not print it. Settled 1 September 2026: no English
  string a reader sees carries it. The alternatives are `instead of`, `in place
  of`, `as opposed to`, `over`, `in preference to`, `without` and `and not`.
  `node check-copy.js` reads the dictionary, the pages with their comments
  stripped, the phase list on `/status` and `llms.txt`. It also reads **every
  quoted string in every one of the bot's Python files**, and the About and
  Description on its profile. That is 3,470 strings, and it exits non zero on
  one. The bot half is the whole directory and not only `strings.py`, confirmed
  the same day. A sentence can be built anywhere. The one hit outside that file
  was `db.py`'s message to whoever runs an older bot against a newer database.
  **Comments, READMEs and the migrations are not copy** and keep the phrase,
  because banning it in an explanation only teaches people to write worse
  explanations. **This memo stopped being one of them in part 10e**, which
  published it as nine pages and put 6,511 lines into the check's scope. Eleven
  strings were rewritten to introduce the rule, and **the check found one the
  greps did not**. `admin/index.html` carries the outbox lede in its markup as
  well as in the dictionary. That is the pattern every `data-i18n` page follows,
  and the reason a dictionary-only sweep is half a sweep.

## Phase 12, Polish. Shipped 31 August 2026, in eight parts.

**The first phase with no new feature at its centre**, and the difficulty was
exactly that. Every phase before it could be checked by asking whether the new
thing worked. What stands in place of that question is
**`tests/phase12-test.mjs`, 13 sections and about 590 checks**. A pass with no
list is a pass nobody can repeat.

**Two migrations, `037` and `038`**, both applied by hand on 31 August 2026.
`037` is the phase's own: `gftvjobs_status_days`, `gftvjobs_status_incidents`
and `gftvjobs_status_record()`, which is the only way into either. Deviation 120
is why that is not the table section 6 names. **`038` belongs to no part of the
phase**: it moves the portal's staff sessions out of `gftvhello_sessions`, and
it is deviation 122.

**Eight parts, and their commits.**

1. **The responsive pass**, `3bcf34b` and `c32a4ab`. Six widths, two
   orientations, both languages, scripted and not walked. One theme and the
   portal only — deviations 117 and 118.
2. **The accessibility pass**, `f6c8143`. Four sections, nine findings, all
   fixed. Its by-hand half is still owed and rides with phase 11's walk.
3. **The measured colours**, `45a3451` and `a9478af`. The star colours, the
   language pills, the switch states and the four panel tones against 1.4.3 and
   1.4.11. Seven findings, two measured exemptions, one new token,
   `--border-control`. `tests/capture-themes.mjs` came with it, because
   arithmetic cannot say a token looks wrong. The two findings it produced
   closed a gap in the file: nothing had been measuring a colour on a colour.
4. **The dictionary read through**, `25028e7`. `gen-review.js` rewritten, and
   the finding was about the page and not the words. `zh-review.html` had been
   rendering 223 of 1,728 interface strings since phase 3, while counting all of
   them in its own header. It carries 1,987 entries now. **The round trip is out
   and the part is still open** — section 5 item 2.
5. **Discovery**, `a90776c`. `robots.txt` and `sitemap.xml` as functions behind
   one constant, `llms.txt` written, and the static `robots.txt` deleted because
   Vercel matches the filesystem before it consults rewrites.
6. **The polish pass**, `9c1fa73`. `dialog.js` onto a native `<dialog>` and four
   modals built from it. Three copies of `runAction` made one, six tab strips
   given one keyboard, eleven inert rewrites removed, and decision 17 applied
   once in `admin-shell.js`.
7. **The status page**, `ce25419`, with `787e21a`, `0c9f219` and `1850997` after
   it. The largest part of the phase, and the only one building on both sides of
   the architecture. That is migration `037`, and `telegram-bot/probe.py` as a
   second process on the VPS. `/status` is rebuilt as a function rendering
   either the phase list or the service status page, from one derivation over
   `build-status.json`. **The switchover is not a task**: the last phase reading
   `shipped` turns the page over.
8. **The seam**, `37eecd1`. `seed.mjs`, the pass over the four READMEs,
   `setup.md` and the offline checklist. And **the flip that opened the site to
   search engines** after eleven phases closed to them.

**Six things from it that later phases inherit.**

- **A gap is data, and nothing is allowed to fill it in.** The probe writes
  nothing it could not measure, and the function creates no row for a day nobody
  probed. The page draws that day as unknown, with the legend naming it. A
  percentage never appears without the count it came from. Three files, one
  rule, and the phase file breaks all three on purpose to prove it.
- **A list somebody wrote is a list with something missing from it**, and what
  is missing is invisible by construction. It caught `gen-review.js` at 223 of
  1,728, and a probe measuring 26 colours and never a fill with a label on it.
  It also caught a migrations README that stopped at `033`. Every list this
  phase added is compared against the thing it is a list of, in both directions.
- **Arithmetic cannot say a token looks wrong.** Three of part 7's findings and
  two of part 3's came from looking at a rendered page beside the numbers.
  `tests/capture-themes.mjs` exists for that and is not a check.
- **Whether the site may be indexed is one constant**, `INDEXING` in
  `api/_lib/discovery.js`, and the header in `vercel.json` is its other half.
  They are checked against each other in both directions, so the half state
  cannot ship.
- **A page that is now an answer cannot be served cache first.** `/status` is
  the one entry in `NETWORK_FIRST_PAGES`. It would otherwise have shipped frozen
  at whenever a reader last updated their worker, on the one page people open
  when something is wrong.
- **The specification can be corrected, and it was, once.** Deviation 120: the
  probe's storage shape was costed at half a million rows, and rebuilt as a day
  and an outage. Sections 6, 11, 15 and 0c were reconciled instead of being left
  to drift.

**What it still owes**, all of it in section 5: part 4's round trip, part 2's
by-hand half, and the seed cleared. `--only=discovery-live` has been run against
the deployment carrying part 8 and reads 9 passed, 0 failed, 0 skipped.

## Phase 13, Docs site foundations. Shipped 3 September 2026, in seven parts.

**The first new directory since phase 11, and the first second Vercel project.**
It is the only phase so far whose subject was a second application and not a
feature. `docs.careers.globalfurry.tv` has its own functions and its own staff
sign in. It has a four tier role gate, two content pipelines and the first build
step in this repository. **It needed no schema of its own**, because `038`
carried its two tables. It added three migrations anyway: `039` for which site a
passkey was registered from, and `040` for the staff password resets. Both were
applied by hand before the code that reads them.

**The seven parts.** `5f8bd4a` the generated shared modules and the session,
`8358d95` the whole staff sign in, and `cfb9052` the tiers and both content
trees. Then `5ee87b2` the shell, `a4f86cf` with `45df60f` the two pipelines and
the twenty live checks, `eea38b4` account settings, and `1f978d2` the seam. Then
three after it: **`5270412`** the gftv.asia link, **`c2612c5`** the lift,
**`ea253ce`** the flip, and **`643c7dd`** the sign out fix. Parts 7a to 7e, with
no 7c: the numbering skipped one when the commits were rebuilt by hand.

**Its most dangerous problem was solved by generation.** Two Vercel roots cannot
import from each other. So fourteen `api/_lib` modules and ten `assets/js` files
are *written* into `docs-site/` by `gen-docs-lib.js`. `--check` fails on any
tree where a change landed in `main-site/` and stopped there. That is decision
1. What it actually bought is that a rule which no longer matches stops the
   generator. The check duplication needed was never "are these the same" but
   "is the difference still the intended one".

**The adapter between the two sites turned out to be a stylesheet.** One module
builds all nine settings panels, writes the portal's class names, and `docs.css`
defines the same names in the docs site's own language. Fourteen generated files
needed no transform rule at all.

**It went bilingual against its own plan.** Decision 5 settled "华文 in 14", and
part 6a overruled it five days later. `zh.json` came to 242 keys, and **175 of
them were already the portal's strings**. Revised by arithmetic and not by
argument, and it is the second edit this build has made to the specification.
`check-i18n.js` compares both sites now, which is what the part really bought.

**It was live and broken for two days and nobody knew either half.** Every push
had deployed the site since part 3 while this file said nothing was deployed.
And on that deployment every request to the content route answered 404:
`api/content/[...page].js` is a framework feature a bare `api/` project does not
have. Part 5 replaced it with a plain function addressed by a parameter. Check
110 now fails if anybody goes back to the shape that never worked.

**And it shipped the honest way round**: walk, lift, then flip. Section 5 item
24's sitting was done on 3 September, before `HELLO_WRITES_ENABLED` went `true`
and before the phase flipped. **It found four things no check in this repository
could have.** A missing Vercel variable had been answering 500 to every staff
account since part 6. A cross site link went into a catch all that answers 200.
A "sign out everywhere" did neither. And a fourth write reaching gftv.asia was
one the hold never covered. Item 24 is the account.

`tests/phase13-test.mjs` is **677 checks**, twenty seven of them against the
deployment, from 96 when part 5 introduced the file.

## Phase 14, Documentation. Shipped 11 September 2026, in ten parts and eleven letters.

**Eighty two pages across six guides, in English and 华文, and the two working
documents rendered beside them.** Portal 13, bot 8, translations 8, job poster
20, admin 14, developer 17. That is 16h's bullets counted, with three landing
pages and a test scripts page on top. Then the twenty one specification pages and the
nine memo pages, generated by two scripts at the repo root and committed as a
snapshot. **Every one of the 133 pages is in 华文**, paragraph for paragraph
with its English under `gen-review.js`. Section 16 put this phase second to
last so it would describe the thing and not the plan, and that was right.
Every page was written from the dictionaries, the routes and the comments,
never from the brief. Where the two disagreed the string won.

**The parts, and what the log calls them.** 1 `14dc190` the chrome. 2 `f095bad`
the portal guide with 2a's plain language pass. 3 `12ec9de` the bot and
translations guides with 2b's icons. 4 `7d82b02` the docs worker with 4a's
Mandarin name. 5 `04261b4` the poster guide and 5a `8e197c4`. 6 `0aa1f92` the
admin guide. 7 `61d9ce5` the developer guide. 8 `a84170a` the captures and
discovery files. 9 `c0be461` the 华文 and 9a `e86f53b` the sidebar. **Then
the log and this file part ways.** `cd2cfa9` to `102e6fe`, five commits named
10 to 10d, hold 7a's generators and spec pages, 10's `/docs`, and the seam.
`64b122c` "10e" holds 10e and 10f. `ab7139e` "10f" holds 10g. 10h is the
notice, `/language` and the flip, and the letter to type is the log's g.

**Two documents were rewritten to be published.** The brief and this memo
both passed under `check-copy.js` when their pages did. That is 1,403
sentences split and 346 banned phrases replaced in the brief, and 999 and 176
in this file. Both
moved into `reference/` and stopped being gitignored on 8 September, and the
move exposed that both generators had been gitignored too. A rewrapper that
refuses anything it would change put the memo back at eighty columns. It
found five more banned phrases the line-by-line check had never seen.

**It changed the portal and the bot more than a documentation phase should.**
Describing a screen is how you find what it does not say. A job
poster could open the settings and maintenance pages, deviation 130. Four
strings told a helper only an admin could publish their work, 131. The home
page promised offline support as unbuilt a week after phase 10 shipped it. The
docs site had no icon and no link card. A `/docs` pager lost a seat at each
end. `helper.lede` printed a dictionary key at a helper. And the bot gained
three things: `/docs`, `/language`, and the fourth notification kind. That
last is the one the portal sends on somebody's behalf, deferred three times
since phase 9.

**Three checks the phase leaves behind are the ones worth knowing.**
`commands.py --check` reads four documents, the 华文 guide's table among them.
`tests/phase12-test.mjs --only=zh` reads every generated page. The day the
phase flipped it found twenty one spaced Chinese mentions, a drifted word list
and a code span. And `gen-memo-pages.js --check` reports how far this
snapshot is behind the file without failing, because a snapshot is supposed
to lag. `tests/phase14-test.mjs` is **586 checks**, needing no credential,
database or network. `tests/phase13-test.mjs` is 3,979, twenty seven of them
live, and it takes over half an hour.

**What it did not do is the sitting.** Items 33, 34 and 35, phase 8's check
78, and the notice's first real send are all behind the authenticator app.
They are behind decision 27's seeded board too. Nothing in this phase gated its flip on them,
which is phase 11's order and not phase 13's, and it is written down as such.

## Phase 15, More languages. Shipped 12 September 2026, in three parts.

**The backbone for two languages that are not written, and the last two
things in the build.** Section 2 is the full record and stays as written,
since no phase follows to condense it into here. Part 1: a language is a
`locale_<code>` feature key and there is no other list. Malay and Tamil are
copies of the English, held off the site until an admin switches them on.
Part 2: every structured reply the bot sends is a rich message, built from
the same HTML strings, with the two fixes from 11 September. Part 3: the
official site banner on both shells, linking the trusted sites page. Then
the flip. **What it left**: switching a language on is section 8 item 5a, and
decision 27's sitting is owed as it was.

---
