-- 025_passkeys.sql
--
-- Creates: gftvjobs_passkeys, gftvjobs_staff_passkeys,
--          gftvjobs_passkey_challenges, gftvjobs_login_challenges.
-- Spec:    section 5a (staff second factor), 5b and 5c (applicant realm),
--          5d (trusted devices).
-- Run after: 002, 003.
--
-- Passkeys as the second factor, for both realms. Added during phase 2, after
-- the rest of the authentication work, so the numbering is later than the
-- feature it belongs to.
--
-- Three things worth knowing before reading the tables.
--
-- 1. A passkey is a public key. There is no shared secret to leak: the private
--    half never leaves the authenticator, and everything stored here is public
--    by design. That is the opposite of totp_secret, which is a secret this
--    database holds on the account's behalf.
--
-- 2. No new recovery codes. A lost passkey is the same problem as a lost phone,
--    which gftvjobs_2fa_backup_codes and gftvhello_backup_codes already solve:
--    both get past the second factor and neither gets past the password. Adding
--    a third set of codes would be a third thing to lose.
--
-- 3. Two credential tables rather than one with a realm column, for the same
--    reason 5c gives two code tables: the separation is the security property.
--    A staff passkey must never satisfy an applicant check, and each table has
--    a real foreign key to its own realm's user table, which one shared table
--    could not have. gftvhello_users is referenced, never written, exactly as
--    gftvjobs_admin_access already does.
--
-- The challenge table is shared, because a challenge is a random string with a
-- short life and no privileges of its own.

begin;

-- ---------------------------------------------------------------------------
-- Applicant passkeys
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references gftvjobs_users (id) on delete cascade,
  -- base64url, as the browser reports it. Unique across the table because the
  -- authenticator hands one back at sign in and it has to identify one row.
  credential_id  text not null unique,
  -- base64url of the COSE public key. Public by definition, so this is not a
  -- secret and does not need the treatment password_hash gets.
  public_key     text not null,
  -- The authenticator's own counter. A value that goes backwards means the
  -- credential has been cloned, which is the one thing this column is for.
  sign_count     bigint not null default 0,
  transports     text[],
  -- Model identifier for the authenticator. Useful for showing "iCloud
  -- Keychain" rather than "unnamed key", and for nothing else.
  aaguid         text,
  -- Whether the credential is synced to a cloud keychain. A synced passkey
  -- survives a lost device; a device bound one does not, which changes the
  -- advice given when somebody has only one.
  backed_up      boolean not null default false,
  device_type    text,
  label          text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists gftvjobs_passkeys_user_id_idx
  on gftvjobs_passkeys (user_id);

comment on table gftvjobs_passkeys is
  'Applicant passkeys, used as the second factor after the password. Nothing here is secret: a passkey is a public key.';
comment on column gftvjobs_passkeys.sign_count is
  'Rejected on a decrease, which is the only signal WebAuthn gives that a credential has been cloned. Many authenticators always report 0, and that is not a failure.';

-- ---------------------------------------------------------------------------
-- Staff passkeys
-- ---------------------------------------------------------------------------

-- In a gftvjobs_ table rather than a gftvhello_ one, per section 2: this repo
-- does not own that namespace and may not add to it. The consequence, which is
-- worth stating rather than discovering: a passkey registered here works on
-- this portal only. It is not the same credential as anything gftv.asia may
-- add later, because a passkey is bound to the domain that created it.
create table if not exists gftvjobs_staff_passkeys (
  id             uuid primary key default gen_random_uuid(),
  staff_user_id  uuid not null references gftvhello_users (id) on delete cascade,
  credential_id  text not null unique,
  public_key     text not null,
  sign_count     bigint not null default 0,
  transports     text[],
  aaguid         text,
  backed_up      boolean not null default false,
  device_type    text,
  label          text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists gftvjobs_staff_passkeys_user_id_idx
  on gftvjobs_staff_passkeys (staff_user_id);

comment on table gftvjobs_staff_passkeys is
  'Staff passkeys for this portal. Mirrors gftvjobs_admin_access: gftvhello_users is referenced and never written to.';

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

-- WebAuthn is a challenge and response. The challenge must be generated by the
-- server, used once, and checked against what comes back, or the whole thing
-- reduces to replaying a recorded assertion.
--
-- Kept in a table rather than in memory for the same reason the rate limiter
-- is: each Vercel function instance has its own memory, and the request that
-- verifies a ceremony is rarely the instance that started it.
create table if not exists gftvjobs_passkey_challenges (
  id               uuid primary key default gen_random_uuid(),
  realm            text not null,
  purpose          text not null,
  -- No foreign key. This points at gftvjobs_users in one realm and
  -- gftvhello_users in the other, and a column cannot reference both. The rows
  -- live for minutes and carry no privileges of their own.
  user_id          uuid not null,
  challenge        text not null,
  -- sha256 of the login challenge token from the password step, for an
  -- authentication ceremony. It binds the passkey step to the sign in that
  -- started it, so a valid assertion cannot be presented on its own.
  login_token_hash text,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  constraint gftvjobs_passkey_challenges_realm_check
    check (realm in ('staff', 'applicant')),
  constraint gftvjobs_passkey_challenges_purpose_check
    check (purpose in ('register', 'authenticate'))
);

create index if not exists gftvjobs_passkey_challenges_lookup_idx
  on gftvjobs_passkey_challenges (realm, user_id, purpose);

create index if not exists gftvjobs_passkey_challenges_expires_at_idx
  on gftvjobs_passkey_challenges (expires_at);

comment on table gftvjobs_passkey_challenges is
  'Single use WebAuthn challenges, deleted on use and swept by the daily cron in section 11.';

-- ---------------------------------------------------------------------------
-- Applicant login challenges
-- ---------------------------------------------------------------------------

-- The applicant equivalent of gftvhello_totp_challenges, which 5a already
-- gives the staff realm. It holds a sign in that has passed the password step
-- and is waiting on a second factor, and it exists because that state has to
-- live somewhere that is not a session: the whole point of step 5 in 5a is
-- that the password step issues nothing the browser can use.
--
-- Also what phase 11 needs. A Telegram code is the same shape of wait.
--
-- stay_signed_in is carried here rather than resent at the second step, so the
-- session length is the one the person chose on the form they chose it on.
create table if not exists gftvjobs_login_challenges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references gftvjobs_users (id) on delete cascade,
  token          text not null unique,
  stay_signed_in boolean not null default false,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists gftvjobs_login_challenges_user_id_idx
  on gftvjobs_login_challenges (user_id);

create index if not exists gftvjobs_login_challenges_expires_at_idx
  on gftvjobs_login_challenges (expires_at);

comment on table gftvjobs_login_challenges is
  'A sign in past the password and waiting on a second factor. Deleted on use, swept by the daily cron. Never a session.';

alter table gftvjobs_passkeys            enable row level security;
alter table gftvjobs_staff_passkeys      enable row level security;
alter table gftvjobs_passkey_challenges  enable row level security;
alter table gftvjobs_login_challenges    enable row level security;

insert into gftvjobs_migrations (filename)
values ('025_passkeys.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop table if exists gftvjobs_login_challenges;
-- drop table if exists gftvjobs_passkey_challenges;
-- drop table if exists gftvjobs_staff_passkeys;
-- drop table if exists gftvjobs_passkeys;
-- delete from gftvjobs_migrations where filename = '025_passkeys.sql';
-- commit;
