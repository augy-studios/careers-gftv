---
title: 11. Scheduled maintenance
access: developer
order: 14
summary: Add a Vercel cron function that runs daily:
---

# 11. Scheduled maintenance

Add a Vercel cron function that runs daily:

- Auto-close any `published` job whose `closes_at` is not null and has passed, setting status to `closed` and writing an audit row. Jobs with a null `closes_at` are skipped entirely and never auto-close.
- Health check each published job's `application_form_url` with a HEAD or lightweight GET. If the form is deleted, private, or no longer accepting responses, flag the job in the admin list with a warning badge rather than unpublishing it silently.
- Resolve `gftvjobs_analytics` rows still pending after 14 days to `no_response`.
- Delete expired rows from `gftvjobs_sessions`, `gftvjobs_trusted_devices`, `gftvjobs_password_resets`, `gftvjobs_telegram_tokens`, and expired `gftvhello_totp_challenges`. Do not touch `gftvhello_sessions` rows belonging to other portals beyond normal expiry cleanup.
- Delete `gftvjobs_status_days` rows older than ninety days, and `gftvjobs_status_incidents` rows that started before then **and have ended**, once those tables exist in phase 12. An open incident is never swept whatever its age: it is still the current state of that target as far as anything here knows. This is a small sweep by design — four day rows a day — and it is done because the page draws exactly ninety days and anything older is weight nothing reads.
- Surface the last cron run time and its results on the admin overview.
