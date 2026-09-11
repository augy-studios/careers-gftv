---
title: The working memo
access: developer
order: 5
summary: The memo the build was run from, captured as a snapshot, one page per section.
---

# next-steps.md

Working memo for the Careers@GFTV build, rewritten at the start and end of every
phase. **It lives in `reference/` and is committed, as of 8 September 2026**; it
was gitignored for the first fourteen phases. The brief is
`reference/careers-gftv-spec.md`, and this file never overrides it.

Last written: **during phase 14, Documentation, on 11 September 2026**, in part
10g. Part 10e moved this file and the brief into `reference/`, and generated
the nine pages this snapshot is made of. It also rewrote the whole memo to pass
`check-copy.js`. Part 10f is four things a reader asked for on the same day, in
the bot and in the portal. **10e and 10f went out as one commit, `64b122c`**,
and 10g is the 华文 of the four memo pages that commit did not carry.

Parts 1, 2 and 2a are pushed as `14dc190` and `f095bad` and verified live.
**Parts 2b and 3 were committed together as `12ec9de`, not yet verified against
the deployment.** **Parts 4 and 4a pushed together as `7d82b02`, also not yet
verified against the deployment.** **Part 5, the job poster guide, is pushed as
`04261b4` and verified live.** The twenty pages were served to a job poster and
refused to a stranger. Deviation 130's two routes answered 403 to a real poster
session. **Part 5a, `8e197c4`, repaired `tests/phase7-test.mjs` after running
it.** Section 2 is the phase; its part list carries what each part landed.

**Part 7 is the developer guide, 17 pages, and it is pushed as `61d9ce5`, not
yet verified against the deployment.** Four decisions were put up and answered
before it, and four concerns after it, all eight as recommended. The largest of
the first four splits this part in two. The guide is 7. The generated
specification and memo pages are **7a**, which now has a gated section of its
own to write into. It also built the half phase 13 decision 6 left behind: a
`data:` key in a gated page's front matter. A committed JSON file reaches the
browser inside the page's own answer and never at an address of its own. That is
what puts all sixteen scripts in `tests/` behind a download button on one page.
**It found one thing it did not fix.** `main-site/README.md` still opens
"Current phase: 6 of 15", eight phases stale, and part 10 owns the READMEs.

**Part 8 is the capture machinery and the three discovery files, and it is
pushed as `a84170a`, not yet verified against the deployment.** Four decisions
were put up and three were answered as recommended. The fourth kept the
discovery files inside part 8 instead of splitting them off as 8a. **It
deliberately takes no pictures.** The manifest's 25 slots, the Playwright
script, its scoped `package.json`, the build's five refusals, `robots.txt`,
`sitemap.xml` and `llms.txt` all land here. The capture run itself needs a
seeded database and a staff session, which is decision 27's by-hand sitting.
**Deviation 132** is where that run departs from 16g. There is one database, so
"never against production" cannot be kept. What replaces it is a script that
refuses to start unless the board is showing a seeded posting.

**Part 9 is 华文 for all 82 pages.** It is pushed as `c0be461`, and it is verified
against the deployment as of 7 September 2026.
`/api/content?path=/portal/applying&locale=zh` answers with a 华文 title, summary
and body, and `/api/nav?locale=zh` answers with the section titles translated.
**So the deploy ran with the database and filled both tables.** That is the one
thing part 9 could not prove for itself. The sentence below about nothing having
been written is now history and not a state. The mirror and the view are live,
which is what part 10's `/docs` reads.

**A reader found a defect on the live site on 7 September 2026.** It is fixed
and pushed as `e86f53b`, "phase 14 part 9a", not yet verified against the
deployment. Open a section in the docs sidebar, change language, and the section
headings stop responding until the page is reloaded by hand. **It was going to
ride with part 10 and did not.** Committing the tree as it stood meant it landed
on its own. A commit landing alone cannot be named for a part that does not
exist yet. So it took the letter after the part it fell behind, and it is
written up under part 10 below. The short version: `drawSidebar` added its
delegated click handler every time it drew. The mount outlives the redraw, so
two handlers toggled the section twice per click. The same shape was found
beside it in `drawAccount`, on `document`, and fixed with it.

**Four decisions were settled on 7 September 2026, before part 10 was started,
and all four as recommended.** Part **7a comes before part 10**. Part 10
**splits into 10 and 10a**, the bot then the prose. **Item 30's list of the
writes that leave this build gets built** in the seam. Phase 11's **webhook
confirmation notice lands after 10a and before the flip**, in its own commit. So
the phase's remaining order is 7a, 10, 10a, the notice, then the flip. Both
halves of the site are in it, plus the plumbing that had never existed. That is
migration `042`'s two tables and the view over them, the build's database
connection, and one search index per language. The read path is in it, and the
notice on a page nobody has translated. **Four decisions were put up and one
went against the recommendation.** The part was offered as 9 and a 9a, and the
answer was all of it at once. **Migration `042` was applied by hand on 6
September 2026.**

**The view is the part worth reading the migration for.** It inner joins the
translations to the public mirror, so a gated page's 华文 joins to nothing and
cannot appear. The Telegram bot's `/docs` reads it with no tier logic of its
own. That **discharges the worry this file has carried since 3 September** about
the tier rule being implemented twice and the copies disagreeing. There is no
second copy.

**Two deviations, 133 and 134.** The first is where the 华文 is authored: files,
with the table as a copy the build writes. That is against 16e's letter and in
service of its purpose. The second is one nullable column. Vercel clones
shallowly, and a `not null` there would stop a correct deploy.

**Nothing has been written to the database yet.** There is no `.env.local` on
this machine, so every build has been `--no-database`. The tables are created
and empty, and the first deploy fills them. Until then a 华文 reader gets English
with the notice. That is the same thing the read path does when the database
cannot be reached.

**It found two stale things in the English and fixed both**, because part 9 is
what made them stale. The staff index still opened "These guides are in English
today". And **3a still said the staff half of the docs site stays English**,
which 16f overruled on 3 September and nobody went back for.

**It found that `/staff` has never been kept out of a search index.** No
`robots.txt` at all, no `X-Robots-Tag`, and every gated address answers 200 with
the shell. Not a leak, because that answer carries no content, and closed here
with both instruments.

**Four concerns were put up after it and all four answered as recommended.** The
one that changed the code gave the script a `--dry-run`. **It has now been
run**: one real 65 KB webp of the sign in page, captured into a temporary
directory on 5 September 2026. That is the first time any of this has started a
browser. Two defects were found by reading it again before that: every mask
would have been magenta, and the suggestion layer would never have drawn. One
was found by running it: 1440 is a wide frame for the portal's centred pages,
and the obvious fix makes it worse.

**Part 6 is the admin guide, 14 pages, and it is pushed as `0aa1f92`, not yet
verified against the deployment.** Four decisions were put up and answered, and
the first of them is the fourteenth page. 16h's thirteen bullets do not include
the maintenance switches, which part 5 had just made admins only, so 8.12 was
documented nowhere. It found **deviation 131**, which is 130's last paragraph
arriving from the other end. Four strings promise a helper that only an admin
can publish their work, and any job poster can.

**Part 4 gives the docs site a service worker and makes it work offline.** It
arrived as a new part 4 that pushed everything below it down one. That is the
second time this phase has renumbered itself, and for the same reason part 1 did
it. Plumbing under 76 pages is cheaper before the pages than after them. Three
decisions were put up and answered. The gated guides are cached per reader, the
precache list is generated by the build, and the update bar is the portal's
module generated in. **It has run in a browser**, which is the one thing every
other check here cannot tell you. `--only=install` installs the worker in a real
Chromium and then pulls the network out.

**Part 5 is the job poster guide, 20 pages, and it is the first gated content
either tree has held.** Written from the 785 `admin.*` strings and the routes
behind them, in one sitting. It is 20 because 16h's nineteen bullets open with
signing in and a section needs a landing page. Four decisions were put up and
answered: the twentieth page, and the Apps Script procedure as a **checked**
copy of the dashboard's four steps. The other two are ten screenshot slots for
part 8, and what to do about what it found.

**What it found is deviation 130: a job poster could close the whole board.**
`/admin/settings` and `/admin/maintenance` were in the poster's sidebar, and
both routes were guarded with `requireStaff`. 10 item 2 names both as an
admin's. Six phases old. **Fixed in this part**, so part 5 touches `main-site/`
the way part 2 did. `tests/phase7-test.mjs` had been asserting the defect in as
many words.

**Part 4a renames the portal in Mandarin: 国际兽视入队平台.** More honest than the
English name, because "Careers" implies a salary and 入队 says join the team. It
moved 93 strings, four documents and **specification 3a**, without which the
rename would not have been real. **Migration `041` was applied on 4 September
2026**, which is the half no dictionary could reach: the home page's title is a
database row.

**Part 2 is the portal guide, thirteen pages, and it is the first real content
either tree has held.** It was written from `en.json` and the routes and not
from the specification, which is the whole reason 16 puts this phase second to
last. It also found one thing: section 5 item 31, a home page still promising
offline support that shipped a week ago.

**Then a plain language pass was asked for, over both sites, and it is part
2a.** Simple, concise English and Singapore Mandarin, for a reader with no
technical knowledge who wants to find a role and apply for it. It is written up
under part 2a below. The rule it produced is now **specification 3b** and three
checks inside `check-copy.js`. A rule about writing that nobody can run is a
rule with a lifespan.

**Part 2b is a defect somebody spotted in a link preview: the docs site had no
icons and no card at all.** No `favicon.ico`, no `apple-touch-icon`, no `og:` or
`twitter:` tags, and no image files of its own. So a tab showed the browser's
blank icon, and a shared link previewed as a title with nothing beside it. Two
Vercel projects means the portal's `/HLC-main.png` resolves to nothing here.
Part 2b is written up below and cost one new field in `gen-docs-lib.js`.

**Part 3 is the bot guide and the translations guide, sixteen pages, both
public.** That takes the public tier to 30 pages and finishes it. The command
reference is now a checked copy. `commands.py --check` reads it as a third
document. The list in a guide on another site cannot drift from the list the bot
registers with Telegram.

**Phase 13 shipped on 3 September 2026 and thirteen of fifteen phases are
live.** `build-status.json` reads `shipped` with a note in both languages, and
phase 14 reads `building`. The root README says thirteen of fifteen, and `sw.js`
is at **`v126`**. Section 1 has the condensed account; section 2 is phase 14.

**It shipped in the order this file calls the honest one: walk, lift, then
flip.** Section 5 item 24's sitting happened first, `HELLO_WRITES_ENABLED` went
`true` after it, and the phase flipped after that. Both deployments were
confirmed carrying the lift before anything was written down. Check 166 is what
kept the pair honest, and it earned its place. **The portal was still building
the first time it was asked**, and answered `held` while the docs site answered
normally.

**The walk found four things and every one of them was invisible to this
repository's checks.** `SITE_URL` had never been set on the docs Vercel project.
So `/api/auth/staff/account` and `/api/auth/staff/passkeys` had answered **500
to every staff account since part 6**. `--only=live`'s 27 checks passed
throughout, because all of them ask as a stranger. The gftv.asia profile link
pointed at `/account` on a one page app whose catch all **answers 200**. "Sign
out everywhere" left the current browser signed in and never reached gftv.asia
at all. And **a fourth write reaches gftv.asia that the hold never covered**,
regenerating the backup code set. It was stated in four places in the code and
counted in none. Items 24, 29 and 30, deviations 126 and 127.

**Three of those became commits after the seam**, all pushed 3 September 2026.
**`5270412`** is the link and checks 167 and 167a, **`c2612c5`** is the lift,
and **`643c7dd`** is the sign out fix. **`ea253ce`**, the flip itself, is
between the last two. **Parts 7a, 7b, 7d and 7e, with no 7c** — the numbering
skipped one when the commits were rebuilt by hand.

**The flip landed before the sign out fix**, which is only worth knowing because
the order reads oddly in the log. `ea253ce` set the phase to `shipped` and
`643c7dd` corrected the danger zone after it. Nothing was wrong on the
deployment in between. Check 166 guards the phase against the *hold*, and the
hold had been lifted two commits earlier.

**What is not fixed and is written down instead**: `checkEnv()` exists on both
sites and nothing calls it. That is the whole reason a perfect error message sat
in a log for a fortnight. Item 29.

**Two long standing items closed.** Item 26: `gftvhello_users.display_name` and
`.email` both read back, so two assumptions from section 5a are facts and the
defensive fallback was never taken. Item 24: the staff sign in has now run
somewhere other than a laptop.

**What phase 13 does not owe.** Nothing. Its own before-it-is-done list is
discharged and its checks are 677 passing, twenty seven of them against the
deployment.

**What the build still owes is phase 12's, unchanged since 31 August.** Part 4's
Chinese round trip is with its reviewer. One by-hand sitting covers phase 10's
device checks, phase 11's 29 step checklist, part 2's interactive admin surfaces
and decision 13's switched-off admin page. **That sitting opens with `node
seed.mjs --yes --anyway` and closes with `--clear --yes`**, decision 27. `node
gen-screenshots.js` is still owed from the seed being cleared.

The account of phase 12 that used to open this file follows, because none of it
has changed.

**Phase 12, Polish, shipped in eight parts**: `3bcf34b` and `c32a4ab`,
`f6c8143`, `45a3451` and `a9478af`, `25028e7`, `a90776c`, `9c1fa73`. Then
`ce25419` with `787e21a`, `0c9f219` and `1850997` after it, and **`37eecd1`,
"phase 12 part 8"**, the seam. It reads `shipped` in `build-status.json` with a
note in both languages, and `sw.js` is at **`v111`**. Section 1 has the
condensed account of the phase; section 2 is phase 13.

**One commit lands after the phase and belongs to no part of it**: **`2c27a2b`,
"phase 12 part 8a"**. It moves the portal's staff sessions out of
`gftvhello_sessions` into a table this build owns. Migration `038` was applied
by hand in front of it. It is numbered as part 8a because that is where it fell,
and not because the seam asked for it. Deviation 122 is the whole account.
**Both sites were signed into afterwards to prove it**, which is the one thing
no file here could check for itself.

**One more change belongs to no part of phase 12 either.** An admin can edit an
applicant's username, email, display name, phone and language on
`/admin/applicants`, and see their Telegram id and handle read only. **8.9 does
not have that action.** Deviation 123 is the account of it. That includes why
changing an identifier signs the applicant out and a display name does not, and
why nobody is notified. **It shipped as `4d338a7`, "phase 12 part 8b"**.
`16792d4`, `5512c9c`, `5176fdd`, `4f5f8b9` and `ee7bfcd` came after it as parts
8c to 8g. Nothing is proved against a deployment yet. The checks that exist are
`node check-i18n.js`, `node gen-review.js` and the phase files, all clean, and
**the action itself has never run**.

**The site is open to search engines as of part 8**, after eleven phases closed
to them. `INDEXING` in `api/_lib/discovery.js` is `true`, the global
`X-Robots-Tag` is out of `vercel.json`, and the one on `/api/(.*)` stays. The
two halves are checked against each other in both directions, so a half state
cannot ship quietly. `--only=discovery-live` reads 9 passed, 0 failed, 0 skipped
against the deployment carrying it.

**The board is empty and that is the correct board**, as of 31 August 2026. The
dev seed was deleted after the flip, and `--only=discovery-live` reads 8 passed,
0 failed, 1 skipped against it. The sitemap is the five static pages and the
feed answers zero postings. The skip is the check that compares the two saying
so instead of passing on two empty lists. Decision 25 is the argument, and
section 5 item 6 is what it costs.

**What is still owed from that clearing is one command**: `node
gen-screenshots.js`. The two install screenshots in `manifest.json` are real
captures of `/search`, and they show the nine postings that have just gone.

**Twelve of fifteen phases were live when that was written**, and thirteen are
now. What phase 12 still owes is in section 5, and none of it is code. Part 4's
Chinese round trip is with its reviewer. One by-hand sitting covers phase 10's
device checks, phase 11's 29 step checklist, part 2's interactive admin surfaces
and decision 13's switched-off admin page. **That sitting opens with `node
seed.mjs --yes --anyway` and closes with `--clear --yes`**, decision 27, because
clearing the seed empties the surfaces it walks.

> [!WARNING]
> A snapshot, and not a live file. This copy was taken on 11 September 2026. The working
> copy is `reference/next-steps.md`, and it is rewritten several times a day
> while a phase runs. It moves on without these pages, so if the build is still
> running then the file is ahead of what you are reading.

> [!NOTE]
> These pages are generated from `reference/next-steps.md` by
> `node gen-memo-pages.js`. An edit made here is undone by the next run and is
> reported by `node gen-memo-pages.js --check`.

## The sections

| Section |
|---|
| [1. Done so far](/staff/memo/section-1) |
| [2. This phase. Phase 14, Documentation.](/staff/memo/section-2) |
| [3. Rules that are load bearing](/staff/memo/section-3) |
| [4. Deviations from the phase plan, and why](/staff/memo/section-4) |
| [5. Carried forward, still open](/staff/memo/section-5) |
| [6. Inherited by later phases](/staff/memo/section-6) |
| [7. Decisions settled, so they are not reopened](/staff/memo/section-7) |
| [8. Open items, none blocking](/staff/memo/section-8) |
