// The daily maintenance run, section 11.
//
// This is the first thing in the build whose subject is time rather than a
// person. Everything else happens because somebody clicked something, and the
// three things that follow from the difference shape this whole file:
//
//   **Nobody is waiting for the answer.** Every other route in this build
//   reports to somebody looking at a screen, so a failure surfaces itself. A
//   cron that breaks is silent, and stays silent, for as long as nobody
//   happens to wonder. That is why the run record is written *first*, before
//   any work, and finished afterwards: a run that dies halfway leaves a row
//   with a started_at, no finished_at, and no ok, which is visibly different
//   from both a healthy run and no run at all.
//
//   **It has to be safe to run twice.** Vercel retries, and a person will run
//   it by hand while testing. Every task below is idempotent by nature —
//   closing a posting that is closed matches nothing, deleting expired rows
//   that are gone deletes nothing — and the one thing that would double is the
//   audit rows. So the audit rows are written from the rows the update actually
//   returned, never from the set that was attempted. Run it twice and the
//   second run writes none, because the second run changed nothing.
//
//   **One task failing must not stop the rest.** The four are independent and
//   run in sequence, each inside its own guard. The form health check is both
//   the most likely to throw, because it is the only one that leaves the
//   database and talks to Google, and the least important of the four, which is
//   why it goes last.
//
// **On unavailable() in a cron.** A route answers 503 and the caller sees it. A
// cron has no caller to tell, so a switched off cron records a run that says it
// was switched off, rather than doing nothing silently. Without that, the
// overview's last-run panel would say the same thing — "no run" — for "an admin
// turned it off" and "the scheduler has been broken for a month", which are the
// two states it exists to tell apart.

import { supabase, T } from './supabase.js';
import { recordAudit, AUDIT } from './audit.js';
import { checkFormUrl } from './form-check.js';
import { HELLO } from './session.js';
// The window the status page draws, so the sweep and the page cannot disagree
// about how long ninety days is. Phase 12 part 7, and the same move part 1 made
// with MIN_SIZE: a number two files both need is imported, not repeated.
import { DAYS as STATUS_DAYS } from './status.js';

/** What section 11 calls it, and the default job_name in migration 012. */
export const DAILY = 'daily';

/**
 * How long an unanswered apply prompt stands before the cron gives up on it.
 *
 * Section 11: "Resolve gftvjobs_analytics rows still pending after 14 days to
 * no_response." Migration 007's partial index on pending rows is what makes
 * finding them cheap.
 */
const PROMPT_TIMEOUT_DAYS = 14;

/**
 * How many forms one run checks, and how many at a time.
 *
 * The cron runs inside a function with a wall clock limit, and the form check
 * is the only task here that waits on somebody else's server. Twenty forms,
 * five at a time, at an eight second ceiling each, is about thirty two seconds
 * in the worst case where every single one hangs — which fits inside the sixty
 * vercel.json allows this function, with the other three tasks already done.
 *
 * Postings are taken oldest-checked first, so a board with more than twenty
 * published roles rotates through them across successive days rather than
 * checking the same twenty every morning and never reaching the rest.
 */
const FORM_CHECK_LIMIT = 20;
const FORM_CHECK_CONCURRENCY = 5;

/**
 * How long the rate limit table keeps a spent window.
 *
 * Migration 012 says gftvjobs_rate_limits is "swept by the daily cron" and
 * section 11's list does not name it, which is the migration being right and
 * the list being written before the limiter existed. A window is useless once
 * it has passed and a lock is useless once it has expired; a day of slack past
 * the longest window in rate-limit.js means nothing is ever deleted out from
 * under a limit that is still being enforced.
 */
const RATE_LIMIT_KEEP_HOURS = 25;

/* -------------------------------------------------------------------------
 * The run record. First, not last.
 * ---------------------------------------------------------------------- */

/**
 * Open a run row and return its id.
 *
 * Never throws, and returns null when the row could not be written. A run whose
 * record could not be opened still does its work: the maintenance is the point
 * and the record is the reporting, and losing the second is not a reason to
 * skip the first.
 *
 * @param {string} [jobName]
 * @returns {Promise<string|null>}
 */
export async function startRun(jobName = DAILY) {
  try {
    const { data, error } = await supabase
      .from(T.cronRuns)
      .insert({ job_name: jobName, started_at: new Date().toISOString() })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (cause) {
    console.error('[careers-gftv] cron run could not be opened:', cause);
    return null;
  }
}

/**
 * Close a run row with what it did.
 *
 * @param {string|null} runId
 * @param {{ ok: boolean, results?: object, error?: string|null }} outcome
 */
export async function finishRun(runId, outcome) {
  if (!runId) return;

  try {
    const { error } = await supabase
      .from(T.cronRuns)
      .update({
        finished_at: new Date().toISOString(),
        ok: outcome.ok,
        results: outcome.results ?? {},
        // Capped, because this is the one column in the table that holds a
        // string somebody else wrote and a stack trace has no natural length.
        error: outcome.error ? String(outcome.error).slice(0, 2000) : null,
      })
      .eq('id', runId);

    if (error) throw error;
  } catch (cause) {
    console.error('[careers-gftv] cron run could not be closed:', cause);
  }
}

/**
 * The most recent run, for the overview panel in section 11's last line.
 *
 * @param {string} [jobName]
 * @returns {Promise<object|null|undefined>} the row, null when there has never
 *          been a run, and **undefined when the table could not be read**. The
 *          three are deliberately distinct: api/admin/me sends null rather than
 *          zero for a count it could not read, and the same manners apply here.
 *          "No run has ever happened" is a claim, and a failed query does not
 *          entitle us to make it.
 */
export async function lastRun(jobName = DAILY) {
  try {
    const { data, error } = await supabase
      .from(T.cronRuns)
      .select('id, job_name, started_at, finished_at, ok, results, error')
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  } catch (cause) {
    console.warn('[careers-gftv] last cron run:', cause);
    return undefined;
  }
}

/* -------------------------------------------------------------------------
 * Task 1. Auto-close postings past their date
 * ---------------------------------------------------------------------- */

/**
 * Close every published posting whose closes_at has passed.
 *
 * **A posting with a null closes_at is skipped entirely and never auto-closes.**
 * Section 11 says so, and 8.1 already counts those separately and draws them a
 * badge of their own, so the interface has been promising it since phase 7.
 * "Open until filled" is a real state, not a posting somebody forgot to date.
 *
 * published_at is not touched, per deviation 42: it is when the posting first
 * went out and closing it does not change that.
 *
 * @returns {Promise<{ closed: number, postings: Array<{ id: string, title: string }> }>}
 */
export async function autoClosePostings() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(T.jobs)
    .update({ status: 'closed' })
    .eq('status', 'published')
    // Both halves matter. PostgREST would happily apply this update to every
    // row if the filters were dropped, and `.not(...is.null)` is what keeps an
    // open-until-filled posting out of it.
    .not('closes_at', 'is', null)
    .lt('closes_at', now)
    .select('id, title, closes_at');

  if (error) throw error;

  const postings = data ?? [];

  // From the rows that actually changed, never from the set that was attempted.
  // This is the whole of what makes a second run write no audit rows: the
  // second run's update matches nothing, so this loop does not execute.
  for (const posting of postings) {
    await recordAudit({
      realm: 'system',
      actorId: null,
      actorLabel: 'daily cron',
      action: AUDIT.JOB_STATUS_CHANGED,
      targetTable: T.jobs,
      targetId: posting.id,
      reason: 'The closing date passed.',
      metadata: {
        from: 'published',
        to: 'closed',
        title: posting.title,
        closes_at: posting.closes_at,
        automatic: true,
      },
    });
  }

  return {
    closed: postings.length,
    postings: postings.map((row) => ({ id: row.id, title: row.title })),
  };
}

/* -------------------------------------------------------------------------
 * Task 2. Resolve prompts nobody answered
 * ---------------------------------------------------------------------- */

/**
 * Give up on apply prompts still pending after fourteen days.
 *
 * did_apply is left false, which is not an omission: "no answer means no" is a
 * settled decision, and this only moves the row from "we are still asking" to
 * "we stopped asking". The distinction exists so the analytics page can tell
 * silence from an explicit No, which is why the source is recorded as 'timeout'
 * rather than left null.
 *
 * Filtered on apply_click, for the reason apply.js gives at that constant's
 * definition: 8.4's view rows sit in the same table at response_state pending,
 * and sweeping them would resolve a prompt that was never asked.
 *
 * @returns {Promise<{ timed_out: number }>}
 */
export async function resolveStalePrompts() {
  const cutoff = new Date(Date.now() - PROMPT_TIMEOUT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from(T.analytics)
    .update({
      response_state: 'no_response',
      answer_source: 'timeout',
      responded_at: new Date().toISOString(),
    })
    .eq('event_type', 'apply_click')
    .eq('response_state', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw error;

  // No audit row and no event row. This is not a decision about anybody: the
  // tracking row does not move, no cooldown starts, and nothing an applicant
  // can see changes. The count in the run record is the whole of the reporting
  // it needs, and a row per timed out prompt would make gftvjobs_audit_log grow
  // by the size of the funnel.
  return { timed_out: data?.length ?? 0 };
}

/* -------------------------------------------------------------------------
 * Task 3. Delete expired rows
 * ---------------------------------------------------------------------- */

/**
 * The tables section 11 names, plus the ones added to the schema after it was
 * written.
 *
 * Each entry is a table and the column that says when a row stopped being
 * useful. Every delete carries that filter and nothing here ever runs an
 * unfiltered delete, which is the one mistake in this file that would not be
 * recoverable.
 *
 * **gftvhello_sessions is deliberately absent.** Section 11: "Do not touch
 * gftvhello_sessions rows belonging to other portals beyond normal expiry
 * cleanup." Those rows are shared with every other GFTV app on the same staff
 * accounts, and this portal is not the thing that should be tidying them: an
 * expired row there costs nothing, and deleting rows we did not create on a
 * schedule nobody else agreed to is the kind of helpfulness that is somebody
 * else's outage. gftvhello_totp_challenges is swept, because section 11 names
 * it outright and because a challenge row is spent within minutes.
 *
 * **The portal's staff sessions are swept as of migration 038**, and that is
 * the same rule rather than an exception to it: they moved out of
 * gftvhello_sessions into a gftvjobs_ table this build owns, and what the
 * paragraph above declines to tidy is other people's rows. An expired staff
 * session is deleted on read when somebody presents it, exactly as an
 * applicant's is, and this is what clears the ones nobody ever comes back for.
 */
const EXPIRING = Object.freeze([
  { table: T.sessions, column: 'expires_at', label: 'applicant sessions' },
  { table: T.staffSessions, column: 'expires_at', label: 'staff sessions' },
  { table: T.trustedDevices, column: 'expires_at', label: 'applicant trusted devices' },
  { table: T.passwordResets, column: 'expires_at', label: 'password resets' },
  { table: T.telegramTokens, column: 'expires_at', label: 'telegram tokens' },
  // Phase 2's passkey tables, from migration 025. Not in section 11's list
  // because they did not exist when it was written; both hold short lived
  // challenge rows that are dead weight the moment they expire.
  { table: T.passkeyChallenges, column: 'expires_at', label: 'passkey challenges' },
  { table: T.loginChallenges, column: 'expires_at', label: 'login challenges' },
  // Named by section 11. The one gftvhello_ table this sweep touches, and the
  // one whose primary key is its token rather than an id, per HELLO.
  {
    table: T.staffTotpChallenges,
    column: HELLO.challenges.expiresAt,
    label: 'staff 2FA challenges',
    key: HELLO.challenges.token,
  },
]);

/**
 * Delete everything that has expired.
 *
 * One table failing does not stop the others: a sweep is a tidy up, and half a
 * tidy up is better than none. Each failure is counted and named in the run
 * record so a table that has been failing for a week is visible.
 *
 * @returns {Promise<{ deleted: number, by_table: Record<string, number>, failed: string[] }>}
 */
export async function sweepExpiredRows() {
  const now = new Date().toISOString();
  const byTable = {};
  const failed = [];
  let deleted = 0;

  for (const entry of EXPIRING) {
    try {
      // The returned rows are the count. PostgREST has no affected-row count on
      // a delete without one, and selecting the key alone keeps the payload to
      // one column however many rows go.
      const { data, error } = await supabase
        .from(entry.table)
        .delete()
        .lt(entry.column, now)
        .select(entry.key ?? 'id');

      if (error) throw error;

      const count = data?.length ?? 0;
      byTable[entry.table] = count;
      deleted += count;
    } catch (cause) {
      console.error(`[careers-gftv] sweep ${entry.table}:`, cause);
      failed.push(entry.table);
    }
  }

  // The limiter's own table, per migration 012's comment on it. Two conditions,
  // because a row is only dead when both its window has passed and its lock has
  // expired: deleting a locked out subject early would hand somebody their
  // attempts back before the hour was up.
  try {
    const cutoff = new Date(Date.now() - RATE_LIMIT_KEEP_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from(T.rateLimits)
      .delete()
      .lt('window_start', cutoff)
      // The timestamp is quoted because PostgREST's or() splits on periods and
      // an ISO timestamp carries one before the milliseconds. It parses either
      // way today; the quotes mean it keeps doing so if that ever tightens.
      .or(`locked_until.is.null,locked_until.lt."${now}"`)
      .select('bucket');

    if (error) throw error;

    const count = data?.length ?? 0;
    byTable[T.rateLimits] = count;
    deleted += count;
  } catch (cause) {
    console.error('[careers-gftv] sweep rate limits:', cause);
    failed.push(T.rateLimits);
  }

  // The probe's own two tables, per section 11: "Delete gftvjobs_status_checks
  // rows older than ninety days, once that table exists in phase 12." Decision
  // 23 replaced the row-per-check table with a row per day and a row per
  // outage, so what section 11 asked for is a much smaller sweep than it
  // expected — four rows a day and an incident now and then — and it is still
  // worth doing, because the page draws exactly ninety days and anything older
  // is weight nothing reads.
  //
  // **Ninety days is imported rather than repeated.** It is the same window the
  // status page draws, and a sweep set shorter than the page would quietly
  // empty the left hand end of every uptime bar while the page went on labelling
  // it ninety days.
  //
  // **An open incident is never swept, whatever its age.** `ended_at is null`
  // means it is still the current state of that target as far as anything here
  // knows, and deleting it would take the one row the page most needs.
  const statusCutoff = new Date(Date.now() - STATUS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from(T.statusDays)
      .delete()
      .lt('day', statusCutoff.slice(0, 10))
      .select('target');

    if (error) throw error;

    const count = data?.length ?? 0;
    byTable[T.statusDays] = count;
    deleted += count;
  } catch (cause) {
    console.error('[careers-gftv] sweep status days:', cause);
    failed.push(T.statusDays);
  }

  try {
    const { data, error } = await supabase
      .from(T.statusIncidents)
      .delete()
      .lt('started_at', statusCutoff)
      .not('ended_at', 'is', null)
      .select('id');

    if (error) throw error;

    const count = data?.length ?? 0;
    byTable[T.statusIncidents] = count;
    deleted += count;
  } catch (cause) {
    console.error('[careers-gftv] sweep status incidents:', cause);
    failed.push(T.statusIncidents);
  }

  return { deleted, by_table: byTable, failed };
}

/* -------------------------------------------------------------------------
 * Task 4. The form health check
 * ---------------------------------------------------------------------- */

/**
 * Check published postings' application forms, and flag the ones that are not
 * usable.
 *
 * **A result that says nothing writes nothing.** checkFormUrl answers with a
 * null state when it learned nothing — a timeout, a 5xx from Google, a page it
 * did not recognise — and those leave the stored columns exactly as they were.
 * See the header of form-check.js for why that is the whole design rather than
 * a detail.
 *
 * **An unchanged result also writes nothing**, and that is here rather than
 * there for a reason of this build's own. gftvjobs_jobs has a touch trigger on
 * updated_at from migration 002, the admin list sorts by that column, and
 * phase 12's sitemap will take its lastmod from it. A daily write to every
 * published posting would move all of them every morning, which is the exact
 * churn migration 009 avoided when it backfilled only unindexed rows.
 *
 * The cost of that, stated plainly: **form_checked_at is when a result was last
 * established, not when the form was last looked at.** A form that has been
 * healthy since August carries an August date. The question that date looks
 * like it answers — is the check even running — is answered by the run record
 * on the overview instead, which is what section 11's last line is for.
 *
 * @param {{ limit?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function checkPublishedForms(options = {}) {
  const limit = options.limit ?? FORM_CHECK_LIMIT;

  const { data, error } = await supabase
    .from(T.jobs)
    .select('id, title, application_form_url, form_check_state, form_check_note, form_checked_at')
    .eq('status', 'published')
    .not('application_form_url', 'is', null)
    // Oldest first, and never checked first of all, so the rotation reaches
    // every posting rather than the same page of them.
    .order('form_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;

  const postings = data ?? [];
  const summary = { checked: 0, changed: 0, warning: 0, error: 0, inconclusive: 0, flagged: [] };

  for (const batch of chunk(postings, FORM_CHECK_CONCURRENCY)) {
    const results = await Promise.all(
      batch.map(async (posting) => ({
        posting,
        result: await checkFormUrl(posting.application_form_url, {
          fetchImpl: options.fetchImpl,
        }),
      }))
    );

    for (const { posting, result } of results) {
      summary.checked += 1;

      if (result.state === null) {
        summary.inconclusive += 1;
        continue;
      }

      if (result.state === 'warning') summary.warning += 1;
      if (result.state === 'error') summary.error += 1;

      const unchanged =
        posting.form_check_state === result.state &&
        (posting.form_check_note ?? null) === (result.note ?? null);

      if (unchanged) continue;

      const { error: writeError } = await supabase
        .from(T.jobs)
        .update({
          form_check_state: result.state,
          form_check_note: result.note,
          form_checked_at: new Date().toISOString(),
        })
        .eq('id', posting.id);

      if (writeError) {
        console.error('[careers-gftv] form check write:', posting.id, writeError);
        continue;
      }

      summary.changed += 1;

      // Named in the run record only when the state got worse, so the panel on
      // the overview reads as a short list of things to look at rather than a
      // log. A posting recovering is a change worth writing to the row and not
      // worth putting in front of somebody.
      if (result.state !== 'ok') {
        summary.flagged.push({ id: posting.id, title: posting.title, state: result.state });
      }
    }
  }

  return summary;
}

/** Split a list into batches of n. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

/**
 * Run every task, in order, with one failing never stopping the rest.
 *
 * The order is deliberate: the three database tasks first, cheapest and most
 * important first, and the one that leaves the building last. If the function
 * is killed by its wall clock limit, what is lost is the form check, which is
 * the task section 11 itself describes as flagging a badge.
 *
 * @param {{ skipFormCheck?: boolean, formCheckLimit?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ ok: boolean, results: object, failed: string[] }>}
 */
export async function runDailyMaintenance(options = {}) {
  const results = {};
  const failed = [];

  const run = async (name, task) => {
    try {
      return await task();
    } catch (cause) {
      console.error(`[careers-gftv] cron task ${name}:`, cause);
      failed.push(name);
      // The message and not the stack. The run record is read on an admin page
      // and a stack trace there is neither useful nor ours to show.
      results[`${name}_error`] = cause instanceof Error ? cause.message : String(cause);
      return null;
    }
  };

  const closed = await run('auto_close', autoClosePostings);
  results.auto_closed = closed?.closed ?? null;
  if (closed?.postings?.length) results.closed_postings = closed.postings;

  const prompts = await run('resolve_prompts', resolveStalePrompts);
  results.prompts_timed_out = prompts?.timed_out ?? null;

  const swept = await run('sweep_expired', sweepExpiredRows);
  results.expired_rows_deleted = swept?.deleted ?? null;
  if (swept) {
    results.expired_by_table = swept.by_table;
    if (swept.failed.length > 0) results.sweep_failed_tables = swept.failed;
  }

  if (options.skipFormCheck) {
    results.form_checks_skipped = true;
  } else {
    const forms = await run('form_check', () =>
      checkPublishedForms({ limit: options.formCheckLimit, fetchImpl: options.fetchImpl })
    );
    results.forms_checked = forms?.checked ?? null;
    results.form_checks_changed = forms?.changed ?? null;
    // The key migration 012's comment names, kept exactly: postings whose form
    // is currently not usable.
    results.form_checks_failed = forms ? forms.warning + forms.error : null;
    if (forms?.flagged?.length) results.flagged_postings = forms.flagged;
  }

  // A null count means a task failed, and nothing here turns one into a zero. A
  // zero is a claim that nothing needed doing.
  return { ok: failed.length === 0, results, failed };
}
