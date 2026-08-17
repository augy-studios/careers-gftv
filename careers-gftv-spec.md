# Careers@GFTV: build specification

This file is the brief for the whole project. It lives at the repo root, it is committed, and it is the reference for every phase of the build. `next-steps.md` is the working memo alongside it and is gitignored.

Re-read the sections relevant to the current phase at the start of that phase rather than working from memory of an earlier read. This file is long and the details in it are load bearing, particularly the schema in section 6 and the auth rules in section 5.

Where this file and anything else disagree, prompt me with the options rather than picking one yourself.

## 0. Read these first, before writing any code

1. Read `gftv-theme.md` in the repo root and apply that theme to every page you build. Do not invent new colours, fonts, or component styles.
0. Read this whole file first, start to finish, before anything else.
2. Read the root `index.html` and use its `<head>` tag as the template for the `<head>` of every other HTML file in this repo. Keep meta tags, font links, theme initialisation script, and manifest links consistent with it.
3. If either file is missing, stop and tell me before continuing.

Do not start scaffolding until both files have been read, and until you have read this specification in full.

## 0b. Phasing and the next-steps file

Do not build this in one pass. Work through it in the phases below, in order, and stop at the end of each one.

### The next-steps file

Before starting each phase, write `next-steps.md` at the repo root. Add it to `.gitignore` in the very first phase, since it is a working memo and not part of the deliverable. Keep one file and rewrite it each time rather than starting a new one.

Every version contains four parts:

1. **Done so far.** A short list of completed phases with what each one actually produced, so the file carries its own history and nothing is lost between sessions.
2. **This phase.** What is about to be built, and the specific files that will be created or changed.
3. **Needs clarification.** Anything ambiguous, contradictory, or missing from this brief. If an item blocks the phase, stop before writing code and prompt me with the interactive question tool, offering concrete options to pick from. Do not write open ended questions into the chat and wait. If an item does not block the phase, record the assumption you are making and carry on.

   The same applies any time you need a decision from me, mid phase or otherwise: prompt me with options rather than asking in chat. Where a real recommendation exists, say which option you would choose and why in one line, then let me pick.
4. **How to verify.** What I should click, run, or query to confirm the phase works before you move on.

At the end of a phase, update the file so "This phase" moves into "Done so far" with any deviations noted, update any README the phase invalidated per section 2, flip the shipped phase in `build-status.json` per section 0c, then write the next phase's version. If a phase turns out larger than expected, split it and say so in the file rather than half finishing it.

### Phases

1. **Foundations.** Repo scaffold per section 2, the build status mechanism in 0c including `build-status.json`, the notice bar, the disabled control pattern, the placeholder route, and `/status`, `.gitignore` including `next-steps.md`, both `.env.example` files, the full `migrations/` set covering every table, index, extension, trigger, and RPC function, Supabase client helper, shared session helpers, and the `vercel.json` rewrites and headers. Nothing user facing yet.
2. **Authentication.** Staff login with TOTP, backup codes, and trusted devices against the existing tables. Applicant registration and login. Recovery codes, both sets. Forgot password. Session length and trusted device handling for both realms, per 5d. Telegram 2FA is deliberately deferred: build the endpoints and the settings UI shell here, but the delivery half cannot work until phase 9, so leave the toggle disabled with a note rather than faking it.
3. **Public site.** Home, `/search` with full text search, tags, filters and suggestions, `/jobs/{uuid}` with the visibility rules, the logged out gate, JSON-LD, `jobs.json`, and the static pages.
4. **Apply flow.** The start endpoint with prefill, the handoff modal in all three sections, analytics logging, ratings, the pending prompt resumption, and the reapply cooldown.
5. **Applicant dashboard.** My applications, saved jobs, outstanding tasks, and account settings including the three step danger zone.
6. **Admin dashboard.** All ten sections, with the access check applied on every route. The admin documentation area in 8a is scaffolded here but written in phase 11, once the dashboard it describes is finished.
7. **Automation.** The daily cron and the Apps Script webhook endpoint, plus the Apps Script itself and its setup notes.
8. **Offline.** Service worker, caching strategies, IndexedDB stores, the action queue, and the install manifest.
9. **Telegram bot.** The `telegram-bot` directory, the nine commands, linking, login codes and magic links, and the notification outbox drain. Finish wiring the Telegram 2FA left disabled in phase 2, and enable it once the bot can actually deliver.
10. **Polish.** WCAG AA pass across every theme and mode, the full responsive check in section 3 at every listed width on both sites, the portal's `sitemap.xml`, `robots.txt`, and `llms.txt` per section 4, seed script, a final pass over the four READMEs, `setup.md`, and the offline test checklist.
11. **Documentation.** The `docs-site` directory per section 16 with both public guides, the admin guide content for 8a, the docs site's own `sitemap.xml`, `robots.txt`, and `llms.txt`, plus the Playwright screenshot capture script and a first capture run against seeded data. Written last so it documents what was actually built rather than what was planned.

Phase 11 comes last for a reason: documentation written from a specification documents the plan, while documentation written from a finished build documents the product.

Phases 1 and 2 are the ones worth slowing down on. Everything else depends on the schema and the session handling being right, and reworking those later means touching every phase that came after.

## 0c. Shipping in public

Each phase gets pushed to GitHub and deployed to production as it finishes. The site is live and usable from phase 3 onward while later phases are still unbuilt, so the interface has to be honest about what is not there yet.

### Rules for shipping mid build

- `main` is always deployable. A phase lands as a branch merged when it works, never as a half finished commit on `main`.
- The full migration set from phase 1 is run on day one, so the database runs ahead of the interface. That is deliberate. It means a feature switching on in a later phase needs no new SQL.
- Never ship a control that calls an endpoint that does not exist yet. Unbuilt features are shown in the disabled state described below, and the click handler does nothing but explain.

### Build status source of truth

- One file, `main-site/assets/build-status.json`, holding the phase list with a number, a short name, a status of `shipped`, `building`, or `planned`, and a plain description. Alongside it, a map of feature keys to phase numbers, for example `saved_jobs: 5`, `telegram_2fa: 9`, `offline: 8`.
- Everything else reads from that file. Flipping a phase to `shipped` is the only edit needed when it goes live, and no copy anywhere hardcodes a phase number.
- The Telegram bot and the docs site read the same file, so the three stay in step.

### How it appears

- **Site wide notice.** A slim, dismissible bar at the top reading that Careers@GFTV is being built and released in phases, with a link to the status page. Dismissal is remembered locally and resets when a phase ships. Keep it quiet, one line, no colour shouting.
- **Disabled controls.** Any control for a feature that has not shipped stays visible and disabled rather than hidden, with the reason on it: "Will be available in Phase 5. Sorry for the inconvenience caused." Use that wording exactly, with the phase number pulled from the feature map. Hiding it teaches people the feature does not exist; showing it disabled tells them it is coming.
- **Unbuilt routes.** A route belonging to a later phase renders a placeholder page in the normal layout carrying the same sentence, a line on what that phase covers, and links to the status page and to `/search`. Never a 404, never a blank page, and mark these `noindex`.
- **Status page at `/status`.** Public, linked from the footer and the notice bar. Lists every phase with its status and description, marks the current one, and states plainly that dates are not promised. It doubles as the changelog: when a phase ships, its entry gains a short line about what became available.
- **Admin dashboard.** Same treatment. A staff member clicking an unbuilt section gets the same message rather than an empty screen.
- **Telegram bot.** A command whose backing feature has not shipped replies with the same sentence rather than failing or going quiet.
- **Docs site.** Any page documenting an unshipped feature carries a note callout at the top with the same sentence, so the documentation can be written ahead of the build without misleading anyone.

### Retiring it

When every phase is `shipped`, remove the notice bar and the placeholder route handling, and keep `/status` as a plain changelog. Leave `build-status.json` in place, since the same mechanism will be useful for whatever comes after.

## 1. What we are building

**Careers@GFTV** is the careers portal for Global Furry Television, served at `careers.globalfurry.tv`. It is modelled on `jobs.careers.gov.sg`: a clean public job board with a search and filter listing, individual job detail pages, and an authenticated application flow, plus a private admin dashboard behind it.

It is a GFTV HelloApp, so it follows the same conventions as the other GFTV PWAs.

## 2. Stack and repo conventions

- Frontend: vanilla HTML, CSS, and JavaScript. No frameworks, no build step.
- Backend: Vercel serverless functions (Node.js) under `main-site/api/`.
- Database: Supabase (Postgres) accessed with the service role key from serverless functions only. Never use Supabase Auth. Never expose the service role key to the browser.
- The site lives in a `main-site` directory. The `api` directory goes inside `main-site` because Vercel's root directory is set to `main-site`.
- Four READMEs, and only these four plus the one in `migrations/`. Do not scatter a README into every subdirectory.

### READMEs

Each one is short and says what lives in that directory and how to work with it. A page of orientation, not a manual, since the real documentation is the docs site and section 8a.

- **Repo root.** What Careers@GFTV is in a paragraph, what each top level directory holds, the phase the build is currently at with a link to `/status`, how to run the migrations, and where the specification and the environment variables live.
- **`main-site/`.** The site itself: local development, the environment variables and where each comes from, how the two auth realms are laid out, the API route map at a glance, the Vercel project settings including the root directory, and the offline test checklist.
- **`telegram-bot/`.** What the bot does, the nine commands, how to run it under tmux on the VPS, its own environment variables, and a pointer to `setup.md` for the BotFather side.
- **`docs-site/`.** What the docs site covers, how to add or edit a page, how to preview locally, how to run a Playwright screenshot capture, and the Vercel project settings for its own root directory and domain.
- **`migrations/`.** As described in section 6.

**Keep them current.** A README goes stale the moment it stops matching the code, and a stale README is worse than none. Update the affected ones in the same phase as the change, never as a cleanup pass afterwards, whenever any of these happen: a phase ships and the root README's status line moves, an environment variable is added, removed, or renamed, a directory gains or loses a meaningful part, a command or route set changes, or the way something is run changes. Treat it as part of the work, the same as updating `next-steps.md`.
- Include a `.gitignore`, covering `.env`, `.env.local`, `next-steps.md`, and the usual Python and Node artefacts for the bot directory.
- Make it a fully offline capable PWA. Section 14 sets out exactly what works without a connection and what does not.
- Passwords hashed with bcrypt, matching the existing hash format already stored in `gftvhello_users` so existing accounts keep working.
- All secrets in environment variables. Document every variable in the root README.

### Environment variables

Ship a `.env.example` at `main-site/.env.example`, committed to the repo, with every variable listed and a comment above each one saying exactly where to get it. Real values live in `.env.local` and in the Vercel project settings, and `.gitignore` must ignore `.env` and `.env.local` while keeping `.env.example` tracked.

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

If any variable is missing at startup, fail loudly with a message naming the variable rather than throwing an undefined key error deep in a request. Do not add variables beyond these without telling me why.

### Supabase specifics

- Everything runs in the existing GFTV Supabase project, in the `public` schema, alongside the `gftvhello_*` tables. Do not create a new project and do not create a new schema.
- Server side access only. Use `@supabase/supabase-js` inside the Vercel functions with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, the names used across all of my projects. Do not rename them to `SUPABASE_SERVICE_ROLE_KEY` or anything else. The browser never talks to Supabase directly and never receives an anon key, so there is no Supabase client bundled into the frontend at all.
- Because of that, enable row level security on every new `gftvjobs_*` table and add no policies. The service role bypasses RLS, so the portal keeps working while anything holding an anon key gets nothing. This matters since the project is shared with other GFTV apps.
- All DDL ships as numbered files in `migrations/`, run by hand in the Supabase SQL editor. See section 6. Extensions needed: `pg_trgm` for the typo fallback and autocomplete, and `pgcrypto` if `gen_random_uuid()` is not already available. Enable them with `create extension if not exists`.
- The weighted full text search, `ts_headline` snippets, and the trigram fallback are awkward to express through PostgREST filters. Write them as Postgres functions in their own migration file and call them with `supabase.rpc()`. Suggested functions: `gftvjobs_search_jobs(q text, filters jsonb, limit int, offset int)` returning ranked rows with a total count, and `gftvjobs_suggest(q text)` returning grouped title, tag, and department suggestions.
- Keep the tsvector and `usage_count` maintenance in Postgres triggers rather than in application code, so a posting edited directly in the Supabase table editor stays searchable.
- Use `.select('*', { count: 'exact' })` for paginated listings so the total is one round trip rather than two.
- Foreign keys pointing at `gftvhello_users` are references only. Never insert, update, or delete rows in any `gftvhello_*` table apart from the session, challenge, trusted device, and backup code rows the login flow legitimately owns.
- Supabase pools connections through PgBouncer, so create the client once per function module at import time rather than per request.

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
    content/
  main-site/
    README.md
    .env.example
    index.html
    jobs/
    search/
    apply/
    login/
    register/
    account/
    admin/
    assets/
    api/
      _admin-docs/
```

Adjust if the existing repo layout differs, but keep `api` inside `main-site`.

## 3. Design

- Follow `gftv-theme.md` exactly: Inter font, `.glass-card` primitive, tokens `--brand`, `--brand-dark`, `--surface`, `--text`, GFTV blue-grey, Hello yellow, GFTV red for links.
- Two-axis theme switcher (colour theme plus light/dark mode) using `data-color-theme` and `data-mode` on `<html>`, same as the other GFTV apps. Light mode is the default and ignores OS preference.
- No gradients, orbs, or blobs. Inline SVG icons, never emoji. No em dashes in copy.
- WCAG AA contrast for all text and body copy in every theme and mode combination.
- Mobile first, not desktop with a phone afterthought. Both the portal and the docs site in section 16 must be fully usable on a small screen, and this is checked in phase 10 rather than assumed.

### Responsive requirements

Applies to `main-site` and `docs-site` alike.

- Breakpoints: a single column layout below 640px, a relaxed two column layout from 640 to 1024px, and the full layout above 1024px. Design the small screen first and add columns upward, since retrofitting downward is what produces horizontal scrolling.
- **Hamburger navigation on both sites.** The portal collapses its header navigation and the admin sidebar behind a menu button. The docs site collapses its left sidebar behind one, and drops the right hand on-page contents into a collapsible block above the content. Same button behaviour and same animation on both, so they feel like one product.
- Every off canvas panel: opens from the left, traps focus while open, closes on Escape, on backdrop tap, and on navigating to a new page, has an obvious close control, and is reachable by keyboard. Set `aria-expanded` on the trigger and `aria-hidden` on the panel, and lock body scroll while it is open.
- The admin dashboard is not exempt. Tables reflow to stacked cards below 640px rather than scrolling sideways, bulk selection stays reachable, and any action buried in a wide table row surfaces in the card. An admin reading applications on a phone at a convention is the normal case here, not the edge case.
- The `/search` filter panel becomes a bottom sheet on small screens, with the active filter count on the button that opens it and an apply action that closes it.
- Touch targets are at least 44 by 44 CSS pixels with real spacing between them. Nothing depends on hover, and anything shown on hover has a tap equivalent.
- No horizontal scrolling at any width down to 320px. Long words, uuids, and tag names wrap or truncate with a title attribute rather than pushing the layout.
- Modals, including the handoff modal in 7c, become full width sheets on small screens with the buttons within thumb reach, and respect the safe area insets on notched phones.
- Forms use appropriate `inputmode` and `autocomplete` values, and inputs are at least 16px so iOS does not zoom on focus.
- Test at 320, 375, 414, 768, 1024, and 1440. Check both orientations, both themes, and both light and dark mode.

## 4. Public site (no login required)

**Home page (`/`)**
Landing page for the general public. Sections:
- Hero with the Careers@GFTV name, a short line about joining GFTV, and a job search box (keyword plus a category or department dropdown) that submits into `/search`.
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
- Filters: department, tags, commitment type, location or remote, posting status. Sorting by newest, closing date, or relevance, where relevance is the default whenever `q` is present and newest is the default when it is not. When sorting by closing date, use `order by closes_at asc nulls last` so deadline free postings sit at the end rather than the top.
- Tag filtering: a tag cloud or chip row where multiple tags can be selected at once. Default to OR matching across selected tags, with a "match all selected tags" toggle for AND. Show a count beside each tag and hide tags with zero published jobs.
- Quick filter chips above the results for "Posted today", "Posted this week", "Closing soon", and "No deadline", each showing a live count. "Closing soon" matches only postings with a `closes_at` inside the next 14 days and never includes deadline free ones. These sit alongside the full filter panel, not inside it, so the common cases are one tap away.
- As-you-type suggestions from a lightweight endpoint: matching job titles, matching tags, and matching departments, grouped under those three headings. Debounce at around 250ms, minimum two characters, and make it fully keyboard navigable with arrow keys and Enter.
- When `q` is present, rank by relevance and highlight matched terms in the summary snippet using `ts_headline`.
- Handle typos and near misses with a trigram similarity fallback when full text search returns nothing, and show a "no results for X, did you mean Y" state with the most popular tags as a way back in.
- Recent searches stored in localStorage and offered as chips under an empty search box. Nothing search related is stored server side against an account.
- Server-side pagination.
- Every piece of state, the query, filters, sort, and page, lives in the URL query string so results are shareable and the back button behaves. Update it with `history.replaceState` as filters change rather than reloading.
- Each card shows title, department, location, commitment type, posted date, closing date, and up to four tag pills. Where `closes_at` is null, show "Open until filled" in place of a date rather than leaving the field blank or printing "null". Clicking a tag pill filters by that tag rather than opening the job.
- Each job detail page emits schema.org `JobPosting` JSON-LD so postings are eligible for Google Jobs indexing, and the site exposes a public `api/public/jobs.json` feed for anyone aggregating openings.

**Job detail (`/jobs/{id}`)**
- The canonical URL of a posting is `/jobs/` followed by the posting's Supabase row uuid, for example `/jobs/3f9a1c2e-8b47-4d10-9a3e-5c61d2f0ab88`. On a static host this is a single `jobs/[id].html` style page, or a rewrite in `vercel.json` mapping `/jobs/:id` to one detail page that reads the id from the path and fetches the posting.
- `/jobs` with no id redirects to `/search`, so nothing else competes for this route. Match a uuid shaped segment for the detail page and treat any other non-uuid segment as not found.
- Keep the `slug` column. Serve `/jobs/{slug}` as an alias that 301 redirects to the uuid URL, so any link shared before this change still resolves and there is only ever one canonical address per posting.
- A uuid that does not exist, or points at a `draft` posting, returns a proper 404 page rather than an empty shell. A `closed` posting still renders, with the apply button disabled and a closed notice. An `archived` posting renders only for an applicant who has applied to or saved it, per the visibility rule in 7g, and 404s for everyone else.
- Set `<link rel="canonical">` to the uuid URL.
- Tag pills near the top, each linking to the listing filtered by that tag.
- Full description, responsibilities, requirements, nice-to-haves, commitment, location, and closing date, or "Open until filled, applications reviewed on a rolling basis" when `closes_at` is null.
- Share button and a "back to results" link that returns to `/search` with the previous query string intact.
- Apply button. Applications are handled by Google Forms, so for a logged in applicant the button starts the handoff in 7c.

**What a logged out visitor sees**

- The entire posting is public. Title, summary, full description, responsibilities, requirements, commitment, location, department, tags, posted and closing dates, all of it. No teaser, no blurred text, no "sign in to see the details". The only thing behind the gate is the act of applying.
- The Google Form URL is the single exception and must never appear in the public job payload, the HTML source, the JSON-LD, or the `jobs.json` feed. It is served only from an authenticated endpoint, so a logged out visitor cannot lift it and bypass the gate.
- In place of the Apply button, show a control that reads as an apply action, not as a wall. Something like "Apply for this role" that opens a small sign in prompt explaining in one line that applications need an account, with two equal options, log in and create an account, and a note that registration takes a moment and needs no approval.
- Saving a job gets the same treatment, and so does anything else that writes against an account.
- The search results page is fully public too, filters and tags included. Nothing there requires a session.

**Returning after signing in**

- Carry a `?redirect=` back to the posting through both the login and the registration flow, including through the automatic sign in that follows registration, so a new applicant lands back where they started rather than on a bare account page.
- Validate the redirect against a strict allowlist of relative paths on this origin. Reject absolute URLs, protocol relative ones, and anything with a host, or the parameter becomes an open redirect.
- On return, do not auto-start the handoff. There is no user gesture behind a post-login redirect, so the new tab would be blocked and the modal would appear out of nowhere. Land them on the posting with the Apply button now active, scrolled into view and briefly highlighted, and a short confirmation line that they are signed in and can apply. The next click is theirs.
- Preserve intent across the round trip. If they clicked save rather than apply, complete the save on return and say so.

**Static pages**: About Careers@GFTV, FAQ, privacy notice, terms.

**Discovery files**

Built in phase 10 for the portal and phase 11 for the docs site, once the pages they describe actually exist. Building them earlier just means listing placeholder routes.

- **`/sitemap.xml`** on the portal is generated, not hand written, since postings change constantly. Serve it from a function rewritten to that path in `vercel.json`, listing the home page, `/search`, the static pages, `/status`, and every `published` job at its `/jobs/{uuid}` URL with a `lastmod` from `updated_at`. Exclude closed, draft, and archived postings, everything under `/admin`, `/account`, `/login`, and `/register`, and every placeholder route from 0c. Cache it with `s-maxage` so it is not rebuilt per request.
- **`/robots.txt`** on the portal allows the public pages, disallows `/admin`, `/account`, and `/api`, and points at the sitemap.
- **`/llms.txt`** on both sites, following the llmstxt.org convention: a short markdown file at the root with the site name, a one paragraph description, and a linked list of the pages worth reading, grouped under headings. For the portal that is what Careers@GFTV is, how applying works, and links to `/search`, the docs site, and the `jobs.json` feed. For the docs site it is a link per guide page with a one line description of each.
- Keep `llms.txt` to public, applicant facing material. No admin documentation, no endpoint paths, no Google Form URLs, and nothing behind a session. Treat it as a public page, because it is one.
- Worth knowing: llmstxt.org is a proposed convention rather than a standard, and support for it is uneven. It costs almost nothing to publish and may help, but do not build anything that depends on it being read.
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
5. Else, if `totp_secret` is not null, create a row in `gftvhello_totp_challenges` with a random token and return a "2FA required" response carrying that challenge token. The password step must not issue a session.
6. The client posts the challenge token plus either a 6 digit TOTP code or a backup code. Verify TOTP against `totp_secret` with a one step window either side. Backup codes are verified against `gftvhello_backup_codes` by bcrypt comparison, and the matching row is deleted on use, single use only.
7. On success, delete the challenge row, insert a `gftvhello_trusted_devices` row if "trust this device" was ticked, then insert into `gftvhello_sessions` with `expires_at` set by the "stay signed in" choice per 5d, and set the session cookie.
8. Accounts with a null `totp_secret` skip straight from step 4 to step 7.

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
2. **Account recovery codes**, in `gftvjobs_recovery_codes`. Accepted on the forgot password flow. These are a full account credential, since one of them plus nothing else lets someone set a new password. That is exactly why they must not be the same codes as the 2FA set: a backup code lying in a chat log should not also be a password reset.

Two tables, not one with a purpose column, so the boundary is enforced by the schema rather than by remembering a filter.

Rules for both sets:

- Ten codes per set, generated server side from a CSPRNG, formatted in two groups for legibility, for example `k7m2-9xqp`.
- Stored bcrypt hashed, one row per code. Never stored or logged in the clear, and never recoverable after the one time they are shown.
- Shown once, on generation, with copy and download to a text file, and a checkbox confirming they have been saved before the dialog closes.
- Single use. Consumed on success, with the row deleted rather than flagged.
- Regenerating a set invalidates every remaining code in that set and only that set.
- Account settings shows how many codes remain in each set, with a warning below three and a prompt to regenerate.
- Generating either set requires the current password.
- Rate limit code entry per account and per IP, and lock the flow for an hour after repeated failures. Compare in constant time and give the same generic error for a wrong code and an unknown account.

**Forgot password flow**

1. The applicant enters their username or email and one unused code from `gftvjobs_recovery_codes`.
2. Verify both. On success, issue a short lived, single use reset ticket bound to that browser and move them to a set new password screen. Never accept a password change in the same request that verifies the code, and never reveal whether the account exists.
3. On the new password being set: consume the recovery code, invalidate every session for that account, revoke every trusted device, and if Telegram is linked, send a message saying the password was changed and when.
4. If the account has fewer than three recovery codes left afterwards, push them straight to regenerate.
5. Someone with no codes left cannot recover alone. Give admins a verified reset path in the admin dashboard that clears the password and forces a reset on next login, and log who did it.

### 5d. Session length and trusted devices (both realms)

Two separate controls on both login forms. They are independent and must not be collapsed into one checkbox:

- **"Stay signed in for 30 days on this device"** controls how long the session lasts. Off gives a session that expires in 12 hours. On sets `expires_at` 30 days out. This is about the session cookie and nothing else.
- **"Trust this device"** controls whether the second factor is asked for again. Off means 2FA every login. On records a trusted device for 30 days, and logins from it skip the second step while the password is still required every time.

Implementation:

- Staff realm: use the existing `gftvhello_trusted_devices` table, which already carries a 30 day default. Do not alter it and do not create a parallel table.
- Applicant realm: create `gftvjobs_trusted_devices` mirroring it, but store the device token hashed rather than in the clear, since it is new and there is no compatibility to preserve.
- The device token is 32 random bytes in its own long lived `HttpOnly`, `Secure`, `SameSite=Lax` cookie, separate from the session cookie, so it survives logout. That is the point: logging out should not mean answering 2FA again on your own laptop.
- Rotate the token on every successful use and push the expiry out, so a stolen token has a short window and an actively used device does not expire mid use.
- Trust is per device and per account. A shared browser signing into a second account gets its own record.
- Only offer "trust this device" once the second factor has actually been satisfied, never on the password screen, and put a plain line next to it saying not to use it on a shared or public computer.
- Account settings lists trusted devices with when each was added and last used, a revoke button per device, and a revoke all. Changing the password, resetting via recovery code, unlinking Telegram, or disabling 2FA revokes all of them.
- Trusted devices never bypass the danger zone in `/account/settings`. That always asks for the password, and for a fresh code where 2FA is on.

## 6. Database

Do not modify any existing `gftvhello_*` table.

### Migrations

All DDL ships as numbered SQL files in a `migrations/` directory at the repo root. I run them by hand, in order, pasting each one into the Supabase SQL editor. There is no CLI, no automated runner, and no migration framework.

- Name files `001_description.sql`, `002_description.sql`, and so on, zero padded, ordered by the sequence they must run in. One concern per file: extensions, then core tables, then auth tables, then jobs, then applications and analytics, then search functions and triggers, then Telegram and notifications, then seed reference data.
- Every file opens with a comment header: what it creates, which spec section it comes from, and anything that must have run before it.
- Wrap each file in `begin` and `commit` so a failure halfway leaves nothing behind.
- Write everything idempotently: `create table if not exists`, `create index if not exists`, `create or replace function`, `add column if not exists`. I should be able to re-run a file without damage if I lose track of what has been applied.
- End each file by recording itself in a `gftvjobs_migrations` table of filename and applied timestamp, created by `001`. That table is the record of what has been run, since nothing automated is tracking it.
- Include a commented rollback block at the foot of each file, so undoing one is copy and paste rather than reconstruction.
- **Never edit a file that has already been run, and never renumber.** A change becomes a new numbered file. This holds even during the build, since production is live from phase 3.
- Keep each file small enough to paste comfortably into the SQL editor. Split rather than letting one file sprawl.
- `migrations/README.md` lists every file in order with a one line description of what it does, plus the running instructions and the rule about not editing applied files.

New tables:

- `gftvjobs_users`: id uuid pk, username text unique not null, display_name text not null, email text unique not null, password_hash text not null, avatar_url text null, phone text null, totp_secret text null, is_active boolean default true, created_at, updated_at.
- `gftvjobs_sessions`: id uuid pk, user_id uuid references `gftvjobs_users` on delete cascade, token text unique not null, expires_at timestamptz not null, created_at. Indexes on token and user_id.
- `gftvjobs_departments`: id, name, slug unique, description, sort_order, is_active.
- `gftvjobs_jobs`: id uuid pk, slug text unique, title, department_id, summary, description (markdown or html), responsibilities, requirements, nice_to_have, commitment_type (for example full time, part time, volunteer, contract, internship), location, is_remote boolean, compensation_note text null, openings int, status text check in (draft, published, closed, archived), application_form_url text not null, form_prefill jsonb null, response_sheet_url text null, published_at, closes_at timestamptz null, created_by uuid references `gftvhello_users`, created_at, updated_at. Indexes on status, department_id, slug, closes_at.
  - `closes_at` is nullable on purpose. Null means the posting has no deadline and stays open until an admin closes it, for rolling or always-open roles. Treat null as open, never as expired, and never coalesce it to a far future date as a shortcut.
  - The id is what the public detail URL uses, so it is a real identifier here and not just an internal key.
  - `application_form_url` is the Google Form the Apply button opens.
  - `form_prefill` optionally maps Google Form entry IDs to applicant fields, for example `{"entry.123456": "email", "entry.789012": "display_name"}`, so the portal can append prefill query parameters to the form URL.
  - `response_sheet_url` is an optional link to the linked Google Sheet, shown to admins only.
- `gftvjobs_applications`: this is a tracking record, not the application itself, since the answers live in Google Forms. Columns: id uuid pk, job_id references `gftvjobs_jobs`, applicant_id references `gftvjobs_users`, status text check in (started, submitted, under_review, shortlisted, interview, offered, accepted, rejected, withdrawn) default `started`, admin_note text null, started_at, applied_at timestamptz null, cooldown_until timestamptz null, updated_at.
  - `applied_at` and `cooldown_until` are set when the application is confirmed, per 7f. Both are null while the row is still at `started`, and both are cleared on withdrawal. Unique constraint on (job_id, applicant_id) so one tracking row per applicant per posting, and a repeat click on Apply updates `updated_at` rather than inserting a duplicate.
- `gftvjobs_application_events`: id, application_id, from_status, to_status, note, changed_by uuid references `gftvhello_users`, created_at. Every status change writes a row here.
- `gftvjobs_analytics`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade, applicant_id references `gftvjobs_users` on delete set null, event_type text check in (view, apply_click), did_apply boolean not null default false, response_state text check in (pending, answered, no_response) default `pending`, answer_source text check in (applicant, webhook, admin, timeout) null, responded_at timestamptz null, referrer text null, created_at timestamptz default now(). Indexes on job_id, applicant_id, event_type, created_at, and a partial index on `response_state` where it is `pending` so the outstanding prompts are cheap to look up.
  - One row per apply click, not one per applicant. A second click on the same job is a second row, which is what makes the funnel meaningful.
  - `did_apply` is false by default and only ever becomes true on a positive confirmation, either the applicant clicking Yes or the webhook in section 13. Not answering is not a missing value, it is a No. Never use null to mean unanswered here; `response_state` carries that.
  - `event_type` of `view` is optional page view logging on the job detail page. Fire it once per session per job, not on every render, and never log a view for an admin previewing a draft.
  - Store no IP address and no raw user agent. Referrer is enough for where traffic came from.
  - This table is the append-only event log. `gftvjobs_applications` stays the single deduped status record per applicant per job. Keep the two in sync in the same request, and never derive one by rewriting the other.
- `gftvjobs_ratings`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade, applicant_id references `gftvjobs_users` on delete cascade, rating smallint not null check between 1 and 5, created_at, updated_at. Unique on (job_id, applicant_id), so a second rating updates the first rather than stacking. Ratings are admin facing only and are never shown on the public posting, since a visible score would discourage applications to a role that a handful of people rated low.
- `gftvjobs_tasks`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade, job_id references `gftvjobs_jobs` on delete set null, application_id references `gftvjobs_applications` on delete set null, task_type text not null default `info_request`, title text not null, body text null, status text check in (open, awaiting_admin, resolved, dismissed) default `open`, response_text text null, responded_at timestamptz null, raised_by uuid references `gftvhello_users` on delete set null, resolved_by uuid references `gftvhello_users` on delete set null, resolved_at timestamptz null, created_at, updated_at. Index on (applicant_id, status) and on job_id.
  - `task_type` is plain text with a default rather than a tight check constraint, so a new type does not need a migration.
  - The applicant replying moves the row to `awaiting_admin`. Only an admin moves it to `resolved`.
  - Unanswered apply prompts never appear in this table. They are derived from `gftvjobs_analytics`, per 7g.
- `gftvjobs_2fa_backup_codes`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, code_hash text not null, created_at. Index on user_id. One row per code, deleted on use. Accepted only at the second factor step of login.
- `gftvjobs_recovery_codes`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, code_hash text not null, created_at. Index on user_id. One row per code, deleted on use. Accepted only on the forgot password flow.
  - Two tables rather than one table with a purpose column. The separation is the security property, so make it structural: a query against one can never accidentally satisfy the other, and there is no purpose value to get wrong in a where clause.
  - Every table in this build carries the `gftvjobs_` prefix without exception, including these. Nothing new is created outside that namespace.
- `gftvjobs_password_resets`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, ticket_hash text not null, browser_nonce_hash text not null, expires_at timestamptz not null, used_at timestamptz null, created_at. Short lived, single use, issued only after a valid recovery code.
- `gftvjobs_trusted_devices`: id uuid pk, user_id references `gftvjobs_users` on delete cascade, device_token_hash text not null unique, label text null, last_used_at timestamptz null, created_at, expires_at timestamptz not null default (now() + interval '30 days'). Index on user_id and on device_token_hash.
- `gftvjobs_telegram_links`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade unique, telegram_user_id bigint not null unique, telegram_username text null, telegram_display_name text null, twofa_enabled boolean not null default false, linked_at timestamptz default now(), last_notified_at timestamptz null. One Telegram account links to one portal account and vice versa.
- `gftvjobs_telegram_tokens`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade, token_hash text not null, purpose text check in (link, login_code, magic_link), expires_at timestamptz not null, used_at timestamptz null, attempts int default 0, browser_nonce_hash text null, created_at. Index on (applicant_id, purpose) and on expires_at. Store hashes, never the code or token itself.
- `gftvjobs_invites`: id uuid pk, job_id references `gftvjobs_jobs` on delete cascade, applicant_id references `gftvjobs_users` on delete cascade, invited_by uuid references `gftvhello_users` on delete set null, note text null, status text check in (invited, seen, applied, declined, withdrawn) default `invited`, created_at, updated_at. Unique on (job_id, applicant_id).
- `gftvjobs_notifications`: id uuid pk, applicant_id references `gftvjobs_users` on delete cascade, kind text not null, payload jsonb not null, status text check in (queued, claimed, sent, failed, skipped) default `queued`, claimed_at timestamptz null, sent_at timestamptz null, error text null, attempts int default 0, created_at. Index on (status, created_at). This is the outbox the Telegram bot drains, per section 15.
- `gftvjobs_saved_jobs`: id, applicant_id, job_id, created_at, unique on the pair. Rows survive the posting closing or expiring, and are only removed when the applicant unsaves or the posting is hard deleted.
- `gftvjobs_tags`: id uuid pk, name text not null, slug text unique not null, colour text null, description text null, usage_count int default 0, created_at. Slug is lowercase and hyphenated, generated from the name. Enforce case-insensitive uniqueness on name so "Video Editing" and "video editing" cannot both exist.
- `gftvjobs_job_tags`: job_id references `gftvjobs_jobs` on delete cascade, tag_id references `gftvjobs_tags` on delete cascade, primary key on the pair, with indexes on both columns for filtering in either direction.

Search support:

- Add a `search_vector tsvector` generated or trigger-maintained column on `gftvjobs_jobs`, weighted A for title, B for tags and department, C for summary, D for the long body fields. Index it with GIN.
- Because tag and department names live in other tables, maintain the vector with a trigger that fires on insert or update of `gftvjobs_jobs` and on changes to `gftvjobs_job_tags`. Include the trigger functions in the search migration file.
- Enable the `pg_trgm` extension and add a trigram index on `gftvjobs_jobs.title` and `gftvjobs_tags.name` for the typo fallback and the autocomplete.
- Keep `gftvjobs_tags.usage_count` accurate with the same trigger, so tag counts do not need a join every time the tag cloud renders.

## 7. Application flow

Applications are collected in Google Forms, not in the portal. The portal's job is to gate access, hand the applicant over, log the handoff, and record whether the applicant says they went through with it.

### 7a. Clicking Apply

- Only a logged in applicant can apply. This is a server side check on the endpoint, not just a hidden button. A logged out request for a form URL returns 401 and writes no analytics row.
- When a logged in applicant clicks Apply, the client calls an authenticated endpoint. That endpoint:
  1. Verifies the session, and verifies the job is `published`, not past `closes_at` where one is set, and not blocked by the global applications toggle. A null `closes_at` passes this check.
  2. Inserts a row into `gftvjobs_analytics` with `event_type` of `apply_click`, the job id, the applicant id, `did_apply` false, and `response_state` pending.
  3. Upserts the `gftvjobs_applications` tracking row to status `started` and writes a `gftvjobs_application_events` row.
  4. Returns the prefilled form URL plus the id of the analytics row it just created.
- The client opens the modal first and then the new tab, in the order set out in 7c. Do not open the tab before the modal is on screen.
- The Apply button is disabled with an explanatory label once `closes_at` has passed, the status is not `published`, or the global toggle is off. A posting with no `closes_at` never disables on time grounds.

### 7b. Prefilling the applicant's email into the Google Form

This works and is worth doing. Google Forms supports prefill through query parameters.

- In Google Forms, open the form, choose "Get pre-filled link", fill in the email field with a placeholder, submit, and copy the resulting link. It contains an `entry.NNNNNNN` parameter for that field. That number is the field id.
- Store it in the job's `form_prefill` map, for example `{"entry.1045781291": "email", "entry.2005620554": "display_name"}`. The admin job editor has inputs for this, with help text explaining where the entry ids come from.
- The server builds the final URL as the base form URL plus `?usp=pp_url` plus each `entry.NNNNNNN=<value>` pair, with every value URL encoded. Build this server side from the session, never from a client supplied value.
- Two limitations to state plainly in the admin help text: prefilled values are editable by the applicant, so the email in the form response is not proof of identity, and prefill only works on the `viewform` URL, not on a `forms.gle` short link. Validate on save that the stored URL is a long-form `docs.google.com/forms/.../viewform` address.
- If a job has no `form_prefill` map, open the plain form URL. Never fail the handoff because prefill is not configured.

### 7c. The handoff modal

Clicking Apply opens a modal, and only then does the form open in a new tab. The order matters: the modal has to be on screen before focus moves away, so the applicant registers it going up and recognises it when they come back. A light tap on the shoulder, not an ambush on return.

**Sequence**

1. Click Apply. The modal opens immediately, in the same tick as the click, before any network call resolves. Nothing is awaited first.
2. The `api/applications/start` call fires in parallel and returns the prefilled form URL and the analytics row id. Prefetch the form URL earlier where possible, on `mouseenter` or `focus` of the Apply button, so by click time it is usually already in memory and nothing has to be awaited between the click and the new tab. Fall back to fetching on click when the prefetch has not landed.
3. Once the modal has actually painted and at least 800ms have passed since it opened, open the form with `window.open(url, '_blank', 'noopener')`. The short delay is deliberate, so the modal is visibly on screen before the new tab takes focus.
4. The modal itself is never at risk of being blocked. It is an in-page `<dialog>`, exactly like the theme modal, and browsers do not police those. The only thing a popup blocker can stop is step 3, the new tab. Keep step 3 inside the transient user activation window from the click, which is a few seconds in Chrome and Firefox, and avoid awaiting anything slow in between.
5. Safari and iOS are stricter than the rest and can refuse a `window.open` that happens after an `await` rather than synchronously inside the click handler. Do not fight this. Detect it: if `window.open` returns null or throws, treat the tab as blocked.
6. When the tab is blocked, swap the modal header to "Open the application form" and show a large primary anchor with the form URL and `target="_blank"`. A click on a real anchor is a fresh user gesture and always succeeds. The rest of the modal keeps working unchanged. Also render a quiet version of that link at the bottom of the modal in every case, since a tab can open on another monitor or behind the current window without the applicant noticing.

**Structure**

The modal has three stacked sections, in this order:

1. **Header.** Opens reading "Redirecting you to the job application form..." with a small indeterminate progress indicator. When the applicant returns to the portal tab, it changes to "Tell us what you think" and the progress indicator disappears. Detect the return with `document.visibilitychange` plus a `window` focus listener, and belt and braces, swap the header after 8 seconds regardless in case the tab never lost focus, for example when the popup was blocked or the form opened on a second monitor. Mark the header `aria-live="polite"` so the change is announced.
2. **Rate this job posting.** Five yellow stars, empty by default. Rating is optional and independent of the apply answer, and the modal never blocks on it. Save on selection, and allow changing the choice while the modal is open. Build it as a real radio group with visually hidden inputs and labels so it is keyboard operable with arrow keys, not a row of clickable spans. Yellow is the star fill only, so keep it accessible against both light and dark mode surfaces and pair it with a text label reading the value back, for example "3 of 5".
3. **Have you applied for this role?** Yes and No buttons, equally weighted, neither styled as the obvious default. Yes sets the analytics row's `did_apply` to true, `response_state` to answered, `answer_source` to applicant, and `responded_at` to now, then moves the tracking row to `submitted` and starts the cooldown in 7f. No sets `response_state` to answered, leaves `did_apply` false and the tracking row at `started`, and offers a line to reopen the form.

**Behaviour**

- Build it with a native `<dialog>` and `showModal()`, so focus is trapped and the backdrop comes free. It dismisses like every other modal on the site: clicking the backdrop closes it, Escape closes it, and there is a close control in the corner. Do not special case this modal into something harder to leave than the theme picker.
- Native `<dialog>` does not close on backdrop click by itself. Add it: listen for a click on the dialog element and close when the click coordinates fall outside the content box, or wrap the content in an inner element and close when the click target is the dialog itself.
- Dismissing without answering is fine and leaves the row pending, which already counts as No. The modal reopens on their next visit, so nothing is lost by closing it.
- Answering Yes or No closes the modal and replaces the Apply button on the page with the resulting state, either the cooldown notice or the reopen link. A rating already given is saved even if the modal is then dismissed without answering the apply question.
- **No answer means no.** `did_apply` starts false and stays false until something positively confirms otherwise. A pending row is treated as not applied everywhere it matters: no cooldown starts, the Apply button stays available, and the funnel does not count it as an application. The only difference between an unanswered row and an explicit No is the `response_state` and `answer_source` values, which exist so the analytics page can separate a real No from silence.
- The prompt survives leaving, and it is state rather than a page. There is no `/survey/` route and no route of its own at all. See "Resuming a pending prompt" below.
- Asking again is about recovering a possible Yes, not about withholding anything, so nothing in the portal is gated on answering.

**Resuming a pending prompt**

- The server is the source of truth. `GET api/applications/pending` returns the applicant's `gftvjobs_analytics` rows where `response_state` is pending, each with its row id, job id, and job title. It reads the applicant from the session cookie and never takes an id from the caller.
- A small shared script runs on every page of the portal. If an applicant session exists, it calls that endpoint once per page load and opens the modal if anything comes back, straight into the "Tell us what you think" state with no redirect step and no progress indicator. The modal is one component that takes a row id and a job id, so it can mount on any page.
- `localStorage` holds the same row id purely as a fast path, so the modal can appear before the fetch resolves on the job page the applicant just came from. Treat it as a cache that can be wrong. If the server says nothing is pending, clear it and show nothing. This is also why the server check exists at all: a different device or a cleared browser would otherwise lose the prompt.
- The outstanding item on `/account/tasks` opens the same modal in place. If it needs to be linkable, use a query parameter on the posting, `/jobs/{uuid}?prompt={analytics_row_id}`, rather than a nested path. The prompt is not a resource of its own, should never be indexable, and does not deserve a URL segment. Validate that the row belongs to the session's applicant before opening anything, and strip the parameter with `history.replaceState` once the modal is open so it does not linger in a shared link.
- Only ever show one modal at a time. If several prompts are pending, take the most recent and leave the rest for later page loads.
- While an answer is pending for a posting, the Apply button on that posting is replaced by a "You have an unanswered question about this application" prompt that reopens the modal, so a second handoff cannot stack on top of an unresolved one.
- The daily cron moves analytics rows still pending after 14 days to `response_state` of `no_response`, with `did_apply` staying false and `answer_source` set to `timeout`. Nothing about the applicant's access changes at that point, since silence was already being read as No. The timeout exists to stop the modal reappearing forever and to close the row off for reporting.
- The modal must be usable on a phone: full width sheet, thumb reachable buttons, stars large enough to tap accurately, and no reliance on hover.

### 7d. About blocking the tab from closing

I asked for the user to be forced to answer before closing the tab. That is not something a browser will allow, so build the closest honest version instead and do not waste effort fighting it:

- `beforeunload` is the only hook available, and all it does is show a browser generated confirmation dialog with text the site cannot control. Chrome, Firefox, and Safari all ignore custom messages. The applicant can still confirm and leave, every time. It also only fires if they have interacted with the page first.
- Register a `beforeunload` handler only while the modal is actually open and unanswered, and remove it on any close, whether that is Yes, No, Escape, the backdrop, or the close control. Do not keep it armed after the modal is dismissed, since the applicant has already told you they are done with it for now. That gives a genuine "are you sure you want to leave" prompt without pretending it is a lock.
- Do not attempt any of the hostile workarounds: no repeating `alert()` loops, no `history.pushState` back button traps, no fullscreen locks, no `unload` beacon spam. Browsers block or throttle these, they get the site flagged, and they punish the applicant for a data quality problem that is not theirs.
- The real safety net is the persistent modal in 7c, which reopens on the next visit rather than demanding an answer in the moment.
- The answer is made reliable by the Google Apps Script webhook in section 13, which confirms submissions independently of what the applicant clicks. Build that too. The modal stays regardless, since it covers forms where the script is not installed and since it also collects the rating.

### 7e. Withdrawing

- Applicants can withdraw, which sets the tracking status to `withdrawn` and writes an event row. Make clear on screen that withdrawing here does not delete their Google Form response, and that they should contact the team if they need it removed.
- Withdrawing clears the reapply cooldown described in 7f, so someone who pulls out is not locked out of a role they change their mind about.

### 7f. Reapply cooldown

Once an applicant has applied to a posting, they cannot apply to that same posting again for three months.

- The cooldown starts only on a positive confirmation, whichever comes first: the applicant clicking Yes in the modal in 7c, or the webhook in section 13 reporting the submission.
- Clicking No starts nothing, and neither does ignoring the modal. An unanswered prompt is read as No, so an applicant who closed the tab without answering keeps full access to the Apply button. Never infer an application from the click alone.
- On confirmation, set `applied_at` on the `gftvjobs_applications` row and `cooldown_until` to three months later. Store the date rather than computing it on read, so the rule stays stable if the policy changes later and so an admin can override a single row.
- Enforce it server side in the apply endpoint, not only by hiding the button. A request for a posting still inside its cooldown returns a clear error and writes no analytics row.
- The Apply button on a posting inside the cooldown is replaced by a disabled state reading "Applied on 4 March. You can apply again from 4 June." Show the same on the card in the search results, so nobody clicks through only to be turned away.
- The cooldown is per applicant per posting. A different posting is unaffected, and a role that is closed and later reposted gets a new uuid, so it is a new posting with no cooldown. Mention that in the admin help text, since it is the intended escape hatch for genuinely reopened roles.
- Admins can waive a cooldown on a single tracking row from the applicant tracking page, which clears `cooldown_until` and writes an event row naming who did it.

### 7g. Applicant dashboard

The account area gets two list pages beyond the profile. Both are private, both require an applicant session, and both must keep working for postings that are closed, expired, or archived.

**My applications (`/account/applications`)**

- Every posting the applicant has applied to or started an application for, newest first, with status, the date they applied, and the cooldown state where one is active.
- Bucket tabs mirroring the admin ones, so they can filter to submitted, in progress, or closed out.
- Each row links back to the posting at its `/jobs/{uuid}` URL. That link must resolve even if the posting has since closed, expired, or been archived, so an applicant can always reread what they applied for.
- Any unanswered prompt from 7c also surfaces on the outstanding tasks page below, which is the canonical place for it.
- Withdraw action, per 7e.
- Empty state pointing at `/search`.

**Saved jobs (`/account/saved`)**

- Same treatment. Postings the applicant saved, including ones that have since closed or expired, which stay visible with a clear "no longer accepting applications" badge rather than vanishing from the list.
- Unsave action, and a save or unsave toggle on both the job cards in `/search` and the job detail page.
- Saving requires a session. For a logged out visitor the save control opens the same sign in prompt as Apply, described in section 4, and completes the save once they are back.
- Sort by recently saved, with a filter for still open versus closed.

**Outstanding tasks (`/account/tasks`)**

A single inbox for anything the portal needs the applicant to deal with. It exists so a request from an admin has somewhere to land, now that notifications are in-portal only.

- Two sources feed the list, and the page unions them at read time:
  1. Unanswered apply prompts, derived live from `gftvjobs_analytics` rows at `response_state` pending. Do not copy these into the tasks table. The analytics row stays the single source of truth, and duplicating it guarantees the two drift apart.
  2. Rows in `gftvjobs_tasks`, which is where admin raised items live.
- Task types to support from the start: `info_request`, where an admin needs more detail before progressing an application, and `notice`, a one way message with nothing to submit. Leave the type column open so more can be added without a migration.
- Each item shows a title, the posting it relates to where there is one, who raised it, when, and its status. Open items sort first, newest first, with resolved ones collapsed under a "recently completed" section rather than vanishing.
- Opening an apply prompt item opens the modal from 7c in place. Opening an info request expands an inline panel with the admin's message and a single reply box.
- Keep replies to one round for now. The admin asks, the applicant replies once, the admin reads it and closes the task. This is deliberately not a messaging thread, and it should not grow into one without a decision to build that properly.
- A badge in the account navigation shows the count of open items across both sources, so the page is discoverable without an email or a push notification.
- Deep links: `/account/tasks?task={task_id}` opens a specific item, and the apply prompt keeps the `/jobs/{uuid}?prompt={analytics_row_id}` form from 7c. Validate ownership against the session in both cases, and strip the parameter with `history.replaceState` once it has been handled.
- Empty state that reads as a good thing, not an error.

**Account settings (`/account/settings`)**

Profile fields, password change, Telegram linking, and a clearly separated danger zone at the bottom.

*Danger zone*

Covers deleting the account, unlinking Telegram, disabling Telegram 2FA, and anything else destructive added later. Every one of them goes through the same three steps, in this order, with no way to skip ahead:

1. **Consequences.** Clicking the action opens a panel spelling out exactly what happens and what cannot be undone, with a cancel that is at least as prominent as the continue. For account deletion, say plainly that Google Form responses already submitted are held by Google and are not deleted by this, and that they should contact the team separately for those.
2. **Typed confirmation.** They type their own username to proceed. Not a checkbox, not "type DELETE", their username, so the action cannot be completed by muscle memory. Compare case sensitively and trim whitespace only.
3. **Password.** They enter their current account password, which is verified server side against the bcrypt hash on a dedicated endpoint. Never accept a client side "password was correct" signal. If Telegram 2FA is enabled on the account, also require a fresh code from the bot at this step, since that is the point of having it.

Then the action runs. Additional requirements:

- Rate limit these endpoints hard, and lock the danger zone for an hour after several failed password attempts.
- Every destructive action writes an audit row before it executes, so the record survives the deletion.
- Deleting an account cascades the applicant's own rows, keeps `gftvjobs_analytics` rows with `applicant_id` set to null so historical funnel numbers stay intact, and invalidates every session for that account immediately.
- Show a final confirmation screen after the fact, not just a redirect to the home page.

*Recovery codes*

- Two panels, one per set, each showing how many codes remain, when they were generated, and buttons to view remaining count and regenerate. Never re-display a code after generation.
- The account recovery panel carries the strongest warning on the page: with no email in the system, these codes are the only way back in without asking an admin.
- Generating either set requires the current password, per 5c.

*Trusted devices*

- List of trusted devices with when each was added and last used, plus revoke per device and revoke all, per 5d.
- Mark the current device in the list so nobody revokes the one they are sitting at without realising.

*Telegram 2FA*

- A "Link Telegram for 2FA" control that generates a short lived, single use linking token and shows both a `t.me/careersgftv_bot?start=<token>` deep link and a QR code of the same link, plus the token in text for anyone who wants to paste it.
- Once linked, show the linked Telegram display name, the date it was linked, and controls to send a test message, unlink, and toggle whether 2FA is required at login.
- With 2FA on, the login flow gains a second step after the password: the portal sends a six digit code to the applicant on Telegram, and the browser prompts for it. The applicant can also pull a code themselves from the bot if the push does not arrive.
- Codes are six digits, valid for five minutes, single use, stored hashed, and invalidated on a successful login or on issuing a newer code. Cap attempts per code and per account. A code from `gftvjobs_2fa_backup_codes` is accepted at this step in place of a Telegram code.
- If the applicant loses access to Telegram, their 2FA backup codes from 5c are the way back in. Require that set to exist before 2FA can be switched on, generating it in the same flow if it does not, and say plainly that losing both Telegram and the codes means asking an admin.

**Visibility rule for old postings**

Amend the 404 rule in section 4. A posting resolves at its uuid URL when any of these hold: it is `published`, it is `closed`, or the requester is an applicant with either a `gftvjobs_applications` row or a `gftvjobs_saved_jobs` row for it. A `draft` posting is visible only to admins previewing it. Anything else is a 404. Archived postings that an applicant has history with render in a read only state with a notice explaining the posting is no longer active.

## 8. Admin dashboard (`/admin`)

Match the gftv.asia link shortener admin layout: same sidebar, header, card and table patterns, same empty and loading states. Reuse those components rather than designing new ones.

Sections:

1. **Overview**: counts of published jobs, open applications by status, recent applications, recent registrations. Simple stat cards plus a recent activity table. Present the applicant pipeline as bucket tabs with live counts (All, Started, Submitted, Under review, Shortlisted, Interview, Offered, Rejected, Withdrawn) so an admin can jump straight into any bucket, and carry the same bucket tabs into the applicant tracking page.
2. **Job postings**: list with search, status filter, and sorting. Create, edit, duplicate, publish, unpublish, close, archive, delete. Rich enough editor for description, responsibilities, and requirements. Fields for the Google Form URL, the optional prefill entry ID mapping, and the optional response sheet link. Validate that the form URL is a real Google Forms address and refuse to publish a job without one. Tag picker with type-ahead, and require at least one tag before publishing. The closing date field has a "no closing date" toggle that clears it to null, so an admin cannot leave it empty by accident and cannot be blocked by a required date validator. Show open ended postings distinctly in the admin list so they are easy to audit, since nothing will ever close them automatically. Slug auto-generated from the title with a manual override and a uniqueness check.
3. **Applicant tracking**: list with filters by job, status, and date range. This tracks who was handed over to which form, not the answers themselves, so make that clear in the UI copy. Detail view showing the applicant profile, which job, when they started, and their current status. Change status with an optional note, which writes an event row. Waive an active reapply cooldown on a row, per 7f. Raise an outstanding task on the applicant from here, choosing a type and writing the message, then read their reply and resolve it. Show any open task inline on the tracking row so an admin can see at a glance who has been asked for something and has not come back. Timeline of status history. Bulk status change on selected rows. CSV export of the filtered set. Each job row links out to its response sheet so admins can read the actual answers in Google Sheets.
4. **Analytics**: per job funnel from `gftvjobs_analytics`. Views, apply clicks, answered yes, answered no, and still pending or timed out, with a click to yes conversion rate. Pending and timed out rows count as not applied, so the rate is a floor rather than an estimate, and the page should say so. Break the yes count down by `answer_source` so confirmed submissions are distinguishable from self reported ones. Show the average posting rating from `gftvjobs_ratings` alongside the funnel, with the response count next to it, and suppress the average entirely below three ratings so a single opinion does not read as a verdict. A sortable table across all jobs plus a detail view per job with a simple bar or line chart over time. Flag any job with a high click count and a low yes rate, since that usually means a broken or closed Google Form rather than a bad posting. CSV export.
5. **Invites and shortlists**: from a posting or from an applicant record, invite one or more applicants to a specific job with an optional note. Also mark an applicant against a posting without notifying them, for internal shortlisting. Invited applicants appear on the posting with their invite status, and the applicant list shows what each person has been invited to. Bulk invite from a filtered applicant list, with a confirmation step showing exactly who will be contacted, since this sends real messages. Withdraw an invite, which stops further reminders but leaves the record.
6. **Departments**: simple CRUD.
7. **Tags**: list with usage counts and search. Create, rename, recolour, and delete, where deleting warns how many postings will lose the tag. Merge two tags into one, moving all job links across and removing the duplicate. Find and clean up orphan tags with zero postings. In the job editor, tags are added through a type-ahead that matches existing tags first and only offers to create a new one when nothing matches, so the tag list does not fill up with near duplicates.
8. **Admin users**: list of the gftvhello accounts that can access this portal, with the ability to grant or revoke portal access, see 2FA enrolment status and last login. Do not add password reset or account creation for the gftvhello realm here, since that belongs to the main gftv.asia portal.
9. **Applicant users**: list of `gftvjobs_users` with search, view profile and application history, deactivate or reactivate, and delete with a confirmation dialog. No password viewing or editing. Two assisted recovery actions for people locked out with no codes left, both logged with the admin's id and a required reason: force a password reset on next login, and unlink Telegram after verifying identity out of band. Both revoke every session and trusted device for that account.
10. **Settings**: portal title, hero copy, featured job selection, application open or closed global toggle.

Every admin API route must verify the staff session server side and re-check the access flag on each request. Never trust a client-side role value.

### 8a. Admin documentation (`/admin/docs`)

The admin guide lives inside the portal rather than on the public docs site, behind the same staff session as the rest of the dashboard.

**Serving it safely**

- Content is markdown, one file per page, stored where Vercel will not serve it statically. Put it under `main-site/api/_admin-docs/` and add it to `includeFiles` in `vercel.json` so the function can read it. Anything sitting in the static root is world readable no matter what the UI does, which would defeat the whole point of moving it here.
- An authenticated route, `api/admin/docs`, checks the staff session and the same access flags as every other admin route, then returns the requested page. A second route streams images from the same place. Both 404 rather than 401 for a caller with no session, so their existence is not confirmed to anyone poking around.
- Render the markdown client side inside the existing admin shell, so the sidebar, header, and theming come free. No build step, since this is behind auth and search engines never see it.
- Sub navigation lists the pages in order, with previous and next links at the foot of each. Keep it simple: this is a manual, not a documentation platform.
- A search box filtering page titles and headings is enough. No index generation.
- Link to it from the admin sidebar, and link out to the public docs site for anything applicant facing.
- Since it is behind auth, this guide can be specific in ways the public site cannot. Real procedures, real edge cases, real warnings. Still no secrets: no environment variable values, no keys, no tokens.

**Pages**

- Who gets admin access, how it is granted, and signing in with an existing gftv.asia account including the second factor.
- Reading the dashboard overview and what each pipeline bucket means.
- Creating a job posting: every field explained, choosing tags well, when to set a closing date and when to leave a role open until filled, and what the slug does.
- Connecting the Google Form: creating the form, getting the pre-filled link, finding the entry ids for email and name, why the long form address is required rather than a short link, and linking the response sheet.
- Turning on confirmed submissions: the one time Apps Script setup per form, as a plain checklist with the copy button steps, since this is the fiddliest thing an admin has to do.
- The posting lifecycle: draft, publish, unpublish, close, archive, and duplicate, plus what each state means to applicants and what happens automatically at a closing date.
- Working through applications: statuses and what each one signals, adding notes, reading the timeline, bulk changes, exporting, and waiving a reapply cooldown.
- Reading the analytics: views, clicks, confirmed and self reported answers, what pending and timed out actually mean, why the conversion rate is a floor, and how a high click count with a low yes rate usually points at a broken form rather than a bad posting.
- Inviting applicants to a role and shortlisting without notifying, including what the applicant receives and what bulk inviting sends.
- Raising a request for more information, reading the reply, and closing it out.
- Managing tags: the type-ahead, merging duplicates, and clearing orphans.
- Managing departments.
- Managing admin access for other staff.
- Managing applicant accounts, including deactivation, deletion, and the assisted recovery actions available when someone is locked out.
- Portal settings: hero copy, featured roles, and the global applications toggle.
- Two short checklists to finish: everything to do before publishing a new role, and a weekly review routine.

## 9. API design

RESTful routes under `main-site/api/`, grouped:

- `api/auth/staff/*`: login, verify-2fa, logout, session, trusted-devices (list, revoke, revoke all)
- `api/auth/applicant/*`: register, login, logout, session, profile, change-password, forgot-password (verify a recovery code), reset-password (consume the ticket), recovery-codes (generate, count remaining), trusted-devices (list, revoke, revoke all)
- `api/public/*`: jobs list, job detail by uuid, slug to uuid lookup for the redirect, departments, tags, search, suggest
- `api/applications/*`: start (logs the analytics row, upserts the tracking row, returns the prefilled form URL and the analytics row id), respond (records the yes or no answer and sets the cooldown on a yes), pending (returns any unanswered prompts for this applicant), list mine, withdraw
- `api/saved/*`: save, unsave, list mine
- `api/ratings/*`: upsert a rating for a job, from the modal in 7c
- `api/tasks/*`: list mine (unioned with pending apply prompts), get one, reply, dismiss a notice, unread count for the badge
- `api/telegram/*`: create a linking token, poll link status, unlink, toggle 2FA, request a login code, verify a login code, consume a magic link
- `api/invites/*`: list mine, mark seen, decline
- `api/account/danger/*`: verify password, then the individual destructive actions
- `api/webhooks/form-submit`: the Apps Script integration described in section 13
- `api/admin/*`: jobs, applications, analytics, tasks, invites, departments, tags, docs (page content and assets, per 8a), tag-merge, users, admins, stats, export

Requirements for all routes:
- Validate and sanitise every input. Parameterised queries only.
- Consistent JSON error shape with proper status codes. Never leak stack traces or database errors to the client.
- Rate limit login, registration, 2FA verification, and application submission. A simple table-backed or in-memory limiter is fine, state which you chose in the README.
- Generic error text on failed login so the response does not reveal whether a username exists.

## 10. Settled decisions

1. **Applications and resumes**: handled entirely in Google Forms. The portal stores no files and builds no application form. No Supabase Storage, no uploads.
2. **Admin access**: a gftvhello account reaches the admin dashboard if `is_admin` is true **or** `is_editor` is true, and `is_approved` is true. Apply this same check on every admin API route.
3. **Notifications**: no email, ever, and no email dependency. In-portal is the baseline and always works. Telegram is an additional delivery channel for applicants who link an account, per section 15, and never the only record of anything.
4. **Telegram sends all three kinds**: `invite`, `task_raised`, and `application_status_changed`. All three ship in the first version, each individually toggleable by the applicant through `notify`.
5. **Both sign in paths stay**: the six digit login code and the magic link, exactly as set out in section 15. The magic link is a full login rather than a second factor, and its browser binding is not optional.
6. **The nine commands in section 15 are the full set**: `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs`, `notify`. No `help`. Do not add commands without asking.

Anything else that is ambiguous, stop and ask me rather than assuming.

## 11. Scheduled maintenance

Add a Vercel cron function that runs daily:

- Auto-close any `published` job whose `closes_at` is not null and has passed, setting status to `closed` and writing an audit row. Jobs with a null `closes_at` are skipped entirely and never auto-close.
- Health check each published job's `application_form_url` with a HEAD or lightweight GET. If the form is deleted, private, or no longer accepting responses, flag the job in the admin list with a warning badge rather than unpublishing it silently.
- Resolve `gftvjobs_analytics` rows still pending after 14 days to `no_response`.
- Delete expired rows from `gftvjobs_sessions`, `gftvjobs_trusted_devices`, `gftvjobs_password_resets`, `gftvjobs_telegram_tokens`, and expired `gftvhello_totp_challenges`. Do not touch `gftvhello_sessions` rows belonging to other portals beyond normal expiry cleanup.
- Surface the last cron run time and its results on the admin overview.

## 12. Inspiration notes

I found `github.com/JunRong19/SG-Jobs-Dashboard`. It is the job seeker side of the market rather than the employer side, and it is Next.js, React, TypeScript, and Tailwind, so do not copy its stack. Only these ideas carry over, and they are already folded into the sections above:

- Bucketed status views with live counts as the primary navigation for a pipeline, rather than a single table with a filter dropdown.
- Quick toggles for recency next to the search box.
- Automatic expiry of stale postings plus a periodic check that the linked posting is still live.
- A documents library and AI resume scoring are out of scope here, since the portal holds no resumes and Google Forms owns the answers.

## 13. Google Apps Script submission webhook

Build this. It is a small amount of code and it turns `did_apply` from a self reported claim into a recorded fact. The handoff modal in 7c stays exactly as specified, since not every submission will be matched, but the webhook becomes the authoritative source when the two disagree.

### What it does

An Apps Script bound to each job's Google Form fires on submit and posts the respondent's email, the job id, and the response id to the portal. The portal matches the email to a `gftvjobs_users` row and marks the application as genuinely submitted.

Only the email, the response id, and the timestamp are sent. The answers themselves never leave Google, which keeps the portal free of application content exactly as decided in section 10.

### Portal side

Add a table:

- `gftvjobs_form_submissions`: id uuid pk, job_id references `gftvjobs_jobs`, form_response_id text not null, email text not null, submitted_at timestamptz not null, matched_applicant_id uuid references `gftvjobs_users` on delete set null, received_at timestamptz default now(). Unique constraint on (job_id, form_response_id) so a retried delivery is idempotent.

Add `POST api/webhooks/form-submit`, enabled by default:

1. Compare the `x-portal-secret` header against `FORM_WEBHOOK_SECRET` using a timing safe comparison. Return 401 on mismatch and log nothing sensitive.
2. Validate the payload shape. Return 400 on anything malformed.
3. Insert into `gftvjobs_form_submissions`. If the unique constraint fires, return 200 and stop, since that is a duplicate delivery, not an error.
4. Look up `gftvjobs_users` by email, case insensitively.
5. On a match: set the applicant's most recent `gftvjobs_analytics` row for that job, pending or already resolved to No or timeout, to `did_apply` true, `response_state` answered, and record that the source was the webhook rather than the applicant. Move the `gftvjobs_applications` tracking row to `submitted`, set `applied_at` and `cooldown_until` per 7f if they are not already set, and write an event row attributing the change to the webhook. If no analytics row exists, because they reached the form by a shared link, create the tracking row anyway.
6. On no match: leave `matched_applicant_id` null and surface the row in the admin analytics page under an "unmatched submissions" list, so an admin can link it by hand. Someone applying with a different email than they registered with is the normal cause.
7. Always return 200 for anything that is not an auth or validation failure. Apps Script retries are noisy and a 500 helps nobody.
8. Rate limit the endpoint and cap the payload size.

`answer_source` on `gftvjobs_analytics` records what produced the answer, so the admin analytics page can show how much of the funnel is self reported versus confirmed. A webhook confirmation overrides an earlier No or a timeout, since a recorded submission beats silence or a misclick.

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
- Put this checklist in the admin job editor as collapsible help text next to the Google Form URL field, with the posting uuid shown and a copy button, so nobody has to go hunting for it.

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

- Signing in, registering, and 2FA. Show a clear offline state on those forms rather than letting a submit fail silently.
- Opening a Google Form, so the Apply button is disabled offline with the reason given.
- The admin dashboard. Cache its shell only, and show an offline notice instead of stale management data. Never let an admin act on a cached view of applications.
- Anything that would show another person's data.

### Caching strategy

- Precache the shell and static assets on install, keyed by a build version constant at the top of `sw.js`. Bump it to invalidate.
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

## 15. Telegram bot (`telegram-bot/`)

Build a Telegram bot in a new `telegram-bot` directory in this same repo, based on the scripts in `main-site` so the two agree on the schema and the flows. It runs on my Debian 13 VPS under tmux, with GitHub for version control.

### Build conventions

- Telethon, Python. Not python-telegram-bot, not aiogram.
- Bot username is `careersgftv_bot`. Never mention the bot's name inside any command text or reply.
- Include a `README.md` explaining what the bot is and how to use it, a `setup.md` covering BotFather setup with the about text, description, and command list, and a `.gitignore`.
- Deliver every file individually. No zip.
- SQLite for anything bot local: scheduling, rate limits, dedupe, and the registry of active interaction buttons, so buttons keep working forever across restarts. Store the callback payload and its meaning in SQLite and look it up on click rather than packing state into the callback data.
- Supabase is the shared source of truth for accounts, links, tokens, invites, and the notification outbox. The bot reads and writes those directly with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. SQLite never duplicates account data.
- Prefer rich formatted replies over plain text. Avoid em dashes, and rephrase rather than leaving a sentence that only worked with one.
- Any knowledge base content, if it ever becomes relevant, comes from an open source REST API rather than a hardcoded list.

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
3. The bot hashes the payload, finds an unused unexpired row, writes the `gftvjobs_telegram_links` row with their Telegram user id, marks the token used, and confirms in chat.
4. The settings page is polling and flips to linked without a refresh.
5. Tokens expire in ten minutes and are single use. A token that is already used, expired, or unknown gets a clear message and no detail about why.

### Login codes and magic links

- `code`, or the button on the 2FA prompt, issues a six digit code valid for five minutes, single use, stored hashed, with an attempt cap.
- The magic link variant sends a one tap button that signs the applicant in directly. Treat it as a full login rather than a second factor, because that is what it is. Bind it to the browser that requested it by storing a nonce in a cookie at request time and checking it on consumption, so a forwarded link is useless to anyone else. Keep its lifetime to five minutes.
- Never send a code or link to a Telegram account that is not currently linked to the account being signed into.
- Rate limit per account and per Telegram user, and back off after repeated failures rather than silently ignoring them.

### Notifications

- The site never calls the bot. It writes a row into `gftvjobs_notifications` and returns.
- The bot polls that table every 15 to 30 seconds, claims a batch by moving rows from `queued` to `claimed` in a single conditional update so two bot instances cannot double send, sends, then marks `sent` or `failed` with the error and an attempt count. Retry failures a few times with backoff, then leave them `failed` for an admin to see.
- Three kinds, all shipping in the first version: `invite`, `task_raised`, and `application_status_changed`. Security messages such as a password reset or a new trusted device are sent directly rather than queued, and are not subject to the `notify` toggles, since silencing them is what an attacker would want. An applicant with no Telegram link gets their rows marked `skipped` rather than left queued forever.
- Respect the `notify` toggles per kind, and always include an unsubscribe hint in the footer of a notification.
- Keep Telegram rate limits in mind: pace sends, and handle flood wait errors by rescheduling in SQLite rather than sleeping the whole worker.

### Invites over Telegram

- When an admin invites an applicant to a posting, the site writes the invite row and queues an `invite` notification.
- The message names the role and the department, includes the admin's note if there is one, and carries buttons to view the posting and to decline. Declining writes back to `gftvjobs_invites`.
- An applicant with no linked Telegram still sees the invite in the portal on `/account/tasks`, so Telegram is a delivery channel and never the only record.

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

A separate static documentation site in a new `docs-site` directory in this same repo, served at `docs.careers.globalfurry.tv`. It is written for applicants, not for developers or admins. Nothing internal goes in it: no table names, no endpoint paths, no environment variables, no Google Form URLs.

### Scope

Two guides, each a top level section in the sidebar, both written for someone who has never seen the portal:

1. **How to use the Careers@GFTV portal**
2. **How to use the Careers@GFTV Telegram bot**

The admin guide is deliberately not here. It lives inside the portal behind the staff session, per section 8a, because this site is public and an admin guide describes screens full of real applicants. Leave the sidebar able to take another public section later without rework.

### Design language

Follow GitBook's structure and interaction patterns, with GFTV's own palette from `gftv-theme.md`. Take the layout conventions, not the branding. Never use GitBook's logo, name, or assets, and do not imply any affiliation.

- Three column layout on desktop: fixed left sidebar with collapsible sections, a centred content column of roughly 720 to 800px, and a right hand on-page table of contents that highlights the current heading while scrolling.
- Below 1024px the right hand contents column drops to a collapsible block above the content. Below 640px the left sidebar goes behind a hamburger button as an off canvas panel, following the shared rules in section 3. Search stays in the header at every width rather than being hidden inside the menu, since search is how people navigate documentation on a phone.
- Code and command blocks scroll horizontally within their own container on small screens, never pushing the page sideways.
- Sticky header with the site name, a search field, a link across to the portal itself, and the light and dark toggle.
- Generous whitespace, quiet hairline borders rather than shadows, restrained type scale, comfortable line length and line height. GitBook reads calm, so match that rather than making it dense.
- Breadcrumbs above the page title, and previous and next page links at the foot of every page.
- Anchor links that appear on heading hover and copy a link to that heading.
- Callout blocks in four flavours: note, tip, warning, and danger. Use them sparingly.
- Collapsible details blocks, and tabbed blocks for anything that differs between desktop and mobile.
- Code and command blocks with a copy button, used mainly for bot commands.
- Two axis theming exactly as the main site, same tokens, same `data-color-theme` and `data-mode` attributes, light default, WCAG AA in every combination.

### Build approach

- Content lives as markdown in `docs-site/content/`, one file per page, with front matter for title, sidebar order, and a short description.
- A small Node script converts those to static HTML at deploy time using a shared layout, and emits a `search-index.json`. This is a deliberate exception to the no build step rule for the main site, and the reason is that hand maintaining a shared sidebar and header across thirty HTML files is how documentation rots. If you would rather keep it fully build free, say so before phase 11 and I will render client side instead.
- Search is client side over the generated index. Match on title, headings, and body text, show the matching heading in the result, and jump straight to the anchor. No third party search service.
- Every page carries a last updated date taken from git.
### Screenshots

Screenshots are captured with Playwright, not by hand.

- Put a capture script in `docs-site/scripts/`, with its own `package.json` and Playwright config scoped to `docs-site` so it never becomes a dependency of the portal build.
- It runs on demand against a local or staging instance, never as part of the Vercel build and never against production. Vercel cannot run browsers on a build anyway, and production holds real applicant data.
- Drive it from a manifest file listing every shot: the page path, the viewport, the theme and mode, the element to wait for before capturing, whether to capture full page or a single selector, and any region to mask.
- Log in using accounts and postings created by the seed script, so every screenshot shows invented people applying to invented roles. No real applicant, email, or Telegram handle ever appears in the docs.
- The same script also captures the admin guide shots from 8a, writing those to the admin docs asset directory instead of the public one. Seeded data only there too, since a leaked admin screenshot is a leaked list of applicants.
- Never capture a screen showing a live recovery code, backup code, login code, linking token, or Google Form URL. Where a page like that needs illustrating, seed a fake value and say in the caption that it is an example.
- Capture at a desktop width and a phone width, in light and dark mode, so the docs can show the hamburger navigation and mobile layouts described in section 3.
- Make runs deterministic: disable animations and transitions, freeze or mask relative dates and any "last updated" text, and mask anything that changes between runs. A screenshot set that produces a diff on every capture stops being reviewable.
- Output to `docs-site/public/screenshots/` with predictable names built from the manifest entry, for example `portal-search-desktop-light.webp`. Convert to webp and keep them committed, since the docs need them at build time.
- Until the first capture run, render clearly marked placeholder slots with the intended alt text and caption in place, so a missing image reads as pending rather than broken.
- Document the whole thing in the `docs-site` README: how to seed, how to run a capture, how to add a shot to the manifest, and how to re-run just one.

### Portal guide, page by page

- What Careers@GFTV is, and what you need to apply.
- Creating an account, and what happens after (no approval wait, no email verification).
- Signing in, including the stay signed in and trust this device options and what each one actually does.
- Finding roles: searching, filters, tags, quick chips, and what "Open until filled" means.
- Saving roles for later.
- Applying: what happens when you press Apply, why a Google Form opens in a new tab, the rating and the "have you applied" question, and what happens if you close the window without answering.
- Why you cannot reapply to the same role for three months, and what to do if you need to.
- Tracking your applications and what each status means.
- Outstanding tasks, and what to do when a team member asks you for more information.
- Account settings: profile, password, recovery codes, trusted devices.
- Recovery codes explained plainly: the two sets, what each one unlocks, and the fact that losing both the password and the codes means asking the team for help.
- Using the portal offline and installing it to a home screen.
- Troubleshooting and a short FAQ.

### Bot guide, page by page

- What the bot does and what it cannot do.
- Linking your Telegram account, both from the portal and from the bot.
- Command reference, one entry per command with what it returns: `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs`, `notify`.
- Signing in with a code versus a one tap link, and why the one tap link only works in the browser that asked for it.
- Notifications: the three kinds, how to turn each off, and why security messages cannot be turned off.
- Job invitations and how to respond to one.
- Unlinking, and what happens to 2FA when you do.
- Troubleshooting: no message arrived, code expired, wrong account linked.

### Deployment

- Its own Vercel project with the root directory set to `docs-site`, since the portal project already points at `main-site`. Two projects, one repo.
- Custom domain `docs.careers.globalfurry.tv`.
- Cross link both ways: a docs link in the portal footer and in the bot's start message, and a portal link in the docs header.
- `robots.txt`, `sitemap.xml`, and `llms.txt` generated from the page list, per the discovery files in section 4.
- Its own README covering local preview, adding a page, and the screenshot checklist.

## 17. Deliverables

- Full working repo following the structure above.
- The `migrations/` directory with every numbered SQL file, its README, and the rollback blocks.
- `sitemap.xml`, `robots.txt`, and `llms.txt` on both sites, per section 4.
- Root README covering setup, environment variables, Supabase configuration, Vercel deployment, and the custom domain setup for `careers.globalfurry.tv`.
- `main-site/.env.example` as specified in section 2, with a how-to-obtain comment on every variable.
- The four READMEs described in section 2, kept current through every phase.
- Seed script with a few sample departments and job postings for local testing.
- The `telegram-bot` directory per section 15, with its own README, setup.md, .gitignore, and .env.example, delivered as individual files.
- `next-steps.md` kept current through every phase, per section 0b, and gitignored.
- `build-status.json` kept current as phases ship, per section 0c.
- The `docs-site` directory per section 16, with its own README, the Playwright capture script, and the screenshot manifest.
- The admin documentation content and routes per 8a, inside `main-site`.
- A short offline test checklist in the README: install the app, load the board, go offline, browse a cached posting, rate it, answer the modal, come back online, confirm the queue flushed.
- Deliver files individually, never as a zip.
