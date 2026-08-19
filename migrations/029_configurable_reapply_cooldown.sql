-- 029_configurable_reapply_cooldown.sql
--
-- Creates: the reapply_cooldown_days setting, and a check constraint on it.
-- Spec:    section 7f (reapply cooldown), 8.10 (settings).
-- Run after: 012, which creates gftvjobs_settings.
--
-- Section 7f fixes the reapply cooldown at three months. This makes it a
-- number an admin can set, and zero a legal value meaning no cooldown at all.
--
-- Why a setting rather than a constant. Three months is a policy, not a fact
-- about the software, and it is the sort of policy that gets revisited after
-- the first convention where somebody wanted to reapply to a role they were
-- three days too slow for. Changing a policy should not be a deploy.
--
-- Days rather than months, which is a real change from 7f's wording and is the
-- reason this file exists rather than a `reapply_cooldown_months` one:
--
--   - Zero has to be expressible, and zero months and zero days are the same
--     thing, so nothing is lost there. What days buy is everything between:
--     a fortnight, thirty days, a week for an event based role.
--   - The stored value is a duration, and the interface never shows it. What a
--     reader sees is "You can apply again from 4 June", generated from the
--     stored cooldown_until date, so the unit here is invisible to them.
--
--   The cost is stated plainly: 90 days is not exactly three months. An
--   application on 4 March reopens on 2 June rather than 4 June. Nobody is
--   counting, and the alternative is a months column that cannot express a
--   fortnight.
--
-- What zero means, exactly, because there are two readings and only one of
-- them is useful:
--
--   Zero turns the cooldown off. The apply endpoint skips the check entirely
--   and writes no cooldown_until on a new confirmation. It is not "a cooldown
--   that has already expired", and it must never be stored as now(): a
--   cooldown_until in the past would make the interface offer to tell somebody
--   the date they can reapply, which is today, which is noise.
--
--   Existing cooldown_until values are deliberately left alone rather than
--   cleared. An admin setting zero is turning a feature off, and turning it
--   back on afterwards should restore what was there rather than having
--   silently destroyed it. The apply endpoint ignoring the column while the
--   setting is zero gives the immediate effect an admin expects, reversibly.
--
-- What this does not change: cooldown_until stays stored rather than computed
-- on read, exactly as migration 006 says and for the same reason. Raising the
-- setting from 90 to 180 does not extend a cooldown somebody is already
-- serving, and an admin can still waive a single row.
--
-- The value keeps its natural shape rather than becoming a per locale object.
-- Migration 018 made the settings holding human readable text bilingual; a
-- duration is a number in every language.

begin;

insert into gftvjobs_settings (key, value, description) values
  ('reapply_cooldown_days',
   '90'::jsonb,
   'Days an applicant must wait before applying to the same posting again, per 7f. 90 is the three months that section specifies. Zero turns the cooldown off entirely: no cooldown_until is written on a new confirmation, and existing ones stop being enforced without being cleared, so raising it again restores them. Per applicant per posting; a reposted role gets a new uuid and so a fresh start.')
on conflict (key) do nothing;

-- A guard at the database rather than only in the admin form. This value is
-- read on every apply and a bad one is the difference between a policy and an
-- outage: a string here would make every apply throw, and a negative number
-- would write a cooldown_until in the past on every confirmation.
--
-- The ceiling is ten years. There is no sensible cooldown longer than that,
-- and without one a typo of 3650000 is indistinguishable from a permanent ban
-- that nobody meant to impose and nobody would think to look for.
--
-- Written as key <> ... or ..., so it constrains this one row and leaves every
-- other setting alone. A settings table keyed by name cannot have a per key
-- column type, and this is the closest thing to one.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gftvjobs_settings_reapply_cooldown_days_check'
  ) then
    alter table gftvjobs_settings
      add constraint gftvjobs_settings_reapply_cooldown_days_check
      check (
        key <> 'reapply_cooldown_days'
        or (
          jsonb_typeof(value) = 'number'
          and (value #>> '{}')::numeric >= 0
          and (value #>> '{}')::numeric <= 3650
          and (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric)
        )
      );
  end if;
end $$;

insert into gftvjobs_migrations (filename)
values ('029_configurable_reapply_cooldown.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- Leaves any cooldown_until already written on an application row alone. Those
-- are dates somebody is serving, and dropping the setting that produced them is
-- not a reason to shorten them.
--
-- begin;
-- alter table gftvjobs_settings
--   drop constraint if exists gftvjobs_settings_reapply_cooldown_days_check;
-- delete from gftvjobs_settings where key = 'reapply_cooldown_days';
-- delete from gftvjobs_migrations where filename = '029_configurable_reapply_cooldown.sql';
-- commit;
