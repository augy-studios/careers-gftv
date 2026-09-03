---
title: A broken application form
access: admin
order: 12
summary: What to do when a published role's Google Form is closed, deleted, or replaced.
---

# A broken application form

A published posting whose form is closed or gone is the worst state on this
site. The role looks open, people press Apply, and every one of them reaches a
dead end.

The poster's half is [Connecting the Google
Form](/staff/poster/the-application-form). This page is what to do when it has
already gone wrong.

## How you find out

**The overnight pass.** It checks every published posting's form and names the
ones it could not use. See [The daily run](/staff/admin/daily-run).

**The analytics page**, in the shape of a high click count with almost no
applications. A conversion rate falling to nothing on one role is usually a
form and not a posting.

**Somebody tells you.** This is the common one, and it is why the maintenance
banner and the tasks page matter.

## Stop the bleeding first

**Unpublish the posting.** One control, immediate, and it takes the role off
the board while you work out what happened.

Unpublishing keeps everything: the posting, its applications, and its numbers.
See [The posting lifecycle](/staff/poster/the-posting-lifecycle).

> [!WARNING]
> Do not leave a published posting pointing at a broken form while you sort the
> form out. Every click in the meantime is somebody who thinks they applied.

## Then work out which it is

**Form not accepting responses.** Somebody closed it in Google. Reopening it in
Google fixes the posting with no change here.

**Form missing.** It was deleted, or its sharing changed so that the site
cannot see it. Check the sharing first, because it is the recoverable one.

**A deleted form is gone**, and so is the response sheet behind it. The
applications already submitted through it are Google's data and this site never
held them.

## Putting a new form behind the role

If the form has to be replaced, three things move together.

1. **The form address**, which is the long prefilled one and never a short
   link.
2. **The prefill entry ids**, for email and name. A new form has new ids.
3. **The response sheet address**, which is what the tracking rows link out to.

**Confirmed submissions have to be set up again.** The script carries the
posting id, and a new form carries no script at all. See [Turning on confirmed
submissions](/staff/poster/confirmed-submissions).

**The posting id does not change**, so the value the script needs is the same
one it always was.

## What to do about the people already handed over

**Their tracking rows stay**, and so does the record that they were handed over
to a form.

Anybody who submitted the old form before it broke has their answers in the old
response sheet, if it still exists. Their status is whatever it was.

**Nobody is told automatically.** If you want to reach the people who started
and could not finish, raise a request against those rows. See [Asking for more
information](/staff/poster/asking-for-more-information).

**Do not delete the tracking rows.** They are the record of what happened, and
deleting them takes the waiting period with them.
