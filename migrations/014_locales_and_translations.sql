-- 014_locales_and_translations.sql
--
-- Creates: gftvjobs_is_blank(), gftvjobs_locales, gftvjobs_job_translations,
--          gftvjobs_department_translations, gftvjobs_tag_translations, their
--          indexes, and the Mandarin translations of the seeded reference data.
-- Spec:    section 3a (Languages), section 4, section 6, section 8.
-- Run after: 013.
--
-- The portal is multilingual, English and Simplified Chinese today, and built
-- so that Malay and Tamil can be added later without a schema change. Adding a
-- language is an insert into gftvjobs_locales plus a dictionary file, not a
-- migration.
--
-- Shape, and why it is a table rather than _zh columns: a column per field per
-- language costs ten columns, a generated search column, and a fresh set of
-- constraints for every language added, which is exactly the cost Singapore's
-- four official languages would make us pay four times over. One row per
-- posting per language costs a join and nothing else.
--
-- **English lives on gftvjobs_jobs itself, not in the translations table.**
-- The base row is the source language. That keeps migration 005 intact, keeps
-- every existing query working, and means a posting always has content even
-- with no translation rows at all. Translation rows exist only for languages
-- other than the default, which the check constraint enforces.
--
-- A translation is shown only when its is_ready flag is set. That makes
-- "translated but not yet checked" a real state rather than something inferred
-- from which fields happen to be filled, which matters because a translation
-- that has not been read by a fluent speaker should not go out unreviewed.
--
-- Chinese search: Postgres cannot segment Han script. to_tsvector has no word
-- boundaries to work with, so a run of Han characters becomes a single token
-- and searching for a substring of it fails. The extensions that fix that,
-- zhparser and pg_jieba, are not available on Supabase. So each locale declares
-- whether Postgres can index it properly, in text_search_config, and the search
-- function in 016 uses a tsvector where it can and trigram matching where it
-- cannot. Malay would get 'simple' and work well; Tamil and Chinese would not.

begin;

-- Treats null and whitespace-only alike, so a form posting an empty string
-- cannot satisfy a "translation present" check. Immutable so it can be used
-- inside a check constraint.
create or replace function gftvjobs_is_blank(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or btrim(p_value) = '';
$$;

comment on function gftvjobs_is_blank(text) is
  'True when a text value is null or only whitespace. Used by the translation constraints.';

-- Validates a sections array: every entry an object with a non empty heading
-- and body. Written as an immutable function because a check constraint may
-- not contain a subquery, and walking a jsonb array needs one.
create or replace function gftvjobs_sections_valid(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select p_value is null or (
    jsonb_typeof(p_value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_value) as s
      where jsonb_typeof(s) <> 'object'
         or coalesce(btrim(s ->> 'heading'), '') = ''
         or coalesce(btrim(s ->> 'body'), '') = ''
    )
  );
$$;

comment on function gftvjobs_sections_valid(jsonb) is
  'True when a sections value is an array of objects each carrying a non empty heading and body.';

-- Flattens a sections array into plain text, so search can reach what an
-- admin writes in a custom section. Immutable, because a generated column
-- requires it.
create or replace function gftvjobs_sections_text(p_value jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    (select string_agg(
              coalesce(s ->> 'heading', '') || ' ' || coalesce(s ->> 'body', ''),
              ' ')
     from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) as s),
    '');
$$;

comment on function gftvjobs_sections_text(jsonb) is
  'Section headings and bodies as one string, for the search indexes. Without this, anything written in a custom section would be unsearchable.';

-- ---------------------------------------------------------------------------
-- Locales
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_locales (
  code               text primary key,
  english_name       text not null,
  native_name        text not null,
  html_lang          text not null,

  -- The Postgres text search configuration to use for this language, or null
  -- when Postgres cannot tokenise it usefully and the search must fall back to
  -- trigram matching. See the header note.
  text_search_config text,

  is_default         boolean not null default false,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),

  constraint gftvjobs_locales_code_shape
    check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);

-- Exactly one default language. Indexing the column itself and filtering to
-- true means every indexed row carries the same value, so uniqueness permits
-- only one of them. A constant index expression would read more directly but
-- is not reliably accepted, and this file is pasted into a SQL editor by hand.
create unique index if not exists gftvjobs_locales_one_default_idx
  on gftvjobs_locales (is_default) where is_default;

comment on table gftvjobs_locales is
  'Every language the portal offers. Adding Malay or Tamil is an insert here plus an assets/i18n dictionary, not a migration.';
comment on column gftvjobs_locales.native_name is
  'The language named in its own script, which is what the switcher shows. Never translated.';
comment on column gftvjobs_locales.text_search_config is
  'A Postgres text search configuration name, or null when Postgres cannot tokenise the language and search must use trigram matching instead.';
comment on column gftvjobs_locales.is_default is
  'The default language. Its content lives on the base rows, not in the translation tables.';

insert into gftvjobs_locales
  (code, english_name, native_name, html_lang, text_search_config, is_default, sort_order) values
  ('en', 'English', 'English',  'en',         'english', true,  10),
  ('zh', 'Chinese', '华文',      'zh-Hans-SG', null,      false, 20)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Job translations
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_job_translations (
  job_id               uuid not null references gftvjobs_jobs (id) on delete cascade,
  locale               text not null references gftvjobs_locales (code) on delete restrict,

  title                text,
  summary              text,
  description          text,
  responsibilities     text,
  requirements         text,
  nice_to_have         text,
  location             text,
  compensation_note    text,

  -- Extra sections beyond the fixed fields above, as an ordered array of
  -- {"heading": ..., "body": ...} objects. Headings are content, so they
  -- translate with everything else rather than being keyed to a dictionary.
  sections             jsonb not null default '[]'::jsonb,

  -- The short line used when a link is unfurled in Discord or Telegram.
  og_description       text,

  -- A language may point at its own application form. Some roles run a
  -- separate Mandarin form rather than one bilingual form, so this is nullable
  -- and falls back to the posting's own application_form_url when empty.
  -- form_prefill and response_sheet_url follow the form they belong to: a
  -- different form has different entry ids and a different response sheet.
  application_form_url text,
  form_prefill         jsonb,
  response_sheet_url   text,

  -- Shown to readers only when this is true. Explicit rather than inferred, so
  -- a draft or unreviewed translation can sit in the table without going live.
  is_ready             boolean not null default false,

  search_text          text generated always as (
                         coalesce(title, '') || ' ' ||
                         coalesce(summary, '') || ' ' ||
                         coalesce(description, '') || ' ' ||
                         coalesce(responsibilities, '') || ' ' ||
                         coalesce(requirements, '') || ' ' ||
                         coalesce(nice_to_have, '') || ' ' ||
                         coalesce(location, '') || ' ' ||
                         gftvjobs_sections_text(sections)
                       ) stored,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  primary key (job_id, locale),

  -- The default language lives on gftvjobs_jobs. A row here for it would be a
  -- second, competing copy. If the default language ever changes, that is a
  -- new numbered file, not an edit to this one.
  constraint gftvjobs_job_translations_not_default
    check (locale <> 'en'),

  -- A translation goes live only when the fields a reader actually reads are
  -- written in that language. Title, summary, and description are the body of
  -- the page; a translation missing any of them would render as a Chinese
  -- heading above an English posting, which is the half translated state this
  -- build exists to avoid.
  --
  -- The optional fields, responsibilities and below, still fall back to the
  -- posting silently. That is a smaller mismatch than a blank body, and
  -- catching it needs a comparison across two tables that a check constraint
  -- cannot make. The needs-translation audit in 8.11 surfaces those instead.
  constraint gftvjobs_job_translations_ready_needs_body
    check (
      not is_ready
      or (
            not gftvjobs_is_blank(title)
        and not gftvjobs_is_blank(summary)
        and not gftvjobs_is_blank(description)
      )
    ),

  constraint gftvjobs_job_translations_og_length
    check (og_description is null or char_length(og_description) <= 300),

  constraint gftvjobs_job_translations_sections_valid
    check (gftvjobs_sections_valid(sections))
);

create index if not exists gftvjobs_job_translations_locale_idx
  on gftvjobs_job_translations (locale, is_ready);

create index if not exists gftvjobs_job_translations_search_trgm_idx
  on gftvjobs_job_translations using gin (search_text gin_trgm_ops);

create index if not exists gftvjobs_job_translations_title_trgm_idx
  on gftvjobs_job_translations using gin (title gin_trgm_ops);

-- The admin audit in 8.11: translations started but not yet ready.
create index if not exists gftvjobs_job_translations_not_ready_idx
  on gftvjobs_job_translations (updated_at desc) where not is_ready;

drop trigger if exists gftvjobs_job_translations_touch on gftvjobs_job_translations;
create trigger gftvjobs_job_translations_touch
  before update on gftvjobs_job_translations
  for each row execute function gftvjobs_touch_updated_at();

comment on table gftvjobs_job_translations is
  'One row per posting per non default language. A blank field falls back to the posting itself, so a translation need not repeat what has not changed.';
comment on column gftvjobs_job_translations.application_form_url is
  'Optional. Set it when this language has its own application form. Falls back to the posting''s form when empty.';
comment on column gftvjobs_job_translations.is_ready is
  'Readers see this translation only when true. Lets an unreviewed translation sit in the table without going live.';

-- ---------------------------------------------------------------------------
-- Department and tag translations
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_department_translations (
  department_id uuid not null references gftvjobs_departments (id) on delete cascade,
  locale        text not null references gftvjobs_locales (code) on delete restrict,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (department_id, locale),

  constraint gftvjobs_department_translations_not_default check (locale <> 'en'),
  constraint gftvjobs_department_translations_name_present
    check (not gftvjobs_is_blank(name))
);

drop trigger if exists gftvjobs_department_translations_touch on gftvjobs_department_translations;
create trigger gftvjobs_department_translations_touch
  before update on gftvjobs_department_translations
  for each row execute function gftvjobs_touch_updated_at();

create table if not exists gftvjobs_tag_translations (
  tag_id      uuid not null references gftvjobs_tags (id) on delete cascade,
  locale      text not null references gftvjobs_locales (code) on delete restrict,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (tag_id, locale),

  constraint gftvjobs_tag_translations_not_default check (locale <> 'en'),
  constraint gftvjobs_tag_translations_name_present
    check (not gftvjobs_is_blank(name))
);

create index if not exists gftvjobs_tag_translations_name_trgm_idx
  on gftvjobs_tag_translations using gin (name gin_trgm_ops);

drop trigger if exists gftvjobs_tag_translations_touch on gftvjobs_tag_translations;
create trigger gftvjobs_tag_translations_touch
  before update on gftvjobs_tag_translations
  for each row execute function gftvjobs_touch_updated_at();

-- The slug is not translated on either table. It is a URL identifier and a
-- filter value, so translating it would break every shared link the moment
-- somebody switched language.
comment on table gftvjobs_tag_translations is
  'Tag names per non default language. The slug is shared and never translated.';

-- ---------------------------------------------------------------------------
-- Mandarin for the seeded reference data
--
-- Singapore Mandarin, 华文, not Mainland Putonghua: 义工 rather than 志愿者,
-- 营运 rather than 运营, 摄影棚 rather than 录影棚, 文件 rather than 文档.
-- ---------------------------------------------------------------------------

insert into gftvjobs_department_translations (department_id, locale, name, description)
select d.id, 'zh', v.name, v.description
from (values
  ('production',            '制作',       '策划和执行拍摄、摄影棚录制以及直播。'),
  ('post-production',       '后期制作',   '剪辑、调色、动态图形、字幕，以及拍摄之后的所有工作。'),
  ('broadcast-engineering', '广播工程',   '直播基础设施、编码器、播出系统，以及维持频道正常播出的各项工具。'),
  ('creative-and-design',   '创意与设计', '品牌形象、频道识别、缩略图、印刷品，以及活动设计。'),
  ('programming',           '节目编排',   '节目安排、内容委约，以及决定播出什么和何时播出。'),
  ('community',             '社群',       '社交媒体频道、聊天室管理，以及照顾观众。'),
  ('events',                '活动',       '展会报道、座谈会，以及所有在摄影棚以外拍摄的内容。'),
  ('operations',            '营运',       '义工协调、排班、文件整理，以及日常运作。')
) as v(slug, name, description)
join gftvjobs_departments d on d.slug = v.slug
on conflict (department_id, locale) do nothing;

insert into gftvjobs_tag_translations (tag_id, locale, name, description)
select t.id, 'zh', v.name, v.description
from (values
  ('video-editing',      '视频剪辑', '剪辑、组接，以及成片交付。'),
  ('motion-graphics',    '动态图形', '动画标题、字幕条，以及频道识别动画。'),
  ('camera',             '摄影',     '在拍摄现场或摄影棚操作摄影机。'),
  ('audio',              '音频',     '录音、混音，以及母带处理。'),
  ('lighting',           '灯光',     '摄影棚和外景的灯光设计与布置。'),
  ('live-streaming',     '直播',     '从头到尾负责一场直播。'),
  ('obs',                'OBS',      '在 OBS Studio 中搭建场景和进行设置。'),
  ('presenting',         '主持',     '出镜主持。'),
  ('scriptwriting',      '编剧',     '撰写脚本、环节内容，以及节目流程。'),
  ('subtitling',         '字幕',     '字幕、隐藏式字幕，以及文字记录。'),
  ('graphic-design',     '平面设计', '用于屏幕和印刷的静态设计。'),
  ('social-media',       '社交媒体', '发布、排期，以及账户成长。'),
  ('moderation',         '社群管理', '聊天室和社群管理。'),
  ('project-management', '项目管理', '协调人员、时间表，以及交付内容。'),
  ('fursuiting',         '兽装表演', '穿着兽装出镜表演。'),
  ('remote-friendly',    '可远程',   '完全可以在家完成。'),
  ('beginner-welcome',   '欢迎新手', '无需相关经验，提供培训。'),
  ('event-based',        '活动性质', '与特定展会或活动相关，而非长期。')
) as v(slug, name, description)
join gftvjobs_tags t on t.slug = v.slug
on conflict (tag_id, locale) do nothing;

alter table gftvjobs_locales                 enable row level security;
alter table gftvjobs_job_translations        enable row level security;
alter table gftvjobs_department_translations enable row level security;
alter table gftvjobs_tag_translations        enable row level security;

insert into gftvjobs_migrations (filename)
values ('014_locales_and_translations.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_tag_translations;
-- drop table if exists gftvjobs_department_translations;
-- drop table if exists gftvjobs_job_translations;
-- drop table if exists gftvjobs_locales;
-- drop function if exists gftvjobs_sections_text(jsonb);
-- drop function if exists gftvjobs_sections_valid(jsonb);
-- drop function if exists gftvjobs_is_blank(text);
-- delete from gftvjobs_migrations where filename = '014_locales_and_translations.sql';
-- commit;
