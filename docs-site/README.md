# docs-site

The documentation site for Careers@GFTV, served at
`docs.careers.globalfurry.tv`.

**Status: not built yet.** The site's foundations ship in phase 13 and its
content in phase 14, so that it documents what was actually built rather than
what was planned. This directory currently holds the scaffold only: this README
and an empty `content/`. See
[the build status page](https://careers.globalfurry.tv/status).

## What it covers

Four guides, one per audience, each a top level section in the sidebar. What a
reader sees depends on whether they are signed in and what their staff role is,
per section 16a of the specification.

**Public, no login:**

1. How to use the Careers@GFTV portal.
2. How to use the Careers@GFTV Telegram bot.
3. Helping with translations: what a translation helper can do and how to
   volunteer. Public on purpose, since a helper is a language speaker rather
   than a staff member and cannot read a gated page.

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

## Signing in

Staff sign in here with the same gftv.asia account they use on the portal, with
the same second factor. This site runs its own small `api/` for that: its own
cookie, its own session table, and its own trusted devices. Signing in on the
portal does not sign you in here.

A passkey registered on the portal does work here, because both sites share one
WebAuthn relying party id. A passkey does not work on a preview deployment,
which is a different host; password plus a code still does.

## How it will be built

- Content is markdown with front matter, and the front matter carries a
  required `access` key of `public`, `poster`, `admin`, or `developer`. A page
  with no `access` key fails the build rather than defaulting to either.
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

## Previewing locally

Lands with the build in phase 13, including how to sign in against a local
staff account.

## Screenshots

Captured with Playwright, never by hand, from a capture script in
`scripts/` with its own `package.json` so it never becomes a dependency of the
portal build.

Rules that will not change:

- It runs on demand against a local or seeded instance, never as part of the
  Vercel build and never against production.
- Every screenshot shows invented people applying to invented roles, from the
  seed script. No real applicant, email, or Telegram handle ever appears.
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
serving the previous one to returning readers. Treat it as part of the change
rather than a separate step.

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
