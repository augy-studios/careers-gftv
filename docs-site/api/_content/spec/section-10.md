---
title: 10. Settled decisions
access: developer
order: 13
summary: Amended twice since it was written, both deliberately.
---

# 10. Settled decisions

1. **Applications and resumes**: handled entirely in Google Forms. The portal stores no files and builds no application form. No Supabase Storage, no uploads.

   **Amended twice since it was written, both deliberately.** The second amendment is a real reversal and not an exception. Recorded here so nobody has to reconstruct it from the code.

   - **Avatars**, per `main-site/AVATARS.md`. One small square image per account and nothing else. It remains the only file this portal stores, and "no uploads" holds everywhere else without qualification.
   - **Question sets on tasks**, per 7g, decided 21 August 2026. Four question types, a cap of twenty, answered once. A set may be sent to chosen applicants **or attached to a posting so that everyone who applies to it is asked**. That second half is a small form built and served by the portal. That is the thing the original sentence ruled out, so the sentence no longer reads literally.

   What still holds, and is what the original decision was actually protecting:

   - **The application itself is still a Google Form.** The portal collects no application, builds no application form, and stores no answers to one. A question set is asked *after* somebody has applied, of somebody whose application already exists.
   - **No files, anywhere, ever, except an avatar.** Not on a question, not on the free text box. Resumes and portfolios go through the role's Google Form.
   - **No scoring, no ranking, no gating.** Answers are read by a person. Nothing in the portal computes anything from them, and no part of the applicant's access depends on having answered.
   - **The cap is the boundary made enforceable.** Twenty questions is enough for a real follow up and far too few for an application. It is what stops this growing into an application, one question at a time.

   A set may one day need to be longer than the cap, need a file, or need answering before applying. The answer is still the Google Form, and this decision has not moved that far.
2. **Admin access and roles.** A gftvhello account reaches the admin dashboard if `is_admin` is true **or** `is_editor` is true, and `is_approved` is true. Apply this same check on every admin API route, and on the docs site. `gftvjobs_admin_access` overrides the flag check either way, per migration `012`, and `is_approved` is required regardless and cannot be waived.

   On top of that check sits a role, which decides what the docs site shows, per 16a:

   - **`is_admin`** is an **admin**. Admins are the developers of this project and are job posters as well, so they see everything. That is the applicant guides, the job poster guide, the admin guide, and the developer guide.
   - **`is_editor` without `is_admin`** is an **editor**, which in the documentation is a **job poster**. They see the applicant guides and the job poster guide, and nothing else.
   - An account allowed in by a `gftvjobs_admin_access` override, but holding neither flag, is treated as a **job poster**. That is the lesser of the two. An override grants entry, not seniority, and the safe reading of an ambiguous grant is the smaller one.

   The role is derived server side on every request from the same row that decides access. Never send a role to the browser and trust it back, and never gate a docs page on a role the client claims.

   **An admin has full control over everything this portal configures.** That is every posting whoever wrote it, every applicant, every application, and every task. Then every department and tag, the portal settings in 8.10, the maintenance switches in 8.12, and the translation queue in 8.11. A job poster's work is not private from an admin and an admin may override any of it. **The `is_ready` flag is not on this list**, amended 4 September 2026 in phase 14 part 6. No helper may set it, and any staff account may, per 7i as amended. Deviation 131.

   **What only an admin may do**, which is the same list stated from the other side. It is what the dashboard hides for a job poster, in place of disabling it:

   - Permanently delete a posting, per 8.2, and permanently delete an applicant account, per 8.9. Both behind the three step confirmation in 7g.
   - Anything on the applicant users page in 8.9 at all, including setting a password.
   - Grant and revoke portal access, per 8.8.
   - The portal settings in 8.10 and the maintenance switches in 8.12.
   - Mark a translation ready, per 7i.

   **Full control stops at this portal's own data, and one boundary is not negotiable.** Section 2 forbids writing to any `gftvhello_*` table, so `is_admin` and `is_editor` are read here and set at gftv.asia. Those accounts are shared with another system this portal does not own, and a flag flipped here would change somebody's access over there. Portal access is granted and revoked through the `gftvjobs_admin_access` overlay instead, which is what that table exists for. An admin who needs to make somebody an editor does it at gftv.asia. The dashboard says so, instead of offering a control that cannot work.
3. **Notifications**: no email, ever, and no email dependency. In-portal is the baseline and always works. Telegram is an additional delivery channel for applicants who link an account, per section 15, and never the only record of anything.
4. **Telegram sends all three kinds**: `invite`, `task_raised`, and `application_status_changed`. All three ship in the first version, each individually toggleable by the applicant through `notify`.
5. **Both sign in paths stay**: the six digit login code and the magic link, exactly as set out in section 15. The magic link is a full login and not a second factor, and its browser binding is not optional.
6. **The nine commands in section 15 are the full set.** They are `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs` and `notify`. No `help`. Do not add commands without asking.

7. **The site is multilingual**, English and Simplified Chinese today and built to take Malay and Tamil without a schema change, per 3a. The language lives in `localStorage` only and never in the URL, which costs Chinese-language search discoverability and `hreflang`. That is accepted. GFTV is **国际兽视** and the portal is **国际兽视入队平台**. Tag slugs and department slugs are not translated.
8. **Applicants are the translation correction loop**, per 7h. Nobody on the GFTV side necessarily reads both languages well enough to catch a bad posting first. So reporting is quiet, easy, and always answered with a note.

9. **The docs site has a staff login**, per section 16, and what a reader sees depends on their role per item 2. It signs staff in itself, with its own functions, its own cookie, and its own session table. It never borrows a session across two origins, and never widens a cookie to the parent domain.

10. **The staff manual lives on the docs site, not in the portal.** Section 8a's `/admin/docs` becomes a redirect. One manual, one search index, one screenshot pipeline.

11. **Passkeys are the second factor in both realms**, shipped in phase 2 and documented after the fact in 5e. One relying party id across both sites, so a staff member enrols once. The password is still required at every login and this does not become passwordless without a decision.

12. **Staff get account recovery codes**, per 5g, and they set a gftvhello password. This is a deliberate exception to two rules. Section 2 forbids writing to `gftvhello_*` tables, and 8.8 says password reset belongs to gftv.asia. It was chosen with that conflict stated. It covers `password_hash` and nothing else, it changes the account's gftv.asia password too, and the flow says so on screen.

Anything else that is ambiguous, stop and ask me instead of assuming.
