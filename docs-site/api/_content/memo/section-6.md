---
title: 6. Inherited by later phases
access: developer
order: 6
summary: not a decision any more, it is work.
---

# 6. Inherited by later phases

- **The maintenance switches need no migration, now or later.**
- **~~Phase 11's webhook confirmation notice~~ was settled by phase 13 and is
  not a decision any more, it is work.** Deferred three times: 29 August, phase
  12's section 2, then phase 13's. **Settled on 1 September 2026: build it, in
  its own commit, numbered the way `2c27a2b` was.** Declining it was on the
  table and was not taken. The confirmation is the one status change the portal
  makes on somebody's behalf, and it stays the one they hear nothing about. It
  has moved into section 2 as phase 14's, with its cost. That cost is a fourth
  `KIND`, a renderer in `outbox.py`, and a fourth notify column with a migration
  for it. Phase 11 part 5's forty cases are re-walked with it.
- **~~The applicant's guide to the bot~~ is section 2's**, moved there 3
  September 2026 with the rest of phase 14's inheritance.
- **~~Phase 13 inherits the docs site's responsive and accessibility pass~~,
  deviation 118. Discharged 3 September 2026** by part 7. That is most of what
  took `tests/phase13-test.mjs` from 129 checks to 677: every page in both trees
  at six widths in both languages. Its contrast section measures this site's
  components in all four theme combinations and not the two a reader can reach.
- **~~Everything phase 13 inherits~~ was worked from section 2 and is done.**
  That is the two tables in migration `038`, the duplicated session helpers, the
  gate, and the settings suite mounted twice. The two content pipelines and the
  pass above are in it too. **`embed-tests.mjs`'s output is the one that carried
  over** — decision 6 settled where it goes. The page that reads it is phase
  14's, so it is in section 2 now.
- **~~`/docs`, a tenth bot command~~ is section 2's**, moved there 3 September
  2026. All four of its decisions and both of the costs they carry went with it.
- **~~What phase 14 inherits, beyond the guides themselves~~ is section 2's**,
  moved there the same day. That is the docs site's own discovery files, the
  Playwright capture script, and the bot's start message finally carrying a docs
  link.
- **What phase 15 inherits.** Malay and Tamil: a row in `gftvjobs_locales`, a
  dictionary file, and the content. No schema change, per 3a. **And the
  switchover of `/status` happens by itself the day 15 reads `shipped`.**
  `everyPhaseShipped()` is what decides which of the two pages that address
  serves. Nothing to remember, which was the point of building it that way.
- **The official site banner is the last thing in the build**, section 8 item 5.
  The trusted sites page it links to still does not exist, and the link must not
  ship before the page does. **As of phase 13 it is two banners and not one.**
  `gftv-official.md` names `docs.careers.globalfurry.tv` among the official
  subdomains and asks for the banner on every page. So the docs shell needs it
  as well as the portal's. One implementation or two is decision 1's question a
  third time. Section 5 item 28.

---
