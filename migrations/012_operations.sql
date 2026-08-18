-- 012_operations.sql
--
-- Creates: gftvjobs_audit_log, gftvjobs_settings, gftvjobs_cron_runs,
--          gftvjobs_rate_limits, gftvjobs_admin_access.
-- Spec:    7g (danger zone), section 8.8, 8.9, 8.10, section 9 (rate
--          limiting), section 10 item 2 (admin access), section 11
--          (scheduled maintenance).
-- Run after: 002, 005.
--
-- None of these five tables appear in the section 6 list. Each one exists
-- because behaviour the spec requires has nowhere else to live, and each was
-- confirmed before this file was written. Recorded in next-steps.md.
--
--   gftvjobs_audit_log     7g "every destructive action writes an audit row
--                          before it executes", 8.9 "logged with the admin's
--                          id and a required reason", 11 "writing an audit
--                          row".
--   gftvjobs_settings      8.10 portal title, hero copy, featured job, and
--                          the global applications toggle that 7a checks on
--                          every apply.
--   gftvjobs_cron_runs     11 "surface the last cron run time and its results
--                          on the admin overview".
--   gftvjobs_rate_limits   9 allows a table backed or an in-memory limiter
--                          and asks for the choice to be stated. Table backed
--                          was chosen: each Vercel function instance has its
--                          own memory, so an in-memory limiter resets
--                          constantly and cannot hold a one hour lockout.
--   gftvjobs_admin_access  8.8 wants grant and revoke of portal access, while
--                          section 2 forbids writing to any gftvhello_ table
--                          outside the session, challenge, trusted device,
--                          and backup code rows. This overlay resolves that:
--                          gftvhello_users stays read only and the override
--                          lives here.

begin;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

-- Written before the action executes, so the record survives the deletion it
-- describes. Rows are never updated and never deleted by application code.
create table if not exists gftvjobs_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_realm  text not null,
  actor_id     uuid,
  actor_label  text,
  action       text not null,
  target_table text,
  target_id    uuid,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),

  constraint gftvjobs_audit_log_actor_realm_check
    check (actor_realm in ('staff', 'applicant', 'system', 'webhook', 'cron'))
);

create index if not exists gftvjobs_audit_log_created_at_idx
  on gftvjobs_audit_log (created_at desc);

create index if not exists gftvjobs_audit_log_actor_idx
  on gftvjobs_audit_log (actor_realm, actor_id, created_at desc);

create index if not exists gftvjobs_audit_log_target_idx
  on gftvjobs_audit_log (target_table, target_id, created_at desc);

comment on table gftvjobs_audit_log is
  'Append only. Written before a destructive action runs so the record outlives its target.';
comment on column gftvjobs_audit_log.actor_id is
  'A gftvhello_users id when actor_realm is staff, a gftvjobs_users id when it is applicant. Deliberately no foreign key: the row must survive the account being deleted.';
comment on column gftvjobs_audit_log.actor_label is
  'Username captured at the time of the action, so the log stays readable after the account is gone.';

-- ---------------------------------------------------------------------------
-- Portal settings
-- ---------------------------------------------------------------------------

-- Key and value rather than a single wide row, so section 8.10 can gain a
-- setting without a migration.
create table if not exists gftvjobs_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references gftvhello_users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists gftvjobs_settings_touch on gftvjobs_settings;
create trigger gftvjobs_settings_touch
  before update on gftvjobs_settings
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_settings is
  'Portal settings from section 8.10. Read by the public site and written only from the admin dashboard.';

insert into gftvjobs_settings (key, value, description) values
  ('portal_title',
   '"Careers@GFTV"'::jsonb,
   'Site title shown in the header and used in page titles.'),
  ('hero_heading',
   '"Volunteer with Global Furry Television"'::jsonb,
   'Home page hero heading.'),
  ('hero_body',
   '"Find a role, apply in a few minutes, and help make the fandom''s television station."'::jsonb,
   'Home page hero supporting line.'),
  ('featured_job_ids',
   '[]'::jsonb,
   'Ordered list of job uuids to feature on the home page. Empty means show the latest published postings instead.'),
  ('applications_open',
   'true'::jsonb,
   'Global applications toggle. When false, every Apply endpoint refuses and every Apply button is disabled with the reason. Checked server side on every apply, per 7a.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Cron runs
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null default 'daily',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  results     jsonb not null default '{}'::jsonb,
  error       text
);

create index if not exists gftvjobs_cron_runs_started_at_idx
  on gftvjobs_cron_runs (job_name, started_at desc);

comment on table gftvjobs_cron_runs is
  'One row per run of the daily maintenance function. The admin overview shows the most recent, per section 11.';
comment on column gftvjobs_cron_runs.results is
  'Per task counts, for example {"auto_closed": 2, "form_checks_failed": 1, "prompts_timed_out": 5, "expired_rows_deleted": 40}.';

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- Fixed window counter. bucket identifies what is limited, for example
-- "applicant_login", and subject identifies who, for example an account id or
-- a hashed IP. Section 5c requires limiting per account and per IP, so both
-- are separate rows under different buckets.
create table if not exists gftvjobs_rate_limits (
  bucket        text not null,
  subject       text not null,
  window_start  timestamptz not null,
  attempts      int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now(),

  primary key (bucket, subject, window_start)
);

create index if not exists gftvjobs_rate_limits_window_idx
  on gftvjobs_rate_limits (window_start);

create index if not exists gftvjobs_rate_limits_locked_idx
  on gftvjobs_rate_limits (locked_until)
  where locked_until is not null;

comment on table gftvjobs_rate_limits is
  'Table backed limiter, chosen because each Vercel function instance has its own memory and could not hold the one hour lockouts in 5c and 7g. Swept by the daily cron.';
comment on column gftvjobs_rate_limits.subject is
  'Never a raw IP address. Hash it, in line with the section 6 rule that no IP is stored anywhere in this build.';

-- ---------------------------------------------------------------------------
-- Admin access overlay
-- ---------------------------------------------------------------------------

-- The effective check on every admin route is:
--
--   1. The gftvhello_users row exists and is_approved is true. Always
--      required, and no overlay row can waive it.
--   2. If a row exists here for that user, its granted value decides access.
--   3. Otherwise, access is is_admin or is_editor, per section 10 item 2.
--
-- Granting or revoking in section 8.8 writes only to this table.
-- gftvhello_users is never written to from this portal.
create table if not exists gftvjobs_admin_access (
  staff_user_id uuid primary key references gftvhello_users (id) on delete cascade,
  granted       boolean not null,
  reason        text,
  granted_by    uuid references gftvhello_users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists gftvjobs_admin_access_touch on gftvjobs_admin_access;
create trigger gftvjobs_admin_access_touch
  before update on gftvjobs_admin_access
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_admin_access is
  'Per user override on top of the section 10 access rule. Keeps gftvhello_users read only, per section 2.';
comment on column gftvjobs_admin_access.granted is
  'True allows a user who fails the is_admin or is_editor check. False denies one who passes it. is_approved is required either way.';

alter table gftvjobs_audit_log    enable row level security;
alter table gftvjobs_settings     enable row level security;
alter table gftvjobs_cron_runs    enable row level security;
alter table gftvjobs_rate_limits  enable row level security;
alter table gftvjobs_admin_access enable row level security;

insert into gftvjobs_migrations (filename)
values ('012_operations.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_admin_access;
-- drop table if exists gftvjobs_rate_limits;
-- drop table if exists gftvjobs_cron_runs;
-- drop table if exists gftvjobs_settings;
-- drop table if exists gftvjobs_audit_log;
-- delete from gftvjobs_migrations where filename = '012_operations.sql';
-- commit;
