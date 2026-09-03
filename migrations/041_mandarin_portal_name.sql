-- 041_mandarin_portal_name.sql
--
-- Changes: the 华文 half of gftvjobs_settings.portal_title.
-- Spec:    3a (Names), as rewritten by phase 14 part 4a.
-- Run after: 040, the previous numbered file. It depends on 018, which gave
--            portal_title its locale keyed shape and wrote the old name.
--
-- ---------------------------------------------------------------------------
-- Why a migration and not an edit to 018
-- ---------------------------------------------------------------------------
--
-- 018 has run. A migration is never edited once it has, so the value it wrote
-- is changed the only way a written row can be: by a later file.
--
-- **This is the half of the rename a dictionary could not reach.** Phase 14
-- part 4a renamed the portal in Mandarin, from 国际兽视 Careers to
-- 国际兽视入队平台, across both sites' dictionaries, the phase list, the bot,
-- four documents and 3a itself. The home page's title is none of those: it is a
-- setting an admin can edit, stored per locale since 018, and it renders on the
-- portal from the database. Without this file the rename is complete everywhere
-- except the largest words on the home page.
--
-- ---------------------------------------------------------------------------
-- The name, and why it is not a translation of "Careers"
-- ---------------------------------------------------------------------------
--
-- GFTV is 国际兽视. The portal is 国际兽视入队平台, literally the portal for
-- joining the team. **"Careers" implies a salary and every role here is
-- unpaid**, which is why the portal's own guide opens by explaining that; 招聘
-- would have carried the same wrong implication into Chinese. 入队 says what is
-- actually on offer. A space sits between Latin and Han and never between Han
-- and Han, so the new name carries no space inside it.
--
-- ---------------------------------------------------------------------------
-- What it will not do
-- ---------------------------------------------------------------------------
--
-- **It only fires on the exact string 018 wrote.** An admin who has since
-- edited the Chinese title has made a decision about their own copy, and a
-- migration that overwrote it would be this file deciding it knows better than
-- the person who runs the site. That is 018's own rule -- it fired only on rows
-- still holding a bare string -- applied one step further along.
--
-- So it is idempotent twice over: re-running changes nothing, because after the
-- first run no row matches; and running it against an edited title changes
-- nothing, because that row never matched.
--
-- The English half is untouched. The site is still Careers@GFTV in English.

begin;

update gftvjobs_settings
set value = jsonb_set(value, '{zh}', '"国际兽视入队平台"'::jsonb)
where key = 'portal_title'
  and jsonb_typeof(value) = 'object'
  and value ->> 'zh' = '国际兽视 Careers';

insert into gftvjobs_migrations (filename)
values ('041_mandarin_portal_name.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Safe on its own, and it puts back exactly what 018 wrote. Nothing in the code
-- reads the value, so nothing breaks either way: the portal renders whatever
-- the row holds. What a rollback leaves is a home page in the old name beside
-- an interface, a bot and a specification in the new one, which is the state
-- this file exists to end.
--
-- begin;
-- update gftvjobs_settings
-- set value = jsonb_set(value, '{zh}', '"国际兽视 Careers"'::jsonb)
-- where key = 'portal_title'
--   and jsonb_typeof(value) = 'object'
--   and value ->> 'zh' = '国际兽视入队平台';
-- delete from gftvjobs_migrations where filename = '041_mandarin_portal_name.sql';
-- commit;
