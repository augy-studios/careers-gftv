// The /status page, both of the pages it has to be. Phase 12 part 7.
//
// 0c gives this route two jobs and one address. During the build it lists every
// phase and says what is not here yet; once everything has shipped the question
// a reader arrives with changes to "is it working right now", and the page
// becomes a service status page in the shape Atlassian's read: a headline, a
// component list, ninety days of uptime, and past incidents.
//
// **The two must never be on screen together**, per 0c and section 2 of the
// memo: a page listing both what is unbuilt and what is degraded gives a reader
// two different reasons a thing might not work and no way to tell which they are
// looking at. So this file renders both and `serviceView()` below decides, from
// one derivation over `build-status.json` and nothing else. There is no flag to
// flip, no rewrite to move and no file to delete on the day it turns over: the
// last phase reading `shipped` is the switchover. Settled 31 August 2026, and it
// is settled decision 14's shape applied to a page instead of to a crawler.
//
// **Everything here is pure.** The queries and the headers are in
// `api/status-page.js`; what decides a day's colour, a headline, or an incident
// is in this file, so `tests/phase12-test.mjs --only=status` measures the
// decisions rather than a deployment's copy of them. That arrangement is part
// 5's and it earned itself there.
//
// **The page never claims to know more than it does**, which 0c calls the one
// rule everything else follows. Every panel distinguishes three states and not
// two: working, not working, and no answer. A day nothing probed is drawn
// unknown in a neutral colour that the legend names; a percentage is always
// printed beside the coverage it was computed from; and when no probe result has
// arrived recently the headline says so instead of saying everything is fine,
// because a status page that reports all clear because it could not reach
// anything is worse than no page at all.

import { createRequire } from 'node:module';

import { escapeHtml, escapeAttr, renderDocument } from './page-shell.js';

// Both files are read at module scope with a literal path, which is what makes
// the bundler trace them into the function. The same trick maintenance.js uses
// for the feature map, and for the same reason.
const require = createRequire(import.meta.url);
const buildStatus = require('../../assets/build-status.json');
const EN = require('../../assets/i18n/en.json');

/* -------------------------------------------------------------------------
 * Which page this is
 * ---------------------------------------------------------------------- */

/**
 * Whether every phase in the plan reads `shipped`.
 *
 * The whole of the switchover. 0c: "The switchover itself — dropping the phase
 * list from the page — is gated on every phase being `shipped`, so the two
 * halves can be built and then turned over rather than raced."
 *
 * An empty or unreadable phase list answers false, so the failure direction is
 * the page that still works during the build rather than a service page with no
 * probe behind it.
 */
export function everyPhaseShipped(status = buildStatus) {
  const phases = status?.phases ?? [];
  if (phases.length === 0) return false;
  return phases.every((phase) => phase.status === 'shipped');
}

/** The two things this route can be. */
export const VIEW = Object.freeze({ build: 'build', service: 'service' });

/**
 * Which view a request gets.
 *
 * `preview` is the staff hatch and is the only thing that can override the
 * gate. It exists because the alternative is what part 5 accepted for
 * `/sitemap.xml` and named as its cost: a query that is not exercised against
 * real data until the flip. There the query was one select; here it is ninety
 * days of aggregation, four panels and a probe on another machine, and the
 * first time anybody sees it must not be the day phase 15 ships. It is refused
 * to everybody without a staff session, so no member of the public can ever
 * reach the two pages at once.
 */
export function viewFor({ preview = false } = {}) {
  if (preview) return VIEW.service;
  return everyPhaseShipped() ? VIEW.service : VIEW.build;
}

/* -------------------------------------------------------------------------
 * What is probed
 * ---------------------------------------------------------------------- */

/**
 * The four addresses the probe requests, per 0c and section 15.
 *
 * **This list exists three times and a check reads all three.** Here, in
 * `telegram-bot/probe.py`, and in migration `037`'s check constraint, because
 * the probe is a different language on a different machine and the database is
 * what refuses a name nobody agreed to. `--only=status` reads the Python and
 * the SQL and fails when they disagree with this, which is phase 11's
 * `commands.py --check` lesson: a list copied into other files needs a check,
 * not a docstring.
 *
 * **A key is a component, not a URL.** Which posting `job_page` fetches changes
 * the day the dev seed is cleared, and ninety days of history must survive
 * that.
 */
export const TARGETS = Object.freeze([
  { key: 'feature_status', path: '/api/public/feature-status' },
  { key: 'search', path: '/search' },
  { key: 'job_page', path: '/jobs/{id}' },
  { key: 'jobs_feed', path: '/api/public/jobs.json' },
]);

export const TARGET_KEYS = Object.freeze(TARGETS.map((target) => target.key));

/** Ninety days, from 0c's "Uptime, ninety days" and section 11's sweep. */
export const DAYS = 90;

/** One probe a minute, which is what a full day of coverage means. */
export const EXPECTED_PER_DAY = 24 * 60;

/**
 * Below this share of a day's expected checks, a day with no failures is drawn
 * as partial rather than as up.
 *
 * A quarter is a judgement and is written down as one. The rule it serves is
 * 0c's: never show a green day it did not measure. A day the probe watched for
 * twenty minutes is not a day it watched, and the first day after the probe is
 * started is exactly that day.
 */
export const MIN_COVERAGE = 0.25;

/**
 * How old the newest probe row may be before the headline stops claiming
 * anything. Fifteen minutes, which is fifteen missed checks.
 *
 * This is the specific failure 0c exists to prevent, from the other side: the
 * page is served by Vercel and the probe runs on the VPS, so a page that read
 * an empty recent window as "no failures" would report all clear precisely when
 * the machine watching it had stopped.
 */
export const STALE_MS = 15 * 60 * 1000;

/**
 * How many failed checks make an incident worth listing. Three, so about three
 * minutes.
 *
 * **This is a display filter and not a storage rule.** The probe opens an
 * incident row on the first failure, because a blip that turns out to be the
 * start of something is the row somebody wants afterwards; the page lists the
 * ones that lasted. The number is small on purpose: an outage of four minutes
 * is still an outage, and a threshold high enough to look tidy is how a status
 * page starts under-reporting.
 */
export const MIN_FAILS = 3;

/**
 * How recently an outage must have ended for the headline to still call the
 * site degraded. An hour.
 *
 * Something that failed twenty minutes ago and is working now is not "working"
 * to somebody who was turned away by it, and it is not "down" either. This is
 * the window in which the page keeps saying so.
 */
export const RECENT_MS = 60 * 60 * 1000;

/* -------------------------------------------------------------------------
 * The English copy
 * ---------------------------------------------------------------------- */

/**
 * A string from the dictionary the browser also reads.
 *
 * The server has no locale to render in: this page is readable with no
 * JavaScript, and the reader's language lives in their own localStorage. So it
 * renders English from `en.json` and marks every element with the `data-i18n`
 * key it came from, and `i18n.js` swaps the text when there is a browser with a
 * dictionary. **The literal and the dictionary cannot drift**, because there is
 * only the dictionary.
 */
export function en(key, vars) {
  // The dictionaries are flat: the dots are part of the key, not a path. Same
  // lookup `t()` does in assets/js/i18n.js, and a key with no entry renders as
  // itself there too, which is loud rather than blank.
  const value = EN[key];
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

/** An element carrying its own key, so the browser can translate it in place. */
function line(tag, key, { className = null, vars = null, attrs = '' } = {}) {
  const classAttr = className ? ` class="${escapeAttr(className)}"` : '';
  // A string with interpolation in it cannot be swapped by `data-i18n`, which
  // sets textContent from the key alone. Those are rendered in English and left
  // that way rather than marked with a key that would erase the numbers in
  // them; where that would matter the number is put in its own element instead.
  const key18n = vars ? '' : ` data-i18n="${escapeAttr(key)}"`;
  return `<${tag}${classAttr}${key18n}${attrs ? ` ${attrs}` : ''}>${escapeHtml(en(key, vars))}</${tag}>`;
}

/* -------------------------------------------------------------------------
 * Uptime, from rows to days
 * ---------------------------------------------------------------------- */

/** The UTC date a timestamp falls on, as `YYYY-MM-DD`. */
export function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** The last `days` UTC dates, oldest first, ending on the day `now` falls in. */
export function dayWindow(now, days = DAYS) {
  const end = new Date(now instanceof Date ? now.getTime() : new Date(now).getTime());
  const out = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = new Date(end.getTime() - back * 24 * 60 * 60 * 1000);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * One day cell's state.
 *
 * Four outcomes and each is a different claim. `unknown` is the important one
 * and it is not a failure: nothing was measured, and the page says so rather
 * than filling the gap with either colour.
 */
export function dayState({ total, failed, expected = EXPECTED_PER_DAY }) {
  if (total === 0) return 'unknown';
  if (failed === total) return 'down';
  if (failed > 0) return 'degraded';
  // A failure seen is a failure whatever the coverage, which is why this comes
  // last: partial only ever softens a clean day, never a bad one.
  if (total < expected * MIN_COVERAGE) return 'partial';
  return 'up';
}

/**
 * Ninety days of one target, plus the sentence underneath it.
 *
 * **The input is a day per row, not a check per row.** `gftvjobs_status_days`
 * is written that way — the probe's cycle adds to counters through migration
 * 037's function rather than storing itself — so this reads 360 rows to draw
 * 360 squares. Decision 23.
 *
 * **The percentage is never printed alone**, per 0c: "99.9% over 90 days" from
 * 60 days of data is a fabrication with a decimal point on it. What comes back
 * carries the days with no data and the number of checks the figure was
 * computed from, and the renderer prints all three or none of them.
 *
 * @param {Array<{ day: string, checks: number, failures: number,
 *   duration_total_ms?: number, slowest_ms?: number }>} rows one target's daily
 *   rows. A day the probe never wrote is absent, and stays that way: it becomes
 *   an `unknown` cell rather than a zeroed one.
 * @param {{ now?: Date|string, days?: number, expected?: number }} [options]
 */
export function uptimeFor(rows, { now = new Date(), days = DAYS, expected = EXPECTED_PER_DAY } = {}) {
  const window = dayWindow(now, days);
  const inWindow = new Set(window);

  const totals = new Map(window.map((day) => [day, { total: 0, failed: 0 }]));
  let durationTotal = 0;
  let slowest = null;

  for (const row of rows ?? []) {
    // The table answers a date; a caller passing a timestamp is reduced to the
    // same UTC day rather than dropped, so a fixture and the deployment agree.
    const day = String(row?.day ?? '').length === 10 ? String(row.day) : utcDay(row?.day);
    if (!day || !inWindow.has(day)) continue;
    const cell = totals.get(day);
    cell.total += Number(row.checks) || 0;
    cell.failed += Number(row.failures) || 0;
    durationTotal += Number(row.duration_total_ms) || 0;
    if (Number.isFinite(Number(row.slowest_ms))) {
      slowest = Math.max(slowest ?? 0, Number(row.slowest_ms));
    }
  }

  const cells = window.map((day) => {
    const { total, failed } = totals.get(day);
    return { day, total, failed, state: dayState({ total, failed, expected }) };
  });

  const checks = cells.reduce((sum, cell) => sum + cell.total, 0);
  const failures = cells.reduce((sum, cell) => sum + cell.failed, 0);
  const noData = cells.filter((cell) => cell.state === 'unknown').length;

  return {
    cells,
    checks,
    failures,
    noData,
    // Null rather than 100 when nothing was measured. A percentage over no
    // checks is the same fabrication as one over a period with gaps, and this
    // build's rule for a number it could not establish is that it is absent.
    percent: checks === 0 ? null : Math.round(((checks - failures) / checks) * 10000) / 100,
    // Section 15 asks for the duration to be recorded, and decision 23 records
    // it as a sum rather than a row per request. This is what gives that sum a
    // reader: an average over the window, and the worst single answer in it.
    // Both are null when nothing was measured, for the same reason as above.
    averageMs: checks === 0 || durationTotal === 0 ? null : Math.round(durationTotal / checks),
    slowestMs: slowest,
  };
}

/* -------------------------------------------------------------------------
 * The headline
 * ---------------------------------------------------------------------- */

/**
 * The one sentence and the one colour at the top, derived and never typed.
 *
 * Order matters and is the whole of the argument:
 *
 *   **`unknown` comes first.** If nothing has been heard from the probe inside
 *   STALE_MS then this page does not know the state of anything, and no amount
 *   of old green rows changes that.
 *
 *   **Then what the probe saw**, because a portal answering 500 is worse news
 *   than a feature an admin switched off on purpose.
 *
 *   **Then what an admin declared**, which is degraded rather than down: a
 *   feature is off, the rest of the site is working, and the note says why.
 *
 * @param {{ lastSeen?: string|null,
 *           incidents?: Array<{ target: string, started_at: string, last_failed_at: string,
 *                               ended_at: string|null }>,
 *           off?: string[], now?: Date }} input
 *   `lastSeen` is the newest `last_checked_at` across every target, which is
 *   the whole of what this page knows about its own freshness.
 */
export function headline({ lastSeen = null, incidents = [], off = [], now = new Date() } = {}) {
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const seen = lastSeen ? new Date(lastSeen).getTime() : NaN;

  if (!Number.isFinite(seen) || at - seen > STALE_MS) return { state: 'unknown', off: off.length };

  const failingNow = incidents.some(
    (incident) => !incident.ended_at && at - new Date(incident.last_failed_at).getTime() <= STALE_MS
  );
  if (failingNow) return { state: 'down', off: off.length };

  const troubledRecently = incidents.some((incident) => {
    const when = new Date(incident.ended_at ?? incident.last_failed_at).getTime();
    return Number.isFinite(when) && at - when <= RECENT_MS;
  });
  if (troubledRecently) return { state: 'degraded', off: off.length };

  if (off.length > 0) return { state: 'maintenance', off: off.length };

  // Everything answered and nothing is switched off. This is the only branch
  // that may say so, and it is the last one on purpose.
  return { state: 'ok', off: 0 };
}

/**
 * The callout tone each headline state is drawn in. The four modifiers
 * `theme.css` actually carries, and no fifth invented here.
 *
 * `unknown` is `note` rather than `warn` deliberately: not knowing is not the
 * same as something being wrong, and colouring it as a fault would make the
 * page cry wolf every time the VPS was restarted.
 */
export const HEADLINE_TONE = Object.freeze({
  ok: 'ok',
  maintenance: 'warn',
  degraded: 'warn',
  down: 'danger',
  unknown: 'note',
});

/* -------------------------------------------------------------------------
 * Incidents
 * ---------------------------------------------------------------------- */

/**
 * The outages somebody declared, paired from the audit log.
 *
 * 8.12 has written both directions since phase 8 for exactly this: an outage
 * nobody recorded the end of is one nobody can measure. A `feature_disabled`
 * row opens an incident and the next `feature_enabled` for the same feature
 * closes it; one still open is reported as still open rather than given an end.
 *
 * @param {Array<{ action: string, created_at: string, metadata?: object }>} rows
 *   newest first or oldest first, either way — they are sorted here.
 */
export function declaredIncidents(rows = []) {
  const ordered = [...rows]
    .filter((row) => row?.action === 'feature_disabled' || row?.action === 'feature_enabled')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const open = new Map();
  const out = [];

  for (const row of ordered) {
    const feature = row.metadata?.feature;
    if (typeof feature !== 'string' || feature === '') continue;

    if (row.action === 'feature_disabled') {
      // A second disable with no enable between them is the same outage being
      // re-noted, not a new one. Keeping the first start is what makes the
      // duration the length of the outage rather than the length of the last
      // edit to its note.
      if (!open.has(feature)) {
        open.set(feature, { feature, note: row.metadata?.note ?? null, start: row.created_at, end: null });
      } else if (row.metadata?.note) {
        open.get(feature).note = row.metadata.note;
      }
      continue;
    }

    const incident = open.get(feature);
    if (!incident) continue; // An enable with no disable before it, from before this log.
    incident.end = row.created_at;
    open.delete(feature);
    out.push(incident);
  }

  for (const incident of open.values()) out.push(incident);

  return out
    .map((incident) => ({
      ...incident,
      durationMs: incident.end ? new Date(incident.end) - new Date(incident.start) : null,
    }))
    .sort((a, b) => new Date(b.start) - new Date(a.start));
}

/**
 * The outages nobody declared, from the probe's own incident rows.
 *
 * 0c: "These are the ones worth having, because they are the outages nobody was
 * awake for."
 *
 * **An incident is a row, not a reconstruction.** Migration 037's function
 * opens one on the first failed check, extends it on each failure after that,
 * and closes it with the first check that succeeds — so the end is *observed*
 * and the duration is the real one rather than the span of failures that
 * happened to be seen. Decision 23, and it is the half of that decision that
 * made the page more truthful rather than only cheaper.
 *
 * **Three endings, not two.** An incident with an `ended_at` ended. One still
 * open whose last failure is recent is happening now. One still open whose last
 * failure is older than STALE_MS is neither: the probe stopped writing during
 * it, and what this page can honestly say is that it stopped hearing. Reporting
 * that third case as ongoing would claim knowledge of the present from a row
 * that stopped being updated hours ago, which is the failure 0c is written
 * against.
 *
 * @param {Array<{ target: string, started_at: string, last_failed_at: string,
 *                 ended_at: string|null, failures: number, status_code: number|null }>} rows
 * @param {{ now?: Date, minFails?: number }} [options]
 */
export function observedIncidents(rows = [], { now = new Date(), minFails = MIN_FAILS } = {}) {
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();

  return rows
    // A single failed check is a blip, and a list of blips is a list nobody
    // reads. The row is still written — a blip that turns out to be the start
    // of something is the row somebody wants afterwards — and this is where it
    // is decided that it lasted long enough to be worth a line.
    .filter((row) => Number(row?.failures ?? 0) >= minFails)
    .map((row) => {
      const lastFailed = new Date(row.last_failed_at).getTime();
      const state = row.ended_at ? 'ended' : at - lastFailed <= STALE_MS ? 'ongoing' : 'stalled';

      return {
        target: row.target,
        start: row.started_at,
        end: row.ended_at ?? null,
        lastFailure: row.last_failed_at,
        state,
        ongoing: state === 'ongoing',
        checks: Number(row.failures ?? 0),
        codes: Number.isInteger(row.status_code) ? [row.status_code] : [],
        // Measured to the observed end where there is one, and to the last
        // failure otherwise, which is a floor and is labelled as one.
        durationMs:
          state === 'ongoing' ? null : new Date(row.ended_at ?? row.last_failed_at) - new Date(row.started_at),
      };
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start));
}

/* -------------------------------------------------------------------------
 * Formatting
 * ---------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A timestamp a reader can read, in UTC.
 *
 * UTC and said out loud, because the server cannot know the reader's timezone
 * and a time with no zone on it is a time in somebody else's afternoon. The
 * machine readable half goes in the `datetime` attribute beside it.
 */
export function stamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

/** A duration in whole minutes and hours. Nothing here needs seconds. */
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return en('serviceStatus.minutes', { count: minutes });
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours < 48) return en('serviceStatus.hours', { count: hours });
  return en('serviceStatus.days', { count: Math.round(hours / 24) });
}

function time(value) {
  const readable = stamp(value);
  if (!readable) return escapeHtml(en('serviceStatus.unknownTime'));
  return `<time datetime="${escapeAttr(new Date(value).toISOString())}">${escapeHtml(readable)}</time>`;
}

/* -------------------------------------------------------------------------
 * The service page
 * ---------------------------------------------------------------------- */

/**
 * The service status page's body.
 *
 * Pure: everything it draws is in `model`, so the phase file renders it from
 * fixtures and measures the markup rather than a deployment.
 *
 * @param {{
 *   now: Date,
 *   headline: { state: string, off: number },
 *   components: Array<{ key: string, off: boolean, note: string|null, since: string|null, denied: boolean, reason: string|null }>,
 *   uptime: Array<{ target: string, percent: number|null, checks: number, failures: number, noData: number, cells: object[] }>,
 *   declared: object[],
 *   observed: object[],
 *   probeLastSeen: string|null
 * }} model
 */
export function renderServiceBody(model) {
  const tone = HEADLINE_TONE[model.headline.state] ?? 'note';

  return `<main class="page page-narrow" id="main">
        <div class="page-header">
            ${line('h1', 'serviceStatus.heading')}
            ${line('p', 'serviceStatus.lede', { className: 'lede' })}
        </div>

        <!-- Derived, never typed by hand, so it cannot disagree with the panels
             beneath it. The unknown state is the one that matters: it is what
             this page says when the probe has gone quiet, rather than reading
             an empty recent window as good news. -->
        <div class="callout ${escapeAttr(tone)} status-headline" role="status">
            ${line('h2', `serviceStatus.headline.${model.headline.state}`)}
            <p class="muted">${escapeHtml(en('serviceStatus.measuredAt'))} ${
              model.probeLastSeen ? time(model.probeLastSeen) : escapeHtml(en('serviceStatus.noProbeYet'))
            }</p>
        </div>

        <section class="glass-card card status-panel" aria-labelledby="statusComponents">
            <h2 id="statusComponents" data-i18n="serviceStatus.componentsHeading">${escapeHtml(
              en('serviceStatus.componentsHeading')
            )}</h2>
            ${line('p', 'serviceStatus.componentsLede', { className: 'muted' })}
            <ul class="status-components">
                ${model.components.map(renderComponent).join('\n                ')}
            </ul>
        </section>

        <section class="glass-card card status-panel" aria-labelledby="statusUptime">
            <h2 id="statusUptime" data-i18n="serviceStatus.uptimeHeading">${escapeHtml(
              en('serviceStatus.uptimeHeading')
            )}</h2>
            ${line('p', 'serviceStatus.uptimeLede', { className: 'muted' })}
            ${model.uptime.map(renderUptime).join('\n            ')}
            <ul class="status-legend">
                ${['up', 'degraded', 'down', 'partial', 'unknown']
                  .map(
                    (state) =>
                      `<li><span class="status-day" data-state="${state}" aria-hidden="true"></span>` +
                      `<span data-i18n="serviceStatus.day.${state}">${escapeHtml(
                        en(`serviceStatus.day.${state}`)
                      )}</span></li>`
                  )
                  .join('\n                ')}
            </ul>
        </section>

        <section class="glass-card card status-panel" aria-labelledby="statusIncidents">
            <h2 id="statusIncidents" data-i18n="serviceStatus.incidentsHeading">${escapeHtml(
              en('serviceStatus.incidentsHeading')
            )}</h2>
            ${line('p', 'serviceStatus.incidentsLede', { className: 'muted' })}
            ${renderIncidents(model)}
        </section>

        <div class="glass-card card">
            ${line('h2', 'serviceStatus.aboutHeading')}
            ${line('p', 'serviceStatus.aboutBody')}
        </div>
    </main>`;
}

function renderComponent(component) {
  // Three states rather than two, and the third is not "off". A denylisted
  // feature is one nobody can switch off, and 8.12's rule is that it is shown
  // with the reason rather than hidden: a reader looking for it finds out why
  // there is no switch instead of concluding the list is short.
  const state = component.denied ? 'always' : component.off ? 'off' : 'on';

  const note = component.off && component.note ? `<p class="status-note">${escapeHtml(component.note)}</p>` : '';
  const since =
    component.off && component.since
      ? `<p class="muted small">${escapeHtml(en('serviceStatus.offSince'))} ${time(component.since)}</p>`
      : '';

  return `<li class="status-component" data-state="${escapeAttr(state)}">
                    <span class="status-component-name" data-i18n="featureName.${escapeAttr(
                      component.key
                    )}">${escapeHtml(en(`featureName.${component.key}`))}</span>
                    <span class="status-pill" data-state="${escapeAttr(
                      state
                    )}" data-i18n="serviceStatus.state.${state}">${escapeHtml(
                      en(`serviceStatus.state.${state}`)
                    )}</span>
                    ${note}${since}
                </li>`;
}

function renderUptime(row) {
  // One label a screen reader can act on, rather than ninety focusable squares
  // that say nothing individually. The sentence under the bar carries the same
  // numbers in text, so nothing is only available as colour.
  const summary =
    row.percent === null
      ? en('serviceStatus.uptimeNone')
      : en('serviceStatus.uptimeSummary', {
          percent: row.percent.toFixed(2),
          checks: row.checks.toLocaleString('en'),
          days: DAYS,
        });

  const gaps = row.noData > 0 ? ` ${en('serviceStatus.uptimeGaps', { days: row.noData })}` : '';

  // Section 15 asks for the response time to be recorded, and decision 23
  // records it as a running sum rather than a row per check. This is the reader
  // that keeps those two columns from being a field nobody looks at. Absent
  // entirely when nothing was measured, rather than printed as zero.
  const response =
    row.averageMs === null
      ? ''
      : ` ${en('serviceStatus.response', { average: row.averageMs, slowest: row.slowestMs ?? row.averageMs })}`;

  return `<div class="status-uptime">
                <h3 class="status-target" data-i18n="serviceStatus.target.${escapeAttr(
                  row.target
                )}">${escapeHtml(en(`serviceStatus.target.${row.target}`))}</h3>
                <div class="status-bar" role="img" tabindex="0" aria-label="${escapeAttr(`${summary}${gaps}`)}">
                    ${row.cells
                      .map(
                        (cell) =>
                          `<span class="status-day" data-state="${escapeAttr(cell.state)}" title="${escapeAttr(
                            `${cell.day}: ${
                              cell.total === 0
                                ? en('serviceStatus.day.unknown')
                                : en('serviceStatus.dayCounts', { checks: cell.total, failures: cell.failed })
                            }`
                          )}"></span>`
                      )
                      .join('')}
                </div>
                <p class="muted small">${escapeHtml(`${summary}${gaps}${response}`)}</p>
            </div>`;
}

function renderIncidents(model) {
  const declared = model.declared ?? [];
  const observed = model.observed ?? [];

  if (declared.length === 0 && observed.length === 0) {
    return line('p', 'serviceStatus.incidentsNone');
  }

  const parts = [];

  if (declared.length > 0) {
    parts.push(`<h3 data-i18n="serviceStatus.declaredHeading">${escapeHtml(
      en('serviceStatus.declaredHeading')
    )}</h3>
            <ul class="status-incidents">
                ${declared
                  .map((incident) => {
                    const ended = incident.end
                      ? `${escapeHtml(en('serviceStatus.until'))} ${time(incident.end)}` +
                        (incident.durationMs !== null
                          ? ` <span class="muted">(${escapeHtml(duration(incident.durationMs))})</span>`
                          : '')
                      : `<strong>${escapeHtml(en('serviceStatus.stillOff'))}</strong>`;

                    return `<li>
                    <span class="status-incident-name" data-i18n="featureName.${escapeAttr(
                      incident.feature
                    )}">${escapeHtml(en(`featureName.${incident.feature}`))}</span>
                    <p class="muted small">${time(incident.start)} ${ended}</p>
                    ${incident.note ? `<p class="status-note">${escapeHtml(incident.note)}</p>` : ''}
                </li>`;
                  })
                  .join('\n                ')}
            </ul>`);
  }

  if (observed.length > 0) {
    parts.push(`<h3 data-i18n="serviceStatus.observedHeading">${escapeHtml(
      en('serviceStatus.observedHeading')
    )}</h3>
            ${line('p', 'serviceStatus.observedLede', { className: 'muted small' })}
            <ul class="status-incidents">
                ${observed
                  .map((incident) => {
                    // **Three endings, and the wording is the difference
                    // between them.** An observed end is an end and says
                    // "until"; an open incident with a recent failure is
                    // happening now; an open incident nothing has written to
                    // for a quarter of an hour is one the probe stopped
                    // hearing during, and calling that one ongoing would be
                    // the page claiming to know the present from a stale row.
                    const length =
                      incident.durationMs === null
                        ? ''
                        : ` <span class="muted">(${escapeHtml(
                            incident.state === 'stalled'
                              ? en('serviceStatus.atLeast', { duration: duration(incident.durationMs) })
                              : duration(incident.durationMs)
                          )})</span>`;

                    const ended =
                      incident.state === 'ongoing'
                        ? `<strong>${escapeHtml(en('serviceStatus.stillFailing'))}</strong>`
                        : incident.state === 'stalled'
                          ? `${escapeHtml(en('serviceStatus.lastFailure'))} ${time(incident.lastFailure)}` +
                            length +
                            ` <strong>${escapeHtml(en('serviceStatus.stalled'))}</strong>`
                          : `${escapeHtml(en('serviceStatus.until'))} ${time(incident.end)}` + length;

                    const codes =
                      incident.codes.length > 0
                        ? en('serviceStatus.withCodes', { codes: incident.codes.join(', ') })
                        : en('serviceStatus.noAnswer');

                    return `<li>
                    <span class="status-incident-name" data-i18n="serviceStatus.target.${escapeAttr(
                      incident.target
                    )}">${escapeHtml(en(`serviceStatus.target.${incident.target}`))}</span>
                    <p class="muted small">${time(incident.start)} ${ended}</p>
                    <p class="muted small">${escapeHtml(codes)}</p>
                </li>`;
                  })
                  .join('\n                ')}
            </ul>`);
  }

  return parts.join('\n            ');
}

/* -------------------------------------------------------------------------
 * The build page
 * ---------------------------------------------------------------------- */

/**
 * The page as it has been since phase 1, moved from `main-site/status/index.html`
 * and otherwise untouched.
 *
 * **It had to move for the gate to exist.** Vercel matches the filesystem before
 * it consults rewrites — phase 3's rule, and the thing that made part 5 delete
 * the static `robots.txt` — so a `status/index.html` on disk would win over the
 * rewrite and `viewFor()` would be decoration. The markup is the same markup and
 * `status-page.js` still fills it; what changed is which side of the wire it is
 * assembled on.
 */
export function renderBuildBody() {
  return `<main class="page page-narrow" id="main">
        <div class="page-header">
            <h1 data-i18n="status.heading">Build status</h1>
            <p class="lede" data-i18n="status.lede">
                Careers@GFTV is being built and released in phases, in public.
                This page lists every phase, what it covers, and whether it is
                live yet. It doubles as the changelog.
            </p>
        </div>

        <!-- Filled by status-page.js, which redraws it on a language change.
             role=status announces the summary when it lands, without stealing
             focus from whatever the reader is doing. -->
        <div class="callout note" id="statusSummary" role="status" data-i18n="status.loading">
            Loading the current status.
        </div>

        <!-- 8.12's outage notice. Filled by status-page.js from
             /api/public/feature-status and hidden entirely when nothing is
             switched off, which is almost always. It sits above the phase list
             instead of inside it because it is a different kind of fact: the
             list says what has been built, this says what is working today. -->
        <div class="callout warn" id="statusOutages" role="status" hidden></div>

        <!-- Skeleton placeholders, replaced by the real phases. The count is
             arbitrary but the shape is not: matching the real card stops the
             page jumping when the data arrives. aria-busy tells a screen
             reader this is not the content yet. -->
        <ol class="phase-list stack" id="phaseList" aria-busy="true"
            style="margin-top: 1.5rem;">
            <li class="glass-card phase-item delayed" aria-hidden="true">
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line long"></div>
                <div class="skeleton skeleton-line short"></div>
            </li>
            <li class="glass-card phase-item delayed" aria-hidden="true">
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line long"></div>
            </li>
            <li class="glass-card phase-item delayed" aria-hidden="true">
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line long"></div>
                <div class="skeleton skeleton-line short"></div>
            </li>
        </ol>

        <div class="glass-card card" style="margin-top: 2rem;">
            <h2 data-i18n="status.datesHeading">About the dates</h2>
            <p data-i18n="status.datesBody">
                There are none, and none are promised. A phase ships when it
                works, not on a date announced in advance. What this page does
                promise is that nothing is shown as available before it is, and
                that a feature which has not shipped says so on the control
                itself and does not quietly fail.
            </p>
        </div>

        <noscript>
            <div class="callout warn" style="margin-top: 1.5rem;">
                This page reads the live status file, so it needs JavaScript.
                The raw file is at
                <a href="/assets/build-status.json">/assets/build-status.json</a>.
            </div>
        </noscript>
    </main>`;
}

/* -------------------------------------------------------------------------
 * The document
 * ---------------------------------------------------------------------- */

/**
 * The whole page, either view.
 *
 * **The service view loads no module of its own**, per 0c: "Keep it readable
 * with no JavaScript and no session." `shell.js` is still there — it is the
 * header, the footer, the theme and the language, which every page on this site
 * has — and everything the page says is in the markup before it runs. Turn
 * JavaScript off and the page is the same page in English.
 *
 * @param {{ view: string, body: string, phase?: object|null }} input
 */
export function statusDocument({ view, body }) {
  const service = view === VIEW.service;

  return renderDocument({
    title: en(service ? 'serviceStatus.pageTitle' : 'status.pageTitle'),
    description: en(service ? 'serviceStatus.metaDescription' : 'status.metaDescription'),
    canonicalPath: '/status',
    ogType: 'website',
    modules: service ? ['/assets/js/shell.js'] : ['/assets/js/shell.js', '/assets/js/status-page.js'],
    bodyHtml: body,
  });
}
