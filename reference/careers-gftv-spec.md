# Careers@GFTV: build specification

This file is the brief for the whole project. It lives at the repo root, it is committed, and it is the reference for every phase of the build. `next-steps.md` is the working memo alongside it and is gitignored.

Re-read the sections relevant to the current phase at the start of that phase. Do not work from memory of an earlier read. This file is long and the details in it are load bearing, particularly the schema in section 6 and the auth rules in section 5.

Where this file and anything else disagree, prompt me with the options instead of picking one yourself.

## 0. Read these first, before writing any code

1. Read `gftv-theme.md` in the repo root and apply that theme to every page you build. Do not invent new colours, fonts, or component styles.
0. Read this whole file first, start to finish, before anything else.
2. Read the root `index.html` and use its `<head>` tag as the template for the `<head>` of every other HTML file in this repo. Keep meta tags, font links, theme initialisation script, and manifest links consistent with it.
3. If either file is missing, stop and tell me before continuing.

Do not start scaffolding until both files have been read, and until you have read this specification in full.

## 0b. Phasing and the next-steps file

Do not build this in one pass. Work through it in the phases below, in order, and stop at the end of each one.

### The next-steps file

Before starting each phase, write `next-steps.md` at the repo root. Add it to `.gitignore` in the very first phase, since it is a working memo and not part of the deliverable. Keep one file and rewrite it each time instead of starting a new one.

Every version contains four parts:

1. **Done so far.** A short list of completed phases with what each one actually produced, so the file carries its own history and nothing is lost between sessions.
2. **This phase.** What is about to be built, and the specific files that will be created or changed.
3. **Needs clarification.** Anything ambiguous, contradictory, or missing from this brief. If an item blocks the phase, stop before writing code and prompt me with the interactive question tool, offering concrete options to pick from. Do not write open ended questions into the chat and wait. If an item does not block the phase, record the assumption you are making and carry on.

   The same applies any time you need a decision from me, mid phase or otherwise: prompt me with options instead of asking in chat. Where a real recommendation exists, say which option you would choose and why in one line, then let me pick.
4. **How to verify.** What I should click, run, or query to confirm the phase works before you move on.

At the end of a phase, update the file so "This phase" moves into "Done so far", with any deviations noted. Update any README the phase invalidated, per section 2. Flip the shipped phase in `build-status.json`, per section 0c. Then write the next phase's version. If a phase turns out larger than expected, split it and say so in the file instead of half finishing it.

### Phases

1. **Foundations.** Repo scaffold per section 2. The build status mechanism in 0c, including `build-status.json`, the notice bar, the disabled control pattern, the placeholder route, and `/status`. `.gitignore` including `next-steps.md`, and both `.env.example` files. The full `migrations/` set, covering every table, index, extension, trigger, and RPC function. The Supabase client helper, the shared session helpers, and the `vercel.json` rewrites and headers. Also the multilingual foundation per 3a: the language switcher, the `assets/i18n` dictionaries, the locale module, and the CJK typography. Nothing user facing beyond the shell, `/status`, and the placeholder.
2. **Authentication.** Staff login with TOTP, backup codes, and trusted devices against the existing tables. Applicant registration and login. Recovery codes, both sets. Forgot password. Session length and trusted device handling for both realms, per 5d. Writing the applicant's language choice to their account, per 3a. Telegram 2FA is deliberately deferred: build the endpoints and the settings UI shell here. The delivery half cannot work until the bot ships, so leave the toggle disabled with a note instead of faking it.
3. **Browsing roles.** Home, and `/search` as the single browse surface with full text search, filters, tags, quick chips, and suggestions. Also the about and FAQ static pages. Search resolves per language, with the trigram path for languages Postgres cannot tokenise, per 3a.
4. **Job postings.** `/jobs/{uuid}` with the visibility rules and the logged out gate. It is served by a function that renders the meta tags, JSON-LD, and link embed server side, per section 4. The `jobs.json` feed. Language aware rendering with the untranslated notice, and the translation report control from 7h.
5. **Apply flow.** The start endpoint with prefill, the handoff modal in all three sections, analytics logging, ratings, the pending prompt resumption, and the reapply cooldown. Honours a language specific application form where a posting has one.
6. **Applicant dashboard.** My applications, saved jobs, outstanding tasks, and account settings including the three step danger zone.
7. **Admin core.** The overview, job postings with the tabbed per language editor and the sections builder, applicant tracking, departments, and tags. The access check applied on every route. No documentation area is built here: the staff manual lives on the docs site and arrives in phases 13 and 14, per 8a. What this phase owes it is the `/admin/docs` redirect and the sidebar link out.

   **Both halves of the question sets in 7g belong to this phase**, the composer in 8.3 and the renderer on `/account/tasks`. That is so even though the second sits on a page phase 6 built. Phase 6 shipped the tasks page with a plain reply box, which is the whole of what it could test. There is no way to raise a task until applicant tracking exists. A question renderer built there would have been unreachable code, checked by inserting rows by hand. Build the two together, in the order the data flows, and treat the page as this phase's to extend.

   The posting side comes with it. That is `task_questions` on the posting, the auto-raise when somebody applies, and the marker in the postings list showing which roles carry a set. The auto-raise hangs off the same place the tracking row is written in 7a. So it is one more step in a request that already exists, and not anything scheduled.

   **Also the maintenance page in 8.12**, ahead of the rest of the settings in 8.10. That gives a lever for turning a broken feature off before phases 8 to 11 add the most surface. It needs the shared server side guard as well as the page: a switch that only greys out buttons is not one.
8. **Admin operations.** Analytics, invites and shortlists, admin users, applicant users, settings, and the translations queue in 8.11 with its needs-translation audit.
9. **Automation.** The daily cron and the Apps Script webhook endpoint, plus the Apps Script itself and its setup notes.
10. **Offline.** Service worker, caching strategies, IndexedDB stores, the action queue, and the install manifest. Every language dictionary is precached, per section 14.
11. **Telegram bot.** The `telegram-bot` directory, the nine commands, linking, login codes and magic links, and the notification outbox drain. It writes to each applicant in the language stored on their account. Finish wiring the Telegram 2FA left disabled in phase 2, and enable it once the bot can actually deliver.
12. **Polish.** A WCAG AA pass across every theme, mode, and language. The full responsive check in section 3, at every listed width, on both sites. A read through of every dictionary by someone who reads that language. The portal's `sitemap.xml`, `robots.txt`, and `llms.txt`, per section 4. A seed script, a final pass over the four READMEs and `setup.md`, and the offline test checklist.

    **Also the service status page in 0c.** It is the one part of the build status mechanism that outlives the build: `/status` stops listing phases and starts answering whether things are working. It needs the status history tables in section 6, the probe loop on the VPS per section 15, and the rebuilt page. Build it here, but **switch it over only once every phase is `shipped`**. The two versions must never be on screen together. A page listing both what is unbuilt and what is degraded gives a reader two reasons a thing might not work. It gives them no way to tell the two apart.
13. **Docs site foundations.** The `docs-site` directory per section 16, up to but not including the guide content. That is its own `api/`, and the staff login with passkeys, TOTP, and backup codes. Also the role gate that decides what a reader is allowed to see. Then the shared staff account settings suite and its danger zone per 5f, and staff account recovery codes per 5g. And the two content pipelines, public static and gated authenticated. Ship it with enough placeholder pages to prove the gate works and nothing more.
14. **Documentation.** The content itself, per 16h. That is both public guides in every shipped language, the public translation helper page, and the job poster guide. Then the admin guide that section 8a used to hold, and the developer guide. Plus the docs site's own `sitemap.xml`, `robots.txt`, and `llms.txt`, the Playwright screenshot capture script, and a first capture run against seeded data.
15. **More languages.** Malay and Tamil. No database change is needed, per 3a: a language is a row in `gftvjobs_locales`, a dictionary file, and the content itself. Listed last because it depends on finding people to write and check it, not because it is technically hard.

Documentation sits this late for a reason. Documentation written from a specification documents the plan, and documentation written from a finished build documents the product.

Phases 13 and 14 were one phase until the docs site gained a staff login and four separate audiences. Building an authentication realm and writing four guides in one pass is the "phase turned out larger than expected" case this section already covers. So it is split instead of half finished, and "More languages" moves from 14 to 15. Nothing had shipped past 12 when that happened, so the renumbering costs one edit to `build-status.json` and nothing else. Do not renumber a phase that has already shipped.

Phases 1 and 2 are the ones worth slowing down on. Everything else depends on the schema and the session handling being right, and reworking those later means touching every phase that came after.

The list grew from eleven to fourteen during phase 1, and to fifteen when the docs site gained a staff login. The reasoning is worth keeping. Multilingual content, server rendered postings, and the translation review loop were added after the original phasing, and two phases became too large to ship whole. The first is the public site, which now carries language aware rendering and a server rendered detail route. The second is the admin dashboard, which gained an eleventh section, a tabbed per language editor, and a dynamic sections builder. Splitting them is the rule in this section applied to itself. The fourteenth phase is new work and not a split.

## 0c. Shipping in public

Each phase gets pushed to GitHub and deployed to production as it finishes. The site is live and usable from phase 3 onward while later phases are still unbuilt. So the interface has to be honest about what is not there yet.

### Rules for shipping mid build

- `main` is always deployable. A phase lands as a branch merged when it works, never as a half finished commit on `main`.
- The full migration set from phase 1 is run on day one, so the database runs ahead of the interface. That is deliberate. It means a feature switching on in a later phase needs no new SQL.
- Never ship a control that calls an endpoint that does not exist yet. Unbuilt features are shown in the disabled state described below, and the click handler does nothing but explain.

### Build status source of truth

- One file, `main-site/assets/build-status.json`, holding the phase list. Each entry has a number, a short name, a status of `shipped`, `building`, or `planned`, and a plain description. Alongside it, a map of feature keys to phase numbers, for example `saved_jobs: 6`, `telegram_2fa: 11`, `offline: 10`.
- Everything else reads from that file. Flipping a phase to `shipped` is the only edit needed when it goes live, and no copy anywhere hardcodes a phase number.
- The Telegram bot and the docs site read the same file, so the three stay in step.

### How it appears

- **Site wide notice.** A slim, dismissible bar at the top reading that Careers@GFTV is being built and released in phases, with a link to the status page. Dismissal is remembered locally and resets when a phase ships. Keep it quiet, one line, no colour shouting.
- **Disabled controls.** Any control for a feature that has not shipped stays visible and disabled, and is never hidden. The reason goes on it: "Will be available in Phase 5. Sorry for the inconvenience caused." Use that wording exactly, with the phase number pulled from the feature map. Hiding it teaches people the feature does not exist; showing it disabled tells them it is coming.

### Maintenance switches

A second reason a control can be disabled, added 21 August 2026 and built in phase 7, per 8.12. A feature that has shipped can break, or need taking down while something is fixed. Until now the only lever for that was a deploy.

- **An admin can flip any shipped feature off temporarily.** It goes back on the same way. This is not a phase change and it never edits `build-status.json`. That file is the record of what has been built, and an override is the record of what is working right now. Conflating the two would make a deploy silently undo an outage response.
- **The override lives in the database**, in `gftvjobs_settings`, because an admin cannot edit a file in the repo from a dashboard. The phase list stays a static file read by all three consumers; the override is read alongside it and merged at the point of use.
- **"Off" means off, including the API.** Every route behind a flipped feature answers 503 with the same sentence. A disabled button stops nobody who has the endpoint, a stale tab, or a queued offline action from phase 10. And if a feature is off because it is broken, then the endpoint is the broken thing.
- **It gets its own sentence, not the phase one.** "Temporarily unavailable while we fix something", plus whatever note the admin wrote, which is optional and is shown to the public as typed. Telling somebody a feature they used last week "will be available in Phase 6" is a lie about a shipped feature. It also makes a real outage indistinguishable from an unbuilt one.
- **Some features can never be flipped.** They are held in a fixed denylist in code, and never as a setting. That covers signing in and registration in both realms, and anything the maintenance page itself depends on. Flipping sign in off locks every applicant out with no way back and can lock the admin out of the page that would undo it. The page shows those switches as permanently unavailable and says why, instead of hiding them.
- **The status page says so.** A feature that is off appears on `/status` as currently unavailable with its note. That page is already where somebody goes to find out what is going on.
- **Unbuilt routes.** A route belonging to a later phase renders a placeholder page in the normal layout. It carries the same sentence, a line on what that phase covers, and links to the status page and to `/search`. Never a 404, never a blank page, and mark these `noindex`.
- **Status page at `/status`.** Public, linked from the footer and the notice bar. Lists every phase with its status and description, marks the current one, and states plainly that dates are not promised. It doubles as the changelog: when a phase ships, its entry gains a short line about what became available.
- **Admin dashboard.** Same treatment. A staff member clicking an unbuilt section gets the same message instead of an empty screen.
- **Telegram bot.** A command whose backing feature has not shipped replies with the same sentence, instead of failing or going quiet.
- **Docs site.** Any page documenting an unshipped feature carries a note callout at the top with the same sentence. So the documentation can be written ahead of the build without misleading anyone.

### Retiring it

When every phase is `shipped`, remove the notice bar and the placeholder route handling. Leave `build-status.json` in place, since the same mechanism will be useful for whatever comes after, and keep the shipped notes on it as the changelog.

**`/status` is repurposed and not retired**, and this is the one part of the build status mechanism that outlives the build. Once nothing is unbuilt, the question the page answers changes. It goes from "what is not here yet" to "is it working right now". That is the question people actually arrive at a status page with. Added 26 August 2026, and specified in full below.

### The service status page, after the build

Modelled on how Atlassian's status pages read: a headline state, a component list, uptime history, and past incidents. Public, unauthenticated, still linked from the footer.

**The one rule everything else here follows: the page never claims to know more than it does.** A status page that says "all systems operational" because it could not reach anything is worse than no page. That is the specific failure mode this section exists to prevent. Every panel below distinguishes three states, not two: working, not working, and no answer.

#### Four panels

1. **The headline.** One sentence and one colour: everything is working, something is degraded, or something is down. Derived, never typed by hand, so it cannot disagree with the panels beneath it.

2. **Components, live.** Every flippable feature from the feature map, drawn from the same `feature_overrides` the maintenance switches write, through the existing `api/public/feature-status`. A feature switched off shows as unavailable with the admin's note, exactly as it does mid build. The denylisted features are listed too, and always as available. They cannot be switched off, and omitting them would make the list look shorter than the site.

3. **Uptime, ninety days.** A bar per component, one segment per day, from real probe data and not from anything the portal says about itself. See the probe below.

4. **Incidents.** Two sources, labelled differently, because they are different claims:
   - **Declared.** An admin flipped a feature off and on again. The start, the end, the note, and the duration, all derivable from the `FEATURE_DISABLED` and `FEATURE_ENABLED` audit rows that already exist. 8.12 logs both directions for exactly this reason: an outage nobody recorded the end of is one nobody can measure.
   - **Observed.** The probe could not reach something, with nobody declaring anything. These are the ones worth having, because they are the outages nobody was awake for.

#### The probe, and why it is not on Vercel

**A status page hosted on the thing it monitors is useless during the outage it exists to report.** That is the whole reason Statuspage is a separate service, and it is not a problem that can be solved by being careful.

So the probe runs on the Debian VPS that already hosts the Telegram bot, per section 15. That machine is the only component in this architecture genuinely outside Vercel. It already runs continuously, it already holds `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, and it is already in this repository. It is a loop in a process that exists, and not a new service.

- **Every sixty seconds**, request a small fixed set of public endpoints. Record the status code and the response time for each: `/api/public/feature-status`, `/search`, one seeded posting page, and `/api/public/jobs.json`. Public and read only, all four, so the probe never writes anything to the portal and never needs a credential to it.
- **Write to `gftvjobs_status_days` and `gftvjobs_status_incidents`**, which are new tables. Write direct from the VPS with the service key, through the one function that owns them. Not through an endpoint on the portal, since an endpoint on the portal is unreachable in exactly the case that matters.
- **Keep ninety days.** The daily cron in section 11 sweeps beyond that, alongside everything else it deletes.
- **A probe that cannot reach Supabase writes nothing and says nothing.** It does not retry into a backlog and it does not buffer locally. A gap in the data is an honest gap, and the page draws it as "no data" and never as either state.
- **The bot is not the monitor.** It does not message anybody about a failed probe. Alerting is a separate decision with a separate on-call story attached, and it is out of scope here. What this buys is a page somebody can look at, which is what was asked for.

#### What the page must not do

- **Never show a green day it did not measure.** A day with no probe data is drawn as unknown, in a neutral colour, and the legend names that state.
- **Never compute a headline uptime percentage across a period with gaps** without saying what the coverage was. "99.9% over 90 days" from 60 days of data is a fabrication with a decimal point on it.
- **Never report on the docs site or the Telegram bot from this page** unless they are probed too. A component list that quietly covers only the portal, while looking like it covers the project, is the same lie in a different shape.
- **Keep it readable with no JavaScript and no session**, and cache it briefly at the edge. It is the page people load when things are going wrong, and it should be the cheapest page on the site.

#### When

The probe, the table, and the rebuilt page belong to **phase 12**. They sit alongside the other things that only make sense once the build is finished. The switchover itself is dropping the phase list from the page. It is gated on every phase being `shipped`, so the two halves can be built and then turned over, and never raced.

Until then `/status` keeps its current job. The two must not be shown at once. A page listing both what is unbuilt and what is degraded gives a reader two different reasons a thing might not work. It gives them no way to tell which they are looking at. That is the same confusion the maintenance switches got their own sentence to avoid.

**The notice bar is replaced and not simply removed.** The official site banner in `gftv-official.md` takes the same slot at the top of every page. It is a slim, permanent, collapsible bar. It states that this is an official Global Furry Television site, and teaches a reader how to check that themselves. It is modelled on the Singapore Government masthead.

The two must never both be present. One is temporary and dismissible, the other is permanent and is not, and two stacked bars above the header is worse than either alone.

That file is portable across GFTV projects and holds the full specification. That is behaviour, markup, styling from the theme tokens, responsive rules, accessibility, and the copy in both languages. Three things from it are worth repeating here, because they are the parts most likely to be softened by someone implementing it in a hurry:

- **It cannot be dismissible.** A bar a reader can close is a bar they see once, which defeats the education it exists for.
- **It must not claim the site is safe or verified.** Any phishing site can copy the banner exactly. Its only real value is teaching the rule: official GFTV sites end with `globalfurry.tv` or `gftv.asia`, and a domain is read from the end. That knowledge is what protects someone on the fake site, where the banner will also be present and also lying.
- **No link to a trusted sites page until that page exists.** A trust banner whose "see the full list" link 404s is worse than one with no link.

## 1. What we are building

**Careers@GFTV** is the careers portal for Global Furry Television, served at `careers.globalfurry.tv`. It is modelled on `jobs.careers.gov.sg`. That is a clean public job board with a search and filter listing, individual job detail pages, and an authenticated application flow. A private admin dashboard sits behind it.

It is a GFTV HelloApp, so it follows the same conventions as the other GFTV PWAs.

## 2. Stack and repo conventions

- Frontend: vanilla HTML, CSS, and JavaScript. No frameworks, no build step.
- Backend: Vercel serverless functions (Node.js) under `main-site/api/`.
- Database: Supabase (Postgres) accessed with the service role key from serverless functions only. Never use Supabase Auth. Never expose the service role key to the browser.
- The site lives in a `main-site` directory. The `api` directory goes inside `main-site` because Vercel's root directory is set to `main-site`.
- Four READMEs, and only these four plus the one in `migrations/`. Do not scatter a README into every subdirectory.

### READMEs

Each one is short and says what lives in that directory and how to work with it. A page of orientation, not a manual, since the real documentation is the docs site in section 16.

- **Repo root.** What Careers@GFTV is in a paragraph, and what each top level directory holds. The phase the build is currently at, with a link to `/status`. How to run the migrations, and where the specification and the environment variables live.
- **`main-site/`.** The site itself. Local development, the environment variables and where each comes from, and how the two auth realms are laid out. Then the API route map at a glance, the Vercel project settings including the root directory, and the offline test checklist.
- **`telegram-bot/`.** What the bot does, and the nine commands. How to run it under tmux on the VPS, its own environment variables, and a pointer to `setup.md` for the BotFather side.
- **`docs-site/`.** What the docs site covers, the four audiences in 16a, and which role sees what. How to add or edit a page in each of the two content pipelines, and its own environment variables. How to preview locally, including how to sign in against a local staff account. How to run a Playwright screenshot capture, and the Vercel project settings for its own root directory and domain.
- **`migrations/`.** As described in section 6.

**Keep them current.** A README goes stale the moment it stops matching the code, and a stale README is worse than none. Update the affected ones in the same phase as the change, and never as a cleanup pass afterwards. Do it whenever any of these happen. A phase ships and the root README's status line moves. An environment variable is added, removed, or renamed. A directory gains or loses a meaningful part. A command or route set changes. Or the way something is run changes. Treat it as part of the work, the same as updating `next-steps.md`.
- Include a `.gitignore`, covering `.env`, `.env.local`, `next-steps.md`, and the usual Python and Node artefacts for the bot directory.
- Make it a fully offline capable PWA. Section 14 sets out exactly what works without a connection and what does not.
- Passwords hashed with bcrypt, matching the existing hash format already stored in `gftvhello_users` so existing accounts keep working.
- All secrets in environment variables. Document every variable in the root README.

### Environment variables

Ship a `.env.example` at `main-site/.env.example`, committed to the repo. It lists every variable, with a comment above each one saying exactly where to get it. Real values live in `.env.local` and in the Vercel project settings. `.gitignore` must ignore `.env` and `.env.local`, while keeping `.env.example` tracked.

```bash
# Supabase project URL.
# Supabase dashboard, Project Settings, Data API, Project URL.
# Use the existing GFTV project, not a new one.
SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co

# Supabase service role key. Server side only, never sent to the browser.
# Supabase dashboard, Project Settings, API Keys, service_role.
# Bypasses row level security, so treat it like a database password.
SUPABASE_SERVICE_KEY=eyJhbGciOi...

# Public base URL of the site, no trailing slash.
# Used for canonical tags, JSON-LD, redirects, and the login redirect allowlist.
# Locally this is http://localhost:3000.
SITE_URL=https://careers.globalfurry.tv

# Shared secret for the Google Apps Script webhook in section 13.
# Generate one yourself: openssl rand -hex 32
# The same value goes into each form's Apps Script, Project Settings, Script Properties, as PORTAL_SECRET.
FORM_WEBHOOK_SECRET=

# Protects the daily cron endpoint so only Vercel can trigger it.
# Generate one yourself: openssl rand -hex 32
# Vercel sends it as the Authorization bearer token on scheduled invocations.
CRON_SECRET=
```

If any variable is missing at startup, fail loudly with a message naming the variable. Never throw an undefined key error deep in a request. Do not add variables beyond these without telling me why.

The docs site is a second Vercel project with its own functions, per section 16. So it gets its own `docs-site/.env.example`, documented exactly the same way. It reads the same Supabase project and the same staff accounts, so most of it is a repeat. That is the honest cost of two projects in one repo, and not something to work around by sharing a file Vercel will not read.

```bash
# Same Supabase project as the portal. Server side only.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Public base URL of the docs site, no trailing slash.
# Locally this is http://localhost:3001, so the two sites can run side by side.
DOCS_URL=https://docs.careers.globalfurry.tv

# The portal. Used for the cross links in section 16, the sign in redirects,
# and as the WebAuthn relying party id, per 5e. Do not point this at the docs
# site: a passkey registered on the portal only works here because the two
# share one relying party id, and that id is the portal's host.
SITE_URL=https://careers.globalfurry.tv
```

No relying party variable is added, on either site. The portal already derives it from `SITE_URL`. The docs site derives the same id from the same variable, and checks the response against its own `DOCS_URL` origin. That is what lets one passkey work on both, and 5e explains why it is allowed.

### Supabase specifics

- Everything runs in the existing GFTV Supabase project, in the `public` schema, alongside the `gftvhello_*` tables. Do not create a new project and do not create a new schema.
- Server side access only. Use `@supabase/supabase-js` inside the Vercel functions with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, the names used across all of my projects. Do not rename them to `SUPABASE_SERVICE_ROLE_KEY` or anything else. The browser never talks to Supabase directly and never receives an anon key, so there is no Supabase client bundled into the frontend at all.
- Because of that, enable row level security on every new `gftvjobs_*` table and add no policies. The service role bypasses RLS, so the portal keeps working while anything holding an anon key gets nothing. This matters since the project is shared with other GFTV apps.
- All DDL ships as numbered files in `migrations/`, run by hand in the Supabase SQL editor. See section 6. Extensions needed: `pg_trgm` for the typo fallback and autocomplete, and `pgcrypto` if `gen_random_uuid()` is not already available. Enable them with `create extension if not exists`.
- The weighted full text search, `ts_headline` snippets, and the trigram fallback are awkward to express through PostgREST filters. Write them as Postgres functions in their own migration file and call them with `supabase.rpc()`. Two are suggested. `gftvjobs_search_jobs(q text, filters jsonb, limit int, offset int)` returns ranked rows with a total count. `gftvjobs_suggest(q text)` returns grouped title, tag, and department suggestions.
- Keep the tsvector and `usage_count` maintenance in Postgres triggers, and out of application code. Then a posting edited directly in the Supabase table editor stays searchable.
- Use `.select('*', { count: 'exact' })` for paginated listings, so the total is one round trip and not two.
- Foreign keys pointing at `gftvhello_users` are references only. Never insert, update, or delete rows in any `gftvhello_*` table. The exception is the session, challenge, trusted device, and backup code rows the login flow legitimately owns. **One more named exception**, added deliberately and with the conflict on the table. The staff recovery flow in 5g writes `gftvhello_users.password_hash`, and only that column. Read 5g before touching it, because the consequence reaches gftv.asia.
- Supabase pools connections through PgBouncer. So create the client once per function module at import time, and never per request.

### Proposed structure

```
/
  README.md
  .gitignore
  gftv-theme.md
  migrations/
    README.md
  telegram-bot/
    README.md
    setup.md
    .env.example
  docs-site/
    README.md
    .env.example
    content/
    login/
    account/
    scripts/
    api/
      _lib/
      _content/
  gen-review.js
  main-site/
    README.md
    .env.example
    index.html
    status/
    placeholder.html
    404.html
    jobs/
    search/
    apply/
    login/
    register/
    account/
    admin/
    assets/
      build-status.json
      css/
      js/
      i18n/
      fonts/
    api/
      _lib/
```

`gen-review.js` builds a single page listing every translatable string beside its source, for review by a fluent speaker before a language goes public. Its output is gitignored, so regenerate it instead of committing it.

Adjust if the existing repo layout differs, but keep `api` inside `main-site`.

## 3. Design

- Follow `gftv-theme.md` exactly. That is Proxima Nova, the GFTV branding font, self hosted under `assets/fonts/`. Then the `.glass-card` primitive, and the tokens `--brand`, `--brand-dark`, `--surface` and `--text`, in GFTV blue-grey, Hello yellow, and GFTV red for links. Links carry no underline in any state. A link inside body copy is one weight step heavier than the text around it, and that is what identifies it.
- Two-axis theme switcher (colour theme plus light/dark mode) using `data-color-theme` and `data-mode` on `<html>`, same as the other GFTV apps. Light mode is the default and ignores OS preference.
- No gradients, orbs, or blobs. Inline SVG icons, never emoji. No em dashes in copy.
- WCAG AA contrast for all text and body copy in every theme and mode combination.
- **Anything that waits shows that it is waiting.** Never a frozen screen and never a bare empty container. Use the loading primitives in `gftv-theme.md`. That is a spinner where the result has no shape yet, and skeletons where the shape is known. Both carry the 250ms delay, so a fast response is never seen to load at all. Pair every indicator with text a screen reader can announce, since an animation announces nothing. This applies to the search results, a posting loading, the apply handoff, and every admin table.
- Mobile first, not desktop with a phone afterthought. Both the portal and the docs site in section 16 must be fully usable on a small screen. Phase 12 checks that, so it is never assumed.

### 3a. Languages: English, Mandarin, and whatever comes next

The portal is available in English and Chinese. Only one language is shown at a time. This is not a partial translation of a mostly English site. Every posting, every interface string, every static page, and the admin dashboard exist in both.

**The Chinese is Singapore Mandarin**, 华文, not Mainland Putonghua. GFTV is a Singapore organisation and the copy should read as though it were written there. That is a vocabulary matter more than a grammar one, and the differences are real:

| Use | Not | Meaning |
|---|---|---|
| 义工 | 志愿者 | volunteer, and the single most visible marker |
| 华文 | 中文, 简体中文 | the written language, when naming it |
| 电邮 | 电子邮件 | email |
| 营运 | 运营 | operations |
| 摄影棚 | 录影棚 | studio |
| 文件 | 文档 | document, in the paper sense |

The language names itself 华文 in the switcher. The document is tagged `zh-Hans-SG` and not `zh-Hans`, since that is what the copy actually is. Prefix matching means anything keyed on `zh` or `zh-Hans` still applies. The font stack lists Simplified Chinese faces only: a traditional face would render the wrong character forms where the two sets differ.

When adding copy, check it against that table. When in doubt, the test is whether it would read naturally in the Straits Times, as opposed to a Beijing newspaper.

**The switcher.** A language control in the header, working exactly like the theme switcher and sitting beside it. It is its own button with a globe icon, and never a section inside the theme modal. A reader who only reads Mandarin and lands on the English site cannot be expected to find a control labelled "Theme". A globe is legible without reading anything. Each language names itself in its own script, `English` and `华文`, and neither is ever translated. So both options read the same whichever language the interface is currently in.

**Storage.** The choice lives in `localStorage` under `gftv-careers.locale`, alongside the two theme keys, and nowhere else. A pre-paint script in every `<head>` sets `lang` and `data-locale` on `<html>` before first paint, in the same block that sets the two theme attributes.

**The language is deliberately not in the URL.** Three consequences follow, and they are accepted and not worked around:

- A link shared by a Mandarin reader opens in whatever language the recipient has stored.
- Search engines only ever see the English version of a page. So `sitemap.xml`, the canonical tag, and the `JobPosting` JSON-LD in section 4 describe the English posting only. Mandarin postings are not discoverable through Chinese-language search, and Google Jobs will carry the English text.
- `hreflang` cannot be emitted, since there is no second URL to point at.

If any of that becomes a problem, the fix is a `?lang=` parameter carried alongside the stored preference. That is additive and would not change the schema.

**Interface strings.** Held in `main-site/assets/i18n/en.json` and `zh.json`, flat dotted keys, applied through `data-i18n`, `data-i18n-html`, and `data-i18n-attr` attributes. English is always loaded as the fallback layer. So a key missing from the Chinese file renders English, and never a blank element or a raw key. The English text stays in the markup as the element's own content, so a page reads correctly with no JavaScript and before the dictionary resolves.

**Content.** The default language lives on the base rows, and every other language is a row in a translation table keyed by locale. That shape is why adding Malay or Tamil costs a row in `gftvjobs_locales` and a dictionary file, and never a migration. A column per field per language would have cost ten columns and a fresh set of constraints each time. A translation is shown only when its `is_ready` flag is set. A drafted or unreviewed one can then sit in the table without going live. Any blank field falls back to the base row. A posting may publish with no translation at all, and it then reads in the default language with a notice saying so. But a translation marked ready must carry a title, summary, and description in that language. A translated heading above an untranslated body is worse than plainly untranslated. Tag and department slugs are **not** translated. They are URL identifiers and filter values, and translating them would break every shared link the moment somebody switched language.

**Search.** Languages are searched differently depending on whether Postgres can tokenise them, and have to be. Postgres cannot segment Han script. So `to_tsvector` treats a run of Han characters as one token, and a search for part of a word never matches. `zhparser` and `pg_jieba` would fix that and are not available on Supabase. English therefore keeps the weighted `tsvector`, ranked with `ts_rank_cd` and highlighted with `ts_headline`. A language Postgres cannot tokenise is matched with `pg_trgm` against the generated `search_text` column on its translation row. That is ordered by title closeness, with no highlighted snippet. Both work; only English ranks well. Say so in the admin documentation, instead of letting an admin conclude Chinese search is broken.

**Typography.** Proxima Nova carries no CJK glyphs, so Han characters fall through to the reader's own system font. That is PingFang SC on Apple platforms, Microsoft YaHei on Windows, and Noto Sans CJK SC on Android and Linux. No CJK face is named in the stack, deliberately. The platform defaults are already the right faces. Naming them would override a reader who has chosen a different Chinese font in their own settings. What makes this correct is the `lang` attribute, and not the stack. Han characters are shared between Chinese and Japanese, and a browser with no language to go on may render Chinese text in a Japanese face. A number of shared characters are drawn differently there. Every page sets `lang` from the stored locale before first paint. If that ever stops happening, the Chinese renders with the wrong glyph forms while nothing else looks broken. The Chinese document also gets a slightly looser line height, scoped to `[data-locale="zh"]`, since Han script reads tight at the leading Latin copy wants.

**Names.** GFTV is **国际兽视** in Mandarin, and the portal is **国际兽视入队平台**, literally the portal for joining the team. Use those, not the English strings, anywhere Chinese is being read. **The Mandarin name is not a translation of "Careers" and is deliberately not one.** "Careers" implies a salary, which is why every posting has to say it is unpaid, and 招聘 would carry that implication into Chinese. 入队 says what is actually on offer. A space sits between Latin and Han characters, and never between Han and Han. So it is `Telegram 账户` and `关于国际兽视入队平台`, with no space inside a run of Han.

**What is not translated.** Tag and department slugs, as above, since they are URL identifiers. `<noscript>` content, which cannot be reached once JavaScript is enabled.

This paragraph used to say that the staff half of the docs site stayed English. It asked for a note at the top of it saying so. **That was overruled by 16f on 3 September 2026 and built by phase 14 part 9**, which translated all eighty two pages. The whole documentation site is translated, staff half included. The correction is made here so that 3a and 16f cannot be read against each other. The link preview line on a posting stays English wherever it is shared, per 4 and the poster guide. The thing that unfurls a link has no language to offer.

### Responsive requirements

Applies to `main-site` and `docs-site` alike.

- Breakpoints: a single column layout below 640px, a relaxed two column layout from 640 to 1024px, and the full layout above 1024px. Design the small screen first and add columns upward, since retrofitting downward is what produces horizontal scrolling.
- **Hamburger navigation on both sites.** The portal collapses its header navigation and the admin sidebar behind a menu button. The docs site collapses its left sidebar behind one, and drops the right hand on-page contents into a collapsible block above the content. Same button behaviour and same animation on both, so they feel like one product.
- Every off canvas panel opens from the left and traps focus while open. It closes on Escape, on backdrop tap, and on navigating to a new page. It has an obvious close control and is reachable by keyboard. Set `aria-expanded` on the trigger and `aria-hidden` on the panel, and lock body scroll while it is open.
- The admin dashboard is not exempt. Tables reflow to stacked cards below 640px, instead of scrolling sideways. Bulk selection stays reachable, and any action buried in a wide table row surfaces in the card. An admin reading applications on a phone at a convention is the normal case here, not the edge case.
- The `/search` filter panel becomes a bottom sheet on small screens. The button that opens it carries the active filter count, and an apply action closes it.
- Touch targets are at least 44 by 44 CSS pixels with real spacing between them. Nothing depends on hover, and anything shown on hover has a tap equivalent.
- No horizontal scrolling at any width down to 320px. Long words, uuids, and tag names wrap or truncate with a title attribute, instead of pushing the layout.
- Modals, including the handoff modal in 7c, become full width sheets on small screens, with the buttons within thumb reach. They respect the safe area insets on notched phones.
- Forms use appropriate `inputmode` and `autocomplete` values, and inputs are at least 16px so iOS does not zoom on focus.
- Test at 320, 375, 414, 768, 1024, and 1440. Check both orientations, both themes, and both light and dark mode.

### 3b. Plain language, on both sites

Added 3 September 2026. **Every word on both sites is written for somebody with no technical knowledge who wants to find a role and apply for it.** That reader is the test, in English and in 华文 alike. It applies to the portal, the documentation site, the phase list on `/status`, and the bot's own messages.

What that means in practice:

- **One idea to a sentence, and no sentence over 25 words.** The cap is not the target: the portal's own average is under seven words. It exists to catch the sentence that grew three clauses while somebody was being careful, which is how the copy here fails when it fails.
- **Everyday words.** "Use up", not "consume". "Sign in", not "authenticate". Where a shorter word means the same thing, it is the word.
- **Name the technical term, then explain it.** Passkey, recovery code, two factor, cooldown: keep the word. It is the word on the button and in the browser's own prompt. Give it a plain explanation where the reader first meets it. Replacing the term would leave the page and the screen saying different things.
- **The reason belongs with the rule, still.** Plain does not mean thin: this site tells people why a thing works as it does, and that survives. It is said in shorter sentences.
- **The Chinese is Singapore Mandarin**, per 3a, and the vocabulary table there is a rule and not a preference.

`node check-copy.js` enforces the three parts of this a script can see: the banned phrases, the 25 word cap, and 3a's vocabulary table. Everything else is a judgement, which is why it is written here.

## 4. Public site (no login required)

**Home page (`/`)**
Landing page for the general public. Sections:
- Hero with the Careers@GFTV name and a short line about joining GFTV. It carries a job search box, keyword plus a category or department dropdown, submitting into `/search`.
- Featured or latest openings: a small grid of job cards pulled live from the API, with a "view all openings" link to `/search`.
- "Why volunteer with GFTV" style section with a few value cards.
- Browse by department or team.
- How the application process works, as a numbered set of steps.
- Footer consistent with the other GFTV sites.

**Job listing and search (`/search`)**

There is one browse surface, not two. `/search` is both the full job listing and the search results page. With no query parameters it shows every published posting, newest first. With a `q` parameter or any filter applied it shows the matching subset. Same page, same components, same URL, so a shared link always reproduces exactly what the sender was looking at.

- `/jobs` with no id 301 redirects to `/search`. The only thing living under `/jobs/` is an individual posting.
- The search box in the home page hero submits to `/search?q=...`.
- Keyword search backed by Postgres full text search. Query across job title, summary, description, responsibilities, requirements, department name, and tag names, with title and tags weighted highest.
- Filters: department, tags, commitment type, location or remote, posting status. Sorting by newest, closing date, or relevance, where relevance is the default whenever `q` is present and newest is the default when it is not. When sorting by closing date, use `order by closes_at asc nulls last` so deadline free postings sit at the end and not the top.
- Tag filtering: a tag cloud or chip row where multiple tags can be selected at once. Default to OR matching across selected tags, with a "match all selected tags" toggle for AND. Show a count beside each tag and hide tags with zero published jobs.
- Quick filter chips above the results for "Posted today", "Posted this week", "Closing soon", and "No deadline", each showing a live count. "Closing soon" matches only postings with a `closes_at` inside the next 14 days and never includes deadline free ones. These sit alongside the full filter panel, not inside it, so the common cases are one tap away.
- As-you-type suggestions from a lightweight endpoint: matching job titles, matching tags, and matching departments, grouped under those three headings. Debounce at around 250ms, minimum two characters, and make it fully keyboard navigable with arrow keys and Enter.
- When `q` is present, rank by relevance and highlight matched terms in the summary snippet using `ts_headline`.
- Handle typos and near misses with a trigram similarity fallback, for when full text search returns nothing. Show a "no results for X, did you mean Y" state, with the most popular tags as a way back in.
- Recent searches stored in localStorage and offered as chips under an empty search box. Nothing search related is stored server side against an account.
- Server-side pagination.
- Every piece of state, the query, filters, sort, and page, lives in the URL query string so results are shareable and the back button behaves. Update it with `history.replaceState` as filters change, and never by reloading.
- Each card shows title, department, location, commitment type, posted date, closing date, and up to four tag pills. Where `closes_at` is null, show "Open until filled" in place of a date. Never leave the field blank or print "null". Clicking a tag pill filters by that tag, and does not open the job.
- Each job detail page emits schema.org `JobPosting` JSON-LD, so postings are eligible for Google Jobs indexing. The site also exposes a public `api/public/jobs.json` feed for anyone aggregating openings.

**Job detail (`/jobs/{id}`)**
- The canonical URL of a posting is `/jobs/` followed by the posting's Supabase row uuid, for example `/jobs/3f9a1c2e-8b47-4d10-9a3e-5c61d2f0ab88`.
- **This route is server rendered, not a static page that fetches on load.** `vercel.json` rewrites `/jobs/:id` to a serverless function. That function injects the `<title>` and the meta description. It also injects the Open Graph and Twitter card tags, and the `JobPosting` JSON-LD, before the HTML is sent. The body of the page can still hydrate client side.

  The reason is link embeds. Discord, Telegram, Slack, and every other unfurler fetch the URL and read the markup as delivered; none of them run JavaScript. A page that fetches its posting after load unfurls as whatever the static shell says. So every posting on the site would embed with identical, generic text. Rendering the tags server side is the only way a posting link can carry its own title and description.

  This is the one route that works this way. Everything else in the portal stays a static page with a client side fetch, per section 2.

**Link embeds**

- Each posting carries an optional `og_description`, a short line written by the admin for the unfurl. It is never required.
- When it is empty, fall back to the first sentence of the posting's `description`. Take the first sentence, not the first N characters, so the embed never ends mid word. Sentence detection is language aware: a full stop for English, `。` for Mandarin. Strip any markdown before using it.
- Cap the rendered value at roughly 200 characters. Discord shows around 350 and most unfurlers cut nearer 200, so anything longer is guaranteed to be truncated mid sentence somewhere.
- The image is the site card image unless a posting sets its own later. Do not put the Google Form URL, the response sheet URL, or anything else non-public into an embed. The unfurl is fetched by a third party server and cached by it.
- **Embeds are always English.** A crawler has no `localStorage`, so it has no language preference to read, and the language is deliberately not in the URL per 3a. A per language embed line is stored on the translation row. It is ready if a `?lang=` parameter is ever added, and nothing serves it today. Say this in the admin help text, or an admin will write a Chinese embed line and wonder why nobody sees it.
- `/jobs` with no id redirects to `/search`, so nothing else competes for this route. Match a uuid shaped segment for the detail page and treat any other non-uuid segment as not found.
- Keep the `slug` column. Serve `/jobs/{slug}` as an alias that 301 redirects to the uuid URL. Then any link shared before this change still resolves, and there is only ever one canonical address per posting.
- A uuid that does not exist, or points at a `draft` posting, returns a proper 404 page and never an empty shell. A `closed` posting still renders, with the apply button disabled and a closed notice. An `archived` posting renders only for an applicant who has applied to or saved it, per the visibility rule in 7g. It 404s for everyone else.
- Set `<link rel="canonical">` to the uuid URL.
- Tag pills near the top, each linking to the listing filtered by that tag.
- Full description, responsibilities, requirements, nice-to-haves, commitment, location, and closing date, or "Open until filled, applications reviewed on a rolling basis" when `closes_at` is null.
- Share button and a "back to results" link that returns to `/search` with the previous query string intact.
- Apply button. Applications are handled by Google Forms, so for a logged in applicant the button starts the handoff in 7c.

**What a logged out visitor sees**

- The entire posting is public. Title, summary, full description, responsibilities, requirements, commitment, location, department, tags, posted and closing dates, all of it. No teaser, no blurred text, no "sign in to see the details". The only thing behind the gate is the act of applying.
- The Google Form URL is the single exception. It must never appear in the public job payload, the HTML source, the JSON-LD, or the `jobs.json` feed. It is served only from an authenticated endpoint, so a logged out visitor cannot lift it and bypass the gate.
- In place of the Apply button, show a control that reads as an apply action, not as a wall. Something like "Apply for this role", opening a small sign in prompt. That prompt explains in one line that applications need an account. It offers two equal options, log in and create an account, and a note that registration takes a moment and needs no approval.
- Saving a job gets the same treatment, and so does anything else that writes against an account.
- The search results page is fully public too, filters and tags included. Nothing there requires a session.

**Returning after signing in**

- Carry a `?redirect=` back to the posting through both the login and the registration flow. That includes the automatic sign in that follows registration, so a new applicant lands back where they started and never on a bare account page.
- Validate the redirect against a strict allowlist of relative paths on this origin. Reject absolute URLs, protocol relative ones, and anything with a host, or the parameter becomes an open redirect.
- On return, do not auto-start the handoff. There is no user gesture behind a post-login redirect, so the new tab would be blocked and the modal would appear out of nowhere. Land them on the posting with the Apply button now active, scrolled into view and briefly highlighted. Add a short confirmation line that they are signed in and can apply. The next click is theirs.
- Preserve intent across the round trip. If they clicked save instead of apply, complete the save on return and say so.

**Static pages**: About Careers@GFTV, FAQ, privacy notice, terms.

**Discovery files**

Built in phase 12 for the portal and phase 13 for the docs site, once the pages they describe actually exist. Building them earlier just means listing placeholder routes.

- **`/sitemap.xml`** on the portal is generated, not hand written, since postings change constantly. Serve it from a function rewritten to that path in `vercel.json`. It lists the home page, `/search`, the static pages and `/status`. It also lists every `published` job at its own URL, with a `lastmod` from `updated_at`. Exclude closed, draft, and archived postings, everything under `/admin`, `/account`, `/login`, and `/register`, and every placeholder route from 0c. Cache it with `s-maxage` so it is not rebuilt per request.
- **`/robots.txt`** on the portal allows the public pages, disallows `/admin`, `/account`, and `/api`, and points at the sitemap.
- **`/llms.txt`** on both sites, following the llmstxt.org convention. It is a short markdown file at the root, carrying the site name and a one paragraph description. Under that is a linked list of the pages worth reading, grouped under headings. For the portal that is what Careers@GFTV is, how applying works, and links to `/search`, the docs site, and the `jobs.json` feed. For the docs site it is a link per guide page with a one line description of each.
- Keep `llms.txt` to public, applicant facing material. No admin documentation, no endpoint paths, no Google Form URLs, and nothing behind a session. Treat it as a public page, because it is one.
- Worth knowing: llmstxt.org is a proposed convention and not a standard, and support for it is uneven. It costs almost nothing to publish and may help, but do not build anything that depends on it being read.
- Both sites also get a `sitemap.xml` and `robots.txt`, generated from the docs page list on the docs side, as set out in section 16.

## 5. Authentication

There are two separate account realms. Keep their session cookies, endpoints, and middleware fully separate.

### 5a. Staff and admin realm (existing tables, do not alter them)

Uses the existing `gftvhello_users` and `gftvhello_sessions` tables, so the same accounts that sign in at gftv.asia work here.

Login flow:
1. POST username and password. Look up `gftvhello_users` by username (case-insensitive), verify the bcrypt hash.
2. Reject if `is_approved` is false.
3. Reject if the account does not have admin access to this portal (see the open question in section 10 on which flag governs this).
4. If a valid `gftvhello_trusted_devices` row matches the device token cookie and has not expired, skip 2FA and issue a session.
5. Else, if `totp_secret` is not null, create a row in `gftvhello_totp_challenges` with a random token. Return a "2FA required" response carrying that challenge token. The password step must not issue a session.
6. The client posts the challenge token plus either a 6 digit TOTP code or a backup code. Verify TOTP against `totp_secret` with a one step window either side. Backup codes are verified against `gftvhello_backup_codes` by bcrypt comparison, and the matching row is deleted on use, single use only.
7. On success, delete the challenge row. Insert a `gftvhello_trusted_devices` row if "trust this device" was ticked. Then insert into `gftvhello_sessions`, with `expires_at` set by the "stay signed in" choice per 5d, and set the session cookie.
8. Accounts with a null `totp_secret` and no registered passkey skip straight from step 4 to step 7.

Step 6 also accepts a passkey, per 5e. Where the account has one, the passkey is offered first and the code is the fallback. Typing a code is the worse experience, and it only exists for the account that cannot do better.

This same flow runs on the docs site, against the same accounts, per 5h. The two differ in the cookie they set, the session table they write, and the origin they check a passkey against, and in nothing else.

Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, expiry matching `expires_at`. Use a distinct cookie name for this realm, for example `gftv_staff_session`.

Do not write to `gftvhello_signing_keys` or `gftvhello_used_request_tokens`. Leave those tables alone.

Also handle logout (delete the session row) and expired session cleanup on read.

### 5b. Applicant realm (new tables)

Create `gftvjobs_users` and `gftvjobs_sessions`, modelled on the gftvhello pair but with no admin check on sign in and no approval requirement. Leave a nullable `totp_secret` column in place so app based 2FA can be added later without a migration. Telegram 2FA, per section 15, is the second factor that ships.

- Registration UI: username, display name, email, password, confirm password. Uniqueness on username and email, clear inline validation, password strength minimum stated on screen.
- Login with username or email plus password. Sets its own cookie, for example `gftv_applicant_session`.
- Accounts are active immediately. No admin approval, no email verification for now.
- Applicant account page: edit profile and change password, plus the dashboard pages in 7g and the settings page with its danger zone.

### 5c. Recovery codes (applicant realm)

There is no email in this build, so recovery codes are the only self serve way back into an account. Say that on screen, more than once, and design accordingly.

Generate **two separate sets**, and never let one do the other's job:

1. **2FA backup codes**, in `gftvjobs_2fa_backup_codes`. Accepted in place of a Telegram code at the second step of login. They get past the second factor only, never past the password.
2. **Account recovery codes**, in `gftvjobs_recovery_codes`. Accepted on the forgot password flow. These are a full account credential, since one of them plus nothing else lets someone set a new password. That is exactly why they must not be the same codes as the 2FA set. A backup code lying in a chat log should not also be a password reset.

Two tables, and not one with a purpose column. The boundary is then enforced by the schema, instead of by remembering a filter.

Rules for both sets:

- Ten codes per set, generated server side from a CSPRNG, formatted in two groups for legibility, for example `k7m2-9xqp`.
- Stored bcrypt hashed, one row per code. Never stored or logged in the clear, and never recoverable after the one time they are shown.
- Shown once, on generation, with copy and download to a text file, and a checkbox confirming they have been saved before the dialog closes.
- Single use. Consumed on success, with the row deleted and never flagged.
- Regenerating a set invalidates every remaining code in that set and only that set.
- Account settings shows how many codes remain in each set, with a warning below three and a prompt to regenerate.
- Generating either set requires the current password.
- Rate limit code entry per account and per IP, and lock the flow for an hour after repeated failures. Compare in constant time and give the same generic error for a wrong code and an unknown account.

**Forgot password flow**

1. The applicant enters their username or email and one unused code from `gftvjobs_recovery_codes`.
2. Verify both. On success, issue a short lived, single use reset ticket bound to that browser and move them to a set new password screen. Never accept a password change in the same request that verifies the code, and never reveal whether the account exists.
3. On the new password being set: consume the recovery code, invalidate every session for that account, and revoke every trusted device. If Telegram is linked, send a message saying the password was changed and when.
4. If the account has fewer than three recovery codes left afterwards, push them straight to regenerate.
5. Someone with no codes left cannot recover alone. Give admins a verified reset path in the admin dashboard, clearing the password and forcing a reset on next login. Log who did it.

### 5d. Session length and trusted devices (both realms)

Two separate controls on both login forms. They are independent and must not be collapsed into one checkbox:

- **"Stay signed in for 30 days on this device"** controls how long the session lasts. Off gives a session that expires in 12 hours. On sets `expires_at` 30 days out. This is about the session cookie and nothing else.
- **"Trust this device"** controls whether the second factor is asked for again. Off means 2FA every login. On records a trusted device for 30 days, and logins from it skip the second step while the password is still required every time.

Implementation:

- Staff realm: use the existing `gftvhello_trusted_devices` table, which already carries a 30 day default. Do not alter it and do not create a parallel table.
- Applicant realm: create `gftvjobs_trusted_devices` mirroring it. Store the device token hashed and never in the clear, since it is new and there is no compatibility to preserve.
- The device token is 32 random bytes in its own long lived `HttpOnly`, `Secure`, `SameSite=Lax` cookie. It is separate from the session cookie, so it survives logout. That is the point: logging out should not mean answering 2FA again on your own laptop.
- Rotate the token on every successful use and push the expiry out. Then a stolen token has a short window, and an actively used device does not expire mid use.
- Trust is per device and per account. A shared browser signing into a second account gets its own record.
- Only offer "trust this device" once the second factor has actually been satisfied, and never on the password screen. Put a plain line next to it saying not to use it on a shared or public computer.
- Account settings lists trusted devices with when each was added and last used, a revoke button per device, and a revoke all. Changing the password, resetting via recovery code, unlinking Telegram, or disabling 2FA revokes all of them.
- Trusted devices never bypass the danger zone in `/account/settings`. That always asks for the password, and for a fresh code where 2FA is on.

### 5e. Passkeys (both realms, both sites)

Passkeys shipped in phase 2 and this section was not written at the time. So it is recorded here, and not described as new work. Migration `025` holds the tables and `main-site/api/_lib/webauthn.js` holds the implementation. Read those before changing anything here.

- Two credential tables, `gftvjobs_passkeys` for applicants and `gftvjobs_staff_passkeys` for staff. That is the same reason 5c gives two code tables: the separation is structural, so a staff credential can never satisfy an applicant check. The challenge tables are shared, since a challenge is a short lived random string with no privileges of its own.
- A passkey is a public key. Nothing stored is secret, which is the opposite of `totp_secret`. That is why passkeys can live in a `gftvjobs_` table while the account itself stays in `gftvhello_users` untouched.
- **A passkey is the second factor, not a replacement for the password.** The password is still asked for every login in both realms. This is deliberate, and it is not to be quietly upgraded to passwordless without a decision. The staff account is shared with gftv.asia, and this project does not get to weaken it unilaterally.
- No third set of recovery codes was added for passkeys. A lost passkey is a lost phone, which `gftvjobs_2fa_backup_codes` and `gftvhello_backup_codes` already answer.

**The relying party id, and why one passkey works on both sites.** WebAuthn allows a site to claim any registrable domain suffix of its own origin as the relying party id. `careers.globalfurry.tv` is a suffix of `docs.careers.globalfurry.tv` and is not a public suffix. So both sites use the portal's host as the relying party id and share credentials. The docs site therefore verifies a passkey the portal registered, and a staff member enrols once and not twice.

- The relying party id comes from `SITE_URL` on both sites. The expected origin does not. Each site checks the response against its own origin: `SITE_URL` on the portal and `DOCS_URL` on the docs site. Getting that pair the wrong way round either breaks the docs login or accepts an assertion from the wrong origin. It is worth a test of its own.
- Two consequences stay true and are not bugs to fix later. A passkey registered here does not work on gftv.asia, which is a different domain. A passkey registered on a preview deployment does not work in production. Both are the rule doing its job.
- Never widen the relying party id to `globalfurry.tv`. That would offer every GFTV staff passkey to every site on the domain, including ones outside this project.

### 5f. Staff account settings, and its danger zone

Staff get the same account settings suite the applicant realm has in 7g, scoped to what this project is actually allowed to change. **Specify it once and mount it twice.** The portal serves it at `/admin/security` and the docs site at `/account`, from the same markup, the same copy, and the same endpoint shapes. Two separate implementations of one security page is how the two drift until one of them is wrong.

What it covers:

- **Profile, read only.** Username, display name, and email come from `gftvhello_users` and are edited at gftv.asia. Say that on the page with a link, instead of showing fields that cannot be saved.
- **Password change**, verifying the current password and writing the new bcrypt hash. See the note in 5g on what this costs.
- **Passkeys.** List with the name, when added, and when last used. Add, rename, and remove, each requiring the current password. Show which site each was registered from. They work on both, and a reader will otherwise wonder why one they made on the docs site appears on the portal.
- **Authenticator app.** Enrolment status and last used. Enrol and remove, per 5a.
- **2FA backup codes**, from `gftvhello_backup_codes`. Remaining count, regenerate, and the warning below three, per 5c.
- **Account recovery codes**, per 5g, carrying the strongest warning on the page.
- **Trusted devices**, listed per site with a label saying which. The token cookie is host scoped, so trusting the portal does not trust the docs site. Mark the current device. Revoke one, and revoke all, where revoke all covers both sites.
- **Sessions.** Where the account is signed in, on both sites, with sign out everywhere.

*Danger zone*

Bottom of the page, clearly separated. Every action goes through the same three steps as 7g, in this order and with no way to skip ahead. First the consequences spelled out, with a cancel at least as prominent as the continue. Then the account's own username typed in full. Then the current password verified server side, plus a fresh second factor where the account has one.

The actions are: remove every passkey, remove the authenticator app, and invalidate every remaining recovery code. Then invalidate every remaining backup code, revoke every trusted device on both sites, and sign out everywhere.

**There is no delete account.** The gftvhello account belongs to gftv.asia and is shared with it; this project does not get to delete it. Say so on the page and link across, instead of leaving a gap a reader reads as an oversight.

Rate limit these endpoints hard, and lock the danger zone for an hour after several failed password attempts. Every destructive action writes an audit row to `gftvjobs_audit_log` before it executes. That row names the account, the action, and which site it was performed from.

### 5g. Staff account recovery codes

Staff get a second set of codes, `gftvjobs_staff_recovery_codes`. They work exactly as 5c describes for applicants: ten codes, CSPRNG, bcrypt hashed one row per code, shown once, single use. Regenerating invalidates the set, and generating requires the current password. The forgot password flow mirrors 5c step for step, including the two proofs rule from migration `027`. Where the account has a passkey or an authenticator app, the recovery code is checked first and the second factor after it. Only then is the reset ticket usable.

**State the cost of this plainly, because it is real.** Section 2 says never to write to a `gftvhello_*` table beyond the session, challenge, trusted device, and backup code rows the login flow owns. And 8.8 says password reset for these accounts belongs to gftv.asia. A staff recovery code sets `gftvhello_users.password_hash`, which is both of those rules broken. It was asked for deliberately and with the conflict on the table. So it is written down here as the one named exception, and not left as a surprise for whoever reads section 2 next:

- The exception covers `password_hash` and nothing else on that table. No other column is written from this project, ever.
- A staff password reset performed here changes the password at gftv.asia too, because it is one account. The confirmation screen must say that in those words. An admin who thinks they are resetting a careers portal password and finds themselves locked out of the main portal will not thank anybody.
- Every reset writes an audit row before it executes, naming the account, the time, and which site it came from. It notifies nothing, because this project has no email. That audit row is the only trace, so it is not optional.
- Both sets are separate credentials and never interchangeable, exactly as 5c requires. `gftvhello_backup_codes` gets past the second factor, and `gftvjobs_staff_recovery_codes` gets past the password. A code lying in a chat log must not be able to do both.
- Somebody with no recovery codes and no second factor still cannot get back in alone. That path stays where it belongs, at gftv.asia.

### 5h. The docs site session

The docs site signs staff in itself, and never borrows a session from the portal, per section 16.

- Its own functions under `docs-site/api/`, reading `gftvhello_users` exactly as 5a describes, with the same access check and the same second factor.
- Its own cookie, `gftv_docs_session`, and its own table, `gftvjobs_docs_sessions`, mirroring `gftvjobs_sessions`. It never writes `gftvhello_sessions`, so a docs sign in cannot appear as, or be revoked as, a gftv.asia session.
- Host scoped cookies throughout. Do not set anything on `.globalfurry.tv`: the parent domain carries other GFTV apps that have no business seeing this cookie.
- Trusted devices use the existing `gftvhello_trusted_devices` table with the docs site's own device cookie, so each site earns its own trust. Say so on the login form, instead of letting a reader think the checkbox failed.
- Session length follows 5d unchanged: 12 hours off, 30 days on, two independent controls.
- The shared session helpers are duplicated into `docs-site/api/_lib/`, not imported across the two Vercel roots. Vercel builds each project from its own root directory and cannot reach outside it. Keep the two copies identical and change them together, and say in both READMEs that they are a pair.

## 6. Database

Do not modify any existing `gftvhello_*` table.

### Migrations

All DDL ships as numbered SQL files in a `migrations/` directory at the repo root. I run them by hand, in order, pasting each one into the Supabase SQL editor. There is no CLI, no automated runner, and no migration framework.

- Name files `001_description.sql`, `002_description.sql`, and so on, zero padded, ordered by the sequence they must run in. One concern per file. The order is extensions, then core tables, then auth tables, then jobs. Then applications and analytics, then search functions and triggers. Then Telegram and notifications, then seed reference data.
- Every file opens with a comment header: what it creates, which spec section it comes from, and anything that must have run before it.
- Wrap each file in `begin` and `commit` so a failure halfway leaves nothing behind.
- Write everything idempotently. Use `create table if not exists` and `create index if not exists`. Use `create or replace function` and `add column if not exists`. I should be able to re-run a file without damage if I lose track of what has been applied.
- End each file by recording itself in a `gftvjobs_migrations` table of filename and applied timestamp, created by `001`. That table is the record of what has been run, since nothing automated is tracking it.
- Include a commented rollback block at the foot of each file, so undoing one is copy and paste instead of reconstruction.
- **Never edit a file that has already been run, and never renumber.** A change becomes a new numbered file. This holds even during the build, since production is live from phase 3.
- Keep each file small enough to paste comfortably into the SQL editor. Split it instead of letting one file sprawl.
- `migrations/README.md` lists every file in order, with a one line description of what it does. It also carries the running instructions and the rule about not editing applied files.

New tables:

- `gftvjobs_users`: id uuid pk, username text unique not null, display_name text not null. Then email text unique not null, password_hash text not null, avatar_url text null. Then phone text null, totp_secret text null, is_active boolean default true, created_at, updated_at.
- `gftvjobs_sessions`: id uuid pk, user_id uuid references `gftvjobs_users` on delete cascade. Then token text unique not null, expires_at timestamptz not null, created_at. Indexes on token and user_id.
- `gftvjobs_departments`: id, name, slug unique, description, sort_order, is_active.
- `gftvjobs_jobs`: id uuid pk, slug text unique, title, department_id, summary. Then description (markdown or html), responsibilities, requirements, nice_to_have. Then commitment_type (for example full time, part time, volunteer, contract, internship), location, is_remote boolean. Then compensation_note text null, openings int, status text check in (draft, published, closed, archived). Then application_form_url text null, form_prefill jsonb null, response_sheet_url text null. Then published_at, closes_at timestamptz null, created_by uuid references `gftvhello_users`, created_at, updated_at. Indexes on status, department_id, slug, closes_at.
  - `closes_at` is nullable on purpose. Null means the posting has no deadline and stays open until an admin closes it, for rolling or always-open roles. Treat null as open, never as expired, and never coalesce it to a far future date as a shortcut.
  - The id is what the public detail URL uses, so it is a real identifier here and not just an internal key.
  - `application_form_url` is the Google Form the Apply button opens. It is **nullable**, guarded by a table level check constraint that blocks publishing without one. That constraint is `check (status <> 'published' or application_form_url is not null)`.
  - Nullable is deliberate and not an oversight. The posting has to exist before the form can be configured. Section 13 needs the posting uuid to set `JOB_ID` in the form's script properties. A `not null` column would force an admin to invent a placeholder URL to save a draft. A placeholder that survives to publication is an Apply button pointing at nothing. That fails silently on the applicant's side, instead of loudly on the admin's.
  - The order of work is therefore: draft the posting, copy the uuid, build the form, paste the URL back in, publish. Section 8 describes the same sequence.
  - `form_prefill` optionally maps Google Form entry IDs to applicant fields. An example is `{"entry.123456": "email", "entry.789012": "display_name"}`, so the portal can append prefill query parameters to the form URL.
  - `response_sheet_url` is an optional link to the linked Google Sheet, shown to admins only.
- `gftvjobs_applications`: this is a tracking record, not the application itself, since the answers live in Google Forms. Columns: id uuid pk, job_id references `gftvjobs_jobs`, applicant_id references `gftvjobs_users`. Then status text check in (started, submitted, under_review, shortlisted, interview, offered, accepted, rejected, withdrawn) default `started`. Then admin_note text null, started_at, applied_at timestamptz null, cooldown_until timestamptz null, updated_at.
  - `applied_at` and `cooldown_until` are set when the application is confirmed, per 7f. Both are null while the row is still at `started`, and both are cleared on withdrawal. There is a unique constraint on (job_id, applicant_id), so there is one tracking row per applicant per posting. A repeat click on Apply updates `updated_at` instead of inserting a duplicate.
- `gftvjobs_application_events`: id, application_id, from_status, to_status, note. Then changed_by uuid references `gftvhello_users`, created_at. Every status change writes a row here.
- `gftvjobs_analytics`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade. Then applicant_id references `gftvjobs_users` on delete set null, event_type text check in (view, apply_click). Then did_apply boolean not null default false, response_state text check in (pending, answered, no_response) default `pending`. Then answer_source text check in (applicant, webhook, admin, timeout) null, responded_at timestamptz null. Then referrer text null, created_at timestamptz default now(). Indexes on job_id, applicant_id, event_type and created_at. Add a partial index on `response_state` where it is `pending`, so the outstanding prompts are cheap to look up.
  - One row per apply click, not one per applicant. A second click on the same job is a second row, which is what makes the funnel meaningful.
  - `did_apply` is false by default and only ever becomes true on a positive confirmation. That is either the applicant clicking Yes or the webhook in section 13. Not answering is not a missing value, it is a No. Never use null to mean unanswered here; `response_state` carries that.
  - `event_type` of `view` is optional page view logging on the job detail page. Fire it once per session per job, and never on every render. Never log a view for an admin previewing a draft.
  - Store no IP address and no raw user agent. Referrer is enough for where traffic came from.
  - This table is the append-only event log. `gftvjobs_applications` stays the single deduped status record per applicant per job. Keep the two in sync in the same request, and never derive one by rewriting the other.
- `gftvjobs_ratings`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade. Then applicant_id references `gftvjobs_users` on delete cascade, rating smallint not null check between 1 and 5, created_at, updated_at. Unique on (job_id, applicant_id), so a second rating updates the first instead of stacking. Ratings are admin facing only and are never shown on the public posting. A visible score would discourage applications to a role that a handful of people rated low.
- `gftvjobs_tasks`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade. Then job_id references `gftvjobs_jobs` on delete set null, application_id references `gftvjobs_applications` on delete set null. Then task_type text not null default `info_request`, title text not null, body text null. Then status text check in (open, awaiting_admin, resolved, dismissed) default `open`. Then response_text text null, responded_at timestamptz null. Then raised_by uuid references `gftvhello_users` on delete set null, resolved_by uuid references `gftvhello_users` on delete set null. Then resolved_at timestamptz null, created_at, updated_at. Index on (applicant_id, status) and on job_id.
  - `task_type` is plain text with a default, in place of a tight check constraint, so a new type does not need a migration.
  - The applicant replying moves the row to `awaiting_admin`. Only an admin moves it to `resolved`.
  - Unanswered apply prompts never appear in this table. They are derived from `gftvjobs_analytics`, per 7g.
  - Gains `questions jsonb null` and `answers jsonb null` for the question sets in 7g. Both sit on the task row, and not in tables of their own. That is right precisely because the reply model is one round: a question belongs to exactly one task and an answer to exactly one question. So there is nothing to join and nothing to order across rows. `sections` on a posting and `form_prefill` are the same idiom already in this schema. If the reply model ever becomes a thread, these become tables. That is the same decision as building a messaging system, and not a smaller one.
  - `questions` is an ordered array. Each entry carries `id`, unique within the task and stable, since the answers are keyed on it. It also carries `type`, one of `short_text`, `long_text`, `choice`, `checkbox`. Then `required` boolean, and a `label` object keyed by locale. For the two list types it carries `options`, an ordered array of `{ value, label }`. There `value` is a language independent identifier, and `label` is again keyed by locale.
  - **An answer stores option values, never labels.** `answers` is an object keyed by question id. It holds a string for the two text types, one option `value` for `choice`, and an array of `value`s for `checkbox`. Storing a label would make an answer given in 华文 unreadable in English and unmatchable against the options.
  - The question ids and the option values are the join, so **neither may ever be reused or renumbered**. Frozen once the task is sent, per 7g.
  - Locale keyed objects, and not translation rows, matching `gftvjobs_settings` in migration `018`. Adding a language stays a dictionary file and a locale row, per 3a, with no schema change here either.
  - `response_text` stays and is the free text box. It is always offered alongside the questions, and never replaced by them. A task with `questions` null behaves exactly as one raised before this existed, which is what keeps the rows already in the table valid.
  - Constrain the shape enough that a malformed row cannot be written. `questions` is an array or null, and `answers` is an object or null. The rest of the validation is the endpoint's, because it needs to compare the answers to the questions and a check constraint cannot.
- `gftvjobs_jobs` gains `task_questions jsonb null`, the set every future applicant to that posting is asked, per 7g. Same shape as `gftvjobs_tasks.questions`. It is a template and never the record. Raising a task **copies** it onto the task row, so each applicant's set is frozen independently. Editing the posting's set changes only what the next applicant is asked. Null means the posting asks nothing beyond the two built in questions, which is the ordinary case.
- `gftvjobs_2fa_backup_codes`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, code_hash text not null, created_at. Index on user_id. One row per code, deleted on use. Accepted only at the second factor step of login.
- `gftvjobs_recovery_codes`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, code_hash text not null, created_at. Index on user_id. One row per code, deleted on use. Accepted only on the forgot password flow.
  - Two tables, and not one table with a purpose column. The separation is the security property, so make it structural. A query against one can never accidentally satisfy the other, and there is no purpose value to get wrong in a where clause.
  - Every table in this build carries the `gftvjobs_` prefix without exception, including these. Nothing new is created outside that namespace.
- `gftvjobs_password_resets`: id uuid pk, user_id references `gftvjobs_users` on delete cascade. Then ticket_hash text not null, browser_nonce_hash text not null. Then expires_at timestamptz not null, used_at timestamptz null, created_at. Short lived, single use, issued only after a valid recovery code.
- `gftvjobs_trusted_devices`: id uuid pk, user_id references `gftvjobs_users` on delete cascade. Then device_token_hash text not null unique, label text null, last_used_at timestamptz null. Then created_at, expires_at timestamptz not null default (now() + interval '30 days'). Index on user_id and on device_token_hash.

Passkeys, from migration `025`. Recorded here because 5e was written after the fact and the tables already exist:

- `gftvjobs_passkeys` and `gftvjobs_staff_passkeys`: one row per credential. Each holds the credential id, the public key, the sign count, an aaguid, and a transports list. Then a user chosen label, `created_at`, and `last_used_at`. Two tables, and not one with a realm column, each with a real foreign key to its own realm's user table. `gftvjobs_staff_passkeys` references `gftvhello_users` and, like every other reference to it, is never written back to.
- `gftvjobs_passkey_challenges` and `gftvjobs_login_challenges`: shared, short lived, single use.

The docs site and staff recovery, arriving as migrations `028` onward:

- `gftvjobs_docs_sessions`: id uuid pk, staff_user_id uuid references `gftvhello_users` on delete cascade. Then token text unique not null, expires_at timestamptz not null, created_at. Indexes on token and staff_user_id. Mirrors `gftvjobs_sessions` for the other realm and the other site, per 5h. It is separate from `gftvhello_sessions`, so a docs sign in is never mistaken for a gftv.asia one. It is separate from any portal staff session, so signing out of one site does not sign you out of the other.
- `gftvjobs_staff_recovery_codes`: id uuid pk, staff_user_id references `gftvhello_users` on delete cascade, code_hash text not null, created_at. Index on staff_user_id. One row per code, deleted on use. Accepted only on the staff forgot password flow, never at the second factor step, per 5g.
- `gftvjobs_staff_password_resets`: id uuid pk, staff_user_id references `gftvhello_users` on delete cascade. Then ticket_hash text not null, browser_nonce_hash text not null. Then recovery_code_id uuid references `gftvjobs_staff_recovery_codes` on delete cascade, second_factor_at timestamptz null. Then expires_at timestamptz not null, used_at timestamptz null, created_at. The applicant equivalent reached this shape through migrations `024` and `027`. Build the staff one with both columns present from the start, instead of repeating that lesson.
- `gftvjobs_docs_translations`: id uuid pk, page_path text not null, locale text references `gftvjobs_locales`. Then title text, summary text, body text, is_ready boolean not null default false. Then updated_by uuid, updated_at, created_at. Unique on (page_path, locale). Per 16e and 16f, and it is 3a's base-row-plus-translation shape applied to guides. The markdown file is the base row and carries the `access` key, which is never here. A row is shown only when `is_ready` is set, and a page with no ready row falls back to English with a notice. Phase 14 creates it.
- `gftvjobs_docs_pages`: page_path text pk, title text not null, summary text null, body text not null, updated_at timestamptz not null. Written only by `docs-site/scripts/build.js`, at deploy time, and read only by the Telegram bot's `/docs`. Added 3 September 2026, because 16e keeps the English in the files and the bot was to read Supabase. Without it the bot has a 华文 body for every page and no English one at all. The files stay the source of truth and nothing edits a row by hand. **Public pages only, and no `access` column.** A gated page never reaches the table, which is what keeps the gate in one place while a second consumer reads the guides. The build refuses to write a gated page here the way it already refuses to render one into `dist/`. Phase 14 creates it.

No table holds which page needs which role. That lives in each page's front matter, which the serving function already reads, per 16f. A table would need writing at build time. It would then be a second copy of the same fact, free to disagree with the file it describes. `gftvjobs_docs_pages` is not an exception to that. It holds no tier, and it exists because a page that no table names is a page nothing outside Vercel can read.

- `gftvjobs_telegram_links`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade unique. Then telegram_user_id bigint not null unique, telegram_username text null, telegram_display_name text null. Then twofa_enabled boolean not null default false, linked_at timestamptz default now(), last_notified_at timestamptz null. One Telegram account links to one portal account and vice versa.
- `gftvjobs_telegram_tokens`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade. Then token_hash text not null, purpose text check in (link, login_code, magic_link). Then expires_at timestamptz not null, used_at timestamptz null, attempts int default 0. Then browser_nonce_hash text null, created_at. Index on (applicant_id, purpose) and on expires_at. Store hashes, never the code or token itself.
- `gftvjobs_invites`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade. Then applicant_id references `gftvjobs_users` on delete cascade, invited_by uuid references `gftvhello_users` on delete set null. Then note text null, status text check in (invited, seen, applied, declined, withdrawn) default `invited`, created_at, updated_at. Unique on (job_id, applicant_id).
- `gftvjobs_notifications`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade. Then kind text not null, payload jsonb not null. Then status text check in (queued, claimed, sent, failed, skipped) default `queued`. Then claimed_at timestamptz null, sent_at timestamptz null, error text null, attempts int default 0, created_at. Index on (status, created_at). This is the outbox the Telegram bot drains, per section 15.
- `gftvjobs_saved_jobs`: id, applicant_id, job_id, created_at, unique on the pair. Rows survive the posting closing or expiring. They are only removed when the applicant unsaves or the posting is hard deleted.
- `gftvjobs_tags`: id uuid pk, name text not null, slug text unique not null. Then colour text null, description text null, usage_count int default 0, created_at. Slug is lowercase and hyphenated, generated from the name. Enforce case-insensitive uniqueness on name, so "Video Editing" and "video editing" cannot both exist.
- `gftvjobs_job_tags`: job_id references `gftvjobs_jobs` on delete cascade, tag_id references `gftvjobs_tags` on delete cascade. The primary key is the pair, with indexes on both columns for filtering in either direction.
- `gftvjobs_status_days`: target text not null, day date not null, checks int not null default 0. Then failures int not null default 0, duration_total_ms bigint not null default 0, slowest_ms int null. Then first_checked_at timestamptz not null, last_checked_at timestamptz not null. Primary key (target, day). One row per target per UTC day, counting what was watched instead of storing each check. **The counters are what keep the page honest.** A day carries how much of itself was measured, so a barely watched day draws as partly measured. A day nobody probed has no row at all, and never a row of zeroes.
- `gftvjobs_status_incidents`: id uuid pk, target text not null, started_at timestamptz not null. Then last_failed_at timestamptz not null, ended_at timestamptz null. Then failures int not null default 1, status_code int null, error text null. Unique partial index on (target) where ended_at is null, so a target has at most one open outage. One row per outage, opened by the first failed check and closed by the first check that succeeds after it. So a prolonged outage is one row that grows, and its end is observed and never inferred.
- `gftvjobs_status_record(p_checks jsonb)`: the only way into either table. A cycle's results arrive as one array. The function adds to the day counters and opens, extends or closes the outage row, so nothing on the VPS reads and then writes. It is revoked from anon and authenticated, and granted to service_role by name. A function every role can execute by default is a way to write history for a site somebody does not run.
- **Both tables are written only from the VPS probe in section 15, never by the portal.** They are read only by the status page in 0c. Ninety days of history, swept by the daily cron in section 11; an outage still open is never swept. These are the only tables in the schema whose writer is deliberately outside Vercel. A probe that runs on the thing it is probing cannot report the outage it exists to report.

  **Changed 31 August 2026, in phase 12 part 7.** This was one table with a row per request. That is about six thousand rows a day, and half a million over the window the page draws. Nearly all of them record that nothing happened. The shape above costs four rows a day and an occasional outage. It states a real outage duration and not a floor: failures alone can only be closed by failures stopping.

Multilingual content, per 3a. These arrive as migrations `014` onward, and not in the original table definitions, since the first thirteen were already committed. **The default language lives on the base rows; every other language is a row in a translation table.** So adding Malay or Tamil needs no schema change at all:

- `gftvjobs_locales`: code text pk, english_name, native_name, html_lang. Then text_search_config text null, is_default boolean, is_active boolean, sort_order, created_at.
  - `text_search_config` names a Postgres text search configuration. It is null when Postgres cannot tokenise the language and search must fall back to trigram matching. That is what makes the search function in `016` language agnostic, instead of hardcoding which languages are awkward.
  - A unique index permits exactly one default. The default language's content is on the base rows, and a translation row for it is forbidden by check constraint.
- `gftvjobs_job_translations`: job_id, locale, title, summary, description. Then responsibilities, requirements, nice_to_have, location, compensation_note. Then sections jsonb, og_description, application_form_url, form_prefill, response_sheet_url. Then is_ready boolean, search_text generated, created_at, updated_at. Primary key on (job_id, locale).
  - **A language may point at its own application form.** Some roles run a separate form per language instead of one bilingual form. So `application_form_url` is nullable here and falls back to the posting. `form_prefill` and `response_sheet_url` travel with it, because a different form has different entry ids and a different response sheet.
  - **A translation is shown only when `is_ready` is set.** That makes "translated but not yet checked" a real state, and not something inferred from which fields happen to be filled. It is what lets a helper draft without publishing, per 7i.
  - `is_ready` cannot be set without a title, summary, and description in that language. Those are the fields a reader actually reads, and a translation missing any of them renders as a translated heading above an untranslated body. The optional fields fall back to the posting silently; the audit in 8.11 surfaces those.
  - Any blank field falls back to the base row, so a translation need not repeat what has not changed.
- `gftvjobs_department_translations` and `gftvjobs_tag_translations`: the row id, locale, name, description. The slug is shared and **never translated**, since it is a URL identifier and a filter value.
- `gftvjobs_translation_helpers`: user_id, locale, note, granted_by, granted_at. Per 7i. Primary key on (user_id, locale), so the role is granted per language.
- `gftvjobs_settings` gains `feature_overrides`, per 0c and 8.12. It is an object keyed by feature key. Each value carries the state, an optional public note, when it was set, and who set it. Absent or empty means everything shipped is on, which is the ordinary case. It is a setting and not a table, because it is a handful of rows at most and is read on every page. `api/_lib/settings.js` already caches settings for a minute, which is the right staleness for this. An outage flip reaching everybody inside a minute is fast enough, and reading a table per request would not be.
- `gftvjobs_settings` values holding human readable text become per locale objects, `{"en": ..., "zh": ...}`, in migration `018`. Settings holding no text keep their natural shape. A featured postings list that could differ by language is a bug and not a feature.
- `gftvjobs_users` gains `locale`, in `020`. `localStorage` cannot help the Telegram bot, which starts conversations instead of answering them. So a signed in applicant's choice is recorded on the account, for anything the server sends unprompted.
- `gftvjobs_jobs` gains `sections` jsonb in `019` and `og_description` in `017`. And `commitment_type` becomes a controlled list of five keys in `021`, translated in the dictionary and never stored per language.

- `gftvjobs_translation_reports`: id uuid pk, target_type text check in (job, department, tag, interface). Then target_id uuid null, target_key text null, field text null, locale text check in (en, zh). Then reporter_id uuid references `gftvjobs_users` on delete set null, note text not null, suggested_text text null. Then status text check in (open, accepted, rejected, fixed) default `open`, resolution_note text null. Then resolved_by uuid references `gftvhello_users` on delete set null, resolved_at timestamptz null, created_at, updated_at.
  - `reporter_id` is set null on account deletion, and never cascaded. A report that led to a correction is the record of why the wording changed.
  - A constraint requires a resolution note and a timestamp before a row can reach `rejected` or `fixed`. So a report cannot leave the queue without an accountable trail.
  - Reports are not tasks and never appear in `gftvjobs_tasks` or in the `/account/tasks` badge count, per 7h.

Search support:

- Add a `search_vector tsvector` generated or trigger-maintained column on `gftvjobs_jobs`. Weight it A for title, B for tags and department, C for summary, and D for the long body fields. Index it with GIN.
- Tag and department names live in other tables. So maintain the vector with a trigger that fires on insert or update of `gftvjobs_jobs`, and on changes to `gftvjobs_job_tags`. Include the trigger functions in the search migration file.
- Enable the `pg_trgm` extension and add a trigram index on `gftvjobs_jobs.title` and `gftvjobs_tags.name` for the typo fallback and the autocomplete.
- Keep `gftvjobs_tags.usage_count` accurate with the same trigger, so tag counts do not need a join every time the tag cloud renders.

## 7. Application flow

Applications are collected in Google Forms, not in the portal. The portal's job is to gate access, hand the applicant over, and log the handoff. It then records whether the applicant says they went through with it.

### 7a. Clicking Apply

- Only a logged in applicant can apply. This is a server side check on the endpoint, not just a hidden button. A logged out request for a form URL returns 401 and writes no analytics row.
- When a logged in applicant clicks Apply, the client calls an authenticated endpoint. That endpoint:
  1. Verifies the session. Then verifies the job is `published`, not past `closes_at` where one is set, and not blocked by the global applications toggle. A null `closes_at` passes this check.
  2. Inserts a row into `gftvjobs_analytics`. It carries `event_type` of `apply_click`, the job id, the applicant id, `did_apply` false, and `response_state` pending.
  3. Upserts the `gftvjobs_applications` tracking row to status `started` and writes a `gftvjobs_application_events` row.
  4. Returns the prefilled form URL plus the id of the analytics row it just created.
- The client opens the modal first and then the new tab, in the order set out in 7c. Do not open the tab before the modal is on screen.
- The Apply button is disabled with an explanatory label once `closes_at` has passed. The same happens when the status is not `published`, or the global toggle is off. A posting with no `closes_at` never disables on time grounds.
- **An applicant already `accepted` for this posting is refused, permanently**, per 7f. It is checked in the same place as the cooldown and is a separate reason, because the sentence is different. They have the role, and there is no date on which that changes. Never show them a cooldown date, which reads as an invitation to try again.

### 7b. Prefilling the applicant's email into the Google Form

This works and is worth doing. Google Forms supports prefill through query parameters.

- In Google Forms, open the form and choose "Get pre-filled link". Fill in the email field with a placeholder, submit, and copy the resulting link. It contains an `entry.NNNNNNN` parameter for that field. That number is the field id.
- Store it in the job's `form_prefill` map. An example is `{"entry.1045781291": "email", "entry.2005620554": "display_name"}`. The admin job editor has inputs for this, with help text explaining where the entry ids come from.
- The server builds the final URL from the base form URL, then `?usp=pp_url`, then each `entry.NNNNNNN=<value>` pair. Every value is URL encoded. Build this server side from the session, and never from a client supplied value.
- Two limitations to state plainly in the admin help text. Prefilled values are editable by the applicant, so the email in the form response is not proof of identity. And prefill only works on the `viewform` URL, not on a `forms.gle` short link. Validate on save that the stored URL is a long-form `docs.google.com/forms/.../viewform` address.
- If a job has no `form_prefill` map, open the plain form URL. Never fail the handoff because prefill is not configured.

### 7c. The handoff modal

Clicking Apply opens a modal, and only then does the form open in a new tab. The order matters. The modal has to be on screen before focus moves away, so the applicant registers it going up and recognises it when they come back. A light tap on the shoulder, not an ambush on return.

**Sequence**

1. Click Apply. The modal opens immediately, in the same tick as the click, before any network call resolves. Nothing is awaited first.
2. The `api/applications/start` call fires in parallel. It returns the prefilled form URL and the analytics row id. Prefetch the form URL earlier where possible, on `mouseenter` or `focus` of the Apply button. Then by click time it is usually already in memory, and nothing has to be awaited between the click and the new tab. Fall back to fetching on click when the prefetch has not landed.
3. Once the modal has actually painted, and at least 800ms have passed since it opened, open the form. Use `window.open(url, '_blank', 'noopener')`. The short delay is deliberate, so the modal is visibly on screen before the new tab takes focus.
4. The modal itself is never at risk of being blocked. It is an in-page `<dialog>`, exactly like the theme modal, and browsers do not police those. The only thing a popup blocker can stop is step 3, the new tab. Keep step 3 inside the transient user activation window from the click, which is a few seconds in Chrome and Firefox. Avoid awaiting anything slow in between.
5. Safari and iOS are stricter than the rest. They can refuse a `window.open` that happens after an `await`, instead of synchronously inside the click handler. Do not fight this. Detect it: if `window.open` returns null or throws, treat the tab as blocked.
6. When the tab is blocked, swap the modal header to "Open the application form". Show a large primary anchor with the form URL and `target="_blank"`. A click on a real anchor is a fresh user gesture and always succeeds. The rest of the modal keeps working unchanged. Also render a quiet version of that link at the bottom of the modal in every case. A tab can open on another monitor, or behind the current window, without the applicant noticing.

**Structure**

The modal has three stacked sections, in this order:

1. **Header.** Opens reading "Redirecting you to the job application form...", with a small indeterminate progress indicator. When the applicant returns to the portal tab, it changes to "Tell us what you think" and the progress indicator disappears. Detect the return with `document.visibilitychange` plus a `window` focus listener. Belt and braces: swap the header after 8 seconds regardless, in case the tab never lost focus. That happens when the popup was blocked, or the form opened on a second monitor. Mark the header `aria-live="polite"` so the change is announced.
2. **Rate this job posting.** Five yellow stars, empty by default. Rating is optional and independent of the apply answer, and the modal never blocks on it. Save on selection, and allow changing the choice while the modal is open. Build it as a real radio group, with visually hidden inputs and labels, so it is keyboard operable with arrow keys. Never a row of clickable spans. Yellow is the star fill only, so keep it accessible against both light and dark mode surfaces. Pair it with a text label reading the value back, for example "3 of 5".
3. **Have you applied for this role?** Yes and No buttons, equally weighted, neither styled as the obvious default. Yes sets the analytics row's `did_apply` to true, `response_state` to answered, `answer_source` to applicant, and `responded_at` to now. It then moves the tracking row to `submitted` and starts the cooldown in 7f. No sets `response_state` to answered. It leaves `did_apply` false and the tracking row at `started`, and offers a line to reopen the form.

**Behaviour**

- Build it with a native `<dialog>` and `showModal()`, so focus is trapped and the backdrop comes free. It dismisses like every other modal on the site. Clicking the backdrop closes it, Escape closes it, and there is a close control in the corner. Do not special case this modal into something harder to leave than the theme picker.
- Native `<dialog>` does not close on backdrop click by itself, so add it. Listen for a click on the dialog element, and close when the click coordinates fall outside the content box. Or wrap the content in an inner element, and close when the click target is the dialog itself.
- Dismissing without answering is fine and leaves the row pending, which already counts as No. The modal reopens on their next visit, so nothing is lost by closing it.
- Answering Yes or No closes the modal. It replaces the Apply button on the page with the resulting state, either the cooldown notice or the reopen link. A rating already given is saved even if the modal is then dismissed without answering the apply question.
- **No answer means no.** `did_apply` starts false and stays false until something positively confirms otherwise. A pending row is treated as not applied everywhere it matters. No cooldown starts, the Apply button stays available, and the funnel does not count it as an application. The only difference between an unanswered row and an explicit No is the `response_state` and `answer_source` values. They exist so the analytics page can separate a real No from silence.
- The prompt survives leaving, and it is state and not a page. There is no `/survey/` route and no route of its own at all. See "Resuming a pending prompt" below.
- Asking again is about recovering a possible Yes, not about withholding anything, so nothing in the portal is gated on answering.

**Resuming a pending prompt**

- The server is the source of truth. `GET api/applications/pending` returns the applicant's `gftvjobs_analytics` rows where `response_state` is pending. Each carries its row id, job id, and job title. It reads the applicant from the session cookie and never takes an id from the caller.
- A small shared script runs on every page of the portal. If an applicant session exists, it calls that endpoint once per page load, and opens the modal if anything comes back. It goes straight into the "Tell us what you think" state, with no redirect step and no progress indicator. The modal is one component that takes a row id and a job id, so it can mount on any page.
- `localStorage` holds the same row id purely as a fast path. The modal can then appear before the fetch resolves, on the job page the applicant just came from. Treat it as a cache that can be wrong. If the server says nothing is pending, clear it and show nothing. This is also why the server check exists at all: a different device or a cleared browser would otherwise lose the prompt.
- The outstanding item on `/account/tasks` opens the same modal in place. If it needs to be linkable, use a query parameter on the posting: `/jobs/{uuid}?prompt={analytics_row_id}`, and never a nested path. The prompt is not a resource of its own, should never be indexable, and does not deserve a URL segment. Validate that the row belongs to the session's applicant before opening anything. Strip the parameter with `history.replaceState` once the modal is open, so it does not linger in a shared link.
- Only ever show one modal at a time. If several prompts are pending, take the most recent and leave the rest for later page loads.
- While an answer is pending for a posting, the Apply button on that posting is replaced. In its place is a "You have an unanswered question about this application" prompt that reopens the modal. So a second handoff cannot stack on top of an unresolved one.
- The daily cron moves analytics rows still pending after 14 days to `response_state` of `no_response`. `did_apply` stays false and `answer_source` is set to `timeout`. Nothing about the applicant's access changes at that point, since silence was already being read as No. The timeout exists to stop the modal reappearing forever, and to close the row off for reporting.
- The modal must be usable on a phone. Full width sheet, thumb reachable buttons, stars large enough to tap accurately, and no reliance on hover.

### 7d. About blocking the tab from closing

I asked for the user to be forced to answer before closing the tab. That is not something a browser will allow, so build the closest honest version instead and do not waste effort fighting it:

- `beforeunload` is the only hook available, and all it does is show a browser generated confirmation dialog with text the site cannot control. Chrome, Firefox, and Safari all ignore custom messages. The applicant can still confirm and leave, every time. It also only fires if they have interacted with the page first.
- Register a `beforeunload` handler only while the modal is actually open and unanswered. Remove it on any close, whether that is Yes, No, Escape, the backdrop, or the close control. Do not keep it armed after the modal is dismissed, since the applicant has already told you they are done with it for now. That gives a genuine "are you sure you want to leave" prompt without pretending it is a lock.
- Do not attempt any of the hostile workarounds: no repeating `alert()` loops, no `history.pushState` back button traps, no fullscreen locks, no `unload` beacon spam. Browsers block or throttle these, they get the site flagged, and they punish the applicant for a data quality problem that is not theirs.
- The real safety net is the persistent modal in 7c, which reopens on the next visit. It never demands an answer in the moment.
- The answer is made reliable by the Google Apps Script webhook in section 13, which confirms submissions independently of what the applicant clicks. Build that too. The modal stays regardless, since it covers forms where the script is not installed and since it also collects the rating.

### 7e. Withdrawing

- Applicants can withdraw, which sets the tracking status to `withdrawn` and writes an event row. Make clear on screen that withdrawing here does not delete their Google Form response. Say that they should contact the team if they need it removed.
- Withdrawing clears the reapply cooldown described in 7f, so someone who pulls out is not locked out of a role they change their mind about.

### 7f. Reapply cooldown

Once an applicant has applied to a posting, they cannot apply to that same posting again for three months.

- The cooldown starts only on a positive confirmation, whichever comes first. That is the applicant clicking Yes in the modal in 7c, or the webhook in section 13 reporting the submission.
- Clicking No starts nothing, and neither does ignoring the modal. An unanswered prompt is read as No. An applicant who closed the tab without answering keeps full access to the Apply button. Never infer an application from the click alone.
- On confirmation, set `applied_at` on the `gftvjobs_applications` row, and `cooldown_until` to three months later. Store the date instead of computing it on read. The rule then stays stable if the policy changes later, and an admin can override a single row.
- Enforce it server side in the apply endpoint, and not only by hiding the button. A request for a posting still inside its cooldown returns a clear error and writes no analytics row.
- The Apply button on a posting inside the cooldown is replaced by a disabled state. It reads "Applied on 4 March. You can apply again from 4 June." Show the same on the card in the search results. Then nobody clicks through only to be turned away.
- The cooldown is per applicant per posting. A different posting is unaffected. A role that is closed and later reposted gets a new uuid, so it is a new posting with no cooldown. Mention that in the admin help text, since it is the intended escape hatch for genuinely reopened roles.
- Admins can waive a cooldown on a single tracking row, from the applicant tracking page. That clears `cooldown_until` and writes an event row naming who did it.
- **A status change never touches the cooldown.** A job poster moving somebody through the pipeline leaves `applied_at` and `cooldown_until` exactly as they are. That holds for `accepted`, for `rejected`, and for every other status. The applicant serves the rest of the period they were already serving. Only three things ever write those columns. A confirmed application sets them, a withdrawal clears them per 7e, and an explicit waive clears `cooldown_until` per the line above. A rejection is not a waive. Making it one would let somebody reapply the same afternoon they were turned down, which helps nobody.
- **Once the cooldown has run out, a rejected applicant may apply again**, and the tracking row starts fresh at `started`. The cooldown is the whole of the gate. A rejection is not a ban, and the event history keeps the record of what happened. `rejected` therefore joins `started` and `withdrawn` as a status a new application may reset. That is the list in `api/_lib/apply.js`.
- **An accepted applicant may not apply to that posting again**, cooldown or no cooldown. They have the role. The Apply control says so plainly, and never shows a date. A date invites somebody to come back and try again for something they already have. This is the one refusal in 7a that is not about time passing.

### 7g. Applicant dashboard

The account area gets two list pages beyond the profile. Both are private and both require an applicant session. Both must keep working for postings that are closed, expired, or archived.

**My applications (`/account/applications`)**

- Every posting the applicant has applied to, or started an application for, newest first. Each shows the status, the date they applied, and the cooldown state where one is active.
- Bucket tabs mirroring the admin ones, so they can filter to submitted, in progress, or closed out.
- Each row links back to the posting at its `/jobs/{uuid}` URL. That link must resolve even if the posting has since closed, expired, or been archived. An applicant can then always reread what they applied for.
- Any unanswered prompt from 7c also surfaces on the outstanding tasks page below, which is the canonical place for it.
- Withdraw action, per 7e.
- Empty state pointing at `/search`.

**Saved jobs (`/account/saved`)**

- Same treatment. Postings the applicant saved, including ones that have since closed or expired. Those stay visible with a clear "no longer accepting applications" badge, and never vanish from the list.
- Unsave action, and a save or unsave toggle on both the job cards in `/search` and the job detail page.
- Saving requires a session. For a logged out visitor, the save control opens the same sign in prompt as Apply, described in section 4. It completes the save once they are back.
- Sort by recently saved, with a filter for still open versus closed.

**Outstanding tasks (`/account/tasks`)**

A single inbox for anything the portal needs the applicant to deal with. It exists so a request from an admin has somewhere to land, now that notifications are in-portal only.

- Two sources feed the list, and the page unions them at read time:
  1. Unanswered apply prompts, derived live from `gftvjobs_analytics` rows at `response_state` pending. Do not copy these into the tasks table. The analytics row stays the single source of truth, and duplicating it guarantees the two drift apart.
  2. Rows in `gftvjobs_tasks`, which is where admin raised items live.
- Two task types to support from the start. `info_request` is where an admin needs more detail before progressing an application. `notice` is a one way message with nothing to submit. Leave the type column open, so more can be added without a migration.
- Each item shows a title, the posting it relates to where there is one, who raised it, when, and its status. Open items sort first, newest first. Resolved ones collapse under a "recently completed" section, and never vanish.
- Opening an apply prompt item opens the modal from 7c in place. Opening an info request expands an inline panel with the admin's message and the questions it carries.
- Keep replies to one round for now. The admin asks, the applicant replies once, and the admin reads it and closes the task. This is deliberately not a messaging thread. It should not grow into one without a decision to build that properly.

*Questions on a task*

An `info_request` may carry a set of questions, instead of only a free text box. A job poster composes them in 8.3 and the applicant answers all of them in one submission, which is still one round.

**Two questions are built in and are never part of a poster's set.** They are "did you apply for this role" and the posting rating, both from 7c. They belong to the apply prompt, and they are derived from `gftvjobs_analytics` and never stored as questions. No composer can edit, reorder, or remove them. A poster's questions never appear inside the handoff modal either, for the reason 7c gives. That modal is a light tap on the shoulder and not an ambush. Hanging a required form off it would make dismissing it cost something.

**Who a set goes to is chosen when it is sent**, and there are exactly two choices:

- **Selected applications.** The poster ticks one or more existing applications on the tracking page. Each one gets its own task.
- **The posting, from now on.** The set is stored on the posting. Every applicant who applies from that point gets a task raised automatically, at the moment they are handed over. Existing applicants are untouched unless the poster also sends to them. **This is a form asked of everybody who applies, and section 10 item 1 has been amended to permit it. Read that item before extending this.**

A poster sending to more than one applicant sees exactly who will receive it, before anything is written. That is the same rule 8.5 applies to bulk invites. Each recipient gets an independent task with its own frozen copy of the questions. So resolving one, or a set going out wrongly, is per applicant and never one shared row.

The set itself:

- **Four question types, and no more without a decision.** **Short answer** is one line and **long answer** is a paragraph. **Choice** picks exactly one of a list, and **checkbox** picks any number of a list, including none. A single yes or no confirmation is a checkbox question with one option.
- Each question carries a stable id, a type, a label, whether it is required, and, for the two list types, its options in display order.
- **Questions are written in every shipped language, and displayed in the reader's own**, per 3a. The composer offers a tab per language, exactly as the job editor does. Unlike a message to one named person, a set can now reach everybody who applies, and their languages differ. **A language left blank falls back to one that was written.** That is the same rule every other string on this site follows, and it never renders empty.
- **An option's stored value is language independent.** The label is per language, the value is not. An answer records the value, so the same answer renders in either language and validation does not depend on which language the applicant was reading. Storing a translated label as the answer would make a Chinese reader's answer unreadable in English and unmatchable against the options.
- **A free text box is always offered alongside the questions and cannot be turned off.** Somebody asked three specific things often needs to say a fourth. A form with no way to say "none of these quite fit" collects worse answers than one that has one.
- **Answers are validated on the server against the question set stored on that task**, and never against what the browser sends back. Every required question must be answered. An answer to a choice or checkbox question must be one of that question's own option values. An answer naming a question the task does not carry is rejected, and never stored.
- **The set is frozen once the task is sent.** Questions can be added, edited, reordered, and deleted freely in the composer, and not at all afterwards. Editing a sent set orphans answers already given, and changes the meaning of ones already read. Getting it wrong means raising a new task and resolving the old one, which is visible and is the right cost. Editing the set stored on a posting changes what future applicants are asked and never touches a task already raised.
- **Cap the set, and keep the cap low.** Twenty questions, with a cap on options per question and on the length of every answer.
- **No file upload of any kind.** Not on a question, not on the free text box, not ever. Anything needing a file is asked for through the role's Google Form or arranged out of band.
- The applicant sees their own answers after submitting, exactly as they see a plain reply now. A question they were asked and did not have to answer shows as unanswered, and never as blank.
- A badge in the account navigation shows the count of open items across both sources. The page is then discoverable without an email or a push notification.
- Deep links: `/account/tasks?task={task_id}` opens a specific item, and the apply prompt keeps the `/jobs/{uuid}?prompt={analytics_row_id}` form from 7c. Validate ownership against the session in both cases, and strip the parameter with `history.replaceState` once it has been handled.
- Empty state that reads as a good thing, not an error.

**Account settings (`/account/settings`)**

Profile fields, password change, Telegram linking, and a clearly separated danger zone at the bottom.

*Danger zone*

Covers deleting the account, unlinking Telegram, disabling Telegram 2FA, and anything else destructive added later. Every one of them goes through the same three steps, in this order, with no way to skip ahead:

1. **Consequences.** Clicking the action opens a panel spelling out exactly what happens and what cannot be undone. The cancel is at least as prominent as the continue. For account deletion, say plainly that Google Form responses already submitted are held by Google and are not deleted by this. Say that they should contact the team separately for those.
2. **Typed confirmation.** They type their own username to proceed. Not a checkbox, not "type DELETE", their username, so the action cannot be completed by muscle memory. Compare case sensitively and trim whitespace only.
3. **Password.** They enter their current account password, which is verified server side against the bcrypt hash on a dedicated endpoint. Never accept a client side "password was correct" signal. If Telegram 2FA is enabled on the account, also require a fresh code from the bot at this step. That is the point of having it.

Then the action runs. Additional requirements:

- Rate limit these endpoints hard, and lock the danger zone for an hour after several failed password attempts.
- Every destructive action writes an audit row before it executes, so the record survives the deletion.
- Deleting an account cascades the applicant's own rows. It keeps `gftvjobs_analytics` rows with `applicant_id` set to null, so historical funnel numbers stay intact. It invalidates every session for that account immediately.
- Show a final confirmation screen after the fact, not just a redirect to the home page.

*Recovery codes*

- Two panels, one per set, each showing how many codes remain, when they were generated, and buttons to view remaining count and regenerate. Never re-display a code after generation.
- The account recovery panel carries the strongest warning on the page. With no email in the system, these codes are the only way back in without asking an admin.
- Generating either set requires the current password, per 5c.

*Trusted devices*

- List of trusted devices with when each was added and last used, plus revoke per device and revoke all, per 5d.
- Mark the current device in the list so nobody revokes the one they are sitting at without realising.

*Telegram 2FA*

- A "Link Telegram for 2FA" control that generates a short lived, single use linking token. It shows a `t.me/careersgftv_bot?start=<token>` deep link and a QR code of the same link. It also shows the token in text, for anyone who wants to paste it.
- Once linked, show the linked Telegram display name and the date it was linked. Add controls to send a test message, unlink, and toggle whether 2FA is required at login.
- With 2FA on, the login flow gains a second step after the password. The portal sends a six digit code to the applicant on Telegram, and the browser prompts for it. The applicant can also pull a code themselves from the bot, if the push does not arrive.
- Codes are six digits, valid for five minutes, single use, stored hashed, and invalidated on a successful login or on issuing a newer code. Cap attempts per code and per account. A code from `gftvjobs_2fa_backup_codes` is accepted at this step in place of a Telegram code.
- If the applicant loses access to Telegram, their 2FA backup codes from 5c are the way back in. Require that set to exist before 2FA can be switched on, generating it in the same flow if it does not. Say plainly that losing both Telegram and the codes means asking an admin.

**Visibility rule for old postings**

Amend the 404 rule in section 4. A posting resolves at its uuid URL when any of these hold. It is `published`. It is `closed`. Or the requester is an applicant with either a `gftvjobs_applications` row or a `gftvjobs_saved_jobs` row for it. A `draft` posting is visible only to admins previewing it. Anything else is a 404. Archived postings that an applicant has history with render in a read only state with a notice explaining the posting is no longer active.

### 7h. Reporting a translation problem

Nobody on the GFTV side necessarily reads both languages well enough to catch a bad posting before an applicant does. So the applicants are the correction loop. Assume every translation is wrong until somebody says otherwise, and make saying so easy.

- A quiet control on every job posting, reading something like "Report a translation problem". Not a banner, not a prompt, and never a modal that appears by itself. It sits near the foot of the posting with the share and back links.
- The same control appears wherever else translated content is shown at length, and on the interface itself. A reader who spots a bad label in the navigation should be able to report it. They should not have to work out that it is an interface string and not part of a posting. The report form asks what is wrong, not what kind of thing is wrong.
- Opening it shows four things. Which language version has the problem, defaulting to the one currently being read. Which part, defaulting to the whole posting. A box for what is wrong. And an optional box for a better wording.
- **A suggested wording is never applied automatically.** An admin reads it first, every time. Say so on the form, so a reporter knows what to expect and does not assume their text is now live.
- The reporter may write in either language. Do not force them into the language they are reporting about, which is often the one they read least well.
- Reporting requires an applicant session, so the team can come back about it. For a logged out visitor the control opens the same sign in prompt as Apply, per section 4, and completes the report on return.
- Rate limit it per account and per IP, like every other write.
- Confirm plainly on submission, and say that a person will look at it. Do not promise a timeframe.
- Reports are stored in `gftvjobs_translation_reports`. They are not tasks. They are outbound from the applicant, and not something the portal needs from them. So they do not belong on `/account/tasks`, and must not add to its badge count. An admin who needs to ask a follow up question raises an ordinary `info_request` task, which is what that table is for.

### 7i. Translation helpers

Section 7h lets any applicant report that a translation reads wrongly. This is the other half: a standing role for people who can actually fix it.

Nobody on the GFTV side necessarily reads every language the portal publishes in. Treating translation review as a favour asked once, before launch, guarantees the second posting is worse than the first. So it is a capability instead.

**Who they are**

- A translation helper is an ordinary `gftvjobs_users` account that an admin has granted the role for one language. They are language speakers and not staff. They deliberately do not go through `gftvhello` or the admin access overlay. The person best placed to fix the Chinese has no reason to be a GFTV staff member.
- Granted per language, in `gftvjobs_translation_helpers`. As soon as a third language exists, someone who reads Chinese should not be approving Tamil, and a single boolean would let them.
- Granting requires a reason, recorded on the row, so an admin reviewing the list a year later knows why each person is on it.

**What they can do**

- Edit any translation row in their language, freely and without approval.
- **They cannot make a translation live.** Only staff set `is_ready`, which is the flag readers depend on. Access can therefore be granted before trust is, and a helper cannot publish a half finished posting by accident. **Staff and not admins alone**, amended 4 September 2026 in phase 14 part 6. The tick is open to any staff account. A job poster who cannot set it cannot publish their own posting in two languages. The promise this line makes to a helper is that somebody reads their draft before a reader does, and that promise is kept either way. Deviation 131.
- See what is missing: every posting, department, and tag with no translation in their language, and every translation started but not ready. This is the same audit view as 8.11, scoped to their language and without the admin controls.

**Suggesting a correction in place**

The helper area is not the only way in. A helper reading any page can select the wording that reads wrongly, and suggest a replacement for that exact span in place. They never leave the page, and never need to know what a dictionary key is.

- Selecting text inside a translatable region offers a small control to suggest a correction. Everything translatable on the site already carries an attribute naming its source. Interface strings render inside elements with `data-i18n="key"`, and content renders inside elements marked with its table, row, and field. The annotation layer walks up from the selection to find it, so the helper never types an identifier.
- The suggestion is stored in `gftvjobs_translation_reports` with `origin` of `annotation`, alongside the ordinary reports from 7h. **One queue, not two.** An admin works through a single list whether the item came from a form or a selection.
- Anchoring follows the W3C Web Annotation Data Model's `TextQuoteSelector`. Store the exact quote, plus a short run of text either side. That is worth copying instead of inventing. A suggestion can still be found after the surrounding text has been edited. When it cannot, it is shown as detached, and never silently applied to the wrong place.
- A suggestion against an interface string is a code change. The wording lives in `assets/i18n`, which is what keeps the site build free and lets the dictionaries precache for offline. So the admin view shows the key, the current wording, and the suggestion. A developer applies it and deploys. Say that plainly in the admin view, instead of letting an admin click approve and wonder why nothing changed. **Do not build an interface string editor**, and do not move the dictionaries into the database to avoid the deploy.
- A suggestion against content, a posting, department, or tag, an admin can apply directly, because that text is in the database.

**The layer itself**

- Off by default, and toggled from the account menu. A helper is a reader first, and text selection has to keep working normally for copying.
- Visible only to granted helpers and admins. To everyone else the attributes are inert markup and the layer does not load at all.
- Existing suggestions show as a quiet underline on the annotated span, with a count. This is what turns it from a suggestion box into a review pass. A helper can see what has already been raised, and not raise it again.
- **Elegant at every width, per section 3.** On a wide screen the suggestion opens in a panel beside the text, and annotated spans align to it. Below 1024px it is a bottom sheet, following the same pattern as the `/search` filters and the handoff modal. The selection stays visible above it. Touch selection is imprecise, so the sheet shows the captured quote and lets it be adjusted by word, instead of demanding a perfect drag.
- Keyboard reachable throughout. A helper who cannot use a pointer selects with the keyboard and opens the same control, and the annotated spans are focusable in reading order.

**What this does not replace**

The report flow in 7h stays exactly as it is. That is for any applicant, from a posting, with no role and no training. This is the tool for someone who has agreed to do the work. Both write to the same table, and `origin` is what tells them apart.

## 8. Admin dashboard (`/admin`)

Match the gftv.asia link shortener admin layout. Same sidebar, header, card and table patterns, and the same empty and loading states. Reuse those components instead of designing new ones.

Sections:

1. **Overview**: counts of published jobs, open applications by status, recent applications, recent registrations. Simple stat cards plus a recent activity table. Present the applicant pipeline as bucket tabs with live counts. Those are All, Started, Submitted, Under review, Shortlisted, Interview, Offered, Rejected and Withdrawn. An admin can then jump straight into any bucket. Carry the same bucket tabs into the applicant tracking page.
2. **Job postings**: list with search, status filter, and sorting. Create, edit, duplicate, publish, unpublish, close, archive.

   **A posting is never deleted as part of taking it down.** Closing keeps it public and read only. Archiving takes it off the board, while it still resolves at its uuid for anybody with history, per 7g. Both keep every row attached to it. That is the whole mechanism for a role that has been filled, withdrawn, or was a mistake nobody applied to.

   **Permanent deletion exists, is admins only, and goes through the three step confirmation in 7g.** A job poster cannot reach it at all. The control is absent for them and never merely disabled, because it is not a feature awaiting a phase. The panel at step 1 names exactly what goes with the posting, counted from the database and never described in the abstract. The cascades in migrations `005` to `008` take the applications, the analytics rows, the ratings, and the saved rows with it. Deleting a posting somebody applied to destroys funnel history 8.4 depends on, and is almost never the right answer. Archiving is.

   The editor itself needs to be rich enough for description, responsibilities, and requirements. It carries fields for the Google Form URL, the optional prefill entry ID mapping, and the optional response sheet link. Validate that the form URL is a real Google Forms address, and refuse to publish a job without one. Add a tag picker with type-ahead, and require at least one tag before publishing. The closing date field has a "no closing date" toggle that clears it to null. An admin then cannot leave it empty by accident, and cannot be blocked by a required date validator. Show open ended postings distinctly in the admin list, so they are easy to audit: nothing will ever close them automatically. The slug is auto-generated from the title, with a manual override and a uniqueness check.

   **Editing in every language.** The editor is tabbed, one tab per active language. The list is read from `gftvjobs_locales` and never hardcoded, so a language added later appears without touching the editor. The default language's tab edits the posting itself, and every other tab edits that language's translation row.

   Each tab shows the source language's wording beside the field being written, so a translator is never working from memory. Below 1024px that reference collapses to a disclosure above each field, in place of a second column.

   A tab shows at a glance whether that language is complete, in progress, or absent. The same state shows in the postings list, so a half finished translation is visible without opening it. Publishing needs only the default language. A posting may go out untranslated, and reads with the notice from 3a. What the database refuses is a translation marked ready without a title, summary, and description. Surface that as inline validation, instead of letting the save fail on a constraint.

   **Sections.** Beyond the fixed fields, an admin can add named sections to a posting and reorder them. Headings are content and translate with everything else. A translation may carry a different number of sections from the base row. A translator who merges two has not done anything wrong, so do not enforce a matching count.

   The slug is shared and is not translated.

   **Embed description.** An optional short line per posting, in both languages, used when the link is unfurled in Discord or Telegram. Show a live preview of what the unfurl will look like. When the field is left empty, show the fallback, which is the first sentence of the description. State in the help text that embeds are always served in English, per section 4. Then an admin does not write a Chinese line expecting it to appear.
3. **Applicant tracking**: list with filters by job, status, and date range. This tracks who was handed over to which form, and never the answers themselves. Make that clear in the UI copy. The detail view shows the applicant profile, which job, when they started, and their current status. Change status with an optional note, which writes an event row. Waive an active reapply cooldown on a row, per 7f. Raise an outstanding task on the applicant from here, choosing a type and writing the message. Then read their reply and resolve it.

An `info_request` may carry a set of questions as well as the message, per 7g. The composer adds them one at a time, choosing short answer, long answer, choice, or checkbox. For each it writes the label, marks it required or not, and lists the options for the two list types. It has a tab per language, like the job editor and read from the same `gftvjobs_locales`. It shows at a glance which languages a question is still missing. Questions can be added, edited, reordered, and deleted freely here and nowhere else. **Once sent, the set is frozen**, and the composer says so before the send and not after.

The same composer chooses who the set goes to:

- **These applicants**, ticked from the filtered tracking list. Sending to more than one shows exactly who will receive it first, per the same rule 8.5 applies to bulk invites. This reaches real people, and each task is frozen the moment it is written.
- **This posting, from now on**, which stores the set on the posting. It raises a task automatically for everyone who applies after that. The posting list should show which roles carry a set. It is a thing an applicant is asked, and it is not visible on the posting itself. Editing it changes only what the next applicant is asked, and tasks already raised keep the set they were sent with.

Answers come back on the tracking row beside the question each one answers, and never as a bare list of values. An admin reading it a month later does not have to work out what was asked. An answer is shown with the label in the admin's own language, resolved from the option value.

**Accepting and rejecting.** A job poster moves a row to `accepted` or `rejected` from the same status control as every other step, with the optional note. Both write an event row like any other change. Three rules go with them:

- **Neither touches the cooldown**, per 7f. The applicant serves out whatever period they were already serving. A rejection is not a waive.
- **Both raise a `notice` task on the applicant**, per 7g, so they find out. The poster writes the message, and there is no template. "We have gone with somebody else" written by a person reads better than anything a dropdown produces. A rejection is the one message on this site most worth writing properly. Phase 11 also pushes it to Telegram for an applicant who linked an account, per section 15. The task is the record either way.
- **Accepting closes that posting to that applicant for good**, per 7f. Rejecting closes it only until the cooldown runs out. Neither changes the posting's own status or its openings count: an admin closes a filled role themselves, from 8.2.

   Show any open task inline on the tracking row. An admin can then see at a glance who has been asked for something and has not come back. Add a timeline of status history, bulk status change on selected rows, and CSV export of the filtered set. Each job row links out to its response sheet, so admins can read the actual answers in Google Sheets.
4. **Analytics**: per job funnel from `gftvjobs_analytics`. Views, apply clicks, answered yes, answered no, and still pending or timed out, with a click to yes conversion rate. Pending and timed out rows count as not applied, so the rate is a floor and not an estimate. The page should say so. Break the yes count down by `answer_source`, so confirmed submissions are distinguishable from self reported ones.

   Show the average posting rating from `gftvjobs_ratings` alongside the funnel, with the response count next to it. Suppress the average entirely below three ratings, so a single opinion does not read as a verdict. Add a sortable table across all jobs, plus a detail view per job with a simple bar or line chart over time. Flag any job with a high click count and a low yes rate. That usually means a broken or closed Google Form, and not a bad posting. CSV export.
5. **Invites and shortlists**: from a posting or from an applicant record, invite one or more applicants to a specific job with an optional note. Also mark an applicant against a posting without notifying them, for internal shortlisting. Invited applicants appear on the posting with their invite status, and the applicant list shows what each person has been invited to. Bulk invite from a filtered applicant list, with a confirmation step showing exactly who will be contacted. This sends real messages. Withdraw an invite, which stops further reminders and leaves the record.
6. **Departments**: simple CRUD, with the name and description edited as an English and Mandarin pair. A department cannot be left active without a Chinese name. It appears on every job card and in the search filters.
7. **Tags**: list with usage counts and search. Create, rename, recolour, and delete, where deleting warns how many postings will lose the tag. Merge two tags into one, moving all job links across and removing the duplicate. Find and clean up orphan tags with zero postings. In the job editor, tags are added through a type-ahead. It matches existing tags first, and only offers to create a new one when nothing matches. The tag list then does not fill up with near duplicates.
8. **Admin users**: list of the gftvhello accounts that can access this portal. Grant or revoke portal access, and see 2FA enrolment status and last login. **Admins only**, including the list itself: who else can reach the dashboard is not a job poster's business. Show each account's role, per 10 item 2, and what that role opens on the docs site. Granting somebody editor access and expecting them to read the developer guide is a mistake that is easier to make than to notice. Account creation for the gftvhello realm still belongs to the main gftv.asia portal, and is not built here.

   Password reset is the exception, and only through 5g. A staff member sets their own new password with a recovery code plus their second factor. That writes `gftvhello_users.password_hash`, and therefore changes their gftv.asia password too. The flow says so on screen. This page does not offer an admin a button to reset somebody else's password. The assisted path for a staff member who has lost everything stays at gftv.asia.
9. **Applicant users**: list of `gftvjobs_users` with search, view profile and application history, deactivate or reactivate. **Admins only**, all of it. A job poster works with applicants through the tracking page in 8.3, and has no business in the account itself.

   **Deactivating is the ordinary action and is reversible.** It suspends sign in and keeps every row. Permanent deletion is also available, admins only and behind the three step confirmation in 7g. It does exactly what the applicant's own danger zone does. Somebody will ask to be deleted, and the dashboard should be able to honour it. Everything 7g says about that cascade holds here too. The analytics rows stay with `applicant_id` null, and the translation reports stay with `reporter_id` null. The Storage objects have to be removed by hand of the cascade, per AVATARS.md.

   **An admin may set an applicant's password**, which reverses the earlier rule that nobody could. Three things go with it and none is optional. It is admins only. It writes an audit row with a required reason. And it revokes every session and trusted device on that account. Say plainly on the page what this costs. It is the one action in the build that breaks non repudiation. Once an admin can set a password, the audit log can no longer prove that the applicant did something themselves. **Never display an existing password.** That is not a limitation but a fact, since only a bcrypt hash is stored.

   Two assisted recovery actions remain for people locked out with no codes left. Both are logged with the admin's id and a required reason. They are forcing a password reset on next login, and unlinking Telegram after verifying identity out of band. Both revoke every session and trusted device for that account. Prefer them to setting a password, and say so on the page.
10. **Settings**: portal title, hero copy, featured job selection, application open or closed global toggle. The portal title and hero copy are edited in both languages.
11. **Translations**: the queue of applicant reported translation problems from 7h, and the tooling to act on them.
    - List of reports with filters by status, by language, and by what they point at. Open ones first, newest first. Show the report, the suggested wording where there is one, who raised it, and when.
    - Opening a report shows the current wording beside the suggestion. An admin can then see exactly what would change, without opening the posting in another tab. From there, edit the wording inline. Mark the report accepted while it is being worked on, then fixed. Or reject it with a required reason.
    - **A resolution always requires a note**, including a rejection. The reporter took the trouble to tell you, and closing it silently teaches them not to bother next time. The database enforces this, and not the interface alone.
    - A "needs translation" view, per language. It holds every posting, department, and tag with no translation. It also holds every translation drafted but not marked ready, and every translation whose optional fields are thinner than the source. The last of those is the case no constraint can catch, since it compares across two tables. That is exactly why it needs a view. This is what stops a draft sitting half translated indefinitely.
    - Reports against an interface string carry the dictionary key, and never a row id. Fixing one means editing `assets/i18n/zh.json` and deploying, and never changing a database row. So the admin view links to the key, and says plainly that it is a code change. Do not build an interface string editor.
    - Show the count of open reports in the admin sidebar, so the queue is visible without going looking for it.
    - **Translation helpers**, per 7i. The list of granted helpers by language, granting and revoking with a required reason, and what each has drafted. Granting is what turns a community member into a contributor. So it belongs beside the queue their work arrives in, and not buried in applicant users.
    - Annotations and form reports share one queue, distinguished by origin. An annotation shows the quoted text in place, with the suggested replacement beside it. A suggestion whose anchor can no longer be found is shown as detached, and never dropped.

12. **Maintenance**: the switches from 0c, on one page. It is built in phase 7, ahead of the rest of the settings in 8.10. A lever for turning a broken feature off is worth having before the phases that add the most surface.

    - A list of every key in the feature map whose phase has shipped. Each carries a switch, its current state, and where in the site it appears. A feature that has not shipped is not listed. It is already off, and offering to turn it off again is noise.
    - Turning one off asks for an optional note. It is public, and is shown to applicants exactly as typed. Prefill nothing and suggest nothing: an admin who has just broken something writes a better sentence than a dropdown does.
    - Show when each override was set and who set it, and write an audit row both ways. Turning a feature back on is as much an event as turning it off. An outage nobody recorded the end of is one nobody can measure.
    - **The denylist is in code and is not editable here.** It covers sign in and registration in both realms, and anything this page itself needs. Show them greyed with the reason. An admin looking for the switch then finds out why there is not one, instead of concluding the page is broken.
    - **This is not the applications toggle from 8.10, and the two are never merged.** `applications_open` is a policy choice: we are not taking applications at the moment. A maintenance flip says something is broken. They read completely differently to an applicant. The one thing somebody turned away actually wants to know is which of the two it is.
    - The page states plainly that an override survives a deploy, because it is a row and not a file. It also states that nothing turns itself back on. A feature left off is left off until somebody comes back for it.

Every admin API route must verify the staff session server side and re-check the access flag on each request. Never trust a client-side role value.

### 8a. Admin documentation (moved to the docs site)

**This section used to specify an in-portal manual at `/admin/docs`, served from `main-site/api/_admin-docs/`. It does not any more.** The staff documentation lives on the docs site, per section 16, and the page list that was here has moved to 16h.

The reason 8a gave for keeping the admin guide out of the docs site was that the docs site was public. An admin guide describes screens full of real applicants. That reason held exactly as long as the docs site had no login. It now has one, with the same accounts, the same second factor, and the same access check. So the guide is behind a staff session either way, and the argument no longer picks a side. What does pick a side is that one manual in one place, with one search index and one screenshot pipeline, beats two that quietly disagree.

What remains here:

- **`/admin/docs` stays as a route and becomes a redirect** to the docs site's staff section. It carries the reader to the equivalent page where there is one, and to the staff index where there is not. Anyone who has bookmarked it, and any link written into the dashboard before the move, keeps working.
- **The admin sidebar links out** to the docs site, instead of opening an in-dashboard reader. Mark it as leaving the portal, since it is a different host and the reader signs in there separately, per 5h.
- **Do not build `main-site/api/_admin-docs/`.** If it already exists, remove it, along with its `includeFiles` entry in `vercel.json` and the `api/admin/docs` route in section 9. A second copy of the manual is the thing this change exists to avoid.
- The screenshots that were to be written into the portal's admin asset directory now go into the docs site's gated content, per 16g. The seeded data rule is unchanged and is not negotiable. A leaked admin screenshot is a leaked list of applicants.

## 9. API design

RESTful routes under `main-site/api/`, grouped:

- `api/auth/staff/*`: login, verify-2fa, logout, session, trusted-devices (list, revoke, revoke all)
- `api/auth/applicant/*`: register, login, logout, session, profile, change-password. Then forgot-password (verify a recovery code) and reset-password (consume the ticket). Then recovery-codes (generate, count remaining) and trusted-devices (list, revoke, revoke all)
- `api/public/*`: jobs list, job detail by uuid, slug to uuid lookup for the redirect, departments, tags, search, suggest
- `api/applications/*`: start, respond, pending, list mine, withdraw. Start logs the analytics row, upserts the tracking row, and returns the prefilled form URL and the analytics row id. Respond records the yes or no answer, and sets the cooldown on a yes. Pending returns any unanswered prompts for this applicant.
- `api/saved/*`: save, unsave, list mine
- `api/ratings/*`: upsert a rating for a job, from the modal in 7c
- `api/translations/*`: report a problem, list my own reports
- `api/tasks/*`: list mine (unioned with pending apply prompts), get one, reply, dismiss a notice, unread count for the badge. A reply carries the answers to the task's questions as well as the free text. The endpoint validates them against the question set stored on that task, per 7g. Every required question must be answered. Every choice and checkbox answer must be one of that question's own option values. Nothing may name a question the task does not carry. It is the only thing that may. The browser was sent the questions and cannot be trusted to send back an answer to one of them.
- `api/telegram/*`: create a linking token, poll link status, unlink, toggle 2FA, request a login code, verify a login code, consume a magic link
- `api/invites/*`: list mine, mark seen, decline
- `api/account/danger/*`: verify password, then the individual destructive actions
- `api/webhooks/form-submit`: the Apps Script integration described in section 13
- `api/admin/*`: jobs, applications, analytics, tasks, invites, departments, tags, tag-merge. Then users, admins, stats and export. Then translations, which is the report queue and the needs-translation audit, per 8.11. Then maintenance, which reads and flips the feature overrides, per 8.12. There is no `api/admin/docs`: the manual moved to the docs site, per 8a.
- `api/public/feature-status`: the maintenance overrides, read by anybody, cacheable for a short window and never longer. It carries only which shipped features are currently off, and the public note on each. The phase list stays in `build-status.json` and is not duplicated here. This is the one thing the browser needs that the static file cannot answer. It is deliberately separate, so a failure to read it leaves the site working with everything on, and never blank.
  - Every route behind a flippable feature checks the same override server side and answers 503 with the maintenance sentence, per 0c. The check belongs in a shared helper beside `api/_lib/settings.js`, called by each guarded route. Then what is flippable is a list in one file, and not a convention.
- `api/auth/staff/*` also carries the staff account settings suite in 5f. That is passkeys (list, register, rename, remove) and authenticator (enrol, remove). Then backup-codes (count, regenerate) and recovery-codes (count, regenerate). Then sessions (list, revoke, revoke all), and forgot-password and reset-password per 5g. And the danger zone actions, behind their own verify-password step.

The docs site has its own small route set under `docs-site/api/`, on its own Vercel project. It duplicates and does not share, per 5h:

- `api/auth/*`: login, verify-2fa, passkey challenge and verify, logout, session, trusted-devices. Plus the same account settings suite as above, so 5f can be mounted on both sites.
- `api/content/*`: get a gated page by key, and stream a gated image. Both check the staff session and the page's required role. Both answer 404 and never 401 for a caller who is not entitled, so a page's existence is not confirmed to anyone probing.
- `api/search-index`: the gated half of the search index, scoped to the reader's role. The public half is a static file.

Requirements for all routes:
- **Every endpoint that returns human readable content takes a locale**, `en` or `zh`. It returns that language in the ordinary field names. It never returns both and leaves the client to choose. A caller that sends no locale gets English. The client sends the stored preference on every request. Auth routes and anything returning only ids and timestamps do not need it.
- Validate and sanitise every input. Parameterised queries only.
- Consistent JSON error shape with proper status codes. Never leak stack traces or database errors to the client.
- Rate limit login, registration, 2FA verification, and application submission. A simple table-backed or in-memory limiter is fine, state which you chose in the README.
- Generic error text on failed login so the response does not reveal whether a username exists.

## 10. Settled decisions

1. **Applications and resumes**: handled entirely in Google Forms. The portal stores no files and builds no application form. No Supabase Storage, no uploads.

   **Amended twice since it was written, both deliberately.** The second amendment is a real reversal and not an exception. Recorded here so nobody has to reconstruct it from the code.

   - **Avatars**, per `main-site/AVATARS.md`. One small square image per account and nothing else. It remains the only file this portal stores, and "no uploads" holds everywhere else without qualification.
   - **Question sets on tasks**, per 7g, decided 21 August 2026. Four question types, a cap of twenty, answered once. A set may be sent to chosen applicants **or attached to a posting so that everyone who applies to it is asked**. That second half is a small form built and served by the portal. That is the thing the original sentence ruled out, so the sentence no longer reads literally.

   What still holds, and is what the original decision was actually protecting:

   - **The application itself is still a Google Form.** The portal collects no application, builds no application form, and stores no answers to one. A question set is asked *after* somebody has applied, of somebody whose application already exists.
   - **No files, anywhere, ever, except an avatar.** Not on a question, not on the free text box. Resumes and portfolios go through the role's Google Form.
   - **No scoring, no ranking, no gating.** Answers are read by a person. Nothing in the portal computes anything from them, and no part of the applicant's access depends on having answered.
   - **The cap is the boundary made enforceable.** Twenty questions is enough for a real follow up and far too few for an application. It is what stops this growing into an application, one question at a time.

   A set may one day need to be longer than the cap, need a file, or need answering before applying. The answer is still the Google Form, and this decision has not moved that far.
2. **Admin access and roles.** A gftvhello account reaches the admin dashboard if `is_admin` is true **or** `is_editor` is true, and `is_approved` is true. Apply this same check on every admin API route, and on the docs site. `gftvjobs_admin_access` overrides the flag check either way, per migration `012`, and `is_approved` is required regardless and cannot be waived.

   On top of that check sits a role, which decides what the docs site shows, per 16a:

   - **`is_admin`** is an **admin**. Admins are the developers of this project and are job posters as well, so they see everything. That is the applicant guides, the job poster guide, the admin guide, and the developer guide.
   - **`is_editor` without `is_admin`** is an **editor**, which in the documentation is a **job poster**. They see the applicant guides and the job poster guide, and nothing else.
   - An account allowed in by a `gftvjobs_admin_access` override, but holding neither flag, is treated as a **job poster**. That is the lesser of the two. An override grants entry, not seniority, and the safe reading of an ambiguous grant is the smaller one.

   The role is derived server side on every request from the same row that decides access. Never send a role to the browser and trust it back, and never gate a docs page on a role the client claims.

   **An admin has full control over everything this portal configures.** That is every posting whoever wrote it, every applicant, every application, and every task. Then every department and tag, the portal settings in 8.10, the maintenance switches in 8.12, and the translation queue in 8.11. A job poster's work is not private from an admin and an admin may override any of it. **The `is_ready` flag is not on this list**, amended 4 September 2026 in phase 14 part 6. No helper may set it, and any staff account may, per 7i as amended. Deviation 131.

   **What only an admin may do**, which is the same list stated from the other side. It is what the dashboard hides for a job poster, in place of disabling it:

   - Permanently delete a posting, per 8.2, and permanently delete an applicant account, per 8.9. Both behind the three step confirmation in 7g.
   - Anything on the applicant users page in 8.9 at all, including setting a password.
   - Grant and revoke portal access, per 8.8.
   - The portal settings in 8.10 and the maintenance switches in 8.12.
   - Mark a translation ready, per 7i.

   **Full control stops at this portal's own data, and one boundary is not negotiable.** Section 2 forbids writing to any `gftvhello_*` table, so `is_admin` and `is_editor` are read here and set at gftv.asia. Those accounts are shared with another system this portal does not own, and a flag flipped here would change somebody's access over there. Portal access is granted and revoked through the `gftvjobs_admin_access` overlay instead, which is what that table exists for. An admin who needs to make somebody an editor does it at gftv.asia. The dashboard says so, instead of offering a control that cannot work.
3. **Notifications**: no email, ever, and no email dependency. In-portal is the baseline and always works. Telegram is an additional delivery channel for applicants who link an account, per section 15, and never the only record of anything.
4. **Telegram sends all three kinds**: `invite`, `task_raised`, and `application_status_changed`. All three ship in the first version, each individually toggleable by the applicant through `notify`.
5. **Both sign in paths stay**: the six digit login code and the magic link, exactly as set out in section 15. The magic link is a full login and not a second factor, and its browser binding is not optional.
6. **The nine commands in section 15 are the full set.** They are `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs` and `notify`. No `help`. Do not add commands without asking.

7. **The site is multilingual**, English and Simplified Chinese today and built to take Malay and Tamil without a schema change, per 3a. The language lives in `localStorage` only and never in the URL, which costs Chinese-language search discoverability and `hreflang`. That is accepted. GFTV is **国际兽视** and the portal is **国际兽视入队平台**. Tag slugs and department slugs are not translated.
8. **Applicants are the translation correction loop**, per 7h. Nobody on the GFTV side necessarily reads both languages well enough to catch a bad posting first. So reporting is quiet, easy, and always answered with a note.

9. **The docs site has a staff login**, per section 16, and what a reader sees depends on their role per item 2. It signs staff in itself, with its own functions, its own cookie, and its own session table. It never borrows a session across two origins, and never widens a cookie to the parent domain.

10. **The staff manual lives on the docs site, not in the portal.** Section 8a's `/admin/docs` becomes a redirect. One manual, one search index, one screenshot pipeline.

11. **Passkeys are the second factor in both realms**, shipped in phase 2 and documented after the fact in 5e. One relying party id across both sites, so a staff member enrols once. The password is still required at every login and this does not become passwordless without a decision.

12. **Staff get account recovery codes**, per 5g, and they set a gftvhello password. This is a deliberate exception to two rules. Section 2 forbids writing to `gftvhello_*` tables, and 8.8 says password reset belongs to gftv.asia. It was chosen with that conflict stated. It covers `password_hash` and nothing else, it changes the account's gftv.asia password too, and the flow says so on screen.

Anything else that is ambiguous, stop and ask me instead of assuming.

## 11. Scheduled maintenance

Add a Vercel cron function that runs daily:

- Auto-close any `published` job whose `closes_at` is not null and has passed, setting status to `closed` and writing an audit row. Jobs with a null `closes_at` are skipped entirely and never auto-close.
- Health check each published job's `application_form_url` with a HEAD or lightweight GET. The form may be deleted, private, or no longer accepting responses. Flag the job in the admin list with a warning badge, instead of unpublishing it silently.
- Resolve `gftvjobs_analytics` rows still pending after 14 days to `no_response`.
- Delete expired rows from `gftvjobs_sessions`, `gftvjobs_trusted_devices`, `gftvjobs_password_resets`, `gftvjobs_telegram_tokens`, and expired `gftvhello_totp_challenges`. Do not touch `gftvhello_sessions` rows belonging to other portals beyond normal expiry cleanup.
- Delete `gftvjobs_status_days` rows older than ninety days. Delete `gftvjobs_status_incidents` rows that started before then **and have ended**, once those tables exist in phase 12. An open incident is never swept whatever its age: it is still the current state of that target as far as anything here knows. This is a small sweep by design, four day rows a day. It is done because the page draws exactly ninety days, and anything older is weight nothing reads.
- Surface the last cron run time and its results on the admin overview.

## 12. Inspiration notes

I found `github.com/JunRong19/SG-Jobs-Dashboard`. It is the job seeker side of the market, and not the employer side. It is Next.js, React, TypeScript, and Tailwind, so do not copy its stack. Only these ideas carry over, and they are already folded into the sections above:

- Bucketed status views with live counts as the primary navigation for a pipeline, in place of a single table with a filter dropdown.
- Quick toggles for recency next to the search box.
- Automatic expiry of stale postings plus a periodic check that the linked posting is still live.
- A documents library and AI resume scoring are out of scope here, since the portal holds no resumes and Google Forms owns the answers.

## 13. Google Apps Script submission webhook

Build this. It is a small amount of code and it turns `did_apply` from a self reported claim into a recorded fact. The handoff modal in 7c stays exactly as specified, since not every submission will be matched. The webhook becomes the authoritative source when the two disagree.

### What it does

An Apps Script bound to each job's Google Form fires on submit. It posts the respondent's email, the job id, and the response id to the portal. The portal matches the email to a `gftvjobs_users` row and marks the application as genuinely submitted.

Only the email, the response id, and the timestamp are sent. The answers themselves never leave Google, which keeps the portal free of application content exactly as decided in section 10.

### Portal side

Add a table:

- `gftvjobs_form_submissions`: id uuid pk, job_id references `gftvjobs_jobs`, form_response_id text not null. Then email text not null, submitted_at timestamptz not null. Then matched_applicant_id uuid references `gftvjobs_users` on delete set null, received_at timestamptz default now(). Unique constraint on (job_id, form_response_id), so a retried delivery is idempotent.

Add `POST api/webhooks/form-submit`, enabled by default:

1. Compare the `x-portal-secret` header against `FORM_WEBHOOK_SECRET` using a timing safe comparison. Return 401 on mismatch and log nothing sensitive.
2. Validate the payload shape. Return 400 on anything malformed.
3. Insert into `gftvjobs_form_submissions`. If the unique constraint fires, return 200 and stop, since that is a duplicate delivery, not an error.
4. Look up `gftvjobs_users` by email, case insensitively.
5. On a match, take the applicant's most recent `gftvjobs_analytics` row for that job, pending or already resolved to No or timeout. Set it to `did_apply` true and `response_state` answered, and record that the source was the webhook and not the applicant. Move the `gftvjobs_applications` tracking row to `submitted`. Set `applied_at` and `cooldown_until` per 7f if they are not already set, and write an event row attributing the change to the webhook. If no analytics row exists, because they reached the form by a shared link, create the tracking row anyway.
6. On no match, leave `matched_applicant_id` null. Surface the row in the admin analytics page under an "unmatched submissions" list, so an admin can link it by hand. Someone applying with a different email than they registered with is the normal cause.
7. Always return 200 for anything that is not an auth or validation failure. Apps Script retries are noisy and a 500 helps nobody.
8. Rate limit the endpoint and cap the payload size.

`answer_source` on `gftvjobs_analytics` records what produced the answer. The admin analytics page can then show how much of the funnel is self reported and how much is confirmed. A webhook confirmation overrides an earlier No or a timeout, since a recorded submission beats silence or a misclick.

### Form side

One script per form, pasted into Extensions then Apps Script on the Google Form:

```javascript
// Set PORTAL_SECRET and JOB_ID in Project Settings, Script Properties.
function onCareersFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const answers = {};
  e.response.getItemResponses().forEach(function (r) {
    answers[r.getItem().getTitle()] = r.getResponse();
  });

  const payload = {
    job_id: props.getProperty('JOB_ID'),
    form_response_id: e.response.getId(),
    email: e.response.getRespondentEmail() || answers['Email'] || answers['Email address'] || '',
    submitted_at: e.response.getTimestamp().toISOString()
  };

  UrlFetchApp.fetch('https://careers.globalfurry.tv/api/webhooks/form-submit', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-portal-secret': props.getProperty('PORTAL_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// Run once after copying the form.
function installCareersTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCareersFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onCareersFormSubmit').forForm(form).onFormSubmit().create();
}
```

### The setup cost, stated plainly

The code is short. The friction is that a form submit trigger is per form, so every new posting means a small setup step. Keep it to about two minutes:

- Maintain one template form with the script already inside it. Container bound scripts travel with a form copy, so copying the template carries the code over. Triggers do not copy, which is why `installCareersTrigger` exists as a one time run.
- Per new job: copy the template, edit the questions, set `JOB_ID` in Script Properties to the posting uuid, run `installCareersTrigger` once, authorise it.
- Put this checklist in the admin job editor as collapsible help text, next to the Google Form URL field. Show the posting uuid there with a copy button, so nobody has to go hunting for it.

### Fallbacks

- If the webhook is never installed on a given form, nothing breaks. That posting simply relies on the applicant's own yes or no answer, and the admin analytics page marks its numbers as self reported.
- Add an admin action to manually mark a tracking row as submitted, for the unmatched-email case.
- Document the whole setup in the root README, including how to rotate `FORM_WEBHOOK_SECRET`.

## 14. Offline behaviour

The site must be a fully installable PWA that stays useful with no connection. Be honest about the split: browsing, reading, and reviewing work offline, while anything that touches an account or Google Forms needs the network. Do not fake the parts that cannot work.

### Works offline

- The full app shell: home, `/search`, job detail, account pages, styles, fonts, icons, and the offline fallback page.
- Every posting already opened, readable in full from cache, whether or not anyone is signed in.
- The last successful `/search` result set, including its filters and tags, so the board is still browsable. Mark it with the time it was cached.
- Saved jobs, My applications, and the outstanding tasks list, from a local copy of the applicant's own data. Replying to a task queues like any other action.
- The rating stars and the Yes or No answer in the handoff modal, queued locally and sent when the connection returns.

### Needs the network, and says so plainly

- Signing in, registering, and 2FA. Show a clear offline state on those forms, instead of letting a submit fail silently.
- Opening a Google Form, so the Apply button is disabled offline with the reason given.
- The admin dashboard. Cache its shell only, and show an offline notice instead of stale management data. Never let an admin act on a cached view of applications.
- Anything that would show another person's data.

### Caching strategy

- Precache the shell and static assets on install, keyed by a build version constant at the top of `sw.js`. **Bump it on every change to the site.** Not once per phase, and not only when `sw.js` itself changes, or returning visitors keep the previous build.
- Precache **both** `assets/i18n` dictionaries, not just the active one. They are small, and an applicant who switches language offline should not be met with an untranslated page.
- A cached posting is cached in both languages, since the API returns one language per request. Either cache both responses or cache the posting once with both languages present; do not let switching language offline empty the page.
- Static assets: cache first.
- Public job data, meaning listings, postings, departments, and tags: stale while revalidate. Serve the cached copy instantly, refresh in the background, and update the view if the data changed.
- Authenticated endpoints, sessions, and everything under `api/admin`: network only. Never put an authenticated response in the Cache API. The cache is shared per origin, and this is a portal with two account realms, on a domain that already hosts other GFTV apps.
- Store the applicant's own data in IndexedDB instead, in a store keyed by their user id, and clear it completely on logout. On login, if the stored user id differs from the one signing in, wipe the database before writing anything.
- Cap the cached postings at a sensible number, around 100, and evict least recently viewed first.
- Serve `sw.js` with `Cache-Control: no-cache` in `vercel.json`, or a stale service worker will pin an old build indefinitely.

### Queued actions

- Queue the modal's rating and its Yes or No answer in IndexedDB when offline, with the analytics row id, the intended value, and a timestamp.
- Flush the queue with the Background Sync API where available. Everywhere else, flush it on the next page load with a connection, since Safari does not support Background Sync.
- Make every queued action idempotent so a replay cannot double count. The server already keys on the analytics row id, so a repeated answer overwrites and does not stack.
- A queued answer still counts as pending until the server confirms it. Do not start the reapply cooldown from a local queue entry.
- Show queued items in the UI as awaiting sync, and never as done. Reconcile against the server response when it lands.

### Interface

- A persistent but unobtrusive offline banner when the connection drops, using `navigator.onLine` plus `online` and `offline` listeners. Remove it the moment connectivity returns.
- Any cached view carries a quiet "last updated" timestamp so nobody mistakes an old board for the current one.
- Controls that cannot work offline are disabled with a reason on the control itself, never a dead button that fails on click.
- An offline fallback page for an uncached route, offering the cached postings and saved jobs as somewhere to go.
- An update prompt when a new service worker is waiting, letting the applicant reload. Never swap the page under them. Use `skipWaiting` and `clients.claim` only behind that prompt.

### Manifest and install

- `manifest.json` with the Careers@GFTV name and short name, and `standalone` display. It carries the GFTV theme and background colours from `gftv-theme.md`, maskable icons at 192 and 512, and `start_url` of `/`.
- Add `/search` as a shortcut, and `/account/tasks` as a second one.
- Test installability and the offline paths in Chrome and on Android. Verify the offline fallback works on iOS Safari, where service worker support is real but stricter.

## 15. Telegram bot (`telegram-bot/`)

Build a Telegram bot in a new `telegram-bot` directory in this same repo. Base it on the scripts in `main-site`, so the two agree on the schema and the flows. It runs on my Debian 13 VPS under tmux, with GitHub for version control.

### Build conventions

- Telethon, Python. Not python-telegram-bot, not aiogram.
- Bot username is `careersgftv_bot`. Never mention the bot's name inside any command text or reply.
- Include a `README.md` explaining what the bot is and how to use it. Include a `setup.md` covering BotFather setup, with the about text, description, and command list. And a `.gitignore`.
- Deliver every file individually. No zip.
- SQLite for anything bot local: scheduling, rate limits, dedupe, and the registry of active interaction buttons, so buttons keep working forever across restarts. Store the callback payload and its meaning in SQLite, and look it up on click. Never pack state into the callback data.
- Supabase is the shared source of truth for accounts, links, tokens, invites, and the notification outbox. The bot reads and writes those directly with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. SQLite never duplicates account data.
- Prefer rich formatted replies over plain text. Avoid em dashes, and rephrase instead of leaving a sentence that only worked with one.
- Any knowledge base content, if it ever becomes relevant, comes from an open source REST API and never a hardcoded list.

### Commands

- `start` - what the bot does, the full command list, and buttons linking to the web app and the donation link. Also handles the deep link payload from `t.me/careersgftv_bot?start=<token>` for account linking and for one-tap code delivery.
- `link` - begin linking this Telegram account to a portal account, for someone who found the bot before the site.
- `unlink` - remove the link, with a confirmation button.
- `code` - send a fresh one time login code for the linked account.
- `invites` - list open job invitations with a button through to each posting.
- `tasks` - outstanding tasks count with a link to `/account/tasks`.
- `applications` - the applicant's own application list and current statuses.
- `jobs` - the newest openings, with buttons through to each posting.
- `notify` - toggle which notification kinds this account receives.

No `help` command. `start` carries that content.

### Linking flow

1. The applicant clicks "Link Telegram for 2FA" in account settings. The site creates a `gftvjobs_telegram_tokens` row with purpose `link`, stores the hash, and shows the deep link and QR.
2. They open the deep link, which sends `/start <token>` to the bot.
3. The bot hashes the payload and finds an unused unexpired row. It writes the `gftvjobs_telegram_links` row with their Telegram user id, marks the token used, and confirms in chat.
4. The settings page is polling and flips to linked without a refresh.
5. Tokens expire in ten minutes and are single use. A token that is already used, expired, or unknown gets a clear message and no detail about why.

### Login codes and magic links

- `code`, or the button on the 2FA prompt, issues a six digit code. It is valid for five minutes, single use, and stored hashed, with an attempt cap.
- The magic link variant sends a one tap button that signs the applicant in directly. Treat it as a full login and not a second factor, because that is what it is. Bind it to the browser that requested it. Store a nonce in a cookie at request time and check it on consumption, so a forwarded link is useless to anyone else. Keep its lifetime to five minutes.
- Never send a code or link to a Telegram account that is not currently linked to the account being signed into.
- Rate limit per account and per Telegram user, and back off after repeated failures. Never silently ignore them.

### Notifications

- The site never calls the bot. It writes a row into `gftvjobs_notifications` and returns.
- The bot polls that table every 15 to 30 seconds. It claims a batch by moving rows from `queued` to `claimed` in a single conditional update, so two bot instances cannot double send. It sends, then marks `sent` or `failed` with the error and an attempt count. Retry failures a few times with backoff, then leave them `failed` for an admin to see.
- Three kinds, all shipping in the first version: `invite`, `task_raised`, and `application_status_changed`. Security messages such as a password reset or a new trusted device are sent directly and never queued. They are not subject to the `notify` toggles, since silencing them is what an attacker would want. An applicant with no Telegram link gets their rows marked `skipped`, instead of left queued forever.
- Respect the `notify` toggles per kind, and always include an unsubscribe hint in the footer of a notification.
- Keep Telegram rate limits in mind. Pace sends, and handle flood wait errors by rescheduling in SQLite, instead of sleeping the whole worker.

### Invites over Telegram

- When an admin invites an applicant to a posting, the site writes the invite row and queues an `invite` notification.
- The message names the role and the department, and includes the admin's note if there is one. It carries buttons to view the posting and to decline. Declining writes back to `gftvjobs_invites`.
- An applicant with no linked Telegram still sees the invite in the portal on `/account/tasks`. Telegram is a delivery channel and never the only record.

### The status probe

Added 26 August 2026, built in phase 12, and it has nothing to do with Telegram. It lives here because of where it runs, and not because of what it does. The status page in 0c needs a prober outside Vercel, and **this VPS is the only thing in the whole architecture that is**. A loop that makes four requests a minute does not deserve a second machine. Beside it is a process already running, already holding the Supabase credentials, and already in this repository.

- A loop, separate from the bot's own event loop and able to fail without taking the bot down. If Telethon is wedged the probe should still be recording. "The bot is broken" and "the portal is down" are exactly the two things a status page has to tell apart.
- Every sixty seconds, request `/api/public/feature-status`, `/search`, one seeded posting page, and `/api/public/jobs.json`. Report all four to `gftvjobs_status_record()` in one call, with the status code, the duration, and whether each succeeded. The function keeps the day's counters and the outage rows in section 6. Public and read only, all four, so this needs no portal credential and can never change anything. **Which posting is probed is read from the public feed** and never configured, so it follows the board when the seed is cleared.
- **It writes to Supabase directly and never through the portal.** An endpoint on the portal is unreachable in precisely the case worth recording.
- **It does not alert.** No message to anybody, no channel post, no mention in any command. Alerting needs an on-call story and a decision about who is woken up, and neither exists. What this delivers is data for a page somebody chooses to look at.
- **A failure to reach Supabase writes nothing.** No local buffer and no backfill on reconnect. A gap is drawn on the page as unknown, which is true. A backfilled row timestamped an hour late is not.
- **It is not a command and it is not in the command list.** Nothing about it is visible in Telegram at all.

### Environment

Add to the bot's own `.env.example`, documented the same way as the site's:

```bash
# BotFather token for careersgftv_bot.
# Telegram, message BotFather, /mybots, select the bot, API Token.
TELEGRAM_BOT_TOKEN=

# Telegram API credentials for Telethon.
# https://my.telegram.org, API development tools.
TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Same Supabase project as the site.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Base URL used when building links back to the portal.
SITE_URL=https://careers.globalfurry.tv

# Shown as a button on the start message.
DONATION_URL=
```

## 16. Documentation site (`docs-site/`)

A separate documentation site in a new `docs-site` directory in this same repo, served at `docs.careers.globalfurry.tv`, on its own Vercel project.

It was specified as a public applicant site with nothing internal in it. It is now the documentation for the whole project, for four audiences. What a reader sees depends on whether they are signed in, and on what their staff role is. The public half is unchanged in spirit and still carries nothing internal. The rest is behind a staff login.

### 16a. Audiences, and what each one sees

Four tiers, cumulative, so each one sees everything the tier below it sees.

**1. Public, no login.** Anyone, including every job applicant.

- How to use the Careers@GFTV portal.
- How to use the Careers@GFTV Telegram bot.
- **Helping with translations.** What a translation helper can actually do, what they cannot, and how to volunteer. This is the public face of 7h and 7i, and it belongs out here and not behind a login. The person best placed to fix the Chinese has no reason to be a GFTV staff member, and no way to read a gated page. See 16h.

**2. Job poster.** Staff with `is_editor` and not `is_admin`, per 10 item 2.

- Everything public, plus the staff dashboard guide: how to use the dashboard and every feature a job poster can reach.

**3. Admin.** Staff with `is_admin`.

- Everything a job poster sees, plus the admin guide, which is the content section 8a used to hold. This is the guide to running the site as an admin. It is what `/admin/docs` was going to be.

**4. Developer.** The same accounts as tier 3. Admins are the developers of this project, so there is no separate developer flag and none is to be invented.

- Everything above, plus the developer documentation, for whoever works on this project after the people who built it. See 16h for the page list. It covers `next-steps.md` in its final state, the official banner in `gftv-official.md`, this specification, and `gftv-theme.md`. It also covers the avatars bucket, the Vercel setup, and the Playwright screenshot pipeline.

**Rules for the gate**

- **The gate is server side, on every request. A page above the reader's tier returns 404 and never 401.** Same reasoning 8a gave: a 401 confirms the page exists to anyone probing for it. Never ship a gated page as a static file with the sidebar entry hidden by JavaScript. That is not a gate at all.
- The sidebar renders only what the reader is entitled to. A signed out reader sees the three public sections and a sign in link, and never a wall of padlocks. Locked entries teach nothing and invite guessing at URLs.
- The role is derived from the session on the server, per 10 item 2, and never read from anything the client sent.
- One exception to the silence. The docs home page says plainly that staff documentation exists and is behind a sign in. Hiding the fact that a staff area exists protects nothing, since the login form is right there. And a job poster who has never been told will not go looking.

### 16b. Signing in

Per 5h. Its own functions, its own cookie, and its own session table. The same `gftvhello` accounts, the same second factor, and the same access check as the portal.

- Sign in at `/login` on the docs site, with the same two independent controls from 5d. Those are stay signed in for 30 days, and trust this device.
- Passkey first where the account has one, per 5e, with the authenticator code and a backup code as fallbacks. A passkey registered on the portal works here, because both sites share one relying party id.
- A signed in reader gets their display name and role in the header, a link to `/account`, and sign out. Show the role in words a reader recognises, "job poster" or "admin", and never a database flag name.
- Trusting a device here does not trust it on the portal, since the token cookie is host scoped. Say that next to the checkbox, instead of letting somebody conclude it failed.
- Sign in is the one part of this site that needs the network and cannot be cached. Say so on the form when the reader is offline.

### 16c. Account settings (`/account`)

The full staff account settings suite from 5f, danger zone included, mounted here and on the portal from one shared implementation.

Everything in 5f applies unchanged. Profile read only with a link to gftv.asia, password change, passkeys, and the authenticator app. Then backup codes, account recovery codes per 5g, trusted devices listed per site, and sessions with sign out everywhere. And a danger zone whose every action goes through consequences, then the typed username, then the password and a fresh second factor.

There is no delete account, because the gftvhello account is not this project's to delete. Say so and link across.

### 16d. Design language

Follow GitBook's structure and interaction patterns, with GFTV's own palette from `gftv-theme.md`. Take the layout conventions, not the branding. Never use GitBook's logo, name, or assets, and do not imply any affiliation.

**This covers the whole site, not just the public half.** The staff guides, the developer guide, the login form, and the account settings page in 16c are all GitBook shaped. Same three column layout, same sidebar, same on-page contents, same callouts, same type scale, same calm. The staff half is documentation that happens to need a session. It is not an admin panel with pages in it, and it must not start looking like one. The portal's dashboard has its own look, borrowed from the gftv.asia link shortener per section 8. Do not bring that here.

The two pages with no article to hold are sign in and account settings. They render inside the same shell all the same, header and sidebar included, with the content column carrying a form where the prose would be. Keep the callouts, the spacing, and the type scale there too. Signing in then feels like part of the same site, and not a detour through a different one.

- Three column layout on desktop. A fixed left sidebar with collapsible sections, and a centred content column of roughly 720 to 800px. Then a right hand on-page table of contents, highlighting the current heading while scrolling.
- Below 1024px the right hand contents column drops to a collapsible block above the content. Below 640px the left sidebar goes behind a hamburger button, as an off canvas panel, following the shared rules in section 3. Search stays in the header at every width, and is never hidden inside the menu. Search is how people navigate documentation on a phone.
- Code and command blocks scroll horizontally within their own container on small screens, never pushing the page sideways.
- Sticky header with the site name, a search field, and a link across to the portal itself. Then the light and dark toggle, **a language control**, and the account control from 16b. That last is a sign in link, or the reader's name and role with a menu to `/account` and sign out. The account control keeps its place at every width, and never goes inside the hamburger. That is the same reason search does not: a reader who cannot find how to sign out assumes they have not. **The language control keeps its place for that reason again**, added 3 September 2026 alongside 16f. A reader who cannot find how to change the language concludes there is nothing to change. On this site there is no other way to arrive in their own, since the choice cannot travel from the portal.
- Generous whitespace, and quiet hairline borders in place of shadows. A restrained type scale, and comfortable line length and line height. GitBook reads calm, so match that instead of making it dense.
- Breadcrumbs above the page title, and previous and next page links at the foot of every page.
- Anchor links that appear on heading hover and copy a link to that heading.
- Callout blocks in four flavours: note, tip, warning, and danger. Use them sparingly.
- Collapsible details blocks, and tabbed blocks for anything that differs between desktop and mobile.
- Code and command blocks with a copy button, used mainly for bot commands.
- Two axis theming exactly as the main site, same tokens, same `data-color-theme` and `data-mode` attributes, light default, WCAG AA in every combination.

### 16e. Content, in two pipelines

Every page is markdown with front matter. The front matter carries a required `access` key of `public`, `poster`, `admin`, or `developer`. That key is the only thing that decides which pipeline a page goes through, and who may read it. **Fail the build on a page with no `access` key.** A page whose tier was forgotten must not default to public. Defaulting to gated instead just means a page nobody notices is missing.

The two pipelines exist because a gated page cannot be a file on the CDN. Anything in the static root is world readable no matter what the interface does. That is the same reason 8a gave for keeping the admin guide out of `main-site`'s static tree.

**Public pages.** `docs-site/content/`, converted to static HTML at deploy time by a small Node script using the shared layout, and emitting `search-index.json`. This stays a deliberate exception to the no build step rule, for the reason already given. Hand maintaining a shared sidebar and header across thirty files is how documentation rots.

**Gated pages.** `docs-site/api/_content/`, where Vercel will not serve them statically. They are added to `includeFiles` in the docs site's `vercel.json`, so the function can read them. They are served by `api/content/*` per section 9, which checks the session, reads the page's `access` key, and either returns the markdown or 404s. They render client side inside the same shell, so the sidebar, header, and theming come free, and there is one layout and not two.

- The two pipelines share one layout, one sidebar component, one table of contents, and one stylesheet. A reader must not be able to tell which pipeline a page came from.
- Images for gated pages live beside them and stream through the same authenticated route. A gated page with a public screenshot is a leak with extra steps.
- **Search is split the same way.** The public index is a static file. The gated index is served per role by `api/search-index`. It is built at deploy time into one file per tier, and never merged into the public one. Check it. A public reader must not be able to find a developer page's heading in search, which is exactly the mistake a single index makes easy.
- Match on title, headings, and body text. Show the matching heading in the result, and jump straight to the anchor. No third party search service, on either half.
- Every page carries a last updated date taken from git.

**Translations live in Supabase, and the English stays in the files.** Settled 3 September 2026, when 16f made the whole site bilingual. This is 3a's shape applied to guides. The file is the base row, and every other language is a row in `gftvjobs_docs_translations`. That table is keyed by the page's path and its locale, and carries the translated title, summary and body.

Five things follow, and the first two are the reason it is written down here at all. The fifth was added later the same day, when the Telegram bot's `/docs` was settled and somebody asked where a page reaches Supabase from:

- **The `access` key stays in the file and is never in the table.** Whoever may read a page is decided by exactly one thing. A translation row that could carry its own tier would be a second answer. The whole two-pipeline arrangement exists to have one answer to that question. A translation of a gated page is served by the gated route, and a translation of a public page is built into `dist/`. The row never decides which.
- **A page with no translation falls back to English with a notice**, exactly as a posting does under 3a. A translation is shown only when its row says it is ready. Half a translated page is never shown.
- **The build reads the table, so a deploy needs the database.** That is new, and it is the cost of this choice. Until now `node scripts/build.js` needed nothing but the repository. A build that cannot reach Supabase must fail loudly, and never quietly emit an English-only site. A site missing every translation is the failure that looks like success.
- **Editing a translation still needs a deploy for the public half**, because those pages are files in `dist/` written at build time. The gated half reads the table per request and does not. That asymmetry is a consequence of the two pipelines, and not a defect. Whether the public half should fetch its translation in the browser instead is phase 14's to settle. It trades a rebuild for a request on every page view.
- **Anything outside Vercel that wants a page needs the English put somewhere it can reach**, which the arrangement above does not do. The translation table carries every language except the one the file holds. The Telegram bot's `/docs` is the first such reader. The build mirrors the public pages into `gftvjobs_docs_pages` for it, one direction, at deploy time. The files remain the base row for the site and for the mirror alike. The mirror is never a place a page is written or edited. It carries no `access` key, for the same reason the translation table does not.
- Sub navigation lists the pages in order, with previous and next links at the foot of each. Previous and next never point at a page the reader cannot open.
- Since the staff half is behind a login, it can be specific in ways the public half cannot. Real procedures, real edge cases, real warnings. **Still no secrets.** No environment variable values, no keys, no tokens, no Google Form URLs, and no real applicant data. "Behind a login" is not "safe to paste a service role key into".

### 16f. Language

**The whole site follows 3a**, public half and staff half alike, and ships in every language the portal ships in. Revised 3 September 2026.

This section previously kept the staff half in English only. It asked for a note at the top of the staff index saying so. It argued that translating a manual which changes with every phase costs more than it returns, for an audience that is small and known. That reasoning was right about the cost and wrong about the audience. A job poster is staff, and 3a's argument for the portal is the argument here. This is not a partial translation of a mostly English site. A poster who reads 华文 should get the same manual as everybody else, instead of the one guide that was cheap to translate.

The cost it named is real and is accepted. A guide that changes with a phase is re-translated with that phase, and the phase is not done until it is.

- The interface chrome is `docs-site/assets/i18n/`, one dictionary per language, exactly as the portal's. Phase 13 part 6a landed English and 华文 together, at 242 keys. 175 of them were lifted from the portal unchanged, because they were already its own strings. Phase 15 adds Malay and Tamil to that directory and to `LOCALES`, and to nothing else.
- The language control sits in the header, per 16d, and a reader's choice is stored against this site's own origin. **It does not carry from the portal and cannot.** `localStorage` is per origin, and the one mechanism that would cross is a cookie on `.globalfurry.tv`. 5h forbids that, because the parent domain carries other GFTV apps. The first page a reader sees is English whatever they chose next door, and the control is how they say otherwise.
- Guide content is translated per 16e. A page with no translation falls back to English with a notice, exactly as a posting does under 3a.

### 16g. Screenshots

Screenshots are captured with Playwright, not by hand.

- Put a capture script in `docs-site/scripts/`, with its own `package.json` and Playwright config. Scope both to `docs-site`, so it never becomes a dependency of the portal build.
- It runs on demand against a local or staging instance. Never as part of the Vercel build, and never against production. Vercel cannot run browsers on a build anyway, and production holds real applicant data.
- Drive it from a manifest file listing every shot. Each entry carries the page path, the viewport, and the theme and mode. Then the element to wait for before capturing, whether to capture full page or a single selector, and any region to mask.
- Log in using accounts and postings created by the seed script. Every screenshot then shows invented people applying to invented roles. No real applicant, email, or Telegram handle ever appears in the docs.
- The same script captures the staff guide shots. It writes those beside the gated content in `docs-site/api/_content/`, and never into the public output. Seeded data only there too, since a leaked admin screenshot is a leaked list of applicants. The manifest entry names the tier. A shot for a gated page that lands in the public directory is a build failure, and not a review comment.
- Never capture a screen showing a live recovery code, backup code, login code, linking token, or Google Form URL. Where a page like that needs illustrating, seed a fake value. Say in the caption that it is an example.
- Capture at a desktop width and a phone width, in light and dark mode. The docs can then show the hamburger navigation and mobile layouts described in section 3.
- Make runs deterministic. Disable animations and transitions, and freeze or mask relative dates and any "last updated" text. Mask anything else that changes between runs. A screenshot set that produces a diff on every capture stops being reviewable.
- Output to `docs-site/public/screenshots/`, with predictable names built from the manifest entry. An example is `portal-search-desktop-light.webp`. Convert to webp and keep them committed, since the docs need them at build time.
- Until the first capture run, render clearly marked placeholder slots, with the intended alt text and caption in place. A missing image then reads as pending, and not as broken.
- Document the whole thing in the `docs-site` README. How to seed, how to run a capture, how to add a shot to the manifest, and how to re-run just one.

### 16h. The pages, tier by tier

Four guides, one per tier, each a top level section in the sidebar. The sidebar stays able to take another section later without rework.

#### Portal guide, page by page (public)

- What Careers@GFTV is, and what you need to apply.
- Creating an account, and what happens after (no approval wait, no email verification).
- Signing in, including the stay signed in and trust this device options, and what each one actually does.
- Finding roles: searching, filters, tags, quick chips, and what "Open until filled" means.
- Saving roles for later.
- Applying: what happens when you press Apply, and why a Google Form opens in a new tab. Then the rating and the "have you applied" question, and what happens if you close the window without answering.
- Why you cannot reapply to the same role for three months, and what to do if you need to.
- Tracking your applications and what each status means.
- Outstanding tasks, and what to do when a team member asks you for more information.
- Account settings: profile, password, recovery codes, trusted devices.
- Recovery codes explained plainly. The two sets, what each one unlocks, and the fact that losing both the password and the codes means asking the team for help.
- Using the portal offline and installing it to a home screen.
- Troubleshooting and a short FAQ.

#### Bot guide, page by page (public)

- What the bot does and what it cannot do.
- Linking your Telegram account, both from the portal and from the bot.
- Command reference, one entry per command with what it returns. The nine are `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs` and `notify`.
- Signing in with a code versus a one tap link, and why the one tap link only works in the browser that asked for it.
- Notifications: the three kinds, how to turn each off, and why security messages cannot be turned off.
- Job invitations and how to respond to one.
- Unlinking, and what happens to 2FA when you do.
- Troubleshooting: no message arrived, code expired, wrong account linked.

#### Helping with translations, page by page (public)

The one genuinely new public section. It is written for a reader who speaks a language the portal publishes in, and who has no connection to GFTV beyond that. So it assumes nothing, and asks for nothing but the language.

- What needs translating and what does not. Postings, departments, tags, and interface wording are in scope. Tag and department slugs are never translated, per 3a: they are URL identifiers, and translating one breaks every shared link.
- **Reporting a problem, which needs no role at all.** The control on every posting from 7h, and what happens to a report. Then the promise that every report is answered with a note, including a rejection. Say plainly that a suggested wording is read by a person before anything changes. Then nobody expects their text to appear live.
- **Becoming a translation helper**, per 7i. What the role is, that it is granted per language, and that it is an ordinary applicant account and not staff. Then how to ask for it.
- What a helper can do: edit any translation in their language freely, and see what is missing.
- **What a helper cannot do: make a translation live.** Only staff set `is_ready`, per 7i as amended on 4 September 2026. Explain why, because it reads as distrust unless the reason is given. Access can be granted before trust is, and it means a half finished posting cannot go out by accident.
- The suggestion layer from 7i. Turning it on, selecting text and suggesting a replacement, and what the quiet underline and the count mean. Then how it works on a phone, where selection is imprecise.
- The Singapore Mandarin note from 3a, with the vocabulary table. 义工 in place of 志愿者 is the single most visible marker. It belongs on this page, and not only in this specification.
- What happens next. Who reads a suggestion, and roughly what the queue looks like from the other side. And that an interface string fix is a code change, and therefore waits for a deploy.

#### Job poster guide, page by page (poster and above)

How to use the staff dashboard, covering every feature a job poster can reach. It is written for a volunteer who has been given an account, and has never seen an admin interface.

- Signing in with an existing gftv.asia account, the second factor, and passkeys. Then what stay signed in and trust this device each actually do.
- Your account. Passkeys, backup codes, recovery codes, trusted devices, and what the danger zone does, per 5f and 5g. Include the warning that a recovery code reset changes the gftv.asia password too.
- Reading the dashboard overview and what each pipeline bucket means.
- Creating a job posting. Every field explained, and choosing tags well. When to set a closing date and when to leave a role open until filled, and what the slug does.
- Writing a posting in more than one language. The tabbed editor, the reference column, and what complete, in progress, and absent mean on a tab. And why a translation cannot be marked ready without a title, summary, and description.
- Sections, and why a translation may carry a different number of them from the base row.
- The embed description, with the warning that embeds are always served in English no matter what language the line was written in.
- Connecting the Google Form. Creating the form, getting the pre-filled link, and finding the entry ids for email and name. Then why the long form address is required in place of a short link, and linking the response sheet.
- Turning on confirmed submissions. The one time Apps Script setup per form, as a plain checklist with copy buttons. This is the fiddliest thing anybody here has to do.
- The posting lifecycle: draft, publish, unpublish, close, archive, and duplicate. Plus what each state means to applicants, and what happens automatically at a closing date.
- Working through applications. Statuses and what each one signals, adding notes, and reading the timeline. Then bulk changes, exporting, and waiving a reapply cooldown.
- Reading the analytics. Views, clicks, and confirmed and self reported answers. What pending and timed out actually mean, and why the conversion rate is a floor. And how a high click count with a low yes rate usually points at a broken form, and not a bad posting.
- Inviting applicants to a role, and shortlisting without notifying. Include what the applicant receives, and what bulk inviting sends.
- Raising a request for more information, reading the reply, and closing it out.
- Managing tags: the type-ahead, merging duplicates, and clearing orphans.
- Managing departments, including why a department cannot be left active without a Chinese name.
- **What you will see disabled, and why.** The build status mechanism from 0c. A poster meeting "Will be available in Phase 5" then knows it is a plan, and not a fault.
- Using the dashboard on a phone, since reading applications at a convention is the normal case.
- Two short checklists to finish: everything to do before publishing a new role, and a weekly review routine.

#### Admin guide, page by page (admin only)

What `/admin/docs` was going to be. Everything above plus the parts a job poster has no access to.

- What an admin can do that a job poster cannot, stated first, so the boundary is clear from the top.
- Who gets access, and how `is_admin`, `is_editor`, `is_approved` and the `gftvjobs_admin_access` override combine. And what each role opens on this docs site.
- Managing access for other staff. Granting, revoking, and why account creation and assisted password reset still live at gftv.asia.
- Managing applicant accounts. Deactivation, deletion, and the assisted recovery actions for somebody locked out with no codes left. Include the required reason, and what gets logged.
- The translations queue. Working a report, and the current wording beside the suggestion. Accepting, fixing, and rejecting, and why a resolution always needs a note even when rejecting.
- The needs-translation audit, and how to read a translation whose optional fields are thinner than the source.
- Granting and revoking translation helpers, with the reason that gets recorded and why it matters a year later.
- Annotations from the suggestion layer, how they share the queue with form reports, and what a detached anchor means.
- Portal settings: hero copy, featured roles, and the global applications toggle.
- Unmatched form submissions, and linking one to an applicant by hand.
- Reading the daily cron result on the overview, and what to do when a form health check flags a posting.
- Handling a broken or deleted Google Form on a published posting.
- What to do when somebody reports being unable to sign in, for both realms, and which paths exist for each.

#### Developer guide, page by page (admin only)

For whoever works on this project after the people who built it. This is the section that stops the build being readable only to its authors.

- **Start here.** What Careers@GFTV is, the two sites, the two account realms, the two Vercel projects, and the shape of the repo. One page that orients somebody with no context.
- **The specification.** `careers-gftv-spec.md` in full, rendered as pages and not one wall. Add the note that where it and anything else disagree, the answer is to ask and never to choose.
- **`next-steps.md` in its final state.** It is gitignored and it is the working memo, so it dies with the last session unless it is captured here. Publish it at the end of the build, as the record of how the phases actually went, deviations included. Note in the page that it is a snapshot and not a live file.
- **The phases and the build status mechanism**, per 0c. `build-status.json` as the single source, the feature map, the disabled control pattern, and the placeholder route. And how the notice bar is retired and replaced by the official banner.
- **The official banner**, from `gftv-official.md`. What it is, why it cannot be dismissible, and why it must never claim the site is safe or verified. Then the rule about not linking a trusted sites page that does not exist. It is portable across GFTV projects, so treat that file as the source and this page as the pointer.
- **The theme**, from `gftv-theme.md`. The tokens, the two axis switcher, the `.glass-card` primitive, and the loading primitives with their 250ms delay. Then the rule that links carry no underline and are one weight step heavier. And no gradients, orbs, blobs, or emoji.
- **The avatars bucket**, from `main-site/AVATARS.md`. What it is, how it is configured, what may and may not go in it, and how it is served.
- **The database.** The `gftvjobs_` namespace, and why row level security is on with no policies. The rule that `gftvhello_*` tables are read only, apart from the one exception in 5g. And how to write a migration. Numbered, idempotent, wrapped in a transaction, and recorded in `gftvjobs_migrations`. With a rollback block, never edited once run, and never renumbered.
- **Authentication.** The two realms, and passkeys per 5e including the shared relying party id. Then the second factor flow, trusted devices, both sets of codes in each realm, and the two proofs rule on password reset.
- **Vercel.** Two projects on one repo, and the root directory setting for each. The rewrites and headers in each `vercel.json`, `includeFiles` for the gated content, and the `Cache-Control: no-cache` on `sw.js`. Then the cron, environment variables and where each comes from, and how previews behave differently from production for passkeys.
- **Playwright.** The capture script and the manifest, how to add a shot, and how to re-run one. Then how determinism is kept, and the rules about seeded data and never capturing a live code, token, or form URL.
- **The service worker.** The caching strategies, what is network only and why, the IndexedDB stores, and the action queue. And the rule that `VERSION` is bumped on every change to the site, and not once per phase.
- **The multilingual layer.** Base rows plus translation rows, `is_ready`, and the dictionaries and `data-i18n`. Then why search differs by language, and what adding a language actually costs.
- **The Telegram bot**: how it is deployed on the VPS, the outbox drain, and where its own documentation lives.
- **Conventions worth not relearning.** No framework, and no build step on `main-site`. No em dashes in copy, and inline SVG in place of emoji. And prompt with options, instead of choosing, when this specification and something else disagree.

### 16i. Deployment

- Its own Vercel project, with the root directory set to `docs-site`, since the portal project already points at `main-site`. Two projects, one repo. This project now has serverless functions of its own, per 5h and section 9. So it needs its own environment variables set in Vercel, and its own `vercel.json` with the `includeFiles` entry for the gated content.
- Custom domain `docs.careers.globalfurry.tv`.
- Cross link both ways. A docs link in the portal footer and in the bot's start message, and a portal link in the docs header. Then the `/admin/docs` redirect from 8a. The admin sidebar's link is marked as leaving the portal.
- `robots.txt`, `sitemap.xml`, and `llms.txt` generated from the page list, per the discovery files in section 4. **Public pages only, in all three.** A gated page must never appear in a sitemap, in `llms.txt`, or in the public search index. `robots.txt` disallows `/api`, `/account`, and the staff paths. Generate them from the same `access` key that drives the gate, so a page cannot be gated in one place and advertised in another.
- Its own README, covering local preview and how to sign in against a local staff account. Then the four audiences and which role sees what, and adding a page in either pipeline. Then its environment variables, and the screenshot checklist.
- Preview deployments are a different host, so a passkey registered against production does not work on one, per 5e. Password plus authenticator code still does. Say so in the README, before somebody concludes previews are broken.

## 17. Deliverables

- Full working repo following the structure above.
- The `migrations/` directory with every numbered SQL file, its README, and the rollback blocks.
- `sitemap.xml`, `robots.txt`, and `llms.txt` on both sites, per section 4.
- Root README covering setup, environment variables, and Supabase configuration. Then Vercel deployment, and the custom domain setup for `careers.globalfurry.tv`.
- `main-site/.env.example` as specified in section 2, with a how-to-obtain comment on every variable.
- The four READMEs described in section 2, kept current through every phase.
- Seed script with a few sample departments and job postings for local testing.
- The `telegram-bot` directory per section 15, with its own README, setup.md, .gitignore, and .env.example, delivered as individual files.
- `next-steps.md` kept current through every phase, per section 0b, and gitignored.
- `build-status.json` kept current as phases ship, per section 0c.
- The `docs-site` directory per section 16, with its own README and its own `.env.example`. It has its own `api/` and staff login per 5h, and the role gate per 16a. Then the four guides per 16h, the Playwright capture script, and the screenshot manifest.
- The staff account settings suite and its danger zone per 5f, built once and mounted on both sites, plus staff account recovery codes per 5g.
- The `assets/i18n/` dictionaries, kept in key parity across every language, and the locale and translation tables per 3a.
- The `/admin/docs` redirect per 8a. No in-portal admin documentation, and no `main-site/api/_admin-docs/`.
- A short offline test checklist in the README. Install the app, load the board, then go offline. Browse a cached posting, rate it, and answer the modal. Come back online and confirm the queue flushed.
- Deliver files individually, never as a zip.
