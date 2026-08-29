// /admin/departments. Section 8.6.
//
// "Simple CRUD, with the name and description edited as an English and Mandarin
// pair. A department cannot be left active without a Chinese name, since it
// appears on every job card and in the search filters."
//
// That rule is generalised here, exactly as the endpoint generalises it: an
// active department needs a name in **every** active language, read from
// gftvjobs_locales. Writing it against Chinese would mean finding this file
// again when Malay arrives in phase 15.
//
// The active toggle is where the rule bites, and the page has to make that
// legible: a department with a missing name can exist, it just cannot be
// switched on. So the checkbox refuses, not the save, and the reason
// names the language.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction } from './danger-confirm.js';
import { mountAdminPage, adminApiError, adminMessage, emptyRow, adminLocales } from './admin-shell.js';

const PATH = '/admin/departments';

let departments = [];
let editorDialog = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  document.querySelector('#newDepartment')?.addEventListener('click', () => openEditor(null));

  await load();

  document.addEventListener('gftv:localechange', () => draw());
}

async function load() {
  const result = await api('/api/admin/departments');

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  departments = result.data.departments ?? [];
  draw();
}

function draw() {
  const list = document.querySelector('#departmentList');
  if (!list) return;

  if (departments.length === 0) {
    list.innerHTML = emptyRow(t('admin.noDepartments'));
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colTeam'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguages'))}</th>
          <th scope="col">${escapeHtml(t('admin.colPostings'))}</th>
          <th scope="col">${escapeHtml(t('admin.colActive'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${departments
          .map(
            (department, index) => `
          <tr data-department-id="${escapeHtml(department.id)}">
            <td>
              <span class="admin-row-title">${escapeHtml(department.name)}</span>
              <span class="admin-sub muted">${escapeHtml(department.slug)}</span>
            </td>
            <td>${languageMarkup(department)}</td>
            <td class="tabular">${department.job_count ?? 0}</td>
            <td>${
              department.is_active
                ? `<span class="badge badge-open">${escapeHtml(t('admin.active'))}</span>`
                : `<span class="badge badge-closed">${escapeHtml(t('admin.inactive'))}</span>`
            }</td>
            <td class="admin-row-actions">
              <button type="button" class="btn btn-quiet small" data-edit>
                ${iconMarkup('edit', { size: 15 })}<span>${escapeHtml(t('admin.edit'))}</span>
              </button>
              <button type="button" class="icon-btn small" data-move="up"
                      ${index === 0 ? 'disabled' : ''}
                      aria-label="${escapeHtml(t('admin.moveUp'))}">&#8593;</button>
              <button type="button" class="icon-btn small" data-move="down"
                      ${index === departments.length - 1 ? 'disabled' : ''}
                      aria-label="${escapeHtml(t('admin.moveDown'))}">&#8595;</button>
              <button type="button" class="btn btn-quiet small danger" data-delete>
                ${iconMarkup('trash', { size: 15 })}<span>${escapeHtml(t('admin.delete'))}</span>
              </button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;

  hydrateIcons(list);
  wireRows(list);
}

function languageMarkup(department) {
  return `<span class="admin-langs">${adminLocales()
    .map((locale) => {
      // A team has no in progress state, unlike a posting: a translation row
      // either carries a name or does not, because migration 014 makes the
      // column not null. So this is complete or absent and never the third.
      const mark = locale.is_default
        ? 'complete'
        : department.translations?.[locale.code]?.name
          ? 'complete'
          : 'absent';
      return `<span class="admin-lang admin-lang-${mark}" title="${escapeHtml(
        t(`admin.translation_${mark}`)
      )}">${escapeHtml(locale.code)}</span>`;
    })
    .join('')}</span>`;
}

function wireRows(root) {
  root.querySelectorAll('[data-department-id]').forEach((row, index) => {
    const id = row.getAttribute('data-department-id');
    const department = departments.find((candidate) => candidate.id === id);
    if (!department) return;

    row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(department));
    row.querySelector('[data-delete]')?.addEventListener('click', () => remove(department));

    row.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('click', () => move(index, button.getAttribute('data-move')));
    });
  });
}

async function move(index, direction) {
  const to = index + (direction === 'up' ? -1 : 1);
  if (to < 0 || to >= departments.length) return;

  const order = departments.map((department) => department.id);
  [order[index], order[to]] = [order[to], order[index]];

  const result = await api('/api/admin/departments', {
    method: 'POST',
    body: { action: 'reorder', ids: order },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  await load();
}

/* -------------------------------------------------------------------------
 * The editor
 * ---------------------------------------------------------------------- */

function openEditor(department) {
  const locales = adminLocales();
  const base = locales.find((locale) => locale.is_default) ?? locales[0];
  const others = locales.filter((locale) => !locale.is_default);

  editorDialog = createDialog({
    id: 'departmentEditor',
    titleKey: department ? 'admin.editTeam' : 'admin.newTeam',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <div class="field">
          <label for="deptName">${escapeHtml(
            t('admin.teamNameIn', { language: base.native_name })
          )}</label>
          <input id="deptName" type="text" maxlength="80" data-autofocus
                 value="${escapeHtml(department?.name ?? '')}">
          <p class="field-error" data-error-for="name" hidden></p>
        </div>

        <div class="field">
          <label for="deptDescription">${escapeHtml(t('admin.teamDescription'))}</label>
          <textarea id="deptDescription" rows="2" maxlength="500">${escapeHtml(
            department?.description ?? ''
          )}</textarea>
        </div>

        ${others
          .map(
            (locale) => `
          <div class="field">
            <label for="deptName-${locale.code}">${escapeHtml(
              t('admin.teamNameIn', { language: locale.native_name })
            )}</label>
            <input id="deptName-${locale.code}" type="text" maxlength="80"
                   data-locale-name="${locale.code}"
                   value="${escapeHtml(department?.translations?.[locale.code]?.name ?? '')}">
            <p class="field-error" data-error-for="${locale.code}.name" hidden></p>
          </div>
          <div class="field">
            <label for="deptDesc-${locale.code}">${escapeHtml(
              t('admin.teamDescriptionIn', { language: locale.native_name })
            )}</label>
            <textarea id="deptDesc-${locale.code}" rows="2" maxlength="500"
                      data-locale-description="${locale.code}">${escapeHtml(
                        department?.translations?.[locale.code]?.description ?? ''
                      )}</textarea>
          </div>`
          )
          .join('')}

        <label class="checkbox-row">
          <input type="checkbox" id="deptActive" ${
            department ? (department.is_active ? 'checked' : '') : 'checked'
          }>
          <span>${escapeHtml(t('admin.teamActive'))}</span>
        </label>
        <p class="field-hint">${escapeHtml(t('admin.teamActiveHint'))}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-primary" data-save>${escapeHtml(
            t('admin.save')
          )}</button>
        </div>
      </div>`,
  });

  editorDialog.element.querySelector('[data-save]').addEventListener('click', () => {
    save(department, editorDialog);
  });

  editorDialog.open();
}

async function save(department, dialog) {
  const root = dialog.element;

  root.querySelectorAll('[data-error-for]').forEach((node) => {
    node.hidden = true;
    node.textContent = '';
  });

  const translations = {};
  root.querySelectorAll('[data-locale-name]').forEach((input) => {
    const code = input.getAttribute('data-locale-name');
    translations[code] = translations[code] ?? {};
    translations[code].name = input.value.trim();
  });
  root.querySelectorAll('[data-locale-description]').forEach((input) => {
    const code = input.getAttribute('data-locale-description');
    translations[code] = translations[code] ?? {};
    translations[code].description = input.value.trim();
  });

  const result = await api('/api/admin/departments', {
    method: 'POST',
    body: {
      action: 'save',
      id: department?.id ?? null,
      name: root.querySelector('#deptName').value.trim(),
      description: root.querySelector('#deptDescription').value.trim(),
      is_active: root.querySelector('#deptActive').checked,
      translations,
    },
  });

  if (!result.ok) {
    const details = result.error?.details ?? {};
    for (const [field, code] of Object.entries(details)) {
      const node = root.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
      if (node) {
        node.textContent = t(`field.${code}`);
        node.hidden = false;
      }
    }
    adminApiError(result.error);
    return;
  }

  dialog.close();
  adminMessage('ok', t('admin.saved'));
  await load();
}

/**
 * Delete a team.
 *
 * Not a cascade: migration 005 sets a posting's department_id to null, so the
 * postings survive and lose their team. That still changes live postings, so the
 * count is confirmed instead of described, the same way 8.2 handles deleting a
 * posting.
 */
async function remove(department) {
  const count = department.job_count ?? 0;

  const confirmed = await confirmAction({
    title: t('admin.deleteTeamConfirm', { name: department.name }),
    // Counted, not described, the same way 8.2 handles a posting: an
    // admin about to detach eleven postings should see the eleven.
    consequences:
      count > 0
        ? [t('admin.deleteTeamImpact', { count }), t('admin.deleteTeamKeeps')]
        : [t('admin.deleteTeamKeeps')],
    confirmLabel: t('admin.delete'),
  });

  if (!confirmed) return;

  const result = await api('/api/admin/departments', {
    method: 'POST',
    body: { action: 'delete', id: department.id, confirm_count: count },
  });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  adminMessage('ok', t('admin.teamDeleted', { name: department.name }));
  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
