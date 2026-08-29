// /admin/admins. Section 8.8.
//
// Who can open this dashboard, and the one lever that decides it. Everything
// else about a staff account belongs to gftv.asia, and the page says so in a
// callout instead of leaving somebody to find out by looking for a control
// that is not there.
//
// Four things the drawing has to get right:
//
//   **Access is resolved, not described.** The rule has three steps, per
//   hasPortalAccess: approval, then an overlay row if there is one, then the
//   gftv.asia role. The server resolves it and the row says yes or no; making
//   an admin run that rule in their head off two columns is how somebody gets
//   revoked and stays in.
//
//   **Three states, and the third is not "off".** Granted, denied, and left to
//   the role. The last one is what an admin wants after a temporary revocation,
//   and without it the only way back is a grant that then ignores whatever
//   happens to that person's role at gftv.asia.
//
//   **The role is shown with what it opens.** 8.8 asks for that in as many
//   words: "granting somebody editor access and expecting them to read the
//   developer guide is a mistake that is easier to make than to notice".
//
//   **Nobody revokes their own access.** The control is absent for the signed
//   in account, not disabled, per deviation 34: this is a permission,
//   not an unbuilt feature. The endpoint refuses it as well.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction } from './danger-confirm.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminApiError, adminMessage, emptyRow, runAction } from './admin-shell.js';
import {
  loadBuildStatus,
  isFeatureShipped,
  phaseForFeature,
  unavailableSentence,
} from './build-status.js';

const PATH = '/admin/admins';

/** How long to wait after a keystroke before searching. */
const SEARCH_DELAY = 250;

let accounts = [];
let selfId = null;
let buildStatus = null;
let picker = null;
let searchTimer = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  // For the one sentence on this page that describes something not built yet.
  // Cached by build-status.js, so this is the same object admin-shell already
  // fetched and not a second request.
  buildStatus = await loadBuildStatus();

  document.querySelector('#grantAccess')?.addEventListener('click', () => {
    runAction(openPicker, 'grant access');
  });

  await load();

  document.addEventListener('gftv:localechange', () => draw());
}

async function load() {
  const result = await api('/api/admin/admins');

  if (!result.ok) {
    // A job poster who typed the URL gets a 403 here, and the honest thing is
    // to say so instead of drawing an empty table. The sidebar does not offer
    // them the item at all, per deviation 34.
    adminApiError(result.error);
    return;
  }

  accounts = result.data.accounts ?? [];
  selfId = result.data.self_id ?? null;
  draw();
}

function draw() {
  const list = document.querySelector('#staffList');
  if (!list) return;

  if (accounts.length === 0) {
    list.innerHTML = emptyRow(t('admin.noStaffAccounts'));
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colStaff'))}</th>
          <th scope="col">${escapeHtml(t('admin.colRole'))}</th>
          <th scope="col">${escapeHtml(t('admin.colAccess'))}</th>
          <th scope="col">${escapeHtml(t('admin.colSecondFactor'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLastSignIn'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>${accounts.map(rowMarkup).join('')}</tbody>
    </table>`;

  wireRows(list);
}

function rowMarkup(account) {
  const isSelf = account.id === selfId;

  return `
    <tr data-staff-id="${escapeHtml(account.id)}">
      <td>
        <span class="admin-row-title">${escapeHtml(account.username)}</span>
        ${
          isSelf
            ? `<span class="admin-sub muted">${escapeHtml(t('admin.thatIsYou'))}</span>`
            : ''
        }
        ${
          account.is_approved
            ? ''
            : `<span class="admin-sub muted">${escapeHtml(t('admin.notApproved'))}</span>`
        }
      </td>
      <td>
        <span class="badge">${escapeHtml(
          t(account.is_admin ? 'admin.roleAdmin' : 'admin.rolePoster')
        )}</span>
        <span class="admin-sub muted">${escapeHtml(
          t(account.is_admin ? 'admin.roleAdminOpens' : 'admin.rolePosterOpens')
        )}</span>
        ${docsNote()}
      </td>
      <td>
        <span class="badge ${account.has_access ? 'badge-open' : 'badge-closed'}">${escapeHtml(
          t(account.has_access ? 'admin.accessYes' : 'admin.accessNo')
        )}</span>
        <span class="admin-sub muted">${escapeHtml(
          t(`admin.accessState_${account.access_state}`)
        )}</span>
        ${
          account.access_reason
            ? `<span class="admin-sub muted">${escapeHtml(account.access_reason)}</span>`
            : ''
        }
      </td>
      <td>${secondFactorMarkup(account.second_factor)}</td>
      <td class="tabular">${lastSignInMarkup(account.last_sign_in)}</td>
      <td class="admin-row-actions">
        ${
          isSelf
            ? ''
            : `${
                account.access_state === 'denied'
                  ? ''
                  : `<button type="button" class="btn btn-quiet small danger" data-deny>${escapeHtml(
                      t('admin.revokeAccess')
                    )}</button>`
              }
               ${
                 account.access_state === 'granted'
                   ? ''
                   : `<button type="button" class="btn btn-quiet small" data-grant>${escapeHtml(
                       t('admin.allowAccess')
                     )}</button>`
               }
               ${
                 account.access_state === 'default'
                   ? ''
                   : `<button type="button" class="btn btn-quiet small" data-default>${escapeHtml(
                       t('admin.useRole')
                     )}</button>`
               }`
        }
      </td>
    </tr>`;
}

/**
 * The line under what a role opens, when the place it opens does not exist yet.
 *
 * 8.8 asks for the sentence about the docs site in as many words, and the docs
 * site is two phases away. Written as the phase sentence from the feature map
 * in place of prose, so nothing here hardcodes a phase number, per 0c, and
 * the note disappears on its own the day docs_site ships.
 */
function docsNote() {
  if (!buildStatus || isFeatureShipped(buildStatus, 'docs_site')) return '';

  const phase = phaseForFeature(buildStatus, 'docs_site');
  return `<span class="admin-sub muted">${escapeHtml(unavailableSentence(phase))}</span>`;
}

/**
 * Three facts, not a tick.
 *
 * An account with a passkey and no backup codes is one lost phone away from
 * being locked out of both realms, and an account with neither is signing in
 * with a password alone. Both are worth seeing at a glance, and neither is
 * visible in a column that says "2FA: yes".
 */
function secondFactorMarkup(factors) {
  const parts = [];

  if (factors.passkeys > 0) parts.push(t('admin.factorPasskeys', { count: factors.passkeys }));
  if (factors.totp) parts.push(t('admin.factorTotp'));
  if (factors.backup_codes > 0) {
    parts.push(t('admin.factorBackupCodes', { count: factors.backup_codes }));
  }

  if (parts.length === 0) {
    return `<span class="badge badge-warn">${escapeHtml(t('admin.factorNone'))}</span>`;
  }

  return `<span class="admin-sub">${escapeHtml(parts.join(', '))}</span>`;
}

function lastSignInMarkup(last) {
  if (!last) return `<span class="muted">${escapeHtml(t('admin.neverSignedIn'))}</span>`;

  return (
    `${escapeHtml(formatDate(last.at))}` +
    (last.second_factor
      ? `<span class="admin-sub muted">${escapeHtml(
          t(`admin.factorUsed_${last.second_factor}`)
        )}</span>`
      : '')
  );
}

function wireRows(root) {
  root.querySelectorAll('[data-staff-id]').forEach((row) => {
    const id = row.getAttribute('data-staff-id');
    const account = accounts.find((candidate) => candidate.id === id);
    if (!account) return;

    row.querySelector('[data-grant]')?.addEventListener('click', () => {
      runAction(() => setState(account, 'granted'), 'grant access');
    });
    row.querySelector('[data-deny]')?.addEventListener('click', () => {
      runAction(() => setState(account, 'denied'), 'revoke access');
    });
    row.querySelector('[data-default]')?.addEventListener('click', () => {
      runAction(() => setState(account, 'default'), 'reset access');
    });
  });
}

/* -------------------------------------------------------------------------
 * Changing access
 * ---------------------------------------------------------------------- */

/**
 * Grant, revoke, or hand the decision back to the role.
 *
 * Revoking asks for a reason and will not go without one, which the server
 * enforces too: it is the change the person on the other end will ask about.
 * The other two directions take an optional note.
 */
async function setState(account, state) {
  const answer = await confirmAction({
    title: t(`admin.confirmAccess_${state}`, { name: account.username }),
    body: t(`admin.confirmAccessBody_${state}`),
    consequences:
      state === 'default'
        ? [
            t(
              account.is_admin || account.is_editor
                ? 'admin.roleWouldAllow'
                : 'admin.roleWouldRefuse'
            ),
          ]
        : undefined,
    confirmLabel: t(`admin.confirmAccessAction_${state}`),
    danger: state === 'denied',
    field: {
      label: t(state === 'denied' ? 'admin.reasonRequired' : 'admin.reasonOptional'),
      hint: t('admin.reasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  const result = await api('/api/admin/admins', {
    method: 'POST',
    body: {
      action: 'set',
      staff_id: account.id,
      state,
      reason: answer.value || null,
    },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  adminMessage('ok', t(`admin.accessChanged_${state}`, { name: account.username }));
  await load();
}

/* -------------------------------------------------------------------------
 * Granting access to somebody with no role
 * ---------------------------------------------------------------------- */

/**
 * Find a staff account by username and let it in.
 *
 * The only way into this portal for somebody who is neither an admin nor an
 * editor at gftv.asia, which is a real case: whoever is running a recruitment
 * round is not necessarily either of those things. Account creation is still
 * gftv.asia's, so this searches and does not offer to make one, and it says so
 * when nothing matches.
 */
function openPicker() {
  picker = createDialog({
    id: 'staffPicker',
    titleKey: 'admin.grantAccess',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="muted">${escapeHtml(t('admin.grantAccessBody'))}</p>

        <div class="field">
          <label for="staffSearch">${escapeHtml(t('admin.findStaff'))}</label>
          <input id="staffSearch" type="search" autocomplete="off" data-autofocus>
        </div>

        <div id="staffResults" class="admin-people" aria-live="polite"></div>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
        </div>
      </div>`,
  });

  const search = picker.element.querySelector('#staffSearch');

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      runAction(() => searchStaff(search.value), 'staff search');
    }, SEARCH_DELAY);
  });

  picker.open();
}

async function searchStaff(term) {
  const holder = picker?.element.querySelector('#staffResults');
  if (!holder) return;

  if (!term.trim()) {
    holder.innerHTML = '';
    return;
  }

  const result = await api(`/api/admin/admins?search=${encodeURIComponent(term)}`);

  if (!result.ok) {
    holder.innerHTML = emptyRow(result.error?.message ?? t('error.unexpected'));
    return;
  }

  const found = result.data.accounts ?? [];

  if (found.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noStaffFound'));
    return;
  }

  holder.innerHTML = found
    .map((account) => {
      const already = accounts.find((row) => row.id === account.id && row.has_access);

      return `
        <div class="admin-person">
          <span class="admin-person-name">${escapeHtml(account.username)}</span>
          ${
            account.is_approved
              ? ''
              : `<span class="badge badge-warn">${escapeHtml(t('admin.notApproved'))}</span>`
          }
          ${
            already
              ? `<span class="badge badge-open">${escapeHtml(t('admin.accessYes'))}</span>`
              : `<button type="button" class="btn btn-secondary small"
                         data-allow="${escapeHtml(account.id)}">${escapeHtml(
                           t('admin.allowAccess')
                         )}</button>`
          }
        </div>`;
    })
    .join('');

  holder.querySelectorAll('[data-allow]').forEach((button) => {
    button.addEventListener('click', () => {
      const account = found.find((row) => row.id === button.getAttribute('data-allow'));
      if (!account) return;
      picker.close();
      runAction(() => setState({ ...account, access_state: 'default' }, 'granted'), 'grant access');
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
