// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// 16b's sign in, rendered into the documentation shell. 5h built the routes in
// phase 13 parts 1 and 2 and nothing on this site had a way to reach them until
// phase 13 part 6: the header has linked to /login since part 4, and that
// address answered "there is no page here".
//
// **It is this site's own and the settings page beside it is generated, and the
// difference is worth stating.** 5f asks for the account settings suite to be
// specified once and mounted twice, so that one is the portal's module. Nothing
// says the same about a sign in form, and the portal's staff login is marked up
// inside admin/login/index.html with its own shell around it -- so sharing it
// would have meant rewriting a working sign in on a live site to serve a page
// that has never had one. The endpoints are shared, which is where 5h says the
// two sites are meant to agree.
//
// The two controls 5d fixes are both here and are independent, per 16b:
//
//   stay signed in    30 days, against 12 hours off. About the session only.
//   trust this device  skips the second step next time, and **never the
//                      password**. It appears on the second factor panel and
//                      only there, which is what 5d requires.
//
// **And the sentence 16b asks for beside that second box**: trusting a browser
// here does not trust it on the portal, because the cookie is scoped to this
// host. A reader not told that concludes the checkbox failed.

import { t } from './i18n.js';
import { api } from './api.js';
import { makeRunAction } from './run-action.js';
import { usePasskey, passkeysSupported, wasCancelled } from './passkeys.js';

let root = null;
let links = { account: '/account', forgot: '/forgot-password' };

/** What the password step handed back, when a second factor is wanted. */
let challenge = null;
let methods = [];

/**
 * 5d's first control, remembered across the two panels.
 *
 * It is asked for on the password panel and acted on when the session is
 * finally issued, which for an account with a second factor is one request
 * later. Holding it here is what keeps the two controls independent: the
 * second panel decides trust and this decides length, and neither reads the
 * other.
 */
let staySignedIn = false;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const el = (selector) => root?.querySelector(selector) ?? null;

function showError(message) {
  const node = el('#docsLoginError');
  if (!node) return;
  node.textContent = message ?? '';
  node.hidden = !message;
}

const report = (kind, text) => showError(text);
const messageFor = (error) => error?.message || t('error.unexpected');

/**
 * Where to go once there is a session.
 *
 * **The redirect is checked against this origin and nothing else.** An open
 * redirect on a sign in page is how somebody is walked to a copy of it, and a
 * relative path starting with a single slash is the only shape that cannot
 * leave: `//evil.example` is a protocol relative URL and is refused here.
 */
function destination() {
  const asked = new URL(window.location.href).searchParams.get('redirect');
  if (typeof asked === 'string' && /^\/(?!\/)/.test(asked)) return asked;
  return '/';
}

async function boot() {
  root = document.querySelector('#docsLogin');
  if (!root) return;

  links = {
    account: root.dataset.account || '/account',
    forgot: root.dataset.forgot || '/forgot-password',
  };

  // Somebody already signed in has no business on this form. The shell has
  // already asked /api/nav who is reading, so this is a second question rather
  // than a first one, and it is worth asking: arriving here signed in usually
  // means a stale tab.
  const session = await api('/api/auth/staff/session');
  if (session.ok && session.data?.user) {
    window.location.replace(destination());
    return;
  }

  drawPasswordStep();
}

function shell(title, body) {
  return (
    '<div class="page-header">' +
    `<h1>${escapeHtml(title)}</h1>` +
    '</div>' +
    '<section class="glass-card card stack">' +
    '<p class="callout danger" id="docsLoginError" role="alert" hidden></p>' +
    body +
    '</section>'
  );
}

/* ---- Step 1: username and password ------------------------------------ */

function drawPasswordStep() {
  root.innerHTML = shell(
    t('login.heading'),
    `<p>${escapeHtml(t('login.intro'))}</p>` +
      '<div class="field">' +
      `<label for="docsUsername">${escapeHtml(t('login.username'))}</label>` +
      '<input id="docsUsername" type="text" autocapitalize="none" spellcheck="false" ' +
      'autocomplete="username">' +
      '</div>' +
      '<div class="field">' +
      `<label for="docsPassword">${escapeHtml(t('login.password'))}</label>` +
      '<input id="docsPassword" type="password" autocomplete="current-password">' +
      '</div>' +
      '<label class="checkbox">' +
      '<input type="checkbox" id="docsStaySignedIn">' +
      `<span>${escapeHtml(t('login.staySignedIn'))}</span>` +
      '</label>' +
      '<button type="button" class="btn btn-primary" id="docsSignIn">' +
      `${escapeHtml(t('login.continue'))}</button>` +
      `<p class="muted"><a href="${escapeHtml(links.forgot)}">${escapeHtml(
        t('login.forgot')
      )}</a></p>`
  );

  const button = el('#docsSignIn');
  const runAction = makeRunAction(report);

  const submit = () =>
    runAction(async () => {
      showError('');
      staySignedIn = el('#docsStaySignedIn')?.checked === true;

      const result = await api('/api/auth/staff/login', {
        method: 'POST',
        locale: false,
        body: {
          username: el('#docsUsername')?.value ?? '',
          password: el('#docsPassword')?.value ?? '',
          stay_signed_in: staySignedIn,
        },
      });

      if (!result.ok) {
        showError(messageFor(result.error));
        return;
      }

      // 5a step 5: the password step must not issue a session. An account with
      // a second factor comes back with a challenge and nothing else.
      if (result.data.two_factor_required === true) {
        challenge = result.data.challenge;
        methods = result.data.methods ?? ['totp', 'backup_code'];
        drawSecondFactorStep();
        return;
      }

      window.location.assign(destination());
    }, 'docs sign in');

  button.addEventListener('click', submit);

  // Enter submits, which a form would have given for free and this does not:
  // the panel is built here rather than marked up, so there is no form element
  // and no default action to rely on.
  for (const id of ['#docsUsername', '#docsPassword']) {
    el(id)?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
  }
}

/* ---- Step 2: the second factor ---------------------------------------- */

function drawSecondFactorStep() {
  const passkey = methods.includes('passkey') && passkeysSupported();

  root.innerHTML = shell(
    t('login.secondFactorHeading'),
    `<p>${escapeHtml(t('login.secondFactorIntro'))}</p>` +
      (passkey
        ? '<button type="button" class="btn btn-primary" id="docsUsePasskey">' +
          `${escapeHtml(t('login.usePasskey'))}</button>` +
          `<p class="field-hint">${escapeHtml(t('login.orACode'))}</p>`
        : '') +
      '<div class="field">' +
      `<label for="docsCode">${escapeHtml(
        t(methods.includes('totp') ? 'login.codeOrBackup' : 'login.backupOnly')
      )}</label>` +
      '<input id="docsCode" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
      'autocapitalize="none" spellcheck="false">' +
      '</div>' +
      // 5d: offered here and never on the password panel, and with the line
      // 16b asks for underneath it.
      '<label class="checkbox">' +
      '<input type="checkbox" id="docsTrustDevice">' +
      `<span>${escapeHtml(t('login.trustDevice'))}</span>` +
      '</label>' +
      `<p class="field-hint">${escapeHtml(t('login.trustDeviceThisSite'))}</p>` +
      `<p class="field-hint">${escapeHtml(t('login.trustDeviceShared'))}</p>` +
      '<button type="button" class="btn btn-secondary" id="docsVerify">' +
      `${escapeHtml(t('login.verify'))}</button>`
  );

  const runAction = makeRunAction(report);
  const trusted = () => el('#docsTrustDevice')?.checked === true;

  const verify = el('#docsVerify');
  verify.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const result = await api('/api/auth/staff/verify-2fa', {
        method: 'POST',
        locale: false,
        body: {
          challenge,
          code: el('#docsCode')?.value ?? '',
          trust_device: trusted(),
          stay_signed_in: staySignedIn,
        },
      });

      if (!result.ok) {
        showError(messageFor(result.error));
        return;
      }

      window.location.assign(destination());
    }, 'docs second factor');
  });

  const button = el('#docsUsePasskey');
  if (!button) return;

  button.addEventListener('click', () => {
    runAction(async () => {
      showError('');

      const started = await api('/api/auth/staff/verify-2fa', {
        method: 'POST',
        locale: false,
        body: { challenge, action: 'options' },
      });

      if (!started.ok) {
        showError(messageFor(started.error));
        return;
      }

      let response;
      try {
        response = await usePasskey(started.data.options);
      } catch (error) {
        if (wasCancelled(error)) return;
        showError(t('security.passkeyFailed'));
        return;
      }

      // **This is 5e's pair being exercised.** The assertion was made against
      // DOCS_URL and is verified under the portal's relying party id, which is
      // the one thing about this site that part 2 could not prove on a laptop.
      const finished = await api('/api/auth/staff/verify-2fa', {
        method: 'POST',
        locale: false,
        body: {
          challenge,
          action: 'passkey',
          response,
          trust_device: trusted(),
          stay_signed_in: staySignedIn,
        },
      });

      if (!finished.ok) {
        showError(messageFor(finished.error));
        return;
      }

      window.location.assign(destination());
    }, 'docs passkey sign in');
  });
}

boot();
