---
title: 15. Telegram bot (telegram-bot/)
access: developer
order: 18
summary: Build a Telegram bot in a new telegram-bot directory in this same repo.
---

# 15. Telegram bot (`telegram-bot/`)

Build a Telegram bot in a new `telegram-bot` directory in this same repo. Base it on the scripts in `main-site`, so the two agree on the schema and the flows. It runs on my Debian 13 VPS under tmux, with GitHub for version control.

### Build conventions

- Telethon, Python. Not python-telegram-bot, not aiogram.
- Bot username is `careersgftv_bot`. Never mention the bot's name inside any command text or reply.
- Include a `README.md` explaining what the bot is and how to use it. Include a `setup.md` covering BotFather setup, with the about text, description, and command list. And a `.gitignore`.
- Deliver every file individually. No zip.
- SQLite for anything bot local: scheduling, rate limits, dedupe, and the registry of active interaction buttons, so buttons keep working forever across restarts. Store the callback payload and its meaning in SQLite, and look it up on click. Never pack state into the callback data.
- Supabase is the shared source of truth for accounts, links, tokens, invites, and the notification outbox. The bot reads and writes those directly with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. SQLite never duplicates account data.
- Prefer rich formatted replies over plain text. Avoid em dashes, and rephrase rather than leaving a sentence that only worked with one.
- Any knowledge base content, if it ever becomes relevant, comes from an open source REST API rather than a hardcoded list.

### Commands

- `start` - what the bot does, the full command list, and buttons linking to the web app and the donation link. Also handles the deep link payload from `t.me/careersgftv_bot?start=<token>` for account linking and for one-tap code delivery.
- `link` - begin linking this Telegram account to a portal account, for someone who found the bot before the site.
- `unlink` - remove the link, with a confirmation button.
- `code` - send a fresh one time login code for the linked account.
- `invites` - list open job invitations with a button through to each posting.
- `tasks` - outstanding tasks count with a link to `/account/tasks`.
- `applications` - the applicant's own application list and current statuses.
- `jobs` - the newest openings, with buttons through to each posting.
- `notify` - toggle which notification kinds this account receives.

No `help` command. `start` carries that content.

### Linking flow

1. The applicant clicks "Link Telegram for 2FA" in account settings. The site creates a `gftvjobs_telegram_tokens` row with purpose `link`, stores the hash, and shows the deep link and QR.
2. They open the deep link, which sends `/start <token>` to the bot.
3. The bot hashes the payload and finds an unused unexpired row. It writes the `gftvjobs_telegram_links` row with their Telegram user id, marks the token used, and confirms in chat.
4. The settings page is polling and flips to linked without a refresh.
5. Tokens expire in ten minutes and are single use. A token that is already used, expired, or unknown gets a clear message and no detail about why.

### Login codes and magic links

- `code`, or the button on the 2FA prompt, issues a six digit code. It is valid for five minutes, single use, and stored hashed, with an attempt cap.
- The magic link variant sends a one tap button that signs the applicant in directly. Treat it as a full login and not a second factor, because that is what it is. Bind it to the browser that requested it. Store a nonce in a cookie at request time and check it on consumption, so a forwarded link is useless to anyone else. Keep its lifetime to five minutes.
- Never send a code or link to a Telegram account that is not currently linked to the account being signed into.
- Rate limit per account and per Telegram user, and back off after repeated failures rather than silently ignoring them.

### Notifications

- The site never calls the bot. It writes a row into `gftvjobs_notifications` and returns.
- The bot polls that table every 15 to 30 seconds. It claims a batch by moving rows from `queued` to `claimed` in a single conditional update, so two bot instances cannot double send. It sends, then marks `sent` or `failed` with the error and an attempt count. Retry failures a few times with backoff, then leave them `failed` for an admin to see.
- Three kinds, all shipping in the first version: `invite`, `task_raised`, and `application_status_changed`. Security messages such as a password reset or a new trusted device are sent directly and never queued. They are not subject to the `notify` toggles, since silencing them is what an attacker would want. An applicant with no Telegram link gets their rows marked `skipped`, instead of left queued forever.
- Respect the `notify` toggles per kind, and always include an unsubscribe hint in the footer of a notification.
- Keep Telegram rate limits in mind: pace sends, and handle flood wait errors by rescheduling in SQLite rather than sleeping the whole worker.

### Invites over Telegram

- When an admin invites an applicant to a posting, the site writes the invite row and queues an `invite` notification.
- The message names the role and the department, and includes the admin's note if there is one. It carries buttons to view the posting and to decline. Declining writes back to `gftvjobs_invites`.
- An applicant with no linked Telegram still sees the invite in the portal on `/account/tasks`. Telegram is a delivery channel and never the only record.

### The status probe

Added 26 August 2026, built in phase 12, and it has nothing to do with Telegram. It lives here because of where it runs, and not because of what it does. The status page in 0c needs a prober outside Vercel, and **this VPS is the only thing in the whole architecture that is**. A loop that makes four requests a minute does not deserve a second machine. Beside it is a process already running, already holding the Supabase credentials, and already in this repository.

- A loop, separate from the bot's own event loop and able to fail without taking the bot down. If Telethon is wedged the probe should still be recording. "The bot is broken" and "the portal is down" are exactly the two things a status page has to tell apart.
- Every sixty seconds, request `/api/public/feature-status`, `/search`, one seeded posting page, and `/api/public/jobs.json`. Report all four to `gftvjobs_status_record()` in one call, with the status code, the duration, and whether each succeeded. The function keeps the day's counters and the outage rows in section 6. Public and read only, all four, so this needs no portal credential and can never change anything. **Which posting is probed is read from the public feed** and never configured, so it follows the board when the seed is cleared.
- **It writes to Supabase directly and never through the portal.** An endpoint on the portal is unreachable in precisely the case worth recording.
- **It does not alert.** No message to anybody, no channel post, no mention in any command. Alerting needs an on-call story and a decision about who is woken up, and neither exists. What this delivers is data for a page somebody chooses to look at.
- **A failure to reach Supabase writes nothing.** No local buffer and no backfill on reconnect. A gap is drawn on the page as unknown, which is true. A backfilled row timestamped an hour late is not.
- **It is not a command and it is not in the command list.** Nothing about it is visible in Telegram at all.

### Environment

Add to the bot's own `.env.example`, documented the same way as the site's:

```bash
# BotFather token for careersgftv_bot.
# Telegram, message BotFather, /mybots, select the bot, API Token.
TELEGRAM_BOT_TOKEN=

# Telegram API credentials for Telethon.
# https://my.telegram.org, API development tools.
TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Same Supabase project as the site.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Base URL used when building links back to the portal.
SITE_URL=https://careers.globalfurry.tv

# Shown as a button on the start message.
DONATION_URL=
```
