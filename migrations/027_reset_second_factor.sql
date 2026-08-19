-- 027_reset_second_factor.sql
--
-- Creates: gftvjobs_password_resets.second_factor_at.
-- Spec:    section 5c (Recovery codes, forgot password flow), 5d.
-- Run after: 003, 024, 025.
--
-- Section 5c was written when the applicant realm had no second factor, and it
-- made one recovery code a complete account credential on that basis: "one of
-- them plus nothing else lets someone set a new password". Passkeys, added in
-- phase 2, changed the situation the sentence was written for. Left alone, the
-- forgot password flow walks straight past the passkey, and "even with my
-- password they would still need my passkey" stops being true for anybody
-- holding a code.
--
-- So the reset is now two proofs rather than one, but only for an account that
-- has a passkey to prove anything with:
--
--   No passkey    unchanged. The recovery code alone issues the ticket, and
--                 the flow is exactly what 5c describes.
--   A passkey     the recovery code is checked first, then the passkey or a
--                 2FA backup code, and only then is the ticket usable.
--
-- This column is what holds those apart. Null means the ticket exists but has
-- not been earned yet, and reset-password refuses it. Set means every factor
-- the account has has been satisfied.
--
-- The escape hatch stays where 5c already put it: somebody who has lost both
-- their recovery codes and their second factor cannot get back in alone, and
-- goes to the admin reset path that 5c item 5 requires. That path is phase 8.

begin;

alter table gftvjobs_password_resets
  add column if not exists second_factor_at timestamptz;

comment on column gftvjobs_password_resets.second_factor_at is
  'When the second factor was satisfied. Null means the ticket is not usable yet. Set at issue time for an account with no passkey, since there is nothing to satisfy.';

insert into gftvjobs_migrations (filename)
values ('027_reset_second_factor.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- alter table gftvjobs_password_resets drop column if exists second_factor_at;
-- delete from gftvjobs_migrations where filename = '027_reset_second_factor.sql';
-- commit;
