// The forgot password page. Two steps, on one page, in the order 5c fixes.
//
//   Step 1  username or email, plus one unused account recovery code.
//   Step 2  the new password.
//
// The password is never accepted in the request that verifies the code. That
// is not a stylistic split: it is what stops one request from being a complete
// account takeover, and the ticket between the two steps is bound to this
// browser by a cookie the server set.
//
// The 2FA backup codes are not accepted here and the page says so. They are a
// different set, in a different table, for a different job.

import { api } from './api.js';
import {
  clearErrors,
  applyApiError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
  redirectTarget,
} from './forms.js';
import { generateAndShow } from './recovery-codes.js';
import { passkeysSupported, usePasskey, wasCancelled } from './passkeys.js';
import { t } from './i18n.js';

const DEFAULT_AFTER_RESET = '/account/security';

// Held in memory only. The ticket is worth nothing without the nonce cookie
// the server set alongside it, and it must not outlive this page.
let ticket = null;
let whose = '';

function boot() {
  const codeForm = document.querySelector('#codeForm');
  const passwordForm = document.querySelector('#passwordForm');
  if (!codeForm || !passwordForm) return;

  wirePasswordToggles(document);

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(codeForm);

    const values = readForm(codeForm);
    if (!values.identifier || !values.code) {
      showFormMessage(codeForm, 'danger', t('auth.fillBothFields'));
      return;
    }

    setWorking(codeForm, true);

    const result = await api('/api/auth/applicant/forgot-password', {
      method: 'POST',
      locale: false,
      body: { identifier: values.identifier, code: values.code },
    });

    setWorking(codeForm, false);

    if (!result.ok) {
      // 5c: the same generic error for a wrong code and an unknown account.
      applyApiError(codeForm, result.error, {
        unauthorised: t('auth.recoveryFailed'),
        bad_request: t('auth.recoveryFailed'),
      });
      return;
    }

    ticket = result.data.ticket;
    whose = result.data.username;

    // Each step replaces the one before it and does not appear below it, so
    // there is one thing on screen to do and the spent code is not still
    // sitting in a field.
    document.querySelector('#step1').hidden = true;

    // An account with a passkey has to prove that too. A recovery code shows
    // you hold a code; on an account with a second factor that is not on its
    // own enough to take it.
    if (result.data.second_factor_required === true) {
      document.querySelector('#stepFactor').hidden = false;
      const button = document.querySelector('#resetUsePasskey');
      if (!passkeysSupported()) {
        button.hidden = true;
        resetFactorError(t('auth.passkeyUnsupportedHere'));
        document.querySelector('#resetBackupForm').elements.namedItem('code')?.focus();
      } else {
        button.focus();
      }
      return;
    }

    showPasswordStep();
  });

  function showPasswordStep() {
    document.querySelector('#stepFactor').hidden = true;
    document.querySelector('#step2').hidden = false;
    document.querySelector('#resetForWhom').textContent = t('auth.resetForWhom', {
      username: whose,
    });
    passwordForm.elements.namedItem('password')?.focus();
  }

  function resetFactorError(message) {
    const holder = document.querySelector('#resetFactorError');
    if (!holder) return;
    if (!message) {
      holder.hidden = true;
      holder.textContent = '';
      return;
    }
    holder.textContent = message;
    holder.hidden = false;
  }

  document.querySelector('#resetUsePasskey')?.addEventListener('click', async () => {
    const button = document.querySelector('#resetUsePasskey');
    resetFactorError(null);
    button.disabled = true;

    try {
      const started = await api('/api/auth/applicant/forgot-password', {
        method: 'POST',
        locale: false,
        body: { ticket, action: 'options' },
      });

      if (!started.ok) {
        resetFactorError(started.error.message);
        return;
      }

      const assertion = await usePasskey(started.data.options);

      const verified = await api('/api/auth/applicant/forgot-password', {
        method: 'POST',
        locale: false,
        body: { ticket, action: 'passkey', response: assertion },
      });

      if (!verified.ok) {
        resetFactorError(verified.error.message);
        return;
      }

      showPasswordStep();
    } catch (cause) {
      if (!wasCancelled(cause)) {
        console.warn('[careers-gftv] passkey reset:', cause);
        resetFactorError(t('auth.passkeyFailed'));
      }
    } finally {
      button.disabled = false;
    }
  });

  const backupForm = document.querySelector('#resetBackupForm');
  backupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(backupForm);

    const values = readForm(backupForm);
    if (!values.code) {
      showFormMessage(backupForm, 'danger', t('auth.enterCode'));
      return;
    }

    setWorking(backupForm, true);

    const result = await api('/api/auth/applicant/forgot-password', {
      method: 'POST',
      locale: false,
      body: { ticket, code: values.code },
    });

    setWorking(backupForm, false);

    if (!result.ok) {
      applyApiError(backupForm, result.error, { unauthorised: t('auth.codeWrong') });
      return;
    }

    showPasswordStep();
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(passwordForm);

    const values = readForm(passwordForm);

    setWorking(passwordForm, true);

    const result = await api('/api/auth/applicant/reset-password', {
      method: 'POST',
      locale: false,
      body: {
        ticket,
        password: values.password,
        password_confirm: values.password_confirm,
      },
    });

    if (!result.ok) {
      setWorking(passwordForm, false);
      applyApiError(passwordForm, result.error);
      return;
    }

    showFormMessage(passwordForm, 'ok', t('auth.resetDone'));

    // 5c step 4: fewer than three codes left means straight to regenerate,
    // not a note on a page they may never open. The password they just set is
    // the one the endpoint asks for.
    if (result.data.signed_in && result.data.codes_low) {
      const generated = await generateAndShow('recovery', values.password);
      if (!generated.ok) {
        showFormMessage(passwordForm, 'warn', t('auth.codesLaterWarning'));
      }
    }

    setWorking(passwordForm, false);

    window.location.href = result.data.signed_in
      ? (redirectTarget() ?? DEFAULT_AFTER_RESET)
      : '/login';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
