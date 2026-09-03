---
title: Applicant accounts
access: admin
order: 3
summary: The person behind an application: their details, suspending sign in, the assisted actions, and deletion.
---

# Applicant accounts

**Applicant accounts** in the sidebar. The accounts themselves, and everything
about them is an admin's.

**This is not the tracking page.** Where an application has got to is
[Applicant tracking](/staff/poster/working-through-applications). This is the
person behind it.

## Finding somebody

Search by name, username, or email address. It searches every page and not the
rows on screen.

**More than 200 matches are cut to 200**, and an export with that filter
carries the same 200. Narrow it with a role or a date range.

Each row says whether the account is **Active** or **Suspended**, when they
joined, and how many applications they have submitted.

## One account in detail

![An applicant account](pending:admin-applicant-account-desktop-light "One account, with its applications, its history, and the actions panel.")

**Open** gives you the whole account:

- **Applications**, with what each one is doing now.
- **Invited to**, the roles somebody has been invited or shortlisted for.
- **The last things that happened to this account**, each one marked as done by
  staff or by the account holder.
- **Telegram**, if they have linked it. The ID is the account. The @name is
  changed by its owner, so it is not proof of anything.

## Editing their details

**Edit their details** covers five fields: username, email address, display
name, phone number, and the language this site and the bot write to them in.

**Two of those five sign them out everywhere.** The username and the email
address are what they sign in with, so changing either ends every session. The
other three do not.

**The language is their own setting.** Change it only if they have asked.

A reason is required, and it goes in the audit log.

## Suspending sign in

**Suspend sign in** stops somebody signing in and keeps everything else. Their
applications, saved roles, and history are all kept. It reaches a tab they
already have open.

It is reversible from the same panel with **Allow sign in again**.

This is the answer to almost every "we need to stop this account" question.
Deletion is not.

## Somebody locked out

Three actions live under **Somebody locked out**, and two of them are the ones
to prefer.

**Require a new password.** They are asked to choose one at their next sign in,
and cannot use the account area until they do. Every session and trusted device
ends. Nobody learns their password, so the record still shows they chose it.

**Unlink Telegram.** This is how somebody gets back in when they have lost the
account they were signing in with.

> [!WARNING]
> Check who you are speaking to some other way first. Unlinking on the word of
> whoever is in the chat window is how the wrong person gets an account.

**Set their password** is in the danger zone and is the last resort. It
generates a sixteen character password, hides it on screen, and shows it once.

**Its cost is the record and not the password.** Once you know somebody's
password, the log can no longer show whether they did a thing or you did.
Requiring a new password does the same job without that cost.

Every one of these three requires a reason.

## Deleting an account

**Delete permanently** is at the foot of the danger zone, and it asks for
**your own password** and not for their username. Typing a username proves you
can read the row. A password proves who you are.

What goes:

- Their applications, saved roles, tasks, ratings, passkeys, and codes.

What stays:

- The funnel numbers and any translation reports, with no name attached.
- Anything they submitted through a Google Form. That is not ours to delete.

> [!DANGER]
> This cannot be undone. Suspending sign in keeps everything and is almost
> always the right answer instead.
