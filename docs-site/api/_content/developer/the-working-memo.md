---
title: The working memo
access: developer
order: 3
summary: What next-steps.md is, why a gitignored file is a deliverable, and how to read a deviation.
---

# The working memo

**`next-steps.md` is the memo the build was run from.** It sits at the
repository root beside the specification, it is gitignored, and it is rewritten
at the start and the end of every phase.

If you have cloned this repository you will not find it. That is the point of
this page. The file dies with the last session unless it is captured. It is the
only record of why the build looks the way it does.

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

## Why it is gitignored and still a deliverable

**It is a working file and not part of the product**, which is why 0b says to
ignore it. Committing it would put a document rewritten several times a day into
every diff, and it would go stale between rewrites.

**But it is the record of how the phases actually went.** Losing it would leave
the code with no account of its own history. So it is published here, at
the end of the build, as a snapshot.

> [!NOTE]
> A snapshot, and not a live file. The page carrying it says so. What you read
> here is the memo as it stood when the build finished, and the working copy on
> the maintainer's machine moved on afterwards.

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

**The whole file is reproduced under this section**, generated from the file
itself, in the same way the specification is. Both are this project's own
documents, and nothing else holds either.

> [!WARNING]
> Do not treat the published copy as current. Check the date on the page. If the
> build is still running, the file at the repository root is ahead of it.

**What it is not is a changelog.** `/status` on the portal is the public record
of what shipped and when, and it is written for somebody using the site. The
memo is written for whoever is about to change it.
