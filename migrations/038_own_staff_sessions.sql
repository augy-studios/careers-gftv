-- 038_own_staff_sessions.sql
--
-- Creates: gftvjobs_staff_sessions, gftvjobs_docs_sessions,
--          gftvjobs_staff_recovery_codes.
-- Spec:    section 5a (staff realm), 5h (the docs site session), 5g (staff
--          account recovery codes), section 6 (New tables).
-- Run after: 037, the previous numbered file. It depends on nothing else here,
--            only on gftvhello_users existing, which it always has.
--
-- ---------------------------------------------------------------------------
-- Why the first of these three exists, which is a deviation from 5a
-- ---------------------------------------------------------------------------
--
-- 5a says the portal's staff realm uses "the existing gftvhello_users and
-- gftvhello_sessions tables, so the same accounts that sign in at gftv.asia
-- work here". The accounts half of that sentence is right and is unchanged:
-- gftvhello_users stays the one source of who a staff member is, read only,
-- exactly as before. **The sessions half turned out to couple the two sites in
-- a way nobody wanted.**
--
-- What was reported, 31 August 2026: a staff session on the portal did not last
-- more than about a day even with "stay signed in" ticked for 30 days, and
-- signing in on one site ended the session on the other.
--
-- What was measured before anything was changed. The portal issues exactly what
-- it promises: `stay_signed_in: true` produces a cookie whose Expires is 30.00
-- days out and a row whose expires_at reads the same, confirmed against the
-- deployment. The portal deletes a staff session row in three places and no
-- others -- a logout, a row found genuinely expired on read, and
-- invalidateAllSessions, which is never called for the staff realm anywhere in
-- the codebase -- and the daily cron deliberately excludes gftvhello_sessions,
-- with section 11's rule written beside it.
--
-- So nothing in this repository shortens or deletes those rows, and the two
-- sites nevertheless end each other's sessions. What is left is the table: one
-- set of rows, two applications, and the other one applying its own rules to
-- rows it did not create. **A session is not an account.** Sharing the accounts
-- is the point of 5a; sharing the session rows was a consequence of it rather
-- than a requirement, and it is the consequence being undone here.
--
-- **This is the answer the specification already gives elsewhere.** 5h has the
-- docs site sign staff in against the same accounts with its own cookie and its
-- own table, "so a docs sign in is never mistaken for a gftv.asia one, and
-- separate from any portal staff session so signing out of one site does not
-- sign you out of the other". That is three sites and three session tables over
-- one set of accounts, and the portal is the one that never got it.
--
-- ---------------------------------------------------------------------------
-- What applying this does to anybody signed in
-- ---------------------------------------------------------------------------
--
-- **Every current portal staff session ends once.** The rows in
-- gftvhello_sessions are not copied across: they belong to the other site's
-- table and moving them would be writing rows there that this build has no
-- business writing. Signing in again is the whole of the migration path, and
-- nothing else about an account changes -- not the password, not the second
-- factor, not a trusted device, not a passkey.
--
-- **Apply this file before deploying the code that reads it.** The order is the
-- other way round from most of this build: the portal reads
-- gftvjobs_staff_sessions from the commit that lands with it, so a deploy in
-- front of the migration is a staff sign in that fails on a missing table.
--
-- ---------------------------------------------------------------------------
-- The other two tables, which are phase 13's and are here for one reason
-- ---------------------------------------------------------------------------
--
-- gftvjobs_docs_sessions and gftvjobs_staff_recovery_codes are both specified
-- in section 6 and are both wanted by phase 13. They are in this file rather
-- than a later one because they are the same concern as the table above --
-- where a staff session lives, and how a staff account gets back in -- and
-- because one hand applied file is cheaper than two. Nothing reads either of
-- them yet, which is the state gftvjobs_notifications was in for ten phases.

begin;

-- ---------------------------------------------------------------------------
-- The portal's own staff sessions
-- ---------------------------------------------------------------------------
--
-- Mirrors gftvhello_sessions column for column, on purpose: the read and write
-- paths in api/_lib/session.js keep their shape, and the only thing that
-- changes there is which table is named and that a staff session is no longer
-- one of the gftvhello writes section 2 permits.
--
-- staff_user_id rather than user_id, matching what section 6 specifies for
-- gftvjobs_docs_sessions below. The two tables are read by the same shaped code
-- on two sites and a column that is named differently in each would be a defect
-- waiting for whoever copies one into the other.

create table if not exists gftvjobs_staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references gftvhello_users (id) on delete cascade,
  token         text not null unique,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists gftvjobs_staff_sessions_token_idx
  on gftvjobs_staff_sessions (token);

create index if not exists gftvjobs_staff_sessions_staff_user_id_idx
  on gftvjobs_staff_sessions (staff_user_id);

-- Expired rows are deleted on read, per 5a, and the daily cron sweeps whatever
-- that misses. This index is what makes the sweep cheap.
create index if not exists gftvjobs_staff_sessions_expires_at_idx
  on gftvjobs_staff_sessions (expires_at);

alter table gftvjobs_staff_sessions enable row level security;

comment on table gftvjobs_staff_sessions is
  'Portal staff sessions. Separate from gftvhello_sessions since 038 so the two sites cannot end each other''s sessions, and separate from gftvjobs_docs_sessions for the same reason. The accounts are still gftvhello_users.';

-- ---------------------------------------------------------------------------
-- The docs site's sessions, per 5h. Phase 13 reads this.
-- ---------------------------------------------------------------------------
--
-- Section 6, word for word: "Mirrors gftvjobs_sessions for the other realm and
-- the other site, per 5h. Separate from gftvhello_sessions so a docs sign in is
-- never mistaken for a gftv.asia one, and separate from any portal staff
-- session so signing out of one site does not sign you out of the other."

create table if not exists gftvjobs_docs_sessions (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references gftvhello_users (id) on delete cascade,
  token         text not null unique,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists gftvjobs_docs_sessions_token_idx
  on gftvjobs_docs_sessions (token);

create index if not exists gftvjobs_docs_sessions_staff_user_id_idx
  on gftvjobs_docs_sessions (staff_user_id);

create index if not exists gftvjobs_docs_sessions_expires_at_idx
  on gftvjobs_docs_sessions (expires_at);

alter table gftvjobs_docs_sessions enable row level security;

comment on table gftvjobs_docs_sessions is
  'Docs site staff sessions, per 5h. Its own cookie, gftv_docs_session, and never gftvhello_sessions.';

-- ---------------------------------------------------------------------------
-- Staff account recovery codes, per 5g. Phase 13 reads this.
-- ---------------------------------------------------------------------------
--
-- One row per code, deleted on use, and accepted only on the staff forgot
-- password flow -- never at the second factor step, which is what
-- gftvhello_backup_codes is for. The two are different answers to different
-- questions and 5g is explicit that they must not be interchangeable.
--
-- The hash column is code_hash, matching gftvhello_backup_codes and
-- gftvjobs_recovery_codes, because api/_lib/accounts.js hashes and compares a
-- code set in one place for every realm.

create table if not exists gftvjobs_staff_recovery_codes (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references gftvhello_users (id) on delete cascade,
  code_hash     text not null,
  created_at    timestamptz not null default now()
);

create index if not exists gftvjobs_staff_recovery_codes_staff_user_id_idx
  on gftvjobs_staff_recovery_codes (staff_user_id);

alter table gftvjobs_staff_recovery_codes enable row level security;

comment on table gftvjobs_staff_recovery_codes is
  'Staff account recovery codes, per 5g. The way back into a staff account, and never a second factor: gftvhello_backup_codes is that.';

-- ---------------------------------------------------------------------------
-- Record it, and record the two that forgot to
-- ---------------------------------------------------------------------------
--
-- **034 and 037 never recorded themselves**, found on 31 August 2026 by reading
-- every file in this directory for the line below. Both have been applied and
-- both are absent from the log, so `select filename from gftvjobs_migrations`
-- has been under-reporting by two since 30 August. Section 6: that table is the
-- only record of what has been run, since nothing automated is tracking it, and
-- a record that is quietly short is worse than none.
--
-- **They are backfilled here rather than fixed in place**, because the first
-- rule in this directory is that a file which has already been run is never
-- edited. `applied_at` is the time this file runs rather than the time they
-- did, which is a small lie the alternative -- inventing a date -- makes
-- larger. `on conflict do nothing` so re-running 038 cannot rewrite it.

insert into gftvjobs_migrations (filename)
values
  ('034_translation_authorship.sql'),
  ('037_status_checks.sql')
on conflict (filename) do nothing;

insert into gftvjobs_migrations (filename)
values ('038_own_staff_sessions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Dropping the first table signs every staff member out of the portal, and the
-- code has to go back to gftvhello_sessions in the same breath -- T.staffSessions
-- in api/_lib/supabase.js and the staff paths in api/_lib/session.js. Rolling
-- back the schema alone leaves a portal whose sign in inserts into nothing.
--
-- begin;
-- drop table if exists gftvjobs_staff_recovery_codes;
-- drop table if exists gftvjobs_docs_sessions;
-- drop table if exists gftvjobs_staff_sessions;
-- delete from gftvjobs_migrations where filename = '038_own_staff_sessions.sql';
-- commit;
