---
title: The needs translation audit
access: admin
order: 5
summary: What nobody has translated yet, its three states, and how to read a thin translation.
---

# The needs translation audit

**Needs translation** is the second tab on the Translations page. It is what
nobody has translated yet, whether or not anybody has complained.

[The queue](/staff/admin/translations-queue) is complaints. This is silence.

![The audit](pending:admin-needs-translation-desktop-light "The audit list, with the three states and what is missing on each row.")

## The three states

| State | What it means |
|---|---|
| Not started | Nothing exists in this language at all. |
| Drafted | Somebody has written one and it is not marked ready. |
| Parts missing | It is live, and thinner than the original. |

**A finished translation is not on this list.** The list is what is left, so an
empty one is the answer you want.

Filter by language and by state. Every posting, team, and tag is in scope.

## Reading a thin translation

**Parts missing** is the state worth understanding, because those readers are
being served right now.

The **What is missing** column names the fields the translation leaves empty
while the original fills them. A summary, a description, or extra sections.

**Live and thin is not the same as broken.** A posting cannot be marked ready
without a title, a summary, and a description, so the required three are there.
What is missing is everything beyond them.

**Extra sections are the usual answer.** A translation may carry a different
number of them from the original, on purpose, and the audit still counts the
gap. See [Extra sections](/staff/poster/sections).

> [!NOTE]
> Being thin is a judgement, not a fault. A translation that leaves out a
> section the writer thought unnecessary is a decision somebody made.

## What to do with a row

**Open the list** takes you to what needs writing.

Three ways it gets written:

- **You write it**, in the job editor's language tabs.
- **A helper writes it**, if somebody holds the role for that language. See
  [Translation helpers](/staff/admin/translation-helpers).
- **Nobody writes it**, and the reader sees the original. That is the current
  behaviour and it is not an error.

**Marking a language ready is staff's.** A helper drafts everything and makes
nothing live. See [Translation helpers](/staff/admin/translation-helpers).

## When the tab says there is nothing to audit

**This site has one language, so there is nothing to audit.** That message
means the site is running with a single locale. Adding a second one to
`gftvjobs_locales` is what fills this in.
