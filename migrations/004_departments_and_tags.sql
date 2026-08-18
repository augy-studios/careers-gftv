-- 004_departments_and_tags.sql
--
-- Creates: gftvjobs_departments, gftvjobs_tags.
-- Spec:    section 6 (New tables), section 8 sections 6 and 7 (admin CRUD).
-- Run after: 002 (for gftvjobs_touch_updated_at).
--
-- Both are reference tables that postings point at. They come before 005
-- because gftvjobs_jobs has a foreign key to departments and 005 creates the
-- job to tag join table.
--
-- gftvjobs_tags.usage_count is a denormalised count so the tag cloud in
-- section 4 does not need a join on every render. It is maintained by a
-- trigger in 007, never by application code, so a posting edited directly in
-- the Supabase table editor keeps the counts honest.
--
-- Case insensitive uniqueness on tag name is required by section 6, so
-- "Video Editing" and "video editing" cannot both exist.

begin;

create table if not exists gftvjobs_departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists gftvjobs_departments_name_lower_key
  on gftvjobs_departments (lower(name));

create index if not exists gftvjobs_departments_sort_order_idx
  on gftvjobs_departments (sort_order, name);

drop trigger if exists gftvjobs_departments_touch on gftvjobs_departments;
create trigger gftvjobs_departments_touch
  before update on gftvjobs_departments
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_departments is
  'Teams a posting can belong to. Browse by department on the home page, and a search filter.';

create table if not exists gftvjobs_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  colour      text,
  description text,
  usage_count int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists gftvjobs_tags_name_lower_key
  on gftvjobs_tags (lower(name));

-- Trigram index for the tag autocomplete and the typo fallback in section 4.
create index if not exists gftvjobs_tags_name_trgm_idx
  on gftvjobs_tags using gin (name gin_trgm_ops);

-- The tag cloud orders by this, and hides tags with a zero count.
create index if not exists gftvjobs_tags_usage_count_idx
  on gftvjobs_tags (usage_count desc);

comment on table gftvjobs_tags is
  'Free form tags on postings. Slug is lowercase and hyphenated, generated from the name.';
comment on column gftvjobs_tags.usage_count is
  'Count of published postings carrying this tag. Maintained by trigger in 007, never written by application code.';
comment on column gftvjobs_tags.colour is
  'Optional pill colour override. Must still meet WCAG AA in all four theme combinations, see gftv-theme.md.';

alter table gftvjobs_departments enable row level security;
alter table gftvjobs_tags        enable row level security;

insert into gftvjobs_migrations (filename)
values ('004_departments_and_tags.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_tags;
-- drop table if exists gftvjobs_departments;
-- delete from gftvjobs_migrations where filename = '004_departments_and_tags.sql';
-- commit;
