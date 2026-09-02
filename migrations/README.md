# migrations

All the DDL for Careers@GFTV. Every file is run by hand, in order, by pasting
it into the Supabase SQL editor on the existing GFTV project. There is no CLI,
no automated runner, and no migration framework.

Everything here creates or alters `gftvjobs_*` tables only. The existing
`gftvhello_*` tables belong to the gftv.asia portal and are referenced by
foreign key but never created, altered, or dropped from this directory.

## Rules

- **Never edit a file that has already been run, and never renumber.** A
  change becomes a new numbered file. This holds during the build too, since
  production is live from phase 3 onward.
- Files are numbered `NNN_description.sql`, zero padded, and must run in
  numeric order. `002` depends on `001`, and so on down the list.
- Every file is wrapped in `begin` and `commit`, so a failure halfway leaves
  nothing behind.
- Every file is idempotent. Re-running one is safe if you lose track of what
  has been applied.
- Every file records itself in `gftvjobs_migrations` at the end. That table is
  the only record of what has been run.
- Every file carries a commented rollback block at the foot. Undoing one is
  copy and paste, not reconstruction.
- Every new table enables row level security with no policies. The service
  role key used by the serverless functions bypasses RLS, so the portal keeps
  working while anything holding an anon key gets nothing. This project is
  shared with other GFTV apps, which is why it matters.

## How to run them

1. Open the Supabase dashboard for the existing GFTV project, then the SQL
   editor. Do not create a new project and do not create a new schema.
   Everything goes in `public`, alongside the `gftvhello_*` tables.
2. Open `001_extensions_and_migration_log.sql`, paste the whole file, run it.
3. Repeat for each file in numeric order. Do not skip and do not reorder.
4. Check what has been applied at any point:

   ```sql
   select filename, applied_at from gftvjobs_migrations order by filename;
   ```

5. If a file errors, nothing from it has been applied. Fix the cause, then
   run the same file again.

## The files

| File | What it does |
|---|---|
| `001_extensions_and_migration_log.sql` | Enables `pg_trgm` and `pgcrypto`, and creates `gftvjobs_migrations`, the record of what has been run. |
| `002_applicant_accounts.sql` | The shared `updated_at` trigger function, plus `gftvjobs_users` and `gftvjobs_sessions`, the applicant realm. |
| `003_applicant_auth_support.sql` | `gftvjobs_2fa_backup_codes`, `gftvjobs_recovery_codes`, `gftvjobs_password_resets`, `gftvjobs_trusted_devices`. The two code tables are deliberately separate. |
| `004_departments_and_tags.sql` | `gftvjobs_departments` and `gftvjobs_tags`, the reference tables postings point at. |
| `005_jobs.sql` | `gftvjobs_jobs` and `gftvjobs_job_tags`. The job id is the public URL identifier. |
| `006_applications_and_events.sql` | `gftvjobs_applications`, the deduped tracking record, and `gftvjobs_application_events`, its status history. |
| `007_analytics_ratings_and_saved.sql` | `gftvjobs_analytics`, the append only apply click log, plus `gftvjobs_ratings` and `gftvjobs_saved_jobs`. |
| `008_tasks_invites_and_submissions.sql` | `gftvjobs_tasks`, `gftvjobs_invites`, and `gftvjobs_form_submissions` for the Apps Script webhook. |
| `009_search_vector_and_triggers.sql` | Adds `search_vector` with its GIN index, the trigram indexes, the weighted vector triggers, and the tag `usage_count` triggers. |
| `010_search_functions.sql` | `gftvjobs_search_jobs` and `gftvjobs_suggest`, called from the API with `supabase.rpc()`. |
| `011_telegram_and_notifications.sql` | `gftvjobs_telegram_links`, `gftvjobs_telegram_tokens`, and `gftvjobs_notifications`, the outbox the bot drains. |
| `012_operations.sql` | `gftvjobs_audit_log`, `gftvjobs_settings`, `gftvjobs_cron_runs`, `gftvjobs_rate_limits`, `gftvjobs_admin_access`. |
| `013_seed_reference_data.sql` | Starting departments and tags. Reference data only, no postings and no accounts. |
| `014_locales_and_translations.sql` | `gftvjobs_locales` plus the job, department, and tag translation tables. Adding a language is an insert here, not a migration. Translates the seeded reference data into Chinese. |
| `015_translation_reports.sql` | `gftvjobs_translation_reports`, where an applicant reports a translation that reads wrongly and an admin resolves it. |
| `016_multilingual_search.sql` | Replaces `gftvjobs_search_jobs` and `gftvjobs_suggest` with multilingual versions. Both return the requested language in the ordinary field names. |
| `017_embed_descriptions.sql` | `og_description`, the optional short line shown when a posting link is unfurled in Discord or Telegram. |
| `018_bilingual_settings.sql` | Converts the portal title and hero copy in `gftvjobs_settings` from bare strings to per locale objects, and fills in the Chinese. |
| `019_job_sections.sql` | `sections` on `gftvjobs_jobs`, so an admin can add custom sections to a posting without a migration. |
| `020_applicant_locale.sql` | `locale` on `gftvjobs_users`, so the Telegram bot knows which language to write in. |
| `021_commitment_types.sql` | Turns `commitment_type` into a controlled list of five keys, translated in the dictionary. |
| `022_search_includes_sections.sql` | Rebuilds the English search vector so custom sections are searchable. Pairs with the same change on the translation side in `014`. |
| `023_translation_helpers.sql` | `gftvjobs_translation_helpers`, the per language helper role, and the annotation columns that let a helper anchor a suggestion to the exact text that reads wrongly. |
| `024_password_reset_code_reference.sql` | `gftvjobs_password_resets.recovery_code_id`, so 5c can verify a recovery code at step 2 and consume it at step 3 rather than burning it on a reset somebody abandoned. |
| `025_passkeys.sql` | `gftvjobs_passkeys`, `gftvjobs_staff_passkeys`, `gftvjobs_passkey_challenges`, and `gftvjobs_login_challenges`. Passkeys as the second factor in both realms, and the applicant equivalent of `gftvhello_totp_challenges`. |
| `026_job_compensation.sql` | `gftvjobs_jobs.is_paid`. Every posting today is unpaid, and this is what lets a paid one say otherwise for itself instead of the site promising in its copy. |
| `027_reset_second_factor.sql` | `gftvjobs_password_resets.second_factor_at`, so a recovery code no longer walks past the passkey it was written before. |
| `028_search_returns_is_paid.sql` | Widens `gftvjobs_search_jobs` to return `is_paid`, so the board reads each posting's own answer on pay rather than assuming. A drop and a create, for the reason `016` documents. |
| `029_configurable_reapply_cooldown.sql` | Turns 7f's fixed three month reapply cooldown into the `reapply_cooldown_days` setting, with a check constraint. Zero is legal and switches the cooldown off. |
| `030_typo_tolerant_search.sql` | Makes the typo fallback in `gftvjobs_search_jobs` and `gftvjobs_suggest` actually work, by matching on `word_similarity` against the closest word rather than `similarity` against the whole title. Adds `gftvjobs_typo_threshold()`. |
| `031_task_questions.sql` | Adds `questions` and `answers` to `gftvjobs_tasks` and `task_questions` to `gftvjobs_jobs`, with the validators behind them. The question sets in 7g, capped at twenty and frozen once sent. |
| `032_phase8_operations.sql` | The four things phase 8 turned out to need: the `shortlisted` state and `notified_at` on `gftvjobs_invites`, `must_change_password` on `gftvjobs_users`, the `gftvjobs_needs_translation` view behind 8.11's audit and 7i's helper view, and `gftvjobs_application_search`, which makes 8.3's applicant box a real filter. |
| `033_analytics_views.sql` | `gftvjobs_job_funnel` and `gftvjobs_job_funnel_daily`, the aggregation behind 8.4. Two read only views, because PostgREST has no group by and the alternative was reading every analytics row into a serverless function. |
| `034_translation_authorship.sql` | `updated_by` on the three translation tables, which is what lets 8.11 answer "what each helper has drafted". Nothing in the schema could before. |
| `035_view_permissions.sql` | Revokes the four views from `anon` and `authenticated` and sets `security_invoker = on`. A view runs as its owner, so the row level security under it does not apply — the one gap in "RLS with no policies" and the rule every later view follows in the file that creates it. |
| `036_function_search_path.sql` | A fixed `search_path` on every `gftvjobs_` function. Hardening rather than a hole, since nothing here is `SECURITY DEFINER`. **Written and not yet applied**, and the path's middle element is load bearing: two search functions call `word_similarity()` unqualified, so check the typo path on `/search` after running it. |
| `037_status_checks.sql` | Phase 12 part 7. `gftvjobs_status_days`, `gftvjobs_status_incidents`, and `gftvjobs_status_record()`, which is the only way into either. The only tables here written by something outside Vercel: the probe on the VPS writes them with the service key, so the function is revoked from `anon` and `authenticated` and granted back to `service_role` by name. |
| `038_own_staff_sessions.sql` | `gftvjobs_staff_sessions`, so the portal's staff sessions stop living in `gftvhello_sessions` and the two sites stop ending each other's — the accounts stay shared, the sessions do not. Plus `gftvjobs_docs_sessions` and `gftvjobs_staff_recovery_codes`, which phase 13 reads. **Apply it before deploying the code that reads it**, and expect every staff member to sign in again once. It also backfills the log rows `034` and `037` forgot to write. |
| `039_passkey_site.sql` | Phase 13 part 2. `registered_on` on both passkey tables, so 5f can say which site a passkey was registered from. One relying party id covers both sites per 5e, so every passkey shows up on both and nothing in the schema could tell them apart. Applied before the docs site can register one, while backfilling every existing row as `portal` is still provably right. |
| `040_staff_password_resets.sql` | Phase 13 part 6. `gftvjobs_staff_password_resets`, the third of section 6's staff recovery tables and the one `038` left out because nothing was going to read it yet. 5g's forgot password flow needs a ticket store, and `gftvjobs_password_resets` is the applicant realm's: its `user_id` points at `gftvjobs_users`. Built with `recovery_code_id` and `second_factor_at` present from the start, which is section 6 telling this file not to repeat what `024` and `027` took two migrations to learn. |

Three files in this directory are not migrations and are not in that sequence.
They sit here because this is where SQL lives.

| File | What it is |
|---|---|
| `dev-seed-jobs.sql` | The phase 3 dev seed: nine postings, every one marked SAMPLE POSTING, with a commented out delete block at the bottom. Superseded by `seed.mjs` at the repo root, which removes these nine as well as its own. |
| `audit-grants.sql` | Read only. Six queries answering what a holder of this project's anon key can actually reach, written after `035`. |
| `README.md` | This file. |

**The seed script itself is not SQL and is not here.** `seed.mjs` at the repo
root is section 17's, and it is Node because a sample account needs a bcrypt
hash this build's own sign in will accept, which Postgres cannot produce. It
seeds postings, one ready Chinese translation and two sample accounts, and
`node seed.mjs --clear --yes` takes all of it out again. It never touches
reference data: the departments and tags stay exactly as `013` left them.

## Things worth knowing before you run them

**`gftvhello_users.id` must be `uuid`.** Several `gftvjobs_*` tables have a
foreign key to it. If that column turns out to be a `bigint` or a `text`,
`005`, `006`, `008`, and `012` will fail at the foreign key. Check first:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'gftvhello_users' and column_name = 'id';
```

**Search and tag counts are maintained in Postgres, not in application code.**
`gftvjobs_jobs.search_vector` and `gftvjobs_tags.usage_count` are written by
the triggers in `009` and by nothing else. That is deliberate: a posting
edited directly in the Supabase table editor stays searchable and the tag
counts stay honest. Do not write either column from `main-site/api`.

**`usage_count` counts published postings only**, since the tag cloud hides
tags with zero published jobs. A posting moving in or out of `published`
refreshes the counts for all of its tags.

**Five tables are not in section 6 of the specification.** `gftvjobs_audit_log`,
`gftvjobs_settings`, `gftvjobs_cron_runs`, `gftvjobs_rate_limits`, and
`gftvjobs_admin_access` in `012` exist because behaviour the spec requires had
nowhere to live. The header comment in `012` names the section behind each
one.

**`gftvjobs_status_days` and `gftvjobs_status_incidents` in `037` are the only
tables anything outside Vercel writes.** 0c puts the status prober on the VPS
beside the Telegram bot, because a status page hosted on the thing it monitors is
useless during the outage it exists to report, and `telegram-bot/probe.py` writes
both with the service key. Nothing in `main-site/api` writes them: the site reads
them and the daily cron sweeps them at ninety days. Neither carries a foreign key
on purpose — these are observations about an address at a moment, and they have
to be writable while the portal is answering 500 to everything.

**A day and an outage rather than a check**, and the difference is the whole
design. One row per target per day counts what was watched, which is what lets
the page refuse to call a barely watched day a good one; one row per outage is
opened by the first failed check and closed by the first one that succeeds,
which is what lets it state a real duration. Storing every request instead would
have been about half a million rows over the window the page draws, nearly all
of them recording that nothing happened.

**`gftvjobs_status_record()` is the only way in, and it is revoked from anon and
authenticated.** That is `035`'s lesson pointed at a function rather than a view:
Supabase grants execute on a new function in public to both roles by default, and
this project's anon key is shared with other GFTV apps, so without the revoke
anybody holding it could write green days nobody measured. It also carries
`036`'s `search_path`.

**All Chinese in this directory is Singapore Mandarin**, 华文, not Mainland
Putonghua: 义工 not 志愿者, 华文 not 中文, 电邮 not 电子邮件, 营运 not 运营,
合约 not 合同, 摄影棚 not 录影棚, and 文件 not 文档. That applies to the seeded
department and tag names in `014` and the hero copy in `018`, and to anything
added later. The list is `USAGE` in `gen-review.js` and this paragraph is
checked against it by `tests/phase12-test.mjs --only=zh`, so the two cannot
drift.

**The site is multilingual, and the database enforces the rules.** English lives on the base rows as the
source language; every other language is a row in the matching translation
table. A translation is shown only when its `is_ready` flag is set, so an
unreviewed one can sit in the table without going live. A posting may publish
with no translation at all, and reads in English with a notice, but a
translation cannot be shown without at least a title.

**Non default languages are searched differently, and have to be.** Postgres
cannot segment Han script: `to_tsvector` sees a run of Han characters as a
single token, so searching for part of a word never matches. The extensions
that fix this, `zhparser` and `pg_jieba`, are not on Supabase. English
therefore keeps the weighted `tsvector` from `009`, and Mandarin is matched
with `pg_trgm` against the generated `search_text` column on the translation row instead. English
search ranks by relevance and highlights matched terms; Mandarin search finds
everything containing what was typed and orders by title closeness. Both work,
but only English ranks well, and only English gets a highlighted snippet.

**Rollback blocks are commented out on purpose.** Uncomment, read what it
drops, then run. Several of them will refuse while dependent rows exist, which
is the intended behaviour.
