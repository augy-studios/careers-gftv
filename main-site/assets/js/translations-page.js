// /account/translations. Section 7i, the helper area.
//
// The applicant half of the translation helper role. 8.11's third tab is where
// an admin grants it; this is what somebody granted it actually opens.
//
// 7i gives the area two jobs and one refusal:
//
//   "Edit any translation row in their language, freely and without approval."
//   "See what is missing: every posting, department, and tag with no translation
//    in their language, and every translation started but not ready. This is the
//    same audit view as 8.11, scoped to their language and without the admin
//    controls."
//   "They cannot make a translation live. Only an admin sets is_ready."
//
// Six things here are decisions rather than layout:
//
//   **The list is the audit, and the search is the way past it.** A finished
//   translation is not in migration 032's view at all, by design, so a list
//   alone would answer "what has nobody written" and never "the Chinese on this
//   posting reads wrongly", which is the sentence the whole role exists for. The
//   search box is above the list rather than below it for that reason: it is not
//   a filter on what is left, it is the other question.
//
//   **The editor replaces the list rather than opening in a dialog.** Ten fields
//   with the source wording beside each one is a page. The admin queue can use a
//   dialog because it edits one field; a modal that scrolls for two screens on a
//   phone is the pattern section 3 spends its effort avoiding.
//
//   **What saving does is said per type, not once at the top.** A posting's
//   translation is a draft until an admin marks it ready, and a team or tag
//   translation has no is_ready at all: migration 014 leaves the column off both
//   tables, because a team name is either written in a language or it is not. So
//   a helper writing a team's Chinese name changes what every reader sees
//   immediately, and a page that said "nothing you write goes live" would be
//   telling them something untrue about two of the three things on their list.
//
//   **The language is a tab, and only when there is more than one.** The role is
//   granted per language, per 7i, so somebody may hold two. A strip of one tab is
//   a label, and this page has a heading already.
//
//   **The field and state names are 8.11's own keys.** This page reads
//   admin.field_*, admin.auditState_*, and admin.target_* rather than a second
//   set under helper.*. They are the same nine field names and the same three
//   states, seen from the other side, and two translations of "Not started" is
//   two things to keep in step and one place for them to disagree.
//
//   **Leaving the editor with unsaved work asks first.** The list and the editor
//   are the same page, so Back is a redraw rather than a navigation and nothing
//   in the browser would otherwise warn anybody.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { formatDate } from './format.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { confirmAction } from './danger-confirm.js';
import { loadFeatureOverrides, isFeatureOff, featureNote } from './build-status.js';
import { mountAccountPage, helperRoster, accountMessage, runAction } from './account-shell.js';

const PATH = '/account/translations';

/** Migration 032's three states, and the three things it audits. */
const STATES = ['missing', 'drafted', 'thin'];
const TARGETS = ['job', 'department', 'tag'];

/** How many field names a row lists before it says how many more there are. */
const MISSING_SHOWN = 3;

/** The most sections a posting's translation may carry, per migration 019. */
const MAX_SECTIONS = 20;

let roster = [];
let locale = '';
let listState = { target: '', state: '', page: 1 };
let payload = null;
let results = null;

/** The thing being edited, as the route last answered it. */
let editing = null;
/** The working copy of its sections, which is the one field that is not an input. */
let sections = [];
let dirty = false;

async function boot() {
  const session = await mountAccountPage({ current: PATH });
  if (!session) return;

  roster = await helperRoster();

  if (roster.length === 0) {
    await drawGate();
    return;
  }

  const area = document.querySelector('#helperArea');
  if (area) area.hidden = false;

  readStateFromUrl();
  drawLanguages();
  drawFilters();

  document.querySelector('#helperFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    listState.target = document.querySelector('#helperTarget').value;
    listState.state = document.querySelector('#helperState').value;
    listState.page = 1;
    writeStateToUrl();
    runAction(loadList, 'helper audit load');
  });

  document.querySelector('#helperSearch')?.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(search, 'helper search');
  });

  await loadList();

  // Deep linked straight into one thing, which is what the audit rows and the
  // 8.11 queue's own links produce.
  const wanted = new URLSearchParams(window.location.search);
  const type = wanted.get('type');
  const id = wanted.get('id');
  if (TARGETS.includes(type ?? '') && id) {
    await openTarget(type, id);
  }

  document.addEventListener('gftv:localechange', () => {
    drawLanguages();
    drawFilters();
    drawList();
    drawResults();

    // The editor is rebuilt rather than retranslated, because every label in it
    // is written here rather than carried on a data-i18n attribute. What is on
    // screen is read back into the model first: somebody switching the site's
    // language mid-edit is not asking to have their draft thrown away, and a
    // helper working between two languages is exactly the person who does this.
    if (!editing) return;
    readEditor();
    drawEditor();
  });
}

/**
 * The page for somebody with no languages, which is nearly everybody who opens
 * this address.
 *
 * **Two different reasons produce the same empty roster**, and telling them
 * apart matters. An ordinary account is not a helper, and the panel explains
 * what the role is. A helper whose feature has been switched off from
 * /admin/maintenance gets the same empty list from the route, which answers 503,
 * and would otherwise be told they are not a helper: they are, and the site is
 * having a bad afternoon.
 *
 * The overrides are awaited rather than read straight off the cache, per the
 * trap phase 7 left: isFeatureOff answers "no" to a cache nothing has filled,
 * which looks exactly like nothing being switched off.
 */
async function drawGate() {
  const gate = document.querySelector('#helperGate');
  if (!gate) return;

  gate.hidden = false;

  await loadFeatureOverrides();
  if (!isFeatureOff('translation_helpers')) return;

  const note = featureNote('translation_helpers');
  gate.innerHTML =
    `<div class="empty-state">` +
    `<p>${escapeHtml(t('helper.switchedOff'))}</p>` +
    (note ? `<p class="muted">${escapeHtml(note)}</p>` : '') +
    `</div>`;

  // Redrawn rather than retranslated, like the maintenance banner above it: the
  // sentence and the admin's note are written here rather than carried on a
  // data-i18n attribute, so shell.js's own pass cannot reach them.
  document.addEventListener('gftv:localechange', () => drawGate(), { once: true });
}

/* -------------------------------------------------------------------------
 * Where we are
 * ---------------------------------------------------------------------- */

function readStateFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const pick = (name, allowed) => {
    const value = search.get(name) ?? '';
    return allowed.includes(value) ? value : '';
  };

  const wanted = search.get('locale') ?? '';
  locale = roster.some((entry) => entry.code === wanted) ? wanted : roster[0].code;

  listState = {
    target: pick('target', TARGETS),
    state: pick('state', STATES),
    page: Math.max(1, Number(search.get('page')) || 1),
  };
}

/**
 * The address bar, kept in step with what is on screen.
 *
 * The thing being edited is in it as well as the filters, so a helper who has
 * found something and wants to come back to it tomorrow can keep the link. That
 * is also what makes the audit rows' own links work: they set type and id and
 * nothing else.
 */
function writeStateToUrl() {
  const search = new URLSearchParams();
  search.set('locale', locale);

  if (editing) {
    search.set('type', editing.target_type);
    search.set('id', editing.target_id);
  } else {
    if (listState.target) search.set('target', listState.target);
    if (listState.state) search.set('state', listState.state);
    if (listState.page > 1) search.set('page', String(listState.page));
  }

  window.history.replaceState({}, '', `${PATH}?${search.toString()}`);
}

/* -------------------------------------------------------------------------
 * The languages somebody helps with
 * ---------------------------------------------------------------------- */

/**
 * One tab per granted language.
 *
 * The keyboard handling is part 7's, which is the one strip in this build that
 * has it: a roving tabindex, arrows, Home and End, and manual activation, so a
 * keyboard user moving along the strip does not fire a request per keypress.
 */
function drawLanguages() {
  const holder = document.querySelector('#helperLangs');
  if (!holder) return;

  // One language is a label, not a strip.
  holder.hidden = roster.length < 2;
  if (holder.hidden) return;

  const hadFocus = holder.contains(document.activeElement);

  holder.innerHTML = roster
    .map(
      (entry) =>
        `<button type="button" class="bucket-tab" role="tab"` +
        ` data-locale="${escapeHtml(entry.code)}"` +
        ` aria-selected="${entry.code === locale}"` +
        ` tabindex="${entry.code === locale ? '0' : '-1'}">` +
        `<span>${escapeHtml(entry.native_name)}</span></button>`
    )
    .join('');

  const buttons = [...holder.querySelectorAll('[data-locale]')];

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectLanguage(button.getAttribute('data-locale')));

    button.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = buttons[(index + 1) % buttons.length];
      else if (event.key === 'ArrowLeft') {
        next = buttons[(index - 1 + buttons.length) % buttons.length];
      } else if (event.key === 'Home') next = buttons[0];
      else if (event.key === 'End') next = buttons[buttons.length - 1];
      if (!next) return;

      event.preventDefault();
      buttons.forEach((other) => {
        other.tabIndex = other === next ? 0 : -1;
      });
      next.focus();
    });
  });

  if (hadFocus) holder.querySelector('[aria-selected="true"]')?.focus();
}

async function selectLanguage(code) {
  if (code === locale || !roster.some((entry) => entry.code === code)) return;

  // Switching language while something is half written would discard it without
  // saying so: the other language is a different row on a different table.
  if (!(await confirmDiscard())) return;

  locale = code;
  listState.page = 1;
  results = null;
  closeEditor({ silent: true });
  drawLanguages();
  drawResults();
  writeStateToUrl();
  runAction(loadList, 'helper audit load');
}

/* -------------------------------------------------------------------------
 * What is left
 * ---------------------------------------------------------------------- */

function drawFilters() {
  const options = (list, selected) =>
    list
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.value)}"${
            entry.value === selected ? ' selected' : ''
          }>${escapeHtml(t(entry.key))}</option>`
      )
      .join('');

  const targetList = [
    { value: '', key: 'admin.anyTarget' },
    ...TARGETS.map((target) => ({ value: target, key: `admin.target_${target}` })),
  ];

  const stateList = [
    { value: '', key: 'admin.anyState' },
    ...STATES.map((state) => ({ value: state, key: `admin.auditState_${state}` })),
  ];

  const target = document.querySelector('#helperTarget');
  const state = document.querySelector('#helperState');

  if (target) target.innerHTML = options(targetList, listState.target);
  if (state) state.innerHTML = options(stateList, listState.state);
}

async function loadList() {
  const search = new URLSearchParams({ view: 'audit', locale });
  if (listState.target) search.set('target', listState.target);
  if (listState.state) search.set('state', listState.state);
  search.set('page', String(listState.page));

  const result = await api(`/api/translations/helper?${search.toString()}`);

  const list = document.querySelector('#helperList');
  if (list) list.setAttribute('aria-busy', 'false');

  if (!result.ok) {
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  drawList();
}

function drawList() {
  const list = document.querySelector('#helperList');
  if (!list || !payload) return;

  const rows = payload.audit ?? [];
  const language = languageName(locale);

  if (rows.length === 0) {
    const filtered = Boolean(listState.target || listState.state);
    list.innerHTML =
      countsMarkup() +
      `<p class="muted admin-empty">${escapeHtml(
        // A finished translation is not in the view at all, so an empty list is
        // the real answer rather than "no results".
        filtered ? t('admin.noAuditMatches') : t('admin.auditFinished', { language })
      )}</p>`;
    drawPager();
    return;
  }

  list.innerHTML = countsMarkup() + rows.map(rowMarkup).join('');

  list.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(
        () => openTarget(button.getAttribute('data-type'), button.getAttribute('data-id')),
        'open translation'
      );
    });
  });

  hydrateIcons(list);
  drawPager();
}

/**
 * One thing that still needs work.
 *
 * The same card the rest of the account area uses, per section 3's "reuse those
 * components rather than designing new ones": this is a list of things on
 * somebody's own account page, and it should look like the other two.
 */
function rowMarkup(row) {
  return `
    <article class="glass-card account-row">
      <div class="account-row-head">
        <h3 class="account-row-title">${escapeHtml(row.label ?? t('admin.targetGone'))}</h3>
        <div class="account-row-badges">
          <span class="badge badge-audit-${escapeHtml(row.state)}">${escapeHtml(
            t(`admin.auditState_${row.state}`)
          )}</span>
        </div>
      </div>

      <div class="account-row-state">
        <span class="muted">${escapeHtml(t(`admin.target_${row.target_type}`))} &middot; ${escapeHtml(
          sourceStateLabel(row)
        )}</span>
        <span class="account-row-dates">${escapeHtml(
          t('helper.updatedOn', { date: formatDate(row.updated_at) })
        )}</span>
      </div>

      <p class="muted">${escapeHtml(t('admin.colMissing'))}: ${escapeHtml(missingLabel(row))}</p>

      <div class="account-row-actions">
        <button type="button" class="btn btn-secondary" data-open
                data-type="${escapeHtml(row.target_type)}"
                data-id="${escapeHtml(row.target_id)}">${escapeHtml(t('helper.translate'))}</button>
      </div>
    </article>`;
}

/**
 * What is missing from this one.
 *
 * "Everything" for a row with no translation at all, per the audit's own
 * wording: listing nine field names to say the same thing is noise. Capped at
 * three with a count for the rest, so a row stays one line.
 */
function missingLabel(row) {
  if (row.state === 'missing') return t('admin.auditEverything');

  const fields = row.missing_fields ?? [];
  if (fields.length === 0) return t('helper.nothingMissing');

  const names = fields.slice(0, MISSING_SHOWN).map((field) => fieldName(row.target_type, field));
  if (fields.length > MISSING_SHOWN) {
    names.push(t('admin.andMoreFields', { count: fields.length - MISSING_SHOWN }));
  }

  return names.join(', ');
}

function sourceStateLabel(row) {
  if (row.target_type === 'job') return t(`admin.jobStatus_${row.source_status}`);
  return t(`admin.sourceState_${row.source_status}`);
}

function countsMarkup() {
  const counts = payload?.counts ?? {};

  return `<p class="muted admin-counts">${STATES.map(
    (state) =>
      `${escapeHtml(t(`admin.auditState_${state}`))}: <strong>${
        // Null is a count that could not be read, drawn as a dash. A zero here
        // would say the translation is finished, which is a claim a failed
        // request does not entitle anybody to make.
        counts[state] === null || counts[state] === undefined
          ? '&mdash;'
          : escapeHtml(String(counts[state]))
      }</strong>`
  ).join(' &middot; ')}</p>`;
}

function drawPager() {
  const holder = document.querySelector('#helperPager');
  if (!holder) return;

  const pages = payload?.pages ?? 1;
  if (pages <= 1) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = `
    <button type="button" class="btn btn-quiet small" data-page="prev"
            ${listState.page <= 1 ? 'disabled' : ''}>${escapeHtml(t('search.previous'))}</button>
    <span class="muted tabular">${escapeHtml(
      t('admin.pageOf', { page: listState.page, pages })
    )}</span>
    <button type="button" class="btn btn-quiet small" data-page="next"
            ${listState.page >= pages ? 'disabled' : ''}>${escapeHtml(t('search.next'))}</button>`;

  holder.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      listState.page += button.getAttribute('data-page') === 'next' ? 1 : -1;
      writeStateToUrl();
      runAction(loadList, 'helper audit page');
    });
  });
}

/* -------------------------------------------------------------------------
 * Finding something that is not on the list
 * ---------------------------------------------------------------------- */

async function search() {
  const input = document.querySelector('#helperQuery');
  const term = (input?.value ?? '').trim();

  if (term.length < 2) {
    results = null;
    drawResults();
    return;
  }

  const result = await api(
    `/api/translations/helper?view=search&locale=${encodeURIComponent(
      locale
    )}&q=${encodeURIComponent(term)}`
  );

  if (!result.ok) {
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  results = result.data?.results ?? [];
  drawResults();
}

function drawResults() {
  const holder = document.querySelector('#helperResults');
  if (!holder) return;

  if (results === null) {
    holder.innerHTML = '';
    return;
  }

  if (results.length === 0) {
    holder.innerHTML = `<p class="muted admin-empty">${escapeHtml(
      t('admin.noAuditMatches')
    )}</p>`;
    return;
  }

  holder.innerHTML = results
    .map(
      (row) => `
      <article class="glass-card account-row">
        <div class="account-row-head">
          <h3 class="account-row-title">${escapeHtml(row.label ?? '')}</h3>
          <div class="account-row-badges">
            <span class="badge badge-audit-${escapeHtml(row.state)}">${escapeHtml(
              t(`helper.found_${row.state}`)
            )}</span>
          </div>
        </div>

        <div class="account-row-state">
          <span class="muted">${escapeHtml(t(`admin.target_${row.target_type}`))} &middot; ${escapeHtml(
            sourceStateLabel(row)
          )}</span>
        </div>

        <div class="account-row-actions">
          <button type="button" class="btn btn-secondary" data-open
                  data-type="${escapeHtml(row.target_type)}"
                  data-id="${escapeHtml(row.target_id)}">${escapeHtml(
                    t('helper.translate')
                  )}</button>
        </div>
      </article>`
    )
    .join('');

  holder.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(
        () => openTarget(button.getAttribute('data-type'), button.getAttribute('data-id')),
        'open translation'
      );
    });
  });
}

/* -------------------------------------------------------------------------
 * The editor
 * ---------------------------------------------------------------------- */

async function openTarget(type, id) {
  if (!(await confirmDiscard())) return;

  const result = await api(
    `/api/translations/helper?view=target&locale=${encodeURIComponent(
      locale
    )}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
  );

  if (!result.ok) {
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  editing = result.data?.target ?? null;
  if (!editing) return;

  sections = editing.sections ? editing.sections.map((entry) => ({ ...entry })) : [];
  dirty = false;

  drawEditor();
  writeStateToUrl();
}

function drawEditor() {
  const view = document.querySelector('#helperEditView');
  const list = document.querySelector('#helperListView');
  if (!view || !list || !editing) return;

  list.hidden = true;
  view.hidden = false;

  view.innerHTML = `
    <div class="glass-card helper-editor">
      <button type="button" class="btn btn-quiet small" data-back>${escapeHtml(
        t('helper.backToList')
      )}</button>

      <h2 class="helper-editor-title" tabindex="-1">${escapeHtml(editing.label ?? '')}</h2>
      <p class="muted">${escapeHtml(t(`admin.target_${editing.target_type}`))} &middot; ${escapeHtml(
        sourceStateLabel(editing)
      )} &middot; ${escapeHtml(languageName(editing.locale))}</p>

      ${livenessMarkup()}

      ${editing.fields.map(fieldMarkup).join('')}
      ${sectionsMarkup()}

      <div class="editor-actions">
        <button type="button" class="btn btn-primary" data-save>${escapeHtml(
          t('helper.save')
        )}</button>
      </div>
    </div>`;

  hydrateIcons(view);
  wireEditor(view);
  drawSections();

  // Focus rather than only scroll. The list this replaced is gone from the
  // document, so a keyboard user who pressed Translate would otherwise be left
  // at the top of the page with no idea anything had happened.
  const heading = view.querySelector('.helper-editor-title');
  heading?.focus();
  heading?.scrollIntoView({ block: 'start' });
}

/**
 * What saving actually does, which is not the same sentence for all three types.
 *
 * A posting's translation waits for an admin, per 7i. A team or tag translation
 * has no is_ready column at all, per migration 014, so it is live the moment it
 * is written. Saying "nothing goes live" everywhere would be untrue about two of
 * the three things on the list, and a helper renaming a team in Chinese should
 * know it is on every job card by the time they refresh.
 */
function livenessMarkup() {
  if (editing.target_type !== 'job') {
    return `<p class="callout warn">${escapeHtml(t('helper.liveAtOnce'))}</p>`;
  }

  return editing.is_ready
    ? `<p class="callout warn">${escapeHtml(t('helper.alreadyLive'))}</p>`
    : `<p class="callout note">${escapeHtml(t('helper.draftUntilReady'))}</p>`;
}

/**
 * One field, with the source wording beside it.
 *
 * 8.2's rule for the admin editor, and the same markup, so the two read the same
 * and the responsive collapse below 1024px is the one already written rather
 * than a second one.
 */
function fieldMarkup(field) {
  const id = `helperField-${field.name}`;
  const value = editing.current?.[field.name] ?? '';
  const source = editing.source?.[field.name] ?? '';

  const control = field.multiline
    ? `<textarea id="${id}" data-field="${escapeHtml(field.name)}" rows="4"
                 maxlength="${field.max}">${escapeHtml(value)}</textarea>`
    : `<input id="${id}" type="text" data-field="${escapeHtml(field.name)}"
              maxlength="${field.max}" value="${escapeHtml(value)}">`;

  const sourceBlock = source
    ? `<div class="editor-source">
         <span class="editor-source-label">${escapeHtml(t('admin.sourceWording'))}</span>
         <p class="editor-source-text">${escapeHtml(source)}</p>
       </div>`
    : '';

  return `
    <div class="field editor-field${sourceBlock ? ' has-source' : ''}">
      <div class="editor-field-main">
        <label for="${id}">${escapeHtml(fieldName(editing.target_type, field.name))}${
          field.required ? ` <span class="muted">${escapeHtml(t('helper.required'))}</span>` : ''
        }</label>
        ${control}
        ${
          field.markdown
            ? `<p class="field-hint">${escapeHtml(t('admin.markdownHint'))}</p>`
            : ''
        }
        ${
          source
            ? ''
            : `<p class="field-hint">${escapeHtml(t('helper.nothingInSource'))}</p>`
        }
        <p class="field-error" data-error-for="${escapeHtml(field.name)}" hidden></p>
      </div>
      ${sourceBlock}
    </div>`;
}

/**
 * The sections builder, for a posting.
 *
 * The admin queue hands sections to the job editor rather than editing them,
 * because one textarea cannot edit a jsonb array honestly. That reasoning is
 * about the textarea: a helper has no job editor to be sent to, and a posting
 * whose sections are untranslated would sit on their list with no way to clear
 * it. So this is the builder from 8.2, reordering included: a translation may
 * carry a different number of sections from the source and often wants them in a
 * different order, and somebody who added one in the wrong place would otherwise
 * have to delete it and type it again.
 */
function sectionsMarkup() {
  if (editing.target_type !== 'job') return '';

  const source = editing.source_sections ?? [];

  return `
    <fieldset class="editor-sections">
      <legend>${escapeHtml(t('admin.sections'))}</legend>
      <p class="field-hint">${escapeHtml(t('admin.sectionsTranslationHint'))}</p>

      ${
        source.length === 0
          ? ''
          : `<div class="editor-source helper-source-sections">
               <span class="editor-source-label">${escapeHtml(t('admin.sourceWording'))}</span>
               ${source
                 .map(
                   (section) =>
                     `<p class="editor-source-text"><strong>${escapeHtml(
                       section.heading
                     )}</strong><br>${escapeHtml(section.body)}</p>`
                 )
                 .join('')}
             </div>`
      }

      <div id="helperSectionList"></div>
      <button type="button" class="btn btn-quiet small" data-add-section>
        ${iconMarkup('plus', { size: 15 })}<span>${escapeHtml(t('admin.addSection'))}</span>
      </button>
      <p class="field-error" data-error-for="sections" hidden></p>
    </fieldset>`;
}

function drawSections() {
  const holder = document.querySelector('#helperSectionList');
  if (!holder) return;

  holder.innerHTML = sections
    .map(
      (section, index) => `
      <div class="editor-section" data-section-index="${index}">
        <div class="editor-section-head">
          <input type="text" class="section-heading" data-section-field="heading"
                 maxlength="120" placeholder="${escapeHtml(t('admin.sectionHeading'))}"
                 value="${escapeHtml(section.heading ?? '')}">
          <span class="editor-section-controls">
            <button type="button" class="icon-btn small" data-section-move="up"
                    ${index === 0 ? 'disabled' : ''}
                    aria-label="${escapeHtml(t('admin.moveUp'))}">&#8593;</button>
            <button type="button" class="icon-btn small" data-section-move="down"
                    ${index === sections.length - 1 ? 'disabled' : ''}
                    aria-label="${escapeHtml(t('admin.moveDown'))}">&#8595;</button>
            <button type="button" class="icon-btn small danger" data-section-remove
                    aria-label="${escapeHtml(t('admin.removeSection'))}">
              <span data-icon="trash" data-icon-size="16"></span>
            </button>
          </span>
        </div>
        <textarea rows="4" data-section-field="body"
                  placeholder="${escapeHtml(t('admin.sectionBody'))}">${escapeHtml(
                    section.body ?? ''
                  )}</textarea>
      </div>`
    )
    .join('');

  hydrateIcons(holder);

  holder.querySelectorAll('[data-section-index]').forEach((row) => {
    const index = Number(row.getAttribute('data-section-index'));

    row.querySelectorAll('[data-section-field]').forEach((input) => {
      input.addEventListener('input', () => {
        sections[index][input.getAttribute('data-section-field')] = input.value;
        dirty = true;
      });
    });

    row.querySelectorAll('[data-section-move]').forEach((button) => {
      button.addEventListener('click', () => {
        // Read first: the boxes hold what has been typed since the last draw,
        // and moving a row redraws them all from the model.
        readSections();
        const to = index + (button.getAttribute('data-section-move') === 'up' ? -1 : 1);
        if (to < 0 || to >= sections.length) return;

        [sections[index], sections[to]] = [sections[to], sections[index]];
        dirty = true;
        drawSections();
      });
    });

    row.querySelector('[data-section-remove]')?.addEventListener('click', () => {
      readSections();
      sections.splice(index, 1);
      dirty = true;
      drawSections();
    });
  });
}

/**
 * Read every box on the editor back into the model.
 *
 * Called before anything that redraws it, which is the habit the job editor
 * settled on after a tab switch was found to be quietly discarding whatever had
 * been typed into the panel it was leaving.
 */
function readEditor() {
  const root = document.querySelector('#helperEditView');
  if (!root || !editing) return;

  editing.current = editing.current ?? {};
  root.querySelectorAll('[data-field]').forEach((input) => {
    editing.current[input.getAttribute('data-field')] = input.value;
  });

  readSections();
}

/** Read the section boxes back into the model before anything redraws them. */
function readSections() {
  const holder = document.querySelector('#helperSectionList');
  if (!holder) return;

  holder.querySelectorAll('[data-section-index]').forEach((row) => {
    const index = Number(row.getAttribute('data-section-index'));
    if (!sections[index]) return;

    row.querySelectorAll('[data-section-field]').forEach((input) => {
      sections[index][input.getAttribute('data-section-field')] = input.value;
    });
  });
}

function wireEditor(root) {
  root.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      dirty = true;
    });
  });

  root.querySelector('[data-add-section]')?.addEventListener('click', () => {
    if (sections.length >= MAX_SECTIONS) {
      accountMessage('error', t('helper.tooManySections', { count: MAX_SECTIONS }));
      return;
    }
    readSections();
    sections.push({ heading: '', body: '' });
    dirty = true;
    drawSections();
  });

  root.querySelector('[data-back]')?.addEventListener('click', () => {
    runAction(async () => {
      if (!(await confirmDiscard())) return;
      closeEditor();
      await loadList();
    }, 'leave the editor');
  });

  root.querySelector('[data-save]')?.addEventListener('click', () => {
    runAction(save, 'save translation');
  });
}

function closeEditor({ silent = false } = {}) {
  editing = null;
  sections = [];
  dirty = false;

  const view = document.querySelector('#helperEditView');
  const list = document.querySelector('#helperListView');
  if (view) {
    view.hidden = true;
    view.innerHTML = '';
  }
  if (list) list.hidden = false;

  if (silent) return;

  writeStateToUrl();
  // The editor that had focus is gone from the document. Without this the
  // keyboard lands back at the top of the page with nothing said.
  document.querySelector('#helperLeft')?.focus();
}

/**
 * Ask before throwing away something half written.
 *
 * The list and the editor are the same page, so nothing in the browser would
 * warn anybody: Back here is a redraw rather than a navigation. Answers true
 * when there is nothing to lose, so every caller may simply await it.
 */
async function confirmDiscard() {
  if (!editing || !dirty) return true;

  const answer = await confirmAction({
    title: t('helper.discardTitle'),
    body: t('helper.discardBody'),
    confirmLabel: t('helper.discardConfirm'),
    cancelLabel: t('helper.keepEditing'),
    danger: false,
  });

  return answer !== null;
}

/* -------------------------------------------------------------------------
 * Saving
 * ---------------------------------------------------------------------- */

async function save() {
  const root = document.querySelector('#helperEditView');
  if (!root || !editing) return;

  clearErrors(root);
  readEditor();

  const values = { ...editing.current };

  if (editing.target_type === 'job') {
    // Sent whole rather than as a patch: the builder's whole point is that the
    // count may change, so "the sections that are on screen" is the value.
    values.sections = sections;
  }

  const result = await api('/api/translations/helper', {
    method: 'POST',
    body: {
      action: 'save',
      type: editing.target_type,
      id: editing.target_id,
      locale: editing.locale,
      values,
    },
  });

  if (!result.ok) {
    showErrors(root, result.error?.details);
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  // Redrawn from what is stored rather than from what the browser hoped it
  // wrote, which is what shows a helper that the row now exists and that the
  // ready flag they cannot touch is still where it was.
  editing = result.data?.target ?? editing;
  sections = editing.sections ? editing.sections.map((entry) => ({ ...entry })) : [];
  dirty = false;

  drawEditor();
  accountMessage('ok', t(result.data?.created ? 'helper.savedNew' : 'helper.saved'));
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
    if (!node) continue;

    // The reason a save was refused is a code of its own rather than a field
    // code, and the sentence for it is the server's. The field errors beside it
    // are the ones this page can name.
    const label = t(`field.${code}`);
    node.textContent = label === `field.${code}` ? '' : label;
    node.hidden = node.textContent === '';
  }
}

/* -------------------------------------------------------------------------
 * Naming things
 * ---------------------------------------------------------------------- */

/**
 * What a column is called on screen, for one of the three content types.
 *
 * The type qualified key first, because the same column name means different
 * things on different tables: a posting's description is the body of the role,
 * and a tag's is one line explaining the tag. The same lookup 8.11's page makes,
 * against the same keys.
 */
function fieldName(targetType, field) {
  for (const key of [`admin.field_${targetType}_${field}`, `admin.field_${field}`]) {
    const label = t(key);
    if (label !== key) return label;
  }

  return String(field).replace(/_/g, ' ');
}

function languageName(code) {
  return roster.find((entry) => entry.code === code)?.native_name ?? code;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
