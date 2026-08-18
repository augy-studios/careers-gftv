-- 023_translation_helpers.sql
--
-- Creates: gftvjobs_translation_helpers, and the annotation columns on
--          gftvjobs_translation_reports.
-- Spec:    section 7i (Translation helpers), section 8.11 (Translations).
-- Run after: 015, for gftvjobs_translation_reports, and 014 for the locales.
--
-- A translation helper is an ordinary applicant account that an admin has
-- granted the helper role for one language. They are language speakers rather
-- than staff, so this deliberately does not go through gftvhello or the admin
-- access overlay: the person best placed to fix the Chinese has no reason to
-- be a GFTV staff member.
--
-- Granted per language. As soon as a third language exists, someone who reads
-- Chinese should not be approving Tamil, and a single boolean would let them.
--
-- What a helper can do is draft. They edit a translation row freely, and only
-- an admin sets is_ready, which is the flag that decides whether readers see
-- it. So access can be granted before trust is, and a helper cannot publish
-- half a posting by accident.
--
-- The annotation columns turn a report from a form into something closer to
-- a margin note: a helper selects the wording that reads wrongly, anywhere on
-- the site, and suggests a replacement for that exact span.
--
-- Anchoring follows the W3C Web Annotation Data Model's TextQuoteSelector,
-- which is worth copying rather than inventing. Storing the exact quote plus a
-- short run of text either side means a suggestion can still be located after
-- the surrounding text has been edited, and can be reported as detached rather
-- than silently applied to the wrong place when it cannot.

begin;

create table if not exists gftvjobs_translation_helpers (
  user_id    uuid not null references gftvjobs_users (id) on delete cascade,
  locale     text not null references gftvjobs_locales (code) on delete restrict,
  note       text,
  granted_by uuid references gftvhello_users (id) on delete set null,
  granted_at timestamptz not null default now(),

  primary key (user_id, locale)
);

create index if not exists gftvjobs_translation_helpers_locale_idx
  on gftvjobs_translation_helpers (locale);

comment on table gftvjobs_translation_helpers is
  'Applicant accounts granted the translation helper role, per language. Helpers draft; only an admin sets is_ready and makes a translation live.';
comment on column gftvjobs_translation_helpers.locale is
  'One row per language. A helper for zh has no standing over ms or ta.';
comment on column gftvjobs_translation_helpers.note is
  'Why this person was granted the role, for the admin who reviews the list a year later.';

-- ---------------------------------------------------------------------------
-- Annotations on a report
-- ---------------------------------------------------------------------------

alter table gftvjobs_translation_reports
  add column if not exists quote        text,
  add column if not exists quote_prefix text,
  add column if not exists quote_suffix text,
  add column if not exists origin       text not null default 'form';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_translation_reports_origin_check'
  ) then
    alter table gftvjobs_translation_reports
      add constraint gftvjobs_translation_reports_origin_check
      check (origin in ('form', 'annotation'));
  end if;
end $$;

-- An annotation without the text it points at cannot be located later.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_translation_reports_annotation_has_quote'
  ) then
    alter table gftvjobs_translation_reports
      add constraint gftvjobs_translation_reports_annotation_has_quote
      check (origin <> 'annotation' or not gftvjobs_is_blank(quote));
  end if;
end $$;

-- The admin queue groups annotations by what they point at, so several
-- suggestions against one posting read as one conversation.
create index if not exists gftvjobs_translation_reports_origin_idx
  on gftvjobs_translation_reports (origin, status, created_at desc);

comment on column gftvjobs_translation_reports.quote is
  'The exact text the helper selected. Follows the W3C Web Annotation TextQuoteSelector, so a suggestion survives edits to the text around it.';
comment on column gftvjobs_translation_reports.quote_prefix is
  'A short run of text immediately before the quote, used to find it again when the same words appear more than once.';
comment on column gftvjobs_translation_reports.quote_suffix is
  'A short run of text immediately after the quote. Same purpose as quote_prefix.';
comment on column gftvjobs_translation_reports.origin is
  'form for the plain report in 7h, annotation for a helper selecting text in place. Both land in this table on purpose: an admin works one queue, not two.';

insert into gftvjobs_migrations (filename)
values ('023_translation_helpers.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_translation_helpers;
-- alter table gftvjobs_translation_reports
--   drop constraint if exists gftvjobs_translation_reports_annotation_has_quote,
--   drop constraint if exists gftvjobs_translation_reports_origin_check;
-- drop index if exists gftvjobs_translation_reports_origin_idx;
-- alter table gftvjobs_translation_reports
--   drop column if exists origin,
--   drop column if exists quote_suffix,
--   drop column if exists quote_prefix,
--   drop column if exists quote;
-- delete from gftvjobs_migrations where filename = '023_translation_helpers.sql';
-- commit;
