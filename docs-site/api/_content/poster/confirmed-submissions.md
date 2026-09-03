---
title: Turning on confirmed submissions
access: poster
order: 10
summary: The one time Apps Script setup per form, as a checklist, and what happens if you skip it.
---

# Turning on confirmed submissions

This is the fiddliest thing anybody here has to do. It takes about two minutes
per posting once you have done it once, and it is worth it.

## What it is

Without it, the site never learns that somebody submitted the form. It asks
them on their next visit, and takes their word for it. Plenty of people never
come back to answer.

With it set up, the form tells the site the moment it is submitted. An
application is recorded as a fact instead of a claim.

**Only three things are ever sent to us**: the response id, the email address
on the response, and the time. The answers stay in Google. Nothing anybody
wrote on the form reaches this site, and that is on purpose.

## If you skip it, nothing breaks

The posting falls back to the applicant's own yes or no answer, and its numbers
are marked as self reported. The conversion rate on the analytics page is then
the lowest the truth can be.

That is a working posting. It is just a posting you know less about.

## Do this once for the whole site

An admin sets up **one template form** with the script already inside it, and
sets `PORTAL_SECRET` on it.

Container bound scripts travel with a copy of a form. Triggers do not. That one
fact is the shape of everything below: the code comes across for free, and the
trigger has to be installed on every copy.

If no template form exists yet, ask an admin. Setting one up is in the
developer documentation.

## The four steps, per posting

Open the posting in the editor and expand **Set up confirmed submissions for
this form**. The dashboard's own four steps are quoted here, each with what it
means.

### 1. Copy the form

> Copy the template form, which already carries the script, and edit its
> questions.

In Google Forms, use **Make a copy** on the template. Then edit the questions
for this role.

Do not start a fresh form. A fresh form has no script in it, and pasting one in
is the step this arrangement exists to avoid.

Paste the copy's address into **Application form** on the posting and **save**.
The posting id you need next only exists once the posting has been saved.

### 2. Open its script properties

> In the copied form: Extensions, then Apps Script, then Project Settings, then
> Script Properties.

That is four clicks inside Google, on the copied form and not on the template.

### 3. Set the two properties

> Set JOB_ID to the posting id above. Check that PORTAL_SECRET came across with
> the copy.

The posting id is in the same help block in the editor, with a **Copy posting
id** button beside it.

`JOB_ID` is what tells us which posting a submission belongs to. `PORTAL_SECRET`
is what tells us the submission is genuinely from us. If the secret is missing,
nothing is sent and the only trace is in the script's own log.

### 4. Install the trigger and test it

> Run installCareersTrigger once and authorise it, then run testCareersWebhook
> to confirm it works.

Both are run from the Apps Script editor's own Run menu.

Google will warn that the script is unverified when you authorise it. It is
your own script on your own form.

`testCareersWebhook` sends a fake response id and an address that matches
nobody. A `200` in the execution log means the setup is right. The delivery
lands harmlessly in the unmatched list, which an admin clears.

## How to tell it is working

The first real application to that posting shows as **confirmed by the form
itself** on the analytics page, under where each yes came from.

Until then it says the applicant told us, or nothing at all.

## When somebody applies with a different address

The form was submitted with an email address no account uses, so it matches
nobody. Those go to an **unmatched submissions** list, which is admins only.

An admin links one to an account by hand, and that records the application as
submitted. If somebody tells you their application never registered, this is
usually why.
