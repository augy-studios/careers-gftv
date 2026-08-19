# main-site

The Careers@GFTV portal itself: a static frontend with no build step, plus
Vercel serverless functions under `api/`.

Vercel's root directory for this project is set to `main-site`, which is why
`api/` lives inside this directory rather than at the repo root.

**Current phase: 3 of 14, Browsing roles.** Live: the shell, the home page,
`/status`, registering and signing in, passkeys, recovery codes, account
recovery, trusted devices, `/account/security`, and `/admin/security`.
Everything else renders the placeholder. See
[/status](https://careers.globalfurry.tv/status).

**Every role listed on this site is voluntary and unpaid**, and the interface
says so on the home page, the registration page, the footer, the manifest, and
in every link embed. Written as a statement about the postings that exist
rather than a promise about the future: `gftvjobs_jobs.is_paid` exists so a
paid posting can say otherwise for itself, and the commitment types
(`full_time`, `part_time`, `contract`, `internship`, `volunteer`) describe how
much time a role takes, not whether it pays. A full time volunteer is a real
thing here.

## Layout

```
main-site/
  index.html          home page
  search/index.html   the job board, which is the listing and the results page
  about/index.html    what Careers@GFTV is, and why every role is unpaid
  faq/index.html      frequently asked questions
  status/index.html   the public build status page and changelog
  login/index.html    applicant sign in
  register/index.html applicant registration
  forgot-password/    account recovery with a recovery code
  account/security/   recovery codes, password, trusted devices
  admin/login/        staff sign in, with the second factor step
  admin/security/     staff passkeys and trusted devices
  placeholder.html    served for every route belonging to a later phase
  404.html            genuinely unknown paths
  manifest.json       PWA manifest, rewritten properly in phase 10
  sw.js               service worker, a pass through until phase 10
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
    js/format.js      dates, counts, and the open until filled rule
    js/job-card.js    one card renderer, shared by the home page and the board
    js/search-page.js the board: URL state, filters, chips, suggestions
    js/home-page.js   the hero dropdown, latest openings, browse by team
    js/i18n.js        language switching and the string dictionaries
    js/api.js         the one place that knows the API response shape
    js/forms.js       field errors, busy states, password reveal
    js/recovery-codes.js  the shown once code dialog
    js/login-page.js, register-page.js, forgot-password-page.js,
    js/admin-login-page.js, security-page.js, staff-security-page.js
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
    public/           search, suggest, facets. No session is read in any of
                      them: the board is public, filters and tags included.
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

Not built. `gftvjobs_users.avatar_url` has existed since migration `002` and
nothing writes it. The upload endpoint is phase 6, with the rest of account
settings.

**[AVATARS.md](AVATARS.md)** is the guide: creating the `gftvjobs-avatars`
bucket, compressing to WebP in the browser, and the endpoint that puts the two
together. Read the first section before starting, because it changes a settled
decision: section 10 item 1 says "No Supabase Storage, no uploads", and this is
the exception to it.

The shape is forced by section 2. The browser never receives an anon key, so it
cannot upload to Storage directly the way a Supabase app normally would. The
bytes go through a function using the service key, which is also why the
browser has to compress first: a Vercel function takes at most 4.5 MB of
request body.

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

Phases 2 and 3 are built. The rest is the shape phases 4 to 11 fill in, from
section 9 of the specification.

| Group | Routes | Phase |
|---|---|---|
| `api/auth/staff/*` | login, verify-2fa, logout, session, trusted-devices, passkeys | 2 |
| | Listing is GET. Revoking a device and removing a passkey are POST with an `action`, not DELETE: the password travels in the body, and a body on DELETE is legal but is known to be dropped by proxies, which would fail silently. | |
| `api/auth/applicant/*` | register, login, logout, session, verify-2fa, profile, change-password, forgot-password, reset-password, recovery-codes, trusted-devices, passkeys, locale | 2 |
| `api/public/*` | search, suggest, facets | 3 |
| | Section 9 lists departments and tags as separate routes. They are one `facets` route, because the filter panel needs both plus the chip counts plus the commitment types in use before it can draw at all, and three requests to draw one panel is three chances for it to appear in pieces. | |
| | All three are GET, session free, and cacheable. `vercel.json` scopes its `no-store` rule to `/api/auth` so they can set their own `s-maxage`. | |
| `api/public/jobs*` | job by uuid, slug lookup, jobs.json feed | 4 |
| `api/applications/*` | start, respond, pending, list mine, withdraw | 5 |
| `api/ratings/*` | upsert a rating | 5 |
| `api/translations/*` | report a translation problem, list my own reports | 4 |
| `api/translations/*` | helper drafting, annotations, suggestion queue | 8 |
| `api/saved/*` | save, unsave, list mine | 6 |
| `api/tasks/*` | list mine, get one, reply, dismiss, unread count | 6 |
| `api/account/danger/*` | verify password, then each destructive action | 6 |
| `api/admin/*` | jobs, applications, tasks, departments, tags, docs | 7 |
| `api/admin/*` | analytics, invites, users, admins, settings, stats, export, translations | 8 |
| `api/cron/daily` | the scheduled maintenance in section 11 | 9 |
| `api/webhooks/form-submit` | the Apps Script integration in section 13 | 9 |
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
| `validate.js` | Input validation, returning codes rather than English so the client renders them in either language. |
| `jobs.js` | The board's query string parameter names, parsed defensively, and the public shape of a posting. Also the `ts_headline` sanitiser: that string is the one field the browser assigns as markup, and everything except `<mark>` is escaped here rather than in the client. |
| `settings.js` | Reading `gftvjobs_settings`, cached for a minute. A settings read never fails a request and never falls back to the permissive value: if the reapply cooldown cannot be read the answer is 90 days, not zero. |

Every endpoint returning human readable content takes a locale, `en` or `zh`,
and returns that language in the ordinary field names. A caller sending no
locale gets English.

**Rate limiting is table backed**, in `gftvjobs_rate_limits`. Section 9 allows
either that or in-memory. Table backed was chosen because each Vercel function
instance has its own memory, so an in-memory limiter resets constantly and
cannot hold the one hour lockouts that sections 5c and 7g require.

## The reapply cooldown

Section 7f fixes it at three months. Migration `029` makes it the
`reapply_cooldown_days` setting instead, defaulting to 90, editable from the
admin settings page in phase 8, and enforced by `api/_lib/settings.js`.

Days rather than months, because zero has to be expressible and so does a
fortnight. The cost, stated plainly: 90 days is not exactly three months, so an
application on 4 March reopens on 2 June rather than 4 June. The interface never
shows the number, only the date it produced, so nobody sees the unit.

**Zero switches the cooldown off**, and what that means precisely matters:

- No `cooldown_until` is written when a new application is confirmed. The column
  stays null. Never `now()`: a cooldown in the past would have the posting card
  offer to tell somebody the date they may reapply, which would be today.
- Existing `cooldown_until` values are **ignored, not cleared**. `isInCooldown()`
  answers false while the setting is zero, so turning it off takes effect at
  once, and setting it back to 90 restores every cooldown that was running
  rather than having silently destroyed them.

Phase 5's apply endpoint should ask `isInCooldown()` rather than comparing
`cooldown_until` to the clock itself, since that comparison alone misses the
disabled case.

Raising the setting does not extend a cooldown somebody is already serving.
`cooldown_until` stays stored rather than computed on read, exactly as migration
`006` says, so a policy change applies to the next application and not
retroactively. Admins can still waive a single row, per 7f.

The database constrains the value to a whole number from 0 to 3650. Ten years is
the ceiling because without one a typo is indistinguishable from a permanent ban
nobody meant to impose.

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
consequence worth knowing rather than discovering: `replaceState` creates no
history entry, so pressing back after applying four filters leaves the board
rather than undoing one filter. That is the specified behaviour.

**Search works differently per language, and has to.** English keeps the
weighted `tsvector`, ranked with `ts_rank_cd` and highlighted with
`ts_headline`. Chinese is matched by substring against the translation row's
generated `search_text`, because Postgres cannot segment Han script and a
`tsvector` would hold one token per run of characters. Both find what is there;
only English orders it by relevance. The FAQ says so in both languages rather
than leaving a reader to conclude Chinese search is broken.

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
  `gftvjobs_password_resets.second_factor_at` rather than by the screen order.
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
  one timer to the next 09:00 or 18:00 rather than polling, and re-checks on
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
off and is the same kind of action 7g already lists. **Phase 6 should use this
component for the danger zone proper** rather than writing a second one.

## Language

The portal is English and Chinese. Only one is shown at a time, and both are
complete: every posting, every interface string, and the admin dashboard exist
in both.

**The Chinese uses each reader's own system font.** No CJK face is named in
`theme.css`: Han characters fall past the Latin families to the platform
default, which is PingFang SC on Apple, Microsoft YaHei on Windows, and Noto
Sans CJK SC on Android and Linux. What makes that correct is the `lang`
attribute rather than the stack. Han characters are shared with Japanese, and
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
   layer, so a key missing from `zh.json` renders English rather than a blank
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
string degrades to something searchable rather than to a blank element, but
that kindness is also why `footer.buildStatus` sat in the footer from phase 1
reading "footer.buildStatus". Two things catch it now:

- **`node check-i18n.js`** at the repo root reads every `data-i18n` attribute,
  every literal `t('...')`, and the `key:` entries in the NAV and FOOTER
  tables, and exits non-zero on anything not in `en.json`. It also lists keys
  built at runtime, which it cannot check, and keys nothing references, which
  is information rather than an error.
- **`t()` warns to the console** once per key when a key is missing and the
  English dictionary has already loaded.

Neither catches the other failure: a string written by JavaScript rather than
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

## Fonts

Proxima Nova is the GFTV branding font. It is licensed and is not on Google
Fonts, so it is self hosted rather than pulled from a CDN. That is also what
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

Right now the worker is a deliberate pass through: it registers, takes control,
deletes any cache an earlier worker left behind, and has no fetch handler at
all. That is on purpose while the site changes shape every phase, since a cache
first worker would pin an old build on returning visitors for the whole build.

From phase 10, when section 14 lands and the worker gains a precache list and
real strategies, keep that list in step with the files that exist as well. A
precache entry naming a deleted file makes `cache.addAll` reject and the entire
install fail silently.

## Offline test checklist

The service worker is a deliberate pass through until phase 10, so there is
nothing to test yet. When phase 10 lands, this is the run through:

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
