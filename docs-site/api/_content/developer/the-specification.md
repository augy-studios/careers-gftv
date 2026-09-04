---
title: The specification
access: developer
order: 2
summary: The brief the whole build answers to, where it lives, and what to do when it disagrees with the code.
---

# The specification

**`careers-gftv-spec.md` is the brief for the whole project.** It sits at the
repository root, it is committed, and it is the reference for every phase. It is
about seventeen hundred lines and the detail in it is load bearing.

The parts to slow down on are section 6, the schema, and section 5, the
authentication rules. Everything else depends on those two being right, and
reworking either later means touching every phase that came after it.

## What it covers

| Section | What is in it |
|---|---|
| 0, 0b, 0c | What to read first, the fifteen phases, and shipping in public. |
| 1, 2 | What is being built, the stack, and the repository conventions. |
| 3 | The design, including 3a, the multilingual rules. |
| 4 | The public site: the board, the posting page, the feed, and discovery. |
| 5 | Authentication, in seven lettered parts, including 5e on passkeys. |
| 6 | The database: every table, index, trigger and function. |
| 7 | The application flow, in nine lettered parts. |
| 8 | The staff dashboard, section by section, plus 8a on the manual. |
| 9 | The API design and its response envelope. |
| 10 to 15 | Settled decisions, maintenance, the webhook, offline, and the bot. |
| 16 | This documentation site, including 16h, the page list. |
| 17 | The deliverables. |

## The rule that matters most

**Where the specification and anything else disagree, ask.** The brief says so
in its seventh line, and it means what it says: do not quietly pick one.

That includes this guide, both READMEs, a comment in the code, and any file the
build produced. The specification is the reference; it is not always the most
recent thing anybody wrote.

> [!TIP]
> Prompt with options and a recommendation, and let the person who owns the
> project choose. That habit is what produced every deviation record in the
> working memo, which is the only reason those decisions can be read back.

## When the brief is amended

**It happens, and it is done deliberately.** Three examples from the build, each
with the date and the reason written into the brief itself:

- Section 7i said only an admin may mark a translation ready. Four interface
  strings promised a helper the same thing, and the routes allowed any staff
  member. The brief was amended, because a rule the interface contradicts is a
  rule nobody is following.
- Section 3a carried the Mandarin name of the portal. The name changed, so 3a
  changed with it. A rename the brief still contradicts is not a rename.
- Section 10 item 1 said no Supabase Storage and no uploads. One square avatar
  per account is the recorded exception, and it is written down in
  `main-site/AVATARS.md` where somebody reading about uploads will find it.

**Not every disagreement is amended.** Sometimes the behaviour was settled the
other way and nothing a reader sees is wrong. The conflict is then recorded in
the working memo and the brief is left alone. That is a judgement, and it is one to put to
the project owner and not to make alone.

## Reading it here

**The brief is reproduced on this site**, because this project owns the file and
nothing else holds it. It is rendered as pages under this section, one per top
level section of the file. They are generated from the file itself, so the two
cannot drift.

> [!NOTE]
> The generator is the second half of this part of the build and lands with the
> pages. Until it does, the file at the repository root is the only copy, and it
> is the one to read.

**Two files are deliberately not reproduced anywhere on this site.**
`gftv-theme.md` and `gftv-official.md` travel between GFTV repositories, so this
repository's copy of each is already a copy. See [the
theme](/staff/developer/the-theme) and [the official
banner](/staff/developer/the-official-banner) for what each one governs, and go
to the source for the text.
