-- 036_function_search_path.sql
--
-- Changes: every gftvjobs_ function in public gets a fixed search_path.
-- Spec:    no section. This is the second half of what 035 started, from
--          Supabase's advisor: "Function Search Path Mutable".
-- Run after: 035, and after every file that creates a function, which today is
--            002, 009, 010, 014, 016, 022, 028, 030, and 031.
--
-- **This one is hardening rather than a hole, and the difference is worth
-- stating.** A function with no search_path of its own runs with whatever the
-- caller's is. Where that bites is a SECURITY DEFINER function: somebody who can
-- create an object in a schema earlier in the caller's path can put their own
-- table or operator in front of the one the body meant, and the body runs it
-- with the definer's rights. **Nothing in this schema is SECURITY DEFINER**, and
-- anon has no create rights in public on a current Supabase, so there is no
-- version of this that is exploitable today. 035 was a leak; this is a door
-- being locked in a building nobody can enter.
--
-- It is done now anyway, and for one reason: twenty four standing warnings is
-- where the next real critical goes unnoticed. 035 was found by an advisor
-- rather than by us, and an advisor is only useful while its output is short
-- enough to read.
--
-- **The bodies are not rewritten.** alter function only touches proconfig, so
-- nothing here can change what a function computes. It also means overloads are
-- handled properly: gftvjobs_search_jobs has been recreated by 016, 028, and
-- 030, and gftvjobs_suggest by 010, 016, and 030. Older signatures may still be
-- installed, so the loop goes by oid rather than by name and catches every one
-- that actually exists rather than every one this repo remembers writing.
--
-- **The path is public, extensions, pg_catalog, and the extensions part is not
-- decoration.** gftvjobs_search_jobs and gftvjobs_suggest call word_similarity()
-- unqualified, which comes from pg_trgm. `create extension if not exists
-- pg_trgm` in 001 puts it wherever the session that ran it was pointed, which is
-- public in the SQL editor and `extensions` on some Supabase projects. Pinning
-- the path to a list that excludes the real one would leave every search
-- returning nothing at all, which is why the block below refuses to apply rather
-- than guessing. A schema named in a search_path that does not exist is ignored
-- silently, so naming both costs nothing.
--
-- Not `set search_path = ''`, which is Supabase's own suggestion. That one
-- requires every reference in every body to be schema qualified, and these
-- bodies name gftvjobs_ tables unqualified throughout. Rewriting 900 lines of
-- working search SQL to satisfy a linter is how a working search stops working.

begin;

do $$
declare
  fn        record;
  ext       record;
  wanted    text := 'public, extensions, pg_catalog';
  allowed   text[] := array['public', 'extensions', 'pg_catalog'];
  changed   int := 0;
begin
  -- 1. Refuse rather than guess. If an extension this schema's functions call
  --    unqualified lives somewhere the new path does not reach, the functions
  --    would start failing at run time, and the failure would look like search
  --    quietly returning nothing rather than like this file.
  for ext in
    select e.extname, n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('pg_trgm', 'pgcrypto')
  loop
    if not (ext.nspname = any(allowed)) then
      raise exception
        '036: % is installed in schema %, which is not in "%". Add it to the path in this file and re-run.',
        ext.extname, ext.nspname, wanted;
    end if;
  end loop;

  -- 2. Every function this repo owns, by oid, so all three generations of
  --    gftvjobs_search_jobs are caught and nothing is named twice.
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'gftvjobs\_%'
    order by 1
  loop
    execute format('alter function %s set search_path = %s', fn.signature, wanted);
    changed := changed + 1;
  end loop;

  raise notice '036: search_path set on % functions', changed;
end $$;

insert into gftvjobs_migrations (filename)
values ('036_function_search_path.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Checking it worked.
--
--   -- 1. Nothing left without a search_path. Should come back empty.
--   select p.oid::regprocedure as signature
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname like 'gftvjobs\_%'
--     and (p.proconfig is null
--          or not exists (
--            select 1 from unnest(p.proconfig) c where c like 'search_path=%'
--          ));
--
--   -- 2. And the search still finds things, which is the check that matters.
--   --    The second one is the typo path, which is the one that goes through
--   --    word_similarity and so the one this file could have broken.
--   select count(*) from gftvjobs_search_jobs('editor', '{}'::jsonb, 10, 0);
--   select match_mode, count(*)
--   from gftvjobs_search_jobs('editr', '{}'::jsonb, 10, 0)
--   group by match_mode;
--   select * from gftvjobs_suggest('edit', 'en');
--
-- Do the same from the outside afterwards: /search with a word that matches, and
-- /search with that word misspelled, which is the path through word_similarity
-- and so the one this file could have broken.
--
-- Rollback
--
--   begin;
--   do $$
--   declare fn record;
--   begin
--     for fn in
--       select p.oid::regprocedure as signature
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname like 'gftvjobs\_%'
--     loop
--       execute format('alter function %s reset search_path', fn.signature);
--     end loop;
--   end $$;
--   commit;
