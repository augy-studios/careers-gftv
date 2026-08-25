// /admin/jobs, the postings list. Section 8.2.
//
// "List with search, status filter, and sorting. Create, edit, duplicate,
// publish, unpublish, close, archive."
//
// Three things the list has to show that are easy to leave off, and each one
// exists because 8.2 asks for it by name:
//
//   **Which languages are done.** A tab in the editor says complete, in
//   progress, or absent, "and the same state shows in the postings list, so a
//   half finished translation is visible without opening it".
//
//   **Which postings never close.** "Show open ended postings distinctly in the
//   admin list so they are easy to audit, since nothing will ever close them
//   automatically."
//
//   **Which roles carry a question set**, per 8.3, "since it is a thing an
//   applicant is asked that is not visible on the posting itself".
//
// And the rule that shapes every control on a row: **a posting is never deleted
// as part of taking it down.** Close and archive are on the row; permanent
// deletion is admins only, is absent instead of disabled for a job poster, and
// goes behind the three step confirmation with a count of what it takes.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { formatDate } from './format.js';
import { confirmDangerousAction } from './danger-confirm.js';
import { mountAdminPage, adminMessage, emptyRow, isAdminUser } from './admin-shell.js';

const PATH = '/admin/jobs';

const STATUSES = ['draft', 'published', 'closed', 'archived'];
const SORTS = ['updated', 'created', 'title', 'closing'];

/**
 * Which status changes are offered on a row.
 *
 * Not every status from every status: unpublishing back to draft is a real
 * thing to do, but reopening an archived posting as published is not, because
 * 7g renders an archived posting to anybody with history and republishing one
 * would change what those readers see without anybody looking at it. Archived
 * goes back to closed, and an admin who wants it live again publishes it from
 * there, having looked at it.
 */
const TRANSITIONS = {
  draft: ['published'],
  published: ['draft', 'closed', 'archived'],
  closed: ['published', 'archived'],
  archived: ['closed'],
};

const state = { q: '', status: null, sort: 'updated', page: 1 };
let payload = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  readStateFromUrl();
  wireFilters();

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });
}

function readStateFromUrl() {
  const search = new URL(window.location.href).searchParams;

  state.q = search.get('q') ?? '';
  const status = search.get('status');
  if (STATUSES.includes(status)) state.status = status;
  const sort = search.get('sort');
  if (SORTS.includes(sort)) state.sort = sort;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 0) state.page = page;
}

function writeStateToUrl() {
  try {
    const url = new URL(window.location.href);
    const set = (name, value, fallback) => {
      if (value === null || value === '' || value === fallback) url.searchParams.delete(name);
      else url.searchParams.set(name, String(value));
    };

    set('q', state.q, '');
    set('status', state.status, null);
    set('sort', state.sort, 'updated');
    set('page', state.page, 1);

    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}`);
  } catch {
    // Untidy, not broken. The same treatment /search gives its own state.
  }
}

/* -------------------------------------------------------------------------
 * The toolbar
 * ---------------------------------------------------------------------- */

function wireFilters() {
  const form = document.querySelector('#jobFilters');
  if (!form) return;

  const search = form.querySelector('[name="q"]');
  if (search) search.value = state.q;

  const status = form.querySelector('[name="status"]');
  if (status) status.value = state.status ?? '';

  const sort = form.querySelector('[name="sort"]');
  if (sort) sort.value = state.sort;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = search?.value.trim() ?? '';
    state.page = 1;
    writeStateToUrl();
    load();
  });

  status?.addEventListener('change', () => {
    state.status = status.value || null;
    state.page = 1;
    writeStateToUrl();
    load();
  });

  sort?.addEventListener('change', () => {
    state.sort = sort.value;
    state.page = 1;
    writeStateToUrl();
    load();
  });
}

/* -------------------------------------------------------------------------
 * Loading and drawing
 * ---------------------------------------------------------------------- */

async function load() {
  const list = document.querySelector('#jobList');
  list?.setAttribute('aria-busy', 'true');

  const query = new URLSearchParams();
  if (state.q) query.set('q', state.q);
  if (state.status) query.set('status', state.status);
  if (state.sort) query.set('sort', state.sort);
  if (state.page > 1) query.set('page', String(state.page));

  const result = await api(`/api/admin/jobs?${query.toString()}`);

  list?.removeAttribute('aria-busy');

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  draw();
}

function draw() {
  const list = document.querySelector('#jobList');
  if (!list) return;

  const rows = payload?.jobs ?? [];

  if (rows.length === 0) {
    list.innerHTML = emptyRow(t(state.q || state.status ? 'admin.noJobsFiltered' : 'admin.noJobs'));
    drawPager();
    return;
  }

  list.innerHTML = `
    <table class="admin-table admin-jobs-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colRole'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguages'))}</th>
          <th scope="col">${escapeHtml(t('admin.colClosing'))}</th>
          <th scope="col">${escapeHtml(t('admin.colUpdated'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>${rows.map(rowMarkup).join('')}</tbody>
    </table>`;

  hydrateIcons(list);
  wireRows(list);
  drawPager();
}

function rowMarkup(job) {
  return `
    <tr data-job-id="${escapeHtml(job.id)}">
      <td>
        <a class="admin-row-title" href="/admin/jobs/edit?id=${encodeURIComponent(job.id)}">
          ${escapeHtml(job.title)}
        </a>
        <span class="admin-sub muted">${escapeHtml(job.department?.name ?? t('admin.noTeam'))}</span>
        <span class="admin-row-flags">
          ${
            job.has_form
              ? ''
              : `<span class="badge badge-warn" title="${escapeHtml(
                  t('admin.noFormHint')
                )}">${escapeHtml(t('admin.noForm'))}</span>`
          }
          ${
            job.has_questions
              ? `<span class="badge badge-questions" title="${escapeHtml(
                  t('admin.carriesQuestionsHint')
                )}">${escapeHtml(t('admin.carriesQuestions', { count: job.question_count }))}</span>`
              : ''
          }
          ${
            // Phase 9's daily check finally writes these columns, so the badge
            // says which of the two it is rather than one word for both. The
            // difference is what an admin does next: 'error' means the form is
            // gone and the posting cannot be applied to at all, 'warning' means
            // it loaded but is closed or private.
            job.form_check_state === 'warning' || job.form_check_state === 'error'
              ? `<span class="badge badge-warn" title="${escapeHtml(
                  job.form_check_note ?? ''
                )}">${escapeHtml(t(`admin.formCheck_${job.form_check_state}`))}</span>`
              : ''
          }
        </span>
      </td>
      <td><span class="status-pill status-${escapeHtml(job.status)}">${escapeHtml(
        t(`admin.jobStatus_${job.status}`)
      )}</span></td>
      <td>${languageMarkup(job)}</td>
      <td class="tabular">${
        job.has_deadline
          ? escapeHtml(formatDate(job.closes_at))
          : `<span class="badge badge-open">${escapeHtml(t('job.openUntilFilled'))}</span>`
      }</td>
      <td class="tabular">${escapeHtml(formatDate(job.updated_at))}</td>
      <td class="admin-row-actions">${actionsMarkup(job)}</td>
    </tr>`;
}

/**
 * The per language state, as a row of small pills.
 *
 * A language with no row at all is absent and is drawn faintly, not left
 * out, because "nobody has started the Chinese" is the state this column exists
 * to make visible and an empty cell says nothing.
 */
function languageMarkup(job) {
  const locales = payload?.locales ?? null;
  const states = new Map((job.translations ?? []).map((entry) => [entry.locale, entry.state]));

  // The default language always exists: it is the posting itself.
  const codes = locales
    ? locales.map((locale) => locale.code)
    : ['en', ...states.keys()].filter((code, index, all) => all.indexOf(code) === index);

  return `<span class="admin-langs">${codes
    .map((code) => {
      const state = code === 'en' ? 'complete' : (states.get(code) ?? 'absent');
      return `<span class="admin-lang admin-lang-${state}" title="${escapeHtml(
        t(`admin.translation_${state}`)
      )}">${escapeHtml(code)}</span>`;
    })
    .join('')}</span>`;
}

function actionsMarkup(job) {
  const transitions = TRANSITIONS[job.status] ?? [];

  return `
    <a class="btn btn-quiet small" href="/admin/jobs/edit?id=${encodeURIComponent(job.id)}">
      ${iconMarkup('edit', { size: 15 })}<span>${escapeHtml(t('admin.edit'))}</span>
    </a>
    ${transitions
      .map(
        (next) =>
          `<button type="button" class="btn btn-quiet small" data-status="${next}">` +
          `${escapeHtml(t(`admin.moveTo_${next}`))}</button>`
      )
      .join('')}
    <button type="button" class="btn btn-quiet small" data-duplicate>
      ${iconMarkup('copy', { size: 15 })}<span>${escapeHtml(t('admin.duplicate'))}</span>
    </button>
    ${
      // Absent for a job poster, not disabled, per 8.2. The route checks
      // the role again regardless.
      isAdminUser()
        ? `<button type="button" class="btn btn-quiet small danger" data-delete>` +
          `${iconMarkup('trash', { size: 15 })}<span>${escapeHtml(t('admin.delete'))}</span></button>`
        : ''
    }`;
}

function wireRows(root) {
  root.querySelectorAll('[data-job-id]').forEach((row) => {
    const id = row.getAttribute('data-job-id');
    const job = (payload?.jobs ?? []).find((candidate) => candidate.id === id);
    if (!job) return;

    row.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', () => changeStatus(job, button.getAttribute('data-status')));
    });

    row.querySelector('[data-duplicate]')?.addEventListener('click', () => duplicate(job));
    row.querySelector('[data-delete]')?.addEventListener('click', () => remove(job));
  });
}

/* -------------------------------------------------------------------------
 * The actions
 * ---------------------------------------------------------------------- */

async function changeStatus(job, status) {
  const result = await api('/api/admin/jobs', {
    method: 'POST',
    body: { action: 'status', id: job.id, status },
  });

  if (!result.ok) {
    // The publish rules come back as a list of reasons in place of a sentence,
    // so the page can say which ones and in the reader's language.
    const blockers = result.error?.details?.blockers;
    if (Array.isArray(blockers)) {
      adminMessage(
        'error',
        `${t('admin.cannotPublish')} ${blockers.map((code) => t(`admin.blocker_${code}`)).join(' ')}`
      );
      return;
    }
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t(`admin.movedTo_${status}`, { title: job.title }));
  await load();
}

async function duplicate(job) {
  const result = await api('/api/admin/jobs', {
    method: 'POST',
    body: { action: 'duplicate', id: job.id },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  // Straight into the copy, which is the only thing anybody does next.
  window.location.href = `/admin/jobs/edit?id=${encodeURIComponent(result.data.job.id)}`;
}

/**
 * Permanent deletion, behind the three step confirmation from 7g.
 *
 * Step 1 names exactly what goes with it, counted from the database instead of
 * described, per 8.2. The password step is kept: this is not the applicant's
 * own withdrawal, which deviation 25 made a two step action because it is
 * reversible. Deleting a posting is not reversible and takes other people's
 * history with it.
 */
async function remove(job) {
  const impact = await api(`/api/admin/jobs?id=${encodeURIComponent(job.id)}&impact=true`);
  const counts = impact.ok ? impact.data.impact : null;

  const consequences = counts
    ? [
        t('admin.deleteImpactApplications', { count: counts.applications }),
        t('admin.deleteImpactAnalytics', { count: counts.analytics }),
        t('admin.deleteImpactRatings', { count: counts.ratings }),
        t('admin.deleteImpactSaved', { count: counts.saved }),
        t('admin.deleteImpactTasks', { count: counts.tasks }),
      ]
    : [t('admin.deleteImpactUnknown')];

  const confirmed = await confirmDangerousAction({
    title: t('admin.deleteJobTitle', { title: job.title }),
    consequences,
    confirmLabel: t('admin.deleteJobConfirm'),
    username: job.slug,
    irreversible: t('admin.deleteJobIrreversible'),
    // **Deviation 38 reversed, 23 August 2026.** This used to ask for the
    // posting's slug and no password, on the argument that the session already
    // proves who the caller is. It does, and that is the wrong thing for this
    // step to prove: a session is a cookie in a browser somebody may have
    // walked away from, and permanent deletion destroys funnel history that
    // 8.4 depends on. The password is asked for here and verified server side
    // in the same request as the delete, never as a separate "was that right"
    // call, per 7g.
    skipUsername: true,
  });

  if (!confirmed) return;

  const result = await api('/api/admin/jobs', {
    method: 'POST',
    body: { action: 'delete', id: job.id, password: confirmed.password },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.jobDeleted', { title: job.title }));
  await load();
}

/* -------------------------------------------------------------------------
 * Paging
 * ---------------------------------------------------------------------- */

function drawPager() {
  const holder = document.querySelector('#jobPager');
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
    <span class="muted tabular">${escapeHtml(
      t('admin.pageOf', { page: state.page, pages })
    )}</span>
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
