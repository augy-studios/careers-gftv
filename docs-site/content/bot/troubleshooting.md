---
title: Troubleshooting
access: public
order: 8
summary: No message arrived, the code expired, the wrong account is linked, and what each sentence means.
---

# Troubleshooting

What the bot is telling you, and what to do about it.

## Nothing arrives

### The bot says nothing at all

Check you have pressed **Start** in the chat. Telegram will not deliver
anything from a bot you have never started, and nothing on our side can tell
the difference between that and silence.

Then send `/start`. If that answers, the bot is reachable and the problem is
the link or a switch.

### A test message never came

The test button is in [account settings](/portal/account-settings), under
**Telegram**. It should arrive within half a minute.

If it does not, the link is the first thing to check. The panel says whether
Telegram is linked, and to whom.

### An invitation arrived on the site but not in the chat

Check `/notify`. Invitations may be switched off there.

If they are on, the message may be waiting. Notifications go out in about
twenty seconds, and a failure is retried for about twenty minutes before it is
left alone.

Nothing is lost either way. Everything is on your [outstanding
tasks](/portal/outstanding-tasks) page.

### The bot answers "Temporarily unavailable while we fix something"

That part of the bot works and is switched off for the moment. It comes back.
The [build status page](https://careers.globalfurry.tv/status) lists what is
currently off.

### The bot names a phase instead of answering

> Will be available in Phase 5. Sorry for the inconvenience caused.

That command is not built yet. It is a plan and not a fault.

## Sign in codes

### The code did not arrive

Send `/code` and it issues another. Each one lasts five minutes and works once.

A two factor backup code from your **Sign in and security** page works in place
of it.

### The code has expired

Ask for another with `/code`. There is nothing to recover from an expired one.

### That is a lot of codes

> That is a lot of codes. Try again in about 30 minutes, or use one of your two
> factor backup codes to sign in.

Twelve codes an hour from one Telegram account, then a pause. Each one puts a
message on somebody's phone, so the limit is there to stop that being done to
you.

### The bot says this account does not ask for a code

> This account does not ask for a code when it signs in, so there is nowhere to
> type one.

The second step is switched off on your account. Turn it on in account
settings, under **Telegram**. See [Signing in from
Telegram](/bot/signing-in).

### The one tap link did not sign me in

It only works in the browser that asked for it. See [Signing in from
Telegram](/bot/signing-in), which has both messages the site can give you and
what each means.

Use the six digit code from the same message.

## The wrong account

### The bot named somebody who is not me

The linking code was used by the wrong person, or you scanned a code from
somebody else's screen. Send `/unlink`, then start again from your own
[account settings](/bot/linking).

If you cannot unlink, ask the team. An admin can remove a link from their side.

### It says this Telegram account is already linked

One Telegram account links to one portal account. Send `/unlink` first. See
[Unlinking](/bot/unlinking).

### The linking code did not work

> That code did not work. Open account settings on the portal and ask for a new
> one, and it will be ready to use straight away.

It was already used, or it expired, or it was not one of ours. The bot does not
say which, on purpose. Press **Show a new code** and use it within ten minutes.

## Lists and buttons

### A button says it is too old

> That button is too old to act on. Send the command again.

Send the command again and use the new buttons.

### A button says it belongs to somebody else

The message was forwarded to you, or you are pressing a button drawn for
another account. Nothing has happened.

### The bot says it cannot reach the portal

> We could not reach the portal just now, so there is nothing to show. Please
> try that again in a moment.

The bot and the site are on different machines. This means it could not ask,
and it never means the answer is zero. Your account is untouched.

### /invites shows nothing and I know I was invited

You may have answered it already, or the team may have withdrawn it. Both close
an invitation. The record stays on your tasks page either way.

## Still stuck

Ask in the GFTV Telegram group, or wherever you normally reach the team. There
is no support email, because there is no email on this site at all.
