---
title: 3. Rules that are load bearing
access: developer
order: 3
summary: Breaking one of these is how a defect gets built and not found.
---

# 3. Rules that are load bearing

Breaking one of these is how a defect gets built and not found.

- **A change to `main-site/api/_lib/` is half a change**, from phase 13 part 1.
  The docs site holds generated copies of fourteen of those modules and six
  staff auth routes, so the other half is `node gen-docs-lib.js`. `--check` is
  what fails when it was not run. **Nothing under `docs-site/api/_lib/` or
  `docs-site/api/auth/staff/` is ever edited**: every file there opens with a
  banner naming its source. An edit is undone by the next run. The rules the two
  sites genuinely differ by are in the generator with reasons attached. A rule
  whose text stops appearing stops the run instead of producing a copy that has
  lost the difference. **As of part 4 it covers `assets/js/`, `assets/css/` and
  `assets/fonts/` as well**, so a change to `theme.css` is half a change too.
  **Seven files in those directories are this site's own**, and they are named
  in `OWN`. Those are `tiers.js`, `pages.js` and `reader.js`, the gate. Then
  `docs.css`, `shell.js` and `markdown.js`, the shell; and `generated.js`, which
  reads what part 5's build left behind. Each opens by saying so. A file that is
  neither generated nor declared still fails.
- **`gftvhello_users` is written from one file and two columns, and there is no
  third**, from phase 13 part 6. `api/_lib/staff-account.js` on both sites, and
  `password_hash` per 5g and `totp_secret` per decision 7. Section 2 permits the
  challenge, trusted device and backup code rows the login flow owns and nothing
  else on that table. **The rule is checked and not remembered**:
  `tests/phase13-test.mjs --only=account` greps both projects and fails on a
  second writer or a third column. A fourth caller is a decision and not a
  patch, because the consequence reaches gftv.asia and nobody there is asked.
- **A count that could not be read is `null`, and `null < 3` is `true`.** Phase
  13 part 6, and it is the oldest rule in this file meeting the language it is
  written in. `codeCounts` answers `null` for a table it could not read, and six
  places derived "running low" from a `<`. Every one of them would have told
  somebody they were nearly out of the only way back into their account. That
  was at the moment nothing could be read at all. `codesLow()` is the answer,
  and a page drawing `?? 0` is the same defect wearing a different face.
- **A gated page in the static tree is a leak, and it is checked in both
  directions**, from phase 13 part 3. Anything under `docs-site/content/` is
  world readable whatever the interface does, so a page whose `access` is not
  `public` refuses to load there. A `public` page under
  `docs-site/api/_content/` refuses too, because it is a page nobody can find.
  16e gives the `access` key one job and this is what makes it the only thing
  deciding either question. **A page above the reader's tier answers 404 and
  never 401.** The miss and the refusal are one value inside `pages.js`, so that
  nothing downstream can tell them apart.
- **A file based dynamic route is a framework's feature, and neither project
  here is a framework.** `api/content/[...page].js` shipped in part 3, answered
  404 to every request on the deployment for two parts, and looked perfect
  locally. In a bare `api/` project Vercel binds nothing from `[param]` into
  `req.query` and does not match a catch-all past one segment. **Every route in
  this repository is a plain function**, addressed explicitly, the way the
  portal's have been since phase 1. And the sharper half: **a stand in server
  that is more capable than the platform hides exactly this.** So the one in
  `tests/phase13-test.mjs` answers the path shape with the platform's own 404.
- **Ask the deployment.** Phase 3's rule — a route returning 200 is not evidence
  its rewrite works — has now cost four defects. The fourth was found because
  somebody looked at the live site for ten minutes. A part that has only run
  locally is a part that has not run.
- **What the docs project serves is what its build copied**, from phase 13 part
  5. `docs-site/vercel.json` carries `buildCommand` and `outputDirectory`, and
     `dist/` is the whole of that site's public surface. Neither content tree is
     in it, so a page cannot be reachable as raw markdown beside the page built
     from it. A new file in the project is not a new URL. **`dist/` and
     `api/_generated/` are gitignored and a local preview needs the build run
     first.**
- **A gated image is a bare file name and a public one is an absolute path**,
  and each refuses the other at build time. 16e's "a gated page with a public
  screenshot is a leak with extra steps" is a build failure, in both directions.
  A rule only stated in prose is a rule somebody follows until the afternoon
  they are in a hurry. **An asset is gated at its section's level**: there is
  nowhere in a `.png` for an `access` key.
- **The two search indexes meet in the reader's browser and nowhere else.** The
  public one is a static file, the gated ones are one per tier, and
  `api/search-index.js` sends the tiers at or below the reader's own. There is
  no server side merge to get wrong, which is 16e's warning designed out and not
  tested for.
- **A flag set at the top of an async function is not a lock**, from part 5's
  first defect. `loadIndex` set `loaded = true` and then fetched. So the call a
  keystroke later returned instantly with an empty index, and the first search
  anybody ran answered "nothing matched". Memoise the promise, not a boolean.
  The same family as "a fixed wait after a click is a race".
- `api/_lib/admin-jobs.js` has its own column list and does not import
  `job-detail.js`'s. The public allowlist exists so a public payload cannot be
  widened by an edit to shaping code.
- **Five things write `applied_at` and `cooldown_until`.** They are a confirmed
  application, a withdrawal, an explicit waive, and **as of phase 9 the webhook
  and the manual link beside it**. Those last two are the first that are not a
  person. A sixth ends a cooldown without writing either column — deleting the
  tracking row takes them with it. **Phase 10 does not add a seventh**: a queued
  offline answer is pending until the server confirms it.
- **A cooldown already being served never moves.** `confirmApplication` writes
  both dates unconditionally, which is right for an applicant clicking Yes and
  wrong for a webhook. Section 13 step 5 says to set them "if they are not
  already set". The guard is in `confirmFromWebhook`, not in `apply.js`.
- **A new view needs `revoke` and `security_invoker = on`, every time**, in the
  file that creates it. Migration `035` closed the four that existed.
- **A file at a path a function serves wins, silently.** Vercel matches the
  filesystem before it consults rewrites, so `main-site/robots.txt` and
  `main-site/status/index.html` both had to be *deleted* for their functions to
  run at all. That is phase 12 parts 5 and 7, and phase 3's rule for the third
  time. The two checks that catch it are in the `discovery` and `status`
  sections, and they assert an absence. **Deleting a page also breaks whatever
  was reading the filesystem to find it.** Four things could not resolve
  `/status` afterwards, and all four now render it from the same module the
  function does.
- **A new table needs neither**, and gets `enable row level security` as it
  always has. RLS reaches a table and does not reach a view.
- **The defence is RLS plus the shape of PostgREST, not RLS alone.**
- **An authenticated response never enters the Cache API.** Phase 10's version
  of the same instinct, and the reason is the same one: this origin is shared
  with the other GFTV apps.
- **A response carrying `private` or `no-store` never enters the Cache API
  either.** This is the sharper half, because the two routes it catches look
  public from inside a worker. `api/job-page.js` and `api/public/job.js` both
  answer `private, no-store` with `Vary: Cookie` for an archived posting. That
  renders only for an applicant with history, and for a staff preview.
  `isCacheable()` in `sw.js` is the single place that decision is made.
- **A switch has to work in both directions, and the off direction is where that
  gets forgotten.** `sw.js` handles `/api/public/feature-status` above its own
  kill switch and acts on the switch's edges and not on every request. That is
  the difference between a switch and a one way door. Deviation 89. Anything
  that turns a subsystem off has to leave itself a way of hearing that it has
  been turned back on.
- **A Supabase Storage URL is never cached at all.** `sw.js` does not intercept
  cross origin requests, which is how that holds without a special case. The
  reason is the dashboard, not the applicant: it renders other people's faces,
  and a cache-on-use rule could not tell those from the reader's own. The
  reader's own avatar is a blob in IndexedDB, wiped with the rest of their data.
- `unavailable()` fails open. A settings blip must not take the site down.
- **`unavailable()` in a cron is not the same call as in a route.**
  `api/cron/daily.js` calls `isFeatureOff` and **records a run that says it was
  switched off.** A scheduler is not reading the 503, and the panel would
  otherwise say "no run" for both an admin's decision and a broken schedule.
- The denylist in `maintenance.js` is checked when an override is *read* as well
  as when one is written.
- `featureOverrides` ignores anything whose phase has not shipped.
- **The set is frozen the moment a task is sent.**
- **Answers are validated against the set stored on that task.**
- **A count that could not be read is `null`, never `0`.** `api/admin/me` set
  this; `lastRun` extends it to three states. The reason: "the table could not
  be read" and "there has never been a run" are different claims. Only one of
  them is ours to make.
- **`ts_headline` is the only field the browser assigns as markup.**
- **Run `node check-i18n.js` before shipping.** Anything calling `t()` outside
  `translateDom` must re-run on `gftv:localechange`, or it renders a raw key.
- **Bump `sw.js`.** Every change to `main-site`, not once per phase. At `v96`,
  and **phase 9's commit is the one that proved the rule needs saying.** It
  changed twenty-odd files under `main-site/` and left the version alone.
- **Never call an async handler bare from a listener.** `runAction` exists in
  `admin-shell.js`, in `admin-job-editor.js`, and in `account-shell.js`.
- **Anything reading a module level cache has to be sure something filled it.**
- **A fixed wait after a click is a race, not a delay.**
- **The rate limit is checked before the role**, so a spent bucket answers 429
  to something it would have refused with 403.
- **A fill and the text on it are a pair, and the pair is named.**
  `--brand-dark` goes with `--brand-on`, `--danger` with `--danger-on`.
  **`--brand` and `--brand-text` are not a pair**: the first is the brand colour
  and the second is accent text for a page background. Putting one on the other
  gave the sidebar badge 1.10:1 in hello dark. Anything painting a fill takes
  the `-on` token that belongs to it.
- **A probe measures what is in it, and a list of components is a list somebody
  wrote.** The `contrast` section passed 26 checks while a badge sat at 1.10:1
  and a primary button at 3.51:1. Neither was in the probe, and a fill with a
  label on it was a shape nothing asked about. **When a check is a list, the
  question to ask it is what shape is missing**, not whether the entries pass.
  **The same rule reaches a page as well as a check**: `zh-review.html` named
  fifteen dictionary groups. It rendered 223 of 1,728 interface strings for nine
  phases, while counting all 1,728 in its own header. **Derive the list from the
  thing, and let the written one decide order and not membership.**
- **A term is not a word in a language that puts no spaces between words.** 选中文字
  is "select text" and contains 中文, which means nothing of the sort. A check
  that looks for a term by substring reports a finding that is not there. It bit
  from the other direction in part 1, where `split(/\s+/)` counted a sixteen
  character Chinese tag name as one word. It read every wrapping Chinese label
  as a cramped control. **Anything measuring 华文 by matching characters needs its
  exceptions written down beside it.**
- **A space sits between Latin and Han, and never between Han and Han.** The
  review page's footer stated it from phase 3 and nothing measured it until part 4. By then 国际兽视 had been spaced like a Latin word in three places.
- **Two files that say they carry the same sentence need a check across the
  boundary.** `strings.py` reproduces `feature.unavailable` and
  `feature.maintenance` exactly as the dictionaries have them. Somebody turned
  away by a button and then by a command must be told the same thing twice and
  not two different things. `check-i18n.js` covers the site and cannot see a
  Python file, so nothing checked the claim for a whole phase. In the same pass
  the bot turned out to say 志愿性质 where the site says 义务性质 about the same roles.
- **There are three border tokens and the difference is what they are drawn
  around, not how heavy they look.** `--border` separates things that are not
  controls and is faint on purpose. `--border-strong` is emphasis — a hover, a
  selected state, a table header rule, a badge. **`--border-control` is the edge
  of a control**, clears 3:1 in all four combinations by construction, and is
  the only one 1.4.11 reaches. **A hover is not a component boundary**, which is
  what the first shape of phase 12 part 3 got wrong. It raised `--border-strong`
  for the switch track's sake and re-weighted twenty one rules that had failed
  nothing.
- **A colour is measured after the page has settled, and a translucent one is
  composited before it is compared.** Both halves were found by the check
  reporting an impossibility and not a finding. A custom property flips on the
  instant and a `background-color` eases over `--transition`. So for 220ms a
  theme switch really is one mode's text on the other's background. And half
  this palette carries an alpha, so comparing the token's own rgb with the page
  is a pass for a border nobody can see.
- **`vercel.json` cannot carry a comment.** It is schema validated and an
  unknown key fails the deploy. So the reasoning for the `crons` and `functions`
  entries lives in the header of `api/cron/daily.js` instead. Do not put one
  back.

## What phase 9 added to the list

- **A secret is compared before the body is read.** Both new endpoints do this,
  and putting a rate limit in front of it would add a table read to every
  unauthenticated request. That makes the endpoint cheaper to flood, not harder.
- **The webhook answers 200 to a database failure.** Section 13 step 7, and it
  is the opposite of every other route here. The reason is in the file at
  length, because somebody will otherwise "fix" it.
- **The submission row is written first and the match attached last.** That
  ordering is the recovery story: a confirmation that throws leaves the row in
  the unmatched list. An admin sees it there, and linking it re-runs the
  confirmation. Matching on insert would leave a row that looks handled and is
  not.
- **A form check that learned nothing writes nothing.** Not `ok`, not `error`.
  See deviation 55.
- **The webhook's caller has no locale**, so everything it writes picks English
  deliberately. Nothing it writes is read by an applicant.

## What phase 9's verification run added to the list

- **Waiting for an element that is in the static markup is waiting for
  nothing.** The sibling of "a fixed wait is a race", and it bit twice as hard.
  It fails in the direction that looks like a product defect. The box was there,
  empty, and the check dutifully reported a working panel as broken. **Wait for
  the content, not the container**, on anything a page fills after a fetch.
- **A `requireEnv` at module level runs before `--only=` is read.** An offline
  section documented as needing no credentials still exited on a missing
  password. Anything a section flag is supposed to make optional has to be read
  after the flag, not above it.
- **A 401 and a 503 from the same endpoint are a diagnosis.** Phase 9's two
  machine endpoints answer 503 when the secret is not configured and 401 when it
  is configured and wrong. Keep that split in anything new: it is the difference
  between "nobody set the variable" and "your copy of it is stale". It saves a
  trip to a dashboard nobody should need.

## What phase 10 added to the list

- **A failed request is a third state.** `applicantSession` answered `{ user:
  null }` for both "nobody is signed in" and "we could not ask". Both dashboards
  then threw a signed in person out to a sign in page that could not load
  either. `unreachable` on the session, and only a real signed out answer
  redirects. The same shape as `null` versus `0` for a count.
- **A null answer is never an instruction to delete anything.** Section 14 says
  wipe on logout; the obvious reading wipes when the session request fails,
  which offline is every single time. That deletes the applicant's own copy at
  exactly the moment it is the only one they have. Only an explicit sign out and
  a mismatched user id wipe. **A failure to ask is not an answer.**
- **Three reasons a control can be disabled, and they never share a sentence.**
  Not built, switched off, and needs a connection. The third is about the reader
  and not about us.
- **Two things doing one job is how the sentences drift apart.** Deviation 87:
  an orphaned earlier draft of the same module was found in the tree. The two
  good ideas in it were taken, and the file was deleted and not kept.
- **A duplicated rule needs a check that the two copies still agree.** `sw.js`
  carries a second copy of the queue's verdict rule because a worker cannot
  import a module. Two checks exist only to catch the pair drifting. That
  includes the Background Sync tag, where a mismatch is a queue that silently
  never flushes.
- **Anything that turns a subsystem off has to leave itself a way of hearing
  that it has been turned back on.** Deviation 89.

## What phase 11 part 1 added to the list

All four were found by running the code once before it went anywhere near the
VPS. In a component with no scripted checks that is the whole of the safety net.

- **`sqlite3.executescript` commits whatever transaction is open before it runs
  a line.** A migration written as one script inside an explicit `begin` is not
  inside the transaction it appears to be inside. The commit that follows fails
  with "no transaction is active", and a failure halfway leaves the schema
  changed and the version not. `db.py` stores each migration as a tuple of
  statements and executes them one at a time instead. `pragma user_version` is
  written inside the same transaction, which is what makes a failed migration a
  no-op.
- **An empty string is a real answer, and `or` reads it as a missing one.**
  `text()` fell back to English for any key whose translation was deliberately
  empty. The one that exists today is the separator between two sentences on one
  line. That is a space in English and nothing at all in 华文. So the fallback put
  a gap in the middle of a Chinese sentence. Membership, not truthiness. The
  same shape as **a count that could not be read is `null`, never `0`.** The
  absence of a value and a value that happens to be empty are different claims.
- **A module named after a standard library one shadows it for every library in
  the process.** The bot's directory is first on `sys.path`, so `locale.py`
  would have been handed to anything importing the standard `locale`. The
  failure would have arrived weeks later inside somebody else's code looking
  like anything but a naming decision. It is `lang.py`.
- **What a menu says and what actually answers come from one list.** Telegram's
  command menu is registered at startup from `commands.py`, `start` prints from
  it, and `setup.md` carries the same lines for BotFather. A command's
  availability is read from the handler registry the dispatcher itself uses, so
  the message cannot describe a bot that does not exist. Deviation 91's second
  failure, designed out and not tested for.
- **A list pasted into a document is a second copy, so it is generated and
  checked.** `setup.md` has to carry the command block as text. Somebody pastes
  it into BotFather from there, and a document that says "run this script
  instead" is a document that gets skipped. So `python commands.py` prints it
  and **`python commands.py --check setup.md` fails if the document has
  drifted**, in either language. The same shape as `check-i18n.js` and
  `check-precache.js`. It is also the shape of phase 10's two checks that the
  worker's duplicated verdict rule still matches `queue.js`.

## What phase 11 part 3 added to the list

- **A secret nothing can deliver is a secret nothing should generate.** The site
  cannot reach Telegram. So a code it produced would have to cross
  `gftvjobs_telegram_tokens` in the clear to reach the thing that can. The
  generator moved to the side that sends. The general shape is worth keeping:
  when a value must stay hashed at rest, ask which process is allowed to know
  it. Put the generation there instead of moving the plaintext to it.
- **A cap counted after the answer is a cap a dropped request walks past.**
  `attempts` on a code row is incremented before the bcrypt comparison, not
  after. The same instinct as the rate limiter checking a lock before doing the
  work and not after.
- **A GET that spends a credential has to survive being fetched by a machine.**
  Unfurlers, link checkers and mail scanners fetch URLs and carry no cookies. So
  the magic link refuses without its nonce **and leaves the token unspent**. A
  version that spent it would look exactly like a broken bot and would be
  reported as one.
- **Both directions of a security switch revoke trusted devices, not just off.**
  5d lists unlinking and disabling. Enabling is the one that matters more: a
  browser trusted while the factor was off would otherwise walk straight past
  the factor being switched on. Doing it on the way in is also what makes an
  unlink from inside the chat safe. That is without the bot reaching a table
  section 15 never named.
- **A switch that would lock somebody out is not the same as a switch that turns
  a feature off.** `telegram_2fa` gates the one tap link, the `/code` command
  and the settings panel, and deliberately does not gate the code push inside
  `api/auth/applicant/login.js`. The account it would affect is one that has
  already typed its password correctly and asked for two steps.
- **Two runtimes sharing a hash format need a check that they still agree.** The
  bot writes bcrypt in Python and the site reads it with bcryptjs. The failure
  is a correct code refused at a login form with nothing in any log. So
  `--only=seam` verifies a real Python hash with the site's own `verifySecret`
  instead of asserting the two are compatible. The same family as phase 10's two
  copies of the queue's verdict rule.

## What phase 11 part 4 added to the list

- **A claim is a lease, not a transfer, and a lease nobody sweeps is a row that
  is stuck for ever.** The conditional claim stops two instances sending one
  message and does nothing at all about the instance that claims a batch and is
  then killed. Anything that takes ownership of a row has to answer what happens
  when the owner disappears. The answer here is a five minute lease and a sweep
  that counts the lost attempt.
- **A backoff belongs where the process can honour it, and a queue state is not
  a schedule.** Putting a failed row back to `queued` with a "try again in
  fifteen minutes" would need the claim to express that, and PostgREST cannot.
  So the next pass would send it immediately and the backoff would be a comment.
  The row stays `claimed`, which is the honest word for a row this process owns,
  and SQLite carries the time. Section 15 asks for exactly this shape for flood
  waits and it is the right shape for every retry.
- **A cap counts what the row cost, not what we cost it.** A delivery Telegram
  refused counts against a row's attempts; a flood wait does not. That is the
  bot being told to slow down. Spending a row's attempts on our own pacing would
  eventually mark a perfectly good notification `failed` for being queued on a
  busy afternoon.
- **Two deployments and one table: name what you can handle, never what you
  cannot.** The claim filters on the kinds this build can render, so a kind a
  newer site queues is never claimed and waits instead of failing. This is the
  general answer to what phase 11 knew about itself before it started. There is
  no single deploy landing both halves. It is worth reaching for wherever two
  halves of this build ship apart.
- **A queue is the only thing the portal can see of a process it does not
  deploy.** Everything before this phase reported on itself. The drain runs on a
  VPS, so the panel infers. Rows moving means it is alive, and an oldest queued
  row half an hour old means it probably is not. That is why the time is carried
  and not folded into a count, and it is the shape phase 12's status page needs
  anyway.

## What phase 11 part 5 added to the list

- **Delivery belongs to the act, not to the caller.** Every task raised queues
  its notification from inside `raiseTask`, so a raise site written in a later
  phase cannot forget to tell anybody. Reach for this wherever a second channel
  is added to something that already writes a record. The failure mode of the
  other arrangement is silence, and silence is not reported.
- **The absence of a value and a falsy value are different claims**, for the
  third time in this build. `null` versus `0` for a count, an empty translation
  read as a missing one. And now a notify column a select did not name being
  read as a switch somebody turned off. Membership, or an explicit `is False`,
  every time a default matters.
- **What a message is rendered from is copied at queue time, not read at send
  time.** The row then says what was sent and not what would be sent now. The
  process on the VPS needs no reach into a table section 15 never gave it.
- **A stored button meaning is a verb and a subject, never a value.** "Toggle
  invitations for this account" survives every restart and every flip from
  another device. "Set invitations to off" is wrong the first time somebody uses
  two devices, and stays wrong for ever.
- **A write from a button in an old message is filtered on the state it
  assumed.** The decline updates only a row still `invited` or `seen`. An
  invitation the poster withdrew last week cannot be declined by a tap today.
  The same shape as the outbox claim and the token spend. The filter is the
  check, and there is no read in front of it to go stale.

## What phase 11 part 6 added to the list

- **The narrowest thing that can answer the question is the one to ask.** The
  bot holds a key that bypasses every policy in the schema, and `/jobs` is
  answered by a public endpoint that holds none. Reach for this wherever a
  process with a powerful credential needs an ordinary fact. The question was
  "what is on the board", and the board is public.
- **A count that could not be established is not zero.** For the fourth time.
  This one arrives as a missing header and not as a missing row. `count()`
  answers `None` when PostgREST sends no `Content-Range`, and `/tasks` says it
  could not check instead of saying nothing is waiting. The list is now `null`
  versus `0`, an empty translation read as a missing one, and a notify column a
  select did not name. And now this.
- **A read answers about now and a queued message answers about then.** Both
  rules are correct and they contradict each other on paper. What decides is
  whether somebody is standing there. Deviation 107 froze a payload because
  nobody is, and a command reads the tables because somebody just asked.
- **Two runtimes naming one enum need a check that they use the same words.**
  The bcrypt seam again, in the ordinary case and not the cryptographic one. The
  nine status words exist in `strings.py` and in the site's dictionaries, and a
  check compares them value by value in both languages. The failure is nobody's
  fault and nobody's alarm, which is what makes it worth a check.
- **A list that offers a button must only list things the button can act on.**
  `/invites` filters on the same two statuses the decline button writes through.
  So it cannot produce a row whose own button answers "there is nothing here".
  The general shape: a list and the action on its rows share one definition of
  what belongs in it.

## What phase 11 part 7 added to the list

- **A check that found nothing to look at is not a pass.** `--check` compares a
  document against the generated list. The natural implementation compares
  whatever copies it finds, which answers "clean" for a document that has lost
  the list entirely. A document with no copy at all now fails by name. Deviation
  90 said this about `--only=` with a section name that does not exist. It is
  the same failure in a smaller place, and both times the wrong answer was the
  reassuring one.
- **A generated list needs one check per shape it was copied into.** `setup.md`
  carries the block verbatim because somebody pastes it; the README carries a
  table because somebody reads it. Checking the second against the first would
  have meant generating a table nobody wanted. So what is checked there is the
  half that drifts, the names and their order. The prose beside each name is
  left to a person.
- **The parts describe what they built; only the seam re-reads what was said
  about the whole.** Four documents had drifted by part 7. Every one of them had
  drifted in a sentence written by an earlier part about the phase and not about
  a file. Nobody re-reads an opening paragraph while shipping a feature.
  Deviation 90's "a seam finds what a part cannot", one phase later and in prose
  and not in checks.

## What phase 11 part 2 added to the list

- **A page test that leaves service workers on is testing two things at once.**
  Every page here registers one, and an active worker answers from its own
  precache, where Playwright's `page.route` never sees the request. A stubbed
  `build-status.json` silently stopped arriving after a reload. So the gate
  check failed against a copy of the real file, and whether it happened at all
  depended on how fast the worker installed. `serviceWorkers: 'block'` on any
  context that is not testing the worker. What it does is phase 10's file's job.
- **`.modal` matches the shell's own dialogs on every page.** The theme and
  language modals are in the static markup. A selector that loose reads a colour
  picker and reports a confirmation dialog as missing its wording. The same
  family as "waiting for an element that is in the static markup is waiting for
  nothing". Name what is specific to the thing under test, which here is
  `.danger-dialog`.
- **A devDependency for verification is not a dependency.** `jsqr` decodes what
  the encoder produced and never reaches a browser or the site's own
  `package.json`. The rule that matters is which `package.json` it lands in.

## What the flip to `shipped` added to the list

- **Assert the computed style, not the attribute**, on anything a stylesheet
  written for something else can reach. `theme.css` strokes every `svg` with currentColor for the icon set. The QR's viewBox is measured in modules, so a 1.75 unit stroke flooded it. The three checks reading the path data and
  the `fill` attributes all passed against a page that was a solid block.
  Deviation 115. Same family as "waiting for an element in the static markup is waiting for nothing". It is a check agreeing with the source while the page is
  wrong.
- **A QR is black on white in every theme.** It is thresholded by a camera, not
  read by a person, so the reader's theme is none of its business. The rule
  generalises to anything a machine reads off the screen.
- **A presentation attribute loses to a stylesheet**, which is why the fix is a
  CSS rule and not tidier attributes in `drawQr`.

## What parts 6c and 6d added to the list, 30 August 2026

- **A message written at `DOMContentLoaded` is written before the dictionary has
  landed.** `t()` answers with the key until it does, so `auth.magicOff` printed
  as its own name on `/login`. It is the one message on that page written before
  anybody clicks anything. That is why nothing else on the site showed it, and
  in English nothing hid it. **Paint anything rendered before an interaction on
  `gftv:localechange`**, which fires when the dictionary applies and again on
  every switch, and not on a timer.
- **"The box is visible" is not "the sentence is right".** Check 41 asserted the
  message box was on screen, which was true the whole time it was wrong. It
  waits for the dictionary's own sentence now, and it was proved both ways.
  Deviation 115's shape in a second place, four days later.
- **A shared error code needs the branch on the client, not just the detail on
  the server.** `unavailable()` has answered `NOT_YET_AVAILABLE` with a
  `details.reason` separating "switched off" from "never built" since phase 8.
  `translateError` keyed on the code alone, so a feature an admin had turned off
  told people it had not been built yet. That is the one pair of sentences 0c
  exists to keep apart. The information was in the payload and nothing read it.
- **The tone follows the wording.** A feature an admin has just switched off
  comes back as `callout warn` and not as a red danger callout. The person
  reading it is very often the person who flipped the switch. It still keeps
  `role="alert"`: the action did not happen.
- **A decision written out fourteen times is one that gets made differently in
  one of them.** `adminApiError(error)` picks the tone in one place, and the 55
  hand written copies now call it. The roughly 15 sites that pass a sentence the
  page wrote itself are left alone: those are not API failures.
- **A thing that could not be done is not a yes**, for the fifth time in this
  build. `trustApplicantDevice` returned nothing, so a failed insert was still
  reported as `device_trusted`.

## What phase 12 part 1 added to the list

- **A control added later is not covered by the rules written for the ones
  before it.** `.site-nav a` and `.site-nav .nav-signout` were given
  `white-space: nowrap` and `width: auto` on the desktop row, with a comment
  explaining precisely what happens without them. `.nav-suggest` arrived
  afterwards for 7i's layer, matched neither selector, and reproduced the exact
  failure the comment described. **Grep for the rule, not for the bug.** When
  adding a sibling to a list of selectors, the question is which rules its
  siblings are already in.
- **A named width is named because that is where it breaks.** The toggle stood
  two lines high at 1024 and was perfect at 768 and at 1440. So a pass at "a
  phone and a laptop" would have shipped it. Section 3 lists six widths and the
  one that found this is the boundary where the layout changes shape.
- **Measure the union of what is on screen, never the sum of what exists.** The
  landscape check added up everything pinned and reported more pinned space than
  the viewport has, which is not a finding but an impossibility. A closed off
  canvas drawer is full height, `position: fixed`, and neither hidden nor
  displayless. It is simply off the left edge and costs nothing.
- **A result that cannot be true is a broken measurement, and it is worth saying
  so out loud.** 436px of a 375px viewport is the tell. The temptation is to
  widen the threshold until it passes.
- **In a phase of sweeps, prove the pass can fail before trusting that it
  passed.** A wide element and a narrow table cell were injected into the real
  page to see both rules fire. The 华文 run asserts it is rendering 华文. A Chinese
  pass that quietly measured the English page reports the same clean six as a
  correct one.
- **A word count is an English measurement.** 华文 has no spaces, so every Chinese
  label is one word and any rule shaped like "three words or fewer" matches all
  of them. Four Han characters is about a word. The same trap waits for anything
  counting words, characters or line breaks, and Malay and Tamil arrive in phase
  15.
- **A page measured with nothing on it proves the chrome.** The layout that
  matters is the one holding a full page of the longest thing an admin can type.
  A check that renders an empty state and reports six clean widths is measuring
  the easy case. Fixtures carry the limits, not the averages.
- **"Too small" is a floor in the factory, not a rule in the stylesheet.** Every
  icon is built by one function, so one `Math.max` covers the whole build
  including the icons written into innerHTML strings. A CSS `min-width` would
  have covered what CSS can see and left the rest.
- **Protecting the thing is not protecting the box it sits in.** `theme.css`
  gave every symbol `flex: none` and the wrapper around it was still a
  shrinkable flex item. Once the wrapper shrinks `max-width: 100%` crushes the
  symbol with `height: auto` following. Whenever a rule protects an element, ask
  what its parent does under pressure.
- **Measure before answering "why is it like that".** Nothing was squeezing the
  icons: they were drawn at the sizes they asked for. The fix that a squeeze
  would have needed is not the fix this needed, and one probe separated them.

## What phase 12 part 2 added to the list

- **A finding on every page is a finding about the check.** Part 1's version was
  436px of a 375px viewport; part 2's was every link in the admin sidebar
  reported as focusable inside `aria-hidden`. That was on six pages in two
  languages. The panel was `inert`. That takes an element out of the tab order
  and out of the accessibility tree and is invisible to `checkVisibility`.
  Before fixing what a sweep reports everywhere, ask whether the sweep can see
  what the build actually does.
- **Correct in the markup and wrong in the document.** The skip link is the
  first body child on every page in the build and was the third or fourth thing
  Tab reached. Three separate things prepended themselves above it. Nothing that
  reads the source can find this, and it is the general shape of every defect a
  page assembles at runtime.
- **`aria-hidden` on a panel that is still tabbable is a contradiction, not an
  omission.** The page has told a screen reader the subtree is not there and
  left the keyboard able to walk into it. Any panel that closes by moving off an
  edge needs `inert` or `visibility: hidden`; a transform is not hiding.
- **A `visibility` transition with a duration is still `hidden` at progress
  zero.** So a panel that focuses its first control the instant it opens focuses
  nothing at all, and the focus stays on the button behind it. Hidden late and
  shown at once — `visibility 0s linear <duration>` closed, `visibility 0s`
  open. **The filter sheet had been failing this since it was built.** It looked
  correct because Escape put the focus back where it already was.
- **A live region inserted with its content already inside it announces
  nothing.** There has to be a change to announce, so the region goes on the
  page empty and is written a frame later. And the region is the sentence, not
  the bar around it: controls inside a live region are read out again every time
  it is touched.
- **Beside is not attached.** A reason rendered next to a disabled control is a
  reason a screen reader cannot connect to it. `aria-describedby`, added and
  removed one token at a time so a second description is never overwritten.
- **A list of `h3` rows under an `h1` skips a level.** It is the commonest
  outline defect in this build, and five pages had it. A visually hidden `h2` is
  a structural fix and belongs in the accessibility part and not the polish one.
- **An empty list passes every rule there is.** Five account pages came back
  clean on a freshly registered account and three of them failed the moment it
  had rows. Part 1 said fixtures carry the limits and not the averages; the
  account sections cannot choose their fixtures. So the credential has to be
  given content and the run has to print how much it found. **A clean sweep over
  an empty dashboard is a clean sweep over an empty dashboard.**
- **A control taken out of the tab order still matches the build's own
  `FOCUSABLE` list.** `input:not([disabled])` does not care about
  `tabindex="-1"`, so a focus trap built on that list walks through things a
  reader cannot reach. Anything asking a question about the tab order has to ask
  it the tab order's way.
- **A guard that refuses is only proved by watching it refuse.** The delete
  ritual was walked once with the wrong username and once with the wrong
  password before it was walked properly. The 401 with the account still
  standing afterwards is the check. A destructive action tested only by
  succeeding has had its guards assumed.

## What phase 12 part 5 added to the list

- **A rewrite only runs when nothing on disk answers first.** Phase 3's rule
  said a route returning 200 is not evidence its rewrite works; this is the same
  fact from the other end. `/robots.txt` was a file for eleven phases, and
  putting one back would silently retire the function that replaced it. Anything
  rewritten to a function needs the file of that name gone, and a check that it
  has not come back.
- **One decision written in two files needs a check that they agree.** This is
  the third shape of it in the build, after phase 10's duplicated verdict rule
  and phase 11's two runtimes sharing a hash. Whether this site may be indexed
  is `INDEXING` in `api/_lib/discovery.js` *and* the global `X-Robots-Tag` in
  `vercel.json`. A robots.txt asks a crawler not to fetch, and only the header
  reaches a URL it already knows. Neither half works alone, so the check is that
  they say the same thing.
- **A switch whose off state is cached by somebody else is a one way door.** A
  crawler keeps `robots.txt` for about a day. Switching indexing off by writing
  `Disallow: /` would take a day to undo and would delist nothing that was
  already listed. What the switch does instead is remove the pointer and take
  the sitemap out of service. **Ask who holds the copy before deciding what an
  off switch writes.**
- **A file every crawler reads has to be answerable when the environment is
  not.** `robots.txt` falls back to a hardcoded origin instead of throwing. A
  5xx there means "do not crawl this site for now" to every major crawler. The
  failure mode is silent, site wide, and caused by a missing variable and not by
  anything a reader did. **Ask what a caller does with a 5xx before deciding
  that failing loudly is the safe direction.**
- **A `lastmod` nobody measured is not today.** A posting with no `updated_at`
  is listed with no date and not with the date of the run. That is the status
  page's "never draw a green day that was not measured" arriving before that
  page is built. The only static page with a date is `/status`, and it has one
  because it renders `build-status.json` and nothing else.
- **A feature an admin can see owes its sentence before the flip, not after.**
  Phases 9 and 10 both wrote `featureWhere.*` in a hurry once the switch had
  appeared on `/admin/maintenance`. The check now asks it of every flippable
  feature whose phase has shipped **or is building**. The exemptions are named
  and verified in both directions, so an unwritten sentence is found while there
  is still a part to write it in.

## What phase 12 part 6 added to the list

- **A duplicate that has been removed comes back by somebody writing the next
  one.** Four copies came out in this part — two modal shells, three `runAction`
  bodies, six tab strip keyboards. Nothing about the code that remains stops a
  seventh strip from carrying its own arrow keys. **A deduplication needs a
  check that counts.** That is what half of the `polish` section is: source
  checks asserting there is still one of each.
- **A hand-rolled focus trap is not what a modal needs, and never was.** The
  trap `dialog.js` had fired only on Tab from the first or last item, and
  filtered on `offsetParent !== null`. That is not the same question as "can
  this take focus". `showModal()` makes everything outside the dialog **inert**,
  which is a different and larger claim: not focusable *and* not in the
  accessibility tree. A screen reader could read the entire page under an open
  modal for eleven phases and nothing on screen said so.
- **Making one thing modal makes everything else inert, including the things you
  did not convert.** The scope this part started with — one shell, not three —
  was reasonable and was wrong. A plain div appended to the body while a modal
  `<dialog>` is open is unclickable and painted underneath it. **A partial
  migration to a stronger primitive breaks whatever was left behind.** The way
  to find out is to open the two together and ask `elementFromPoint`, not to
  read both files.
- **A check that hangs on the defect it is looking for is not a check.** The
  nesting probe awaited a promise the inert panel could never resolve, so the
  run stopped instead of reporting. Anything a check waits on has to be
  something the failure still produces.
- **A transition that a `display: none !important` sits on top of has never
  run.** `.modal-backdrop.hidden` carried opacity and transform transitions
  since phase 1, and `.hidden` in the utilities beat both. So every modal in the
  build cut instantly while the stylesheet described 220ms. **A stylesheet is
  not evidence that an animation happens**, and the tell was that nobody had
  ever noticed either way.
- **A control that declares what it needs beats a control that names it.**
  `data-feature-write` says "this writes"; the page it is on says which feature
  that is. Writing the key into the markup would have put one decision in two
  places. That is the failure this build has hit more often than any other.
- **The right instrument for a colour question is rarely a contrast ratio.**
  Three were tried on the switch: contrast against the card threw away the hue,
  which is the only thing separating the two states. Chroma of the composite
  measured the card and not the control. Chroma of the declared fill times its
  alpha is the colour the control itself adds. **Ask what the defect actually is
  before reaching for the number that is already there** — both states passed
  1.4.11 the whole time.
- **A check that cannot fail on the current deployment must skip, not pass.**
  `polish-live` measures a *subtraction*, and every route it asks about answers
  correctly whether or not the rewrites were removed. It is gated on a file part
  6 adds, so a clean run against the old deployment is impossible and not
  misleading. The same shape as `discovery-live`, and for the same reason.

## What phase 12 part 7 added to the list

- **A gap in the data is data, and three separate files have to agree not to
  fill it in.** The probe writes nothing it could not send and backfills
  nothing. The daily view manufactures no row for a day nobody probed. The page
  draws a missing day as unknown and not as either state. Any one of the three
  quietly closing the gap would produce a page that looks better and knows less.
  None of them would fail anything. **The general form: a system that reports on
  itself needs its "no answer" state defended at every layer that touches the
  data.** Every layer has a plausible-looking way to make it disappear.
- **A page that reports on a system must be sceptical of its own freshness.**
  The failure 0c exists to prevent is not a wrong colour, it is "all systems
  operational" printed because nothing could be reached. Every row behind that
  sentence is a row that says everything was fine — just an hour ago. The
  headline asks how old its evidence is before it asks what its evidence says.
- **Cache-first is right for a shell and wrong for an answer.** `/status` was
  precached for eleven phases while it was a static shell that fetched its own
  data. Turning it into a server rendered page silently turned the same entry
  into a frozen status page served to people who are online. **When a route
  changes from a shell to a rendered answer, its caching is part of the
  change.** That is in the worker and at the edge both.
- **Deleting a file breaks whatever was quietly resolving it.** Moving one page
  into a function broke four things that were reading the filesystem to decide
  what the site serves. Those were the precache checker, two test servers and
  the theme capture. Every one of them failed in a way that looked like a fault
  in the page and not in the reader. The fix in all four was to render from the
  module the deployment renders from.
- **A number two files both need is imported, not repeated.** The sweep's ninety
  days is the page's `DAYS`. Part 1 did the same with `MIN_SIZE`, and the
  failure it prevents here is specific. A sweep set shorter than the window
  would empty the left hand end of every bar, while the page went on labelling
  it ninety days.
- **A list that exists in three languages needs a check that reads all three.**
  The four probe targets are in JavaScript, in Python and in a SQL check
  constraint. Phase 11 learned this with `commands.py`. What is new is that one
  of the three copies is the database, which refuses a name nobody agreed to
  instead of reporting it.
- **Two states that differ only in hue are one state.** Part 3 found this
  measuring a switch; it applies to any drawn indicator. A partly measured day
  is a shorter square as well as a lighter one, and the check measures the
  height and not the colour.
- **Render the page and look at it, even when every check passes.** The four
  plates found a state that vanished into its own background. An hour after a
  rewrite they found a sentence explaining a mechanism that no longer existed.
  Both were invisible to every check in the file. A check knows what it was told
  to ask and a stale explanation answers all of them correctly.
- **A reported defect is a place to measure, not a thing to fix.** "The label
  exceeds its box on hover" measured as 12px of padding on both sides with
  nothing clipping at any width. What was true was that the pill was tight and
  the icon made one side look tighter. Fixing the reported bug would have been
  fixing something that was not happening. The real change, 4px, is one nobody
  would have asked for in those words.
- **The shape of what you store is a decision about what you can honestly say.**
  A row per check and a row per outage cost different amounts, and that is the
  small half. The row per outage can be *closed by an observed success*, so the
  page states a real duration. The row per check could only be closed by
  failures stopping, so every length was a floor. **Cheaper and truer are not
  usually the same choice, and when they are it is worth noticing why.** The
  expensive shape was storing the answer to a question nobody asks: what
  happened at 03:47 on a Tuesday when everything was fine.
- **Any roll-up has to carry its own coverage.** "This day was fine" without how
  much of the day was watched is the fabrication 0c forbids. It is a smaller
  disguise than a green day drawn over no data. The counters are not a
  statistic, they are the licence to draw the square.
- **`revoke ... from public` takes the implicit grant with it, so the one role
  that needs it is granted back by name.** 035 was a view running as its owner;
  this is a function every role can execute by default. The general rule is the
  same and is worth stating once more. **In this schema a new object is open
  until a line closes it, and the line belongs in the file that creates it.**
- **A check that cannot observe what it is asking about passes for the wrong
  reason.** `s-maxage` never reaches a browser: Vercel consumes it and rewrites
  the header. Reading it back proved nothing either way. The fix was to ask the
  system for something it actually emits: a second request that comes back a
  cache hit. **Before asserting a header, look at one.**
- **Scope a count to the thing being counted.** A legend carries one swatch of
  every state by definition, so an unscoped selector reported coverage on a page
  built to refuse to overstate coverage. The tell was on screen the whole time:
  the same page said "Last check recorded never".
- **A compound check needs a message that names which half failed.** "The tag
  went away after the delete was cancelled" was printed because a modal count
  was wrong. It sent somebody looking for a data-destroying bug in a shipped
  admin page. One message for two conditions is a message that is sometimes a
  lie.
- **A page nobody can reach yet gets no sweep by default.** Every accessibility
  and responsive section in this phase walks a list of routes, and a page that
  is not on the list is not measured. That is exactly the state a page built
  behind a gate is in. The pass has to be written into the part that builds it.
  **Phase 13 builds an entire site behind a gate**, so this is the line from
  part 7 most likely to be needed again.

## What phase 12 part 8 added to the list

- **A list in a document is compared against the thing it lists, in both
  directions, or it is decoration.** `migrations/README.md` stopped at `033` and
  four files were in the directory and in nobody's list, including the one this
  phase wrote. The same shape as `gen-review.js` rendering 223 of 1,728 and a
  probe measuring 26 colours. **What a hand written list is missing is invisible
  from inside it.**
- **A document can name a file the repository does not have.** Three of the six
  scripts the root README told a reader to run were matched by the root's
  throwaway-script ignore patterns. `gen-review.js` was tracked only because
  somebody had force added it once. **The check has to ask git, not the
  filesystem**, because the filesystem being asked is always the one machine
  where the file exists.
- **There is one database, so "local testing" writes to the live site.** Every
  row `seed.mjs` creates says SAMPLE in the language it is written in. The
  accounts are at a domain that can never resolve, and the script refuses to
  write while the site may be crawled. **A guard in code beat a sentence in a
  README**, because the sentence had been in one for five parts by then.
- **The state a script refuses to create is the state it must always be able to
  undo.** `--clear` is never refused, whatever `INDEXING` says. A guard that
  blocks the cleanup as well as the mess is a guard that gets bypassed.

## What phase 13 part 7's walk added to the list

The walk in section 5 item 24, done 3 September 2026. **Four of its five
findings were invisible to every check in this repository.** That is the
argument for the sitting and not an argument about any of them.

- **A variable in `.env.example` is not a variable that is set.** `SITE_URL` was
  documented from part 1 and was never added to the `careers-gftv-docs` Vercel project. So `/api/auth/staff/account` and `/api/auth/staff/passkeys` answered **500 to every staff account from part 6 until it was found**. Those are the two routes on that site that call `relyingParty()`. Everything else answered 200. The
  settings page drew one error callout where nine panels go.

  **`checkEnv()` exists in `env.js` and nothing calls it.** It was written for
  exactly this and has never run. A health endpoint, or one call at boot, turns
  a fortnight of silence into a line naming the variable. The error message was
  perfect and nobody was reading the logs.

  **And `--only=live`'s 27 checks passed throughout**, because every one of them
  asks as a stranger. A section that only knows how to be a stranger cannot see
  a signed in page. That is the blind spot item 24 was written about.
- **A 200 is not a page.** `https://gftv.asia/account` answered 200 while
  serving a one page app's catch all. Status codes cannot tell a route from a
  fallback, so **a cross site link is checked by opening it**. It is pinned by
  asserting the exact address afterwards.
- **A constant governs the table it is named for and no other.**
  `HELLO_WRITES_ENABLED` holds `gftvhello_users`; the backup code set writes
  `gftvhello_backup_codes` and was never behind it. The count "three writes
  reach gftv.asia" was wrong for a fortnight. The route itself said so in its
  header, its audit metadata and its response flag. **A fact stated in several
  places and counted in none is a fact nobody has counted.**
- **The label is read; the consequence line is read only if somebody stops.**
  "Sign out everywhere" left the current browser signed in and said so exactly,
  in the confirm dialog. It was still a surprise. Where the two can disagree,
  the behaviour follows the label.
- **Every step of a by-hand walk leaves a row, so a walk can be checked.** A
  passkey, a code set, a trusted device, an enrolment: each is observable from
  outside. **Three times during this sitting the walk was reported done and the
  rows said otherwise.** Twice that was because the wrong account was being
  looked at and once because a deployment was still building. The probes are in
  the scratchpad and not in `tests/`. The next phase should decide whether a
  `--only=walk` section that reads this state belongs in the phase file.

## Traps the next phase should still know about

- **`gftvjobs_analytics` is append only and the funnel counts every row.**
- **Do not sweep `gftvhello_sessions`.** Section 11 says so and deviation 54
  goes one step further than it.
- **The three test buckets bite.** `admin` is 200 an hour per staff account,
  `report` is 12 an hour **per address**, `adminDelete` is 10 an hour. Phase 9's
  own run is light — three postings, about fifteen writes. It was re-run three
  times inside one hour on 26 August 2026 without trouble.

---
