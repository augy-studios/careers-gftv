// The staff sign in page, /admin/login.
//
// Section 5a, from the browser's side. Two steps, and the first one issues
// nothing: a password that is correct but unaccompanied by a second factor
// leaves this page holding a challenge token and no session.
//
// Two controls, never one, per 5d:
//
//   Stay signed in   on the password step, because it is about the session.
//   Trust this device on the code step only, because it is about the second
//                    factor and 5d forbids offering it before that factor has
//                    been satisfied.
//
// This page is on the same origin as the applicant pages but shares nothing
// with them: separate endpoints, separate cookie, separate realm.

import { api, staffSession } from './api.js';
import {
  clearErrors,
  applyApiError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
} from './forms.js';
import { passkeysSupported, usePasskey, wasCancelled } from './passkeys.js';
import { t } from './i18n.js';

// /admin is the dashboard, and it is a placeholder until phase 7. Sending a
// staff member who has just signed in to a page that says "not built yet" and
// offers nothing is worse than sending them to the one staff page that works.
// Change this to /admin when the dashboard lands.
const AFTER_SIGN_IN = '/admin/security';

let challenge = null;
let staySignedIn = false;

function boot() {
  const passwordForm = document.querySelector('#staffLoginForm');
  const codeForm = document.querySelector('#staffCodeForm');
  if (!passwordForm || !codeForm) return;

  wirePasswordToggles(document);

  staffSession().then((session) => {
    if (!session?.user) return;
    const already = document.querySelector('#alreadySignedIn');
    if (already) {
      already.hidden = false;
      already.querySelector('[data-name]').textContent = session.user.username;
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(passwordForm);

    const values = readForm(passwordForm);
    staySignedIn = values.stay_signed_in === true;

    setWorking(passwordForm, true);

    const result = await api('/api/auth/staff/login', {
      method: 'POST',
      locale: false,
      body: {
        username: values.username,
        password: values.password,
        stay_signed_in: staySignedIn,
      },
    });

    setWorking(passwordForm, false);

    if (!result.ok) {
      // 5a rejects an unapproved account, an account without portal access,
      // and a wrong password with the same sentence. Keep it that way here.
      applyApiError(passwordForm, result.error, {
        unauthorised: t('auth.signInFailed'),
        bad_request: t('auth.signInFailed'),
      });
      return;
    }

    if (result.data.two_factor_required !== true) {
      window.location.href = AFTER_SIGN_IN;
      return;
    }

    challenge = result.data.challenge;
    const methods = result.data.methods ?? ['totp', 'backup_code'];

    document.querySelector('#staffStep1').hidden = true;
    document.querySelector('#staffStep2').hidden = false;

    // Offer what this account actually has. Somebody whose only second factor
    // is a passkey should not be shown a code box, and somebody on a browser
    // without WebAuthn should not be shown a button that cannot work.
    const passkeyCard = document.querySelector('#staffPasskeyCard');
    if (methods.includes('passkey') && passkeysSupported()) {
      passkeyCard.hidden = false;
      document.querySelector('#staffUsePasskey').focus();
    } else {
      codeForm.elements.namedItem('code')?.focus();
    }
  });

  document.querySelector('#staffUsePasskey')?.addEventListener('click', async () => {
    const button = document.querySelector('#staffUsePasskey');
    staffPasskeyError(null);
    button.disabled = true;

    try {
      const started = await api('/api/auth/staff/verify-2fa', {
        method: 'POST',
        locale: false,
        body: { challenge, action: 'options' },
      });

      if (!started.ok) {
        staffPasskeyError(started.error.message);
        return;
      }

      const assertion = await usePasskey(started.data.options);

      const verified = await api('/api/auth/staff/verify-2fa', {
        method: 'POST',
        locale: false,
        body: {
          challenge,
          action: 'passkey',
          response: assertion,
          trust_device: readForm(codeForm).trust_device === true,
          stay_signed_in: staySignedIn,
        },
      });

      if (!verified.ok) {
        staffPasskeyError(verified.error.message);
        return;
      }

      window.location.href = AFTER_SIGN_IN;
    } catch (cause) {
      if (!wasCancelled(cause)) {
        console.warn('[careers-gftv] staff passkey sign in:', cause);
        staffPasskeyError(t('auth.passkeyFailed'));
      }
    } finally {
      button.disabled = false;
    }
  });

  function staffPasskeyError(message) {
    const holder = document.querySelector('#staffPasskeyError');
    if (!holder) return;
    if (!message) {
      holder.hidden = true;
      holder.textContent = '';
      return;
    }
    holder.textContent = message;
    holder.hidden = false;
  }

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(codeForm);

    const values = readForm(codeForm);
    if (!values.code) {
      showFormMessage(codeForm, 'danger', t('auth.enterCode'));
      return;
    }

    setWorking(codeForm, true);

    const result = await api('/api/auth/staff/verify-2fa', {
      method: 'POST',
      locale: false,
      body: {
        challenge,
        code: values.code,
        trust_device: values.trust_device === true,
        stay_signed_in: staySignedIn,
      },
    });

    setWorking(codeForm, false);

    if (!result.ok) {
      // An expired challenge cannot be answered, only started again. Send them
      // back to the password step rather than leaving them typing codes at a
      // token that is gone.
      if (result.error.details?.reason === 'challenge_expired') {
        challenge = null;
        document.querySelector('#staffStep2').hidden = true;
        document.querySelector('#staffStep1').hidden = false;
        showFormMessage(passwordForm, 'warn', t('auth.challengeExpired'));
        passwordForm.elements.namedItem('password')?.focus();
        return;
      }
      applyApiError(codeForm, result.error, { unauthorised: t('auth.codeWrong') });
      return;
    }

    if (result.data.used_backup_code) {
      // Worth saying out loud: a backup code is gone once used, and somebody
      // who has just spent one should know how many are left before they need
      // the next one.
      showFormMessage(codeForm, 'warn', t('auth.backupCodeUsed'));
      window.setTimeout(() => {
        window.location.href = AFTER_SIGN_IN;
      }, 2500);
      return;
    }

    window.location.href = AFTER_SIGN_IN;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
