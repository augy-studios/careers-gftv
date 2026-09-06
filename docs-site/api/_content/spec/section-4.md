---
title: 4. Public site (no login required)
access: developer
order: 7
summary: Home page (/)
---

# 4. Public site (no login required)

**Home page (`/`)**
Landing page for the general public. Sections:
- Hero with the Careers@GFTV name, a short line about joining GFTV, and a job search box (keyword plus a category or department dropdown) that submits into `/search`.
- Featured or latest openings: a small grid of job cards pulled live from the API, with a "view all openings" link to `/search`.
- "Why volunteer with GFTV" style section with a few value cards.
- Browse by department or team.
- How the application process works, as a numbered set of steps.
- Footer consistent with the other GFTV sites.

**Job listing and search (`/search`)**

There is one browse surface, not two. `/search` is both the full job listing and the search results page. With no query parameters it shows every published posting, newest first. With a `q` parameter or any filter applied it shows the matching subset. Same page, same components, same URL, so a shared link always reproduces exactly what the sender was looking at.

- `/jobs` with no id 301 redirects to `/search`. The only thing living under `/jobs/` is an individual posting.
- The search box in the home page hero submits to `/search?q=...`.
- Keyword search backed by Postgres full text search. Query across job title, summary, description, responsibilities, requirements, department name, and tag names, with title and tags weighted highest.
- Filters: department, tags, commitment type, location or remote, posting status. Sorting by newest, closing date, or relevance, where relevance is the default whenever `q` is present and newest is the default when it is not. When sorting by closing date, use `order by closes_at asc nulls last` so deadline free postings sit at the end rather than the top.
- Tag filtering: a tag cloud or chip row where multiple tags can be selected at once. Default to OR matching across selected tags, with a "match all selected tags" toggle for AND. Show a count beside each tag and hide tags with zero published jobs.
- Quick filter chips above the results for "Posted today", "Posted this week", "Closing soon", and "No deadline", each showing a live count. "Closing soon" matches only postings with a `closes_at` inside the next 14 days and never includes deadline free ones. These sit alongside the full filter panel, not inside it, so the common cases are one tap away.
- As-you-type suggestions from a lightweight endpoint: matching job titles, matching tags, and matching departments, grouped under those three headings. Debounce at around 250ms, minimum two characters, and make it fully keyboard navigable with arrow keys and Enter.
- When `q` is present, rank by relevance and highlight matched terms in the summary snippet using `ts_headline`.
- Handle typos and near misses with a trigram similarity fallback when full text search returns nothing, and show a "no results for X, did you mean Y" state with the most popular tags as a way back in.
- Recent searches stored in localStorage and offered as chips under an empty search box. Nothing search related is stored server side against an account.
- Server-side pagination.
- Every piece of state, the query, filters, sort, and page, lives in the URL query string so results are shareable and the back button behaves. Update it with `history.replaceState` as filters change rather than reloading.
- Each card shows title, department, location, commitment type, posted date, closing date, and up to four tag pills. Where `closes_at` is null, show "Open until filled" in place of a date rather than leaving the field blank or printing "null". Clicking a tag pill filters by that tag rather than opening the job.
- Each job detail page emits schema.org `JobPosting` JSON-LD so postings are eligible for Google Jobs indexing, and the site exposes a public `api/public/jobs.json` feed for anyone aggregating openings.

**Job detail (`/jobs/{id}`)**
- The canonical URL of a posting is `/jobs/` followed by the posting's Supabase row uuid, for example `/jobs/3f9a1c2e-8b47-4d10-9a3e-5c61d2f0ab88`.
- **This route is server rendered, not a static page that fetches on load.** `vercel.json` rewrites `/jobs/:id` to a serverless function, and that function injects the `<title>`, the meta description, the Open Graph and Twitter card tags, and the `JobPosting` JSON-LD into the HTML before it is sent. The body of the page can still hydrate client side.

  The reason is link embeds. Discord, Telegram, Slack, and every other unfurler fetch the URL and read the markup as delivered; none of them run JavaScript. A page that fetches its posting after load unfurls as whatever the static shell says, so every posting on the site would embed with identical, generic text. Rendering the tags server side is the only way a posting link can carry its own title and description.

  This is the one route that works this way. Everything else in the portal stays a static page with a client side fetch, per section 2.

**Link embeds**

- Each posting carries an optional `og_description`, a short line written by the admin for the unfurl. It is never required.
- When it is empty, fall back to the first sentence of the posting's `description`. Take the first sentence, not the first N characters, so the embed never ends mid word. Sentence detection is language aware: a full stop for English, `。` for Mandarin. Strip any markdown before using it.
- Cap the rendered value at roughly 200 characters. Discord shows around 350 and most unfurlers cut nearer 200, so anything longer is guaranteed to be truncated mid sentence somewhere.
- The image is the site card image unless a posting sets its own later. Do not put the Google Form URL, the response sheet URL, or anything else non-public into an embed: the unfurl is fetched by a third party server and cached by it.
- **Embeds are always English.** A crawler has no `localStorage`, so it has no language preference to read, and the language is deliberately not in the URL per 3a. A per language embed line is stored on the translation row, so it is ready if a `?lang=` parameter is ever added, but nothing serves it today. Say this in the admin help text, or an admin will write a Chinese embed line and wonder why nobody sees it.
- `/jobs` with no id redirects to `/search`, so nothing else competes for this route. Match a uuid shaped segment for the detail page and treat any other non-uuid segment as not found.
- Keep the `slug` column. Serve `/jobs/{slug}` as an alias that 301 redirects to the uuid URL, so any link shared before this change still resolves and there is only ever one canonical address per posting.
- A uuid that does not exist, or points at a `draft` posting, returns a proper 404 page rather than an empty shell. A `closed` posting still renders, with the apply button disabled and a closed notice. An `archived` posting renders only for an applicant who has applied to or saved it, per the visibility rule in 7g, and 404s for everyone else.
- Set `<link rel="canonical">` to the uuid URL.
- Tag pills near the top, each linking to the listing filtered by that tag.
- Full description, responsibilities, requirements, nice-to-haves, commitment, location, and closing date, or "Open until filled, applications reviewed on a rolling basis" when `closes_at` is null.
- Share button and a "back to results" link that returns to `/search` with the previous query string intact.
- Apply button. Applications are handled by Google Forms, so for a logged in applicant the button starts the handoff in 7c.

**What a logged out visitor sees**

- The entire posting is public. Title, summary, full description, responsibilities, requirements, commitment, location, department, tags, posted and closing dates, all of it. No teaser, no blurred text, no "sign in to see the details". The only thing behind the gate is the act of applying.
- The Google Form URL is the single exception and must never appear in the public job payload, the HTML source, the JSON-LD, or the `jobs.json` feed. It is served only from an authenticated endpoint, so a logged out visitor cannot lift it and bypass the gate.
- In place of the Apply button, show a control that reads as an apply action, not as a wall. Something like "Apply for this role" that opens a small sign in prompt explaining in one line that applications need an account, with two equal options, log in and create an account, and a note that registration takes a moment and needs no approval.
- Saving a job gets the same treatment, and so does anything else that writes against an account.
- The search results page is fully public too, filters and tags included. Nothing there requires a session.

**Returning after signing in**

- Carry a `?redirect=` back to the posting through both the login and the registration flow, including through the automatic sign in that follows registration, so a new applicant lands back where they started rather than on a bare account page.
- Validate the redirect against a strict allowlist of relative paths on this origin. Reject absolute URLs, protocol relative ones, and anything with a host, or the parameter becomes an open redirect.
- On return, do not auto-start the handoff. There is no user gesture behind a post-login redirect, so the new tab would be blocked and the modal would appear out of nowhere. Land them on the posting with the Apply button now active, scrolled into view and briefly highlighted, and a short confirmation line that they are signed in and can apply. The next click is theirs.
- Preserve intent across the round trip. If they clicked save rather than apply, complete the save on return and say so.

**Static pages**: About Careers@GFTV, FAQ, privacy notice, terms.

**Discovery files**

Built in phase 12 for the portal and phase 13 for the docs site, once the pages they describe actually exist. Building them earlier just means listing placeholder routes.

- **`/sitemap.xml`** on the portal is generated, not hand written, since postings change constantly. Serve it from a function rewritten to that path in `vercel.json`, listing the home page, `/search`, the static pages, `/status`, and every `published` job at its `/jobs/{uuid}` URL with a `lastmod` from `updated_at`. Exclude closed, draft, and archived postings, everything under `/admin`, `/account`, `/login`, and `/register`, and every placeholder route from 0c. Cache it with `s-maxage` so it is not rebuilt per request.
- **`/robots.txt`** on the portal allows the public pages, disallows `/admin`, `/account`, and `/api`, and points at the sitemap.
- **`/llms.txt`** on both sites, following the llmstxt.org convention: a short markdown file at the root with the site name, a one paragraph description, and a linked list of the pages worth reading, grouped under headings. For the portal that is what Careers@GFTV is, how applying works, and links to `/search`, the docs site, and the `jobs.json` feed. For the docs site it is a link per guide page with a one line description of each.
- Keep `llms.txt` to public, applicant facing material. No admin documentation, no endpoint paths, no Google Form URLs, and nothing behind a session. Treat it as a public page, because it is one.
- Worth knowing: llmstxt.org is a proposed convention rather than a standard, and support for it is uneven. It costs almost nothing to publish and may help, but do not build anything that depends on it being read.
- Both sites also get a `sitemap.xml` and `robots.txt`, generated from the docs page list on the docs side, as set out in section 16.
