// The applicant sign in page.
//
// Section 5b: username or email, plus password. Section 5d: "stay signed in"
// is its own control and is about the session only. "Trust this device" is on
// the second step and never here, per 5d.
//
// **The second step is drawn from what the account actually offers.** The
// password step answers with a list of methods, and this page shows the
// controls for those and no others: a passkey button for an account with a
// passkey, the Telegram note for an account with the code switched on, and one
// code field that takes either kind of code. An account with both sees both,
// because phase 11 part 3 added a factor rather than replacing one.
//
// The ?redirect= from section 4 is carried through, so somebody who was sent
// here from a posting lands back on it. ?magic= is the other parameter this
// page reads, and it is how a one tap link that could not be used says why.

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
import { createDialog } from './dialog.js';
import { t, getLocale } from './i18n.js';

const DEFAULT_AFTER_LOGIN = '/account/security';

// The token from the password step. Held in memory only: it is not a session,
// it is worth nothing on its own, and it must not outlive this page.
let challenge = null;

// What the account offered at the password step. Nothing is drawn from a guess
// about which factors exist: the server said, and this is what it said.
let methods = [];

/**
 * Why a one tap link did not sign somebody in.
 *
 * Every one of these sends them back here to type the code instead, which is
 * why they are notes rather than errors: the link failing is inconvenient and
 * the way through is on screen. `wrong_browser` is the one worth wording
 * carefully, because it is also what a forwarded link looks like, and the
 * person reading it is usually the one who did the forwarding.
 */
const MAGIC_REASONS = {
  unknown: 'auth.magicUnknown',
  no_nonce: 'auth.magicNoNonce',
  wrong_browser: 'auth.magicWrongBrowser',
  off: 'auth.magicOff',
  error: 'auth.magicError',
};

function boot() {
  const form = document.querySelector('#loginForm');
  if (!form) return;

  wirePasswordToggles(document);
  showMagicOutcome();
  document.addEventListener('gftv:localechange', paintMagicOutcome);

  // Carry the redirect on the two links out of this page, so the round trip
  // survives a detour through registering or recovering.
  const registerLink = document.querySelector('#registerLink');
  if (registerLink) registerLink.href = withRedirect('/register');
  const forgotLink = document.querySelector('#forgotLink');
  if (forgotLink) forgotLink.href = withRedirect('/forgot-password');

  // Somebody already signed in does not need this page. Say so instead of
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

    // Whatever happens next is a better answer than why last week's link failed.
    magicReason = null;

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
      methods = Array.isArray(result.data.methods) ? result.data.methods : [];
      showSecondStep(result.data.code_requested === true);
      return;
    }

    finish(result.data);
  });

  /* ---------------------------------------------------------------------
   * The second step
   * ------------------------------------------------------------------ */

  function showSecondStep(codeRequested) {
    form.hidden = true;
    document.querySelector('#registerCard')?.setAttribute('hidden', '');
    document.querySelector('#step2').hidden = false;

    const telegram = methods.includes('telegram_code');
    const passkey = methods.includes('passkey');

    // The wording is swapped by moving the key rather than by writing text over
    // it, so a language change after the step is on screen redraws the sentence
    // that belongs to this account rather than the one in the markup.
    retranslate('#secondStepBody', telegram && passkey
      ? 'auth.secondStepBoth'
      : telegram
        ? 'auth.secondStepTelegram'
        : 'auth.secondStepBody');

    retranslate('#codeFormHeading', telegram ? 'auth.telegramCodeHeading' : 'auth.backupCodeHeading');
    retranslate('#codeFormLabel', telegram ? 'auth.telegramCodeLabel' : 'auth.backupCodeLabel');
    retranslate('#codeFormHint', telegram ? 'auth.telegramCodeHint' : 'auth.backupCodeHint');

    const note = document.querySelector('#telegramCodeNote');
    if (note) {
      // Only when a code was actually asked for. Telling somebody a code is on
      // its way when the request to send it failed is the one sentence on this
      // page that would leave them waiting for nothing.
      note.hidden = !codeRequested;
      if (telegram && !codeRequested) secondStepError(t('auth.telegramCodeNotSent'));
    }

    const usePasskeyButton = document.querySelector('#usePasskeyButton');
    const codeField = document.querySelector('#backupCodeForm').elements.namedItem('code');

    // Not offered when the account has none. The button used to be shown to
    // everybody who reached this step because a passkey was the only way to
    // reach it; an account with Telegram alone would now be looking at a
    // control that can only fail.
    if (!passkey) {
      usePasskeyButton.hidden = true;
      codeField?.focus();
      return;
    }

    if (!passkeysSupported()) {
      // Nothing to click on a browser that cannot do this. The code form below
      // it still works, which is exactly why that path exists.
      usePasskeyButton.hidden = true;
      secondStepError(t('auth.passkeyUnsupportedHere'));
      codeField?.focus();
      return;
    }

    // The passkey is the faster of the two when it is there, so it keeps the
    // focus even for an account that also has a code on the way.
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

  /**
   * Point an element at a different dictionary key and redraw it now.
   *
   * The attribute is what survives: translateDom re-reads it on every
   * gftv:localechange, so an element whose text was assigned directly would
   * snap back to the markup's wording the moment somebody switched language
   * mid sign in. That is the rule the build already has, arriving from the one
   * direction where it is easy to miss.
   */
  function retranslate(selector, key) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.setAttribute('data-i18n', key);
    element.textContent = t(key);
  }

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
   * cannot get back in alone. That last case is worth a stop and not a
   * badge they will scroll past on their way out.
   */
  async function finish(data) {
    // A device that has just been trusted for the first time gets one chance to
    // be named, here, because this is the only moment anybody knows which of
    // the rows in that list is the machine in front of them. Skipping is
    // ordinary: the automatic label already went in when the row was written,
    // so the modal is an improvement on a good answer and never a gate in front
    // of somebody's own account.
    if (data?.device_trusted === true) {
      await askDeviceNickname(data.device_label ?? null);
    }

    const remaining = data?.codes?.recovery ?? 0;
    const target = redirectTarget() ?? DEFAULT_AFTER_LOGIN;

    // 8.9's forced reset comes first, ahead of both the recovery code warning
    // and wherever they were going. An admin has required a new password before
    // this account is used again, and the account area insists on it anyway;
    // sending them straight there is the difference between being told why and
    // being bounced.
    if (data?.user?.must_change_password === true) {
      window.location.href = '/account/security?password=required';
      return;
    }

    window.location.href = remaining === 0 ? '/account/security?codes=none' : target;
  }
}

// Why the one tap link did not work, held between the boot that reads it off the
// URL and the paint that can finally put a sentence on screen. Cleared the
// moment somebody uses the form, so a later language switch does not resurrect
// a note about a link over the answer to what they just did.
let magicReason = null;

/**
 * Say why a one tap link did not work, and take the parameter off the URL.
 *
 * The parameter is stripped with history.replaceState, which is what every
 * other deep link in this build does with its own: leaving it there means the
 * sentence comes back on every refresh, long after it stopped being true, and
 * it means somebody's bookmark carries a note about a link they used last week.
 *
 * **The sentence is painted twice, and the second time is the one that shows.**
 * This is the only message on this page written before anybody clicks anything,
 * so it is the only one that runs while the dictionary is still being fetched:
 * `shell.js` starts that fetch and `t()` answers with the key itself until it
 * lands. In English nothing hides that, because the page is only held blank for
 * a non default language, so `auth.magicOff` went on screen as its own name.
 * `gftv:localechange` fires once when the dictionary applies and again on every
 * switch, which makes it the redraw signal rather than a timer.
 */
function showMagicOutcome() {
  const form = document.querySelector('#loginForm');
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('magic');
  if (!form || !reason) return;

  magicReason = reason;
  paintMagicOutcome();

  params.delete('magic');
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}`
  );
}

/**
 * Ask what to call the device that has just been trusted.
 *
 * **This is the only moment anybody knows which row in that list is the machine
 * they are sitting at.** 5d's list is there so somebody can recognise their own
 * devices, and `deviceLabel()` can only ever say "Windows, Chrome" — which is
 * exactly the same thing it says about the other three Windows machines. So the
 * name is asked for once, when the row is written, and the automatic label is
 * offered as the starting point rather than an empty box.
 *
 * **Skipping is an ordinary answer**, and so is closing it. The row already has
 * its label, so every way out of this modal leaves a trusted device with a name
 * on it; nothing here is a gate in front of somebody's own account. It is not
 * shown again for the same device, because a device is only trusted once.
 *
 * Only ever the applicant realm. `gftvhello_trusted_devices` has no label
 * column and section 2 forbids adding one, so `/admin/login` has nothing to ask
 * about.
 *
 * @param {string|null} suggested the automatic label already on the row
 * @returns {Promise<void>} when it has been named, skipped, or closed
 */
function askDeviceNickname(suggested) {
  return new Promise((resolve) => {
    // Every string is a key on an attribute rather than text written in here,
    // so createDialog's own translation pass fills them and a language change
    // reaches them. Nothing is interpolated into this markup at all: the
    // suggestion is written onto the input as a value below, because it is
    // derived from a User-Agent header and that is somebody else's text.
    const dialog = createDialog({
      id: 'deviceNameDialog',
      titleKey: 'devices.nameTitle',
      bodyHtml: `
        <div class="modal-body">
          <p class="muted" data-i18n="devices.nameBody"></p>

          <div class="field">
            <label for="deviceNameInput" data-i18n="devices.nameLabel"></label>
            <input id="deviceNameInput" type="text" maxlength="40" autocomplete="off"
                   spellcheck="false" data-autofocus>
            <p class="field-error" data-error-for="label" hidden></p>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-quiet" data-skip
                    data-i18n="devices.nameSkip"></button>
            <button type="button" class="btn btn-primary" data-save
                    data-i18n="devices.nameSave"></button>
          </div>
        </div>`,
    });

    const input = dialog.panel.querySelector('#deviceNameInput');
    const error = dialog.panel.querySelector('[data-error-for="label"]');
    const save = dialog.panel.querySelector('[data-save]');
    let settled = false;

    input.value = suggested ?? '';

    function done() {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.element.remove();
      resolve();
    }

    // The three ways out that are not the save button. dialog.js closes on all
    // of them by itself; these listeners are what let the sign in carry on.
    dialog.panel.querySelector('[data-skip]').addEventListener('click', done);
    dialog.element.addEventListener('click', (event) => {
      if (event.target === dialog.element || event.target.closest('[data-close-dialog]')) done();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !settled) done();
    });

    save.addEventListener('click', async () => {
      const value = input.value.trim();

      // Nothing to say, or the same thing the row already says. Both are a skip
      // rather than a write, which keeps the "I just pressed the blue button"
      // path from depending on the network at all.
      if (value === '' || value === (suggested ?? '')) {
        done();
        return;
      }

      save.disabled = true;
      error.hidden = true;

      const result = await api('/api/auth/applicant/trusted-devices', {
        method: 'POST',
        locale: false,
        body: { action: 'rename', label: value },
      });

      if (!result.ok) {
        // The device is trusted either way and already carries the automatic
        // label, so this says what is true and leaves the way out open.
        error.textContent = t('devices.nameFailed');
        error.hidden = false;
        save.disabled = false;
        return;
      }

      done();
    });

    dialog.open();
    input.select();
  });
}

/** The sentence itself, in whatever language is loaded when this runs. */
function paintMagicOutcome() {
  const form = document.querySelector('#loginForm');
  if (!form || !magicReason) return;

  // An unrecognised value is somebody editing the URL. The generic sentence is
  // the honest answer to it and to a reason a later part might add.
  showFormMessage(form, 'note', t(MAGIC_REASONS[magicReason] ?? 'auth.magicUnknown'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
