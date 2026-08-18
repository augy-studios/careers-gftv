-- 008_tasks_invites_and_submissions.sql
--
-- Creates: gftvjobs_tasks, gftvjobs_invites, gftvjobs_form_submissions.
-- Spec:    section 6 (New tables), 7g (outstanding tasks), section 8.5
--          (invites and shortlists), section 13 (Apps Script webhook).
-- Run after: 006.
--
-- gftvjobs_tasks holds admin raised items only. Unanswered apply prompts are
-- never copied into this table. They are derived live from
-- gftvjobs_analytics rows at response_state pending, and /account/tasks
-- unions the two at read time. Copying them would guarantee the two drift
-- apart.
--
-- task_type is plain text with a default rather than a tight check
-- constraint, so a new type does not need a migration. The two supported
-- from the start are info_request and notice.
--
-- The reply model is deliberately one round: the admin asks, the applicant
-- replies once into response_text, the admin reads it and resolves. This is
-- not a messaging thread and should not grow into one without a decision to
-- build that properly.

begin;

create table if not exists gftvjobs_tasks (
  id             uuid primary key default gen_random_uuid(),
  applicant_id   uuid not null references gftvjobs_users (id) on delete cascade,
  job_id         uuid references gftvjobs_jobs (id) on delete set null,
  application_id uuid references gftvjobs_applications (id) on delete set null,
  task_type      text not null default 'info_request',
  title          text not null,
  body           text,
  status         text not null default 'open',
  response_text  text,
  responded_at   timestamptz,
  raised_by      uuid references gftvhello_users (id) on delete set null,
  resolved_by    uuid references gftvhello_users (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint gftvjobs_tasks_status_check
    check (status in ('open', 'awaiting_admin', 'resolved', 'dismissed'))
);

create index if not exists gftvjobs_tasks_applicant_status_idx
  on gftvjobs_tasks (applicant_id, status, created_at desc);

create index if not exists gftvjobs_tasks_job_id_idx
  on gftvjobs_tasks (job_id);

-- Section 8.3 shows any open task inline on the applicant tracking row.
create index if not exists gftvjobs_tasks_open_idx
  on gftvjobs_tasks (created_at desc)
  where status in ('open', 'awaiting_admin');

drop trigger if exists gftvjobs_tasks_touch on gftvjobs_tasks;
create trigger gftvjobs_tasks_touch
  before update on gftvjobs_tasks
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_tasks is
  'Admin raised items for an applicant. Unanswered apply prompts never live here, see 7g.';
comment on column gftvjobs_tasks.task_type is
  'Open on purpose. info_request and notice ship first, more can be added without a migration.';
comment on column gftvjobs_tasks.status is
  'The applicant replying moves the row to awaiting_admin. Only an admin moves it to resolved.';

create table if not exists gftvjobs_invites (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references gftvjobs_jobs (id) on delete cascade,
  applicant_id uuid not null references gftvjobs_users (id) on delete cascade,
  invited_by   uuid references gftvhello_users (id) on delete set null,
  note         text,
  status       text not null default 'invited',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint gftvjobs_invites_status_check
    check (status in ('invited', 'seen', 'applied', 'declined', 'withdrawn')),

  constraint gftvjobs_invites_job_applicant_key
    unique (job_id, applicant_id)
);

create index if not exists gftvjobs_invites_applicant_id_idx
  on gftvjobs_invites (applicant_id, created_at desc);

create index if not exists gftvjobs_invites_job_id_idx
  on gftvjobs_invites (job_id, status);

drop trigger if exists gftvjobs_invites_touch on gftvjobs_invites;
create trigger gftvjobs_invites_touch
  before update on gftvjobs_invites
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_invites is
  'An invite to apply, and also the internal shortlist marker. Telegram is a delivery channel for these, never the only record.';

-- Section 13. Written by the Apps Script webhook, which sends only the email,
-- the response id, and the timestamp. The answers themselves never leave
-- Google.
create table if not exists gftvjobs_form_submissions (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references gftvjobs_jobs (id) on delete cascade,
  form_response_id     text not null,
  email                text not null,
  submitted_at         timestamptz not null,
  matched_applicant_id uuid references gftvjobs_users (id) on delete set null,
  received_at          timestamptz not null default now(),

  constraint gftvjobs_form_submissions_job_response_key
    unique (job_id, form_response_id)
);

create index if not exists gftvjobs_form_submissions_job_id_idx
  on gftvjobs_form_submissions (job_id, submitted_at desc);

create index if not exists gftvjobs_form_submissions_email_lower_idx
  on gftvjobs_form_submissions (lower(email));

-- Section 8.4 lists these under "unmatched submissions" so an admin can link
-- them by hand. Someone applying with a different email than they registered
-- with is the normal cause.
create index if not exists gftvjobs_form_submissions_unmatched_idx
  on gftvjobs_form_submissions (received_at desc)
  where matched_applicant_id is null;

comment on table gftvjobs_form_submissions is
  'Confirmed Google Form submissions. The unique constraint makes a retried Apps Script delivery idempotent.';

alter table gftvjobs_tasks            enable row level security;
alter table gftvjobs_invites          enable row level security;
alter table gftvjobs_form_submissions enable row level security;

insert into gftvjobs_migrations (filename)
values ('008_tasks_invites_and_submissions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_form_submissions;
-- drop table if exists gftvjobs_invites;
-- drop table if exists gftvjobs_tasks;
-- delete from gftvjobs_migrations where filename = '008_tasks_invites_and_submissions.sql';
-- commit;
