-- 021_commitment_types.sql
--
-- Creates: a controlled vocabulary on gftvjobs_jobs.commitment_type.
-- Spec:    section 4 (filters), section 8.2 (job editor).
-- Run after: 005.
--
-- commitment_type was free text, and section 4 also uses it as a search
-- filter. Free text and filtering do not go together: one admin types
-- "Volunteer", another types "volunteering", and the filter grows two entries
-- that mean the same thing. Section 8.7 already warns about exactly this
-- happening to tags.
--
-- Multilingual made it worse. Every free text value would have needed a hand
-- written translation per language, forever.
--
-- So the column now holds a key from a fixed set, and the label for each key
-- is translated in assets/i18n like any other interface string. Adding a sixth
-- commitment type is a dictionary edit plus one new numbered file to widen the
-- constraint, and translating it is one line per language.
--
-- Nullable is still allowed: a posting need not state a commitment.
--
-- Anything more specific than the five keys, "two evenings a month", belongs
-- in the posting body or in a section, not in a filter value.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_jobs_commitment_type_check'
  ) then
    alter table gftvjobs_jobs add constraint gftvjobs_jobs_commitment_type_check
      check (
        commitment_type is null
        or commitment_type in (
          'full_time', 'part_time', 'volunteer', 'contract', 'internship'
        )
      );
  end if;
end $$;

comment on column gftvjobs_jobs.commitment_type is
  'One of full_time, part_time, volunteer, contract, internship, or null. A key, not a label: the wording for each is translated in assets/i18n under commitment.*.';

insert into gftvjobs_migrations (filename)
values ('021_commitment_types.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- alter table gftvjobs_jobs drop constraint if exists gftvjobs_jobs_commitment_type_check;
-- delete from gftvjobs_migrations where filename = '021_commitment_types.sql';
-- commit;
