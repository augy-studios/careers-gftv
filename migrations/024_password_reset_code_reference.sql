-- 024_password_reset_code_reference.sql
--
-- Creates: gftvjobs_password_resets.recovery_code_id.
-- Spec:    section 5c (Recovery codes, forgot password flow).
-- Run after: 003.
--
-- Written during phase 2, when the forgot password flow was built and the
-- table turned out to be one column short of what section 5c asks for.
--
-- 5c fixes the order of the flow: step 2 verifies the recovery code and issues
-- a ticket, step 3 sets the password and consumes the code. Consuming it at
-- step 2 instead would burn a code for anyone who verified and then closed the
-- tab, and the specification is explicit that the change is never accepted in
-- the request that verifies the code.
--
-- Holding the two apart means the ticket has to remember which code row it was
-- issued against, because the code itself is not sent again at step 3 and its
-- bcrypt hash cannot be searched for. That is this column.
--
-- on delete cascade, so regenerating the recovery set takes any pending reset
-- ticket with it. A ticket issued against a code that no longer exists must
-- not still work, and cascading is what makes that true without a second check
-- in application code.
--
-- Nullable, because the column is added to a table that may already hold rows.
-- Nothing issues a ticket without it.

begin;

alter table gftvjobs_password_resets
  add column if not exists recovery_code_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gftvjobs_password_resets_recovery_code_id_fkey'
  ) then
    alter table gftvjobs_password_resets
      add constraint gftvjobs_password_resets_recovery_code_id_fkey
      foreign key (recovery_code_id)
      references gftvjobs_recovery_codes (id) on delete cascade;
  end if;
end $$;

create index if not exists gftvjobs_password_resets_recovery_code_id_idx
  on gftvjobs_password_resets (recovery_code_id);

comment on column gftvjobs_password_resets.recovery_code_id is
  'The code verified at step 2 of 5c, consumed at step 3. Cascades, so regenerating the set invalidates any pending ticket.';

insert into gftvjobs_migrations (filename)
values ('024_password_reset_code_reference.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop index if exists gftvjobs_password_resets_recovery_code_id_idx;
-- alter table gftvjobs_password_resets
--   drop constraint if exists gftvjobs_password_resets_recovery_code_id_fkey;
-- alter table gftvjobs_password_resets drop column if exists recovery_code_id;
-- delete from gftvjobs_migrations where filename = '024_password_reset_code_reference.sql';
-- commit;
