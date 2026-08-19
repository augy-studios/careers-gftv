# Careers@GFTV

The careers portal for Global Furry Television, served at
`careers.globalfurry.tv`. It is a clean public job board with a search and
filter listing, individual posting pages, and an authenticated application
flow, with a private admin dashboard behind it. Applications themselves are
collected in Google Forms: the portal's job is to gate access, hand the
applicant over, log the handoff, and track what happened next. It is a GFTV
HelloApp and follows the same conventions as the other GFTV PWAs.

**Phases 1 to 3 of 15 have shipped.** The database schema and the shared server
side code, then signing in, and now the job board itself. The public surface is
the home page, `/search` with its filters and suggestions, a posting's tags and
dates on every card, `/about`, `/faq`, `/status`, creating an account and
signing in, and a placeholder page that every route belonging to a later phase
renders. Opening an individual posting arrives in phase 4 and applying in phase
5. Live status:
[careers.globalfurry.tv/status](https://careers.globalfurry.tv/status).

The site is built and released in public, one phase at a time. `main` is always
deployable, and the interface is honest about what is not there yet: a control
for an unshipped feature stays visible and disabled with the reason on it,
rather than being hidden.

## Directories

| Directory | What is in it |
|---|---|
| `main-site/` | The portal. Static HTML, CSS, and JavaScript with no build step, plus Vercel serverless functions in `main-site/api/`. This is the Vercel root directory for the portal project. |
| `migrations/` | Every numbered SQL file, run by hand in the Supabase SQL editor. Nothing automated applies these. |
| `telegram-bot/` | The `careersgftv_bot` Telegram bot. Scaffold only until phase 11. Runs on a Debian VPS under tmux. |
| `docs-site/` | The public documentation site for `docs.careers.globalfurry.tv`. Scaffold only until phase 13. Its own Vercel project on the same repo. |

Four READMEs, plus the one in `migrations/`, and no others. Each says what
lives in its directory and how to work with it.

| Where | What it covers |
|---|---|
| This file | The project, the directories, the current phase, running the migrations, and where the specification and environment variables live. |
| [`main-site/README.md`](main-site/README.md) | Local development, environment variables, the two auth realms, the API route map, the Vercel settings, and the offline test checklist. |
| [`migrations/README.md`](migrations/README.md) | Every migration file in order, how to run them, and the rule about never editing an applied file. |
| [`telegram-bot/README.md`](telegram-bot/README.md) | What the bot does, the nine commands, running it under tmux, and its environment variables. |
| [`docs-site/README.md`](docs-site/README.md) | What the docs site covers, adding a page, previewing, and the screenshot capture. |

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
nothing is written to them beyond the session, challenge, trusted device, and
backup code rows the login flow legitimately owns.

## Environment variables

Every variable is documented in [`main-site/.env.example`](main-site/.env.example)
with a comment saying exactly where to get it, and the bot has its own
[`telegram-bot/.env.example`](telegram-bot/.env.example). Real values live in
`.env.local` and in the Vercel project settings, both gitignored.

| Variable | Used by | Where it comes from |
|---|---|---|
| `SUPABASE_URL` | site, bot | Supabase dashboard, Project Settings, Data API, Project URL. |
| `SUPABASE_SERVICE_KEY` | site, bot | Supabase dashboard, Project Settings, API Keys, `service_role`. Treat it like a database password. |
| `SITE_URL` | site, bot | The portal's own origin, no trailing slash. |
| `FORM_WEBHOOK_SECRET` | site | Generate with `openssl rand -hex 32`. |
| `CRON_SECRET` | site | Generate with `openssl rand -hex 32`. |
| `TELEGRAM_BOT_TOKEN` | bot | BotFather, `/mybots`, select the bot, API Token. |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | bot | my.telegram.org, API development tools. |
| `DONATION_URL` | bot | Shown as a button on the start message. |

**Rotating `FORM_WEBHOOK_SECRET`** takes a coordinated change, because it lives
in two places. Generate the new value, set it in the Vercel project settings and
redeploy, then update `PORTAL_SECRET` in the Script Properties of every form's
Apps Script. Submissions arriving between the two steps are rejected with a 401
and are not retried usefully, so do it when nothing is being submitted, and
confirm afterwards that a test submission lands in
`gftvjobs_form_submissions`. This applies from phase 9, when the webhook ships.

## Deployment

Two Vercel projects, one repository.

| Project | Root directory | Domain | From phase |
|---|---|---|---|
| Portal | `main-site` | `careers.globalfurry.tv` | 1 |
| Documentation | `docs-site` | `docs.careers.globalfurry.tv` | 13 |

Neither has a build step for its static files. The portal project installs
`main-site/package.json` so the functions have their dependencies.

To point `careers.globalfurry.tv` at the portal project: add it as a domain in
the Vercel project settings, then add the CNAME Vercel gives you at the DNS
provider for `globalfurry.tv`. Vercel issues the certificate once the record
resolves.

The bot is not on Vercel. It runs on a Debian VPS under tmux, from this same
repository.

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
