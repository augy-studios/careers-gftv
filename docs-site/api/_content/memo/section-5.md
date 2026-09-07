---
title: 5. Carried forward, still open
access: developer
order: 5
summary: 24 gftvjobs_ functions were created without a search_path of their own.
---

# 5. Carried forward, still open

1. **`036_function_search_path.sql` is written and has never been applied.** All
   24 `gftvjobs_` functions were created without a `search_path` of their own.
   **It is hardening, not a hole** — what a mutable search_path endangers is a
   `SECURITY DEFINER` function and nothing in this schema is one. Worth doing
   anyway because twenty four standing warnings is where the next real critical
   goes unnoticed.

   The path is `public, extensions, pg_catalog` and **the middle one is load
   bearing**: `gftvjobs_search_jobs` and `gftvjobs_suggest` call
   `word_similarity()` unqualified. **After applying it, check the typo path on
   `/search`**, not just the ordinary one.

   **`041_mandarin_portal_name.sql` was applied on 4 September 2026** and is off
   this list. It moved `gftvjobs_settings.portal_title`'s Chinese half to
   国际兽视入队平台. The portal's home page now carries the new name in the largest
   words on it. The rest of both sites already did. It fired only on the exact
   string `018` wrote, so it was safe to run twice and safe to run late. It left
   an admin's own edit alone. **What is not proved is the home page itself**:
   the change is in the database and nobody has loaded `/?lang=zh` since.

2. **The Chinese has not been read by a fluent speaker**, and it is 1,987
   entries. Those are 1,728 interface keys, the 41 phase names, descriptions and
   shipped notes, the 55 seeded and hero strings, and the bot's 105. **Phase 12
   part 4 built the whole package on 31 August 2026.** `node gen-review.js`
   writes all of it to one page, so nothing has to be handed over separately any
   more. `node tests/phase12-test.mjs --only=zh` has already decided everything
   a machine can. **What is still owed is a person.** The largest untested thing
   in the build, and it has been since phase 3.

   **Three things to send with it now.** The portal's new Mandarin name,
   国际兽视入队平台, and specifically whether 入队 reads as 少先队入队 to a Singapore reader.
   It should not, but that is exactly the judgement being asked for. Part 4a is
   the account of why the name changed. Then the open question, whether a
   documentation site is 文档 in Singapore usage — refs S344, S349, S1474, P36,
   P37 and P38. And part 4 changed 21 strings from 志愿者 to 义工 by the project's
   own rule. That is the term for the translation helper role throughout, so it
   is worth their confirming and not assuming.

   **Phase 13 part 6 added about 90 strings after the package went out**, on 2
   September 2026. So what the reviewer holds is short by that many, and
   `gen-review.js` now writes 2,113 entries against the 1,987 they were sent.
   **Settled: let the round trip finish and send part 6's after it.** Replacing
   a package somebody may be part way through is worse than a second short pass.
   There is a second pass coming regardless: phase 14 lands 76 pages of guide. A
   hand assembled delta was declined for the reason this file keeps giving. A
   list somebody wrote is a list with something missing from it, and
   `gen-review.js` writes one page and not diffs.

   **Phase 11 made it worse in a way part 4 has now covered.** A bot message is
   written in the language on the account, so the Chinese goes into a channel
   nobody is reading over anybody's shoulder. All 105 of those strings are on
   the page.

3. **Staff trusted devices and the POST revoke controls are untested.**
   `gftvhello_totp_challenges` has no `id` at all, and
   `gftvhello_trusted_devices` names its token column `device_token`. Both are
   recorded in `HELLO` at the top of `session.js`, which phase 9's sweep reads
   instead of hardcoding a column name.

4. **Revoking `gftvjobs_admin_access` underneath a live session** has not been
   observed.

5. **The old test accounts are still there.** Twenty five matching `smoketest-%`
   and `smoke-p7-%`, plus **three `smoke-p9-%` from the three runs on 26 August
   2026**.

   ```sql
   select id, username, created_at from gftvjobs_users
   where username like 'smoketest-%' or username like 'smoke-p%'
   order by created_at;
   ```

6. **Done, 31 August 2026. The dev seed is deleted and the board is empty.**
   Kept and not removed, because everything below is what a *re*-seed costs and
   decision 27 says there will be one.

   It went the same evening the site was opened to search engines, in the order
   part 8 spent two parts insisting on. The live state was measured afterwards.
   `/sitemap.xml` lists the five static pages, and `/api/public/jobs.json`
   answers zero postings. `--only=discovery-live` reads 8 passed, 0 failed, 1
   skipped. The skip is the check that compares the sitemap against the feed,
   which says two empty lists agree about nothing instead of passing. And
   `--only=status-live` reads 13 passed, 0 failed, 0 skipped.

   **The original entry follows, because it is the instructions for putting a
   board back.** Every title and body says SAMPLE POSTING in both languages. The
   delete block at the bottom of `migrations/dev-seed-jobs.sql` removes them.
   **Delete them before this is a real site.**

   **As of phase 10 part 1 that delete has a second step.** The two install
   screenshots in `manifest.json` are real captures of `/search` and show the
   seed. Run `node gen-screenshots.js` after clearing it, or the install dialog
   advertises postings that no longer exist. See deviation 66.

   **And as of phase 12 part 5 it has an order.** The sitemap lists every
   published posting, so the seed is in it, and part 8 opens indexing. **The
   seed goes before that flip, not after it.** Otherwise the first thing a
   crawler fetches is nine postings marked SAMPLE POSTING with a `lastmod` on
   each.

   **Part 8 built the command and the guard, 31 August 2026, and the clearing
   itself is still owed.** `node seed.mjs --clear --yes` from the repo root
   removes these nine and the eight `seed.mjs` writes itself. It needs
   `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `main-site/.env.local`. The
   delete block at the bottom of `dev-seed-jobs.sql` is still there for somebody
   who would rather paste SQL. **`seed.mjs` refuses to write while `INDEXING` is
   true**, so the order is enforced by the script and not remembered. Clearing
   is never refused, because the state it declines to create is the state it
   must always be able to undo. Then `node gen-screenshots.js`, per the
   paragraph above, and decision 25 is why an empty board is the right board
   today.

   **And clearing it empties three surfaces that still owe a by-hand session.**
   A posting deleted takes its applications, tasks, ratings, saved rows and
   analytics with it. So `/admin`, the pipeline and `/admin/analytics` all go
   empty, and items 8 and 17 below and part 2's remaining half have nothing to
   walk. **Decision 27: the sitting opens with `node seed.mjs --yes --anyway`
   and closes with `node seed.mjs --clear --yes`.** `--anyway` is needed because
   indexing is on by then. The cost of that window is a sitemap cached an hour
   at the edge. That is the price of not holding the phase open for a session
   that has been owed since 29 August.

7. **The kept-checks decision, and its cost.** The phase files live in `tests/`
   with their own README. **Do not read this as "there is a regression suite".**
   Nothing runs them on a push, which is why item 10 below went unnoticed for
   three days.

   **Phase 11 goes further and has none at all for the bot**, by decision. See
   deviation 91 for what is built differently to pay for that. From here on the
   honest summary is: the portal has phase files nobody runs automatically, and
   the bot has a checklist and a person.

8. **Phase 10's deployment checks are still owed, and it is `shipped` anyway.**
   **Folded into phase 11's by-hand walk on 29 August 2026**, item 17, and not
   carried to phase 12. The device is already out for the bot, and this phase
   touched three of the pages the worker precaches. This item used to record
   that phase 9 shipped the honest way round, verified first and flipped after.
   Phase 10 reopened it by doing the reverse on 27 August 2026. What holds and
   what does not:

   - **The scripted half is done and is the strong half.** 125 checks across
     nine sections, all passing, needing no deployment, no credentials and no
     network. `node check-i18n.js` and `node check-precache.js` both clean.
   - **What is owed is everything a script cannot do**, which section 14 asks
     for by name. That is a real Android install to a home screen, the offline
     paths in Chrome, and the fallback page on **iOS Safari**. There service
     worker support is real but stricter. `main-site/README.md`'s offline test
     checklist is the list, and item 10 on it is the pair of switches.
   - **Flip `offline` and `install` on `/admin/maintenance` against a device
     that already has the worker**, and flip both back. The script drives both
     edges locally. Only this proves an admin can reach a worker already on
     somebody's phone, and that is the entire reason the switch exists.
     Deviation 89 is why the second direction is the one to watch.
   - **The flip did have its own consequence, and it was handled.** `offline`
     and `install` appear on `/admin/maintenance` the moment the phase reads
     `shipped`. Both needed a `featureWhere.*` description written for them
     first, exactly as `cron` and `form_webhook` did in phase 9. Both were
     written before the flip. **Confirming they read On on the live page is
     still part of what is owed.**

9. **8.9's account panel has no filter on its activity list.** It shows the last
   25 audit rows, and a working helper pushes their own security events off the
   bottom within an afternoon. The fix is a filter, or a cap per action, on
   `accountActivity` in `api/_lib/admin-applicants.js`.

10. **`tests/phase7-test.mjs` can no longer delete anything.** Deviation 49
    replaced the typed slug with the caller's own password. Phase 7's file still
    sends `{ action: 'delete', id, confirm: slug }` at lines 428, 622, 649,
    2584, 3446, and 3456. So **its cleanup leaves SMOKE P7 postings behind as
    drafts**. The fix is a `password: STAFF.password` on each call and the
    removal of the `confirm` line. `tests/cleanup-smoke.mjs` had the identical
    fault and was fixed on 25 August 2026. Phase 9's file was written with the
    password from the start.

11. **A third guard is still owed on the verification files: stop early on the
    first 429.** Two exist — cleanup unpublishes every posting before it does
    anything else, and the run prints what it will spend against each ceiling.
    Phase 9's run is light enough never to have hit it, which is not the same as
    the guard existing.

12. **Phase 9's unmatched submissions are left behind on purpose**, and there
    are now three runs' worth from 26 August 2026. They carry the run's
    timestamp and sit in the list on `/admin/analytics`; deleting them would
    need a route that exists for no other reason. Clearing them is a `delete
    from gftvjobs_form_submissions where email like '%@example.invalid'`.

13. **Every published posting's application form is unusable, and that is
    expected.** The 26 August run recorded `forms_checked: 9` and
    `form_checks_failed: 9`, because the dev seed points at forms that have
    never existed. **The one template Google Form has still not been made**, per
    section 8 item 12. Until it is, deviation 55's wording matching has been
    proved against fakes and never against Google.

14. **Nobody has watched the schedule fire.** Only Vercel's dashboard says it
    did. The entry only takes effect on a production deployment, and the first
    firing after the 26 August deploy is due at 18:00 UTC. The last-run panel on
    `/admin` is what makes a dead schedule visible without going there. It
    currently shows the run the verification triggered by hand, not a scheduled
    one. **Check the panel on 27 August**: if `started_at` is still the 26th,
    the schedule is not firing.

15. **`tests/phase10-test.mjs` has an intermittent pair, checks 70 and 71.**
    Seen on 28 August 2026: both failed in a full 125 check run and both passed
    on their own with `--only=account`. They passed again in a clean full run
    immediately after, with the same tree. They are the two that open a page and
    wait a fixed 2000ms before asserting. That is the build's own rule about a
    fixed wait being a race, arriving from inside its own test file. **The fix
    is to wait for `#accountCached` to have content and not for a timer.** It is
    the same correction phase 9's verification run made for the cron panel.
    Until then, a failure on exactly those two under load is not a regression,
    and anything else in that section is.

16. **The Apps Script has never run.** `apps-script/careers-form-webhook.gs` is
    written and section 13's setup is in the root README. It has a
    `testCareersWebhook` that proves the secret and the URL without anybody
    filling in a form.

17. **Phase 11 is `shipped` and the by-hand walk has not been done.** Flipped on
    29 August 2026 after part 6, deliberately and for a better reason than phase
    10's item 8 above. Every Telegram control is gated on that one word, so the
    walk deviation 91 asks for cannot happen against a `building` tree. That
    does not make the walk any less owed, and it is the *only* coverage the
    Python has.

    - **The sitting opens with a seed and closes with a clear**, added 31 August
      2026 as decision 27. Part 8 empties the board. So the dashboard, the
      pipeline and the analytics page have nothing on them until `node seed.mjs
      --yes --anyway` puts a board back. `node seed.mjs --clear --yes` takes it
      out again at the end. Three of the five things this session covers are
      writes against real rows, and there are none until that first command
      runs.
    - **Phase 10's owed deployment checks are folded into this walk**, settled
      29 August 2026 — section 5 item 8. The device is out for the bot anyway
      and this phase touched three precached pages. So the Android install and
      the iOS Safari fallback are part of the same session. The `offline` and
      `install` switches in both directions are too, and not phase 12's
      inheritance.
    - **It has started, and it has already paid for itself.** The first look at
      `/account/settings` after the flip found the QR unscannable in both
      themes, which no scripted check on this tree could see. Deviation 115.
    - **What it covers.** Link, unlink, a code, and a magic link opened in the
      wrong browser. Then all four list commands, one notification of each of
      the three kinds, the `/notify` toggles both ways, and the invite decline
      button.
    - **Then the four switches on `/admin/maintenance`**, which appear there for
      the first time with this flip and now have their `featureWhere` sentences.
      Confirm all four read On, and flip one off and back on — deviation 89's
      direction is still the one to watch.
    - **The drain under stress is deferred, decided 30 August 2026.** The
      restart mid-drain, the stale claim sweep, the maintenance pause and a row
      reaching `failed` are not being walked for now. The portal has little
      traffic, and so few rows are ever in flight to lose. **Recorded and not
      quietly dropped**, because the risk it covers arrives with the next deploy
      and not with the next applicant. A restart at the wrong moment is the one
      failure nothing else here would catch. Deviation 91 is the only reason
      that is acceptable. The claim makes a double send impossible, so what is
      untested is whether a row is *lost* and not whether one is sent twice.
      **Two of the five cost under a minute and do not depend on traffic.** They
      are that a killed process leaves no stale lock, and that the maintenance
      switch pauses and not skips. Worth doing whenever the bot is next
      restarted by hand.
    - **Part 7 has turned the walk into the written checklist**, on 30 August
      2026 as `7b0a3fa`. It was written from what the walk had found and not
      from the plan. That is 29 steps in `telegram-bot/README.md`, with the
      deferral above written into it as a stated gap. Its two cheap cases are
      promoted to steps 3 and 27. **What is left is walking it.**
    - **It is walked before the by-hand half of phase 12 part 2**, settled 30
      August 2026 and narrowed the same day. Part 2's scripted half went first
      because it needs no device and no person, and it has been written: four
      sections, nine findings, all fixed. **What still waits on this sitting is
      everything part 2 cannot script.** That is the bulk bar, the question
      composer, the annotation sheet, the handoff modal, the account picker and
      the job editor's `<details>`. All of those are writes against the real
      database. Three debts, one sitting: items 8 and 17 and the rest of part 2.
    - **Everything else on the phase's own before-it-is-done list is
      discharged**, so the walk is genuinely the only thing outstanding. `node
      check-i18n.js` is clean and `sw.js` is at `v97`. `node
      tests/phase10-test.mjs` reads 125 passed and `node tests/phase11-test.mjs`
      reads 89. `telegram-bot/setup.md` was re-read by part 7 with the two stale
      passages gone.

18. **Done, 31 August 2026. `037` is applied and the probe is running.** Kept
    here and not deleted, because what it proved is worth having written down.

    The migration went in by hand right after part 7 was pushed, and `python
    probe.py` started on the VPS the same afternoon. Its first line was `wrote 4
    checks, 0 failed, slowest 610ms`, which is more than a probe working. **It
    is the only evidence that the plpgsql function is correct**, because
    `gftvjobs_status_record()` had never been executed by anything until that
    moment. `--only=status-live` then read 13 passed, 0 failed, 0 skipped, with
    4 of 360 days carrying data.

    **The two queries are still the way to look at it.** They are here for the
    next person, and not for a job that is outstanding:

    ```sql
    select target, day, checks, failures, slowest_ms, last_checked_at
    from gftvjobs_status_days order by day desc, target;

    select target, started_at, last_failed_at, ended_at, failures, status_code
    from gftvjobs_status_incidents order by started_at desc;
    ```

    The first gains four rows on the first cycle and counts upward; the second
    is empty while everything is answering. The probe's own log says `wrote 4
    checks` on a good cycle and names the failure on a bad one. A permissions
    problem or a bad cast is one line and not a silence.

    **One thing changes the day the seed is cleared, and it is not a fault.**
    `job_page` is picked from the live feed, so an empty board means that target
    is not probed at all and its days read unknown. The probe logs `the feed
    carries no postings, so the posting page is not probed`, and writes nothing
    for it. That is decision 22, and the honesty rule working and not failing.
    The other three targets carry on. It stops the day there is a published
    posting again.

19. **`seed.mjs`'s write path has never run against a database.** Decision 28,
    31 August 2026. The clear half is exercised the moment the dev seed goes.
    The eight upserts and the account insert with its bcrypt hash have not been.
    Nor have the composite conflict targets, `job_id,locale`,
    `applicant_id,job_id` and `job_id,applicant_id`.

    **The first thing that depends on it is phase 14's capture run**, and the
    by-hand sitting in decision 27 gets there sooner. Whoever runs it first
    should expect to debug it and not to use it. The failure to look for is an
    `on_conflict` that does not match a real unique constraint. Those three
    pairs were read out of migrations `006`, `007` and `014`, and not observed.
    Everything else in the script has been driven — the refusals, the plan, the
    environment loading — by `tests/phase12-test.mjs --only=seam`.

20. **Done, 31 August 2026. The staff session move is applied, deployed and
    proved on both sites.** Kept and not deleted, because what it proved is the
    whole of the change.

    Migration `038` went in by hand before the code that reads it. That is the
    opposite order from the rest of this build, and the right one here. A deploy
    in front of the migration is a staff sign in that fails on a missing table.
    The code is **`2c27a2b`, "phase 12 part 8a"**, pushed the same evening.
    **Both sides work**: a portal sign in and a gftv.asia sign in now coexist.
    That is the one thing nothing in this repository could have checked for
    itself.

    **What that confirms, beyond the report going away.** The embed from
    `gftvjobs_staff_sessions` to `gftvhello_users` resolves over the new foreign
    key. So PostgREST picked up the relationship without anything being reloaded
    by hand. The diagnosis was right, and that was not free. The portal was
    measured innocent first, and the fix was to a table and not to any line of
    code that had been suspected.

21. **Done, 1 September 2026. `039_passkey_site.sql` is applied.** Kept and not
    deleted, because the order it went in is the thing worth remembering.

    Phase 13 part 2. It adds `registered_on` to both passkey tables so 5f can
    say which site a passkey was registered from. Nothing in the schema could
    answer that once 5e gave the two sites one relying party id.

    **It went in before the code that reads it is deployed.** That is the same
    order `038` needed, and the opposite of the rest of this build.
    `api/_lib/webauthn.js` names the column in its select list and writes it on
    every insert. So a deploy in front of the migration would have been a
    passkey list that 400s and a registration that fails. Nothing else about a
    passkey changed, and no account had to re-enrol.

    **The default backfilled every existing row as `portal`, which was provably
    correct only until the docs site registers one.** That is why it was part
    2's file and not part 6's, where the page that reads it is built. The window
    it was aiming at is now closed and not still open.

22. **Done, 1 September 2026. `tests/phase10-test.mjs` had a flaky section and
    now does not.** Kept and not deleted, because what it turned out to be is
    worth more than the fix.

    "The applicant's own pages with no connection", checks 70 and 71. They are
    "my applications opens offline from its own copy" and "outstanding tasks
    opens offline from its own copy". **Two failures in nine runs**, and the
    second sighting is what made it a finding. Two adjacent checks failing rules
    out one bad assertion, and points at the section's shared setup. Eight clean
    runs after the fix, against 8/8 for the section run on its own before it.
    That is why it looked like a machine problem for a day.

    **The cause is a real ordering fact about the product, and the product is
    right.** `pageData` in `account-shell.js` calls `putMine` and deliberately
    does not await it. The page has its data, and a reader is not made to wait
    on a write to their own device. So the copy lands a moment *after* the page
    draws. The test treated "the loading row has gone" as "the copy exists". It
    navigated away inside that gap, and left the next page nothing to open
    offline. Nobody using the site can move that fast.

    **Two fixes, and only the second one was the fix.** The first replaced the
    two `waitForTimeout` sleeps with waits on `#accountCached`. That is section
    3's "a fixed wait after a click is a race, not a delay", correctly applied.
    It still failed two runs in ten, because it was waiting on the wrong side of
    the gap. The second waits on `readMine(id, kind)` itself, at the point the
    copy is made.

    **So the rule that mattered was phase 9's, not phase 12's**: assert the
    thing, not the thing beside it. A wait that is not a sleep can still be a
    wait on a proxy. This file had both mistakes stacked one on the other.
    `until` takes an argument now, which is what let the predicate name the user
    and the store instead of guessing at the DOM.

23. **Done, 2 September 2026. The docs site's routing fix is on the deployment
    and answers.** `api/content.js` replaced `api/content/[...page].js`, which
    had answered 404 to every request since part 3, and `tests/phase13-test.mjs
    --only=live` reads 20 passed, 0 failed against
    `docs.careers.globalfurry.tv`. The three assumptions that came with it are
    facts now. `outputDirectory: dist` leaves `api/` as functions,
    `includeFiles` reaches `api/_generated/`, and the build command runs before
    the functions are packaged. Part 5's account has what each proof was.

24. **Done, 3 September 2026. The walk happened, and it paid for itself four
    times.** Kept and not deleted, because what it found is the argument for the
    next one.

    **What was proved, scripted, against both deployments.** The staff sign in
    works on the docs site, and the session reads back. `/api/nav` names no
    staff page to a stranger, and names the staff half a moment later with a
    session. `/api/search-index` goes from an empty list to five entries, all
    under `/staff`. A gated page renders as a page and not as the stranger
    state. And **the nine panels draw from real rows on both sites**, in the
    same order with the same ids. That is decision 8 holding on the platform.

    **What was proved by a person, on their own staff account.** A passkey
    registered at `DOCS_URL` and verified under the portal's relying party id,
    then renamed. Then both code sets, a danger zone action, and all three
    second factor forms. And the whole of 5g, ending in a sign in at gftv.asia.

    **The four findings, none of which a file here could have made:**

    - **`SITE_URL` was missing on the docs Vercel project**, and the settings
      page had answered 500 to every staff account since part 6. Item 29.
    - **The gftv.asia link pointed at a path that answers 200 and is not a
      page.** Deviation 127, fixed in part 7a as `5270412`.
    - **"Sign out everywhere" did not.** Deviation 126, fixed in part 7e as
      `643c7dd`.
    - **A fourth write reaches gftv.asia and the hold never covered it.** Item
      30.

    **The order held: walk, lift, then flip.** `HELLO_WRITES_ENABLED` went
    `true` after the half that could happen with it on, because the other half
    cannot happen until it does. The three routes refuse before anything else
    they do. Both deployments were confirmed carrying the lift before the phase
    was flipped. **The portal was still building when it was first asked.** That
    is the third time in one sitting that asking twice was the difference
    between a fact and an assumption.

    **The original entry follows, because it is what the next walk copies.**

    **The staff sign in has still never run anywhere but a laptop.** Parts 1, 2
    and 6 are the whole of `api/auth/staff/` and the 5f settings suite. The
    `live` section asks the deployment nothing about them because everything it
    asks, it asks as a stranger. **Part 7 owes a signed in pass.** Sign in
    against the deployment with a real staff account, in all three second factor
    forms. Then open a gated page, a gated image and `/api/search-index`, and
    see the staff half of each. The one thing 5e most needs proved is in there.
    That is an assertion made against `DOCS_URL` verifying under the portal's
    relying party id. It is the check part 2 named and could not run.

    **Part 6 made this list longer and not shorter**, and every item on it
    writes something. The settings suite has never touched a database: the 22
    checks in the `account` section are the real modules and the real
    stylesheets over fixtures. What is owed, in the order that costs least if
    something is wrong:

    **This is its own short sitting**, settled 2 September 2026. It is thirty
    minutes at a laptop with a real staff account: no phone, no second device,
    no seeded board. That is what keeps it out of decision 27's sitting, which
    needs all three and has been owed since 29 August. Folding this in would
    make the hold wait on things it does not need. **`040` is applied and both
    sites are deployed, so nothing blocks it.**

    **It was to happen before part 7 and it did not**, decided 3 September 2026
    with the choice on the table. Part 7 is the seam and the pass deviation 118
    handed over, and not one check in it needs a session. So waiting would have
    been an afternoon of idle time on work that does not depend on the answer.
    **What part 7 therefore did not do is the lift and the flip**, which are the
    two things that genuinely do. `HELLO_WRITES_ENABLED` is still `false`, and
    phase 13 still reads `building`. Check 166 is what keeps that pair honest:
    the phase may not read `shipped` while the writes are held. So the order
    below is unchanged and is now the whole of what is left.

    **Three paths are switched off until the walk reaches them**, per decision 11. So the order below is also the order the hold is lifted in. Walk the read half and the `gftvjobs_` half, flip `HELLO_WRITES_ENABLED` in
    `api/_lib/staff-account.js`, then walk the three that reach gftv.asia.
    **The flip is a commit, and `--only=account` names in its own output which state the hold is in.** So a tree with it lifted and the walk not done is
    visible and not assumed. `--only=live` asks the deployment the same
    question, which is check 127. **Checks 127 and 128 were rewritten on
    3 September 2026** when the lift made them assert the wrong direction. They now read the constant the way check 166 does, and require the deployment to
    agree with the tree, in whichever state that is. The failure they catch is
    the one this sitting actually hit — one project deployed and the other not.

    **And the flip to `shipped` waits for all of it**, settled the same day:
    walk, lift, then flip. Phase 9's order, which this file calls the honest
    one. Phase 11 flipped first for a real reason. Every Telegram control was
    gated on that word, so the walk could not happen against a `building` tree.
    **Nothing here is gated on it**, so there is no reason to repeat phase 10's
    order. A phase reading `shipped` on `/status` while three panels read
    "switched off" is a strange thing to advertise.

    - **The read half first.** Open `/admin/security` and `/account` signed in
      and see nine panels drawn from real rows on both. This is also where item
      26 below is answered.
    - **A passkey renamed and removed, and the authenticator app set up and
      removed.** The second of those writes `gftvhello_users.totp_secret` for
      the first time in this build's life. So **check the gftv.asia sign in
      afterwards**. That is the one thing nothing here can check for itself and
      is the same sentence deviation 122 ended with.
    - **Both code sets generated**, and the backup set is gftv.asia's table.
    - **One danger zone action**, walked through all four panels.
      `revoke_devices` is the cheapest to undo.
    - **The whole of 5g**, which is the only path in the build that changes a
      credential without the old credential. That is a recovery code, a second
      factor, a new password, and then a sign in with it at gftv.asia as well as
      here.

25. **Done, 2 September 2026. `040` is applied and part 6 is on both
    deployments.** Kept and not deleted, because what it proved is worth having
    written down.

    `gftvjobs_staff_password_resets` went in by hand before the deploy, the same
    order `038` and `039` needed. That is the opposite of the rest of this
    build, because both forgot password pages insert into it on their first
    step.

    **What the deployment then answered, as a stranger and with no credential.**
    `--only=live` reads **27 passed, 0 failed** against
    `docs.careers.globalfurry.tv`. Part 6's own seven of those close the
    questions this part could not answer on a laptop:

    - **The three new addresses are served, and by the shell.** `/login`,
      `/account` and `/forgot-password` all answer 200 through the catch-all
      rewrite. That is 16d's "the two pages with no article render inside the
      same shell" holding on the platform and not only in a stand in.
    - **Every module those pages import is in `dist/`.** Ten of them, eight
      generated and two this site's own. A page that is served and whose module
      the build did not copy is a blank content column and an error only the
      console sees. That is exactly what part 6's breadcrumbs defect looked like
      locally.
    - **The hold is on, on both sites.** `/api/auth/staff/forgot-password` and
      `/api/auth/staff/reset-password` answer 503 with `reason: "held"` on the
      portal and on the docs site. **A constant meant to ship `false` that
      shipped `true` would be three credential paths live and unwalked, and
      nothing else would have said so.**
    - **A stranger is refused before the hold is ever mentioned**, because
      `requireStaff` runs before `held()` on the settings routes. A 503 to
      somebody with no session would be the site describing its own internals to
      anybody who asked.

    **This is part 5a's habit applied one part later.** The checks above were an
    afternoon of `curl` first, and they are a section now. So the next docs
    deploy asks them again for free.

26. **Done, 3 September 2026. Both column names are right.** The account route
    answers `display_name: "test123"`, `email: "test123@gmail.com"`, `available:
    true` on both sites. So the two assumptions from section 5a hold, and the
    degraded path below was never taken. **The fallback stays.** What made it
    worth writing was not this answer, but the one that came back wrong in phase
    12 part 8a.

    **The original entry follows.**

    **Two columns on `gftvhello_users` have never been read by anything.** 5f's
    profile panel is the first thing to want them: `display_name` and `email`.
    Phase 13 part 6, 2 September 2026.

    `HELLO` at the top of `session.js` is the whole reason this is an item and
    not a line of code somebody wrote confidently. Every name this repo uses
    against a `gftvhello_` table started as an assumption from section 5a. One
    of them was wrong, and a staff sign in failed on the live site because of
    it. These two are the same kind of assumption. PostgREST answers a select
    naming a column that does not exist with a 400 for the whole query.

    **So the code already survives being wrong.** `staffProfile` answers
    `available: false` and the page draws the username plus the sentence sending
    the reader to gftv.asia. That is where 5f sends them for those fields
    anyway. What is owed is one look at the page while signed in, as part of
    item 24. If the two rows read "Could not be read", the column names are
    wrong and the fix is one file.

27. **The docs site starts at its own theme defaults and cannot do otherwise.**
    Found 2 September 2026 by somebody asking whether `gftv-theme.md` reaches
    that site. It does: `theme.css` and `theme.js` are generated into it. So the
    tokens, the two axis attributes and phase 12 part 3's AA measurements all
    apply there without being measured twice. **What does not carry is the
    reader's choice.** localStorage is per origin, `docs.careers.globalfurry.tv`
    is not `careers.globalfurry.tv`, and the only thing that would cross is a
    cookie on `.globalfurry.tv`. 5h forbids that outright, because the parent
    domain carries other GFTV apps.

    So the docs site is always `classic` and always starts light, whatever
    somebody chose on the portal. **The `hello` palette is generated in,
    measured, and unreachable from that site's chrome.** That was measured for
    real as of part 7. Its `contrast` section walks every component of this site
    in all four combinations, and not in the two a reader can reach. The
    argument for spending that is that the palette is a control away. Finding
    out then would mean finding out with 76 pages of guide already written. That
    follows from 16d giving its header a light and dark toggle and no colour
    control, so it is the specification and not an oversight. But it was written
    down in `shell.js` as the opposite, in a comment claiming a reader keeps
    their portal choice. The comment is corrected; the behaviour was always
    this.

    **Nothing is owed unless somebody wants the choice to carry**, and that is a
    decision and not a fix. The only ways across are a query parameter on every
    cross link, which puts a preference in a URL, or a shared cookie. 5h rules
    that out. Worth raising in phase 14, when the two sites start linking to
    each other in earnest.

    **Corrected 3 September 2026, and the correction is the interesting half.**
    Everything above about the *choice not carrying* still holds. What was wrong
    is the sentence calling the unreachable palette "the specification and not
    an oversight". That read `gftv-theme.md` as a colour token contract, and
    **it is also a chrome specification**. Its section 3 prescribes the theme
    modal's markup verbatim. Its non-negotiable rules say a reader opts into
    dark "explicitly in the theme modal". Its acceptance checklist expects a
    theme button whose icon tracks the mode. The docs site has none of that. It
    has a text button and a bare `<select>`. There is no `.icon-btn` in
    `docs.css`, and **`icons.js` is generated in and used zero times by the
    shell**.

    So the theme was applied halfway and this item recorded the half that was
    done. **Phase 14 part 1 is the other half**, and the colour axis is being
    exposed with it. 16d is overruled deliberately, because the palette is
    generated in and already measured. Somebody did want the choice.

    **The lesson is narrower than "check harder".** Two checks read
    `gftv-theme.md`. The contrast section measures its tokens, and
    `--only=account` fails on a class neither docs stylesheet defines. Both
    passed throughout, because **a measurement of the components that exist
    cannot see a component that was never built.** The same shape as
    `--only=live` asking as a stranger and never seeing the 500.

    **Closed 3 September 2026 by phase 14 part 1**, and the lesson above was
    paid off the same day. The docs header carries `#themeButton` and
    `#languageButton` as `.icon-btn`s, `chrome-modals.js` is generated into both
    sites, and the `hello` palette is reachable. `tests/phase14-test.mjs
    --only=browser` check 16 is the one that presses the swatch. **What the
    choice not carrying costs is unchanged and is not a job.** The reader still
    starts at `classic` light in English on this origin, and the two controls
    are how they say otherwise, once. `language.description` on the docs site
    says so in the modal, which is the one place a reader is asking the
    question.

    **And the new components were measured the moment they existed**, which is
    the lesson's other half. `--only=contrast` walks both modals in all four
    combinations, and it found deviation 128 on its first run.

28. **The official site banner covers the docs site too**, and this is a note
    and not a job. `gftv-official.md` lists `docs.careers.globalfurry.tv` among
    the official subdomains. Its acceptance checklist says the banner is
    "present on every page, above the header, with no close control anywhere".
    So when section 8 item 5 is finally built it is built twice: once in the
    portal's shell and once in the docs shell. Or once and generated, which is
    decision 1's question again.

    **It still waits on the same two things.** Every phase shipped, and the
    trusted sites page existing, because the link must not ship before the page
    does. Recorded here so that whoever builds it does not discover the second
    site on the day.

29. **Closed by phase 14 part 10a, 7 September 2026.** `checkEnv()` is called by
    a health route on each site, and the reason it had never been called is the
    part worth keeping. It reported `TELEGRAM_BOT_USERNAME` missing on a healthy
    portal, because `KNOWN` is the documentation list and that one is optional.
    An `ok` that is false in the ordinary state is one no check can be built on.
    An `OPTIONAL` set fixes it. The route answers a count and logs the names. A
    missing variable is now something `--only=live` can go red on, while still
    asking as a stranger.

    **The original entry follows.**

    **Done, 3 September 2026. `SITE_URL` is set on the docs Vercel project.**
    Kept and not deleted, because the shape of the outage is worth more than the
    fix, which was one variable and a redeploy.

    **The docs settings page answered 500 to every staff account from part 6
    until it was found.** `relyingParty()` reads `SITE_URL`; exactly two routes
    on that site call it, `account` and `passkeys`. Exactly those two returned
    500 and everything else returned 200. Vercel's runtime log named the
    variable in the first line of the stack. That is section 2's rule working
    perfectly for a fortnight with nobody reading it.

    **Three things kept it invisible.** The page's own failure state is honest
    and quiet — one callout saying the settings could not be loaded, which looks
    like a bad moment. `--only=live`'s 27 checks all ask as a stranger. And
    `checkEnv()`, written for precisely this, **is called by nothing**.

    **What is owed is not this variable.** It is one call to `checkEnv()` from
    somewhere a deploy touches, on both sites. Phase 14 inherits it, and the
    argument for spending twenty minutes on it is worth stating. This is the
    second environment problem in two phases to be found by a person and not by
    a check. Deviation 122 was the first.

30. **A fourth path reaches gftv.asia and nothing gates it.** Found 3 September
    2026 while walking item 24, and left as it is on purpose.

    `POST /api/auth/staff/recovery-codes` with `set: "backup"` writes
    `gftvhello_backup_codes`. `recovery-codes.js` calls no guard, so it has been
    live on both deployments since part 6 while `HELLO_WRITES_ENABLED` held the
    other three.

    **It is arguably correct.** The hold lives in `staff-account.js`, which is
    the module for `gftvhello_users`. The backup codes table is a different one
    that the login flow already writes. It is one of the four writes section 2
    permits. Nothing about the placement is an accident.

    **What was wrong was the count, everywhere it appeared.** "The three writes
    that reach gftv.asia" appears in this file, in the constant's docstring and
    in the check's comment. The route always said otherwise. Its header names
    the table, its audit row records `reaches: 'gftvhello_backup_codes'`, and
    its response carries `reaches_gftv_asia: true`. So this is not a thing the
    code hid. **Four statements of a fact and no count of it.**

    **What phase 14 should decide.** Whether a single named list of the writes
    that leave this build belongs somewhere a check can read. `PUBLIC_COLUMNS`
    and `KNOWN` are lists a check reads. A fifth will be added one day by
    somebody who greps for the constant and finds it does not apply.

    **Decided on 7 September 2026, and built in part 10a the same day.**
    `GFTV_ASIA_WRITES` names three writes across five routes, beside
    `HELLO_WRITES_ENABLED`, with a check in both directions. Every route
    claiming `reaches_gftv_asia` is on the list, and nothing on the list has
    stopped claiming it. That is `INDEXING`'s shape and `PUBLIC_COLUMNS`'s
    shape, and it is the answer to the thing that actually went wrong here. That
    was not the fourth write, but the count of it being stated four times and
    checked none.

31. **Done, 3 September 2026, in part 2. The home page no longer promises
    offline support as unbuilt.** Found while writing part 2's offline page,
    which describes the same feature as working, because it is.

    `home.offlineBody` in both dictionaries reads "Offline support is still
    being built. When it arrives, postings you have opened stay readable with no
    connection, and Careers@GFTV installs to a home screen like an app". It is
    rendered at `main-site/index.html:256`. It has been wrong since 27 August.
    The Chinese is the same sentence.

    **Nothing checks a promise about the future.** `check-copy.js` reads that
    string and has no rule that could catch it. `check-i18n.js` compares the two
    dictionaries against each other and both say the same wrong thing. The only
    thing that finds this is somebody writing the guide to the feature and
    reading the home page afterwards, which is what happened.

    **What it took.** The key in `en.json` and `zh.json`, and the English
    fallback inside `main-site/index.html` that a reader sees before the
    dictionary arrives. And `sw.js` to `v128`. Leaving it for later was offered
    and was not taken. The docs page saying the opposite is
    `/portal/offline-and-installing`. Two GFTV pages disagreeing about whether a
    feature exists is worse than a part touching a second site.

    **Nothing on the deployment is proved yet**, since this is in the working
    tree with the rest of part 2.

32. **Done, 3 September 2026. Six shipped features had no "where is it"
    sentence, and the switch for five of them reached nothing.** Found by
    running `tests/phase12-test.mjs` in full for the first time since phase 13
    flipped. **It was not the plain language pass's doing**: `git show HEAD` has
    no `featureWhere` key for any of the six either.

    **Settled as six `DENYLIST` entries**, the way `seed` is on that list, after
    the three options were put up. The maintenance page now shows each as
    permanently unavailable with the reason. An admin looking for the switch
    learns there is no switch, instead of flipping one that changes nothing.
    `docs_site`, `docs_staff_login`, `admin_docs_content`,
    `translation_helper_guide` and `admin_docs` are the five entries. They are
    there because the docs site is a separate deployment that fetches
    `feature-status` nowhere. `admin_docs` is a `vercel.json` redirect, which
    consults nothing. `staff_recovery_codes` is there on its own merits, beside
    the applicant set that has been on the list since phase 7.

    **Wiring the docs site to the switch was offered and was not taken.** The
    comment above the entries says so and says what to delete when somebody does
    it. The denylist is 16 keys and the discovery section is 59 passing.

    **One thing the entries are not covered by.** `check-copy.js` does not read
    `DENYLIST`, so those six sentences are user facing English that no check
    measures. They were written under the cap by hand.

    The keys are `docs_site`, `docs_staff_login`, `admin_docs_content`,
    `staff_recovery_codes`, `admin_docs` and `translation_helper_guide`. They
    became visible on `/admin/maintenance` the moment phase 13 read `shipped`
    and phase 14 read `building`. The check that says every visible feature owes
    a sentence has failed since.

    **Writing six sentences is not the whole of it**, which is why this is an
    item and not a commit. `docs-site/` reads no maintenance switch anywhere:
    nothing in its functions or its shell fetches `feature-status`. So flipping
    `docs_site` off today changes nothing on the site it names. The three honest
    ways out are a `DENYLIST` entry with the reason, the way `seed` has one. The
    others are making the docs site read the switch, or a sentence that says the
    switch is a note to staff. **The first is the cheapest and the second is the
    one that makes the control true.** Choosing is somebody's call and not a
    script's.

    **Two other things surfaced in the same run, and both were false alarms that
    took a fix each.**

    - **`/admin/security` failed the live rewrite check**, and the page was
      fine. `tests/phase12-test.mjs` looked for the marker `staffSecurityPage`,
      which that page has never carried: the deployment and the working tree
      both say `id="staffAccount"`. The test was wrong from the day phase 13
      added the route to that list. Marker corrected, section passing at 7.
    - **`maintenance.js` named a guard that does not exist.** Its header said
      "requireFeature below is the shared guard every flippable route calls". A
      grep for `requireFeature` across `main-site/` returned that comment and
      nothing else. **The guard is real and is called `unavailable`**, and
      twenty three route files import it, so off does mean off including the
      API. A rename left the comment behind. Comment corrected, and it now says
      what happened so the next grep does not raise the same alarm.

33. **Done for the job poster, 4 September 2026, against the deployment carrying
    `04261b4`. Still owed for the admin.** Deviation 130's fix, asked as the two
    people it is about. Numbered at the end because every item here is referred
    to by number elsewhere in this file.

    **The poster half passed**: `node tests/phase7-test.mjs --only=setup,access`
    with `STAFF_USER` set to `POSTER_USER`, reading **36 passed, 0 failed, 4 not
    run**. Signed in as an account `/api/admin/me` reports as `admin: false,
    editor: true`, both routes answer **403**. Staff access, Applicant accounts,
    Settings and Maintenance are all absent from the sidebar.

    **The admin half cannot be scripted with what this repository has.**
    `STAFF_USER` has an authenticator app, `signInStaff` types a username and a
    password and nothing else, and the run stops on "One more step". So **an
    admin opening `/admin/settings` and `/admin/maintenance` has not been
    observed since the change.** The only claim behind it is that `requireAdmin`
    is `requireStaff` plus `is_admin`. It is one sitting of about thirty seconds
    and it goes with the sitting section 5 already owes.

    **Two things were fixed to get the poster half to run at all**, and both
    were the suite being older than the build:

    - **The access section threw before it reached the role checks.** It held
      `['admin_analytics', 'admin_invites', 'admin_settings']` as the features
      that have not shipped. That was true the day phase 7 shipped and false
      since phase 8. It clicked one of them by name. It now reads the disabled
      items off the sidebar and skips with a sentence when there are none. That
      is 0c's own rule that nothing hardcodes a phase.
    - **The new pair sat after an early return.** `if (!target) return` fires
      when there is no posting to aim a delete at. With the board empty, per
      decision 25, that is the ordinary state. **The first run reported neither
      route**, and it reported it as a pass. Both route checks are now above it.

    A check that cannot run reads exactly like a check that passed, which is the
    same lesson as the assertion this deviation started from.
34. **The admin guide has never been served from the deployment.** Phase 14 part
    6, owed the moment it is pushed, and it is item 33's shape for the other
    tier. Put up as a concern and answered on 4 September 2026: owe it.

    Three things to ask, in this order:

    - **A stranger gets 404** from `/api/content` on `/staff/admin` and on three
      pages under it. 404 and never 401, per 16e.
    - **A job poster gets 404 on the same four**, which is the half that is new.
      Part 5 proved a poster is *given* twenty pages; nothing has yet proved a
      poster is *refused* a page one tier above them. The fourteen pages this
      part wrote are the first content that asks the question.
    - **An admin gets all fourteen**, each answering 200 with its title,
      `access: admin`, its markdown, and a date. That is check 24's date
      arriving from git through the build.

    The poster half is scriptable the way item 33's was: `POSTER_USER` signs in
    with a password alone. The admin half runs into the same authenticator app
    that stopped item 33 and belongs in the same sitting.

35. **The developer guide has never been served from the deployment, and its
    download has never run behind the real gate.** Phase 14 part 7, owed the
    moment it is pushed. It is item 34's shape with one thing on top of it that
    no local check can reach.

    - **A stranger and a job poster both get 404** on `/staff/developer` and on
      three pages under it. That is item 34's question for the tier above.
    - **An admin gets all seventeen**, each with its title, `access: developer`,
      its markdown and a date.
    - **`the-test-scripts` carries its `data` field**, with sixteen scripts in
      it, and **`/api/content?path=/staff/developer/test-scripts.json` answers
      404 to that same admin session.** That is the decision the whole mechanism
      rests on, and it has only ever been asked of the loader in process.
    - **One download, pressed by a person**, on the real page. The browser check
      drives the module directly against a synthetic payload; nobody has yet
      clicked the button on a page the gate served.

    It belongs in the same sitting as items 33 and 34, and behind the same
    authenticator app.

---
