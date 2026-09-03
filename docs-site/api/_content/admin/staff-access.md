---
title: Managing staff access
access: admin
order: 2
summary: Allowing somebody in, refusing them, and handing the decision back to their role.
---

# Managing staff access

**Staff access** in the sidebar. Who can open this dashboard, and the one thing
this site decides about them.

![The staff access list](pending:admin-staff-access-desktop-light "Every account that can come in, with its second factor and last sign in.")

The rule behind the list is [Who gets
access](/staff/admin/access-and-roles). This page is what you press.

## Reading the list

| Column | What it holds |
|---|---|
| Account | The username at gftv.asia, and their role here. |
| This portal | Can come in, or cannot, worked out for you. |
| Second factor | Passkeys, an authenticator app, backup codes, or password only. |
| Last signed in | When, and what they proved it with. |

**A refused account stays on the list.** This page is where somebody comes to
find out who has access, and "we took it away in March" is part of that answer.

**Not approved at gftv.asia** beside an account means step one refused them.
Nothing on this page will let them in. That is fixed at gftv.asia.

**Password only** in the second factor column is worth noticing. It is not an
error, and it is a thing worth asking somebody about.

## The three buttons

![One account's access](pending:admin-access-row-desktop-light "The three states on one row, with the reason field.")

**Allow** writes an override saying yes. They can open the dashboard on their
next visit, whatever their gftv.asia role says.

**Refuse** writes an override saying no. They lose the dashboard immediately,
including in a tab they already have open. Nothing they wrote is affected.

**Leave it to the role** deletes the override. Their gftv.asia role decides
again, including if it changes later.

**The dialog tells you what the change does today.** If their role already lets
them in, allowing changes nothing now and still matters later.

> [!WARNING]
> Refusing is immediate and it reaches open tabs. If you are refusing somebody
> during an incident, they will notice within seconds.

## The reason

**Refusing requires one.** The other two ask for it and accept nothing.

It is kept on the row and in the audit log, and it is never shown to the
person. Write it for whoever reads this list in a year, and say who asked.

## Giving somebody access who has no role

**Give somebody access** finds a gftv.asia account by username and writes an
override for it. This is how somebody with neither flag gets in.

**Accounts are created at gftv.asia, not here.** Somebody with no account there
cannot be added from this page, and no search will find them.

They come in as a **job poster**, because they hold no `is_admin`. Making
somebody an admin is a gftv.asia change.

## What this page will not do

**There is no button to reset somebody's password.** Deliberately. A staff
member sets their own with a recovery code and their second factor, which
changes their gftv.asia password too.

Somebody stuck with no codes is [When somebody cannot sign
in](/staff/admin/cannot-sign-in).

**You cannot take away your own access.** Your row is marked as you, and the
site refuses both Refuse and Leave it to the role on it. Another admin can do
it, which keeps the action possible and stops it being self inflicted.
