---
title: 8. Open items, none blocking
access: developer
order: 8
summary: because it is rare.
---

# 8. Open items, none blocking

0. **The specification was edited on 31 August 2026, which is worth knowing
   because it is rare.** Decision 23 and deviation 120 replaced
   `gftvjobs_status_checks` with `gftvjobs_status_days`,
   `gftvjobs_status_incidents` and `gftvjobs_status_record()`. Five passages in
   `careers-gftv-spec.md` described the old shape: section 6's schema entry,
   section 11's sweep line, section 15's recording line, and two lines in 0c.
   All five now describe what is built, and section 6 carries a short note
   saying what the shape was and why it changed.

   **0c's rules were not touched and did not need to be.** Every promise that
   section makes is kept by the new shape. Those promises: never a green day
   that was not measured, never a percentage over a period with gaps without
   saying so, never a backfilled row. That is the test any further change here
   has to pass.

1. **Proxima Nova Medium, Semibold, and Bold.** Only Regular exists. The three
   `@font-face` blocks are written and commented out in `theme.css`.
3. **Icon backgrounds. The artwork is still the template's and is not final** —
   said on 27 August 2026. The plate is GFTV yellow and the splash matches it,
   done by phase 10 part 1. What is left is the artwork itself, and it comes
   back the day there is a real one.

   Swapping it is small and is written up in `main-site/README.md` under "Icons
   and the install manifest". Drop the new square master in as `HLC-source.png`
   at the repo root, run `node gen-icons.js`, then run `node
   tests/phase10-test.mjs --only=install`. Nothing references an icon by
   anything but name, so no page, no manifest entry and no precache line moves.

   **The one thing to decide first is the recolouring pass.** `gen-icons.js`
   matches the template's mint plate and rewrites it as yellow at the same
   brightness, shadows included. A master already on the right background wants
   that pass turned off and not retuned. One on some third colour wants `MINT`
   pointed at that colour. The `install` section checks sizes, tags and the
   manifest's own claims, and nothing about the artwork. So it is worth the same
   after a new icon as before it.
5. ~~**The official site banner** for when every phase has shipped.~~ **Built
   by phase 15 part 3 on 12 September 2026.** From `gftv-official.md`, on both
   shells, linking `https://gftv.asia/trusted-sites`. It is not dismissible
   and claims nothing about safety, and `--only=banner` holds it to the
   file's acceptance list.
5a. **Switching Malay or Tamil on, the day a translation is in.** Not a part.
   The dictionary comes back and replaces the copy. `check-copy.js` reads it
   as a copy no longer, so its source in that file gets the language's own
   rules or none. `gen-review.js` loses the exemption for it. The phase
   entries in `build-status.json` gain their `name_ms`, `description_ms` and
   `shipped_note_ms` fields, or the reader gets English there. `sw.js`
   precaches the dictionary and `check-precache.js` drops it from
   `EXPECTED_ABSENT`, with a `VERSION` bump. The content goes through the
   helper area, which was open to the language all along. Then an admin
   switches the key on at `/admin/maintenance`, which is the whole of
   publishing it. The control, the postings, the API and the bot follow
   within the caches' minute. The bot's `strings.py` is separate, decision 3,
   and the bot offers the language only once a third table is in it.
6. ~~**The whole site is blocked from search engines, deliberately and
   temporarily.**~~ **Opened by phase 12 part 8 on 31 August 2026**, after
   eleven phases closed. `INDEXING` in `api/_lib/discovery.js` is `true` and the
   global `X-Robots-Tag` is out of `vercel.json`. The one on `/api/(.*)` is
   separate and stays. `--only=discovery` fails if either half moves without the
   other, in both directions, so this does not come back as a half state. Test
   the tags with `curl`, not by pasting into a chat window: an unfurler reports
   what it fetched, not what a crawler is told.
7. **Passkey coverage across GFTV.** One registered here works on
   `careers.globalfurry.tv` and nowhere else.
8. **The posting page's JSON-LD has never been checked by Google.** Run it
   through the Rich Results test when indexing is turned back on in phase 12.
   **The condition is met as of part 8**, so this is now a job and not a note.
   It needs a published posting to point the test at, which an empty board does
   not have. So it waits on the first real posting, and that is the one thing on
   this list decision 25 made later and not sooner.
9. ~~**The star colours have not been measured.** Neither have the language
   state pills, the maintenance switch, or phase 9's four panel tones.~~
   **Closed by phase 12 part 3 on 30 August 2026.** All four are measured in all
   four theme combinations by `tests/phase12-test.mjs --only=contrast`. The
   thresholds are 1.4.3 for text and 1.4.11 for a boundary or a state indicator.
   It is a check that runs and not a reading somebody took once, so this does
   not come back the next time a token moves.
10. **`/admin/docs` points at a host that does not exist.** It is a 302 for that
    reason, and phase 13 is what makes the destination real.
11. **Seven of phase 8's ninety nine checks are still unreachable by a script.**
    Phase 9 leaves one of its own: **item 39, that the second cron run wrote no
    audit row.** Nothing exposes `gftvjobs_audit_log` for a `system` actor. The
    query is in the run's output and in `tests/phase9-test.mjs`.
12. **There is one template Google Form to make**, and it is now the last thing
    standing between phase 9 and being genuinely proved. The root README's setup
    section assumes it exists: one form carrying
    `apps-script/careers-form-webhook.gs` and `PORTAL_SECRET`, copied per
    posting. Nobody has made it yet. See section 5 item 13.
