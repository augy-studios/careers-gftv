-- 017_embed_descriptions.sql
--
-- Creates: og_description on gftvjobs_jobs.
-- Spec:    section 4 (job detail, link embeds), section 8.2 (job editor).
-- Run after: 005. Independent of 014, though the per language embed line it
--            mentions lives on gftvjobs_job_translations.
--
-- The short line that appears when a posting link is pasted into Discord,
-- Telegram, Slack, or anywhere else that unfurls a URL. Optional. When it is
-- empty the site falls back to the first sentence of the posting's own
-- description, so a posting always unfurls with something readable and an
-- admin never has to fill this in.
--
-- Why the fallback is computed in the API rather than as a generated column
-- here: finding the first sentence is language dependent. English ends a
-- sentence with a full stop, Mandarin with U+3002. A generated column would
-- also have to be immutable and would still be wrong for markdown, which the
-- description may contain. The rule lives in one place in the serverless
-- function that renders the page, and is documented there.
--
-- Only the default language sits here. A language with its own embed line
-- carries it on its gftvjobs_job_translations row, alongside the form URL it
-- belongs with.
--
-- Worth knowing, and recorded in the spec rather than fixed here: a crawler
-- has no localStorage, so it has no language preference to read. Every embed
-- is served in English regardless of what the person sharing the link was
-- reading. Changing that would need the language in the URL, which was
-- decided against.

begin;

alter table gftvjobs_jobs
  add column if not exists og_description text;

comment on column gftvjobs_jobs.og_description is
  'Optional short line for link unfurls in Discord, Telegram, and similar. Falls back to the first sentence of description when empty. Never required.';

-- A cap rather than a target. Discord shows roughly 350 characters and most
-- unfurlers cut somewhere near 200, so anything past 300 is guaranteed to be
-- truncated mid sentence in at least one client.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_jobs_og_description_length'
  ) then
    alter table gftvjobs_jobs add constraint gftvjobs_jobs_og_description_length
      check (og_description is null or char_length(og_description) <= 300);
  end if;
end $$;

insert into gftvjobs_migrations (filename)
values ('017_embed_descriptions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- alter table gftvjobs_jobs drop constraint if exists gftvjobs_jobs_og_description_length;
-- alter table gftvjobs_jobs drop column if exists og_description;
-- delete from gftvjobs_migrations where filename = '017_embed_descriptions.sql';
-- commit;
