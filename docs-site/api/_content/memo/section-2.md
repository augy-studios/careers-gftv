---
title: 2. This phase. Phase 14, Documentation.
access: developer
order: 2
summary: Thirty or so guides, in every language this build speaks, describing what was
---

# 2. This phase. Phase 14, Documentation.

**Thirty or so guides, in every language this build speaks, describing what was
actually built.** Phase 13 built the site and shipped it with five placeholder
pages; this phase writes the pages. It is the last phase with a subject of its
own — 15 is Malay and Tamil, and the official site banner is section 8's.

**Written late on purpose.** Section 16 puts the documentation second to last so
it describes the thing and not the plan. Eleven phases of deviations are why
that was right. 5f's trusted device list cannot say what 5f said it would.
`/status` is two pages at one address, and the bot's `/jobs` reads the public
feed. A guide written in phase 6 would be wrong about all three.

### What section 14 asks for, and where 16 pins it down

16a puts the applicant and bot guides in the public tier, so no login. 16h lists
the bot guide's eight pages by name. The staff guides sit behind the gate phase
13 built, tiered poster, admin and developer. 16e is the sentence that governs
all of them: **behind a login is not safe to paste a service role key into.**

### What the earlier phases handed over

Everything below arrived in section 6 before this phase started, and is moved
here because this is where it is worked from.

- **The applicant's guide to the bot**, fully specified by 16h in eight pages.
  Those are what the bot can and cannot do, linking from both ends, a command
  reference, and codes against the one tap link. Then the three notification
  kinds and why security messages cannot be silenced, invitations, unlinking and
  what it does to 2FA, and troubleshooting. In every shipped language.

  **The command list in `telegram-bot/setup.md` and the one in that guide are
  the same list.** Phase 11 part 7 re-read `setup.md` and took two stale
  passages out, so it is current as of 30 August 2026. But "current" is a state
  that decays, and the guide is the second copy that will decay with it.

- **`/docs`, a tenth bot command**, settled 3 September 2026. It browses the
  guides with inline buttons and sends a page as formatted text in the reader's
  own language. It lands beside the start message finally gaining its docs
  button, and **`commands.py` is the one copy of the command list**. So the
  menu, `start` and both documents move together.

  **Two of its four decisions went against the recommendation**, and the cost
  lands here and not on whoever chose:

  - **It reads Supabase directly, not the site.** Deviation 111 settled the
    opposite for `/jobs`. Reading `gftvjobs_docs_translations` with the bot's
    service key means **the tier rule is implemented twice**, once in
    `reader.js` and once in Python. The copies can disagree. **What this phase
    owed because of it.** The bot's tier logic checked against the site's, the
    way `strings.py`'s nine status words are checked against `status.*` — value
    by value, in a test that fails when they drift. A second gate that nothing
    compares is the failure this build keeps naming. Section 5 item 30 is the
    same shape of problem arriving from a different direction.

    **Part 9 discharged that instead of paying it, on 6 September 2026.**
    Migration `042` carries a view, `gftvjobs_docs_public`, which inner joins
    the translations to the public mirror. A gated page has no mirror row, so
    its 华文 joins to nothing and is not in the view at all. **The bot reads the
    view and never either table**, which leaves no tier logic in Python to check
    against anything. It is not a second copy that is compared; there is no
    second copy. The join being an inner one is the load bearing word, and the
    migration says so beside it.

    **And the English is not in the database at all.** That was found on 3
    September 2026 by asking where a page reaches Supabase from. 16e keeps the
    English in the files and puts only the other languages in
    `gftvjobs_docs_translations`. So a bot reading that table serves 华文 and has
    nothing whatever to send an English reader. The base row is a markdown file
    inside another Vercel project's build. **Settled the same day: the build
    mirrors the public pages into `gftvjobs_docs_pages`.** One direction at
    deploy time. It writes `page_path`, `title`, `summary`, `body` and
    `updated_at`, upserted by `docs-site/scripts/build.js`. That build already
    needs the database to read the translations, so this is a write path on a
    connection it opens anyway. The files stay the source of truth and the
    mirror is never edited. The bot reads it and joins the translations table
    against it, exactly as the site does against the files.

    **It carries public pages only, and therefore carries no `access` column**,
    which is what makes it safe. A gated page never reaches the table, so the
    Python half has no tier to compare. The paragraph above is discharged and
    not paid. A gated page appearing in it is the leak 16e names. So the build
    refuses to write one the way it already refuses to render one into `dist/`.
    **The rejected alternatives.** English rows at `locale: 'en'` in the
    translations table breaks 3a's base-row shape. It makes a second copy of the
    English that can drift from the file. The bot calling `/api/content` is
    deviation 111's own shape. It was declined here because it puts the docs
    site's uptime in front of a bot command.

    **A deploy that half fails leaves the mirror behind the site**, and that is
    the cost. `updated_at` is what makes it visible instead of silent.

    **All of that is built, by part 9 on 6 September 2026.** One thing about it
    moved: the join is not the bot's to make. Migration `042` carries it as a
    view, `gftvjobs_docs_public`. So the bot reads one row for a path and a
    locale and never joins anything itself. `updated_at` is nullable in both
    tables, per deviation 134, because a page git cannot date carries no date
    and Vercel clones shallowly.
  - **Linked admins get the staff guides in Telegram.** Nothing links Telegram
    to `gftvhello_users` today: phase 11 links a Telegram account to a
    `gftvjobs_users` applicant, and staff are a different realm. This needs a
    staff link table, a verification flow, and a decision about what proves a
    staff identity in a chat window. **That is a phase of its own and not a
    command.** And it puts gated procedure into a channel this build does not
    control, which makes 16e load bearing instead of cautionary. Whoever builds
    it re-reads that line first.

  **The rendering is settled, after one correction.** Rich text does not raise
  the message limit: Telegram caps a message at 4096 characters *after* entity
  parsing. `parse_mode` changes formatting and not length, and Telethon raises
  `MessageTooLongError` instead of splitting. **Settled: page it, and name what
  it cannot render.** Split on heading boundaries, Previous and Next and a "2 of
  5". Render bold, italic, code, links and blockquote. Replace a table, a tabbed
  block or a screenshot with one line saying what is there and a link to that
  heading on the site. **A block silently dropped is a procedure with a step
  missing.**

- **The docs site's own `robots.txt`, `sitemap.xml` and `llms.txt`**, generated
  from the same `access` key that drives the gate. One source for what is public
  and what is not, or the discovery files become a second gate. Phase 12 part 8
  already settled that a half state must not be able to ship quietly.

- **The Playwright capture script, and a first run against seeded data.** This
  is what `seed.mjs` was built for. **Expect to debug it and not to use it**,
  per section 5 item 19. Its write path has never run against a database. The
  failure to look for is an `on_conflict` that does not match a real unique
  constraint.

- **The bot's start message finally carrying a docs link.** 16's cross link rule
  has been holding this back since phase 11: the link must not ship before the
  page does. The page exists now, so this is unblocked the moment the bot guide
  lands.

- **`embed-tests.mjs`'s output**, decision 6 from phase 13. It goes to
  `docs-site/api/_content/developer/test-scripts.json`, committed and not built
  at deploy time, so a change to a test script is a reviewable diff. Gated,
  because the developer guide is admin only and anything in the static root is
  world readable whatever the interface says. **The file is written when there
  is a page to read it, which is this phase.**

- **Phase 11's webhook confirmation notice**, deferred three times and settled
  on 1 September 2026. **Build it, in its own commit**, numbered the way
  `2c27a2b` was. It is portal and bot work and not documentation, which is why
  it gets its own commit instead of a part. The cost: a fourth `KIND`, a
  renderer in `outbox.py`, and a fourth notify column with a migration for it.
  Phase 11 part 5's forty cases are re-walked. Declining it was on the table and
  was not taken. The confirmation is the one status change the portal makes on
  somebody's behalf, and it stays the one they hear nothing about.

- **One call to `checkEnv()`, on both sites.** Section 5 item 29. Written for
  exactly the outage that happened and called by nothing.

### What is already true, so it is not rebuilt

- **The pipelines are done.** `docs-site/scripts/build.js` prerenders the public
  tree into `dist/`, splits the search index public against per tier, and dates
  every page from git. It **refuses a page with no `access` key, a gated page
  pointing at a public image, and an image with no file behind it.** Writing a
  guide is adding a markdown file with front matter.
- **The gate is done and proved on the deployment**, in both directions, as a
  stranger and signed in.
- **The shell is done.** That is 16d's three columns, the sidebar, on-page
  contents, the header, the callouts and the renderer. Part 7's responsive and
  accessibility pass over both trees at six widths in two languages is in it
  too.
- **Both dictionaries exist and `check-i18n.js` reads both sites.** The shell is
  273 keys as of part 9, which added the two the English-only notice needs.
  Guide *content* translations are served from Supabase and **authored as files
  under `docs-site/translations/`**, per deviation 133. So **`scripts/build.js`
  needs the database**, said since part 6a, true since part 9, and easy to
  forget on a fresh clone. `--no-database` is the way past it there.
- **There are no images in either content tree yet.** The first screenshot this
  phase adds is also the first exercise of the gated image path, which is built
  and has never served a file.

### The parts. Settled 3 September 2026: nine, the chrome then the guides.

**It is ten as of 7 September 2026**, when the seam was split into 10 and 10a.
The lettered parts are not counted in either number. 2a, 2b, 4a, 5a and 7a all
fell where they fell, and 7a is the only one of them still to be built.

**It was eight and became nine the same day**, when somebody looked at the docs
header and found `gftv-theme.md` half applied. The chrome part goes first and
everything else shifted down one. That is because **76 pages written against a
header that is about to change is 76 pages to re-read**. Part 8's captures would
photograph the old one.

**82 pages across six guides**, counted from 16h and not estimated: portal 13,
bot 8, translations 8, job poster 20, admin 14, developer 17. **16e's "thirty
files" is an undercount**, and was the number this file used until it was
counted. Whoever plans a session against it should use 82. **It was 76 until
part 5**, which gave the poster guide a twentieth page. 16h's first bullet for
it is not a landing page. **It was 77 until part 6**, which gave the admin guide
a page for the maintenance switches. 16h's thirteen bullets do not ask for one.
And **82 after part 7**, whose fifteen bullets became a landing page, fifteen
pages and one for the test scripts. **Part 7a's generated specification pages
are on top of all of that** and are counted separately, because nobody writes
them.

1. **The docs site's chrome, and `gftv-theme.md` applied properly. Shipped as
   `14dc190`, "phase 14 part 1", pushed and verified 3 September 2026.** Settled
   that day after somebody pressed the buttons, and shipped the same day. Detail
   below, because it is the one part of this phase that is not prose.

   **What it turned out to be.** `main-site/assets/js/chrome-modals.js`, the
   four functions out of the portal's `shell.js`. Two entries in
   `gen-docs-lib.js` for it and for `dialog.js`, both `Identical` and neither
   needing a rule. The docs header's text button and `<select>` swapped for two
   `.icon-btn`s with the portal's own ids. `hydrateIcons` is called in the docs
   shell for the first time. Seventeen dictionary keys in and five retired.
   `.docs-lang` out of `docs.css` and no CSS added, because `theme.css` had been
   shipping all of it since part 4. And `sw.js` at **`v127`** with the new
   import precached.

   **It found one defect and it was in neither site's chrome.** It is deviation
   128: `--border-control` on three controls that had been on `--border` since
   phase 12 part 3 created the token. A portal defect as much as a docs one.

   **The checks are a new file, `tests/phase14-test.mjs`, at 71.** Four
   sections. `chrome` reads both sites' source, and `browser` presses the
   controls over `dist/`. `contrast` measures both modals against WCAG AA in all
   four theme combinations, and `a11y` walks them open. Nothing in it needs a
   credential, a database, a deployment or the network, and it writes nothing at
   all.

   **`tests/phase13-test.mjs` moved with it and stays at 677.** Its `contrast`
   section measured `#docsMode`, which no longer exists, and now measures the
   two buttons that replaced it.
2. **The portal guide**, 13 pages, public. **Shipped as `f095bad`, "phase 14
   part 2", pushed and verified live 3 September 2026**, carrying part 2a with
   it. First of the guides because it is the one most people read and the one
   whose subject has been stable longest.

   **The thirteen files are 16h's thirteen bullets**, with the first of them as
   the section's `index.md`. They are what Careers@GFTV is, creating an account,
   signing in, finding roles, saving roles, and applying. Then applying again,
   your applications, outstanding tasks, account settings, recovery codes,
   offline and installing, and troubleshooting. `docs-site/content/index.md`
   lost the sentence saying every page here is a placeholder, because eleven of
   them stopped being one.

   **It was written from the interface dictionary and the code, never from the
   specification.** 16's whole argument for writing the documentation late is
   that a guide written from the plan describes the plan. So every claim on
   these pages traces to a string a reader actually sees in `en.json`. It traces
   to the route that enforces it, or to a comment written beside the decision.
   Where the two disagree the string won. The eight states of the Apply control
   are `apply.js`'s own list, the nine statuses are `status.*`, the two sessions
   are 12 hours and 30 days because `auth.staySignedIn*` says so. The codes
   warning fires below three because `security-page.js` compares with `<`, and
   the search weighting is migration `009`'s four `setweight` calls.

   **Six pending screenshot slots**, written as 16g's `pending:` marker so they
   read as pending and not as broken. They are named the way 16g asks:
   `portal-login-desktop-light`, `portal-search-desktop-light`,
   `portal-apply-dialog-desktop-light`, `portal-applications-desktop-light`,
   `portal-tasks-desktop-light` and `portal-recovery-codes-desktop-light`.
   **Part 8 captures exactly these six.** The last of them is the one 16g names
   as needing invented values with a caption saying so.

   **Two entries were added to `gen-review.js`'s `EXEMPT`.** Two of the pages
   carry 华文 as the name of the language on the control they are describing,
   which is the judgement `main-site/about/index.html` already has. A guide's
   own Chinese is not in these files at all. 16f puts guide content translations
   in Supabase, so `docs-site/content/` stays the English tree whatever part 8
   ships beside it.

   **It found two defects, and neither was in the prose.**

   - **`.docs-tabs` could not hold a phone.** The install instructions are the
     first tabbed block either tree has ever carried. 16d put tabs there for
     "anything that differs by device", which makes a phone the width they have
     to hold. Four labels in one `display: flex` row with no wrap squeezed every
     button until its text wrapped inside it. It pushed the last one **35px off
     a 320px screen**. One line of CSS, `flex-wrap: wrap`, in `docs.css`, which
     is this site's own file and not a generated one. **Phase 13's responsive
     section caught it.** That is the first time that suite has been the thing
     that found something instead of the thing that confirmed it.
   - **The home page still promised offline support as unbuilt**, a week after
     phase 10 shipped it. Section 5 item 31 is the account. Fixed in this part
     on 3 September 2026 by choice. `home.offlineBody` in both dictionaries and
     its fallback in `main-site/index.html`, rewritten in the present tense. And
     `sw.js` to **`v128`**, because that is a change to the portal.

   So this part touches `main-site/` after all, which the plan did not expect.
   The docs site still has no worker to bump: phase 13 decision 3 is why, and
   section 2's decision 4 is where that gets revisited.

   **The checks after it.** The docs build at 16 public pages, `check-copy.js`
   at 3,860 strings clean, and `check-i18n.js` clean on both sites. Then
   `gen-review.js` clean once the two exemptions landed, `check-precache.js` at
   109 entries, `gen-docs-lib.js --check` current at 42 files, and
   `tests/phase14-test.mjs` at 71.

   **`tests/phase13-test.mjs` is no longer 677 and never will be again.** Its
   responsive section runs per page, so eleven new pages took the suite to
   **1,240**. The number in the list below is the number for a tree this size,
   and it moves with every part of this phase. **Check 24, "every committed page
   has a date", fails while the new pages sit uncommitted** and passes the
   moment they are pushed. `scripts/build.js` dates a page from git, and a page
   git has never seen carries no date on purpose. **2a. The plain language pass,
   over both sites. Done 3 September 2026, and pushed inside `f095bad` with part
   2.** Asked for after part 2 was written. Simple and concise English and
   Singapore Mandarin, so that somebody with no technical knowledge can read
   everything and apply. It is numbered 2a because it fell here, and because its
   subject is every site's copy and not this part's thirteen pages.

   **Three decisions, all put to the person asking and all answered.**

   - **All of it, in three passes, applicant facing first.** Everything both
     sites say, and not the public half alone.
   - **A technical term keeps its name and gains a plain explanation where the
     reader first meets it.** Passkey stays "passkey" with "your fingerprint,
     your face, or a security key" beside it. That is the word on the button and
     in the browser's own prompt. Replacing the term would leave the page and
     the screen saying different things.
   - **The docs site is 国际兽视入队平台 说明文件 in Chinese**, and not 文档. 3a's table says
     文件 and not 文档, and 说明文件 is what a Singapore reader calls a manual. Ten
     strings across both dictionaries carried the old word.

   **The rule is 25 words to a sentence, and it was chosen by measuring.** At
   the moment it arrived, the whole portal dictionary held seven sentences over
   25 words, and the documentation held 36. A cap that fails on nothing teaches
   nothing, and one that fails on a hundred strings is switched off in a week.
   The portal's own average is under seven words, so the cap is not the target.

   **What it changed, by pass.**

   - **A, the applicant's portal.** 65 strings in `en.json`, their 39 fallbacks
     in the markup, and 21 in `zh.json`. Then 27 fields in `build-status.json`
     in both languages, which is the public phase list on `/status`.
   - **B, the documentation.** 41 sentences split across the thirteen new guide
     pages and the five gated placeholders. Then every page in
     `docs-site/content/` rewrapped at 80 columns.
   - **C, the staff strings.** The seven that broke the cap, in both
     dictionaries and both languages, `staffAccount.sessionsNoDevice` included.
     That is the account suite shown on both sites, and it had to move on both.

   **What `check-copy.js` grew.** A 25 word cap over the dictionaries, the phase
   list, the documentation pages and the bot's strings. 3a's vocabulary table as
   a check over both `zh.json` files. And a markdown aware sentence splitter,
   **because the first version read eight bullets as one 60 word sentence** and
   reported clean pages as broken. It reads 6,029 strings from eight sources and
   passes.

   **What this pass did not do, said plainly.** The roughly 2,000 strings that
   were already short were checked by the script and not re-read one by one. The
   admin dictionary's word choice has had no human pass. The Chinese moved only
   where the English moved.

   **Both of those were put up as decisions and both were settled the same
   day.** The admin dictionary **stops here.** Everything a reader meets passes
   the rule, and the dashboard's audience is trained staff. Parts 5 and 6 read
   every admin screen anyway to describe it, which is the cheapest moment to fix
   wording that reads badly. And the **Chinese reviewer's handoff waits for part
   9**, when the guides are translated. Sending now would mean reviewing the
   interface twice: once for this pass's sixty strings, and again when 76 pages
   arrive. Section 5's round trip item is unchanged in nature and larger in
   size.

   **2b. The docs site's icons and its link card. Committed inside `12ec9de`,
   "phase 14 part 3", on 3 September 2026**, because the two were written in one
   sitting. Found by somebody pasting both sites into a chat and looking at the
   two previews. It is numbered 2b because that is where it fell; its subject is
   the docs site's head and not this phase's prose.

   **What was actually missing was all of it.** `docs-site/shell.html` carried
   `charset`, `viewport`, a title, a description, a theme colour and two
   stylesheets, and nothing else. No `<link rel="icon">`, no `apple-touch-icon`,
   no `og:` or `twitter:` tags, no canonical. And `docs-site/` held no image
   files at all, so `/HLC-main.png` and `/favicon.ico` were addresses that
   answered nothing. The HLC set lives in `main-site/`, which Vercel builds as a
   **different project from a different root directory**. The card in a chat was
   the scraper falling back to the two things `scripts/build.js` already rewrote
   per page.

   **The images are generated in, not linked across, and that is the one
   decision here.** A tab icon fetched from the portal is a blank tab the day
   the portal is renamed or has a bad afternoon. So `ASSETS` in
   `gen-docs-lib.js` gained a `to` field, and three entries use it. They are
   `favicon.ico`, `HLC-180.png` and `HLC-main.png`, copied to `public/`. That is
   the directory the build empties into the root of `dist/`. **The other four
   HLC files are the manifest's** and are deliberately left behind. This site
   has no manifest and no worker, per phase 13 decision 3, so copying them would
   be four files nothing names.

   **The card is per page and the origin is written once.** `shell.html` carries
   the canonical link, and `scripts/build.js` reads the origin back off that
   line to build each page's `og:url` and canonical. A move is one line. The
   per-page rewrite is `replaceOnce` like the others. A marker that stops
   matching stops the build instead of writing 30 pages with the wrong address.
   **A gated page keeps the shell's defaults.** A preview card is read by
   something that is not signed in. A gated title and summary in one would be
   16e's leak arriving through a meta tag.

   **The card is the small one.** `twitter:card` is `summary`, which draws the
   mark as a thumbnail beside the title. It is not `summary_large_image`, which
   draws it as a banner over the top. The image is `HLC-main.png`, the same file
   the portal's card points at, so the two sites carry the same mark. Asked
   about after the fact, so it is written down here.

   **None of the card is translated, deliberately.** Nothing that reads it runs
   the page, so a `data-i18n-attr` there would leave every card in the fallback
   language whatever the reader chose. The `description` meta keeps its
   `data-i18n-attr` because a browser does read that one, which is why the head
   now says the same sentence twice.

   **`public/` became an owned directory in the same edit**, with `.png` and
   `.ico` added to the extensions the stray check knows. Everything in it
   becomes a public address at the root of `dist/` with no review. That is
   exactly the directory that should not accept a file nobody declared. The scan
   reads one level, so 16g's `public/screenshots/` is out of its way and stays
   this site's own.

   **No `sw.js` bump, and it is the first change in this phase that touches
   neither site's worker.** Nothing under `main-site/` moved.

3. **The bot guide and the translations guide**, 16 pages, both public.
   **Shipped as `12ec9de`, "phase 14 part 3", committed 3 September 2026**,
   carrying part 2b with it. Together because the bot's command reference and
   `telegram-bot/setup.md` are the same list, so whatever `start` says has to be
   settled once for both.

   **The bot's eight pages are 16h's eight bullets.** What it does and cannot do
   is the section's `index.md`. Then linking, the command reference, signing in,
   notifications, invitations, unlinking, and troubleshooting. Written from
   `handlers.py`, `strings.py`, `outbox.py`, `security.py` and the portal's own
   routes. Every quoted sentence is a string the bot actually sends.

   **The translations guide's eight pages are 16h's eight bullets too**, and its
   subject was already built. `translation_report` shipped in phase 4, and
   `translation_helpers` and `translation_annotations` in phase 8. The feature
   key `translation_helper_guide` is phase 14's and is this section. Nothing
   reads a switch for it, which `maintenance.js` already said in a note.

   **The command reference is a checked copy.** It carries the `## Commands`
   table in the shape `commands.py`'s `--check` reads. That file's `DOCUMENTS`
   now names it as a third document beside `setup.md` and `README.md`. The
   docstring at the top of `commands.py` has named this guide as a consumer
   since part 1 of phase 11. This is the part where the claim stops being about
   the future. **A copy nothing compares is the copy that goes stale, and this
   one would go stale in public.**

   **Six entries were added to `gen-review.js`'s `EXEMPT`.** Five of them are
   the judgement part 2 already made twice: the language's own name inside an
   English sentence. **The sixth is different and is the interesting one.**
   `translations/singapore-mandarin.md` reproduces 3a's vocabulary table for the
   people it was written for, so half of it is words this build refuses. Putting
   志愿者 on the review page as copy to approve would be the opposite of what the
   page is for. `check-copy.js` already enforces that table over both `zh.json`
   files, which is where the rule belongs.

   **`docs-site/content/index.md` stopped saying two guides are placeholders**,
   because they are not any more. All three public guides are listed on it.

   **The bot's start message still has no docs link.** It is the seam's, per
   part 10, and 16's cross link rule is now satisfied on this end: the page it
   would point at exists.

   **The checks after it.** The docs build at **30 public pages**,
   `check-copy.js` at **6,044 strings** clean, and `check-i18n.js` clean on both
   sites. Then `gen-review.js` clean once the six exemptions landed, and
   `gen-docs-lib.js --check` current at 42 files. Then `check-precache.js`
   clean, `python commands.py --check` current across three documents, and
   `tests/phase14-test.mjs` at 71.

4. **The docs service worker, and the site fully offline capable. Shipped as
   `7d82b02`, "phase 14 part 4", pushed 4 September 2026**, carrying part 4a
   with it. Asked for on 3 September 2026, and it is decision 4 below being
   settled by being built. **It arrived as a new part 4 and pushed everything
   below it down one**, which is the second time this phase has done that. Part
   1 did it in the same way and for the same reason. A piece of plumbing under
   76 pages is cheaper before the pages than after them.

   **Three sub decisions, all put up and all answered the same day.**

   - **The gated guides are cached too, per reader**, and not the public tree
     alone. That is the answer that costs the most and it was taken knowingly.
     16e keeps gated content behind an authenticated route, so a cache of it is
     staff procedure written to the disk of whatever machine read it. What makes
     it safe is the clearing, on sign out and on any change of tier. That
     clearing has to be airtight or the decision is wrong.
   - **The precache list is generated by the build**, and not written by hand
     the way the portal's is. `scripts/build.js` already knows exactly which
     public pages it just wrote, so the list cannot drift from the tree. This is
     the one place the docs site is better arranged than the portal. The reason
     is that it has a build step and the portal does not.
   - **The update bar is the portal's, generated in.** `update-bar-spec.md` is
     portable by its own first lines. This is the fourth instance of decision
     1's question, with the cheapest answer yet: one implementation, in
     `main-site/assets/js/`, copied here by `gen-docs-lib.js`.

   **What it is, file by file.**

   - **`docs-site/sw.js`**, this site's own and named in `gen-docs-lib.js` under
     `OWN`. **The portal's worker was not a template for it.** That file is
     1,032 lines of an IndexedDB action queue, a postings cache with an eviction
     policy, and the maintenance switches. None of that exists here, and this
     one has a tier, which the portal has no equivalent of. What the two share
     is the shape of the lifecycle, and sharing a shape is not sharing a file.
   - **`main-site/assets/js/connection-bar.js`**, which is the top half of
     `offline.js` moved out: registering the worker, the update prompt, and the
     bar's three states. What stayed in `offline.js` is what is about the portal
     and not about a worker. That is the controls that cannot work offline, and
     the postings cache. **Its five importers were checked and none broke.**
     `workerVersion` moved and is re-exported from its old home, so a console
     that has been asking `offline.js` for it since phase 1 still works.
   - **The three places the two sites differ are arguments and not edits.** They
     are where the bar is inserted, whether "cannot reach us" has a status page
     to link to, and what else redraws with it. The docs site passes `null` for
     the second. A bar on this site linking to the portal's status page would
     send somebody to a second site to find out about this one.
   - **`docs.css` gained the bar's styles**, written in this site's language
     instead of copied from `app.css`. That is the account block's rule from
     part 6 and the same reasoning. 16d keeps this site to hairlines and
     whitespace where the portal has cards. `.small-btn` came with it, because
     `theme.css` carries `.btn` and its variants and not that one.
   - **Seven `offline.*` strings in both dictionaries.** The portal's wording
     adapted: it says guides where the portal says Careers@GFTV.
   - **`vercel.json` gained `Cache-Control: no-cache` and
     `Service-Worker-Allowed` on `/sw.js`**, the portal's own two headers.

   **`check-precache.js` grew its second half, and it asks a different
   question.** The portal's list is written by hand, so that check is about a
   file that is not there. This site's list is generated, so that failure is not
   available to make. What can still go wrong is the *generator* being wrong.
   The docs pass checks that every generated address resolves to a file in
   `dist/`. It skips with a sentence when the build has not run. **It was proved
   by breaking it.** One entry was edited to a path that does not exist, and it
   failed and named the two files it tried.

   **`main-site/sw.js` is at `v129`**, with `connection-bar.js` added to its
   precache list. A new module the shell imports on every page, missing from
   that list, would turn the connection bar off. That is exactly the condition
   the bar exists for.

   **What the reader gets.** Thirty public pages, the search index, the chrome
   and the images all work with no network, and a signed in reader's staff
   guides do too. **There is no `/offline` page.** The shell is the fallback, so
   an uncached address draws the chrome and says the page is not available.
   16e's "a reader must not be able to tell which pipeline a page came from"
   holds here. This is the condition where it would be easiest to break.

   **It has run in a browser, and that was asked for and not assumed.** The gap
   this part closed last was that every other check reads source or `dist/`, and
   a worker is a thing that *installs*. A fetch handler that throws makes every
   page on the origin fail for anybody who already has it. No amount of reading
   the file finds that. So `--only=install` is fifteen checks over a real
   Chromium against the stand in server. 127.0.0.1 is a secure context, so
   registration behaves as it does on the deployment. It installs, reaches
   active, does **not** claim the first load, precaches 57 addresses, and then
   the network is pulled out with Playwright. A precached guide still answers
   200 with its own article and its stylesheet. An address nobody cached falls
   back to the real shell instead of the browser's error page, and the site
   comes back when the network does.

   **It also found the one thing reading could not.** Check 41 asserted that a
   change of tier leaves the *new* tier's cache in place, and it does not.
   `rememberTier` deletes what does not match and nothing else. The cache for
   the tier now in force is opened lazily by the first API answer worth storing.
   **The code was right and the check was wrong**, which is the shape of finding
   that only running it produces. What a tier change guarantees is that the
   previous reader's cache is gone. That is the half the decision rests on, and
   it is what the check asserts now.

   **The checks after it.** The docs build at 30 public pages and **57 precached
   addresses**, `check-precache.js` clean on both halves. `check-i18n.js` clean
   at 261 keys each side, and `check-copy.js` at 6,058 strings. `gen-docs-lib.js
   --check` current at **43** files. `tests/phase12-test.mjs --only=contrast` at
   35, and `--only=a11y-keyboard` at 40. That is the portal's own connection
   bar, opened in a browser after its module was pulled in half. And
   **`tests/phase14-test.mjs` at 119**: 71, plus a `worker` section of 33 and an
   `install` section of 15.

   **`tests/phase13-test.mjs`'s check 164 turned around.** It asserted that this
   site has no service worker, which is what phase 13 decision 3 settled and
   what stopped being true here. It now asserts the opposite, and the README
   sentence it reads alongside is the same one either way. The rule for a worker
   did not change, only whether there is one to apply it to.

   **The worker section is the part's own argument, written as checks.** Six of
   them are the gated caching decision and nothing else. The cache is named for
   a tier, a tier that is not the current one is deleted, and signing out
   deletes all of them. The shell posts `signed-out` *before* it navigates, it
   posts the tier on every load, and a signed out reader is a tier like any
   other. **If one of those six fails, the decision is wrong and not merely
   untidy**, which is why they are asserted instead of described. It also holds
   section 14's line: no `skipWaiting` in install, no `clients.claim` in
   activate, and the update prompt as the only route to either.

   **4a. The portal's Mandarin name. Done 3 September 2026, and pushed inside
   `7d82b02` with part 4.** Raised while part 4 was in flight and applied
   immediately at the asker's direction, having first been scheduled for part 9.
   It is numbered 4a because that is where it fell, the way 2a and 2b were.

   **国际兽视入队平台**, replacing 国际兽视入队平台. Literally the portal for joining the team.

   **The argument is that it is more honest than the English name.** "Careers"
   implies a salary, which is why the portal guide opens with a paragraph
   explaining that there is none. 招聘 would have carried that same wrong
   implication into Chinese. 入队 says what is actually on offer. The longer
   国际兽视入队申请平台 was offered and declined: 申请 is implied by 入队平台, and the header
   holds the language and theme controls at 320px.

   **What moved.** 73 strings in `main-site/assets/i18n/zh.json`, 68 of the old
   name and **five `Careers@GFTV` in Chinese copy**. 3a already said those five
   should have been the Chinese name, and nobody had noticed. Then 18 in
   `docs-site/assets/i18n/zh.json`, the phase list's Chinese half, two strings
   in `strings.py`, and the bot's Chinese About in `setup.md`. Then
   `about.whoBody` and its fallback in the markup, and the dev seed's two sample
   postings. And a UTF-8 round trip constant in `tests/phase11-test.mjs`, with
   the four documents that state the naming rule.

   **And a migration, which is the half a dictionary could not reach.** The home
   page's title is not a dictionary key: it is `gftvjobs_settings.portal_title`,
   locale keyed since `018` and editable by an admin. The portal renders the
   Chinese half of it from the database. **Without `041` the rename would have
   been complete everywhere except the largest words on the home page.** Found
   by sweeping every file type for the old string instead of only the ones the
   rename had touched.

   **`041_mandarin_portal_name.sql` fires only on the exact string `018`
   wrote.** An admin who has edited the Chinese title since has made a decision
   about their own copy. A migration that overwrote it would be this file
   deciding it knows better than whoever runs the site. That is `018`'s own rule
   — it fired only on rows still holding a bare string — one step further along.
   It is idempotent twice over, and it **was applied on 4 September 2026**,
   leaving `036` alone on the list of migrations nobody has run.

   **`gen-review.js` stopped reading `portal_title` from `018`.** That migration
   has run, so it is a record of what was true in phase 5 and not of what the
   database holds. Reading it would have put the old name in front of the
   reviewer as the current wording. That is the one thing that page must not do.
   It reads the value out of `041` instead, and `041` is a listed source.

   **Specification 3a moved with it**, which is the part that makes the rename
   real. This file never overrides the brief, so a rename the brief still
   contradicts is not a rename. Its Names paragraph now carries the new name and
   the reason for it.

   **Nothing in `next-steps.md` was rewritten**, on purpose. This file is a
   record of what happened, and the phases that shipped under the old name
   shipped under it.

   **The spacing rule needed a new example.** 3a's was `关于国际兽视 Careers`, which
   demonstrated the Latin and Han space rule *using the product name*. The new
   name is Han throughout, so that example now demonstrates nothing. Every place
   that stated the rule now uses `Telegram 账户` for the space and `关于国际兽视入队平台`
   for its absence. Those are 3a, `main-site/README.md`, `gen-review.js` and the
   Singapore Mandarin guide page. **A rule whose only example stopped being an
   example is a rule that quietly stops being taught.**

   **One thing for the reviewer and not for us**: 入队 reads as 少先队入队 in some
   Mainland contexts. For a Singapore reader it should not, but that judgement
   is theirs and it goes with part 9.

5. **The job poster guide, 20 pages, gated at the poster tier. Shipped as
   `04261b4`, "phase 14 part 5", pushed 4 September 2026.** The largest of the
   six, and the one written for somebody who has never seen an admin interface.

   **It is 20 and not 19, which was the first of four decisions.** 16h lists 19
   bullets and its first is signing in. That does not read as a section landing
   page, the way the portal guide's "what Careers@GFTV is" did. So `index.md` is
   a twentieth page, **Using the dashboard**. It carries who the guide is for,
   the poster and admin boundary, what the dashboard does not hold, and the
   contents. Every count in this file that said 19 for this part now says 20,
   and **76 pages across the six guides is 77.**

   **Written from the dashboard and not from section 8**, which is part 2's rule
   and the whole argument for writing the documentation late. The source was the
   785 `admin.*` strings in `en.json`, the routes behind them, and the comments
   beside the decisions. Every number on these pages traces to a constant. The
   ratings floor of three and the flag's five clicks and a fifth are
   `analytics.js`'s own. Twenty questions is `questionsHint`, six featured roles
   is `MAX_FEATURED`, and ninety days is the chart's `SERIES_DAYS`. The four
   prefillable fields are `PREFILLABLE`'s keys, and not a list of what sounds
   likely.

   **The Apps Script setup is a checked copy, which was the second decision.**
   16h asks for the confirmed submissions procedure "as a plain checklist with
   copy buttons", and that procedure already existed twice. It is in the root
   README, and as four sentences in the job editor's own help block. A guide
   made it the third copy. So `confirmed-submissions.md` **quotes the
   dashboard's four steps word for word**, each as a blockquote with the
   expansion under it. `--only=guide` compares all four against
   `admin.webhookStep1` to `4`. This is `commands.py --check`'s argument in a
   second place. A copy nothing compares is the copy that goes stale. This one
   would go stale in front of whoever is doing the fiddliest job on the site.
   **It was proved by breaking it**: "authorise" to "authorize" in the page, and
   step 4 failed and printed the sentence it wanted.

   **Ten screenshot slots are named for part 8**, the third decision, written as
   16g's `pending:` marker. They are the overview, the postings list, the
   editor, its language tabs, and the form fields. Then the tracking table, one
   application in detail, analytics, invites, and the dashboard on a phone.
   `--only=guide` checks the count, the naming shape and that none is named
   twice, because a typo in a slot is a shot nobody takes.

   **It found deviation 130, and that is the fourth decision.** A job poster
   could open `/admin/settings` and `/admin/maintenance` from their own sidebar,
   and both routes were guarded with `requireStaff`. 10 item 2 names both as an
   admin's. Writing a guide that taught a poster to use the settings page was
   the alternative and was not taken. **Fixed in this part**, so it touches
   `main-site/` the way part 2 did. Two `adminOnly` entries, `requireAdmin` in
   both routes, and the overview banner keeps its sentence for a poster and
   loses its link.

   **`tests/phase7-test.mjs` asserted the defect** in as many words. It read "a
   job poster still reaches postings, tracking, teams, tags and maintenance",
   and that check is now the pair that refuses both routes. **A check can hold a
   mistake still**, which is worth writing down twice.

   **One thing on 10 item 2's list was deliberately left alone**: marking a
   translation ready. 7i's sentence is about a helper and not about staff, and a
   poster who cannot tick ready cannot publish their own posting in two
   languages. Deviation 130's last paragraph is the argument.

   **Four concerns were put up when the part was finished, and all four were
   answered the way they were recommended**, 4 September 2026.

   - **The maintenance switches stay admins only**, and the counter argument
     stays written into the route's own header. The page exists for whoever is
     looking at a broken feature, which is as likely to be the poster who
     noticed. A read-only maintenance page for a poster was offered and
     declined. What a poster keeps is the banner sentence saying something is
     off.
   - **The ready tick stays as built**, and **the brief is not amended for it**.
     Adding the word "helper" to 10 item 2 was offered and declined, so the
     conflict is recorded here and in deviation 130 and nowhere else.
   - **The live proof is owed and not skipped**, and it is section 5 item 33.
   - **16h is not amended for the twentieth page.** It lists what the pages must
     cover and not how many files that is, so twenty pages over nineteen bullets
     contradicts nothing. Part 4a moved specification 3a because a rename the
     brief contradicts is not a rename; this is not that.

   **`tests/phase13-test.mjs`'s check 17 turned out to be wrong, which is part
   4's check 41 happening again.** It took the first 30 characters of every
   gated block and asserted none appears in the public search index. Twenty
   poster pages quote the same interface strings the public guides quote. So
   three prefixes appeared in both indexes and none of them was a leak. They are
   "Will be available in Phase 5", "Temporarily unavailable while we fix
   something", and one shared opening sentence. **It now traces a hit instead of
   counting it.** Find the public entry carrying the words, and read that
   entry's own source file. It fails only when a public entry carries words its
   own page does not say. Reading the source through the same mark stripping the
   index uses is load bearing. Without it, a page that bolds the sentence it
   quotes reads as a page that never said it.

   **What that rewrite could not be proved against is a real leak.** The suite
   runs the build before any section, so a fabricated `dist/search-index.json`
   never survives to be read. The new branch was exercised by calling the same
   logic on the same inputs, with a poster sentence spliced into a public entry.
   It reported the leak. That is a weaker proof than part 4's and it is what is
   available.

   **`tests/phase13-test.mjs` read 2,470 passed, 1 failed before the push**, and
   the one was check 24, "every committed page has a date". `--only=index` reads
   **11 passed, 0 failed** after it, exactly as in part 2. `scripts/build.js`
   dates a page from git, and a page git has never seen carries no date on
   purpose.

   **Proved on the deployment, 4 September 2026**, both halves of the gate and
   both people:

   - **A stranger gets 404** from `/api/content` on `/staff/poster` and on three
     pages under it. 404 and never 401, per 16e.
   - **A job poster gets all twenty.** `/api/nav` reads "Using the dashboard
     (20)" beside the three public sections. Each page answers 200 with its
     title, `access: poster`, its markdown, and **`updated: 2026-09-04`**. That
     is check 24's date arriving from git through the build.
   - **The two routes answer 403 to a real poster session**, which is item 33.

   **The checks after it.** The docs build at 30 public pages, **21 poster
   entries** in the gated index, and 57 precached addresses. `check-copy.js` at
   **6,077 strings** clean, after eight sentences over the 25 word cap were
   split. `check-i18n.js` clean, `gen-review.js` clean, and `check-precache.js`
   clean on both halves. `gen-docs-lib.js --check` current at 43 files, and
   `python commands.py --check` current across three documents. And
   **`tests/phase14-test.mjs` at 149**: 119, plus a `boundary` section of 17 and
   a `guide` section of 13.

   **`gen-review.js` took three exemptions and one change that is not one.** The
   three are the judgement parts 2 and 3 already made, the language's own name
   inside an English sentence. The change is that `scripts/build.js` writes a
   search index per tier into `docs-site/api/_generated/`, so a guide page
   carrying 华文 was reported twice. Once at its source, and once inside a JSON
   blob nobody wrote. `_generated` is now skipped by the scan for `dist/`'s own
   reason.

   **`main-site/sw.js` is at `v130`**, because `admin-shell.js` moved.

   **5a. `tests/phase7-test.mjs` repaired, in two places. Pushed as `8e197c4`,
   "phase 14 part 5a", 4 September 2026.** Part 5 rewrote that file's role
   section for deviation 130 and the rewrite was checked by reading. Running it
   is what found both of these, which is part 4's lesson arriving for the third
   time.

   - **The two route checks sat below an early return.** The delete half of the
     role section returns when there is no posting to aim at. With the board
     empty, per decision 25, that is the ordinary state. So the pair that proves
     a poster is refused `/api/admin/settings` and `/api/admin/maintenance`
     reported nothing at all on its first run. They are now above it, which is
     where a check that does not depend on a posting belongs.
   - **The access section hardcoded which features are unbuilt.** The list was
     `['admin_analytics', 'admin_invites', 'admin_settings']`, true the day
     phase 7 shipped and false from phase 8. All three have shipped, and the
     third is not in a poster's sidebar at all any more. Three checks reported a
     build that had moved on as a defect, and the click threw on an element that
     no longer exists. That took the section down before the role half ran. It
     now **reads the disabled items off the page** and skips with a sentence
     when there are none. **0c's rule is that nothing hardcodes a phase
     number**, and a test naming which features are unbuilt is that mistake
     wearing a different hat.

   Numbered 5a because that is where it fell, the way 2a, 2b and 4a were. No
   `main-site/` file moved, so no `sw.js` bump.
6. **The admin guide, 14 pages, gated at the admin tier. Shipped as `0aa1f92`,
   "phase 14 part 6", pushed 4 September 2026.** The content section 8a used to
   hold.

   **It is 14 and not 13, and that was the first of four decisions.** 16h lists
   thirteen bullets for this guide and **the maintenance switches are not among
   them.** That was invisible until part 5 made that page admins only. The
   poster guide cannot cover a page a poster cannot open, and the admin list
   never asked for one. So `maintenance-switches.md` is a fourteenth page, and
   8.12 is documented for the first time. 16h is not amended, for part 5's own
   reason: it lists what the pages must cover and not how many files that is.

   **The other three decisions**, all put up and all answered as recommended.
   The access rule is a **checked copy**, and eight screenshot slots are named
   for part 8. Admin wording that reads badly is **fixed as found**, which part
   2a deferred to exactly this part.

   **Written from the dashboard**, which is part 2's rule. The source was the
   785 `admin.*` strings, the routes behind them, and the comments beside the
   decisions. Every number traces to a constant. Ninety days is
   `DEFAULT_REAPPLY_COOLDOWN_DAYS`, six featured roles is `MAX_FEATURED`, and
   200 is the applicant search ceiling. The list of what cannot be switched off
   is `DENYLIST`, read entry by entry.

   **The checked copy is the access rule, and it is the third copy of it.**
   `hasPortalAccess` decides who comes in and `tiers.js` decides what opens; 16h
   asks this guide to say both. So `--only=admin-guide` compares the page
   against both files. The five sentences the dashboard shows beside an account
   are quoted word for word. The four tier names are **imported from
   `tiers.js`** instead of typed into the test. The three steps are checked for
   **order** on the page and in `hasPortalAccess` itself. Order is the rule: the
   same three words in another order describe an override that beat
   `is_approved`. **Proved by breaking it twice**, renaming a tier and swapping
   step 2 for step 3, and both failed and printed what they wanted.

   **It found one thing, and it is in the copy and not in a route.** Four
   strings tell a helper that **only an admin** marks a translation ready:
   `admin.helpersNote`, `admin.helperCannotPublish`, `helper.whatSavingDoes` and
   `helper.draftUntilReady`. `api/admin/jobs.js` guards with `requireStaff`, so
   **any job poster can tick ready**, and its one `isAdmin` branch is the delete
   path. The brief says admin in three places, 971, 1146 and 1592.

   **Part 5 settled the behaviour and nobody had looked at the wording.** Its
   decision was that the ready tick stays as built and the brief is not amended.
   These four strings are the same conflict, written where a helper reads it.
   **Fixed in this part**: they say staff, in both languages. So the interface,
   the routes and the guide now agree, and the brief is the one copy that does
   not. Deviation 131.

   **A fifth string was left alone deliberately.** `helper.gateBody` says an
   admin grants the role one language at a time, and that one is true. Granting
   is the only thing on the translations page a poster cannot do.

   **One more string moved, and it is the smallest fix here.**
   `admin.rolePosterOpens` read "Opens postings and applicants", on the staff
   access page, beside a poster's row. Applicant *accounts* are admins only, so
   it named the one section that role cannot open. It reads "postings and
   applications" now, in both languages, and it is one of the five sentences
   check 67 holds the guide to.

   **The eight slots.** The staff access list, one access row's three states, an
   applicant account, and the translations queue. Then the language audit, the
   annotation layer, portal settings, and the unmatched submissions list.

   **`main-site/sw.js` is at `v131`**, because six strings in both dictionaries
   moved.

   **`docs-site/sw.js` is at `v2`, and this is the first bump it has had.** Part
   5 added twenty pages to this site and left it at `v1`. That file's own first
   lines forbid it: "bump VERSION on every change to this site, not once per
   phase". The gated pages are network first and are not precached, so nothing
   was served stale, and that is why nobody noticed. This bump carries both
   parts.

   **The checks after it.** The docs build at 30 public pages with **14 admin
   entries** in the gated index, and 57 precached addresses. `check-copy.js` at
   **6,091 strings** clean, after four sentences over the 25 word cap were
   split. `check-i18n.js` clean, `gen-review.js` clean with **no new
   exemption**, and `check-precache.js` clean on both halves. `gen-docs-lib.js
   --check` current at 43 files, and **`tests/phase14-test.mjs` at 167**: 149,
   plus an `admin-guide` section of 18.

   **The two suites collided, and the fix is in phase 14 and not in phase 13.**
   `tests/phase13-test.mjs` plants `example-shot.md` and `example.png` in
   `api/_content/admin/` to exercise the gated image path, and deletes them when
   it finishes. So an overlapping phase 14 run read fifteen pages and a ninth
   screenshot slot. Found by running them together. **Check 62 skips the two
   fixture names**, so the suites are independent again. It was verified with
   phase 13 actually running and its two files on disk. A suite that fails
   because another suite is running is a suite people learn to ignore.

   **Four more concerns were put up when the part was finished, 4 September
   2026, and answered as recommended.**

   - **The brief is amended, and this is the difference from part 5.** 971, 1146
     and 1592 said only an admin sets `is_ready`. They say staff now, each with
     the date and deviation 131 beside it, and 7i keeps its reason for the gate
     word for word. Part 5 declined this when only the behaviour disagreed; four
     strings promising a helper something untrue is what changed the answer.
     Part 4a's rule again: a rule the brief still contradicts is not settled.
   - **The live proof is owed and is section 5 item 34.** Fourteen pages behind
     the same access key, and the half worth doing is the job poster getting 404
     on them.
   - **The fixture clash is fixed in the check**, above.
   - **The admin dictionary stops here**, which is part 2a's answer held. Every
     string a reader meets passes the 25 word cap, and the five that were wrong
     about the site are fixed. The remaining 780 have an audience of trained
     staff. No style pass is owed.
7. **The developer guide, 17 pages, gated at the developer tier, plus the
   mechanism that hands a reader `tests/`. Shipped as `61d9ce5`, "phase 14 part
   7", pushed 4 September 2026, not yet verified against the deployment.** The
   last of the six guides, and the one that stops the build being readable only
   to its authors.

   **It is 17 and not 15**, which is the same arithmetic parts 5 and 6 did. 16h
   lists fifteen bullets. `index.md` is the section landing on top of them, the
   way the admin guide's is. **The test scripts are a page of their own.** So
   the six guides are **82 pages** and not 78.

   **Four decisions were put up and all four were answered as recommended.**

   - **The specification becomes one page per top level section**, generated
     from the file with a `--check`, and that is **part 7a** below. 16h asks for
     it "rendered as pages and not one wall", and 18 sections is what the file
     has.
   - **The memo's page is written now and its snapshot is generated at the
     seam**, part 10. Anything generated this week would be a snapshot of a file
     still being written. **`next-steps.md` was gitignored, so Vercel's checkout
     never saw it.** The snapshot had to be committed markdown, which is what
     ruled out generating it at deploy time, and is the reason 7a exists at all.
     **Part 10e moved the file into `reference/` and un-ignored it**, so that
     argument is history. The snapshot stays committed for the reasons
     `gen-memo-pages.js` now gives.
   - **The guide and the generators are two parts.** 7 is the prose and 7a is
     the machinery. So the second is reviewable as a diff of a script, instead
     of 18 generated files mixed in with hand written ones.
   - **The test scripts get a sixteenth bullet's worth of page.** 16h's fifteen
     have no home for it: Playwright is the capture script and not the phase
     suites.

   **The mechanism is the part that is not prose, and it is one front matter
   key.** Phase 13 decision 6 put `test-scripts.json` in
   `api/_content/developer/`, committed, with the loader giving it no address.
   It left the half that reads it to this phase. What that turned out to be:

   - **`data:` in a gated page's front matter**, naming a `.json` file beside
     it. `api/_lib/pages.js` refuses a path, a non-JSON name, a missing file,
     and the key on a public page, all four at load time. **Proved by breaking
     it three ways**, each failing with the sentence it should.
   - **`api/content.js` sends it as a field of the page's own answer**, so it
     goes through the session check the page went through. It has no address to
     share. A file that will not parse sends `null` and not a 500.
   - **`docs-site/assets/js/test-scripts.js`**, this site's own and named in
     `gen-docs-lib.js` under `OWN`. It builds every node with `createElement`
     and fills it with `textContent`. **It is the one module on either site that
     handles a string `markdown.js` did not render.** Source code assigned as
     markup is source code that runs.
   - **The download is a `blob:` URL built in the tab.** No second public
     surface for a file whose only supported entry point is the page explaining
     what those scripts write to a live database.

   **Ten dictionary keys, both languages, and the table reuses the article's own
   table styles. 16d keeps this site to hairlines and whitespace, and a panel
   with its own frame would read as the dashboard arriving on the documentation.

   **The source was the code and the READMEs, never the specification**, which
   is part 2's rule. Every number traces to a file. 4.5 MB is the Vercel request
   body limit `AVATARS.md` is shaped around, and 64 KB is `readJson`'s cap. Cost
   12 is what the bot's bcrypt has to agree with, 100 postings is the worker's
   own cap, and 25 words is `check-copy.js`'s.

   **It found one thing and it is not fixed here.** `main-site/README.md` opens
   "Current phase: 6 of 15" and lists what is live as of phase 6, while the root
   README says thirteen of fifteen. Section 2 asks for that line to move when a
   phase ships, and it stopped moving eight phases ago. **Part 10 owns the three
   READMEs** and it is left there deliberately. The paragraph under it is a
   phase-shaped account of the whole portal, and rewriting it is that part's
   work and not a one line fix.

   **The `conventions` page cannot quote the phrase it bans**, which is the one
   place this phase's own rule bit the page describing it. `check-copy.js` reads
   these pages, so the page describes the phrase and points at `check-copy.js
   --list`, which prints it. The script is the copy of the rule that matters.

   **The checks after it.** The docs build at 30 public pages with **17
   developer entries** in the gated index, and 58 precached addresses.
   `check-copy.js` at **6,126 strings** clean, after 89 sentences over the 25
   word cap were split. `check-i18n.js` clean at 271 keys each side.
   `gen-review.js` clean with **no new exemption**: no page here carries a Han
   character, and the Singapore Mandarin table is linked and not reproduced.
   `check-precache.js` clean on both halves, and `gen-docs-lib.js --check`
   current at 43 files. `embed-tests.mjs --check` current at **16 scripts**. And
   **`tests/phase14-test.mjs` at 194**: 167, plus a `developer-guide` section of
   27.

   **Four of those 27 run in a browser**, which is part 4's lesson applied to a
   module nothing else could exercise. The table draws after the heading it
   names, and a description carrying a `<script>` tag renders as text. And **the
   blob hands back the bytes the page was given**, read back through `fetch`
   with the revoke stubbed out. Writing that check found the one defect in it,
   which was in the check and not the module.

   **Two of the 27 are the credential rule.** Nothing in `tests/` holds one
   today and every script takes what it needs from the environment. This page
   publishes all sixteen, so a key pasted into a script to debug something would
   be published with it. The pattern deliberately ignores a placeholder, because
   every script's usage lines carry `STAFF_PASS='...'`. A rule failing on those
   is a rule switched off in a week.

   **`tests/phase13-test.mjs` reads 3,198 passed, 1 failed**, and the one is
   check 24, "every committed page has a date". That is the predicted failure
   for the fourth time this phase and not a defect. `scripts/build.js` dates a
   page from git, and a page git has never seen carries no date on purpose. It
   discharges itself on the push.

   **`docs-site/sw.js` is at `v3`.** No `main-site/` file moved, so the portal's
   worker is unchanged at `v131`.

   **Four concerns were put up when the part was finished, 4 September 2026, and
   all four were answered the way they were recommended.**

   - **The 1.35 MB payload stays.** That page's answer carries sixteen scripts
     base64 encoded, which is **431 KB gzipped** over the wire. It is network
     first, and cached per tier like every other gated answer. Handing over the
     files is what the page is for. Part 4 already settled that a gated answer
     is cached and cleared on sign out and on any change of tier. Keeping it out
     of the cache was offered and declined: it would buy disk and not secrecy.
   - **The `data:` key stays general.** Any gated page may name a JSON file
     beside it. The four refusals are what make that safe. The alternative put a
     specific file name inside the content route, which is the shape this build
     has avoided everywhere else.
   - **Part 7a's pages get a section of their own**, below.
   - **`main-site/README.md` is left to part 10.** The stale part is not one
     line. The paragraph under it is a phase-shaped account of the whole portal,
     and rewriting it is that part's work.

   **Six source documents, three treatments, and the rule is who owns the
   file.** Settled 3 September 2026 by reading the two portable files' own first
   lines. 16h spells it out for one of them and not the others:

   - **Reproduced in full**, because this project owns them and nothing else
     holds them. `careers-gftv-spec.md` is "rendered as pages and not one wall".
     `next-steps.md` carries a note on the page saying it is a snapshot and not
     a live file.
   - **Pointed at, never copied**, because they are portable and travel between
     GFTV repos. 16h says outright that `gftv-official.md` is "the source and
     this page as the pointer". **`gftv-theme.md` is the same case, and 16h does
     not say so.** That file's own first lines read "Canonical source: GFTV
     PolicySpot" and "update this file when the canonical implementation
     changes". **So this repository's copy is already a copy.** A docs page
     reproducing it would be the third link in the chain, and the one furthest
     from the source.
   - **Described from, so a reader here needs no second tab.** That is
     `main-site/AVATARS.md`, and the theme page too. 16h names exactly what it
     covers: the tokens, the two axis switcher, `.glass-card`, and the loading
     primitives with their 250ms delay. Then links with no underline and one
     weight step heavier, and no gradients, orbs, blobs or emoji. **Describing
     the rules is not reproducing the file**, and the page says where the source
     is.

   The distinction matters because this build has spent two phases on one
   sentence: a copy that can drift is a copy that will. The theme is the case
   where drift would be silent. A token renamed in PolicySpot leaves a docs page
   that is wrong and looks maintained.

   **All three treatments landed as written**, and part 7a is the first of them
   being built and not described.

   **7a. The specification and the memo, as generated pages. Started 7 September
   2026 and not finished.** Two generators at the repo root, committed, each
   with a `--check`. Both are written and both run.

   **What is built.** `gen-spec-pages.js` and `gen-memo-pages.js`, and the
   twenty spec pages plus a landing page in `api/_content/spec/`. That is the
   fifth section 16h said the sidebar should be able to take. The build carries
   them: 30 public pages, 38 developer search entries, 103 pages.

   **It is twenty sections and not eighteen.** The number in this file was
   written once and never counted: 0, 0b and 0c are three of them. Nothing is
   told the number now. The generator counts what it finds, so the next section
   added to the brief gets a page without anybody editing a script.

   **Two defects, both found by generating and both fixed.**

   - **`markdown.js` looped forever on a line of `# `.** The heading rule wants
     text after the hashes, so a bare hash and a space is not a heading. The
     paragraph branch below it refuses the same shape in its own exclusion list.
     `take` consumed nothing, the cursor never moved, and `html` grew until
     `Array.push` threw `RangeError: Invalid array length` — after five minutes
     of CPU. **In a browser that is a locked tab**, on any page carrying a stray
     `# `. Fixed structurally and not for that one line: whatever nothing above
     handled becomes one paragraph, and the cursor moves.
   - **`next-steps.md` carries a byte order mark and `careers-gftv-spec.md` does
     not**, which is why the memo generator was the one that produced the empty
     heading. With the mark attached the first line does not start with `# `, so
     the title was never found. Both generators strip it, as `pages.js` already
     did.

   **`gen-review.js` grew `EXEMPT_TREES`**, a prefix list beside the per-file
   `EXEMPT`, because a generated tree cannot be listed file by file. The day the
   brief gains a section quoting 3a, a per-file list is a check failing on a
   page nobody typed. Same argument `SOURCE_TREES` was added for in part 9.

   **Four decisions, and the second went against the recommendation.**

   - **Twenty pages, the preamble on the landing page.** One chapter, one page,
     no exception to remember.
   - **Both source documents are rewritten to pass `check-copy.js`**, in place
     of exempting the generated trees. That is 1,403 sentences split and 346
     banned phrases replaced across the brief and this memo. **The concern was
     put twice and confirmed twice**, and the fact that arrived after the first
     answer is worth keeping. `check-copy.js`'s own header says "Source
     comments, READMEs, the specification, the migrations and this file's own
     tests are not copy and are left alone". Publishing the brief as pages is
     what pulls it into scope through the back door, and rewriting it inverts
     that stated design. The exemption stays a small change if anybody reverses
     it.
   - **`gen-memo-pages.js --check` reports staleness and does not fail on it.**
     It fails on a page nobody generated, a missing section, front matter this
     script would not write. It prints how far behind the file the snapshot is
     without failing, because a snapshot is supposed to lag and the page says
     so. A check that is always red is a check people stop reading.
   - **The twenty one spec pages are translated into 华文.** Exempting them was
     recommended and declined, so the whole brief is rendered in Singapore
     Mandarin and kept in step with the English. **It has to come after the
     English rewrite**, or every paragraph is translated twice.

   **It was committed as `cd2cfa9`, "phase 14 part 10", on 7 September 2026**,
   part way through the English rewrite. **The number in the log is not the
   number in this file.** What that commit holds is 7a's work. That is both
   generators, the twenty one spec pages, the sidebar fixes of part 9a's shape,
   and the rewrite as far as it had got. **So the `/docs` bot command needs a
   number that is not 10**, and whoever picks it should read this paragraph
   first. The log says part 10 is the specification pages.

   **The brief is gitignored, and that was found by this part.** `.gitignore`
   line 11 is `*spec.md`, under a comment block naming `careers-gftv-spec.md` as
   a working reference and not part of the deliverable. It was found the way
   these things are. The generated pages committed and their source did not, so
   `git status` showed twenty one files a script had written and nothing they
   came from.

   **Three things follow, and the third is a defect.**

   - **`cd2cfa9` does not carry the rewritten brief.** The committed pages were
     generated from a file that was not in the repository. That was the same
     arrangement the memo had, and was not the arrangement anybody chose for the
     specification. **Part 10e ended it for both.**
   - **Both generators now degrade instead of crashing.** A fresh clone has no
     source, so `--check` died on an ENOENT with a stack trace. Section 2's rule
     applied to a file. It names what is missing, says where it lives, says the
     committed pages are unchanged, and exits clean under `--check`. **Proved by
     moving the file away and running it.**
   - **The brief's own opening line says "it is committed", and it is not.**
     `the-specification.md` says the same thing to every developer who reads the
     docs site. Both were false that day. **Both became true when the file
     moved**, which is part 10e. The instruction of 7 September was to put the
     brief and the memo in a directory of their own and un-gitignore them. That
     is why neither sentence has been rewritten: the fix is the move, and
     correcting the prose first would mean correcting it back.

   **The English rewrite is done. `check-copy.js` reads clean over all nine
   sources**, 469 findings to zero, across all twenty sections of the brief.

   **华文 is done: all 21 pages.** `gen-review.js` reads **103 pages, every one of
   them paragraph for paragraph with its English**. The build reports 103 files
   in zh, 103 ready, 0 pages still English. Part 7a is complete.

   **Three things the checks caught in the 华文 that reading would not have.**

   - **3a's own vocabulary rule fired**, on section 10 and again on 16h. The
     English says "Simplified Chinese", "Chinese-language search" and "义工 in
     place of 志愿者", and the obvious rendering of each is a word 3a bans. The
     brief tripping over its own rule while being translated is the rule
     working.
   - **A block count came out wrong three times, and never visibly.** Twice from
     a blank line carrying whitespace, so `markdownBlocks` never split there and
     two paragraphs read as one. Once from a blank line the English does not
     have, which cut a list in two. Nothing on the rendered page shows any of
     it.
   - **Check 44 was wrong in a way only this part could expose.** It asked
     whether *any* translation was dated and skipped the lot if not, which was
     right while the tree arrived in one commit. With translations landing
     beside eighty two already pushed, `anyDated` was true and it asserted over
     the uncommitted ones. Pairing a translation against its English page is
     wrong the same way in reverse. A page can be committed while a translation
     written days later is not. **It now asks git directly**, with `git
     ls-files`, and asserts only over files git has actually seen.

   **One exemption was added and one was declined.** `check-copy.js` gains
   `docs-site/translations/zh/staff/spec/section-3.md`, beside the guide page
   that already had one. Section 3a *is* the vocabulary table, so half of its
   translation is words the check refuses. 16h's single citation of that pair
   was **not** exempted. The line points at 3a's table instead of reprinting it,
   which keeps the vocabulary rule tight on a 64 block page.

   **The docs site is installable, asked for on 7 September 2026 and built the
   same day.** It had a service worker from part 4 and no manifest, which is
   half of being installable. A browser offers the install when it has both,
   plus an icon at 192 and 512 in each purpose.

   **`docs-site/public/manifest.json` is this site's own file and not a copy of
   the portal's.** The two share a mark and share nothing else. An installed
   documentation site whose `start_url` opened the job board would be the wrong
   application on somebody's home screen. So it carries its own `id`, its own
   name and description, and its own shortcuts.

   **Part 2b's own sentence is what had to be repealed.** It copied three brand
   images. It said of the other four: "`HLC-192`, `HLC-512` and the two maskable
   variants exist for an installed application icon". It went on: "this site has
   no manifest and no worker, per phase 13 decision 3". Copying them would then
   be four files nothing on this site names. Part 4 gave it a worker and this
   gives it a manifest. So both halves stopped being true, and the four come
   across through `gen-docs-lib.js` like everything else. **Copied and never
   linked across**, which is 2b's decision unchanged. Two Vercel projects are
   two origins, and an installed icon fetched from the other one is a blank icon
   the day that project moves.

   **Precaching it cost nothing**, which is the build working. `writeWorker()`
   takes everything under `public/` verbatim, so the manifest and its four icons
   joined the list by being put there. 59 addresses became 64.

   **The shortcuts are public sections only.** A home screen menu item into
   `/staff` opens a sign in page for every reader who is not staff. 16a keeps
   the gate quiet about what it holds. There is a check for it.

   **Seventeen checks, and the file ones are the ones worth having.** A manifest
   fails silently. A browser that cannot parse it, or that follows an icon `src`
   to a 404, offers no install and says nothing about why. So every icon it
   names is resolved against `dist/`, and every shortcut against a page that was
   built. A real browser at the site root fetches the manifest, parses it, and
   requests each icon expecting an `image/` content type.

   **`docs-site/sw.js` is at `v8`.**

   **The method that made it tractable is worth writing down.** One by one
   editing was about six findings a pass. The working shape is a Python script
   in the scratchpad, holding a list of exact before-and-after pairs. It runs in
   one go and reports any pair that failed to match. A batch of twenty applies
   in a second and cannot half apply, because a pair that does not match is
   named instead of silently skipped. `tests/phase14-test.mjs` fails one check,
   part 9's "every page is translated into every language on disk". That is the
   translation above, still owed, and it reads 103 files with 9 not. The memo's
   own pages and its own rewrite were **10a's**, per part 7's settled decision
   that the generator is written here and run there. This file moves several
   times a day, and translating or rewriting it early means doing it twice.
   **They landed in part 10e instead.**

   **The memo is to be moved into a directory of its own and un-gitignored**,
   asked for on 7 September 2026, after the rewrite. That changed the argument
   in `gen-memo-pages.js`'s header, which leaned on the file being invisible to
   Vercel's checkout. It did not change the staleness design: the file still
   moves daily whether or not it is tracked.

   - **`careers-gftv-spec.md` becomes 18 pages, in a gated section of their
     own.** Settled 4 September 2026. `api/_content/spec/`, at the developer
     tier, which is a **fifth section** in the sidebar beside the four guides.

     **The reason is that `pages.js` refuses anything deeper than a section and
     a page**, so `developer/spec/*.md` is not a legal path. Two alternatives
     were offered and both declined. The first is flat `spec-00-read-first.md`
     names beside the seventeen hand written pages. That makes one sidebar entry
     of 35 items, with two kinds of page interleaved in it. The second is
     teaching the loader a third level. That file's own comment says it would
     quietly turn the sidebar, the pager and the breadcrumbs into a rewrite.
     **16h already anticipated this**: "the sidebar stays able to take another
     section later without rework". This is the first thing to ask that of.
   - **`next-steps.md` becomes its own pages at the seam**, part 10, per the
     decision above. The generator is written here and run there.
   - **The page that links them is written already.** `the-specification.md` and
     `the-working-memo.md` both carried a note saying the rendered pages arrive
     with this part. 16's cross link rule held: neither pointed at an address
     that did not exist yet.

8. **The captures and the discovery files. Pushed as `a84170a`, "phase 14 part
   8", on 5 September 2026, not yet verified against the deployment.** Written 4
   September 2026 and run 5 September. The Playwright script, its manifest, the
   docs site's own `robots.txt`, `sitemap.xml` and `llms.txt`. And **not the
   capture run itself**, which is the one part of this phase that cannot be done
   from a keyboard alone.

   **Pulling the six portal captures forward was offered and declined**, 3
   September 2026. They stay here with the staff shots. So the script, the
   manifest and the scoped Playwright config are written once, against every
   page that needs one. The six slots part 2 named keep reading as pending until
   then, which is what 16g's marker is for.

   **Four decisions were put up before it and all four were answered as
   recommended but the last.**

   - **The machinery now, the captures at the sitting.** The manifest, the
     script, the config, the scoped `package.json`, the build's refusals and the
     README section land as a diff somebody can read. The run needs a seeded
     database and a staff session, which is decision 27's by-hand sitting. The
     alternative offered was capturing the two shots that need no seed, and it
     was declined: two committed images prove less than the refusals do.
   - **The run points at production with the seed in it.** 16g says "a local or
     staging instance, never against production", and **this build has no such
     instance**. `seed.mjs` opens by saying so, because `main-site/.env.example`
     asks for the existing Supabase project. A preview deployment reads the same
     rows while breaking passkeys. So the sitting opens with `node seed.mjs
     --yes --anyway`, the shots are taken, and `--clear --yes` closes it.
     **Deviation 132**, below, is where that is written up.
   - **The manifest is the 25 slots the pages already carry**, and not 16g's
     full desktop-and-phone, light-and-dark matrix. That matrix is 100 shots, 75
     of which nothing points at. A shot nobody points at is a file nobody
     reviews.
   - **The discovery files stay inside part 8**, which is the one answer that
     was not the recommendation. Offering them as 8a was about shipping the half
     that is not blocked; keeping them here keeps the phase at ten parts.

   **The count is 25 and not the six part 2 named.** That is 6 `portal-*`, 10
   `poster-*` and 9 `admin-*`, spread over 22 pages in four guides. Every one of
   them is a picture of `main-site/`. The script lives here because the pictures
   are for these pages and the tiers are this site's idea; what it photographs
   is the portal.

   **The gated image path was already built and this is the first thing to go
   through it.** Part 5 gave `api/content.js` its `readableAsset` half. Since
   then the build has refused a gated page carrying an absolute image, and a
   public page carrying a bare name. Nothing in that had to be written again,
   which is what "the first exercise of the gated image path" turned out to
   mean.

   **Four files under `docs-site/scripts/`, and the fourth is the one that could
   have broken a deployment.**

   - **`screenshots.manifest.js`**, 16g's manifest as data. That is path, actor,
     viewport, theme, and the element to wait for. Then the element to wait for
     the *absence* of, a named routine, a clip selector, and the masks. **The
     prefix decides the tier and the directory**, and the build checks the two
     agree.
   - **`capture.mjs`**, which signs in once per actor and replays the cookies.
   - **`playwright.config.js`**, the determinism: a frozen clock, a stylesheet
     that stops everything moving, `en-GB`, and Asia/Singapore.
   - **`package.json`, carrying `"type": "module"`, and it has to.** Vercel
     installs `docs-site/package.json` and never walks into a subdirectory,
     which is 16g's scoping and the whole reason this file exists. But Node
     reads a module's type from the *nearest* `package.json`, and
     `scripts/build.js` is a `.js` file in the same directory. Without that one
     key the Vercel build stops on its first import. Found while writing it, not
     while deploying it, and there is a check for it.

   **The clock is frozen and not the dates masked**, which is the choice 16g
   leaves open. A masked date leaves a black bar in the middle of a column a
   guide is explaining. A frozen one leaves the real column reading the same
   thing on the next run. Playwright's own `clock.setFixedTime` and not a hand
   written `Date` shim. A label computed during the first paint gets the same
   answer as one computed after it.

   **Two things no seed can cover, so they are masked**: whoever ran the
   capture, in the dashboard's top right, and the staff access list. Staff
   accounts are gftv.asia's and cannot be invented, per 5g, so `/admin/admins`
   is the live list of real people whatever the seed holds. What the picture is
   for — the three access states and the second factor column — survives the
   mask.

   **The recovery code shot registers nothing.** 16g forbids photographing a
   live code and asks for a seeded fake with a caption saying so. The page's
   caption already promised the codes were invented. So the routine imports
   `recovery-codes.js` into the page and calls it with ten literals. The picture
   is the real dialog and the run writes no account and no code anywhere.

   **The run refuses to start unless the board shows a seeded posting.** Every
   posting `seed.mjs` writes says SAMPLE POSTING. That is the one thing a page
   can be asked that tells a seeded board from a real one without a database
   connection. That is the failure a person is most likely to walk into.
   Everything looks normal and the pictures are of real applicants, so it is
   checked and not remembered. `BASE` has no default for the same reason.
   `gen-screenshots.js` may default to the live portal, because an install shot
   is of the public board. This script signs in.

   **It swaps the `pending:` markers itself** for every shot it took, and leaves
   the markers of every shot it missed. Doing 25 markers across 22 files by hand
   is how a set ships with three pages still saying pending.

   **The build gained the reconciliation, in both directions**. That is what
   makes a written manifest safe here. This repository's rule is that a list
   somebody wrote is a list with something missing from it. A screenshot has no
   filesystem to be derived from before it is taken. So the manifest is the
   source, and the build is what stops it drifting. A marker naming no entry and
   an entry no page points at are both failures. Neither half can be added
   alone. **Proved by breaking it three ways**, each failing with the sentence
   it should. 16g's own build failure — a gated shot in the public directory —
   is checked against the disk and not against intent.

   **The scoping rule is `.webp` and that took a second pass.** The first
   version held *every* image to the manifest and broke
   `tests/phase13-test.mjs`, whose gated image fixture is a 1x1 `example.png`.
   Naming the fixture after a real shot was tried and is worse. The file a
   capture run commits and the file the suite refuses to overwrite would be the
   same name. The suite would stop running for good the day the shots landed. So
   the rule is that **a `.webp` is a screenshot and is held to the manifest**.
   The four other types `ASSET_TYPES` allows are not. "Every screenshot is in
   the manifest" is what was wanted; "this site may only ever carry screenshots"
   is not.

   **The three discovery files are generated by the build into `dist/`, and the
   portal's are functions.** The portal's answer depends on a maintenance switch
   read from the database, and on the set of published postings. Neither is true
   here. A page is a committed markdown file, and what is in the sitemap is
   settled at deploy time. A route would repeat on every request a computation
   the build already did once. It is also what makes them work. This project
   rewrites everything that is not `api/` or `assets/` to the shell. The rewrite
   would swallow `/robots.txt` if Vercel did not match the filesystem first.
   That is phase 3's rule, used in the right direction for once.

   **What it found is that `/staff` has never been kept out of an index.** The
   docs site has had no `robots.txt` at all and no global `X-Robots-Tag`, and
   every gated address answers 200. The shell is served at all of them and fills
   itself in from `api/content`, which is where the gate is. So a crawler
   fetching `/staff/admin/daily-run` has been getting a 200 with the shell's own
   generic card since the site went up. **Not a leak** — there is no content in
   that answer — and worth closing all the same. Fixed here with both
   instruments, because a `Disallow` is a request not to crawl and is not an
   instruction not to list. A URL somebody linked to from elsewhere can be
   listed on the strength of the link. There is no fetch, and so no chance to
   read anything. That is the portal's own argument for keeping a header beside
   its robots.txt. `--only=discovery` compares the two halves in both
   directions.

   **`llms.txt` is generated and the portal's is hand written**, and the
   difference is the number of pages. The portal has five and a paragraph. This
   site has thirty that are already grouped, titled and summarised in front
   matter. A hand written copy would be the same information typed twice, with
   nothing comparing them. It says the staff half exists and says it is not
   listed. A model that knows four guides exist and can read three will say so,
   which beats one concluding the staff guides were never written.

   **The checks after it.** The docs build clean at 30 public pages, with 25
   slots still pending and 58 precached addresses. `check-copy.js` at **6,125
   strings** clean, and `check-i18n.js` clean at 271 keys each side.
   `gen-review.js` clean, `check-precache.js` clean on both halves, and
   `gen-docs-lib.js --check` current at 43 files. `embed-tests.mjs --check`
   current at 16 scripts. And **`tests/phase14-test.mjs` at 440**: 194, plus a
   `captures` section of 225 and a `discovery` section of 21. The first of those
   is large because most of it runs per shot. That is the name against the tier,
   the tier against the directory, and every `#id` in the manifest against the
   portal.

   **`tests/phase13-test.mjs` reads 3,199 passed, 0 failed**, and check 24 is
   the reason the number is not what part 7 recorded. "Every committed page has
   a date" was the predicted failure four parts running, and part 7's push
   discharged it.

   **The check worth naming out of the 52** reads every `#id` the manifest waits
   on. It looks for each one in `main-site/`. A renamed id over there is a
   capture run that times out at 2am with the seed already written. This is the
   only thing that catches it before the sitting starts.

   **`docs-site/sw.js` is at `v4`.** No `main-site/` file moved, so the portal's
   worker is unchanged at `v131`.

   **Four concerns were put up when the part was finished, 4 September 2026, and
   all four were answered the way they were recommended.** The mask stays, and
   the six public shots stay in the precache with their size judged after the
   first run. Dark mode is judged when there are images to look at. And the one
   that changed the code: **the script gets a `--dry-run`, and gets executed
   before the sitting.**

   **Two defects were found by reading it again while writing those up, and both
   would only ever have shown in a run.**

   - **Every mask would have been hot magenta.** Playwright's default
     `maskColor` is `#FF00FF`, and seventeen staff shots carry at least one
     mask. `MASK_COLOR` is now `--surface-active` flattened, so a mask reads as
     a blank field and not as an error somebody forgot to fix.
   - **The suggestion layer would never have drawn.** `offerAnnotationLayer` in
     `shell.js` returns immediately unless `hasStaffHint()` or `hasHelperHint()`
     is true. Those are hints `api.js` writes only after an account page has
     read the roster. That is deliberate, so every page of the site does not
     spend a request asking whether this reader is a helper. A fresh context has
     neither, so `annotate.js` is never imported and there is no underline to
     photograph. The routine sets `gftv-careers.staffSeen` as well now. The hint
     is not the gate: the endpoint is still asked and still answers `can: false`
     to anybody who may not use the layer.

   **Then it was run, 5 September 2026, and the pipeline works.** `--dry-run
   --allow-unseeded --only=portal-login-desktop-light` against the live portal
   produced a **2880x1800 webp at 65 KB** of the sign in page. Right size, right
   mode, nothing mid-animation, correct name, correct directory, and nothing in
   the repository touched. That is the browser launch, the frozen clock, the
   still-CSS, the mask colour, the sharp encoding and `filesFor` all exercised
   for the first time.

   **`portal-search-desktop-light` timed out in the same run, and that is the
   wait doing its job.** The live board has zero published postings, so there
   was no `.job-card` to wait for. Checked and not assumed: `#results` exists
   and drops `aria-busy` correctly, and `/api/public/jobs.json` returns nothing.
   The shot needs the seed, which is what the manifest says.

   **What the run found that reading could not: 1440 is wide for the applicant
   pages.** The sign in form is a centred column about 420px across. So two
   thirds of that frame is empty, and the form lands small inside an article.
   **`clip: '#main'` was tried and is worse.** An element screenshot captures
   the element's own box, and the sticky header draws over the top of it. So the
   heading came out sliced in half. The real question is whether `desktop`
   should be narrower for the centred applicant pages, while the dashboard's
   tables keep the width. **That is one decision to take with all six portal
   shots in front of you, and not six guesses from one page.** It waits for the
   capture run, and the manifest says so at the entry.

   **`sharp` is pinned at `^0.35.0` and not `^0.33.5`**, which is where it was
   written. `npm audit` reported a high severity libvips advisory against
   everything below 0.35. Bumped and reinstalled; the audit is clean and the two
   calls this script makes are unchanged across the major. **The install is 38
   MB and not the several hundred a browser would be.** Playwright keeps
   browsers in a shared directory outside any project, and the root has already
   put one there for `tests/`. The README said 400 MB until the install proved
   otherwise.

   **What part 8 does not do, said plainly.** Twenty four of the 25 slots still
   read as pending and will until the sitting runs `capture.mjs` against a
   seeded board. The one that has been captured went into a temporary directory
   and was thrown away. **Nineteen of the routines have never run**, because
   every one of them needs either the seed or a staff session. What has been
   proved is the pipeline end to end on one shot. `--list` runs in a clone with
   nothing installed, and every `#id` the manifest waits on exists in the portal
   today. And the build refuses each of the five things it is meant to.
9. **华文, for all of it. Written 6 September 2026, uncommitted at the time of
   writing.** All 82 pages, both halves of the site, plus the plumbing that had
   never been built. That is two tables, the build's database connection, and
   the read path. Then the per-language search indexes, and the notice on a page
   nobody has translated.

   **Four decisions were put up before it and three were answered as
   recommended.** The one that was not is the size of the part. It was offered
   as 9 plus a 9a, plumbing and the public 30 against the gated 52. The answer
   was **all of it as part 9**. So this is one part and one diff, 82 pages and
   54,000 words of English behind them.

   **The second decision was re-asked**, because the first framing was not plain
   enough to choose from. Where the 华文 is authored: **files, with the database
   as a copy the build writes**. That is deviation 133, and
   `scripts/translations.js` opens with the whole argument.

   **The third settles the question 16e left open.** It asks "whether the public
   half should fetch its translation in the browser instead", and calls it phase
   14's to settle. 16e adds that "it trades a rebuild for a request on every
   page view". It fetches, and the service worker caches it. So a public page in
   华文 goes through `api/content` exactly as a gated page does. That is 16e's "a
   reader must not be able to tell which pipeline a page came from". It holds
   for the drawing as well as the layout.

   **The fourth was multi-select and everything was taken**: the bot's mirror
   table, a 华文 half to the search index, and `gen-review.js` covering the
   guides. That last one is phase decision 1's second half, discharged.

   **What the reader gets.** The globe in the header now changes the guide and
   not just the chrome. The sidebar's titles, the article, its on-page contents,
   the previous and next links and the search index all come from the language
   they chose. The page does not reload. A page with no translation is shown in
   English under a callout saying so, per 3a, and is in that language's search
   index in English. A reader searching a word that is on the screen in front of
   them should not be told it appears nowhere.

   **Migration `042` creates two tables and a view, and it was applied by hand
   on 6 September 2026.**

   - **`gftvjobs_docs_translations`** holds every language but English, for
     every page, gated ones included, and carries no `access` key per 16e.
   - **`gftvjobs_docs_pages`** holds the English of the **public** pages only,
     mirrored one direction for readers outside Vercel. A check constraint
     refuses a `/staff` path.
   - **`gftvjobs_docs_public`** is the view over both, and it is the part worth
     reading the migration for. **It inner joins them**, so a gated page's 华文
     joins to nothing and cannot appear. The Telegram bot's `/docs` reads the
     view and holds no tier logic of its own. That **discharges the worry
     section 2 has carried since 3 September**. The worry was that "the tier
     rule is implemented twice, once in reader.js and once in Python". The
     copies could disagree. There is no second copy to disagree.

   **The build now needs the database, which is what 16e said it would.** It
   upserts the tree into the translations table, mirrors the public pages, and
   deletes what no longer has a file. It upserts before deleting, so a renamed
   page is never in the table under neither name. With no credentials it stops
   and names both variables. `--no-database` is the only way past, and prints a
   banner saying what the output is missing. It **is refused on Vercel**,
   because a deployment is where nobody sees a banner. `tests/phase13-test.mjs`
   passes that flag, which is what keeps its own rule true.

   **The English changed in two places, and both were this part's to change.**
   `api/_content/index.md` opened "These guides are in English today", which
   part 9 is what made untrue. And **3a still said the staff half of the docs
   site stays English**, which 16f overruled on 3 September and nobody went back
   for. The paragraph now carries the correction and the date, so 3a and 16f
   cannot be read against each other.

   **`gen-review.js` grew the largest section it has.** 4,598 entries against
   the 2,191 it had, because the guides are 2,407 of them. That is every page,
   title and summary, and then paragraph by paragraph beside its English. **The
   tree is declared as a tree and not as 82 filenames**, in `SOURCE_TREES`. A
   list somebody wrote goes stale the first time a page is added. Eleven files
   gained 华文 in a comment and are exempt with a reason each.

   **All 82 pages line up paragraph for paragraph with their English**, which
   the generator reports and would name the exceptions of. That is the
   structural check that the translations kept the documents' shape. The tables,
   the callouts, the fenced blocks and the numbered steps are all where they
   were.

   **`check-copy.js` reads a ninth source** and holds the new tree to 3a's
   vocabulary table. It found seven things while the pages were being written,
   every one of them 中文 where 华文 belonged or 文档 where 文件 did. **One page is
   exempt and it is the page whose subject is the rule**. The Singapore Mandarin
   page in the translations guide is 3a's table translated, so half of it is
   words this build refuses. The exemption is one path with a reason, and the
   check fails if that path ever stops existing.

   **The checks after it.** The docs build clean at 30 public pages and 82
   translations. `check-copy.js` at **6,211 strings** clean over nine sources,
   and `check-i18n.js` clean. `check-precache.js` clean on both halves,
   `gen-docs-lib.js --check` current at 43 files, and `embed-tests.mjs --check`
   current at 16 scripts. `gen-review.js` clean at 4,598 entries. And
   **`tests/phase14-test.mjs` at 490 passed, 0 failed, 1 skipped**: 440 plus a
   `translations` section of 51.

   **The one skip is predicted, and it is check 24's shape arriving again.** A
   translation's date comes from git, and a file git has never seen carries
   none. So the check that every translation has one skips while the tree is
   uncommitted, and asserts from the push onwards.

   **`tests/phase13-test.mjs` is 3,199 passed, 0 failed**, twenty seven of them
   against the deployment, and unmoved by this part. The page count did not
   change, because a translation is not a page.

   **`docs-site/sw.js` is at `v5`** and **`main-site/sw.js` at `v132`**, the
   second because `main-site/api/_lib/supabase.js` gained the two table names.

   **Two things it fixed that were not its own.** `migrations/README.md` had no
   row for `041`, which part 4a never added; part 9 wrote both `041` and `042`
   into it. And `tests/phase13-test.mjs` ran the docs build with no flag, which
   this part would otherwise have broken.

   **Four concerns were put up when the part was finished, 7 September 2026, and
   two were answered as recommended.** The other two were answered in the
   person's own words, and both of those changed the code.

   - **"Do whatever the main site also does"**, about a 华文 reader watching a
     public page's English be replaced. The portal's answer was already written
     down in `main-site/index.html`'s pre-paint script. Hold the page hidden
     until the swap, and release it after 1200ms whatever happens. The reason:
     "a blank site is a worse failure than a flash of English". So the article
     takes the same hold, the same technique — `visibility`, so layout is
     computed and nothing jumps — and the same valve. **One CSS rule, which is
     the only CSS this part adds.**
   - **The dates.** The site now takes the later of a translated page's two
     dates. That matches the `greatest()` the view already applied, so one page
     cannot be dated twice. The build writes each translation's own git date
     under a `zh:/path` key in `updated.json`. A page path always opens with a
     slash, so the two cannot collide.
   - **"Remind the person editing the page to also check the other languages
     translations"**, which is not the build warning that was offered. So there
     is no detection: the reminder is in the README section somebody edits from,
     and in the developer guide's habits, in both languages. **The declined
     option is written down beside it.** A build that fails on a one word typo,
     until somebody re-translates a page, is a build people learn to work
     around. So the next person to want detection knows it was considered.
   - **Run the real build**, which is the one that has not happened. See below.

   **What part 9 does not do, said plainly.** **Nothing has been written to the
   database yet.** `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are not on this
   machine. `main-site/.env.local` holds the test credentials and neither of
   those two. So every run has been `--no-database`: the two tables are created
   and empty, and the first deploy is what fills them. **The upsert, the delete
   sweep, the mirror and the view have never executed against Postgres.** Until
   then the site serves English to a 华文 reader with the notice on it. That is
   the honest degradation, and exactly what the read path does when the database
   cannot be reached. **The reviewer's round trip is still owed** and is now 82
   pages larger. And **入队 reads as 少先队入队 in some Mainland contexts.** Whether it
   does so for a Singapore reader is the judgement that goes to them with the
   pages. If they say it does, part 4a's account is where to start reading.
10. **The seam, split in two on 7 September 2026.** It was one part and it is
    now **10, the bot, and 10a, the prose and the flip**. The two halves are
    Python and English, they fail differently and they are read differently. A
    single commit carrying a new bot command and a rewritten README is a commit
    nobody can review as one thing.

    **10 is the bot, and it is built.** `/docs` against `gftvjobs_docs_public`
    and against neither table. Then the start message's docs link, and
    `commands.py`'s tenth entry with the three documents that carry the list.
    And the strings in both languages. New file: `telegram-bot/docs.py`, the
    reader and the renderer. **24 checks in a `docs-command` section**, and the
    suite reads **547 passed, 0 failed, 0 skipped**.

    **The tier story is that there is no tier code.** `docs.py` reads the view
    and `supabase.py` names it in `TABLES`. Neither table under it appears as a
    value anything can resolve. Check 4 asserts that as a table value and not as
    a word, because the comment beside the entry names both on purpose.

    **`/docs` is the one list command that answers a stranger.** Every other one
    reads somebody's own account and refuses without a link. The guides are the
    public tier, the view holds nothing else, so there is nothing to scope by. A
    linked account still gets its own language.

    **It obeys no feature switch**, and that is a deliberate `feature=None`
    beside nine commands that have one. A reader turned away from the manual
    during an outage is a reader turned away from the page explaining the
    outage. `start` obeys nothing for the same reason.

    **Three things the renderer found by being run over all 103 real pages.**

    - **The pager handed back a 12,165 character message.** Telegram's cap is
      4096. Breaking on headings and then on paragraphs is not enough. Section
            6's schema list is one continuous run of bullets, with no blank line
            anywhere in it. It now falls back to lines and then to a hard cut.
            **All 230 messages now fit and every tag balances**, which is the
            other half: an unclosed `<b>` is a message Telegram refuses.
    - **Relative links were not links.** The guides link to each other by
      address, `[Linking your account](/bot/linking)`. That is right on the
      site, and is not a URL in a chat. A relative href is joined to `DOCS_URL`,
      and with no base the anchor is dropped and **the words are kept**.
    - **`markdown.js`'s own lesson arrived again.** These files are wrapped at
      eighty columns, and sending them line for line put a ragged column in a
      window that is already narrow. Lines inside a paragraph are joined, which
      is the rule the site states in as many words.

    **`DOCS_URL` is optional**, like `DONATION_URL` and for 16's reason: a link
    must not ship before the thing it points at. Without it `/docs` still
    answers, because it reads Supabase and not the site. What goes missing is
    the start button, the "read this on the site" link, and a relative anchor.
    **Phase 13 lost a fortnight to a required variable nobody had set**, and
    that is why this one cannot stop the bot. A malformed value is still
    reported, and reported *before* the raise, which is where the first draft
    put it wrongly.

    **One thing it does not do, and it is the view's shape.** The section menu
    sorts by slug, so the bot guide comes before the portal guide, while the
    site's sidebar orders by the `order` front matter. `gftvjobs_docs_pages`
    carries no `order` column, so the bot cannot know it. The two ways to fix it
    are a migration adding the column, or a hardcoded order in Python. The
    second is exactly the second copy this part exists to avoid. Left as slug
    order, written down here.

    **It has never run against Telegram.** The whole flow was driven end to end
    against a stubbed view and a fake event. That is index to section to page,
    the callback registry round trip, the pagination, and a malformed path
    refused before it became a filter. What is untested is Telethon actually
    sending these messages, which is decision 27's by-hand sitting.

    **10a is everything else, and it is built.** `checkEnv()` called on both
    sites, item 30's named list of the writes that leave this build,
    `main-site/README.md`, the root README, and the checks. **23 checks in a
    `reach` section**, and the suite reads **570 passed, 0 failed, 0 skipped**.
    The flip is not here: the webhook notice goes in front of it.

    **Item 29 is closed, and the reason it had never been done is worth
    keeping.** `checkEnv()` reported `TELEGRAM_BOT_USERNAME` missing on a
    perfectly healthy portal. `KNOWN` is the documentation list, and that one is
    read through `optionalEnv` with a default. **An `ok` that is false in the
    ordinary state is an `ok` nobody can build a check on**. That is very likely
    why a function written for exactly one outage was called by nothing, while
    that outage ran for a fortnight. An `OPTIONAL` set fixes it, and `ok` is now
    true exactly when the deployment is configured.

    **The call site is a health route on each site**, `api/public/health` on the
    portal and `api/health` on the docs site. Not generated. The two import
    their own `env.js`, whose `KNOWN` lists differ, and a shared copy would have
    to be told which site it was on.

    **It answers a count and never the names.** `{ ok, missing }` where
    `missing` is a number. The names are in `.env.example` in a public
    repository so naming them would leak little. It would still be publishing
    which part of a live deployment is broken, to whoever asks first. The names
    go to the runtime log, which is where the original `SITE_URL` stack trace
    already was and where nobody was looking. **The point is not a better error
    message. It is a check that can go red without anybody looking**, and
    `--only=live` asking as a stranger is exactly what this route is for.

    **Item 30 is closed as decided: the list is built.** `GFTV_ASIA_WRITES` sits
    beside `HELLO_WRITES_ENABLED` and names three writes across five routes.
    They are `password_hash` from `account` and `reset-password`, and
    `totp_secret` from `totp` and `danger`. The third is
    `gftvhello_backup_codes`, from `recovery-codes` and `danger`. That last is
    the fourth path the hold never covered.

    **The check reads the routes' own claims and not the list's word for it.**
    Item 30's observation is that the code always said this correctly. The audit
    row records `reaches: 'gftvhello_backup_codes'`, and only the prose count
    was wrong. So the check extracts every `reaches:` claim from
    `api/auth/staff/` and compares the two sets **in both directions**. Nothing
    claimed is unlisted, nothing listed has stopped claiming it, and each entry
    names exactly the routes that perform it. **It was proved by dropping a
    route from the list and watching check 12 fail.**

    **Keying it on the response flag would have been wrong**, and that is
    check 13. `forgot-password.js` answers `reaches_gftv_asia: true` and writes nothing at all. It issues a reset ticket, and tells the reader whose password is about to change. The write happens in `reset-password`.

    **`main-site/README.md` opened "Current phase: 6 of 15" and now opens 14.**
    The paragraph under it is rewritten as an account of what is actually live.
    The root README's `check-copy.js` row said "3,536 strings today" where the
    script now reads about 6,500 over nine sources. Both new generators are
    documented there, and the bot is ten commands everywhere that file counts
    them.

    **The sidebar fix was going to ride in 10 and became part 9a instead**,
    pushed as `e86f53b` on 7 September 2026. It was offered as a 9a, and the
    answer was to push it with part 10. Then the tree was committed before part
    10 was written, which settled it back to 9a. A commit landing on its own
    cannot be named for a part that does not exist yet. The account of it stays
    here, under the part it was going to belong to.

    **What it was.** Reported from the live site. Open a section in the docs
    sidebar, change language, and the section headings stop responding until the
    page is reloaded by hand. `drawSidebar` replaced the mount's innerHTML and
    then added its delegated click handler. And **the mount outlives the
    redraw**, so the language change, which refetches and redraws the sidebar,
    left two handlers on one element. One click ran both: the first opened the
    section and the second read the attribute the first had just written and
    closed it again. `addEventListener` de-duplicates a function reference and a
    fresh arrow function is not one.

    **It reads as intermittent because an odd number of handlers works.** A
    third language change makes it behave again, which is worth knowing before
    anybody tries to reproduce it by pressing the control once.

    **The same shape was found beside it and fixed with it.** `drawAccount`'s
    two `document` listeners were added on every redraw too. Each copy but the
    newest closed over nodes that had already been thrown away. Nothing a reader
    could see was wrong, which is the reason to fix it now and not later. Both
    are pulled out into `wireSidebar()` and `wireAccount()`, called once beside
    `wireMenu()`. The account handlers look their nodes up when the event fires,
    instead of holding them.

    **Four checks, and they were proved against the defect.**
    `tests/phase14-test.mjs` 26a to 26d, in the `browser` section. The sidebar
    redrew in the new language, the section starts closed, it opens on a click,
    and it closes again. **Pressing once proves nothing**, so the sequence draws
    twice and then presses. The stand-in server's `/api/nav` now answers with
    one section whose title differs by locale, where it used to answer with no
    sections at all. That is why the suite had nothing to say about the one
    control in there. **26c was confirmed failing on the unfixed shell and
    passing on the fixed one**. That is the only way to know a new check is
    worth its line.

    **Check 37 was rewritten because it would have failed next.** It asserted
    the literal `careers-gftv-docs-phase14-v5`, which is honest on the day part
    9 ships and wrong on every day after. The sidebar fix took the worker to
    `v6`, and this was the only thing in either suite that objected. It now
    reads the number and asserts it has not gone backwards from part 9's floor.

    **`docs-site/sw.js` is at `v6`.** No `main-site/` file moved, so the
    portal's worker stays at `v132`.

    **Two stale things are waiting in 10a, both found while writing other parts
    and both left deliberately.** `main-site/README.md` opens "Current phase: 6
    of 15", eight phases behind the root README, found by part 7. The paragraph
    under it is a phase-shaped account of the whole portal, which is this part's
    work and not a one line fix. And the root README's `check-copy.js` row says
    "3,536 strings today" where the script now reads **6,211 over nine
    sources**. Part 8 found it at 6,125, and part 9's ninth source moved it
    again. Both parts touched that table for their own reasons and left the
    number alone instead of doing half a README pass in the wrong part.

    **Two of the three READMEs are no longer waiting.** Part 9 wrote
    `docs-site/README.md`'s build, translation and pre-deploy sections and added
    `041` and `042` to `migrations/README.md`, which had no row for either. What
    is left here is `main-site/README.md` and the root one.

    **What the log actually holds between `cd2cfa9` and `102e6fe`.** Five
    commits, and their messages are not what this file calls those parts.
    `cd2cfa9` "part 10" and `a1c2b0a` "part 10a" are 7a. That is both
    generators, the twenty one spec pages, and the English rewrite as far as it
    had got. `c292a55` "part 10b" is the rest of that rewrite plus the docs
    manifest's four icons. `8896377` "part 10c" and `102e6fe` "part 10d" are the
    华文 for the spec pages, and 10d carries the bot's `/docs` and the seam with
    them. **Read the paragraph above before picking the next letter.** The log
    and this list disagree from `cd2cfa9` onwards, and nothing can fix that now.

    **10e is the memo's own pages, the move, and one defect the move exposed. 8
    September 2026.** Four decisions were put up before it and all four
    answered. The number is 10e, the nine pages are translated into 华文, and the
    move happens in this part. And the memo is rewritten to pass `check-copy.js`
    instead of being exempted from it.

    **The move is `reference/`.** `careers-gftv-spec.md` and `next-steps.md`
    both live there and both are committed, per the instruction of 7 September.
    Two sentences that were false became true by it. One is the brief's own
    opening line saying it is committed; the other is `the-specification.md`
    saying the same to every developer. Neither was rewritten while it was
    false, because the fix was the move.

    **The defect it exposed is that `gen-spec-pages.js` and `gen-memo-pages.js`
    were gitignored too**, by `gen-*.js`. Nobody had added the negation the
    other four generators have. So 7a committed twenty one pages generated from
    a file no clone held, using a script no clone held either. This file said
    "two generators at the repo root, committed". Both are in `.gitignore` as
    `!` lines now, with the account beside them.

    **The memo now passes `check-copy.js`, and that was the size of the part.**
    999 sentences over the 25 word cap and 176 uses of the banned phrase, across
    6,511 lines. The alternative was exempting the memo tree, which
    `gen-review.js` already describes as "not copy in any language". It was
    declined: these pages are published and a reader meets them.

    **A re-wrap followed, and it is a script that refuses.** Every edit landed
    inline, so 901 lines ended up over eighty columns and one was 876 characters
    long. The rewrapper compares each block with its rewrapped self on
    whitespace-collapsed content, and leaves anything that differs alone. It
    refuses any line a wrapper would turn into a list marker or a table row. It
    checks the whole file the same way before writing. It rewrapped 730 blocks
    and refused 5, all five being a sentence that would have started a line with
    a number and a full stop.

    **The re-wrap found five more of the banned phrase.** They had been wrapped
    across a line break for months, so `check-copy.js` never saw them. Its
    pattern is one line at a time, and "rather" and "than" were on different
    ones. Joining the lines is what made them visible. That is a smaller version
    of the rule this file keeps arriving at. A check sees the shape it was
    given, and not the thing itself.

    **The number in the log is 10e and the number in this file is 10e.** That is
    the first time since `cd2cfa9` it has been true.

    **10f is four things a reader asked for, 8 September 2026.** Portal and bot
    work, split off 10e for the reason 10 was split from 10a. A commit carrying
    nine generated memo pages and a Telegram keyboard is a commit nobody can
    review as one thing. Numbered at the asker's direction.

    **The `/docs` pager is three seats and never two.** The first page reads
    Last, page, Next; the last page reads Previous, page, First; every other one
    reads Previous, page, Next. The seat that has nowhere to go wraps instead of
    disappearing. The row does not move under a thumb that is already resting on
    it. Somebody who has read to the end of a nine part page can get back to the
    start without scrolling up to the menu.

    **The middle seat says where the reader is and goes nowhere.** Telegram
    gives an inline button no way to be inert, so it answers with the same "4 of
    9" the message already carries. **The numbers ride in the callback
    payload**, which is what makes that free. The alternative is reading the
    page back out of Supabase and paginating it again, to learn a number the
    button had when it was drawn.

    **The navigation buttons carry emoji in both languages**, which is the other
    half of the same request. They are `◀️ Previous`, `Next ▶️`, `⏮️ First`,
    `Last ⏭️`, `↩️ Back to the guides` and `📄 4/9`. The arrow is the half a
    reader sees first, and on a phone often the only half. A Chinese label and
    an English one are different widths, and the arrow is the same in both.

    **`helper.lede` was being shown to a helper**, in the box that opens when
    they select wording and offer a correction. The line naming where the words
    are printed the dictionary key for an interface string. That says nothing to
    the person being asked what is wrong with it, and reads as a fault on the
    page. A posting field was already named properly beside it. **Nothing is
    lost by dropping it.** The key still travels as `target_key`, and the review
    queue draws it twice. That is where somebody about to change a string needs
    it, and this is where somebody about to describe a problem does not.

    **English is a grantable helper language now**, asked for so a wrong English
    string can be fixed by the people who find it. It was excluded on the
    argument that `014` refuses a translation row for the default language. An
    English helper would hold a role over nothing. That reads the role as the
    translation queue alone, and it is not. `gftvjobs_translation_helpers` is
    also what `annotator()` reads to decide who may suggest a correction in
    place. A helper granted English has no translations to draft and every
    English string on the site to correct.

    **The route agrees with the page, and the route is what decides.**
    `grantable` and `helperLocale()` both accept the default language now.
    `admin.grantHelperBody` says in both languages what the role means, when the
    language is the one everything is translated from.

    **One check asserted the old rule and now asserts the new one**, phase 8's
    78, which reads the roster's `grantable` list. It runs against the
    deployment, so it is owed after the push and not before it.

    **The bot guide moved with the pager**, in English and in 华文. The page
    describing Previous and Next would otherwise be describing a keyboard that
    no longer exists. Three checks were added to `docs-command`, 22 to 24e. They
    are the wrap at both ends, the middle seat carrying its total and going
    nowhere, and every navigation label carrying its emoji.

**The webhook confirmation notice is not a part**, per the decision of 1
September 2026. It is its own commit, numbered the way `2c27a2b` was. It is
portal and bot work, and this phase's subject is prose. **Where it falls was
settled on 7 September 2026: after 10a and before the flip.** So the phase's
remaining order is **7a, 10, 10a, the notice, then the flip**. 10a's own list
ends at the checks and not at the flip. The flip is the last thing that happens,
and the notice is in front of it. That is phase 13's walk, lift, then flip, in
this phase's shape. The forty cases phase 11 part 5 owes are re-walked at
decision 27's by-hand sitting, which is already owed and already opens with a
seed.

### Part 1 in detail, because it is the one that is not prose

**What was found, 3 September 2026.** `gftv-theme.md` is applied to the docs
site as a token contract and **not as the chrome it also specifies**. Phase 13
and section 5 item 27 both recorded the first half and called the second half
the specification. That was wrong, and item 27 carries the correction.

- `theme.css` and `theme.js` are generated in, the tokens apply, and part 7
  measured every component in all four combinations. **That part is real.**
- **`icons.js` is generated into the docs site and its shell uses it zero
  times.** `docs.css` defines no `.icon-btn` at all.
- The mode control is `<button class="docs-btn docs-btn-quiet" id="docsMode">`
  with the word "Light" or "Dark" in it. The language control is a bare
  `<select>`.
- `gftv-theme.md` is not only colour: **its section 3 is HTML**, prescribing the
  modal markup verbatim. That is `.modal-backdrop`, `.modal.glass-card`,
  `role="dialog"`, an `.icon-btn small` close, and Mode and Colour theme
  sections. Its non-negotiable rules say a reader opts into dark "explicitly in
  the theme modal". Its acceptance checklist has **"theme button icon matches
  the active mode"**. That presumes an icon button this site has not got.

**Two decisions, both settled 3 September 2026 with the conflict on the table.**

- **Extract and generate, one implementation.** The two modals live inside
  `main-site/assets/js/shell.js`, and the docs site has its own `shell.js` by
  design. So they come out into their own module for `gen-docs-lib.js` to copy.
  That is decision 1's pattern, applied to a file that was never split that way.
  `docs.css` defines `.icon-btn` and the modal classes in its own language. That
  is decision 8's adapter working exactly as it did for the nine settings
  panels. Writing docs-native modals was offered and declined: a second
  implementation of a control `gftv-theme.md` prescribes exactly is the
  duplication decision 1 exists to prevent.
- **Both axes, overruling 16d.** Mode *and* colour theme, as the theme file's
  markup prescribes. 16d gives this header "the light and dark toggle" and no
  colour control. **This is the third edit this build has made to the
  specification**, after part 6a's language overrule. The argument is that the
  `hello` palette is already generated into this site. Part 7 already measured
  every component against it in all four combinations, so nothing is unproven.
  It lights up a palette that is currently paid for and unreachable. Section 5
  item 27's "nothing is owed unless somebody wants the choice to carry" is
  answered: somebody does.

**What the part covers, surveyed 3 September 2026 and smaller than it looks.**
The survey is written down because two of its three findings remove work that
the plan above assumed:

- **No new CSS.** `theme.css` already defines `.icon-btn`, `.modal`,
  `.modal-backdrop`, `.swatch`, `.mode-toggle`, `.mode-btn` and `.locale-btn`,
  and **it is already generated into `docs-site/`**. That site has been shipping
  the styles for controls it never built. That is the same half-application this
  whole part is about, seen from the stylesheet's end.
- **One missing dependency, and it is portable.** The two modals are built by
  `createDialog` from `dialog.js`, which the docs site does not have.
  `dialog.js` imports `i18n.js` and `icons.js` and nothing else, both already
  generated, so it goes across as an `Identical` file with no transform rule.
  **`danger-confirm.js` builds its own `<dialog>` element** instead of using it,
  which is why the docs site has worked without it until now.
- **The four functions come out of `main-site/assets/js/shell.js`** into a new
  `assets/js/chrome-modals.js`: `renderThemeModal`, `renderLanguageModal`,
  `wireThemeModal`, `wireLanguageModal`. They already address their buttons as
  `#themeButton` and `#languageButton` through `document.querySelector`. So
  **the docs header uses those same ids**, and the module needs no parameter for
  it. Identical means identical.

So the work is the extraction, and two entries in `gen-docs-lib.js`. Then the
header markup in `docs-site/shell.html`, swapping a text button and a `<select>`
for the palette and globe icon buttons. Then `hydrateIcons` called in the docs
shell for the first time, and the dictionary keys both modals need in
`docs-site/assets/i18n/`, which `check-i18n.js` will name. Then retiring the
`header.mode*` keys nothing will use any more. And checks that the docs header
carries both controls, and that the `hello` palette is reachable from it.

**The portal must come out of this unchanged**, which is the risky half.
`tests/phase12-test.mjs` is the file that says so, and the extraction moves code
out of the file that draws every page's header.

**Two parts are large enough to be worth watching.** Part 4 at 19 pages is more
than any phase 13 part carried. Part 6 has to render this specification and this
memo as pages. Splitting either into two was offered and declined. If part 4
runs long, splitting it at the boundary between postings and applications is the
seam that was already identified.

### The decisions this phase owes

They were listed so the phase would start by settling them instead of
discovering them. **Decisions 1 and 4 are settled and built; 2 and 3 are still
open.**

1. **How a guide's translation is authored and reviewed. Settled by part 9, 6
   September 2026, and both halves are built.**

   **Authored as files**, under `docs-site/translations/<locale>/`, keyed by the
   page's own address, upserted into `gftvjobs_docs_translations` by the build.
   Deviation 133 is the whole argument, including what it costs.

   **Reviewed on the page `gen-review.js` already writes.** It grew a section
   for the guides: every page, its title and summary, then paragraph by
   paragraph beside its English, at 2,404 entries. The tree is declared as a
   tree and not as 82 filenames. A page added later is on the reviewer's page,
   without anybody remembering to say so. It reports any page whose two halves
   stop lining up paragraph for paragraph; all 82 line up today.

   **The round trip is still outstanding and is now larger**, which is the part
   nothing here discharges. It has been with the reviewer since 31 August and
   the 82 pages go with it.
2. **Whether the guides are versioned against the phase that built the
   feature.** A guide describing a screen that changes in 15 is a guide nobody
   notices is stale.
3. **Whether `--only=walk` belongs in a phase file**, from section 3's new rule.
   The probes that checked item 24's walk live in a scratchpad. Every step of a
   by-hand walk leaves a row that a script can read.
4. **What the docs site's `sw.js` decision becomes**, and it is two questions
   and not one. Phase 13 decision 3 said no worker while the content was five
   placeholder pages. **Seventy six pages is the case that was deferred**, and
   decision 3's own reason now argues the other way. A stale gated page is worse
   than a missing one. A staff member following a procedure from a cache after
   the step changed is the failure that reasoning was about.

   **If there is a worker there is an update bar**, and `update-bar-spec.md` is
   portable by its own first lines. It says "drop it into any site that ships a
   service worker". The portal already implements its honest option: nothing
   calls `skipWaiting()` in install or activate, and `offline.js` posts
   `skip-waiting` only when a reader presses Reload. So this is a second
   instance of decision 1's question: one implementation generated into both
   sites, or two. That is the fourth time, alongside the official banner in
   section 5 item 28.

   **And it drags check-precache.js's second half with it**. That check is about
   the portal today. A docs worker means a precache list on this site that
   nothing yet compares against the files on disk.

### Before the phase is called done

- **`node docs-site/scripts/build.js`**, from `docs-site/`, which is the one
  check that is also the deploy. **It needs the database, as of part 9**, which
  is where that stopped being a forward looking sentence. It writes the two
  documentation tables, and refuses to run without `SUPABASE_URL` and
  `SUPABASE_SERVICE_KEY`. On a clone with neither, `--no-database` builds the
  files alone and prints a banner saying what is missing. It is refused on
  Vercel.
- **`node gen-docs-lib.js --check`**, which fails when a change lands in
  `main-site/api/_lib/` or `main-site/assets/js/` and stops there. **As of part
  2b it also covers three images at the portal's root**. So a rebranding that
  changes `favicon.ico` or `HLC-main.png` is caught here, instead of leaving the
  docs site on the old mark.
- **`python commands.py --check`**, from `telegram-bot/`. Three documents as of
  part 3, the third being the guide's command reference on the docs site.
- **`node check-i18n.js`**, both sites. **`node check-copy.js`**, which reads
  both content trees and is the check this phase leans on hardest.
- **`node gen-review.js`**, which fails on any file shipping 华文 that is on
  neither of its lists.
- **`node check-precache.js`**, unless decision 4 above gives the docs site a
  worker, in which case it grows a second half.
- **`node tests/phase13-test.mjs`**, **3,199** as of part 7, twenty seven of
  them against the deployment. It was 677 at the end of phase 13, 1,321 after
  part 2 was pushed and 1,977 after part 3. The number moves with the page
  count, because the responsive section runs per page. A part that adds fourteen
  pages adds around 650 checks. **It takes upwards of half an hour now.** Run
  `--only=live` after every docs deploy, and the whole thing once per part.

  **Check 24 fails while a part sits uncommitted**, every time, and it is the
  predicted failure and not a defect. `scripts/build.js` dates a page from git,
  and a page git has never seen carries no date on purpose. It read 1,976 and 1
  before `12ec9de` and **3,198 and 1 before part 7 was committed**, and the push
  discharges it in both cases.
- **`node docs-site/scripts/embed-tests.mjs --check
  docs-site/api/_content/developer/test-scripts.json`**, from the repo root and
  new as of part 7. It fails when a script in `tests/` has moved and the
  committed copy the developer guide serves has not been rewritten. **Editing
  `tests/phase14-test.mjs` is a change to `tests/`**, so this is the one check
  in the list whose own suite can invalidate it.
- **`node tests/phase14-test.mjs`**, **483** as of part 9. Needs no credential,
  no database and no network, and writes nothing. But the `browser`, `contrast`,
  `a11y`, `worker`, `install` and part of `developer-guide` read
  `docs-site/dist/`. So run the build first, or they skip with a sentence saying
  so. **`--only=install` is the one that runs a service worker**, in a real
  Chromium against the stand in server. It is the only check in either suite
  that does.

  **It skips exactly one check while part 9 sits uncommitted**. That is the same
  predicted failure phase 13's check 24 has, and for the same reason. A
  translation's date comes from git, and a file git has never seen carries none.

  **It can be run beside `tests/phase13-test.mjs`, as of part 6.** That suite
  plants a fixture page and image inside `api/_content/admin/` and removes them
  at the end. An overlapping run used to read a fifteenth admin page and a ninth
  screenshot slot. Check 62 skips the two fixture names by name now.
- **`node tests/phase12-test.mjs --only=contrast`** whenever `theme.css` moves,
  which part 1 is the reason to say out loud. That file is generated into both
  sites, so a token edit made for one of them lands on the other.
- **`node tests/phase12-test.mjs`** in full, at **554 passed, 0 failed, 6
  skipped**, re-run after part 4 pulled `offline.js` in half and unchanged by
  it. `tests/phase10-test.mjs` was re-run for the same reason and is **127
  passed, 0 failed**. It is the portal's own offline suite, so it is the check
  that the refactor did not move the worker underneath it.

  **The six skips are the same six as of part 2a**. They are the four that need
  staff or applicant credentials, the sitemap comparison that needs a posting,
  and the service page preview. `--only=seam` is 49 of those. **Run the whole
  suite and not the seam alone after a phase flips**. Two of its checks had been
  failing since phase 13 shipped, and nobody had run it.
  `tests/phase10-test.mjs` and `tests/phase11-test.mjs` are at **127** and 89.
- ~~**The bot's tier logic against the site's**, if `/docs` is built~~. ~~It is
  the test that does not exist yet, and is the price of that decision.~~
  **Discharged by part 9 instead of paid.** `gftvjobs_docs_public` inner joins
  the translations to the public mirror, so a gated page cannot appear in the
  view at all. The bot reads the view and holds no tier logic, which leaves
  nothing for a second copy to disagree with. Part 10 builds `/docs` against
  that view and against neither table.
- **Phase 12's owed items**, in section 5. They are part 4's round trip, part
  2's by-hand half, phase 11's 29 step walk, and the seed re-cleared after
  decision 27's sitting. None of them gate this phase and none of them go away.

---
