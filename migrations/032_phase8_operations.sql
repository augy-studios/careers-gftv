-- 032_phase8_operations.sql
--
-- Creates: the shortlist state on gftvjobs_invites and its notified_at column,
--          gftvjobs_users.must_change_password,
--          the gftvjobs_needs_translation view,
--          the gftvjobs_application_search view.
-- Spec:    section 8.5 (invites and shortlists), 8.9 (applicant users),
--          8.11 (the needs-translation audit), 7i (translation helpers),
--          and deviation 36 in next-steps.md.
-- Run after: 023, which added the annotation columns and the helper table,
--            and 031, the previous numbered file.
--
-- The second migration since the phase 1 set, and the smallest useful one that
-- lets phase 8 be built. Everything else phase 8 needs already exists:
-- gftvjobs_invites, gftvjobs_translation_helpers, the four annotation columns
-- on gftvjobs_translation_reports, gftvjobs_users.is_active, and the 'view'
-- event type on gftvjobs_analytics were all created between 007 and 023. The
-- phase 7 memo predicted this file would exist to add `origin` to the reports
-- table; 023 had already done it, and what actually turned out to be missing is
-- below.
--
-- Nothing here is destructive and nothing rewrites a row. Every column is
-- defaulted or nullable, both views are read only, and the one constraint that
-- is replaced is widened rather than narrowed, so every row that satisfied it
-- before still does.

begin;

-- ---------------------------------------------------------------------------
-- 1. Shortlisting, per 8.5
-- ---------------------------------------------------------------------------
--
-- 8.5 asks for two things against the same pair of rows: invite an applicant to
-- a posting with a note, and "mark an applicant against a posting without
-- notifying them, for internal shortlisting". 008 already anticipated that the
-- second is not a second table: its own comment calls gftvjobs_invites "an
-- invite to apply, and also the internal shortlist marker". What it did not
-- carry is a state meaning nobody was told, so the five it allows are all
-- states of a person who has already been contacted.
--
-- A shortlist is therefore this row before anybody was told, and promoting one
-- to an invite is the same row changing status. That is what keeps
-- unique (job_id, applicant_id) honest: inviting somebody who is already
-- shortlisted must not be a duplicate key error, and it must not silently
-- create a second record of the same intention.

alter table gftvjobs_invites
  drop constraint if exists gftvjobs_invites_status_check;

alter table gftvjobs_invites
  add constraint gftvjobs_invites_status_check
  check (status in ('shortlisted', 'invited', 'seen', 'applied', 'declined', 'withdrawn'));

-- When the applicant was actually told, which is not the same as when the row
-- was created. A shortlist has no notified_at at all; an invite gets one the
-- moment its task is raised. Phase 11 adds Telegram as a second channel and
-- must not treat a row it has already delivered as new, so the column is the
-- thing that answers "has this person heard about this yet" rather than the
-- status, which also moves for reasons that are nothing to do with delivery.
alter table gftvjobs_invites
  add column if not exists notified_at timestamptz;

-- The shortlist for one posting, which is the list 8.5 shows on the posting.
create index if not exists gftvjobs_invites_shortlist_idx
  on gftvjobs_invites (job_id, created_at desc)
  where status = 'shortlisted';

comment on column gftvjobs_invites.status is
  'shortlisted is the internal marker: a row nobody has been told about. Everything from invited onwards means the applicant has heard.';
comment on column gftvjobs_invites.notified_at is
  'When the applicant was told, per 8.5. Null on a shortlist. Set when the invite task is raised, and left alone by phase 11''s Telegram delivery, which is a second channel rather than the record.';

-- ---------------------------------------------------------------------------
-- 2. Forcing a password reset, per 8.9
-- ---------------------------------------------------------------------------
--
-- 8.9 keeps two assisted recovery actions for an applicant locked out with no
-- codes left, and the first is "force a password reset on next login".
-- Nothing on gftvjobs_users recorded it, so it is a column rather than a
-- convention: every session and trusted device is revoked alongside, which
-- means the flag is read on the very next sign in and by nothing else.
--
-- It is deliberately not a nullable timestamp. Who forced it and why is in
-- gftvjobs_audit_log with a required reason, per 8.9, and duplicating half of
-- that record here would give two places to read and one to forget.

alter table gftvjobs_users
  add column if not exists must_change_password boolean not null default false;

comment on column gftvjobs_users.must_change_password is
  'Set by an admin assisting somebody locked out, per 8.9. The next successful sign in must set a new password before anything else. Cleared by that reset. Who set it and why is in the audit log.';

-- ---------------------------------------------------------------------------
-- 3. The needs-translation audit, per 8.11
-- ---------------------------------------------------------------------------
--
-- 8.11 asks for "every posting, department, and tag with no translation, plus
-- every translation drafted but not marked ready, plus every translation whose
-- optional fields are thinner than the source", and says why it is a view:
-- the last of those "compares across two tables, which is exactly why it needs
-- a view". 014 says the same thing from the other side, where the ready check
-- constraint covers title, summary, and description and explicitly leaves the
-- optional fields to this audit.
--
-- Three states, and they are ordered by how much work is left:
--
--   missing   no translation row at all in that language.
--   drafted   a row exists and is_ready is false. Only postings can be in this
--             state: department and tag translations have no is_ready, because
--             a team name is either written or it is not.
--   thin      the translation is live and a field the source fills is blank in
--             it, so a reader gets that part of the page in the wrong language.
--
-- A row that is ready and complete is not in the view at all. This is a queue,
-- and a queue that lists finished work is one nobody reads.
--
-- missing_fields names what is actually absent rather than making somebody open
-- the editor to find out. It is null for a missing row, where the answer is
-- everything.
--
-- Sections are compared as "the source has some and the translation has none",
-- never as a count. 8.2 is explicit that a translator who merges two sections
-- has not done anything wrong, so a differing count is not a finding.
--
-- The cross join is over active, non default locales read from
-- gftvjobs_locales, so Malay and Tamil appear here in phase 15 without this
-- file being touched.

create or replace view gftvjobs_needs_translation as

-- Postings
select
  'job'::text                          as target_type,
  j.id                                 as target_id,
  l.code                               as locale,
  j.title                              as source_label,
  j.status                             as source_status,
  case
    when t.job_id is null then 'missing'
    when not t.is_ready  then 'drafted'
    else 'thin'
  end                                  as state,
  case
    when t.job_id is null then null
    else array_remove(array[
      case when not gftvjobs_is_blank(j.title)
            and gftvjobs_is_blank(t.title)             then 'title' end,
      case when not gftvjobs_is_blank(j.summary)
            and gftvjobs_is_blank(t.summary)           then 'summary' end,
      case when not gftvjobs_is_blank(j.description)
            and gftvjobs_is_blank(t.description)       then 'description' end,
      case when not gftvjobs_is_blank(j.responsibilities)
            and gftvjobs_is_blank(t.responsibilities)  then 'responsibilities' end,
      case when not gftvjobs_is_blank(j.requirements)
            and gftvjobs_is_blank(t.requirements)      then 'requirements' end,
      case when not gftvjobs_is_blank(j.nice_to_have)
            and gftvjobs_is_blank(t.nice_to_have)      then 'nice_to_have' end,
      case when not gftvjobs_is_blank(j.location)
            and gftvjobs_is_blank(t.location)          then 'location' end,
      case when not gftvjobs_is_blank(j.compensation_note)
            and gftvjobs_is_blank(t.compensation_note) then 'compensation_note' end,
      case when jsonb_array_length(coalesce(j.sections, '[]'::jsonb)) > 0
            and jsonb_array_length(coalesce(t.sections, '[]'::jsonb)) = 0
                                                       then 'sections' end
    ], null)
  end                                  as missing_fields,
  coalesce(t.updated_at, j.updated_at) as updated_at
from gftvjobs_jobs j
cross join gftvjobs_locales l
left join gftvjobs_job_translations t
  on t.job_id = j.id and t.locale = l.code
where l.is_active
  and not l.is_default
  -- An archived posting is off the board for everybody but the people who
  -- already applied, per 7g, so translating one is not work worth queueing.
  and j.status <> 'archived'
  and (
    t.job_id is null
    or not t.is_ready
    or (not gftvjobs_is_blank(j.responsibilities)  and gftvjobs_is_blank(t.responsibilities))
    or (not gftvjobs_is_blank(j.requirements)      and gftvjobs_is_blank(t.requirements))
    or (not gftvjobs_is_blank(j.nice_to_have)      and gftvjobs_is_blank(t.nice_to_have))
    or (not gftvjobs_is_blank(j.location)          and gftvjobs_is_blank(t.location))
    or (not gftvjobs_is_blank(j.compensation_note) and gftvjobs_is_blank(t.compensation_note))
    or (jsonb_array_length(coalesce(j.sections, '[]'::jsonb)) > 0
        and jsonb_array_length(coalesce(t.sections, '[]'::jsonb)) = 0)
  )

union all

-- Teams. A department with no name in a language shows on every job card and
-- in the search filters in the wrong one, which is why 8.6 refuses to let one
-- be active without it.
select
  'department'::text,
  d.id,
  l.code,
  d.name,
  case when d.is_active then 'active' else 'inactive' end,
  case when dt.department_id is null then 'missing' else 'thin' end,
  case
    when dt.department_id is null then null
    else array_remove(array[
      case when not gftvjobs_is_blank(d.description)
            and gftvjobs_is_blank(dt.description) then 'description' end
    ], null)
  end,
  coalesce(dt.updated_at, d.updated_at)
from gftvjobs_departments d
cross join gftvjobs_locales l
left join gftvjobs_department_translations dt
  on dt.department_id = d.id and dt.locale = l.code
where l.is_active
  and not l.is_default
  and (
    dt.department_id is null
    or (not gftvjobs_is_blank(d.description) and gftvjobs_is_blank(dt.description))
  )

union all

-- Tags. An untranslated tag is a filter chip in the wrong language on a page
-- that is otherwise translated, which is the most visible small thing on the
-- board.
select
  'tag'::text,
  tg.id,
  l.code,
  tg.name,
  case when tg.usage_count > 0 then 'in_use' else 'unused' end,
  case when tt.tag_id is null then 'missing' else 'thin' end,
  case
    when tt.tag_id is null then null
    else array_remove(array[
      case when not gftvjobs_is_blank(tg.description)
            and gftvjobs_is_blank(tt.description) then 'description' end
    ], null)
  end,
  coalesce(tt.updated_at, tg.created_at)
from gftvjobs_tags tg
cross join gftvjobs_locales l
left join gftvjobs_tag_translations tt
  on tt.tag_id = tg.id and tt.locale = l.code
where l.is_active
  and not l.is_default
  and (
    tt.tag_id is null
    or (not gftvjobs_is_blank(tg.description) and gftvjobs_is_blank(tt.description))
  );

comment on view gftvjobs_needs_translation is
  'The needs-translation audit from 8.11, and the same list a helper sees scoped to their language, per 7i. Three states: missing, drafted, thin. Finished translations are absent on purpose.';

-- ---------------------------------------------------------------------------
-- 4. Searching the tracking list by applicant, closing deviation 36
-- ---------------------------------------------------------------------------
--
-- 8.3's filters are by job, status, and date range, and all three are real
-- database filters. The applicant name box has not been: PostgREST cannot
-- filter a parent row by a pattern on an embedded one, so phase 7 filtered the
-- page that had already come back and said so on the page. That is deviation
-- 36, and it was recorded as due to be closed here.
--
-- The view is deliberately thin. It is not a second read model for the tracking
-- list: api/_lib/admin-applications.js keeps its own column list and its own
-- shaping, and this exists to answer "which application ids match these
-- letters" so that answer can be handed back to the real query as an id filter.
-- Anything richer would be two things to keep in step.
--
-- search_text is lowered here so the route can match with ilike without
-- pushing lower() onto every row at query time.

create or replace view gftvjobs_application_search as
select
  a.id            as application_id,
  a.job_id,
  a.applicant_id,
  a.status,
  a.started_at,
  a.applied_at,
  a.updated_at,
  u.username      as applicant_username,
  u.display_name  as applicant_display_name,
  lower(
    coalesce(u.display_name, '') || ' ' ||
    coalesce(u.username, '')     || ' ' ||
    coalesce(u.email, '')
  )               as search_text
from gftvjobs_applications a
join gftvjobs_users u on u.id = a.applicant_id;

comment on view gftvjobs_application_search is
  'Application ids with the applicant name and email flattened onto the row, so 8.3''s applicant box can be a real filter. Closes deviation 36. Not a read model: the tracking list still shapes its rows in api/_lib/admin-applications.js.';

-- The email is in search_text and is never selected back out, so a match on it
-- narrows a list without putting a contact detail on a page a job poster reads.
-- 8.9 is where an account is actually looked at, and it is admins only.

insert into gftvjobs_migrations (filename)
values ('032_phase8_operations.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop view if exists gftvjobs_application_search;
-- drop view if exists gftvjobs_needs_translation;
-- alter table gftvjobs_users drop column if exists must_change_password;
-- drop index if exists gftvjobs_invites_shortlist_idx;
-- alter table gftvjobs_invites drop column if exists notified_at;
-- alter table gftvjobs_invites drop constraint if exists gftvjobs_invites_status_check;
-- alter table gftvjobs_invites
--   add constraint gftvjobs_invites_status_check
--   check (status in ('invited', 'seen', 'applied', 'declined', 'withdrawn'));
-- delete from gftvjobs_migrations where filename = '032_phase8_operations.sql';
-- commit;
