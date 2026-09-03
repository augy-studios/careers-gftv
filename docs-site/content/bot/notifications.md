---
title: Notifications
access: public
order: 5
summary: The three kinds, the switches for each, and why sign in codes cannot be switched off.
---

# Notifications

Three kinds of message arrive in the chat, and each has its own switch. Send
`/notify` to see them:

- **Invitations to apply**, when somebody invites you to a role.
- **Things waiting for you**, when the team asks you something.
- **Updates on your applications**, when one of them moves.

Every one of them is on the portal as well. Turning a kind off here loses you
nothing; it only stops the chat message.

## Turning one off

Send `/notify`. You get three buttons, each showing the state it is in now, and
tapping one flips it. The message redraws itself, so what you see is always
what is stored.

The switch is read at the moment something is about to be sent, so a change
applies immediately.

Every notification carries a line at the foot pointing back at this:

> Send /notify to choose what arrives here.

## Sign in codes are not on the list

A sign in code is not a notification. It only ever goes out because somebody is
signing in to your account. That is precisely when you want to hear about it,
even at three in the morning.

**Silencing those is what an attacker would want.** So there is no switch, and
`/notify` says so instead of leaving you hunting for one.

The same message says what to do if it was not you:

> If you did not just try to sign in, somebody has your password. Do not enter
> this code, and change your password on the portal.

## When each one arrives

A sign in code is sent within a second or two, because somebody is sitting in
front of a login form waiting for it.

The other three are queued and go out in about twenty seconds. An invitation
that arrives twenty seconds after it was sent is indistinguishable from an
instant one. Queueing is what keeps a burst of them from being throttled.

If Telegram cannot be reached, the message is tried four more times over about
twenty minutes. After that it is left for an admin to see. It is never quietly
dropped.

## What a notification looks like

Each one names the role or the title, and stops there. The bot adds no summary
and no preview of what is being asked.

That is deliberate for the second kind especially. A request from the team can
ask anything, and the tasks page renders it properly. A chat window
paraphrasing something you have to answer accurately would be the worst of
both.

## A test message

The Telegram panel in account settings has **Send a test message**. It should
arrive within half a minute, and it is the quickest way to prove the path
works.

It is not one of the three kinds and no switch governs it. You pressed a button
a moment ago and are watching the chat for the result.

## When notifications are switched off site wide

An admin can pause the whole channel while something is fixed. Then nothing
goes out and **nothing is thrown away**. The queue is held, and everything in
it is sent once it is switched back on.

Sign in codes are not affected, for the reason above.

## If you unlink

Anything queued for you and not yet sent is dropped, because there is no longer
a chat to send it to. Nothing on your account changes, and it all stays on your
[outstanding tasks](/portal/outstanding-tasks) page. See
[Unlinking](/bot/unlinking).
