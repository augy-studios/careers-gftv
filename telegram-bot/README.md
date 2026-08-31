# telegram-bot

The Careers@GFTV Telegram bot, `careersgftv_bot`.

**Status: all seven parts of phase 11 are here.** The process starts, holds a
single instance lock, opens its SQLite database, reads what has shipped and what
an admin has switched off from the live site, and answers all nine commands.
Linking works from both ends: the site issues a token and shows a QR, and
`/start <token>` turns it into a link. A login code and the one tap sign in link
come from a loop of their own, the outbox drain delivers the three notification
kinds, and `notify` decides which of them arrive.
See [the build status page](https://careers.globalfurry.tv/status).

**Deploying a part is a restart, and the order matters.** The site half of a
part deploys itself when it is merged; this half does not. So for anything that
spans both, pull and restart the bot *first*, then merge, or the portal offers a
control that leads at a process running last week's code.

**Nothing in this directory is checked by a script.** That was settled
deliberately and it is deviation 91, which carries the reasoning and the two
things built differently because of it. What stands in place of a suite is
[the by-hand checklist](#the-by-hand-checklist) below, walked by a person.

## What it will do

The bot is a delivery channel and a second factor. It is never the only record
of anything: an applicant with no Telegram link still sees every invitation and
every task in the portal itself.

- Link a Telegram account to a portal account, from either end.
- Deliver a six digit login code, or a one tap sign in link bound to the
  browser that asked for it.
- Act as the second factor at login, once the applicant turns that on.
- Deliver three kinds of notification: an invitation to a role, a request for
  more information, and a change to an application's status. Each one is
  individually toggleable.

The site never calls the bot. It writes a row into `gftvjobs_notifications` and
returns. The bot polls that table, claims a batch, sends, and marks each row
sent or failed. Security messages, such as a password change, are sent directly
rather than queued and cannot be switched off.

### Where a login code comes from

**The bot generates it, which is not what section 15 reads like.** The
specification says the portal sends a six digit code, and the portal cannot:
nothing on the site's side can reach Telegram. So whatever sends the message is
the only thing that can know what it says, and `gftvjobs_telegram_tokens` stores
hashes and never a code.

What happens instead is that the site writes a row meaning *somebody asked for a
code*, with `token_hash` set to `pending:` and some randomness. `security.py`
claims a batch of those every two seconds in one conditional update, generates
the digits, writes back the bcrypt hash, and sends the message. The code exists
in one process and one chat message.

**Two loops rather than one, and the difference is who is waiting.** A code is
polled for every two seconds because somebody is sitting in front of a login
form; the outbox is polled every twenty because an invitation can wait. Both use
the same conditional claim, so two instances cannot both send.

**Every code message carries a copy button**, on both paths, from one helper in
`security.py`. Telegram copies the digits itself: the payload rides with the
button, the tap never reaches the bot, and there is nothing to register in the
callback registry. The constructor arrived with Bot API 8.0's `copy_text`, and
`requirements.txt` floats Telethon within 1.x, so **the import is guarded**: a
VPS on an older 1.x logs a line at startup and sends the message without the
button rather than failing a login. `pip install --upgrade 'telethon<2'` is the
fix, and the bold digits on their own line stay tap-and-holdable either way.

**The one tap link is only ever made for a request that came from a browser.**
The site sets a nonce in a cookie and stores its hash on the row, and the bot
makes the link only when that hash is there. `/code` typed into the chat has no
browser behind it, so it gets the digits and no link: a one tap sign in with
nothing to bind it to is a credential for whoever sees the message.

The bot's own copy of bcrypt has to agree with the site's `bcryptjs`, at cost 12
in both. `tests/phase11-test.mjs --only=seam` checks exactly that, against a hash
a real Python bcrypt produced, because the failure it prevents is a correct code
refused at a login form with nothing in any log to explain it.

## Commands

Nine, and only nine. There is no `help`; `start` carries that content.

| Command | What it returns |
|---|---|
| `start` | What the bot does, the command list, and buttons to the portal and the donation link. Also handles the deep link payload for account linking and one tap code delivery. |
| `link` | Begins linking this Telegram account to a portal account, for someone who found the bot before the site. |
| `unlink` | Removes the link, behind a confirmation button. |
| `code` | Sends a fresh one time login code for the linked account, with a button that copies it. |
| `invites` | Open job invitations, with a button through to each posting. |
| `tasks` | Outstanding task count, with a link to the tasks page. |
| `applications` | The applicant's own applications and their current statuses. |
| `jobs` | The newest openings, with buttons through to each posting. |
| `notify` | Toggles which notification kinds this account receives. |

**All nine answer, and the not-built-yet half of that machinery is now unused
rather than removed.** A command with no handler replies with the same sentence
the site puts on a control for an unshipped feature; one that is built, and
whose feature an admin has switched off, gets the maintenance sentence instead.
The two are never mixed: telling somebody a feature they used last week arrives
in a later phase is a lie about a shipped feature, and it makes a real outage
indistinguishable from an unbuilt one. The machinery stays because a tenth
command arrives the same way the first nine did, listed before it works.

What decides the first of those is whether a handler exists, not whether the
phase has shipped. It has to be: the phase cannot be flipped to shipped until
the bot has been walked through by hand, and a bot that refused every command
until the flip could not be walked through at all.

## Build conventions, for phase 11

- Telethon, Python. Not python-telegram-bot, not aiogram.
- SQLite for anything bot local: scheduling, rate limits, dedupe, and the
  registry of active interaction buttons, so buttons keep working across
  restarts. Store the callback payload and its meaning in SQLite and look it up
  on click rather than packing state into the callback data.
- Supabase is the shared source of truth for accounts, links, tokens, invites,
  and the outbox. SQLite never duplicates account data.
- Never mention the bot's own name inside any command text or reply.
- Rich formatted replies rather than plain text. No em dashes.

## The files

| File | What it holds |
|---|---|
| `bot.py` | The process. Config, lock, database, Telethon, the dispatcher, shutdown. |
| `supabase.py` | The whole of the bot's reach into the shared database, over PostgREST. Nothing here reads and then writes. |
| `commands.py` | **The command list, and the only copy of it.** `start` prints from it, Telegram's menu is registered from it, `setup.md` gives BotFather the same lines, and `--check` proves both documents still agree with it. |
| `handlers.py` | One handler per built command, and the rule that decides what answers. |
| `security.py` | The fast loop. Sign in codes and the one tap link that rides with them. Two seconds, beside the command loop and never inside it. |
| `outbox.py` | The slow loop. The claim, the three renderers, the retries and their backoff, `skipped`, the stale claim sweep, and the flood wait that reschedules rather than sleeping the worker. Twenty seconds. |
| `feed.py` | The public openings feed, with a short cache per language, behind `jobs`. |
| `strings.py` | Everything the bot says, in every language. Not the site's dictionaries. |
| `build_status.py` | What has shipped and what an admin has switched off. |
| `config.py` | The environment, validated once, with every problem reported together. |
| `db.py` | SQLite: the migrations, and the registry of what a button means. |
| `lang.py` | Which language to answer somebody who has linked nothing yet. |
| `lock.py` | One instance at a time. |
| `log.py` | Standard output for the tmux pane, a rotating file for the morning after. |
| `probe.py` | **The status probe, and a second process rather than a loop in the first.** Phase 12 part 7. Four public GETs a minute, written straight to Supabase. It has nothing to do with Telegram. |

## Running it on the VPS

Debian 13, with this repo checked out. The tmux session is yours to manage; the
bot neither starts one nor expects one.

```bash
cd telegram-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in .env, then

python bot.py
```

Deploying a new part is a `git pull`, `pip install -r requirements.txt` if that
file changed, and a restart.

### Starting it twice

**A second instance refuses to start.** It does not wait, does not retry, and
does not take the lock from the running one. It prints the process id that holds
`bot.lock` and exits with status 3, so "is the old one definitely dead" is a line
of output rather than a judgement call.

That matters more here than it looks. A restart that does not kill cleanly
leaves the old process answering commands with last week's code, and nobody
notices, because the symptom is a reply that was going to arrive anyway. The
lock is released by the kernel when the process ends, including when it is
killed, so there is never a stale lock file to clear by hand.

Double sending a notification is a separate problem with a separate answer: the
drain claims a batch in one conditional update, so two instances cannot send the
same row twice even if both are somehow running.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | A clean shutdown. |
| 2 | The environment is not usable. Every problem with it is listed. |
| 3 | Another instance is already running, and its process id is named. |
| 1 | Anything else, with the traceback in the log. |

## The status probe

**It is not part of the bot.** `probe.py` is a separate process that happens to
live on this machine, and phase 12 part 7 built it. 0c needs a prober outside
Vercel — a status page hosted on the thing it monitors is useless during the
outage it exists to report — and this VPS is the only component in the whole
architecture that is outside Vercel. It is here because of where it runs rather
than what it does.

**Two processes, not two loops in one.** `security.py` and `outbox.py` are tasks
inside `bot.py` because they send through Telethon and share its client. This
sends nothing. Section 15 requires it to keep recording while Telethon is
wedged: "the bot is broken" and "the portal is down" are exactly the two things
a status page has to tell apart, and a probe inside the bot could not tell them
apart at all.

```bash
cd telegram-bot
source .venv/bin/activate
python probe.py
```

Its own tmux window, its own lock (`probe.lock`), its own log (`logs/probe.log`),
and the same four exit codes the bot uses. **It needs no new environment
variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SITE_URL` are already in
`.env`, and it reads nothing else — not the bot token, not the Telethon
credentials. A revoked bot token stops the bot and leaves the probe recording,
which is the whole reason it is a second process.

Every sixty seconds it requests four public addresses and reports all four to
Supabase in one call:

| Target | Address | Counts as working when |
|---|---|---|
| `feature_status` | `/api/public/feature-status` | 200 and JSON |
| `search` | `/search` | 200 and HTML |
| `job_page` | `/jobs/{uuid}` | 200 and HTML |
| `jobs_feed` | `/api/public/jobs.json` | 200 and JSON |

**What it stores is a day and an outage, not a check.** The results go to
`gftvjobs_status_record()`, migration 037's function, which adds to that day's
counters for each target and opens, extends or closes an outage row. A quiet
quarter is four rows a day rather than 5,760, and a prolonged outage is one row
that grows rather than a row a minute saying the same thing. The probe decides
whether a request worked and nothing else; what that means is the database's
business.

**Which posting `job_page` fetches is read from the live feed**, not configured.
The seeded postings are being deleted before indexing is turned on, and a URL in
a `.env` file pointing at one of them would probe a 404 for ever afterwards and
draw the portal as down. It re-picks when the page it holds answers 404.

Four things it does not do, all of them from section 15 and none of them an
oversight:

- **It never writes to the portal.** The four requests are public GETs and the
  row goes straight to Supabase. An endpoint on the portal would be unreachable
  in precisely the case worth recording.
- **It never alerts.** No message to anybody, no channel post, no mention in any
  command. Alerting needs an on-call story and a decision about who gets woken,
  and neither exists yet. What this delivers is a page somebody chooses to look
  at.
- **It buffers nothing.** When Supabase cannot be reached the cycle's rows are
  logged and dropped. A gap in the data is honest and the status page draws it
  as unknown; a row backfilled an hour late timestamped as though it were on
  time is not.
- **It is not a command.** Nothing about it is visible in Telegram, and
  `python commands.py --check` would fail if it were.

The rows are swept at ninety days by the site's daily cron, per section 11 —
which on this shape is a very small sweep, and an outage still open is never
swept whatever its age.

## The by-hand checklist

**This is the only coverage the Python has.** Deviation 91 traded a scripted
suite for a person and a list, so the list is the suite: `tests/phase11-test.mjs`
covers the site half of phase 11 and knows nothing at all about the process
running on the VPS.

Walk it in order, in one sitting, against a bot that has been pulled and
restarted and a site that has been deployed — **in that order**, per the note at
the top of this file. What it needs: an applicant account, an admin account, a
Telegram account that has never been linked to either, and a second browser for
step 14. About forty minutes.

1. **Start the bot.** The log names, in order, the SQLite migration if this is a
   first run, the pid and the start number, which build status was read and what
   it says, `connected as @careersgftv_bot`, the command list with what answers
   today, and `ready`.
2. **Start a second one in another pane.** It refuses, prints the pid holding
   `bot.lock`, and exits 3. It must not wait, retry, or take the lock.
3. **Kill the first one outright** rather than stopping it cleanly, and start it
   again. It starts: the kernel released the lock, so there is never a stale
   file to clear by hand. Cheapest check here, and one of the two the deferral
   below would otherwise have swallowed.
4. **`/start` from a Telegram account that has linked nothing.** The
   introduction, all nine commands, a button to the portal, and the donation
   button if `DONATION_URL` is set. **Nothing in the reply names the bot.**
5. **Type something that is not a command.** One line pointing at `/start`, not
   silence and not an error.
6. **`/invites` while unlinked.** The sentence asking you to link, rather than an
   empty list, which would be an answer about somebody's invitations.
7. **On the site, `/account/settings` as the applicant, and press Link.** The QR
   and the deep link both appear, and the QR is scannable in both themes.
8. **Scan it with the phone.** The chat opens on the token and the bot confirms
   the link by name.
9. **Leave that settings page where it is.** It flips to linked without a
   refresh.
10. **Send the test message from the panel.** It arrives.
11. **`/code` in the chat.** Six bold digits and a copy button, and **no sign in
    button**, because nothing there came from a browser and a one tap link with
    nothing to bind it to is a credential for whoever sees the message. Tap the
    copy button. **No button at all means the VPS is on an older Telethon** —
    `pip install --upgrade 'telethon<2'`, not a code change.
12. **Ask for several in a row.** The rate limit sentence arrives instead of a
    fresh code.
13. **Sign out, and sign in from `/login` asking for a Telegram code.** The
    message carries the sign in button on top and the copy row underneath. The
    digits work in the form.
14. **Open that sign in button's link in a different browser.** Refused, with
    the reason on the page it lands on and the parameter taken off the URL.
15. **Open it in the browser that asked for it.** Signed in, one tap.
16. **Turn the Telegram second factor on, in `/account/security`.** It refuses
    by name until the account has backup codes, and the switch goes back rather
    than sitting where it was left. Make the codes, turn it on, sign out, and
    sign in again: the second step asks for a code and the code arrives.
17. **`/notify`.** Three toggles with their current state. Turn one off and back
    on, and confirm the message redraws each time rather than answering in a new
    one.
18. **As the admin, invite the applicant to a role.** The invitation arrives
    with the role, the department, any note, a button through to the posting,
    and a **Decline** button. The drain's log line for that pass names what it
    claimed, sent, skipped and failed.
19. **Press Decline.** The chat says so, `/admin/invites` shows the invitation
    declined, and **the task raised beside it is untouched**.
20. **Raise a request for more information.** It arrives with the task title and
    a button to the tasks page.
21. **Move one of the applicant's applications to another status.** It arrives
    carrying the portal's own word for that status.
22. **Every one of those three carries the unsubscribe footer.**
23. **Turn task notifications off in `/notify`, then raise another task.** The
    row is marked `skipped` rather than left queued, and the outbox panel on
    `/admin` counts it as skipped.
24. **`/invites`, `/tasks`, `/applications`, `/jobs`.** Each answers, each list
    has a button through to what it names, and the status words match the ones
    the portal shows on the same rows.
25. **Switch the Telegram client to 华文** and repeat `/start` and one list. The
    whole reply is in 华文, including the status words.
26. **`/admin/maintenance`.** All four switches read On. Turn `telegram_link`
    off and confirm the bot answers with the **maintenance** sentence and not
    the not-built-yet one — the two are never interchangeable. Turn it back on,
    and confirm the bot picks that up **with no restart**.
27. **Turn `telegram_notifications` off with a row queued.** The drain pauses
    rather than marking anything skipped, and the queue drains when it goes back
    on. The other of the two cheap checks from the deferral below.
28. **`/unlink`.** A confirmation button; No leaves the link alone, Yes removes
    it, and the settings panel shows unlinked.
29. **With the link gone, raise one more task.** The row goes to `skipped`,
    never queued forever, and the `/admin` panel shows it as such.

**Three things this list deliberately does not ask for**, deferred on
30 August 2026 and written here rather than left silent: **a restart in the
middle of a drain**, **the stale claim sweep**, and **a row exhausting its
retries and reaching `failed`**. All three need rows genuinely in flight, and
this portal has little enough traffic that few ever are. The risk they cover
arrives with the next deploy rather than with the next applicant, and what makes
the deferral acceptable is where the correctness lives: the claim is one
conditional update, so a double send is impossible by the query rather than by a
test. **What is untested is whether a row can be lost, not whether one can be
sent twice.** Steps 3 and 27 are the two of the five that cost under a minute
and depend on no traffic at all, which is why they are in the list.

## Environment variables

Every one is documented in `.env.example` with a comment saying where to get
it. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are deliberately the same names
the site uses, so the two halves cannot drift onto different databases.

The service role key bypasses row level security. Keep it on the VPS and
nowhere else.

## BotFather setup

See [`setup.md`](setup.md). It covers the Telethon credentials from
my.telegram.org, creating the bot, the about text, the description, the command
list to paste into BotFather, which of the bot settings matter, and a reference
table of every BotFather command relevant here.

**The command list in that file is generated, not typed.** `python commands.py`
prints it in every language, and **`python commands.py --check` reads both
documents that carry a copy of the list** — `setup.md`'s blocks and the table in
this file — and fails naming whichever has drifted from `commands.py`. A
document carrying no copy at all fails too, because a check that found nothing
to look at and reported a clean pass is the worst possible answer in a component
whose every failure is silent.
