-- 044_malay_tamil_locales.sql
--
-- Changes: two rows in gftvjobs_locales, ms and ta. No schema change.
-- Spec:    section 3a, and phase 15 of section 16.
-- Run after: 043, the previous numbered file. It depends on 014, which created
--            the table and said this day would be an insert and not a
--            migration.
--
-- ---------------------------------------------------------------------------
-- An insert, in a numbered file, and why it is not a contradiction
-- ---------------------------------------------------------------------------
--
-- 014's comment on the table reads "Adding Malay or Tamil is an insert here
-- plus an assets/i18n dictionary, not a migration", and this file is that
-- insert. It is numbered because the table is applied by pasting files into a
-- SQL editor in order, and an insert somebody ran by hand and nobody recorded
-- is the kind of thing that turns the checkout and the database into two
-- different accounts of what exists. The README's table is the record.
--
-- ---------------------------------------------------------------------------
-- Active, and not published: the two are different questions
-- ---------------------------------------------------------------------------
--
-- Both rows are inserted active. is_active means staff and helpers can work in
-- the language: the job editor draws a tab for it, a helper can be granted it,
-- and the translation queue lists it. Phase 15 part 1 settled, on 12 September
-- 2026, that whether the public sees a language is a different question with a
-- different answer: a feature key per language, locale_ms and locale_ta,
-- read through the maintenance switches on /admin/maintenance. A language is
-- published when its key's phase has shipped and nobody has switched it off.
--
-- So the day this file is applied nothing changes for a reader. The two
-- dictionaries are English copies until somebody fills them in, the phase has
-- not shipped, and every public route answers in English for a locale that is
-- not published. What changes is that the content can start being translated
-- while that is so, which is the whole reason the two questions were kept
-- apart.
--
-- ---------------------------------------------------------------------------
-- No text search configuration for either
-- ---------------------------------------------------------------------------
--
-- 016's header: a language Postgres cannot tokenise usefully carries null here
-- and is matched by trigram against the translation row's search text. Tamil
-- is an abugida Postgres has no configuration for. Malay is Latin script, and
-- Postgres ships no Malay stemmer; the nearest, indonesian, is a different
-- language with different affixes, and a wrong stemmer is worse than none
-- because it silently fails to match words a substring search would find. Both
-- take the trigram path, and 016 says what it would take to give one of them
-- a real vector later.
--
-- The codes are bare ISO 639-1, and html_lang matches: the portal ships one
-- Malay and one Tamil, and there is no Singapore variant of either script to
-- distinguish, unlike zh-Hans-SG. The native names are what the language modal
-- shows, in the language's own script, and are never translated.

begin;

insert into gftvjobs_locales
  (code, english_name, native_name, html_lang, text_search_config, is_default, sort_order) values
  ('ms', 'Malay', 'Bahasa Melayu', 'ms', null, false, 30),
  ('ta', 'Tamil', 'தமிழ்',          'ta', null, false, 40)
on conflict (code) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Only while nothing references the rows. Every translation table restricts
-- its delete on the locale, so a row with content behind it refuses to go, and
-- that is the right answer: switch the language off on /admin/maintenance
-- instead, which is what the switch is for.
--
-- delete from gftvjobs_locales where code in ('ms', 'ta');
