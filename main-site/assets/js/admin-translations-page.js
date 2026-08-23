// /admin/translations. Section 8.11.
//
// The queue of everything somebody has told us reads wrongly, and the tooling to
// act on it. One queue for both origins, per 7i: a form report from the foot of
// a posting and a helper's in-place annotation land in the same table and are
// worked through the same list, distinguished by a badge rather than by a tab.
//
// What this page has to get right is not the list. It is the panel, and four
// things in it:
//
//   **The current wording sits beside the suggestion**, per 8.11, "so an admin
//   can see exactly what would change without opening the posting in another
//   tab". Both languages: the source as written, and the language being
//   complained about. A reader reporting bad Chinese is comparing it against the
//   English, and so is whoever fixes it.
//
//   **A suggestion is never applied by clicking accept.** 7h promises the
//   reporter that an admin reads it first, every time. There is a control that
//   copies the suggestion into the editing box, which is a different thing: what
//   gets saved is what is in the box when Save is pressed.
//
//   **An interface report has no editing box at all**, per 7i. It shows the
//   dictionary key and says plainly that this is a code change and a deploy.
//   Building the editor "just for the small ones" is the thing that decision
//   exists to stop.
//
//   **A resolution needs a sentence.** The database refuses fixed or rejected
//   without one, so this is not the only guard; what the page adds is saying why
//   before somebody hits it. The reporter reads that note on their own account
//   page, which is the whole reason the requirement is there.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminMessage, emptyRow, runAction, adminLocales } from './admin-shell.js';

const PATH = '/admin/translations';

/** Migration 015's statuses, in the order 8.11 walks them. */
const STATUSES = ['open', 'accepted', 'fixed', 'rejected'];

/** The two that close a report, and so will not go through without a note. */
const RESOLVED = ['fixed', 'rejected'];

/** Migration 015's target types, and 023's two origins. */
const TARGETS = ['job', 'department', 'tag', 'interface'];
const ORIGINS = ['form', 'annotation'];

let payload = null;
let state = { status: '', locale: '', target: '', origin: '', page: 1 };
let detailDialog = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  readStateFromUrl();
  drawFilters();

  document.querySelector('#reportFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.status = document.querySelector('#statusFilter').value;
    state.locale = document.querySelector('#localeFilter').value;
    state.target = document.querySelector('#targetFilter').value;
    state.origin = document.querySelector('#originFilter').value;
    state.page = 1;
    writeStateToUrl();
    runAction(load, 'translation queue load');
  });

  await load();

  document.addEventListener('gftv:localechange', () => {
    drawFilters();
    draw();
  });
}

function readStateFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const pick = (name, allowed) => {
    const value = search.get(name) ?? '';
    return allowed.includes(value) ? value : '';
  };

  state = {
    // 'all' is not a status. It is the way out of the default view, which shows
    // only what is unfinished: without it there would be no way to look at a
    // report that has already been answered without guessing which of the two
    // closed states it ended in.
    status: pick('status', [...STATUSES, 'all']),
    // Not checked against the active languages here: a report may name one that
    // has since been deactivated, and the route re-checks it against
    // gftvjobs_locales regardless.
    locale: search.get('locale') ?? '',
    target: pick('target', TARGETS),
    origin: pick('origin', ORIGINS),
    page: Math.max(1, Number(search.get('page')) || 1),
  };
}

function writeStateToUrl() {
  const search = new URLSearchParams();
  for (const name of ['status', 'locale', 'target', 'origin']) {
    if (state[name]) search.set(name, state[name]);
  }
  if (state.page > 1) search.set('page', String(state.page));
  window.history.replaceState({}, '', `${PATH}?${search.toString()}`);
}

/**
 * The four filter selects.
 *
 * The language list comes from gftvjobs_locales through the shell rather than
 * from a constant, for the reason 8.2 gives about the editor's tabs: a language
 * added later should appear without touching this file.
 */
function drawFilters() {
  const options = (list, selected, label) =>
    list
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.value)}"${
            entry.value === selected ? ' selected' : ''
          }>${escapeHtml(label(entry))}</option>`
      )
      .join('');

  const statusList = [
    { value: '', key: 'admin.unfinishedReports' },
    ...STATUSES.map((status) => ({ value: status, key: `admin.reportStatus_${status}` })),
    { value: 'all', key: 'admin.everyReport' },
  ];

  const localeList = [
    { value: '', key: 'admin.anyLanguage' },
    ...adminLocales().map((locale) => ({ value: locale.code, name: locale.native_name })),
  ];

  const targetList = [
    { value: '', key: 'admin.anyTarget' },
    ...TARGETS.map((target) => ({ value: target, key: `admin.target_${target}` })),
  ];

  const originList = [
    { value: '', key: 'admin.anyOrigin' },
    ...ORIGINS.map((origin) => ({ value: origin, key: `admin.origin_${origin}` })),
  ];

  const byKey = (entry) => (entry.name ? entry.name : t(entry.key));

  const status = document.querySelector('#statusFilter');
  const locale = document.querySelector('#localeFilter');
  const target = document.querySelector('#targetFilter');
  const origin = document.querySelector('#originFilter');

  if (status) status.innerHTML = options(statusList, state.status, byKey);
  if (locale) locale.innerHTML = options(localeList, state.locale, byKey);
  if (target) target.innerHTML = options(targetList, state.target, byKey);
  if (origin) origin.innerHTML = options(originList, state.origin, byKey);
}

async function load() {
  const search = new URLSearchParams();
  for (const name of ['locale', 'target', 'origin']) {
    if (state[name]) search.set(name, state[name]);
  }

  // With no status chosen the queue shows what is unfinished, per 8.11's "open
  // ones first". Choosing one means that one exactly; 'all' is the way to see
  // everything including what has already been answered.
  if (state.status === 'all') search.set('bucket', 'all');
  else if (state.status) search.set('status', state.status);
  else search.set('bucket', 'unfinished');

  search.set('page', String(state.page));

  const result = await api(`/api/admin/translations?${search.toString()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  draw();
}

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

function draw() {
  const list = document.querySelector('#reportList');
  if (!list || !payload) return;

  const rows = payload.reports ?? [];

  if (rows.length === 0) {
    list.innerHTML = countsMarkup() + emptyRow(t('admin.noReports'));
    drawPager();
    return;
  }

  list.innerHTML =
    countsMarkup() +
    `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colTarget'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguage'))}</th>
          <th scope="col">${escapeHtml(t('admin.colReport'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colRaised'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(rowMarkup).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('[data-report-id]').forEach((row) => {
    const id = row.getAttribute('data-report-id');
    row.querySelector('[data-open]')?.addEventListener('click', () => {
      runAction(() => openReport(id), 'open report');
    });
  });

  drawPager();
}

function rowMarkup(report) {
  return `
    <tr data-report-id="${escapeHtml(report.id)}">
      <td>
        <span class="admin-row-title">${escapeHtml(targetLabel(report))}</span>
        <span class="admin-sub muted">${escapeHtml(fieldLabel(report))}</span>
      </td>
      <td>${escapeHtml(localeName(report.locale))}</td>
      <td>
        <span class="admin-row-title">${escapeHtml(excerpt(report.note))}</span>
        <span class="admin-sub muted">${escapeHtml(
          t('admin.reportedBy', { who: reporterName(report) })
        )}${
          report.origin === 'annotation'
            ? ` &middot; ${escapeHtml(t('admin.origin_annotation'))}`
            : ''
        }${report.suggested_text ? ` &middot; ${escapeHtml(t('admin.hasSuggestion'))}` : ''}</span>
      </td>
      <td><span class="badge badge-report-${escapeHtml(report.status)}">${escapeHtml(
        t(`admin.reportStatus_${report.status}`)
      )}</span></td>
      <td class="tabular">${escapeHtml(formatDate(report.created_at))}</td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-quiet small" data-open>${escapeHtml(
          t('admin.openReport')
        )}</button>
      </td>
    </tr>`;
}

/**
 * The four counts, as a line above the table.
 *
 * A null is a count that could not be read and is drawn as a dash rather than as
 * a zero, per the rule api/admin/me.js states about the sidebar badge: a zero is
 * a claim, and a failed request does not entitle us to make one.
 */
function countsMarkup() {
  const counts = payload?.counts ?? {};

  return `<p class="muted admin-counts">${STATUSES.map(
    (status) =>
      `${escapeHtml(t(`admin.reportStatus_${status}`))}: <strong>${
        counts[status] === null || counts[status] === undefined
          ? '&mdash;'
          : escapeHtml(String(counts[status]))
      }</strong>`
  ).join(' &middot; ')}</p>`;
}

function drawPager() {
  const holder = document.querySelector('#reportPager');
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
      runAction(load, 'translation queue page');
    });
  });
}

/* -------------------------------------------------------------------------
 * Naming things
 * ---------------------------------------------------------------------- */

function targetLabel(report) {
  if (report.target_type === 'interface') return report.target_key ?? t('admin.target_interface');
  return report.target_label ?? t('admin.targetGone');
}

/**
 * Which part of it reads wrongly.
 *
 * A null field is not a gap in the data: 7h's form defaults to "the whole
 * posting" precisely because a reporter may not know which field they mean, and
 * that is the answer rather than a missing one.
 */
function fieldLabel(report) {
  if (report.target_type === 'interface') return t('admin.target_interface');
  if (!report.field) return t('admin.wholeThing');

  // The type qualified key first, because the same column name means different
  // things on different tables: a posting's description is the body of the role,
  // and a tag's is one line explaining the tag. Falling straight through to
  // admin.field_description would label the second with the first's wording.
  for (const key of [`admin.field_${report.target_type}_${report.field}`, `admin.field_${report.field}`]) {
    const label = t(key);
    if (label !== key) return label;
  }

  return report.field.replace(/_/g, ' ');
}

function localeName(code) {
  return adminLocales().find((locale) => locale.code === code)?.native_name ?? code;
}

function reporterName(report) {
  return report.reporter?.display_name ?? t('admin.deletedAccount');
}

function excerpt(text, max = 140) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/* -------------------------------------------------------------------------
 * One report
 * ---------------------------------------------------------------------- */

async function openReport(id) {
  const result = await api(`/api/admin/translations?id=${encodeURIComponent(id)}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  showReport(result.data.report);
}

function showReport(report) {
  detailDialog = createDialog({
    id: 'reportDetail',
    titleKey: 'admin.reportTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `<div class="modal-body">${panelMarkup(report)}</div>`,
  });

  wireReport(report);
  detailDialog.open();
}

function panelMarkup(report) {
  return `
    <p class="admin-row-title">${escapeHtml(targetLabel(report))}</p>
    <p class="muted">${escapeHtml(fieldLabel(report))} &middot; ${escapeHtml(
      localeName(report.locale)
    )} &middot; ${escapeHtml(t(`admin.origin_${report.origin}`))}</p>

    <div class="callout">
      <p>${escapeHtml(report.note)}</p>
      <p class="muted">${escapeHtml(
        t('admin.reportedByOn', {
          who: reporterName(report),
          date: formatDate(report.created_at),
        })
      )}</p>
    </div>

    ${quoteMarkup(report)}
    ${suggestionMarkup(report)}
    ${wordingMarkup(report)}
    ${editorMarkup(report)}
    ${resolutionMarkup(report)}

    <div class="modal-actions">
      <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
        t('common.close')
      )}</button>
    </div>`;
}

/**
 * The quoted span, for an annotation.
 *
 * 7i: "a suggestion whose anchor can no longer be found is shown as detached
 * rather than dropped". Detached does not mean wrong. The words were on the page
 * when somebody selected them, and the most likely reason they are not there now
 * is that the sentence around them has since been rewritten, which is worth
 * knowing rather than hiding.
 */
function quoteMarkup(report) {
  if (report.origin !== 'annotation') return '';

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.selectedText'))}</h3>
    <blockquote class="admin-quote">
      ${
        report.quote_prefix
          ? `<span class="muted">${escapeHtml(report.quote_prefix)}</span>`
          : ''
      }<mark>${escapeHtml(report.quote ?? '')}</mark>${
        report.quote_suffix ? `<span class="muted">${escapeHtml(report.quote_suffix)}</span>` : ''
      }
    </blockquote>
    ${
      report.anchor === 'detached'
        ? `<p class="callout warn">${escapeHtml(t('admin.anchorDetached'))}</p>`
        : ''
    }`;
}

function suggestionMarkup(report) {
  if (!report.suggested_text) {
    return `<p class="field-hint">${escapeHtml(t('admin.noSuggestion'))}</p>`;
  }

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.theirSuggestion'))}</h3>
    <blockquote class="admin-quote">${escapeHtml(report.suggested_text)}</blockquote>
    <p class="field-hint">${escapeHtml(t('admin.suggestionNeverApplied'))}</p>`;
}

/**
 * The wording as it stands, in both languages.
 *
 * The source is always shown, because a correction is a comparison. The reported
 * language is shown as it is stored, and "nothing here yet" is a real answer:
 * the reader was looking at the source falling through, which is a different
 * problem from a bad translation and one this panel should not disguise.
 */
function wordingMarkup(report) {
  if (report.target_type === 'interface') {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.interfaceString'))}</h3>
      <p class="callout warn">${escapeHtml(t('admin.interfaceIsCode'))}</p>
      <p><code>${escapeHtml(report.target_key ?? '')}</code></p>`;
  }

  // No field named means "the whole posting", which 7h's form offers as the
  // default. There is no single wording to put beside the suggestion, and two
  // empty quotes would read as though the posting itself were empty.
  if (!report.field) {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.currentWording'))}</h3>
      <p class="field-hint">${escapeHtml(t('admin.noFieldNamed'))}</p>`;
  }

  const wording = report.wording ?? {};

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.currentWording'))}</h3>
    <div class="admin-wording">
      ${
        wording.is_source_locale
          ? ''
          : `<div>
              <p class="field-hint">${escapeHtml(t('admin.sourceWording'))}</p>
              <blockquote class="admin-quote">${escapeHtml(
                wording.source ?? t('admin.nothingHere')
              )}</blockquote>
            </div>`
      }
      <div>
        <p class="field-hint">${escapeHtml(
          t('admin.wordingIn', { language: localeName(report.locale) })
        )}</p>
        <blockquote class="admin-quote">${escapeHtml(
          wording.reported ?? t('admin.nothingHere')
        )}</blockquote>
      </div>
    </div>
    ${
      wording.has_translation_row === false
        ? `<p class="field-hint">${escapeHtml(t('admin.noTranslationRow'))}</p>`
        : ''
    }`;
}

/**
 * The editing box, when there is something this page can honestly rewrite.
 *
 * Absent for an interface string, per 7i, and absent for a report that names no
 * field or names the sections, which a single textarea cannot edit without
 * quietly throwing away everything except the first one. Both of those get a way
 * through to the editor instead, which is the tool that can do it.
 */
function editorMarkup(report) {
  if (report.target_type === 'interface') return '';

  if (!report.editable) {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.fixTheWording'))}</h3>
      <p class="field-hint">${escapeHtml(t('admin.notEditableHere'))}</p>
      ${
        editorHref(report)
          ? `<p><a class="btn btn-secondary small" href="${escapeHtml(
              editorHref(report)
            )}">${escapeHtml(t('admin.openInEditor'))}</a></p>`
          : ''
      }`;
  }

  const current = report.wording?.reported ?? '';

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.fixTheWording'))}</h3>
    <div class="field">
      <label for="wordingBox">${escapeHtml(
        t('admin.wordingIn', { language: localeName(report.locale) })
      )}</label>
      <textarea id="wordingBox" rows="5">${escapeHtml(current)}</textarea>
      <p class="field-hint">${escapeHtml(t('admin.wordingHint'))}</p>
      <p class="field-error" data-error-for="text" hidden></p>
    </div>
    <div class="editor-actions">
      ${
        report.suggested_text
          ? `<button type="button" class="btn btn-quiet small" data-use-suggestion>${escapeHtml(
              t('admin.useSuggestion')
            )}</button>`
          : ''
      }
      <button type="button" class="btn btn-secondary" data-save-wording>${escapeHtml(
        t('admin.saveWording')
      )}</button>
    </div>`;
}

/**
 * Where to go to edit this properly.
 *
 * The posting editor takes the language as a parameter so it opens on the tab
 * the report is about. Teams and tags have no per-row editor: their pages edit
 * every language of one row in place, so the link is the list and the admin
 * finds the row on it.
 */
function editorHref(report) {
  if (report.target_type === 'job' && report.target_id) {
    return `/admin/jobs/edit?id=${encodeURIComponent(
      report.target_id
    )}&locale=${encodeURIComponent(report.locale)}`;
  }
  if (report.target_type === 'department') return '/admin/departments';
  if (report.target_type === 'tag') return '/admin/tags';
  return null;
}

function resolutionMarkup(report) {
  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.resolution'))}</h3>
    <div class="field">
      <label for="reportStatus">${escapeHtml(t('admin.colStatus'))}</label>
      <select id="reportStatus">
        ${STATUSES.map(
          (status) =>
            `<option value="${status}"${
              status === report.status ? ' selected' : ''
            }>${escapeHtml(t(`admin.reportStatus_${status}`))}</option>`
        ).join('')}
      </select>
      <p class="field-hint" data-status-hint></p>
    </div>
    <div class="field">
      <label for="resolutionNote">${escapeHtml(t('admin.resolutionNote'))}</label>
      <textarea id="resolutionNote" rows="3" maxlength="2000">${escapeHtml(
        report.resolution_note ?? ''
      )}</textarea>
      <p class="field-hint">${escapeHtml(t('admin.resolutionNoteHint'))}</p>
      <p class="field-error" data-error-for="note" hidden></p>
    </div>
    <div class="editor-actions">
      <button type="button" class="btn btn-primary" data-save-resolution>${escapeHtml(
        t('admin.saveResolution')
      )}</button>
    </div>`;
}

/* -------------------------------------------------------------------------
 * The panel's controls
 * ---------------------------------------------------------------------- */

function wireReport(report) {
  const root = detailDialog.element;

  const statusSelect = root.querySelector('#reportStatus');
  const hint = root.querySelector('[data-status-hint]');

  const updateHint = () => {
    if (!hint || !statusSelect) return;
    hint.textContent = t(`admin.statusHint_${statusSelect.value}`);
  };

  statusSelect?.addEventListener('change', updateHint);
  updateHint();

  root.querySelector('[data-use-suggestion]')?.addEventListener('click', () => {
    const box = root.querySelector('#wordingBox');
    if (box) {
      box.value = report.suggested_text ?? '';
      box.focus();
    }
  });

  root.querySelector('[data-save-wording]')?.addEventListener('click', () => {
    runAction(() => saveWording(report), 'save wording');
  });

  root.querySelector('[data-save-resolution]')?.addEventListener('click', () => {
    runAction(() => saveResolution(report), 'save resolution');
  });
}

function clearErrors(root) {
  root.querySelectorAll('[data-error-for]').forEach((node) => {
    node.hidden = true;
    node.textContent = '';
  });
}

function showErrors(root, details) {
  for (const [name, code] of Object.entries(details ?? {})) {
    if (typeof code !== 'string') continue;
    const node = root.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (node) {
      node.textContent = t(`field.${code}`);
      node.hidden = false;
    }
  }
}

/**
 * Save the corrected wording.
 *
 * **This does not close the report**, and the panel says so by moving the status
 * select to fixed and leaving the note box waiting. 8.11 makes the note the
 * thing that closes a report, because the reporter reads it; folding the two
 * into one button would make the note something an admin skips by finishing the
 * edit.
 */
async function saveWording(report) {
  const root = detailDialog.element;
  clearErrors(root);

  const box = root.querySelector('#wordingBox');
  if (!box) return;

  const result = await api('/api/admin/translations', {
    method: 'POST',
    // No field is sent. The route rewrites the part the report itself names,
    // deliberately, so this endpoint is not a general single field writer that
    // happens to need a report id.
    body: { action: 'edit', report_id: report.id, text: box.value },
  });

  if (!result.ok) {
    showErrors(root, result.error?.details);
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.wordingSaved'));

  const statusSelect = root.querySelector('#reportStatus');
  if (statusSelect && !RESOLVED.includes(statusSelect.value)) {
    statusSelect.value = 'fixed';
    statusSelect.dispatchEvent(new Event('change'));
  }

  root.querySelector('#resolutionNote')?.focus();

  await load();
}

async function saveResolution(report) {
  const root = detailDialog.element;
  clearErrors(root);

  const status = root.querySelector('#reportStatus')?.value ?? report.status;
  const note = root.querySelector('#resolutionNote')?.value.trim() ?? '';

  // Checked here as well as by the route and by migration 015's constraint. The
  // point is not a third guard, it is that somebody finds out before the request
  // rather than after it.
  if (RESOLVED.includes(status) && !note) {
    showErrors(root, { note: 'required' });
    adminMessage('error', t('admin.resolutionNeedsNote'));
    return;
  }

  const result = await api('/api/admin/translations', {
    method: 'POST',
    body: { action: 'resolve', report_id: report.id, status, note: note || null },
  });

  if (!result.ok) {
    showErrors(root, result.error?.details);
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  detailDialog?.close();
  adminMessage('ok', t(`admin.reportMoved_${status}`));
  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
