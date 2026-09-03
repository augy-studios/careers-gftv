---
title: Who gets access
access: admin
order: 1
summary: How is_approved, the override, is_admin and is_editor combine, and what each role opens here.
---

# Who gets access

Two questions look like one and are not.

1. **May this account open the dashboard at all?**
2. **Once inside, is it a job poster or an admin?**

The first is decided here, on [Staff access](/staff/admin/staff-access). The
second is decided at gftv.asia, and this site only reads it.

## The rule, in three steps

Every sign in runs these in this order. The first step that answers, answers.

1. **`is_approved` must be true.** An account that is not approved at gftv.asia
   is refused. Nothing here waives this.
2. **An override row decides, if there is one.** Staff access writes that row.
   It beats the role in both directions.
3. **Otherwise `is_admin` or `is_editor` decides.** Either flag opens the door.
   Neither flag keeps it shut.

> [!NOTE]
> An override is a row in this site's own database. The flags live at
> gftv.asia. That is why one can beat the other: they are two records.

**The override has three states, and the third is not a value.**

| State | What the row says |
|---|---|
| Allowed | Allowed here, whatever the role says |
| Refused | Refused here, whatever the role says |
| Left to the role | Decided by the gftv.asia role |

**Left to the role means there is no row.** Handing the decision back deletes
it. That matters a year later: the account follows its gftv.asia role again,
including if that role changes.

## The two roles

The pill at the top of the sidebar says which one an account holds.

| Role | What it opens |
|---|---|
| Admin | Opens everything here, and the admin and developer guides |
| Job poster | Opens postings and applications, and the job poster guide |

**`is_admin` is an admin. Anything else with access is a job poster.** That
covers `is_editor`, and it covers an account let in by an override with neither
flag set. Somebody granted access and then shown nothing would read the grant
as having failed.

## What each role opens on this site

These guides run on a second site with the same accounts and the same sign in.
Four tiers decide what a reader may open, and each one includes the ones above
it.

| Tier | Who reads it |
|---|---|
| public | Anybody, signed out included. |
| poster | Staff with access, and no `is_admin`. |
| admin | Staff with `is_admin`. |
| developer | The same accounts as admin. |

**There is no separate developer flag and none is to be invented.** Admins are
the developers of this project, so the last two tiers are the same people. The
tiers are kept apart because the pages are for different jobs.

**A reader is never told they are a "developer".** They are shown admin or job
poster, which is what their account actually says about them.

## What this site cannot change

- **Accounts.** They are created at gftv.asia.
- **Passwords.** Staff set their own. There is deliberately no button here to
  set somebody else's.
- **The admin and editor flags.** Read here, written there.

What it can change is the one override row. See [Managing staff
access](/staff/admin/staff-access).
