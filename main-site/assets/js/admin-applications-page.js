// /admin/applications, applicant tracking. Section 8.3.
//
// "List with filters by job, status, and date range. This tracks who was handed
// over to which form, not the answers themselves, so make that clear in the UI
// copy."
//
// That sentence is the first thing on the page, above the filters, and it is not
// decoration: an admin who believes this page holds applications will look for
// somebody's answers here and conclude they were lost. The answers are in Google
// Forms, and every row links out to its posting's response sheet.
//
// The three rules from 21 August 2026 that this page makes visible:
//
//   **A status change never touches the cooldown.** Waiving is its own control,
//   next to the cooldown it clears, and the accept and reject controls say so.
//
//   **Accepting and rejecting need a message.** The composer opens with the
//   status change rather than after it, because the message is part of the
//   decision and not a follow up somebody might forget.
//
//   **A send to more than one person confirms who first**, per 8.5's rule for
//   bulk invites. The confirmation lists them by name; the server refuses a
//   count that does not match what was shown.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { formatDate } from './format.js';
import { createDialog } from './dialog.js';
import { confirmDangerousAction } from './danger-confirm.js';
import {
  mountAdminPage,
  adminMessage,
  emptyRow,
  runAction,
  isAdminUser,
} from './admin-shell.js';
import { mountQuestionComposer } from './admin-questions.js';

const PATH = '/admin/applications';

const STATUSES = [
  'started',
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
];

/** The two that raise a notice task and therefore need a message written. */
const DECISIONS = ['accepted', 'rejected'];

const state = { job: null, status: null, from: '', until: '', q: '', page: 1 };

let payload = null;
let detailDialog = null;
let jobs = [];
const selected = new Set();

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  readStateFromUrl();

  const jobList = await api('/api/admin/jobs?limit=100&sort=updated');
  jobs = jobList.ok ? (jobList.data.jobs ?? []) : [];

  wireFilters();
  wireBulkBar();

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });
}

function readStateFromUrl() {
  const search = new URL(window.location.href).searchParams;
  state.job = search.get('job');
  const status = search.get('status');
  if (STATUSES.includes(status)) state.status = status;
  state.from = search.get('from') ?? '';
  state.until = search.get('until') ?? '';
  state.q = search.get('q') ?? '';
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 0) state.page = page;
}

function writeStateToUrl() {
  try {
    const url = new URL(window.location.href);
    const set = (name, value, fallback) => {
      if (!value || value === fallback) url.searchParams.delete(name);
      else url.searchParams.set(name, String(value));
    };

    set('job', state.job, null);
    set('status', state.status, null);
    set('from', state.from, '');
    set('until', state.until, '');
    set('q', state.q, '');
    set('page', state.page, 1);

    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}`);
  } catch {
    // Untidy, not broken.
  }
}

function query() {
  const params = new URLSearchParams();
  if (state.job) params.set('job', state.job);
  if (state.status) params.set('status', state.status);
  if (state.from) params.set('from', state.from);
  if (state.until) params.set('until', state.until);
  if (state.q) params.set('q', state.q);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

/* -------------------------------------------------------------------------
 * The toolbar
 * ---------------------------------------------------------------------- */

function wireFilters() {
  const form = document.querySelector('#applicationFilters');
  if (!form) return;

  const jobSelect = form.querySelector('[name="job"]');
  if (jobSelect) {
    jobSelect.innerHTML =
      `<option value="">${escapeHtml(t('admin.allRoles'))}</option>` +
      jobs
        .map(
          (job) =>
            `<option value="${escapeHtml(job.id)}"${job.id === state.job ? ' selected' : ''}>${escapeHtml(
              job.title
            )}</option>`
        )
        .join('');
  }

  form.querySelector('[name="from"]').value = state.from;
  form.querySelector('[name="until"]').value = state.until;
  form.querySelector('[name="q"]').value = state.q;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.job = jobSelect?.value || null;
    state.from = form.querySelector('[name="from"]').value;
    state.until = form.querySelector('[name="until"]').value;
    state.q = form.querySelector('[name="q"]').value.trim();
    state.page = 1;
    writeStateToUrl();
    load();
  });

  form.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    state.job = null;
    state.status = null;
    state.from = '';
    state.until = '';
    state.q = '';
    state.page = 1;
    writeStateToUrl();
    window.location.reload();
  });

  document.querySelector('#exportCsv')?.addEventListener('click', () => {
    const params = query();
    params.delete('page');
    params.set('format', 'csv');
    // A plain navigation rather than a fetch: the browser's own download
    // handling is what turns a Content-Disposition into a saved file, and a
    // blob built in script would lose the filename the server chose.
    window.location.href = `/api/admin/applications?${params.toString()}`;
  });
}

/* -------------------------------------------------------------------------
 * Loading and drawing
 * ---------------------------------------------------------------------- */

async function load() {
  const list = document.querySelector('#applicationList');
  list?.setAttribute('aria-busy', 'true');

  const result = await api(`/api/admin/applications?${query().toString()}`);

  list?.removeAttribute('aria-busy');

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  selected.clear();
  draw();
}

function draw() {
  drawBuckets();
  drawList();
  drawBulkBar();
  drawPager();
}

function drawBuckets() {
  const holder = document.querySelector('#applicationBuckets');
  if (!holder) return;

  const counts = payload?.counts ?? {};

  const tab = (value, label, count) =>
    `<button type="button" class="bucket-tab" role="tab" data-bucket="${value ?? ''}"` +
    ` aria-selected="${(state.status ?? '') === (value ?? '')}"` +
    `${(state.status ?? '') === (value ?? '') ? '' : ' tabindex="-1"'}>` +
    `<span>${escapeHtml(label)}</span><span class="bucket-count">${count ?? 0}</span></button>`;

  holder.innerHTML = [
    tab(null, t('admin.bucket_all'), counts.all),
    ...STATUSES.map((status) => tab(status, t(`status.${status}`), counts[status])),
  ].join('');

  holder.querySelectorAll('[data-bucket]').forEach((button) => {
    button.addEventListener('click', () => {
      state.status = button.getAttribute('data-bucket') || null;
      state.page = 1;
      writeStateToUrl();
      load();
    });
  });
}

function drawList() {
  const list = document.querySelector('#applicationList');
  if (!list) return;

  const rows = payload?.applications ?? [];

  if (rows.length === 0) {
    list.innerHTML = truncatedMarkup() + emptyRow(t('admin.noApplications'));
    return;
  }

  list.innerHTML =
    truncatedMarkup() +
    `
    <table class="admin-table admin-applications-table">
      <thead>
        <tr>
          <th scope="col" class="admin-select-col">
            <label class="visually-hidden" for="selectAll">${escapeHtml(
              t('admin.selectAll')
            )}</label>
            <input type="checkbox" id="selectAll">
          </th>
          <th scope="col">${escapeHtml(t('admin.colApplicant'))}</th>
          <th scope="col">${escapeHtml(t('admin.colRole'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colDates'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>${rows.map(rowMarkup).join('')}</tbody>
    </table>`;

  hydrateIcons(list);
  wireRows(list);
}

/**
 * Said out loud when the applicant box matched more people than one search
 * filters by.
 *
 * The applicant box is a real filter from part 7 of phase 8, across every page
 * rather than inside the one on screen, and the cost of that is a ceiling on
 * how many people one search can name. A capped list with an exact looking
 * count under it is the sort of thing somebody makes a decision on, so it says
 * so, and it says it about the export too, which carries the same capped set.
 */
function truncatedMarkup() {
  if (!payload?.truncated) return '';
  return `<p class="callout warn">${escapeHtml(t('admin.searchTruncated'))}</p>`;
}

function rowMarkup(row) {
  const openTasks = row.open_tasks ?? [];

  return `
    <tr data-application-id="${escapeHtml(row.id)}">
      <td class="admin-select-col">
        <label class="visually-hidden" for="pick-${escapeHtml(row.id)}">${escapeHtml(
          t('admin.selectRow', { name: row.applicant.display_name ?? row.applicant.username })
        )}</label>
        <input type="checkbox" id="pick-${escapeHtml(row.id)}" data-pick>
      </td>
      <td>
        <span class="admin-row-title">${escapeHtml(
          row.applicant.display_name ?? t('admin.deletedAccount')
        )}</span>
        <span class="admin-sub muted">${escapeHtml(row.applicant.username ?? '')}</span>
        ${
          row.applicant.is_active
            ? ''
            : `<span class="badge badge-closed">${escapeHtml(t('admin.deactivated'))}</span>`
        }
      </td>
      <td>
        ${escapeHtml(row.job.title ?? t('admin.deletedPosting'))}
        ${
          row.job.response_sheet_url
            ? `<a class="admin-sub" href="${escapeHtml(row.job.response_sheet_url)}"
                  target="_blank" rel="noopener">${escapeHtml(t('admin.openResponses'))}
                  ${iconMarkup('external', { size: 12 })}</a>`
            : ''
        }
      </td>
      <td>
        <span class="status-pill status-${escapeHtml(row.status)}">${escapeHtml(
          t(`status.${row.status}`)
        )}</span>
        ${
          openTasks.length > 0
            ? `<span class="badge badge-task" title="${escapeHtml(
                t('admin.openTaskHint')
              )}">${escapeHtml(
                openTasks.some((task) => task.awaiting_admin)
                  ? t('admin.taskReplied')
                  : t('admin.taskWaiting')
              )}</span>`
            : ''
        }
      </td>
      <td class="tabular">
        <span>${escapeHtml(t('admin.startedOn', { date: formatDate(row.started_at) }))}</span>
        ${
          row.applied_at
            ? `<span class="admin-sub">${escapeHtml(
                t('admin.appliedOn', { date: formatDate(row.applied_at) })
              )}</span>`
            : ''
        }
        ${
          row.in_cooldown
            ? `<span class="admin-sub badge badge-cooldown">${escapeHtml(
                t('admin.cooldownUntil', { date: formatDate(row.cooldown_until) })
              )}</span>`
            : ''
        }
      </td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-quiet small" data-open-detail>
          ${escapeHtml(t('admin.viewDetail'))}
        </button>
      </td>
    </tr>`;
}

function wireRows(root) {
  root.querySelector('#selectAll')?.addEventListener('change', (event) => {
    root.querySelectorAll('[data-pick]').forEach((box) => {
      box.checked = event.target.checked;
      const id = box.closest('[data-application-id]')?.getAttribute('data-application-id');
      if (event.target.checked) selected.add(id);
      else selected.delete(id);
    });
    drawBulkBar();
  });

  root.querySelectorAll('[data-application-id]').forEach((row) => {
    const id = row.getAttribute('data-application-id');

    row.querySelector('[data-pick]')?.addEventListener('change', (event) => {
      if (event.target.checked) selected.add(id);
      else selected.delete(id);
      drawBulkBar();
    });

    row.querySelector('[data-open-detail]')?.addEventListener('click', () => openDetail(id));
  });
}

/* -------------------------------------------------------------------------
 * The detail panel
 * ---------------------------------------------------------------------- */

/**
 * Close the detail panel, if one is open.
 *
 * Through the dialog's own close rather than by removing the element: close is
 * what unlocks the page's scroll and puts focus back where it came from, and a
 * panel torn out of the document does neither.
 */
function closeDetail() {
  detailDialog?.close();
}

async function openDetail(id) {
  const result = await api(`/api/admin/applications?id=${encodeURIComponent(id)}`);
  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  const { application, history, tasks } = result.data;

  detailDialog = createDialog({
    id: 'applicationDetail',
    titleKey: 'admin.detailTitle',
    className: 'admin-detail-dialog',
    bodyHtml: `<div class="modal-body" id="applicationDetailBody"></div>`,
  });

  const body = document.querySelector('#applicationDetailBody');
  body.innerHTML = detailMarkup(application, history, tasks);
  hydrateIcons(body);
  wireDetail(body, application);

  detailDialog.open();
}

function detailMarkup(application, history, tasks) {
  return `
    <section class="admin-detail-profile">
      <h3>${escapeHtml(application.applicant.display_name ?? '')}</h3>
      <dl class="admin-detail-facts">
        <dt>${escapeHtml(t('admin.username'))}</dt>
        <dd>${escapeHtml(application.applicant.username ?? '')}</dd>
        <dt>${escapeHtml(t('auth.emailLabel'))}</dt>
        <dd>${escapeHtml(application.applicant.email ?? '')}</dd>
        ${
          application.applicant.phone
            ? `<dt>${escapeHtml(t('settings.phoneLabel'))}</dt>
               <dd>${escapeHtml(application.applicant.phone)}</dd>`
            : ''
        }
        <dt>${escapeHtml(t('admin.colRole'))}</dt>
        <dd>${escapeHtml(application.job.title ?? '')}</dd>
        <dt>${escapeHtml(t('admin.startedLabel'))}</dt>
        <dd>${escapeHtml(formatDate(application.started_at))}</dd>
        <dt>${escapeHtml(t('admin.appliedLabel'))}</dt>
        <dd>${escapeHtml(
          application.applied_at ? formatDate(application.applied_at) : t('admin.notConfirmed')
        )}</dd>
      </dl>
      <p class="field-hint">${escapeHtml(t('admin.answersElsewhere'))}</p>
    </section>

    <section class="admin-detail-status">
      <h3>${escapeHtml(t('admin.changeStatus'))}</h3>
      <div class="field">
        <label for="detailStatus">${escapeHtml(t('admin.colStatus'))}</label>
        <select id="detailStatus">
          ${STATUSES.map(
            (status) =>
              `<option value="${status}"${status === application.status ? ' selected' : ''}>${escapeHtml(
                t(`status.${status}`)
              )}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="detailNote">${escapeHtml(t('admin.internalNote'))}</label>
        <textarea id="detailNote" rows="2">${escapeHtml(application.admin_note ?? '')}</textarea>
        <p class="field-hint">${escapeHtml(t('admin.internalNoteHint'))}</p>
      </div>
      <div class="admin-detail-actions">
        <button type="button" class="btn btn-primary" data-save-status>
          ${escapeHtml(t('admin.saveStatus'))}
        </button>
        ${
          application.cooldown_until
            ? `<button type="button" class="btn btn-secondary" data-waive>
                 ${escapeHtml(t('admin.waiveCooldown'))}
               </button>`
            : ''
        }
      </div>
      ${
        application.cooldown_until
          ? `<p class="field-hint">${escapeHtml(t('admin.waiveHint'))}</p>`
          : ''
      }
    </section>

    <section class="admin-detail-tasks">
      <h3>${escapeHtml(t('admin.tasksHeading'))}</h3>
      ${
        tasks.length === 0
          ? emptyRow(t('admin.noTasks'))
          : tasks.map(taskMarkup).join('')
      }
      <button type="button" class="btn btn-secondary" data-raise-task>
        ${iconMarkup('plus', { size: 15 })}<span>${escapeHtml(t('admin.raiseTask'))}</span>
      </button>
    </section>

    <section class="admin-detail-history">
      <h3>${escapeHtml(t('admin.timeline'))}</h3>
      <ol class="admin-timeline">
        ${history
          .map(
            (event) => `
          <li>
            <span class="admin-timeline-status">${escapeHtml(
              event.from_status
                ? t('admin.movedFromTo', {
                    from: t(`status.${event.from_status}`),
                    to: t(`status.${event.to_status}`),
                  })
                : t('admin.movedTo', { to: t(`status.${event.to_status}`) })
            )}</span>
            <span class="muted tabular">${escapeHtml(formatDate(event.created_at))}</span>
            <span class="muted">${escapeHtml(t(`admin.source_${event.source}`))}</span>
            ${event.note ? `<p class="admin-timeline-note">${escapeHtml(event.note)}</p>` : ''}
          </li>`
          )
          .join('')}
      </ol>
    </section>`;
}

/**
 * One task on the detail panel, with its answers beside the questions.
 *
 * 8.3: answers "never as a bare list of values, so an admin reading it a month
 * later does not have to work out what was asked". The server pairs them and
 * resolves each option value into a label in the admin's own language; this
 * only lays them out.
 */
function taskMarkup(task) {
  const answered = (task.answers ?? []).filter((answer) => answer.answered);

  return `
    <article class="admin-task" data-task-id="${escapeHtml(task.id)}">
      <div class="admin-task-head">
        <span class="badge badge-task-${escapeHtml(task.task_type)}">${escapeHtml(
          t(`tasks.type_${task.task_type}`)
        )}</span>
        <span class="status-pill status-${escapeHtml(task.status)}">${escapeHtml(
          t(`admin.taskStatus_${task.status}`)
        )}</span>
        <span class="muted tabular">${escapeHtml(formatDate(task.created_at))}</span>
      </div>
      <p class="admin-task-title">${escapeHtml(task.title)}</p>
      ${task.body ? `<p class="admin-task-body">${escapeHtml(task.body)}</p>` : ''}
      ${
        task.response_text
          ? `<div class="admin-task-reply">
               <p class="modal-section-label">${escapeHtml(t('admin.theirReply'))}</p>
               <p>${escapeHtml(task.response_text)}</p>
             </div>`
          : ''
      }
      ${
        answered.length > 0
          ? `<dl class="admin-task-answers">
               ${answered
                 .map(
                   (answer) =>
                     `<dt>${escapeHtml(answer.question)}</dt>` +
                     `<dd>${escapeHtml(answer.display.join(', '))}</dd>`
                 )
                 .join('')}
             </dl>`
          : ''
      }
      ${
        task.status === 'open' || task.status === 'awaiting_admin'
          ? `<button type="button" class="btn btn-quiet small" data-resolve-task>${escapeHtml(
              t('admin.resolveTask')
            )}</button>`
          : ''
      }
    </article>`;
}

function wireDetail(body, application) {
  body.querySelector('[data-save-status]')?.addEventListener('click', async () => {
    const next = body.querySelector('#detailStatus').value;
    const note = body.querySelector('#detailNote').value.trim();

    if (next === application.status) {
      // Only the note changed, which is its own action and writes no event row.
      await sendNote(application.id, note);
      return;
    }

    if (DECISIONS.includes(next)) {
      openDecisionComposer([application], next, note);
      return;
    }

    const result = await api('/api/admin/applications', {
      method: 'POST',
      body: { action: 'status', id: application.id, status: next, note: note || null },
    });

    if (!result.ok) {
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    closeDetail();
    adminMessage('ok', t('admin.statusSaved'));
    await load();
  });

  body.querySelector('[data-waive]')?.addEventListener('click', async () => {
    const result = await api('/api/admin/applications', {
      method: 'POST',
      body: { action: 'waive', id: application.id },
    });

    if (!result.ok) {
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    closeDetail();
    adminMessage('ok', t('admin.cooldownWaived'));
    await load();
  });

  body.querySelector('[data-raise-task]')?.addEventListener('click', () => {
    openTaskComposer([application]);
  });

  body.querySelectorAll('[data-task-id]').forEach((node) => {
    node.querySelector('[data-resolve-task]')?.addEventListener('click', async () => {
      const result = await api('/api/admin/tasks', {
        method: 'POST',
        body: { action: 'resolve', id: node.getAttribute('data-task-id') },
      });

      if (!result.ok) {
        adminMessage('error', result.error?.message ?? t('error.unexpected'));
        return;
      }

      closeDetail();
      adminMessage('ok', t('admin.taskResolved'));
      await load();
    });
  });
}

async function sendNote(id, note) {
  const result = await api('/api/admin/applications', {
    method: 'POST',
    body: { action: 'note', id, note: note || null },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  closeDetail();
  adminMessage('ok', t('admin.noteSaved'));
  await load();
}

/* -------------------------------------------------------------------------
 * The bulk bar
 * ---------------------------------------------------------------------- */

function wireBulkBar() {
  document.querySelector('#bulkStatus')?.addEventListener('change', () => drawBulkBar());
  document.querySelector('#bulkApply')?.addEventListener('click', () => {
    runAction(applyBulk, 'bulk status');
  });
  document.querySelector('#bulkTask')?.addEventListener('click', () => {
    openTaskComposer(selectedRows());
  });

  // Removed rather than hidden or disabled for a job poster, per deviation 34:
  // section 0c's disabled state means "coming in a later phase", and using it
  // for "you are not allowed" would make a permission look like a build status.
  const remove = document.querySelector('#bulkDelete');
  if (!isAdminUser()) remove?.remove();
  else remove?.addEventListener('click', () => runAction(deleteBulk, 'bulk delete'));
}

function selectedRows() {
  return (payload?.applications ?? []).filter((row) => selected.has(row.id));
}

function drawBulkBar() {
  const bar = document.querySelector('#bulkBar');
  if (!bar) return;

  bar.hidden = selected.size === 0;
  const label = bar.querySelector('#bulkCount');
  if (label) label.textContent = t('admin.selectedCount', { count: selected.size });

  const select = bar.querySelector('#bulkStatus');
  if (select && select.options.length <= 1) {
    select.innerHTML =
      `<option value="">${escapeHtml(t('admin.bulkChoose'))}</option>` +
      STATUSES.map(
        (status) => `<option value="${status}">${escapeHtml(t(`status.${status}`))}</option>`
      ).join('');
  }
}

async function applyBulk() {
  const status = document.querySelector('#bulkStatus')?.value;
  if (!status) return;

  const rows = selectedRows();
  if (rows.length === 0) return;

  if (DECISIONS.includes(status)) {
    openDecisionComposer(rows, status, null);
    return;
  }

  const result = await api('/api/admin/applications', {
    method: 'POST',
    body: {
      action: 'bulk_status',
      ids: rows.map((row) => row.id),
      status,
      confirm_count: rows.length,
    },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.bulkDone', { count: result.data.moved.length }));
  await load();
}

/**
 * Delete the selected tracking rows permanently.
 *
 * **Not in 8.3, and added on 23 August 2026.** Everything else on this page is
 * reversible: a status can be moved back, a cooldown can be waived, a note can
 * be rewritten. This is the one thing here that cannot, so it walks 7g's
 * confirmation with deviation 49's shape — read what it destroys, then prove it
 * is you with your own password.
 *
 * The panel is counted from the database rather than described, per 8.2's rule
 * for a posting, and it names the consequence that is easiest to miss: the
 * reapply cooldown lives on the row being deleted, so anybody serving one stops
 * serving it. Section 3's rule is that exactly three things write those columns
 * and a rejection is not a waive; this is the fourth way they stop applying, and
 * an admin should read that before it happens rather than find out when somebody
 * reapplies the same afternoon.
 *
 * What survives is worth saying too, and the panel says it: the 8.4 funnel is
 * untouched, because gftvjobs_analytics has no foreign key to this table, and
 * any tasks the applicant was sent stay with them.
 */
async function deleteBulk() {
  const rows = selectedRows();
  if (rows.length === 0) return;

  const measured = await api('/api/admin/applications', {
    method: 'POST',
    body: { action: 'impact', ids: rows.map((row) => row.id) },
  });

  if (!measured.ok) {
    adminMessage('error', measured.error?.message ?? t('error.unexpected'));
    return;
  }

  const impact = measured.data.impact ?? {};

  // A dash rather than a zero for a count that could not be read, and the route
  // refuses the deletion on one. An admin shown a zero would believe there was
  // nothing attached to these rows.
  const count = (value) => (value === null || value === undefined ? '—' : value);

  const consequences = [
    t('admin.deleteRowsConsequenceRows', { count: rows.length }),
    t('admin.deleteRowsConsequenceEvents', { count: count(impact.events) }),
    t('admin.deleteRowsConsequenceTasks', { count: count(impact.tasks) }),
    t('admin.deleteRowsConsequenceAnalytics'),
    t('admin.deleteRowsConsequenceApplicant'),
  ];

  // Only when it applies. A line about cooldowns on a set where nobody is
  // serving one is noise, and noise in a danger panel is how the line that does
  // matter stops being read.
  if (impact.cooldowns > 0) {
    consequences.splice(3, 0, t('admin.deleteRowsConsequenceCooldown', { count: impact.cooldowns }));
  }

  const confirmed = await confirmDangerousAction({
    title: t('admin.deleteRowsTitle', { count: rows.length }),
    consequences,
    confirmLabel: t('admin.bulkDelete'),
    irreversible: t('admin.deleteRowsIrreversible'),
    // Deviation 49. The admin types their own password rather than an identifier
    // off the screen, and the route verifies it in the same request as the
    // delete. There is no single username to type here anyway: a selection is
    // several people, which is exactly why the identifier step is the wrong one.
    skipUsername: true,
    username: '',
  });

  if (!confirmed) return;

  const result = await api('/api/admin/applications', {
    method: 'POST',
    body: {
      action: 'bulk_delete',
      ids: rows.map((row) => row.id),
      confirm_count: rows.length,
      password: confirmed.password,
    },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  selected.clear();
  adminMessage('ok', t('admin.rowsDeleted', { count: result.data.count }));
  await load();
}

/* -------------------------------------------------------------------------
 * The decision composer
 * ---------------------------------------------------------------------- */

/**
 * Accepting or rejecting, with the message the applicant will read.
 *
 * There is no template, per 8.3, and that is the point of the panel: "we have
 * gone with somebody else" written by a person reads better than anything a
 * dropdown produces, and a rejection is the one message on this site most worth
 * writing properly.
 *
 * The recipients are listed by name before the send, per 8.5's rule for reaching
 * more than one person, and the count goes with the request so the server can
 * refuse one that does not match what was shown.
 */
function openDecisionComposer(rows, status, note) {
  const dialog = createDialog({
    id: 'decisionComposer',
    titleKey: status === 'accepted' ? 'admin.acceptTitle' : 'admin.rejectTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="callout note">${escapeHtml(
          t(status === 'accepted' ? 'admin.acceptExplainer' : 'admin.rejectExplainer')
        )}</p>

        <div class="admin-recipients">
          <p class="modal-section-label">${escapeHtml(
            t('admin.willReach', { count: rows.length })
          )}</p>
          <ul>${rows
            .map(
              (row) =>
                `<li>${escapeHtml(row.applicant.display_name ?? row.applicant.username)}
                 <span class="muted">${escapeHtml(row.job.title ?? '')}</span></li>`
            )
            .join('')}</ul>
        </div>

        <div class="field">
          <label for="decisionTitle">${escapeHtml(t('admin.messageTitle'))}</label>
          <input id="decisionTitle" type="text" maxlength="200"
                 value="${escapeHtml(t(`admin.default_${status}_title`))}">
        </div>

        <div class="field">
          <label for="decisionBody">${escapeHtml(t('admin.messageBody'))}</label>
          <textarea id="decisionBody" rows="6"
                    placeholder="${escapeHtml(t('admin.messageBodyPlaceholder'))}"></textarea>
          <p class="field-hint">${escapeHtml(t('admin.messageBodyHint'))}</p>
        </div>

        <p class="field-hint">${escapeHtml(t('admin.cooldownUntouched'))}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-primary" data-send>${escapeHtml(
            t('admin.sendDecision', { count: rows.length })
          )}</button>
        </div>
      </div>`,
  });

  dialog.element.querySelector('[data-send]').addEventListener('click', async () => {
    const title = dialog.element.querySelector('#decisionTitle').value.trim();
    const body = dialog.element.querySelector('#decisionBody').value.trim();

    if (!title) {
      adminMessage('error', t('admin.messageTitleRequired'));
      return;
    }

    const message = { title, body: body || null };

    const result =
      rows.length === 1
        ? await api('/api/admin/applications', {
            method: 'POST',
            body: { action: 'status', id: rows[0].id, status, note: note || null, message },
          })
        : await api('/api/admin/applications', {
            method: 'POST',
            body: {
              action: 'bulk_status',
              ids: rows.map((row) => row.id),
              status,
              note: note || null,
              message,
              confirm_count: rows.length,
            },
          });

    if (!result.ok) {
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    dialog.close();
    closeDetail();
    adminMessage('ok', t('admin.decisionSent', { count: rows.length }));
    await load();
  });

  dialog.open();
}

/* -------------------------------------------------------------------------
 * The task composer
 * ---------------------------------------------------------------------- */

/**
 * Raise a task, optionally carrying a question set, per 8.3 and 7g.
 *
 * The freeze warning is above the send button rather than in a confirmation
 * after it, because 7g says "the composer says so before the send rather than
 * after". Once this closes there is no way to change what was asked.
 */
function openTaskComposer(rows) {
  if (rows.length === 0) return;

  const dialog = createDialog({
    id: 'taskComposer',
    titleKey: 'admin.raiseTaskTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <div class="admin-recipients">
          <p class="modal-section-label">${escapeHtml(
            t('admin.willReach', { count: rows.length })
          )}</p>
          <ul>${rows
            .map(
              (row) =>
                `<li>${escapeHtml(row.applicant.display_name ?? row.applicant.username)}</li>`
            )
            .join('')}</ul>
        </div>

        <div class="field">
          <label for="taskType">${escapeHtml(t('admin.taskType'))}</label>
          <select id="taskType">
            <option value="info_request">${escapeHtml(t('tasks.type_info_request'))}</option>
            <option value="notice">${escapeHtml(t('tasks.type_notice'))}</option>
          </select>
          <p class="field-hint">${escapeHtml(t('admin.taskTypeHint'))}</p>
        </div>

        <div class="field">
          <label for="taskTitle">${escapeHtml(t('admin.messageTitle'))}</label>
          <input id="taskTitle" type="text" maxlength="200">
        </div>

        <div class="field">
          <label for="taskBody">${escapeHtml(t('admin.messageBody'))}</label>
          <textarea id="taskBody" rows="5"></textarea>
        </div>

        <div id="taskQuestionsWrap">
          <h3>${escapeHtml(t('admin.questionsHeading'))}</h3>
          <p class="field-hint">${escapeHtml(t('admin.questionsHint'))}</p>
          <div id="taskQuestions"></div>
        </div>

        <p class="callout warn">${escapeHtml(t('admin.frozenWarning'))}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-primary" data-send>${escapeHtml(
            t('admin.sendTask', { count: rows.length })
          )}</button>
        </div>
      </div>`,
  });

  const composer = mountQuestionComposer(dialog.element.querySelector('#taskQuestions'));

  // The posting the task is about, when every selected row is about the same
  // one. A send across two roles is a message about neither, so it hangs off no
  // posting rather than off whichever row happened to be first: the task still
  // reaches everybody, and nobody is told it concerns a role it does not.
  const jobId = rows.every((row) => row.job.id === rows[0].job.id) ? rows[0].job.id : null;

  const typeSelect = dialog.element.querySelector('#taskType');
  const questionsWrap = dialog.element.querySelector('#taskQuestionsWrap');

  // A notice carries no questions, per deviation 29: a notice is closed by being
  // read, and one that asked something would be a task an applicant can dismiss
  // while somebody waits for the answer.
  typeSelect.addEventListener('change', () => {
    questionsWrap.hidden = typeSelect.value === 'notice';
  });

  dialog.element.querySelector('[data-send]').addEventListener('click', async () => {
    const title = dialog.element.querySelector('#taskTitle').value.trim();
    if (!title) {
      adminMessage('error', t('admin.messageTitleRequired'));
      return;
    }

    const type = typeSelect.value;

    const result = await api('/api/admin/tasks', {
      method: 'POST',
      body: {
        action: 'raise',
        applicant_ids: rows.map((row) => row.applicant.id),
        job_id: jobId,
        task_type: type,
        title,
        body: dialog.element.querySelector('#taskBody').value.trim() || null,
        questions: type === 'notice' ? [] : composer.value(),
        confirm_count: rows.length,
      },
    });

    if (!result.ok) {
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    dialog.close();
    closeDetail();
    adminMessage('ok', t('admin.taskSent', { count: result.data.raised }));
    await load();
  });

  dialog.open();
}

/* -------------------------------------------------------------------------
 * Paging
 * ---------------------------------------------------------------------- */

function drawPager() {
  const holder = document.querySelector('#applicationPager');
  if (!holder) return;

  const total = payload?.total ?? 0;
  const limit = payload?.limit ?? 25;
  const pages = Math.max(1, Math.ceil(total / limit));

  if (pages <= 1) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = `
    <button type="button" class="btn btn-quiet small" data-page="prev"
            ${state.page <= 1 ? 'disabled' : ''}>${escapeHtml(t('search.previous'))}</button>
    <span class="muted tabular">${escapeHtml(t('admin.pageOf', { page: state.page, pages }))}</span>
    <button type="button" class="btn btn-quiet small" data-page="next"
            ${state.page >= pages ? 'disabled' : ''}>${escapeHtml(t('search.next'))}</button>`;

  holder.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.page += button.getAttribute('data-page') === 'next' ? 1 : -1;
      writeStateToUrl();
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
