---
title: Signing in from Telegram
access: public
order: 4
summary: The six digit code, the one tap link, and why the link only works in one browser.
---

# Signing in from Telegram

Once Telegram is linked, you can turn on a second step at sign in. Your
password is still asked for every time. The second step comes after it.

Turn it on in [account settings](/portal/account-settings), under **Telegram**,
with **Ask for a code from Telegram when I sign in**.

> [!WARNING]
> Generate your **two factor backup codes** first. The site insists on it. If
> you lose Telegram, one of those codes is what gets you past this step.

## The six digit code

Type your password, and the bot sends you a message with the code in it. The
digits sit on their own line, and there is a **Copy the code** button under
them.

It works once and lasts five minutes. Type it on the sign in page.

If it does not arrive, send `/code` to the bot and it issues another. A two
factor backup code works in place of any of this.

## The one tap link

The same message can carry a **Sign in** button. Press it and you are signed in
with nothing to type.

**It only works in the browser that asked for it.**

When you type your password, the site leaves a marker in that browser and
remembers a fingerprint of it. The button carries a link that matches only that
marker. Opening it anywhere else matches nothing, so nothing happens.

The site tells you plainly when that is what went wrong:

> That link only works in the browser that asked for it. Sign in here and use
> the six digit code instead.

Or, when the link had already been opened somewhere else:

> That link belongs to a different browser, so it has been cancelled. Sign in
> here and use the six digit code instead.

**This is deliberate.** Without it, a forwarded message would be a password
sitting in somebody else's chat history.

### The link is not always there

A code you asked for with `/code` never carries a **Sign in** button, and that
is on purpose. That code came from a chat and not from a browser, so there is
no browser to bind a link to. A one tap link with nothing behind it would be a
credential for anybody who saw the message.

### What the link does, exactly

- It signs you in fully, and takes you to your account page.
- It respects **Stay signed in for 30 days** if you ticked it one screen
  earlier.
- It is spent the moment it works. Pressing it again does nothing.
- It never trusts the device. Trusting a browser is a decision you make on the
  sign in page, and tapping a link in a chat is not that decision.

## If neither reaches you

- **A two factor backup code** works in place of the code and the link. Those
  are the ten codes from your **Sign in and security** page.
- **A passkey**, if you have one, is a second step on its own. The site accepts
  either.
- With none of them, see [Recovery codes](/portal/recovery-codes) for what is
  left.

## When one tap sign in is switched off

Sometimes an admin switches the whole second factor off while something is
fixed. Then:

- The one tap link stops working, and the sign in page says so.
- No new codes are sent.
- An account that already asks for a code is **still asked**. Letting it
  through on one step would be worse, and refusing would lock you out of a
  password you typed correctly. A two factor backup code is the way past it.

## Turning it off again

The same switch in account settings turns it off. Unlinking Telegram turns it
off too.

Either way, every device you have trusted has to answer the second step once
more. Changing how signing in works is exactly when old trust should stop
counting.
