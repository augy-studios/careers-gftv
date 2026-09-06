---
title: 7. Application flow
access: developer
order: 10
summary: Applications are collected in Google Forms, not in the portal.
---

# 7. Application flow

Applications are collected in Google Forms, not in the portal. The portal's job is to gate access, hand the applicant over, and log the handoff. It then records whether the applicant says they went through with it.

### 7a. Clicking Apply

- Only a logged in applicant can apply. This is a server side check on the endpoint, not just a hidden button. A logged out request for a form URL returns 401 and writes no analytics row.
- When a logged in applicant clicks Apply, the client calls an authenticated endpoint. That endpoint:
  1. Verifies the session. Then verifies the job is `published`, not past `closes_at` where one is set, and not blocked by the global applications toggle. A null `closes_at` passes this check.
  2. Inserts a row into `gftvjobs_analytics`. It carries `event_type` of `apply_click`, the job id, the applicant id, `did_apply` false, and `response_state` pending.
  3. Upserts the `gftvjobs_applications` tracking row to status `started` and writes a `gftvjobs_application_events` row.
  4. Returns the prefilled form URL plus the id of the analytics row it just created.
- The client opens the modal first and then the new tab, in the order set out in 7c. Do not open the tab before the modal is on screen.
- The Apply button is disabled with an explanatory label once `closes_at` has passed. The same happens when the status is not `published`, or the global toggle is off. A posting with no `closes_at` never disables on time grounds.
- **An applicant already `accepted` for this posting is refused, permanently**, per 7f. It is checked in the same place as the cooldown and is a separate reason, because the sentence is different. They have the role, and there is no date on which that changes. Never show them a cooldown date, which reads as an invitation to try again.

### 7b. Prefilling the applicant's email into the Google Form

This works and is worth doing. Google Forms supports prefill through query parameters.

- In Google Forms, open the form and choose "Get pre-filled link". Fill in the email field with a placeholder, submit, and copy the resulting link. It contains an `entry.NNNNNNN` parameter for that field. That number is the field id.
- Store it in the job's `form_prefill` map. An example is `{"entry.1045781291": "email", "entry.2005620554": "display_name"}`. The admin job editor has inputs for this, with help text explaining where the entry ids come from.
- The server builds the final URL from the base form URL, then `?usp=pp_url`, then each `entry.NNNNNNN=<value>` pair. Every value is URL encoded. Build this server side from the session, and never from a client supplied value.
- Two limitations to state plainly in the admin help text. Prefilled values are editable by the applicant, so the email in the form response is not proof of identity. And prefill only works on the `viewform` URL, not on a `forms.gle` short link. Validate on save that the stored URL is a long-form `docs.google.com/forms/.../viewform` address.
- If a job has no `form_prefill` map, open the plain form URL. Never fail the handoff because prefill is not configured.

### 7c. The handoff modal

Clicking Apply opens a modal, and only then does the form open in a new tab. The order matters. The modal has to be on screen before focus moves away, so the applicant registers it going up and recognises it when they come back. A light tap on the shoulder, not an ambush on return.

**Sequence**

1. Click Apply. The modal opens immediately, in the same tick as the click, before any network call resolves. Nothing is awaited first.
2. The `api/applications/start` call fires in parallel. It returns the prefilled form URL and the analytics row id. Prefetch the form URL earlier where possible, on `mouseenter` or `focus` of the Apply button. Then by click time it is usually already in memory, and nothing has to be awaited between the click and the new tab. Fall back to fetching on click when the prefetch has not landed.
3. Once the modal has actually painted, and at least 800ms have passed since it opened, open the form. Use `window.open(url, '_blank', 'noopener')`. The short delay is deliberate, so the modal is visibly on screen before the new tab takes focus.
4. The modal itself is never at risk of being blocked. It is an in-page `<dialog>`, exactly like the theme modal, and browsers do not police those. The only thing a popup blocker can stop is step 3, the new tab. Keep step 3 inside the transient user activation window from the click, which is a few seconds in Chrome and Firefox. Avoid awaiting anything slow in between.
5. Safari and iOS are stricter than the rest. They can refuse a `window.open` that happens after an `await`, instead of synchronously inside the click handler. Do not fight this. Detect it: if `window.open` returns null or throws, treat the tab as blocked.
6. When the tab is blocked, swap the modal header to "Open the application form". Show a large primary anchor with the form URL and `target="_blank"`. A click on a real anchor is a fresh user gesture and always succeeds. The rest of the modal keeps working unchanged. Also render a quiet version of that link at the bottom of the modal in every case. A tab can open on another monitor, or behind the current window, without the applicant noticing.

**Structure**

The modal has three stacked sections, in this order:

1. **Header.** Opens reading "Redirecting you to the job application form...", with a small indeterminate progress indicator. When the applicant returns to the portal tab, it changes to "Tell us what you think" and the progress indicator disappears. Detect the return with `document.visibilitychange` plus a `window` focus listener. Belt and braces: swap the header after 8 seconds regardless, in case the tab never lost focus. That happens when the popup was blocked, or the form opened on a second monitor. Mark the header `aria-live="polite"` so the change is announced.
2. **Rate this job posting.** Five yellow stars, empty by default. Rating is optional and independent of the apply answer, and the modal never blocks on it. Save on selection, and allow changing the choice while the modal is open. Build it as a real radio group, with visually hidden inputs and labels, so it is keyboard operable with arrow keys. Never a row of clickable spans. Yellow is the star fill only, so keep it accessible against both light and dark mode surfaces. Pair it with a text label reading the value back, for example "3 of 5".
3. **Have you applied for this role?** Yes and No buttons, equally weighted, neither styled as the obvious default. Yes sets the analytics row's `did_apply` to true, `response_state` to answered, `answer_source` to applicant, and `responded_at` to now. It then moves the tracking row to `submitted` and starts the cooldown in 7f. No sets `response_state` to answered. It leaves `did_apply` false and the tracking row at `started`, and offers a line to reopen the form.

**Behaviour**

- Build it with a native `<dialog>` and `showModal()`, so focus is trapped and the backdrop comes free. It dismisses like every other modal on the site. Clicking the backdrop closes it, Escape closes it, and there is a close control in the corner. Do not special case this modal into something harder to leave than the theme picker.
- Native `<dialog>` does not close on backdrop click by itself, so add it. Listen for a click on the dialog element, and close when the click coordinates fall outside the content box. Or wrap the content in an inner element, and close when the click target is the dialog itself.
- Dismissing without answering is fine and leaves the row pending, which already counts as No. The modal reopens on their next visit, so nothing is lost by closing it.
- Answering Yes or No closes the modal. It replaces the Apply button on the page with the resulting state, either the cooldown notice or the reopen link. A rating already given is saved even if the modal is then dismissed without answering the apply question.
- **No answer means no.** `did_apply` starts false and stays false until something positively confirms otherwise. A pending row is treated as not applied everywhere it matters. No cooldown starts, the Apply button stays available, and the funnel does not count it as an application. The only difference between an unanswered row and an explicit No is the `response_state` and `answer_source` values. They exist so the analytics page can separate a real No from silence.
- The prompt survives leaving, and it is state and not a page. There is no `/survey/` route and no route of its own at all. See "Resuming a pending prompt" below.
- Asking again is about recovering a possible Yes, not about withholding anything, so nothing in the portal is gated on answering.

**Resuming a pending prompt**

- The server is the source of truth. `GET api/applications/pending` returns the applicant's `gftvjobs_analytics` rows where `response_state` is pending. Each carries its row id, job id, and job title. It reads the applicant from the session cookie and never takes an id from the caller.
- A small shared script runs on every page of the portal. If an applicant session exists, it calls that endpoint once per page load, and opens the modal if anything comes back. It goes straight into the "Tell us what you think" state, with no redirect step and no progress indicator. The modal is one component that takes a row id and a job id, so it can mount on any page.
- `localStorage` holds the same row id purely as a fast path. The modal can then appear before the fetch resolves, on the job page the applicant just came from. Treat it as a cache that can be wrong. If the server says nothing is pending, clear it and show nothing. This is also why the server check exists at all: a different device or a cleared browser would otherwise lose the prompt.
- The outstanding item on `/account/tasks` opens the same modal in place. If it needs to be linkable, use a query parameter on the posting: `/jobs/{uuid}?prompt={analytics_row_id}`, and never a nested path. The prompt is not a resource of its own, should never be indexable, and does not deserve a URL segment. Validate that the row belongs to the session's applicant before opening anything. Strip the parameter with `history.replaceState` once the modal is open, so it does not linger in a shared link.
- Only ever show one modal at a time. If several prompts are pending, take the most recent and leave the rest for later page loads.
- While an answer is pending for a posting, the Apply button on that posting is replaced. In its place is a "You have an unanswered question about this application" prompt that reopens the modal. So a second handoff cannot stack on top of an unresolved one.
- The daily cron moves analytics rows still pending after 14 days to `response_state` of `no_response`. `did_apply` stays false and `answer_source` is set to `timeout`. Nothing about the applicant's access changes at that point, since silence was already being read as No. The timeout exists to stop the modal reappearing forever, and to close the row off for reporting.
- The modal must be usable on a phone. Full width sheet, thumb reachable buttons, stars large enough to tap accurately, and no reliance on hover.

### 7d. About blocking the tab from closing

I asked for the user to be forced to answer before closing the tab. That is not something a browser will allow, so build the closest honest version instead and do not waste effort fighting it:

- `beforeunload` is the only hook available, and all it does is show a browser generated confirmation dialog with text the site cannot control. Chrome, Firefox, and Safari all ignore custom messages. The applicant can still confirm and leave, every time. It also only fires if they have interacted with the page first.
- Register a `beforeunload` handler only while the modal is actually open and unanswered. Remove it on any close, whether that is Yes, No, Escape, the backdrop, or the close control. Do not keep it armed after the modal is dismissed, since the applicant has already told you they are done with it for now. That gives a genuine "are you sure you want to leave" prompt without pretending it is a lock.
- Do not attempt any of the hostile workarounds: no repeating `alert()` loops, no `history.pushState` back button traps, no fullscreen locks, no `unload` beacon spam. Browsers block or throttle these, they get the site flagged, and they punish the applicant for a data quality problem that is not theirs.
- The real safety net is the persistent modal in 7c, which reopens on the next visit. It never demands an answer in the moment.
- The answer is made reliable by the Google Apps Script webhook in section 13, which confirms submissions independently of what the applicant clicks. Build that too. The modal stays regardless, since it covers forms where the script is not installed and since it also collects the rating.

### 7e. Withdrawing

- Applicants can withdraw, which sets the tracking status to `withdrawn` and writes an event row. Make clear on screen that withdrawing here does not delete their Google Form response. Say that they should contact the team if they need it removed.
- Withdrawing clears the reapply cooldown described in 7f, so someone who pulls out is not locked out of a role they change their mind about.

### 7f. Reapply cooldown

Once an applicant has applied to a posting, they cannot apply to that same posting again for three months.

- The cooldown starts only on a positive confirmation, whichever comes first. That is the applicant clicking Yes in the modal in 7c, or the webhook in section 13 reporting the submission.
- Clicking No starts nothing, and neither does ignoring the modal. An unanswered prompt is read as No. An applicant who closed the tab without answering keeps full access to the Apply button. Never infer an application from the click alone.
- On confirmation, set `applied_at` on the `gftvjobs_applications` row, and `cooldown_until` to three months later. Store the date instead of computing it on read. The rule then stays stable if the policy changes later, and an admin can override a single row.
- Enforce it server side in the apply endpoint, and not only by hiding the button. A request for a posting still inside its cooldown returns a clear error and writes no analytics row.
- The Apply button on a posting inside the cooldown is replaced by a disabled state. It reads "Applied on 4 March. You can apply again from 4 June." Show the same on the card in the search results. Then nobody clicks through only to be turned away.
- The cooldown is per applicant per posting. A different posting is unaffected. A role that is closed and later reposted gets a new uuid, so it is a new posting with no cooldown. Mention that in the admin help text, since it is the intended escape hatch for genuinely reopened roles.
- Admins can waive a cooldown on a single tracking row, from the applicant tracking page. That clears `cooldown_until` and writes an event row naming who did it.
- **A status change never touches the cooldown.** A job poster moving somebody through the pipeline leaves `applied_at` and `cooldown_until` exactly as they are. That holds for `accepted`, for `rejected`, and for every other status. The applicant serves the rest of the period they were already serving. Only three things ever write those columns. A confirmed application sets them, a withdrawal clears them per 7e, and an explicit waive clears `cooldown_until` per the line above. A rejection is not a waive. Making it one would let somebody reapply the same afternoon they were turned down, which helps nobody.
- **Once the cooldown has run out, a rejected applicant may apply again**, and the tracking row starts fresh at `started`. The cooldown is the whole of the gate. A rejection is not a ban, and the event history keeps the record of what happened. `rejected` therefore joins `started` and `withdrawn` as a status a new application may reset. That is the list in `api/_lib/apply.js`.
- **An accepted applicant may not apply to that posting again**, cooldown or no cooldown. They have the role. The Apply control says so plainly, and never shows a date. A date invites somebody to come back and try again for something they already have. This is the one refusal in 7a that is not about time passing.

### 7g. Applicant dashboard

The account area gets two list pages beyond the profile. Both are private and both require an applicant session. Both must keep working for postings that are closed, expired, or archived.

**My applications (`/account/applications`)**

- Every posting the applicant has applied to, or started an application for, newest first. Each shows the status, the date they applied, and the cooldown state where one is active.
- Bucket tabs mirroring the admin ones, so they can filter to submitted, in progress, or closed out.
- Each row links back to the posting at its `/jobs/{uuid}` URL. That link must resolve even if the posting has since closed, expired, or been archived. An applicant can then always reread what they applied for.
- Any unanswered prompt from 7c also surfaces on the outstanding tasks page below, which is the canonical place for it.
- Withdraw action, per 7e.
- Empty state pointing at `/search`.

**Saved jobs (`/account/saved`)**

- Same treatment. Postings the applicant saved, including ones that have since closed or expired. Those stay visible with a clear "no longer accepting applications" badge, and never vanish from the list.
- Unsave action, and a save or unsave toggle on both the job cards in `/search` and the job detail page.
- Saving requires a session. For a logged out visitor, the save control opens the same sign in prompt as Apply, described in section 4. It completes the save once they are back.
- Sort by recently saved, with a filter for still open versus closed.

**Outstanding tasks (`/account/tasks`)**

A single inbox for anything the portal needs the applicant to deal with. It exists so a request from an admin has somewhere to land, now that notifications are in-portal only.

- Two sources feed the list, and the page unions them at read time:
  1. Unanswered apply prompts, derived live from `gftvjobs_analytics` rows at `response_state` pending. Do not copy these into the tasks table. The analytics row stays the single source of truth, and duplicating it guarantees the two drift apart.
  2. Rows in `gftvjobs_tasks`, which is where admin raised items live.
- Two task types to support from the start. `info_request` is where an admin needs more detail before progressing an application. `notice` is a one way message with nothing to submit. Leave the type column open, so more can be added without a migration.
- Each item shows a title, the posting it relates to where there is one, who raised it, when, and its status. Open items sort first, newest first. Resolved ones collapse under a "recently completed" section, and never vanish.
- Opening an apply prompt item opens the modal from 7c in place. Opening an info request expands an inline panel with the admin's message and the questions it carries.
- Keep replies to one round for now. The admin asks, the applicant replies once, and the admin reads it and closes the task. This is deliberately not a messaging thread. It should not grow into one without a decision to build that properly.

*Questions on a task*

An `info_request` may carry a set of questions, instead of only a free text box. A job poster composes them in 8.3 and the applicant answers all of them in one submission, which is still one round.

**Two questions are built in and are never part of a poster's set.** They are "did you apply for this role" and the posting rating, both from 7c. They belong to the apply prompt, and they are derived from `gftvjobs_analytics` and never stored as questions. No composer can edit, reorder, or remove them. A poster's questions never appear inside the handoff modal either, for the reason 7c gives. That modal is a light tap on the shoulder and not an ambush. Hanging a required form off it would make dismissing it cost something.

**Who a set goes to is chosen when it is sent**, and there are exactly two choices:

- **Selected applications.** The poster ticks one or more existing applications on the tracking page. Each one gets its own task.
- **The posting, from now on.** The set is stored on the posting. Every applicant who applies from that point gets a task raised automatically, at the moment they are handed over. Existing applicants are untouched unless the poster also sends to them. **This is a form asked of everybody who applies, and section 10 item 1 has been amended to permit it. Read that item before extending this.**

A poster sending to more than one applicant sees exactly who will receive it, before anything is written. That is the same rule 8.5 applies to bulk invites. Each recipient gets an independent task with its own frozen copy of the questions. So resolving one, or a set going out wrongly, is per applicant and never one shared row.

The set itself:

- **Four question types, and no more without a decision.** **Short answer** is one line and **long answer** is a paragraph. **Choice** picks exactly one of a list, and **checkbox** picks any number of a list, including none. A single yes or no confirmation is a checkbox question with one option.
- Each question carries a stable id, a type, a label, whether it is required, and, for the two list types, its options in display order.
- **Questions are written in every shipped language, and displayed in the reader's own**, per 3a. The composer offers a tab per language, exactly as the job editor does. Unlike a message to one named person, a set can now reach everybody who applies, and their languages differ. **A language left blank falls back to one that was written.** That is the same rule every other string on this site follows, and it never renders empty.
- **An option's stored value is language independent.** The label is per language, the value is not. An answer records the value, so the same answer renders in either language and validation does not depend on which language the applicant was reading. Storing a translated label as the answer would make a Chinese reader's answer unreadable in English and unmatchable against the options.
- **A free text box is always offered alongside the questions and cannot be turned off.** Somebody asked three specific things often needs to say a fourth. A form with no way to say "none of these quite fit" collects worse answers than one that has one.
- **Answers are validated on the server against the question set stored on that task**, and never against what the browser sends back. Every required question must be answered. An answer to a choice or checkbox question must be one of that question's own option values. An answer naming a question the task does not carry is rejected, and never stored.
- **The set is frozen once the task is sent.** Questions can be added, edited, reordered, and deleted freely in the composer, and not at all afterwards. Editing a sent set orphans answers already given, and changes the meaning of ones already read. Getting it wrong means raising a new task and resolving the old one, which is visible and is the right cost. Editing the set stored on a posting changes what future applicants are asked and never touches a task already raised.
- **Cap the set, and keep the cap low.** Twenty questions, with a cap on options per question and on the length of every answer.
- **No file upload of any kind.** Not on a question, not on the free text box, not ever. Anything needing a file is asked for through the role's Google Form or arranged out of band.
- The applicant sees their own answers after submitting, exactly as they see a plain reply now. A question they were asked and did not have to answer shows as unanswered, and never as blank.
- A badge in the account navigation shows the count of open items across both sources. The page is then discoverable without an email or a push notification.
- Deep links: `/account/tasks?task={task_id}` opens a specific item, and the apply prompt keeps the `/jobs/{uuid}?prompt={analytics_row_id}` form from 7c. Validate ownership against the session in both cases, and strip the parameter with `history.replaceState` once it has been handled.
- Empty state that reads as a good thing, not an error.

**Account settings (`/account/settings`)**

Profile fields, password change, Telegram linking, and a clearly separated danger zone at the bottom.

*Danger zone*

Covers deleting the account, unlinking Telegram, disabling Telegram 2FA, and anything else destructive added later. Every one of them goes through the same three steps, in this order, with no way to skip ahead:

1. **Consequences.** Clicking the action opens a panel spelling out exactly what happens and what cannot be undone. The cancel is at least as prominent as the continue. For account deletion, say plainly that Google Form responses already submitted are held by Google and are not deleted by this. Say that they should contact the team separately for those.
2. **Typed confirmation.** They type their own username to proceed. Not a checkbox, not "type DELETE", their username, so the action cannot be completed by muscle memory. Compare case sensitively and trim whitespace only.
3. **Password.** They enter their current account password, which is verified server side against the bcrypt hash on a dedicated endpoint. Never accept a client side "password was correct" signal. If Telegram 2FA is enabled on the account, also require a fresh code from the bot at this step. That is the point of having it.

Then the action runs. Additional requirements:

- Rate limit these endpoints hard, and lock the danger zone for an hour after several failed password attempts.
- Every destructive action writes an audit row before it executes, so the record survives the deletion.
- Deleting an account cascades the applicant's own rows. It keeps `gftvjobs_analytics` rows with `applicant_id` set to null, so historical funnel numbers stay intact. It invalidates every session for that account immediately.
- Show a final confirmation screen after the fact, not just a redirect to the home page.

*Recovery codes*

- Two panels, one per set, each showing how many codes remain, when they were generated, and buttons to view remaining count and regenerate. Never re-display a code after generation.
- The account recovery panel carries the strongest warning on the page. With no email in the system, these codes are the only way back in without asking an admin.
- Generating either set requires the current password, per 5c.

*Trusted devices*

- List of trusted devices with when each was added and last used, plus revoke per device and revoke all, per 5d.
- Mark the current device in the list so nobody revokes the one they are sitting at without realising.

*Telegram 2FA*

- A "Link Telegram for 2FA" control that generates a short lived, single use linking token. It shows a `t.me/careersgftv_bot?start=<token>` deep link and a QR code of the same link. It also shows the token in text, for anyone who wants to paste it.
- Once linked, show the linked Telegram display name and the date it was linked. Add controls to send a test message, unlink, and toggle whether 2FA is required at login.
- With 2FA on, the login flow gains a second step after the password. The portal sends a six digit code to the applicant on Telegram, and the browser prompts for it. The applicant can also pull a code themselves from the bot, if the push does not arrive.
- Codes are six digits, valid for five minutes, single use, stored hashed, and invalidated on a successful login or on issuing a newer code. Cap attempts per code and per account. A code from `gftvjobs_2fa_backup_codes` is accepted at this step in place of a Telegram code.
- If the applicant loses access to Telegram, their 2FA backup codes from 5c are the way back in. Require that set to exist before 2FA can be switched on, generating it in the same flow if it does not. Say plainly that losing both Telegram and the codes means asking an admin.

**Visibility rule for old postings**

Amend the 404 rule in section 4. A posting resolves at its uuid URL when any of these hold. It is `published`. It is `closed`. Or the requester is an applicant with either a `gftvjobs_applications` row or a `gftvjobs_saved_jobs` row for it. A `draft` posting is visible only to admins previewing it. Anything else is a 404. Archived postings that an applicant has history with render in a read only state with a notice explaining the posting is no longer active.

### 7h. Reporting a translation problem

Nobody on the GFTV side necessarily reads both languages well enough to catch a bad posting before an applicant does. So the applicants are the correction loop. Assume every translation is wrong until somebody says otherwise, and make saying so easy.

- A quiet control on every job posting, reading something like "Report a translation problem". Not a banner, not a prompt, and never a modal that appears by itself. It sits near the foot of the posting with the share and back links.
- The same control appears wherever else translated content is shown at length, and on the interface itself. A reader who spots a bad label in the navigation should be able to report it. They should not have to work out that it is an interface string and not part of a posting. The report form asks what is wrong, not what kind of thing is wrong.
- Opening it shows four things. Which language version has the problem, defaulting to the one currently being read. Which part, defaulting to the whole posting. A box for what is wrong. And an optional box for a better wording.
- **A suggested wording is never applied automatically.** An admin reads it first, every time. Say so on the form, so a reporter knows what to expect and does not assume their text is now live.
- The reporter may write in either language. Do not force them into the language they are reporting about, which is often the one they read least well.
- Reporting requires an applicant session, so the team can come back about it. For a logged out visitor the control opens the same sign in prompt as Apply, per section 4, and completes the report on return.
- Rate limit it per account and per IP, like every other write.
- Confirm plainly on submission, and say that a person will look at it. Do not promise a timeframe.
- Reports are stored in `gftvjobs_translation_reports`. They are not tasks. They are outbound from the applicant, and not something the portal needs from them. So they do not belong on `/account/tasks`, and must not add to its badge count. An admin who needs to ask a follow up question raises an ordinary `info_request` task, which is what that table is for.

### 7i. Translation helpers

Section 7h lets any applicant report that a translation reads wrongly. This is the other half: a standing role for people who can actually fix it.

Nobody on the GFTV side necessarily reads every language the portal publishes in. Treating translation review as a favour asked once, before launch, guarantees the second posting is worse than the first. So it is a capability instead.

**Who they are**

- A translation helper is an ordinary `gftvjobs_users` account that an admin has granted the role for one language. They are language speakers and not staff. They deliberately do not go through `gftvhello` or the admin access overlay. The person best placed to fix the Chinese has no reason to be a GFTV staff member.
- Granted per language, in `gftvjobs_translation_helpers`. As soon as a third language exists, someone who reads Chinese should not be approving Tamil, and a single boolean would let them.
- Granting requires a reason, recorded on the row, so an admin reviewing the list a year later knows why each person is on it.

**What they can do**

- Edit any translation row in their language, freely and without approval.
- **They cannot make a translation live.** Only staff set `is_ready`, which is the flag readers depend on. Access can therefore be granted before trust is, and a helper cannot publish a half finished posting by accident. **Staff and not admins alone**, amended 4 September 2026 in phase 14 part 6. The tick is open to any staff account. A job poster who cannot set it cannot publish their own posting in two languages. The promise this line makes to a helper is that somebody reads their draft before a reader does, and that promise is kept either way. Deviation 131.
- See what is missing: every posting, department, and tag with no translation in their language, and every translation started but not ready. This is the same audit view as 8.11, scoped to their language and without the admin controls.

**Suggesting a correction in place**

The helper area is not the only way in. A helper reading any page can select the wording that reads wrongly, and suggest a replacement for that exact span in place. They never leave the page, and never need to know what a dictionary key is.

- Selecting text inside a translatable region offers a small control to suggest a correction. Everything translatable on the site already carries an attribute naming its source. Interface strings render inside elements with `data-i18n="key"`, and content renders inside elements marked with its table, row, and field. The annotation layer walks up from the selection to find it, so the helper never types an identifier.
- The suggestion is stored in `gftvjobs_translation_reports` with `origin` of `annotation`, alongside the ordinary reports from 7h. **One queue, not two.** An admin works through a single list whether the item came from a form or a selection.
- Anchoring follows the W3C Web Annotation Data Model's `TextQuoteSelector`. Store the exact quote, plus a short run of text either side. That is worth copying instead of inventing. A suggestion can still be found after the surrounding text has been edited. When it cannot, it is shown as detached, and never silently applied to the wrong place.
- A suggestion against an interface string is a code change. The wording lives in `assets/i18n`, which is what keeps the site build free and lets the dictionaries precache for offline. So the admin view shows the key, the current wording, and the suggestion. A developer applies it and deploys. Say that plainly in the admin view, instead of letting an admin click approve and wonder why nothing changed. **Do not build an interface string editor**, and do not move the dictionaries into the database to avoid the deploy.
- A suggestion against content, a posting, department, or tag, an admin can apply directly, because that text is in the database.

**The layer itself**

- Off by default, and toggled from the account menu. A helper is a reader first, and text selection has to keep working normally for copying.
- Visible only to granted helpers and admins. To everyone else the attributes are inert markup and the layer does not load at all.
- Existing suggestions show as a quiet underline on the annotated span, with a count. This is what turns it from a suggestion box into a review pass. A helper can see what has already been raised, and not raise it again.
- **Elegant at every width, per section 3.** On a wide screen the suggestion opens in a panel beside the text, and annotated spans align to it. Below 1024px it is a bottom sheet, following the same pattern as the `/search` filters and the handoff modal. The selection stays visible above it. Touch selection is imprecise, so the sheet shows the captured quote and lets it be adjusted by word, instead of demanding a perfect drag.
- Keyboard reachable throughout. A helper who cannot use a pointer selects with the keyboard and opens the same control, and the annotated spans are focusable in reading order.

**What this does not replace**

The report flow in 7h stays exactly as it is. That is for any applicant, from a posting, with no role and no training. This is the tool for someone who has agreed to do the work. Both write to the same table, and `origin` is what tells them apart.
