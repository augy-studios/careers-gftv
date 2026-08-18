-- 018_bilingual_settings.sql
--
-- Changes: the translatable rows in gftvjobs_settings move from a bare string
--          value to a per locale object, and gain their Mandarin wording.
-- Spec:    section 3a (Bilingual), section 8.10 (Settings).
-- Run after: 012, which created the table and seeded these rows, and 014,
--            which created gftvjobs_locales.
--
-- Migration 012 seeded portal_title, hero_heading, and hero_body as plain
-- JSON strings, before the portal became bilingual. Section 8.10 now says the
-- portal title and hero copy are edited in both languages, so the value shape
-- has to carry both. This is the gap that opened when 3a was written, and it
-- would otherwise have surfaced in phase 6 as an admin screen that could only
-- edit half of the home page.
--
-- New shape for a translatable setting:
--
--   {"en": "Careers@GFTV", "zh": "国际兽视 Careers"}
--
-- Keyed by locale code, so adding Malay means adding a key rather than a
-- column. A locale with no key falls back to the default language.
--
-- Settings that hold no human readable text keep their existing shape.
-- featured_job_ids stays an array and applications_open stays a boolean:
-- wrapping those in a locale object would mean a featured posting list that
-- could differ by language, which is not a feature, it is a bug waiting to
-- happen.
--
-- Naming, confirmed rather than invented: GFTV is 国际兽视 in Mandarin, and
-- the portal is 国际兽视 Careers. A space sits between Latin and Han, and
-- never between Han and Han.
--
-- Idempotent by checking the current shape. Re-running after an admin has
-- edited the copy will not overwrite their wording, because the update only
-- fires on rows still holding a bare string.

begin;

update gftvjobs_settings
set value = jsonb_build_object('en', value #>> '{}', 'zh', '国际兽视 Careers')
where key = 'portal_title'
  and jsonb_typeof(value) = 'string';

update gftvjobs_settings
set value = jsonb_build_object('en', value #>> '{}', 'zh', '加入国际兽视，成为义工')
where key = 'hero_heading'
  and jsonb_typeof(value) = 'string';

update gftvjobs_settings
set value = jsonb_build_object(
  'en', value #>> '{}',
  'zh', '找到适合您的职位，几分钟内完成申请，一起打造属于兽迷的电视台。')
where key = 'hero_body'
  and jsonb_typeof(value) = 'string';

update gftvjobs_settings
set description = 'Site title shown in the header and used in page titles. Per locale object: {"en": ..., "zh": ...}.'
where key = 'portal_title';

update gftvjobs_settings
set description = 'Home page hero heading. Per locale object: {"en": ..., "zh": ...}.'
where key = 'hero_heading';

update gftvjobs_settings
set description = 'Home page hero supporting line. Per locale object: {"en": ..., "zh": ...}.'
where key = 'hero_body';

comment on column gftvjobs_settings.value is
  'Anything holding human readable text is a per locale object, {"en": ..., "zh": ...}, and both keys are required. Settings holding no text, such as featured_job_ids and applications_open, keep their natural shape.';

insert into gftvjobs_migrations (filename)
values ('018_bilingual_settings.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Verify
--
-- select key, jsonb_typeof(value) as shape, value
-- from gftvjobs_settings order by key;
--
-- Expect object for portal_title, hero_heading, and hero_body, array for
-- featured_job_ids, and boolean for applications_open.

-- Rollback
--
-- Flattens the three back to the English string. The Mandarin wording is lost,
-- so copy it out first if an admin has edited it.
--
-- begin;
-- update gftvjobs_settings set value = to_jsonb(value ->> 'en')
--  where key in ('portal_title', 'hero_heading', 'hero_body')
--    and jsonb_typeof(value) = 'object';
-- delete from gftvjobs_migrations where filename = '018_bilingual_settings.sql';
-- commit;
