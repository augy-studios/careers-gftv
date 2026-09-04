---
title: The database
access: developer
order: 8
summary: The namespace, row level security with no policies, the read only tables, and how to write a migration.
---

# The database

**Everything runs in the existing GFTV Supabase project, in the `public`
schema.** Do not create a new project and do not create a new schema. This
project's tables sit alongside the `gftvhello_*` tables that gftv.asia owns.

**Access is server side only**, from the Vercel functions, with the service role
key. Supabase Auth is not used anywhere. The browser never talks to Supabase and
never receives an anon key.

## Row level security, with no policies

**Every `gftvjobs_*` table has row level security enabled and no policies at
all.** The service role bypasses row level security, so the portal keeps working
while anything holding an anon key gets nothing.

That matters because the project is shared with other GFTV apps, and their anon
key is the same anon key.

> [!WARNING]
> A view runs as its owner, so the row level security under it does not apply.
> Migration `035` revokes the four views from `anon` and `authenticated` and sets
> `security_invoker = on`. Every view created after it follows that rule in the
> file that creates it. A function needs the same treatment: `037` revokes its
> own and grants it back to `service_role` by name.

## The two namespaces

| Prefix | Whose | What this project may do |
|---|---|---|
| `gftvjobs_` | This project's | Anything. |
| `gftvhello_` | The gftv.asia portal's | Read, and nothing else, with the exceptions below. |

**The `gftvhello_*` tables are never created, altered or dropped from here.**
They are referenced by foreign key. What the login flow legitimately owns are the
challenge, trusted device and backup code rows it writes for itself.

**Two columns are the named exception, and there is no third.** Both were asked
for deliberately, and both are written from one file,
`api/_lib/staff-account.js`, so that a third would be a diff somebody reviews.

| Column | Asked for by | What it costs |
|---|---|---|
| `password_hash` | 5g | A staff password set here is the gftv.asia password. |
| `totp_secret` | 5f | Adding or removing an authenticator app here does the same at gftv.asia. |

`node tests/phase13-test.mjs --only=account` fails if a second file ever writes
that table, or if that one writes a third column.

## Migrations

**All the DDL is numbered SQL files in `migrations/`, pasted into the Supabase
SQL editor by hand.** There is no CLI, no runner and no framework. The list of
every file and what it does is in `migrations/README.md`.

Two rules matter more than the rest:

- **Never edit a file that has already been run, and never renumber.** A change
  becomes a new numbered file. This holds during the build too, because
  production has been live since phase 3.
- **The full set from phase 1 was run on day one**, so the database runs ahead of
  the interface. A feature switching on in a later phase needs no new SQL.

### Writing one

Six properties, and every file in the directory has all six.

1. **Numbered** `NNN_description.sql`, zero padded, running in numeric order.
2. **Wrapped in `begin` and `commit`**, so a failure halfway leaves nothing.
3. **Idempotent**, so re-running one is safe when you lose track.
4. **Recorded in `gftvjobs_migrations`** at the end. That table is the only
   record of what has been run.
5. **Carrying a commented rollback block** at the foot. Undoing one is copy and
   paste and never reconstruction.
6. **Enabling row level security with no policies** on any new table.

```sql
select filename, applied_at from gftvjobs_migrations order by filename;
```

**If a file errors, nothing from it has been applied.** Fix the cause and run the
same file again.

**Rollback blocks are commented out on purpose.** Uncomment, read what it drops,
then run. Several will refuse while dependent rows exist, which is intended.

### One rule about ordering

**A migration that changes what a session is goes in before the code that reads
it.** Migration `038` moved the portal's staff sessions into a table this build
owns, and applying it signs every staff member out once. That is the opposite
order from everything else in this build, and the file says so.

## What Postgres owns, and application code does not

**Search vectors and tag counts are maintained by triggers**, in migration
`009`, and by nothing else. That is deliberate: a posting edited directly in the
Supabase table editor stays searchable and the tag counts stay honest.

**Do not write `gftvjobs_jobs.search_vector` or `gftvjobs_tags.usage_count` from
`main-site/api`.**

**The weighted search, the snippets and the trigram fallback are Postgres
functions**, called with `supabase.rpc()`. They are awkward to express through
PostgREST filters, which is why they are functions and not query builders.

## Two things worth knowing before the first run

**`gftvhello_users.id` must be `uuid`.** Several tables have a foreign key to
it, and four migrations fail at that key if it turns out to be something else.

**Five tables are not in section 6 of the specification.** The audit log, the
settings, the cron runs, the rate limits and the access overlay exist because
behaviour the brief requires had nowhere to live. The header comment in `012`
names the section behind each one.

## The one thing written from outside Vercel

**`gftvjobs_status_days` and `gftvjobs_status_incidents`** are written by
`telegram-bot/probe.py` on the VPS, through `gftvjobs_status_record()`. Nothing
in `main-site/api` writes them: the status page reads them and the daily cron
sweeps them at ninety days.

**Neither carries a foreign key, on purpose.** They are observations about an
address at a moment, and they have to be writable while the portal is answering
500 to everything.
