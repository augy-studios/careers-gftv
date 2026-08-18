-- 019_job_sections.sql
--
-- Creates: gftvjobs_jobs.sections.
-- Spec:    section 8.2 (job editor), section 4 (job detail).
-- Run after: 014, for gftvjobs_sections_valid(). Pairs with the sections
--            column on gftvjobs_job_translations, created there.
--
-- The fixed fields on a posting, description, responsibilities, requirements,
-- and nice_to_have, cover the ordinary case and are what the JobPosting
-- JSON-LD in section 4 is built from, so they stay exactly as they are. This
-- adds room for anything else a role needs: "What a shift looks like", "Kit we
-- provide", "Who you would work with".
--
-- Shape, an ordered array of objects:
--
--   [
--     {"heading": "What a shift looks like", "body": "..."},
--     {"heading": "Kit we provide",          "body": "..."}
--   ]
--
-- Order is array order. The admin editor drags to reorder and writes the array
-- back, so there is no sort column to keep in step.
--
-- Headings are content, not interface strings, so they live here and translate
-- on the gftvjobs_job_translations row rather than being keyed to a dictionary.
-- A translation may carry a different number of sections from the base row: a
-- translator who merges two sections has not done anything wrong, and a
-- constraint demanding equal counts would only produce padding.
--
-- Kept as jsonb rather than a gftvjobs_job_sections table because sections are
-- always read and written with their posting, never queried across postings,
-- and never joined. A table would add a join and an ordering column to every
-- read for no gain. If sections ever need searching or reporting on
-- individually, that is the point to normalise them, in a new numbered file.

begin;

alter table gftvjobs_jobs
  add column if not exists sections jsonb not null default '[]'::jsonb;

-- One constraint, using the shared validator from 014. A check constraint may
-- not contain a subquery, and walking the array to verify each entry needs
-- one, so the walk lives in an immutable function instead.
--
-- This is worth enforcing in the database rather than only in the editor: the
-- admin UI is not the only thing that can write here, and a malformed entry
-- would render as an empty block on a live posting rather than failing loudly.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_jobs_sections_valid'
  ) then
    alter table gftvjobs_jobs add constraint gftvjobs_jobs_sections_valid
      check (gftvjobs_sections_valid(sections));
  end if;
end $$;

comment on column gftvjobs_jobs.sections is
  'Extra sections beyond the fixed fields, as an ordered array of {"heading", "body"} objects. Array order is display order. Translated per language on gftvjobs_job_translations.';

insert into gftvjobs_migrations (filename)
values ('019_job_sections.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- alter table gftvjobs_jobs drop constraint if exists gftvjobs_jobs_sections_valid;
-- alter table gftvjobs_jobs drop column if exists sections;
-- delete from gftvjobs_migrations where filename = '019_job_sections.sql';
-- commit;
