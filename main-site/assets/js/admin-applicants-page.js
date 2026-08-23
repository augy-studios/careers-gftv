// /admin/applicants. Section 8.9.
//
// The accounts themselves, which is a different page from 8.3 on purpose: the
// tracking page is about applications and is a job poster's, and this one is
// about people and is admins only.
//
// What this page has to get right is not the list. It is the order in which it
// offers the six things an admin can do to somebody's account, and how loudly
// it says what each one costs:
//
//   **Deactivating is first and is described as reversible**, because 8.9 calls
//   it "the ordinary action". Everything is kept and sign in stops.
//
//   **The two assisted paths come before setting a password**, per 8.9: "Prefer
//   them to setting a password, and say so on the page." Forcing a reset gets
//   somebody back in without anybody learning their password.
//
//   **Setting a password says what it costs, in the confirmation and on the
//   page.** 8.9: "it is the one action in the build that breaks non
//   repudiation: once an admin can set a password, the audit log can no longer
//   prove that the applicant did something themselves." That sentence is not
//   paraphrased into something gentler here.
//
//   **Deleting is last, in a danger zone, behind the three step confirmation**,
//   and the panel says what survives: the analytics rows with no name on them,
//   and the translation reports, per 7g.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction, confirmDangerousAction } from './danger-confirm.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminMessage, emptyRow, runAction } from './admin-shell.js';

const PATH = '/admin/applicants';

let payload = null;
let state = { q: '', active: '', page: 1 };
let detailDialog = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  readStateFromUrl();
  applyStateToForm();

  document.querySelector('#applicantFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = document.querySelector('#applicantSearch').value.trim();
    state.active = document.querySelector('#activeFilter').value;
    state.page = 1;
    writeStateToUrl();
    runAction(load, 'applicants load');
  });

  await load();

  document.addEventListener('gftv:localechange', () => draw());
}

function readStateFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const active = search.get('active');

  state = {
    q: search.get('q') ?? '',
    active: active === 'true' || active === 'false' ? active : '',
    page: Math.max(1, Number(search.get('page')) || 1),
  };
}

function applyStateToForm() {
  const box = document.querySelector('#applicantSearch');
  const active = document.querySelector('#activeFilter');
  if (box) box.value = state.q;
  if (active) active.value = state.active;
}

function writeStateToUrl() {
  const search = new URLSearchParams();
  if (state.q) search.set('q', state.q);
  if (state.active) search.set('active', state.active);
  if (state.page > 1) search.set('page', String(state.page));
  window.history.replaceState({}, '', `${PATH}?${search.toString()}`);
}

async function load() {
  const search = new URLSearchParams();
  if (state.q) search.set('q', state.q);
  if (state.active) search.set('active', state.active);
  search.set('page', String(state.page));

  const result = await api(`/api/admin/applicants?${search.toString()}`);

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
  const list = document.querySelector('#applicantList');
  if (!list || !payload) return;

  const rows = payload.applicants ?? [];

  if (rows.length === 0) {
    list.innerHTML = emptyRow(t('admin.noApplicants'));
    drawPager();
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colApplicant'))}</th>
          <th scope="col">${escapeHtml(t('admin.colEmail'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colJoined'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (account) => `
          <tr data-applicant-id="${escapeHtml(account.id)}">
            <td>
              <span class="admin-row-title">${escapeHtml(account.display_name)}</span>
              <span class="admin-sub muted">${escapeHtml(account.username)}</span>
            </td>
            <td>${escapeHtml(account.email)}</td>
            <td>
              <span class="badge ${
                account.is_active ? 'badge-open' : 'badge-closed'
              }">${escapeHtml(
                t(account.is_active ? 'admin.accountActive' : 'admin.accountSuspended')
              )}</span>
              ${
                account.must_change_password
                  ? `<span class="badge badge-warn">${escapeHtml(
                      t('admin.mustResetBadge')
                    )}</span>`
                  : ''
              }
            </td>
            <td class="tabular">${escapeHtml(formatDate(account.created_at))}</td>
            <td class="admin-row-actions">
              <button type="button" class="btn btn-quiet small" data-open>${escapeHtml(
                t('admin.viewAccount')
              )}</button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('[data-applicant-id]').forEach((row) => {
    const id = row.getAttribute('data-applicant-id');
    row.querySelector('[data-open]')?.addEventListener('click', () => {
      runAction(() => openAccount(id), 'open account');
    });
  });

  drawPager();
}

function drawPager() {
  const holder = document.querySelector('#applicantPager');
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
      runAction(load, 'applicants page');
    });
  });
}

/* -------------------------------------------------------------------------
 * One account
 * ---------------------------------------------------------------------- */

async function openAccount(id) {
  const result = await api(`/api/admin/applicants?id=${encodeURIComponent(id)}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  const detail = result.data;
  const account = detail.account;

  detailDialog = createDialog({
    id: 'applicantDetail',
    titleKey: 'admin.accountTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="admin-row-title">${escapeHtml(account.display_name)}</p>
        <p class="muted">${escapeHtml(account.username)} &middot; ${escapeHtml(
          account.email
        )}${account.phone ? ` &middot; ${escapeHtml(account.phone)}` : ''}</p>
        <p class="muted">${escapeHtml(
          t('admin.joinedOn', { date: formatDate(account.created_at) })
        )}</p>

        ${historyMarkup(detail)}

        <h3 class="admin-chart-heading">${escapeHtml(t('admin.accountActions'))}</h3>

        <div class="editor-actions">
          <button type="button" class="btn btn-secondary" data-active>${escapeHtml(
            t(account.is_active ? 'admin.deactivateAccount' : 'admin.reactivateAccount')
          )}</button>
        </div>
        <p class="field-hint">${escapeHtml(t('admin.deactivateHint'))}</p>

        <h3 class="admin-chart-heading">${escapeHtml(t('admin.lockedOutHeading'))}</h3>
        <p class="field-hint">${escapeHtml(t('admin.lockedOutHint'))}</p>

        <div class="editor-actions">
          <button type="button" class="btn btn-secondary" data-force-reset>${escapeHtml(
            t('admin.forceReset')
          )}</button>
          <button type="button" class="btn btn-secondary" data-unlink
                  data-feature="telegram_link">${escapeHtml(t('admin.unlinkTelegram'))}</button>
        </div>
        <p class="field-hint">${escapeHtml(
          detail.telegram
            ? t('admin.telegramLinked', { date: formatDate(detail.telegram.linked_at) })
            : t('admin.telegramNotLinked')
        )}</p>

        <div class="danger-zone">
          <h3>${escapeHtml(t('admin.accountDangerZone'))}</h3>
          <p>${escapeHtml(t('admin.setPasswordCost'))}</p>
          <div class="editor-actions">
            <button type="button" class="btn btn-danger" data-set-password>${escapeHtml(
              t('admin.setPassword')
            )}</button>
            <button type="button" class="btn btn-danger" data-delete>${escapeHtml(
              t('admin.deleteAccount')
            )}</button>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('common.close')
          )}</button>
        </div>
      </div>`,
  });

  const root = detailDialog.element;

  root.querySelector('[data-active]')?.addEventListener('click', () => {
    runAction(
      () => setActive(account, !account.is_active),
      account.is_active ? 'deactivate' : 'reactivate'
    );
  });
  root.querySelector('[data-force-reset]')?.addEventListener('click', () => {
    runAction(() => forceReset(account), 'force reset');
  });
  root.querySelector('[data-unlink]')?.addEventListener('click', () => {
    runAction(() => unlinkTelegram(account, detail.telegram), 'unlink telegram');
  });
  root.querySelector('[data-set-password]')?.addEventListener('click', () => {
    runAction(() => setPassword(account), 'set password');
  });
  root.querySelector('[data-delete]')?.addEventListener('click', () => {
    runAction(() => remove(account), 'delete account');
  });

  detailDialog.open();
}

function historyMarkup(detail) {
  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.applicationHistory'))}</h3>
    ${
      detail.applications.length === 0
        ? `<p class="muted">${escapeHtml(t('admin.noApplicationsYet'))}</p>`
        : `<ul class="admin-history">
            ${detail.applications
              .map(
                (row) => `
              <li>
                <span>${escapeHtml(row.job?.title ?? t('admin.postingGone'))}</span>
                <span class="badge">${escapeHtml(t(`status.${row.status}`))}</span>
                <span class="muted tabular">${escapeHtml(formatDate(row.updated_at))}</span>
              </li>`
              )
              .join('')}
          </ul>`
    }

    ${
      detail.invites.length === 0
        ? ''
        : `<h3 class="admin-chart-heading">${escapeHtml(t('admin.inviteHistory'))}</h3>
           <ul class="admin-history">
            ${detail.invites
              .map(
                (row) => `
              <li>
                <span>${escapeHtml(row.job?.title ?? t('admin.postingGone'))}</span>
                <span class="badge badge-invite-${escapeHtml(row.status)}">${escapeHtml(
                  t(`admin.inviteStatus_${row.status}`)
                )}</span>
                <span class="muted tabular">${escapeHtml(formatDate(row.created_at))}</span>
              </li>`
              )
              .join('')}
           </ul>`
    }

    ${
      detail.activity.length === 0
        ? ''
        : `<details class="admin-daily">
             <summary>${escapeHtml(
               t('admin.accountActivity', { count: detail.activity.length })
             )}</summary>
             <ul class="admin-history">
               ${detail.activity
                 .map(
                   (row) => `
                 <li>
                   <span>${escapeHtml(auditLabel(row.action))}</span>
                   <span class="muted">${escapeHtml(
                     row.actor_realm === 'staff'
                       ? t('admin.byStaff', { who: row.actor_label ?? t('admin.unknownWho') })
                       : t('admin.byThemselves')
                   )}</span>
                   ${row.reason ? `<span class="muted">${escapeHtml(row.reason)}</span>` : ''}
                   <span class="muted tabular">${escapeHtml(formatDate(row.created_at))}</span>
                 </li>`
                 )
                 .join('')}
             </ul>
           </details>`
    }`;
}

/**
 * A readable name for an audit action, or the action itself.
 *
 * The dictionary carries the ones that can land on an applicant's account, and
 * falls back to the stored name for anything else rather than printing a raw
 * key. Phase 9 adds cron actions and phase 11 adds Telegram ones, and neither
 * should make this list wrong the day they ship.
 */
function auditLabel(action) {
  const key = `audit.${action}`;
  const label = t(key);
  return label === key ? action.replace(/_/g, ' ') : label;
}

/* -------------------------------------------------------------------------
 * The six actions
 * ---------------------------------------------------------------------- */

async function act(body, successKey, account) {
  const result = await api('/api/admin/applicants', { method: 'POST', body });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return false;
  }

  detailDialog?.close();
  adminMessage('ok', t(successKey, { name: account.display_name }));
  await load();
  return true;
}

async function setActive(account, active) {
  const answer = await confirmAction({
    title: t(active ? 'admin.confirmReactivate' : 'admin.confirmDeactivate', {
      name: account.display_name,
    }),
    body: t(active ? 'admin.confirmReactivateBody' : 'admin.confirmDeactivateBody'),
    confirmLabel: t(active ? 'admin.reactivateAccount' : 'admin.deactivateAccount'),
    danger: !active,
    field: {
      label: t('admin.reasonOptional'),
      hint: t('admin.reasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  await act(
    {
      action: active ? 'reactivate' : 'deactivate',
      applicant_id: account.id,
      reason: answer.value || null,
    },
    active ? 'admin.accountReactivated' : 'admin.accountDeactivated',
    account
  );
}

/**
 * Force a new password at the next sign in.
 *
 * The one 8.9 says to prefer, and the confirmation says why in one line: nobody
 * learns a password, so the log can still say the applicant chose the one they
 * end up with.
 */
async function forceReset(account) {
  const answer = await confirmAction({
    title: t('admin.confirmForceReset', { name: account.display_name }),
    body: t('admin.confirmForceResetBody'),
    consequences: [t('admin.consequenceSessions'), t('admin.consequenceNoPassword')],
    confirmLabel: t('admin.forceReset'),
    danger: false,
    field: {
      label: t('admin.reasonRequired'),
      hint: t('admin.reasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  if (!answer.value) {
    adminMessage('error', t('admin.reasonMissing'));
    return;
  }

  await act(
    { action: 'force_reset', applicant_id: account.id, reason: answer.value },
    'admin.resetForced',
    account
  );
}

async function unlinkTelegram(account, telegram) {
  if (!telegram) {
    adminMessage('error', t('admin.telegramNotLinked'));
    return;
  }

  const answer = await confirmAction({
    title: t('admin.confirmUnlink', { name: account.display_name }),
    body: t('admin.confirmUnlinkBody'),
    consequences: [t('admin.consequenceSessions')],
    confirmLabel: t('admin.unlinkTelegram'),
    field: {
      label: t('admin.reasonRequired'),
      hint: t('admin.reasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;
  if (!answer.value) {
    adminMessage('error', t('admin.reasonMissing'));
    return;
  }

  await act(
    { action: 'unlink_telegram', applicant_id: account.id, reason: answer.value },
    'admin.telegramUnlinked',
    account
  );
}

/**
 * Set somebody's password.
 *
 * Two fields and a warning, in its own dialog rather than through confirmAction,
 * because this one needs a password box and a reason box together and the shared
 * confirmation carries one field by design.
 *
 * The password is shown as typed rather than masked. It has to be read aloud or
 * copied to the person it belongs to, and an admin who cannot see what they
 * typed is an admin who hands over a typo. Nothing is echoed back afterwards:
 * only a bcrypt hash is stored, so there is nothing to show later even if the
 * page wanted to.
 */
async function setPassword(account) {
  const dialog = createDialog({
    id: 'setPasswordDialog',
    titleKey: 'admin.setPassword',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <div class="callout danger">
          <p><strong>${escapeHtml(t('admin.setPasswordCost'))}</strong></p>
          <p>${escapeHtml(t('admin.setPasswordPrefer'))}</p>
        </div>

        <div class="field">
          <label for="newPassword">${escapeHtml(
            t('admin.newPasswordFor', { name: account.display_name })
          )}</label>
          <input id="newPassword" type="text" autocomplete="off" data-autofocus>
          <p class="field-hint">${escapeHtml(t('admin.newPasswordHint'))}</p>
          <p class="field-error" data-error-for="password" hidden></p>
        </div>

        <div class="field">
          <label for="passwordReason">${escapeHtml(t('admin.reasonRequired'))}</label>
          <textarea id="passwordReason" rows="2" maxlength="300"></textarea>
          <p class="field-hint">${escapeHtml(t('admin.reasonHint'))}</p>
          <p class="field-error" data-error-for="reason" hidden></p>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-danger" data-save>${escapeHtml(
            t('admin.setPassword')
          )}</button>
        </div>
      </div>`,
  });

  dialog.element.querySelector('[data-save]')?.addEventListener('click', () => {
    runAction(async () => {
      const root = dialog.element;
      root.querySelectorAll('[data-error-for]').forEach((node) => {
        node.hidden = true;
        node.textContent = '';
      });

      const result = await api('/api/admin/applicants', {
        method: 'POST',
        body: {
          action: 'set_password',
          applicant_id: account.id,
          password: root.querySelector('#newPassword').value,
          reason: root.querySelector('#passwordReason').value.trim(),
        },
      });

      if (!result.ok) {
        for (const [field, code] of Object.entries(result.error?.details ?? {})) {
          if (typeof code !== 'string') continue;
          const node = root.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
          if (node) {
            node.textContent = t(`field.${code}`);
            node.hidden = false;
          }
        }
        adminMessage('error', result.error?.message ?? t('error.unexpected'));
        return;
      }

      dialog.close();
      detailDialog?.close();
      adminMessage('ok', t('admin.passwordSet', { name: account.display_name }));
      await load();
    }, 'set password');
  });

  dialog.open();
}

/**
 * Delete an account permanently.
 *
 * 7g's three step confirmation, through the same component the applicant's own
 * danger zone uses, so the two say the same things in the same order. What is
 * different is step three: the applicant proves it is them with their password,
 * and an admin cannot, so this asks for the account's username typed exactly.
 * The route re-checks it.
 */
async function remove(account) {
  const confirmed = await confirmDangerousAction({
    title: t('admin.deleteAccountTitle', { name: account.display_name }),
    consequences: [
      t('admin.deleteConsequenceRows'),
      t('admin.deleteConsequenceAnalytics'),
      t('admin.deleteConsequenceForms'),
    ],
    confirmLabel: t('admin.deleteAccount'),
    // Their username, typed exactly. Not the display name, which is easy to
    // copy off the row above by accident, and not the admin's own.
    username: account.username,
    irreversible: t('admin.deleteConsequenceIrreversible'),
    // The same call deviation 38 made for deleting a posting: the caller is
    // already a staff session with is_admin, re-checked on the request, so the
    // third step would be a second prompt for the credential the session
    // already proves. The applicant's own danger zone still asks for all three,
    // because there the password is what proves it is them.
    skipPassword: true,
  });

  if (!confirmed) return;

  await act(
    {
      action: 'delete',
      applicant_id: account.id,
      confirm_username: account.username,
      reason: null,
    },
    'admin.accountDeleted',
    account
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
