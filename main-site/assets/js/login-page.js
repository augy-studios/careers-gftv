// The applicant sign in page.
//
// Section 5b: username or email, plus password. Section 5d: "stay signed in"
// is its own control and is about the session only. There is no "trust this
// device" here, because the applicant realm has no second factor until
// Telegram ships in phase 11, and 5d forbids offering trust on the password
// screen in any case.
//
// The ?redirect= from section 4 is carried through, so somebody who was sent
// here from a posting lands back on it.

import { api, applicantSession } from './api.js';
import {
  clearErrors,
  applyApiError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
  redirectTarget,
  withRedirect,
} from './forms.js';
import { passkeysSupported, usePasskey, wasCancelled } from './passkeys.js';
import { t, getLocale } from './i18n.js';

const DEFAULT_AFTER_LOGIN = '/account/security';

// The token from the password step. Held in memory only: it is not a session,
// it is worth nothing on its own, and it must not outlive this page.
let challenge = null;

function boot() {
  const form = document.querySelector('#loginForm');
  if (!form) return;

  wirePasswordToggles(document);

  // Carry the redirect on the two links out of this page, so the round trip
  // survives a detour through registering or recovering.
  const registerLink = document.querySelector('#registerLink');
  if (registerLink) registerLink.href = withRedirect('/register');
  const forgotLink = document.querySelector('#forgotLink');
  if (forgotLink) forgotLink.href = withRedirect('/forgot-password');

  // Somebody already signed in does not need this page. Say so rather than
  // showing a form that would sign them in as themselves again.
  applicantSession().then((session) => {
    if (!session?.user) return;
    const already = document.querySelector('#alreadySignedIn');
    if (already) {
      already.hidden = false;
      already.querySelector('[data-name]').textContent = session.user.display_name;
      already.querySelector('[data-continue]').href = redirectTarget() ?? DEFAULT_AFTER_LOGIN;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const values = readForm(form);

    if (!values.identifier || !values.password) {
      showFormMessage(form, 'danger', t('auth.fillBothFields'));
      return;
    }

    setWorking(form, true);

    const result = await api('/api/auth/applicant/login', {
      method: 'POST',
      locale: false,
      body: {
        identifier: values.identifier,
        password: values.password,
        stay_signed_in: values.stay_signed_in === true,
        locale: getLocale(),
      },
    });

    setWorking(form, false);

    if (!result.ok) {
      // The endpoint answers with one generic sentence for a wrong password, a
      // username that does not exist, and a missing field, so that this page
      // cannot be used to find out which accounts exist. Saying it in the
      // reader's language does not change that.
      applyApiError(form, result.error, {
        unauthorised: t('auth.signInFailed'),
        bad_request: t('auth.signInFailed'),
      });
      return;
    }

    // An account with a passkey stops here, holding a challenge token and no
    // session. The password alone never signs anybody in when a second factor
    // exists, which is the whole point of the two steps.
    if (result.data?.two_factor_required === true) {
      challenge = result.data.challenge;
      showSecondStep();
      return;
    }

    finish(result.data);
  });

  /* ---------------------------------------------------------------------
   * The second step
   * ------------------------------------------------------------------ */

  function showSecondStep() {
    form.hidden = true;
    document.querySelector('#registerCard')?.setAttribute('hidden', '');
    document.querySelector('#step2').hidden = false;

    const usePasskeyButton = document.querySelector('#usePasskeyButton');
    if (!passkeysSupported()) {
      // Nothing to click on a browser that cannot do this. The backup code
      // form below it still works, which is exactly why that path exists.
      usePasskeyButton.hidden = true;
      secondStepError(t('auth.passkeyUnsupportedHere'));
      document.querySelector('#backupCodeForm').elements.namedItem('code')?.focus();
      return;
    }

    usePasskeyButton.focus();
  }

  document.querySelector('#usePasskeyButton')?.addEventListener('click', async () => {
    const button = document.querySelector('#usePasskeyButton');
    secondStepError(null);
    button.disabled = true;

    try {
      const started = await api('/api/auth/applicant/verify-2fa', {
        method: 'POST',
        locale: false,
        body: { challenge, action: 'options' },
      });

      if (!started.ok) {
        secondStepError(started.error.message);
        return;
      }

      const assertion = await usePasskey(started.data.options);

      const verified = await api('/api/auth/applicant/verify-2fa', {
        method: 'POST',
        locale: false,
        body: {
          challenge,
          action: 'passkey',
          response: assertion,
          trust_device: document.querySelector('#trustDevice')?.checked === true,
        },
      });

      if (!verified.ok) {
        secondStepError(verified.error.message);
        return;
      }

      finish(verified.data);
    } catch (cause) {
      if (!wasCancelled(cause)) {
        console.warn('[careers-gftv] passkey sign in:', cause);
        secondStepError(t('auth.passkeyFailed'));
      }
    } finally {
      button.disabled = false;
    }
  });

  const backupForm = document.querySelector('#backupCodeForm');
  backupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(backupForm);

    const values = readForm(backupForm);
    if (!values.code) {
      showFormMessage(backupForm, 'danger', t('auth.enterCode'));
      return;
    }

    setWorking(backupForm, true);

    const result = await api('/api/auth/applicant/verify-2fa', {
      method: 'POST',
      locale: false,
      body: {
        challenge,
        code: values.code,
        trust_device: document.querySelector('#trustDevice')?.checked === true,
      },
    });

    setWorking(backupForm, false);

    if (!result.ok) {
      applyApiError(backupForm, result.error, { unauthorised: t('auth.codeWrong') });
      return;
    }

    finish(result.data);
  });

  function secondStepError(message) {
    const holder = document.querySelector('#secondStepError');
    if (!holder) return;
    if (!message) {
      holder.hidden = true;
      holder.textContent = '';
      return;
    }
    holder.textContent = message;
    holder.hidden = false;
  }

  /**
   * Where a completed sign in goes.
   *
   * 5c: a warning below three, and somebody with no recovery codes at all
   * cannot get back in alone. That last case is worth a stop rather than a
   * badge they will scroll past on their way out.
   */
  function finish(data) {
    const remaining = data?.codes?.recovery ?? 0;
    const target = redirectTarget() ?? DEFAULT_AFTER_LOGIN;
    window.location.href = remaining === 0 ? '/account/security?codes=none' : target;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
