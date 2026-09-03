---
title: Command reference
access: public
order: 3
summary: All nine commands, what each one returns, and why there is no help command.
---

# Command reference

Nine commands, and there is no `/help`. The `/start` message carries that
content, so the first thing you send is also the thing that explains the rest.

Typing anything else gets you one line pointing back at `/start`.

## Commands

| Command | What it returns |
|---|---|
| `/start` | What the bot is for, the command list, and buttons to the portal. |
| `/link` | Where to press the linking button, for somebody who found the bot first. |
| `/unlink` | Removes the link, behind a confirmation. |
| `/code` | A fresh sign in code for the linked account, with a copy button. |
| `/invites` | Your open invitations, with a button through to each role. |
| `/tasks` | How many things are waiting for you, and a link to them. |
| `/applications` | Your applications, and where each one stands. |
| `/jobs` | The newest openings, with a button through to each posting. |
| `/notify` | Choose which notifications arrive in the chat. |

## What each one returns

### /start

What Careers@GFTV is, and the whole command list. The list is split in two: the
commands that answer today, and any that are not built yet or are switched off
for the moment. Underneath are buttons to the portal and to support GFTV.

The same message handles the linking link from account settings. Tapping that
link sends a `/start` carrying a code, and the bot answers with the result of
the linking instead of the introduction.

### /link

For somebody who found the bot before the site. It says where the button is and
gives you a button that opens account settings. See [Linking your
account](/bot/linking).

If this Telegram account is already linked, it says so instead.

### /unlink

Asks you to confirm, with **Yes, unlink** and **Keep it linked**. Nothing
happens until you press one. See [Unlinking](/bot/unlinking).

A message can be forwarded, so the button checks who is pressing it. A tap from
anybody else is refused.

### /code

Sends a fresh six digit sign in code with a button that copies it. The code
works once and lasts five minutes.

Two things have to be true first. This Telegram account has to be linked, and
your account has to be set to ask for a code when it signs in. Without the
second, there is nowhere to type the code, so the bot says where the switch is
instead of sending one.

You can ask for twelve codes an hour. Past that it asks you to wait about half
an hour, and says that a two factor backup code works in the meantime.

### /invites

Your open invitations, up to five, each with a button that opens the posting.
Underneath is a button to your tasks page and a reminder that each invitation
is there too, with whatever the person who sent it wrote.

An invitation you have answered, or one the team has withdrawn, is not listed.
See [Job invitations](/bot/invitations).

### /tasks

A number and a button, never a list. A task can carry a set of questions that
has to be answered accurately. A chat window paraphrasing one would be the
worst of both.

The number counts what is on your [outstanding
tasks](/portal/outstanding-tasks) page, including any unanswered question about
whether you applied for a role.

### /applications

Up to five of your applications, each with the status word the portal uses, and
a button to the full list. Applications for closed and archived postings are
listed too, because you can always reread what you applied for.

The nine statuses are explained on [Your
applications](/portal/your-applications).

### /jobs

The five newest openings, each with a button to the posting, and a button to
the whole board. It ends with the same line every listing carries: roles at
GFTV are voluntary and unpaid unless the posting says otherwise.

**This one needs no account and no link.** The board is public, so somebody who
found the bot first can ask what is going.

It reads the same public feed the website builds its board from. The chat and
the board cannot disagree about what is live.

### /notify

Three switches, one per kind of notification, each showing the state it is in
now. See [Notifications](/bot/notifications).

## When a command will not answer

Two different sentences, and they mean different things.

**Will be available in Phase 5.** That command is not built yet. Careers@GFTV
is released in phases, in public, and the phase named is read from the [build
status page](https://careers.globalfurry.tv/status) instead of being written
into the message.

**Temporarily unavailable while we fix something.** That command works, and an
admin has switched the feature off for the moment. Sometimes there is a note
saying more. It comes back.

The two are never mixed up. Being told that something you used last week
arrives in a future phase would make a real outage look like an unbuilt
feature.

## Buttons stay working

Every button the bot draws keeps its meaning after a restart, and after a
month. What travels inside the button is an opaque id and nothing else. A button in a
forwarded message cannot be turned into an action on your account.

A button older than the record behind it says so:

> That button is too old to act on. Send the command again.
