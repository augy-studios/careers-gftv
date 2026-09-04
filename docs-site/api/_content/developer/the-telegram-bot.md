---
title: The Telegram bot
access: developer
order: 15
summary: How it is deployed on the VPS, the outbox drain, the status probe beside it, and where its own documentation lives.
---

# The Telegram bot

**`careersgftv_bot`, in `telegram-bot/`, and it is the one part of this project
that is not on Vercel.** It runs on a Debian VPS under tmux, from this same
repository, deployed by pulling and restarting the process by hand.

`telegram-bot/README.md` is its documentation and `setup.md` covers the
BotFather side. This page is the shape of it and the things that catch people
out.

## What it is, and what it is not

**A delivery channel and a second factor.** It is never the only record of
anything: an applicant with no Telegram link still sees every invitation and
every task in the portal.

- Link a Telegram account to a portal account, from either end.
- Deliver a six digit login code, or a one tap sign in link bound to the browser
  that asked for it.
- Act as the second factor at login, once the applicant turns it on.
- Deliver three kinds of notification, each individually switchable.

**Nine commands, and only nine.** There is no `help`; `start` carries that
content. `telegram-bot/commands.py` is the only copy of the list. The menu Telegram
registers, the start message, `setup.md` and the [command
reference](/bot/commands) all come from it. `python commands.py --check` proves
the documents still agree.

## The site never calls the bot

**The portal writes a row into `gftvjobs_notifications` and returns.** The bot
polls that table, claims a batch, sends, and marks each row sent or failed.

**Security messages are sent directly and cannot be switched off.** A password
change is not a notification anybody opts out of.

**Two loops, and the difference is who is waiting.** A login code is polled for
every two seconds, because somebody is sitting in front of a login form. The
outbox is polled every twenty, because an invitation can wait. Both use the same
conditional claim, so two instances cannot both send.

## Where a login code comes from

**The bot generates it, which is not what the specification reads like.** The
brief says the portal sends a six digit code, and the portal cannot: nothing on
the site's side can reach Telegram.

So the site writes a row meaning *somebody asked for a code*, with the hash
column set to a pending marker and some randomness. The bot claims a batch of
those in one conditional update, generates the digits, writes back the bcrypt
hash, and sends the message. **The code exists in one process and one chat
message.**

**The one tap link is only ever made for a request that came from a browser.**
The site sets a nonce in a cookie and stores its hash on the row. The bot makes
the link only when that hash is there. A code typed into the chat has no
browser behind it, so it gets the digits and no link.

> [!WARNING]
> The bot's bcrypt has to agree with the site's, at cost 12 in both.
> `tests/phase11-test.mjs --only=seam` checks exactly that, against a hash a real
> Python bcrypt produced. The failure it prevents is a correct code refused at a
> login form, with nothing in any log to explain it.

## Deploying it

```bash
cd telegram-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill it in
python bot.py
```

Deploying a change is `git pull`, `pip install -r requirements.txt` when that
file moved, and a restart.

> [!DANGER]
> **The order matters for anything spanning both halves.** The site half deploys
> itself when it is merged; this half does not. Pull and restart the bot first,
> then merge, or the portal offers a control that leads at a process running last
> week's code.

**A second instance refuses to start.** It does not wait and it does not take
the lock. It prints the process id holding `bot.lock` and exits with status 3.
So "is the old one definitely dead" is a line of output and not a judgement
call.

| Exit code | Meaning |
|---|---|
| 0 | A clean shutdown. |
| 2 | The environment is not usable. Every problem with it is listed. |
| 3 | Another instance is already running, and its process id is named. |
| 1 | Anything else, with the traceback in the log. |

## Its own conventions

- **Telethon and Python.** Not python-telegram-bot, and not aiogram.
- **SQLite for anything bot local**: scheduling, rate limits, dedupe, and the
  registry of what a button means, so buttons keep working across restarts.
  Store the payload and look it up on click; never pack state into callback data.
- **Supabase is the shared source of truth** for accounts, links, tokens,
  invites and the outbox. SQLite never duplicates account data.
- **Never mention the bot's own name inside a reply.**
- **Rich formatted replies**, and no em dashes.

**It reads `build-status.json` from the live site.** An unbuilt command replies
with the phase sentence, and a switched-off one replies with the maintenance
sentence. The two are never mixed.

## The status probe

**`probe.py` is not part of the bot.** It is a separate process that happens to
live on the same machine, and it has nothing to do with Telegram.

**A status page hosted on the thing it monitors is useless during the outage it
exists to report.** This VPS is the only component in the whole architecture
outside Vercel, so the probe runs here. Four public GETs a minute, written
straight to Supabase through the one function that owns those tables.

**A probe that cannot reach Supabase writes nothing and says nothing.** It does
not retry into a backlog and it does not buffer. A gap in the data is an honest
gap, and the page draws it as no data.

## It has no scripted checks at all

**That was settled deliberately.** What stands in place of a suite is the
by-hand checklist in `telegram-bot/README.md`, walked by a person.

**`LOG_LEVEL` is what you have instead of a test run.** `DEBUG` is what to reach
for while walking the checklist, and it is not what to leave it on.
