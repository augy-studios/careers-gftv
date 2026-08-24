// /admin/settings. Section 8.10.
//
// "Portal title, hero copy, featured job selection, application open or closed
// global toggle. The portal title and hero copy are edited in both languages."
//
// The whole page is five settings and a save button, so what is worth writing
// down is the three places it deliberately does more than that.
//
//   **The applications toggle is not part of the save.** It sits above the
//   form, in its own card, with its own action and its own confirmation. 8.12
//   is explicit that this and a maintenance flip are never merged, and the
//   difference the two exist to keep is one an applicant can read: closing the
//   board is a policy choice, and a maintenance flip says something is broken.
//   Folding a policy switch into a Save button beside a hero line would make it
//   the third thing: an editorial change.
//
//   **Everything on this page is slower than it looks**, and says so. A setting
//   is cached for a minute per serverless instance, per CACHE_MS in
//   settings.js, so an applicant already looking at a posting keeps the old
//   answer for about that long. Deviation 16 recorded that for
//   `applications_open`, and it is true of the hero line too. An admin who
//   reloads twice and concludes the save failed is the cost of not saying it.
//
//   **A locale change redraws the form, so the form is read first.** Every
//   field's current value goes back into state before anything is redrawn.
//   Phase 7's third defect was exactly this shape from the other side: a redraw
//   resurrecting a value the admin had already replaced.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { confirmAction } from './danger-confirm.js';
import { mountAdminPage, adminMessage, adminLocales, runAction } from './admin-shell.js';

const PATH = '/admin/settings';

/** The three settings edited as a per language object, per migration 018. */
const TEXT_KEYS = ['portal_title', 'hero_heading', 'hero_body'];

/** What came back from the endpoint, and what is on screen but not yet saved. */
let state = null;
let dirty = false;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  await load();

  document.querySelector('#settingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(save, 'settings save');
  });

  document.querySelector('#settingsForm')?.addEventListener('input', () => {
    dirty = true;
  });

  document.addEventListener('gftv:localechange', () => {
    // Read before redrawing. The labels are translated and the values are not,
    // and the values are the admin's work.
    collect();
    draw();
  });

  // 8.2's editor asks before losing an edit and this page holds the wording of
  // the home page, which is the same kind of work.
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function load() {
  const result = await api('/api/admin/settings');

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  state = result.data;
  dirty = false;
  draw();
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function draw() {
  if (!state) return;

  drawApplications();
  drawTextFields('portal_title', '#titleFields', { multiline: false, max: 80 });
  drawHero();
  drawFeatured();

  const cooldown = document.querySelector('#cooldownDays');
  if (cooldown) cooldown.value = String(state.settings.reapply_cooldown_days ?? 90);
}

/**
 * The applications toggle.
 *
 * Drawn instead of a static control because the wording is the state: the card
 * says what is true now, what it means for a reader, and how long it takes to
 * be true everywhere. A checkbox with a label would say the first of those.
 */
function drawApplications() {
  const holder = document.querySelector('#applicationsState');
  if (!holder) return;

  const open = state.settings.applications_open !== false;

  holder.innerHTML = `
    <p class="admin-setting-state ${open ? 'is-on' : 'is-off'}">
      <span class="badge ${open ? 'badge-open' : 'badge-closed'}">${escapeHtml(
        t(open ? 'admin.applicationsOpen' : 'admin.applicationsClosed')
      )}</span>
      <span>${escapeHtml(
        t(open ? 'admin.applicationsOpenBody' : 'admin.applicationsClosedBody')
      )}</span>
    </p>
    <p class="field-hint">${escapeHtml(t('admin.applicationsDelayHint'))}</p>
    <p class="field-hint">${escapeHtml(t('admin.applicationsNotMaintenance'))}</p>
    <div class="editor-actions">
      <button type="button" class="btn ${open ? 'btn-danger' : 'btn-primary'}"
              id="toggleApplications">${escapeHtml(
                t(open ? 'admin.closeApplications' : 'admin.openApplications')
              )}</button>
    </div>`;

  holder.querySelector('#toggleApplications')?.addEventListener('click', () => {
    runAction(() => toggleApplications(!open), 'applications toggle');
  });
}

/**
 * One field per active language for a per locale setting.
 *
 * The default language is first and is the one every other falls back to, which
 * the hint under it says and does not leave to be discovered when a Chinese
 * reader sees an English title.
 */
function drawTextFields(key, selector, options) {
  const holder = document.querySelector(selector);
  if (!holder) return;

  holder.innerHTML = adminLocales().map((locale) => localeField(key, locale, options)).join('');
}

function drawHero() {
  const holder = document.querySelector('#heroFields');
  if (!holder) return;

  holder.innerHTML = adminLocales()
    .map(
      (locale) =>
        localeField('hero_heading', locale, { multiline: false, max: 120 }) +
        localeField('hero_body', locale, { multiline: true, max: 400 })
    )
    .join('');
}

function localeField(key, locale, options) {
  const id = `${key}-${locale.code}`;
  const value = state.settings[key]?.[locale.code] ?? '';
  const label = t(`admin.setting_${key}`, { language: locale.native_name });

  const control = options.multiline
    ? `<textarea id="${id}" rows="3" maxlength="${options.max}"
                 data-setting="${key}" data-locale="${locale.code}">${escapeHtml(
                   value
                 )}</textarea>`
    : `<input id="${id}" type="text" maxlength="${options.max}"
              data-setting="${key}" data-locale="${locale.code}"
              value="${escapeHtml(value)}">`;

  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      ${control}
      <p class="field-error" data-error-for="${key}.${locale.code}" hidden></p>
      ${
        locale.is_default
          ? `<p class="field-hint">${escapeHtml(t('admin.settingDefaultHint'))}</p>`
          : ''
      }
    </div>`;
}

/**
 * The featured list, in the order it will appear, and a picker for adding one.
 *
 * Ordered in place of a set of checkboxes because the order is the editorial
 * decision: 8.10 calls it "featured job selection" and the home page renders
 * them in this order, so a list where the admin cannot say which is first is
 * half the control.
 */
function drawFeatured() {
  const holder = document.querySelector('#featuredChosen');
  const picker = document.querySelector('#featuredPicker');
  if (!holder || !picker) return;

  const chosen = state.settings.featured_job_ids ?? [];
  const byId = new Map((state.postings ?? []).map((row) => [row.id, row]));
  for (const row of state.featured ?? []) byId.set(row.id, row);

  const dropped = state.featured_unavailable ?? 0;

  holder.innerHTML = `
    ${
      dropped > 0
        ? `<p class="callout warn">${escapeHtml(
            t('admin.featuredDropped', { count: dropped })
          )}</p>`
        : ''
    }
    ${
      chosen.length === 0
        ? `<p class="muted admin-empty">${escapeHtml(t('admin.featuredNone'))}</p>`
        : `<ol class="admin-chosen-list">
            ${chosen
              .map((id, index) => {
                const row = byId.get(id);
                return `
              <li data-featured-id="${escapeHtml(id)}">
                <span class="admin-row-title">${escapeHtml(row?.title ?? id)}</span>
                <span class="admin-row-actions">
                  <button type="button" class="icon-btn small" data-move="up"
                          ${index === 0 ? 'disabled' : ''}
                          aria-label="${escapeHtml(t('admin.moveUp'))}">&#8593;</button>
                  <button type="button" class="icon-btn small" data-move="down"
                          ${index === chosen.length - 1 ? 'disabled' : ''}
                          aria-label="${escapeHtml(t('admin.moveDown'))}">&#8595;</button>
                  <button type="button" class="btn btn-quiet small" data-remove>${escapeHtml(
                    t('admin.remove')
                  )}</button>
                </span>
              </li>`;
              })
              .join('')}
          </ol>`
    }`;

  const remaining = (state.postings ?? []).filter((row) => !chosen.includes(row.id));
  const full = chosen.length >= (state.limits?.max_featured ?? 6);

  picker.disabled = full || remaining.length === 0;
  picker.innerHTML =
    `<option value="">${escapeHtml(
      full ? t('admin.featuredFull', { count: state.limits?.max_featured ?? 6 }) : t('admin.featuredPick')
    )}</option>` +
    remaining
      .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.title)}</option>`)
      .join('');

  picker.onchange = () => {
    if (!picker.value) return;
    state.settings.featured_job_ids = [...chosen, picker.value];
    dirty = true;
    drawFeatured();
  };

  holder.querySelectorAll('[data-featured-id]').forEach((item, index) => {
    const id = item.getAttribute('data-featured-id');

    item.querySelector('[data-remove]')?.addEventListener('click', () => {
      state.settings.featured_job_ids = chosen.filter((candidate) => candidate !== id);
      dirty = true;
      drawFeatured();
    });

    item.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('click', () => {
        const to = index + (button.getAttribute('data-move') === 'up' ? -1 : 1);
        if (to < 0 || to >= chosen.length) return;
        const order = [...chosen];
        [order[index], order[to]] = [order[to], order[index]];
        state.settings.featured_job_ids = order;
        dirty = true;
        drawFeatured();
      });
    });
  });
}

/* -------------------------------------------------------------------------
 * Reading the form
 * ---------------------------------------------------------------------- */

/**
 * Put what is on screen back into state.
 *
 * Called before every redraw and before every save, so the two can never
 * disagree about what the admin typed. The featured list is already in state,
 * because it is edited by its own controls, not by a field.
 */
function collect() {
  if (!state) return;

  for (const key of TEXT_KEYS) state.settings[key] = {};

  document.querySelectorAll('[data-setting]').forEach((field) => {
    const key = field.getAttribute('data-setting');
    const locale = field.getAttribute('data-locale');
    if (!TEXT_KEYS.includes(key) || !locale) return;

    const value = field.value.trim();
    // A blank field is an absent translation and not an empty string, so a
    // reader falls back to the default language instead of a blank heading.
    if (value) state.settings[key][locale] = value;
  });

  const cooldown = document.querySelector('#cooldownDays');
  if (cooldown) state.settings.reapply_cooldown_days = Number(cooldown.value);
}

/* -------------------------------------------------------------------------
 * Saving
 * ---------------------------------------------------------------------- */

async function save() {
  collect();
  clearFieldErrors();

  const result = await api('/api/admin/settings', {
    method: 'POST',
    body: {
      action: 'save',
      portal_title: state.settings.portal_title,
      hero_heading: state.settings.hero_heading,
      hero_body: state.settings.hero_body,
      featured_job_ids: state.settings.featured_job_ids ?? [],
      reapply_cooldown_days: state.settings.reapply_cooldown_days,
    },
  });

  if (!result.ok) {
    showFieldErrors(result.error?.details ?? {});
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  dirty = false;
  adminMessage('ok', t('admin.settingsSaved'));
  await load();
}

function clearFieldErrors() {
  document.querySelectorAll('[data-error-for]').forEach((node) => {
    node.hidden = true;
    node.textContent = '';
  });
}

function showFieldErrors(details) {
  for (const [field, code] of Object.entries(details)) {
    if (typeof code !== 'string') continue;
    const node = document.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
    if (node) {
      node.textContent = t(`field.${code}`);
      node.hidden = false;
    }
  }
}

/* -------------------------------------------------------------------------
 * The applications toggle
 * ---------------------------------------------------------------------- */

/**
 * Open or close the board.
 *
 * Both directions are confirmed, and the note is offered in both directions
 * too, unlike a maintenance flip where only the off direction carries one. The
 * reason is what the note is for here: it goes into the audit log instead of
 * onto the site, and "reopening after the recruitment freeze" is as much worth
 * recording as the closing was.
 */
async function toggleApplications(open) {
  const answer = await confirmAction({
    title: t(open ? 'admin.confirmOpenTitle' : 'admin.confirmCloseTitle'),
    body: t(open ? 'admin.confirmOpenBody' : 'admin.confirmCloseBody'),
    consequences: open
      ? [t('admin.applicationsDelayHint')]
      : [t('admin.closeConsequenceApply'), t('admin.applicationsDelayHint')],
    confirmLabel: t(open ? 'admin.openApplications' : 'admin.closeApplications'),
    danger: !open,
    field: {
      label: t('admin.applicationsNoteLabel'),
      hint: t('admin.applicationsNoteHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  const result = await api('/api/admin/settings', {
    method: 'POST',
    body: { action: 'applications', open, note: answer.value || null },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  state.settings.applications_open = open;
  adminMessage('ok', t(open ? 'admin.applicationsNowOpen' : 'admin.applicationsNowClosed'));
  drawApplications();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
