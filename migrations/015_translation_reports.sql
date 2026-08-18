-- 015_translation_reports.sql
--
-- Creates: gftvjobs_translation_reports.
-- Spec:    section 3a (Bilingual), 7h (Reporting a translation problem),
--          section 8.11 (Translations).
-- Run after: 014, for gftvjobs_locales and gftvjobs_is_blank.
--
-- An applicant reading a posting in either language can report that the
-- wording is wrong, missing, or misleading, and an admin sees the report and
-- fixes it. This is the correction loop for machine or hurried translation,
-- and it matters more here than on a monolingual site: nobody on the GFTV side
-- necessarily reads both languages well enough to catch a bad posting before
-- an applicant does.
--
-- Deliberately general. A report can point at a job posting field, a
-- department, a tag, or an interface string, because a bad translation in the
-- navigation is as worth fixing as one in a posting, and an applicant should
-- not have to work out which of those they are looking at before they can
-- complain about it.
--
-- reporter_id is on delete set null rather than cascade. A report that led to
-- a correction is a record of why the wording changed, and deleting the
-- account that raised it should not erase that.

begin;

create table if not exists gftvjobs_translation_reports (
  id              uuid primary key default gen_random_uuid(),

  -- What is being reported.
  target_type     text not null,
  target_id       uuid,
  target_key      text,
  field           text,

  -- Which language version reads wrongly. A foreign key rather than a check
  -- constraint, so adding Malay or Tamil needs no change here. A report
  -- against the default language is allowed: the English can be the wrong one.
  locale          text not null references gftvjobs_locales (code) on delete restrict,

  reporter_id     uuid references gftvjobs_users (id) on delete set null,
  note            text not null,
  suggested_text  text,

  status          text not null default 'open',
  resolution_note text,
  resolved_by     uuid references gftvhello_users (id) on delete set null,
  resolved_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint gftvjobs_translation_reports_target_type_check
    check (target_type in ('job', 'department', 'tag', 'interface')),

  constraint gftvjobs_translation_reports_status_check
    check (status in ('open', 'accepted', 'rejected', 'fixed')),

  -- A row must say what it points at. Content targets carry a row id,
  -- interface strings carry the dictionary key instead.
  constraint gftvjobs_translation_reports_target_present
    check (
      case target_type
        when 'interface' then target_key is not null and target_id is null
        else target_id is not null
      end
    ),

  constraint gftvjobs_translation_reports_note_not_blank
    check (not gftvjobs_is_blank(note)),

  -- Resolving requires saying who and when, so a row cannot quietly leave the
  -- queue without an accountable trail.
  constraint gftvjobs_translation_reports_resolution_complete
    check (
      status in ('open', 'accepted')
      or (resolved_at is not null and resolution_note is not null)
    )
);

-- The admin queue: open reports, newest first.
create index if not exists gftvjobs_translation_reports_open_idx
  on gftvjobs_translation_reports (created_at desc)
  where status in ('open', 'accepted');

create index if not exists gftvjobs_translation_reports_status_idx
  on gftvjobs_translation_reports (status, created_at desc);

-- "Show me every report against this posting", from the job editor.
create index if not exists gftvjobs_translation_reports_target_idx
  on gftvjobs_translation_reports (target_type, target_id, created_at desc);

create index if not exists gftvjobs_translation_reports_reporter_idx
  on gftvjobs_translation_reports (reporter_id, created_at desc);

create index if not exists gftvjobs_translation_reports_locale_idx
  on gftvjobs_translation_reports (locale, status);

drop trigger if exists gftvjobs_translation_reports_touch on gftvjobs_translation_reports;
create trigger gftvjobs_translation_reports_touch
  before update on gftvjobs_translation_reports
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_translation_reports is
  'Applicant reported problems with a translation, and the admin resolution. See 7h and 8.11.';
comment on column gftvjobs_translation_reports.target_type is
  'job, department, tag, or interface. Interface means a string from the assets/i18n dictionaries.';
comment on column gftvjobs_translation_reports.target_key is
  'For an interface report, the dictionary key, for example nav.findRole. Null for content reports.';
comment on column gftvjobs_translation_reports.field is
  'Which field reads wrongly, for example summary. Names a column on the translation row, since locale already says which language. Optional, since a reporter may not know or may mean the whole posting.';
comment on column gftvjobs_translation_reports.locale is
  'The language version that reads wrongly, not the language the report is written in.';
comment on column gftvjobs_translation_reports.suggested_text is
  'The reporter is offered a box for a better wording. Optional, and never applied automatically: an admin always reads it first.';
comment on column gftvjobs_translation_reports.status is
  'open, then accepted while the wording is being changed, then fixed. rejected is for a report that is mistaken, and still requires a resolution_note so the reporter can be told why.';
comment on column gftvjobs_translation_reports.reporter_id is
  'Set null rather than cascade on account deletion, so the record of why a wording changed survives the account that raised it.';

alter table gftvjobs_translation_reports enable row level security;

insert into gftvjobs_migrations (filename)
values ('015_translation_reports.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_translation_reports;
-- delete from gftvjobs_migrations where filename = '015_translation_reports.sql';
-- commit;
