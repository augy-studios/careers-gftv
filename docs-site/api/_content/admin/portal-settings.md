---
title: Portal settings
access: admin
order: 8
summary: The home page wording, the featured roles, the waiting period, and the applications toggle.
---

# Portal settings

**Settings** in the sidebar. Four things, and the last of them closes the board.

![The settings page](pending:admin-settings-desktop-light "The portal title, the home page wording, the featured roles, and the applications toggle.")

## The portal title

Shown in the header and used in page titles. It is written per language.

**Every language falls back to the default one when it is left empty.** So a
language you have not filled in is not blank on screen. It reads in the default
language.

## The home page wording

The heading and the line under it, per language, with the same fallback.

This is the first thing anybody reads. Say what the site is for.

## Featured roles

**Chosen roles appear first on the home page, in the order you set.**

- **With none chosen**, the home page shows the latest published roles instead.
  That is a reasonable default and not a fault.
- **Six is the most** that can be featured at once.
- **A featured role that stops being published is left out** of the home page
  and stays in the list. The page says so. Saving forgets it.

Only published roles can be added. A draft is not on the list to choose from.

## The waiting period before reapplying

How many days somebody waits before applying to the same role again. It is
ninety by default.

**Changing it does not move a waiting period somebody is already serving.** It
applies to the next person who applies.

**Zero switches the waiting period off entirely.** Dates already stored are
ignored and not cleared, so turning it back on restores them.

A single person can be let through early without touching this. That is
**Waive the waiting period**, on the tracking row.

## Taking applications

The one switch on this page that reaches every reader.

**Closed** disables every Apply control and refuses every apply endpoint, on
every role. Postings stay readable and nothing is deleted.

**Anybody part way through applying is turned away**, including from a tab they
already had open.

A change takes about a minute to reach somebody who already has a posting open.
That is normal and does not mean the change failed.

**The note is optional**, is kept in the audit log, and is never shown to
applicants.

> [!WARNING]
> This is a policy choice and it reads as one to an applicant. Something broken
> is switched off from [Maintenance](/staff/admin/maintenance-switches)
> instead, which says so in different words.

The difference matters to the person being turned away. One says we are not
taking applications at the moment. The other says something is broken here.
