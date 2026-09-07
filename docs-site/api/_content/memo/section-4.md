---
title: 4. Deviations from the phase plan, and why
access: developer
order: 4
summary: Numbering continues across phases.
---

# 4. Deviations from the phase plan, and why

Numbering continues across phases. Phases 4 to 6's thirty one were dropped when
phase 7 rewrote this file. Phase 7's start at 32, phase 8's at 49, phase 9's at
54, phase 10's at 64 and ran to 90. **Phase 11's start at 91.**

32. **The dashboard has no header of its own.**
33. **Two roles, and no permission system.**
34. **An admin only control is absent, never disabled.**
35. **A `forms.gle` short link is accepted as an application form.** A *prefill
    map* on a URL that cannot carry one is refused with a field error.
37. **The bucket tabs are All plus all nine statuses.**
39. **`/admin/security` is not absorbed into the dashboard shell.**
40. **`api/admin/maintenance` is not admins only.** **Reversed on 4 September
    2026 by deviation 130.** 10 item 2 names the maintenance switches as an
    admin's, and this deviation had not been read against it.
41. **A status change and its note are one request; a note on its own is
    another.**
42. **`published_at` is written once and never rewritten.** The cron's
    auto-close does not touch it.
43. **Archived goes back to closed, not straight to published.**
44. **The editor is one column.**
45. **Nothing in an admin table wraps except a title.**
46. **One duration for everything that opens**, held in `--transition` at 0.22s.
47. **Moving between two pages of one area cross-fades.**
48. **Preview opens the real posting page in a new tab**, `private, no-store`
    with `Vary: Cookie`. Dropping that last line would make it a real leak.
49. **Permanent deletion asks for the caller's own password.**
50. **Bulk deletion of tracking rows, on `/admin/applications`.**
51. **A team or tag translation has no draft state.**
52. **Staff read the annotation layer; helpers write to it.**
53. **"By word" is by character in Chinese.**

### Phase 9's

54. **`gftvhello_sessions` is not swept at all**, not even for expiry. Section
    11 permits "normal expiry cleanup" and forbids going beyond it; this stops
    one step short of what it permits. Those rows belong to every GFTV app on
    the same staff accounts, and an expired one costs nothing. Deleting rows we
    did not create, on a schedule nobody else agreed to, is the kind of
    helpfulness that becomes somebody else's outage. `gftvhello_totp_challenges`
    **is** swept, because section 11 names it outright and a challenge row is
    spent within minutes.

55. **The form health check is a GET that reads the page, and a page it does not
    recognise writes nothing at all.** Section 11 offers "a HEAD or lightweight
    GET", and a HEAD cannot do the job. Of the three states it names, a deleted
    form 404s. A closed one and a private one **both answer 200**. So the check
    reads the body and matches wording, in English and in both Chinese scripts.
    A page that loads and matches nothing leaves `form_check_state` exactly as
    it was.

    **That last clause is the whole design.** Everything here is pattern
    matching against wording Google owns and may change without telling anybody.
    The failure to plan for is not "the check breaks" but "the check quietly
    starts lying". Keeping the previous state makes a rewording degrade to no
    new information, which is visible. Writing `ok` would turn every closed form
    green on the same morning and nobody would ever know. **Verified with fakes
    on 26 August 2026, all nine cases. Never verified against a real form**, and
    section 5 item 13 is why.

56. **`form_checked_at` is when a result was last *established*, not when the
    form was last looked at.** An unchanged result writes nothing, so a form
    healthy since August carries an August date. The reason is local.
    `gftvjobs_jobs` has a touch trigger on `updated_at`, and the admin list
    sorts by it. Phase 12's sitemap will take its lastmod from it. A daily write
    to every published posting would move all of them every morning. That is the
    exact churn migration `009` avoided when it backfilled only unindexed rows.
    The question that date looks like it answers, *is the check even running*,
    is answered by the run record on the overview instead.

57. **The unmatched list and the manual link are their own route,
    `api/admin/submissions`, and they are admins only.** Section 13 step 6 says
    to surface the list "in the admin analytics page", which is where it is
    drawn. It is not served from `api/admin/analytics.js`, because that file
    opens by saying it has no POST and is right.

    **Admins only is the sharper half.** 8.4 is deliberately open to job
    posters, and the stated reason is that the funnel is counts and nothing on
    the page names an applicant. Every row of this list is a real person's email
    address, so it breaks exactly that property.

58. **The last run is stored in `gftvjobs_cron_runs`, not in the settings row.**
    This corrects part 3 of phase 9's own plan. The table has existed since
    migration `012`, is already in `T` as `cronRuns`, and was created for
    section 11's last line by name. It has exactly the right columns.

    Worth keeping as an instance of the rule phase 8 left behind, pointing the
    other way. **Grep for the thing that would have to read it, and grep for
    what already exists, before writing that something needs building.**

59. **The cron answers 200 even when a task failed**, with the failures named in
    the body. The caller is a scheduler whose only reaction to a non-200 is a
    red mark in Vercel's dashboard. That is the one place section 11 already
    says not to rely on.

60. **The sweep covers four tables section 11 does not list.**
    `gftvjobs_passkey_challenges` and `gftvjobs_login_challenges` did not exist
    when it was written. `gftvjobs_rate_limits` is swept because migration
    `012`'s own comment says it is, with a day of slack past the longest window.

61. **The daily schedule is 18:00 UTC**, which is 02:00 the next morning in
    Singapore. Section 11 says only "daily". **Still never observed firing** —
    see section 5 item 14.

62. **Linking a submission by hand is audited**, as `SUBMISSION_LINKED`. The
    second deliberate exception to phase 7's "editing wording is not an audit
    event". An admin is asserting that two different email addresses are the
    same person, on their own judgement. The consequence is that somebody's
    application reads as submitted and their reapply cooldown starts.

63. **There is no per-posting "self reported" badge.** What serves section 13's
    fallback is already on the page. That is the permanent `rateIsFloor` callout
    and `yes_by_source`. That bucket has counted nothing since phase 8 drew it,
    and **now has data, as of the 26 August run**.

### Phase 10's

64. **The icon plate goes yellow and `theme_color` stays white.** They answer
    different questions and the answers differ. `background_color` is the splash
    screen behind the icon, so it matching the plate is the whole point of
    recolouring. `theme_color` is the title bar of the installed app. `theme.js`
    overwrites `meta[name=theme-color]` a moment after launch with the page
    background for the resolved theme. That is `#ffffff` for the default classic
    light. Setting it yellow would put a flash of the wrong colour on every
    single launch.

65. **Every icon in the site is generated, and the source is not one of them.**
    `gen-icons.js` writes `HLC-main`, 512, 192, 180, both maskable variants, and
    `favicon.ico` from `HLC-source.png` at the repo root. That is outside
    `main-site/`, so it is version controlled and never deployed. **The
    separation is load bearing.** `HLC-main.png` is one of the outputs. A script
    reading it would have destroyed the only copy of the mint original on its
    first run. The plate colour could never be changed again.

    The recolouring is not a colour swap. The plate carries soft drop shadows
    that are dark green and not mint. So every background pixel is matched as
    *mint at some brightness* and written back as *yellow at that same
    brightness*. The fill runs inwards from the border, so anything matching but
    not joined to the edge is left alone. 80.2% of the master was replaced; a
    flat match would have caught 68% and left the shadows behind as smudges.

    **`HLC-180.png` is new and is the apple-touch-icon in all 33 places.** iOS
    ignores the manifest's icon list entirely and reads that tag. Every page
    pointed it at the 2250 square master: 574 KB fetched to draw a home screen
    icon 180 pixels wide.

66. **The install screenshots show the dev seed, and that is honest and not
    good.** They are real captures of `/search` on production, so every card
    reads SAMPLE POSTING, NOT A REAL OPENING. **Section 5 item 6 gains a second
    consequence.** Deleting the seed means rerunning `node gen-screenshots.js`,
    or the install dialog advertises postings that no longer exist.

    Two things learned writing that script are worth keeping. The wait for
    `.job-card` **matched the four loading skeletons**, which carry the same
    class. It photographed a board of grey bars under the words "Loading roles".
    That is phase 9's "wait for the content, not the container", arriving from a
    completely different direction on the first day of phase 10. It waits for
    `#results` to drop `aria-busy` now. And **the narrow shot is captured at 360
    CSS pixels at a device pixel ratio of 3, not at a 1080 pixel viewport.** The
    first is what a phone shows, and the second is a desktop layout squeezed
    into a tall window. Chrome checks the declared size against the real one and
    drops a mismatch silently.

67. **Three of the four caches are not versioned, and that is the point.**
    `careers-gftv-shell-{VERSION}` is dropped on activate and refilled from the
    network, which is the whole update mechanism. `careers-gftv-public`,
    `careers-gftv-postings` and `careers-gftv-state` survive it. A posting
    somebody opened and a board they last loaded are **data, not build output**.
    Emptying them on every deploy would clear the board for a reader who happens
    to be offline on a day something shipped. During a build that deploys ten
    times in a phase that is not a rare case.

    The activate handler works from an **allowlist** instead of deleting
    everything that is not the current shell. Two reasons. The three above have
    to survive, and the pass through worker this replaces deleted every cache on
    the origin. On a domain shared with the other GFTV apps that was never a
    safe thing to do.

68. **The kill switch costs no extra request.** Decision 7 said the worker reads
    the maintenance overrides on navigation, which sounded like one more fetch
    per page. It is not: every page already fetches `/api/public/feature-status`
    on load, and that endpoint is `no-store` and therefore network only anyway.
    The worker simply **reads the answer on the way past** and keeps it in the
    state cache. Offline there is no answer and the last one stands, which is
    the same direction that endpoint already fails in — everything on.

69. **`install` switched off is a 404 on `/manifest.json`.** The obvious
    implementation, removing the `<link rel="manifest">`, would have to reach
    thirty three HTML files and the server rendered posting page. It would not
    stop a browser that had already read the manifest. A 404 is what actually
    stops the install being offered. Its honest limit is that an app already
    installed keeps working, which no switch of any kind could change.

70. **`404.html` and `placeholder.html` are deliberately not precached.**
    Neither is ever navigated to by address: Vercel serves the first for an
    unknown path and rewrites unbuilt routes to the second. Offline the worker
    cannot tell an unknown path from an unbuilt route from a page nobody has
    opened yet. **`/offline` is the honest answer to all three**. Both are named
    in `check-precache.js`'s `EXPECTED_ABSENT` with that reason, so the "not
    precached" listing stays worth reading.

    `HLC-main.png` is absent for a different reason: 574 KB that only a crawler
    fetches. The two maskable icons are absent because the launcher reads those
    at install time and not through the worker.

71. **The two connection wordings are one bar, not two.** Offline outranks
    unreachable, which outranks the update prompt, and only the highest is
    drawn. Two bars stacked above the header stops being "unobtrusive", which is
    the word section 14 uses. The consequence to know: **an update prompt raised
    while somebody is offline is not shown until they are back online.** That is
    the right way round, because accepting it reloads the page.

    The two connection states are **not dismissible** and the update prompt is.
    Section 14 says the banner goes when connectivity returns, not when somebody
    closes it. A dismissed offline banner would be a reader wondering why
    nothing works with nothing on screen to say why.

72. **`api.js` announces, and `offline.js` listens.** A DOM event pair,
    `gftv:apireached` and `gftv:apifailed`, and not `api.js` calling into the
    banner. `api.js` is imported by nearly every page module. Giving it an
    import that reached back into the shell would be a cycle waiting to happen.
    It is the same shape as `gftv:localechange`, which the build already uses
    for exactly this reason.

    **`reached` means an HTTP response arrived, whatever its status.** A 503
    from a maintenance switch is the site answering, and a banner claiming
    otherwise would turn a deliberate outage into a suspected one. An aborted
    request announces nothing: that is the page changing its mind, not the
    network failing.

73. **Registration moved from the markup into a module, and that is what makes
    the prompt possible at all.** Thirty three HTML files and `page-shell.js`
    each carried their own `navigator.serviceWorker.register('/sw.js')`. That
    was right while registering was the whole of it, and wrong the moment there
    was something to prompt about. **The prompt needs the registration object,
    and an inline script in the markup has nowhere to hand it to.**

    It registers on `load` and not immediately. The install fetches a hundred
    files, and starting that while the page is still fetching its own makes a
    first visit slower for nothing.

    **This changed the `worker` section of the test, and the change is the
    proof.** Its check 23 posts `skip-waiting` by hand, and once `offline.js`
    was on the page that message caused a real reload mid-poll — the section
    threw. The reload is the feature. `until()` now treats a destroyed execution
    context as "not yet" and not as an error. In this phase the page genuinely
    can reload underneath a poll. A harness that threw on it would be reporting
    the feature as broken *because it works*.

74. **The user id is part of the key, not a field beside it.** `mine` has a
    keyPath of `['userId', 'kind']`, so a read for one applicant cannot return
    another's row **even if the wipe failed**. Section 14 asks for a store
    "keyed by their user id" and the literal reading is the better one. The wipe
    is the policy, and the compound key is what makes the policy hard to get
    wrong. Checked directly — reading a stored row under a different id answers
    null.

75. **A null session wipes nothing, and this is the one that would have been a
    real defect.** Section 14 says to clear on logout, and the obvious
    implementation is "no user in the session, so clear". That is wrong here in
    a way that only shows up offline. **The session request fails every single
    time there is no connection.** So a page loaded offline would report no
    user, and delete the applicant's saved roles, applications and tasks. That
    copy is the only one they have.

    So only two things wipe: an explicit sign out, and `syncUser` finding a
    different id. A failure to ask is never an answer.

76. **The wipe is ordered before any write by the module, not by its callers.**
    `shell.js` starts `syncUser()` without awaiting it, deliberately, because
    nothing on screen should wait for it. So a page module could reach a write
    first. Every read and write in `idb.js` waits on one internal gate that
    `syncUser` chains onto. That makes "wipe the database before writing
    anything" a property of the file and not a habit of its callers. Check 49 is
    that race run on purpose.

    The same instinct as **"anything reading a module level cache has to be sure
    something filled it"**, one layer down. It is not enough for the ordering to
    be right today in the two places that happen to call it.

77. **The board keeps its own copy, and does not rely on the response cache.**
    The worker caches `/api/public/search` by URL, so a reader offline under
    filters they have never used before would get nothing at all. Section 14
    asks for "the last successful result set, including its filters", which is
    one thing and not one per query. So `search-page.js` keeps exactly that in a
    **`public` store in IndexedDB**. It is a fourth store, taking no user id and
    **not cleared by `wipeAll`**. Signing out must not take the board away from
    the signed out reader still holding the phone.

    **Two sentences, not one.** If the saved filters match what was asked for it
    says the board is from a date; if they do not, it says so outright. Showing
    somebody who searched for "camera" a board that was never about cameras and
    calling it merely old is a quiet lie. It is the sort that survives for
    months because nothing about it looks wrong.

    **Only a network failure falls back.** A 500 or a 503 is the site answering.
    Putting yesterday's board in place of an error would hide a real fault
    behind stale data. It is the same instinct as deviation 55's "a check that
    learned nothing writes nothing".

78. **The worker keeps a posting index, and membership is not part of it.** The
    fallback page has to list postings by name, and a name is inside the cached
    document. So `sw.js` reads the inlined `#jobData` payload at cache-write
    time and keeps `path -> { titles, cachedAt }` in the state cache.

    **What it deliberately does not keep is which postings are held, or in what
    order.** That stays with the postings cache, whose `keys()` order `touch()`
    already maintains as least recently viewed. Two sources of truth for
    membership is how a list ends up offering a posting that was evicted an hour
    ago. So the index is pruned to match after every trim, and a posting held
    with no index entry is skipped and not listed unnamed.

    Reading the payload and not the `<title>` tag is what makes the list
    bilingual. The tag carries the English title only, and the payload carries
    every language the posting is ready in.

79. **The last-updated line appears only while offline.** Section 14 asks that
    "any cached view carries a quiet last updated timestamp". Taken literally
    that would mean the line on every posting on every view. Stale while
    revalidate means the cached copy is served first every single time. A marker
    that flashes for 200ms on a page that is about to be correct is noise. Noise
    is what nobody reads by the second week.

    So it is drawn when `navigator.onLine` is false, on both connection events,
    so it appears and goes without a reload. And **only when the worker actually
    reports a time**. "Saved at some point" is not worth saying. A page that
    showed the current time for something it had never stored would be the exact
    mistake the line exists to prevent.

80. **A failed session request is a third state, and the build had only two.**
    `applicantSession` answered `{ user: null }` for both "nobody is signed in"
    and "we could not ask", and every caller read it as signed out. Offline that
    request fails **every single time**, so `mountAccountPage` sent an applicant
    from their own dashboard to `/login`. That is the one page in the build that
    cannot work without a connection, reached by a redirect that could not load
    either. **Phase 10 part 3's run found it and part 7 closes it**, with an
    `unreachable` flag, and only a real signed out answer redirects.

    The same shape as a rule the build already had: **a count that could not be
    read is `null`, never `0`.** "The table could not be read" and "there has
    never been a run" are different claims. So are "we could not ask who is
    signed in" and "nobody is".

81. **The offline account area authenticates nothing and does not pretend to.**
    The profile kept on every successful mount draws the identity and lets the
    three pages read their own rows. Every endpoint still checks the real
    cookie. An applicant reading this offline sees what they already had and can
    change nothing. That is why part 9's honest disabling is the other half of
    this and not decoration on top of it.

    **The header falls back with it.** A page listing somebody's own
    applications under a "Sign in" link is the site disagreeing with itself
    about who is looking at it. A reader has no way to tell which half is right.

82. **A page that never loaded has nothing saved, and says so.** `pageData`
    answers null when there is no copy and the page shows its ordinary error. An
    empty list under a "saved on your device" line would tell somebody they have
    no applications. The truth is that this device has never seen them. **Only a
    network failure falls back at all**: a 500 or a 503 is the site answering.

83. **A queued answer is an eighth state on the Apply control, not a variant of
    an existing one.** It resolves above `pending`, `applied` and `cooldown`.
    Above `pending` because the row genuinely is still pending on the server and
    asking again would be asking a question they have already answered. It is
    above the other two because **neither has been earned by anything but a
    local queue entry**. Section 14 says a queued answer is pending until the
    server confirms it, and this is what that looks like on screen.

    **`apply-dialog.js` deliberately does not dispatch `gftv:applychange` when
    it queues.** That event is what moves the control to applied and puts the
    cooldown date on the page. `queue.js` is the only place it is dispatched for
    a queued answer, and only on the server's reply. That keeps the settled rule
    intact: five things write `applied_at` and `cooldown_until`, and an offline
    answer is not a sixth.

84. **The verdict rule exists twice, and one of the two copies is checked
    against the other.** Background Sync runs in the worker, a worker is a
    classic script and cannot import `queue.js`. The alternative is the worker
    asking an open page to flush. That defeats the entire point of Background
    Sync, which is flushing when no page is open. So `sw.js` carries the
    minimum: read, send, keep or drop.

    Duplication is a real cost and this is the repo's existing answer to it. The
    pre-paint theme script duplicates two constants from `theme.js` for the same
    reason. What is new is that **two checks exist only to catch the pair
    drifting**, including the Background Sync tag itself. A tag that differs
    between the two files is a queue that never flushes in the background, with
    nothing on screen to say so.

85. **A flush stops at the first network failure.** The rest will fail the same
    way, so continuing would spend one request per waiting action to learn what
    the first one already said. A burst of parallel writes from a phone that has
    just come back is exactly the shape that meets a rate limit. This would then
    read that as a reason to retry, in a loop. The queue is sent serially and in
    order for the same reason.

86. **There are three reasons a control can be disabled, and the third does not
    borrow the first two's machinery.** `build-status.js` says in as many words
    that there are two and that they are never conflated. They are a feature
    that has not shipped, and one an admin has switched off. Offline is a
    different kind of claim again. **It is about the reader and not about us.**
    Nothing is broken, nothing is unbuilt, and it will work in a moment. Sharing
    the mechanism would have meant sharing the wording. So `data-needs-network`
    is its own attribute and `.offline-hint` its own class, and neither pass
    knows the other's sentences.

    Two consequences, both checked. **A control already disabled for another
    reason keeps that reason.** Telling somebody to wait for their connection
    when what they are waiting for is phase 11 is the wrong sentence. And
    **coming back online re-enables only what offline disabled**, and only when
    nothing else still holds it down. The two passes run in whichever order
    their promises land. Re-enabling on our own reason alone would leave a live
    control in front of an endpoint that answers 503. That second one was wrong
    in the first draft, and a comment claiming it was fine was wrong with it.

87. **An orphaned earlier draft of this part was found in the tree and merged
    and not left.** `main-site/assets/js/needs-network.js`, 129 lines, untracked
    and referenced by nothing. It is an earlier attempt at exactly this, with
    the same "third reason" framing and the same resolution order. It had been
    sitting there since before phase 10 started.

    Two things in it were better than what had just been written, and both are
    now in `offline.js`. The first is **`'disabled' in el`**, because setting
    that property on an anchor does nothing at all. It would leave a live link
    claiming to be disabled. The second is **the visible hint as opt in**, via
    `data-needs-network-hint`. That way the avatar's Choose and Remove sitting
    side by side do not put the same sentence on screen twice. The file is
    deleted: two modules doing one job is how the sentences drift apart. That is
    the exact failure the deviation above it is about.

88. **The dashboard draws no sidebar offline, not just no data.** The obvious
    reading of "cache its shell only" is that the chrome is safe and the tables
    are not. It is not: **the sidebar is built from the caller's role and access
    flags, and those are exactly what could not be read.** A job poster shown an
    admin's sidebar would be a dashboard drawn from a guess about who somebody
    is. That is the single thing this phase is most careful not to do. So the
    notice replaces everything and `mountAdminPage` returns null, which stops
    every page module before it asks for anything.

    It also stops the dashboard redirecting to `/admin/login` on a network
    failure. It is the same defect as deviation 80 on the applicant side, found
    in the same place and fixed the same way.

89. **The kill switch was a one way door, and the seam is what found it.**
    Decision 7's whole argument is that a bad service worker outlives its own
    fix. The thing serving the broken copy is the thing you would have to reach
    to replace it. The switch as part 3 built it had exactly that shape in
    reverse. `handle()` read the switches and, with `offline` off, returned the
    network for **every** request, including `/api/public/feature-status`. So
    the worker stopped listening the moment it was switched off. No admin could
    ever switch it back on, on any device that had visited while it was off,
    across every later deploy. Three changes, all in `sw.js`:

    - **`feature-status` is handled above the kill switch.** It costs nothing:
      that endpoint is network only in both states and caches nothing either
      way.
    - **The caches are dropped and refilled on the edge, in
      `rememberSwitches`.** Dropping per request raced the refill that switching
      it back on starts — same page load, requests still in flight, last one
      wins. That race is what made check 124 fail on the first run, and it would
      have been invisible in production. An admin flips the switch back, the
      reader's phone looks fine because the site is reachable, and offline
      quietly never returns. Nothing can fill a cache while the switch is off,
      so one drop on the edge is enough.
    - **The refill exists at all**, because `install` is the only other thing
      that ever fills the shell. Without it the switch was reversible on paper
      and not on the phone until some later deploy happened to install a new
      worker. Install now skips the precache while the switch is off, instead of
      fetching a hundred files to be thrown away.

    The rule this is an instance of is one the build already had, arriving from
    a new direction. **A flag nothing enforces is the failure this build keeps
    hitting.** A flag that can only be enforced in one direction is the same
    failure wearing a switch.

90. **A seam finds what a part cannot, and this one is the proof.** Every part
    checked what it had just built, and the two things nothing checked were the
    two that belong to no part. The first is **part 1's install surface**, which
    landed before the test file had a browser-free section to put it in. The
    second is **the kill switch**, which part 3 built and part 3's own run had
    no way to drive. Flipping it needs an API answer to stub.

    Neither gap looked like a gap. The count went up every part: 25, 39, 51, 61,
    74, 90, 100. A rising count is exactly what a phase looks like when it is
    being checked properly. **`--only=` with a name that does not exist now
    exits 1 and lists the sections**, for the same reason. It ran nothing and
    reported a clean pass, which in a phase whose every failure is silent is the
    worst possible default.

### Phase 11's

91. **The bot has no scripted checks, and is checked by a person against a
    checklist.** Settled 27 August 2026, and it is a deliberate departure from
    every phase since 7, each of which left a `tests/phaseN-test.mjs` behind.
    The site half of this phase is unaffected and keeps the Playwright habit; it
    is the Python on the VPS that is checked by hand.

    **The cost is specific, not general, and it is worth naming and not waving
    at.** Two failures are what a script would have caught here, and neither
    announces itself:

    - **A double send after a restart**, which only appears when two instances
      are polling. That is exactly the state a tmux restart that did not kill
      cleanly leaves behind. Nobody notices in testing because one instance is
      the normal case.
    - **Drift between what `start` lists and what actually works**, which grows
      silently over six parts and is the first thing a new reader sees.

    **So both are designed out and not tested for**, and these are requirements
    on the parts and not aspirations:

    - **The claim is one statement, and correctness comes from the database.** A
      single conditional update moving rows from `queued` to `claimed`,
      returning the rows it moved. A second instance claiming the same batch is
      impossible and not unlikely. **Nothing reads then writes.** If a part is
      tempted to select first and update after, that part is wrong, and no
      amount of manual checking would have caught it.
    - **One source of truth for the command list.** What `start` prints, what
      `setup.md` gives BotFather, and what the bot actually registers come from
      one list in one file. Phase 14's guide takes the same list. The same
      instinct as `check-i18n.js` and `check-precache.js`: the drift a person
      cannot see is the one worth making structurally impossible.
    - **The drain logs what it claimed, sent, skipped and failed**, per run.
      With no test the log is the only account of what happened.
      `gftvjobs_notifications` keeps the row states as the durable half.

    **The checklist itself is part 7's**, in `telegram-bot/README.md` beside the
    one phase 10 wrote for Android and iOS. Section 5 item 7 already says what
    to expect from this arrangement. **There is no regression suite here**, and
    with the bot there is now a component with no automated coverage at all.
    That is the trade, made knowingly.

92. **A bot command is gated on being built, not on its phase having shipped.**
    The obvious reading of 0c is that a command follows `isFeatureShipped` the
    way a button on the site does. It cannot, and the reason is a loop.
    `telegram_link`, `telegram_2fa`, `telegram_notifications` and `invites` all
    stay unshipped until phase 11 itself is flipped. The phase cannot be flipped
    until the bot has been walked through by hand, per deviation 91. And a bot
    that refused every command until the flip could not be walked through at
    all.

    So `handlers.py` asks two questions in order. **Is it built**, which is
    whether a handler is in the registry the dispatcher itself uses, and nothing
    else. **Then, has an admin switched its feature off**, which only means
    anything for something already shipped, exactly as on the site. The two
    sentences are never mixed: an unbuilt command gets the phase one, and a
    switched off one gets the maintenance one. Telling somebody a feature they
    used last week arrives in phase 11 would be a lie about a shipped feature.

    **The site's own gate is untouched**, which is what keeps this honest and
    not convenient. The Link control in account settings is still disabled to
    everybody until the phase ships, so no ordinary applicant reaches a half
    built command. Somebody who deliberately messages the bot during the build
    reaches one that works, and that is the entire point.

    One consequence worth writing down: **a command's switch is not always the
    bot's own key.** `/jobs` obeys `job_search`, because an admin taking the
    board down has to take the bot's copy of it down too. It would be a poor
    kind of consistency for the site to say the board is off while the bot
    cheerfully lists postings from it. `start` obeys nothing at all: an
    explanation of what this is has to survive every feature in it being off.

93. **Nothing in this repository starts, stops or knows about tmux.** Settled 28
    August 2026 with the operator, who manages the session. There is no
    `restart.sh` and no systemd unit, and section 15's tmux arrangement stands
    as written.

    What deviation 91 actually needed was not automation. It was that **"the old
    one is definitely dead" stops being a judgement call.** A restart that does
    not kill cleanly leaves the old process answering commands with last week's
    code. The symptom is a reply that was going to arrive anyway. So the check
    moved into the bot: `lock.py` takes an exclusive advisory lock at startup. A
    second instance does not wait, does not retry and does not steal it. It
    prints the pid holding the lock and exits 3.

    Three things about it that are deliberate. **The lock is released by the
    kernel**, `kill -9` included, so there is never a stale lock file to clear
    by hand. That failure mode is what makes people delete lock files as a
    habit, and thereby delete the protection. **Reading the pid is allowed to
    fail** and never replaces the refusal. `flock` on the VPS leaves the file
    readable, and the Windows fallback used while developing locks the byte
    range and refuses the read. The first version turned a clear refusal into a
    traceback about a permission error on a lock file. And **it is the second
    defence, not the first.** Two instances cannot double send a notification,
    because part 4's claim is one conditional update. This covers the different
    problem of an old process still answering.

### Phase 11 part 2's

94. **The QR is encoded in this repository, and the alternative was never a
    shortcut.** The obvious way to draw one is to hand the URL to an image
    service and get a PNG back. That URL contains a single use linking token,
    which is a credential for somebody's account. So the shortcut sends a
    credential to a company with no relationship to this project, and it lands
    in an access log. There is no version of that which is acceptable, and it is
    written down here because it looks harmless.

    So `api/_lib/qr.js` is a byte mode encoder at error correction level M for
    versions 1 to 9. That covers 180 bytes against the roughly 75 a t.me link
    with a token needs. It answers **a matrix of '0' and '1' and not markup or
    an image.** `telegram-link.js` builds one SVG path from it with DOM calls.
    Assigning server markup would break the rule that `ts_headline` is the only
    thing this build ever assigns that way. An image would be a second thing to
    cache and precache.

    **The verification is the part worth copying.** A QR with a wrong mask, a
    wrong block interleave or one flipped module still looks exactly like a QR.
    The failure is somebody's phone quietly not scanning it. So `jsqr`, an
    independent decoder, is a devDependency at the repo root beside playwright,
    and the `qr` section round trips every version through it. **It never
    reaches a browser and is not a dependency of the site.** The `panel` section
    then does the same to the page. It reads the `d` attribute back out of the
    drawn SVG, rebuilds the matrix from it and decodes that. The encoder and the
    path builder are two separate places this can be wrong, and only one of them
    is covered by testing the encoder.

    Written from the standard and correct on the first run, which is worth
    recording honestly and not as a boast. It is what having an oracle from the
    start buys, and the tables in that file are the half that cannot be derived.

95. **The linking token is claimed before the link is written**, which is the
    reverse of section 15 step 3's order. That step lists writing the link row
    and marking the token used afterwards. `spend_link_token` does the second
    first, in one conditional update filtered on unused and unexpired. It only
    writes the link if that update returned a row.

    The reason is the same one the outbox claim has. Two people opening the same
    deep link in the same second must not both be handed an account. The only
    thing that can decide which of them owns it is the database. **Nothing reads
    then writes.**

    The cost is real and is the right way round. A failure after the claim burns
    the token, and the person is told to ask for another. A spare token is ten
    minutes of nothing; a double link is a unique constraint violation somebody
    unpicks by hand.

    Two smaller decisions inside the same flow. **Starting a new code spends the
    outstanding one.** A person who opens the settings page three times is not
    leaving three live credentials for their own account in a table. Only the
    newest QR works, which is also what somebody looking at two screens expects.
    And **an already linked Telegram account is told so before the token is
    touched.** Tapping an old link twice does not burn a fresh one to be told
    something that could have been read first.

### Phase 11 part 3's

96. **The bot generates the login code, and section 15 reads as though the
    portal does.** "The portal sends a six digit code to the applicant on
    Telegram" is 7g's wording and 15's, and the portal cannot. Nothing on the
    site's side can reach Telegram, which is the phase's founding rule. So
    whatever sends the message is the only thing that can know what it says, and
    migration 011 stores hashes and never a code.

    What the site writes is a *request*: a row with `purpose = login_code`, five
    minutes, and `token_hash` set to a sentinel. The bot claims it, generates
    six digits, writes back the bcrypt hash, and sends. **The plaintext exists
    in one process and one chat message and is never logged.** The alternative
    was the site generating a code and passing it to the bot through the table
    in the clear. That is the one thing the column comment forbids.

    Two consequences to know. **`requirements.txt` has a third dependency**,
    `bcrypt`, at the same cost factor as the site's bcryptjs. The two read each
    other's `$2a$` and `$2b$` prefixes, checked in `--only=seam` against a real
    Python hash and not asserted. And **`/code` does not go through the loop.**
    The person is in the chat and the bot is already holding the message. A
    round trip through a table to talk to itself two seconds later would be a
    round trip for nothing.

97. **One column carries two meanings, and no migration was added for it.**
    `gftvjobs_telegram_tokens.token_hash` is `not null`, so a request that has
    no code yet still needs a value in it. It holds `pending:` and 18 bytes of
    randomness until the bot claims the batch. Then `sending:` and its own
    randomness while it is being worked on, and the bcrypt hash afterwards.

    **It is safe because a bcrypt hash always starts `$2`**, so a sentinel and a
    real hash can never be confused. The bot's claim is one conditional update
    filtered on the prefix, a whole batch in one statement. That is what makes
    the claim atomic. `verifyLoginCode` treats a row still carrying the sentinel
    as a wrong code deliberately. Telling somebody their code exists but has not
    been sent yet is a distinction only an attacker benefits from. Check 47
    exists because the sentinel is written in one language and matched in
    another.

98. **A magic link fetched without the nonce cookie is refused and not spent.**
    Section 15 asks for the browser binding and this is the branch it does not
    mention. Unfurlers, link checkers and the scanner in front of a corporate
    mailbox all fetch URLs and none of them carries cookies. Spending the token
    on one of those would burn somebody's one tap sign in before their thumb
    reached it. The symptom would be indistinguishable from a broken bot.

    **A wrong nonce is different and is spent.** That link has demonstrably been
    somewhere it should not have been. The refusal is a redirect to `/login`
    carrying a reason, not a JSON error. A person opened it with a whole
    browser, and a page of JSON is not an answer. The sentence names the code as
    the way through, which is on their phone already. It is also the second
    deliberate exception to phase 4's HEAD rule, and for the same reason phase
    9's cron is the first. A HEAD here would be a request to sign somebody in
    with the answer thrown away.

99. **Turning the second factor on revokes every trusted device, and 5d only
    asks for that when it goes off.** Off is the direction 5d lists, along with
    unlinking, and both are implemented. On is the addition, and it is the one
    that matters. A browser trusted while the factor was off would otherwise
    walk straight past the factor the moment it was switched on.

    It also closes a hole the site could not otherwise reach. **The bot's own
    `/unlink` cannot revoke a trusted device** without the service key touching
    `gftvjobs_trusted_devices`. That is not a table section 15 names, and
    widening what that key reaches is the thing this phase is most careful
    about. Revoking on the way *in* means nothing trusted before the factor
    existed survives it, whichever end the unlink happened at.

    Part 2's unlink changed with this, and its comment said the opposite. That
    was right while nothing depended on the link and wrong the moment a second
    factor did.

### Phase 11 part 4's

100. **An abandoned claim is requeued with the attempt counted, and section 15
     does not say what to do with one.** It describes the claim and the retries
     and stops there. From inside one healthy process there is no such thing as
     a claim nobody owns. There is here: a tmux restart between the claim and
     the send leaves rows `claimed` with nothing coming for them. That is the
     same failure as the queued row nobody drains that rule 3 exists to prevent.

     Settled 29 August 2026 with the operator: **requeue, then fail.** The other
     answer, marking a stale claim `failed` outright, is the only one that can
     never send a message twice. It buys that by dropping a notification every
     time the process stops at the wrong moment. A duplicate invitation is a
     cost paid in the open; a message nobody received is not. Telegram is a
     second channel and not the record, so the portal still has it.

     Three parts, all deliberate. **The lease is five minutes** against a batch
     that takes seconds, so a slow pass is never swept out from under itself.
     **The sweep runs on the first pass as well as every fifteenth.** The claims
     worth recovering are exactly the ones the previous process left. And **a
     row waiting out a backoff is not abandoned.** The sweep asks SQLite what
     this process is still holding, or patience would read as death.

101. **A retrying row stays `claimed`, and the schedule that says when lives in
     SQLite.** The obvious implementation puts it back to `queued` with a time
     it may next be tried. PostgREST's claim cannot express "queued and not
     before this", so the very next pass would take it. The backoff would be a
     comment and not a delay. `claimed` is also the honest word: the row is
     owned, this process is going to try it again, and nothing else should touch
     it.

     **Durable and not in memory**, which is the half worth keeping. A bot
     restarted a minute into a fifteen minute backoff should carry on waiting.
     It should not start the fifteen minutes again, and certainly not send
     immediately. Section 15 asks for SQLite scheduling for flood waits and the
     same mechanism answers every retry, which is one mechanism instead of two.

102. **A flood wait pauses the whole drain and costs the row nothing.** Telegram
     is rate limiting this bot and not refusing this message. So the pause is
     global, and is written to SQLite so a restart cannot walk past it. The row
     is given a time and not an attempt. Counting it would let a busy afternoon
     mark good notifications `failed`.

     Two smaller pieces. **The rest of the interrupted batch is given the same
     time.** It is not left claimed with nothing holding it until the lease runs
     out. And **the pause is a few seconds past what Telegram asked for.**
     Coming back at the exact second is how one flood wait becomes two.

     The security loop does the opposite and should. A login code that met a
     flood wait is dropped. By the time Telegram lets us talk again the five
     minutes are gone, and the person has used `/code` or a backup code.

103. **A kind the bot cannot render is never claimed.** The claim filters on the
     kinds `RENDERERS` holds. So a row queued by a newer site sits `queued` and
     untouched until somebody pulls the bot that knows what it is. Section 2 set
     this problem out before the phase started. Every kind has to be one an
     older bot can leave alone safely, and this is where it is decided.

     **Leaving it queued is the point, and it is not the same as leaving it
     queued forever.** Rule 3's queue nobody drains is about a row that can
     never be sent to anybody. This is a row that will be sent as soon as the
     halves match. The panel shows it as a queue that has stopped moving, which
     is exactly what it is.

104. **The outbox panel is on `/admin` and names nobody.** Section 15 says a
     failed row is left "for an admin to see" and does not say where. The honest
     reading is the overview and not `/admin/maintenance`. It is the same kind
     of thing as the cron panel already there. It is a process with no reader,
     reporting to the page somebody opens in the morning.

     **It names no applicant, and that is what keeps it where it is.** `/admin`
     is open to job posters, and deviation 57 made phase 9's submissions list
     admins only for exactly this reason. Every row of that list was an email
     address. A kind, an error, a time and an attempt count are enough to act
     on. The account behind a row is one query away for somebody allowed to make
     it. The test checks this against a payload that carries an applicant id
     anyway.

     One thing on it is not a count. **The oldest queued row is carried as a
     time.** The drain runs on a VPS this repository does not deploy to and
     cannot ask anything of. A queue that has stopped moving is the only
     evidence the portal ever gets that the bot is not running.

105. **The drain obeys the maintenance switch and the security loop does not**,
     and the two sentences are worth keeping apart. `telegram_notifications`
     switched off stops the drain claiming anything, and the rows stay `queued`
     instead of being skipped. A maintenance switch is a pause, and switching it
     back on has to deliver what waited. That is deviation 89's rule about a
     switch that only works in one direction, arriving from a third direction.

     `security.py` reads no switch at all, because the person there has already
     typed their password correctly and asked for a second step. Refusing to
     deliver their code would not degrade a feature; it would lock them out.

106. **Raising a task is what queues a notification, instead of each raise site
     queueing its own.** Section 15 describes the site writing a row when it
     invites somebody, and read literally that is a queue call in `invites.js`.
     A second is in `admin-applications.js`, and a third wherever the next phase
     raises a task. Each one correct, and the third one missing for a month
     before anybody notices. A task that appears on the dashboard and sends
     nothing looks exactly like a working feature.

     So the mapping from task type to notification kind lives in
     `admin-tasks.js` and every raise gets delivery without asking. The cost is
     that the kind is decided by the type and not by the caller. That is why the
     two interesting types are named explicitly and everything else is
     `task_raised`. A message saying something is waiting is true of every task
     by definition, so the default is safe in the direction defaults have to be.

107. **The payload is a copy of what was true when the row was queued.** The
     drain could read the posting when it comes to send. The message would then
     be about a role renamed twenty seconds ago by an editor who has no idea
     somebody is being written to. The site writes the role, the department and
     the note into the outbox row instead, and the bot reads no postings table
     at all.

     The same instinct as a question set frozen at raise time, and it buys the
     same thing. The record says what was sent and not what would be sent now.
     It also keeps the bot's reach into the shared database to the tables
     section 15 names, which matters because that key is on a VPS.

108. **A column PostgREST did not return is not a switch somebody turned off.**
     The toggle check is `link.get(column) is False` and not a falsy test. A
     link row read by an older select, which named no notify columns, reads as
     "no answer" and the message goes. The opposite reading is the worse failure
     by a distance. A missing column would silence an entire kind for everybody,
     and it would do it without an error anywhere. A skipped row is a perfectly
     ordinary thing for the drain to write.

     This is `null` versus `0` for a count, and the empty string that `or` read
     as a missing translation, arriving a third time. **The absence of a value
     and a value that happens to be falsy are different claims.** This build has
     now been bitten by treating them as one in three separate files.

109. **A toggle button's stored meaning is the kind, never the value.** The
     three buttons under `/notify` are redrawn after every tap, and the obvious
     shape stores "set invitations to off" in the registry. That button is then
     wrong the moment anybody flips the switch from another device, and it is
     wrong for ever. Section 15 requires the registry to outlive restarts.

     So the payload says which switch the button is attached to and the value is
     read live at click time. It has a second consequence worth the space. The
     callback id can then be derived from the account and the kind instead of
     being random. So redrawing the keyboard reuses three rows instead of
     writing three more on every tap.

110. **Declining an invitation writes to `gftvjobs_invites` and leaves the task
     alone.** The task on `/account/tasks` is the record that this person was
     invited, and that does not stop being true when they say no thank you. What
     changes is the invite's status, which is what an admin reads.

     The write is one conditional update filtered on the status still being
     `invited` or `seen`. That is what makes a button in a month old message
     safe. An invite the poster has since withdrawn, or one the applicant has
     since applied through, is answered without being written. `declined` is one
     of the two states migration 008 defined and phase 8 deliberately left
     unwritten. It said at the time that it was phase 11's, because only
     Telegram can offer a button that means it. `seen` is still unwritten: a
     message delivered to a chat is not a message read, and this build does not
     claim otherwise.

### Phase 11 part 6's

111. **`/jobs` asks the site and not the database, and section 15 would allow
     either.** The bot holds a service key and the postings table is right
     there. So reading it is the obvious implementation, and it is the wrong one
     twice over.

     **Once for correctness.** *Which postings are live* is a real question with
     an answer already written. That answer is published, unexpired, ready in
     this language, newest first, resolved through `gftvjobs_search_jobs`.
     Writing it again in Python would be a second implementation kept in step by
     nobody. The way it would fail is a bot confidently listing a role the board
     stopped showing last week.

     **Once for reach.** Section 15 names what the key is for: accounts, links,
     tokens, invites and the outbox. `/api/public/jobs.json` needs no credential
     at all, can never change anything, and is the endpoint section 4 already
     published for anybody aggregating openings. The narrowest thing that can
     answer a question is the one to ask, and here it is also the one that
     cannot drift.

     The honest cost is that `/jobs` has nothing to say when the site is
     unreachable. That is why `feed.py` keeps its last copy for a bad minute. It
     is also why a feed that could not be read says so instead of reporting an
     empty board.

112. **A command reads the tables now; a notification is a copy of then.** Part
     5 settled the opposite and both are right. That is worth writing down,
     because the two rules look like a contradiction sitting one file apart.

     Deviation 107 froze the role, the department and the note into the outbox
     row at queue time. So a message cannot be about a posting renamed twenty
     seconds before it went out, and the drain needs no reach into a postings
     table. Nobody is standing there. **A command is the other case entirely.**
     Somebody has just asked what their applications are doing. Answering from a
     copy taken weeks ago would be answering a question they did not ask. So
     `/applications` and `/invites` read, and the invite notification stays a
     copy.

113. **The nine application status words are a second copy of the portal's, and
     the copy is checked and not trusted.** The alternative was sending the
     enum, which is what the column holds. `under_review` on somebody's phone is
     a database detail leaking into a sentence about them.

     So `strings.py` carries the words `status.*` carries in `en.json` and
     `zh.json`, and **check 80 compares them value by value in both languages**.
     The failure it exists to catch is silent and slow. Somebody rewords "Not
     this time" on the site, and the bot keeps saying what it always said. One
     application is described two ways to one person. Same family as the bcrypt
     seam and phase 10's two copies of the queue's verdict rule.

     **An unknown status says where to look instead.** The check constraint can
     gain a value in a later phase, and this process is pulled by hand. An
     unknown enum falls back instead of being refused. A chat window inventing a
     sentence about somebody's application is the one fallback that would not be
     acceptable.

114. **Every list draws five and then points at the portal, and `/tasks` draws
     no list at all.** Section 15 asks `/applications` for "the applicant's own
     application list", and the literal reading is every row.

     A chat window is not a dashboard. Twenty applications in one message is a
     wall somebody scrolls past on the way to the portal. The whole list is
     already there, with the buckets and filters 7g built for it. Five and a
     count of the rest answers the question actually being asked, which is
     whether anything has moved.

     **`/tasks` is the sharpest version of the same thing, and section 15 asks
     for it outright**: a count and a link. A task can carry a frozen question
     set that has to be answered accurately, and the page renders it properly. A
     chat paraphrasing a request somebody must answer exactly would be the worst
     of both. `render_task` reached the same conclusion in part 4 from the other
     direction.

115. **A stylesheet written for icons reached a symbol that is not an icon, and
     three checks watched it happen.** Found by looking at `/account/settings`
     on 29 August 2026, minutes after the flip made the panel reachable at all.
     The QR rendered as a solid block: navy on white in the light theme, pale
     grey on white in the dark one, unscannable in both.

     `theme.css` sets `stroke: currentColor` and `stroke-width: 1.75` on every
     `svg`, for the icon set, which is the whole reason the icons work. **Stroke
     is an inherited property, and one unit in this viewBox is one module.** So
     every module in the symbol was outlined at nearly two modules wide, and the
     light ones closed up. The white plate took a dark border from the same
     rule. `drawQr` had it right the whole time — `fill="#000000"` on the path,
     `fill="#ffffff"` on the rect. And **a presentation attribute loses to a
     stylesheet**, which is the half of the cascade that made this invisible in
     the source.

     Three things follow, and the third is the one worth carrying:

     - **The opt out lives in `app.css`, not in `theme.css`.** The icon rule is
       correct for icons and this is the exception, so `.telegram-qr svg, *`
       clears the stroke and pins the two colours. **A QR is black on white in
       every theme and at every brightness.** A scanner thresholds the image,
       and the reader's theme is none of its business.
     - **`sw.js` to `v96`.** A stale worker serving `v95`'s `app.css` would keep
       drawing the block for anybody who already has the site.
     - **Checks 15, 16 and 17 all passed against the broken page**, which is
       what makes this a rule and not a fix. They read the path data and the
       `fill` attributes — the model of the symbol, which was never wrong.
       Checks 18 and 19 read `getComputedStyle` instead, in both themes, and 18
       fails on the tree without the rule. **Assert the computed style, not the
       attribute, on anything a stylesheet written for something else can
       reach.** The sibling of phase 9's "waiting for an element in the static
       markup is waiting for nothing". Both are a check that agrees with the
       source while the page is wrong.

### Phase 11 part 7's

116. **The seam changed code, and it was supposed to be documents.** Part 7 is
     the READMEs and the checklist, and it ends with `commands.py` reading a
     second document. The reason is what part 7 was for. The bot README's
     command table is a **third** copy of the one list deviation 91 made
     structurally single, after `commands.py` itself and `setup.md`'s blocks. It
     had been sitting there uncheckable since part 1.

     **Writing the checklist is what made that visible.** The checklist is the
     document that says what a person should see, and the table is the document
     that says what they can ask for. The two are read together or not at all.
     Leaving it would have meant a seam that wrote down a drift it had just
     found and did nothing about it.

     Twenty lines, one file, no new dependency, and `--check` still exits 0 or 1
     with the same words. **The rule it is worth keeping is the smaller one.** A
     list that is generated into one document and typed into another is not one
     list, however clearly the docstring says it is.

### Phase 12's

117. **Layout is measured in one theme, not the four section 12 asks for.**
     Settled 30 August 2026. The two axes — `data-color-theme` and `data-mode` —
     change colours and nothing else: no font, no size, no spacing, no
     breakpoint. A layout that holds in one holds in all four. Walking six
     widths, seven pages and two languages through four combinations is 336 page
     loads to re-measure numbers that cannot have moved.

     **What the combinations do change is contrast**, which is the thing this
     reduction would actually lose. That is not deferred. It is part 3, it is
     measured and not looked at, and section 8 item 9 has been carrying it since
     phase 10. **The reduction is in what layout means, not in what the phase
     covers.**

118. **The responsive and AA pass covers the portal, and the docs site's moves
     to phase 13.** Settled 30 August 2026. Section 12 says both sites;
     `docs-site/` is a scaffold with no pages until phase 13. A pass over an
     empty frame proves the frame, then phase 13 fills it with the content that
     was never checked. That is the wrong order and a false sense of coverage in
     between.

     **Recorded and not quietly narrowed**, on the same reasoning as part 7's
     deferred drain cases. The gap is written into section 6 as phase 13's
     inheritance, so what is inherited is a task and not a surprise.

119. **Part 4 built a check, and the plan gave it a round trip.** Settled 31
     August 2026. Section 12 asks for "a read through of every dictionary by
     someone who reads that language". Section 2 accordingly had part 4 as an
     envelope. Generate the page, send it, apply what comes back. What it
     actually needed first was a page worth sending. `zh-review.html` was
     rendering 223 of 1,728 interface strings and none of the bot's. So the read
     through as planned would have taken a reader's afternoon and covered an
     eighth of the Chinese in the build. And **nobody on either end would have
     known**, because the page counted the full number in its own header.

     **So the part is a generator, a check and a round trip and not a round
     trip.** The check is the smaller half and the one that pays later. Five
     rules over all 1,929 pairs decided four findings without a reader. The
     coverage half means the next file that ships 华文 either goes on the page or
     is exempted with a reason somebody wrote.

     **The deviation worth naming is the shape, not the extra work.** A task
     whose deliverable is somebody else's judgement still has a deliverable of
     its own, and it is the thing they are given. Part 3 had already said this
     about a probe; part 4 says it about a page.

120. **The probe's table is not the table section 6 specifies, and this is the
     first time this build has changed a specified schema.** Settled 31 August
     2026 with part 7, decision 23. Section 6 names one table,
     `gftvjobs_status_checks`, with a row per request: "id, target, ok,
     status_code, duration_ms, error, checked_at". Section 15 says to record
     each check into it and section 11 says to sweep it at ninety days, "about
     six thousand rows a day".

     **The specification's own arithmetic is the argument against it.** Six
     thousand rows a day is half a million over the ninety days 0c draws. On the
     free tier this project runs on, that is a large fraction of the budget
     spent recording that nothing happened. **What is built instead is two
     tables.** One is a day per target counting what was watched. The other is a
     row per outage, opened by the first failed check and closed by the first
     one that succeeds.

     **It keeps every promise the specification makes and one it could not.**
     0c's rules survive intact. A day nobody probed has no row and draws as
     unknown, a percentage is printed with its coverage, and nothing is
     backfilled. The day counters are what preserve them. "This day was fine"
     without how much of it was watched would be the same fabrication in a
     smaller disguise. What the specified shape could *not* do is state a real
     outage duration. Failures alone can only be closed by failures stopping, so
     every length would have been a floor. An outage row is closed by an
     observed success.

     **This is a deviation and not an interpretation**, which is why it is
     written here and not absorbed. Section 6 names a table this build does not
     create. Section 11's sweep is now a much smaller one than the sentence that
     asks for it describes. And section 15's "record the status code, the
     duration, and whether it succeeded" is honoured as counters and a worst
     case, and not per request. **The specification was reconciled instead of
     being left to drift**, settled the same day. Sections 6, 11 and 15 and 0c's
     probe list now describe the two tables and the function. A line in section
     6 records what the shape was and why it changed. 0c's rules are untouched,
     because the new shape was built to keep every one of them.

121. **There are six READMEs and section 2 allows five, and the seed script is
     Node where section 6 would have made it SQL.** Both settled with part 8 on
     31 August 2026, and they are recorded together. The pass that found the
     first is the one that had to decide the second.

     **`tests/README.md` is the sixth**, added when the phase files became
     something a person other than their author would run. It was never written
     down as a deviation until now. Section 2: "Four READMEs, and only these
     four plus the one in `migrations/`. Do not scatter a README into every
     subdirectory". The rule's purpose is intact: six is not scattering, and
     each one says what lives in its directory. But the count is wrong, and the
     `seam` section now asserts exactly these six. So a seventh is a finding and
     not a habit.

     **The seed script is `seed.mjs` and not a numbered file.** Section 6 says
     all DDL is numbered SQL and section 17 asks for a seed script without
     saying what it is written in. Every other piece of data in this build
     arrives as SQL. This one cannot. 16g wants screenshots taken while signed
     in as invented people. An account is a bcrypt hash `api/_lib/password.js`
     would accept, and Postgres cannot produce one. So the seed is Node,
     importing the site's own client and its own hashing instead of
     reimplementing either. `migrations/README.md` says so where somebody would
     look for it. **Nothing about the migration rules moves**: this creates no
     schema, records nothing in `gftvjobs_migrations`, and touches no reference
     data.

122. **The portal's staff sessions are not in `gftvhello_sessions`, and 5a says
     they should be.** Settled 31 August 2026, after phase 12 shipped and before
     phase 13 started, as migration `038` and **`2c27a2b`, "phase 12 part 8a"**.
     Applied, deployed, and confirmed the same evening by signing in to both
     sites.

     **What was reported.** A staff session on the portal did not last more than
     about a day with "stay signed in" ticked for 30 days. Signing in on one
     site ended the session on the other.

     **What was measured before anything was changed**, which is the part worth
     keeping. The portal issues exactly what it promises. `stay_signed_in: true`
     produced a cookie whose `Expires` was 30.00 days out, and a row whose
     `expires_at` read the same. Both were confirmed against the deployment with
     a real sign in. It deletes a staff session row in three places and no
     others. Those are a logout, a row found genuinely expired on read, and
     `invalidateAllSessions`. **That last is never called for the staff realm
     anywhere in the codebase**. The daily cron excludes that table by name with
     section 11's rule written beside it. So nothing here shortens or deletes
     those rows, and the two sites nevertheless ended each other's sessions.

     **What was left was the table.** One set of rows, two applications, and the
     other one applying its own rules to rows it did not create. 5a's sentence
     is "the existing `gftvhello_users` and `gftvhello_sessions` tables, so the
     same accounts that sign in at gftv.asia work here". And **the accounts half
     is what that is for.** Sharing the session rows was a consequence of the
     sentence and not a requirement of it, and it is the consequence that was
     undone. `gftvhello_users` is still the one source of who a staff member is,
     still read only.

     **The specification had already reached this answer for the third site.**
     5h gives the docs site its own cookie and its own table. The reason: "so a
     docs sign in is never mistaken for a gftv.asia one". It is also "separate
     from any portal staff session so signing out of one site does not sign you
     out of the other". Three sites, three session tables, one set of accounts.
     The portal was the one that never got it, and `038` creates its table
     alongside the docs site's. That is instead of making phase 13 write a near
     identical file a week later.

     **What it cost**: every portal staff session ended once, on the deploy. The
     rows in `gftvhello_sessions` were not copied across, because writing rows
     into the other site's table is precisely what this change exists to stop.

     **And one thing it found on the way past.** `034` and `037` never recorded
     themselves in `gftvjobs_migrations`. So the only record of what has been
     applied was two rows short since 30 August. They are backfilled by `038`
     and not by editing two applied files. The rule that caught it is part 8's:
     **a list is compared against the thing it lists, in both directions.** This
     one had never been compared at all.

123. **An admin can edit an applicant's details, and 8.9 does not have that
     action.** Added 31 August 2026 because it was asked for, after phase 12
     shipped and before phase 13 started. The brief gives that page search,
     deactivation, deletion, a password, a forced reset and an unlink, and
     stops. Five editable fields — username, email, display name, phone,
     language — is new surface and not an interpretation of an existing line.
     That is why it is here.

     **It is written to the page's own rules and not to new ones.** Admins only,
     a required reason, an audit row, and the same validators the applicant's
     own edit uses. An admin typing somebody's email is not a reason to accept
     an address its owner could not have typed. Uniqueness is checked before the
     write and again by the constraint underneath it. Between the two there is a
     moment where somebody else can register the same address.

     **Two of the five are login identifiers and that is the whole of the revoke
     rule.** A username or an email moving under somebody ends every session and
     trusted device, exactly as the three assisted actions above it do. A
     display name, a phone number or a language does not. Signing an applicant
     out over a corrected capital letter teaches an admin to avoid the page. The
     response names which happened, so the page can say "they have been signed
     out" in the same breath as "saved". That is instead of leaving an admin to
     hear it from the person they edited.

     **Nobody is notified, and that is consistency and not convenience.**
     Settled with the request. Nothing on this page tells an applicant anything
     today, and an admin setting their password does not either. This build
     sends no email at all, so the only channel is Telegram and only for a
     linked account. A notice here alone would leave the *password* action as
     the quietest thing on the page. What the applicant has instead is the value
     on their own account page. There is an audit row naming the admin, the
     reason, and both sides of every field that moved. **If a security notice is
     ever built, it covers all of 8.9's actions and not only this one.**

     **And the Telegram identity is shown, read only.** 8.9 says to verify
     identity out of band before unlinking, and the `@name` is not what to
     verify against. Its owner changes it whenever they like, and somebody else
     can take the old one. The numeric id is the account, and it crosses to the
     browser as a string because ids past 2^53 do not survive JSON as numbers.

124. **A bad day on the status page opens the outage that made it bad.** Asked
     for on 1 September 2026 as "any colour other than green or white". It is
     hoverable and clickable, with an overview of that day's incidents and a
     jump to the entry. Part 7 built the bars as ninety inert squares, so this
     is an addition to a shipped page and belongs here beside deviation 123.

     **The colour is what makes a square eligible and not what makes it a
     link.** A working day and a day nobody measured lead nowhere, which is the
     request as given. The three that are left are partly measured, degraded and
     down. They lead somewhere only when the panel below is actually drawing an
     outage for that target on that day. **A degraded day whose failures were
     too few to list, or whose outage the cap held back. It stays a coloured
     square with its sentence on hover and no link.** A link that scrolls to
     nothing is worse than no link, on the one page whose subject is not
     claiming more than it can show. The shortened list is computed once in
     `renderServiceBody` and shared with both, so the bars and the panel cannot
     disagree about which outages exist.

     **An id derived from the incident and not from its place in the list.** An
     index is stable inside one response and meaningless in a link somebody
     copies: the tenth outage today is a different outage tomorrow. Target plus
     start is unique, because migration `037`'s function extends the open row
     instead of opening a second one.

     **`role="img"` had to become `role="group"`.** A role of img makes its own
     contents presentational, so focusable children inside one are a defect
     whatever they look like. The bar keeps its tabindex, so a scrolling region
     is still reachable without a pointer. A screen reader reaching the few days
     that are events can now act on them. That is better than part 7's ninety
     squares, which said nothing individually.

     **Three things only looking found**, which is part 3's lesson for the
     fourth time. The hover ring was being painted over by the neighbouring
     squares, because it is drawn 1px outside a square with 1px of gap either
     side. It read as a line down one edge until the hovered square was given a
     stacking context. The jump landed the entry under the sticky header until
     `scroll-margin-top`. And relaxing the link rule on purpose to watch the
     checks fail made the section *throw* instead of reporting. That is how
     `incidentId` learned to read through nothing. An id for an incident that is
     not there should be a useless id and never an exception. That page has a
     floor under it precisely because it must work while things are going wrong.

     **And the phase's own Chinese guard caught the note written for it
     yesterday.** It found `运营` where Singapore usage is `营运`, in phase 12's
     shipped note. Nine new checks in `status`, five more in `a11y` that drive a
     real click. The file reads 554 passed, 0 failed, 6 skipped offline.

### Phase 13's

125. **Trusted devices cannot be "listed per site", and 5f asks for exactly
     that.** Phase 13 part 2, 1 September 2026. The sentence is 5f's. Trusted
     devices are "listed per site with a label saying which". The reason 5f
     gives: "the token cookie is host scoped and trusting the portal does not
     trust the docs site".

     **The first half is built and the second cannot be.** Trust really is per
     site. `gftv_docs_device` is host scoped, so a browser trusted on the portal
     answers the second factor again here. The two are earned separately. But
     both sites write `gftvhello_trusted_devices`, which has no label column and
     no site column. Section 2 forbids adding either to a `gftvhello_` table. So
     each site's list shows rows the other created, and a revoke here revokes
     there.

     **One way to buy the label was available and was declined.** The token
     could have carried a `docs:` or `portal:` prefix in front of its 32 random
     bytes. That means no schema change, existing rows migrating on rotation,
     and every row readable. What that costs is semantics inside a bearer token,
     in a table gftv.asia also writes and this build does not control. All to
     make a settings page tidier. The entropy would have been untouched and the
     risk was not the entropy. The risk is that this project would be choosing a
     format for a value another application also stores.

     **What ships is the sentence instead**, in the header of
     `trusted-devices.js` on both sites and in `docs-site/README.md`. The list
     is the account's trusted devices, and not this site's. Part 6 says it on
     the page. A list that quietly implied a scope it does not have is the
     failure this build keeps naming. It is a page claiming more than it can
     show.

     **The passkey half of the same problem went the other way**, and the
     difference is whose table it is. `gftvjobs_staff_passkeys` is this build's,
     so migration `039` adds the column and 5f gets its answer there.

126. **The calling session was kept by "sign out everywhere", and 5f does not
     say to keep it.** Phase 13 part 7e, `643c7dd`, 3 September 2026. It is
     recorded here because the deviation was the *original* behaviour, and it
     was never written down. `danger.js` passed `{ keepSessionId:
     session.sessionId }` and argued for it in a comment. Somebody who has just
     typed a username, a password and a fresh code is looking at the page.
     Throwing them out to prove the action worked costs them a sign in.

     **It was found by pressing the button**, during item 24's walk, by somebody
     who expected the name on it to be true. That is the whole argument against
     the original choice. **The label is what a person reads, and the
     consequence line is what they read only if they stop to.** 5f lists the
     action as "sign out everywhere" with no exception.

     **And the reason it matters is who presses it.** Somebody reaching for a
     danger zone has usually lost a device. The session that has to end is the
     one they cannot press a button from. A button that spares the browser in
     front of you is a button that spares exactly the session that was never the
     problem.

     What ships: no `keepSessionId`, a `signed_out` flag on the response, and
     the page following it to the sign in page. The cookie now names a row that
     is gone. `load()` would answer 401 and leave somebody looking at a settings
     page that cannot read anything.

127. **5f asks for a link to where the profile fields are edited, and there is
     no page to link to.** Phase 13 part 7a, 3 September 2026. Both sites sent
     staff to `https://gftv.asia/account`, which **answers 200**. gftv.asia is a
     one page app with a catch all, so it served the same shell as every other
     address. The reader landed on the wrong view.

     **Nothing here could have caught it.** The status code is fine, the fetch
     succeeds, and a link checker sees a working link. It shipped from part 6
     and was found by a person clicking it. That is the second thing this walk
     found that no file in this repository could have.

     What ships is the root, `https://gftv.asia`. That is the only address in
     that site's own markup, and it cannot rot the way a deep link into a client
     routed app does. **A deep link was offered and declined** for want of an
     addressable account view. If one ever exists, checks 167 and 167a are where
     the pin goes.

     **Phase 14's start at 128.**

128. **Three controls in `theme.css` were on the separator token and needed the
     control one, so 1.4.11 was not met in either modal on either site.** Phase
     14 part 1, 3 September 2026, found by `tests/phase14-test.mjs
     --only=contrast` on its first run.

     `.mode-btn`, `.swatch` and `.locale-btn` are each a translucent `--surface`
     fill with a 1px `--border` round it. So **the line is the whole of what
     says a control is there**. And `--border` measured 1.23:1 to 1.70:1 against
     the modal, against 1.4.11's 3:1. Now `--border-control`, which lands
     between 3.3:1 and 3.6:1 everywhere.

     **The fix is a token that already existed and says what it is for in as
     many words.** Phase 12 part 3 created `--border-control` for exactly this.
     It is "the edge of a control, where a reader has to be able to find the
     control at all. 3:1 in all four combinations" — and applied it to the
     switch track. These three were left on `--border` because **the two modals
     were not in that pass's fixture**. That is item 27's lesson arriving from
     inside the same stylesheet: a pass measures what it is pointed at.

     **It is a portal defect as much as a docs one.** `theme.css` is generated,
     so both sites carried it for eleven phases and both are fixed by the one
     edit. `tests/phase12-test.mjs --only=contrast` is 35 passed after it.

     **What is left advisory, with its numbers printed**: `.swatch-dot`'s ring,
     at 1.81:1 to 2.47:1. It is a sample of the palette it names and the name is
     beside it in words, so the dot identifies nothing on its own. The selected
     swatch is carried by a fill, a border and a containment ring.
     `--only=contrast`'s `statesInHue` check proves that in every combination,
     and not in the one somebody looked at.

129. **The docs site shipped a whole phase with no icons and no link card, and
     nothing here looked.** Phase 14 part 2b, 3 September 2026, found by a
     person pasting both sites into a chat window and comparing the two
     previews.

     `docs-site/shell.html` carried `charset`, `viewport`, a title, a
     description, `theme-color` and two stylesheets. No `<link rel="icon">`, no
     `apple-touch-icon`, no `og:` or `twitter:` tags, no canonical. And the
     directory held no image of any kind. So a tab drew the browser's blank page
     icon, and a shared link previewed as a title with nothing beside it.

     **The cause is the thing this site's whole generator exists for.** The HLC
     set sits at `main-site/`'s root, and Vercel builds each project from its
     own root directory. So `/HLC-main.png` on the docs origin is an address
     that answers nothing. Phase 13 built the head from the portal's in every
     respect that a stylesheet or a script cares about. The four lines that are
     only ever read by something that is *not* a browser were the ones nobody
     copied.

     **Why no check caught it.** `--only=live`'s 27 checks ask for pages and
     read what a reader gets. `gen-docs-lib.js --check` compares the files it
     was told about, and nobody had told it about an image. There is no check in
     this repository that opens a page and asks whether it can be shared. That
     is the same shape as item 29: a failure visible only to something outside
     the build. **The fix moved the images under `--check`**, so at least the
     drift half is now structural. The three files are `ASSETS` entries with a
     `to` of `public/`, and a rebranding at the portal fails the check here.

     **What is still not checked is the head itself.** A future edit can delete
     the `og:` block and nothing fails. The exception is `scripts/build.js`,
     which refuses to build without the canonical link, because it reads the
     origin off it. That one line is load bearing by accident of being useful,
     and it is the only part of this that cannot silently vanish.

130. **A job poster could close the whole board, rename the portal and switch
     any shipped feature off. 10 item 2 says both pages are admins only.** Phase
     14 part 5, 4 September 2026, found by reading the dashboard against the
     specification in order to describe it.

     10 item 2's list of what only an admin may do names five things. Three were
     enforced: deleting a posting, the applicant accounts page, and granting
     portal access. **The other two were not enforced anywhere.**
     `/admin/settings` and `/admin/maintenance` were in the poster's sidebar as
     ordinary links, and `api/admin/settings.js` and `api/admin/maintenance.js`
     guarded with `requireStaff`. So a job poster could set the portal title,
     rewrite the home page copy and choose the featured roles. They could change
     the reapply waiting period, and **close applications across the entire
     board**. They could switch off any feature that has shipped, on both sites,
     with nothing turning it back on by itself.

     **Neither was a hole somebody had reasoned about.** The sidebar's own
     comment cites 10 item 2 by number for the two items it does mark
     `adminOnly`. That is what makes this an omission instead of a decision. The
     rule was read, quoted, and applied to half the list. Both pages shipped in
     phase 8, so it stood for six phases.

     **Fixed in part 5**, at the asker's direction. A guide describing the
     settings page to a job poster would have been this build teaching somebody
     to use a control that was never theirs. Two `adminOnly: true` entries,
     `requireStaff` to `requireAdmin` in both routes. The overview banner keeps
     its sentence for a poster and loses its link to the page. Reading is
     refused as well as writing: reading the settings page is how somebody would
     learn the board is closed.

     **Why no check caught it.** `tests/phase7-test.mjs` asserted the opposite
     in as many words. Check 4 reads "a job poster still reaches postings,
     tracking, teams, tags **and maintenance**". It was written when phase 7
     shipped `/admin/maintenance` and before 8.10 and 8.12 existed as pages. A
     check can hold a mistake still. That assertion is now the pair that refuses
     both routes with 403, and `--only=boundary` reads the same rule off the
     source. The next removal of a guard fails without a credential.

     **One item on that list was left exactly as it is.** The fifth is "mark a
     translation ready, per 7i", and 7i's own sentence is about a **translation
     helper** and not about staff. A job poster who cannot tick ready on their
     own posting cannot publish it in two languages at all. That is most of what
     parts 5 and 6 of the editor are for. The job editor's tick stays open to
     any staff account, `api/translations/helper.js` still has no `is_ready` in
     it anywhere. The poster guide says so in those terms. **If that reading is
     wrong it is a one line change**, and this paragraph is where to start.

131. **Four strings told a helper that only an admin can publish their work, and
     any job poster can.** Phase 14 part 6, 4 September 2026, found the same way
     130 was: by reading the screens in order to describe them.

     `admin.helpersNote`, `admin.helperCannotPublish`, `helper.whatSavingDoes`
     and `helper.draftUntilReady` all say an admin marks a translation ready.
     `api/admin/jobs.js` guards with `requireStaff` and its only `isAdmin`
     branch is the delete path, so **a job poster ticks ready like anybody
     else**. The brief agrees with the strings and not with the build, at 971,
     1146 and 1592.

     **This is deviation 130's last paragraph seen from the other end.** Part 5
     settled that the tick stays open to any staff account and that the brief is
     not amended for it. Nobody looked at what the interface was telling helpers
     about that same tick, and it was telling them something the routes do not
     do.

     **Why it matters more than a wrong word.** The sentence is the reason the
     role can be granted before trust is. It promises a helper's draft is read
     by somebody before it reaches a reader. That promise is still kept, by
     staff and not by an admin. A helper who was told admin and watches a poster
     publish has been told something untrue about how their work is reviewed.

     **Fixed in part 6**, at the asker's direction and against the two
     alternatives. Those were writing the guide to match the strings, and
     guarding `is_ready` with `requireAdmin`. The four strings say staff, in
     both languages. `helper.gateBody` was left alone because granting the role
     really is admins only.

     **And the brief was amended, which part 5 declined to do.** Put up as a
     concern when part 6 finished and answered the same day. 971, 1146 and 1592
     say staff now, each carrying the date and this deviation's number. 7i's
     reason for the gate is untouched because it is still true. Part 5's answer
     was for the behaviour alone; four strings telling a helper something untrue
     about how their work is reviewed is what changed it.

     **So every copy agrees except the phases that shipped under the old one.**
     The routes, both dictionaries, both guides and the brief. If the tick is
     ever narrowed to admins, this paragraph is where to start.

132. **The capture run points at production, and 16g says never to.** Phase 14
     part 8, 4 September 2026, put up as a decision before anything was written
     and answered that day.

     16g's third bullet: "It runs on demand against a local or staging instance,
     never as part of the Vercel build and never against production. Vercel
     cannot run browsers on a build anyway, and production holds real applicant
     data." The first half is kept in full. The last clause is the one that
     cannot be.

     **There is no instance to run against, and `seed.mjs` opens by saying so.**
     `main-site/.env.example` asks for the existing GFTV Supabase project and
     not a new one, so "local testing" and "the live site" are the same rows. A
     preview deployment reads the same database and breaks passkeys on top of
     it. So it is honest to 16g's letter and to none of its reason. Building a
     second Supabase project to satisfy one bullet in one phase was not offered.
     A second database is a decision about the whole build.

     **So the run is production with the seed in it**, which is decision 27's
     sitting. `node seed.mjs --yes --anyway` opens it, the shots are taken, and
     `--clear --yes` closes it.

     **What makes that safe is checked and not remembered**, which is the only
     reason this is a deviation and not a hole:

     - **The run refuses to start unless the board shows a seeded posting.**
       Every posting the seed writes says SAMPLE POSTING, and that is what is
       looked for. This is the failure a person actually walks into — everything
       looks normal and the pictures are of real applicants.
     - **The two things no seed can cover are masked.** Those are whoever ran
       the capture, and `/admin/admins`, which is gftv.asia's realm and the one
       table this build may only read, per 5g.
     - **The nineteen staff shots are gated at the tier they were taken at**, so
       the readers are the same staff whose dashboard it is. The six public ones
       are of the applicant's own half of the portal.

     **What it costs, plainly**, and it is the same cost the docs README already
     records for the seed. The portal's sitemap is cached an hour at the edge. A
     sample posting seeded and cleared inside the hour can still have been
     handed to a crawler. Keeping the window short is the only control anybody
     has.

     **The brief is not amended.** 16g's sentence is right about what it is
     asking for and this build cannot give it. A bullet rewritten to say
     "production, carefully" would read as guidance to the next project that
     copies this file. The check in the script is the durable half.
133. **The 华文 of every guide is authored as files, and 16e says it lives in
     Supabase.** Phase 14 part 9, 6 September 2026, put up as a decision before
     anything was written and answered that day, twice. It went up once as four
     options, and once again in plain terms when the first framing was not clear
     enough.

     16e: "translations live in Supabase, and the English stays in the files.
     The file is the base row and every other language is a row in a table".
     **What it does not say is where a translation is written before it gets
     there**, and eighty two pages have to be written somewhere.

     **So the tree is the authoring source and the table is a copy the build
     writes, one direction.** `docs-site/translations/zh/`, keyed by the page's
     own address, upserted into `gftvjobs_docs_translations` on every deploy
     with deletions included. It is exactly the arrangement section 6 already
     gives `gftvjobs_docs_pages`, applied to the other table.

     **The serving path is unchanged and that is the half that keeps 16e true.**
     `api/content.js` reads the row and never the file, so the ready flag is
     what decides, and the fallback to English is where 16e puts it. A
     translation helper surface built later is a write to a row this site
     already reads. Nothing about the reader's experience differs from what 16e
     describes.

     **What it buys**, and this is the argument that won:

     - **A translation is a diff.** The 华文 sits beside the English in one
       commit. The reviewer who has had a round trip outstanding since 31 August
       is sent a branch instead of eighty two rows.
     - **A wipe costs nothing.** Drop both tables and the next deploy refills
       them, which is what made migration `042`'s rollback block safe to write.
     - **The table cannot drift from the tree**, because the build makes it
       match every time it runs.

     **What it costs, plainly.** Changing one word is a commit and a deploy, and
     a volunteer translator with no access to this repository cannot fix
     anything themselves. That is a real loss against the arrangement 16e
     imagined. There a helper edits a row, and the gated half picks it up on the
     next request. Nothing edits those rows today, so what is lost is a surface
     that does not exist. Whoever builds it re-reads this entry first, because
     on that day this decision is the thing standing in front of it.

     **The alternatives, both declined.** One script holding all eighty two
     translations, run once by hand. That is the same duplication with no
     per-page history, and a file that drifts from the table the first time
     somebody edits a row. And authoring straight into the database, which keeps
     16e's letter exactly and would have put 54,000 words where git has never
     seen them.

     **The brief is not amended.** 16e is right about the serving path and this
     part implements it. What the part adds is an answer to a question 16e does
     not ask. `docs-site/scripts/translations.js` opens with the whole of it, so
     the argument is beside the code and not only here.
134. **`gftvjobs_docs_pages.updated_at` is nullable and section 6 says not
     null.** Phase 14 part 9, 6 September 2026, and it is a one line deviation
     with a deployment-shaped reason.

     Section 6 gives the table. "`gftvjobs_docs_pages`: page_path text pk, title
     text not null, summary text null, body text not null, updated_at
     timestamptz not null."

     **The column is a page's own last change, taken from git.** This build
     already has a standing rule about that value, stated twice in
     `scripts/build.js`. A page git cannot date carries no date at all, and
     nothing is allowed to fill it in. There are two honest ways to arrive at
     one, and neither is rare. They are a page that has never been committed,
     and a page older than the clone. **The second happens on the deployment and
     not on a laptop**, because Vercel clones shallowly. That is precisely where
     a not null violation would stop a deploy that is otherwise correct.

     So the two candidates were to invent a date or to allow none. Inventing one
     means the column reads "when this page last changed" and holds "when it was
     last deployed". That is the build claiming a page was reviewed on the day
     it happened to be pushed. Allowing none means the bot draws no date,
     exactly as the site does for the same page.

     **`gftvjobs_docs_translations.updated_at` is nullable for the same
     reason**, and section 6 does not constrain that one. It would otherwise
     have defaulted to `now()`. Every row would then claim to change on every
     deploy. Every translated page would have a date that moves on its own,
     through the view.

     **Section 6 is amended in the migration and not in the brief.** The
     reasoning is about how Vercel clones, and belongs beside the table it
     changes. `042`'s header carries it in full.

---
