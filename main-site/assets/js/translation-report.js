// "Report a translation problem", from 7h.
//
// Nobody on the GFTV side necessarily reads both languages well enough to catch
// a bad posting before an applicant does, so the applicants are the correction
// loop. The whole design of this control follows from one sentence in 7h:
// assume every translation is wrong until somebody says otherwise, and make
// saying so easy.
//
// What that means in practice, and what to leave alone:
//
//   **It is quiet.** A link at the foot of the posting beside the share and
//   back links. Not a banner, not a prompt, and never a modal that appears by
//   itself. A reader who is happy with the wording should be able to finish the
//   page without ever noticing this.
//
//   **The form asks what is wrong, not what kind of thing is wrong.** The same
//   control is meant to appear on interface strings later, and a reader who
//   spots a bad label in the navigation should not have to work out that it is
//   a dictionary key and not part of a posting before they can complain
//   about it. That is why target_type is decided by the caller and never asked.
//
//   **The reporter may write in either language.** The language select says
//   which version reads wrongly, not which language the report is written in.
//   Somebody reporting bad Chinese is often the person who reads Chinese least
//   well, and forcing them into it would lose the report.
//
//   **A suggestion is never applied automatically.** The form says so, so a
//   reporter knows an admin reads it first and does not assume their wording is
//   now live.
//
// This module is deliberately not specific to the posting page. Phase 8's
// annotation layer writes to the same table and phase 6 will show a reader
// their own reports; both should call openReportDialog instead of building a
// second form.

import { api, applicantSession } from './api.js';
import { t, getLocale, LOCALES } from './i18n.js';
import { createDialog, translateWithin } from './dialog.js';
import { openSignInPrompt } from './signin-prompt.js';
import { escapeHtml } from './markdown.js';

// Which part of a posting reads wrongly. These name columns on the translation
// row, per migration 015, and the server checks them against the same list.
// Optional throughout: "the whole posting" is the default and is a real answer.
const JOB_FIELDS = [
  { value: 'title', key: 'report.fieldTitle' },
  { value: 'summary', key: 'report.fieldSummary' },
  { value: 'description', key: 'report.fieldDescription' },
  { value: 'responsibilities', key: 'report.fieldResponsibilities' },
  { value: 'requirements', key: 'report.fieldRequirements' },
  { value: 'nice_to_have', key: 'report.fieldNiceToHave' },
  { value: 'location', key: 'report.fieldLocation' },
];

let dialog = null;
let current = null;

/**
 * Open the report form.
 *
 * @param {{
 *   targetType: 'job'|'department'|'tag'|'interface',
 *   targetId?: string,
 *   targetKey?: string,
 *   fields?: boolean
 * }} target `fields` offers the which-part select, which only makes sense for a
 *   posting. A department or a tag has one name, and an interface string is one
 *   string.
 */
export function openReportDialog(target) {
  current = target;

  if (!dialog) dialog = buildDialog();

  // Redrawn on every open, not once. The language select has to default
  // to the version being read *now*, and the reader may have switched since the
  // dialog was last built.
  renderForm();
  dialog.open();
}

/**
 * Wire a control that opens the form, going through the sign in prompt when
 * there is no session.
 *
 * The session is checked when the control is clicked instead of when the page
 * loads, so the control appears immediately and does not wait on a request that
 * changes nothing for most readers.
 *
 * @param {HTMLElement} button
 * @param {() => object} targetFor called at click time, so the target can
 *        depend on what is on screen by then.
 */
export function wireReportControl(button, targetFor) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const session = await applicantSession();
      if (!session?.user) {
        // 7h: for a logged out visitor this opens the same sign in prompt as
        // Apply, and completes the report on return.
        openSignInPrompt({ intent: 'report', messageKey: 'report.needAccount' });
        return;
      }
      openReportDialog(targetFor());
    } finally {
      button.disabled = false;
    }
  });
}

/* -------------------------------------------------------------------------
 * The form
 * ---------------------------------------------------------------------- */

function buildDialog() {
  const built = createDialog({
    id: 'reportDialog',
    titleKey: 'report.title',
    className: 'report-dialog',
    bodyHtml: `
      <!-- method="post" for the same reason every credential form on the site
           carries it: a form with no method defaults to GET, so a submit that
           happens before its handler is attached puts every field in the query
           string. This one is built and wired in the same tick and has no such
           window, but a form on this site that is not a search form is a POST,
           and an exception nobody can explain is how the rule gets dropped. -->
      <form method="post" id="reportForm" novalidate>
        <p class="report-intro" data-i18n="report.intro"></p>

        <div class="field">
          <label for="reportLocale" data-i18n="report.whichLanguage"></label>
          <select id="reportLocale" name="locale"></select>
        </div>

        <div class="field" id="reportFieldRow" hidden>
          <label for="reportField" data-i18n="report.whichField"></label>
          <select id="reportField" name="field"></select>
        </div>

        <div class="field">
          <label for="reportNote" data-i18n="report.note"></label>
          <textarea id="reportNote" name="note" rows="4" maxlength="2000"
                    data-autofocus required
                    data-i18n-attr="placeholder:report.notePlaceholder"></textarea>
          <p class="field-error" id="reportNoteError" hidden></p>
        </div>

        <div class="field">
          <label for="reportSuggestion" data-i18n="report.suggestion"></label>
          <textarea id="reportSuggestion" name="suggested_text" rows="3"
                    maxlength="2000"></textarea>
          <p class="field-hint" data-i18n="report.suggestionOptional"></p>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn btn-secondary" data-close-dialog
                  data-i18n="report.cancel"></button>
          <button type="submit" class="btn btn-primary" id="reportSubmit"
                  data-i18n="report.submit"></button>
        </div>
      </form>

      <!-- Outside the form, not inside it. On success the form is hidden and
           this is the only thing left on screen, so a confirmation living
           inside the form would be hidden along with it and the reader would
           watch the dialog empty itself. -->
      <p class="form-message" id="reportMessage" role="status" hidden></p>
    `,
  });

  built.panel.querySelector('#reportForm').addEventListener('submit', submit);

  // The two selects are written by JavaScript instead of carrying data-i18n
  // attributes, so a language change is a redraw, not a retranslation.
  document.addEventListener('gftv:localechange', () => {
    if (current) renderForm({ keepInput: true });
  });

  return built;
}

function renderForm(options = {}) {
  const panel = dialog.panel;
  const form = panel.querySelector('#reportForm');

  const localeSelect = panel.querySelector('#reportLocale');
  const previousLocale = options.keepInput ? localeSelect.value : null;

  // Every language the portal offers, each named in its own script and never
  // translated, exactly as the switcher names them. A reader looking for the
  // Chinese version looks for the characters.
  localeSelect.innerHTML = LOCALES.map(
    (locale) =>
      `<option value="${locale.id}" lang="${locale.htmlLang}">${locale.native}</option>`
  ).join('');
  // Defaults to the version being read, per 7h, since that is the one in front
  // of them and the one they are complaining about nine times in ten.
  localeSelect.value = previousLocale ?? getLocale();

  const fieldRow = panel.querySelector('#reportFieldRow');
  const fieldSelect = panel.querySelector('#reportField');
  const showFields = current?.targetType === 'job' && current?.fields !== false;

  fieldRow.hidden = !showFields;
  if (showFields) {
    const previousField = options.keepInput ? fieldSelect.value : '';
    fieldSelect.innerHTML =
      `<option value="">${escapeHtml(t('report.wholePosting'))}</option>` +
      JOB_FIELDS.map(
        (field) => `<option value="${field.value}">${escapeHtml(t(field.key))}</option>`
      ).join('');
    fieldSelect.value = previousField;
  }

  if (!options.keepInput) {
    form.reset();
    localeSelect.value = getLocale();
    if (showFields) fieldSelect.value = '';
    setMessage(null);
    setNoteError(null);
    panel.querySelector('#reportSubmit').disabled = false;
    form.hidden = false;
  }

  translateWithin(panel);
}

async function submit(event) {
  event.preventDefault();

  const panel = dialog.panel;
  const form = panel.querySelector('#reportForm');
  const submitButton = panel.querySelector('#reportSubmit');

  const note = panel.querySelector('#reportNote').value.trim();
  if (note === '') {
    setNoteError('report.noteRequired');
    panel.querySelector('#reportNote').focus();
    return;
  }
  setNoteError(null);

  const suggestion = panel.querySelector('#reportSuggestion').value.trim();
  const fieldRow = panel.querySelector('#reportFieldRow');
  const field = fieldRow.hidden ? '' : panel.querySelector('#reportField').value;

  submitButton.disabled = true;
  setMessage(null);

  const result = await api('/api/translations/report', {
    method: 'POST',
    // Nothing here is content coming back, so no locale is appended. The locale
    // in the body is data: which version reads wrongly.
    locale: false,
    body: {
      target_type: current.targetType,
      target_id: current.targetId ?? null,
      target_key: current.targetKey ?? null,
      field: field === '' ? null : field,
      locale: panel.querySelector('#reportLocale').value,
      note,
      suggested_text: suggestion === '' ? null : suggestion,
    },
  });

  if (!result.ok) {
    submitButton.disabled = false;

    // The session can lapse between the page loading and the form being sent.
    // Saying "sign in" is the honest answer, and the prompt carries them back.
    if (result.error?.code === 'unauthorised') {
      dialog.close();
      openSignInPrompt({ intent: 'report', messageKey: 'report.needAccount' });
      return;
    }

    setMessage(result.error?.message || t('report.error'), 'danger');
    return;
  }

  // Confirm plainly, and say a person will look at it. 7h: do not promise a
  // timeframe.
  form.hidden = true;
  setMessage(t('report.thanks'), 'ok');
}

// Same shape showFormMessage in forms.js uses, so a message on this form looks
// like a message on the login form: a callout of the given kind, at the foot.
function setMessage(text, kind) {
  const el = dialog.panel.querySelector('#reportMessage');
  el.className = text ? `callout ${kind} form-message` : 'form-message';
  el.textContent = text ?? '';
  el.hidden = !text;
}

function setNoteError(key) {
  const el = dialog.panel.querySelector('#reportNoteError');
  el.textContent = key ? t(key) : '';
  el.hidden = !key;
  dialog.panel
    .querySelector('#reportNote')
    .setAttribute('aria-invalid', key ? 'true' : 'false');
}
