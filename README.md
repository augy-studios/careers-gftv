# Careers@GFTV

The careers portal for Global Furry Television, served at
`careers.globalfurry.tv`. It is a clean public job board with a search and
filter listing, individual posting pages, and an authenticated application
flow, with a private admin dashboard behind it. Applications themselves are
collected in Google Forms: the portal's job is to gate access, hand the
applicant over, log the handoff, and track what happened next. It is a GFTV
HelloApp and follows the same conventions as the other GFTV PWAs.

**Phases 1 to 13 of 15 have shipped.** The database
schema and the shared server side code, then signing in, then the job board,
the postings themselves, applying to one, and the applicant's own account area.
The public surface is the home page, `/search` with its filters and
suggestions, `/jobs/{uuid}` for a posting in full, the `jobs.json` feed,
`/about`, `/faq`, `/status`, creating an account and signing in, applying and
tracking what happened next, and a placeholder page that every route belonging
to a later phase renders. Behind it, phases 7 and 8 are the staff side of
running the board — the overview, the tabbed per language editor, applicant
tracking, teams and tags, invites, the translation queue, and the maintenance
switches — and phase 9 is the machine side: the daily maintenance run and the
Google Forms submission webhook. Phase 10 is the offline half, which is what
makes this an installable PWA that stays useful with no connection, and phase 11
is the Telegram bot: linking, a sign in code and a one tap link, and the three
kinds of notification an applicant can switch off one at a time. **Phase 12 is
the sweep**: the responsive and accessibility passes, measured colours, the
Chinese round trip, `robots.txt`, `sitemap.xml` and `llms.txt`, a seed script,
and `/status` rebuilt as a service status page fed by a probe on the bot's VPS.
**Phase 13 is the documentation site** at `docs.careers.globalfurry.tv`, its own
Vercel project with its own staff sign in and the role gate that decides what a
reader is allowed to see. Of the two that remain, phase 14 is being built: the
guides themselves, for applicants, the Telegram bot, translation helpers and
staff. Live status:
[careers.globalfurry.tv/status](https://careers.globalfurry.tv/status).

**The portal is open to search engines from phase 12 part 8**, on 31 August
2026, having been closed to them since phase 1. It is one constant, `INDEXING`
in `main-site/api/_lib/discovery.js`, plus the absence of a global
`X-Robots-Tag` in `main-site/vercel.json`; the two are checked against each
other and move together. `main-site/README.md` has the whole of it under
"Discovery files".

`/jobs/{uuid}` is the one server rendered route in the portal, and deliberately
so: unfurlers read the markup as delivered and none of them run JavaScript, so
a posting's own title and description are injected into the document before it
is sent. Everything else stays a static page with a client side fetch.

The site is built and released in public, one phase at a time. `main` is always
deployable, and the interface is honest about what is not there yet: a control
for an unshipped feature stays visible and disabled with the reason on it,
and is never hidden.

Since phase 7 there is a second reason a control can be disabled, and the two
are never conflated. A feature that has shipped can be switched off temporarily
by an admin, for an outage or while something is being fixed, and it says so in
its own words instead of borrowing the phase sentence. Telling somebody a
feature they used last week "will be available in Phase 6" would be a lie about
a shipped feature, and it would make a real outage indistinguishable from an
unbuilt one.

**Phase 10 adds a third, and it does not borrow either one's machinery.** A
control that needs a connection is disabled offline with a sentence of its own,
because that claim is about the reader rather than about us: nothing is broken,
nothing is unbuilt, and it will work again in a moment.

## Directories

| Directory | What is in it |
|---|---|
| `main-site/` | The portal. Static HTML, CSS, and JavaScript with no build step, plus Vercel serverless functions in `main-site/api/`. This is the Vercel root directory for the portal project. |
| `migrations/` | Every numbered SQL file, run by hand in the Supabase SQL editor. Nothing automated applies these. |
| `telegram-bot/` | The `careersgftv_bot` Telegram bot, phase 11, all nine commands answering. Linking from either end, sign in codes and the one tap link, the outbox drain behind the three notification kinds, and the four list commands. Runs on a Debian VPS under tmux, deployed by pulling this repository and restarting the process by hand. **It has no scripted checks at all**, by deviation 91: a person walks the checklist in its README. |
| `docs-site/` | The documentation site for `docs.careers.globalfurry.tv`, four audiences behind one gate, being built in phase 13. Its own Vercel project on the same repo, so it cannot import anything from `main-site/`: what it shares is duplicated into it by `gen-docs-lib.js` and never edited in place. **It is the one directory with a build step**, `docs-site/scripts/build.js`, per 16e. |
| `apps-script/` | The Google Apps Script that each job's application form runs on submit, per section 13. Not deployed by anything: it is pasted into a form by hand. See [The application form webhook](#the-application-form-webhook). |
| `tests/` | Playwright checks, run by hand against a deployment. Not a CI suite: they need a staff credential and they write real rows. Phase 10's is the exception and needs neither, because a service worker cannot be checked by asking a deployment anything. |

Five READMEs, plus the one in `migrations/`, and no others. Each says what
lives in its directory and how to work with it.

| Where | What it covers |
|---|---|
| This file | The project, the directories, the current phase, running the migrations, and where the specification and environment variables live. |
| [`main-site/README.md`](main-site/README.md) | Local development, environment variables, the two auth realms, the API route map, the Vercel settings, and the offline test checklist. |
| [`migrations/README.md`](migrations/README.md) | Every migration file in order, how to run them, and the rule about never editing an applied file. |
| [`telegram-bot/README.md`](telegram-bot/README.md) | What the bot does, the nine commands, running it under tmux, its environment variables, and **the by-hand checklist that stands in for the test file it does not have**. |
| [`docs-site/README.md`](docs-site/README.md) | What the docs site covers, adding a page, previewing, and the screenshot capture. |
| [`tests/README.md`](tests/README.md) | Running the Playwright checks, what a run writes, what it cannot check, and how to write a new phase's. |

## Working references, not in this repository

Four files sit at the repo root on the maintainer's machine and are
deliberately gitignored. If you have cloned this repository you will not find
them, and nothing in the build depends on reading them at runtime. They are
listed here because the source comments refer to them by name.

- **`careers-gftv-spec.md`** is the brief for the whole project and the
  reference for every phase. Where this README and the specification disagree,
  the specification wins.
- **`gftv-theme.md`** is the GFTV theme system shared across the GFTV apps: the
  two axis colour theme and mode model, the token contract, the palette, and
  the WCAG audit. It is implemented in full in
  [`main-site/assets/css/theme.css`](main-site/assets/css/theme.css), which is
  committed, so the theme itself is readable here even though its
  specification is not.
- **`gftv-official.md`** specifies the official site banner that replaces the
  build notice once every phase has shipped: a permanent, collapsible bar
  stating that this is an official GFTV site and teaching a reader how to check
  that themselves. Portable across GFTV projects, like the theme file.
- **`next-steps.md`** is the working memo alongside the specification,
  rewritten at the start and end of every phase.

The theme, the palette, and the accessibility rules are all visible in
`theme.css` and in the comments at the top of it. That file is the practical
reference for anyone working on this repository.

## Running the migrations

All the DDL is numbered SQL files in `migrations/`, run by hand by pasting each
one into the Supabase SQL editor on the existing GFTV project. There is no CLI,
no automated runner, and no migration framework.

1. Open the Supabase dashboard, then the SQL editor. Use the existing GFTV
   project. Do not create a new project and do not create a new schema:
   everything goes in `public`, alongside the `gftvhello_*` tables.
2. Run each file in numeric order, starting at
   `001_extensions_and_migration_log.sql`. Do not skip and do not reorder.
3. Check what has been applied at any point with
   `select filename, applied_at from gftvjobs_migrations order by filename;`

Two rules that matter more than the rest:

- **Never edit a file that has already been run, and never renumber.** A change
  becomes a new numbered file. This holds during the build too, since
  production is live from phase 3.
- The full set from phase 1 is run on day one, so the database runs ahead of
  the interface. That is deliberate. A feature switching on in a later phase
  needs no new SQL.

Full details, including what each file does, are in
[`migrations/README.md`](migrations/README.md).

## Database

Everything runs in the existing GFTV Supabase project, in the `public` schema.
Access is server side only, from the Vercel functions, using the service role
key. Supabase Auth is not used anywhere. The browser never talks to Supabase
directly and never receives an anon key.

Every new `gftvjobs_*` table has row level security enabled with no policies.
The service role bypasses RLS, so the portal keeps working while anything
holding an anon key gets nothing. That matters because this project is shared
with other GFTV apps.

The existing `gftvhello_*` tables belong to the gftv.asia portal. They are
referenced by foreign key and never created, altered, or dropped from here, and
nothing is written to them beyond the challenge, trusted device, and backup
code rows the login flow legitimately owns. **The staff session row was a
fourth of those until migration `038`**, which moved the portal's staff
sessions into `gftvjobs_staff_sessions`: one table serving two sites meant each
could end the other's sessions, and 5h had already given the docs site its own
for that reason. The accounts stay shared.

## Environment variables

Every variable is documented in [`main-site/.env.example`](main-site/.env.example)
with a comment saying exactly where to get it, and the docs site and the bot
each have their own: [`docs-site/.env.example`](docs-site/.env.example) and
[`telegram-bot/.env.example`](telegram-bot/.env.example). Real values live in
`.env.local` and in the Vercel project settings, both gitignored.

**Each Vercel project reads only the variables set on itself.** Setting a value
on the portal's project sets it on the portal's project, so the docs project's
four are entered again there. The "Used by" column below says which of the three
wants each one.

| Variable | Used by | Where it comes from |
|---|---|---|
| `SUPABASE_URL` | site, docs, bot | Supabase dashboard, Project Settings, Data API, Project URL. The same project for all three: the docs site signs in the same accounts the portal does. |
| `SUPABASE_SERVICE_KEY` | site, docs, bot | Supabase dashboard, Project Settings, API Keys, `service_role`. Treat it like a database password. |
| `SITE_URL` | site, docs, bot | The portal's own origin, no trailing slash. **On the docs project it is still the portal**, per 5e: it is the WebAuthn relying party id, and pointing it at the docs site breaks every passkey registered on the portal. |
| `DOCS_URL` | docs | The documentation site's own origin, no trailing slash. It scopes that site's cookies and is the origin a passkey response is checked against. |
| `FORM_WEBHOOK_SECRET` | site | Generate with `openssl rand -hex 32`. |
| `CRON_SECRET` | site | Generate with `openssl rand -hex 32`. |
| `TELEGRAM_BOT_USERNAME` | site | **Optional.** The bot the linking deep link and QR point at, without the `@`. Defaults to `careersgftv_bot`, which section 15 fixes. Set it only to point a preview deployment at a test bot. Public: it is in the link itself. |
| `TELEGRAM_BOT_TOKEN` | bot | BotFather, `/mybots`, select the bot, API Token. |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | bot | my.telegram.org, API development tools. |
| `DONATION_URL` | bot | Shown as a button on the start message. |
| `LOG_LEVEL` | bot | **Optional.** `DEBUG`, `INFO`, `WARNING` or `ERROR`, defaulting to `INFO`. The bot has no scripted checks at all, so its log is the account of what happened: `DEBUG` is what to reach for while walking the checklist, and not what to leave it on. |

**Rotating `FORM_WEBHOOK_SECRET`** takes a coordinated change, because it lives
in two places. Generate the new value, set it in the Vercel project settings and
redeploy, then update `PORTAL_SECRET` in the Script Properties of every form's
Apps Script. Submissions arriving between the two steps are rejected with a 401
and are not retried usefully, so do it when nothing is being submitted, and
confirm afterwards that a test submission lands in
`gftvjobs_form_submissions`. Running `testCareersWebhook` from one form's Apps
Script editor is the quickest confirmation; it is described below.

**`CRON_SECRET` is set in the Vercel project settings and nowhere else.** Vercel
sends it as the `Authorization` bearer token on every scheduled invocation, and
it sends nothing at all when the variable is unset — which is why
`api/cron/daily.js` refuses a request that carries no secret rather than
treating an absent header as "this must be the scheduler". Rotating it needs no
coordination: change it in the project settings and redeploy.

## Deployment

Two Vercel projects, one repository.

| Project | Root directory | Domain | From phase |
|---|---|---|---|
| Portal | `main-site` | `careers.globalfurry.tv` | 1 |
| Documentation | `docs-site` | `docs.careers.globalfurry.tv` | 13 |

**The portal has no build step and the docs site has one**, which is section
16e's stated exception and nothing wider: hand maintaining a shared sidebar and
header across thirty documentation files is how documentation rots. The docs
project's settings come from its own `vercel.json` — Build Command
`node scripts/build.js`, Output Directory `dist` — so only what that script wrote
is served, and the markdown it was built from is not. Both projects install their
own `package.json` so their functions have their dependencies.

To point `careers.globalfurry.tv` at the portal project: add it as a domain in
the Vercel project settings, then add the CNAME Vercel gives you at the DNS
provider for `globalfurry.tv`. Vercel issues the certificate once the record
resolves.

The bot is not on Vercel. It runs on a Debian VPS under tmux, from this same
repository.

## The daily maintenance run

`main-site/api/cron/daily.js`, scheduled by the `crons` entry in
`main-site/vercel.json` for 18:00 UTC, which is 02:00 the next morning in
Singapore. Vercel fires within roughly an hour of that, so nothing depends on
the exact minute. It does four things, each independent of the others:

1. Closes published postings whose closing date has passed, and writes an audit
   row for each. **A posting with no closing date is skipped and never
   auto-closes** — open until filled is a real state.
2. Gives up on apply prompts nobody answered after fourteen days, recording the
   source as a timeout rather than as a No.
3. Deletes expired sessions, trusted devices, password resets, Telegram tokens,
   passkey and login challenges, staff 2FA challenges, and spent rate limit
   windows.
4. Checks each published posting's application form and flags the ones that are
   deleted, private, or no longer accepting responses. It never unpublishes
   anything.

**Where it reports.** Every run writes a row to `gftvjobs_cron_runs`, opened
before any work and closed after it, and the most recent one is drawn on the
admin overview at `/admin`. That panel is the only thing that makes a broken
schedule visible: nobody is watching a cron run, so a run that stops firing is
otherwise silent. It distinguishes a run that succeeded, one that failed, one
that started and never finished, one that was switched off from
`/admin/maintenance`, and a last run too old for a daily schedule.

To run it by hand against production:

```bash
curl -sS -X POST https://careers.globalfurry.tv/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

It is safe to run twice. Every step matches nothing the second time, and the
audit rows are written from what actually changed rather than from what was
attempted, so a second run in a row writes none.

## The application form webhook

Section 13. Each job's Google Form runs a small Apps Script that posts to
`/api/webhooks/form-submit` when somebody submits it, which is what turns
"did you apply?" from a self reported claim into a recorded fact. The script is
[`apps-script/careers-form-webhook.gs`](apps-script/careers-form-webhook.gs).

Only the response id, the respondent's email, and the timestamp are sent. The
answers stay in Google.

**Set up a template form once.** Container bound scripts travel with a form
copy, so putting the script in a template means every posting after the first
skips the pasting step. Triggers do not travel, which is why every copy still
needs `installCareersTrigger` run once.

1. Create the template form. Turn on **Collect email addresses** in its
   settings, or give it a question titled exactly `Email` — the script looks for
   the first and falls back to the second, and a form with neither can never be
   matched to an account.
2. Extensions, then Apps Script. Paste in
   `apps-script/careers-form-webhook.gs` and save.
3. Project Settings, Script Properties. Add `PORTAL_SECRET` with the value of
   `FORM_WEBHOOK_SECRET`. Leave `JOB_ID` for the copy.

**Per new posting, about two minutes.**

1. Copy the template form and edit its questions.
2. Create or open the posting in `/admin/jobs`, paste the form's address into
   the Google Form URL field, and copy the posting id from the help text beside
   it.
3. In the copied form: Project Settings, Script Properties, set `JOB_ID` to that
   posting id. Confirm `PORTAL_SECRET` came across with the copy.
4. Run `installCareersTrigger` once from the Apps Script editor and authorise
   it. Google will warn that the script is unverified; it is your own script on
   your own form.
5. Run `testCareersWebhook` once. It sends a delivery with a fake response id
   and an address that matches nobody, so it proves the secret and the URL are
   right and lands harmlessly in the unmatched list. A `200` in the execution
   log means the setup is correct.

**If the webhook is never installed on a form, nothing breaks.** That posting
falls back to the applicant's own yes or no answer, and the analytics page's
standing caveat already says a conversion rate is the lowest the truth can be.

**Unmatched submissions** are on `/admin/analytics`, admins only, because every
row is a real person's email address and the rest of that page deliberately
names nobody. The ordinary cause is somebody applying with a different address
than they registered with, and linking one there records their application as
submitted.

## House style in the copy

One rule so far, and it applies to **every English string a reader can see** —
the interface dictionary, the pages, the phase list on `/status`, `llms.txt`,
and the Telegram bot, which means every string in its Python and the About and
Description on its profile. Source comments, the READMEs and the migrations
are not copy and are left alone.

**Do not write "rather than".** Use `instead of`, `in place of`, `as opposed
to`, `over`, `in preference to`, `without`, or `and not`, whichever fits the
sentence. Settled 1 September 2026, and it is a rule about copy in place of a
note in a document because `node check-copy.js` is what makes it survive the
person who remembers it. Run it before pushing; `--list` prints what it reads.

## Scripts at the repo root

Eight, all plain `node`, none of them part of a build. The four checkers are
the ones to run before pushing. The one script that *is* a build is not here:
[`docs-site/scripts/build.js`](docs-site/scripts/build.js) belongs to that
project and is documented in its own README.

| Script | What it does |
|---|---|
| `check-i18n.js` | Every `t()` key in the source against both dictionaries. Reports missing keys, unused ones, and the sixty built at runtime that it cannot resolve. **Run it before shipping**: a missing key renders as the raw key. |
| `check-copy.js` | Every English string a reader can see, against the house style above. Reads the dictionary, the pages with their comments stripped out, the phase list, `llms.txt`, every quoted string in the bot's Python and its About and Description text — 3,536 strings today — and exits non-zero on a banned phrase, naming the key and the sentence around it. `--list` prints what it reads and what is banned. |
| `check-precache.js` | Every entry in `sw.js`'s precache list resolved the way `cleanUrls` does, and non-zero on one that is not on disk. The precache list is the most dangerous object in the site: a bad entry costs one file at runtime and this is what stops it reaching production at all. |
| `gen-docs-lib.js` | The docs site's copies of the portal's shared modules, written from `main-site/api/_lib/` and `api/auth/staff/`. Vercel builds each project from its own root and cannot reach outside it, so 5h says duplicate them and keep the two copies identical; this is what makes that true rather than remembered. Every place the two sites genuinely differ is a rule in the file with its reason beside it, and a rule whose text no longer appears stops the run instead of quietly dropping the difference. `node gen-docs-lib.js --check` fails on a stale copy and **belongs beside the other three before a push**: a change to `main-site/api/_lib/` is half a change until this has run. Since part 6 it covers `assets/js/` too, so a change to `api.js`, `danger-confirm.js` or the account page is half a change as well. |
| `gen-icons.js` | Every icon under `main-site/`, from `HLC-source.png` at this level. The source is deliberately not one of the outputs. See [`main-site/README.md`](main-site/README.md). |
| `gen-screenshots.js` | The two install screenshots in the manifest, captured from `/search` on the deployment. Rerun after clearing the seed. |
| `seed.mjs` | Section 17's seed script, phase 12 part 8. Sample postings, one ready Chinese translation, and two sample accounts for the docs screenshots, all marked SAMPLE and all removable again. `node seed.mjs` says what it would do and writes nothing; `--yes` does it; `--clear --yes` removes it **and the phase 3 dev seed with it**. There is one database, so it refuses to write while `INDEXING` is true rather than putting a sample posting where a crawler can find it. |
| `gen-review.js` | `zh-review.html`, every Chinese string in the build side by side with its English, for a fluent reader to go through: the dictionary, the seeded departments and tags, the hero, the phase list and its shipped notes, and the Telegram bot's messages, command menu and profile text. It also reports any file that ships 华文 and is neither one of its sources nor exempt with a reason, and exits non-zero on one, so the next file that puts Chinese in front of a reader cannot quietly miss the round trip. Reads the bot's strings by importing `strings.py` and `commands.py` rather than parsing them, so it needs Python on the path. |

## Regression testing

There is no CI suite and no test database. What there is: Playwright scripts in
[`tests/`](tests/), run by hand against a deployment, one file per phase.

```sh
npm install
npx playwright install chromium

STAFF_USER=yourname STAFF_PASS='...' node tests/phase7-test.mjs
STAFF_USER=yourname STAFF_PASS='...' node tests/phase7-test.mjs --only=editor

# Phase 10 is the exception: no deployment, no credentials, no network.
node tests/phase10-test.mjs

# Phase 12's public sections need nothing either, and it is read only even
# with a credential: it navigates and measures, and writes no rows at all.
# PATCH_ASSETS=1 serves the working tree's stylesheets, scripts and pages so a
# fix can be proved before it is pushed.
node tests/phase12-test.mjs --only=responsive,landscape,a11y,a11y-keyboard
PATCH_ASSETS=1 STAFF_USER=... STAFF_PASS='...' node tests/phase12-test.mjs

# Its two account sections skip until an applicant exists. This makes one and
# gives it something to be a list of, which is the point: an empty dashboard
# passes every accessibility rule there is.
APPLICANT_USER=... APPLICANT_PASS='...' APPLICANT_EMAIL=... node tests/create-applicant.mjs
```

Three things to know before the first run, all of which
[`tests/README.md`](tests/README.md) covers properly:

- **They sign in as a real staff account and write real rows.** Postings,
  applications, tasks, tags. Everything they make is prefixed `SMOKE P7` and
  deleted at the end, and anything the ten an hour deletion budget cannot reach
  is unpublished and listed so it can be removed afterwards.
- **Point them at a preview deployment where there is one**, with `BASE=`.
  Production is only the default because usually there is not one.
- **A clean run is not full coverage.** Anything needing SQL, a second staff
  account, a redeploy, a real Google Form, or a person on a keyboard is skipped
  not silently passed, and the count at the end says how many.

**The bot has none of this.** `tests/phase11-test.mjs` is the site half of that
phase and nothing else; the Python on the VPS is checked by a person walking
[the checklist in `telegram-bot/README.md`](telegram-bot/README.md#the-by-hand-checklist),
which was settled as deviation 91 rather than arrived at by omission.

Alongside them are three small debug scripts, each the shortest way to reproduce
one specific failure. They are kept as much for the shape as for the bug.

## Stack

- Frontend: vanilla HTML, CSS, and JavaScript. No frameworks, no build step.
- Backend: Vercel serverless functions, Node 20 or later, under `main-site/api/`.
- Database: Supabase Postgres, service role access from the functions only.
- Passwords: bcrypt, matching the hash format already stored in
  `gftvhello_users` so existing accounts keep working.
- Languages: English and Simplified Chinese, one shown at a time. The choice
  lives in `localStorage` and is not in the URL. Interface strings are in
  `main-site/assets/i18n/`, content carries `_zh` columns.
- Bot: Telethon, Python, with SQLite for bot local state only.
