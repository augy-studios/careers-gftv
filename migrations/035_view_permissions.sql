-- 035_view_permissions.sql
--
-- Changes: the four views created by 032 and 033 stop being readable by anon
--          and authenticated, and start enforcing the caller's own permissions
--          instead of their owner's.
-- Spec:    section 2 ("every gftvjobs_ table has RLS enabled with no policies,
--          so anything holding an anon key gets nothing"), and the note at the
--          top of api/_lib/supabase.js about the project being shared with
--          other GFTV apps.
-- Run after: 032 and 033, which create the four views, and 034, the previous
--            numbered file.
--
-- **This is a leak being closed, not a linter being satisfied.** Supabase
-- reports it as "Security Definer View", which undersells it. The mechanism:
--
--   Every gftvjobs_ table has row level security enabled and no policies at
--   all, which is this build's whole access model. The API holds the service
--   role key, which bypasses RLS; anything else gets an empty result. That is
--   what makes it safe for other GFTV apps to hold an anon key for this same
--   Postgres project.
--
--   A view does not inherit that. A view created by postgres runs as postgres
--   by default, so the RLS on the tables underneath it is evaluated as the view
--   owner rather than as whoever is asking. Supabase's default privileges in
--   the public schema grant on new objects to anon and authenticated. Put those
--   two facts together and each of these four views is a doorway around the RLS
--   on the tables it reads.
--
-- **gftvjobs_application_search is the one that matters.** Its search_text
-- column is every applicant's display name, username, and *email address*,
-- lowercased onto one row. 032 was careful that the email "is never selected
-- back out", which is true of the tracking page and irrelevant to somebody
-- querying the view directly with an anon key. gftvjobs_job_funnel and its
-- daily sibling carry every posting including drafts, with their conversion
-- numbers; gftvjobs_needs_translation carries titles and translation states.
--
-- Two changes per view, and each does something the other does not:
--
--   **Revoke** stops the request at the permission check, whatever the view
--   does internally, and holds even if a policy is added to a table later.
--
--   **security_invoker** makes the view evaluate the underlying tables as the
--   caller, so the RLS that protects the tables protects the view too. That is
--   what still holds if a future grant is handed out by default privileges, by
--   a `grant all on all tables in schema public`, or by hand.
--
-- The service role is untouched by both and keeps working: it has its own
-- grants and the bypassrls attribute, so security_invoker changes nothing for
-- the API. Nothing in main-site needs editing for this file.
--
-- **Any view added after this one gets the same two lines.** A table is safe by
-- default in this schema because RLS is switched on with no policies; a view is
-- not, and that asymmetry is exactly what went unnoticed for two migrations.

begin;

do $$
declare
  target    text;
  role_name text;
  targets   text[] := array[
    'gftvjobs_needs_translation',
    'gftvjobs_application_search',
    'gftvjobs_job_funnel',
    'gftvjobs_job_funnel_daily'
  ];
  -- PUBLIC is in the list because a grant to it reaches every role at once and
  -- would survive revoking the two named ones.
  roles     text[] := array['anon', 'authenticated'];
begin
  foreach target in array targets loop
    if to_regclass('public.' || target) is null then
      raise notice '035: % does not exist, skipped', target;
      continue;
    end if;

    execute format('revoke all on public.%I from public', target);

    foreach role_name in array roles loop
      -- Checked rather than assumed, so this file also applies cleanly to a
      -- plain Postgres that has never heard of Supabase's two roles.
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on public.%I from %I', target, role_name);
      end if;
    end loop;

    -- security_invoker arrived in Postgres 15. Below that there is no way to
    -- make a view defer to the caller, and the revokes above are the whole
    -- defence: worth saying out loud rather than skipping in silence, because
    -- the Supabase advisor would keep reporting these and the reason would not
    -- be obvious a year later.
    if current_setting('server_version_num')::int >= 150000 then
      execute format('alter view public.%I set (security_invoker = on)', target);
    else
      raise notice
        '035: Postgres % is below 15, so %.security_invoker cannot be set. The revokes still applied.',
        current_setting('server_version'), target;
    end if;
  end loop;
end $$;

insert into gftvjobs_migrations (filename)
values ('035_view_permissions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Checking it worked. Both of these should come back empty:
--
--   -- 1. No view in public may be readable by anon or authenticated.
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('anon', 'authenticated', 'PUBLIC')
--     and table_name in (
--       'gftvjobs_needs_translation', 'gftvjobs_application_search',
--       'gftvjobs_job_funnel', 'gftvjobs_job_funnel_daily'
--     );
--
--   -- 2. Every one of them defers to the caller.
--   select c.relname, c.reloptions
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'v'
--     and (c.reloptions is null or not ('security_invoker=on' = any(c.reloptions)));
--
-- Rollback
--
-- Deliberately not written. Undoing this file means handing anon the ability to
-- read every applicant's email address, and nobody should be able to do that by
-- pasting a commented block from the bottom of a migration.
