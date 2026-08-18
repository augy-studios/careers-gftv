-- 011_telegram_and_notifications.sql
--
-- Creates: gftvjobs_telegram_links, gftvjobs_telegram_tokens,
--          gftvjobs_notifications.
-- Spec:    section 6 (New tables), section 15 (Telegram bot), section 10
--          item 4 (all three notification kinds ship).
-- Run after: 002.
--
-- One Telegram account links to one portal account and vice versa, enforced by
-- unique constraints on both sides.
--
-- gftvjobs_telegram_tokens stores hashes only, never the code or the token
-- itself. The magic link variant is a full login rather than a second factor,
-- so its browser_nonce_hash binding is not optional: a forwarded link must be
-- useless to anyone else.
--
-- gftvjobs_notifications is the outbox. The site never calls the bot. It
-- writes a row here and returns. The bot polls every 15 to 30 seconds and
-- claims a batch by moving rows from queued to claimed in a single conditional
-- update, so two bot instances cannot double send.
--
-- Security messages, such as a password change or a new trusted device, are
-- sent directly rather than queued, and are not subject to the notify
-- toggles, since silencing them is what an attacker would want.

begin;

create table if not exists gftvjobs_telegram_links (
  id                    uuid primary key default gen_random_uuid(),
  applicant_id          uuid not null unique
                          references gftvjobs_users (id) on delete cascade,
  telegram_user_id      bigint not null unique,
  telegram_username     text,
  telegram_display_name text,
  twofa_enabled         boolean not null default false,

  -- Per kind toggles from the notify command. Security messages ignore these.
  notify_invite                     boolean not null default true,
  notify_task_raised                boolean not null default true,
  notify_application_status_changed boolean not null default true,

  linked_at        timestamptz not null default now(),
  last_notified_at timestamptz
);

comment on table gftvjobs_telegram_links is
  'One Telegram account to one portal account. Telegram is a delivery channel and never the only record of anything.';
comment on column gftvjobs_telegram_links.twofa_enabled is
  'Requires a 2FA backup code set to exist before it can be turned on, per 5c.';
comment on column gftvjobs_telegram_links.notify_invite is
  'The three notify toggles are per kind, per section 10 item 4. Security messages are not toggleable.';

create table if not exists gftvjobs_telegram_tokens (
  id                 uuid primary key default gen_random_uuid(),
  applicant_id       uuid not null references gftvjobs_users (id) on delete cascade,
  token_hash         text not null,
  purpose            text not null,
  expires_at         timestamptz not null,
  used_at            timestamptz,
  attempts           int not null default 0,
  browser_nonce_hash text,
  created_at         timestamptz not null default now(),

  constraint gftvjobs_telegram_tokens_purpose_check
    check (purpose in ('link', 'login_code', 'magic_link'))
);

create index if not exists gftvjobs_telegram_tokens_applicant_purpose_idx
  on gftvjobs_telegram_tokens (applicant_id, purpose, created_at desc);

create index if not exists gftvjobs_telegram_tokens_expires_at_idx
  on gftvjobs_telegram_tokens (expires_at);

-- The bot looks a linking token up by hash on /start <token>.
create index if not exists gftvjobs_telegram_tokens_token_hash_idx
  on gftvjobs_telegram_tokens (token_hash);

comment on table gftvjobs_telegram_tokens is
  'Hashes only. Linking tokens expire in ten minutes, login codes and magic links in five. All single use.';
comment on column gftvjobs_telegram_tokens.browser_nonce_hash is
  'Required for magic_link, which is a full login. Binds the link to the browser that requested it.';

create table if not exists gftvjobs_notifications (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references gftvjobs_users (id) on delete cascade,
  kind         text not null,
  payload      jsonb not null,
  status       text not null default 'queued',
  claimed_at   timestamptz,
  sent_at      timestamptz,
  error        text,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),

  constraint gftvjobs_notifications_status_check
    check (status in ('queued', 'claimed', 'sent', 'failed', 'skipped'))
);

create index if not exists gftvjobs_notifications_status_created_idx
  on gftvjobs_notifications (status, created_at);

create index if not exists gftvjobs_notifications_applicant_id_idx
  on gftvjobs_notifications (applicant_id, created_at desc);

-- The bot's claim query only ever looks at queued rows.
create index if not exists gftvjobs_notifications_queued_idx
  on gftvjobs_notifications (created_at)
  where status = 'queued';

comment on table gftvjobs_notifications is
  'Outbox drained by the Telegram bot. kind is invite, task_raised, or application_status_changed.';
comment on column gftvjobs_notifications.status is
  'An applicant with no Telegram link gets their rows marked skipped rather than left queued forever.';

alter table gftvjobs_telegram_links  enable row level security;
alter table gftvjobs_telegram_tokens enable row level security;
alter table gftvjobs_notifications   enable row level security;

insert into gftvjobs_migrations (filename)
values ('011_telegram_and_notifications.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_notifications;
-- drop table if exists gftvjobs_telegram_tokens;
-- drop table if exists gftvjobs_telegram_links;
-- delete from gftvjobs_migrations where filename = '011_telegram_and_notifications.sql';
-- commit;
