-- 039_passkey_site.sql
--
-- Creates: registered_on on gftvjobs_staff_passkeys and gftvjobs_passkeys.
-- Spec:    section 5f (staff account settings: "show which site each was
--          registered from"), 5e (one relying party id across both sites).
-- Run after: 025, which created both tables. It depends on nothing since.
--
-- ---------------------------------------------------------------------------
-- Why a column, and why now
-- ---------------------------------------------------------------------------
--
-- 5e is the reason this is a question at all. Both sites claim the portal's
-- host as the WebAuthn relying party id, because careers.globalfurry.tv is a
-- registrable suffix of docs.careers.globalfurry.tv, so one enrolment covers
-- both and a staff member registers a passkey once. **The consequence is that
-- every passkey appears on both sites' settings pages, identical.** 5f asks for
-- the one thing that would tell them apart: "Show which site each was
-- registered from, since they work on both and a reader will otherwise wonder
-- why one they made on the docs site appears on the portal."
--
-- Nothing in the schema could answer that. gftvjobs_staff_passkeys carries a
-- label, which is the user's name for the authenticator, and nothing about
-- where the ceremony ran.
--
-- **Applied in phase 13 part 2 rather than part 6, where the page that shows it
-- is built**, and the reason is the default below. Backfilling every existing
-- row as 'portal' is provably correct today: the docs site has never registered
-- a passkey, because until part 2 it had no route that could. It stops being
-- correct the moment one is registered there, and a column added afterwards can
-- never recover which rows those were.
--
-- ---------------------------------------------------------------------------
-- Why the applicant table gets it too
-- ---------------------------------------------------------------------------
--
-- The applicant realm exists on the portal alone and always will: the docs site
-- signs in staff and nobody else, per 5h. So gftvjobs_passkeys.registered_on is
-- 'portal' on every row it will ever hold, and nothing reads it.
--
-- It is there so that api/_lib/webauthn.js stays realm-agnostic. That file
-- registers, lists and verifies a credential for both realms through one column
-- list and one insert shape, and a column that exists in one of the two tables
-- would put a realm branch in each. A branch in an auth path is worth more than
-- an unread column is worth saving, and REALMS in that file is the only place
-- the two realms are allowed to differ.

begin;

-- 'portal' or 'docs'. Constrained rather than free text for the reason the
-- audit action list is a fixed set: a typo must not become a third site.
--
-- The default is for the backfill, and api/_lib/webauthn.js names the value on
-- every insert anyway. Both halves are deliberate: the default makes the rows
-- that predate this file correct, and naming it explicitly means a future
-- application cannot inherit 'portal' by forgetting.

alter table gftvjobs_staff_passkeys
  add column if not exists registered_on text not null default 'portal';

alter table gftvjobs_passkeys
  add column if not exists registered_on text not null default 'portal';

-- Added separately from the column so re-running the file is safe: `add column
-- if not exists` skips a column that is already there and would skip its check
-- with it, leaving the constraint absent on the second run of a file whose
-- first run failed later on.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_staff_passkeys_registered_on_check'
  ) then
    alter table gftvjobs_staff_passkeys
      add constraint gftvjobs_staff_passkeys_registered_on_check
      check (registered_on in ('portal', 'docs'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_passkeys_registered_on_check'
  ) then
    alter table gftvjobs_passkeys
      add constraint gftvjobs_passkeys_registered_on_check
      check (registered_on in ('portal', 'docs'));
  end if;
end $$;

comment on column gftvjobs_staff_passkeys.registered_on is
  'Which site the ceremony ran on, per 5f. One relying party id covers both sites, so a passkey registered on either is offered on both and this is the only thing that tells a reader which one they made it on.';

comment on column gftvjobs_passkeys.registered_on is
  'Always ''portal''. The applicant realm has one site; the column exists so webauthn.js needs no realm branch. See the header of 039.';

insert into gftvjobs_migrations (filename)
values ('039_passkey_site.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Dropping the column loses which site every passkey was registered from, and
-- that cannot be recovered. The code has to go back in the same breath:
-- registered_on in PASSKEY_COLUMNS and in the insert in api/_lib/webauthn.js,
-- on both sites, which means gen-docs-lib.js runs again after.
--
-- begin;
-- alter table gftvjobs_staff_passkeys drop column if exists registered_on;
-- alter table gftvjobs_passkeys drop column if exists registered_on;
-- delete from gftvjobs_migrations where filename = '039_passkey_site.sql';
-- commit;
