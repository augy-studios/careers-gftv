# telegram-bot

The Careers@GFTV Telegram bot, `careersgftv_bot`.

**Status: phase 11 parts 1 and 2 are here.** The process starts, holds a single
instance lock, opens its SQLite database, reads what has shipped from the live
site, and answers `start`, `link` and `unlink`. Linking works from both ends: the
site issues a token and shows a QR, and `/start <token>` turns it into a link.
Every other command is registered, is listed, and replies with the sentence the
site uses for something that is not built yet.
See [the build status page](https://careers.globalfurry.tv/status).

The parts still to come are login codes and the magic link, the outbox drain,
the three notification kinds, the four list commands, and the seam that carries
the checklist.

**Deploying a part is a restart, and the order matters.** The site half of a
part deploys itself when it is merged; this half does not. So for anything that
spans both, pull and restart the bot *first*, then merge, or the portal offers a
control that leads at a process running last week's code.

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

## Commands

Nine, and only nine. There is no `help`; `start` carries that content.

| Command | What it returns |
|---|---|
| `start` | What the bot does, the command list, and buttons to the portal and the donation link. Also handles the deep link payload for account linking and one tap code delivery. |
| `link` | Begins linking this Telegram account to a portal account, for someone who found the bot before the site. |
| `unlink` | Removes the link, behind a confirmation button. |
| `code` | Sends a fresh one time login code for the linked account. |
| `invites` | Open job invitations, with a button through to each posting. |
| `tasks` | Outstanding task count, with a link to the tasks page. |
| `applications` | The applicant's own applications and their current statuses. |
| `jobs` | The newest openings, with buttons through to each posting. |
| `notify` | Toggles which notification kinds this account receives. |

A command that is not built yet replies with the same sentence the site puts on
a control for an unshipped feature, rather than failing or going quiet. One that
is built, and whose feature an admin has switched off, gets the maintenance
sentence instead. The two are never mixed: telling somebody a feature they used
last week arrives in a later phase is a lie about a shipped feature, and it
makes a real outage indistinguishable from an unbuilt one.

What decides the first of those is whether a handler exists, not whether the
phase has shipped. It has to be: the phase cannot be flipped to shipped until
the bot has been walked through by hand, and a bot that refused every command
until the flip could not be walked through at all. The site's own gate is
unaffected, so the Link control in account settings stays disabled to everybody
until phase 11 ships.

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
| `commands.py` | **The command list, and the only copy of it.** `start` prints from it, Telegram's menu is registered from it, and `setup.md` will give BotFather the same lines. |
| `handlers.py` | One handler per built command, and the rule that decides what answers. |
| `strings.py` | Everything the bot says, in every language. Not the site's dictionaries. |
| `build_status.py` | What has shipped and what an admin has switched off. |
| `config.py` | The environment, validated once, with every problem reported together. |
| `db.py` | SQLite: the migrations, and the registry of what a button means. |
| `lang.py` | Which language to answer somebody who has linked nothing yet. |
| `lock.py` | One instance at a time. |
| `log.py` | Standard output for the tmux pane, a rotating file for the morning after. |

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
prints it in every language, and `python commands.py --check setup.md` fails if
the document has drifted from the code.
