-- 043_notify_application_confirmed.sql
--
-- Changes: gftvjobs_telegram_links gains notify_application_confirmed.
-- Spec:    section 15 (Telegram bot), as extended by phase 14's webhook
--          confirmation notice; section 13 step 5 is what the notice reports.
-- Run after: 042, the previous numbered file. It depends on 011, which created
--            the links table and its three notify columns.
--
-- ---------------------------------------------------------------------------
-- The fourth kind, and why it is a column and not a code path
-- ---------------------------------------------------------------------------
--
-- Section 15 names three notification kinds and 011 gave each a toggle on the
-- link row, per section 10 item 4. **This is the fourth.** When the application
-- form's webhook, or an admin linking an unmatched submission by hand, marks an
-- application submitted on the applicant's behalf, the portal has changed their
-- record without them. Every other kind in the outbox is something they did or
-- were written to about. This one they heard nothing about, from phase 9 until
-- phase 14, and settling that took three deferrals: 29 August, then phase 12's
-- section 2, then phase 13's. Settled 1 September 2026, built 11 September.
--
-- **A kind the applicant can receive is a kind the applicant can silence.**
-- That is the whole of 011's arrangement: `NOTIFY_COLUMN` in
-- telegram-bot/supabase.py maps each kind to the column the drain reads before
-- it sends and the column /notify writes, so the switch somebody flips and the
-- switch that is honoured are the same one by construction. A kind with no
-- column is a kind nobody can silence, and that is reserved for security
-- messages, which this is not. So the kind needs the column, and a column is a
-- migration.
--
-- ---------------------------------------------------------------------------
-- Why it defaults to true, and why the default is safe on a shallow deploy
-- ---------------------------------------------------------------------------
--
-- On, like the other three: the message says the portal did something to the
-- applicant's own record, and an account that has to opt in to hearing that is
-- an account that never hears it.
--
-- **The site and the bot deploy apart, and the order is this file, then the
-- bot, then the site.** A site queueing the kind before the bot knows it leaves
-- rows queued and unclaimed, which is the outbox's rule for an unknown kind, so
-- the site may go last or first and loses nothing. The bot is the one with an
-- order: `LINK_COLUMNS` in telegram-bot/supabase.py names every notify column
-- in the select it reads a link with, and PostgREST answers a select naming a
-- column that does not exist with a 400 for the whole query. A bot pulled
-- before this file is applied cannot read a link at all -- not for the drain,
-- not for /notify, not for a login code. **Apply this first.** That is the
-- same order 038, 039 and 040 needed, and the opposite of the rest of this
-- build; the reason is the same each time, a reader that names the column.

begin;

alter table gftvjobs_telegram_links
  add column if not exists notify_application_confirmed boolean not null default true;

comment on column gftvjobs_telegram_links.notify_application_confirmed is
  'The fourth notify toggle, phase 14. The form webhook or a manual link marked an application submitted on the applicant''s behalf.';

insert into gftvjobs_migrations (filename)
values ('043_notify_application_confirmed.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Roll the bot back first. A bot still naming the column in `LINK_COLUMNS`
-- gets a 400 on every link read once the column is gone, which is every
-- command that needs an account and the drain with them.
--
-- begin;
-- alter table gftvjobs_telegram_links drop column if exists notify_application_confirmed;
-- delete from gftvjobs_migrations where filename = '043_notify_application_confirmed.sql';
-- commit;
