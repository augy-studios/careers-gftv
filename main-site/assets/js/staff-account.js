// 5f's staff account settings suite. **One implementation, mounted twice.**
//
// The portal serves it at /admin/security and the docs site at /account, and
// 16c is explicit that both come "from one shared implementation". 5f is
// sharper still: "the same markup, the same copy, and the same endpoint shapes.
// Two separate implementations of one security page is how the two drift until
// one of them is wrong."
//
// **So the markup is here and not in either page.** Each site provides an empty
// container and this builds every panel into it. That is phase 13 decision 8,
// and the alternative it beat was one HTML fragment generated into two shells:
// both keep one source, and only this one makes it impossible to edit the copy
// on one site without editing it on the other, because there is no second file
// to edit.
//
// **The two sites differ by a stylesheet and by three attributes, and by
// nothing else.** The class names below are the portal's, and docs.css defines
// the same names in the docs site's own language -- which is the adapter
// decision 8 asked for, arriving as CSS instead of as a transform. What cannot
// be styled is where a link goes, so the container carries those:
//
//   data-signin      where to send somebody with no session
//   data-back        where "back" goes
//   data-account-url the gftv.asia account page, for the fields 5f says are
//                    read only and edited there
//
// **What this page must never imply.** Two of its panels describe things that
// are not scoped to the site the reader is looking at, and both say so:
// trusted devices are the account's across both sites, because the table is
// shared and section 2 forbids adding a column to it (deviation 125); a passkey
// works on both sites, because 5e gives them one relying party id. Sessions are
// the opposite and say that instead: 5h keeps them apart, so signing out here
// does not sign you out there, and the list labels each row.

import { t } from './i18n.js';
import { api, staffSession } from './api.js';
import { hydrateIcons } from './icons.js';
import { makeRunAction } from './run-action.js';
import { passkeysSupported, createPasskey, wasCancelled } from './passkeys.js';
import { confirmDangerousAction, confirmAction } from './danger-confirm.js';
import { generateAndShow } from './recovery-codes.js';
import { formatDateTime } from './format.js';

const CODES_ENDPOINT = '/api/auth/staff/recovery-codes';

/** Everything the page last read. Redrawn from this rather than from the DOM. */
let state = null;
let root = null;
let links = { signin: '/admin/login', back: '/admin', account: null };

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const el = (selector) => root?.querySelector(selector) ?? null;

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

async function boot() {
  root = document.querySelector('#staffAccount');
  if (!root) return;

  links = {
    signin: root.dataset.signin || '/admin/login',
    back: root.dataset.back || '/admin',
    account: root.dataset.accountUrl || null,
  };

  const session = await staffSession();

  // **A failed session read is not a signed out one.** Phase 10's rule, and the
  // two dashboards learned it the hard way: staffSession answers null for both,
  // so the redirect below is the same either way and that is a known cost. What
  // is not acceptable is drawing the page as though the account had nothing on
  // it, which is why nothing renders before this returns.
  if (!session?.user) {
    window.location.replace(links.signin);
    return;
  }

  await load();

  // Redrawn on a language change, because everything on this page is built
  // here rather than marked up with data-i18n, so translateDom has nothing to
  // walk. check-i18n.js is what catches the other half of this rule.
  document.addEventListener('gftv:localechange', () => {
    if (state) draw();
  });
}

async function load() {
  const result = await api('/api/auth/staff/account');

  if (!result.ok) {
    root.innerHTML =
      `<div class="callout danger"><p>${escapeHtml(t('staffAccount.loadFailed'))}</p></div>`;
    return;
  }

  state = result.data;
  draw();
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function draw() {
  root.innerHTML = [
    header(),
    profilePanel(),
    passwordPanel(),
    passkeyPanel(),
    totpPanel(),
    codesPanel('recovery'),
    codesPanel('backup'),
    devicePanel(),
    sessionPanel(),
    dangerPanel(),
    footer(),
  ].join('');

  hydrateIcons(root);
  wire();
}

function header() {
  return (
    '<div class="page-header">' +
    `<h1>${escapeHtml(t('staffAccount.heading'))}</h1>` +
    `<p class="lede"><strong>${escapeHtml(state.profile.username)}</strong> ` +
    `<span class="muted">${escapeHtml(t('staffAccount.staffAccount'))}</span></p>` +
    '</div>'
  );
}

function panel(id, icon, title, body) {
  return (
    `<section class="glass-card card stack" id="${id}">` +
    `<h2><span data-icon="${icon}" data-icon-size="18"></span> ` +
    `<span>${escapeHtml(title)}</span></h2>` +
    body +
    '</section>'
  );
}

/** A password field. Five panels need one and 5f asks for one on each. */
function passwordField(id, hintKey = 'security.passwordForChanges') {
  return (
    '<div class="field">' +
    `<label for="${id}">${escapeHtml(t('security.currentPasswordLabel'))}</label>` +
    `<input id="${id}" type="password" autocomplete="current-password">` +
    `<p class="field-hint">${escapeHtml(t(hintKey))}</p>` +
    '</div>'
  );
}

/**
 * The note a panel draws in place of its button while the hold is on.
 *
 * **It replaces the control rather than sitting beside it.** A disabled button
 * with an explanation under it is the shape somebody clicks anyway; a sentence
 * where the button was is the shape somebody reads. Phase 10's "there are three
 * reasons a control can be disabled" is the same observation from the other
 * end, and this is the third reason: not signed out, not busy, but deliberately
 * not offered yet.
 */
function heldNote() {
  return `<p class="callout note">${escapeHtml(t('staffAccount.held'))}</p>`;
}

function errorSlot(id) {
  return `<p class="callout danger" id="${id}" role="alert" hidden></p>`;
}

/* ---- Profile, read only ---------------------------------------------- */

function profilePanel() {
  const rows = [
    ['staffAccount.username', state.profile.username],
    ['staffAccount.displayName', state.profile.display_name],
    ['staffAccount.email', state.profile.email],
  ];

  const list = rows
    .map(([key, value]) => {
      // **A field that could not be read says so.** staffProfile answers
      // available: false when the select failed, and drawing a blank beside
      // "Email" would read as an account with no email address on it.
      const shown = state.profile.available
        ? value || t('staffAccount.notSet')
        : t('staffAccount.unavailable');

      return (
        '<div class="account-row">' +
        `<span class="account-row-label">${escapeHtml(t(key))}</span>` +
        `<span class="account-row-value">${escapeHtml(shown)}</span>` +
        '</div>'
      );
    })
    .join('');

  // 5f: "Say that on the page with a link, rather than showing fields that
  // cannot be saved."
  const note = links.account
    ? `<p class="field-hint">${escapeHtml(t('staffAccount.profileElsewhere'))} ` +
      `<a href="${escapeHtml(links.account)}" rel="noopener">${escapeHtml(
        t('staffAccount.profileElsewhereLink')
      )}</a></p>`
    : `<p class="field-hint">${escapeHtml(t('staffAccount.profileElsewhere'))}</p>`;

  return panel('accountProfile', 'user', t('staffAccount.profileHeading'), list + note);
}

/* ---- Password --------------------------------------------------------- */

function passwordPanel() {
  return panel(
    'accountPassword',
    'key',
    t('staffAccount.passwordHeading'),
    // The sentence 5g requires, in front of the form and not after it.
    `<div class="callout warn"><p>${escapeHtml(t('staffAccount.passwordReaches'))}</p></div>` +
      errorSlot('accountPasswordError') +
      passwordField('accountCurrentPassword') +
      '<div class="field">' +
      `<label for="accountNewPassword">${escapeHtml(t('staffAccount.newPassword'))}</label>` +
      '<input id="accountNewPassword" type="password" autocomplete="new-password">' +
      `<p class="field-hint">${escapeHtml(
        t('staffAccount.passwordMin', { count: state.password_min_length })
      )}</p>` +
      '</div>' +
      '<div class="field">' +
      `<label for="accountConfirmPassword">${escapeHtml(t('staffAccount.confirmPassword'))}</label>` +
      '<input id="accountConfirmPassword" type="password" autocomplete="new-password">' +
      '</div>' +
      (state.hello_writes_enabled
        ? `<button type="button" class="btn btn-secondary" id="accountChangePassword">` +
          `${escapeHtml(t('staffAccount.changePassword'))}</button>`
        : heldNote())
  );
}

/* ---- Passkeys --------------------------------------------------------- */

function passkeyPanel() {
  const list = state.passkeys.length
    ? '<ul class="device-list" id="accountPasskeyList">' +
      state.passkeys
        .map((passkey) => {
          // 5f: "Show which site each was registered from, since they work on
          // both and a reader will otherwise wonder why one they made on the
          // docs site appears on the portal." registered_on is migration 039's
          // column, and a row from before it carries null rather than a guess.
          const where = passkey.registered_on
            ? t(`staffAccount.registeredOn.${passkey.registered_on}`)
            : t('staffAccount.registeredOnUnknown');

          const used = passkey.last_used_at
            ? t('staffAccount.lastUsed', { when: formatDateTime(passkey.last_used_at) })
            : t('staffAccount.neverUsed');

          return (
            '<li class="device-row">' +
            '<div class="device-main">' +
            `<span class="device-label">${escapeHtml(passkey.label || t('staffAccount.unnamedPasskey'))}</span>` +
            `<span class="muted">${escapeHtml(where)} · ${escapeHtml(used)}</span>` +
            '</div>' +
            '<div class="device-actions">' +
            `<button type="button" class="btn btn-quiet" data-rename-passkey="${escapeHtml(passkey.id)}">` +
            `${escapeHtml(t('staffAccount.rename'))}</button>` +
            `<button type="button" class="btn btn-quiet" data-remove-passkey="${escapeHtml(passkey.id)}">` +
            `${escapeHtml(t('staffAccount.remove'))}</button>` +
            '</div></li>'
          );
        })
        .join('') +
      '</ul>'
    : `<p class="muted">${escapeHtml(t('staffAccount.noPasskeys'))}</p>`;

  const unsupported = passkeysSupported()
    ? ''
    : `<div class="callout note"><p>${escapeHtml(t('security.passkeyUnsupported'))}</p></div>`;

  return panel(
    'accountPasskeys',
    'shield',
    t('security.passkeyHeading'),
    `<p>${escapeHtml(t('security.passkeyBody'))}</p>` +
      // 5e's two consequences, said plainly. A passkey works on both careers
      // sites and on neither at gftv.asia, and neither half is guessable.
      `<p>${escapeHtml(t('staffAccount.passkeyScope'))}</p>` +
      list +
      unsupported +
      errorSlot('accountPasskeyError') +
      passwordField('accountPasskeyPassword') +
      '<button type="button" class="btn btn-secondary" id="accountAddPasskey">' +
      '<span data-icon="key" data-icon-size="18"></span> ' +
      `<span>${escapeHtml(t('security.addPasskey'))}</span></button>`
  );
}

/* ---- Authenticator app ------------------------------------------------ */

function totpPanel() {
  const status = state.totp_enabled
    ? t('staffAccount.totpOn')
    : t('staffAccount.totpOff');

  // **No "last used", and the page does not pretend otherwise.** 5f asks for
  // one and gftvhello_users has nowhere to record it; section 2 says not to add
  // a column. So the panel says whether it is on and stops.
  const body =
    `<p>${escapeHtml(t('staffAccount.totpBody'))}</p>` +
    `<div class="callout warn"><p>${escapeHtml(t('staffAccount.totpReaches'))}</p></div>` +
    `<div class="account-row"><span class="account-row-label">${escapeHtml(
      t('staffAccount.totpStatus')
    )}</span><span class="account-row-value">${escapeHtml(status)}</span></div>` +
    errorSlot('accountTotpError') +
    '<div id="accountTotpEnrol" hidden></div>' +
    passwordField('accountTotpPassword') +
    (!state.hello_writes_enabled
      ? heldNote()
      : state.totp_enabled
      ? '<div class="field">' +
        `<label for="accountTotpCode">${escapeHtml(t('staffAccount.totpCodeLabel'))}</label>` +
        '<input id="accountTotpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7">' +
        `<p class="field-hint">${escapeHtml(t('staffAccount.totpCodeToRemove'))}</p>` +
        '</div>' +
        '<button type="button" class="btn btn-quiet" id="accountRemoveTotp">' +
        `${escapeHtml(t('staffAccount.totpRemove'))}</button>`
      : '<button type="button" class="btn btn-secondary" id="accountStartTotp">' +
        `${escapeHtml(t('staffAccount.totpEnrol'))}</button>`);

  return panel('accountTotp', 'clock', t('staffAccount.totpHeading'), body);
}

/* ---- The two code sets ------------------------------------------------ */

function codesPanel(set) {
  const count = state.codes[set];
  const low = state.codes_low[set];

  // Null is "we could not read it", never zero. accounts.js answers null on a
  // failed count for exactly this sentence.
  const remaining =
    count === null || count === undefined
      ? t('codes.remainingUnknown')
      : t('codes.remaining', { count });

  const warning =
    count === 0
      ? `<p class="callout danger">${escapeHtml(
          t(set === 'backup' ? 'codes.noneLeftBackup' : 'codes.noneLeftRecovery')
        )}</p>`
      : low
        ? `<p class="callout warn">${escapeHtml(t('codes.runningLow', { count }))}</p>`
        : '';

  // Only the backup set reaches gftv.asia. Said beside that button and not at
  // the top of the page, because a sentence covering both would be wrong about
  // one of them.
  const reaches =
    set === 'backup'
      ? `<div class="callout warn"><p>${escapeHtml(t('staffAccount.backupReaches'))}</p></div>`
      : '';

  return panel(
    `accountCodes-${set}`,
    'key',
    t(set === 'backup' ? 'staffAccount.backupHeading' : 'staffAccount.recoveryHeading'),
    `<p>${escapeHtml(
      t(set === 'backup' ? 'staffAccount.backupBody' : 'staffAccount.recoveryBody')
    )}</p>` +
      reaches +
      `<div class="account-row"><span class="account-row-label">${escapeHtml(
        t('codes.remainingLabel')
      )}</span><span class="account-row-value" data-count-for="${set}">${escapeHtml(
        remaining
      )}</span></div>` +
      warning +
      errorSlot(`accountCodesError-${set}`) +
      passwordField(`accountCodesPassword-${set}`) +
      `<button type="button" class="btn btn-secondary" data-generate-set="${set}">` +
      `${escapeHtml(t(count ? 'codes.regenerate' : 'codes.generate'))}</button>`
  );
}

/* ---- Trusted devices -------------------------------------------------- */

function devicePanel() {
  const list = state.devices.length
    ? '<ul class="device-list">' +
      state.devices
        .map((device) => {
          const used = device.last_used_at
            ? t('staffAccount.lastUsed', { when: formatDateTime(device.last_used_at) })
            : t('staffAccount.neverUsed');

          return (
            '<li class="device-row">' +
            '<div class="device-main">' +
            // The staff table has no label column, so there is nothing to name
            // a device by. listTrustedDevices says so by answering null, and
            // this draws the honest placeholder instead of inventing one.
            `<span class="device-label">${escapeHtml(
              device.label || t('staffAccount.unnamedDevice')
            )}</span>` +
            `<span class="muted">${escapeHtml(used)}</span>` +
            '</div>' +
            '<div class="device-actions">' +
            `<button type="button" class="btn btn-quiet" data-revoke-device="${escapeHtml(device.id)}">` +
            `${escapeHtml(t('devices.revoke'))}</button>` +
            '</div></li>'
          );
        })
        .join('') +
      '</ul>'
    : `<p class="muted">${escapeHtml(t('staffAccount.noDevices'))}</p>`;

  return panel(
    'accountDevices',
    'laptop',
    t('security.devicesHeading'),
    `<p>${escapeHtml(t('security.devicesBody'))}</p>` +
      // Deviation 125, in both directions and in that order: the list is the
      // account's, and trust is still earned per site. A reader told only the
      // first concludes the checkbox on the other site did nothing.
      `<div class="callout note"><p>${escapeHtml(t('staffAccount.devicesShared'))}</p>` +
      `<p>${escapeHtml(t('staffAccount.devicesPerSite'))}</p></div>` +
      list +
      errorSlot('accountDeviceError') +
      passwordField('accountDevicePassword')
  );
}

/* ---- Sessions --------------------------------------------------------- */

function sessionPanel() {
  const rows = state.sessions
    .map((session) => {
      const site = t(`staffAccount.site.${session.site}`);
      const started = session.created_at
        ? t('staffAccount.startedOn', { when: formatDateTime(session.created_at) })
        : '';
      const expires = session.expires_at
        ? t('staffAccount.expiresOn', { when: formatDateTime(session.expires_at) })
        : '';

      return (
        '<li class="device-row">' +
        '<div class="device-main">' +
        `<span class="device-label">${escapeHtml(site)}${
          session.current ? ` <span class="badge">${escapeHtml(t('staffAccount.thisSession'))}</span>` : ''
        }</span>` +
        `<span class="muted">${escapeHtml([started, expires].filter(Boolean).join(' · '))}</span>` +
        '</div></li>'
      );
    })
    .join('');

  // **A short list is not a complete one when a table could not be read.** The
  // route answers sessions_failed for exactly this, and the panel says it
  // rather than drawing what it managed to fetch as the whole truth.
  const failed = state.sessions_failed
    ? `<p class="callout warn">${escapeHtml(t('staffAccount.sessionsPartial'))}</p>`
    : '';

  return panel(
    'accountSessions',
    'globe',
    t('staffAccount.sessionsHeading'),
    `<p>${escapeHtml(t('staffAccount.sessionsBody'))}</p>` +
      // Decision 10. There is nowhere in a session row for a device, so the
      // panel says which site and when and admits the rest.
      `<p class="field-hint">${escapeHtml(t('staffAccount.sessionsNoDevice'))}</p>` +
      failed +
      (rows ? `<ul class="device-list">${rows}</ul>` : `<p class="muted">${escapeHtml(t('staffAccount.noSessions'))}</p>`)
  );
}

/* ---- The danger zone -------------------------------------------------- */

/**
 * 5f's six, in its order. Each carries the consequences its dialog reads out,
 * and two of them say that they reach gftv.asia.
 */
const DANGER = Object.freeze([
  { action: 'remove_passkeys', reaches: false },
  { action: 'remove_totp', reaches: true },
  { action: 'invalidate_recovery_codes', reaches: false },
  { action: 'invalidate_backup_codes', reaches: true },
  { action: 'revoke_devices', reaches: false },
  { action: 'sign_out_everywhere', reaches: false },
]);

function dangerPanel() {
  const buttons = DANGER.filter(
    ({ action }) => state.hello_writes_enabled || action !== 'remove_totp'
  )
    .map(
      ({ action }) =>
        `<button type="button" class="btn btn-danger" data-danger="${action}">` +
        `${escapeHtml(t(`staffAccount.danger.${action}`))}</button>`
    )
    .join('');

  // **Removing the authenticator app is the one action here that writes
  // gftvhello_users**, so it is the one the hold covers. Drawn as a sentence
  // where its button was, and not as a button that asks somebody to type their
  // username, their password and a fresh code before refusing them.
  const heldAction = state.hello_writes_enabled ? '' : heldNote();

  // 5f: "There is no delete account. The gftvhello account belongs to gftv.asia
  // and is shared with it; this project does not get to delete it. Say so on
  // the page and link across, rather than leaving a gap a reader reads as an
  // oversight."
  const noDelete = links.account
    ? `<p class="field-hint">${escapeHtml(t('staffAccount.noDelete'))} ` +
      `<a href="${escapeHtml(links.account)}" rel="noopener">${escapeHtml(
        t('staffAccount.profileElsewhereLink')
      )}</a></p>`
    : `<p class="field-hint">${escapeHtml(t('staffAccount.noDelete'))}</p>`;

  return (
    '<section class="glass-card card stack danger-zone" id="accountDanger">' +
    `<h2><span data-icon="warning" data-icon-size="18"></span> ` +
    `<span>${escapeHtml(t('staffAccount.dangerHeading'))}</span></h2>` +
    `<p>${escapeHtml(t('staffAccount.dangerBody'))}</p>` +
    errorSlot('accountDangerError') +
    `<div class="danger-actions">${buttons}</div>` +
    heldAction +
    noDelete +
    '</section>'
  );
}

function footer() {
  return (
    `<p class="muted"><a href="${escapeHtml(links.back)}">` +
    `${escapeHtml(t('staffAccount.back'))}</a></p>`
  );
}

/* -------------------------------------------------------------------------
 * Behaviour
 * ---------------------------------------------------------------------- */

function showError(id, message) {
  const node = el(`#${id}`);
  if (!node) return;
  node.textContent = message ?? '';
  node.hidden = !message;
}

/**
 * run-action.js reports as (kind, text), because the dashboard's message bars
 * draw an error differently from a success. Every panel here has one slot and
 * only ever shows an error in it, so the kind is dropped rather than a second
 * shape of reporter being invented for one page.
 */
const reporter = (id) => (kind, text) => showError(id, text);

function passwordFrom(selector, errorId) {
  const value = el(selector)?.value ?? '';
  if (value === '') {
    showError(errorId, t('auth.passwordRequired'));
    return null;
  }
  showError(errorId, '');
  return value;
}

/** The message a route sent, or a generic one. Never a raw code. */
function messageFor(error) {
  return error?.message || t('error.unexpected');
}

function wire() {
  wirePassword();
  wirePasskeys();
  wireTotp();
  wireCodes();
  wireDevices();
  wireDanger();
}

/* ---- Password --------------------------------------------------------- */

function wirePassword() {
  const button = el('#accountChangePassword');
  if (!button) return;

  // **Never a bare async handler on a listener.** runAction exists three times
  // in this codebase for that reason and this is the fourth: a rejected promise
  // from a listener is an unhandled rejection and a page that silently did
  // nothing.
  const runAction = makeRunAction(reporter('accountPasswordError'));

  button.addEventListener('click', () => {
    runAction(async () => {
      const current = passwordFrom('#accountCurrentPassword', 'accountPasswordError');
      if (!current) return;

      const next = el('#accountNewPassword')?.value ?? '';
      const confirm = el('#accountConfirmPassword')?.value ?? '';

      if (next !== confirm) {
        showError('accountPasswordError', t('staffAccount.passwordMismatch'));
        return;
      }

      const result = await api('/api/auth/staff/account', {
        method: 'POST',
        locale: false,
        body: { action: 'change_password', current_password: current, new_password: next },
      });

      if (!result.ok) {
        showError('accountPasswordError', messageFor(result.error));
        return;
      }

      await load();
    }, 'change staff password');
  });
}

/* ---- Passkeys --------------------------------------------------------- */

function wirePasskeys() {
  const slot = 'accountPasskeyError';
  const runAction = makeRunAction(reporter(slot));

  const add = el('#accountAddPasskey');
  if (add) {
    add.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom('#accountPasskeyPassword', slot);
        if (!password) return;

        const started = await api('/api/auth/staff/passkeys', {
          method: 'POST',
          locale: false,
          body: { action: 'start', current_password: password },
        });

        if (!started.ok) {
          showError(slot, messageFor(started.error));
          return;
        }

        let response;
        try {
          response = await createPasskey(started.data.options);
        } catch (error) {
          // Cancelling the system prompt is not a failure and gets no message.
          // Somebody who changed their mind knows that they did.
          if (wasCancelled(error)) return;
          showError(slot, t('security.passkeyFailed'));
          return;
        }

        const finished = await api('/api/auth/staff/passkeys', {
          method: 'POST',
          locale: false,
          body: { action: 'finish', response },
        });

        if (!finished.ok) {
          showError(slot, messageFor(finished.error));
          return;
        }

        await load();
      }, 'add staff passkey');
    });
  }

  root.querySelectorAll('[data-rename-passkey]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(async () => {
        const id = button.dataset.renamePasskey;
        const password = passwordFrom('#accountPasskeyPassword', slot);
        if (!password) return;

        const current = state.passkeys.find((passkey) => passkey.id === id)?.label ?? '';

        // confirmAction and not a prompt(). The dialog is the one this build
        // already uses for a single typed value, so this panel asks the way
        // every other panel asks and the copy goes through the dictionary.
        const answer = await confirmAction({
          title: t('staffAccount.renameTitle'),
          confirmLabel: t('staffAccount.rename'),
          field: {
            label: t('staffAccount.renameLabel'),
            hint: t('staffAccount.renameHint'),
            placeholder: current,
            maxLength: 60,
          },
        });

        if (!answer?.value) return;

        const result = await api('/api/auth/staff/passkeys', {
          method: 'POST',
          locale: false,
          body: {
            action: 'rename',
            id,
            label: answer.value,
            current_password: password,
          },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        await load();
      }, 'rename staff passkey');
    });
  });

  root.querySelectorAll('[data-remove-passkey]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom('#accountPasskeyPassword', slot);
        if (!password) return;

        const result = await api('/api/auth/staff/passkeys', {
          method: 'POST',
          locale: false,
          body: { action: 'remove', id: button.dataset.removePasskey, current_password: password },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        await load();
      }, 'remove staff passkey');
    });
  });
}

/* ---- Authenticator app ------------------------------------------------ */

function wireTotp() {
  const slot = 'accountTotpError';
  const runAction = makeRunAction(reporter(slot));

  const start = el('#accountStartTotp');
  if (start) {
    start.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom('#accountTotpPassword', slot);
        if (!password) return;

        const result = await api('/api/auth/staff/totp', {
          method: 'POST',
          locale: false,
          body: { action: 'start', current_password: password },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        drawEnrolment(result.data);
      }, 'start staff totp enrolment');
    });
  }

  const remove = el('#accountRemoveTotp');
  if (remove) {
    remove.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom('#accountTotpPassword', slot);
        if (!password) return;

        const result = await api('/api/auth/staff/totp', {
          method: 'POST',
          locale: false,
          body: {
            action: 'remove',
            current_password: password,
            code: el('#accountTotpCode')?.value ?? '',
          },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        await load();
      }, 'remove staff totp');
    });
  }
}

/**
 * The enrolment step: the QR, the secret in text for anybody who cannot scan
 * one, and the field that proves the app actually stored it.
 *
 * **Nothing has been written when this is on screen.** The secret lives in this
 * closure and in the markup and nowhere else, so navigating away is a complete
 * cancellation with no cleanup and no half enrolled account.
 */
function drawEnrolment(data) {
  const slot = 'accountTotpError';
  const holder = el('#accountTotpEnrol');
  if (!holder) return;

  holder.hidden = false;
  holder.innerHTML =
    `<p>${escapeHtml(t('staffAccount.totpScan'))}</p>` +
    `<div class="totp-qr">${qrSvg(data.qr)}</div>` +
    `<p class="field-hint">${escapeHtml(t('staffAccount.totpTypeInstead'))}</p>` +
    `<p class="totp-secret"><code>${escapeHtml(data.secret)}</code></p>` +
    '<div class="field">' +
    `<label for="accountTotpConfirmCode">${escapeHtml(t('staffAccount.totpCodeLabel'))}</label>` +
    '<input id="accountTotpConfirmCode" type="text" inputmode="numeric" ' +
    'autocomplete="one-time-code" maxlength="7">' +
    `<p class="field-hint">${escapeHtml(t('staffAccount.totpConfirmHint'))}</p>` +
    '</div>' +
    '<button type="button" class="btn btn-primary" id="accountConfirmTotp">' +
    `${escapeHtml(t('staffAccount.totpConfirm'))}</button>`;

  const confirm = holder.querySelector('#accountConfirmTotp');
  const runAction = makeRunAction(reporter(slot));

  confirm.addEventListener('click', () => {
    runAction(async () => {
      const password = passwordFrom('#accountTotpPassword', slot);
      if (!password) return;

      const result = await api('/api/auth/staff/totp', {
        method: 'POST',
        locale: false,
        body: {
          action: 'confirm',
          current_password: password,
          secret: data.secret,
          code: holder.querySelector('#accountTotpConfirmCode')?.value ?? '',
        },
      });

      if (!result.ok) {
        showError(slot, messageFor(result.error));
        return;
      }

      await load();
    }, 'confirm staff totp enrolment');
  });
}

/**
 * A QR matrix as an SVG. The same drawing telegram-link.js does, and for the
 * same reason: **a credential never leaves this build to be rendered.** The URI
 * inside carries the shared secret in the clear, so an image service would put
 * a second factor in somebody else's access log.
 */
function qrSvg(qr) {
  if (!qr?.rows?.length) return '';

  const quiet = 4;
  const side = qr.size + quiet * 2;

  const squares = qr.rows
    .map((row, y) =>
      [...row]
        .map((cell, x) =>
          cell === '1' ? `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>` : ''
        )
        .join('')
    )
    .join('');

  return (
    `<svg viewBox="0 0 ${side} ${side}" role="img" aria-label="${escapeHtml(
      t('staffAccount.totpQrLabel')
    )}" shape-rendering="crispEdges">` +
    // The quiet zone is white rather than transparent: a scanner needs the
    // contrast, and a dark theme would otherwise flood the symbol. Phase 11
    // part 6 found that one by looking at it.
    `<rect width="${side}" height="${side}" fill="#ffffff"/>` +
    `<g fill="#000000">${squares}</g></svg>`
  );
}

/* ---- The two code sets ------------------------------------------------ */

function wireCodes() {
  root.querySelectorAll('[data-generate-set]').forEach((button) => {
    const set = button.dataset.generateSet;
    const slot = `accountCodesError-${set}`;
    const runAction = makeRunAction(reporter(slot));

    button.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom(`#accountCodesPassword-${set}`, slot);
        if (!password) return;

        const result = await generateAndShow(set, password, { endpoint: CODES_ENDPOINT });
        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        await load();
      }, `generate staff ${set} codes`);
    });
  });
}

/* ---- Trusted devices -------------------------------------------------- */

function wireDevices() {
  const slot = 'accountDeviceError';
  const runAction = makeRunAction(reporter(slot));

  root.querySelectorAll('[data-revoke-device]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(async () => {
        const password = passwordFrom('#accountDevicePassword', slot);
        if (!password) return;

        const result = await api('/api/auth/staff/trusted-devices', {
          method: 'POST',
          locale: false,
          body: { action: 'revoke', id: button.dataset.revokeDevice, current_password: password },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        await load();
      }, 'revoke staff trusted device');
    });
  });
}

/* ---- The danger zone -------------------------------------------------- */

function wireDanger() {
  const slot = 'accountDangerError';
  const runAction = makeRunAction(reporter(slot));

  root.querySelectorAll('[data-danger]').forEach((button) => {
    const action = button.dataset.danger;
    const entry = DANGER.find((item) => item.action === action);

    button.addEventListener('click', () => {
      runAction(async () => {
        // 5f: consequences, then the typed username, then the password and a
        // fresh second factor, "in this order and with no way to skip ahead".
        // So neither skipUsername nor skipPassword is ever passed here, which
        // is the rule danger-confirm.js states about itself.
        // **Whether this would leave the account on its password alone.** 5f
        // lists both removals with no exception and somebody whose phone is
        // gone and whose passkey is on a dead laptop needs exactly this, so it
        // is allowed -- and it is said in the first panel, before the username
        // and the password are typed, because it is the consequence a reader is
        // least likely to have worked out for themselves.
        const lastFactor =
          (action === 'remove_passkeys' && !state.totp_enabled) ||
          (action === 'remove_totp' && state.passkeys.length === 0);

        const confirmed = await confirmDangerousAction({
          title: t(`staffAccount.danger.${action}`),
          consequences: [
            t(`staffAccount.dangerConsequence.${action}`),
            ...(lastFactor ? [t('staffAccount.dangerLastFactor')] : []),
            ...(entry?.reaches ? [t('staffAccount.dangerReaches')] : []),
            t('staffAccount.dangerNotNotified'),
          ],
          confirmLabel: t(`staffAccount.danger.${action}`),
          username: state.profile.username,
          irreversible: t('staffAccount.dangerIrreversible'),
          // The fresh factor, and only where there is one to be fresh. The
          // route decides the same thing from the account rather than from what
          // the browser sent, so a client that skipped this panel is refused
          // instead of obeyed.
          requireCode: state.totp_enabled,
          // **Nothing is sent.** The applicant realm's version of this step
          // asks the bot to push a code at somebody's phone; a TOTP code is
          // already on the phone, so this only replaces the note under the
          // field with a sentence that is true here.
          onCodeStep: async () => t('staffAccount.dangerCodeFromApp'),
        });

        if (!confirmed) return;

        const result = await api('/api/auth/staff/danger', {
          method: 'POST',
          locale: false,
          body: {
            action,
            confirm_username: state.profile.username,
            password: confirmed.password,
            code: confirmed.code ?? '',
          },
        });

        if (!result.ok) {
          showError(slot, messageFor(result.error));
          return;
        }

        // **Signing out everywhere includes this browser**, so there is no page
        // left to redraw: the session this request was made with is gone, and
        // load() would answer 401 and leave the reader looking at a settings
        // page that cannot read anything. The sign in page is where they are.
        if (result.data?.signed_out === true) {
          window.location.assign(links.signin);
          return;
        }

        await load();
      }, `staff danger zone: ${action}`);
    });
  });
}

boot();
