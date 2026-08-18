-- 001_extensions_and_migration_log.sql
--
-- Creates: the pg_trgm and pgcrypto extensions, and the gftvjobs_migrations
--          table that records which of these files have been run.
-- Spec:    section 2 (Supabase specifics), section 6 (Migrations).
-- Run after: nothing. This is the first file.
--
-- pg_trgm backs the typo fallback and the autocomplete in section 4.
-- pgcrypto provides gen_random_uuid() where it is not already built in.
-- Postgres 13 and up have gen_random_uuid() in core, so the extension is
-- usually a no-op, but it is requested idempotently so this file is safe on
-- any version.
--
-- gftvjobs_migrations is the only record of what has been applied, since
-- there is no CLI and no migration runner. Every file in this directory ends
-- by inserting its own filename here.

begin;

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table if not exists gftvjobs_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);

comment on table gftvjobs_migrations is
  'Record of which migration files have been run by hand in the SQL editor. Written by the migration files themselves.';

-- No row level security here. This table holds no user data and is only ever
-- read in the SQL editor. Every gftvjobs_ table that holds data enables RLS
-- with no policies, per section 2.

insert into gftvjobs_migrations (filename)
values ('001_extensions_and_migration_log.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_migrations;
-- -- Extensions are left alone on purpose. Other GFTV apps share this project
-- -- and may depend on them. Drop them only after checking:
-- --   drop extension if exists pg_trgm;
-- --   drop extension if exists pgcrypto;
-- commit;
