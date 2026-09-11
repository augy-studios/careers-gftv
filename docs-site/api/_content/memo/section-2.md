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

**Written at the start, 11 September 2026, the day phase 14 flipped.** Nothing
below is built. Section 6 held what this phase inherits until now, and it is
moved here because this is where it is worked from.

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
  not offered by the pre-paint script. It is not a locale a posting can be
  translated into either. That is what keeps an English copy off the site while
  somebody is filling it in. It is also the answer to what section 6 called a
  decision.
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

## The decisions this phase owes

Listed so the phase starts by settling them and not by discovering them.

1. **One language at a time, or both in one part.** The copy costs nothing
   either way. The round trip is per language and per person. Two round trips
   in flight at once is two packages somebody may be part way through.
2. **~~Whether a copied locale is offered on the control before it is
   translated.~~ Settled 11 September 2026, and where the toggle lives on 12
   September.** A language is published by a switch on `/admin/maintenance`,
   and not by its file existing. What remains to settle is which of the three
   existing copies of the language list the switch replaces. And how the
   others are held to it. The reasoning is in the inheritance above.
3. **What `strings.py` does.** A third and fourth table in the same file, as
   copies, or English for the bot until somebody translates the chat.
4. **Where the banner goes.** Section 8 item 5 waits on every phase shipped,
   which is this phase's flip. So either the banner is this phase's last part
   and ships with the flip, or it is its own commit after. The flip itself has
   always been its own commit.
5. **Inherited from phase 14, still open.** Whether the guides are versioned
   against the phase that built the feature. And whether `--only=walk`, a
   section that reads the rows a by-hand sitting leaves, belongs in a phase
   file. Neither blocks anything.

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
- **`node tests/phase14-test.mjs`**, 586 as of the flip. No credential, no
  database, no network. **`node tests/phase13-test.mjs`**, 3,979, twenty
  seven of them live, over half an hour. Run `--only=live` after every docs
  deploy and the whole thing once per part. **`node tests/phase12-test.mjs`**
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
