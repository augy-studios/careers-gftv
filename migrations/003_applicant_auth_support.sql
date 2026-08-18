-- 003_applicant_auth_support.sql
--
-- Creates: gftvjobs_2fa_backup_codes, gftvjobs_recovery_codes,
--          gftvjobs_password_resets, gftvjobs_trusted_devices.
-- Spec:    section 5c (Recovery codes), section 5d (Session length and
--          trusted devices), section 6 (New tables).
-- Run after: 002.
--
-- The two code tables are deliberately separate rather than one table with a
-- purpose column, per section 5c. The separation is the security property: a
-- 2FA backup code must never satisfy the forgot password flow, and a query
-- against one table can never accidentally satisfy the other. Do not merge
-- them and do not add a purpose column.
--
--   gftvjobs_2fa_backup_codes  gets past the second factor only
--   gftvjobs_recovery_codes    gets past the password, so it is a full
--                              account credential
--
-- Both store bcrypt hashes, one row per code, and the row is deleted on use
-- rather than flagged.
--
-- gftvjobs_trusted_devices mirrors the existing gftvhello_trusted_devices,
-- but stores the device token hashed. The gftvhello table stores it in the
-- clear and is not altered here, since it has compatibility to preserve.

begin;

create table if not exists gftvjobs_2fa_backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references gftvjobs_users (id) on delete cascade,
  code_hash  text not null,
  created_at timestamptz not null default now()
);

create index if not exists gftvjobs_2fa_backup_codes_user_id_idx
  on gftvjobs_2fa_backup_codes (user_id);

comment on table gftvjobs_2fa_backup_codes is
  'Accepted only at the second factor step of login, in place of a Telegram code. Never on forgot password. See section 5c.';

create table if not exists gftvjobs_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references gftvjobs_users (id) on delete cascade,
  code_hash  text not null,
  created_at timestamptz not null default now()
);

create index if not exists gftvjobs_recovery_codes_user_id_idx
  on gftvjobs_recovery_codes (user_id);

comment on table gftvjobs_recovery_codes is
  'Accepted only on the forgot password flow. A full account credential, since one code plus nothing else sets a new password. See section 5c.';

-- Short lived single use ticket, issued only after a valid recovery code and
-- bound to the browser that verified it. The password change is never
-- accepted in the same request that verifies the code.
create table if not exists gftvjobs_password_resets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references gftvjobs_users (id) on delete cascade,
  ticket_hash        text not null,
  browser_nonce_hash text not null,
  expires_at         timestamptz not null,
  used_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists gftvjobs_password_resets_user_id_idx
  on gftvjobs_password_resets (user_id);

create index if not exists gftvjobs_password_resets_expires_at_idx
  on gftvjobs_password_resets (expires_at);

comment on table gftvjobs_password_resets is
  'Single use reset tickets from the forgot password flow in 5c. Swept by the daily cron in section 11.';

create table if not exists gftvjobs_trusted_devices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references gftvjobs_users (id) on delete cascade,
  device_token_hash text not null unique,
  label             text,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '30 days')
);

-- The unique constraint on device_token_hash provides its lookup index.
create index if not exists gftvjobs_trusted_devices_user_id_idx
  on gftvjobs_trusted_devices (user_id);

create index if not exists gftvjobs_trusted_devices_expires_at_idx
  on gftvjobs_trusted_devices (expires_at);

comment on table gftvjobs_trusted_devices is
  'Skips the second factor only, never the password. Token rotated on every use and the expiry pushed out, per 5d.';
comment on column gftvjobs_trusted_devices.device_token_hash is
  'Hashed, unlike the gftvhello equivalent. New table, no compatibility to preserve.';

alter table gftvjobs_2fa_backup_codes enable row level security;
alter table gftvjobs_recovery_codes   enable row level security;
alter table gftvjobs_password_resets  enable row level security;
alter table gftvjobs_trusted_devices  enable row level security;

insert into gftvjobs_migrations (filename)
values ('003_applicant_auth_support.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_trusted_devices;
-- drop table if exists gftvjobs_password_resets;
-- drop table if exists gftvjobs_recovery_codes;
-- drop table if exists gftvjobs_2fa_backup_codes;
-- delete from gftvjobs_migrations where filename = '003_applicant_auth_support.sql';
-- commit;
