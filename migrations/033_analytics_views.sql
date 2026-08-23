-- 033_analytics_views.sql
--
-- Creates: gftvjobs_job_funnel, gftvjobs_job_funnel_daily.
-- Spec:    section 8.4 (Analytics), 7c (the apply prompt and its three
--          response states), section 2 ("aggregation is Postgres's business").
-- Run after: 007, which creates gftvjobs_analytics and gftvjobs_ratings, and
--            032, the previous numbered file.
--
-- Two read only views and nothing else. No table changes, no data written, and
-- both are safe to recreate.
--
-- **Why this is SQL and not a loop in a serverless function.** PostgREST has no
-- group by, so the alternatives were a count query per posting per metric,
-- which is six requests times however many postings there are, or selecting
-- every analytics row and adding them up in JavaScript. The second is the one
-- that looks fine on day one and stops being fine quietly: gftvjobs_analytics
-- is an append only log that gains a row every time somebody opens a posting,
-- and an admin page that reads all of them is a page that gets slower every
-- week until somebody notices. The repo's own convention says the same thing
-- from the other direction: search ranking and tag counts are maintained in
-- Postgres rather than in application code.
--
-- **The three not-applied states are kept apart here and added up above.** 7c
-- gives an apply click three possible ends: the applicant answered yes,
-- answered no, or never answered, and the last of those splits again into
-- still waiting and swept to no_response by the phase 9 cron after fourteen
-- days. 8.4 says the conversion rate treats all three as not applied, which
-- makes it "a floor rather than an estimate", and the page says so. But it can
-- only say so honestly if the three are visible separately, because "nobody
-- answered" and "somebody said no" are completely different things to an admin
-- deciding whether a posting is working.
--
-- **Every count filters on event_type**, which is the trap phase 8 was warned
-- about before it started: nothing had ever written a 'view' row, so anything
-- that counted rows without filtering was accidentally correct until the day
-- views started arriving. The filters are here from the first line rather than
-- added after the first wrong number.

begin;

-- ---------------------------------------------------------------------------
-- The funnel, per posting, all time
-- ---------------------------------------------------------------------------
--
-- All time on purpose. 8.4 asks for "a sortable table across all jobs plus a
-- detail view per job with a simple bar or line chart over time": the table is
-- the lifetime picture of each posting, and the chart underneath is where time
-- comes into it. A date filtered table would make two postings published three
-- months apart look comparable when they are not.
--
-- Every posting appears, including drafts and archived ones, with zeros where
-- nothing has happened. A posting missing from an analytics page because
-- nobody has opened it is the one case where a zero is more useful than an
-- absence: it is the answer to "why is nobody applying to this".

create or replace view gftvjobs_job_funnel
  -- Added 24 August 2026, with migration 035. A view runs as its owner, so
  -- the RLS that protects every table underneath it does not apply unless
  -- this is set. It lives here as well as in 035 because this file says it
  -- is safe to recreate, and create or replace resets the option. The revoke
  -- that goes with it is in 035 and survives a recreate, because grants do.
  with (security_invoker = true) as
select
  j.id                                  as job_id,
  j.title,
  j.slug,
  j.status,
  j.published_at,
  j.closes_at,
  j.department_id,

  coalesce(a.views, 0)                  as views,
  coalesce(a.apply_clicks, 0)           as apply_clicks,
  coalesce(a.answered_yes, 0)           as answered_yes,
  coalesce(a.answered_no, 0)            as answered_no,
  coalesce(a.pending, 0)                as pending,
  coalesce(a.timed_out, 0)              as timed_out,

  -- 8.4: "Break the yes count down by answer_source so confirmed submissions
  -- are distinguishable from self reported ones." A webhook yes is a form
  -- Google told us about; an applicant yes is somebody clicking Yes in the
  -- prompt; an admin yes is a staff member recording it on the tracking page.
  -- They are three different qualities of evidence for the same claim.
  coalesce(a.yes_applicant, 0)          as yes_applicant,
  coalesce(a.yes_webhook, 0)            as yes_webhook,
  coalesce(a.yes_admin, 0)              as yes_admin,

  -- Null rather than zero when nobody has clicked Apply. A rate of zero is a
  -- claim that people looked and did not apply; null is "nobody has tried yet",
  -- and sorting has to be able to tell them apart. Same rule api/admin/me
  -- already follows for a count it could not read.
  case
    when coalesce(a.apply_clicks, 0) = 0 then null
    else round(a.answered_yes::numeric / a.apply_clicks, 4)
  end                                   as yes_rate,

  coalesce(r.rating_count, 0)           as rating_count,
  -- The average is carried in full precision and suppressed above, per 8.4:
  -- "suppress the average entirely below three ratings so a single opinion does
  -- not read as a verdict". The suppression is in api/_lib/analytics.js rather
  -- than here, so that the count and the threshold are decided in one place and
  -- the view stays a statement of what is in the table.
  r.rating_average

from gftvjobs_jobs j

left join (
  select
    job_id,
    count(*) filter (where event_type = 'view')                          as views,
    count(*) filter (where event_type = 'apply_click')                   as apply_clicks,
    count(*) filter (where event_type = 'apply_click' and did_apply)     as answered_yes,
    count(*) filter (
      where event_type = 'apply_click'
        and response_state = 'answered'
        and not did_apply
    )                                                                    as answered_no,
    count(*) filter (
      where event_type = 'apply_click' and response_state = 'pending'
    )                                                                    as pending,
    count(*) filter (
      where event_type = 'apply_click' and response_state = 'no_response'
    )                                                                    as timed_out,
    count(*) filter (
      where event_type = 'apply_click' and did_apply and answer_source = 'applicant'
    )                                                                    as yes_applicant,
    count(*) filter (
      where event_type = 'apply_click' and did_apply and answer_source = 'webhook'
    )                                                                    as yes_webhook,
    count(*) filter (
      where event_type = 'apply_click' and did_apply and answer_source = 'admin'
    )                                                                    as yes_admin
  from gftvjobs_analytics
  group by job_id
) a on a.job_id = j.id

left join (
  select
    job_id,
    count(*)                     as rating_count,
    round(avg(rating)::numeric, 2) as rating_average
  from gftvjobs_ratings
  group by job_id
) r on r.job_id = j.id;

comment on view gftvjobs_job_funnel is
  'Per posting funnel for 8.4: views, apply clicks, and how each click ended. yes_rate is null when nobody has clicked, never zero. The rating average is suppressed below three ratings by api/_lib/analytics.js, not here.';

-- ---------------------------------------------------------------------------
-- The same thing by day, for the detail chart
-- ---------------------------------------------------------------------------
--
-- Days in UTC, which is what created_at is stored in, and the page says so
-- rather than pretending a Singapore day. Nothing in this build has ever
-- displayed a date in a stored timezone and called it local, and a chart is
-- not the place to start: the difference is eight hours of clicks landing on
-- the neighbouring bar.
--
-- Only the three lines a chart can carry. Answered no, pending, and timed out
-- are in the table above and would make a six series chart of a board this
-- size unreadable.

create or replace view gftvjobs_job_funnel_daily
  -- Added 24 August 2026, with migration 035. A view runs as its owner, so
  -- the RLS that protects every table underneath it does not apply unless
  -- this is set. It lives here as well as in 035 because this file says it
  -- is safe to recreate, and create or replace resets the option. The revoke
  -- that goes with it is in 035 and survives a recreate, because grants do.
  with (security_invoker = true) as
select
  job_id,
  (created_at at time zone 'UTC')::date                            as day,
  count(*) filter (where event_type = 'view')                      as views,
  count(*) filter (where event_type = 'apply_click')               as apply_clicks,
  count(*) filter (where event_type = 'apply_click' and did_apply) as answered_yes
from gftvjobs_analytics
group by job_id, (created_at at time zone 'UTC')::date;

comment on view gftvjobs_job_funnel_daily is
  'Daily counts behind 8.4''s per posting chart. Days are UTC, matching how created_at is stored. Only days with at least one event appear, so the client fills the gaps.';

insert into gftvjobs_migrations (filename)
values ('033_analytics_views.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop view if exists gftvjobs_job_funnel_daily;
-- drop view if exists gftvjobs_job_funnel;
-- delete from gftvjobs_migrations where filename = '033_analytics_views.sql';
-- commit;
