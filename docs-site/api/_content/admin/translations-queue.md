---
title: The translations queue
access: admin
order: 4
summary: Working a report from end to end: the four statuses, fixing the wording, and the note that closes it.
---

# The translations queue

**Translations** in the sidebar. What readers have told us reads wrongly, and
what nobody has translated yet.

The page has three tabs. This one is **Reported problems**. The other two are
[the needs translation audit](/staff/admin/needs-translation) and [the
helpers](/staff/admin/translation-helpers).

![The queue](pending:admin-translations-queue-desktop-light "The report list, filtered to one language.")

**The count in the sidebar is what is still open.** It comes off as soon as a
report is picked up, and not when it is finished.

## Where a report comes from

Two doors, one queue.

- **The report form** at the foot of a posting. Anybody can use it, with no
  account and no role.
- **Selected in place**, from a helper who highlighted the words and offered a
  replacement. See [Suggestions in
  place](/staff/admin/suggestions-in-place).

Filter by language, by what it is about, by where it came from, and by status.

## The four statuses

| Status | What it means |
|---|---|
| Open | Waiting for somebody. This is where a report arrives. |
| Being worked on | Somebody has picked it up. It stays in the queue. |
| Fixed | The wording has been changed. Needs a note. |
| Not a problem | The wording is right as it stands. Needs a note saying why. |

## Working one

**Open** gives you the report and the wording side by side.

**The words they selected** are shown as they were when the report was raised.
If those words are no longer in the text, the report says so and shows the
suggestion anyway. The wording has probably been changed since.

**What they suggested instead** is theirs, and it is never applied on its own.
Whatever is in the edit box is what gets saved.

**How it reads now** is the current wording in that language. If the language
has no translation of this yet, readers are seeing the original, and saving
starts one.

> [!NOTE]
> A translation you start here stays unpublished until somebody marks the
> language ready in the job editor. Saving the wording does not make it live.

**Use their wording** copies the suggestion into the box. Read it before you
save it.

**Save the wording** saves the wording and nothing else. It does not close the
report.

## Closing it out

**Answering the report** is the second half and it is a separate save.

Choose the status, and write what happened. **The person who raised it reads
exactly what you write**, on their own account page.

**A note is required to mark it fixed or not a problem.** Including when they
were mistaken. They took the trouble to tell us.

## The ones you cannot fix from here

**Interface wording lives in the code.** The navigation, the buttons, and every
label are in `assets/i18n`, which is what lets the site work offline. A report
about one of those shows its key and has no editor here, deliberately.

Fixing it means editing that file and deploying. Say so in the note.

**Some reports do not name a part.** Either the reader did not say which words
read wrongly, or it is a part that has to be edited with everything around it.
**Open in the editor** takes you to the posting with their note beside it.

## What this page is not

It is not where a translation gets written from scratch. That is the job editor
for a posting, and the helper area for somebody who holds the role.

It is not where a translation is made live. Marking a language ready is done in
the editor, on the posting.
