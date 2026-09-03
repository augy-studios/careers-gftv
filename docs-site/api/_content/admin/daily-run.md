---
title: The daily run
access: admin
order: 11
summary: Reading the scheduled pass on the overview, and what to do about each thing it can say.
---

# The daily run

**Daily maintenance** on the overview. A scheduled pass runs once a day and
reports here, because nobody is watching it run.

What it does is on [The overview](/staff/poster/overview), which a job poster
reads too. What to do about it is here.

## What it can say, and what to do

| It says | What to do |
|---|---|
| Everything completed | Nothing. |
| Last run some hours ago | Read below. A daily schedule has missed one. |
| Finished with errors | Read below, and check the deployment logs. |
| Started and never finished | The same. It was probably stopped part way. |
| Switched off | Turn the `cron` switch back on when the reason has passed. |
| No run recorded yet | If the site has been live over a day, the schedule is not firing. |
| Could not be read | The query failed. This is not a claim about the run. |

**Switched off is a decision somebody made.** The `cron` key is on the
[maintenance switches](/staff/admin/maintenance-switches) page. While it is
off, postings past their closing date stay open, and nothing sweeps expired
rows.

**Not firing is the one to escalate.** The schedule is Vercel's and not
something this dashboard controls. It is in the developer documentation, and it
is a code change and not a setting.

> [!NOTE]
> The run fires within roughly an hour of its stated time. A few hours late is
> a schedule working. A day late is not.

## What a completed run reports

Four counts, and each is the number of things that changed on that run:

- **Postings closed** for passing their closing date.
- **Unanswered apply prompts given up on.**
- **Expired rows deleted.**
- **Application forms checked**, and how many are not usable right now.

**A count of zero is not printed as news.** The run names what changed.

## When a form check flags a posting

The flagged postings are named on the panel, with one of two states.

**Form not accepting responses.** The form loaded and is closed to answers.

**Form missing.** The form is gone.

**Both mean somebody pressing Apply on that role reaches a dead end.** Fixing
one is [A broken application form](/staff/admin/a-broken-form).

## The Telegram queue

**Telegram notifications** sits beside the daily run and is a different thing
entirely. The bot runs on its own server and not on this site.

- **Sent in the last day**, which is the healthy line.
- **Waiting, the oldest since some time ago.** The bot is probably not running.
- **Given up on.** Delivery failed enough times to stop trying.

**Nothing is lost while the bot is stopped.** The queue is held and goes out
when it starts again. What is lost is the timing, so somebody asked a question
today hears about it late.

**Notifications skipped** are the applicants with no Telegram link. That is
their own choice and not a fault.

Restarting the bot is a job on its server. It is in the developer
documentation, and it is not something this dashboard can do.
