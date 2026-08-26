# main-site

The Careers@GFTV portal itself: a static frontend with no build step, plus
Vercel serverless functions under `api/`.

Vercel's root directory for this project is set to `main-site`, which is why
`api/` lives inside this directory and not at the repo root.

**Current phase: 6 of 15, Applicant dashboard.** Live: the shell, the home page,
`/status`, registering and signing in, passkeys, recovery codes, account
recovery, trusted devices, `/account/security`, `/admin/security`, the board at
`/search`, the posting page at `/jobs/{uuid}` with the openings feed and the
translation report control, and applying, which is the handoff to the Google
Form, the rating, and the reapply cooldown. Phase 6 adds the rest of the account
area: `/account`, `/account/applications`, `/account/saved`, `/account/tasks`,
and `/account/settings` with avatars and the danger zone. Everything else
renders the placeholder. See [/status](https://careers.globalfurry.tv/status).

**Every role listed on this site is voluntary and unpaid**, and the interface
says so on the home page, the registration page, the footer, the manifest, and
in every link embed. Written as a statement about the postings that exist,
not a promise about the future: `gftvjobs_jobs.is_paid` exists so a
paid posting can say otherwise for itself, and the commitment types
(`full_time`, `part_time`, `contract`, `internship`, `volunteer`) describe how
much time a role takes, not whether it pays. A full time volunteer is a real
thing here.

## Layout

```
main-site/
  index.html          home page
  search/index.html   the job board, which is the listing and the results page
                      /jobs/{uuid} has no file. It is rendered by
                      api/job-page.js, per section 4
  about/index.html    what Careers@GFTV is, and why every role is unpaid
  faq/index.html      frequently asked questions
  status/index.html   the public build status page and changelog
  login/index.html    applicant sign in
  register/index.html applicant registration
  forgot-password/    account recovery with a recovery code
  account/            the account area, phase 6
    index.html        the hub: three counts and a way back to the board
    applications/     7g's My applications, with the bucket tabs
    saved/            7g's saved roles
    tasks/            7g's outstanding tasks, both sources unioned
    settings/         profile, picture, reports filed, and the danger zone
    security/         recovery codes, password, passkeys, trusted devices
    translations/     7i's helper area, for an applicant granted a language.
                      Phase 8. Not linked for anybody else, and the navigation
                      item is absent rather than disabled
  admin/              the dashboard, phases 7 and 8
    index.html        8.1's overview: postings, the pipeline, what is new
    jobs/             8.2's postings list
    jobs/edit/        the tabbed per language editor and the sections builder
    applications/     8.3's applicant tracking, with the task composer
    departments/      8.6's teams
    tags/             8.7's tags, with the merge
    maintenance/      8.12's switches
    analytics/        8.4's funnel per posting, with the daily chart. Phase 8.
                      The one dashboard page with no POST
    invites/          8.5's invites and shortlists, one posting at a time
    admins/           8.8's staff access. Admins only, end to end
    applicants/       8.9's applicant accounts. Admins only, end to end
    settings/         8.10's portal settings, and the applications toggle
    translations/     8.11's queue, its needs-translation audit, and 7i's
                      helper roster. Three tabs, one route
    login/            staff sign in, with the second factor step
    security/         staff passkeys and trusted devices
  placeholder.html    served for every route belonging to a later phase
  404.html            genuinely unknown paths
  offline.html        the service worker's answer for an uncached route, at
                      /offline. The address bar keeps the route that was asked
                      for, so its retry control is a reload
  manifest.json       PWA manifest: icons, screenshots, and the two shortcuts
  HLC-*.png           the app icons, every one of them generated. See below
  favicon.ico         one 256 square entry. See below
  images/install-*.png  the two install screenshots, generated
  sw.js               service worker: the precache list and the four caching
                      strategies. See below before editing the list
  vercel.json         rewrites, redirects, and headers
  assets/
    build-status.json the source of truth for the phased rollout
    css/theme.css     the GFTV token system, all four theme combinations
    css/app.css       shell layout, header, footer, notice bar, the board
    js/theme.js       the two axis theme module
    js/icons.js       inline SVG icons
    js/shell.js       header, nav, footer, theme modal, the single entry point
    js/build-status.js the notice bar, the disabled control pattern, placeholders
    js/status-page.js the /status page
    js/offline.js     registers the worker, owns the update prompt and the
                      connection banner. The one place register() is called
    js/idb.js         the applicant's own data offline, keyed by user id.
                      Imports nothing: it is the bottom of the stack
    js/offline-page.js  the fallback page's live connection state and its
                      retry control, disabled with the reason while offline
    js/format.js      dates, counts, and the open until filled rule
    js/job-card.js    one card renderer, shared by the home page and the board
    js/search-page.js the board: URL state, filters, chips, suggestions
    js/home-page.js   the hero dropdown, latest openings, browse by team
    js/job-page.js    the posting page, drawn from the payload the function
                      inlined. There is no fetch on that page.
    js/markdown.js    the small markdown subset a posting body is written in.
                      Escapes first, then formats, so no tag ever reaches it
    js/dialog.js      a modal in a function, for the two below
    js/signin-prompt.js  section 4's prompt for a logged out visitor, and the
                      intent that survives the round trip
    js/translation-report.js  7h's report form
    js/apply.js       the Apply control, and the six states one posting can be
                      in for one reader
    js/apply-dialog.js  7c's handoff modal. A native <dialog>, unlike the three
                      above, and the reason is in the file
    js/apply-prompt.js  the unanswered prompt that follows an applicant across
                      the portal. Imported by shell.js, so it is on every page
    js/apply-badges.js  the cooldown, on a card, per 7f
    js/save-button.js the save toggle, on a card, on a posting, and on the
                      saved list. One control, three places
    js/account-shell.js  the account area's session guard, sub-navigation, and
                      the count on the tasks item
    js/account-row.js one posting as a row on a dashboard list. Not a job card,
                      and the file says why
    js/account-page.js, applications-page.js, saved-page.js, tasks-page.js,
    js/settings-page.js  the five pages of the account area
    js/translations-page.js  7i's helper area, the sixth. Phase 8
    js/annotate.js    7i's in-place annotation layer. Loaded by a dynamic import
                      and only for somebody who may use it, so a reader who
                      cannot never fetches it
    js/site-settings.js  8.10's public half: the portal title, the hero copy,
                      and the featured roles, read by shell.js and home-page.js
    js/avatar.js      square crop, resize, and WebP encode, in the browser.
                      See AVATARS.md
    js/i18n.js        language switching and the string dictionaries
    js/api.js         the one place that knows the API response shape
    js/forms.js       field errors, busy states, password reveal
    js/recovery-codes.js  the shown once code dialog
    js/login-page.js, register-page.js, forgot-password-page.js,
    js/admin-login-page.js, security-page.js, staff-security-page.js
    js/admin-shell.js the dashboard's session guard, sidebar, and top bar
    js/admin-page.js, admin-jobs-page.js, admin-job-editor.js,
    js/admin-applications-page.js, admin-departments-page.js,
    js/admin-tags-page.js, admin-maintenance-page.js  phase 7's seven pages
    js/admin-analytics-page.js, admin-invites-page.js, admin-admins-page.js,
    js/admin-applicants-page.js, admin-settings-page.js,
    js/admin-translations-page.js  phase 8's six
    js/admin-questions.js  7g's question set composer, used by the editor and
                      by the task composer. The set is frozen once sent
    js/passkeys.js    WebAuthn in the browser, hand written
    i18n/en.json      English interface strings
    i18n/zh.json      Simplified Chinese interface strings
    fonts/            self hosted Proxima Nova, see below
  api/
    _lib/             shared server side helpers
    auth/staff/       login, verify-2fa, logout, session, trusted-devices
    auth/applicant/   register, login, logout, session, profile,
                      change-password, forgot-password, reset-password,
                      recovery-codes, trusted-devices, locale
    public/           search, suggest, facets, job, jobs-feed,
                      feature-status, site-settings, view. No session is read in
                      any of them except for an archived posting, which 7g shows
                      only to an applicant with history. `view` is the one
                      write a caller with no account can make.
    translations/     report, mine, helper, annotations. 7h's form and 7i's two
                      halves. Two routes writing one table, and the file says
                      why they are not one
    applications/     start, respond, pending, mine, withdraw. The only place
                      in the build that emits a Google Form URL, and only to a
                      session that has been checked
    saved/            mine, toggle
    tasks/            mine, count, respond
    account/          avatar, and danger/delete
    admin/            me, stats, jobs, applications, tasks, departments, tags,
                      maintenance, analytics, invites, admins, applicants,
                      settings, translations. Every one re-checks the staff
                      session and the access flag on the request, per section 8,
                      and admins, applicants, and the helper actions on
                      translations re-check `is_admin` as well
    ratings/          upsert a rating for a posting, from the handoff modal
    job-page.js       the server rendered posting page. The one route in this
                      portal that returns HTML instead of JSON.
```

## Local development

```bash
cd main-site
npm install
cp .env.example .env.local   # then fill it in
npx vercel dev
```

`vercel dev` serves the static files and runs the functions in `api/`. For the
pages alone, any static server pointed at this directory works, but the
functions will not run.

A function throws at import time with a message naming the variable if anything
from `.env.example` is missing. That is deliberate, per section 2 of the
specification: better a loud failure at start up than an undefined key three
calls deep.

## Environment variables

Every variable is documented in [.env.example](.env.example) with a comment
saying exactly where to get it. Real values go in `.env.local` locally and in
the Vercel project settings for preview and production. `.env.example` is
tracked; `.env` and `.env.local` are not.

| Variable | Where it comes from |
|---|---|
| `SUPABASE_URL` | Supabase dashboard, Project Settings, Data API, Project URL. The existing GFTV project, not a new one. |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard, Project Settings, API Keys, `service_role`. Server side only. Bypasses row level security. |
| `SITE_URL` | This site's own origin, no trailing slash. `http://localhost:3000` locally. |
| `FORM_WEBHOOK_SECRET` | Generate with `openssl rand -hex 32`. The same value goes into each form's Apps Script as `PORTAL_SECRET`. |
| `CRON_SECRET` | Generate with `openssl rand -hex 32`. Vercel sends it as the bearer token on scheduled invocations. |

The browser never talks to Supabase directly and never receives an anon key, so
there is no Supabase client bundled into the frontend at all.

## Avatars

Built in phase 6, on `/account/settings`. `api/account/avatar.js` takes the
bytes and `api/_lib/avatars.js` holds the Storage half; the browser compresses
first in `assets/js/avatar.js`.

**The bucket is not created by any migration and has to exist before the
endpoint works.** `gftvjobs-avatars`, public, a 256 KB file size limit,
`image/webp` only, and no policies on `storage.objects`. The SQL is in
[AVATARS.md](AVATARS.md) section 1. An account with no picture renders its
initial instead, which is the ordinary case, not a failure, so a missing
bucket looks like nobody having uploaded anything until somebody tries.

**[AVATARS.md](AVATARS.md)** is the guide, and its first section changes a
settled decision: section 10 item 1 says "No Supabase Storage, no uploads", and
this one square image per account is the recorded exception. Applications and
resumes stay in Google Forms regardless.

Two things in it that are easy to get wrong and are worth repeating here:

- **The browser never receives an anon key**, so it cannot upload to Storage
  directly. The bytes come through a function using the service key, which is
  also why the browser has to compress first: a Vercel function takes at most
  4.5 MB of request body.
- **`readJson` caps bodies at 64 KB**, which is right for JSON and far too small
  for an image. `api/account/avatar.js` reads the raw body with its own cap
  instead of raising that default globally.

The shape is forced by section 2. The browser never receives an anon key, so it
cannot upload to Storage directly the way a Supabase app normally would. The
bytes go through a function using the service key, which is also why the
browser has to compress first: a Vercel function takes at most 4.5 MB of
request body.

## Forms

**Every form carrying a credential declares `method="post"`. The two search
forms deliberately do not.**

Each page's module intercepts its own submit and prevents the default, so the
method is unused once the page has hydrated. It matters before that, and in the
case where the module never loads: a form with no method defaults to GET, and a
native submit then navigates to the same URL with every field in the query
string. On `/login` that is a username and a password reaching browser history,
the `Referer` header on the next request, and any proxy log in between. A POST
that goes nowhere useful is the right failure.

The search forms on `/` and `/search` are the exception, and it is a feature
and not an oversight: with JavaScript off, a native GET there lands on
`/search?q=...`, which is exactly the right page. That fallback is checked.

## The two auth realms

They are fully separate: separate tables, separate cookies, separate helpers.
Nothing lets a session in one realm satisfy a check in the other, and there is
no shared "current user".

| | Staff and admin | Applicant |
|---|---|---|
| Accounts | `gftvhello_users`, existing, shared with gftv.asia | `gftvjobs_users`, new |
| Sessions | `gftvhello_sessions` | `gftvjobs_sessions` |
| Session cookie | `gftv_staff_session` | `gftv_applicant_session` |
| Device cookie | `gftv_staff_device` | `gftv_applicant_device` |
| Second factor | A passkey, or the existing TOTP app, with backup codes | A passkey, with backup codes. Telegram joins them in phase 11 |
| Access rule | `is_approved`, then the `gftvjobs_admin_access` overlay if a row exists, otherwise `is_admin or is_editor` | none, accounts are active immediately |

The `gftvhello_*` tables are read only from this portal, apart from the session,
challenge, trusted device, and backup code rows the login flow legitimately
owns. Granting or revoking portal access writes to `gftvjobs_admin_access`
instead, never to `gftvhello_users`.

Two independent controls on both login forms, which must never be collapsed
into one checkbox:

- **Stay signed in for 30 days on this device** sets how long the session lasts.
  Off is 12 hours, on is 30 days.
- **Trust this device** sets whether the second factor is asked for again. The
  password is still required every time.

## API route map

Phases 2 to 8 are built. The rest is the shape phases 9 to 11 fill in, from
section 9 of the specification.

One route in this table is not under `api/` as far as a reader is concerned.
`vercel.json` rewrites `/jobs/:id` to `api/job-page.js`, which renders the
posting page as HTML, not JSON. It is the only server rendered page in
the portal, per section 4, and the reason is link embeds: an unfurler reads the
markup as delivered and does not run JavaScript.

| Group | Routes | Phase |
|---|---|---|
| `api/auth/staff/*` | login, verify-2fa, logout, session, trusted-devices, passkeys | 2 |
| | Listing is GET. Revoking a device and removing a passkey are POST with an `action`, not DELETE: the password travels in the body, and a body on DELETE is legal but is known to be dropped by proxies, which would fail silently. | |
| `api/auth/applicant/*` | register, login, logout, session, verify-2fa, profile, change-password, forgot-password, reset-password, recovery-codes, trusted-devices, passkeys, locale | 2 |
| `api/public/*` | search, suggest, facets | 3 |
| | Section 9 lists departments and tags as separate routes. They are one `facets` route, because the filter panel needs both plus the chip counts plus the commitment types in use before it can draw at all, and three requests to draw one panel is three chances for it to appear in pieces. | |
| | All three are GET, session free, and cacheable. `vercel.json` scopes its `no-store` rule to `/api/auth` so they can set their own `s-maxage`. | |
| `api/public/job` | one posting by uuid or by slug, in one language | 4 |
| | The slug form is section 9's "slug to uuid lookup for the redirect". It is the same route because the only difference is the shape the caller passed. `application_form_url` is not selected from the database by any of this, so it cannot reach a public payload. | |
| `api/public/jobs.json` | the openings feed, rewritten to `api/public/jobs-feed.js` | 4 |
| | The one endpoint with no `{ ok, data }` envelope. Its callers are strangers, not this site, and somebody pointing a script at a URL ending in `.json` expects the openings at the top level. Errors still use the envelope. | |
| `/jobs/:id` | the posting page, rewritten to `api/job-page.js`. HTML, not JSON | 4 |
| `api/translations/report` | report a translation problem | 4 |
| `api/translations/mine` | the reader's own reports, with what an admin decided about each. 7h's other half: a reporter who never hears anything again learns that reporting is shouting into a hole | 6 |
| `api/translations/helper` | 7i's helper area: the roster, the language audit, one thing to translate, a search, and `save`. One route, four views, one action | 8 |
| | **The guard is a row, never a boolean.** Every view except the roster takes a language and checks the `(user_id, locale)` pair against `gftvjobs_translation_helpers`, intersected with the active languages, so a role over a switched-off language is a role over nothing. The roster is the one view any applicant may call, and it answers 200 with an empty list: a 403 there would make "you are not a helper" indistinguishable from a fault on every account page. | |
| | A save writes `034`'s `updated_by` and never `is_ready`. The form URL, the prefill map, and the response sheet are columns on the same row and are absent from the allowlist, because they decide where an applicant's details are sent. The base row is never written: a helper edits their language, never the source. | |
| `api/translations/annotations` | 7i's in-place suggestions. A separate route from `report`, writing the same table | 8 |
| | What 7i asked to be single is the queue, not the endpoint. `report` is open to any applicant under `translation_report` and bounded by a bucket sized for one posting; this is open to helpers under `translation_annotations` and bounded by one sized for a review pass. One handler with two permission models and two feature keys inside it is how a hole gets opened by an edit to the wrong branch. A staff POST is refused, per deviation 52. | |
| `api/applications/start` | logs the analytics row, upserts the tracking row, returns the prefilled form URL and the analytics row id | 5 |
| | **The one route in the build that emits a Google Form URL.** A logged out request is 401 and writes nothing. The cooldown, the closing date, the global toggle, and an unanswered prompt are all enforced here and not by hiding the button. | |
| `api/applications/respond` | records the Yes or No from the modal, and starts the cooldown on a Yes | 5 |
| `api/applications/pending` | the applicant's unanswered prompts. Called on every page of the portal | 5 |
| `api/applications/mine` | the applicant's tracking rows, optionally for one posting. What the Apply button and the board's cooldown badge are drawn from | 5 |
| | Thin by default, which is what those two callers want. `?with_jobs=true` adds the posting summaries and the bucket counts for `/account/applications`, and only then does the locale mean anything. Widened instead of duplicated; opt-in so the board does not pay for it. | |
| `api/applications/withdraw` | 7e. Clears `applied_at` and `cooldown_until` together, and answers any outstanding prompt for that posting as No, because a pending prompt blocks a fresh handoff and 7e is explicit that somebody who pulls out is not locked out | 6 |
| `api/ratings/upsert` | one rating per applicant per posting, from the handoff modal | 5 |
| `api/saved/mine` | thin by default, `?with_jobs=true&filter=` for `/account/saved` | 6 |
| `api/saved/toggle` | save and unsave, as one route with an `action`, following `trusted-devices`. Saving checks the posting's visibility, because a saved row is half of 7g's archived posting rule | 6 |
| `api/tasks/mine` | the union of admin raised tasks and unanswered apply prompts. `?task_id=` is 7g's deep link | 6 |
| `api/tasks/count` | the badge on the account navigation. Its own route because every page of the account area draws it and none of them wants the tasks themselves | 6 |
| `api/tasks/respond` | reply to an info request, or mark a notice as read. One round, per 7g | 6 |
| | Phase 7 widens the reply to carry answers to the task's question set, validated on the server against the set stored on that task. An answer records an option's value, never its label, so it reads in either language | 7 |
| `api/account/avatar` | POST a raw `image/webp` body, DELETE to remove. See AVATARS.md | 6 |
| `api/account/danger/delete` | 7g's danger zone. **There is no separate verify-password route**, deliberately: an endpoint whose answer is "the password was correct" is exactly the client side signal 7g forbids relying on, so the destructive endpoint verifies it in the same request as the action | 6 |
| `api/admin/me` | who is signed in, their role, the active languages, and the two counts on the sidebar. The first request every dashboard page makes | 7 |
| `api/admin/stats` | 8.1's overview: postings by status, the pipeline buckets, and the two recent lists | 7 |
| `api/admin/jobs` | 8.2, whole: the list, one posting with its translations and tags, create, update, publish, close, archive, duplicate, and permanent deletion, which is admins only | 7 |
| `api/admin/applications` | 8.3's tracking: the list with its bucket counts, one row with its timeline and tasks, status changes single and bulk, waiving a cooldown, the note, and the CSV | 7 |
| `api/admin/tasks` | raising a task on one applicant or on fifty, with or without a question set, and resolving one. The set is written once and never updated | 7 |
| `api/admin/departments` | 8.6, and the rule that an active team needs a name in every active language | 7 |
| `api/admin/tags` | 8.7, including the merge, which moves the join rows and lets the triggers in `007` do the counting | 7 |
| `api/admin/maintenance` | read and flip the feature overrides in 8.12, so a shipped feature can be turned off while it is broken | 7 |
| `api/public/feature-status` | which shipped features are currently off, and the public note on each. Short cache. The phase list stays in `build-status.json` and is not duplicated here | 7 |
| `api/admin/analytics` | 8.4's funnel: views, apply clicks, confirmed applications, and the daily series, from the two views in `033`. **GET only**, the one admin route with no POST, because nothing on that page changes anything | 8 |
| `api/admin/invites` | 8.5, whole: the shortlist, the invite, the send, the withdrawal, and the applicant picker. An invite writes its `gftvjobs_invites` row and a task beside it, because Telegram is phase 11 and the task is the record either way | 8 |
| `api/admin/admins` | 8.8's staff access. **Admins only end to end**, including the list. Three access states, not two: granted, denied, and absent, and absent means the gftv.asia role decides | 8 |
| `api/admin/applicants` | 8.9's applicant accounts. Admins only, all of it. Deactivate, reactivate, force a reset, unlink Telegram, set a password, delete | 8 |
| `api/admin/settings` | 8.10's portal settings, through `putSetting`. The second caller of a helper written in phase 7 for 8.12 | 8 |
| `api/public/site-settings` | the public half of 8.10: the portal title, the hero copy, and the featured roles. Short cache, session free | 8 |
| `api/public/view` | one `view` analytics row per session per posting, never for a preview and never for a draft. **The one write in the build a caller with no account can make**, so the posting is re-checked server side and it has a rate limit bucket of its own | 8 |
| | A view row is `response_state: 'answered'`, not `'pending'`. `007`'s pending partial index exists to make the outstanding prompt lookup and phase 9's sweep cheap, and a row in it for every posting anybody opens would make it the largest index in the database and the one thing it must never hold. | |
| `api/admin/translations` | 8.11, in three views on one route: the suggestion queue, the needs-translation audit over `032`'s view, and 7i's helper roster. Not admins only, except granting and revoking a helper, which is | 8 |
| | **An edit is not a resolution, and they are two requests.** The note is what closes a report, because the reporter reads it on `/account/settings`; folding the two into one button would make the note the step somebody skips by finishing the edit. Required on fixed and rejected, optional on accepted, which is where `015`'s check constraint already draws the line. | |
| `api/cron/daily` | section 11's scheduled maintenance: auto-close, the fourteen day prompt sweep, expired row deletion, and the form health check. **Authenticated by `Authorization: Bearer $CRON_SECRET` and nothing else**, because the caller is a scheduler and there is no session to check. **HEAD is deliberately refused**, unlike every read route here: everything this one does is a write | 9 |
| | Answers 200 even when a task failed, and says which in the body. The caller is a scheduler whose only reaction to a 500 is a log line nobody reads; the run record in `gftvjobs_cron_runs` is where a failure surfaces, and `/api/admin/stats` carries the most recent one to the overview. | |
| `api/webhooks/form-submit` | section 13's Apps Script integration. `x-portal-secret` against `FORM_WEBHOOK_SECRET`, timing safe, compared **before the body is read** so an unauthenticated caller costs one string comparison and no query | 9 |
| | **Always 200 for anything that is not an authentication or validation failure**, per step 7, which is the opposite of every other route here and will look like a bug. It is not: a 5xx makes Apps Script retry against a portal already having a bad day, and the delivery is idempotent anyway. The recovery for a failed confirmation is the ordering — the submission row is written first and the match attached last, so a failure leaves the row in the unmatched list where an admin can see it. | |
| `api/admin/submissions` | the unmatched list from section 13 step 6, and the manual link from its fallbacks. **Admins only**, unlike the analytics page it is drawn on: every row is a real person's email address, and that page is open to job posters precisely because nothing else on it names an applicant | 9 |
| `api/telegram/*` | linking token, link status, unlink, toggle 2FA, login code, magic link | 11 |
| `api/invites/*` | list mine, mark seen, decline | 11 |

Shared helpers live in `api/_lib/`:

| File | What it holds |
|---|---|
| `env.js` | Variable access. Throws naming the variable when one is missing. |
| `supabase.js` | The one service role client, created at import time, plus the table and RPC name maps. |
| `respond.js` | The single JSON success and error shape, the status codes, and the body reader with its size cap. |
| `cookies.js` | Cookie names, parsing, and serialising. |
| `tokens.js` | Random tokens, recovery code formatting, SHA-256, constant time comparison. |
| `session.js` | Sessions in either realm, creating and ending them, trusted devices, the session length rules, and the admin access check. Also `HELLO`, the one place the assumed `gftvhello_*` column names live. |
| `redirects.js` | The `?redirect=` allowlist, so the parameter cannot become an open redirect. |
| `accounts.js` | Account lookup by username or email, uniqueness checks, and the two code sets. |
| `password.js` | bcrypt for passwords and codes, the password rule, and the constant time comparisons that keep an unknown account from answering faster than a wrong password. |
| `totp.js` | RFC 6238, for the staff realm's existing authenticator app. |
| `webauthn.js` | Passkeys, both realms, both ceremonies. |
| `rate-limit.js` | The table backed limiter and every limit in one place. |
| `validate.js` | Input validation, returning codes instead of English so the client renders them in either language. |
| `jobs.js` | The board's query string parameter names, parsed defensively, and the public shape of a posting. Also the `ts_headline` sanitiser: that string is the one field the browser assigns as markup, and everything except `<mark>` is escaped here and not in the client. |
| `settings.js` | Reading `gftvjobs_settings`, cached for a minute. A settings read never fails a request and never falls back to the permissive value: if the reapply cooldown cannot be read the answer is 90 days, not zero. |
| `job-detail.js` | One posting, read and resolved into a language, and the visibility rules from 7g. The public column list lives here as an allowlist, so `application_form_url` is never selected at all. Also the embed line: the admin's own `og_description`, or the first sentence of the description, with sentence detection that knows Han script ends a sentence with `。` and English does not. |
| `page-shell.js` | The HTML document a serverless function sends. The only copy of the `<head>` in this repo that is not an HTML file, so **when `index.html`'s head changes, change this too.** |
| `dashboard.js` | The account area's shared reads: posting summaries for a set of ids in one language, and the three buckets My applications filters by. Deliberately never filters on the posting's status, per 7g. |
| `tasks.js` | The tasks read model, and the one place that adds up the badge count across both sources. |
| `avatars.js` | The Storage half of avatars: the bucket, the magic byte check, turning a public URL back into an object path, and the upload order AVATARS.md fixes. |
| `admin.js` | The dashboard's shared server side: the two roles from 10 item 2, the admins only guard, the query string helpers, slugs, and the active language list read from `gftvjobs_locales` instead of hardcoded. |
| `admin-jobs.js` | The admin's posting read and write model. Its own column list, wider than the public one on purpose: `job-detail.js` exists so a public payload cannot be widened by an edit to shaping code, and an admin summary must not be built by relaxing it. |
| `admin-applications.js` | The pipeline: the nine statuses, the bucket counts, a status change with its event row, waiving a cooldown, and the CSV. Nothing here writes `applied_at` or `cooldown_until`, per 7f. |
| `admin-tasks.js` | Raising and resolving tasks, and the auto-raise a posting's question set triggers when somebody applies. Every path writes `questions` exactly once. |
| `questions.js` | The question sets in 7g, both directions: what the composer may store, and what a reply may contain. A reply is validated against the set stored on that task and never against what the browser sent back. |
| `maintenance.js` | 8.12's switches: the overrides, the denylist that is in code, not in a setting, and `unavailable()`, the shared guard every flippable route calls so that off means off including the API. |
| `apply.js` | The apply flow's server side, shared by the four `api/applications/*` routes. Reads the form URL and the prefill map, which `job-detail.js` deliberately never selects; resolves a per language form; builds the prefilled address from the session; and holds the rules about what a start click may and may not move. |
| `analytics.js` | 8.4's shaping, and the three judgements the views in `033` deliberately do not make: a rating suppressed below three ratings, the broken-form flag at five clicks with a fifth converting, and a **null** rate for a posting nobody has clicked, which is not the same as zero. |
| `invites.js` | 8.5. A shortlist and an invite are one row in `gftvjobs_invites` in two states, so promoting one is that row changing status. Withdrawing keeps the row and the task; removing a shortlist entry deletes it, because nobody was ever told. |
| `admin-staff.js` | 8.8. The list is a union rather than a query: the approved-and-roled set, plus everybody an overlay row names, minus the denied. A denied account stays on the page, because "we took it away in March" is part of the answer to who has access. Last sign in comes from the audit log, not from `gftvhello_sessions`, which deletes a row on sign out. |
| `admin-applicants.js` | 8.9, including `accountActivity`, which reads the audit log both ways: what the applicant did, and what was done to them. |
| `translation-queue.js` | 8.11's queue. The field an edit writes is the report's own, never the request's: this page fixes what somebody complained about, and taking the field from the body would make it a general single field writer that happens to need a report id. |
| `translation-audit.js` | The needs-translation audit over `gftvjobs_needs_translation`. Its own file rather than more of the queue: the helper area needs the same list scoped to one granted language. The audit is per language, chosen rather than filtered, and the route says in its payload which language it answered with. |
| `translation-helpers.js` | 7i's roster: granting, revoking, and what each helper has drafted and reported. A revoke deletes the row, because `023` has no revoked state, which is why a reason is required in both directions. |
| `helper-area.js` | The helper's own side of 7i, behind the `(user_id, locale)` guard. |
| `annotations.js` | 7i's in-place layer. A quote is captured from rendered text and matched against stored text, so a span crossing a bold run or a link arrives in the queue as `detached`, which is what 7i asks for. **Loosening the match until it finds something is how a suggestion gets applied to the wrong sentence.** |
| `cron.js` | Section 11's four tasks and the run record. The record is opened **before** any work, so a run killed mid-pass leaves a row with a `started_at` and no `finished_at`, which is visibly different from a healthy run and from no run at all. Every audit row is written from the rows an update actually returned, never from the set attempted, which is the whole of what makes a second run write none. |
| `form-check.js` | The health check, and the one rule the file is shaped around: **a page that loads and matches no marker leaves the stored state alone rather than claiming `ok`.** Everything here is pattern matching against wording Google owns, so the failure to design for is not "the check breaks" but "the check quietly starts lying". |
| `form-submissions.js` | Section 13's matching and confirmation. **The only place in this build where an answer a person gave is changed by something else**, and it records itself as that: `answer_source` becomes `webhook` and the event row's source is `webhook`. It never moves a cooldown that is already running, because `confirmApplication` writes both dates unconditionally and step 5 says to set them only if they are not already set. |

Every endpoint returning human readable content takes a locale, `en` or `zh`,
and returns that language in the ordinary field names. A caller sending no
locale gets English.

**Rate limiting is table backed**, in `gftvjobs_rate_limits`. Section 9 allows
either that or in-memory. Table backed was chosen because each Vercel function
instance has its own memory, so an in-memory limiter resets constantly and
cannot hold the one hour lockouts that sections 5c and 7g require.

## The apply flow

Applications are collected in Google Forms, per section 10. The portal gates
access, hands the applicant over, logs the handoff, and records whether they say
they went through with it. It stores no answers and no files.

**What happens on a click**, in this order, which is 7a's and is not arbitrary:

1. `api/applications/start` verifies the session, the posting, the closing date,
   the global `applications_open` toggle, the reapply cooldown, and whether an
   unanswered prompt is already open for this posting.
2. It inserts the `gftvjobs_analytics` row at `did_apply` false and
   `response_state` pending. That row exists before the applicant can possibly
   answer, which is why it is written first.
3. It upserts the `gftvjobs_applications` tracking row and writes an event.
4. It returns the prefilled form URL and the analytics row id.

Meanwhile, in the browser: the modal opens in the same tick as the click, and
only then, after a paint and at least 800ms, does the form open in a new tab. A
blocked `window.open` is detected, not fought, and the modal offers a
real anchor instead, which is a fresh gesture and always works.

**Three things that look like bugs and are not:**

- **No answer means no.** `did_apply` starts false and stays false until
  something positively confirms otherwise. A dismissed modal leaves the row
  pending, no cooldown starts, and the Apply button stays available. The only
  difference between silence and an explicit No is `response_state` and
  `answer_source`, which exist so the phase 8 funnel can tell them apart.
- **A tracking row never moves backwards.** A second start click on a row an
  admin has moved to `shortlisted` leaves the status alone. Only `started` and
  `withdrawn` are resettable, the second because 7e says somebody who pulls out
  is not locked out of a role they change their mind about.

  **Phase 7 adds `rejected` to that list**, per 7f: once the cooldown has run
  out a rejection is not a ban, and the row starts fresh. `accepted` never joins
  it and becomes a permanent refusal instead, because they have the role. Also
  in phase 7: a status change must never write `applied_at` or `cooldown_until`,
  so a rejection does not act as a waive.
- **The start call is not prefetched on hover**, though 7c step 2 suggests it.
  That step reads as though prefetching the form URL were free, and it is not:
  `start` is the endpoint that writes the analytics row, so calling it on
  `mouseenter` would log an apply click for a hover and put a prompt in front of
  somebody who never clicked. The 800ms gate before the tab opens is longer than
  the call takes anyway.

**The prompt is state, not a page.** There is no `/survey/` route and no route
of its own. `assets/js/apply-prompt.js` is imported by `shell.js`, so every page
of the portal asks `api/applications/pending` once per load for a signed in
applicant and opens the modal if anything comes back. `localStorage` holds the
same row id as a fast path and is treated as a cache that can be wrong: if the
server says nothing is pending, it is cleared and nothing is shown. The only
linkable form is `/jobs/{uuid}?prompt={analytics_row_id}`, and the parameter is
stripped with `history.replaceState` once the modal is open.

**`/apply` still 404s and is deliberately left alone.** `build-status.js` maps
the path to the `apply` feature, but no route in the design serves it: 7c's
apply flow is a modal on whichever page the reader is standing on, not a page of
its own. It is not an unbuilt route waiting on a phase, so section 0c's
placeholder handling does not apply to it either.

## The reapply cooldown

Section 7f fixes it at three months. Migration `029` makes it the
`reapply_cooldown_days` setting instead, defaulting to 90, editable from the
admin settings page in phase 8, and enforced by `api/_lib/settings.js`.

Days over months, because zero has to be expressible and so does a
fortnight. The cost, stated plainly: 90 days is not exactly three months, so an
application on 4 March reopens on 2 June instead of 4 June. The interface never
shows the number, only the date it produced, so nobody sees the unit.

**Zero switches the cooldown off**, and what that means precisely matters:

- No `cooldown_until` is written when a new application is confirmed. The column
  stays null. Never `now()`: a cooldown in the past would have the posting card
  offer to tell somebody the date they may reapply, which would be today.
- Existing `cooldown_until` values are **ignored, not cleared**. `isInCooldown()`
  answers false while the setting is zero, so turning it off takes effect at
  once, and setting it back to 90 restores every cooldown that was running
  and has not silently destroyed them.

`api/applications/start.js` asks `isInCooldown()` instead of comparing
`cooldown_until` to the clock itself, since that comparison alone misses the
disabled case, and `api/applications/mine.js` resolves the same answer for the
client so the browser never has to know the setting exists.

Raising the setting does not extend a cooldown somebody is already serving.
`cooldown_until` stays stored and not computed on read, exactly as migration
`006` says, so a policy change applies to the next application and not
retroactively. Admins can still waive a single row, per 7f.

The database constrains the value to a whole number from 0 to 3650. Ten years is
the ceiling because without one a typo is indistinguishable from a permanent ban
nobody meant to impose.

## The account area

Seven pages behind one session check: `/account`, `/account/applications`,
`/account/saved`, `/account/tasks`, `/account/settings`, the
`/account/security` page phase 2 built, and `/account/translations`, which
phase 8 added for 7i. `assets/js/account-shell.js` is the guard, the
sub-navigation, and the badge; each page owns its own content.

**The seventh is conditional, and the navigation item is absent rather than
disabled** for everybody who is not a translation helper, per deviation 34.
`account-shell.js` caches one roster call so the shell and the page share a
request. That is one extra request on every account page for a feature almost no
account has, taken deliberately: the staff hint in `api.js` is the pattern that
would avoid it, and it exists to keep *public* pages from asking about a session
for readers who have none. Here there is already a session, and a stale hint
would hide the area from somebody granted the role five minutes ago.

**Signed out is a redirect, not a message.** Every page here sends a signed out
reader to `/login?redirect=...` and back. `api/_lib/redirects.js` validates the
parameter on the way in, so nothing on the client has to be trusted.

**The badge counts two sources and `api/tasks/count` is the only thing that adds
them up.** Open rows in `gftvjobs_tasks`, plus unanswered apply prompts derived
live from `gftvjobs_analytics`. Both 7g and migration `008` are explicit that a
prompt is never copied into the tasks table: the analytics row is the single
source of truth for whether an answer is owed, and duplicating it guarantees the
two drift apart. Nothing in this build inserts a prompt into `gftvjobs_tasks`.

**Every list keeps working for postings that are closed, expired, or archived**,
per 7g, so an applicant can always reread what they applied for. None of these
queries filters on the posting's status. What scopes them is the applicant's own
rows, and a saved row or an application row is also what makes an archived
posting resolve at its uuid, per the visibility rule in `api/_lib/job-detail.js`.

**A dashboard row is not a job card**, and `assets/js/account-row.js` says why at
length. A card advertises a role and is built from a public search result; a row
is a posting the reader already has a relationship with, so it carries state and
actions, not a summary and tag pills. Do not merge the two.

Two decisions in here that look like omissions:

- **Withdrawing answers any outstanding prompt for that posting, as No.** 7e does
  not ask for it, but 7c makes it necessary: an unanswered prompt blocks a fresh
  handoff, so clearing the cooldown without clearing the prompt would leave
  somebody exactly as locked out as before. `did_apply` is not touched, so a
  confirmed Yes can never be turned back into a No.
- **There is no `api/account/danger/verify` route.** Section 9 lists
  `api/account/danger/*` as "verify password, then each destructive action", and
  building the first half would produce the client side "password was correct"
  signal 7g forbids relying on. The destructive endpoint verifies the password
  itself, in the same request as the action.

## The dashboard

Section 8, built in phases 7 and 8. Thirteen pages under `/admin`, sharing a
sidebar and a session guard from `assets/js/admin-shell.js`. Phase 7 built
seven; phase 8 added analytics, invites, staff access, applicant accounts,
settings, and the translation queue.

It sits under the public header instead of carrying its own, exactly as
`/admin/login` and `/admin/security` have since phase 2. A second header would
mean two brands, two theme buttons, and two language switchers on one page. What
the dashboard's own top bar carries is the one thing the public header cannot
say: which staff account is signed in, and how to sign *that* one out. **The two
realms are never merged**, so somebody signed into both sees two identities and
two sign out controls, which is the honest rendering of being signed into two
things.

**Two roles, not a permission system.** Section 10 item 2 names exactly two:

| | Admin | Job poster |
|---|---|---|
| Postings, tracking, teams, tags, maintenance | yes | yes |
| Analytics, invites and shortlists, settings | yes | yes |
| The translation queue and its language audit | yes | yes |
| Permanently deleting a posting | yes | the control is **absent**, not disabled |
| Permanently deleting a tracking row, in bulk | yes | the control is **absent** |
| Granting or revoking a translation helper | yes | the tab is **removed from the document** |
| Staff access and applicant accounts | yes | not listed in the sidebar |

Absent, not disabled, is deliberate: section 0c's disabled state means
"this is coming in a later phase", and using it for "you are not allowed" would
make a permission look like a build status. Every route re-checks `is_admin` on
the request regardless, per section 8, so a hidden control is a courtesy and
never the enforcement.

Three things the postings list shows that are easy to leave off, and each is in
8.2 by name: which languages are done, which postings never close, and which
roles carry a question set.

**The applicant's apply prompt does not open here.** `shell.js` draws the same
public header on the dashboard, and it checks for an outstanding "have you
applied?" prompt on every page. Being signed into both realms on one browser is
supported and expected, so a staff member who had also applied for something got
that modal opening over the dashboard: a modal about their own application, on a
page about everybody else's, taking pointer events across the whole screen. It
appeared in any tab that had not already shown it, which is every new tab, since
the once-a-visit guard is in `sessionStorage`. `boot()` now skips the check under
`/admin`; nothing is dismissed or marked shown, and the prompt opens on the next
public or account page exactly as it did.

### Tables at narrow widths

Section 3's rule is that a wide table scrolls inside its own box and the page
body does not. Three things make that true, and the first is the one that was
wrong for two phases.

- **The scroll containers are positioned.** `.visually-hidden` is
  `position: absolute` with no offsets, so with no positioned ancestor its
  containing block is the initial one. The accessible name on the actions column
  therefore sat at x≈745 *in the document*, escaping the table's own scroller: at
  a 360px viewport the page really did scroll sideways, by 386px on
  `/admin/jobs`. `.admin-list` and `.table-scroll` are `position: relative`, so
  it is placed inside the scroller and clipped with everything else.
- **Every cell has a floor**, `--cell-min`, so a column cannot be squeezed to the
  width where a heading breaks after its first letter. Tick box columns are
  exempt. Where that makes a table wider than the viewport, the container
  scrolls, which is where the width is supposed to go.
- **Button labels do not wrap.** A control keeps its box and stacks its words one
  to a line, which is the same problem one level down. Full width buttons and
  form buttons opt out, and icon-only buttons have no text to protect.

`node tests/layout-check.mjs` measures all three at 360, 480 and 768px.

## Question sets on tasks

7g, added to the specification on 21 August 2026 and built in phase 7. Migration
`031` is the schema half and `api/_lib/questions.js` is the other.

A job poster can attach up to twenty questions to an info request, or to a
posting so everybody who applies from then on is asked. Four types: short answer,
long answer, choice, and checkbox. Four rules run through all of it:

- **The set is frozen once sent.** Editing it would orphan answers already given,
  so `questions` is written when a task is raised and never updated. A posting's
  template is *copied* onto each task instead of referenced, which is what makes
  editing the template safe: it changes only what the next applicant is asked.
- **Answers are validated against the set stored on that task**, never against
  what the browser sends back. `checkAnswers` takes the stored set as its second
  argument for exactly that reason, and there is no version of it that takes the
  questions from a request body.
- **An answer stores an option value, never a label.** The label is per language
  and the value is not, so an answer given in 华文 stays readable in English and
  matchable against the question's own options.
- **There is no file upload**, on a question or anywhere near one. Section 10
  item 1 gave up one exception and it is the avatar.

A posting's set auto-raises its task where 7a already writes the tracking row, in
`api/applications/start.js`. It is deliberately never bolted onto the handoff
modal: 7c calls that modal a light tap on the shoulder and not an ambush, and
a required form hanging off it would make dismissing it cost something.

## Maintenance switches

0c and 8.12, built in phase 7 instead of with the rest of the settings in 8.10,
because a lever for turning a broken feature off is worth having before the
phases that add the most surface.

- **It never edits `build-status.json`.** That file records what has been built;
  an override records what is working right now. Conflating them would have a
  deploy silently undo an outage response. The override is a `feature_overrides`
  row in `gftvjobs_settings`.
- **Off means off, including the API.** `unavailable()` in
  `api/_lib/maintenance.js` is the shared guard each flippable route calls, and
  it answers 503. A disabled button stops nobody with the endpoint, a stale tab,
  or a phase 10 queued action.
- **Its own sentence, never the phase one.** Telling somebody a feature they used
  last week "will be available in Phase 6" is a lie about a shipped feature and
  makes an outage indistinguishable from an unbuilt one.
- **The denylist is in code**, not a setting: sign in and registration in both
  realms, and anything the maintenance page itself needs.
- **It is not `applications_open`**, and the two are never merged. That one is a
  policy choice; this says something is broken. Which of the two it is is the one
  thing somebody turned away actually wants to know.

The browser reads `/api/public/feature-status` alongside `build-status.json`.
A failure to read it leaves the site working with everything on, which is the
direction to fail in.

**`shell.js` has to load it, and for a while did not.** `isFeatureOff` answers
from a module level cache that only `loadFeatureOverrides()` fills, and until
21 August 2026 the only callers were `admin-shell.js` and `status-page.js`. So
every public page gated its `[data-feature]` controls on "has the phase shipped"
alone: a feature an admin had switched off was still fully enabled everywhere
outside the dashboard and `/status`, and the API answered 503 when the control
was used. A control that works and then fails is the worst of the three
possible behaviours. `boot()` now awaits it before the first gating pass.

**Two of the switches are the header's own controls.** `language_switcher` and
`theme_switcher` sit at phase 1 in the feature map, so an admin can turn the
globe or the palette off the same way as anything else. Off disables the button
with the maintenance sentence without removing it; whatever language and
theme the reader already had stay applied, since both are read from
`localStorage` before first paint. What is switched off is the ability to
change them.

Anything that needs a floor under it here is the deployment: a flip reaches a
public page in about ninety seconds, which is `settings.js`'s minute plus the
`s-maxage=30` and `stale-while-revalidate=60` on the endpoint. A check written
sooner than that is checking the cache.

## The board's query string

`/search` is one surface, not two. With no parameters it is the full listing,
newest first; with any parameter it is the results page. Every piece of state
lives in the query string and nowhere else, so a shared link always reproduces
what the sender was looking at. `assets/js/search-page.js` reads the URL and
`api/_lib/jobs.js` parses the same names on the server.

| Parameter | Value | Notes |
|---|---|---|
| `q` | free text | Capped at 120 characters. |
| `dept` | slugs | Comma separated, or repeat the parameter. Both forms work. |
| `tags` | slugs | Same. OR matching by default. |
| `match` | `all` | AND matching across the selected tags. Ignored below two tags. |
| `commitment` | keys | One or more of the five keys from migration `021`. Underscores, not slugs. |
| `location` | free text | Case insensitive substring. |
| `remote` | `true`, `false` | Absent means do not filter on it at all, which is not the same as `false`. |
| `posted_within_days` | integer | Behind the "posted today" and "posted this week" chips. |
| `closing_within_days` | integer | "Closing soon". Never matches a posting with no deadline. |
| `no_deadline` | `true` | Only postings with a null `closes_at`. |
| `sort` | `relevance`, `newest`, `closing` | Relevance is the default whenever `q` is present, newest when it is not. |
| `page` | integer | 20 per page. |

Two of these have been live since phase 1: the footer links to
`?closing_within_days=14` and `?no_deadline=true`, so those two names cannot be
changed without breaking links that already exist.

`statuses` is deliberately not readable from the query string. The search
function defaults to published on its own, and never mentioning the parameter is
what stops a caller asking this endpoint for drafts.

State is written back with `history.replaceState`, per section 4. One
consequence worth knowing up front, not discovering: `replaceState` creates no
history entry, so pressing back after applying four filters leaves the board
and does not undo one filter. That is the specified behaviour.

**Search works differently per language, and has to.** English keeps the
weighted `tsvector`, ranked with `ts_rank_cd` and highlighted with
`ts_headline`. Chinese is matched by substring against the translation row's
generated `search_text`, because Postgres cannot segment Han script and a
`tsvector` would hold one token per run of characters. Both find what is there;
only English orders it by relevance. The FAQ says so in both languages instead
of leaving a reader to conclude Chinese search is broken.

## Passkeys

Passkeys are the second factor in **both** realms, added in phase 2. They are
what gives the applicant realm a second factor at all: the Telegram code from
section 15 does not arrive until phase 11.

Not passwordless. The password is always required first, and the passkey is the
second step. The credentials are registered with `residentKey: "preferred"`, so
a passwordless sign in could be added later without anybody re-enrolling.

| Piece | Where it lives |
|---|---|
| Applicant credentials | `gftvjobs_passkeys` |
| Staff credentials | `gftvjobs_staff_passkeys`, referencing `gftvhello_users` |
| Challenges | `gftvjobs_passkey_challenges`, single use, deleted as they are read |
| Waiting sign ins | `gftvjobs_login_challenges` for applicants, `gftvhello_totp_challenges` for staff |
| Server | `api/_lib/webauthn.js`, wrapping `@simplewebauthn/server` |
| Browser | `assets/js/passkeys.js`, hand written, no bundler |

**Staff passkeys are in a `gftvjobs_` table on purpose.** Section 2 forbids
adding to the `gftvhello_` namespace, so this follows `gftvjobs_admin_access`:
`gftvhello_users` is referenced and never written to.

Three consequences worth knowing before somebody reports them as bugs:

- **A passkey registered here does not work at gftv.asia.** A passkey belongs to
  the domain that created it, and the relying party id is derived from
  `SITE_URL`. The accounts are shared between the two sites; the passkeys are
  not.
- **A passkey registered on a preview deployment does not work in production**,
  because the host differs. That is the same rule doing its job.
- **A lost passkey is not a lost account.** The two factor backup codes get past
  the second step, which is why passkeys needed no new recovery mechanism and
  no third set of codes. The security page says so when somebody adds a passkey
  without having any codes.
- **A recovery code alone does not reset the password on an account with a
  passkey.** Section 5c made one recovery code a full account credential when
  there was no second factor to protect. Now there is, so the forgot password
  flow asks for the passkey or a 2FA backup code as well, enforced by
  `gftvjobs_password_resets.second_factor_at` and not by the screen order.
  An account with no passkey is unaffected. Somebody who has lost both goes to
  the admin reset path 5c item 5 requires, which is phase 8.

The server verification is `@simplewebauthn/server`, the only dependency in
this repo besides the Supabase client and bcrypt. Verifying an assertion means
parsing CBOR, decoding COSE keys, and checking signatures across three
algorithm families, which is not something to hand roll in an auth path. The
browser half is hand written, because it is base64url conversion around
`navigator.credentials` and adding a build step for it would cost more than it
saves.

## The mode switcher, and the time based option

The two axes are unchanged: `data-color-theme` and `data-mode` on `<html>`,
exactly as `gftv-theme.md` describes. **`data-mode` is still only ever `light`
or `dark`**, so no stylesheet knows the third option exists.

What is new is a third *preference*. It started as an experiment for this app
and is now part of `gftv-theme.md`, so the other GFTV apps can take it; the
shared file marks which pieces an app may leave out if it wants the two button
toggle instead.

| Stored in `gftv-careers.mode` | `data-mode` becomes |
|---|---|
| `light` | `light` |
| `dark` | `dark` |
| `time` | `light` from 09:00 up to 18:00 on the device clock, `dark` otherwise |

The split that makes this work is preference versus mode. `getModePreference()`
returns what the person chose and decides which button is pressed;
`getStoredMode()` resolves it and is what the meta `theme-color`, the "currently
light mode" label, and `withLightMode` use.

Three things worth knowing before changing it:

- **The hours are duplicated in the pre-paint script in every `<head>`.** They
  have to be: `theme.js` runs after first paint, so resolving there would show
  an evening reader a white page that turns dark a moment later. Change
  `LIGHT_FROM_HOUR` and `LIGHT_UNTIL_HOUR` in `theme.js` and the two numbers in
  every head together.
- **A tab left open across a boundary re-resolves itself.** `theme.js` schedules
  one timer to the next 09:00 or 18:00 instead of polling, and re-checks on
  `visibilitychange` because a sleeping laptop fires its timer late. The theme
  modal listens for `gftv:modechange` and redraws.
- **The device clock is the only input.** No timezone is asked for, sent, or
  stored, and there is no sunrise or sunset lookup, which would need a location.

A re-sync of `theme.js` from the canonical version now carries this, since the
canonical version has it.

## The danger zone confirmation

`assets/js/danger-confirm.js` implements the three steps section 7g fixes, in
order, with no way to skip ahead:

1. **Consequences**, with a cancel at least as prominent as the continue.
2. **Typed confirmation** of the person's own username. Not a checkbox, not
   "type DELETE". Compared case sensitively, whitespace trimmed only.
3. **Password**, handed to the caller and verified server side. Reaching step 3
   proves nothing: 7g is explicit that a client side "password was correct"
   signal is never accepted.

Built in phase 2 for removing a passkey, which turns part of the second factor
off and is the same kind of action 7g already lists. Phase 6 used it for the
danger zone proper in place of writing a second one, and added one option to it:

**`skipPassword` drops step 3 and resolves with a null password.** It is for an
action serious enough to need reading and typing but not a credentialled one,
which in this build means withdrawing an application: 7e makes that reversible
by applying again, so there is nothing for a password to protect, and asking for
one anyway teaches people to type their password into any panel that asks.
Nothing in the danger zone proper may pass it, and the endpoints behind those
actions verify the password server side regardless of what this component did.

## Language

The portal is English and Chinese. Only one is shown at a time, and both are
complete: every posting, every interface string, and the admin dashboard exist
in both.

**The Chinese uses each reader's own system font.** No CJK face is named in
`theme.css`: Han characters fall past the Latin families to the platform
default, which is PingFang SC on Apple, Microsoft YaHei on Windows, and Noto
Sans CJK SC on Android and Linux. What makes that correct is the `lang`
attribute, not the stack. Han characters are shared with Japanese, and
a browser with no language to go on may pick a Japanese face that draws a
number of them differently, so every page sets `lang="zh-Hans-SG"` in the
pre-paint script. If that ever stops being set, the Chinese renders with the
wrong glyph forms and nothing else will look broken.

**Adding a language** is a row in `gftvjobs_locales`, a dictionary file in
`assets/i18n/`, and the content itself. No migration, no schema change.

**The Chinese is Singapore Mandarin, 华文, not Mainland Putonghua.** GFTV is a
Singapore organisation, so use 义工 not 志愿者, 华文 not 中文, 电邮 not
电子邮件, 营运 not 运营, 摄影棚 not 录影棚, and 文件 not 文档. The document is
tagged `zh-Hans-SG`. Check any new copy against that list.

| Piece | Where it lives |
|---|---|
| The switcher | Globe button in the header, beside the theme button. Its own control, not a section in the theme modal. |
| The preference | `localStorage`, key `gftv-careers.locale`, alongside the two theme keys. |
| Interface strings | `assets/i18n/en.json` and `zh.json`, flat dotted keys. |
| The module | `assets/js/i18n.js`, mirroring `theme.js` deliberately. |
| Content | Translation tables keyed by locale. Migration `014`. |

Adding or changing a string:

1. Add the key to **both** `en.json` and `zh.json`. English is the fallback
   layer, so a key missing from `zh.json` renders English instead of a blank
   element, but a key missing from `en.json` renders as the raw key.
2. Reference it with `data-i18n="key"` for text, `data-i18n-attr="title:key"`
   for attributes, or `data-i18n-html="key"` for a string containing a link.
   `data-i18n-html` is safe only because every string it renders comes from
   these files. Never point it at anything a user can write.
3. Leave the English text in the markup as the element's own content. It is the
   no-JavaScript fallback and it is what shows before the dictionary resolves.
4. `{placeholders}` must match between the two files.
5. Run `npm run check-i18n` before shipping.

**A missing key renders as its own name on screen**, in both languages, and
nothing used to say so. `t()` falls back to the key deliberately, so a missing
string degrades to something searchable and not to a blank element, but
that kindness is also why `footer.buildStatus` sat in the footer from phase 1
reading "footer.buildStatus". Two things catch it now:

- **`node check-i18n.js`** at the repo root reads every `data-i18n` attribute,
  every literal `t('...')`, and the `key:` entries in the NAV and FOOTER
  tables, and exits non-zero on anything not in `en.json`. It also lists keys
  built at runtime, which it cannot check, and keys nothing references, which
  is information, not an error.
- **`t()` warns to the console** once per key when a key is missing and the
  English dictionary has already loaded.

Neither catches the other failure: a string written by JavaScript instead of
carried on a `data-i18n` attribute, rendered before the dictionary loads. That
is what put `theme.timeBasedNote` on screen. Anything that calls `t()` outside
`translateDom` has to re-run on `gftv:localechange`, and both modals now do.

**Names.** GFTV is 国际兽视 in Mandarin, and the portal is 国际兽视 Careers.
A space goes between Latin and Han characters and never between Han and Han,
so it is `关于国际兽视 Careers`, not `关于 国际兽视 Careers`.

Tag and department slugs are deliberately not translated: they are URL
identifiers, and translating them would break every shared link the moment
someone switched language.

**The language is not in the URL.** That was a deliberate choice and it has
three consequences: a shared link opens in the recipient's stored language,
search engines only ever see the English version so `sitemap.xml` and the
JSON-LD describe English only, and link embeds in Discord and Telegram are
always English because a crawler has no `localStorage` to read.

**Chinese search works differently from English.** Postgres cannot segment Han
script, so English uses the weighted `tsvector` and every other language uses `pg_trgm` substring matching against the generated `search_text` column on its translation row. English ranks
by relevance and highlights matches; Mandarin finds everything containing what
was typed and orders by title closeness, with no highlighted snippet. Both
work, only English ranks well. The full reasoning is in `migrations/README.md`.

## The build status mechanism

`assets/build-status.json` is the single source of truth for which phases have
shipped. Everything reads it: the notice bar, the disabled controls, the
placeholder pages, `/status`, and later the Telegram bot and the docs site.

Flipping a phase to `shipped` in that file is the only edit needed when it goes
live. **No copy anywhere hardcodes a phase number.**

To mark a control as belonging to an unshipped feature:

```html
<button data-feature="saved_jobs">Save this role</button>
```

`build-status.js` looks the key up in the feature map, disables the control,
and puts the reason on it: "Will be available in Phase 6. Sorry for the
inconvenience caused." The control stays visible, because hiding it teaches
people the feature does not exist.

**Phase 7 adds a second reason a control can be disabled**, per 0c and 8.12: an
admin can flip a *shipped* feature off while it is broken or being worked on.
Three things about that, written here because the obvious implementation of each
is wrong:

- **It never edits this file.** `build-status.json` records what has been built.
  An override records what is working right now, and it lives in
  `gftvjobs_settings` so an admin can set it from a dashboard and a deploy
  cannot silently undo it.
- **It gets its own sentence.** Reusing the phase wording would tell somebody a
  feature they used last week was never built.
- **The API refuses too.** A disabled button stops nobody holding the endpoint.

## Fonts

Proxima Nova is the GFTV branding font. It is licensed and is not on Google
Fonts, so it is self hosted instead of pulled from a CDN. That is also what
the offline requirement needs: a font from a third party host cannot be
precached and would leave an installed copy of the site unstyled.

Licensed `.woff2` files go in `assets/fonts/` under these names:

```
ProximaNova-Regular.woff2    400   supplied
ProximaNova-Medium.woff2     500   not supplied yet
ProximaNova-Semibold.woff2   600   not supplied yet
ProximaNova-Bold.woff2       700   not supplied yet
```

Only the regular weight is present, so it is the only `@font-face` declared in
`assets/css/theme.css`. The heavier weights used by headings, buttons, and the
brand are synthesised by the browser from it in the meantime, which looks close
enough and is much better than declaring a face that 404s. The blocks for the
other three are in that file, commented out. Drop the files in, uncomment the
matching block, and nothing else needs to change.

## Vercel project settings

| Setting | Value |
|---|---|
| Root directory | `main-site` |
| Framework preset | Other |
| Build command | none |
| Output directory | none, the root is served as static files |
| Install command | `npm install` |
| Node version | 20 or later |
| Region | `sin1`, set in `vercel.json` |
| Domain | `careers.globalfurry.tv` |

The docs site is a **second Vercel project on the same repo**, with its root
directory set to `docs-site` and the domain `docs.careers.globalfurry.tv`. It
ships in phase 13.

`vercel.json` holds the rewrites that send every unbuilt route to
`placeholder.html`, the 301 from `/jobs` to `/search`, and the headers. Two of
those headers matter more than the rest: `sw.js` is served `Cache-Control:
no-cache`, or a stale service worker pins an old build indefinitely, and
`build-status.json` gets a short `s-maxage` so a phase flipping to shipped
reaches people quickly.

**Nothing in that file can carry a comment**, and this is where the ones it
would otherwise hold live instead. Vercel validates `vercel.json` against a
schema that rejects any property it does not know, inside a `redirects` or
`rewrites` entry as well as at the root, so a `$comment` key beside a `source`
fails the build and is not ignored. Two entries are worth explaining:

- **`/admin/docs` is a 302, not a 301.** Section 8a keeps the route as a
  redirect to the docs site so an old bookmark and any link written into the
  dashboard before the move keep working. The destination is not built until
  phase 13, and a permanent redirect would be cached by every browser that
  followed it before it existed, which is a mistake nobody could take back.
- **`/admin/:path*` sends everything to the placeholder, and every real page
  under `/admin` wins anyway**, because Vercel matches the filesystem before it
  consults rewrites. That rule is what keeps section 0c's promise that a staff
  member clicking an unbuilt section gets the phase sentence instead of an
  empty screen. It is also the rule phase 3 learned the hard way, so **check it
  on a deployment and not locally**: a route returning 200 is not evidence
  its rewrite works.

## Icons and the install manifest

**Every icon in this directory is generated. Do not edit one by hand.** The one
original is `HLC-source.png` at the repo root, which is the 2250 square image
the template shipped, kept out of `main-site/` so it is version controlled and
not deployed.

```
node gen-icons.js         HLC-main, 512, 192, 180, the two maskable, favicon.ico
node gen-screenshots.js   images/install-narrow.png and install-wide.png
```

The template's icons sat on a mint green plate while `manifest.json` used the
GFTV yellow for its splash, so the icon and the screen behind it were two
different colours. Phase 10 settled it in favour of the yellow, per
`gftv-theme.md`'s rule that brand colours are not invented, and `gen-icons.js`
does the recolouring: the artwork is untouched and only the plate changes.

It is a script rather than five edited files for two reasons. The five have to
agree, and they had already drifted once. And the plate carries soft drop
shadows, which are dark green rather than mint, so a plain colour swap leaves
them behind as green smudges — every background pixel is matched as *mint at
some brightness* and written back as *yellow at that same brightness* instead.

- **`purpose` is explicit on all four manifest icons.** The two `maskable`
  variants put the artwork at 80% with the plate full bleed, so a launcher that
  crops to a circle never exposes a corner.
- **`favicon.ico` is one 256 square entry**, not the conventional 16/32/48 set.
  Every browser this site supports scales a single large PNG down itself, and
  one entry that is right beats three that have to be kept in step. The
  committed file was encoded by hand and is a few kilobytes smaller than what
  `gen-icons.js` produces; the script's `FAVICON_SIZES` follows the same choice,
  so a rerun changes the compression and never the design.
- **`apple-touch-icon` is `HLC-180.png`.** iOS ignores the manifest's icon list
  entirely, and every page used to point that at the 2250 square master: half a
  megabyte fetched to draw a home screen icon.
- **`theme_color` is white and `background_color` is `#fedc00`.** The splash
  matches the icon plate; the title bar has to match what `theme.js` writes
  into `meta[name=theme-color]` a moment later for the default classic light
  theme, or every launch flashes the wrong colour.
- **The manifest is English only**, deliberately. It is fetched with no session
  and no `localStorage`, so it cannot know which language was chosen. Same
  reason link embeds are always English.

**The screenshots are of `/search` on the live deployment**, at 360 CSS pixels
by 3 for narrow and 1920 by 1 for wide, which are the exact sizes the manifest
claims. Chrome checks that claim and silently drops a screenshot whose real
size does not match. They currently show the dev seed's SAMPLE POSTING rows,
because that is what the board currently holds: rerun `node gen-screenshots.js`
when the seed is deleted.

## The service worker

**Bump `VERSION` at the top of `sw.js` on every change to this site.** Not once
per phase, and not only when `sw.js` itself changes. Any edit under
`main-site/` is a new build, and a worker that has not been bumped keeps
serving the previous one to everyone who has visited before, which means a
shipped change is invisible to exactly the people who come back most.
`vercel.json` serves `sw.js` with `Cache-Control: no-cache` so the browser
always refetches it, but the file has to actually differ for that to do
anything.

Treat it as part of the change, alongside updating the affected README. The
same rule applies to `docs-site` once it has a service worker of its own.

It was a deliberate pass through until phase 10 — registering, taking control,
deleting any cache an earlier worker left behind, and no fetch handler at all.
Section 14 landed in phase 10 and it now does the following.

| Request | What happens |
|---|---|
| a navigation to a precached route | the cached shell, with no network |
| a navigation to `/jobs/{id}` | stale while revalidate, capped at 100 postings |
| any other navigation | network, and `/offline` when that fails |
| `/assets/**`, the icons, the manifest | cache first |
| `/api/public/**` | stale while revalidate |
| `/api/public/feature-status` | network only, and read on the way past |
| anything else under `/api/` | network only, never cached |
| any cross origin request | not intercepted at all |
| anything that is not a `GET` | not intercepted at all |

**The precache list is the dangerous object.** Run **`node check-precache.js`**
at the repo root before shipping, the way you run `check-i18n.js`: it resolves
every entry the way `cleanUrls` does and exits non-zero on one that is not on
disk. The list is also added one entry at a time rather than through
`cache.addAll`, because `addAll` rejects as a whole on the first bad path, the
install fails, and every offline behaviour is silently off. Between the two, a
wrong entry costs one file and says so.

Four rules in `sw.js` that are easy to break:

- **A response carrying `private` or `no-store` never enters the Cache API.**
  `api/job-page.js` and `api/public/job.js` both answer `private, no-store` with
  `Vary: Cookie` for an archived posting, which renders only for an applicant
  with history, and for a staff preview. Those look exactly like public routes
  from inside a worker, and the header is the only thing that says otherwise.
  `isCacheable()` is the single place that decision is made.
- **Nothing cross origin is intercepted**, which is also how Supabase Storage
  avatars stay out of the cache: the dashboard renders other people's faces, and
  a cache-on-use rule could not tell those from the reader's own.
- **`skipWaiting` and `clients.claim` are called only when a person asks.**
  Neither appears in `install` or `activate`. The page posts `skip-waiting` when
  the reader accepts the update prompt, and that is the only route to either.
- **The shell cache is versioned and the data caches are not.** A `VERSION` bump
  is the update: a new cache, filled from the network, and the old one dropped
  on activate. `careers-gftv-public`, `careers-gftv-postings` and
  `careers-gftv-state` survive it, because postings and public answers are data
  rather than build output and emptying them on every deploy would clear the
  board for a reader who is offline at the wrong moment.

**`offline` and `install` are real switches.** Both are feature keys on phase 10
in `build-status.json`, so an admin can flip either from `/admin/maintenance`.
The worker reads the answer out of the `/api/public/feature-status` response
every page already fetches, so it costs no extra request, and keeps the last one
it saw. With `offline` off it stops serving from cache, drops its caches, and
goes network only; with `install` off it answers 404 for `/manifest.json`, which
is what actually stops a browser offering the install. A worker that ignored the
switch would be a flag nothing enforces, and a bad service worker is the one bug
that outlives its own fix.

### The client half, `assets/js/offline.js`

Registration lives there and nowhere else. Until phase 10 every page carried its
own inline `navigator.serviceWorker.register('/sw.js')` — thirty three HTML
files plus the server rendered posting page — which was correct while
registering was the whole of it and stopped being correct the moment there was
an update to prompt about: the prompt needs the registration object, and an
inline script in the markup has nowhere to hand it to. `shell.js` imports the
module, and registration happens on `load` so the install's hundred fetches are
not competing with the page's own.

**The banner has three states and one bar.** Being offline outranks being
unable to reach the site, which outranks an update, because two bars stacked
above the header stop being unobtrusive.

| State | When | Dismissible |
|---|---|---|
| `offline` | `navigator.onLine` is false | No. It goes when the connection returns |
| `unreachable` | online, and two API calls in a row failed | No, same |
| `update` | a new worker is waiting | Yes, for that page view |

**The two connection wordings are the point, not a nicety.** `onLine` false is a
reliable "there is definitely no network". `onLine` true means only that an
interface is up, not that anything is reachable — so a Vercel outage on perfect
wifi reads as online, and a banner saying "you are offline" would send that
reader to reset a router that is working. The second wording says we cannot
reach Careers@GFTV and links to `/status`.

`api.js` announces `gftv:apireached` and `gftv:apifailed` as DOM events rather
than calling into `offline.js`. It is imported by nearly every page module, and
giving it an import that reached back into the shell would be a cycle waiting to
happen. **`reached` means an HTTP response arrived, whatever its status**: a 503
from a maintenance switch is the site answering, and the banner has no business
saying otherwise. An aborted request announces nothing, because that is the page
changing its mind rather than the network failing.

### The applicant's own data, `assets/js/idb.js`

Nothing authenticated goes in the Cache API, so the applicant's own copy of
their saved roles, applications, tasks, profile and avatar lives in IndexedDB
instead. One database, `careers-gftv`, three stores:

```
mine    keyPath ['userId', 'kind']   their data, one row per kind
queue   keyPath 'id', autoIncrement  section 14's queued actions, filled by part 8
meta    keyPath 'key'                one row: whose data this database holds
```

- **The user id is part of the key, not a field beside it.** A read for one
  applicant cannot return another's row even if the wipe below failed. The wipe
  is the policy; the compound key is what makes the policy hard to get wrong.
- **A null session never wipes anything.** Signing out wipes, and signing in as
  somebody else wipes. A session request that merely *failed* does not, and that
  distinction matters more offline than anywhere else: that request fails every
  single time there is no connection, and treating it as a sign out would throw
  the offline copy away at the moment it is the only copy there is.
- **The wipe is ordered before any write by the file, not by its callers.**
  `shell.js` starts `syncUser()` without awaiting it, so a page module could
  reach a write first. Every read and write waits on the same internal gate, so
  "wipe the database before writing anything" is a property of the module.
- **Every function fails quietly.** IndexedDB is unavailable in some private
  browsing modes and throws on access in others. A read returns null, a write
  does nothing, and the page works as it did before phase 10.
- **`describe()` reports counts and kinds and never the data.** Something that
  printed an applicant's saved roles into a console would be doing the exact
  thing this file exists to stop.

Three places wipe: the sign out button in `shell.js`, the danger zone in
`settings-page.js` — the one path that does not end in a reload, so nothing else
would ever clear it — and `syncUser` itself.

### What is readable with no connection

| View | Where it comes from | What it says |
|---|---|---|
| A posting already opened | the `postings` cache, capped at 100 | "You are reading the copy saved on your device on {date}" |
| The board at `/search` | the last successful result set, in IndexedDB | "These are the roles saved on your device on {date}" |
| Saved roles, My applications, tasks | the applicant's own copy, in IndexedDB | "This is the copy saved on your device on {date}" |
| An uncached route | `/offline`, listing the postings held and the saved roles | the lists, by name, in the reader's language |

**Being unable to ask is not an answer.** `applicantSession()` distinguishes
"nobody is signed in" from "we could not ask" with an `unreachable` flag, and
`mountAccountPage` redirects only on the first. Collapsing the two — which is
what the code did until phase 10 — sends an offline applicant from their own
dashboard to `/login`, the one page in the build that cannot work without a
connection. Offline the account area draws from the profile kept in IndexedDB on
every successful mount, and the header does the same, because a page listing
somebody's own roles under a "Sign in" link is the site disagreeing with itself
about who is looking at it.

**None of that authenticates anything and it does not pretend to.** It answers
one question — who was signed in on this device — so the pages can draw the copy
of their own data that section 14 requires. Every endpoint still checks the real
cookie, so an applicant reading this offline sees what they already had and can
change nothing.

**A cached posting reads in both languages already.** `api/job-page.js` inlines
the content for `en` and `zh` both, which is why switching language on a posting
is a redraw rather than a fetch — so one cached response satisfies section 14's
"a cached posting is cached in both languages" outright, with nothing to merge.
The worker reads the titles out of that same inlined payload to build the list
on the fallback page, which is what makes that list bilingual for free.

**The board keeps its own copy rather than relying on the response cache.** The
worker caches `/api/public/search` by URL, so a reader who is offline under
different filters than any they have used before would get nothing. Section 14
asks for "the last successful result set, including its filters", so
`search-page.js` keeps exactly that in the `public` IndexedDB store and draws it
when a search fails. Two sentences, not one: if the saved filters differ from
the ones asked for, it says so, because showing somebody who searched for
"camera" a board that was never about cameras and calling it merely old is a
quiet lie.

**Only a network failure falls back.** A 500 or a 503 is the site answering, and
showing yesterday's board in place of an error would hide a real fault behind
stale data.

### The action queue, `assets/js/queue.js`

Two actions and no more, both from the handoff modal in 7c: the rating, and the
Yes or No. Queued in IndexedDB when the request fails with a network error, and
sent when the connection returns.

**Nothing else is ever queued, and that is a decision.** Section 6 says the
offline story is for the public surface and that a dashboard write is never
queued. Section 14 permits replying to a task offline and that is a task reply
rather than a dashboard write — but it is free text against a question set that
may have changed, so the honest version of it offline is a disabled control with
the reason on it.

**A queued answer is pending, not done.** Section 14 in as many words: do not
start the reapply cooldown from a local queue entry. Five things in this build
write `applied_at` and `cooldown_until` and this is not a sixth. The Apply
control gained an eighth state, `queued`, resolved above `pending`, `applied`
and `cooldown`, and only the server's reply moves it on — `queue.js` is the one
place that dispatches `gftv:applychange` for a queued answer.

**Every action is idempotent**, so a replay cannot double count: the rating is
keyed on the applicant and the posting, the answer on the analytics row id.
That is what makes it safe for the page and the worker to both try the same row.

A refusal is not a failure, and the kinds are handled differently:

| What came back | What happens |
|---|---|
| success | cleared, and the answer reconciled against the server's reply |
| network failure, 503 from a switched-off feature, 429, 500 | held, and retried |
| 401 | held — it is still what they meant — and they are asked to sign in |
| anything else | dropped: the server has decided and retrying cannot change it |

**`sw.js` carries a second copy of that rule**, deliberately. Background Sync
runs in the worker, a worker is a classic script and cannot import a module, and
the obvious alternative — the worker asking an open page to flush — defeats the
whole point, which is flushing when no page is open. So the worker holds the
minimum (read, send, keep or drop) and `queueVerdict` there **must stay in step
with `verdictFor` in `queue.js`**. Same arrangement as the pre-paint theme
script duplicating two constants from `theme.js`. Two checks in the phase 10 run
exist only to catch that pair drifting, including the sync tag itself — a tag
that differs is a queue that never flushes in the background, silently.

### Controls that cannot work offline

Section 14: disabled with the reason on the control itself, never a dead button
that fails on click. Mark one up and `offline.js` does the rest:

```html
<button data-needs-network>Send</button>
<button data-needs-network="apply">Apply</button>
```

The value picks a more specific sentence where there is one — `apply`, `signin`,
`upload`, or the general case. It is not a dictionary key: the four keys are
written as literals in `reasonFor` so `check-i18n` can see them. Pages that draw
a control after the shell's pass call `applyNetworkGating(subtree)` themselves.

**There are now three reasons a control can be disabled, and they are never
conflated.** `build-status.js` says there are two — a feature that has not
shipped, and one an admin has switched off — and it is right to keep those
apart. Offline is a third and a different kind of claim: it is about the reader
rather than about us, nothing is broken, nothing is unbuilt, and it will work in
a moment.

Two consequences that are easy to get wrong and are checked:

- **A control already disabled for another reason keeps that reason.** Telling
  somebody to wait for their connection when what they are waiting for is phase
  11 is the wrong sentence.
- **Coming back online re-enables only what went offline disabled it**, and only
  when nothing else still holds it down. The two passes run in whichever order
  their promises land, so re-enabling on our own reason alone would leave a live
  control in front of an endpoint that answers 503.

Marked up: sign in, register, both second factor steps, the recovery path, the
passkey controls, Apply, the avatar upload and removal, and the task reply.

**The dashboard is the sharpest case.** `mountAdminPage` used to redirect to
`/admin/login` on any failure from `/api/admin/me`, which offline sends an admin
to a page that cannot load either. A network failure now draws an offline notice
and **returns null, so every page module stops before asking for any data**. No
sidebar is drawn: it is built from the role and access flags, which are exactly
what could not be read. Nothing under `api/admin` is cached, so there is no
stale management data to show even by accident.

**Checking it.** `node tests/phase10-test.mjs --only=worker` stands up this
directory over `http://localhost`, which is a secure origin as far as
registration is concerned, and drives a real browser through install, the
precache, offline navigation, the fallback, and the update prompt. It needs no
deployment, no credentials, and no network. Run it before pushing a change to
`sw.js`: the failure it exists for is silent everywhere else.

## Offline test checklist

`node tests/phase10-test.mjs --only=worker` covers the worker itself — the
precache, offline navigation, the fallback, and the update prompt — against a
local copy of this directory, and needs nothing set up. **What it cannot do is
this list.** Section 14's last line asks for a real Android install and for iOS
Safari, where service worker support is real but stricter, and neither is
something a script does:

1. Install the app to a home screen from Chrome, and again on Android.
2. Load the board at `/search`, then open two postings so they are cached.
3. Go offline.
4. Browse a cached posting and confirm it reads in full.
5. Rate it, and answer the apply question.
6. Confirm the Apply button is disabled with the reason given, since opening a
   Google Form needs the network.
7. Visit an uncached route and confirm the offline fallback page offers the
   cached postings and saved jobs.
8. Come back online and confirm the queued rating and answer flush, and that
   the interface stops showing them as awaiting sync.
9. Repeat the fallback check on iOS Safari, which supports service workers but
   is stricter.
