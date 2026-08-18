-- 005_jobs.sql
--
-- Creates: gftvjobs_jobs, gftvjobs_job_tags.
-- Spec:    section 6 (New tables), section 4 (job detail), section 7f
--          (reapply cooldown), section 11 (scheduled maintenance).
-- Run after: 004. Also requires the existing gftvhello_users table, which is
--            referenced by created_by and is never created or altered here.
--
-- The id is the public identifier. The canonical detail URL is
-- /jobs/{uuid}, so this column is a real identifier and not just an internal
-- key. slug is kept as a 301 alias only.
--
-- closes_at is nullable on purpose. Null means the posting has no deadline
-- and stays open until an admin closes it. Treat null as open, never as
-- expired, and never coalesce it to a far future date as a shortcut. The
-- daily cron in section 11 skips these entirely.
--
-- Two deliberate departures from the column list in section 6, both recorded
-- in next-steps.md:
--
--   1. application_form_url is nullable with a check constraint rather than
--      a plain not null. Section 6 says not null, but section 8.2 says to
--      refuse to *publish* a job without one, which implies a draft can
--      exist before the form does. The check enforces exactly the section
--      8.2 rule and is strictly more permissive, so nothing that section 6
--      allows is blocked.
--   2. The three form_check_* columns are added because section 11 requires
--      the daily health check to flag a job in the admin list with a warning
--      badge, and section 6 gives that result nowhere to live.

begin;

create table if not exists gftvjobs_jobs (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  title                text not null,
  department_id        uuid references gftvjobs_departments (id) on delete set null,
  summary              text,
  description          text,
  responsibilities     text,
  requirements         text,
  nice_to_have         text,
  commitment_type      text,
  location             text,
  is_remote            boolean not null default false,
  compensation_note    text,
  openings             int not null default 1,
  status               text not null default 'draft',
  application_form_url text,
  form_prefill         jsonb,
  response_sheet_url   text,

  -- Result of the daily form health check in section 11. Never unpublishes a
  -- posting, only flags it.
  form_check_state     text not null default 'unchecked',
  form_checked_at      timestamptz,
  form_check_note      text,

  published_at         timestamptz,
  closes_at            timestamptz,
  created_by           uuid references gftvhello_users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint gftvjobs_jobs_status_check
    check (status in ('draft', 'published', 'closed', 'archived')),

  constraint gftvjobs_jobs_form_check_state_check
    check (form_check_state in ('unchecked', 'ok', 'warning', 'error')),

  -- Section 8.2: a posting cannot be published without an application form.
  constraint gftvjobs_jobs_published_needs_form
    check (status <> 'published' or application_form_url is not null),

  constraint gftvjobs_jobs_openings_check
    check (openings >= 0)
);

create index if not exists gftvjobs_jobs_status_idx
  on gftvjobs_jobs (status);

create index if not exists gftvjobs_jobs_department_id_idx
  on gftvjobs_jobs (department_id);

-- Sorting by closing date uses "order by closes_at asc nulls last", so
-- deadline free postings sit at the end rather than the top. See section 4.
create index if not exists gftvjobs_jobs_closes_at_idx
  on gftvjobs_jobs (closes_at asc nulls last);

-- The default listing is published, newest first.
create index if not exists gftvjobs_jobs_published_at_idx
  on gftvjobs_jobs (status, published_at desc nulls last);

-- The daily cron looks for published postings with a passed closes_at. The
-- partial index keeps that cheap and excludes the deadline free ones by
-- construction.
create index if not exists gftvjobs_jobs_autoclose_idx
  on gftvjobs_jobs (closes_at)
  where status = 'published' and closes_at is not null;

drop trigger if exists gftvjobs_jobs_touch on gftvjobs_jobs;
create trigger gftvjobs_jobs_touch
  before update on gftvjobs_jobs
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_jobs is
  'Job postings. The id is the public URL identifier, /jobs/{uuid}.';
comment on column gftvjobs_jobs.slug is
  '301 alias only. /jobs/{slug} redirects to /jobs/{uuid}, which is canonical.';
comment on column gftvjobs_jobs.closes_at is
  'Null means open until filled. Never treat null as expired and never coalesce it.';
comment on column gftvjobs_jobs.application_form_url is
  'Long form docs.google.com/forms/.../viewform address. A forms.gle short link cannot carry prefill, see 7b.';
comment on column gftvjobs_jobs.form_prefill is
  'Maps Google Form entry ids to applicant fields, for example {"entry.1045781291": "email"}. Built server side from the session, never from client input.';
comment on column gftvjobs_jobs.response_sheet_url is
  'Optional link to the linked Google Sheet. Admin facing only, never in a public payload.';
comment on column gftvjobs_jobs.form_check_state is
  'Result of the section 11 daily health check on application_form_url. Flags the admin list, never unpublishes.';

create table if not exists gftvjobs_job_tags (
  job_id uuid not null references gftvjobs_jobs (id) on delete cascade,
  tag_id uuid not null references gftvjobs_tags (id) on delete cascade,
  primary key (job_id, tag_id)
);

-- The primary key covers job_id lookups. tag_id needs its own index so
-- filtering in the other direction, tag to postings, is equally cheap.
create index if not exists gftvjobs_job_tags_tag_id_idx
  on gftvjobs_job_tags (tag_id);

comment on table gftvjobs_job_tags is
  'Join table. Changes here retrigger both the search vector and the tag usage_count, see 007.';

alter table gftvjobs_jobs     enable row level security;
alter table gftvjobs_job_tags enable row level security;

insert into gftvjobs_migrations (filename)
values ('005_jobs.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_job_tags;
-- drop table if exists gftvjobs_jobs;
-- delete from gftvjobs_migrations where filename = '005_jobs.sql';
-- commit;
