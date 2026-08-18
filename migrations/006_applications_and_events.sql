-- 006_applications_and_events.sql
--
-- Creates: gftvjobs_applications, gftvjobs_application_events.
-- Spec:    section 6 (New tables), section 7a (clicking Apply), 7e
--          (withdrawing), 7f (reapply cooldown), section 13 (webhook).
-- Run after: 005.
--
-- gftvjobs_applications is a tracking record, not the application itself.
-- The answers live in Google Forms and never enter this database, per
-- section 10. This table records who was handed over to which form and where
-- they are in the pipeline.
--
-- One row per applicant per posting, enforced by the unique constraint. A
-- repeat click on Apply updates updated_at rather than inserting a duplicate.
-- The append only event log lives in gftvjobs_analytics, created in 007, and
-- the two are kept in sync in the same request. Never derive one by
-- rewriting the other.
--
-- applied_at and cooldown_until are both null while the row is at 'started'.
-- They are set only on a positive confirmation, per 7f, which is the
-- applicant clicking Yes in the handoff modal or the section 13 webhook
-- reporting the submission. A click alone never sets them, and silence never
-- sets them. Both are cleared on withdrawal.
--
-- One deliberate addition to the column list in section 6, recorded in
-- next-steps.md: gftvjobs_application_events.source. changed_by only takes a
-- gftvhello_users uuid, so there is otherwise no way to satisfy section 13's
-- requirement to write an event row "attributing the change to the webhook",
-- nor to attribute an applicant withdrawal or a cron action.

begin;

create table if not exists gftvjobs_applications (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references gftvjobs_jobs (id) on delete cascade,
  applicant_id   uuid not null references gftvjobs_users (id) on delete cascade,
  status         text not null default 'started',
  admin_note     text,
  started_at     timestamptz not null default now(),
  applied_at     timestamptz,
  cooldown_until timestamptz,
  updated_at     timestamptz not null default now(),

  constraint gftvjobs_applications_status_check
    check (status in (
      'started', 'submitted', 'under_review', 'shortlisted',
      'interview', 'offered', 'accepted', 'rejected', 'withdrawn'
    )),

  constraint gftvjobs_applications_job_applicant_key
    unique (job_id, applicant_id)
);

create index if not exists gftvjobs_applications_applicant_id_idx
  on gftvjobs_applications (applicant_id, updated_at desc);

create index if not exists gftvjobs_applications_job_id_idx
  on gftvjobs_applications (job_id, status);

-- The admin overview and the applicant tracking page are both bucketed by
-- status with live counts, per section 8.1.
create index if not exists gftvjobs_applications_status_idx
  on gftvjobs_applications (status, updated_at desc);

-- Only rows inside an active cooldown matter to the apply endpoint.
create index if not exists gftvjobs_applications_cooldown_idx
  on gftvjobs_applications (cooldown_until)
  where cooldown_until is not null;

drop trigger if exists gftvjobs_applications_touch on gftvjobs_applications;
create trigger gftvjobs_applications_touch
  before update on gftvjobs_applications
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_applications is
  'Tracking record per applicant per posting. Holds no application content, which stays in Google Forms.';
comment on column gftvjobs_applications.applied_at is
  'Set only on a positive confirmation, per 7f. Null while the row is at started. Cleared on withdrawal.';
comment on column gftvjobs_applications.cooldown_until is
  'Stored rather than computed on read, so a policy change does not retroactively move existing cooldowns and an admin can waive a single row.';

create table if not exists gftvjobs_application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references gftvjobs_applications (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  note           text,
  source         text not null default 'admin',
  changed_by     uuid references gftvhello_users (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint gftvjobs_application_events_source_check
    check (source in ('admin', 'applicant', 'webhook', 'cron', 'system'))
);

create index if not exists gftvjobs_application_events_application_id_idx
  on gftvjobs_application_events (application_id, created_at desc);

comment on table gftvjobs_application_events is
  'Append only status history. Every status change on gftvjobs_applications writes a row here.';
comment on column gftvjobs_application_events.source is
  'What produced the change. changed_by is a staff id and is null for anything that is not an admin action.';

alter table gftvjobs_applications       enable row level security;
alter table gftvjobs_application_events enable row level security;

insert into gftvjobs_migrations (filename)
values ('006_applications_and_events.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_application_events;
-- drop table if exists gftvjobs_applications;
-- delete from gftvjobs_migrations where filename = '006_applications_and_events.sql';
-- commit;
