// /admin/analytics. Section 8.4.
//
// A sortable table across every posting, a detail panel per posting with a
// chart over time, and a CSV export. The counting is migration 033's, the
// judgements are api/_lib/analytics.js's, and this file draws them.
//
// Three things about the drawing are decisions, not style:
//
//   **The floor sentence is on the page, not in a tooltip.** Every number in
//   the yes column depends on somebody having told us they applied, and nobody
//   is chased for an answer. A conversion rate presented without that is a
//   number people will quote.
//
//   **A rate of null is not a rate of zero.** A posting nobody has clicked
//   Apply on shows a dash. Zero per cent is a finding about a posting people
//   tried and abandoned, and the two must not look the same in a column
//   somebody is scanning for problems.
//
//   **The chart is three lines and a legend, and it says which timezone its
//   days are in.** Migration 033 groups by UTC, which is how created_at is
//   stored. Drawing that as though it were local time would shift eight hours
//   of clicks onto the neighbouring day for a reader in Singapore.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminMessage, emptyRow, runAction } from './admin-shell.js';

const PATH = '/admin/analytics';

const STATUSES = ['draft', 'published', 'closed', 'archived'];

/**
 * The sorts the table offers, in the order they are useful and not the
 * order the endpoint lists them: what an admin comes here to find is the
 * posting that is not working.
 */
const SORTS = ['views', 'apply_clicks', 'answered_yes', 'yes_rate', 'rating_average', 'published_at', 'title'];

/**
 * The three series, in fixed order, each tied to its own colour token.
 *
 * Fixed means a series keeps its colour whatever else is drawn, which is what
 * lets two postings' charts be compared without reading both legends. The
 * tokens are defined per mode in theme.css and are deliberately not the site's
 * status colours.
 */
const SERIES = [
  { key: 'views', token: '--chart-1', labelKey: 'admin.seriesViews' },
  { key: 'apply_clicks', token: '--chart-2', labelKey: 'admin.seriesClicks' },
  { key: 'answered_yes', token: '--chart-3', labelKey: 'admin.seriesYes' },
];

let payload = null;
let state = { status: '', sort: 'views', direction: 'desc', page: 1 };

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  fillFilters();
  readStateFromUrl();
  applyStateToFilters();

  document.querySelector('#analyticsFilters')?.addEventListener('change', () => {
    state.status = document.querySelector('#statusFilter').value;
    state.sort = document.querySelector('#sortBy').value;
    state.direction = document.querySelector('#sortDirection').value;
    state.page = 1;
    writeStateToUrl();
    runAction(load, 'analytics load');
  });

  document.querySelector('#analyticsFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  document.querySelector('#exportCsv')?.addEventListener('click', () => {
    // A real navigation instead of a fetch, so the browser handles the file
    // exactly as it would any download. The same query the table is showing, so
    // the export is the filtered set and not the page, per 8.3's rule.
    window.location.href = `/api/admin/analytics?${query({ format: 'csv' })}`;
  });

  await load();

  document.addEventListener('gftv:localechange', () => {
    fillFilters();
    applyStateToFilters();
    draw();
  });
}

/* -------------------------------------------------------------------------
 * Filters and the address bar
 * ---------------------------------------------------------------------- */

function fillFilters() {
  const status = document.querySelector('#statusFilter');
  if (status) {
    status.innerHTML =
      `<option value="">${escapeHtml(t('admin.anyStatus'))}</option>` +
      STATUSES.map(
        (value) =>
          `<option value="${value}">${escapeHtml(t(`admin.jobStatus_${value}`))}</option>`
      ).join('');
  }

  const sort = document.querySelector('#sortBy');
  if (sort) {
    sort.innerHTML = SORTS.map(
      (value) => `<option value="${value}">${escapeHtml(t(`admin.sort_${value}`))}</option>`
    ).join('');
  }
}

function applyStateToFilters() {
  const status = document.querySelector('#statusFilter');
  const sort = document.querySelector('#sortBy');
  const direction = document.querySelector('#sortDirection');

  if (status) status.value = state.status;
  if (sort) sort.value = state.sort;
  if (direction) direction.value = state.direction;
}

/**
 * The filters live in the address bar, like the board's own.
 *
 * Same reason section 4 gives for /search: a link somebody sends a colleague
 * opens what they were looking at. history.replaceState over pushState,
 * so changing a sort does not fill the back button with steps nobody wants to
 * walk back through.
 */
function readStateFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const status = search.get('status');
  const sort = search.get('sort');

  state = {
    status: STATUSES.includes(status) ? status : '',
    sort: SORTS.includes(sort) ? sort : 'views',
    direction: search.get('direction') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(search.get('page')) || 1),
  };
}

function writeStateToUrl() {
  const search = new URLSearchParams(query());
  window.history.replaceState({}, '', `${PATH}?${search.toString()}`);
}

function query(extra = {}) {
  const search = new URLSearchParams();
  if (state.status) search.set('status', state.status);
  search.set('sort', state.sort);
  search.set('direction', state.direction);
  if (state.page > 1) search.set('page', String(state.page));
  for (const [key, value] of Object.entries(extra)) search.set(key, value);
  return search.toString();
}

/* -------------------------------------------------------------------------
 * The table
 * ---------------------------------------------------------------------- */

async function load() {
  const result = await api(`/api/admin/analytics?${query()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  draw();
}

function draw() {
  const list = document.querySelector('#analyticsList');
  if (!list || !payload) return;

  const jobs = payload.jobs ?? [];

  if (jobs.length === 0) {
    list.innerHTML = emptyRow(t('admin.noAnalytics'));
    drawPager();
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colPosting'))}</th>
          <th scope="col" class="tabular">${escapeHtml(t('admin.colViews'))}</th>
          <th scope="col" class="tabular">${escapeHtml(t('admin.colClicks'))}</th>
          <th scope="col" class="tabular">${escapeHtml(t('admin.colYes'))}</th>
          <th scope="col" class="tabular">${escapeHtml(t('admin.colRate'))}</th>
          <th scope="col" class="tabular">${escapeHtml(t('admin.colRating'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${jobs.map(rowMarkup).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('[data-job-id]').forEach((row) => {
    const id = row.getAttribute('data-job-id');
    row.querySelector('[data-detail]')?.addEventListener('click', () => {
      runAction(() => openDetail(id), 'analytics detail');
    });
  });

  drawPager();
}

function rowMarkup(job) {
  return `
    <tr data-job-id="${escapeHtml(job.job_id)}">
      <td>
        <span class="admin-row-title">${escapeHtml(job.title)}</span>
        <span class="admin-sub muted">${escapeHtml(t(`admin.jobStatus_${job.status}`))}</span>
      </td>
      <td class="tabular">${job.views}</td>
      <td class="tabular">${job.apply_clicks}</td>
      <td class="tabular">${job.answered_yes}</td>
      <td class="tabular">${rateMarkup(job)}</td>
      <td class="tabular">${ratingMarkup(job)}</td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-quiet small" data-detail>
          ${escapeHtml(t('admin.viewDetail'))}
        </button>
      </td>
    </tr>`;
}

/**
 * The rate, or a dash, or a flag.
 *
 * The flag is 8.4's: "Flag any job with a high click count and a low yes rate,
 * since that usually means a broken or closed Google Form rather than a bad
 * posting." It is a word and an icon in place of a red cell, so a reader who
 * cannot see the colour gets the same warning, and it carries the reason as its
 * title without making somebody guess what the site is objecting to.
 */
function rateMarkup(job) {
  if (job.yes_rate === null) {
    return `<span class="muted" title="${escapeHtml(t('admin.noClicksYet'))}">&mdash;</span>`;
  }

  const percent = `${Math.round(job.yes_rate * 100)}%`;

  if (!job.needs_attention) return escapeHtml(percent);

  const why = t('admin.checkFormWhy', {
    clicks: payload.rules?.flag_min_clicks ?? 5,
    rate: Math.round((payload.rules?.flag_max_rate ?? 0.2) * 100),
  });

  return (
    `<span class="admin-flag" title="${escapeHtml(why)}">` +
    `${escapeHtml(percent)} <span class="badge badge-warn">${escapeHtml(
      t('admin.checkForm')
    )}</span></span>`
  );
}

/**
 * The rating, suppressed below three, per 8.4.
 *
 * The count is still shown when the average is not, because "two people rated
 * this" is useful and "3.0 from one person" is a verdict nobody voted for. The
 * server suppresses it as well: the average is not in the payload at all below
 * the floor, so this cannot show it by mistake.
 */
function ratingMarkup(job) {
  if (job.rating_count === 0) return `<span class="muted">&mdash;</span>`;

  if (job.rating_average === null) {
    return `<span class="muted" title="${escapeHtml(
      t('admin.ratingSuppressed', { minimum: payload.rules?.rating_minimum ?? 3 })
    )}">${escapeHtml(t('admin.ratingCountOnly', { count: job.rating_count }))}</span>`;
  }

  return `${job.rating_average.toFixed(1)} <span class="muted">(${job.rating_count})</span>`;
}

function drawPager() {
  const holder = document.querySelector('#analyticsPager');
  if (!holder) return;

  const pages = payload?.pages ?? 1;

  if (pages <= 1) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = `
    <button type="button" class="btn btn-quiet small" data-page="prev"
            ${state.page <= 1 ? 'disabled' : ''}>${escapeHtml(t('search.previous'))}</button>
    <span class="muted tabular">${escapeHtml(
      t('admin.pageOf', { page: state.page, pages })
    )}</span>
    <button type="button" class="btn btn-quiet small" data-page="next"
            ${state.page >= pages ? 'disabled' : ''}>${escapeHtml(t('search.next'))}</button>`;

  holder.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.page += button.getAttribute('data-page') === 'next' ? 1 : -1;
      writeStateToUrl();
      runAction(load, 'analytics page');
    });
  });
}

/* -------------------------------------------------------------------------
 * The detail panel
 * ---------------------------------------------------------------------- */

async function openDetail(jobId) {
  const result = await api(`/api/admin/analytics?job=${encodeURIComponent(jobId)}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  const { job, series, series_timezone: timezone } = result.data;

  const dialog = createDialog({
    id: 'analyticsDetail',
    titleKey: 'admin.analyticsDetailTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="admin-row-title">${escapeHtml(job.title)}</p>

        ${funnelMarkup(job)}

        <h3 class="admin-chart-heading">${escapeHtml(
          t('admin.chartHeading', { days: series.length })
        )}</h3>
        ${chartMarkup(series)}
        <p class="field-hint">${escapeHtml(t('admin.chartTimezone', { timezone }))}</p>
        ${dailyTableMarkup(series)}

        <div class="modal-actions">
          <a class="btn btn-quiet" href="/jobs/${escapeHtml(job.job_id)}"
             target="_blank" rel="noopener">${escapeHtml(t('admin.openPosting'))}</a>
          <button type="button" class="btn btn-primary" data-close-dialog>${escapeHtml(
            t('common.close')
          )}</button>
        </div>
      </div>`,
  });

  wireChart(dialog.element, series);
  dialog.open();
}

/**
 * The funnel as numbers.
 *
 * This is also the chart's table view: every series on the chart is a column
 * here, so nothing on this panel is available only as a picture.
 */
function funnelMarkup(job) {
  const rows = [
    ['admin.seriesViews', job.views],
    ['admin.seriesClicks', job.apply_clicks],
    ['admin.seriesYes', job.answered_yes],
    ['admin.funnelNo', job.answered_no],
    ['admin.funnelPending', job.pending],
    ['admin.funnelTimedOut', job.timed_out],
  ];

  return `
    <dl class="admin-funnel">
      ${rows
        .map(
          ([key, value]) => `
        <div>
          <dt>${escapeHtml(t(key))}</dt>
          <dd class="tabular">${value}</dd>
        </div>`
        )
        .join('')}
      <div>
        <dt>${escapeHtml(t('admin.colRate'))}</dt>
        <dd class="tabular">${
          job.yes_rate === null
            ? `<span class="muted">&mdash;</span>`
            : `${Math.round(job.yes_rate * 100)}%`
        }</dd>
      </div>
    </dl>

    <p class="field-hint">${escapeHtml(t('admin.yesBySource'))}</p>
    <ul class="admin-source-list">
      <li>${escapeHtml(
        t('admin.sourceWebhook', { count: job.yes_by_source.webhook })
      )}</li>
      <li>${escapeHtml(
        t('admin.sourceApplicant', { count: job.yes_by_source.applicant })
      )}</li>
      <li>${escapeHtml(t('admin.sourceAdmin', { count: job.yes_by_source.admin }))}</li>
    </ul>`;
}

/* -------------------------------------------------------------------------
 * The chart
 * ---------------------------------------------------------------------- */

// A drawing surface in its own coordinate space, scaled by the viewBox. Every
// number below is in these units, so nothing has to know how wide the dialog is.
const CHART = { width: 720, height: 240, left: 40, right: 96, top: 16, bottom: 28 };

/**
 * Three lines over time, per 8.4's "simple bar or line chart over time".
 *
 * Lines, not bars, because ninety days of grouped bars on a dialog this
 * wide is under three pixels a bar and the shape is what the reader is here
 * for. One y axis for all three series: they are counts of the same kind of
 * thing, and a second scale would make a line that is always lower look equal.
 *
 * Every series is labelled at its right end as well as in the legend, so
 * identity never rests on colour alone.
 */
function chartMarkup(series) {
  const max = Math.max(1, ...series.flatMap((day) => SERIES.map((line) => day[line.key])));
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;

  const x = (index) =>
    CHART.left + (series.length <= 1 ? 0 : (index / (series.length - 1)) * plotWidth);
  const y = (value) => CHART.top + plotHeight - (value / max) * plotHeight;

  // Four gridlines including the floor. Recessive: hairlines in the border
  // token, never in the ink the data uses.
  const ticks = [0, 0.5, 1].map((fraction) => Math.round(max * fraction));
  const uniqueTicks = [...new Set(ticks)];

  const lines = SERIES.map((line) => {
    const points = series.map((day, index) => `${x(index).toFixed(1)},${y(day[line.key]).toFixed(1)}`);
    return `<polyline class="chart-line" points="${points.join(' ')}"
                      style="stroke: var(${line.token})" />`;
  }).join('');

  // Direct labels at the right end, pushed apart when two series finish close
  // together. Without this the three labels overlap on any posting where two
  // lines end at the same value, which is most of them.
  const ends = SERIES.map((line) => ({
    line,
    value: series[series.length - 1]?.[line.key] ?? 0,
    y: y(series[series.length - 1]?.[line.key] ?? 0),
  })).sort((a, b) => a.y - b.y);

  for (let index = 1; index < ends.length; index += 1) {
    const gap = ends[index].y - ends[index - 1].y;
    if (gap < 16) ends[index].y = ends[index - 1].y + 16;
  }

  const labels = ends
    .map(
      (end) =>
        `<text class="chart-label" x="${CHART.width - CHART.right + 8}" y="${end.y.toFixed(1)}"
               style="fill: var(${end.line.token})">${escapeHtml(
                 `${t(end.line.labelKey)} ${end.value}`
               )}</text>`
    )
    .join('');

  return `
    <figure class="admin-chart" data-chart>
      <svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img"
           aria-label="${escapeHtml(t('admin.chartAlt'))}" preserveAspectRatio="xMidYMid meet">
        ${uniqueTicks
          .map(
            (value) => `
          <line class="chart-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}"
                y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}" />
          <text class="chart-axis" x="${CHART.left - 6}" y="${(y(value) + 4).toFixed(1)}"
                text-anchor="end">${value}</text>`
          )
          .join('')}

        ${lines}
        ${labels}

        <text class="chart-axis" x="${CHART.left}" y="${CHART.height - 8}">${escapeHtml(
          formatDate(series[0]?.day)
        )}</text>
        <text class="chart-axis" x="${CHART.width - CHART.right}" y="${CHART.height - 8}"
              text-anchor="end">${escapeHtml(formatDate(series[series.length - 1]?.day))}</text>

        <line class="chart-crosshair" data-crosshair y1="${CHART.top}"
              y2="${CHART.height - CHART.bottom}" x1="0" x2="0" hidden />
        ${SERIES.map(
          (line) =>
            `<circle class="chart-dot" data-dot="${line.key}" r="4.5" cx="0" cy="0"
                     style="fill: var(${line.token})" hidden />`
        ).join('')}
      </svg>

      <div class="chart-tooltip" data-tooltip hidden></div>

      <figcaption class="chart-legend">
        ${SERIES.map(
          (line) =>
            `<span><span class="chart-swatch" style="background: var(${line.token})"></span>` +
            `${escapeHtml(t(line.labelKey))}</span>`
        ).join('')}
      </figcaption>
    </figure>`;
}

/**
 * The hover layer.
 *
 * A chart in a browser is interactive whether or not anybody planned it, and a
 * ninety point line with no readout means an admin can see a spike and not find
 * out which day it was. The crosshair snaps to the nearest day and the tooltip
 * reads all three series at once, because comparing them is the question.
 *
 * Pointer events in place of mouse events, so a touch drag reads the chart the
 * same way. The listener is on the figure and not on the lines: a 2px line
 * is not a hit target.
 */
function wireChart(root, series) {
  const figure = root.querySelector('[data-chart]');
  const svg = figure?.querySelector('svg');
  const tooltip = figure?.querySelector('[data-tooltip]');
  const crosshair = figure?.querySelector('[data-crosshair]');
  if (!figure || !svg || !tooltip || !crosshair || series.length === 0) return;

  const plotWidth = CHART.width - CHART.left - CHART.right;
  const max = Math.max(1, ...series.flatMap((day) => SERIES.map((line) => day[line.key])));
  const plotHeight = CHART.height - CHART.top - CHART.bottom;

  const show = (event) => {
    const box = svg.getBoundingClientRect();
    if (box.width === 0) return;

    // Client pixels back into the viewBox's own units, which is the only place
    // this code has to know that the SVG is scaled.
    const scale = CHART.width / box.width;
    const withinPlot = (event.clientX - box.left) * scale - CHART.left;
    const fraction = Math.min(1, Math.max(0, withinPlot / plotWidth));
    const index = Math.round(fraction * (series.length - 1));
    const day = series[index];
    if (!day) return;

    const x = CHART.left + (series.length <= 1 ? 0 : (index / (series.length - 1)) * plotWidth);

    crosshair.setAttribute('x1', String(x));
    crosshair.setAttribute('x2', String(x));
    // removeAttribute, not .hidden = false. The hidden property is
    // defined on HTMLElement and not on SVGElement, so assigning it to a
    // <line> or a <circle> sets an expando nobody reads and the crosshair
    // never appears. The attribute selector in theme.css does the hiding, and
    // it applies to any element.
    crosshair.removeAttribute('hidden');

    for (const line of SERIES) {
      const dot = figure.querySelector(`[data-dot="${line.key}"]`);
      if (!dot) continue;
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(CHART.top + plotHeight - (day[line.key] / max) * plotHeight));
      dot.removeAttribute('hidden');
    }

    tooltip.innerHTML =
      `<strong>${escapeHtml(formatDate(day.day))}</strong>` +
      SERIES.map(
        (line) =>
          `<span><span class="chart-swatch" style="background: var(${line.token})"></span>` +
          `${escapeHtml(t(line.labelKey))} ${day[line.key]}</span>`
      ).join('');

    // Positioned as a percentage of the figure, so it follows the chart at any
    // width without a second coordinate system. Clamped away from both edges,
    // because the box is centred on the crosshair and would otherwise hang off
    // the side of the dialog on the first and last few days.
    const percent = Math.min(88, Math.max(12, (x / CHART.width) * 100));
    tooltip.style.left = `${percent.toFixed(2)}%`;
    tooltip.hidden = false;
  };

  const hide = () => {
    tooltip.hidden = true;
    crosshair.setAttribute('hidden', '');
    figure.querySelectorAll('[data-dot]').forEach((dot) => {
      dot.setAttribute('hidden', '');
    });
  };

  figure.addEventListener('pointermove', show);
  figure.addEventListener('pointerleave', hide);
  figure.addEventListener('pointercancel', hide);
}

/**
 * The days that had anything on them, as a table.
 *
 * Closed by default, because ninety rows under a chart is a wall. Open it and
 * every point on the chart is a number somebody can read with a screen reader,
 * copy, or check. Only the days with activity: a table of eighty empty rows
 * would hide the six that matter.
 */
function dailyTableMarkup(series) {
  const active = series.filter(
    (day) => day.views > 0 || day.apply_clicks > 0 || day.answered_yes > 0
  );

  if (active.length === 0) {
    return `<p class="muted admin-empty">${escapeHtml(t('admin.chartEmpty'))}</p>`;
  }

  return `
    <details class="admin-daily">
      <summary>${escapeHtml(t('admin.dailyTable', { count: active.length }))}</summary>
      <div class="table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th scope="col">${escapeHtml(t('admin.colDay'))}</th>
              <th scope="col" class="tabular">${escapeHtml(t('admin.seriesViews'))}</th>
              <th scope="col" class="tabular">${escapeHtml(t('admin.seriesClicks'))}</th>
              <th scope="col" class="tabular">${escapeHtml(t('admin.seriesYes'))}</th>
            </tr>
          </thead>
          <tbody>
            ${active
              .map(
                (day) => `
              <tr>
                <td>${escapeHtml(formatDate(day.day))}</td>
                <td class="tabular">${day.views}</td>
                <td class="tabular">${day.apply_clicks}</td>
                <td class="tabular">${day.answered_yes}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </details>`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
