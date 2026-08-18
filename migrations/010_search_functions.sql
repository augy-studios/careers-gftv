-- 010_search_functions.sql
--
-- Creates: gftvjobs_jsonb_text_array, gftvjobs_search_jobs, gftvjobs_suggest.
-- Spec:    section 2 (Supabase specifics), section 4 (job listing and
--          search).
-- Run after: 009.
--
-- Weighted full text search, ts_headline snippets, and the trigram fallback
-- are awkward to express through PostgREST filters, so they live here and are
-- called with supabase.rpc(), per section 2.
--
-- Parameter names use a p_ prefix where the suggested name in section 2 would
-- collide with a reserved word. limit and offset cannot be used as identifiers
-- in a plpgsql body without quoting, so they are p_limit and p_offset.
--
-- The trigram fallback engages only when the *query text* matches nothing at
-- all, not when the filters happen to exclude everything. Otherwise a narrow
-- filter would produce a "did you mean" prompt for a query that was spelled
-- perfectly well. match_mode is returned so the client knows which state it is
-- looking at: fts, trigram, or browse.
--
-- headline contains <mark> tags from ts_headline. The client must render it
-- through a sanitiser that allows <mark> and nothing else. Never assign it
-- with innerHTML unfiltered.
--
-- filters is a jsonb object. Every key is optional:
--
--   statuses            text[]   default ['published']
--   department_slugs    text[]
--   tag_slugs           text[]
--   match_all_tags      boolean  default false, OR matching otherwise
--   commitment_types    text[]
--   location            text     substring match, case insensitive
--   is_remote           boolean
--   posted_within_days  int      the "posted today" and "this week" chips
--   closing_within_days int      "closing soon", never matches a null closes_at
--   no_deadline         boolean  only postings with a null closes_at
--   sort                text     relevance, newest, or closing

begin;

create or replace function gftvjobs_jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) <> 'array' then null
    when jsonb_array_length(p_value) = 0 then null
    else array(select jsonb_array_elements_text(p_value))
  end;
$$;

create or replace function gftvjobs_search_jobs(
  q        text  default null,
  filters  jsonb default '{}'::jsonb,
  p_limit  int   default 20,
  p_offset int   default 0
)
returns table (
  id              uuid,
  slug            text,
  title           text,
  summary         text,
  headline        text,
  department_id   uuid,
  department_name text,
  department_slug text,
  location        text,
  is_remote       boolean,
  commitment_type text,
  status          text,
  published_at    timestamptz,
  closes_at       timestamptz,
  tags            jsonb,
  rank            real,
  match_mode      text,
  total_count     bigint
)
language plpgsql
stable
as $$
declare
  v_q           text    := nullif(btrim(coalesce(q, '')), '');
  v_tsq         tsquery;
  v_statuses    text[]  := coalesce(
                             gftvjobs_jsonb_text_array(filters -> 'statuses'),
                             array['published']);
  v_depts       text[]  := gftvjobs_jsonb_text_array(filters -> 'department_slugs');
  v_tags        text[]  := gftvjobs_jsonb_text_array(filters -> 'tag_slugs');
  v_commitments text[]  := gftvjobs_jsonb_text_array(filters -> 'commitment_types');
  v_match_all   boolean := coalesce((filters ->> 'match_all_tags')::boolean, false);
  v_location    text    := nullif(btrim(coalesce(filters ->> 'location', '')), '');
  v_remote      boolean := (filters ->> 'is_remote')::boolean;
  v_posted_days int     := nullif(filters ->> 'posted_within_days', '')::int;
  v_close_days  int     := nullif(filters ->> 'closing_within_days', '')::int;
  v_no_deadline boolean := coalesce((filters ->> 'no_deadline')::boolean, false);
  v_sort        text;
  v_mode        text    := 'browse';
  v_has_fts     boolean := false;
begin
  p_limit  := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q);
    if v_tsq is null or v_tsq = ''::tsquery then
      v_tsq := null;
    end if;
  end if;

  -- Relevance is the default whenever q is present, newest when it is not.
  v_sort := coalesce(
    nullif(btrim(coalesce(filters ->> 'sort', '')), ''),
    case when v_tsq is null then 'newest' else 'relevance' end);

  if v_sort not in ('relevance', 'newest', 'closing') then
    v_sort := 'newest';
  end if;

  if v_tsq is not null then
    select exists (
      select 1
      from gftvjobs_jobs j
      where j.status = any (v_statuses)
        and j.search_vector @@ v_tsq
    ) into v_has_fts;

    v_mode := case when v_has_fts then 'fts' else 'trigram' end;
  end if;

  return query
  with base as (
    select
      j.id,
      j.slug,
      j.title,
      j.summary,
      j.description,
      j.department_id,
      d.name as department_name,
      d.slug as department_slug,
      j.location,
      j.is_remote,
      j.commitment_type,
      j.status,
      j.published_at,
      j.closes_at,
      case
        when v_mode = 'fts'     then ts_rank_cd(j.search_vector, v_tsq)
        when v_mode = 'trigram' then similarity(j.title, v_q)
        else 0::real
      end as rank
    from gftvjobs_jobs j
    left join gftvjobs_departments d on d.id = j.department_id
    where j.status = any (v_statuses)

      -- Text match, or none at all when browsing.
      and (
        v_tsq is null
        or (v_mode = 'fts' and j.search_vector @@ v_tsq)
        or (v_mode = 'trigram' and (
              j.title % v_q
              or exists (
                select 1
                from gftvjobs_job_tags jt
                join gftvjobs_tags t on t.id = jt.tag_id
                where jt.job_id = j.id and t.name % v_q
              )
           ))
      )

      and (v_depts is null or d.slug = any (v_depts))
      and (v_commitments is null or j.commitment_type = any (v_commitments))
      and (v_location is null or j.location ilike '%' || v_location || '%')
      and (v_remote is null or j.is_remote = v_remote)

      and (v_posted_days is null
           or (j.published_at is not null
               and j.published_at >= now() - make_interval(days => v_posted_days)))

      -- Closing soon never includes a deadline free posting.
      and (v_close_days is null
           or (j.closes_at is not null
               and j.closes_at >= now()
               and j.closes_at <= now() + make_interval(days => v_close_days)))

      and (not v_no_deadline or j.closes_at is null)

      and (
        v_tags is null
        or case when v_match_all then
             (select count(distinct t.slug)
              from gftvjobs_job_tags jt
              join gftvjobs_tags t on t.id = jt.tag_id
              where jt.job_id = j.id and t.slug = any (v_tags))
             = cardinality(v_tags)
           else
             exists (
               select 1
               from gftvjobs_job_tags jt
               join gftvjobs_tags t on t.id = jt.tag_id
               where jt.job_id = j.id and t.slug = any (v_tags)
             )
           end
      )
  ),
  counted as (
    select b.*, count(*) over () as total_count
    from base b
  )
  select
    c.id,
    c.slug,
    c.title,
    c.summary,
    case
      when v_tsq is null or v_mode = 'trigram'
        then left(coalesce(c.summary, ''), 240)
      else ts_headline(
             'english',
             coalesce(nullif(c.summary, ''), c.description, ''),
             v_tsq,
             'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" ... "')
    end as headline,
    c.department_id,
    c.department_name,
    c.department_slug,
    c.location,
    c.is_remote,
    c.commitment_type,
    c.status,
    c.published_at,
    c.closes_at,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', t.id, 'name', t.name, 'slug', t.slug, 'colour', t.colour)
               order by t.name)
      from gftvjobs_job_tags jt
      join gftvjobs_tags t on t.id = jt.tag_id
      where jt.job_id = c.id
    ), '[]'::jsonb) as tags,
    c.rank,
    v_mode as match_mode,
    c.total_count
  from counted c
  order by
    case when v_sort = 'relevance' then c.rank end desc nulls last,
    case when v_sort = 'closing' then c.closes_at end asc nulls last,
    c.published_at desc nulls last,
    c.title asc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function gftvjobs_search_jobs(text, jsonb, int, int) is
  'Weighted full text search with a trigram fallback. Returns total_count on every row so pagination is one round trip. headline contains <mark> tags, sanitise before rendering.';

-- As-you-type suggestions, grouped under three headings in the UI. Debounced
-- at around 250ms with a two character minimum on the client, per section 4.
create or replace function gftvjobs_suggest(q text)
-- match_count rather than count, so the output parameter cannot shadow the
-- aggregate of the same name inside the body.
returns table (
  kind        text,
  label       text,
  value       text,
  match_count bigint
)
language plpgsql
stable
as $$
declare
  v_q text := nullif(btrim(coalesce(q, '')), '');
begin
  if v_q is null or length(v_q) < 2 then
    return;
  end if;

  return query
  (
    -- Job titles. value is the uuid, so selecting one can go straight to the
    -- posting rather than back through a search.
    select
      'title'::text,
      j.title,
      j.id::text,
      0::bigint
    from gftvjobs_jobs j
    where j.status = 'published'
      and (j.title ilike v_q || '%' or j.title ilike '%' || v_q || '%' or j.title % v_q)
    order by
      case when j.title ilike v_q || '%' then 0 else 1 end,
      similarity(j.title, v_q) desc,
      j.title asc
    limit 5
  )
  union all
  (
    -- Tags. value is the slug, since selecting one filters the listing.
    select
      'tag'::text,
      t.name,
      t.slug,
      t.usage_count::bigint
    from gftvjobs_tags t
    where t.usage_count > 0
      and (t.name ilike v_q || '%' or t.name ilike '%' || v_q || '%' or t.name % v_q)
    order by
      case when t.name ilike v_q || '%' then 0 else 1 end,
      t.usage_count desc,
      t.name asc
    limit 5
  )
  union all
  (
    select
      'department'::text,
      d.name,
      d.slug,
      (select count(*) from gftvjobs_jobs j
        where j.department_id = d.id and j.status = 'published')::bigint
    from gftvjobs_departments d
    where d.is_active
      and (d.name ilike v_q || '%' or d.name ilike '%' || v_q || '%' or d.name % v_q)
      and exists (select 1 from gftvjobs_jobs j
                   where j.department_id = d.id and j.status = 'published')
    order by
      case when d.name ilike v_q || '%' then 0 else 1 end,
      d.sort_order asc,
      d.name asc
    limit 5
  );
end;
$$;

comment on function gftvjobs_suggest(text) is
  'Grouped autocomplete over published job titles, used tags, and departments with published postings. Returns nothing under two characters.';

insert into gftvjobs_migrations (filename)
values ('010_search_functions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop function if exists gftvjobs_suggest(text);
-- drop function if exists gftvjobs_search_jobs(text, jsonb, int, int);
-- drop function if exists gftvjobs_jsonb_text_array(jsonb);
-- delete from gftvjobs_migrations where filename = '010_search_functions.sql';
-- commit;
