# docs-site

The documentation site for Careers@GFTV, served at
`docs.careers.globalfurry.tv`.

**Status: being built.** The site's foundations ship in phase 13 and its
content in phase 14, so that it documents what was actually built, not
what was planned. See
[the build status page](https://careers.globalfurry.tv/status).

**Everything phase 13 owes is here as of part 7**, and every page in both trees
is a placeholder until phase 14 writes it. The whole staff sign in, the gate,
the shell, both content pipelines, and
[the account settings suite](#account-settings-and-the-two-pages-with-no-article).
`api/_lib/` and the routes under `api/auth/staff/` are generated copies of the
portal's, per [the pair rule](#the-modules-shared-with-the-portal) below. They
cover signing in and out, reading the session, the second factor in all three of
its forms — a passkey, the authenticator code, a backup code — registering and
removing a passkey, and the trusted devices. Beside them,
[the gate](#the-gate) decides what a reader may open, [the shell](#the-shell)
draws it, and [the build](#the-build-and-the-two-pipelines) turns the public tree
into static HTML with a search index beside it.

**The whole site is bilingual**, staff half included. Section 16f said the staff
half would be English only and phase 13 part 6a overruled it on 3 September
2026: a job poster is staff, the poster guide has the widest staff audience of
anything here, and it is the audience least likely to read English by
preference. The cost is accepted instead of argued away — a guide that changes
with a phase is re-translated with that phase, and the phase is not done until
it is. The chrome's dictionary is [`assets/i18n/`](assets/i18n/); the guides'
own translations are served from `gftvjobs_docs_translations` and authored as
files under [`translations/`](translations/), which phase 14 part 9 landed for
all 82 pages. [Translating a page](#translating-a-page) is the whole of how.

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
instead of telling them to go and find the repository. **The page that does it
is `api/_content/developer/the-test-scripts.md`**, as of phase 14 part 7. The
generator behind it does not depend on how the site is built:

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
reviewable diff. Regenerate it whenever a script in `tests/` moves:

```sh
node docs-site/scripts/embed-tests.mjs --out docs-site/api/_content/developer/test-scripts.json
node docs-site/scripts/embed-tests.mjs --check docs-site/api/_content/developer/test-scripts.json
```

**The download has no address of its own.** The content travels inside the page
and the download link is a `blob:` URL built in that tab: unique to the tab,
dead when the tab closes, and no path anybody can share that serves a script
directly. A raw path would be a second public surface for a file whose only
supported entry point is the page explaining what it writes to the live
database.

**How it travels is one front matter key.** A gated page names a data file
beside it with `data: test-scripts.json`, the content route reads that file and
sends it as a field of the page's own answer, and
[`assets/js/test-scripts.js`](assets/js/test-scripts.js) draws the table after
the heading it names. The loader refuses a path, a file that is not `.json`, a
missing file, and the key on a public page, each at load time and not at the
request that would have failed.

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

**The page names it with the `data` key**, and the loader refuses four things
there: a path in place of a bare file name, a file that is not `.json`, a name
with no file behind it, and the key on a public page. All four fail the build
and not the request.

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
| `assets/js/shell.js` | The behaviour: sidebar, contents, account control, tabs, copy buttons. |
| `assets/js/markdown.js` | The renderer, called by the browser and by part 5's build script. |
| `assets/css/theme.css` | The tokens. **Generated** from the portal's, so the AA work is not repeated. |
| `assets/js/theme.js` | The two axis switcher. **Generated.** |
| `assets/js/chrome-modals.js` | The header's theme and language modals. **Generated.** `gftv-theme.md` prescribes this control's markup, so there is one implementation of it. |
| `assets/js/dialog.js` | The modal shell the two are built on, a native `<dialog>`. **Generated.** |
| `assets/js/i18n.js` | The dictionary machinery. **Generated**, less the portal's locale write. |
| `assets/i18n/en.json`, `zh.json` | The chrome's strings, both languages. 254 keys, most of which are the portal's own. |

**A reader's theme does not follow them here from the portal, and neither does
their language.** The two sites use the same `localStorage` key names and
storage is scoped per origin, so this site reads its own values and starts
everybody at classic light in English. That is a consequence of being a second
host and not a bug to hunt: the only thing that would cross is a cookie on
`.globalfurry.tv`, which 5h forbids outright because the parent domain carries
other GFTV apps. Somebody who chose 华文 on the portal picks it again here,
once.

**Both axes have a control here as of phase 14 part 1**, which overrules 16d's
"the light and dark toggle" — the third edit this build has made to the
specification. The argument is that nothing about it was unproven: the `hello`
palette has been generated into this site since phase 13 part 4 and
`tests/phase13-test.mjs --only=contrast` had already walked every component in
all four combinations, so it was a palette paid for and unreachable. What
changed is the header, and not what it selects.

The two controls are the portal's own modals, generated in. `gftv-theme.md` does
not only settle colour: its section 3 is markup, prescribing the modal, its two
sections and the `.icon-btn` that opens it, and its acceptance checklist asks
about the theme button's icon. This site had that file applied as a token
contract and not as the chrome it also specifies — `theme.css` was shipping
`.icon-btn`, `.mode-toggle`, `.swatch` and `.locale-btn` to a header that had
never built any of them. `tests/phase14-test.mjs --only=chrome,browser` is what
says so now.

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
node scripts/build.js                  # from docs-site/, and before any local preview
node scripts/build.js --no-database    # the files alone, on a clone with no service key
```

It is this project's Vercel Build Command, named in `vercel.json` so the project
settings have nothing to remember, and it is **the only build step in this
repository**. 16e states the exception and gives the reason: hand maintaining a
shared sidebar and header across thirty files is how documentation rots. Node
built-ins only, no dependencies, and the portal keeps no build command at all.

**It needs the database, since phase 14 part 9.** The build is the one thing
that writes the guide translations into Supabase: it upserts every file under
`translations/` into `gftvjobs_docs_translations`, mirrors the English of the
public pages into `gftvjobs_docs_pages` for the Telegram bot, and deletes the
rows that no longer have a file. 16e is explicit about what happens without it:
"a build that cannot reach Supabase must fail loudly rather than quietly emit an
English-only site. A site missing every translation is the failure that looks
like success."

So with no `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` it stops, naming both. The
`--no-database` flag is the only way past, it prints a banner saying what the
output is missing, and **it is refused on Vercel**, because a deployment is
exactly where nobody would see that banner. `tests/phase13-test.mjs` passes it,
which is what keeps that suite needing no credential.

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
| `dist/search-index.json` | The public search index, English. |
| `dist/search-index.<locale>.json` | The same index in every other language, one file each. A page nobody has translated is in it in English, so a reader searching a word that is on the screen finds it. |
| `api/_generated/` | **Not public.** Written for the functions to read and carried to them by the `includeFiles` entry: one search index per gated tier per language, and every page's last updated date. |
| Supabase | **The only thing it writes that is not a file.** `gftvjobs_docs_translations` is made to match `translations/`, deletions included, and `gftvjobs_docs_pages` carries the English of the public pages for the Telegram bot. Migration `042` and `scripts/translations.js` carry the reasoning. |

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

## Account settings, and the two pages with no article

Built in phase 13 part 6. Staff account settings live here at `/account`, with
the same suite the portal mounts at `/admin/security`: profile read only,
password, passkeys, authenticator app, backup codes, account recovery codes,
trusted devices, sessions, and a danger zone.

**One implementation, mounted twice, and the implementation is a module and not
a page.** 5f asks for "the same markup, the same copy, and the same endpoint
shapes", and 16d wants this page GitBook shaped where the portal's is a
dashboard, so the markup cannot be one file copied into two shells. Each site
provides an empty container and `assets/js/staff-account.js` builds every panel
into it. There is no second markup here to fall out of step.

**What the two sites differ by is a stylesheet.** That module writes the
portal's class names; `assets/css/docs.css` defines the same names in this
site's own language, at the foot of the file. That is the whole adapter.
`tests/phase13-test.mjs --only=account` fails on a class the module writes that
neither stylesheet here defines, which is the failure that would otherwise ship
as a panel rendering unstyled on one site and nowhere saying so.

Three data attributes on the container are what a stylesheet cannot say: where
a signed out reader goes, where back goes, and the gftv.asia account page 5f
links to for the fields this project may not edit.

**`/login` and `/forgot-password` are the same arrangement**, per 16d: "the two
pages with no article to hold, sign in and account settings, render inside the
same shell all the same, with the content column carrying a form where the prose
would be." `shell.js` holds the three in `FORM_PAGES` and imports the module for
whichever address was asked for. The reset flow is the portal's module, from
5g; the sign in form is this site's own, because the portal's staff login is
marked up inside its own page and predates all of this.

### Two things this page says that a reader would otherwise get wrong

**Trusted devices are the account's, not this site's.** `gftvhello_trusted_devices`
has no site column and section 2 forbids adding one, so the list includes rows
the portal created and a revoke here revokes there. Trust itself is still earned
per site, because the device cookie is host scoped. The panel says both halves,
in that order; deviation 125 in `next-steps.md` is the full account.

**Sessions are the opposite, and the panel says so instead.** 5h gives each site
its own table, so signing out here leaves the portal signed in. What a session
row cannot say is which device it is on: migration `038` gave it an id, an
account, a token and two dates and nothing else, so the panel names the site and
the dates and states plainly that it cannot name a device.

### What reaches gftv.asia, and where it says so

A staff account is one account, and three things here change it at gftv.asia
too. Each is said on the panel that offers it, before the button:

| Change | Why it reaches |
|---|---|
| The password | `gftvhello_users.password_hash`, section 2's first named exception, per 5g. |
| The authenticator app | `gftvhello_users.totp_secret`, its second, settled as phase 13 decision 7. |
| The two step backup codes | `gftvhello_backup_codes` is gftv.asia's table, and one of the four things section 2 already permits the login flow to write. |

**`api/_lib/staff-account.js` is the only file in either project that writes
`gftvhello_users`**, which is what makes a third exception a diff somebody
reviews instead of a line somebody adds. The `account` test section fails if a
second file ever does, or if that one writes a third column.

Nothing notifies anybody, because this project has no email, so every one of
these writes an audit row before it executes and that row is the only trace.

**All three are switched off on the commit that introduced them**, behind
`HELLO_WRITES_ENABLED` in `api/_lib/staff-account.js`, until each has been run
once against a real account. The panels draw a sentence where their button
would be, and the danger zone shows five actions instead of six. Everything else
here is live from the first deploy. The portal's README carries the argument for
why that is a constant and not a maintenance switch.

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
data: test-scripts.json            optional, gated pages only. See below.
---
```

`data` names a JSON file sitting beside the page, which the content route sends
inside that page's own answer and never at an address of its own. One page uses
it, and [the section above](#the-test-scripts-in-the-developer-guide) is the
whole of why.

`order` means two things at two levels, which are the same question asked twice:
on a section's `index.md` it orders the sections, and on any other page it orders
that page within its section. A page with no `order` sorts last by path, so a new
file is never invisible for want of a number.

**Run the build after adding one**, or the new page has no static file and no
line in the search index. Nothing else is needed: the sidebar, the pager and the
breadcrumbs all come off the page list, and the last updated date comes from the
commit that adds it.

> **Editing an English page? Check its translations in the same change.**
> Every page has a 华文 file under [`translations/`](translations/), and editing
> the English does not touch it. A page whose English moved and whose Chinese
> did not is a page telling two readers different things, and nothing on the
> site will say so: the translation is still marked ready and is still served.
> [Translating a page](#translating-a-page) says where the file is, and
> `node gen-review.js` puts the two side by side.

## Translating a page

**The English is the file and every other language is a file too**, under
`translations/<locale>/`, named for the page's own address. Phase 14 part 9
translated all eighty two.

```text
translations/zh/index.md                   ->  /
translations/zh/portal/applying.md         ->  /portal/applying
translations/zh/staff/index.md             ->  /staff
translations/zh/staff/admin/settings.md    ->  /staff/admin/settings
```

**One tree for both pipelines**, because a translation is keyed by the address
and the address space is one. `content/` and `api/_content/` are split by who
may fetch a file, which is a question no file in here answers.

Front matter carries two keys and refuses three:

```text
---
title: 申请职位                     required. The sidebar entry and the tab.
summary: 按下申请后会发生什么       optional, and the same line as the English page's.
ready: false                        optional. Holds the page back; the default is ready.
---
```

**No `access`, no `order` and no `data`.** All three belong to the English page:
16e is explicit that who may read a page is decided by exactly one thing, and
the reading order and the file a page embeds are the same in every language. A
translation carrying any of them stops the build.

**The pictures are the same pictures.** A translated page carries the same image
sources as the page it translates, with the alt text and caption translated. The
build compares the two lists and stops when they differ, and `capture.mjs` swaps
a `pending:` marker in all three trees at once so they cannot fall out of step.

**The database is what serves them.** The build upserts this tree into
`gftvjobs_docs_translations` and the site reads that table per request, so a
translation goes live on the deploy that carries it. The cost, said plainly:
changing one word means a commit and a deploy, and a volunteer with no access to
this repository cannot fix anything themselves. `scripts/translations.js` opens
with the whole argument.

**A page with no translation is not a problem.** It is shown in English with a
notice saying so, per 3a, and it is in that language's search index in English
so a reader can still find it.

```sh
node gen-review.js     # from the repository root
```

That writes `zh-review.html`, which puts every guide page beside its English
paragraph by paragraph, for a fluent reader to go through. It reports any page
whose two halves no longer line up paragraph for paragraph.

## Screenshots

Captured with Playwright, never by hand. **Built in phase 14 part 8**, in four
files under `scripts/`:

| File | What it is |
|---|---|
| `screenshots.manifest.js` | every shot, as data. 25 of them. |
| `capture.mjs` | the run. Signs in, drives each page, writes the webp. |
| `playwright.config.js` | the settings that make two runs produce the same bytes. |
| `package.json` | `playwright` and `sharp`, scoped to this directory. |

**That last file is what keeps a browser out of both deployments.** Vercel
installs `docs-site/package.json` and never walks into a subdirectory, so
nothing here reaches a build. It carries `"type": "module"` because it has to:
Node reads a module's type from the nearest `package.json`, and `build.js` is a
`.js` file in the same directory. Without that key the Vercel build stops on its
first import.

### How to run a capture

Three commands, and the first and last are not optional.

```sh
SEED_PASSWORD='…' node seed.mjs --yes --anyway   # from the repo root
cd docs-site/scripts && npm install              # once per clone. 38 MB.
BASE=https://careers.globalfurry.tv SEED_PASSWORD='…' node capture.mjs --headed
cd ../.. && node seed.mjs --clear --yes          # take the sample data back out
```

`npm install` here is `playwright` and `sharp` and comes to 38 MB, not the
several hundred a browser would be: Playwright keeps its browsers in a shared
directory outside any project, and `npx playwright install chromium` from the
repository root has already put one there for `tests/`.

### The dry run

**Use it before the real one.** It takes the same path, encodes the same way and
uses the same names, into a directory outside the repository, and swaps no
markers:

```sh
BASE=… node capture.mjs --dry-run --only=portal-login-desktop-light
BASE=… node capture.mjs --dry-run --out=./somewhere   # instead of a temp directory
```

`--dry-run` implies `--no-swap`, so a page can never come to point at a file
that is not in the tree.

- **`BASE` has no default.** `gen-screenshots.js` defaults to the live portal
  because an install shot is of the public board; this script signs in and opens
  lists of applicants, so where it points is a decision somebody types.
- **`STAFF_USER` and `STAFF_PASS`** are read from `.env.test` at the repo root,
  which is gitignored, or from the shell. They are a real gftv.asia account:
  staff accounts are that realm's and cannot be seeded, per 5g.
- **`--headed` is what you want the first time.** A staff account with a second
  factor cannot be driven from a script and should not be; the run stops, says
  so, and carries on when the dashboard appears in the window.
- **The run refuses to start unless the board shows a seeded posting.** Every
  posting `seed.mjs` writes says `SAMPLE POSTING`, and that is what is looked
  for. Capturing without it photographs real applicants into a guide.
- It ends by **swapping the `pending:` markers** in every page whose shot it
  took. `--no-swap` leaves them alone.

### How to re-run one shot

```sh
node capture.mjs --list                              # names, tiers, accounts, paths
BASE=… node capture.mjs --only=poster-analytics-desktop-light
```

`--list` works in a clone where `npm install` has never run here: the two heavy
imports are loaded after the arguments are read, on purpose.

### How to add a shot

Both halves or neither — `node scripts/build.js` fails on either one alone.

1. Write the slot into the page: `![alt](pending:name "caption")`.
2. Add the entry to `screenshots.manifest.js`, with the same name.
3. Run the capture with `--only=name`.

**The name is not decoration.** It is `subject-viewport-mode`, and the subject's
prefix decides the tier and the directory: `portal-` is public and lands in
`public/screenshots/`, `poster-` and `admin-` are gated and land in
`api/_content/<section>/`. The build checks the prefix against the entry's
`tier`, the entry's `sections` against the page's section, and the file on disk
against the directory it belongs in.

### What the build refuses

- A slot naming a shot that is not in the manifest.
- A manifest entry that no page points at. A shot nobody points at is a file
  nobody reviews.
- A gated shot written on a public page, or the reverse.
- A gated shot sitting in `public/screenshots/`.
- A `.webp` beside a gated page that no manifest entry claims.

**The rule is scoped to `.webp` on purpose.** That is the one extension the
capture script writes, so "every screenshot is in the manifest" is checkable
without it also meaning "this site may only ever carry screenshots". The four
other types [Images](#images) allows are left alone, and the gated image fixture
in `tests/phase13-test.mjs` is a `.png` for exactly that reason.

Rules that will not change:

- It runs on demand, never as part of the Vercel build. **It runs against
  production with the seed in it**, which is where this departs from 16g's
  "never against production": there is one database, so a local or staging
  instance is not available to be run against. The seed check above is what
  makes that safe, and the two things no seed can cover — whoever ran the
  capture, and the staff access list — are masked in the manifest.
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

This site has one as of phase 14 part 4, in `sw.js`. **Bump its `VERSION` on
every change to this site**, the same rule the portal follows. Any edit under
`docs-site/` is a new build, and a worker that has not been bumped keeps
serving the previous one to returning readers. Treat it as part of the change,
not a separate step.

**You do not maintain the precache list.** `scripts/build.js` writes it into
`dist/sw.js` from the pages it has just built, replacing the `BUILD:PRECACHE`
marker, so adding a guide is nothing to remember here. `node check-precache.js`
checks both halves: the portal's hand written list against `main-site/`, and
this generated one against `dist/`. The docs half skips with a sentence when
`dist/` is not there, so run the build first.

**What is cached, and what is deliberately not.**

- **Network first for anything a reader reads**: guides, the search index, and
  every API answer. The cache answers only when the network does not, so a
  reader who is online is always reading what was deployed. A procedure served
  from a cache after the step changed is the failure this whole file is
  arranged to avoid.
- **Cache first for `/assets/*`, the fonts and the images**, which are build
  output and change only with a deploy. A `VERSION` bump is a new cache filled
  from the network, which is what makes that safe.
- **`/api/auth/*` is never cached in either direction.**

**The gated guides are cached, per reader, and that needs care.** The cache is
named for the tier it was filled at, so a reader whose access changes does not
inherit the previous one; `shell.js` posts the tier on every load and the worker
drops any gated cache that is not the current one. Signing out posts
`signed-out`, and the worker deletes all of them. **If you change either of
those two paths, you are changing what a shared machine keeps after somebody
signs out**, which is the reason this was a decision and not a default.

There is no `/offline` page. The shell is the fallback for an address that was
never cached: it draws the chrome and says the page is not available, so a
reader cannot tell which pipeline a missing page came from.

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

**The project, the domain and the four variables have existed since before part
3**, which nobody knew until part 5 asked the deployment a question. Every push
to `main` has been deploying this site the whole time, and for two parts every
request to the content route answered 404 while the local stand in looked
perfect. Phase 3's rule for the fourth time: **a route answering locally is not
evidence that the platform routes it**, and the answer is
[`tests/phase13-test.mjs --only=live`](../tests/phase13-test.mjs), which asks
the deployment everything a stranger can ask and takes no credential to run.
Run it after every docs deploy.

### Before a docs deploy

All six from the repository root but the second, which runs from here. **Only
the second needs anything**: it wants `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`,
as of part 9, and takes `--no-database` on a clone that has neither.

```sh
node gen-docs-lib.js --check       # a change that landed in one copy only
node docs-site/scripts/build.js    # and every refusal it makes
node check-i18n.js                 # both sites, both dictionaries
node check-copy.js                 # the house style, over nine sources
node tests/phase13-test.mjs        # 3,199 checks, 27 of them against the deployment
node tests/phase14-test.mjs        # 490 checks, this phase's parts one by one
```

**And `node docs-site/scripts/embed-tests.mjs --check
docs-site/api/_content/developer/test-scripts.json` from the repository root**,
which fails when a script in `tests/` has moved and the committed copy has not.
[The section above](#the-test-scripts-in-the-developer-guide) has the whole of
it.

### The discovery files

`robots.txt`, `sitemap.xml` and `llms.txt` are generated from the page list and
cover public pages only, from the same `access` key that drives the gate — so a
page cannot be hidden in one place and advertised in another. **Built in phase
14 part 8**, in `scripts/discovery.js`, and written into `dist/` by the build.

**Static files here, and functions on the portal.** `main-site` generates its
two from routes because its answer depends on a maintenance switch read from the
database and on the set of published postings. Neither is true here: a page is a
committed markdown file, so what is in the sitemap is decided at deploy time and
cannot change until the next one. A function would repeat on every request a
computation the build already did once.

That is also what makes them work at all. This project rewrites
`/((?!api/|assets/).*)` to the shell, and the rewrite would swallow
`/robots.txt` if Vercel did not match the filesystem first.

**`/staff` is kept out of an index with two instruments, not one.**

```text
Disallow: /staff            in robots.txt, from DISALLOW in scripts/discovery.js
X-Robots-Tag: noindex       on /staff and /staff/(.*), in vercel.json
```

A `Disallow` is a request not to crawl and is not an instruction not to list: a
URL somebody linked to from elsewhere can be listed on the strength of the link,
with no fetch and so no chance to read anything on the page. That matters here
because **every gated address answers 200** — the shell is served at all of
them and fills itself in from `api/content`, which is where the gate is.
`tests/phase14-test.mjs --only=discovery` compares the two halves and fails when
one moves without the other, in both directions. `vercel.json` cannot carry a
comment, so `scripts/discovery.js` is where that is written down.

Neither file belongs in `public/`. That directory is copied into `dist/` before
these are written, so a hand written copy would look maintained and be
overwritten on every build.
