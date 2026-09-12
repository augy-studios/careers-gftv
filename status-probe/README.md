# Careers@GFTV status probe

The process behind the service status page at
[careers.globalfurry.tv/status](https://careers.globalfurry.tv/status). Once a
minute it requests four public addresses on the portal from outside Vercel and
records what it saw in Supabase. The page draws those rows as ninety days of
squares, and a day this was not running is a blank square, never a green one.

**It is not part of the Telegram bot**, and from 13 September 2026 it does not
live beside it. It lived in `telegram-bot/` from phase 12 part 7 because the
VPS is the only machine in the architecture that is not Vercel, and a status
page hosted on the thing it monitors is useless during the outage it exists to
report. Living there got it mistaken for part of the bot: nobody had started
it, and the status page showed one green square in ninety days. It has its own
directory now, its own virtualenv, its own `.env`, its own lock and its own
log. It imports nothing from the bot. `setup.md` is the whole of getting it
running; this file is what it is.

## What it does

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
quarter is four rows a day and not 5,760, and a prolonged outage is one row
that grows. The probe decides whether a request worked and nothing else; what
that means is the database's business.

**Which posting `job_page` fetches is read from the live feed**, not
configured. A URL in a `.env` file pointing at a posting that is later deleted
would probe a 404 for ever afterwards and draw the portal as down. It re-picks
when the page it holds answers 404.

## Four things it does not do

All from section 15 of the specification, and none of them an oversight.

- **It never writes to the portal.** The four requests are public GETs and the
  row goes straight to Supabase. An endpoint on the portal would be unreachable
  in precisely the case worth recording.
- **It never alerts.** No message to anybody, no channel post, no mention in
  any bot command. Alerting needs an on-call story and a decision about who
  gets woken, and neither exists. What this delivers is a page somebody chooses
  to look at.
- **It buffers nothing.** When Supabase cannot be reached, or its gateway
  answers 502, 503 or 504, the cycle's rows are logged and dropped. A gap in
  the data is honest and the status page draws it as unknown; a row backfilled
  an hour late timestamped as though it were on time is not.
- **It is not a command.** Nothing about it is visible in Telegram.

The rows are swept at ninety days by the site's daily cron, per section 11.
An outage still open is never swept whatever its age.

## The files

| File | What it holds |
|---|---|
| `probe.py` | The process. Config, lock, the four requests, the one RPC, shutdown. |
| `lock.py` | One instance at a time, by an exclusive lock the kernel releases. A copy of the bot's. |
| `log.py` | Standard output for the pane, a rotating file for the morning after. A copy of the bot's, without the Telethon lines. |
| `run.sh` | Starts it in this directory's virtualenv, from anywhere. What the tmux window and the systemd unit both run. |
| `setup.md` | Getting it running on the VPS, and keeping it running across a reboot. |
| `.env.example` | The three variables, documented. Copy to `.env`. |
| `requirements.txt` | httpx, and nothing else. |

`lock.py` and `log.py` are copies of the bot's files and are meant to be. Two
processes on one machine that must not import each other is the arrangement;
a change to one is worth a look at the other, and the header of each says so.

## Running it

```bash
cd status-probe
./run.sh
```

Or `python probe.py` from inside the virtualenv. Its own tmux window or a
systemd unit, per `setup.md`. It uses the same four exit codes the bot does:

    0  a clean shutdown
    2  the environment is not usable, and every problem with it is listed
    3  another probe is already running, and its pid is named
    1  anything else, with the traceback in the log

**How to tell it is working.** `logs/probe.log` gains a line a minute, `wrote 4
checks, 0 failed, slowest 610ms`, and within a minute of the first one the
status page's ninety day bars show today as green. A line saying `could not
write 4 checks, dropping them` names why Supabase refused, and that minute is
drawn as unknown.

## What it needs

Python 3.11 or later and the three variables in `.env.example`. They are the
same three values the bot has, and the same names, so the two cannot drift
onto different databases or different sites.
