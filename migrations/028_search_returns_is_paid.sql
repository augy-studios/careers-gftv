-- 028_search_returns_is_paid.sql
--
-- Replaces: gftvjobs_search_jobs.
-- Spec:     section 4 (job listing and search), migration 026 (is_paid).
-- Run after: 016, which is the version this widens, and 026, which adds the
--            column.
--
-- Migration 026 added gftvjobs_jobs.is_paid so a posting could state its own
-- pay rather than the site making a promise in its copy. The board is the place
-- that promise is read most, and the search function could not return the
-- column, so the board would have had to either assume every posting is unpaid,
-- which is the thing 026 exists to stop, or fetch the column separately on
-- every search.
--
-- So the column joins the return. That is a drop and a create rather than a
-- create or replace, for exactly the reason migration 016 sets out in its own
-- header: a returns table clause is part of the function's return type, and
-- create or replace may not change a function's return type. Widening it is a
-- drop and a create, and this file is what 016 predicted would eventually be
-- written.
--
-- Nothing else changes. The body below is 016's, line for line, with is_paid
-- added to the returns table clause, carried through the base CTE, and selected
-- at the end. Both are marked with a comment naming this file, so the next
-- person to widen this function can see at a glance what came from where.
--
-- is_paid deliberately does not become a filter. Every posting is unpaid today,
-- so a "paid only" control would return nothing on every site it is offered on,
-- and a filter for a value that has one setting teaches a reader the board is
-- broken. When a paid posting exists, adding paid to the filters object is a
-- handful of lines here and a checkbox in the panel.
--
-- The is_paid index from 026 is partial, `where is_paid`, which suits reading
-- the exceptional case. This function reads the column rather than filtering on
-- it, so the index is not involved either way.

begin;

drop function if exists gftvjobs_search_jobs(text, jsonb, int, int);

create function gftvjobs_search_jobs(
  q        text  default null,
  filters  jsonb default '{}'::jsonb,
  p_limit  int   default 20,
  p_offset int   default 0
)
returns table (
  id               uuid,
  slug             text,
  title            text,
  summary          text,
  headline         text,
  department_id    uuid,
  department_name  text,
  department_slug  text,
  location         text,
  is_remote        boolean,
  commitment_type  text,
  -- Added by 028. Everything else in this clause is 016's.
  is_paid          boolean,
  status           text,
  published_at     timestamptz,
  closes_at        timestamptz,
  tags             jsonb,
  rank             real,
  match_mode       text,
  locale           text,
  has_translation  boolean,
  total_count      bigint
)
language plpgsql
stable
as $$
declare
  v_q           text    := nullif(btrim(coalesce(q, '')), '');
  v_locale      text    := lower(coalesce(nullif(btrim(coalesce(filters ->> 'locale', '')), ''), 'en'));
  v_default     text;
  v_is_default  boolean;
  v_tsq         tsquery;
  v_statuses    text[]  := coalesce(gftvjobs_jsonb_text_array(filters -> 'statuses'), array['published']);
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
  v_hit         boolean := false;
begin
  select code into v_default from gftvjobs_locales where is_default limit 1;
  v_default := coalesce(v_default, 'en');

  if not exists (select 1 from gftvjobs_locales where code = v_locale and is_active) then
    v_locale := v_default;
  end if;
  v_is_default := v_locale = v_default;

  p_limit  := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  -- Built whatever the language, because a non default search also matches
  -- untranslated postings against their English text. See the fallback below.
  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q);
    if v_tsq is null or v_tsq = ''::tsquery then v_tsq := null; end if;
  end if;

  v_sort := coalesce(
    nullif(btrim(coalesce(filters ->> 'sort', '')), ''),
    case when v_q is null then 'newest' else 'relevance' end);
  if v_sort not in ('relevance', 'newest', 'closing') then v_sort := 'newest'; end if;

  -- Work out which strategy finds anything, so the client can tell a result
  -- set from a "did you mean" state.
  if v_q is not null then
    if v_is_default then
      if v_tsq is not null then
        select exists (
          select 1 from gftvjobs_jobs j
          where j.status = any (v_statuses) and j.search_vector @@ v_tsq
        ) into v_hit;
      end if;
      v_mode := case when v_hit then 'fts' else 'trigram' end;
    else
      -- A ready translation matching, or an untranslated posting whose English
      -- matches. Both count as a real result set rather than a did you mean.
      select exists (
        select 1
        from gftvjobs_jobs j
        left join gftvjobs_job_translations tr
          on tr.job_id = j.id and tr.locale = v_locale and tr.is_ready
        where j.status = any (v_statuses)
          and (
            tr.search_text ilike '%' || v_q || '%'
            or (tr.job_id is null
                and (j.title ilike '%' || v_q || '%'
                     or (v_tsq is not null and j.search_vector @@ v_tsq)))
          )
      ) into v_hit;
      v_mode := case when v_hit then 'substring' else 'trigram' end;
    end if;
  end if;

  return query
  with base as (
    select
      j.id,
      j.slug,
      -- Every displayed field resolves to the requested language here, falling
      -- back to the posting itself. A posting with no ready translation is
      -- found and shown in the default language rather than hidden.
      coalesce(nullif(tr.title, ''), j.title)                         as title,
      coalesce(nullif(tr.summary, ''), j.summary)                     as summary,
      coalesce(nullif(tr.description, ''), j.description)             as description,
      j.department_id,
      coalesce(nullif(dt.name, ''), d.name)                           as department_name,
      d.slug                                                          as department_slug,
      coalesce(nullif(tr.location, ''), j.location)                   as location,
      j.is_remote,
      j.commitment_type,
      -- Added by 028. Not translated and never will be: it is a boolean fact
      -- about the posting, and the wording for it lives in assets/i18n.
      j.is_paid,
      j.status,
      j.published_at,
      j.closes_at,
      (tr.job_id is not null)                                         as has_translation,
      case
        when v_mode = 'fts'      then ts_rank_cd(j.search_vector, v_tsq)
        when v_is_default        then similarity(j.title, v_q)
        when v_mode = 'substring' and coalesce(tr.title, '') ilike '%' || v_q || '%' then 0.9::real
        when not v_is_default    then similarity(coalesce(tr.title, ''), v_q)
        else 0::real
      end                                                             as rank
    from gftvjobs_jobs j
    left join gftvjobs_departments d on d.id = j.department_id
    left join gftvjobs_job_translations tr
      on tr.job_id = j.id and tr.locale = v_locale and tr.is_ready
    left join gftvjobs_department_translations dt
      on dt.department_id = d.id and dt.locale = v_locale
    where j.status = any (v_statuses)

      and (
        v_q is null

        -- Default language: the indexed tsvector, then trigram for typos.
        or (v_is_default and v_mode = 'fts' and j.search_vector @@ v_tsq)
        or (v_is_default and v_mode = 'trigram' and (
              j.title % v_q
              or exists (
                select 1 from gftvjobs_job_tags jt
                join gftvjobs_tags t on t.id = jt.tag_id
                where jt.job_id = j.id and t.name % v_q)
           ))

        -- Any other language: substring against the translation, which the GIN
        -- trigram index accelerates, so this is a lookup and not a scan.
        or (not v_is_default and v_mode = 'substring' and (
              tr.search_text ilike '%' || v_q || '%'
              or exists (
                select 1 from gftvjobs_job_tags jt
                join gftvjobs_tag_translations tt
                  on tt.tag_id = jt.tag_id and tt.locale = v_locale
                where jt.job_id = j.id and tt.name ilike '%' || v_q || '%')

              -- A posting with no ready translation is matched against its
              -- English text instead, so a Chinese reader searching for a
              -- Latin term like OBS still finds it. It comes back badged as
              -- untranslated rather than hidden, because hiding a real opening
              -- from the people the translation effort exists to serve is the
              -- worse failure.
              or (tr.job_id is null
                  and (j.title ilike '%' || v_q || '%'
                       or (v_tsq is not null and j.search_vector @@ v_tsq)))
           ))
        or (not v_is_default and v_mode = 'trigram' and (
              coalesce(tr.title, '') % v_q
              or coalesce(tr.search_text, '') % v_q
              or (tr.job_id is null and j.title % v_q)
           ))
      )

      and (v_depts is null or d.slug = any (v_depts))
      and (v_commitments is null or j.commitment_type = any (v_commitments))
      and (v_location is null
           or coalesce(j.location, '') ilike '%' || v_location || '%'
           or coalesce(tr.location, '') ilike '%' || v_location || '%')
      and (v_remote is null or j.is_remote = v_remote)
      and (v_posted_days is null
           or (j.published_at is not null
               and j.published_at >= now() - make_interval(days => v_posted_days)))
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
              where jt.job_id = j.id and t.slug = any (v_tags)) = cardinality(v_tags)
           else
             exists (select 1 from gftvjobs_job_tags jt
                     join gftvjobs_tags t on t.id = jt.tag_id
                     where jt.job_id = j.id and t.slug = any (v_tags))
           end
      )
  ),
  counted as (select b.*, count(*) over () as total_count from base b)
  select
    c.id, c.slug, c.title, c.summary,
    case
      -- Only the default language gets a highlighted snippet. ts_headline
      -- needs the tsquery that Han script cannot produce.
      when v_mode = 'fts'
        then ts_headline('english',
               coalesce(nullif(c.summary, ''), c.description, ''), v_tsq,
               'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" ... "')
      else left(coalesce(c.summary, ''), 240)
    end as headline,
    c.department_id, c.department_name, c.department_slug,
    c.location, c.is_remote, c.commitment_type,
    c.is_paid,  -- Added by 028.
    c.status,
    c.published_at, c.closes_at,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', t.id,
                 'name', coalesce(nullif(tt.name, ''), t.name),
                 'slug', t.slug,
                 'colour', t.colour)
               order by t.name)
      from gftvjobs_job_tags jt
      join gftvjobs_tags t on t.id = jt.tag_id
      left join gftvjobs_tag_translations tt
        on tt.tag_id = t.id and tt.locale = v_locale
      where jt.job_id = c.id
    ), '[]'::jsonb) as tags,
    c.rank,
    v_mode  as match_mode,
    v_locale as locale,
    c.has_translation,
    c.total_count
  from counted c
  order by
    case when v_sort = 'relevance' then c.rank end desc nulls last,
    case when v_sort = 'closing' then c.closes_at end asc nulls last,
    c.published_at desc nulls last,
    c.title asc
  limit p_limit offset p_offset;
end;
$$;

comment on function gftvjobs_search_jobs(text, jsonb, int, int) is
  'Multilingual search. Pass the language as filters->>''locale''. Every returned field is already in that language, falling back to the posting. has_translation says whether a ready translation was used. is_paid is the posting''s own answer on pay, per migration 026, and is not translated. headline contains <mark> tags, sanitise before rendering.';

insert into gftvjobs_migrations (filename)
values ('028_search_returns_is_paid.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- Restores the version from 016, which is this one without is_paid. Paste that
-- file's function body, then:
--
-- begin;
-- drop function if exists gftvjobs_search_jobs(text, jsonb, int, int);
-- -- then recreate gftvjobs_search_jobs(...) from 016
-- delete from gftvjobs_migrations where filename = '028_search_returns_is_paid.sql';
-- commit;
