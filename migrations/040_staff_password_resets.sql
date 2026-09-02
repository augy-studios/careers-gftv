-- 040_staff_password_resets.sql
--
-- Creates: gftvjobs_staff_password_resets.
-- Spec:    section 6 (New tables, "The docs site and staff recovery"), 5g
--          (staff account recovery codes), 5c (the flow this mirrors),
--          migration 027 (the two proofs rule it inherits).
-- Run after: 039, the previous numbered file. It references
--            gftvjobs_staff_recovery_codes, which migration 038 created.
--
-- ---------------------------------------------------------------------------
-- Why this is phase 13 part 6's and not migration 038's
-- ---------------------------------------------------------------------------
--
-- 038 carried two of section 6's three staff recovery tables --
-- gftvjobs_docs_sessions and gftvjobs_staff_recovery_codes -- because both were
-- the same concern as the staff session move it existed for. This is the third,
-- and it was left out for the plainest reason: nothing was going to read it for
-- several parts, and a table nobody reads is the state gftvjobs_notifications
-- sat in for ten phases.
--
-- Part 6 is what reads it. 5g asks for a staff forgot password flow that
-- "mirrors 5c step for step", and 5c step 2 is explicit: "issue a short lived,
-- single use reset ticket bound to that browser and move them to a set new
-- password screen. Never accept a password change in the same request that
-- verifies the code." A ticket has to be stored somewhere, and
-- gftvjobs_password_resets is not that somewhere -- its user_id has a foreign
-- key to gftvjobs_users, which is the applicant realm.
--
-- ---------------------------------------------------------------------------
-- The two columns that are here from the start, and the lesson they carry
-- ---------------------------------------------------------------------------
--
-- Section 6 names both and says why in one sentence: "The applicant equivalent
-- reached this shape through migrations 024 and 027; build the staff one with
-- both columns present from the start rather than repeating that lesson."
--
--   recovery_code_id    Which code bought this ticket. The code is verified at
--                       step 2 and spent at step 3, per 5c, so that somebody
--                       who verifies and then closes the tab has not burned
--                       one. A bcrypt hash cannot be searched for, so the row
--                       id is what the ticket has to carry.
--
--   second_factor_at    Migration 027's two proofs rule. 5c made one recovery
--                       code a full account credential on the basis that there
--                       was no second factor to protect; 5e and 5a mean there
--                       now is one, and a reset that walked past it would undo
--                       an account's passkey for anybody holding a code. So
--                       where the account has a passkey or an authenticator
--                       app, the code is checked first and the second factor
--                       after it, and only then is the ticket usable. An
--                       account with neither gets a ticket already stamped,
--                       and the flow is exactly what 5c describes.
--
-- ---------------------------------------------------------------------------
-- What this table is not
-- ---------------------------------------------------------------------------
--
-- **It is not a way into an account for somebody with no codes.** 5g: "Somebody
-- with no recovery codes and no second factor still cannot get back in alone.
-- That path stays where it belongs, at gftv.asia." Nothing here issues a ticket
-- without a code, and there is deliberately no admin action that issues one --
-- the applicant realm has one in 8.9 and the staff realm must not, because
-- these are the accounts the dashboard is behind.
--
-- **It does not sign anybody in.** Spending a ticket sets a password. The
-- person then signs in through the ordinary flow, second factor and all.

begin;

create table if not exists gftvjobs_staff_password_resets (
  id                 uuid primary key default gen_random_uuid(),
  staff_user_id      uuid not null references gftvhello_users (id) on delete cascade,
  ticket_hash        text not null,
  browser_nonce_hash text not null,
  -- No cascade rule beats the application here: the code is deleted when it is
  -- spent, which is step 3, and the ticket is marked used in the same breath.
  -- on delete cascade is the safety net for the other order -- somebody
  -- regenerating their codes while a ticket is outstanding -- and taking the
  -- ticket with them is the correct answer, since the code that bought it no
  -- longer exists.
  recovery_code_id   uuid references gftvjobs_staff_recovery_codes (id) on delete cascade,
  second_factor_at   timestamptz,
  expires_at         timestamptz not null,
  used_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists gftvjobs_staff_password_resets_staff_user_id_idx
  on gftvjobs_staff_password_resets (staff_user_id);

-- Swept by the daily cron in section 11, the same as the applicant table.
create index if not exists gftvjobs_staff_password_resets_expires_at_idx
  on gftvjobs_staff_password_resets (expires_at);

alter table gftvjobs_staff_password_resets enable row level security;

comment on table gftvjobs_staff_password_resets is
  'Single use reset tickets from the staff forgot password flow in 5g. Mirrors gftvjobs_password_resets for the staff realm, with 027''s second_factor_at present from the start. Swept by the daily cron in section 11.';

insert into gftvjobs_migrations (filename)
values ('040_staff_password_resets.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Safe on its own: the table holds nothing but tickets in flight, and the worst
-- a drop costs is that somebody halfway through a reset starts again. The code
-- that reads it has to go in the same breath, or the staff forgot password
-- flow answers 500 on its first step.
--
-- begin;
-- drop table if exists gftvjobs_staff_password_resets;
-- delete from gftvjobs_migrations where filename = '040_staff_password_resets.sql';
-- commit;
