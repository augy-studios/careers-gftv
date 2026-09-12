---
title: The maintenance switches
access: admin
order: 9
summary: Turning a shipped feature off during an outage, what readers are told, and what cannot be switched off.
---

# The maintenance switches

**Maintenance** in the sidebar. Turn a feature that has shipped off
temporarily, for an outage or while something is being fixed. It goes back on
the same way.

**This is not the applications toggle.** That one is a choice, and it lives on
[Portal settings](/staff/admin/portal-settings). A switch here says something
is broken.

## What a switch does

**It turns the feature off across the whole site**, for everybody, at once.

Where the feature has a control, the control is drawn disabled. Where it has a
route, the route refuses. A reader who presses one is told **Temporarily
unavailable while we fix something**.

**A banner appears across the top of every dashboard page** saying how many
features are off. A job poster sees that sentence too, so they know what an
applicant may be telling them. The page it is switched back on from is yours.

## Two rules worth knowing

**An override survives a deploy.** It is a database row and not a file, so
shipping new code does not turn anything back on.

**Nothing turns itself back on.** A feature left off is left off until somebody
comes back for it. There is no timer.

> [!WARNING]
> That is the failure to watch for. A switch flipped during an incident and
> forgotten is a feature nobody can use and nobody is investigating.

The list says who switched each one off and when.

## The note

**What should applicants be told?** is optional, and it is worth writing.

With no note, a reader gets the plain sentence. With one, they get yours. Say
what is happening and whether they need to do anything.

## What cannot be switched off

Some features have no switch, and the page says why beside each one instead of
leaving a gap.

**They are on that list for two different reasons.**

The first is that turning them off would remove the way back:

- Signing in, for applicants and for staff.
- Creating an account, and getting back into one.
- Recovery codes, passkeys, and trusted devices.
- The dashboard, and this page itself.

The second is that there is nothing here to switch. A switch that reaches
nothing is a control that lies.

- **The documentation site** is a separate deployment and reads no switch from
  here. That covers its sign in and its staff guides.
- **The `/admin/docs` link** is a redirect, and a redirect consults nothing.
- **The seed script** runs on a developer machine and is not part of the site.

A third reason has one entry. **English** is the default and the layer every
other language falls back to, so switching it off would leave nothing to fall
back to.

## The languages

**Every language but English is a switch on this page.** Chinese is on unless
you switch it off, like any other feature. Malay and Tamil are the other way
round: **off until somebody switches them on**, and the page says so under
each, with the reason. Their dictionaries are copies of the English until
somebody writes them. The switch goes on the day a translation is in and has
been checked.

While a language is off it is not on the language control, no posting is
shown in it, and the bot does not offer it. A reader who had chosen it reads
English, and their choice is kept for the day it comes back. Staff and helpers
can still write in it, which is how the translation gets done before the
switch goes on.

A held language is not counted as an outage. It is not in the banner and not
on `/status`, because nothing is broken. A language you switch off yourself
is, with your note, like anything else on this page.

## Only what has shipped

**A feature belonging to an unshipped phase is not on the list.** It is already
off, and offering to turn it off again would be noise.

That is also why the list grows when a phase ships.

## Turning one back on

The same switch. The feature comes back for everybody, the banner drops the
count, and the disabled controls go back to normal.

**Check the thing you switched off before you switch it on.** Nothing on this
page tests anything.
