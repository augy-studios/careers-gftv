-- 007_analytics_ratings_and_saved.sql
--
-- Creates: gftvjobs_analytics, gftvjobs_ratings, gftvjobs_saved_jobs.
-- Spec:    section 6 (New tables), section 7c (handoff modal), 7g (applicant
--          dashboard), section 8.4 (analytics), section 11 (cron).
-- Run after: 006.
--
-- gftvjobs_analytics is the append only event log. One row per apply click,
-- not one per applicant, which is what makes the funnel meaningful. A second
-- click on the same posting is a second row.
--
-- did_apply is false by default and only ever becomes true on a positive
-- confirmation, either the applicant clicking Yes in the modal or the
-- section 13 webhook. Not answering is not a missing value, it is a No.
-- Never use null in did_apply to mean unanswered. response_state carries
-- that distinction:
--
--   pending      no answer yet, the modal reopens on the next page load
--   answered     the applicant or the webhook said something
--   no_response  the daily cron gave up after 14 days, answer_source timeout
--
-- Pending and no_response both mean not applied. The only reason they are
-- distinct from an explicit No is so the admin analytics page can separate a
-- real No from silence.
--
-- No IP address and no raw user agent are stored, per section 6. Referrer is
-- enough for where traffic came from.
--
-- applicant_id is on delete set null rather than cascade, per 7g: deleting an
-- account keeps the analytics rows so historical funnel numbers stay intact.

begin;

create table if not exists gftvjobs_analytics (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references gftvjobs_jobs (id) on delete cascade,
  applicant_id   uuid references gftvjobs_users (id) on delete set null,
  event_type     text not null,
  did_apply      boolean not null default false,
  response_state text not null default 'pending',
  answer_source  text,
  responded_at   timestamptz,
  referrer       text,
  created_at     timestamptz not null default now(),

  constraint gftvjobs_analytics_event_type_check
    check (event_type in ('view', 'apply_click')),

  constraint gftvjobs_analytics_response_state_check
    check (response_state in ('pending', 'answered', 'no_response')),

  constraint gftvjobs_analytics_answer_source_check
    check (answer_source is null
           or answer_source in ('applicant', 'webhook', 'admin', 'timeout'))
);

create index if not exists gftvjobs_analytics_job_id_idx
  on gftvjobs_analytics (job_id, created_at desc);

create index if not exists gftvjobs_analytics_applicant_id_idx
  on gftvjobs_analytics (applicant_id, created_at desc);

create index if not exists gftvjobs_analytics_event_type_idx
  on gftvjobs_analytics (event_type);

create index if not exists gftvjobs_analytics_created_at_idx
  on gftvjobs_analytics (created_at desc);

-- Partial index required by section 6, so the outstanding prompts behind
-- api/applications/pending and the 14 day cron sweep are both cheap.
create index if not exists gftvjobs_analytics_pending_idx
  on gftvjobs_analytics (applicant_id, created_at desc)
  where response_state = 'pending';

comment on table gftvjobs_analytics is
  'Append only event log for views and apply clicks. Never deduped, unlike gftvjobs_applications.';
comment on column gftvjobs_analytics.did_apply is
  'False until something positively confirms otherwise. Silence is a No, never a null.';
comment on column gftvjobs_analytics.event_type is
  'A view is fired once per session per posting, never on every render, and never for an admin previewing a draft.';
comment on column gftvjobs_analytics.answer_source is
  'What produced the answer. Lets section 8.4 separate confirmed submissions from self reported ones.';
comment on column gftvjobs_analytics.referrer is
  'Where the traffic came from. No IP address and no raw user agent are stored anywhere in this build.';

-- Admin facing only. Never shown on a public posting, since a visible score
-- would discourage applications to a role a handful of people rated low.
-- Section 8.4 suppresses the average below three ratings for the same reason.
create table if not exists gftvjobs_ratings (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references gftvjobs_jobs (id) on delete cascade,
  applicant_id uuid not null references gftvjobs_users (id) on delete cascade,
  rating       smallint not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint gftvjobs_ratings_range_check
    check (rating between 1 and 5),

  constraint gftvjobs_ratings_job_applicant_key
    unique (job_id, applicant_id)
);

create index if not exists gftvjobs_ratings_job_id_idx
  on gftvjobs_ratings (job_id);

drop trigger if exists gftvjobs_ratings_touch on gftvjobs_ratings;
create trigger gftvjobs_ratings_touch
  before update on gftvjobs_ratings
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_ratings is
  'Rating of the posting itself, collected in the handoff modal. Admin facing only, never public. A second rating updates the first.';

-- Rows survive the posting closing or expiring. They are removed only when
-- the applicant unsaves or the posting is hard deleted.
create table if not exists gftvjobs_saved_jobs (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references gftvjobs_users (id) on delete cascade,
  job_id       uuid not null references gftvjobs_jobs (id) on delete cascade,
  created_at   timestamptz not null default now(),

  constraint gftvjobs_saved_jobs_applicant_job_key
    unique (applicant_id, job_id)
);

create index if not exists gftvjobs_saved_jobs_applicant_id_idx
  on gftvjobs_saved_jobs (applicant_id, created_at desc);

create index if not exists gftvjobs_saved_jobs_job_id_idx
  on gftvjobs_saved_jobs (job_id);

comment on table gftvjobs_saved_jobs is
  'Also one half of the archived posting visibility rule in 7g: a saved posting stays readable to the applicant who saved it.';

alter table gftvjobs_analytics  enable row level security;
alter table gftvjobs_ratings    enable row level security;
alter table gftvjobs_saved_jobs enable row level security;

insert into gftvjobs_migrations (filename)
values ('007_analytics_ratings_and_saved.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_saved_jobs;
-- drop table if exists gftvjobs_ratings;
-- drop table if exists gftvjobs_analytics;
-- delete from gftvjobs_migrations where filename = '007_analytics_ratings_and_saved.sql';
-- commit;
