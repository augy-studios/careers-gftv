-- 022_search_includes_sections.sql
--
-- Replaces: gftvjobs_compute_search_vector.
-- Spec:     section 4 (search), section 8.2 (job editor).
-- Run after: 019, which adds gftvjobs_jobs.sections, and 014, which defines
--            gftvjobs_sections_text().
--
-- Migration 019 gave a posting custom sections, and 009 built the English
-- search vector from the fixed fields only. So anything an admin wrote in a
-- section was invisible to search from the moment sections existed.
--
-- That is the sort of gap nobody notices directly. An admin moves the
-- requirements into a section called "What we are looking for", the posting
-- stops matching searches for its own requirements, and the only symptom is
-- fewer applicants.
--
-- Sections go in at weight D, alongside the other long body fields. The
-- headings are not weighted higher than the bodies: an admin writes them
-- freely, and a heading like "About the role" carries no more signal than the
-- paragraph under it.
--
-- The translation side of this is handled in 014, where the generated
-- search_text column folds sections in through the same helper.

begin;

create or replace function gftvjobs_compute_search_vector(j gftvjobs_jobs)
returns tsvector
language plpgsql
stable
as $$
declare
  v_tags text;
  v_dept text;
begin
  select coalesce(string_agg(t.name, ' '), '')
    into v_tags
  from gftvjobs_job_tags jt
  join gftvjobs_tags t on t.id = jt.tag_id
  where jt.job_id = j.id;

  select d.name
    into v_dept
  from gftvjobs_departments d
  where d.id = j.department_id;

  return
    setweight(to_tsvector('english', coalesce(j.title, '')), 'A') ||
    setweight(to_tsvector('english',
      concat_ws(' ', coalesce(v_tags, ''), coalesce(v_dept, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(j.summary, '')), 'C') ||
    setweight(to_tsvector('english',
      concat_ws(' ', j.description, j.responsibilities, j.requirements,
                     j.nice_to_have, j.location, j.commitment_type,
                     gftvjobs_sections_text(j.sections))), 'D');
end;
$$;

-- Reindex what already exists, since the definition changed under it.
--
-- The touch trigger is disabled around this on purpose. Without that, every
-- posting's updated_at would jump to now, which is what the sitemap uses for
-- lastmod: every posting would look freshly edited to search engines on the
-- day this ran, for a change no reader can see.
alter table gftvjobs_jobs disable trigger gftvjobs_jobs_touch;

update gftvjobs_jobs j
set search_vector = gftvjobs_compute_search_vector(j);

alter table gftvjobs_jobs enable trigger gftvjobs_jobs_touch;

insert into gftvjobs_migrations (filename)
values ('022_search_includes_sections.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- Restores the definition from 009, which omits sections. Paste the function
-- body from that file, then reindex the same way:
--
-- begin;
-- -- recreate gftvjobs_compute_search_vector from 009
-- alter table gftvjobs_jobs disable trigger gftvjobs_jobs_touch;
-- update gftvjobs_jobs j set search_vector = gftvjobs_compute_search_vector(j);
-- alter table gftvjobs_jobs enable trigger gftvjobs_jobs_touch;
-- delete from gftvjobs_migrations where filename = '022_search_includes_sections.sql';
-- commit;
