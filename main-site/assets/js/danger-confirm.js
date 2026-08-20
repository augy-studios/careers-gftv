// The three step confirmation from section 7g.
//
// 7g fixes the order and says there must be no way to skip ahead:
//
//   1. Consequences. A panel spelling out exactly what happens and what cannot
//      be undone, with a cancel at least as prominent as the continue.
//   2. Typed confirmation. They type their own username. Not a checkbox, not
//      "type DELETE", their username, so the action cannot be completed by
//      muscle memory. Compared case sensitively, with whitespace trimmed only.
//   3. Password. Their current password, which the caller then sends to an
//      endpoint that verifies it server side. Nothing here decides whether the
//      password is right, and no caller may treat reaching step 3 as proof
//      that it was: 7g is explicit that a client side "password was correct"
//      signal is never accepted.
//
// Written now, in phase 2, for removing a passkey. A passkey removal turns the
// second factor off, and 7g already lists disabling 2FA as a danger zone
// action, so it belongs behind the same ritual as the rest of them.
//
// Phase 6 owns the danger zone proper: deleting an account, unlinking
// Telegram, disabling Telegram 2FA. It should use this rather than write a
// second one, and the shape of the options below is meant to take those
// without changing.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Run the steps. Resolves with the typed password, or null if the person
 * cancelled at any point.
 *
 * @param {{
 *   title: string,
 *   consequences: string[],
 *   confirmLabel: string,
 *   username: string,
 *   irreversible?: string,
 *   skipPassword?: boolean
 * }} options
 *   skipPassword drops step 3 and resolves with a null password. It is for an
 *   action that is serious enough to need reading and typing but is not a
 *   credentialled one, which in this build means withdrawing an application:
 *   7e makes it reversible by applying again, so there is nothing for a password
 *   to protect, and asking for one anyway teaches people to type their password
 *   into any panel that asks. **Nothing in the danger zone proper may pass it.**
 *   7g fixes all three steps there, and the endpoints behind those actions
 *   verify the password server side regardless of what this component did.
 * @returns {Promise<{ password: string|null }|null>}
 */
export function confirmDangerousAction(options) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const totalSteps = options.skipPassword ? 2 : 3;
    let step = 1;

    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal glass-card danger-dialog" role="dialog" aria-modal="true"
           aria-labelledby="dangerTitle">
        <div class="modal-head">
          <h2 id="dangerTitle">${escapeHtml(options.title)}</h2>
          <span class="danger-step" data-step-label></span>
        </div>

        <section data-step="1">
          <ul class="danger-consequences">
            ${options.consequences.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
          ${
            options.irreversible
              ? `<p class="callout danger">${escapeHtml(options.irreversible)}</p>`
              : ''
          }
        </section>

        <section data-step="2" hidden>
          <div class="field">
            <label for="dangerUsername">${escapeHtml(
              t('danger.typeUsername', { username: options.username })
            )}</label>
            <input id="dangerUsername" type="text" autocapitalize="none"
                   spellcheck="false" autocomplete="off">
            <p class="field-hint">${escapeHtml(t('danger.typeUsernameHint'))}</p>
            <p class="field-error" data-username-error hidden></p>
          </div>
        </section>

        <section data-step="3" hidden>
          <div class="field">
            <label for="dangerPassword">${escapeHtml(t('security.currentPasswordLabel'))}</label>
            <input id="dangerPassword" type="password" autocomplete="current-password">
            <p class="field-hint">${escapeHtml(t('danger.passwordHint'))}</p>
            <p class="field-error" data-password-error hidden></p>
          </div>
        </section>

        <!-- Cancel first and styled no quieter than the continue, per 7g. A
             cancel that is harder to find than the confirm is how people end
             up doing the thing they came to avoid. -->
        <div class="danger-actions">
          <button type="button" class="btn btn-secondary" data-cancel>
            ${escapeHtml(t('danger.cancel'))}
          </button>
          <button type="button" class="btn btn-danger" data-advance></button>
        </div>
      </div>
    `;

    document.body.append(wrap);
    document.body.setAttribute('data-scroll-locked', 'true');
    hydrateIcons(wrap);

    const panel = wrap.querySelector('.modal');
    const advance = wrap.querySelector('[data-advance]');
    const stepLabel = wrap.querySelector('[data-step-label]');
    const usernameInput = wrap.querySelector('#dangerUsername');
    const passwordInput = wrap.querySelector('#dangerPassword');

    function render() {
      wrap.querySelectorAll('[data-step]').forEach((section) => {
        section.hidden = Number(section.getAttribute('data-step')) !== step;
      });

      stepLabel.textContent = t('danger.stepOf', { step, total: totalSteps });
      advance.textContent = step === totalSteps ? options.confirmLabel : t('danger.continue');

      const focusTarget =
        step === 2 ? usernameInput : step === 3 ? passwordInput : advance;
      focusTarget.focus();
    }

    function showError(selector, message) {
      const holder = wrap.querySelector(selector);
      if (!holder) return;
      holder.textContent = message ?? '';
      holder.hidden = !message;
    }

    advance.addEventListener('click', () => {
      if (step === 1) {
        step = 2;
        render();
        return;
      }

      if (step === 2) {
        // Case sensitively, whitespace trimmed only, exactly as 7g says.
        const typed = usernameInput.value.trim();
        if (typed !== options.username) {
          showError('[data-username-error]', t('danger.usernameMismatch'));
          usernameInput.focus();
          return;
        }
        showError('[data-username-error]', null);

        // An action with no credential to check ends here, with a null
        // password. The caller's endpoint is still the thing that decides
        // whether the action may happen at all.
        if (options.skipPassword) {
          close({ password: null });
          return;
        }

        step = 3;
        render();
        return;
      }

      const password = passwordInput.value;
      if (password === '') {
        showError('[data-password-error]', t('auth.passwordRequired'));
        passwordInput.focus();
        return;
      }

      // Handed straight to the caller, which sends it to an endpoint that
      // decides. Nothing here has verified anything.
      close({ password });
    });

    wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));

    // Escape and a backdrop click both cancel. Cancelling is the safe
    // direction, so unlike the recovery code dialog there is no reason to
    // trap somebody in here.
    wrap.addEventListener('click', (event) => {
      if (event.target === wrap) close(null);
    });

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      } else if (event.key === 'Tab') {
        trapFocus(panel, event);
      } else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        advance.click();
      }
    }

    document.addEventListener('keydown', onKeydown, true);

    function close(result) {
      document.removeEventListener('keydown', onKeydown, true);
      // The password lived in this input and nowhere else. Clearing it is
      // theatre against a memory dump and worth doing anyway against the next
      // person to open the developer tools.
      passwordInput.value = '';
      wrap.remove();
      document.body.setAttribute('data-scroll-locked', 'false');
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve(result);
    }

    render();
  });
}

function trapFocus(panel, event) {
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.disabled && el.offsetParent !== null
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
