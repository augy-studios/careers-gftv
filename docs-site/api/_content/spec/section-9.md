---
title: 9. API design
access: developer
order: 12
summary: RESTful routes under main-site/api/, grouped:
---

# 9. API design

RESTful routes under `main-site/api/`, grouped:

- `api/auth/staff/*`: login, verify-2fa, logout, session, trusted-devices (list, revoke, revoke all)
- `api/auth/applicant/*`: register, login, logout, session, profile, change-password. Then forgot-password (verify a recovery code) and reset-password (consume the ticket). Then recovery-codes (generate, count remaining) and trusted-devices (list, revoke, revoke all)
- `api/public/*`: jobs list, job detail by uuid, slug to uuid lookup for the redirect, departments, tags, search, suggest
- `api/applications/*`: start, respond, pending, list mine, withdraw. Start logs the analytics row, upserts the tracking row, and returns the prefilled form URL and the analytics row id. Respond records the yes or no answer, and sets the cooldown on a yes. Pending returns any unanswered prompts for this applicant.
- `api/saved/*`: save, unsave, list mine
- `api/ratings/*`: upsert a rating for a job, from the modal in 7c
- `api/translations/*`: report a problem, list my own reports
- `api/tasks/*`: list mine (unioned with pending apply prompts), get one, reply, dismiss a notice, unread count for the badge. A reply carries the answers to the task's questions as well as the free text. The endpoint validates them against the question set stored on that task, per 7g. Every required question must be answered. Every choice and checkbox answer must be one of that question's own option values. Nothing may name a question the task does not carry. It is the only thing that may. The browser was sent the questions and cannot be trusted to send back an answer to one of them.
- `api/telegram/*`: create a linking token, poll link status, unlink, toggle 2FA, request a login code, verify a login code, consume a magic link
- `api/invites/*`: list mine, mark seen, decline
- `api/account/danger/*`: verify password, then the individual destructive actions
- `api/webhooks/form-submit`: the Apps Script integration described in section 13
- `api/admin/*`: jobs, applications, analytics, tasks, invites, departments, tags, tag-merge. Then users, admins, stats and export. Then translations, which is the report queue and the needs-translation audit, per 8.11. Then maintenance, which reads and flips the feature overrides, per 8.12. There is no `api/admin/docs`: the manual moved to the docs site, per 8a.
- `api/public/feature-status`: the maintenance overrides, read by anybody, cacheable for a short window and never longer. It carries only which shipped features are currently off, and the public note on each. The phase list stays in `build-status.json` and is not duplicated here. This is the one thing the browser needs that the static file cannot answer. It is deliberately separate, so a failure to read it leaves the site working with everything on, and never blank.
  - Every route behind a flippable feature checks the same override server side and answers 503 with the maintenance sentence, per 0c. The check belongs in a shared helper beside `api/_lib/settings.js`, called by each guarded route. Then what is flippable is a list in one file, and not a convention.
- `api/auth/staff/*` also carries the staff account settings suite in 5f. That is passkeys (list, register, rename, remove) and authenticator (enrol, remove). Then backup-codes (count, regenerate) and recovery-codes (count, regenerate). Then sessions (list, revoke, revoke all), and forgot-password and reset-password per 5g. And the danger zone actions, behind their own verify-password step.

The docs site has its own small route set under `docs-site/api/`, on its own Vercel project. It duplicates and does not share, per 5h:

- `api/auth/*`: login, verify-2fa, passkey challenge and verify, logout, session, trusted-devices. Plus the same account settings suite as above, so 5f can be mounted on both sites.
- `api/content/*`: get a gated page by key, and stream a gated image. Both check the staff session and the page's required role. Both answer 404 and never 401 for a caller who is not entitled, so a page's existence is not confirmed to anyone probing.
- `api/search-index`: the gated half of the search index, scoped to the reader's role. The public half is a static file.

Requirements for all routes:
- **Every endpoint that returns human readable content takes a locale**, `en` or `zh`. It returns that language in the ordinary field names. It never returns both and leaves the client to choose. A caller that sends no locale gets English. The client sends the stored preference on every request. Auth routes and anything returning only ids and timestamps do not need it.
- Validate and sanitise every input. Parameterised queries only.
- Consistent JSON error shape with proper status codes. Never leak stack traces or database errors to the client.
- Rate limit login, registration, 2FA verification, and application submission. A simple table-backed or in-memory limiter is fine, state which you chose in the README.
- Generic error text on failed login so the response does not reveal whether a username exists.
