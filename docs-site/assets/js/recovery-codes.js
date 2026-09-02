// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/assets/js/recovery-codes.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. 5c's shown once dialog with its copy, download, and saved
// checkbox, and 5g asks for the staff sets to work "exactly as 5c describes".
// Its endpoint became an argument in part 6 for that reason; the applicant
// default is never used here and is left in place rather than transformed
// away.
//
// Nothing differs from the portal's copy but this banner.
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
// The dialog is built here instead of sitting in every page's markup, because
// three separate flows raise it: registering, resetting a password, and
// regenerating from the security page.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { api } from './api.js';

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

    const wrap = document.createElement('dialog');
    wrap.className = 'modal-backdrop';
    wrap.setAttribute('aria-labelledby', 'codeDialogTitle');
    wrap.setAttribute('aria-describedby', 'codeDialogIntro');
    wrap.innerHTML = `
      <div class="modal glass-card code-dialog">
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
    // A native modal since part 6, for the reason danger-confirm.js gives at
    // length: this is opened from /account/security and /admin/security, and a
    // plain div appended while another modal dialog is open is inert and
    // painted underneath it.
    wrap.showModal();
    document.body.setAttribute('data-scroll-locked', 'true');
    hydrateIcons(wrap);

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
        // can copy it themselves and not be told it failed.
        selectText(wrap.querySelector('.code-list'));
        note.textContent = t('codes.copyManually');
      }
    });

    wrap.querySelector('[data-download]').addEventListener('click', () => {
      downloadCodes(codes, set);
      note.textContent = t('codes.downloaded');
    });

    done.addEventListener('click', () => close());

    // **No Escape, no backdrop click. The checkbox is the only way out, per
    // 5c** — this is the one dialog in the build that is deliberately hard to
    // leave, because leaving it loses the codes for good.
    //
    // A native <dialog> closes itself on Escape, so refusing has to be said in
    // the browser's own terms: `cancel` is the event that precedes that close,
    // and preventing its default is what keeps the dialog up. The keydown
    // listener is still here for the *other* half — putting the focus on the
    // checkbox, so pressing Escape teaches what the way out is instead of
    // doing nothing at all. Tab is the browser's now.
    wrap.addEventListener('cancel', (event) => {
      event.preventDefault();
      confirm.focus();
    });

    function onKeydown(event) {
      if (event.key === 'Escape') confirm.focus();
    }

    document.addEventListener('keydown', onKeydown, true);

    function close() {
      document.removeEventListener('keydown', onKeydown, true);
      wrap.close();
      wrap.remove();
      document.body.setAttribute('data-scroll-locked', 'false');
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve();
    }
  });
}

/**
 * Generate a set and show it. The password is the one 5c requires for either
 * set, and is never stored anywhere by this function.
 *
 * **The endpoint is an argument as of phase 13 part 6**, because 5g gives the
 * staff realm the same two sets against different tables and the dialog that
 * shows them is the same dialog. A second copy of this function with one string
 * changed is how the copy button, the download, and the "I have saved these"
 * checkbox end up differing between two realms that 5c and 5g describe in the
 * same words.
 *
 * @param {'recovery'|'backup'} set
 * @param {string} currentPassword
 * @param {{ endpoint?: string }} [options]
 * @returns {Promise<{ ok: boolean, error: any }>}
 */
export async function generateAndShow(set, currentPassword, options = {}) {
  const result = await api(options.endpoint ?? '/api/auth/applicant/recovery-codes', {
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

  // A blob over a data URL, so a long list is not capped by URL length,
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

  // Released on the next tick, not immediately, since Safari has been
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
