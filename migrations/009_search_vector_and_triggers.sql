-- 009_search_vector_and_triggers.sql
--
-- Creates: gftvjobs_jobs.search_vector and its GIN index, the trigram
--          indexes, the weighted search vector triggers, and the
--          gftvjobs_tags.usage_count triggers.
-- Spec:    section 6 (Search support), section 4 (job listing and search).
-- Run after: 005 (gftvjobs_jobs, gftvjobs_job_tags), 004 (tags,
--            departments), 001 (pg_trgm).
--
-- All of this lives in Postgres rather than in application code, per section
-- 2, so a posting edited directly in the Supabase table editor stays
-- searchable and the tag counts stay honest. Nothing in main-site/api ever
-- writes search_vector or usage_count by hand.
--
-- Weighting, per section 6:
--
--   A  title
--   B  tag names and department name
--   C  summary
--   D  description, responsibilities, requirements, nice_to_have, location,
--      commitment_type
--
-- Because tag and department names live in other tables, the vector is
-- refreshed from four directions: the posting itself, its tag links, a tag
-- being renamed, and a department being renamed. The last two are not in the
-- section 6 list but a rename would otherwise leave every affected posting
-- searchable under its old name, which is a bug rather than a decision.
--
-- usage_count is defined as the number of *published* postings carrying the
-- tag, because section 4 hides tags with zero published jobs and shows the
-- count beside each one. That is why a status change also refreshes it.

begin;

alter table gftvjobs_jobs
  add column if not exists search_vector tsvector;

create index if not exists gftvjobs_jobs_search_vector_idx
  on gftvjobs_jobs using gin (search_vector);

-- Trigram indexes for the typo fallback and the autocomplete in section 4.
-- The tags one is created in 004 alongside the table.
create index if not exists gftvjobs_jobs_title_trgm_idx
  on gftvjobs_jobs using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Search vector
-- ---------------------------------------------------------------------------

-- Takes a whole gftvjobs_jobs row so the same definition serves both the
-- BEFORE trigger, where the row is not in the table yet, and the refresh
-- paths, where it is.
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
                     j.nice_to_have, j.location, j.commitment_type)), 'D');
end;
$$;

create or replace function gftvjobs_jobs_search_vector_trigger()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := gftvjobs_compute_search_vector(new);
  return new;
end;
$$;

-- Runs before gftvjobs_jobs_touch, since triggers on the same event fire in
-- name order and "search" sorts before "touch". They write different columns,
-- so the order does not actually matter.
drop trigger if exists gftvjobs_jobs_search on gftvjobs_jobs;
create trigger gftvjobs_jobs_search
  before insert or update on gftvjobs_jobs
  for each row execute function gftvjobs_jobs_search_vector_trigger();

-- Refresh one posting. The update fires the BEFORE trigger above, which is
-- what actually recomputes the vector, so this stays correct even if the
-- weighting changes later.
create or replace function gftvjobs_refresh_job_search_vector(p_job_id uuid)
returns void
language sql
as $$
  update gftvjobs_jobs j
  set search_vector = gftvjobs_compute_search_vector(j)
  where j.id = p_job_id;
$$;

-- ---------------------------------------------------------------------------
-- Tag usage counts
-- ---------------------------------------------------------------------------

create or replace function gftvjobs_refresh_tag_usage(p_tag_ids uuid[])
returns void
language sql
as $$
  update gftvjobs_tags t
  set usage_count = (
    select count(*)
    from gftvjobs_job_tags jt
    join gftvjobs_jobs j on j.id = jt.job_id
    where jt.tag_id = t.id
      and j.status = 'published'
  )
  where t.id = any (p_tag_ids);
$$;

-- ---------------------------------------------------------------------------
-- Triggers that keep both in step
-- ---------------------------------------------------------------------------

-- A tag being linked to or unlinked from a posting changes that posting's
-- vector and that tag's count.
create or replace function gftvjobs_job_tags_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform gftvjobs_refresh_tag_usage(array[old.tag_id]);
    -- On a cascading delete of the posting itself this matches no rows, which
    -- is correct and harmless.
    perform gftvjobs_refresh_job_search_vector(old.job_id);
    return old;
  else
    perform gftvjobs_refresh_tag_usage(array[new.tag_id]);
    perform gftvjobs_refresh_job_search_vector(new.job_id);
    return new;
  end if;
end;
$$;

drop trigger if exists gftvjobs_job_tags_sync on gftvjobs_job_tags;
create trigger gftvjobs_job_tags_sync
  after insert or delete on gftvjobs_job_tags
  for each row execute function gftvjobs_job_tags_after_change();

-- A posting moving in or out of published changes every one of its tags'
-- counts, since usage_count only counts published postings.
create or replace function gftvjobs_jobs_after_status_change()
returns trigger
language plpgsql
as $$
begin
  perform gftvjobs_refresh_tag_usage(
    array(select tag_id from gftvjobs_job_tags where job_id = new.id)
  );
  return null;
end;
$$;

drop trigger if exists gftvjobs_jobs_status_sync on gftvjobs_jobs;
create trigger gftvjobs_jobs_status_sync
  after update of status on gftvjobs_jobs
  for each row
  when (old.status is distinct from new.status)
  execute function gftvjobs_jobs_after_status_change();

-- A tag rename has to reach every posting carrying it, or those postings stay
-- searchable under the old name. Renames are rare, so a full refresh is fine.
create or replace function gftvjobs_tags_after_rename()
returns trigger
language plpgsql
as $$
begin
  update gftvjobs_jobs j
  set search_vector = gftvjobs_compute_search_vector(j)
  where j.id in (select job_id from gftvjobs_job_tags where tag_id = new.id);
  return null;
end;
$$;

drop trigger if exists gftvjobs_tags_rename_sync on gftvjobs_tags;
create trigger gftvjobs_tags_rename_sync
  after update of name on gftvjobs_tags
  for each row
  when (old.name is distinct from new.name)
  execute function gftvjobs_tags_after_rename();

create or replace function gftvjobs_departments_after_rename()
returns trigger
language plpgsql
as $$
begin
  update gftvjobs_jobs j
  set search_vector = gftvjobs_compute_search_vector(j)
  where j.department_id = new.id;
  return null;
end;
$$;

drop trigger if exists gftvjobs_departments_rename_sync on gftvjobs_departments;
create trigger gftvjobs_departments_rename_sync
  after update of name on gftvjobs_departments
  for each row
  when (old.name is distinct from new.name)
  execute function gftvjobs_departments_after_rename();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Only touches rows that have never been indexed, so re-running this file does
-- not rewrite updated_at across every posting and move their sitemap lastmod.
update gftvjobs_jobs j
set search_vector = gftvjobs_compute_search_vector(j)
where j.search_vector is null;

select gftvjobs_refresh_tag_usage(array(select id from gftvjobs_tags));

insert into gftvjobs_migrations (filename)
values ('009_search_vector_and_triggers.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop trigger if exists gftvjobs_departments_rename_sync on gftvjobs_departments;
-- drop trigger if exists gftvjobs_tags_rename_sync on gftvjobs_tags;
-- drop trigger if exists gftvjobs_jobs_status_sync on gftvjobs_jobs;
-- drop trigger if exists gftvjobs_job_tags_sync on gftvjobs_job_tags;
-- drop trigger if exists gftvjobs_jobs_search on gftvjobs_jobs;
-- drop function if exists gftvjobs_departments_after_rename();
-- drop function if exists gftvjobs_tags_after_rename();
-- drop function if exists gftvjobs_jobs_after_status_change();
-- drop function if exists gftvjobs_job_tags_after_change();
-- drop function if exists gftvjobs_refresh_tag_usage(uuid[]);
-- drop function if exists gftvjobs_refresh_job_search_vector(uuid);
-- drop function if exists gftvjobs_jobs_search_vector_trigger();
-- drop function if exists gftvjobs_compute_search_vector(gftvjobs_jobs);
-- drop index if exists gftvjobs_jobs_title_trgm_idx;
-- drop index if exists gftvjobs_jobs_search_vector_idx;
-- alter table gftvjobs_jobs drop column if exists search_vector;
-- delete from gftvjobs_migrations where filename = '009_search_vector_and_triggers.sql';
-- commit;
