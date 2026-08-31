-- 037_status_checks.sql
--
-- Creates: gftvjobs_status_days, gftvjobs_status_incidents, and the function
--          gftvjobs_status_record() that both are written through.
-- Spec:    0c ("The service status page, after the build"), section 15 ("The
--          status probe"), and section 11's sweep list.
-- Run after: 036, the previous numbered file. It depends on nothing else: these
--            tables reference no other table on purpose, and the reason is
--            below.
--
-- **These are the only tables in the schema written by something outside
-- Vercel.** The probe runs on the Debian VPS beside the Telegram bot and writes
-- here with the service key, because 0c is explicit that a status page hosted on
-- the thing it monitors is useless during the outage it exists to report. An
-- endpoint on the portal would be unreachable in precisely the case worth
-- recording.
--
-- **What is stored is a day and an outage, not a check.** The first shape of
-- this file kept one row per request: four targets a minute is 5,760 rows a day
-- and about half a million over the ninety days the page draws, or a fifth of a
-- free tier's whole budget spent recording that nothing happened. Settled
-- 31 August 2026, decision 23. A check now updates two things and stores
-- neither itself:
--
--   **gftvjobs_status_days** is one row per target per UTC day, counting what
--   was watched. **The counters are what keep the page honest**: 0c forbids
--   showing a green day it did not measure, so a day has to carry how much of
--   itself was actually watched, and a day nobody probed has no row at all
--   rather than a row of zeroes.
--
--   **gftvjobs_status_incidents** is one row per outage, opened by the first
--   failed check and closed by the first check that succeeds after it. A
--   prolonged outage is one row that grows, never a row a minute, and its end
--   is observed rather than inferred.
--
-- **No foreign keys, and that is deliberate rather than an omission.** These
-- rows are observations about an address at a moment. They must be writable
-- while the portal is returning 500 to everything, they must survive whatever
-- they were observing, and `job_page` names a *kind of page* rather than one
-- posting: which posting is probed changes when the seed is cleared, and ninety
-- days of history must not break when it does. See `TARGETS` in
-- `main-site/api/_lib/status.js`.
--
-- **A gap is data.** Nothing here is backfilled and nothing is buffered on the
-- VPS: when the probe cannot reach Supabase it writes nothing at all, and the
-- page draws that day as unknown in a neutral colour rather than as either
-- state. 0c: "Never show a green day it did not measure."

begin;

-- ---------------------------------------------------------------------------
-- One row per target per day
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_status_days (
  -- Which of the four public addresses this was. A name rather than a URL: the
  -- address of a posting page changes with the seed, and the history is about
  -- the component rather than the URL. The four are fixed in one list per side
  -- -- TARGETS in api/_lib/status.js and TARGETS in telegram-bot/probe.py --
  -- and `tests/phase12-test.mjs --only=status` reads all three, this constraint
  -- included, and fails when they disagree.
  target            text        not null,

  -- UTC, and the same day api/_lib/status.js computes. Two definitions of "a
  -- day" would put the bars a timezone out from the labels under them without
  -- anything looking wrong.
  day               date        not null,

  -- **How much of the day was watched, and how much of it failed.** A full day
  -- is 1,440 checks at one a minute; anything much below that is a day the page
  -- draws as partly measured rather than as good, because a day watched for
  -- twenty minutes is not a day it watched.
  checks            integer     not null default 0,
  failures          integer     not null default 0,

  -- Section 15 asks for the duration to be recorded. It is recorded as a sum
  -- and a worst case rather than per request, which is the same trade the
  -- counters make: the page shows an average response time per target and the
  -- slowest thing that happened, and neither needs a row per check.
  duration_total_ms bigint      not null default 0,
  slowest_ms        integer,

  -- What the freshness of the whole page is judged from. A headline that read
  -- an empty recent window as "no failures" would report all clear precisely
  -- when the machine watching had stopped, which is the failure 0c exists to
  -- prevent.
  first_checked_at  timestamptz not null,
  last_checked_at   timestamptz not null,

  constraint gftvjobs_status_days_pkey primary key (target, day),

  constraint gftvjobs_status_days_target_check
    check (target in ('feature_status', 'search', 'job_page', 'jobs_feed')),

  constraint gftvjobs_status_days_counts_check
    check (checks >= 0 and failures >= 0 and failures <= checks)
);

create index if not exists gftvjobs_status_days_day_idx
  on gftvjobs_status_days (day);

comment on table gftvjobs_status_days is
  'One row per target per UTC day, written from the VPS through gftvjobs_status_record(). A day with no row was not measured, and the page draws it as unknown rather than as up.';
comment on column gftvjobs_status_days.checks is
  'How many checks were made that day. 1,440 is a full day at one a minute. This is what stops the page calling a barely watched day a good one.';

-- ---------------------------------------------------------------------------
-- One row per outage
-- ---------------------------------------------------------------------------

create table if not exists gftvjobs_status_incidents (
  id             uuid primary key default gen_random_uuid(),
  target         text        not null,

  -- Opened by the first failed check, extended by each failed check after it,
  -- and closed by the first check that succeeds. **The end is observed**, which
  -- is the whole gain over storing failures and reconstructing runs from them:
  -- the page can say how long an outage lasted rather than how long it was seen
  -- to last.
  started_at     timestamptz not null,
  last_failed_at timestamptz not null,
  ended_at       timestamptz,

  -- How many checks failed inside it. A single failed check is a blip and the
  -- page does not list it; the row is still written, because a blip that turns
  -- out to be the start of something is the row somebody wants afterwards.
  failures       integer     not null default 1,

  -- The last thing the portal said, and it is a diagnostic rather than copy: the
  -- page says "not answering" and never prints an exception at a member of the
  -- public. Null status_code means nothing answered at all, which is a different
  -- fact from a 503 and is kept as one.
  status_code    integer,
  error          text,

  constraint gftvjobs_status_incidents_target_check
    check (target in ('feature_status', 'search', 'job_page', 'jobs_feed')),

  constraint gftvjobs_status_incidents_order_check
    check (last_failed_at >= started_at and (ended_at is null or ended_at >= last_failed_at))
);

-- **At most one open incident per target**, which is what makes "extend the
-- open one, or open a new one" a decision the database makes rather than the
-- probe. A partial unique index, because ended_at is null for exactly one row
-- per target at a time and for none of the rest.
create unique index if not exists gftvjobs_status_incidents_open_idx
  on gftvjobs_status_incidents (target)
  where ended_at is null;

create index if not exists gftvjobs_status_incidents_started_idx
  on gftvjobs_status_incidents (started_at desc);

comment on table gftvjobs_status_incidents is
  'One row per outage, not per failed check. Opened by the first failure, closed by the first success after it. A prolonged outage is one row that grows.';

-- ---------------------------------------------------------------------------
-- The one way in
-- ---------------------------------------------------------------------------

-- **Nothing reads and then writes**, which is the rule the bot's own Supabase
-- client opens with. A cycle's four results arrive as one array and the whole
-- update is one statement per row inside one function: the day counters go up
-- through `on conflict`, and an incident is opened, extended or closed by the
-- partial unique index above rather than by the caller checking first.
--
-- It is also what keeps the probe dumb. `probe.py` decides whether a request
-- worked and nothing else; where that lands and what it means for an open
-- incident is here, in one place, in the same file as the constraints.
create or replace function gftvjobs_status_record(p_checks jsonb)
returns void
language plpgsql
-- 036's lesson, in the file that creates the function rather than in one
-- somebody writes after an advisor complains. extensions is on the path because
-- every other gftvjobs_ function has it and nothing here should be the one that
-- differs.
set search_path = public, extensions, pg_catalog
as $$
declare
  entry       jsonb;
  v_target    text;
  v_at        timestamptz;
  v_ok        boolean;
  v_duration  integer;
  v_code      integer;
  v_error     text;
begin
  for entry in select * from jsonb_array_elements(coalesce(p_checks, '[]'::jsonb))
  loop
    v_target   := entry ->> 'target';
    v_at       := coalesce((entry ->> 'checked_at')::timestamptz, now());
    v_ok       := coalesce((entry ->> 'ok')::boolean, false);
    v_duration := nullif(entry ->> 'duration_ms', '')::integer;
    v_code     := nullif(entry ->> 'status_code', '')::integer;
    v_error    := left(nullif(entry ->> 'error', ''), 200);

    -- An unknown target is refused rather than recorded under a name the page
    -- will never draw. The check constraints would catch it; saying so here
    -- names the file to fix.
    if v_target is null or v_target not in ('feature_status', 'search', 'job_page', 'jobs_feed') then
      raise exception 'gftvjobs_status_record: % is not a known target. See TARGETS in api/_lib/status.js.', v_target;
    end if;

    insert into gftvjobs_status_days as d (
      target, day, checks, failures, duration_total_ms, slowest_ms, first_checked_at, last_checked_at
    )
    values (
      v_target,
      (v_at at time zone 'UTC')::date,
      1,
      case when v_ok then 0 else 1 end,
      coalesce(v_duration, 0),
      v_duration,
      v_at,
      v_at
    )
    on conflict (target, day) do update
      set checks            = d.checks + 1,
          failures          = d.failures + case when v_ok then 0 else 1 end,
          duration_total_ms = d.duration_total_ms + coalesce(v_duration, 0),
          slowest_ms        = greatest(coalesce(d.slowest_ms, 0), coalesce(v_duration, 0)),
          first_checked_at  = least(d.first_checked_at, v_at),
          last_checked_at   = greatest(d.last_checked_at, v_at);

    if v_ok then
      -- The first success after an outage is its end, and it is an observed end
      -- rather than the last thing that was seen to fail.
      update gftvjobs_status_incidents
         set ended_at = v_at
       where target = v_target
         and ended_at is null;
    else
      update gftvjobs_status_incidents
         set last_failed_at = greatest(last_failed_at, v_at),
             failures       = failures + 1,
             status_code    = v_code,
             error          = v_error
       where target = v_target
         and ended_at is null;

      if not found then
        insert into gftvjobs_status_incidents (
          target, started_at, last_failed_at, failures, status_code, error
        )
        values (v_target, v_at, v_at, 1, v_code, v_error);
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may touch any of it
-- ---------------------------------------------------------------------------

-- Tables rather than views, so they take the protection every other table in
-- this schema has and neither of the two lines 035 adds for a view. RLS with no
-- policies: the service role bypasses it and holds it, and anything with an
-- anon key gets nothing.
alter table gftvjobs_status_days enable row level security;
alter table gftvjobs_status_incidents enable row level security;

-- **A function is the hole RLS does not cover**, and this is 035's lesson
-- pointed at a different object. Supabase grants execute on new functions in
-- public to anon and authenticated by default, and this project's anon key is
-- shared with other GFTV apps. Without these two lines anybody holding it could
-- write status history for a site they do not run — green days that were never
-- measured, or an outage that never happened, which is precisely the page's one
-- promise broken from the outside.
revoke all on function gftvjobs_status_record(jsonb) from public, anon, authenticated;

-- **And granted back to exactly one role**, which is not belt and braces: the
-- `revoke ... from public` above removes the implicit grant every function
-- carries, and whether `service_role` also holds an explicit one depends on how
-- Supabase's default privileges landed in this project. Saying it here means
-- the probe can call this whatever the answer to that is, and means the list of
-- who may write status history is one line long.
grant execute on function gftvjobs_status_record(jsonb) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- Uncomment, read what it drops, then run. This one takes the history with it:
-- ninety days of observations cannot be recomputed from anything, because
-- nothing else in the architecture was watching.
--
-- begin;
-- drop function if exists gftvjobs_status_record(jsonb);
-- drop table if exists gftvjobs_status_incidents;
-- drop table if exists gftvjobs_status_days;
-- commit;
