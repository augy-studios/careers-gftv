---
title: 2. Stack and repo conventions
access: developer
order: 5
summary: Each one is short and says what lives in that directory and how to work with it.
---

# 2. Stack and repo conventions

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

**Keep them current.** A README goes stale the moment it stops matching the code, and a stale README is worse than none. Update the affected ones in the same phase as the change, and never as a cleanup pass afterwards. Do it whenever any of these happen: a phase ships and the root README's status line moves; an environment variable is added, removed, or renamed; a directory gains or loses a meaningful part; a command or route set changes; or the way something is run changes. Treat it as part of the work, the same as updating `next-steps.md`.
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
- The weighted full text search, `ts_headline` snippets, and the trigram fallback are awkward to express through PostgREST filters. Write them as Postgres functions in their own migration file and call them with `supabase.rpc()`. Two are suggested. `gftvjobs_search_jobs(q text, filters jsonb, limit int, offset int)` returns ranked rows with a total count, and `gftvjobs_suggest(q text)` returns grouped title, tag, and department suggestions.
- Keep the tsvector and `usage_count` maintenance in Postgres triggers, and out of application code. Then a posting edited directly in the Supabase table editor stays searchable.
- Use `.select('*', { count: 'exact' })` for paginated listings, so the total is one round trip and not two.
- Foreign keys pointing at `gftvhello_users` are references only. Never insert, update, or delete rows in any `gftvhello_*` table. The exception is the session, challenge, trusted device, and backup code rows the login flow legitimately owns. **One more named exception**, added deliberately and with the conflict on the table: the staff recovery flow in 5g writes `gftvhello_users.password_hash`, and only that column. Read 5g before touching it, because the consequence reaches gftv.asia.
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
