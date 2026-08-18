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

**All Chinese in this directory is Singapore Mandarin**, 华文, not Mainland
Putonghua: 义工 rather than 志愿者, 营运 rather than 运营, 摄影棚 rather than
录影棚, 文件 rather than 文档. That applies to the seeded department and tag
names in `014` and the hero copy in `018`, and to anything added later.

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
