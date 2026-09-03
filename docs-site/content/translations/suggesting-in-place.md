---
title: Suggesting a correction in place
access: public
order: 6
summary: Turning the layer on, selecting the wording, and what the quiet underline means.
---

# Suggesting a correction in place

The helper area is not the only way in. On any page of the site, you can select
the wording that reads wrongly and suggest a replacement for that exact span.
You never leave the page.

You never have to know what a dictionary key is, or which table a posting field
lives in. The page works that out from what you selected.

## Turning it on

The switch is in your account menu, beside **Sign out**, and it reads **Suggest
corrections**.

**It is off by default**, and that is deliberate. A helper is a reader first,
and selecting text has to keep working normally for copying.

Nobody else sees the switch. If you do not hold the helper role, the layer does
not load at all, and the markup it reads is inert.

## Making a suggestion

1. Select the wording. Anywhere on the site.
2. A small **Suggest a correction** control appears. Press it, or press **Alt**
   and **S** with something selected.
3. Say what is wrong with it. That one is needed.
4. Offer what it should say, if you know. That one is not.
5. Send it.

The box tells you what it captured, and says plainly:

> Nothing is applied automatically. A person reads every suggestion first.

## Adjusting what you selected

Touch selection is imprecise. So the box shows the captured wording, with
controls to move the start and the end **one word at a time**.

Use them instead of trying to drag a perfect selection on a phone.

## On a phone

Below 1024px the box is a sheet from the bottom of the screen, and the wording
you selected stays visible above it. On a wide screen it opens in a panel
beside the text.

It is the same pattern the search filters and the apply panel use.

## The quiet underline

Wording somebody has already raised carries a quiet underline with a count
beside it.

That is what turns this from a suggestion box into a review pass. You can see
what has already been said and not say it again.

> 2 already raised about these words. Add another only if it is a different
> point.

Admins see the underlines too, and not the box. They are reading what helpers
have raised, and suggesting is done by whoever holds the role for that
language.

## By keyboard

Everything here is reachable without a pointer. Select with the keyboard and
press Alt and S. Underlined spans are focusable in reading order.

## Interface wording is a code change

If what you selected is a label or a button, the box says so. The suggestion is
still worth making, and it still goes into the same queue.

What happens to it afterwards is different, because that wording is in the code
and not in the database. See [What happens
next](/translations/what-happens-next).

## When a suggestion loses its place

A suggestion stores the exact wording you selected, plus a short run of text on
either side. That is how it can still be found after the surrounding text has
been edited.

When it cannot be found any more, an admin sees it marked as detached instead
of being applied to the wrong place. Nothing is guessed.

## One queue

A suggestion and a report from a posting land in the same list. An admin works
through one queue, whether the item came from a form or from a selection.
