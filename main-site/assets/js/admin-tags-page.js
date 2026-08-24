// /admin/tags. Section 8.7.
//
// "List with usage counts and search. Create, rename, recolour, and delete,
// where deleting warns how many postings will lose the tag. Merge two tags into
// one, moving all job links across and removing the duplicate. Find and clean up
// orphan tags with zero postings."
//
// The one thing this page has to be careful about saying is which count it is
// showing, because there are two and they differ:
//
//   **Published** is gftvjobs_tags.usage_count, maintained by the trigger in
//   migration 007, and counts published postings only.
//   **All** is the join rows, and includes drafts.
//
// A tag reading zero published can still be on three drafts, and deleting it
// would take it off them. So the orphan view filters on the second, and the
// delete warning quotes the second, and the column headings say which is which.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction } from './danger-confirm.js';
import { mountAdminPage, adminMessage, emptyRow, adminLocales } from './admin-shell.js';

const PATH = '/admin/tags';

const state = { q: '', orphans: false };
let tags = [];

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  wireToolbar();
  await load();

  document.addEventListener('gftv:localechange', () => draw());
}

function wireToolbar() {
  const form = document.querySelector('#tagFilters');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = form.querySelector('[name="q"]').value.trim();
    load();
  });

  const orphans = document.querySelector('#showOrphans');
  orphans?.addEventListener('change', () => {
    state.orphans = orphans.checked;
    load();
  });

  document.querySelector('#newTag')?.addEventListener('click', () => openEditor(null));
}

async function load() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.orphans) params.set('orphans', 'true');

  const result = await api(`/api/admin/tags?${params.toString()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  tags = result.data.tags ?? [];
  draw();
}

function draw() {
  const list = document.querySelector('#tagList');
  if (!list) return;

  if (tags.length === 0) {
    list.innerHTML = emptyRow(t(state.orphans ? 'admin.noOrphanTags' : 'admin.noTags'));
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colTag'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguages'))}</th>
          <th scope="col" title="${escapeHtml(t('admin.colPublishedHint'))}">${escapeHtml(
            t('admin.colPublished')
          )}</th>
          <th scope="col" title="${escapeHtml(t('admin.colAllPostingsHint'))}">${escapeHtml(
            t('admin.colAllPostings')
          )}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${tags
          .map(
            (tag) => `
          <tr data-tag-id="${escapeHtml(tag.id)}">
            <td>
              <span class="chip"${
                tag.colour ? ` style="--chip-colour: ${escapeHtml(tag.colour)}"` : ''
              }>${escapeHtml(tag.name)}</span>
              <span class="admin-sub muted">${escapeHtml(tag.slug)}</span>
            </td>
            <td>${languageMarkup(tag)}</td>
            <td class="tabular">${tag.published_count ?? 0}</td>
            <td class="tabular">${tag.job_count ?? 0}</td>
            <td class="admin-row-actions">
              <button type="button" class="btn btn-quiet small" data-edit>
                ${iconMarkup('edit', { size: 15 })}<span>${escapeHtml(t('admin.edit'))}</span>
              </button>
              <button type="button" class="btn btn-quiet small" data-merge>
                ${escapeHtml(t('admin.merge'))}
              </button>
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

function languageMarkup(tag) {
  return `<span class="admin-langs">${adminLocales()
    .map((locale) => {
      // Named mark, not state: the module already has a state object
      // holding the filters, and one shadowing the other inside a map is the
      // sort of thing that reads correctly and edits wrongly.
      const mark = locale.is_default
        ? 'complete'
        : tag.translations?.[locale.code]?.name
          ? 'complete'
          : 'absent';
      return `<span class="admin-lang admin-lang-${mark}" title="${escapeHtml(
        t(`admin.translation_${mark}`)
      )}">${escapeHtml(locale.code)}</span>`;
    })
    .join('')}</span>`;
}

function wireRows(root) {
  root.querySelectorAll('[data-tag-id]').forEach((row) => {
    const tag = tags.find((candidate) => candidate.id === row.getAttribute('data-tag-id'));
    if (!tag) return;

    row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(tag));
    row.querySelector('[data-merge]')?.addEventListener('click', () => openMerge(tag));
    row.querySelector('[data-delete]')?.addEventListener('click', () => remove(tag));
  });
}

/* -------------------------------------------------------------------------
 * The editor
 * ---------------------------------------------------------------------- */

function openEditor(tag) {
  const others = adminLocales().filter((locale) => !locale.is_default);

  const dialog = createDialog({
    id: 'tagEditor',
    titleKey: tag ? 'admin.editTag' : 'admin.newTag',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <div class="field">
          <label for="tagName">${escapeHtml(t('admin.tagName'))}</label>
          <input id="tagName" type="text" maxlength="60" data-autofocus
                 value="${escapeHtml(tag?.name ?? '')}">
          <p class="field-error" data-error-for="name" hidden></p>
        </div>

        ${
          tag
            ? `<p class="field-hint">${escapeHtml(t('admin.tagSlugFixed', { slug: tag.slug }))}</p>`
            : ''
        }

        <div class="field">
          <label for="tagDescription">${escapeHtml(t('admin.tagDescription'))}</label>
          <input id="tagDescription" type="text" maxlength="300"
                 value="${escapeHtml(tag?.description ?? '')}">
        </div>

        <div class="field">
          <label for="tagColour">${escapeHtml(t('admin.tagColour'))}</label>
          <input id="tagColour" type="color" value="${escapeHtml(tag?.colour ?? '#888888')}">
          <label class="checkbox-row">
            <input type="checkbox" id="tagNoColour" ${tag?.colour ? '' : 'checked'}>
            <span>${escapeHtml(t('admin.tagDefaultColour'))}</span>
          </label>
          <p class="field-hint">${escapeHtml(t('admin.tagColourHint'))}</p>
          <p class="field-error" data-error-for="colour" hidden></p>
        </div>

        ${others
          .map(
            (locale) => `
          <div class="field">
            <label for="tagName-${locale.code}">${escapeHtml(
              t('admin.tagNameIn', { language: locale.native_name })
            )}</label>
            <input id="tagName-${locale.code}" type="text" maxlength="60"
                   data-locale-name="${locale.code}"
                   value="${escapeHtml(tag?.translations?.[locale.code]?.name ?? '')}">
          </div>`
          )
          .join('')}

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

  dialog.element.querySelector('[data-save]').addEventListener('click', async () => {
    const root = dialog.element;

    const translations = {};
    root.querySelectorAll('[data-locale-name]').forEach((input) => {
      translations[input.getAttribute('data-locale-name')] = { name: input.value.trim() };
    });

    const result = await api('/api/admin/tags', {
      method: 'POST',
      body: {
        action: 'save',
        id: tag?.id ?? null,
        name: root.querySelector('#tagName').value.trim(),
        description: root.querySelector('#tagDescription').value.trim(),
        // The default is null instead of a grey, so a tag with no colour is
        // styled by the theme and follows it into dark mode. A stored grey would
        // not, which is the whole reason the column is nullable.
        colour: root.querySelector('#tagNoColour').checked
          ? null
          : root.querySelector('#tagColour').value,
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
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    dialog.close();
    adminMessage('ok', t('admin.saved'));
    await load();
  });

  dialog.open();
}

/* -------------------------------------------------------------------------
 * Merging
 * ---------------------------------------------------------------------- */

/**
 * Merge this tag into another, per 8.7.
 *
 * The direction is stated and not implied: the tag whose row was clicked is
 * the one that disappears, and the panel says so twice, because a merge run the
 * wrong way round cannot be undone by running it again.
 */
function openMerge(source) {
  const targets = tags.filter((tag) => tag.id !== source.id);

  const dialog = createDialog({
    id: 'tagMerge',
    titleKey: 'admin.mergeTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p>${escapeHtml(t('admin.mergeExplainer', { name: source.name }))}</p>

        <div class="field">
          <label for="mergeTarget">${escapeHtml(t('admin.mergeInto'))}</label>
          <select id="mergeTarget" data-autofocus>
            ${targets
              .map(
                (tag) =>
                  `<option value="${escapeHtml(tag.id)}">${escapeHtml(tag.name)} (${
                    tag.job_count ?? 0
                  })</option>`
              )
              .join('')}
          </select>
        </div>

        <p class="callout warn">${escapeHtml(
          t('admin.mergeWarning', { name: source.name, count: source.job_count ?? 0 })
        )}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
          <button type="button" class="btn btn-primary" data-merge>${escapeHtml(
            t('admin.mergeConfirm')
          )}</button>
        </div>
      </div>`,
  });

  dialog.element.querySelector('[data-merge]').addEventListener('click', async () => {
    const targetId = dialog.element.querySelector('#mergeTarget').value;
    if (!targetId) return;

    const result = await api('/api/admin/tags', {
      method: 'POST',
      body: { action: 'merge', source_id: source.id, target_id: targetId },
    });

    if (!result.ok) {
      adminMessage('error', result.error?.message ?? t('error.unexpected'));
      return;
    }

    dialog.close();
    adminMessage('ok', t('admin.merged', { count: result.data.moved }));
    await load();
  });

  dialog.open();
}

async function remove(tag) {
  const count = tag.job_count ?? 0;

  const confirmed = await confirmAction({
    title: t('admin.deleteTagConfirm', { name: tag.name }),
    // The join rows cascade, so the postings survive and lose the tag. Worth
    // knowing before, not after: a published posting that loses its last
    // tag cannot be republished until it gets another.
    consequences: count > 0 ? [t('admin.deleteTagImpact', { count })] : [],
    confirmLabel: t('admin.delete'),
  });

  if (!confirmed) return;

  const result = await api('/api/admin/tags', {
    method: 'POST',
    body: { action: 'delete', id: tag.id, confirm_count: count },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.tagDeleted', { name: tag.name }));
  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
