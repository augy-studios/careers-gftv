-- 026_job_compensation.sql
--
-- Creates: gftvjobs_jobs.is_paid.
-- Spec:    section 4 (public site), 8 (admin dashboard), and the commitment
--          type list in migration 021.
-- Run after: 005.
--
-- GFTV runs on volunteers, and today every posting is unpaid. The site says so
-- in several places, because somebody reading the word "Careers" reasonably
-- assumes a salary and should find out otherwise before they apply rather than
-- after an interview.
--
-- What this column exists for is the other half of that: saying it as a fact
-- about the postings that exist rather than as a promise about the future. A
-- paid role may be posted one day, and when it is, the sitewide line has to
-- stop applying to that one posting without anybody editing copy in two
-- languages and redeploying.
--
-- So: default false, which is every posting today, and the interface reads the
-- column instead of assuming. The sitewide statement is written to match, as
-- "every role currently listed", with the posting itself as the exception.
--
-- Deliberately a boolean and not an amount. What a paid role pays belongs in
-- the description, which is already translated per locale by
-- gftvjobs_job_translations. A money column here would need its own
-- translation, its own currency, and its own formatting rules, for a case that
-- does not exist yet.
--
-- The commitment types from migration 021 are untouched and stay as they are.
-- full_time, part_time, contract, and internship describe how much time a role
-- takes, not whether it pays, and a full time volunteer is a real thing at
-- GFTV. Collapsing them to "volunteer" would lose that.

begin;

alter table gftvjobs_jobs
  add column if not exists is_paid boolean not null default false;

create index if not exists gftvjobs_jobs_is_paid_idx
  on gftvjobs_jobs (is_paid)
  where is_paid;

comment on column gftvjobs_jobs.is_paid is
  'False for every posting today: GFTV is run by volunteers. Exists so a paid posting can say so for itself, rather than the site making a promise about the future in its copy. What it pays goes in the translated description, not here.';

insert into gftvjobs_migrations (filename)
values ('026_job_compensation.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop index if exists gftvjobs_jobs_is_paid_idx;
-- alter table gftvjobs_jobs drop column if exists is_paid;
-- delete from gftvjobs_migrations where filename = '026_job_compensation.sql';
-- commit;
