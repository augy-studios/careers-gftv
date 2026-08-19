-- 030_typo_tolerant_search.sql
--
-- Replaces: gftvjobs_search_jobs, gftvjobs_suggest.
-- Spec:     section 4, "Handle typos and near misses with a trigram similarity
--           fallback when full text search returns nothing, and show a
--           'no results for X, did you mean Y' state".
-- Run after: 028.
--
-- The trigram fallback was there and was firing, and almost never found
-- anything. Found by the phase 3 Playwright run against the seeded board:
--
--   subtitel  ->  1 result      Subtitle Editor, Mandarin
--   vidoe     ->  0 results     should have found Video Editor
--   edtior    ->  0 results     should have found both Editor postings
--   camrea    ->  0 results     should have found Camera Operator
--
-- One of four is not a typo tolerant search. It is a coin toss that happens to
-- have landed once.
--
-- The cause is similarity() rather than the threshold. similarity(a, b)
-- normalises shared trigrams over the union of both strings, so a short query
-- against a long title scores low no matter how well it matches a word inside
-- it. "subtitel" scraped over the 0.3 default only because "Subtitle Editor,
-- Mandarin" is short enough; "Video Editor, Weekly Highlights" is not, and the
-- same quality of typo failed against it. The function was, in effect, asking
-- whether the query resembled the entire title, which is not a question anybody
-- typing into a search box is answering.
--
-- word_similarity(a, b) asks the question that was meant: how well does a match
-- the best matching run of words inside b. Title length stops mattering.
--
-- Written as an explicit word_similarity(...) >= threshold rather than the <%
-- operator, deliberately, and the tradeoff is worth stating because it is the
-- one thing here somebody would otherwise change back:
--
--   <% is index accelerated by the gin_trgm_ops indexes from 009 and 014, and
--   an explicit comparison is not, so this branch is a sequential scan.
--
--   Against that: <% reads its threshold from pg_trgm.word_similarity_threshold,
--   a session GUC that defaults to 0.6. At 0.6 none of the four typos above
--   match, so the operator alone fixes nothing. Making it work means setting
--   the GUC per request, from inside a function declared stable, and then the
--   search behaviour of the site depends on a session variable that is invisible
--   at every call site and silently different in the SQL editor.
--
--   The scan is bounded and rare. It runs only on the trigram branch, which is
--   only reached when full text search has already matched nothing at all, over
--   published postings only, on a board that will hold tens of rows and not
--   millions. The ordinary search path still uses the GIN tsvector index and is
--   untouched. A predictable rule beats an invisible one at this size; if the
--   board ever outgrows it, the fix is the operator plus a GUC set explicitly in
--   the endpoint, and this comment is the reason to expect that change.
--
-- 0.4 as the threshold. Enough for a single transposed or dropped letter, which
-- is what a typo usually is:
--
--   vidoe  vs video    0.50      edtior vs editor   0.43
--   camrea vs camera   0.43      threshold          0.40
--
-- Below about 0.35 unrelated short words start matching each other and the did
-- you mean state starts suggesting nonsense, which is worse than suggesting
-- nothing.
--
-- create or replace rather than a drop and a create, unlike 016 and 028. Both
-- of those changed the returns table clause, which is part of a function's
-- return type. This changes only the bodies, and both signatures and both row
-- shapes are identical, so replacing in place is allowed and there is no window
-- in which the function does not exist.

begin;

-- The one number this file exists to introduce, and the only thing to change if
-- the did you mean state is ever too eager or too shy.
create or replace function gftvjobs_typo_threshold()
returns real
language sql
immutable
as $$ select 0.4::real $$;

comment on function gftvjobs_typo_threshold() is
  'Minimum word_similarity for the typo fallback in gftvjobs_search_jobs and gftvjobs_suggest. 0.4 catches a single transposed or dropped letter. Below about 0.35 unrelated words start matching.';

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

create or replace function gftvjobs_search_jobs(
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
  -- Read once rather than per row. Added by 030.
  v_fuzz        real    := gftvjobs_typo_threshold();
begin
  select code into v_default from gftvjobs_locales where is_default limit 1;
  v_default := coalesce(v_default, 'en');

  if not exists (select 1 from gftvjobs_locales where code = v_locale and is_active) then
    v_locale := v_default;
  end if;
  v_is_default := v_locale = v_default;

  p_limit  := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if v_q is not null then
    v_tsq := websearch_to_tsquery('english', v_q);
    if v_tsq is null or v_tsq = ''::tsquery then v_tsq := null; end if;
  end if;

  v_sort := coalesce(
    nullif(btrim(coalesce(filters ->> 'sort', '')), ''),
    case when v_q is null then 'newest' else 'relevance' end);
  if v_sort not in ('relevance', 'newest', 'closing') then v_sort := 'newest'; end if;

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
      coalesce(nullif(tr.title, ''), j.title)                         as title,
      coalesce(nullif(tr.summary, ''), j.summary)                     as summary,
      coalesce(nullif(tr.description, ''), j.description)             as description,
      j.department_id,
      coalesce(nullif(dt.name, ''), d.name)                           as department_name,
      d.slug                                                          as department_slug,
      coalesce(nullif(tr.location, ''), j.location)                   as location,
      j.is_remote,
      j.commitment_type,
      j.is_paid,
      j.status,
      j.published_at,
      j.closes_at,
      (tr.job_id is not null)                                         as has_translation,
      case
        when v_mode = 'fts'      then ts_rank_cd(j.search_vector, v_tsq)
        -- word_similarity rather than similarity, added by 030, so a near miss
        -- against one word in a long title ranks on that word rather than being
        -- diluted by the rest of the title.
        when v_is_default        then word_similarity(v_q, j.title)
        when v_mode = 'substring' and coalesce(tr.title, '') ilike '%' || v_q || '%' then 0.9::real
        when not v_is_default    then word_similarity(v_q, coalesce(tr.title, ''))
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

        or (v_is_default and v_mode = 'fts' and j.search_vector @@ v_tsq)

        -- The typo path. Every % operator here was replaced by an explicit
        -- word_similarity comparison in 030. See the header for why this is a
        -- scan and why that is acceptable on this branch.
        or (v_is_default and v_mode = 'trigram' and (
              word_similarity(v_q, j.title) >= v_fuzz
              or exists (
                select 1 from gftvjobs_job_tags jt
                join gftvjobs_tags t on t.id = jt.tag_id
                where jt.job_id = j.id and word_similarity(v_q, t.name) >= v_fuzz)
           ))

        or (not v_is_default and v_mode = 'substring' and (
              tr.search_text ilike '%' || v_q || '%'
              or exists (
                select 1 from gftvjobs_job_tags jt
                join gftvjobs_tag_translations tt
                  on tt.tag_id = jt.tag_id and tt.locale = v_locale
                where jt.job_id = j.id and tt.name ilike '%' || v_q || '%')
              or (tr.job_id is null
                  and (j.title ilike '%' || v_q || '%'
                       or (v_tsq is not null and j.search_vector @@ v_tsq)))
           ))

        -- The non default language typo path. Han script gets little from this,
        -- since a mistyped character shares no trigrams with the right one, but
        -- a Latin term inside a Chinese posting does, which is the case that
        -- matters: somebody searching OBS or Premiere in the Chinese interface.
        or (not v_is_default and v_mode = 'trigram' and (
              word_similarity(v_q, coalesce(tr.title, '')) >= v_fuzz
              or word_similarity(v_q, coalesce(tr.search_text, '')) >= v_fuzz
              or (tr.job_id is null and word_similarity(v_q, j.title) >= v_fuzz)
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
      when v_mode = 'fts'
        then ts_headline('english',
               coalesce(nullif(c.summary, ''), c.description, ''), v_tsq,
               'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" ... "')
      else left(coalesce(c.summary, ''), 240)
    end as headline,
    c.department_id, c.department_name, c.department_slug,
    c.location, c.is_remote, c.commitment_type,
    c.is_paid,
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
  'Multilingual search. Pass the language as filters->>''locale''. Every returned field is already in that language, falling back to the posting. has_translation says whether a ready translation was used. is_paid is the posting''s own answer on pay. The typo fallback uses word_similarity against gftvjobs_typo_threshold(), so a near miss on one word in a long title still matches. headline contains <mark> tags, sanitise before rendering.';

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------
--
-- The same defect, and the same fix. It mattered less here only because the
-- ilike substring beside it catches the ordinary case of somebody typing a
-- prefix; the trigram half was carrying the typos and was failing at it for
-- exactly the same reason.

create or replace function gftvjobs_suggest(q text, p_locale text default 'en')
returns table (kind text, label text, value text, match_count bigint)
language plpgsql
stable
as $$
declare
  v_q       text := nullif(btrim(coalesce(q, '')), '');
  v_locale  text := lower(coalesce(nullif(btrim(coalesce(p_locale, '')), ''), 'en'));
  v_default text;
  v_min     int;
  v_fuzz    real := gftvjobs_typo_threshold();
begin
  select code into v_default from gftvjobs_locales where is_default limit 1;
  v_default := coalesce(v_default, 'en');

  if not exists (select 1 from gftvjobs_locales where code = v_locale and is_active) then
    v_locale := v_default;
  end if;

  v_min := case
             when (select text_search_config from gftvjobs_locales where code = v_locale) is null
               then 1 else 2
           end;

  if v_q is null or length(v_q) < v_min then return; end if;

  return query
  (
    select 'title'::text,
           coalesce(nullif(tr.title, ''), j.title),
           j.id::text,
           0::bigint
    from gftvjobs_jobs j
    left join gftvjobs_job_translations tr
      on tr.job_id = j.id and tr.locale = v_locale and tr.is_ready
    where j.status = 'published'
      and (coalesce(nullif(tr.title, ''), j.title) ilike '%' || v_q || '%'
           or word_similarity(v_q, coalesce(nullif(tr.title, ''), j.title)) >= v_fuzz)
    order by
      case when coalesce(nullif(tr.title, ''), j.title) ilike v_q || '%' then 0 else 1 end,
      word_similarity(v_q, coalesce(nullif(tr.title, ''), j.title)) desc,
      j.title asc
    limit 5
  )
  union all
  (
    select 'tag'::text,
           coalesce(nullif(tt.name, ''), t.name),
           t.slug,
           t.usage_count::bigint
    from gftvjobs_tags t
    left join gftvjobs_tag_translations tt on tt.tag_id = t.id and tt.locale = v_locale
    where t.usage_count > 0
      and (coalesce(nullif(tt.name, ''), t.name) ilike '%' || v_q || '%'
           or word_similarity(v_q, coalesce(nullif(tt.name, ''), t.name)) >= v_fuzz)
    order by
      case when coalesce(nullif(tt.name, ''), t.name) ilike v_q || '%' then 0 else 1 end,
      t.usage_count desc, t.name asc
    limit 5
  )
  union all
  (
    select 'department'::text,
           coalesce(nullif(dt.name, ''), d.name),
           d.slug,
           (select count(*) from gftvjobs_jobs j
             where j.department_id = d.id and j.status = 'published')::bigint
    from gftvjobs_departments d
    left join gftvjobs_department_translations dt
      on dt.department_id = d.id and dt.locale = v_locale
    where d.is_active
      and (coalesce(nullif(dt.name, ''), d.name) ilike '%' || v_q || '%'
           or word_similarity(v_q, coalesce(nullif(dt.name, ''), d.name)) >= v_fuzz)
      and exists (select 1 from gftvjobs_jobs j
                   where j.department_id = d.id and j.status = 'published')
    order by
      case when coalesce(nullif(dt.name, ''), d.name) ilike v_q || '%' then 0 else 1 end,
      d.sort_order asc, d.name asc
    limit 5
  );
end;
$$;

comment on function gftvjobs_suggest(text, text) is
  'Grouped autocomplete in any active language. Substring for the prefix somebody is typing, word_similarity against gftvjobs_typo_threshold() for a typo. The minimum query length is one character for a language Postgres cannot tokenise and two otherwise.';

insert into gftvjobs_migrations (filename)
values ('030_typo_tolerant_search.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- Restores the versions from 028 and 016, which are these with similarity() in
-- place of word_similarity() and the % operator in place of the explicit
-- comparisons. Paste those two function bodies, then:
--
-- begin;
-- -- recreate gftvjobs_search_jobs from 028 and gftvjobs_suggest from 016
-- drop function if exists gftvjobs_typo_threshold();
-- delete from gftvjobs_migrations where filename = '030_typo_tolerant_search.sql';
-- commit;
