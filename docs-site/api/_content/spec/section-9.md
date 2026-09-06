---
title: 9. API design
access: developer
order: 12
summary: RESTful routes under main-site/api/, grouped:
---

# 9. API design

RESTful routes under `main-site/api/`, grouped:

- `api/auth/staff/*`: login, verify-2fa, logout, session, trusted-devices (list, revoke, revoke all)
- `api/auth/applicant/*`: register, login, logout, session, profile, change-password, forgot-password (verify a recovery code), reset-password (consume the ticket), recovery-codes (generate, count remaining), trusted-devices (list, revoke, revoke all)
- `api/public/*`: jobs list, job detail by uuid, slug to uuid lookup for the redirect, departments, tags, search, suggest
- `api/applications/*`: start (logs the analytics row, upserts the tracking row, returns the prefilled form URL and the analytics row id), respond (records the yes or no answer and sets the cooldown on a yes), pending (returns any unanswered prompts for this applicant), list mine, withdraw
- `api/saved/*`: save, unsave, list mine
- `api/ratings/*`: upsert a rating for a job, from the modal in 7c
- `api/translations/*`: report a problem, list my own reports
- `api/tasks/*`: list mine (unioned with pending apply prompts), get one, reply, dismiss a notice, unread count for the badge. A reply carries the answers to the task's questions as well as the free text, and the endpoint validates them against the question set stored on that task, per 7g: every required question answered, every choice and checkbox answer one of that question's own option values, and nothing naming a question the task does not carry. It is the only thing that may. The browser was sent the questions and cannot be trusted to send back an answer to one of them.
- `api/telegram/*`: create a linking token, poll link status, unlink, toggle 2FA, request a login code, verify a login code, consume a magic link
- `api/invites/*`: list mine, mark seen, decline
- `api/account/danger/*`: verify password, then the individual destructive actions
- `api/webhooks/form-submit`: the Apps Script integration described in section 13
- `api/admin/*`: jobs, applications, analytics, tasks, invites, departments, tags, tag-merge, users, admins, stats, export, translations (the report queue and the needs-translation audit, per 8.11), maintenance (read and flip the feature overrides, per 8.12). There is no `api/admin/docs`: the manual moved to the docs site, per 8a.
- `api/public/feature-status`: the maintenance overrides, read by anybody, cacheable for a short window and never longer. It carries only which shipped features are currently off and the public note on each; the phase list stays in `build-status.json` and is not duplicated here. This is the one thing the browser needs that the static file cannot answer, and it is deliberately separate so a failure to read it leaves the site working with everything on rather than blank.
  - Every route behind a flippable feature checks the same override server side and answers 503 with the maintenance sentence, per 0c. The check belongs in a shared helper beside `api/_lib/settings.js`, called by each guarded route, so what is flippable is a list in one file rather than a convention.
- `api/auth/staff/*` also carries the staff account settings suite in 5f: passkeys (list, register, rename, remove), authenticator (enrol, remove), backup-codes (count, regenerate), recovery-codes (count, regenerate), sessions (list, revoke, revoke all), forgot-password and reset-password per 5g, and the danger zone actions behind their own verify-password step.

The docs site has its own small route set under `docs-site/api/`, on its own Vercel project. It duplicates rather than shares, per 5h:

- `api/auth/*`: login, verify-2fa, passkey challenge and verify, logout, session, trusted-devices, plus the same account settings suite as above so 5f can be mounted on both sites.
- `api/content/*`: get a gated page by key, and stream a gated image. Both check the staff session and the page's required role, and both 404 rather than 401 for a caller who is not entitled, so a page's existence is not confirmed to anyone probing.
- `api/search-index`: the gated half of the search index, scoped to the reader's role. The public half is a static file.

Requirements for all routes:
- **Every endpoint that returns human readable content takes a locale**, `en` or `zh`, and returns that language in the ordinary field names rather than returning both and leaving the client to choose. A caller that sends no locale gets English. The client sends the stored preference on every request. Auth routes and anything returning only ids and timestamps do not need it.
- Validate and sanitise every input. Parameterised queries only.
- Consistent JSON error shape with proper status codes. Never leak stack traces or database errors to the client.
- Rate limit login, registration, 2FA verification, and application submission. A simple table-backed or in-memory limiter is fine, state which you chose in the README.
- Generic error text on failed login so the response does not reveal whether a username exists.
