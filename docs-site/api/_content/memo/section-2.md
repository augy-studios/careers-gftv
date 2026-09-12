---
title: 2. This phase. Phase 15, More languages.
access: developer
order: 2
summary: Malay and Tamil, and nothing else.
---

# 2. This phase. Phase 15, More languages.

**Malay and Tamil, and nothing else.** 3a built the portal to take a language
without a migration: a row in `gftvjobs_locales`, a dictionary file, and the
content. Phase 15 is those three things twice over, and it is the last phase.
`build-status.json` lists it last "because it depends on finding people to
write and check it", and that dependency is the whole shape of the phase. The
build can put every file in place in an afternoon. The words in them are
somebody else's, and the round trip with that somebody is what the phase
waits on.

**Written at the start, 11 September 2026, the day phase 14 flipped, and
rewritten at the end of part 2 the day after.** Section 6 held what this
phase inherits until now, and it is moved here because this is where it is
worked from. **One thing changed after the decisions were settled.** The user
said on 12 September that Malay and Tamil "will not be available even after
phase 15 ships". They were always a future plan, and the backbone is what
ships. So the two landing parts left the list. The switch for each new
language defaults to off and stays off until somebody turns it on. The
inheritance below is left as written, and the parts say what became of it.

## What the earlier phases handed over

- **A locale is three things, per 3a.** A row in `gftvjobs_locales`, a
  dictionary file on the portal, and the translated content. No schema change.
  The switchover of `/status` to the service status page happens by itself the
  day this phase reads `shipped`. `everyPhaseShipped()` decides which of the
  two pages that address serves, and nothing has to be remembered.
- **The dictionaries start as copies of the English**, asked for on 11
  September 2026. `ms.json` and `ta.json` are created as copies of `en.json`,
  every value still in English, on the portal. The point is the handover. The
  file is sent as it is to whoever adds the language. They type into the copy
  instead of into a list somebody assembled for them. That is
  `gen-review.js`'s argument in reverse: for a language nobody here reads, the
  file itself is the page worth sending.
- **A language is published or it is not, and the file existing is not what
  publishes it.** Asked for the same day. The two files sit in the repository
  from the first part. A toggle per language decides whether the portal
  applies one. An unpublished language is not on the language control and is
  not offered by the pre-paint script. A posting's translation into it is not
  served either, though it can be written. Decision 2 below kept the editor
  tabs and the helper area open to an unpublished language, since that is the
  one that needs working in. That is what keeps an English copy off the site
  while somebody is filling it in. It is also the answer to what section 6
  called a decision.
- **The toggle lives on `/admin/maintenance`, beside every other shipped
  switch.** Settled 12 September 2026, and it is the second time this phase
  was told where something goes before it started. Chinese, Malay and Tamil
  each get a switch there. English does not. It is the default and the
  fallback layer under every dictionary. So it goes on the `DENYLIST` with
  its reason, the way `applicant_login` is there. **What that decides, and
  what it still leaves.** A switch on that page is a feature key in
  `build-status.json` with an override row in `gftvjobs_settings`. Every page
  and the bot read it through `feature-status`. So each language becomes a
  key, Chinese's under the phase that shipped it and the other two under this
  one. That also settles the sentence for the two before they are translated.
  A key whose phase has not shipped reads "will be available in Phase 15",
  and after the flip the switch reads as any other. **What it leaves is the
  three copies.** `LOCALES` in `i18n.js`, `gftvjobs_locales.is_active` and
  `locales` in `build-status.json` all list languages today, and none of them
  reads an override. The first part decides which of them the switch replaces
  and which merely read it. A language switched off has to leave the control,
  the pre-paint script, the posting editor's tabs and the bot's `lang.py` in
  the same pass. Otherwise the site speaks a language it says it has switched
  off. And a reader whose stored choice is a language that is off falls back
  to English, quietly. That is 3a's rule for a missing dictionary applied to a
  present one.
- **Two things follow from a copy, and neither needs a decision.**
  `check-i18n.js` compares key sets, so a copy passes it from the first day.
  `check-copy.js` reads the dictionaries under the 25 word cap and reads an
  English copy as English, which is what it is.
- **The bot's `strings.py` is Python and not JSON.** Whether it gets the same
  copy treatment is this phase's to decide. Its import check refuses a locale
  whose keys do not match, so a copy passes there too. `lang.py` maps a
  Telegram client language onto the shipped locales by prefix, from
  `build-status.json`. So a published language needs no edit there, and an
  unpublished one must not appear in that list.
- **The docs site stays at two languages, and never needs a third.** Settled
  11 September 2026. The guides are English and 华文, the docs dictionary is
  the same two, and nothing in this phase touches `docs-site/`. The published
  toggle is the portal's alone. Deviation 133's arrangement, a file per page
  under `docs-site/translations/<locale>/`, is still the shape a third
  language would take if that ever changes. This is where to read first.
- **A word count is an English measurement**, from phase 12 part 1. 华文 has no
  spaces; Malay has them and Tamil has them and neither breaks the way English
  does. Every check that counts words, characters or line breaks was written
  against two scripts. This is the phase that finds out which of them assumed
  it.
- **The official site banner is the last thing in the build**, section 8 item
  5. It is two banners: the portal's shell and the docs shell. It waits on
  every phase shipped and on the trusted sites page existing, because the link
  must not ship before the page does. Whether it belongs to this phase or to a
  commit after it is decision 4 below.

## The decisions, settled 12 September 2026

Put to the user before any code was written, and settled in one sitting. The
list below is what the five decisions became.

1. **Switch first, then one landing part per language.** Part 1 is the
   switch, both copies, the two locale rows, and every check that assumed two
   languages. Part 2 is Malay landing and part 3 is Tamil, in whichever order
   the round trips return. The copies cost nothing and the round trips are
   per person, so the parts do not care which finishes first.
2. **The feature keys replace the `locales` list in `build-status.json`.**
   `locale_zh` under phase 1, `locale_ms` and `locale_ta` under this
   one, and `locale_en` on the `DENYLIST` as the fallback layer. A language
   is published when its key's phase has shipped and nobody has switched it
   off. That is the test every other feature already passes. The `locales`
   array is derived from those keys, so the bot reads what the switch says.
   `LOCALES` in `i18n.js` stays a static list of the dictionaries that exist.
   The published test filters it at runtime, on the control, the pre-paint
   script, `validate.js` and `job-page.js`. **`is_active` is not the switch
   and stays true for all four.** It means staff and helpers can work in the
   language, and an unpublished language is exactly the one that needs
   working in. `more_languages` leaves the `DENYLIST` and the feature map,
   since the three language keys are what it stood for.
3. **The bot stays English until the chat is translated, and offers only
   what it has.** No copy in `strings.py`; `text()` already falls back to
   English for a locale it lacks. `/language` and `lang.py` offer a locale
   only when it is published and present in `STRINGS`. So the bot never
   offers Malay and then answers in English. A chat translation, when it
   arrives, is a third table and the language appears by itself.
4. **The banner is the last part and ships with the flip.** Part 4 is the
   official site banner on both shells and the flip, in one commit. That is
   the one time the flip carries anything else, and it is written here so
   nobody reads it as the precedent.
5. **Inherited from phase 14, still open.** Whether the guides are versioned
   against the phase that built the feature. And whether `--only=walk`, a
   section that reads the rows a by-hand sitting leaves, belongs in a phase
   file. Neither blocks anything, and neither was settled.

## The parts

Three, since 12 September 2026. Malay landing and Tamil landing were parts 2
and 3 for a morning. They left when the user said the languages stay off after
the flip. Switching one on later is a procedure, in section 8 item 5a, and not
a part.

1. **The switch and the copies. Built 12 September 2026.** Below.
2. **Rich messages. Built 12 September 2026.** Below. The bot's two fixes
   from 11 September, the 504 report and the `/language` redraw, are in it.
3. **The banner and the flip.** Section 8 item 5 on both shells, linking
   `https://gftv.asia/trusted-sites`, which the user gave on 12 September.
   Then `shipped`, in the same commit, per decision 4. That is also the day
   `/status` becomes the service status page by itself. It is the day
   `locale_ms` and `locale_ta` appear on `/admin/maintenance`, off.

## Part 1, the switch and the copies

**A language is a feature key, `locale_<code>`, and there is no other list.**
`locale_en` and `locale_zh` under phase 1, `locale_ms` and `locale_ta` under
this one. `build-status.json` lost its `locales` array. `api/_lib/locales.js`
derives everything from the keys: `knownLocales()`, `shippedLocales()`, and
`publishedLocales()`, which asks the two questions every feature is asked.
`LOCALES` in `i18n.js` and in `validate.js` list the four dictionaries.
`check-i18n.js` fails when either disagrees with the keys, with the files on
disk, or with the pre-paint map in `index.html`. The bot derives its list from
the same keys and still reads a `locales` array from an older file.

**The family was `language_` for an hour and is `locale_`.** `language_switcher`
is a phase 1 key, and the first run of the bot's derivation offered a language
called "switcher". Deviation 137.

**Off means off, including the API, so the locale validators went async.**
`validate.js` is copied to the docs site by the generator and cannot read a
switch. So it keeps the shape check and `locales.js` wraps it. `requestLocale`
answers English for a locale that is not published, and
`validatePublishedLocale` refuses one. Twenty one routes changed one line
each, and `tests/phase15-test.mjs` fails on a route that reaches the shape
checks or forgets the `await`. `job-page.js` inlines only published languages.

**The client narrows after the overrides load, and a fallback is not a
choice.** `i18n.js` offers every dictionary until `shell.js` calls
`setPublishedLocales` after both loaders. Holding the page on two more
fetches would push a Mandarin reader past the pre-paint timeout. A reader
whose stored language is switched off is moved to English with `remember:
false`. `applyLocale` never stores a fallback, so the choice is there the
day the switch goes back on. The language modal hides an unpublished button
on `gftv:localespublished`. The report form offers the published list.
`phaseText` reads `name_<locale>`. `format.js` gives Intl `ms-SG` and
`ta-SG`. The pre-paint script in thirty three page heads and `page-shell.js`
maps three languages by hand, and the check holds the map to `i18n.js`.

**Malay and Tamil are held: off until an admin switches them on.** The
maintenance mechanism as phase 7 built it could only record "off", and
section 7 already recorded that it cannot express "shipped and held". `HELD`
in `maintenance.js` is the third answer, deviation 138. For a key in it, no
override means off with a standing note, and the override that exists is the
one saying on. `featureOverrides()` answers the same shape for a held key as
for a switched off one. So the guard, the payload, the client and the bot
treat it as off with nothing new to learn. The payload marks it `held`. The
three places that list what is *broken* leave it out: the account banner,
the dashboard banner and `/status`. The maintenance page says "off
until somebody switches it on" under it instead of "switched off by", and the
on confirmation has its own sentence. `locale_en` is denylisted as the
fallback layer. `locale_zh` is an ordinary key.

**What was copied, and what stayed at two.** `ms.json` and `ta.json` are byte
for byte copies of `en.json`, checked as such and exempt in `gen-review.js`.
`check-copy.js` reads them under the English rules as a tenth source.
Migration `044` inserts the two rows, active and with no text search
configuration; the user ran it the same day. Seven interface strings that
counted the languages as two were rewritten before the copies were taken, so
the copies carry the final English. The docs site stays at two: the generator
trims the two entries from its `i18n.js` and the list in its `validate.js`.
The two workers were bumped to `v136` and `v12`. `sw.js` precaches no held
dictionary, and `check-precache.js` expects the two absent with the reason.

**The checks.** `tests/phase15-test.mjs`, 112 checks at the end of the part
and 158 at the end of part 2, none needing a credential. Its `server` section
imports `maintenance.js` with `settings.js` answered from memory by a module
hook, which phase 7's file said could not be done. Its `bot` section runs the
Python derivation against the real file. The developer guide's multilingual
page and the admin guide's maintenance page describe the switch, in both
languages.

## Part 2, rich messages

**Every structured reply the bot sends is a Telegram rich message**, asked for
on 12 September 2026 with a design that `reply.py` follows. A reply is
`{"markdown", "fallback"}`. The markdown is the GitHub flavour Telegram calls
Rich Markdown. The fallback is plain text in the request's required `message`
field. The three sends are raw `SendMessageRequest`, `EditMessageRequest` and
`EditInlineBotMessageRequest` carrying `rich_message`, since Telethon 1.44
exposes the field and nothing above it. Requirements floor Telethon at 1.44.
**The VPS needs `pip install -r requirements.txt` before the restart.**

**The strings stayed HTML, and a converter answers both halves.** Rewriting
two hundred and forty strings into a second markup would put every one in
front of the reviewer again. It would break three checks that read them too.
`from_html` in `reply.py` reads a string as Telegram HTML and writes the
markdown and the plain text from it. It escapes data text for markdown on the
way, which is the design's escaping rule applied at the one point every
string passes. Deviation 139 has the argument. Five table headings were the
only new strings.

**What went rich, and what stayed a line.** `/start`, with the commands in a
two column table under a heading. `/invites` as a list. `/applications` and
`/jobs` as tables. `/notify`, `/docs`, and every guide page. And the four
notification kinds, each opening with a heading. `/tasks`, the link, unlink
and code flows, the login code and the test message stay ordinary messages.
So does every refusal, with the HTML parse mode, as the design asks. The bot
has no inline mode, so that half of the design has nothing to apply to.

**The guides are drawn now.** `docs.py` renders a page to both halves block by
block, so the two break in the same places and page together. A table is a
pipe table, a callout a quote with its kind in bold, and a tabbed block its
tabs under bold titles. The page's headings sit under the title at their own
level. A screenshot is still one line saying it is there. Paging measures the
plain half, which is the one Telegram's cap is stated for.

**Two departures from the design's letter, in its spirit.** A flood wait and
the four answers that mean the chat cannot be reached are re-raised instead of
falling back. The plain send would meet the same answer, and the drain
handles each. And the fallback line goes to the log and not to `print`. The
checklist asks the person walking it to look for that line in the log.
Deviation 140.

**The two fixes from 11 September ride with it.** A 504 from Supabase's
gateway, a reset connection or a read timeout is `SupabaseUnavailable`. The
two polling loops report an outage as one line when it starts and one when
it ends, with no traceback, deviation 141. `redraw()` accepts Telegram's
refusal to edit a message into what it already says, which tapping the
current language under `/language` produced, deviation 142.

**The checks.** The `rich` section of `tests/phase15-test.mjs`, 46 checks.
The converter, the builders, two real guide pages through the renderer, and
the three sends against a client that answers as told. Steps 4, 17, 22, 24
and 24a of the bot's checklist say what to look for by hand. That includes
the log line that must not appear.

## Before the phase is called done

The list phase 14 left, and it is the standing list for any part that touches
either site or the bot.

- **`node docs-site/scripts/build.js`**, from `docs-site/`, which is the one
  check that is also the deploy. It needs the database; `--no-database` builds
  the files alone and is refused on Vercel.
- **`node gen-docs-lib.js --check`**, which fails when a change lands in
  `main-site/api/_lib/` or `main-site/assets/js/` and stops there.
- **`python commands.py --check`**, from `telegram-bot/`. Four documents, the
  华文 guide's table among them.
- **`node check-i18n.js`**, both sites, and **`node check-copy.js`**, which
  reads both content trees and every dictionary.
- **`node gen-review.js`**, which fails on any file shipping 华文 that is on
  neither of its lists, and pairs every translated page with its English.
- **`node check-precache.js`**, both halves.
- **`node gen-spec-pages.js --check`** and **`node gen-memo-pages.js
  --check`**, after any edit to `reference/`. A memo edit regenerates the
  memo's pages, and the 华文 of the changed page has to follow before
  `gen-review.js` is clean again.
- **`node docs-site/scripts/embed-tests.mjs --check
  docs-site/api/_content/developer/test-scripts.json`**, after any edit under
  `tests/`.
- **`node tests/phase15-test.mjs`**, 158 as of part 2, no credential and no
  network, with a `rich` section that needs Telethon 1.44 in the local
  Python. **`node tests/phase14-test.mjs`**, 586 as of the flip. No
  credential, no database, no network. **`node tests/phase13-test.mjs`**,
  3,979, twenty seven of them live, over half an hour. Run `--only=live`
  after every docs deploy and the whole thing once per part.
  **`node tests/phase12-test.mjs`**
  in full, whose `zh` section is the one that reads every generated page. Its
  one failure on 11 September was live: the sitemap's edge cache answered
  `MISS` twice, which is the deployment's state and not the tree's. And
  `tests/phase11-test.mjs` at 91, the file nobody ran for four parts.
- **Bump `sw.js`** on both sites on every change to either, not once per
  phase.

**A new locale adds one thing to every item above, on the portal.** The check
that read two dictionaries reads three, published or not. The docs checks are
untouched, because the docs site never gains a language. The first part of
this phase should find out which of the portal's checks was written for two.

---
