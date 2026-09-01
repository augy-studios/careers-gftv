# docs-site

The documentation site for Careers@GFTV, served at
`docs.careers.globalfurry.tv`.

**Status: being built.** The site's foundations ship in phase 13 and its
content in phase 14, so that it documents what was actually built, not
what was planned. See
[the build status page](https://careers.globalfurry.tv/status).

What is here as of phase 13 part 1: the staff session, which is this site's
own. `api/_lib/` and the three routes under `api/auth/staff/` are generated
copies of the portal's, per [the pair rule](#the-modules-shared-with-the-portal)
below, and they cover signing in, signing out, and reading the session. **A sign
in that needs a second factor cannot finish yet**: `verify-2fa` and the passkey
and trusted device routes are part 2. There are no pages, no shell, and no
gate, so nothing is deployable from this directory yet.

## What it covers

Four guides, one per audience, each a top level section in the sidebar. What a
reader sees depends on whether they are signed in and what their staff role is,
per section 16a of the specification.

**Public, no login:**

1. How to use the Careers@GFTV portal.
2. How to use the Careers@GFTV Telegram bot.
3. Helping with translations: what a translation helper can do and how to
   volunteer. Public on purpose, since a helper is a language speaker and
   not a staff member, and cannot read a gated page.

**Staff, signed in:**

1. The job poster guide, for staff with `is_editor`: the staff dashboard and
   every feature a job poster can reach.
2. The admin guide, for staff with `is_admin`: what `/admin/docs` was going to
   be, plus everything a job poster sees.
3. The developer guide, also for admins, since the admins of this project are
   its developers: the specification, the final state of `next-steps.md`, the
   official banner, the theme, the avatars bucket, Vercel, Playwright, the
   service worker, and the database conventions.

The admin guide used to live inside the portal at `/admin/docs`. It moved here
when this site gained a staff login, because one manual with one search index
and one screenshot pipeline beats two that quietly disagree. `/admin/docs`
stays as a redirect.

**Nothing internal goes in the public half.** No table names, no endpoint
paths, no environment variables, and no Google Form URLs. The staff half can be
specific, but it still holds no secrets: no variable values, no keys, no
tokens, and no real applicant data.

## The test scripts in the developer guide

The developer guide hands a reader the scripts in [`tests/`](../tests/) directly,
instead of telling them to go and find the repository. **The pages that do it
are phase 14's and are not written yet.** What is here now is the one piece that
does not depend on how the site is built:

[`scripts/embed-tests.mjs`](scripts/embed-tests.mjs) reads every `tests/*.mjs`,
takes each one's description and usage lines from the comment it already starts
with, and emits them with the file base64 encoded alongside its size and its
SHA-256:

```sh
node docs-site/scripts/embed-tests.mjs          # write it
node docs-site/scripts/embed-tests.mjs --check  # fail if it is out of date
```

Nothing is written by hand: adding a script to `tests/` and rerunning it is the
whole of the work, and `--check` is what belongs in whatever runs before a docs
deploy.

**Where the output goes was settled in phase 13**: `api/_content/developer/`,
committed, and never `content/`. The developer guide is admin only, so its data
file goes through the gate with the page that reads it; anything in the static
root is world readable no matter what the interface does. It is committed rather
than generated at deploy time so that a change to a test script shows up as a
reviewable diff. The pipeline that serves it is part 5 and the page that reads
it is phase 14's, so the file itself is written when there is something to read
it:

```sh
node docs-site/scripts/embed-tests.mjs --out docs-site/api/_content/developer/test-scripts.json
node docs-site/scripts/embed-tests.mjs --check docs-site/api/_content/developer/test-scripts.json
```

**The download should have no address of its own.** The content travels inside
the page and the download link is a `blob:` URL built in that tab: unique to the
tab, dead when the tab closes, and no path anybody can share that serves a
script directly. A raw path would be a second public surface for a file whose
only supported entry point is the page explaining what it writes to the live
database.

**Be clear about what that is not.** A blob hides where the file came from, not
what is in it: the text is in the page and the network tab has it. That is fine
and is the point — somebody who reads a script before running it against their
own database is doing the right thing. Nothing in `tests/` is a secret, none of
it holds a credential (every script takes those from the environment), and if
one ever needs to, it does not belong in `tests/`.

## Signing in

Staff sign in here with the same gftv.asia account they use on the portal, with
the same second factor. This site runs its own small `api/` for that: its own
cookie, its own session table, and its own trusted devices. Signing in on the
portal does not sign you in here.

A passkey registered on the portal does work here, because both sites share one
WebAuthn relying party id. A passkey does not work on a preview deployment,
which is a different host; password plus a code still does.

## The modules shared with the portal

**`api/_lib/` is a duplicate of `main-site/api/_lib/`, and the two are a pair.**
Vercel builds each project from its own root directory and cannot reach outside
it, so nothing here can import anything there. 5h says to duplicate the shared
session helpers and keep the two copies identical, and phase 13 part 1 made that
generated rather than remembered:

```sh
node gen-docs-lib.js          # write this site's copies
node gen-docs-lib.js --check  # fail when one is out of date
```

Both are run from the repository root. `--check` belongs in whatever runs before
a deploy, beside `check-i18n.js`.

**Nothing under `api/_lib/` or `api/auth/staff/` is edited here.** Every file in
both directories opens with a banner naming the portal file it came from; an
edit made here is undone by the next run of the generator, which is a great deal
louder than an edit that survives in one copy only. The change goes in
`main-site/api/_lib/`, and the generator carries it across.

The two sites do differ, in five places, and each one is a rule in
`gen-docs-lib.js` with its reason written beside it:

| What differs | Why |
|---|---|
| `gftv_docs_session` and `gftv_docs_device` | 5h. Its own cookies, host scoped, so signing out of one site does not sign you out of the other and trusting a device here does not trust it on the portal. |
| `gftvjobs_docs_sessions` | 5h and migration `038`. The same shape as the portal's table, which is what lets one file read either. |
| The relying party pair | 5e. The id comes from `SITE_URL`, which on this site is **the portal**, and the expected origin comes from `DOCS_URL`. That pair is what makes one passkey work on both sites, and it is the one thing here that is not a copy. |
| The variable list | Four rather than six. Nothing here answers a Google Apps Script, runs a cron, or talks to Telegram. |
| The audit stamp | 5f and 5g want the site an action was performed from. Every row this site writes carries `site: "docs"`. |

Everything else is byte for byte the portal's, including the rate limit table,
which is shared on purpose: the limits are per account and per address, so
attempts against one account count together across both sites.

**A rule that stops matching stops the generator.** If the portal edits a line
one of these depends on, nothing is written and the failure names the rule, so
somebody decides what this site should do about the change. That is the check
the duplication actually needed: not whether the two files are the same, since
they are deliberately not, but whether the difference between them is still the
one that was intended.

A file appearing in either generated directory that the generator did not write
fails the same check. It is either added to the manifest or named as this site's
own; there are none yet.

## Environment variables

[`.env.example`](.env.example) is the list, with a comment above each one saying
where to get it. Copy it to `.env.local` for local development and set the same
four in the Vercel project settings.

**This project's variables are its own.** Vercel reads only the variables set on
the project being built, so setting a value on the portal's project sets it on
the portal's project. Two of the four are worth reading twice:

- `DOCS_URL` is this site. It scopes the cookies and it is the origin a passkey
  response is checked against.
- `SITE_URL` is **the portal**, not this site. It is the WebAuthn relying party
  id, per 5e, and pointing it here breaks every passkey registered on the
  portal.

## Previewing locally

```sh
cp docs-site/.env.example docs-site/.env.local   # then fill it in
cd docs-site && vercel dev --listen 3001
```

Port 3001 so the portal can run on 3000 at the same time, which is what
`DOCS_URL=http://localhost:3001` and `SITE_URL=http://localhost:3000` in
`.env.local` assume. With that pair, the relying party id is `localhost` on both
sites, so a passkey registered against a local portal works against a local docs
site exactly as it does in production.

**Signing in locally needs a real staff account**, since the accounts are
`gftvhello_users` rows in the shared Supabase project and this build never
creates one. Use your own, and note that it must pass the same access rule the
portal applies: approved, and either `is_admin` or `is_editor`, or a row in
`gftvjobs_admin_access` granting it.

## How it will be built

- Content is markdown with front matter, and the front matter carries a
  required `access` key of `public`, `poster`, `admin`, or `developer`. A page
  with no `access` key fails the build and does not default to either.
- Two pipelines, because a gated page cannot be a file on the CDN. Public pages
  live in `content/` and are converted to static HTML at deploy time by a small
  Node script using a shared layout. Gated pages live in `api/_content/`, where
  Vercel will not serve them statically, and are returned by an authenticated
  function that checks the session and the page's role.
- The static build is a deliberate exception to the no build step rule that
  governs `main-site`, and the reason is that hand maintaining a shared sidebar
  and header across thirty HTML files is how documentation rots.
- Both pipelines share one layout, one sidebar, and one stylesheet. A reader
  must not be able to tell which one a page came from.
- Search is client side over a generated index, split the same way: the public
  index is a static file, and the gated index is served per role. A public
  reader must never find a developer page's heading in search.
- No third party search service, on either half.
- Layout follows GitBook's structure and interaction patterns with GFTV's own
  palette, taken from `main-site/assets/css/theme.css`. The conventions, never
  the branding: no GitBook logo, name, or assets, and no implied affiliation.
- Two axis theming exactly as the main site, same tokens, same
  `data-color-theme` and `data-mode` attributes, light default.
- The GitBook language covers the whole site, not only the public half. The
  staff guides, the sign in form, and the account settings page render in the
  same shell with the same layout, callouts, and type scale. This is
  documentation that happens to need a session, not an admin panel with pages
  in it, and it must not start looking like one.

## Account settings

Staff account settings live here at `/account`, with the same suite the portal
mounts at `/admin/security`: passkeys, authenticator app, backup codes, account
recovery codes, trusted devices, sessions, and a danger zone.

One implementation, mounted twice. Change it in one place and both sites move
together.

There is no delete account. The gftv.asia account is not this project's to
delete, and the page says so and links across.

## Adding or editing a page

Lands with the build in phase 14. Which pipeline a page goes through is decided
by its `access` front matter key and nothing else.

## Screenshots

Captured with Playwright, never by hand, from a capture script in
`scripts/` with its own `package.json` so it never becomes a dependency of the
portal build.

Rules that will not change:

- It runs on demand against a local or seeded instance, never as part of the
  Vercel build and never against production.
- Every screenshot shows invented people applying to invented roles, from the
  seed script. No real applicant, email, or Telegram handle ever appears.
  **That script exists as of phase 12 part 8**: `seed.mjs` at the repo root
  writes the sample postings and two sample accounts, one reading English and
  one reading 华文 so the Chinese pages can be captured signed in, and prints
  their passwords once. `node seed.mjs --clear --yes` takes it all out again.
  **It refuses to write while the portal is open to search engines**, which it
  has been since part 8, and there is one database rather than a local one — so
  a capture run is a deliberate `--anyway`, followed by clearing as soon as the
  shots are taken. What that costs is real and worth knowing: the sitemap is
  cached an hour at the edge, so a sample posting seeded and cleared inside the
  hour can still have been handed to a crawler, and capturing against a preview
  deployment does not help — there is one database behind both, and it is the
  database the board and the sitemap are built from. The window is the only
  thing under anybody's control here, so keep it short.
- Never capture a live recovery code, backup code, login code, linking token,
  or Google Form URL.
- Runs are deterministic: animations disabled, relative dates frozen or masked.
- A shot for a gated page is written beside the gated content in
  `api/_content/`, never into the public output. Landing one in the public
  directory is a build failure, not a review comment.

## The service worker

Once this site has a service worker of its own, **bump its `VERSION` on every
change to this site**, the same rule the portal follows. Any edit under
`docs-site/` is a new build, and a worker that has not been bumped keeps
serving the previous one to returning readers. Treat it as part of the change,
not a separate step.

## Deployment

Its own Vercel project with the root directory set to `docs-site`, since the
portal project already points at `main-site`. Two projects, one repo. Custom
domain `docs.careers.globalfurry.tv`.

This project has serverless functions of its own, so it needs its own
environment variables set in Vercel, documented in `.env.example`, and its own
`vercel.json` carrying the `includeFiles` entry for the gated content.

`robots.txt`, `sitemap.xml`, and `llms.txt` are generated from the page list
and cover public pages only. A gated page must never appear in any of the
three, and they are generated from the same `access` key that drives the gate
so a page cannot be hidden in one place and advertised in another.
