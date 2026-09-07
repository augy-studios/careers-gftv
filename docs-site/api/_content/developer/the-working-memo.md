---
title: The working memo
access: developer
order: 3
summary: What next-steps.md is, why a working file is a deliverable, and how to read a deviation.
---

# The working memo

**`reference/next-steps.md` is the memo the build was run from.** It sits beside
the specification, and it is rewritten at the start and the end of every phase.
It has been in the repository since 7 September 2026.

If you have cloned this repository you have it. That was not true for the first
fourteen phases, and this page is where the change is recorded. The file was
gitignored until part 10e, so it died with the last session unless something
captured it. It is the only record of why the build looks the way it does.

## What is in it

Section 0b of the specification asks for four parts, and the file grew into
eight sections around them.

| Section | What it holds |
|---|---|
| Done so far | Every shipped phase, condensed, with what each one produced. |
| This phase | The current phase, part by part, with what each part landed. |
| Rules that are load bearing | The things that cause a defect when broken. |
| Deviations | Every place the build departed from the brief, numbered, with the reason. |
| Carried forward | Open items that outlive the phase they were found in. |
| Inherited by later phases | Work handed to a phase that has not started. |
| Decisions settled | So they are not reopened. |
| Open items | Known, and not blocking. |

**The deviations are the part worth reading first.** There are over a hundred and
thirty of them, numbered, each naming what the brief said, what was built, and
why. A deviation is not a mistake: it is a decision that departed from the plan
and was written down instead of being forgotten.

## Why it was ignored, and why it is committed now

**It is a working file and not part of the product**, which is why 0b says to
ignore it. Committing it puts a document rewritten several times a day into the
history, and every one of those rewrites is a diff nobody will read.

**But it is the record of how the phases actually went**, and that argument won
on 7 September 2026. Losing it would leave the code with no account of its own
history. The ignore rule had also produced one concrete failure already: twenty
one specification pages were committed, generated from a file no clone held.

> [!NOTE]
> The pages under this section are still a snapshot, and not the live file.
> What you read there is the memo as it stood on the day it was captured, and
> the working copy moved on afterwards.

## How the handover works

Each phase closes by folding the memo forward, and the shape is worth knowing
because it is what keeps the file from growing without bound.

1. **This phase** is condensed into **Done so far**, keeping what a later reader
   needs and dropping the working notes.
2. **Inherited by later phases** gives up its items to the new **This phase**.
3. The preamble at the top is rewritten to say where the build stands.
4. `build-status.json` flips the shipped phase, per
   [phases and build status](/staff/developer/phases-and-build-status).
5. Every README the phase invalidated is updated in the same change.

**A part is committed on its own**, with a message naming the phase and the
part. The memo records the commit hash beside the part it belongs to. That
is what makes it possible to read the memo and the git log together a year
later.

## Reading it here

**The whole file is reproduced as [the working memo](/staff/memo)**, nine pages
written by `node gen-memo-pages.js` from the file itself. The specification is
published the same way. Both are this project's own documents, and nothing else
holds either.

> [!WARNING]
> Do not treat the published copy as current. Check the date on the page. If the
> build is still running, `reference/next-steps.md` is ahead of it.

**What it is not is a changelog.** `/status` on the portal is the public record
of what shipped and when, and it is written for somebody using the site. The
memo is written for whoever is about to change it.
