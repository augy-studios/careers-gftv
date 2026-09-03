---
title: The overview
access: poster
order: 4
summary: The postings counts, the pipeline buckets, and the two panels that report on things nobody watches.
---

# The overview

The first page after signing in, at `/admin`. What has happened on the board
since you were last here.

![The dashboard overview](pending:poster-overview-desktop-light "The overview, with the postings counts, the pipeline, and the two health panels.")

## Postings

Four counts, and each one opens the postings list already filtered.

- **Published**, live on the board now.
- **Drafts**, written and not yet out.
- **Closing soon**, published and inside their last stretch.
- **No closing date**, published and open until somebody closes them.

Under them, when it applies, one line: so many drafts cannot be published yet,
because they have no application form. It links straight to those drafts. That
line is the most common reason a role never went out.

## Applicant pipeline

Every status, with a live count, plus **All**. Opening one goes to the tracking
page already filtered to it.

The nine statuses are explained on [Working through
applications](/staff/poster/working-through-applications).

Two short lists sit beside it: **Recent applications** and **New accounts**. A
deleted account or a deleted posting reads as such instead of disappearing.

## Daily maintenance

A scheduled pass runs once a day. It closes postings past their closing date,
checks every application form, gives up on unanswered apply prompts, and clears
expired rows.

**Nobody is watching it run**, so this panel is where it reports. What it can
say:

- **Everything completed**, with when.
- **Last run some hours ago**, which means a daily schedule has missed one.
- **Finished with errors**, or started and never finished.
- **Switched off**, so the run did nothing. While it is off, postings past
  their closing date stay open.
- **No run recorded yet.** If the site has been live for more than a day, the
  schedule is not firing.

When a form check fails, the postings it flagged are named here. **Form not
accepting responses** and **Form missing** are the two. Both mean somebody
clicking Apply on that role reaches a dead end.

Fixing one is [Connecting the Google
Form](/staff/poster/the-application-form).

## Telegram notifications

The bot runs on its own server and not on this site. A queue that stops moving
is how you find out it has stopped running.

The panel says how many went out in the last day, how many are waiting, and how
many were given up on. Anything waiting since a while ago means the bot is
probably not running. Tell an admin.

Nothing is lost while it is stopped. The queue is held and goes out when it
starts again.

## The banner across the top

If any feature is switched off across the site, a line at the top of every
dashboard page says how many. It explains what an applicant may be telling you.

Switching one back on is an admin's. See [What you will see
disabled](/staff/poster/what-is-disabled).

## Nothing here works offline

The dashboard needs a connection and says so plainly when it has none.
Management data goes out of date quickly, and acting on an old copy of it would
be worse than waiting.

The public side of the site is different. It works offline for applicants.
