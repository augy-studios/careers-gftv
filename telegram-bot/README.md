# telegram-bot

The Careers@GFTV Telegram bot, `careersgftv_bot`.

**Status: not built yet.** The bot ships in phase 11. This directory currently
holds the scaffold only: this README, `.env.example`, and `.gitignore`. There
is no code here to run. See [the build status page](https://careers.globalfurry.tv/status).

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

A command whose backing feature has not shipped replies with the same sentence
the site uses, rather than failing or going quiet.

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

## Running it on the VPS

Debian 13, under tmux, with this repo checked out.

```bash
cd telegram-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in .env, then

tmux new -s careersbot
python bot.py
# detach with ctrl-b then d, reattach with: tmux attach -t careersbot
```

## Environment variables

Every one is documented in `.env.example` with a comment saying where to get
it. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are deliberately the same names
the site uses, so the two halves cannot drift onto different databases.

The service role key bypasses row level security. Keep it on the VPS and
nowhere else.

## BotFather setup

See `setup.md`, which lands with the bot in phase 11. It covers creating the
bot, the about text, the description, and the command list to paste into
BotFather.
