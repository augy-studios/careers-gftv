---
title: 16. Documentation site (docs-site/)
access: developer
order: 19
summary: A separate documentation site in a new docs-site directory in this same repo, served at docs.careers.globalfurry.tv, on its own Vercel project.
---

# 16. Documentation site (`docs-site/`)

A separate documentation site in a new `docs-site` directory in this same repo, served at `docs.careers.globalfurry.tv`, on its own Vercel project.

It was specified as a public applicant site with nothing internal in it. It is now the documentation for the whole project, for four audiences, and what a reader sees depends on whether they are signed in and what their staff role is. The public half is unchanged in spirit and still carries nothing internal. The rest is behind a staff login.

### 16a. Audiences, and what each one sees

Four tiers, cumulative, so each one sees everything the tier below it sees.

**1. Public, no login.** Anyone, including every job applicant.

- How to use the Careers@GFTV portal.
- How to use the Careers@GFTV Telegram bot.
- **Helping with translations.** What a translation helper can actually do, what they cannot, and how to volunteer. This is the public face of 7h and 7i and it belongs out here rather than behind a login, because the person best placed to fix the Chinese has no reason to be a GFTV staff member and no way to read a gated page. See 16h.

**2. Job poster.** Staff with `is_editor` and not `is_admin`, per 10 item 2.

- Everything public, plus the staff dashboard guide: how to use the dashboard and every feature a job poster can reach.

**3. Admin.** Staff with `is_admin`.

- Everything a job poster sees, plus the admin guide, which is the content section 8a used to hold. This is the guide to running the site as an admin, and it is what `/admin/docs` was going to be.

**4. Developer.** The same accounts as tier 3. Admins are the developers of this project, so there is no separate developer flag and none is to be invented.

- Everything above, plus the developer documentation, for whoever works on this project after the people who built it. See 16h for the page list, which covers `next-steps.md` in its final state, the official banner in `gftv-official.md`, this specification, `gftv-theme.md`, the avatars bucket, the Vercel setup, and the Playwright screenshot pipeline.

**Rules for the gate**

- **The gate is server side, on every request, and a page above the reader's tier returns 404 rather than 401.** Same reasoning 8a gave: a 401 confirms the page exists to anyone probing for it. Never ship a gated page as a static file with the sidebar entry hidden by JavaScript, which is not a gate at all.
- The sidebar renders only what the reader is entitled to. A signed out reader sees the three public sections and a sign in link, not a wall of padlocks. Locked entries teach nothing and invite guessing at URLs.
- The role is derived from the session on the server, per 10 item 2, and never read from anything the client sent.
- One exception to the silence: the docs home page says plainly that staff documentation exists and is behind a sign in. Hiding the fact that a staff area exists protects nothing, since the login form is right there, and a job poster who has never been told will not go looking.

### 16b. Signing in

Per 5h. Its own functions, its own cookie, its own session table, the same `gftvhello` accounts, the same second factor, and the same access check as the portal.

- Sign in at `/login` on the docs site, with the same two independent controls from 5d: stay signed in for 30 days, and trust this device.
- Passkey first where the account has one, per 5e, with the authenticator code and a backup code as fallbacks. A passkey registered on the portal works here, because both sites share one relying party id.
- A signed in reader gets their display name and role in the header, a link to `/account`, and sign out. Show the role in words a reader recognises, "job poster" or "admin", rather than a database flag name.
- Trusting a device here does not trust it on the portal, since the token cookie is host scoped. Say that next to the checkbox rather than letting somebody conclude it failed.
- Sign in is the one part of this site that needs the network and cannot be cached. Say so on the form when the reader is offline.

### 16c. Account settings (`/account`)

The full staff account settings suite from 5f, danger zone included, mounted here and on the portal from one shared implementation.

Everything in 5f applies unchanged: profile read only with a link to gftv.asia, password change, passkeys, authenticator app, backup codes, account recovery codes per 5g, trusted devices listed per site, sessions with sign out everywhere, and a danger zone whose every action goes through consequences, then the typed username, then the password and a fresh second factor.

There is no delete account, because the gftvhello account is not this project's to delete. Say so and link across.

### 16d. Design language

Follow GitBook's structure and interaction patterns, with GFTV's own palette from `gftv-theme.md`. Take the layout conventions, not the branding. Never use GitBook's logo, name, or assets, and do not imply any affiliation.

**This covers the whole site, not just the public half.** The staff guides, the developer guide, the login form, and the account settings page in 16c are all GitBook shaped: same three column layout, same sidebar, same on-page contents, same callouts, same type scale, same calm. The staff half is documentation that happens to need a session, not an admin panel with pages in it, and it must not start looking like one. The portal's dashboard has its own look, borrowed from the gftv.asia link shortener per section 8; do not bring that here.

The two pages with no article to hold, sign in and account settings, render inside the same shell all the same, header and sidebar included, with the content column carrying a form where the prose would be. Keep the callouts, the spacing, and the type scale there too, so signing in feels like part of the same site rather than a detour through a different one.

- Three column layout on desktop: fixed left sidebar with collapsible sections, a centred content column of roughly 720 to 800px, and a right hand on-page table of contents that highlights the current heading while scrolling.
- Below 1024px the right hand contents column drops to a collapsible block above the content. Below 640px the left sidebar goes behind a hamburger button as an off canvas panel, following the shared rules in section 3. Search stays in the header at every width rather than being hidden inside the menu, since search is how people navigate documentation on a phone.
- Code and command blocks scroll horizontally within their own container on small screens, never pushing the page sideways.
- Sticky header with the site name, a search field, a link across to the portal itself, the light and dark toggle, **a language control**, and the account control from 16b: a sign in link, or the reader's name and role with a menu to `/account` and sign out. The account control keeps its place at every width and never goes inside the hamburger, for the same reason search does not: a reader who cannot find how to sign out assumes they have not. **The language control keeps its place for that reason again**, added 3 September 2026 alongside 16f: a reader who cannot find how to change the language concludes there is nothing to change, and on this site there is no other way to arrive in their own, since the choice cannot travel from the portal.
- Generous whitespace, quiet hairline borders rather than shadows, restrained type scale, comfortable line length and line height. GitBook reads calm, so match that rather than making it dense.
- Breadcrumbs above the page title, and previous and next page links at the foot of every page.
- Anchor links that appear on heading hover and copy a link to that heading.
- Callout blocks in four flavours: note, tip, warning, and danger. Use them sparingly.
- Collapsible details blocks, and tabbed blocks for anything that differs between desktop and mobile.
- Code and command blocks with a copy button, used mainly for bot commands.
- Two axis theming exactly as the main site, same tokens, same `data-color-theme` and `data-mode` attributes, light default, WCAG AA in every combination.

### 16e. Content, in two pipelines

Every page is markdown with front matter, and the front matter carries a required `access` key of `public`, `poster`, `admin`, or `developer`. That key is the only thing that decides which pipeline a page goes through and who may read it. **Fail the build on a page with no `access` key.** A page whose tier was forgotten must not default to public, and defaulting to gated instead just means a page nobody notices is missing.

The two pipelines exist because a gated page cannot be a file on the CDN. Anything in the static root is world readable no matter what the interface does, which is the same reason 8a gave for keeping the admin guide out of `main-site`'s static tree.

**Public pages.** `docs-site/content/`, converted to static HTML at deploy time by a small Node script using the shared layout, and emitting `search-index.json`. This stays a deliberate exception to the no build step rule, for the reason already given: hand maintaining a shared sidebar and header across thirty files is how documentation rots.

**Gated pages.** `docs-site/api/_content/`, where Vercel will not serve them statically, added to `includeFiles` in the docs site's `vercel.json` so the function can read them. Served by `api/content/*` per section 9, which checks the session, reads the page's `access` key, and either returns the markdown or 404s. Rendered client side inside the same shell, so the sidebar, header, and theming come free and there is one layout rather than two.

- The two pipelines share one layout, one sidebar component, one table of contents, and one stylesheet. A reader must not be able to tell which pipeline a page came from.
- Images for gated pages live beside them and stream through the same authenticated route. A gated page with a public screenshot is a leak with extra steps.
- **Search is split the same way.** The public index is a static file. The gated index is served per role by `api/search-index`, built at deploy time into one file per tier and never merged into the public one. Check it: a public reader must not be able to find a developer page's heading in search, which is exactly the mistake a single index makes easy.
- Match on title, headings, and body text, show the matching heading in the result, and jump straight to the anchor. No third party search service, on either half.
- Every page carries a last updated date taken from git.

**Translations live in Supabase, and the English stays in the files.** Settled 3 September 2026, when 16f made the whole site bilingual. This is 3a's shape applied to guides: the file is the base row and every other language is a row in a table, `gftvjobs_docs_translations`, keyed by the page's path and its locale and carrying the translated title, summary and body.

Five things follow, and the first two are the reason it is written down rather than left to phase 14 to work out. The fifth was added later the same day, when the Telegram bot's `/docs` was settled and somebody asked where a page reaches Supabase from:

- **The `access` key stays in the file and is never in the table.** Whoever may read a page is decided by exactly one thing, and a translation row that could carry its own tier would be a second answer to the question the whole two-pipeline arrangement exists to have one answer to. A translation of a gated page is served by the gated route; a translation of a public page is built into `dist/`. The row never decides which.
- **A page with no translation falls back to English with a notice**, exactly as a posting does under 3a, and a translation is shown only when its row says it is ready. Half a translated page is never shown.
- **The build reads the table, so a deploy needs the database.** That is new, and it is the cost of this choice: until now `node scripts/build.js` needed nothing but the repository, and a build that cannot reach Supabase must fail loudly rather than quietly emit an English-only site. A site missing every translation is the failure that looks like success.
- **Editing a translation still needs a deploy for the public half**, because those pages are files in `dist/` written at build time. The gated half reads the table per request and does not. That asymmetry is a consequence of the two pipelines and not a defect; whether the public half should fetch its translation in the browser instead is phase 14's to settle, and it trades a rebuild for a request on every page view.
- **Anything outside Vercel that wants a page needs the English put somewhere it can reach**, which the arrangement above does not do: the translation table carries every language except the one the file holds. The Telegram bot's `/docs` is the first such reader and the build mirrors the public pages into `gftvjobs_docs_pages` for it, one direction, at deploy time. The files remain the base row for the site and for the mirror alike; the mirror is never a place a page is written or edited, and it carries no `access` key for the same reason the translation table does not.
- Sub navigation lists the pages in order, with previous and next links at the foot of each, and previous and next never point at a page the reader cannot open.
- Since the staff half is behind a login, it can be specific in ways the public half cannot: real procedures, real edge cases, real warnings. **Still no secrets.** No environment variable values, no keys, no tokens, no Google Form URLs, and no real applicant data. "Behind a login" is not "safe to paste a service role key into".

### 16f. Language

**The whole site follows 3a**, public half and staff half alike, and ships in every language the portal ships in. Revised 3 September 2026.

This section previously read: "The public half follows 3a and ships in every language the portal ships in, per phase 14. The staff half stays English only, and says so at the top of its index rather than leaving a reader guessing. Translating a manual that changes with every phase costs more than it returns, and the audience for it is small and known." That reasoning was right about the cost and wrong about the audience. A job poster is staff, and 3a's argument for the portal is the argument here: this is not a partial translation of a mostly English site, and a poster who reads 华文 should get the same manual as everybody else instead of the one guide that was cheap to translate.

The cost it named is real and is accepted. A guide that changes with a phase is re-translated with that phase, and the phase is not done until it is.

- The interface chrome is `docs-site/assets/i18n/`, one dictionary per language, exactly as the portal's. Phase 13 part 6a landed English and 华文 together, 242 keys, 175 of them lifted from the portal unchanged because they were already its own strings. Phase 15 adds Malay and Tamil to that directory and to `LOCALES`, and to nothing else.
- The language control sits in the header, per 16d, and a reader's choice is stored against this site's own origin. **It does not carry from the portal and cannot**: `localStorage` is per origin, and the one mechanism that would cross is a cookie on `.globalfurry.tv`, which 5h forbids because the parent domain carries other GFTV apps. The first page a reader sees is English whatever they chose next door, and the control is how they say otherwise.
- Guide content is translated per 16e, and a page with no translation falls back to English with a notice, exactly as a posting does under 3a.

### 16g. Screenshots

Screenshots are captured with Playwright, not by hand.

- Put a capture script in `docs-site/scripts/`, with its own `package.json` and Playwright config scoped to `docs-site` so it never becomes a dependency of the portal build.
- It runs on demand against a local or staging instance, never as part of the Vercel build and never against production. Vercel cannot run browsers on a build anyway, and production holds real applicant data.
- Drive it from a manifest file listing every shot: the page path, the viewport, the theme and mode, the element to wait for before capturing, whether to capture full page or a single selector, and any region to mask.
- Log in using accounts and postings created by the seed script, so every screenshot shows invented people applying to invented roles. No real applicant, email, or Telegram handle ever appears in the docs.
- The same script captures the staff guide shots, writing those beside the gated content in `docs-site/api/_content/` instead of into the public output. Seeded data only there too, since a leaked admin screenshot is a leaked list of applicants. The manifest entry names the tier, and a shot for a gated page that lands in the public directory is a build failure rather than a review comment.
- Never capture a screen showing a live recovery code, backup code, login code, linking token, or Google Form URL. Where a page like that needs illustrating, seed a fake value and say in the caption that it is an example.
- Capture at a desktop width and a phone width, in light and dark mode, so the docs can show the hamburger navigation and mobile layouts described in section 3.
- Make runs deterministic: disable animations and transitions, freeze or mask relative dates and any "last updated" text, and mask anything that changes between runs. A screenshot set that produces a diff on every capture stops being reviewable.
- Output to `docs-site/public/screenshots/` with predictable names built from the manifest entry, for example `portal-search-desktop-light.webp`. Convert to webp and keep them committed, since the docs need them at build time.
- Until the first capture run, render clearly marked placeholder slots with the intended alt text and caption in place, so a missing image reads as pending rather than broken.
- Document the whole thing in the `docs-site` README: how to seed, how to run a capture, how to add a shot to the manifest, and how to re-run just one.

### 16h. The pages, tier by tier

Four guides, one per tier, each a top level section in the sidebar. The sidebar stays able to take another section later without rework.

#### Portal guide, page by page (public)

- What Careers@GFTV is, and what you need to apply.
- Creating an account, and what happens after (no approval wait, no email verification).
- Signing in, including the stay signed in and trust this device options and what each one actually does.
- Finding roles: searching, filters, tags, quick chips, and what "Open until filled" means.
- Saving roles for later.
- Applying: what happens when you press Apply, why a Google Form opens in a new tab, the rating and the "have you applied" question, and what happens if you close the window without answering.
- Why you cannot reapply to the same role for three months, and what to do if you need to.
- Tracking your applications and what each status means.
- Outstanding tasks, and what to do when a team member asks you for more information.
- Account settings: profile, password, recovery codes, trusted devices.
- Recovery codes explained plainly: the two sets, what each one unlocks, and the fact that losing both the password and the codes means asking the team for help.
- Using the portal offline and installing it to a home screen.
- Troubleshooting and a short FAQ.

#### Bot guide, page by page (public)

- What the bot does and what it cannot do.
- Linking your Telegram account, both from the portal and from the bot.
- Command reference, one entry per command with what it returns: `start`, `link`, `unlink`, `code`, `invites`, `tasks`, `applications`, `jobs`, `notify`.
- Signing in with a code versus a one tap link, and why the one tap link only works in the browser that asked for it.
- Notifications: the three kinds, how to turn each off, and why security messages cannot be turned off.
- Job invitations and how to respond to one.
- Unlinking, and what happens to 2FA when you do.
- Troubleshooting: no message arrived, code expired, wrong account linked.

#### Helping with translations, page by page (public)

The one genuinely new public section. Written for a reader who speaks a language the portal publishes in and has no connection to GFTV beyond that, so it assumes nothing and asks for nothing but the language.

- What needs translating and what does not: postings, departments, tags, and interface wording are in scope; tag and department slugs are never translated, per 3a, because they are URL identifiers and translating one breaks every shared link.
- **Reporting a problem, which needs no role at all.** The control on every posting from 7h, what happens to a report, and the promise that every report is answered with a note including a rejection. Say plainly that a suggested wording is read by a person before anything changes, so nobody expects their text to appear live.
- **Becoming a translation helper**, per 7i: what the role is, that it is granted per language, that it is an ordinary applicant account rather than staff, and how to ask for it.
- What a helper can do: edit any translation in their language freely, and see what is missing.
- **What a helper cannot do: make a translation live.** Only staff set `is_ready`, per 7i as amended on 4 September 2026. Explain why, because it reads as distrust unless the reason is given: access can be granted before trust is, and it means a half finished posting cannot go out by accident.
- The suggestion layer from 7i: turning it on, selecting text and suggesting a replacement, what the quiet underline and the count mean, and how it works on a phone where selection is imprecise.
- The Singapore Mandarin note from 3a, with the vocabulary table. 义工 rather than 志愿者 is the single most visible marker and belongs on this page, not only in this specification.
- What happens next: who reads a suggestion, roughly what the queue looks like from the other side, and that an interface string fix is a code change and therefore waits for a deploy.

#### Job poster guide, page by page (poster and above)

How to use the staff dashboard, covering every feature a job poster can reach. Written for a volunteer who has been given an account and has never seen an admin interface.

- Signing in with an existing gftv.asia account, the second factor, passkeys, and what stay signed in and trust this device each actually do.
- Your account: passkeys, backup codes, recovery codes, trusted devices, and what the danger zone does, per 5f and 5g. Include the warning that a recovery code reset changes the gftv.asia password too.
- Reading the dashboard overview and what each pipeline bucket means.
- Creating a job posting: every field explained, choosing tags well, when to set a closing date and when to leave a role open until filled, and what the slug does.
- Writing a posting in more than one language: the tabbed editor, the reference column, what complete, in progress, and absent mean on a tab, and why a translation cannot be marked ready without a title, summary, and description.
- Sections, and why a translation may carry a different number of them from the base row.
- The embed description, with the warning that embeds are always served in English no matter what language the line was written in.
- Connecting the Google Form: creating the form, getting the pre-filled link, finding the entry ids for email and name, why the long form address is required rather than a short link, and linking the response sheet.
- Turning on confirmed submissions: the one time Apps Script setup per form, as a plain checklist with copy buttons, since this is the fiddliest thing anybody here has to do.
- The posting lifecycle: draft, publish, unpublish, close, archive, and duplicate, plus what each state means to applicants and what happens automatically at a closing date.
- Working through applications: statuses and what each one signals, adding notes, reading the timeline, bulk changes, exporting, and waiving a reapply cooldown.
- Reading the analytics: views, clicks, confirmed and self reported answers, what pending and timed out actually mean, why the conversion rate is a floor, and how a high click count with a low yes rate usually points at a broken form rather than a bad posting.
- Inviting applicants to a role and shortlisting without notifying, including what the applicant receives and what bulk inviting sends.
- Raising a request for more information, reading the reply, and closing it out.
- Managing tags: the type-ahead, merging duplicates, and clearing orphans.
- Managing departments, including why a department cannot be left active without a Chinese name.
- **What you will see disabled, and why.** The build status mechanism from 0c, so a poster meeting "Will be available in Phase 5" knows it is a plan rather than a fault.
- Using the dashboard on a phone, since reading applications at a convention is the normal case.
- Two short checklists to finish: everything to do before publishing a new role, and a weekly review routine.

#### Admin guide, page by page (admin only)

What `/admin/docs` was going to be. Everything above plus the parts a job poster has no access to.

- What an admin can do that a job poster cannot, stated first, so the boundary is clear from the top.
- Who gets access, how `is_admin`, `is_editor`, `is_approved`, and the `gftvjobs_admin_access` override combine, and what each role opens on this docs site.
- Managing access for other staff: granting, revoking, and why account creation and assisted password reset still live at gftv.asia.
- Managing applicant accounts: deactivation, deletion, and the assisted recovery actions for somebody locked out with no codes left, including the required reason and what gets logged.
- The translations queue: working a report, the current wording beside the suggestion, accepting, fixing, and rejecting, and why a resolution always needs a note even when rejecting.
- The needs-translation audit, and how to read a translation whose optional fields are thinner than the source.
- Granting and revoking translation helpers, with the reason that gets recorded and why it matters a year later.
- Annotations from the suggestion layer, how they share the queue with form reports, and what a detached anchor means.
- Portal settings: hero copy, featured roles, and the global applications toggle.
- Unmatched form submissions, and linking one to an applicant by hand.
- Reading the daily cron result on the overview, and what to do when a form health check flags a posting.
- Handling a broken or deleted Google Form on a published posting.
- What to do when somebody reports being unable to sign in, for both realms, and which paths exist for each.

#### Developer guide, page by page (admin only)

For whoever works on this project after the people who built it. This is the section that stops the build being readable only to its authors.

- **Start here**: what Careers@GFTV is, the two sites, the two account realms, the two Vercel projects, and the shape of the repo. One page that orients somebody with no context.
- **The specification.** `careers-gftv-spec.md` in full, rendered as pages rather than one wall, with the note that where it and anything else disagree, the answer is to ask rather than to choose.
- **`next-steps.md` in its final state.** It is gitignored and it is the working memo, so it dies with the last session unless it is captured here. Publish it at the end of the build as the record of how the phases actually went, deviations included. Note in the page that it is a snapshot rather than a live file.
- **The phases and the build status mechanism**, per 0c: `build-status.json` as the single source, the feature map, the disabled control pattern, the placeholder route, and how the notice bar is retired and replaced by the official banner.
- **The official banner**, from `gftv-official.md`: what it is, why it cannot be dismissible, why it must never claim the site is safe or verified, and the rule about not linking a trusted sites page that does not exist. Portable across GFTV projects, so treat that file as the source and this page as the pointer.
- **The theme**, from `gftv-theme.md`: the tokens, the two axis switcher, the `.glass-card` primitive, the loading primitives with their 250ms delay, the rule that links carry no underline and are one weight step heavier, and no gradients, orbs, blobs, or emoji.
- **The avatars bucket**, from `main-site/AVATARS.md`: what it is, how it is configured, what may and may not go in it, and how it is served.
- **The database**: the `gftvjobs_` namespace, why row level security is on with no policies, the rule that `gftvhello_*` tables are read only apart from the one exception in 5g, and how to write a migration. Numbered, idempotent, wrapped in a transaction, recorded in `gftvjobs_migrations`, with a rollback block, never edited once run and never renumbered.
- **Authentication**: the two realms, passkeys per 5e including the shared relying party id, the second factor flow, trusted devices, both sets of codes in each realm, and the two proofs rule on password reset.
- **Vercel**: two projects on one repo, the root directory setting for each, the rewrites and headers in each `vercel.json`, `includeFiles` for the gated content, the `Cache-Control: no-cache` on `sw.js`, the cron, environment variables and where each comes from, and how previews behave differently from production for passkeys.
- **Playwright**: the capture script, the manifest, how to add a shot, how to re-run one, how determinism is kept, and the rules about seeded data and never capturing a live code, token, or form URL.
- **The service worker**: the caching strategies, what is network only and why, the IndexedDB stores, the action queue, and the rule that `VERSION` is bumped on every change to the site rather than once per phase.
- **The multilingual layer**: base rows plus translation rows, `is_ready`, the dictionaries and `data-i18n`, why search differs by language, and what adding a language actually costs.
- **The Telegram bot**: how it is deployed on the VPS, the outbox drain, and where its own documentation lives.
- **Conventions worth not relearning**: no framework, no build step on `main-site`, no em dashes in copy, inline SVG rather than emoji, and prompt with options rather than choosing when this specification and something else disagree.

### 16i. Deployment

- Its own Vercel project with the root directory set to `docs-site`, since the portal project already points at `main-site`. Two projects, one repo. This project now has serverless functions of its own, per 5h and section 9, so it needs its own environment variables set in Vercel and its own `vercel.json` with the `includeFiles` entry for the gated content.
- Custom domain `docs.careers.globalfurry.tv`.
- Cross link both ways: a docs link in the portal footer and in the bot's start message, a portal link in the docs header, and the `/admin/docs` redirect from 8a. The admin sidebar's link is marked as leaving the portal.
- `robots.txt`, `sitemap.xml`, and `llms.txt` generated from the page list, per the discovery files in section 4. **Public pages only, in all three.** A gated page must never appear in a sitemap, in `llms.txt`, or in the public search index, and `robots.txt` disallows `/api`, `/account`, and the staff paths. Generate them from the same `access` key that drives the gate, so a page cannot be gated in one place and advertised in another.
- Its own README covering local preview including how to sign in against a local staff account, the four audiences and which role sees what, adding a page in either pipeline, its environment variables, and the screenshot checklist.
- Preview deployments are a different host, so a passkey registered against production does not work on one, per 5e. Password plus authenticator code still does. Say so in the README before somebody concludes previews are broken.
