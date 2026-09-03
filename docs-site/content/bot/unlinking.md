---
title: Unlinking
access: public
order: 7
summary: How to unlink from either end, and what it does to the second step at sign in.
---

# Unlinking

You can unlink from the chat or from the portal. Both do the same thing.

- **In Telegram**, send `/unlink`. It asks you to confirm, with **Yes, unlink**
  and **Keep it linked**.
- **On the portal**, open [account settings](/portal/account-settings), find
  **Telegram**, and press **Unlink Telegram**.

Your account and everything in it stays exactly as it is. This only stops us
sending you anything on Telegram.

## What changes

- **Invitations and updates go to your tasks page**, as they always did. See
  [Outstanding tasks](/portal/outstanding-tasks).
- **Anything queued and not yet sent is dropped.** There is no chat to send it
  to, and it is all on the portal anyway.
- **You can link the same Telegram account again whenever you like.**

## What it does to signing in

This is the part worth reading twice.

> [!WARNING]
> Unlinking turns off the code at sign in, and every device you have trusted
> has to answer the second step once more.

If the Telegram code was your only second step, signing in goes back to your
password alone. If you have a passkey as well, that is still your second step
and nothing about it changes.

Before you unlink, make sure you can still get in:

- Know your password.
- Have your **two factor backup codes** if you have a passkey, and your
  **account recovery codes** either way. See [Recovery
  codes](/portal/recovery-codes).

## Linking a different Telegram account

There is no swap. Unlink the current one first, then link the new one from
[account settings](/bot/linking). The bot says as much if you try it the other
way round:

> This Telegram account is already linked. Send /unlink first if you want to
> link it to a different portal account.

## If an admin unlinks you

An admin can remove the link from their side, which is what happens if a
Telegram account is linked to the wrong portal account. It is recorded against
your account, and you can link again straight away.

## If the confirmation button does nothing

Two possibilities.

The message was forwarded, or is not yours. A button checks who is pressing it
and answers **That button belongs to somebody else's conversation**.

Or the link had already gone, in which case it says so. Either way nothing on
your account has changed.
