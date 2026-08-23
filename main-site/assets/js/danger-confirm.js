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
 *   skipPassword?: boolean,
 *   skipUsername?: boolean
 * }} options
 *   skipUsername drops step 2, so the steps are "read what this does" and
 *   "prove it is you". Added 23 August 2026, when deviation 38 was reversed: an
 *   admin deleting somebody else's posting or account types their own password
 *   rather than the slug or username of the thing being deleted. The password
 *   is the stronger of the two, because typing an identifier proves you can
 *   read the row in front of you and a password proves who you are. The
 *   applicant's own danger zone passes neither flag and still walks all three
 *   steps, per 7g.
 *
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
    // Which steps this run actually shows. Two of the three are optional and
    // never both: an action asking for neither an identifier nor a password
    // would be an ordinary "are you sure", which is what confirmAction is for.
    const steps = [1, options.skipUsername ? null : 2, options.skipPassword ? null : 3].filter(
      (value) => value !== null
    );
    const totalSteps = steps.length;
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

      // Its position among the steps being shown, not its number in the full
      // sequence, so a password step reads as "step 2 of 2" rather than 3 of 2.
      stepLabel.textContent = t('danger.stepOf', {
        step: steps.indexOf(step) + 1,
        total: totalSteps,
      });
      advance.textContent =
        step === steps[steps.length - 1] ? options.confirmLabel : t('danger.continue');

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
        step = options.skipUsername ? 3 : 2;

        // Both skipped. Not reachable from anything in this build, and handled
        // so that a caller passing both flags gets a confirmation rather than a
        // dialog with no way forward.
        if (options.skipUsername && options.skipPassword) {
          close({ password: null });
          return;
        }

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

/**
 * One step of the same thing: a modal that asks before doing something, with an
 * optional field to fill in.
 *
 * **Every modal on this site uses this design**, and the reason is not house
 * style. `window.confirm` and `window.prompt` are the browser's, not ours: they
 * are unstyled, untranslated in the parts the browser writes, unreadable in
 * dark mode on some platforms, they name the site in a way that reads like a
 * warning, and on mobile they are indistinguishable from a page trying to trap
 * you. They also block the whole thread. The three step confirmation above
 * already had the right shell, the focus trap, the Escape and backdrop
 * behaviour, and the scroll lock, so this is that component with the steps
 * taken out rather than a second implementation.
 *
 * Not a replacement for `confirmDangerousAction`. That one exists because 7g
 * fixes three steps for anything irreversible, and nothing here may be used to
 * skip them: this is for the ordinary "are you sure" that does not need a typed
 * name or a password.
 *
 * @param {{
 *   title: string,
 *   body?: string,
 *   consequences?: string[],
 *   confirmLabel: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   field?: {
 *     label: string,
 *     hint?: string,
 *     placeholder?: string,
 *     multiline?: boolean,
 *     maxLength?: number,
 *   },
 * }} options
 * @returns {Promise<{ value: string|null }|null>} null when cancelled. The
 *          value is the field's text, trimmed, or null when it was left empty
 *          or there is no field. Empty and absent are the same thing to every
 *          caller here, and a caller that ever needs to tell them apart should
 *          say so rather than have this guess.
 */
export function confirmAction(options) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;

    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal glass-card danger-dialog" role="dialog" aria-modal="true"
           aria-labelledby="confirmTitle">
        <div class="modal-head">
          <h2 id="confirmTitle">${escapeHtml(options.title)}</h2>
        </div>

        ${options.body ? `<p>${escapeHtml(options.body)}</p>` : ''}

        ${
          options.consequences?.length
            ? `<ul class="danger-consequences">${options.consequences
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join('')}</ul>`
            : ''
        }

        ${options.field ? fieldMarkup(options.field) : ''}

        <!-- Cancel first and no quieter than the confirm, for the same reason
             7g gives: a cancel that is harder to find than the confirm is how
             people end up doing the thing they came to avoid. -->
        <div class="danger-actions">
          <button type="button" class="btn btn-secondary" data-cancel>
            ${escapeHtml(options.cancelLabel ?? t('danger.cancel'))}
          </button>
          <button type="button" class="btn ${
            options.danger === false ? 'btn-primary' : 'btn-danger'
          }" data-confirm>${escapeHtml(options.confirmLabel)}</button>
        </div>
      </div>
    `;

    document.body.append(wrap);
    document.body.setAttribute('data-scroll-locked', 'true');
    hydrateIcons(wrap);

    const panel = wrap.querySelector('.modal');
    const input = wrap.querySelector('[data-confirm-field]');
    const confirmButton = wrap.querySelector('[data-confirm]');

    // The field when there is one, because filling it in is the next thing
    // anybody does; the confirm otherwise, so Enter and Space both work without
    // reaching for the mouse.
    (input ?? confirmButton).focus();

    confirmButton.addEventListener('click', () => {
      close({ value: input ? input.value.trim() || null : null });
    });

    wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));

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
        // Only a single line input. Enter inside a textarea is a newline, which
        // is the whole reason somebody chose a textarea.
        event.preventDefault();
        confirmButton.click();
      }
    }

    document.addEventListener('keydown', onKeydown, true);

    function close(result) {
      document.removeEventListener('keydown', onKeydown, true);
      wrap.remove();
      document.body.setAttribute('data-scroll-locked', 'false');
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve(result);
    }
  });
}

function fieldMarkup(field) {
  const max = field.maxLength ? ` maxlength="${Number(field.maxLength)}"` : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';

  const control = field.multiline
    ? `<textarea id="confirmField" data-confirm-field rows="3"${max}${placeholder}></textarea>`
    : `<input id="confirmField" data-confirm-field type="text" autocomplete="off"${max}${placeholder}>`;

  return `
    <div class="field">
      <label for="confirmField">${escapeHtml(field.label)}</label>
      ${control}
      ${field.hint ? `<p class="field-hint">${escapeHtml(field.hint)}</p>` : ''}
    </div>`;
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
