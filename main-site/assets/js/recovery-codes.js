// The recovery code dialog.
//
// Section 5c, and the sentence that governs the whole design of this file:
// there is no email in this build, so these codes are the only self serve way
// back into an account. Say that on screen, more than once, and design
// accordingly.
//
// What that means here:
//
//   The codes are shown once and are not recoverable afterwards. The dialog
//   says so before it lists them.
//   Copy and download are both offered, because a person on a phone and a
//   person at a desk save things differently.
//   The dialog does not close on Escape, on a backdrop click, or on anything
//   else until the checkbox confirming they have been saved is ticked. That is
//   deliberate friction and is not a bug to be smoothed away later.
//
// The dialog is built here rather than sitting in every page's markup, because
// three separate flows raise it: registering, resetting a password, and
// regenerating from the security page.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { api } from './api.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Show a freshly generated set. Resolves when the person has confirmed they
 * have saved them and closed the dialog.
 *
 * @param {{ codes: string[], set: 'recovery'|'backup' }} options
 * @returns {Promise<void>}
 */
export function showRecoveryCodes({ codes, set = 'recovery' }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;

    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal glass-card code-dialog" role="dialog" aria-modal="true"
           aria-labelledby="codeDialogTitle" aria-describedby="codeDialogIntro">
        <div class="modal-head">
          <h2 id="codeDialogTitle">${escapeHtml(
            t(set === 'backup' ? 'codes.backupTitle' : 'codes.recoveryTitle')
          )}</h2>
        </div>

        <p id="codeDialogIntro">${escapeHtml(
          t(set === 'backup' ? 'codes.backupIntro' : 'codes.recoveryIntro')
        )}</p>

        <div class="callout warn">
          <p>${escapeHtml(t('codes.onceWarning'))}</p>
        </div>

        <ol class="code-list tabular" aria-label="${escapeAttr(t('codes.listLabel'))}">
          ${codes.map((code) => `<li>${escapeHtml(code)}</li>`).join('')}
        </ol>

        <div class="code-actions">
          <button type="button" class="btn btn-secondary" data-copy>
            <span data-icon="copy" data-icon-size="18"></span>
            <span>${escapeHtml(t('codes.copy'))}</span>
          </button>
          <button type="button" class="btn btn-secondary" data-download>
            <span data-icon="download" data-icon-size="18"></span>
            <span>${escapeHtml(t('codes.download'))}</span>
          </button>
          <span class="code-action-note" role="status" data-action-note></span>
        </div>

        <label class="check-row">
          <input type="checkbox" data-confirm>
          <span>${escapeHtml(t('codes.confirmSaved'))}</span>
        </label>

        <div class="modal-foot">
          <button type="button" class="btn btn-primary" data-done disabled>
            ${escapeHtml(t('codes.done'))}
          </button>
        </div>
      </div>
    `;

    document.body.append(wrap);
    document.body.setAttribute('data-scroll-locked', 'true');
    hydrateIcons(wrap);

    const panel = wrap.querySelector('.modal');
    const confirm = wrap.querySelector('[data-confirm]');
    const done = wrap.querySelector('[data-done]');
    const note = wrap.querySelector('[data-action-note]');

    confirm.addEventListener('change', () => {
      done.disabled = !confirm.checked;
    });

    wrap.querySelector('[data-copy]').addEventListener('click', async () => {
      const text = codes.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        note.textContent = t('codes.copied');
      } catch {
        // Clipboard access is refused in some browsers unless the page is
        // focused, and over plain http. Select the list instead so the person
        // can copy it themselves rather than being told it failed.
        selectText(wrap.querySelector('.code-list'));
        note.textContent = t('codes.copyManually');
      }
    });

    wrap.querySelector('[data-download]').addEventListener('click', () => {
      downloadCodes(codes, set);
      note.textContent = t('codes.downloaded');
    });

    done.addEventListener('click', () => close());

    // No Escape, no backdrop click. The checkbox is the only way out, per 5c.
    // Tab still cycles inside the dialog.
    function onKeydown(event) {
      if (event.key === 'Tab') trapFocus(panel, event);
      if (event.key === 'Escape') {
        event.preventDefault();
        confirm.focus();
      }
    }

    document.addEventListener('keydown', onKeydown, true);

    function close() {
      document.removeEventListener('keydown', onKeydown, true);
      wrap.remove();
      document.body.setAttribute('data-scroll-locked', 'false');
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve();
    }

    panel.querySelector(FOCUSABLE)?.focus();
  });
}

/**
 * Generate a set and show it. The password is the one 5c requires for either
 * set, and is never stored anywhere by this function.
 *
 * @param {'recovery'|'backup'} set
 * @param {string} currentPassword
 * @returns {Promise<{ ok: boolean, error: any }>}
 */
export async function generateAndShow(set, currentPassword) {
  const result = await api('/api/auth/applicant/recovery-codes', {
    method: 'POST',
    locale: false,
    body: { set, current_password: currentPassword },
  });

  if (!result.ok) return { ok: false, error: result.error };

  await showRecoveryCodes({ codes: result.data.codes, set });
  return { ok: true, error: null, counts: result.data.counts };
}

function downloadCodes(codes, set) {
  const heading = t(set === 'backup' ? 'codes.fileHeadingBackup' : 'codes.fileHeadingRecovery');
  const body = [
    heading,
    t('codes.fileGeneratedOn', { date: new Date().toISOString().slice(0, 10) }),
    '',
    ...codes,
    '',
    t('codes.fileFooter'),
  ].join('\r\n');

  // A blob rather than a data URL, so a long list is not capped by URL length,
  // and CRLF line endings so the file opens correctly in Notepad as well as
  // everywhere else.
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `careers-gftv-${set}-codes.txt`;
  document.body.append(link);
  link.click();
  link.remove();

  // Released on the next tick rather than immediately, since Safari has been
  // known to cancel a download whose object URL is revoked too soon.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectText(element) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function trapFocus(panel, event) {
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.disabled && (el.offsetParent !== null || el === document.activeElement)
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
