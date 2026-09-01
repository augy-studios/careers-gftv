# docs-site

The documentation site for Careers@GFTV, served at
`docs.careers.globalfurry.tv`.

**Status: being built.** The site's foundations ship in phase 13 and its
content in phase 14, so that it documents what was actually built, not
what was planned. See
[the build status page](https://careers.globalfurry.tv/status).

What is here as of phase 13 part 5: the whole staff sign in, the gate, the
shell, and both content pipelines. `api/_lib/` and the six routes under
`api/auth/staff/` are generated copies of the portal's, per
[the pair rule](#the-modules-shared-with-the-portal) below. They cover signing in
and out, reading the session, the second factor in all three of its forms — a
passkey, the authenticator code, a backup code — registering and removing a
passkey, and the trusted devices. Beside them, [the gate](#the-gate) decides what
a reader may open, [the shell](#the-shell) draws it, and
[the build](#the-build-and-the-two-pipelines) turns the public tree into static
HTML with a search index beside it.

What is not here yet is parts 6 and 7: the account settings suite, and the Vercel
project itself.

**Two things about the second factor that are this site's and not the portal's.**
A passkey registered on either site works on both, because 5e has both claim the
portal's host as the relying party id, and the row records which of the two the
ceremony ran on. A trusted device does not: the device cookie is host scoped, so
trusting a browser here does not trust it on the portal. The device *list*,
though, is the account's across both sites, because `gftvhello_trusted_devices`
has no column saying which site wrote a row and section 2 forbids adding one.

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
committed, and never `content/`. Part 5's page loader knows that file's kind and
gives it no address of its own, which is the half of this decision a later
reader is most likely to undo by accident. The developer guide is admin only, so its data
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

## The gate

Four tiers, cumulative, so each one opens everything the tier below it opens.
The names are the values a page's `access` front matter key may carry, and there
is no fifth:

| `access` | Who | Where the pages live |
|---|---|---|
| `public` | Anyone, signed out included | `content/`, at `/` |
| `poster` | Staff with portal access and no `is_admin` | `api/_content/`, at `/staff` |
| `admin` | Staff with `is_admin` | `api/_content/`, at `/staff` |
| `developer` | The same accounts as `admin` | `api/_content/`, at `/staff` |

`developer` is not a flag on anybody's account and none is to be invented: the
admins of this project are its developers, so an admin lands on the top tier.
What an account *is* called on screen is separate and is "job poster" or
"admin", per 16b, because those are the two things a staff account can be.

**An account with staff access and no `is_admin` reads as a job poster**, which
covers `is_editor` and covers an account let in by a `gftvjobs_admin_access` row
with neither flag set. That overlay decides whether somebody may use the staff
side at all; the flags decide how much of it. What the job poster guide
documents is exactly what such an account can reach on the portal.

Three rules, and each one is a way the same mistake gets made:

- **A page above the reader's tier answers 404 and never 401.** A 401 confirms
  the page exists to anybody probing for it. A path nobody has ever written and
  a path belonging to the developer guide answer identically.
- **The sidebar carries only what the reader may open.** No padlocks and no
  greyed out entries: they teach nothing and invite guessing at URLs. The
  filtering is server side in `api/nav.js`, so the browser is never sent a title
  it is not allowed to see.
- **The role comes from the session on the server, on every request.** Access is
  re-checked each time, so revoking somebody takes effect on their next request
  and not on their next sign in.

The one thing this site says out loud is on the home page: staff documentation
exists and is behind a sign in. Hiding that protects nothing when the sign in
form is right there, and naming the pages inside it would do the opposite.

### The four files that are this site's own

Everything else under `api/_lib/` is a generated copy of the portal's. These
four are not, because the portal has nothing to generate them from: it has one
staff area behind one access rule and no build step at all, and this site has
four tiers of reader behind that same rule.

| File | What it holds |
|---|---|
| `api/_lib/tiers.js` | The four tiers, the comparison, and the words a role is called on screen. Reads nothing and imports nothing. |
| `api/_lib/pages.js` | Both content trees read off disk, the front matter, every refusal, the gated assets, and the gate applied to all of it. |
| `api/_lib/reader.js` | Four lines: the session, the access rule re-applied, the tier. Every route that decides what to show starts here. |
| `api/_lib/generated.js` | What [the build](#the-build-and-the-two-pipelines) left in `api/_generated/` for the functions: the per tier search indexes and the page dates. |

They are named in `gen-docs-lib.js` under `OWN`, which is what keeps the rest of
the directory trustworthy: a file there is either generated or declared.

### The three routes

```text
GET /api/nav                              the sidebar, filtered to whoever is asking
GET /api/content?path=/portal/applying    one page's markdown, if they may read it
GET /api/content?path=/staff/a/shot.png   an image beside a gated page, same check
GET /api/search-index                     the gated search index, tier by tier
```

None is cached anywhere shared. Every answer depends on a session cookie, and
this is where getting that wrong hands one reader another reader's page.

**The page is named in a parameter and not in the path, and that was learned the
hard way.** The content route was `api/content/[...page].js` from part 3 until
part 5 was checked against the deployment, where **every request to it answered
404**: Vercel's file based dynamic routes are a framework's feature, and in a
bare `api/` project a `[...catchall]` binds nothing into `req.query` and does not
match more than one segment at all. One segment reached the handler with an empty
parameter; two never reached it. Locally it looked perfect, because the stand in
server it had been proved against read the segments itself.

That is phase 3's rule for the fourth time — **a route answering locally is not
evidence that the platform routes it** — and the fix is the shape the portal has
always used: a plain function, addressed explicitly. **There is no file based
dynamic route anywhere in this repository now**, and
[`tests/phase13-test.mjs`](../tests/phase13-test.mjs) refuses the path shape in
its own stand in server, so the same defect cannot hide behind a harness that is
more capable than the platform.

**A missing search index is loud and a missing date is quiet**, and the two come
out of the same build. Serving an empty index would tell a reader their words
appear nowhere in the staff guides, which is a sentence this site would be making
up, so the route fails and names the command that was not run. A page git could
not date carries no date at all, and never today's.

**Nothing a caller sends ever reaches the filesystem.** The path segments are
turned into a page path, the path is looked up in the map the loader built, and
the file that gets read is the one that map recorded. `../` in a segment is a
lookup miss like any other.

### What fails to load, and why

The page list is derived from the filesystem and never written down anywhere, so
adding a page is adding a file. What a written value decides is order, and
nothing else. In exchange, the loader refuses to start on any of these, naming
every one it found instead of stopping at the first:

- a page with no front matter block, no `title`, or no `access` key
- an `access` value that is not one of the four, including a misspelling
- **a gated page in `content/`**, which is the leak: anything in the static root
  is world readable whatever the interface does
- **a public page in `api/_content/`**, which is a page nobody can find
- a page sitting outside every section, which nothing would ever link to
- a section directory with no `index.md` for its sidebar heading to point at
- two files claiming one path, or a page nested more than a section deep
- **a picture in `content/`**, which belongs in `public/` and is linked
  absolutely, and an image in the gated tree that is not beside a page or is not
  one of the types this site serves

One kind of file sits in the gated tree and is none of the above: a `.json` data
file a page embeds, such as the developer guide's `test-scripts.json`. It is
known to the loader so that committing one does not stop the site, and it is
given no address, because the only supported way to that content is the page
explaining what it does.

## The shell

One document, `shell.html`, and it is the layout for both pipelines. 16e:
"a reader must not be able to tell which pipeline a page came from."

At runtime every address that is not a static file and not an API route rewrites
to it. It reads its own path, asks `/api/content` for that page, renders the
markdown and fills itself in. At build time the same file is read again: the
page's HTML goes into the article, which is marked `data-prerendered`, and the
result is written out for each public page. Vercel matches the filesystem before
it consults rewrites, so those files win over the rewrite by themselves and
nothing had to change when they arrived.

**Everything around the article is drawn by the shell either way.** The build
writes the page's own data into the document and `shell.js` draws the
breadcrumbs, the pager and the date from it with the same functions a gated page
goes through, because the alternative is two things drawing this site's chrome
and one of them eventually being a version behind.

**A static page carries the public reading order, for everybody.** It is one
file served to every reader, so the previous and next links on a public page
never point into the staff guides even for somebody signed in — 16e's rule that
they never point at a page the reader cannot open, kept by the only means a
static file has. The sidebar is the other half and is drawn from the reader's own
session on every page, so the staff half is one click away and is never a link
that turns out to be a 404.

**There is no second copy of the markup anywhere**, and that is the point of
serving it this way.

### What draws it

| File | What it is |
|---|---|
| `shell.html` | The document. The header, the three columns, and the mount points. |
| `assets/css/docs.css` | The layout and every component. This site's own. |
| `assets/js/shell.js` | The behaviour: sidebar, contents, account control, mode, tabs, copy buttons. |
| `assets/js/markdown.js` | The renderer, called by the browser and by part 5's build script. |
| `assets/css/theme.css` | The tokens. **Generated** from the portal's, so the AA work is not repeated. |
| `assets/js/theme.js` | The two axis switcher. **Generated.** |
| `assets/js/i18n.js` | The dictionary machinery. **Generated**, less the portal's locale write. |
| `assets/i18n/en.json` | The chrome's strings. English only until phase 14, per decision 5. |

**A reader's theme does not follow them here from the portal.** The two sites use
the same `localStorage` key names and storage is scoped per origin, so this site
reads its own values and starts everybody at classic light. That is a
consequence of being a second host and not a bug to hunt. The colour axis has no
switcher here either, because 16d's header list does not carry one: both
attributes are still set on `<html>` and every colour block still selects on
both, so the second palette is a control away if it is ever wanted.

**Nothing in the shell decides what a reader may see.** The sidebar is whatever
`/api/nav` returned, and that endpoint filtered it against the session on the
server. There is no tier in any of these files and no comparison against one: a
gate that runs in the browser is not a gate, and one that runs in both places is
a gate that can disagree with itself.

### The layout, by width

| Width | What is on screen |
|---|---|
| 1024px and up | Sidebar, content, and the on-page contents down the right. |
| 640 to 1024px | Sidebar and content. The contents become a collapsible block above the page. |
| Below 640px | Content, with the sidebar behind the hamburger as a panel. |

**Search and the account control keep their place in the header at every width**
and never go inside the hamburger. 16d gives the reason for each: search is how
people navigate documentation on a phone, and a reader who cannot find how to
sign out assumes they have not.

**What does come out of the header below 640px**, and why: the site name, the
portal link, and the role beside the account name. Measured at 375px, the header
row wanted 494px and the fixed width controls were 256px of it, so the search
field had nothing left to be. The page title and the first entry in the panel
both carry the site name; the portal link moves into the panel, where it is a
link like any other. Everything else in 16d's header list stays.

### Writing a page

The markdown is a deliberately small subset. It renders what a guide needs and
nothing else, and anything unsupported renders as the characters that were
typed:

| Mark | What it makes |
|---|---|
| `#` to `####` | Headings. Each gets an id from its own words and an anchor link. |
| blank line | A new paragraph. **Wrapped lines are joined**; two trailing spaces force a break. |
| `-` `*` `+`, `1.` | Lists. A wrapped item's second line belongs to the item above it. |
| `` ```lang `` | A code block, with the language shown and a copy button. |
| `> [!NOTE]` | A callout. `NOTE`, `TIP`, `WARNING`, `DANGER`, and it carries a word as well as a tint. |
| `\| a \| b \|` | A table, with the second row as the alignment rule. It scrolls in its own box. |
| `:::details X` | A collapsible block, closed by `:::`. |
| `:::tabs` / `::tab X` | Tabbed blocks, for anything that differs between a desktop and a phone. |
| `![alt](src "caption")` | An image. Alone in a block it becomes a figure with the caption under it; inside a sentence it stays an image. See [Images](#images). |
| `![alt](pending:name)` | 16g's placeholder slot, until the capture run happens. |

**Everything is escaped before any pattern runs.** A page containing a literal
`<script>` renders as those characters. That holds even though every page in
both trees is written by us: "behind a login" was never the same thing as "safe
to paste anything into".

**Renaming a heading breaks every link to it**, including a bookmark, because
the id comes from the words. That is the trade every documentation site makes,
and it is why a heading is worth getting right once.

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

**Nothing generated is edited here.** Every generated file opens with a banner
naming the portal file it came from; an edit made here is undone by the next run
of the generator, which is a great deal louder than an edit that survives in one
copy only. The change goes in `main-site/`, and the generator carries it across.

Four directories are the generator's, and a file in one of them is either
generated or named in its `OWN` list: `api/_lib/`, `api/auth/staff/`,
`assets/js/` and `assets/css/`, plus `assets/fonts/`, which is one woff2 copied
byte for byte. The six files that are this site's own are the gate and the
shell, and each opens by saying so.

The two sites do differ, in five places, and each one is a rule in
`gen-docs-lib.js` with its reason written beside it:

| What differs | Why |
|---|---|
| `gftv_docs_session` and `gftv_docs_device` | 5h. Its own cookies, host scoped, so signing out of one site does not sign you out of the other and trusting a device here does not trust it on the portal. |
| `gftvjobs_docs_sessions` | 5h and migration `038`. The same shape as the portal's table, which is what lets one file read either. |
| The relying party pair | 5e. The id comes from `SITE_URL`, which on this site is **the portal**, and the expected origin comes from `DOCS_URL`. That pair is what makes one passkey work on both sites, and it is the one thing here that is not a copy. |
| The variable list | Four rather than six. Nothing here answers a Google Apps Script, runs a cron, or talks to Telegram. |
| The site constant | `api/_lib/site.js`, one line, read by everything that has to record which application acted: `site: "docs"` in every audit row per 5f and 5g, and `registered_on` on every passkey registered here per 5f and migration `039`. |
| The locale write | `assets/js/i18n.js` keeps the language in this browser and nowhere else. The portal mirrors it onto `gftvjobs_users` so the bot can start a conversation in the right language; this site has one realm, its accounts are `gftvhello_users` rows section 2 forbids writing to, and nothing here ever speaks first. |

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
own, under `OWN`. There are four, and they are
[the gate and what the build leaves for it](#the-four-files-that-are-this-sites-own).

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
cd docs-site
node scripts/build.js                            # first, and after any page edit
vercel dev --listen 3001
```

**The build comes first.** `dist/` and `api/_generated/` are not committed, so
without it there are no static pages to serve and `/api/search-index` fails with
a message saying which command was not run.

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

## The build, and the two pipelines

```sh
node scripts/build.js     # from docs-site/, and before any local preview
```

It is this project's Vercel Build Command, named in `vercel.json` so the project
settings have nothing to remember, and it is **the only build step in this
repository**. 16e states the exception and gives the reason: hand maintaining a
shared sidebar and header across thirty files is how documentation rots. Node
built-ins only, no dependencies, and the portal keeps no build command at all.

**Two pipelines, because a gated page cannot be a file on the CDN.** A public
page is rendered into a static file at deploy time; a gated page is returned by
an authenticated function and rendered in the browser. Both go through
`shell.html` and `markdown.js`, so a reader cannot tell which one a page came
from, and neither can a maintainer without looking at the address.

| Written in | Served as | Rendered by |
|---|---|---|
| `content/` | a static file in `dist/` | the build, at deploy time |
| `api/_content/` | JSON from `api/content?path=…` | the browser, from the same module |

**What the build writes, and the one thing that matters about where:**

| Path | What it is |
|---|---|
| `dist/` | **Everything this project serves, and nothing else.** It is the Output Directory, so a file that was not copied in here has no address. That is what keeps `content/*.md` from being fetchable as raw markdown beside the pages built from it. |
| `dist/<page>.html` | One file per public page: the shell with its article already in it and the page's own title, description and data. |
| `dist/assets/`, `dist/shell.html` | Copied as they are. The shell is still what every gated address rewrites to. |
| `dist/screenshots/` | `public/` copied in, so a shot at `public/screenshots/x.webp` is `/screenshots/x.webp`. |
| `dist/search-index.json` | The public search index. |
| `api/_generated/` | **Not public.** Written for the functions to read and carried to them by the `includeFiles` entry: one search index per gated tier, and every page's last updated date. |

Neither `dist/` nor `api/_generated/` is committed. Both are rebuilt by the
command above, and a local preview needs it run first.

**The build refuses rather than coping**, naming every problem it found:

- a page with no `access` key, which is 16e's own instruction: a page whose tier
  was forgotten must not default to public, and defaulting to gated instead just
  means a page nobody notices is missing
- a gated page pointing at an image outside itself, which is the leak with extra
  steps
- an image with no file behind it, in either tree
- anything [the page loader refuses](#what-fails-to-load-and-why)
- a `shell.html` that has lost a marker the build fills in

## Search

Client side, over an index the build generates, with no third party service on
either half.

- **The public index is a static file** and the browser has it before anybody
  types. **The gated index is one file per tier**, served by
  `GET /api/search-index` to the tiers at or below the reader's own, and the two
  are never merged anywhere but in the reader's own tab. A signed out reader
  gets an empty list from that route, and a 200: telling them 401 would confirm
  the size of what they cannot see.
- A result names the page, the heading the match sits under, and the words
  around it, and it goes straight to that heading's anchor.
- **The two halves fail separately**, because they are different sentences. The
  public half failing is search being broken. The staff half failing is the
  staff guides being unsearchable this time, and a signed in reader is told that
  rather than left to conclude their guides hold nothing.
- Nothing is truncated when the index is built. If its size ever becomes the
  problem, that is a decision to take in the open and not a default to inherit.

## Images

**A gated page's images live beside it and stream through the same
authenticated route**, per 16e: a gated page with a public screenshot is a leak
with extra steps.

```text
api/_content/admin/overview.png  ->  /api/content?path=/staff/admin/overview.png
![The overview](overview.png "A caption.")
```

- A gated page writes a **bare file name**, resolved against the page it is on.
  An absolute path on one fails the build.
- A public page writes an **absolute path**, into `public/`. A bare name on one
  fails the build, because there is no directory for it to be in.
- **An asset is gated at its section's level.** There is nowhere in a `.png` for
  an `access` key, and a section is what a reader had to pass to be told the
  image exists. So an asset sits in a section directory, and one anywhere else
  fails the build.
- The file types served are `.webp`, `.png`, `.jpg`, `.jpeg` and `.gif`.
  **No SVG**: an SVG is a document that can carry script, served from this
  origin, and what a gated asset is for is a screenshot.
- `![alt](pending:name "caption")` renders 16g's placeholder slot with the alt
  text and caption the real shot will have, so a missing image reads as pending
  and not as broken.
- **A gated image answers `private, max-age=300`** while its page answers
  `no-store`. `private` is the half that matters: it never enters a shared cache,
  which is the leak the gate exists to prevent arriving one hop later. The five
  minutes is the reader's own browser, so a page carrying a dozen screenshots
  does not refetch every one on every view. What that costs, plainly: somebody
  whose access is revoked can still see an image their own browser already
  fetched, for up to five minutes, on a page that no longer loads for them.

## What the design follows

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

A page is a markdown file in a section directory, and adding one is adding the
file. Which tree it goes in is decided by its `access` key and nothing else:
`public` in `content/`, anything else in `api/_content/`, and putting one in the
wrong tree stops the site loading with a message saying so.

```text
content/portal/applying.md            ->  /portal/applying
content/portal/index.md               ->  /portal          (the section itself)
api/_content/admin/settings.md        ->  /staff/admin/settings
```

Front matter carries four keys:

```text
---
title: Applying to a role          required. The sidebar entry and the tab.
access: public                     required. public, poster, admin, developer.
order: 3                           optional. See below.
summary: What happens when you     optional. One line, for listings and search.
---
```

`order` means two things at two levels, which are the same question asked twice:
on a section's `index.md` it orders the sections, and on any other page it orders
that page within its section. A page with no `order` sorts last by path, so a new
file is never invisible for want of a number.

**Run the build after adding one**, or the new page has no static file and no
line in the search index. Nothing else is needed: the sidebar, the pager and the
breadcrumbs all come off the page list, and the last updated date comes from the
commit that adds it.

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
  directory is a build failure, not a review comment — and as of part 5 that is
  literally true in both directions: a picture in `content/` stops the build, and
  so does a gated page pointing at a public image. See [Images](#images).
- Public shots go in `public/screenshots/`, which the build copies to
  `/screenshots/` in the output, and a public page links one absolutely.

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

**The Build Command and the Output Directory are in `vercel.json`**, not in the
project settings: `node scripts/build.js` and `dist`. Keeping them in the file
means a fresh project needs nothing typed into a form to serve the right thing,
and that **only what the build wrote is public** — the two content trees are not
in the output at all.

**That `includeFiles` glob covers three directories.** Both trees, `content/` as
well as `api/_content/`, because `api/nav.js` reads the whole page list to build
a sidebar for a signed out reader too; and `api/_generated/`, which the build
writes and the functions read. A function that cannot find `content/` throws at
the first request and names this entry, which is the failure to expect if either
tree is ever moved. `vercel.json` is schema validated and cannot carry a comment,
so the reasoning lives in `api/_lib/pages.js` beside the code that depends on it.

**The build runs before the functions are packaged**, which is what carries
`api/_generated/` to them. That ordering is Vercel's and this build does not
control it: if a deploy ever answers `/api/search-index` with the missing file
message, this is the assumption that broke.

The project itself, its domain and its variables are part 7.

`robots.txt`, `sitemap.xml`, and `llms.txt` are generated from the page list
and cover public pages only. A gated page must never appear in any of the
three, and they are generated from the same `access` key that drives the gate
so a page cannot be hidden in one place and advertised in another.
