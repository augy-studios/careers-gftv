---
title: Suggestions in place
access: admin
order: 7
summary: The annotation layer: who writes to it, how it shares the queue, and what a detached anchor means.
---

# Suggestions in place

A helper reading any page can select the words that read wrongly and suggest a
replacement for that exact span. They never leave the page.

**It lands in the same queue as the report form.** One queue, two doors. See
[The translations queue](/staff/admin/translations-queue).

![The layer switched on](pending:admin-suggestions-desktop-light "A page with suggestions underlined where they were raised.")

## What you see, and what you can do

**Show suggestions** sits in the navigation beside Sign out, on the public side
of the site. Turning it on underlines the wording somebody has already raised,
on the page you are reading.

**Staff read the layer and do not write to it.** The underlines are what it
gives you, so you can see what has been raised while you read.

**Suggesting is a helper's act.** An admin who wants to suggest instead of edit
grants the helper role to their own applicant account. That is the model and
not a workaround.

The reason is dull and worth knowing. A suggestion is recorded against an
applicant account, so a staff account cannot be the one who raised it.

## Reading one in the queue

A report from this door reads **Selected in place** in the Came from column.
It carries three things a form report does not:

- **The exact words** they selected.
- **The text either side of them**, which is how the words are found again
  after the page has changed.
- **The replacement** they typed, if they typed one.

## A detached anchor

**These words are no longer in the text this points at.** That is the message,
and it means the wording has probably been changed since the suggestion was
raised.

The suggestion is still shown, and it is still worth reading. What cannot be
done is showing it in place.

**Two ordinary things cause it.** The text was edited after the suggestion was
made, or the selection crossed something that only exists on screen. A posting
body is markdown. A span crossing bold text or a bullet marker exists in the
rendered page and not in the stored field.

> [!NOTE]
> Detached is the honest answer and not a fault. The alternative would be
> loosening the match until it found something, which is how a suggestion gets
> applied to the wrong sentence.

## What is not underlined

**Interface wording.** The layer asks about the posting it is on, which is one
row. Doing the same for every label on the page would mean asking about
everything the page happened to render.

An interface string can still be reported. It arrives with its key and is fixed
in the code.

## Switching it off

`translation_annotations` is on the [maintenance
switches](/staff/admin/maintenance-switches) page. Turning it off stops the
layer across the site and leaves every suggestion already raised in the queue.
