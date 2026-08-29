// /admin/invites. Section 8.5.
//
// One posting at a time, with two lists under it: who has been shortlisted and
// told nothing, and who has been invited. That split is the page's whole
// argument. 8.5 describes two actions against the same pair of rows, and the
// difference between them is not a status an admin should have to read off a
// pill: one of these lists has reached real people and the other has not.
//
// Three things follow from that:
//
//   **The two lists are headed with what they mean**, not with their status
//   names. "Shortlisted, nobody told" says the thing an admin needs to know
//   before they act, in the place they are looking.
//
//   **Inviting is confirmed and names everybody it will reach.** 8.5 asks for
//   exactly that, "since this sends real messages", which is the same rule the
//   task composer in 8.3 follows. Shortlisting is not confirmed, because
//   nothing leaves the building.
//
//   **Withdrawing and removing are different words for different things.** An
//   invite that went out is withdrawn and the row stays, per 8.5. A shortlist
//   entry is removed, and there is nothing to keep.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction } from './danger-confirm.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminApiError, adminMessage, emptyRow, runAction } from './admin-shell.js';

const PATH = '/admin/invites';

/** How long to wait after a keystroke before searching. */
const SEARCH_DELAY = 250;

let jobs = [];
let invites = [];
let jobId = '';
let composer = null;
let picked = new Map();
let searchTimer = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  await loadJobs();

  document.querySelector('#jobFilter')?.addEventListener('change', (event) => {
    jobId = event.target.value;
    writeStateToUrl();
    runAction(load, 'invites load');
  });

  document.querySelector('#inviteFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  document.querySelector('#addPeople')?.addEventListener('click', () => {
    runAction(openComposer, 'invite composer');
  });

  await load();

  document.addEventListener('gftv:localechange', () => {
    drawJobOptions();
    draw();
  });
}

/* -------------------------------------------------------------------------
 * The posting picker
 * ---------------------------------------------------------------------- */

async function loadJobs() {
  const result = await api('/api/admin/invites?jobs=1');

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  jobs = result.data.jobs ?? [];

  const fromUrl = new URLSearchParams(window.location.search).get('job');
  jobId = jobs.some((job) => job.id === fromUrl) ? fromUrl : jobs[0]?.id ?? '';

  drawJobOptions();
}

function drawJobOptions() {
  const select = document.querySelector('#jobFilter');
  if (!select) return;

  select.innerHTML = jobs
    .map(
      (job) =>
        `<option value="${escapeHtml(job.id)}">${escapeHtml(job.title)}` +
        `${job.status === 'closed' ? ` (${escapeHtml(t('admin.jobStatus_closed'))})` : ''}</option>`
    )
    .join('');

  select.value = jobId;
}

function writeStateToUrl() {
  const search = new URLSearchParams();
  if (jobId) search.set('job', jobId);
  window.history.replaceState({}, '', `${PATH}?${search.toString()}`);
}

/* -------------------------------------------------------------------------
 * The two lists
 * ---------------------------------------------------------------------- */

async function load() {
  if (!jobId) {
    invites = [];
    draw();
    return;
  }

  const result = await api(`/api/admin/invites?job=${encodeURIComponent(jobId)}`);

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  invites = result.data.invites ?? [];
  draw();
}

function draw() {
  drawList(
    '#shortlistList',
    invites.filter((row) => row.status === 'shortlisted'),
    t('admin.noShortlist')
  );

  drawList(
    '#invitedList',
    invites.filter((row) => row.status !== 'shortlisted'),
    t('admin.noInvites')
  );
}

function drawList(selector, rows, empty) {
  const holder = document.querySelector(selector);
  if (!holder) return;

  if (!jobId) {
    holder.innerHTML = emptyRow(t('admin.noInvitableJobs'));
    return;
  }

  if (rows.length === 0) {
    holder.innerHTML = emptyRow(empty);
    return;
  }

  holder.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colApplicant'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colNote'))}</th>
          <th scope="col">${escapeHtml(t('admin.colWhen'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>${rows.map(rowMarkup).join('')}</tbody>
    </table>`;

  wireRows(holder);
}

function rowMarkup(row) {
  const shortlisted = row.status === 'shortlisted';

  return `
    <tr data-applicant-id="${escapeHtml(row.applicant_id)}"
        data-status="${escapeHtml(row.status)}">
      <td>
        <span class="admin-row-title">${escapeHtml(
          row.applicant?.display_name ?? t('admin.unknownWho')
        )}</span>
        <span class="admin-sub muted">${escapeHtml(row.applicant?.username ?? '')}</span>
      </td>
      <td><span class="badge badge-invite-${escapeHtml(row.status)}">${escapeHtml(
        t(`admin.inviteStatus_${row.status}`)
      )}</span></td>
      <td>${row.note ? escapeHtml(row.note) : `<span class="muted">&mdash;</span>`}</td>
      <td class="tabular">${escapeHtml(formatDate(row.notified_at ?? row.created_at))}</td>
      <td class="admin-row-actions">
        ${
          shortlisted
            ? `<button type="button" class="btn btn-secondary small" data-invite>${escapeHtml(
                t('admin.inviteAction')
              )}</button>
               <button type="button" class="btn btn-quiet small" data-remove>${escapeHtml(
                 t('admin.remove')
               )}</button>`
            : ''
        }
        ${
          row.status === 'invited' || row.status === 'seen'
            ? `<button type="button" class="btn btn-quiet small" data-withdraw>${escapeHtml(
                t('admin.withdrawInvite')
              )}</button>`
            : ''
        }
      </td>
    </tr>`;
}

function wireRows(root) {
  root.querySelectorAll('[data-applicant-id]').forEach((row) => {
    const id = row.getAttribute('data-applicant-id');
    const entry = invites.find((candidate) => candidate.applicant_id === id);
    if (!entry) return;

    row.querySelector('[data-invite]')?.addEventListener('click', () => {
      runAction(() => send('invite', [entry], entry.note), 'invite one');
    });

    row.querySelector('[data-withdraw]')?.addEventListener('click', () => {
      runAction(() => withdraw(entry), 'withdraw invite');
    });

    row.querySelector('[data-remove]')?.addEventListener('click', () => {
      runAction(() => remove(entry), 'remove shortlist');
    });
  });
}

/* -------------------------------------------------------------------------
 * Adding people
 * ---------------------------------------------------------------------- */

function openComposer() {
  picked = new Map();

  composer = createDialog({
    id: 'inviteComposer',
    titleKey: 'admin.addPeople',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="muted">${escapeHtml(
          t('admin.composerFor', { job: jobs.find((job) => job.id === jobId)?.title ?? '' })
        )}</p>

        <div class="field">
          <label for="applicantSearch">${escapeHtml(t('admin.findPeople'))}</label>
          <input id="applicantSearch" type="search" autocomplete="off">
        </div>

        <div id="applicantResults" class="admin-people" aria-live="polite"></div>

        <p class="modal-section-label">${escapeHtml(t('admin.chosenPeople'))}</p>
        <div id="pickedPeople" class="admin-chips" aria-live="polite"></div>

        <div class="field">
          <label for="inviteNote">${escapeHtml(t('admin.inviteNote'))}</label>
          <textarea id="inviteNote" rows="3" maxlength="600"></textarea>
          <p class="field-hint">${escapeHtml(t('admin.inviteNoteHint'))}</p>
          <p class="field-error" data-error-for="note" hidden></p>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-secondary" data-do-shortlist>${escapeHtml(
            t('admin.shortlistAction')
          )}</button>
          <button type="button" class="btn btn-primary" data-do-invite>${escapeHtml(
            t('admin.inviteAction')
          )}</button>
        </div>
      </div>`,
  });

  const root = composer.element;
  const search = root.querySelector('#applicantSearch');

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      runAction(() => searchApplicants(search.value), 'applicant search');
    }, SEARCH_DELAY);
  });

  root.querySelector('[data-do-shortlist]')?.addEventListener('click', () => {
    runAction(() => sendPicked('shortlist'), 'shortlist');
  });

  root.querySelector('[data-do-invite]')?.addEventListener('click', () => {
    runAction(() => sendPicked('invite'), 'invite');
  });

  composer.open();
  runAction(() => searchApplicants(''), 'applicant search');
}

async function searchApplicants(term) {
  const holder = composer?.element.querySelector('#applicantResults');
  if (!holder) return;

  const result = await api(`/api/admin/invites?applicants=${encodeURIComponent(term)}`);

  if (!result.ok) {
    holder.innerHTML = emptyRow(result.error?.message ?? t('error.unexpected'));
    return;
  }

  const people = result.data.applicants ?? [];

  if (people.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noPeopleFound'));
    return;
  }

  holder.innerHTML = people
    .map((person) => {
      // Somebody already on one of the two lists is shown as such and not
      // offered again: a second invite to the same posting reads as a reminder
      // nobody asked for, and the endpoint refuses it anyway.
      const already = invites.find((row) => row.applicant_id === person.id);

      return `
        <label class="admin-person">
          <input type="checkbox" value="${escapeHtml(person.id)}"
                 ${picked.has(person.id) ? 'checked' : ''}
                 ${already ? 'disabled' : ''}>
          <span class="admin-person-name">${escapeHtml(person.display_name)}</span>
          <span class="muted">${escapeHtml(person.username)}</span>
          ${
            already
              ? `<span class="badge badge-invite-${escapeHtml(already.status)}">${escapeHtml(
                  t(`admin.inviteStatus_${already.status}`)
                )}</span>`
              : ''
          }
        </label>`;
    })
    .join('');

  holder.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener('change', () => {
      const person = people.find((candidate) => candidate.id === box.value);
      if (!person) return;

      if (box.checked) picked.set(person.id, person);
      else picked.delete(person.id);

      drawPicked();
    });
  });
}

/**
 * Who is going to be contacted, kept on screen while the search moves on.
 *
 * The list of results changes with every search; the choice must not. This is
 * also the list the confirmation reads from, so what an admin sees before they
 * send is the same thing they have been assembling.
 */
function drawPicked() {
  const holder = composer?.element.querySelector('#pickedPeople');
  if (!holder) return;

  if (picked.size === 0) {
    holder.innerHTML = `<p class="muted">${escapeHtml(t('admin.nobodyChosen'))}</p>`;
    return;
  }

  holder.innerHTML = [...picked.values()]
    .map(
      (person) =>
        `<span class="admin-chip">${escapeHtml(person.display_name)}` +
        `<button type="button" class="icon-btn small" data-drop="${escapeHtml(person.id)}"
                 aria-label="${escapeHtml(t('admin.remove'))}">&times;</button></span>`
    )
    .join('');

  holder.querySelectorAll('[data-drop]').forEach((button) => {
    button.addEventListener('click', () => {
      picked.delete(button.getAttribute('data-drop'));
      drawPicked();
      const box = composer?.element.querySelector(
        `#applicantResults input[value="${CSS.escape(button.getAttribute('data-drop'))}"]`
      );
      if (box) box.checked = false;
    });
  });
}

async function sendPicked(action) {
  const root = composer?.element;
  if (!root) return;

  if (picked.size === 0) {
    adminMessage('error', t('admin.nobodyChosen'));
    return;
  }

  const note = root.querySelector('#inviteNote').value.trim();
  const people = [...picked.values()];

  if (action === 'invite') {
    // 8.5: a confirmation "showing exactly who will be contacted, since this
    // sends real messages". Everybody by name, not a count.
    const confirmed = await confirmAction({
      title: t('admin.confirmInviteTitle', { count: people.length }),
      body: t('admin.confirmInviteBody'),
      consequences: people.map((person) => person.display_name),
      confirmLabel: t('admin.inviteAction'),
      danger: false,
    });

    if (confirmed === null) return;
  }

  const result = await api('/api/admin/invites', {
    method: 'POST',
    body: {
      action,
      job_id: jobId,
      applicant_ids: people.map((person) => person.id),
      note: note || null,
    },
  });

  if (!result.ok) {
    const details = result.error?.details ?? {};
    for (const [field, code] of Object.entries(details)) {
      if (typeof code !== 'string') continue;
      const node = root.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
      if (node) {
        node.textContent = t(`field.${code}`);
        node.hidden = false;
      }
    }
    adminApiError(result.error);
    return;
  }

  composer.close();

  adminMessage(
    'ok',
    action === 'invite'
      ? t('admin.invitesSent', { count: result.data.invited })
      : t('admin.shortlisted', { count: result.data.added })
  );

  await load();
}

/**
 * Invite one person who is already shortlisted.
 *
 * Goes through the same confirmation as a bulk send. One person is still a real
 * person getting a message, and the row's note is carried across instead of
 * asked for again: it is why they are on the list.
 */
async function send(action, rows, note) {
  const names = rows.map((row) => row.applicant?.display_name ?? '');

  const confirmed = await confirmAction({
    title: t('admin.confirmInviteTitle', { count: rows.length }),
    body: t('admin.confirmInviteBody'),
    consequences: names,
    confirmLabel: t('admin.inviteAction'),
    danger: false,
  });

  if (confirmed === null) return;

  const result = await api('/api/admin/invites', {
    method: 'POST',
    body: {
      action,
      job_id: jobId,
      applicant_ids: rows.map((row) => row.applicant_id),
      note: note || null,
    },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  adminMessage('ok', t('admin.invitesSent', { count: result.data.invited }));
  await load();
}

async function withdraw(row) {
  const confirmed = await confirmAction({
    title: t('admin.confirmWithdrawTitle', {
      name: row.applicant?.display_name ?? t('admin.unknownWho'),
    }),
    body: t('admin.confirmWithdrawBody'),
    confirmLabel: t('admin.withdrawInvite'),
  });

  if (confirmed === null) return;

  const result = await api('/api/admin/invites', {
    method: 'POST',
    body: { action: 'withdraw', job_id: jobId, applicant_id: row.applicant_id },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  adminMessage('ok', t('admin.inviteWithdrawn'));
  await load();
}

/**
 * Take somebody off the shortlist.
 *
 * No confirmation, unlike withdrawing. Nothing was sent, nobody was told, and
 * putting them back is the same two clicks it took to add them.
 */
async function remove(row) {
  const result = await api('/api/admin/invites', {
    method: 'POST',
    body: { action: 'remove', job_id: jobId, applicant_id: row.applicant_id },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
