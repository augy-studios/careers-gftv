---
title: Linking your account
access: public
order: 2
summary: The QR code in account settings, the ten minute window, and why linking cannot start in the chat.
---

# Linking your account

Linking always starts on the portal, in
[account settings](/portal/account-settings), under **Telegram**. Press **Link
Telegram** and the panel shows you a QR code and a link.

**It has to start there and not in the chat.** That page already knows which
account is signed in, and a chat window does not. A bot that accepted a
username could be talked into linking your account to somebody else's
Telegram.

## From a computer

1. Open [account settings](https://careers.globalfurry.tv/account/settings) and
   find the **Telegram** panel.
2. Press **Link Telegram**.
3. Scan the QR code with the phone your Telegram is on.
4. Telegram opens the bot. Press **Start**, and the bot confirms.

The panel tells you how long the code has left. It works once and lasts ten
minutes.

## From the phone Telegram is on

Same panel, but there is nothing to scan. Press **Open Telegram** and the link
opens the app on that device. **Copy the link** is there for anywhere else you
want to paste it.

## What the bot says when it works

> Done. This Telegram account is now linked to Sam.

The name it uses is the display name on your portal account, or your username
when you have not set one. If it names somebody you do not recognise, see
[Troubleshooting](/bot/troubleshooting).

## If the code does not work

The bot answers with one sentence and no detail:

> That code did not work. Open account settings on the portal and ask for a new
> one, and it will be ready to use straight away.

That covers three cases at once. The code was already used, or it has expired,
or it was never one of ours. **They are deliberately indistinguishable.**
Telling somebody which of the three it was would tell anybody holding a
forwarded link whether it is worth trying again.

Press **Show a new code** in the panel. There is no limit on asking for
another.

## One account each way

A Telegram account links to one portal account, and a portal account links to
one Telegram account. Trying to link a second time gets you this:

> This Telegram account is already linked. Send /unlink first if you want to
> link it to a different portal account.

See [Unlinking](/bot/unlinking) before you do, because it changes how you sign
in.

## Starting from the bot instead

If you found the bot before the site, send it `/link`. It answers with what to
do and a button that opens account settings for you. It cannot do the linking
itself, for the reason at the top of this page.

## What you can turn on once it is linked

The Telegram panel gains three things the moment the link exists.

- **Send a test message.** It should arrive within half a minute, and it is the
  quickest way to prove the whole path works.
- **Ask for a code from Telegram when I sign in.** This is the second step. See
  [Signing in from Telegram](/bot/signing-in).
- **Unlink Telegram**, which is the same thing `/unlink` does in the chat.

> [!WARNING]
> The site asks you to generate your **two factor backup codes** before it lets
> you turn the second step on. They are the way back in if you lose Telegram.
> Turning it on without them is how an account is lost for good.

## Nothing is sent only to Telegram

Every invitation, every request from the team, and every update on an
application is on your account pages whatever happens in the chat. Linking adds
a way to hear about them sooner. It never becomes the only way.
