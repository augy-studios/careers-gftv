---
title: 0b. Phasing and the next-steps file
access: developer
order: 2
summary: Do not build this in one pass.
---

# 0b. Phasing and the next-steps file

Do not build this in one pass. Work through it in the phases below, in order, and stop at the end of each one.

### The next-steps file

Before starting each phase, write `next-steps.md` at the repo root. Add it to `.gitignore` in the very first phase, since it is a working memo and not part of the deliverable. Keep one file and rewrite it each time instead of starting a new one.

Every version contains four parts:

1. **Done so far.** A short list of completed phases with what each one actually produced, so the file carries its own history and nothing is lost between sessions.
2. **This phase.** What is about to be built, and the specific files that will be created or changed.
3. **Needs clarification.** Anything ambiguous, contradictory, or missing from this brief. If an item blocks the phase, stop before writing code and prompt me with the interactive question tool, offering concrete options to pick from. Do not write open ended questions into the chat and wait. If an item does not block the phase, record the assumption you are making and carry on.

   The same applies any time you need a decision from me, mid phase or otherwise: prompt me with options instead of asking in chat. Where a real recommendation exists, say which option you would choose and why in one line, then let me pick.
4. **How to verify.** What I should click, run, or query to confirm the phase works before you move on.

At the end of a phase, update the file so "This phase" moves into "Done so far", with any deviations noted. Update any README the phase invalidated, per section 2. Flip the shipped phase in `build-status.json`, per section 0c. Then write the next phase's version. If a phase turns out larger than expected, split it and say so in the file instead of half finishing it.

### Phases

1. **Foundations.** Repo scaffold per section 2. The build status mechanism in 0c, including `build-status.json`, the notice bar, the disabled control pattern, the placeholder route, and `/status`. `.gitignore` including `next-steps.md`, and both `.env.example` files. The full `migrations/` set, covering every table, index, extension, trigger, and RPC function. The Supabase client helper, the shared session helpers, and the `vercel.json` rewrites and headers. Also the multilingual foundation per 3a: the language switcher, the `assets/i18n` dictionaries, the locale module, and the CJK typography. Nothing user facing beyond the shell, `/status`, and the placeholder.
2. **Authentication.** Staff login with TOTP, backup codes, and trusted devices against the existing tables. Applicant registration and login. Recovery codes, both sets. Forgot password. Session length and trusted device handling for both realms, per 5d. Writing the applicant's language choice to their account, per 3a. Telegram 2FA is deliberately deferred: build the endpoints and the settings UI shell here. The delivery half cannot work until the bot ships, so leave the toggle disabled with a note instead of faking it.
3. **Browsing roles.** Home, and `/search` as the single browse surface with full text search, filters, tags, quick chips, and suggestions. Also the about and FAQ static pages. Search resolves per language, with the trigram path for languages Postgres cannot tokenise, per 3a.
4. **Job postings.** `/jobs/{uuid}` with the visibility rules and the logged out gate. It is served by a function that renders the meta tags, JSON-LD, and link embed server side, per section 4. The `jobs.json` feed. Language aware rendering with the untranslated notice, and the translation report control from 7h.
5. **Apply flow.** The start endpoint with prefill, the handoff modal in all three sections, analytics logging, ratings, the pending prompt resumption, and the reapply cooldown. Honours a language specific application form where a posting has one.
6. **Applicant dashboard.** My applications, saved jobs, outstanding tasks, and account settings including the three step danger zone.
7. **Admin core.** The overview, job postings with the tabbed per language editor and the sections builder, applicant tracking, departments, and tags. The access check applied on every route. No documentation area is built here: the staff manual lives on the docs site and arrives in phases 13 and 14, per 8a. What this phase owes it is the `/admin/docs` redirect and the sidebar link out.

   **Both halves of the question sets in 7g belong to this phase**, the composer in 8.3 and the renderer on `/account/tasks`. That is so even though the second sits on a page phase 6 built. Phase 6 shipped the tasks page with a plain reply box, which is the whole of what it could test. There is no way to raise a task until applicant tracking exists. A question renderer built there would have been unreachable code, checked by inserting rows by hand. Build the two together, in the order the data flows, and treat the page as this phase's to extend.

   The posting side comes with it. That is `task_questions` on the posting, the auto-raise when somebody applies, and the marker in the postings list showing which roles carry a set. The auto-raise hangs off the same place the tracking row is written in 7a. So it is one more step in a request that already exists, and not anything scheduled.

   **Also the maintenance page in 8.12**, ahead of the rest of the settings in 8.10. That gives a lever for turning a broken feature off before phases 8 to 11 add the most surface. It needs the shared server side guard as well as the page: a switch that only greys out buttons is not one.
8. **Admin operations.** Analytics, invites and shortlists, admin users, applicant users, settings, and the translations queue in 8.11 with its needs-translation audit.
9. **Automation.** The daily cron and the Apps Script webhook endpoint, plus the Apps Script itself and its setup notes.
10. **Offline.** Service worker, caching strategies, IndexedDB stores, the action queue, and the install manifest. Every language dictionary is precached, per section 14.
11. **Telegram bot.** The `telegram-bot` directory, the nine commands, linking, login codes and magic links, and the notification outbox drain. It writes to each applicant in the language stored on their account. Finish wiring the Telegram 2FA left disabled in phase 2, and enable it once the bot can actually deliver.
12. **Polish.** A WCAG AA pass across every theme, mode, and language. The full responsive check in section 3, at every listed width, on both sites. A read through of every dictionary by someone who reads that language. The portal's `sitemap.xml`, `robots.txt`, and `llms.txt`, per section 4. A seed script, a final pass over the four READMEs and `setup.md`, and the offline test checklist.

    **Also the service status page in 0c.** It is the one part of the build status mechanism that outlives the build: `/status` stops listing phases and starts answering whether things are working. It needs the status history tables in section 6, the probe loop on the VPS per section 15, and the rebuilt page. Build it here, but **switch it over only once every phase is `shipped`**. The two versions must never be on screen together. A page listing both what is unbuilt and what is degraded gives a reader two reasons a thing might not work. It gives them no way to tell the two apart.
13. **Docs site foundations.** The `docs-site` directory per section 16, up to but not including the guide content. That is its own `api/`, and the staff login with passkeys, TOTP, and backup codes. Also the role gate that decides what a reader is allowed to see. Then the shared staff account settings suite and its danger zone per 5f, and staff account recovery codes per 5g. And the two content pipelines, public static and gated authenticated. Ship it with enough placeholder pages to prove the gate works and nothing more.
14. **Documentation.** The content itself, per 16h. That is both public guides in every shipped language, the public translation helper page, and the job poster guide. Then the admin guide that section 8a used to hold, and the developer guide. Plus the docs site's own `sitemap.xml`, `robots.txt`, and `llms.txt`, the Playwright screenshot capture script, and a first capture run against seeded data.
15. **More languages.** Malay and Tamil. No database change is needed, per 3a: a language is a row in `gftvjobs_locales`, a dictionary file, and the content itself. Listed last because it depends on finding people to write and check it, not because it is technically hard.

Documentation sits this late for a reason. Documentation written from a specification documents the plan, and documentation written from a finished build documents the product.

Phases 13 and 14 were one phase until the docs site gained a staff login and four separate audiences. Building an authentication realm and writing four guides in one pass is the "phase turned out larger than expected" case this section already covers. So it is split instead of half finished, and "More languages" moves from 14 to 15. Nothing had shipped past 12 when that happened, so the renumbering costs one edit to `build-status.json` and nothing else. Do not renumber a phase that has already shipped.

Phases 1 and 2 are the ones worth slowing down on. Everything else depends on the schema and the session handling being right, and reworking those later means touching every phase that came after.

The list grew from eleven to fourteen during phase 1, and to fifteen when the docs site gained a staff login. The reasoning is worth keeping. Multilingual content, server rendered postings, and the translation review loop were added after the original phasing, and two phases became too large to ship whole. The first is the public site, which now carries language aware rendering and a server rendered detail route. The second is the admin dashboard, which gained an eleventh section, a tabbed per language editor, and a dynamic sections builder. Splitting them is the rule in this section applied to itself. The fourteenth phase is new work and not a split.
