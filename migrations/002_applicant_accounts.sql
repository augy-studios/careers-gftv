-- 002_applicant_accounts.sql
--
-- Creates: gftvjobs_touch_updated_at(), gftvjobs_users, gftvjobs_sessions.
-- Spec:    section 5b (Applicant realm), section 6 (New tables).
-- Run after: 001.
--
-- This is the applicant realm only. The staff realm uses the existing
-- gftvhello_users and gftvhello_sessions tables, which nothing in this
-- directory creates, alters, or drops.
--
-- totp_secret is nullable and unused for now. Section 5b asks for the column
-- to exist so app based 2FA can be added later without a migration. The
-- second factor that actually ships is Telegram, per section 15.
--
-- Case insensitive uniqueness: section 5b requires uniqueness on username and
-- email, and section 5a establishes that logins are looked up case
-- insensitively. The plain unique constraints from section 6 are kept, and a
-- unique index on lower() is added on top of each so "Bob" and "bob" cannot
-- both be registered.

begin;

-- Shared updated_at trigger function, reused by every table in this build
-- that carries an updated_at column.
create or replace function gftvjobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists gftvjobs_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  display_name  text not null,
  email         text not null unique,
  password_hash text not null,
  avatar_url    text,
  phone         text,
  totp_secret   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists gftvjobs_users_username_lower_key
  on gftvjobs_users (lower(username));

create unique index if not exists gftvjobs_users_email_lower_key
  on gftvjobs_users (lower(email));

drop trigger if exists gftvjobs_users_touch on gftvjobs_users;
create trigger gftvjobs_users_touch
  before update on gftvjobs_users
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_users is
  'Applicant accounts. Separate realm from gftvhello_users, which is staff. Never linked to it.';
comment on column gftvjobs_users.password_hash is
  'bcrypt, same format as gftvhello_users so the hashing code is shared.';
comment on column gftvjobs_users.totp_secret is
  'Reserved for app based 2FA. Unused in this build, see section 5b.';

create table if not exists gftvjobs_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references gftvjobs_users (id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- The unique constraint on token already provides the lookup index section 6
-- asks for, so only user_id needs one adding.
create index if not exists gftvjobs_sessions_user_id_idx
  on gftvjobs_sessions (user_id);

-- Used by the daily cron in section 11 to sweep expired rows.
create index if not exists gftvjobs_sessions_expires_at_idx
  on gftvjobs_sessions (expires_at);

comment on table gftvjobs_sessions is
  'Applicant sessions, cookie gftv_applicant_session. Length set by the stay signed in choice in 5d.';

alter table gftvjobs_users    enable row level security;
alter table gftvjobs_sessions enable row level security;

insert into gftvjobs_migrations (filename)
values ('002_applicant_accounts.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_sessions;
-- drop table if exists gftvjobs_users;
-- -- Only drop the function if no later migration still uses it.
-- -- drop function if exists gftvjobs_touch_updated_at();
-- delete from gftvjobs_migrations where filename = '002_applicant_accounts.sql';
-- commit;
