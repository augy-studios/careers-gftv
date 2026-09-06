---
title: 8. Admin dashboard (/admin)
access: developer
order: 11
summary: Match the gftv.asia link shortener admin layout.
---

# 8. Admin dashboard (`/admin`)

Match the gftv.asia link shortener admin layout. Same sidebar, header, card and table patterns, and the same empty and loading states. Reuse those components instead of designing new ones.

Sections:

1. **Overview**: counts of published jobs, open applications by status, recent applications, recent registrations. Simple stat cards plus a recent activity table. Present the applicant pipeline as bucket tabs with live counts. Those are All, Started, Submitted, Under review, Shortlisted, Interview, Offered, Rejected and Withdrawn. An admin can then jump straight into any bucket. Carry the same bucket tabs into the applicant tracking page.
2. **Job postings**: list with search, status filter, and sorting. Create, edit, duplicate, publish, unpublish, close, archive.

   **A posting is never deleted as part of taking it down.** Closing keeps it public and read only. Archiving takes it off the board, while it still resolves at its uuid for anybody with history, per 7g. Both keep every row attached to it. That is the whole mechanism for a role that has been filled, withdrawn, or was a mistake nobody applied to.

   **Permanent deletion exists, is admins only, and goes through the three step confirmation in 7g.** A job poster cannot reach it at all. The control is absent for them and never merely disabled, because it is not a feature awaiting a phase. The panel at step 1 names exactly what goes with the posting, counted from the database and never described in the abstract. The cascades in migrations `005` to `008` take the applications, the analytics rows, the ratings, and the saved rows with it. Deleting a posting somebody applied to destroys funnel history 8.4 depends on, and is almost never the right answer. Archiving is.

   The editor itself needs to be rich enough for description, responsibilities, and requirements. It carries fields for the Google Form URL, the optional prefill entry ID mapping, and the optional response sheet link. Validate that the form URL is a real Google Forms address, and refuse to publish a job without one. Add a tag picker with type-ahead, and require at least one tag before publishing. The closing date field has a "no closing date" toggle that clears it to null. An admin then cannot leave it empty by accident, and cannot be blocked by a required date validator. Show open ended postings distinctly in the admin list, so they are easy to audit: nothing will ever close them automatically. The slug is auto-generated from the title, with a manual override and a uniqueness check.

   **Editing in every language.** The editor is tabbed, one tab per active language. The list is read from `gftvjobs_locales` and never hardcoded, so a language added later appears without touching the editor. The default language's tab edits the posting itself, and every other tab edits that language's translation row.

   Each tab shows the source language's wording beside the field being written, so a translator is never working from memory. Below 1024px that reference collapses to a disclosure above each field, in place of a second column.

   A tab shows at a glance whether that language is complete, in progress, or absent. The same state shows in the postings list, so a half finished translation is visible without opening it. Publishing needs only the default language. A posting may go out untranslated, and reads with the notice from 3a. What the database refuses is a translation marked ready without a title, summary, and description. Surface that as inline validation, instead of letting the save fail on a constraint.

   **Sections.** Beyond the fixed fields, an admin can add named sections to a posting and reorder them. Headings are content and translate with everything else. A translation may carry a different number of sections from the base row. A translator who merges two has not done anything wrong, so do not enforce a matching count.

   The slug is shared and is not translated.

   **Embed description.** An optional short line per posting, in both languages, used when the link is unfurled in Discord or Telegram. Show a live preview of what the unfurl will look like. When the field is left empty, show the fallback, which is the first sentence of the description. State in the help text that embeds are always served in English, per section 4. Then an admin does not write a Chinese line expecting it to appear.
3. **Applicant tracking**: list with filters by job, status, and date range. This tracks who was handed over to which form, and never the answers themselves. Make that clear in the UI copy. The detail view shows the applicant profile, which job, when they started, and their current status. Change status with an optional note, which writes an event row. Waive an active reapply cooldown on a row, per 7f. Raise an outstanding task on the applicant from here, choosing a type and writing the message. Then read their reply and resolve it.

An `info_request` may carry a set of questions as well as the message, per 7g. The composer adds them one at a time, choosing short answer, long answer, choice, or checkbox. For each it writes the label, marks it required or not, and lists the options for the two list types. It has a tab per language, like the job editor and read from the same `gftvjobs_locales`. It shows at a glance which languages a question is still missing. Questions can be added, edited, reordered, and deleted freely here and nowhere else. **Once sent, the set is frozen**, and the composer says so before the send and not after.

The same composer chooses who the set goes to:

- **These applicants**, ticked from the filtered tracking list. Sending to more than one shows exactly who will receive it first, per the same rule 8.5 applies to bulk invites. This reaches real people, and each task is frozen the moment it is written.
- **This posting, from now on**, which stores the set on the posting. It raises a task automatically for everyone who applies after that. The posting list should show which roles carry a set. It is a thing an applicant is asked, and it is not visible on the posting itself. Editing it changes only what the next applicant is asked, and tasks already raised keep the set they were sent with.

Answers come back on the tracking row beside the question each one answers, and never as a bare list of values. An admin reading it a month later does not have to work out what was asked. An answer is shown with the label in the admin's own language, resolved from the option value.

**Accepting and rejecting.** A job poster moves a row to `accepted` or `rejected` from the same status control as every other step, with the optional note. Both write an event row like any other change. Three rules go with them:

- **Neither touches the cooldown**, per 7f. The applicant serves out whatever period they were already serving. A rejection is not a waive.
- **Both raise a `notice` task on the applicant**, per 7g, so they find out. The poster writes the message, and there is no template. "We have gone with somebody else" written by a person reads better than anything a dropdown produces. A rejection is the one message on this site most worth writing properly. Phase 11 also pushes it to Telegram for an applicant who linked an account, per section 15. The task is the record either way.
- **Accepting closes that posting to that applicant for good**, per 7f. Rejecting closes it only until the cooldown runs out. Neither changes the posting's own status or its openings count: an admin closes a filled role themselves, from 8.2.

   Show any open task inline on the tracking row. An admin can then see at a glance who has been asked for something and has not come back. Add a timeline of status history, bulk status change on selected rows, and CSV export of the filtered set. Each job row links out to its response sheet, so admins can read the actual answers in Google Sheets.
4. **Analytics**: per job funnel from `gftvjobs_analytics`. Views, apply clicks, answered yes, answered no, and still pending or timed out, with a click to yes conversion rate. Pending and timed out rows count as not applied, so the rate is a floor and not an estimate. The page should say so. Break the yes count down by `answer_source`, so confirmed submissions are distinguishable from self reported ones.

   Show the average posting rating from `gftvjobs_ratings` alongside the funnel, with the response count next to it. Suppress the average entirely below three ratings, so a single opinion does not read as a verdict. Add a sortable table across all jobs, plus a detail view per job with a simple bar or line chart over time. Flag any job with a high click count and a low yes rate. That usually means a broken or closed Google Form, and not a bad posting. CSV export.
5. **Invites and shortlists**: from a posting or from an applicant record, invite one or more applicants to a specific job with an optional note. Also mark an applicant against a posting without notifying them, for internal shortlisting. Invited applicants appear on the posting with their invite status, and the applicant list shows what each person has been invited to. Bulk invite from a filtered applicant list, with a confirmation step showing exactly who will be contacted. This sends real messages. Withdraw an invite, which stops further reminders and leaves the record.
6. **Departments**: simple CRUD, with the name and description edited as an English and Mandarin pair. A department cannot be left active without a Chinese name. It appears on every job card and in the search filters.
7. **Tags**: list with usage counts and search. Create, rename, recolour, and delete, where deleting warns how many postings will lose the tag. Merge two tags into one, moving all job links across and removing the duplicate. Find and clean up orphan tags with zero postings. In the job editor, tags are added through a type-ahead. It matches existing tags first, and only offers to create a new one when nothing matches. The tag list then does not fill up with near duplicates.
8. **Admin users**: list of the gftvhello accounts that can access this portal. Grant or revoke portal access, and see 2FA enrolment status and last login. **Admins only**, including the list itself: who else can reach the dashboard is not a job poster's business. Show each account's role, per 10 item 2, and what that role opens on the docs site. Granting somebody editor access and expecting them to read the developer guide is a mistake that is easier to make than to notice. Account creation for the gftvhello realm still belongs to the main gftv.asia portal, and is not built here.

   Password reset is the exception, and only through 5g. A staff member sets their own new password with a recovery code plus their second factor. That writes `gftvhello_users.password_hash`, and therefore changes their gftv.asia password too. The flow says so on screen. This page does not offer an admin a button to reset somebody else's password. The assisted path for a staff member who has lost everything stays at gftv.asia.
9. **Applicant users**: list of `gftvjobs_users` with search, view profile and application history, deactivate or reactivate. **Admins only**, all of it. A job poster works with applicants through the tracking page in 8.3, and has no business in the account itself.

   **Deactivating is the ordinary action and is reversible.** It suspends sign in and keeps every row. Permanent deletion is also available, admins only and behind the three step confirmation in 7g. It does exactly what the applicant's own danger zone does. Somebody will ask to be deleted, and the dashboard should be able to honour it. Everything 7g says about that cascade holds here too. The analytics rows stay with `applicant_id` null, and the translation reports stay with `reporter_id` null. The Storage objects have to be removed by hand of the cascade, per AVATARS.md.

   **An admin may set an applicant's password**, which reverses the earlier rule that nobody could. Three things go with it and none is optional. It is admins only. It writes an audit row with a required reason. And it revokes every session and trusted device on that account. Say plainly on the page what this costs. It is the one action in the build that breaks non repudiation. Once an admin can set a password, the audit log can no longer prove that the applicant did something themselves. **Never display an existing password.** That is not a limitation but a fact, since only a bcrypt hash is stored.

   Two assisted recovery actions remain for people locked out with no codes left. Both are logged with the admin's id and a required reason. They are forcing a password reset on next login, and unlinking Telegram after verifying identity out of band. Both revoke every session and trusted device for that account. Prefer them to setting a password, and say so on the page.
10. **Settings**: portal title, hero copy, featured job selection, application open or closed global toggle. The portal title and hero copy are edited in both languages.
11. **Translations**: the queue of applicant reported translation problems from 7h, and the tooling to act on them.
    - List of reports with filters by status, by language, and by what they point at. Open ones first, newest first. Show the report, the suggested wording where there is one, who raised it, and when.
    - Opening a report shows the current wording beside the suggestion. An admin can then see exactly what would change, without opening the posting in another tab. From there, edit the wording inline. Mark the report accepted while it is being worked on, then fixed. Or reject it with a required reason.
    - **A resolution always requires a note**, including a rejection. The reporter took the trouble to tell you, and closing it silently teaches them not to bother next time. The database enforces this, and not the interface alone.
    - A "needs translation" view, per language. It holds every posting, department, and tag with no translation. It also holds every translation drafted but not marked ready, and every translation whose optional fields are thinner than the source. The last of those is the case no constraint can catch, since it compares across two tables. That is exactly why it needs a view. This is what stops a draft sitting half translated indefinitely.
    - Reports against an interface string carry the dictionary key, and never a row id. Fixing one means editing `assets/i18n/zh.json` and deploying, and never changing a database row. So the admin view links to the key, and says plainly that it is a code change. Do not build an interface string editor.
    - Show the count of open reports in the admin sidebar, so the queue is visible without going looking for it.
    - **Translation helpers**, per 7i. The list of granted helpers by language, granting and revoking with a required reason, and what each has drafted. Granting is what turns a community member into a contributor. So it belongs beside the queue their work arrives in, and not buried in applicant users.
    - Annotations and form reports share one queue, distinguished by origin. An annotation shows the quoted text in place, with the suggested replacement beside it. A suggestion whose anchor can no longer be found is shown as detached, and never dropped.

12. **Maintenance**: the switches from 0c, on one page. It is built in phase 7, ahead of the rest of the settings in 8.10. A lever for turning a broken feature off is worth having before the phases that add the most surface.

    - A list of every key in the feature map whose phase has shipped. Each carries a switch, its current state, and where in the site it appears. A feature that has not shipped is not listed. It is already off, and offering to turn it off again is noise.
    - Turning one off asks for an optional note. It is public, and is shown to applicants exactly as typed. Prefill nothing and suggest nothing: an admin who has just broken something writes a better sentence than a dropdown does.
    - Show when each override was set and who set it, and write an audit row both ways. Turning a feature back on is as much an event as turning it off. An outage nobody recorded the end of is one nobody can measure.
    - **The denylist is in code and is not editable here.** It covers sign in and registration in both realms, and anything this page itself needs. Show them greyed with the reason. An admin looking for the switch then finds out why there is not one, instead of concluding the page is broken.
    - **This is not the applications toggle from 8.10, and the two are never merged.** `applications_open` is a policy choice: we are not taking applications at the moment. A maintenance flip says something is broken. They read completely differently to an applicant. The one thing somebody turned away actually wants to know is which of the two it is.
    - The page states plainly that an override survives a deploy, because it is a row and not a file. It also states that nothing turns itself back on. A feature left off is left off until somebody comes back for it.

Every admin API route must verify the staff session server side and re-check the access flag on each request. Never trust a client-side role value.

### 8a. Admin documentation (moved to the docs site)

**This section used to specify an in-portal manual at `/admin/docs`, served from `main-site/api/_admin-docs/`. It does not any more.** The staff documentation lives on the docs site, per section 16, and the page list that was here has moved to 16h.

The reason 8a gave for keeping the admin guide out of the docs site was that the docs site was public. An admin guide describes screens full of real applicants. That reason held exactly as long as the docs site had no login. It now has one, with the same accounts, the same second factor, and the same access check. So the guide is behind a staff session either way, and the argument no longer picks a side. What does pick a side is that one manual in one place, with one search index and one screenshot pipeline, beats two that quietly disagree.

What remains here:

- **`/admin/docs` stays as a route and becomes a redirect** to the docs site's staff section. It carries the reader to the equivalent page where there is one, and to the staff index where there is not. Anyone who has bookmarked it, and any link written into the dashboard before the move, keeps working.
- **The admin sidebar links out** to the docs site, instead of opening an in-dashboard reader. Mark it as leaving the portal, since it is a different host and the reader signs in there separately, per 5h.
- **Do not build `main-site/api/_admin-docs/`.** If it already exists, remove it, along with its `includeFiles` entry in `vercel.json` and the `api/admin/docs` route in section 9. A second copy of the manual is the thing this change exists to avoid.
- The screenshots that were to be written into the portal's admin asset directory now go into the docs site's gated content, per 16g. The seeded data rule is unchanged and is not negotiable. A leaked admin screenshot is a leaked list of applicants.
