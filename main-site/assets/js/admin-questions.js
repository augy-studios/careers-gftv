// The question set composer, from 8.3 and 7g. Used in two places: on a posting,
// where the set is asked of everybody who applies from then on, and on an info
// request, where it is asked of the applicants who were ticked.
//
// "The composer adds them one at a time, choosing short answer, long answer,
// choice, or checkbox, writing the label, marking it required or not, and
// listing the options for the two list types. It has a tab per language, like
// the job editor and read from the same gftvjobs_locales, and it shows at a
// glance which languages a question is still missing."
//
// Four rules it has to make visible rather than merely obey:
//
//   **Once sent, the set is frozen**, and "the composer says so before the send
//   rather than after". So the warning is above the send button, not in the
//   confirmation that follows it.
//
//   **Option values are language independent and the answer stores the value.**
//   The value field is therefore its own input rather than something generated
//   from the English label, because an English label typed today and edited
//   tomorrow would silently change what every answer means.
//
//   **A blank language falls back to one that was written**, so a question with
//   only English is legal and is drawn with a marker rather than refused.
//
//   **The cap is twenty**, which is enforced by the server and by migration 031.
//   The control disappears at twenty rather than failing on save.

import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { escapeHtml } from './markdown.js';
import { adminLocales } from './admin-shell.js';

export const MAX_QUESTIONS = 20;
export const MAX_OPTIONS = 40;

const TYPES = ['short_answer', 'long_answer', 'choice', 'checkbox'];
const LIST_TYPES = ['choice', 'checkbox'];

/**
 * Mount a composer into an element.
 *
 * The component owns its own state and hands it back on demand rather than
 * writing into a form: a question set is nested and ordered, and the shape a
 * form serialises to is neither.
 *
 * @param {HTMLElement} root
 * @param {{ value?: object[], onChange?: () => void }} [options]
 * @returns {{ value: () => object[], set: (questions: object[]) => void, count: () => number }}
 */
export function mountQuestionComposer(root, options = {}) {
  /** The working set. Cloned, so a caller's array is never mutated underneath it. */
  let questions = clone(options.value ?? []);
  let activeLocale = adminLocales()[0]?.code ?? 'en';

  function notify() {
    options.onChange?.();
  }

  function draw() {
    const locales = adminLocales();

    root.innerHTML = `
      <div class="question-composer">
        <div class="question-composer-head">
          <div class="lang-tabs" role="tablist" aria-label="${escapeHtml(
            t('admin.languageTabsLabel')
          )}">
            ${locales
              .map(
                (locale) =>
                  `<button type="button" class="lang-tab" role="tab" data-locale="${escapeHtml(
                    locale.code
                  )}" aria-selected="${locale.code === activeLocale}"${
                    locale.code === activeLocale ? '' : ' tabindex="-1"'
                  }>${escapeHtml(locale.native_name)}</button>`
              )
              .join('')}
          </div>
          <p class="muted question-count">${escapeHtml(
            t('admin.questionCount', { count: questions.length, max: MAX_QUESTIONS })
          )}</p>
        </div>

        <ol class="question-list">
          ${questions.map((question, index) => questionMarkup(question, index, locales)).join('')}
        </ol>

        ${
          questions.length === 0
            ? `<p class="muted admin-empty">${escapeHtml(t('admin.noQuestions'))}</p>`
            : ''
        }

        ${
          questions.length < MAX_QUESTIONS
            ? `<div class="question-add">
                 ${TYPES.map(
                   (type) =>
                     `<button type="button" class="btn btn-quiet small" data-add="${type}">` +
                     `${iconMarkup('plus', { size: 15 })}<span>${escapeHtml(
                       t(`admin.questionType_${type}`)
                     )}</span></button>`
                 ).join('')}
               </div>`
            : `<p class="muted">${escapeHtml(t('admin.questionsAtCap', { max: MAX_QUESTIONS }))}</p>`
        }
      </div>`;

    hydrateIcons(root);
    wire();
  }

  function questionMarkup(question, index, locales) {
    const missing = locales
      .filter((locale) => !question.label?.[locale.code])
      .map((locale) => locale.code);

    return `
      <li class="question-item glass-card" data-index="${index}">
        <div class="question-item-head">
          <span class="question-type-pill">${escapeHtml(
            t(`admin.questionType_${question.type}`)
          )}</span>
          ${
            missing.length > 0
              ? `<span class="badge badge-untranslated" title="${escapeHtml(
                  t('admin.questionMissingHint')
                )}">${escapeHtml(t('admin.questionMissing', { languages: missing.join(', ') }))}</span>`
              : ''
          }
          <span class="question-item-controls">
            <button type="button" class="icon-btn small" data-move="up" ${
              index === 0 ? 'disabled' : ''
            } aria-label="${escapeHtml(t('admin.moveUp'))}">&#8593;</button>
            <button type="button" class="icon-btn small" data-move="down" ${
              index === questions.length - 1 ? 'disabled' : ''
            } aria-label="${escapeHtml(t('admin.moveDown'))}">&#8595;</button>
            <button type="button" class="icon-btn small danger" data-remove
                    aria-label="${escapeHtml(t('admin.removeQuestion'))}">
              <span data-icon="trash" data-icon-size="16"></span>
            </button>
          </span>
        </div>

        <div class="field">
          <label for="q-${index}-label">${escapeHtml(t('admin.questionLabel'))}</label>
          <input id="q-${index}-label" type="text" data-field="label" maxlength="300"
                 value="${escapeHtml(question.label?.[activeLocale] ?? '')}">
        </div>

        <div class="field">
          <label for="q-${index}-help">${escapeHtml(t('admin.questionHelp'))}</label>
          <input id="q-${index}-help" type="text" data-field="help" maxlength="500"
                 value="${escapeHtml(question.help?.[activeLocale] ?? '')}">
        </div>

        <label class="checkbox-row">
          <input type="checkbox" data-field="required" ${question.required ? 'checked' : ''}>
          <span>${escapeHtml(t('admin.questionRequired'))}</span>
        </label>

        ${LIST_TYPES.includes(question.type) ? optionsMarkup(question, index) : ''}
      </li>`;
  }

  function optionsMarkup(question, index) {
    const options = question.options ?? [];

    return `
      <fieldset class="question-options">
        <legend>${escapeHtml(t('admin.questionOptions'))}</legend>
        <p class="field-hint">${escapeHtml(t('admin.questionOptionsHint'))}</p>
        ${options
          .map(
            (option, optionIndex) => `
          <div class="question-option" data-option-index="${optionIndex}">
            <label class="visually-hidden" for="q-${index}-o-${optionIndex}-value">${escapeHtml(
              t('admin.optionValue')
            )}</label>
            <input id="q-${index}-o-${optionIndex}-value" type="text" class="option-value"
                   data-option-field="value" maxlength="80" placeholder="${escapeHtml(
                     t('admin.optionValuePlaceholder')
                   )}" value="${escapeHtml(option.value ?? '')}">
            <label class="visually-hidden" for="q-${index}-o-${optionIndex}-label">${escapeHtml(
              t('admin.optionLabel')
            )}</label>
            <input id="q-${index}-o-${optionIndex}-label" type="text" data-option-field="label"
                   maxlength="300" placeholder="${escapeHtml(
                     t('admin.optionLabelPlaceholder')
                   )}" value="${escapeHtml(option.label?.[activeLocale] ?? '')}">
            <button type="button" class="icon-btn small danger" data-remove-option
                    aria-label="${escapeHtml(t('admin.removeOption'))}">
              <span data-icon="close" data-icon-size="16"></span>
            </button>
          </div>`
          )
          .join('')}
        ${
          options.length < MAX_OPTIONS
            ? `<button type="button" class="btn btn-quiet small" data-add-option>` +
              `${iconMarkup('plus', { size: 15 })}<span>${escapeHtml(
                t('admin.addOption')
              )}</span></button>`
            : ''
        }
      </fieldset>`;
  }

  /* ---------------------------------------------------------------------
   * Wiring
   * ------------------------------------------------------------------ */

  function wire() {
    root.querySelectorAll('[data-locale]').forEach((tab) => {
      tab.addEventListener('click', () => {
        // The working set already holds every language, so switching tabs is a
        // redraw and never a save. That is what makes it safe to move between
        // them mid edit.
        activeLocale = tab.getAttribute('data-locale');
        draw();
      });
    });

    root.querySelectorAll('[data-add]').forEach((button) => {
      button.addEventListener('click', () => {
        questions.push(blankQuestion(button.getAttribute('data-add')));
        draw();
        notify();
        // Focus the label of the question that was just added, which is the
        // only thing anybody does next.
        root.querySelector(`[data-index="${questions.length - 1}"] [data-field="label"]`)?.focus();
      });
    });

    root.querySelectorAll('.question-item').forEach((item) => {
      const index = Number(item.getAttribute('data-index'));
      const question = questions[index];
      if (!question) return;

      item.querySelector('[data-field="label"]')?.addEventListener('input', (event) => {
        setText(question, 'label', event.target.value);
        notify();
      });

      item.querySelector('[data-field="help"]')?.addEventListener('input', (event) => {
        setText(question, 'help', event.target.value);
        notify();
      });

      item.querySelector('[data-field="required"]')?.addEventListener('change', (event) => {
        question.required = event.target.checked;
        notify();
      });

      item.querySelectorAll('[data-move]').forEach((button) => {
        button.addEventListener('click', () => {
          const to = index + (button.getAttribute('data-move') === 'up' ? -1 : 1);
          if (to < 0 || to >= questions.length) return;
          [questions[index], questions[to]] = [questions[to], questions[index]];
          draw();
          notify();
        });
      });

      item.querySelector('[data-remove]')?.addEventListener('click', () => {
        // Freely, and only here: 7g allows questions to be deleted in the
        // composer and not at all after sending.
        questions.splice(index, 1);
        draw();
        notify();
      });

      item.querySelector('[data-add-option]')?.addEventListener('click', () => {
        question.options = question.options ?? [];
        question.options.push({ value: '', label: {} });
        draw();
        notify();
      });

      item.querySelectorAll('.question-option').forEach((row) => {
        const optionIndex = Number(row.getAttribute('data-option-index'));
        const option = question.options?.[optionIndex];
        if (!option) return;

        row.querySelector('[data-option-field="value"]')?.addEventListener('input', (event) => {
          // Narrowed as it is typed rather than refused on save. The value is
          // language independent by definition, so anything outside this set is
          // a mistake rather than a choice.
          option.value = event.target.value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
          if (option.value !== event.target.value) event.target.value = option.value;
          notify();
        });

        row.querySelector('[data-option-field="label"]')?.addEventListener('input', (event) => {
          setText(option, 'label', event.target.value);
          notify();
        });

        row.querySelector('[data-remove-option]')?.addEventListener('click', () => {
          question.options.splice(optionIndex, 1);
          draw();
          notify();
        });
      });
    });
  }

  function setText(target, field, value) {
    const text = value.trim();
    target[field] = target[field] ?? {};
    if (text === '') delete target[field][activeLocale];
    else target[field][activeLocale] = text;
  }

  draw();

  return {
    /**
     * The set, cleaned of anything the server would refuse anyway: a question
     * with no label in any language, and an option with no value. Both are the
     * state a half filled row is in while somebody is typing, and refusing the
     * whole save because one is still blank would be the composer arguing with
     * the person using it.
     */
    value() {
      return questions
        .map((question) => {
          const shaped = {
            id: question.id,
            type: question.type,
            required: question.required === true,
            label: { ...(question.label ?? {}) },
          };
          if (Object.keys(question.help ?? {}).length > 0) shaped.help = { ...question.help };

          if (LIST_TYPES.includes(question.type)) {
            shaped.options = (question.options ?? [])
              .filter((option) => option.value && Object.keys(option.label ?? {}).length > 0)
              .map((option) => ({ value: option.value, label: { ...option.label } }));
          }

          return shaped;
        })
        .filter((question) => Object.keys(question.label).length > 0)
        .filter((question) => !LIST_TYPES.includes(question.type) || question.options.length > 0);
    },
    /**
     * The working set exactly as it stands, half typed rows included.
     *
     * Not for sending anywhere. It exists so a caller that redraws the panel
     * around this component, which the editor does on every language tab
     * switch, can hand the state back rather than losing a question somebody
     * had started. value() filters, and filtering on a redraw would delete the
     * row somebody was in the middle of writing.
     */
    raw() {
      return clone(questions);
    },
    set(next) {
      questions = clone(next ?? []);
      draw();
    },
    count() {
      return questions.length;
    },
  };
}

function blankQuestion(type) {
  return {
    // Generated here and never again. An answer keys on it, so a question that
    // changed its id between two saves would orphan every answer given in
    // between; nothing in this component ever rewrites one.
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: TYPES.includes(type) ? type : 'short_answer',
    required: false,
    label: {},
    ...(LIST_TYPES.includes(type) ? { options: [{ value: '', label: {} }] } : {}),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? []));
}

/**
 * A read only rendering of a set, for the frozen case: a task that has already
 * been sent, or a posting's template shown beside the postings list.
 *
 * @param {object[]} questions already resolved into one language by the server
 * @returns {string} markup
 */
export function questionSummary(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return '';

  return `
    <ol class="question-summary">
      ${questions
        .map(
          (question) => `
        <li>
          <span class="question-summary-label">${escapeHtml(question.label)}</span>
          <span class="question-type-pill">${escapeHtml(
            t(`admin.questionType_${question.type}`)
          )}</span>
          ${
            question.required
              ? `<span class="badge">${escapeHtml(t('admin.questionRequiredShort'))}</span>`
              : ''
          }
          ${
            Array.isArray(question.options) && question.options.length > 0
              ? `<span class="muted">${escapeHtml(
                  question.options.map((option) => option.label).join(', ')
                )}</span>`
              : ''
          }
        </li>`
        )
        .join('')}
    </ol>`;
}
