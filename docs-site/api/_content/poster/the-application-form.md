---
title: Connecting the Google Form
access: poster
order: 9
summary: Making the form, the long address, the prefill map and its entry ids, and the response sheet.
---

# Connecting the Google Form

**The application itself is a Google Form.** This site does not collect
applications. It hands somebody over to a form and records that it did.

A posting cannot be published without one.

![The form fields on the editor](pending:poster-form-fields-desktop-light "The application form, response sheet, and prefill fields.")

## Make the form first

Copy the template form. That is worth doing even if you never turn on
confirmed submissions, because the template already carries the script for it.

Two settings on the form matter to us:

1. **Collect email addresses**, turned on. Failing that, a question titled
   exactly `Email`.
2. **Accepting responses**, left on. A form that has stopped accepting them is
   a dead end, and the overnight check flags it.

Without an email address anywhere on the form, a submission can never be
matched to the account that made it.

## Paste the long address, not the short one

**Application form** takes the form's address. Use the long one from the
address bar, which looks like this:

```text
https://docs.google.com/forms/d/e/FORM_ID/viewform
```

Not `forms.gle/abc123`. A short link works for a human and silently drops
everything the prefill map adds. The editor refuses a short link where prefill
is concerned, and the code checks again when somebody applies.

## The prefill map

Optional, and worth the ten minutes. It fills the applicant's own details into
the form so they type them once instead of twice.

It is written as a small piece of JSON:

```json
{
  "entry.1234567890": "email",
  "entry.9876543210": "display_name"
}
```

**The key** is the form question's entry id. **The value** is one of exactly
four things this site will fill in:

| Value | What it fills in |
|---|---|
| `email` | The email address on their account |
| `display_name` | Their display name |
| `username` | Their username |
| `phone` | Their phone number, if they gave one |

Anything else in the value is ignored. That is deliberate: the map names what
may be filled in, so a mistyped field name fills nothing instead of leaking
something.

### Finding an entry id

In the form, use **Get pre-filled link**, answer the questions with anything,
and press through to get a link. The link contains `entry.1234567890=whatever`
for each question. Those numbers are the ids.

### Two things to know about prefill

- **The applicant can edit anything you filled in.** So an email address in a
  response is what they typed, and is not proof of who they are.
- **A field they have not set fills in nothing**, and the form opens with that
  question blank. Phone numbers are optional, so this is normal.

If the map names nothing usable, the plain form opens. Nothing breaks.

## The response sheet

**Response sheet** is the Google Sheet the form writes into. It is staff only
and never appears in anything a reader sees.

Fill it in. It is the link from a row on the tracking page to what that person
actually wrote. Without it, somebody has to go hunting in Drive.

## What happens when somebody applies

1. They press **Apply** on the posting.
2. The site records that the handover happened, and opens the form in a new
   tab, prefilled.
3. They fill the form in and submit it, to Google.
4. **The site is not told**, unless confirmed submissions are set up. On their
   next visit it asks whether they applied.

Step 4 is the one worth fixing. See [Turning on confirmed
submissions](/staff/poster/confirmed-submissions).

## When a form goes wrong

The overnight pass checks every published posting's form and reports on the
overview. Two things it can say:

- **Form not accepting responses.** Somebody closed it in Google.
- **Form missing.** Deleted, or its sharing changed.

Either way, everybody clicking Apply on that role is reaching a dead end. Fix
the form or unpublish the posting.

Do not swap in a new form and leave the posting published with a broken one.
The analytics page flags a high click count with few applications, and that is
usually this.
