// The registration page.
//
// Section 5b: username, display name, email, password, confirm. Uniqueness on
// username and email, clear inline validation, and the password minimum stated
// on screen and not discovered by failing.
//
// The account is signed in on success, and the recovery code dialog is raised
// immediately with the password still in hand. That order is from 5c: the
// codes are the only self serve way back into an account, so the moment to
// generate them is the moment the account exists, not a settings page nobody
// visits.

import { api } from './api.js';
import {
  clearErrors,
  applyApiError,
  setFieldError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
  redirectTarget,
  withRedirect,
} from './forms.js';
import { generateAndShow } from './recovery-codes.js';
import { t, getLocale } from './i18n.js';

const DEFAULT_AFTER_REGISTER = '/account/security';

function boot() {
  const form = document.querySelector('#registerForm');
  if (!form) return;

  wirePasswordToggles(document);

  const signInLink = document.querySelector('#signInLink');
  if (signInLink) signInLink.href = withRedirect('/login');

  // Checked as they type instead of only on submit, because a mismatch found
  // at the end means retyping both.
  const password = form.elements.namedItem('password');
  const confirm = form.elements.namedItem('password_confirm');

  confirm?.addEventListener('blur', () => {
    if (confirm.value !== '' && confirm.value !== password.value) {
      setFieldError(form, 'password_confirm', 'mismatch');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const values = readForm(form);

    setWorking(form, true);

    const result = await api('/api/auth/applicant/register', {
      method: 'POST',
      locale: false,
      body: {
        username: values.username,
        display_name: values.display_name,
        email: values.email,
        password: values.password,
        password_confirm: values.password_confirm,
        stay_signed_in: values.stay_signed_in === true,
        locale: getLocale(),
      },
    });

    if (!result.ok) {
      setWorking(form, false);
      applyApiError(form, result.error);
      return;
    }

    // The account exists and this browser is signed in. Anything that fails
    // from here is a matter of codes, not of the account, and is said as such.
    showFormMessage(form, 'ok', t('auth.registerSuccess'));

    const generated = await generateAndShow('recovery', values.password);

    setWorking(form, false);

    if (!generated.ok) {
      // Rare, and worth being honest about instead of silently landing them
      // on the board with no way back into the account.
      showFormMessage(form, 'warn', t('auth.codesLaterWarning'));
      window.setTimeout(() => {
        window.location.href = '/account/security?codes=none';
      }, 2500);
      return;
    }

    window.location.href = redirectTarget() ?? DEFAULT_AFTER_REGISTER;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
