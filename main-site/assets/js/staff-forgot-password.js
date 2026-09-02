// 5g's staff forgot password flow. **One implementation, mounted twice**, the
// same way 5f's settings suite is and for the same reason: the portal serves it
// at /admin/forgot-password and the docs site at /forgot-password, and two
// copies of a screen that sets a password is how the two drift until one of
// them asks for less than the other.
//
// The flow is 5c's, step for step, which is what 5g asks for:
//
//   1  username and one account recovery code
//   2  the second factor, where the account has one: a passkey, the
//      authenticator code, or a two step backup code
//   3  the new password
//
// **Nothing here decides anything.** The server issues the ticket, marks the
// second factor satisfied, and refuses a ticket that never was. This walks the
// panels and shows what came back.
//
// **What it says, on every one of the three panels.** A staff account is one
// account, so the password being set is the gftv.asia password too. 5g: "The
// confirmation screen must say that in those words. An admin who thinks they
// are resetting a careers portal password and finds themselves locked out of
// the main portal will not thank anybody."
//
// **And what it does not do at the end: sign anybody in.** The applicant flow
// does, because nothing else stands between somebody and their dashboard. This
// one has just ended every session and revoked every trusted device on a staff
// account behind a second factor, and signing in again is the point.

import { t } from './i18n.js';
import { api } from './api.js';
import { makeRunAction } from './run-action.js';
import { usePasskey, passkeysSupported, wasCancelled } from './passkeys.js';

let root = null;
let links = { signin: '/admin/login', back: '/admin' };

/** What step 1 handed back. Held here and never in the DOM. */
let ticket = null;
let methods = [];

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const el = (selector) => root?.querySelector(selector) ?? null;

function showError(message) {
  const node = el('#staffResetError');
  if (!node) return;
  node.textContent = message ?? '';
  node.hidden = !message;
}

const report = (kind, text) => showError(text);
const messageFor = (error) => error?.message || t('error.unexpected');

function boot() {
  root = document.querySelector('#staffForgotPassword');
  if (!root) return;

  links = {
    signin: root.dataset.signin || '/admin/login',
    back: root.dataset.back || '/admin',
  };

  drawCodeStep();

  document.addEventListener('gftv:localechange', () => {
    // Redrawn from whichever step the flow is on. The ticket lives in this
    // module, so changing language mid flow does not restart it.
    if (ticket === null) drawCodeStep();
  });
}

function shell(title, body) {
  return (
    '<div class="page-header">' +
    `<h1>${escapeHtml(title)}</h1>` +
    '</div>' +
    '<section class="glass-card card stack">' +
    // The sentence 5g requires, above every panel and not only the last one.
    // Somebody who reads it at step 3 has already spent a recovery code.
    `<div class="callout warn"><p>${escapeHtml(t('staffReset.reaches'))}</p></div>` +
    '<p class="callout danger" id="staffResetError" role="alert" hidden></p>' +
    body +
    '</section>' +
    `<p class="muted"><a href="${escapeHtml(links.signin)}">${escapeHtml(
      t('staffReset.backToSignIn')
    )}</a></p>`
  );
}

/* ---- Step 1: the recovery code ---------------------------------------- */

function drawCodeStep() {
  root.innerHTML = shell(
    t('staffReset.heading'),
    `<p>${escapeHtml(t('staffReset.codeIntro'))}</p>` +
      '<div class="field">' +
      `<label for="staffResetUsername">${escapeHtml(t('staffReset.username'))}</label>` +
      '<input id="staffResetUsername" type="text" autocapitalize="none" spellcheck="false" ' +
      'autocomplete="username">' +
      '</div>' +
      '<div class="field">' +
      `<label for="staffResetCode">${escapeHtml(t('staffReset.recoveryCode'))}</label>` +
      '<input id="staffResetCode" type="text" autocapitalize="none" spellcheck="false" ' +
      'autocomplete="off">' +
      `<p class="field-hint">${escapeHtml(t('staffReset.recoveryCodeHint'))}</p>` +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="staffResetContinue">' +
      `${escapeHtml(t('staffReset.continue'))}</button>` +
      `<p class="field-hint">${escapeHtml(t('staffReset.noCodes'))}</p>`
  );

  const button = el('#staffResetContinue');
  const runAction = makeRunAction(report);

  button.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const result = await api('/api/auth/staff/forgot-password', {
        method: 'POST',
        locale: false,
        body: {
          username: el('#staffResetUsername')?.value ?? '',
          code: el('#staffResetCode')?.value ?? '',
        },
      });

      if (!result.ok) {
        showError(messageFor(result.error));
        return;
      }

      ticket = result.data.ticket;
      methods = result.data.methods ?? [];

      if (result.data.second_factor_required) {
        drawSecondFactorStep(result.data.username);
        return;
      }

      drawPasswordStep(result.data.username);
    }, 'staff reset: recovery code');
  });
}

/* ---- Step 2: the second factor ---------------------------------------- */

function drawSecondFactorStep(username) {
  const passkey = methods.includes('passkey') && passkeysSupported();

  root.innerHTML = shell(
    t('staffReset.heading'),
    `<p>${escapeHtml(t('staffReset.secondFactorIntro', { username }))}</p>` +
      (passkey
        ? '<button type="button" class="btn btn-primary" id="staffResetPasskey">' +
          `${escapeHtml(t('staffReset.usePasskey'))}</button>` +
          `<p class="field-hint">${escapeHtml(t('staffReset.orACode'))}</p>`
        : '') +
      '<div class="field">' +
      `<label for="staffResetFactor">${escapeHtml(
        t(methods.includes('totp') ? 'staffReset.codeOrBackup' : 'staffReset.backupOnly')
      )}</label>` +
      '<input id="staffResetFactor" type="text" autocapitalize="none" spellcheck="false" ' +
      'autocomplete="one-time-code">' +
      '</div>' +
      '<button type="button" class="btn btn-secondary" id="staffResetFactorSubmit">' +
      `${escapeHtml(t('staffReset.continue'))}</button>`
  );

  const runAction = makeRunAction(report);

  const submit = el('#staffResetFactorSubmit');
  submit.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const result = await api('/api/auth/staff/forgot-password', {
        method: 'POST',
        locale: false,
        body: { ticket, code: el('#staffResetFactor')?.value ?? '' },
      });

      if (!result.ok) {
        showError(messageFor(result.error));
        return;
      }

      drawPasswordStep(username);
    }, 'staff reset: second factor');
  });

  const button = el('#staffResetPasskey');
  if (!button) return;

  button.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const started = await api('/api/auth/staff/forgot-password', {
        method: 'POST',
        locale: false,
        body: { ticket, action: 'options' },
      });

      if (!started.ok) {
        showError(messageFor(started.error));
        return;
      }

      let response;
      try {
        response = await usePasskey(started.data.options);
      } catch (error) {
        // Cancelling the system prompt is not a failure. The typed code is
        // still on screen underneath, which is the whole reason it is offered
        // beside the button rather than behind it.
        if (wasCancelled(error)) return;
        showError(t('security.passkeyFailed'));
        return;
      }

      const finished = await api('/api/auth/staff/forgot-password', {
        method: 'POST',
        locale: false,
        body: { ticket, action: 'passkey', response },
      });

      if (!finished.ok) {
        showError(messageFor(finished.error));
        return;
      }

      drawPasswordStep(username);
    }, 'staff reset: passkey');
  });
}

/* ---- Step 3: the new password ----------------------------------------- */

function drawPasswordStep(username) {
  root.innerHTML = shell(
    t('staffReset.newPasswordHeading'),
    `<p>${escapeHtml(t('staffReset.newPasswordIntro', { username }))}</p>` +
      '<div class="field">' +
      `<label for="staffResetPassword">${escapeHtml(t('staffReset.newPassword'))}</label>` +
      '<input id="staffResetPassword" type="password" autocomplete="new-password">' +
      '</div>' +
      '<div class="field">' +
      `<label for="staffResetConfirm">${escapeHtml(t('staffReset.confirmPassword'))}</label>` +
      '<input id="staffResetConfirm" type="password" autocomplete="new-password">' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="staffResetSave">' +
      `${escapeHtml(t('staffReset.setPassword'))}</button>`
  );

  const button = el('#staffResetSave');
  const runAction = makeRunAction(report);

  button.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const result = await api('/api/auth/staff/reset-password', {
        method: 'POST',
        locale: false,
        body: {
          ticket,
          password: el('#staffResetPassword')?.value ?? '',
          password_confirm: el('#staffResetConfirm')?.value ?? '',
        },
      });

      if (!result.ok) {
        showError(messageFor(result.error));
        return;
      }

      drawDone(result.data);
    }, 'staff reset: set password');
  });
}

function drawDone(data) {
  // The ticket is spent. Dropped here so that a redraw cannot present it again
  // and so nothing in this tab is holding it any longer than it is useful.
  ticket = null;
  methods = [];

  // 5c step 4, which 5g inherits: "If the account has fewer than three recovery
  // codes left afterwards, push them straight to regenerate." There is no
  // session to put them behind, so the push is a sentence and the account
  // settings page is where it lands once they have signed in.
  const low = data.codes_low
    ? `<p class="callout warn">${escapeHtml(
        t('staffReset.codesLow', { count: data.codes?.recovery ?? 0 })
      )}</p>`
    : '';

  root.innerHTML = shell(
    t('staffReset.doneHeading'),
    `<p>${escapeHtml(t('staffReset.doneBody'))}</p>` +
      low +
      `<p><a class="btn btn-primary" href="${escapeHtml(links.signin)}">${escapeHtml(
        t('staffReset.signInNow')
      )}</a></p>`
  );
}

boot();
