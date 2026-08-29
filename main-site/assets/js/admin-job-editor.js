// /admin/jobs/edit, the posting editor. Section 8.2.
//
// The tabbed per language editor, the sections builder, the tag type-ahead, the
// form fields, and the question set from 7g.
//
// **The tabs come from gftvjobs_locales, not from a list here.** 8.2: "one tab
// per active language, read from gftvjobs_locales rather than hardcoded, so a
// language added later appears without touching the editor". The default
// language's tab edits the posting itself; every other tab edits that language's
// translation row, which is exactly what migration 014 stores.
//
// Three things this editor does that a form generator would not, each because
// 8.2 asks for it:
//
//   **The source wording sits beside the field being written**, so a translator
//   is never working from memory. Below 1024px it collapses to a disclosure
//   above each field instead of a second column, which is a CSS decision and is
//   in app.css.
//
//   **A tab says whether that language is complete, in progress, or absent.**
//   Complete means is_ready, which the database will only accept with a title, a
//   summary, and a description, so the same three are validated here and shown
//   inline and not left to fail on a constraint.
//
//   **The embed line shows what the unfurl will look like**, and shows the
//   fallback, the first sentence of the description, when it is left empty. The
//   help text says embeds are always served in English, per section 4, because
//   an admin who does not know that writes a Chinese line and wonders why nobody
//   sees it.
//
// The one field that is not what it looks like is the slug. It is a 301 alias
// and nothing else: the canonical address is the uuid, per the decision table.
// So it is generated from the title, editable, and checked for uniqueness, and
// nothing anywhere depends on it being readable.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { COMMITMENTS } from './format.js';
import { confirmAction } from './danger-confirm.js';
import { mountAdminPage, adminApiError, adminMessage, adminLocales } from './admin-shell.js';
import { mountQuestionComposer } from './admin-questions.js';

const PATH = '/admin/jobs';

/** The fields a translation row carries, in the order they are edited. */
const TRANSLATABLE = [
  { name: 'title', type: 'text', required: true },
  { name: 'summary', type: 'textarea', rows: 2, required: true },
  { name: 'description', type: 'textarea', rows: 10, required: true, markdown: true },
  { name: 'responsibilities', type: 'textarea', rows: 6, markdown: true },
  { name: 'requirements', type: 'textarea', rows: 6, markdown: true },
  { name: 'nice_to_have', type: 'textarea', rows: 4, markdown: true },
  { name: 'location', type: 'text' },
  { name: 'compensation_note', type: 'text' },
  { name: 'og_description', type: 'textarea', rows: 2 },
];

let job = null;
let departments = [];
let allTags = [];
let selectedTags = [];
let questionComposer = null;
let activeLocale = 'en';
let dirty = false;

/**
 * Whether the slug has been typed by hand, and so must stop following the
 * title. Module state, not a flag on the input, because drawShared
 * rebuilds that input on every redraw. See maybeSuggestSlug.
 */
let slugTouched = false;

/** Sections, per language. The default language's live on the posting itself. */
const sections = new Map();

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  activeLocale = adminLocales()[0]?.code ?? 'en';

  const search = new URL(window.location.href).searchParams;
  const id = search.get('id');

  // ?locale= opens on that language's tab. Nothing on this page writes it; the
  // translation queue in 8.11 does, when it sends somebody here for a correction
  // a single textarea cannot make. Checked against gftvjobs_locales instead of
  // trusted, so a stale link opens on the default tab and not on a tab that
  // does not exist.
  const wanted = search.get('locale');
  if (wanted && adminLocales().some((locale) => locale.code === wanted)) {
    activeLocale = wanted;
  }

  const [loaded, departmentList, tagList] = await Promise.all([
    id ? api(`/api/admin/jobs?id=${encodeURIComponent(id)}`) : Promise.resolve(null),
    api('/api/admin/departments?counts=false'),
    api('/api/admin/tags'),
  ]);

  if (id && !loaded.ok) {
    adminApiError(loaded.error);
    return;
  }

  job = loaded?.data?.job ?? blankJob();
  departments = departmentList.ok ? (departmentList.data.departments ?? []) : [];
  allTags = tagList.ok ? (tagList.data.tags ?? []) : [];
  selectedTags = (job.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name }));

  seedSections();
  draw();

  // Leaving with unsaved work is the one thing a long editor has to guard
  // against, and the browser's own prompt is the only one that can stop a
  // navigation. Nothing custom: a page that invents its own would be ignored by
  // the browser anyway.
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('gftv:localechange', () => draw());
}

function blankJob() {
  return {
    id: null,
    slug: '',
    title: '',
    status: 'draft',
    sections: [],
    tags: [],
    translations: {},
    is_paid: false,
    is_remote: false,
    openings: 1,
  };
}

function seedSections() {
  sections.clear();
  sections.set('__base', clone(job.sections ?? []));
  for (const [locale, row] of Object.entries(job.translations ?? {})) {
    sections.set(locale, clone(row.sections ?? []));
  }
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function draw() {
  drawHeader();
  drawTabs();
  drawTabBody();
  drawShared();
  drawPublishState();
}

function drawHeader() {
  const heading = document.querySelector('#editorHeading');
  if (heading) {
    heading.textContent = job.id
      ? t('admin.editPosting', { title: job.title })
      : t('admin.newPosting');
  }

  const view = document.querySelector('#editorViewLink');
  if (view) {
    // Only for a posting that exists and is not a draft: /jobs/{uuid} 404s for
    // a draft to everybody, per section 4, including the person writing it.
    view.hidden = !job.id || job.status === 'draft';
    if (job.id) view.href = `/jobs/${encodeURIComponent(job.id)}`;
  }
}

function drawTabs() {
  const holder = document.querySelector('#editorTabs');
  if (!holder) return;

  const locales = adminLocales();

  holder.innerHTML = locales
    .map((locale) => {
      const state = localeState(locale);
      return (
        `<button type="button" class="lang-tab" role="tab" data-locale="${escapeHtml(locale.code)}"` +
        ` aria-selected="${locale.code === activeLocale}"` +
        `${locale.code === activeLocale ? '' : ' tabindex="-1"'}>` +
        `<span>${escapeHtml(locale.native_name)}</span>` +
        `<span class="lang-state lang-state-${state}" title="${escapeHtml(
          t(`admin.translation_${state}`)
        )}"></span>` +
        `</button>`
      );
    })
    .join('');

  holder.querySelectorAll('[data-locale]').forEach((tab) => {
    tab.addEventListener('click', () => {
      // Both halves of the page are read back before the switch, because draw()
      // redraws both. Without the second call, changing tab would quietly
      // discard whatever had been typed into the panel on the right, which is
      // where the form URL and the questions live.
      readTabBody();
      readShared();
      activeLocale = tab.getAttribute('data-locale');
      draw();
    });
  });
}

/**
 * complete, in_progress, or absent, per 8.2.
 *
 * The default language is always complete: it is the posting itself, and a
 * posting with no title cannot be saved.
 */
function localeState(locale) {
  if (locale.is_default) return 'complete';

  const row = job.translations?.[locale.code];
  if (!row) return 'absent';
  return row.is_ready ? 'complete' : 'in_progress';
}

function isBaseTab() {
  return adminLocales().find((locale) => locale.code === activeLocale)?.is_default === true;
}

function currentValues() {
  return isBaseTab() ? job : (job.translations?.[activeLocale] ?? {});
}

/** The default language's wording, shown beside a translation field. */
function sourceValue(field) {
  return job[field] ?? '';
}

function drawTabBody() {
  const holder = document.querySelector('#editorTabBody');
  if (!holder) return;

  const values = currentValues();
  const base = isBaseTab();

  holder.innerHTML = `
    ${
      base
        ? ''
        : `<label class="checkbox-row editor-ready">
             <input type="checkbox" id="translationReady" ${values.is_ready ? 'checked' : ''}>
             <span>${escapeHtml(t('admin.translationReady'))}</span>
           </label>
           <p class="field-hint">${escapeHtml(t('admin.translationReadyHint'))}</p>`
    }

    ${TRANSLATABLE.map((field) => fieldMarkup(field, values, base)).join('')}

    <fieldset class="editor-sections">
      <legend>${escapeHtml(t('admin.sections'))}</legend>
      <p class="field-hint">${escapeHtml(
        base ? t('admin.sectionsHint') : t('admin.sectionsTranslationHint')
      )}</p>
      <div id="editorSectionList"></div>
      <button type="button" class="btn btn-quiet small" id="addSection">
        ${iconMarkup('plus', { size: 15 })}<span>${escapeHtml(t('admin.addSection'))}</span>
      </button>
    </fieldset>

    <div class="editor-embed">
      <h3>${escapeHtml(t('admin.embedPreview'))}</h3>
      <p class="field-hint">${escapeHtml(t('admin.embedAlwaysEnglish'))}</p>
      <div class="embed-card glass-card" id="embedPreview"></div>
    </div>`;

  hydrateIcons(holder);
  wireTabBody(holder);
  drawSections();
  drawEmbedPreview();
}

function fieldMarkup(field, values, base) {
  const id = `field-${field.name}`;
  const value = values[field.name] ?? '';
  const label = t(`admin.field_${field.name}`);

  const control =
    field.type === 'textarea'
      ? `<textarea id="${id}" data-field="${field.name}" rows="${field.rows ?? 4}">${escapeHtml(
          value
        )}</textarea>`
      : `<input id="${id}" type="text" data-field="${field.name}" value="${escapeHtml(value)}">`;

  // The source wording beside the field, per 8.2, and only on a translation tab
  // because on the default tab it would be the same box twice.
  const source =
    base || !sourceValue(field.name)
      ? ''
      : `<div class="editor-source">
           <span class="editor-source-label">${escapeHtml(t('admin.sourceWording'))}</span>
           <p class="editor-source-text">${escapeHtml(sourceValue(field.name))}</p>
         </div>`;

  return `
    <div class="field editor-field${source ? ' has-source' : ''}">
      <div class="editor-field-main">
        <label for="${id}">${escapeHtml(label)}${
          field.required && !base ? ` <span class="muted">${escapeHtml(t('admin.readyNeeds'))}</span>` : ''
        }</label>
        ${control}
        ${
          field.markdown
            ? `<p class="field-hint">${escapeHtml(t('admin.markdownHint'))}</p>`
            : ''
        }
        <p class="field-error" data-error-for="${field.name}" hidden></p>
      </div>
      ${source}
    </div>`;
}

function wireTabBody(root) {
  root.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      dirty = true;
      if (input.getAttribute('data-field') === 'description') drawEmbedPreview();
      if (input.getAttribute('data-field') === 'og_description') drawEmbedPreview();
      if (input.getAttribute('data-field') === 'title') {
        drawEmbedPreview();
        maybeSuggestSlug(input.value);
      }
    });
  });

  root.querySelector('#translationReady')?.addEventListener('change', () => {
    dirty = true;
  });

  root.querySelector('#addSection')?.addEventListener('click', () => {
    sectionsFor(activeLocale).push({ heading: '', body: '' });
    dirty = true;
    drawSections();
  });
}

/** Read what is on screen back into the model, before a tab switch or a save. */
function readTabBody() {
  const holder = document.querySelector('#editorTabBody');
  if (!holder) return;

  const target = isBaseTab() ? job : ensureTranslation(activeLocale);

  holder.querySelectorAll('[data-field]').forEach((input) => {
    target[input.getAttribute('data-field')] = input.value;
  });

  const ready = holder.querySelector('#translationReady');
  if (ready) target.is_ready = ready.checked;

  readSections();
}

function ensureTranslation(locale) {
  job.translations = job.translations ?? {};
  job.translations[locale] = job.translations[locale] ?? { locale, is_ready: false };
  return job.translations[locale];
}

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

function sectionsFor(locale) {
  const key = isBaseTab() ? '__base' : locale;
  if (!sections.has(key)) sections.set(key, []);
  return sections.get(key);
}

function drawSections() {
  const holder = document.querySelector('#editorSectionList');
  if (!holder) return;

  const rows = sectionsFor(activeLocale);

  holder.innerHTML = rows
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
                    ${index === rows.length - 1 ? 'disabled' : ''}
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
        rows[index][input.getAttribute('data-section-field')] = input.value;
        dirty = true;
      });
    });

    row.querySelectorAll('[data-section-move]').forEach((button) => {
      button.addEventListener('click', () => {
        readSections();
        const to = index + (button.getAttribute('data-section-move') === 'up' ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        [rows[index], rows[to]] = [rows[to], rows[index]];
        dirty = true;
        drawSections();
      });
    });

    row.querySelector('[data-section-remove]')?.addEventListener('click', () => {
      readSections();
      rows.splice(index, 1);
      dirty = true;
      drawSections();
    });
  });
}

function readSections() {
  const holder = document.querySelector('#editorSectionList');
  if (!holder) return;

  const rows = sectionsFor(activeLocale);
  holder.querySelectorAll('[data-section-index]').forEach((row) => {
    const index = Number(row.getAttribute('data-section-index'));
    if (!rows[index]) return;
    row.querySelectorAll('[data-section-field]').forEach((input) => {
      rows[index][input.getAttribute('data-section-field')] = input.value;
    });
  });
}

/* -------------------------------------------------------------------------
 * The embed preview
 * ---------------------------------------------------------------------- */

/**
 * What the link will look like unfurled, per 8.2.
 *
 * Including the fallback: an empty og_description gives the first sentence of
 * the description, which is usually right, and showing that in place of an
 * empty box is what stops somebody filling the field in unnecessarily.
 */
function drawEmbedPreview() {
  const holder = document.querySelector('#embedPreview');
  if (!holder) return;

  const values = currentValues();
  const title = readInput('title') || values.title || job.title || '';
  const og = readInput('og_description') || values.og_description || '';
  const description = readInput('description') || values.description || '';

  const line = og || firstSentence(description);

  holder.innerHTML = `
    <p class="embed-site">${escapeHtml(t('brand.name'))}</p>
    <p class="embed-title">${escapeHtml(title || t('admin.embedNoTitle'))}</p>
    <p class="embed-description">${escapeHtml(line || t('admin.embedNoDescription'))}</p>
    ${
      og
        ? ''
        : `<p class="field-hint">${escapeHtml(t('admin.embedFallbackNote'))}</p>`
    }`;
}

function readInput(field) {
  return document.querySelector(`#editorTabBody [data-field="${field}"]`)?.value?.trim() ?? '';
}

/**
 * The first sentence, capped near 200, the same rule api/_lib/job-detail.js
 * applies on the server.
 *
 * Language aware in the same coarse way: a full stop, a question mark, an
 * exclamation mark, or their full width counterparts, which is what a Chinese
 * summary ends with.
 */
function firstSentence(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const match = clean.match(/^(.{1,200}?[.!?。！？])\s/u);
  if (match) return match[1];
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

/* -------------------------------------------------------------------------
 * The shared panel: everything that is not per language
 * ---------------------------------------------------------------------- */

function drawShared() {
  const holder = document.querySelector('#editorShared');
  if (!holder) return;

  holder.innerHTML = `
    <div class="field">
      <label for="jobSlug">${escapeHtml(t('admin.field_slug'))}</label>
      <input id="jobSlug" type="text" value="${escapeHtml(job.slug ?? '')}" maxlength="80">
      <p class="field-hint">${escapeHtml(t('admin.slugHint'))}</p>
      <p class="field-error" data-error-for="slug" hidden></p>
    </div>

    <div class="field">
      <label for="jobDepartment">${escapeHtml(t('admin.field_department'))}</label>
      <select id="jobDepartment">
        <option value="">${escapeHtml(t('admin.noTeam'))}</option>
        ${departments
          .map(
            (department) =>
              `<option value="${escapeHtml(department.id)}"${
                department.id === job.department_id ? ' selected' : ''
              }>${escapeHtml(department.name)}</option>`
          )
          .join('')}
      </select>
    </div>

    <div class="field">
      <label for="jobCommitment">${escapeHtml(t('admin.field_commitment'))}</label>
      <select id="jobCommitment">
        <option value="">${escapeHtml(t('admin.noCommitment'))}</option>
        ${COMMITMENTS.map(
          (key) =>
            `<option value="${key}"${key === job.commitment_type ? ' selected' : ''}>${escapeHtml(
              t(`commitment.${key}`)
            )}</option>`
        ).join('')}
      </select>
      <p class="field-hint">${escapeHtml(t('admin.commitmentHint'))}</p>
    </div>

    <div class="field-row">
      <label class="checkbox-row">
        <input type="checkbox" id="jobRemote" ${job.is_remote ? 'checked' : ''}>
        <span>${escapeHtml(t('admin.field_remote'))}</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="jobPaid" ${job.is_paid ? 'checked' : ''}>
        <span>${escapeHtml(t('admin.field_paid'))}</span>
      </label>
    </div>
    <p class="field-hint">${escapeHtml(t('admin.paidHint'))}</p>

    <div class="field">
      <label for="jobOpenings">${escapeHtml(t('admin.field_openings'))}</label>
      <input id="jobOpenings" type="number" min="0" max="999"
             value="${escapeHtml(String(job.openings ?? 1))}">
    </div>

    <fieldset class="field">
      <legend>${escapeHtml(t('admin.field_closes'))}</legend>
      <label class="checkbox-row">
        <input type="checkbox" id="jobNoDeadline" ${job.closes_at ? '' : 'checked'}>
        <span>${escapeHtml(t('admin.noDeadline'))}</span>
      </label>
      <input id="jobCloses" type="date" ${job.closes_at ? '' : 'disabled'}
             value="${escapeHtml(job.closes_at ? job.closes_at.slice(0, 10) : '')}">
      <p class="field-hint">${escapeHtml(t('admin.noDeadlineHint'))}</p>
    </fieldset>

    <div class="field">
      <label for="jobForm">${escapeHtml(t('admin.field_formUrl'))}</label>
      <input id="jobForm" type="url" value="${escapeHtml(job.application_form_url ?? '')}">
      <p class="field-hint">${escapeHtml(t('admin.formUrlHint'))}</p>
      <p class="field-error" data-error-for="application_form_url" hidden></p>

      <!-- Section 13: "Put this checklist in the admin job editor as
           collapsible help text next to the Google Form URL field, with the
           posting uuid shown and a copy button, so nobody has to go hunting for
           it." Collapsed by default, because it is read once per posting and
           the field above it is used every time. -->
      <details class="field-help">
        <summary>${escapeHtml(t('admin.webhookHelpSummary'))}</summary>
        <div class="field-help-body">
          <p>${escapeHtml(t('admin.webhookHelpIntro'))}</p>
          ${
            job.id
              ? `<div class="copy-row">
                   <code id="jobIdForScript">${escapeHtml(job.id)}</code>
                   <button type="button" class="btn btn-secondary small"
                           data-copy-job-id>${escapeHtml(t('admin.webhookCopyId'))}</button>
                 </div>`
              : // A posting that has never been saved has no uuid, and there is
                // nothing honest to put in the box. Saying so beats showing an
                // empty code block somebody would copy.
                `<p class="muted">${escapeHtml(t('admin.webhookSaveFirst'))}</p>`
          }
          <ol>
            <li>${escapeHtml(t('admin.webhookStep1'))}</li>
            <li>${escapeHtml(t('admin.webhookStep2'))}</li>
            <li>${escapeHtml(t('admin.webhookStep3'))}</li>
            <li>${escapeHtml(t('admin.webhookStep4'))}</li>
          </ol>
          <p class="muted">${escapeHtml(t('admin.webhookOptional'))}</p>
        </div>
      </details>
    </div>

    <div class="field">
      <label for="jobSheet">${escapeHtml(t('admin.field_sheetUrl'))}</label>
      <input id="jobSheet" type="url" value="${escapeHtml(job.response_sheet_url ?? '')}">
      <p class="field-hint">${escapeHtml(t('admin.sheetUrlHint'))}</p>
      <p class="field-error" data-error-for="response_sheet_url" hidden></p>
    </div>

    <div class="field field-wide">
      <label for="jobPrefill">${escapeHtml(t('admin.field_prefill'))}</label>
      <textarea id="jobPrefill" rows="3" spellcheck="false">${escapeHtml(
        job.form_prefill ? JSON.stringify(job.form_prefill, null, 0) : ''
      )}</textarea>
      <p class="field-hint">${escapeHtml(t('admin.prefillHint'))}</p>
      <p class="field-error" data-error-for="form_prefill" hidden></p>
    </div>

    <div class="field field-wide">
      <label for="tagInput">${escapeHtml(t('admin.field_tags'))}</label>
      <div class="tag-picker" id="tagPicker"></div>
      <input id="tagInput" type="text" list="tagOptions" autocomplete="off"
             placeholder="${escapeHtml(t('admin.tagPlaceholder'))}">
      <datalist id="tagOptions"></datalist>
      <p class="field-hint">${escapeHtml(t('admin.tagHint'))}</p>
      <p class="field-error" data-error-for="tags" hidden></p>
    </div>

    <fieldset class="field field-wide editor-questions">
      <legend>${escapeHtml(t('admin.postingQuestions'))}</legend>
      <p class="field-hint">${escapeHtml(t('admin.postingQuestionsHint'))}</p>
      <div id="jobQuestions"></div>
    </fieldset>`;

  hydrateIcons(holder);
  wireShared(holder);
  drawTagPicker();

  questionComposer = mountQuestionComposer(holder.querySelector('#jobQuestions'), {
    value: job.task_questions ?? [],
    onChange: () => {
      dirty = true;
    },
  });
}

/**
 * Read the panel on the right back into the model.
 *
 * The counterpart to readTabBody, and it exists for the same reason: draw()
 * rebuilds both halves from `job`, so anything on screen that has not been read
 * back is lost the moment anything triggers a redraw. A language tab switch
 * triggers one.
 */
function readShared() {
  const holder = document.querySelector('#editorShared');
  if (!holder) return;

  const value = (selector) => holder.querySelector(selector)?.value ?? '';
  const checked = (selector) => holder.querySelector(selector)?.checked === true;

  job.slug = value('#jobSlug').trim();
  job.department_id = value('#jobDepartment') || null;
  job.commitment_type = value('#jobCommitment') || null;
  job.is_remote = checked('#jobRemote');
  job.is_paid = checked('#jobPaid');

  const openings = Number(value('#jobOpenings'));
  if (Number.isInteger(openings)) job.openings = openings;

  const noDeadline = checked('#jobNoDeadline');
  const closes = value('#jobCloses');
  job.closes_at = noDeadline || !closes ? null : `${closes}T23:59:59.000Z`;

  job.application_form_url = value('#jobForm').trim() || null;
  job.response_sheet_url = value('#jobSheet').trim() || null;

  const prefill = value('#jobPrefill').trim();
  if (prefill === '') job.form_prefill = null;
  else {
    try {
      job.form_prefill = JSON.parse(prefill);
    } catch {
      // Left as it was. collect() is where a malformed map becomes a field
      // error, and losing what somebody typed on the way to that error would be
      // the worst of both.
    }
  }

  // raw() over value(), so a question with the label half typed survives
  // the redraw instead of being filtered out of existence.
  job.task_questions = questionComposer?.raw() ?? job.task_questions ?? [];
}

function wireShared(holder) {
  holder.querySelectorAll('input, select, textarea').forEach((input) => {
    input.addEventListener('input', () => {
      dirty = true;
    });
    input.addEventListener('change', () => {
      dirty = true;
    });
  });

  // Typing here is what stops the slug following the title, and the flag has to
  // outlive this node: the next redraw replaces it.
  holder.querySelector('#jobSlug')?.addEventListener('input', () => {
    slugTouched = true;
  });

  // The toggle clears the date to null instead of leaving it empty, per 8.2:
  // "a 'no closing date' toggle that clears it to null, so an admin cannot
  // leave it empty by accident and cannot be blocked by a required validator".
  const noDeadline = holder.querySelector('#jobNoDeadline');
  const closes = holder.querySelector('#jobCloses');
  noDeadline?.addEventListener('change', () => {
    closes.disabled = noDeadline.checked;
    if (noDeadline.checked) closes.value = '';
  });

  const tagInput = holder.querySelector('#tagInput');
  tagInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addTagByName(tagInput.value);
    tagInput.value = '';
  });

  // The posting id, for the form's Script Properties. Section 13's "so nobody
  // has to go hunting for it": the uuid is in the address bar, but reading one
  // out of a URL and retyping it into Google is exactly how a JOB_ID ends up
  // one character wrong and every delivery from that form answers
  // no_such_posting.
  holder.querySelector('[data-copy-job-id]')?.addEventListener('click', () => {
    runAction(async () => {
      const code = holder.querySelector('#jobIdForScript');
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code.textContent.trim());
        adminMessage('ok', t('admin.webhookIdCopied'));
      } catch {
        // Blocked, or no clipboard at all. The id is already on screen, so
        // selecting it is a complete fallback rather than a consolation.
        selectText(code);
        adminMessage('error', t('admin.webhookIdCopyFailed'));
      }
    }, 'copy posting id');
  });
}

/** Put the selection around one element's text, for a failed clipboard write. */
function selectText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/* -------------------------------------------------------------------------
 * Tags
 * ---------------------------------------------------------------------- */

/**
 * The type-ahead, per 8.2: "tags are added through a type-ahead that matches
 * existing tags first and only offers to create a new one when nothing matches,
 * so the tag list does not fill up with near duplicates".
 *
 * A datalist, not a custom combobox. It matches existing tags as you
 * type, it is keyboard and screen reader native, and the "create a new one"
 * case is what happens when what was typed matches nothing, which is exactly the
 * rule 8.2 describes.
 */
function drawTagPicker() {
  const list = document.querySelector('#tagOptions');
  if (list) {
    list.innerHTML = allTags
      .filter((tag) => !selectedTags.some((chosen) => chosen.id === tag.id))
      .map((tag) => `<option value="${escapeHtml(tag.name)}"></option>`)
      .join('');
  }

  const picker = document.querySelector('#tagPicker');
  if (!picker) return;

  picker.innerHTML = selectedTags
    .map(
      (tag) =>
        `<span class="chip chip-removable" data-tag-id="${escapeHtml(tag.id)}">` +
        `${escapeHtml(tag.name)}` +
        `<button type="button" class="icon-btn small" data-remove-tag` +
        ` aria-label="${escapeHtml(t('admin.removeTag', { name: tag.name }))}">` +
        `<span data-icon="close" data-icon-size="14"></span></button></span>`
    )
    .join('');

  hydrateIcons(picker);

  picker.querySelectorAll('[data-remove-tag]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.closest('[data-tag-id]')?.getAttribute('data-tag-id');
      selectedTags = selectedTags.filter((tag) => tag.id !== id);
      dirty = true;
      drawTagPicker();
    });
  });
}

async function addTagByName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return;

  const existing = allTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!selectedTags.some((tag) => tag.id === existing.id)) {
      selectedTags.push({ id: existing.id, name: existing.name });
      dirty = true;
      drawTagPicker();
    }
    return;
  }

  // Nothing matched, so this is the create case. Confirmed and never silent:
  // 8.7 exists because near duplicate tags are the thing that fills the list up,
  // and a tag created by a typo is exactly that.
  const confirmed = await confirmAction({
    title: t('admin.createTagConfirm', { name }),
    body: t('admin.createTagBody'),
    confirmLabel: t('admin.createTagAction'),
    // Not a destructive action, so the confirm is the ordinary primary button.
    // The panel is here to slow down a typo, not to warn about a consequence.
    danger: false,
  });

  if (!confirmed) return;

  const result = await api('/api/admin/tags', { method: 'POST', body: { action: 'save', name } });
  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  allTags.push(result.data.tag);
  selectedTags.push({ id: result.data.tag.id, name: result.data.tag.name });
  dirty = true;
  drawTagPicker();
}

/* -------------------------------------------------------------------------
 * The slug
 * ---------------------------------------------------------------------- */

/**
 * Fill the slug from the title, but only while nobody has typed one.
 *
 * A slug that rewrote itself as somebody edited the title of a published
 * posting would break a link that has been shared, so this only ever fills a
 * blank field and only on a posting that does not exist yet.
 *
 * **Two things it used to get wrong**, both found by a language tab switch.
 *
 * The "somebody has typed a slug" flag lived in a dataset attribute on the
 * input. drawShared rebuilds that input from `job` on every redraw, so the flag
 * died with the old node and the very next keystroke in the title overwrote a
 * slug that had been typed by hand.
 *
 * And it ran from whichever title field was on screen, including a translation
 * tab's. Typing a Chinese title therefore rewrote the *shared* slug from it,
 * and a Chinese title slugifies to nothing, so the field was silently emptied
 * and the save fell back to a slug generated from the English title.
 *
 * So the flag is module state, set by wireShared on the input it belongs to,
 * and the suggestion only ever comes from the default language's title, which
 * is the only one the slug is a slug of.
 */
function maybeSuggestSlug(title) {
  if (job.id || slugTouched || !isBaseTab()) return;

  const field = document.querySelector('#jobSlug');
  if (!field) return;

  field.value = String(title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/* -------------------------------------------------------------------------
 * Saving
 * ---------------------------------------------------------------------- */

function drawPublishState() {
  const holder = document.querySelector('#editorPublish');
  if (!holder) return;

  const blockers = publishBlockers();

  holder.innerHTML = `
    <p class="editor-status">
      ${escapeHtml(t('admin.currentStatus'))}
      <span class="status-pill status-${escapeHtml(job.status)}">${escapeHtml(
        t(`admin.jobStatus_${job.status}`)
      )}</span>
    </p>
    ${
      blockers.length > 0
        ? `<ul class="editor-blockers">${blockers
            .map((code) => `<li>${escapeHtml(t(`admin.blocker_${code}`))}</li>`)
            .join('')}</ul>`
        : ''
    }`;

  const publish = document.querySelector('#publishButton');
  if (publish) {
    publish.hidden = job.status === 'published';
    publish.disabled = blockers.length > 0 || !job.id;
  }
}

/** The same two rules the server enforces, so the button agrees with it. */
function publishBlockers() {
  const blockers = [];
  if (!(document.querySelector('#jobForm')?.value ?? job.application_form_url)) {
    blockers.push('no_form');
  }
  if (selectedTags.length === 0) blockers.push('no_tags');
  return blockers;
}

function collect() {
  readTabBody();
  readShared();

  // Re-read instead of trusting what readShared stored, because this is the
  // one place a malformed map has to become a field error and not be left
  // alone.
  let prefill = null;
  const prefillRaw = document.querySelector('#jobPrefill')?.value?.trim();
  if (prefillRaw) {
    try {
      prefill = JSON.parse(prefillRaw);
    } catch {
      return { error: 'form_prefill' };
    }
  }

  // Every field is read off `job`, which readShared and readTabBody have just
  // filled in from the DOM. Reading half of them from `job` and half straight
  // out of the document again was how this function came to reference two
  // variables that no longer existed, which threw before the request was ever
  // made and made Save look like it did nothing at all. One source of truth.
  //
  // closes_at is already resolved by readShared, including the "no closing
  // date" toggle and the end-of-day time: a date input gives a day, the column
  // is a timestamp, and midnight at the start of that day would close the
  // posting a day before the admin meant.
  const payload = {
    job: {
      slug: job.slug ?? '',
      title: job.title ?? '',
      summary: job.summary ?? '',
      description: job.description ?? '',
      responsibilities: job.responsibilities ?? '',
      requirements: job.requirements ?? '',
      nice_to_have: job.nice_to_have ?? '',
      location: job.location ?? '',
      compensation_note: job.compensation_note ?? '',
      og_description: job.og_description ?? '',
      sections: sections.get('__base') ?? [],
      department_id: job.department_id ?? null,
      commitment_type: job.commitment_type ?? null,
      is_remote: job.is_remote === true,
      is_paid: job.is_paid === true,
      openings: Number.isInteger(job.openings) ? job.openings : 1,
      closes_at: job.closes_at ?? null,
      application_form_url: job.application_form_url ?? null,
      response_sheet_url: job.response_sheet_url ?? null,
      form_prefill: prefill,
      task_questions: questionComposer?.value() ?? [],
    },
    tag_ids: selectedTags.map((tag) => tag.id),
    translations: {},
  };

  for (const [locale, row] of Object.entries(job.translations ?? {})) {
    payload.translations[locale] = {
      title: row.title ?? '',
      summary: row.summary ?? '',
      description: row.description ?? '',
      responsibilities: row.responsibilities ?? '',
      requirements: row.requirements ?? '',
      nice_to_have: row.nice_to_have ?? '',
      location: row.location ?? '',
      compensation_note: row.compensation_note ?? '',
      og_description: row.og_description ?? '',
      sections: sections.get(locale) ?? [],
      is_ready: row.is_ready === true,
    };
  }

  return { payload };
}

async function save() {
  clearFieldErrors();

  const collected = collect();
  if (collected.error) {
    showFieldError(collected.error, 'invalid');
    return;
  }

  const body = collected.payload;
  body.action = job.id ? 'update' : 'create';
  if (job.id) body.id = job.id;

  const result = await api('/api/admin/jobs', { method: 'POST', body });

  if (!result.ok) {
    const details = result.error?.details ?? {};
    for (const [field, code] of Object.entries(details)) showFieldError(field, code);
    adminApiError(result.error);
    return;
  }

  dirty = false;

  if (!job.id) {
    // A new posting has an id now, and the address bar should say so: a reload
    // must not create a second one.
    window.location.replace(`/admin/jobs/edit?id=${encodeURIComponent(result.data.job.id)}`);
    return;
  }

  job = result.data.job;
  seedSections();
  selectedTags = (job.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name }));
  adminMessage('ok', t('admin.saved'));
  draw();
}

async function publish() {
  await save();
  if (dirty) return;

  const result = await api('/api/admin/jobs', {
    method: 'POST',
    body: { action: 'status', id: job.id, status: 'published' },
  });

  if (!result.ok) {
    const blockers = result.error?.details?.blockers;
    adminMessage(
      'error',
      Array.isArray(blockers)
        ? `${t('admin.cannotPublish')} ${blockers.map((code) => t(`admin.blocker_${code}`)).join(' ')}`
        : (result.error?.message ?? t('error.unexpected'))
    );
    return;
  }

  job.status = 'published';
  job.published_at = result.data.published_at;
  adminMessage('ok', t('admin.published'));
  draw();
}

function showFieldError(field, code) {
  // Translation errors come back prefixed with their language, so the message
  // lands on the tab it belongs to and not on whichever one is open.
  const [maybeLocale, maybeField] = field.split('.');
  const target = maybeField ? maybeField : field;

  const node = document.querySelector(`[data-error-for="${CSS.escape(target)}"]`);
  if (node) {
    node.textContent = t(`field.${code}`);
    node.hidden = false;
  }

  if (maybeField && maybeLocale !== activeLocale) {
    adminMessage('error', t('admin.errorOnTab', { language: maybeLocale }));
  }
}

function clearFieldErrors() {
  document.querySelectorAll('[data-error-for]').forEach((node) => {
    node.hidden = true;
    node.textContent = '';
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? []));
}

/**
 * Run one of the three actions, and say so when it throws.
 *
 * The catch is not defensive padding. `collect()` threw a ReferenceError on the
 * live site, before the request was ever made, and because these were bare
 * calls on a click handler the rejection went to the console and nothing
 * appeared on screen: Save looked like a button that did nothing. An editor
 * somebody has spent ten minutes in is the worst place on the site for a silent
 * failure, because the obvious next move is to try again and then leave.
 *
 * The message is deliberately the generic one. Whatever went wrong here is a
 * fault in this page, not something the admin can act on, and the
 * console still carries the real cause for whoever reads it.
 */
function runAction(action, label) {
  try {
    const result = action();
    if (result && typeof result.catch === 'function') {
      result.catch((cause) => {
        console.error(`[careers-gftv] editor ${label}:`, cause);
        adminMessage('error', t('error.unexpected'));
      });
    }
  } catch (cause) {
    console.error(`[careers-gftv] editor ${label}:`, cause);
    adminMessage('error', t('error.unexpected'));
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('#saveButton')) runAction(save, 'save');
  if (event.target.closest('#publishButton')) runAction(publish, 'publish');
  if (event.target.closest('#previewButton')) runAction(openPreview, 'preview');
});

/**
 * The description as it will render, using the same renderer the posting page
 * uses. 8.2: "The preview should import assets/js/markdown.js rather than
 * reimplement it", which is also the only way the preview can be true.
 */
/**
 * Open the posting as a reader would see it, in a new tab.
 *
 * This was an inline panel that rendered the description through markdown.js,
 * which answered a narrower question than anybody actually has: what a reader
 * sees is the whole page, with the badges, the meta rows, the sections, the
 * unpaid notice, and the Apply control, and a preview that showed one field of
 * it was a preview of the wrong thing. `/jobs/{uuid}?preview=1` is the real
 * page, rendered by the real function, so nothing can drift out of step with it
 * because there is nothing to keep in step.
 *
 * **It saves first.** The preview reads the database, so previewing unsaved
 * edits would show the previous version and quietly look like the edits had not
 * worked. If the save fails the tab is closed instead of left pointing at
 * something stale.
 *
 * **The tab is opened before the await, not after.** A `window.open` that
 * follows an await is a popup and not a click for every browser that counts
 * them, and gets blocked. Phase 5 hit exactly this in the apply handoff and
 * settled it the same way: open synchronously, navigate once the work is done,
 * and treat a null return as blocked, not as an error.
 */
async function openPreview() {
  if (!job.id) {
    // Nothing to preview: the posting has no address until it exists. Saving
    // first would work, but it would also mean the Preview button silently
    // creates a posting, which is not what it says it does.
    adminMessage('error', t('admin.previewNeedsSave'));
    return;
  }

  const tab = window.open('', '_blank');

  await save();

  if (!tab) {
    // Blocked. The link is offered in place of a dead end, and it is
    // the same address the tab would have gone to.
    adminMessage('error', t('admin.previewBlocked'));
    return;
  }

  if (dirty) {
    // save() leaves dirty set when it refused, so there is nothing worth
    // showing and the empty tab would otherwise sit there.
    tab.close();
    return;
  }

  tab.location = `/jobs/${encodeURIComponent(job.id)}?preview=1`;
  // The same mitigation phase 5 applies to the form tab, for the same reason:
  // this window stays reachable through opener otherwise.
  tab.opener = null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
