# docs-site

The public documentation site for Careers@GFTV, served at
`docs.careers.globalfurry.tv`.

**Status: not built yet.** The docs site ships in phase 13, so that it
documents what was actually built rather than what was planned. This directory
currently holds the scaffold only: this README and an empty `content/`. See
[the build status page](https://careers.globalfurry.tv/status).

## What it covers

Two guides, written for applicants who have never seen the portal, each a top
level section in the sidebar:

1. How to use the Careers@GFTV portal.
2. How to use the Careers@GFTV Telegram bot.

The admin guide is deliberately not here. It lives inside the portal behind the
staff session, at `/admin/docs`, because this site is public and an admin guide
describes screens full of real applicants.

**Nothing internal goes in this site.** No table names, no endpoint paths, no
environment variables, and no Google Form URLs.

## How it will be built

- Content is markdown in `content/`, one file per page, with front matter for
  title, sidebar order, and a short description.
- A small Node script converts those to static HTML at deploy time using a
  shared layout, and emits a `search-index.json`. This is a deliberate
  exception to the no build step rule that governs `main-site`, and the reason
  is that hand maintaining a shared sidebar and header across thirty HTML files
  is how documentation rots.
- Search is client side over the generated index. No third party search
  service.
- Layout follows GitBook's structure and interaction patterns with GFTV's own
  palette, taken from `main-site/assets/css/theme.css`. The conventions, never
  the branding: no GitBook logo, name, or assets, and no implied affiliation.
- Two axis theming exactly as the main site, same tokens, same
  `data-color-theme` and `data-mode` attributes, light default.

## Adding or editing a page

Lands with the build in phase 13.

## Previewing locally

Lands with the build in phase 13.

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
