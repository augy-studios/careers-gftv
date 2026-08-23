-- 034_translation_authorship.sql
--
-- Adds: updated_by on the three translation tables.
-- Spec:  section 7i (Translation helpers), section 8.11 ("the list of granted
--        helpers by language, granting and revoking with a required reason,
--        and what each has drafted").
-- Run after: 014, which creates the three translation tables, and 033, the
--            previous numbered file.
--
-- **This file exists because of four words in 8.11**: "what each has drafted".
-- Nothing in this database could answer that. gftvjobs_job_translations and its
-- two siblings carry created_at and updated_at and no author at all, which was
-- the right shape while the only thing writing them was the admin editor: there
-- was one kind of person editing and the audit log knew who they were.
--
-- 7i changes that. A helper is an ordinary gftvjobs_users account, granted per
-- language, editing translation rows "freely and without approval". Once two
-- different kinds of person write the same row, a page that lists helpers and
-- says nothing about what they have done is a roster rather than a record, and
-- an admin deciding whether to trust somebody with is_ready has nothing to read.
--
-- **It references gftvjobs_users and not gftvhello_users**, which is the whole
-- design of 7i restated as a foreign key: a helper is deliberately not staff and
-- does not go through gftvhello or the admin access overlay. Two nullable
-- columns, one per realm, would be a way to say "an admin edited this" as well,
-- and it is not worth it: an admin edit is already a staff session and already
-- in gftvjobs_audit_log, while a helper's edit is neither.
--
-- **So null means "not a helper", not "unknown"**, and that covers three real
-- cases: every row written before today, every row the admin editor writes, and
-- a helper whose account has since been deleted. The last is why this is
-- on delete set null rather than a cascade. Deleting somebody's account must not
-- delete the Chinese they wrote for a posting that is live.
--
-- Nothing is backfilled. There is no honest value to backfill with.

begin;

alter table gftvjobs_job_translations
  add column if not exists updated_by uuid references gftvjobs_users (id) on delete set null;

alter table gftvjobs_department_translations
  add column if not exists updated_by uuid references gftvjobs_users (id) on delete set null;

alter table gftvjobs_tag_translations
  add column if not exists updated_by uuid references gftvjobs_users (id) on delete set null;

comment on column gftvjobs_job_translations.updated_by is
  'The translation helper who last wrote this row, per 7i. Null means it was not a helper: the admin editor, anything written before migration 034, or a helper whose account has since been deleted.';
comment on column gftvjobs_department_translations.updated_by is
  'The translation helper who last wrote this row, per 7i. Null means it was not a helper.';
comment on column gftvjobs_tag_translations.updated_by is
  'The translation helper who last wrote this row, per 7i. Null means it was not a helper.';

-- The counts on the helper list in 8.11 are "how many rows did this person
-- write", which is a filter on updated_by across three tables. Partial indexes,
-- because the overwhelming majority of rows will have a null here for as long as
-- most translation is done by staff, and a helper's own count is the only thing
-- that ever reads the column.
create index if not exists gftvjobs_job_translations_updated_by_idx
  on gftvjobs_job_translations (updated_by)
  where updated_by is not null;

create index if not exists gftvjobs_department_translations_updated_by_idx
  on gftvjobs_department_translations (updated_by)
  where updated_by is not null;

create index if not exists gftvjobs_tag_translations_updated_by_idx
  on gftvjobs_tag_translations (updated_by)
  where updated_by is not null;

commit;
