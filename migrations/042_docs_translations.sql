-- 042_docs_translations.sql
--
-- Creates: gftvjobs_docs_translations, gftvjobs_docs_pages,
--          gftvjobs_docs_public.
-- Spec:    section 6 (New tables, both named there), 16e (Content, in two
--          pipelines), 16f (Language), 3a (base row plus translation).
-- Run after: 041, the previous numbered file. It references
--            gftvjobs_locales, which migration 014 created.
--
-- ---------------------------------------------------------------------------
-- What phase 14 part 9 needed that did not exist
-- ---------------------------------------------------------------------------
--
-- The documentation site has been bilingual in its chrome since phase 13 part
-- 6a and English in every word of its content since. 16f settled that the whole
-- site follows 3a, staff half included, and 16e settled where a translation
-- lives: the markdown file is the base row and every other language is a row in
-- a table. Neither table existed. This file is both of them, plus the view that
-- is the only thing outside Vercel allowed to read a page.
--
-- ---------------------------------------------------------------------------
-- Two tables and not one, and the difference between them
-- ---------------------------------------------------------------------------
--
--   gftvjobs_docs_translations   every language except English, for every page
--                                on the site, public and gated alike.
--
--   gftvjobs_docs_pages          English, for the public pages only. A mirror,
--                                written one direction by the build.
--
-- The asymmetry is not an oversight and section 6 states it twice. The English
-- of a page is the file, and the file is inside a Vercel project: the site
-- reads it off its own disk and needs nothing. **Anything outside Vercel needs
-- the English put somewhere it can reach**, and the Telegram bot's /docs is the
-- first such reader. So the mirror exists for the bot and carries only what the
-- bot may serve.
--
-- ---------------------------------------------------------------------------
-- The access key is never here, in either table
-- ---------------------------------------------------------------------------
--
-- 16e, and it is the sentence the whole two pipeline arrangement rests on:
-- "whoever may read a page is decided by exactly one thing, and a translation
-- row that could carry its own tier would be a second answer to the question
-- the whole arrangement exists to have one answer to."
--
-- So neither table has an access column. What follows from that is the one
-- thing worth reading this file slowly for:
--
--   **gftvjobs_docs_translations holds the 华文 of gated pages.** It has to.
--   The admin guide is fourteen pages and a job poster who reads 华文 gets the
--   same manual as everybody else, per 16f. Those rows carry no tier and are
--   indistinguishable, in this table, from the translation of a public page.
--
--   **gftvjobs_docs_pages holds no gated page at all.** The build refuses to
--   write one here the way it already refuses to render one into dist/.
--
-- Which means a reader that queried the translations table directly and served
-- what it found would serve the admin guide to anybody who asked. That is not a
-- hypothetical: phase 14's part 10 puts /docs in the Telegram bot, reading
-- Supabase with the bot's service key, and section 2 of the working memo has
-- carried the worry about it since 3 September 2026 -- "the tier rule is
-- implemented twice, once in reader.js and once in Python, and the copies can
-- disagree".
--
-- ---------------------------------------------------------------------------
-- gftvjobs_docs_public, which is how that worry is discharged instead of paid
-- ---------------------------------------------------------------------------
--
-- The view below joins the translations to the mirror. A gated page has no
-- mirror row, so a gated translation joins to nothing and is not in the view.
-- **The bot reads the view and never either table**, and there is no tier logic
-- in Python at all: not a second copy that can drift, but no copy.
--
-- It is an inner join and that is load bearing. Written as a left join from the
-- translations side it would carry every gated page with null English beside
-- it, which is the same leak arriving through a different keyword.
--
-- The view carries English as a row of its own, so a caller asks for the page
-- and the locale it wants and gets one row or none. A bot that had to read one
-- table for English and another for 华文 would be a bot with a fallback rule in
-- it, which is a third place for the fallback to be wrong.
--
-- ---------------------------------------------------------------------------
-- Blank falls back, per 3a, and the fallback is here and not in the caller
-- ---------------------------------------------------------------------------
--
-- 3a: a translation row is shown only when is_ready is set, and a blank field
-- falls back to the base row. Both halves are in the view. is_ready is a where
-- clause, so half a translated page is never in it; an empty title is a
-- coalesce, so a row that was saved with one field filled in reads as a page
-- and not as a blank heading.
--
-- ---------------------------------------------------------------------------
-- Nothing edits a row by hand
-- ---------------------------------------------------------------------------
--
-- Both tables are written by docs-site/scripts/build.js at deploy time, from
-- files in the repository, one direction. That is phase 14 part 9's decision
-- and it is worth knowing before editing a row in the Supabase table editor:
-- the next deploy overwrites it, because the build makes the table match the
-- tree. What survives an edit is nothing.
--
-- The columns that suggest otherwise -- updated_by, is_ready -- are section 6's
-- shape and are kept because the shape is what a later translation helper
-- surface would need. Today the build writes is_ready true for every file it
-- finds and leaves updated_by null, which is honest: no person is on the other
-- end of the write.

begin;

-- ---------------------------------------------------------------------------
-- Guide translations, every language but English, every page
-- ---------------------------------------------------------------------------
--
-- page_path is the site's own path -- '/portal/applying', '/staff/admin/daily-run'
-- -- and never a file name. The two content trees sit at different places on
-- disk and both answer at one address space, which is the thing a row has to be
-- keyed by; a file name would key the gated half to a directory no URL contains.
--
-- There is no foreign key to a page, because a page is a file and Postgres
-- cannot reference one. What keeps a row from outliving its page is the build:
-- it deletes every row whose page is no longer in the tree.

create table if not exists gftvjobs_docs_translations (
  id         uuid primary key default gen_random_uuid(),
  page_path  text not null,
  locale     text not null references gftvjobs_locales (code) on delete restrict,

  title      text,
  summary    text,
  body       text,

  -- Per 3a. Half a translated page is never shown, and the view below is where
  -- that is enforced for every reader at once.
  is_ready   boolean not null default false,

  -- Null for everything the build writes, and that is the truthful value: a
  -- deploy is not a person. It is here for the helper surface that 7h's shape
  -- would need, and section 6 names it.
  updated_by uuid,

  -- **When this translation last changed, and not when it was last deployed.**
  -- The build takes it from git, the same way the English page's date is taken,
  -- and writes null where git cannot date the file. Defaulting it to now()
  -- would make every row in the table claim to have changed on every deploy,
  -- which would then flow through gftvjobs_docs_public and give every
  -- translated page a date that moves on its own.
  updated_at timestamptz,
  created_at timestamptz not null default now(),

  constraint gftvjobs_docs_translations_page_locale_key unique (page_path, locale),

  -- A path and not a file, and not a URL either. Anchored, lower case, no
  -- trailing slash, and no '..' can be spelled with these characters at all.
  constraint gftvjobs_docs_translations_path_shape
    check (page_path = '/' or page_path ~ '^(/[a-z0-9][a-z0-9-]*){1,3}$')
);

create index if not exists gftvjobs_docs_translations_page_path_idx
  on gftvjobs_docs_translations (page_path);

create index if not exists gftvjobs_docs_translations_locale_idx
  on gftvjobs_docs_translations (locale);

alter table gftvjobs_docs_translations enable row level security;

comment on table gftvjobs_docs_translations is
  'Guide content in every language but English, per 16e. The markdown file is the base row. It holds gated pages as well as public ones and carries no access key, so nothing outside Vercel may read it directly: read gftvjobs_docs_public.';
comment on column gftvjobs_docs_translations.page_path is
  'The address on the docs site, such as /portal/applying. Never a file name: the two content trees are two directories and one address space.';
comment on column gftvjobs_docs_translations.is_ready is
  'Per 3a. A row is served only when this is set, so half a translated page is never shown.';
comment on column gftvjobs_docs_translations.updated_by is
  'The staff account that last edited this row, where a person did. Null for everything the build writes, because a deploy is not a person.';

-- ---------------------------------------------------------------------------
-- The English mirror, public pages only
-- ---------------------------------------------------------------------------
--
-- Written by docs-site/scripts/build.js and read by the Telegram bot, through
-- the view. Nothing on the docs site reads it: the site has the files.
--
-- **A gated page in this table is the leak 16e names.** The build refuses to
-- write one and tests/phase14-test.mjs checks the refusal, but the honest place
-- for the rule is beside the data, so the comment says it here too: every row
-- in this table is world readable content, because everything that reads it
-- serves it to anybody who asks.
--
-- ---------------------------------------------------------------------------
-- One deviation from section 6's stated shape: updated_at is nullable
-- ---------------------------------------------------------------------------
--
-- Section 6 says "updated_at timestamptz not null". It is nullable here, and
-- the reason is the same rule build.js already states twice about this exact
-- value: **a page git cannot date carries no date at all, and nothing is
-- allowed to fill it in.**
--
-- There are two honest ways to arrive at one, and neither is rare. A page that
-- has never been committed is one. A page older than the clone is the other,
-- and that one happens on the deployment and not on a laptop, because Vercel
-- clones shallowly -- which is precisely where a not null violation would stop
-- a deploy that is otherwise correct.
--
-- So the two candidates were: invent a date, or allow none. Inventing one means
-- the column reads "when this page last changed" and holds "when it was last
-- deployed", which is the build claiming a page was reviewed on the day it
-- happened to be pushed. Allowing none means the bot draws no date, exactly as
-- the site does for the same page.
--
-- It is never defaulted to now() for the same reason. A default would put the
-- invented value back in through the one door left open.

create table if not exists gftvjobs_docs_pages (
  page_path  text primary key,
  title      text not null,
  summary    text,
  body       text not null,
  updated_at timestamptz,

  constraint gftvjobs_docs_pages_path_shape
    check (page_path = '/' or page_path ~ '^(/[a-z0-9][a-z0-9-]*){1,3}$'),

  -- **No gated page, spelled as a constraint.** The build refuses first and
  -- this refuses after it, because the two failures are different sizes: a
  -- build refusing is a deploy that stops, and this refusing is the last thing
  -- standing between a bug in that build and the admin guide on Telegram.
  constraint gftvjobs_docs_pages_public_only
    check (page_path <> '/staff' and page_path not like '/staff/%')
);

comment on table gftvjobs_docs_pages is
  'The English of the public guide pages, mirrored one direction by docs-site/scripts/build.js at deploy time, for readers outside Vercel. Public pages only, per section 6, and the check constraint is what says so. Never edited by hand: the next deploy overwrites it.';
comment on column gftvjobs_docs_pages.updated_at is
  'The page''s own last change, from git, and null where git could not date it. Never the deploy time: a mirror lagging behind the site has to be visible, and an invented date is what would hide it.';

alter table gftvjobs_docs_pages enable row level security;

-- ---------------------------------------------------------------------------
-- The one thing outside Vercel that may read a page
-- ---------------------------------------------------------------------------
--
-- One row per public page per language, English included. A caller asks for a
-- path and a locale and gets one row or none, and a miss is a page it should
-- ask for in English instead.
--
-- The inner join is the gate. Everything above explains why.

create or replace view gftvjobs_docs_public
  -- A view runs as its owner, so the row level security on the tables
  -- underneath does not apply unless this is set. Migration 035 is where that
  -- was learned across four views at once; every view created since carries it
  -- in the file that creates it, with the revoke below.
  with (security_invoker = true) as

select
  p.page_path,
  'en'::text as locale,
  p.title,
  p.summary,
  p.body,
  p.updated_at
from gftvjobs_docs_pages p

union all

select
  p.page_path,
  t.locale,
  -- Per 3a: a blank field falls back to the base row, so a half filled row
  -- reads as a page. is_ready below is what keeps a half filled one out.
  coalesce(nullif(btrim(t.title), ''), p.title)     as title,
  coalesce(nullif(btrim(t.summary), ''), p.summary) as summary,
  coalesce(nullif(btrim(t.body), ''), p.body)       as body,
  greatest(p.updated_at, t.updated_at)              as updated_at
from gftvjobs_docs_pages p
join gftvjobs_docs_translations t
  on t.page_path = p.page_path
where t.is_ready;

comment on view gftvjobs_docs_public is
  'Every public guide page in every language, English included. The only thing outside Vercel that may read a page: the inner join to gftvjobs_docs_pages is what keeps a gated translation out, so nothing reading this needs tier logic of its own.';

-- Migration 035's rule, in the file that creates the view. The service key
-- bypasses this; an anon key is what it is for, and the project is shared with
-- other GFTV apps.
revoke all on gftvjobs_docs_public from anon, authenticated;

insert into gftvjobs_migrations (filename)
values ('042_docs_translations.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Safe, and it costs the 华文 of every guide until the next deploy: the build
-- rewrites both tables from the files every time it runs, so nothing here is
-- the only copy of anything. That is the whole point of authoring the
-- translations as files.
--
-- What it does break while it is rolled back is the docs site's content route,
-- which asks for a translation on every page view in a language that is not
-- English, and the bot's /docs. Both answer as though nothing is translated,
-- which is the English page with a notice on it.
--
-- begin;
-- drop view if exists gftvjobs_docs_public;
-- drop table if exists gftvjobs_docs_translations;
-- drop table if exists gftvjobs_docs_pages;
-- delete from gftvjobs_migrations where filename = '042_docs_translations.sql';
-- commit;
