-- 020_applicant_locale.sql
--
-- Creates: gftvjobs_users.locale.
-- Spec:    section 3a (Languages), section 15 (Telegram bot).
-- Run after: 014, for gftvjobs_locales.
--
-- The language preference lives in localStorage, which means the browser knows
-- it and the server never does. That is fine for rendering a page the browser
-- asked for, and useless the moment the server has to start the conversation.
--
-- The Telegram bot is exactly that case. It sends invitations, task requests,
-- and application status changes to people who are not looking at the site,
-- and with nothing stored it would have to write to everyone in English.
--
-- So: localStorage stays the source of truth for anonymous browsing, and this
-- column records the choice for a signed in applicant. It is written whenever
-- a signed in applicant changes language, and read whenever the server needs
-- to speak first.
--
-- A foreign key rather than a check constraint, so adding Malay or Tamil
-- needs no change here. on delete restrict, because deactivating a language
-- should be a deliberate act that fails loudly while accounts still prefer it,
-- rather than silently resetting people to English.

begin;

alter table gftvjobs_users
  add column if not exists locale text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_users_locale_fkey'
  ) then
    alter table gftvjobs_users add constraint gftvjobs_users_locale_fkey
      foreign key (locale) references gftvjobs_locales (code) on delete restrict;
  end if;
end $$;

comment on column gftvjobs_users.locale is
  'The language this applicant reads, for anything the server sends unprompted, chiefly Telegram. localStorage remains the source of truth for rendering in the browser.';

insert into gftvjobs_migrations (filename)
values ('020_applicant_locale.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- alter table gftvjobs_users drop constraint if exists gftvjobs_users_locale_fkey;
-- alter table gftvjobs_users drop column if exists locale;
-- delete from gftvjobs_migrations where filename = '020_applicant_locale.sql';
-- commit;
