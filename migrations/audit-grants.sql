-- audit-grants.sql
--
-- **Read only. Not a numbered file, and nothing here changes anything.** Paste
-- it into the Supabase SQL editor and read the six answers. Like
-- dev-seed-jobs.sql, it sits in this folder because that is where SQL lives, not
-- because it is part of the migration sequence.
--
-- Written 24 August 2026, after migration 035. The four views it closed were
-- found by Supabase's advisor rather than by us, and nobody had ever asked the
-- general question: **what can a holder of this project's anon key actually
-- reach?** That question matters more here than on a project of one app, because
-- this Postgres is shared with other GFTV apps, so an anon key for it genuinely
-- exists in code this repo does not contain.
--
-- The model being checked, from api/_lib/supabase.js: every gftvjobs_ table has
-- RLS enabled with no policies, the API holds the service role key and bypasses
-- it, and nothing else should be able to read anything. Query 1 is the one that
-- matters; the rest say why an answer is what it is.

-- ---------------------------------------------------------------------------
-- 1. What can anon or authenticated read, write, or execute?
-- ---------------------------------------------------------------------------
--
-- Expect: only rows for tables, and only where RLS is on with no policies,
-- which makes the grant inert. Any VIEW here is a finding: a view is not
-- covered by the RLS underneath it unless security_invoker is set, which is the
-- whole of 035.

select
  c.relkind,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'VIEW'
    when 'm' then 'MATERIALISED VIEW'
    when 'p' then 'partitioned table'
    when 'f' then 'foreign table'
    else c.relkind::text
  end                                                  as kind,
  c.relname                                            as object,
  g.grantee,
  string_agg(distinct g.privilege_type, ', ' order by g.privilege_type) as privileges,
  c.relrowsecurity                                     as rls_on,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
from information_schema.role_table_grants g
join pg_class c      on c.relname = g.table_name
join pg_namespace n  on n.oid = c.relnamespace and n.nspname = g.table_schema
where g.table_schema = 'public'
  and g.grantee in ('anon', 'authenticated', 'PUBLIC')
group by c.relkind, c.relname, g.grantee, c.relrowsecurity, c.oid
order by
  -- Views first: they are the ones that can leak past RLS.
  case when c.relkind in ('v', 'm') then 0 else 1 end,
  c.relname,
  g.grantee;

-- ---------------------------------------------------------------------------
-- 2. Any table in public with RLS off
-- ---------------------------------------------------------------------------
--
-- Expect: nothing named gftvjobs_. Anything else belongs to another GFTV app
-- and is that app's business, but it is worth seeing what is next to us.

select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by c.relname;

-- ---------------------------------------------------------------------------
-- 3. Every view in public, and whether it defers to the caller
-- ---------------------------------------------------------------------------
--
-- Expect: four rows, all gftvjobs_, all with security_invoker=on. This is 035's
-- second verification query widened to the whole schema, so a view created by
-- another app shows up here too.

select c.relname as view_name,
       pg_get_userbyid(c.relowner) as owner,
       coalesce(
         (select true from unnest(c.reloptions) o where o = 'security_invoker=on'),
         false
       ) as defers_to_caller
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by defers_to_caller, c.relname;

-- ---------------------------------------------------------------------------
-- 4. What can anon or authenticated execute?
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so expect a
-- long list rather than an empty one, and read it for what the functions
-- actually do. gftvjobs_search_jobs and gftvjobs_suggest reading published
-- postings is the public search and is fine. Anything that writes, or that
-- returns a row from gftvjobs_users, is a finding.
--
-- The security column is the one that decides how much any of this matters: an
-- invoker function runs with the caller's rights, so RLS still applies to
-- everything it touches.

select p.oid::regprocedure as signature,
       case when p.prosecdef then 'DEFINER' else 'invoker' end as security,
       coalesce(array_to_string(p.proconfig, ', '), '(no search_path)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'execute')
order by p.prosecdef desc, p.proname;

-- ---------------------------------------------------------------------------
-- 5. Sequences
-- ---------------------------------------------------------------------------
--
-- Expect: nothing from gftvjobs_. Every id in this schema is a uuid, so there
-- should be no sequence to reach. A readable sequence leaks how many rows a
-- table has ever had, which is not nothing.

select c.relname as sequence_name, g.grantee, g.privilege_type
from information_schema.role_usage_grants g
join pg_class c     on c.relname = g.object_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.object_schema
where g.object_schema = 'public'
  and c.relkind = 'S'
  and g.grantee in ('anon', 'authenticated', 'PUBLIC')
order by c.relname, g.grantee;

-- ---------------------------------------------------------------------------
-- 6. Where the extensions live
-- ---------------------------------------------------------------------------
--
-- Not a permissions question. It is the fact migration 036 depends on: the
-- search functions call word_similarity() unqualified, so pg_trgm has to be in
-- a schema named in the search_path 036 pins. 036 refuses to apply if it is
-- not, and this is how to see the answer without reading a raise.

select e.extname, n.nspname as schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by e.extname;
