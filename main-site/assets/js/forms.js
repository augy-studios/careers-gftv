// Form plumbing shared by every page that has a form.
//
// Three jobs: put an error next to the field it belongs to, keep the submit
// button honest about whether something is in flight, and make a password
// field revealable.
//
// The field error codes come from api/_lib/validate.js and are deliberately
// codes, not sentences, because the same endpoint answers a reader in
// either language. This file maps a code to a dictionary key.
//
// Accessibility, which is the reason most of this exists in place of a class
// toggle: the message is tied to the input with aria-describedby, the input is
// marked aria-invalid, focus moves to the first field that failed, and the
// summary is a live region so it is announced without stealing focus.

import { t } from './i18n.js';

/** A field error code to its dictionary key. */
function fieldMessage(code) {
  const key = `field.${code}`;
  const translated = t(key);
  return translated === key ? t('field.invalid') : translated;
}

/**
 * Clear every error on a form.
 * @param {HTMLFormElement} form
 */
export function clearErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((el) => {
    el.textContent = '';
    el.hidden = true;
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    el.removeAttribute('aria-invalid');
  });
  const summary = form.querySelector('[data-form-message]');
  if (summary) {
    summary.textContent = '';
    summary.hidden = true;
    summary.className = 'callout form-message';
  }
}

/**
 * Show one field error.
 * @param {HTMLFormElement} form
 * @param {string} name the input's name attribute
 * @param {string} code a code from validate.js
 * @returns {boolean} whether the field was found
 */
export function setFieldError(form, name, code) {
  const holder = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
  const input = form.elements.namedItem(name);

  if (!holder) return false;

  holder.textContent = fieldMessage(code);
  holder.hidden = false;

  if (input instanceof HTMLElement) {
    input.setAttribute('aria-invalid', 'true');
  }

  return true;
}

/**
 * Apply an error from the API. Field level details go next to their fields,
 * and anything left over goes in the summary, so nothing is ever swallowed.
 *
 * The overrides matter more than they look. The API answers in English,
 * because it is one deployment with no dictionary, and it deliberately gives
 * the same generic sentence for several different failures so that a login
 * response cannot be used to work out which accounts exist. A page that knows
 * what it asked for can say the same thing in the reader's own language, which
 * is what overrides are for: a map of error code to an already translated
 * sentence.
 *
 * @param {HTMLFormElement} form
 * @param {{ code: string, message: string, details?: object|null }} error
 * @param {Record<string,string>} [overrides] error code to a translated sentence
 */
export function applyApiError(form, error, overrides = {}) {
  clearErrors(form);

  const details = error?.details ?? null;
  let placed = 0;
  let unplaced = false;

  if (details && typeof details === 'object') {
    for (const [field, code] of Object.entries(details)) {
      if (typeof code !== 'string') continue;
      if (setFieldError(form, field, code)) placed += 1;
      else unplaced = true;
    }
  }

  // The summary carries the sentence whenever there is nothing field specific
  // to hang it on, or when something came back that has no field on this form.
  if (placed === 0 || unplaced) {
    const override = overrides[error?.code];
    showFormMessage(form, 'danger', override ?? error?.message ?? t('error.unexpected'));
  }

  focusFirstError(form);
}

/**
 * Put a message at the top of the form.
 * @param {HTMLFormElement} form
 * @param {'danger'|'warn'|'ok'|'note'} kind
 * @param {string} text
 */
export function showFormMessage(form, kind, text) {
  const summary = form.querySelector('[data-form-message]');
  if (!summary) return;

  summary.className = `callout ${kind} form-message`;
  summary.textContent = text;
  summary.hidden = false;
}

/** Move focus to the first field carrying an error. */
export function focusFirstError(form) {
  const first = form.querySelector('[aria-invalid="true"]');
  if (first instanceof HTMLElement) {
    first.focus();
    return;
  }
  const summary = form.querySelector('[data-form-message]:not([hidden])');
  if (summary instanceof HTMLElement) summary.scrollIntoView({ block: 'nearest' });
}

/**
 * Mark a form as working. Disables the submit button, shows a spinner in it,
 * and puts the label back afterwards.
 *
 * @param {HTMLFormElement} form
 * @param {boolean} working
 */
export function setWorking(form, working) {
  form.setAttribute('data-working', working ? 'true' : 'false');

  form.querySelectorAll('button[type="submit"]').forEach((button) => {
    if (working) {
      button.disabled = true;
      if (!button.querySelector('.spinner')) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner small';
        button.prepend(spinner);
      }
    } else {
      button.disabled = false;
      button.querySelector('.spinner')?.remove();
    }
  });
}

/**
 * Read a form into a plain object. Checkboxes come back as booleans, and
 * passwords are read as typed with no trimming, since a trailing space is part
 * of a password even when it is a mistake.
 * @param {HTMLFormElement} form
 * @returns {Record<string, string|boolean>}
 */
export function readForm(form) {
  const out = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === 'checkbox') out[element.name] = element.checked;
    else if (element.type === 'submit' || element.type === 'button') continue;
    else out[element.name] = element.value;
  }
  return out;
}

/**
 * Wire the show and hide control on a password field.
 *
 * The button is inside the field, not beside it, and it is a real
 * button so it is reachable by keyboard. aria-pressed says which state it is
 * in, which is what a screen reader announces.
 * @param {ParentNode} [root]
 */
export function wirePasswordToggles(root = document) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) => {
    if (button.hasAttribute('data-wired')) return;
    button.setAttribute('data-wired', '');

    const targetName = button.getAttribute('data-toggle-password');
    // Scoped to the button's own form first. A page can carry three fields
    // named current_password, one per section, and a document wide lookup
    // would wire all three buttons to the first of them.
    const scope = button.closest('form') ?? root;
    const input = scope.querySelector(`input[name="${CSS.escape(targetName)}"]`);
    if (!input) return;

    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!showing));
      button.setAttribute('aria-label', t(showing ? 'field.showPassword' : 'field.hidePassword'));
      input.focus();
    });

    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', t('field.showPassword'));
  });
}

/**
 * The ?redirect= parameter, or null.
 *
 * Only ever used to decide where to go after a successful sign in, and only
 * ever as a relative path. The server side allowlist in api/_lib/redirects.js
 * is the authority; this is the same rule applied early so the client does not
 * build a link it would have rejected.
 */
export function redirectTarget() {
  const value = new URL(window.location.href).searchParams.get('redirect');
  if (typeof value !== 'string' || value === '') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes(':') || value.includes('@') || value.includes('\\')) return null;
  return value;
}

/** Carry a redirect through to another page on this site. */
export function withRedirect(path) {
  const target = redirectTarget();
  return target ? `${path}?redirect=${encodeURIComponent(target)}` : path;
}
