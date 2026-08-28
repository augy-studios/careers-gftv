// /account/security. The account page phase 2 owns.
//
// Phase 6 owns account settings as a whole: the profile, the dashboard pages,
// and the danger zone. This page is deliberately narrower and exists now
// because 5c and 5d both require an interface in the phase that builds them:
//
//   5c "Account settings shows how many codes remain in each set, with a
//      warning below three and a prompt to regenerate."
//   5d "Account settings lists trusted devices with when each was added and
//      last used, a revoke button per device, and a revoke all."
//
// Also here, and disabled through the section 0c pattern, not hidden:
// the Telegram two factor toggle. Its delivery half cannot work until the bot
// ships in phase 11, so the control says that on itself instead of pretending.

import { api, applicantSession } from './api.js';
import { generateAndShow } from './recovery-codes.js';
import {
  clearErrors,
  applyApiError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
} from './forms.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { passkeysSupported, createPasskey, wasCancelled } from './passkeys.js';
import { confirmDangerousAction } from './danger-confirm.js';

let user = null;

// How many passkeys the account has, as of the last load. Only used to tell a
// first passkey from a second one, which is the difference between "signing in
// changes today" and "you already knew that".
let passkeyCount = 0;

async function boot() {
  const page = document.querySelector('#securityPage');
  if (!page) return;

  wirePasswordToggles(document);

  const session = await applicantSession();

  if (!session?.user) {
    // Not signed in. Send them to sign in and come straight back, which is what
    // the redirect allowlist in api/_lib/redirects.js exists for.
    window.location.replace('/login?redirect=%2Faccount%2Fsecurity');
    return;
  }

  user = session.user;
  page.hidden = false;
  document.querySelector('#loadingSecurity')?.remove();

  document.querySelector('#accountName').textContent = user.display_name;
  document.querySelector('#accountUsername').textContent = user.username;

  renderCodeCounts(session.codes ?? { recovery: 0, backup: 0 }, session.low_code_threshold ?? 3);
  wireCodeForms();
  wirePasswordForm();
  await loadPasskeys();
  wirePasskeyButton();
  await loadDevices();
  wireDeviceButtons();

  // Somebody sent here by the sign in page because they have no codes left
  // gets the reason on screen instead of an unexplained warning badge.
  if (new URL(window.location.href).searchParams.get('codes') === 'none') {
    const banner = document.querySelector('#noCodesBanner');
    if (banner) banner.hidden = false;
    document.querySelector('#recoveryCodesSection')?.scrollIntoView({ block: 'start' });
  }
}

/* -------------------------------------------------------------------------
 * Recovery codes
 * ---------------------------------------------------------------------- */

function renderCodeCounts(counts, threshold) {
  setCount('recovery', counts.recovery ?? 0, threshold);
  setCount('backup', counts.backup ?? 0, threshold);
}

function setCount(set, remaining, threshold) {
  const holder = document.querySelector(`[data-count-for="${set}"]`);
  if (!holder) return;

  holder.textContent = t('codes.remaining', { count: remaining });
  holder.setAttribute('data-low', String(remaining < threshold));

  const warning = document.querySelector(`[data-warning-for="${set}"]`);
  if (!warning) return;

  if (remaining === 0) {
    warning.textContent = t(set === 'backup' ? 'codes.noneLeftBackup' : 'codes.noneLeftRecovery');
    warning.hidden = false;
  } else if (remaining < threshold) {
    warning.textContent = t('codes.runningLow', { count: remaining });
    warning.hidden = false;
  } else {
    warning.hidden = true;
  }
}

function wireCodeForms() {
  document.querySelectorAll('[data-generate-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(form);

      const set = form.getAttribute('data-generate-form');
      const values = readForm(form);

      if (!values.current_password) {
        showFormMessage(form, 'danger', t('auth.passwordRequired'));
        return;
      }

      setWorking(form, true);
      const result = await generateAndShow(set, values.current_password);
      setWorking(form, false);

      if (!result.ok) {
        applyApiError(form, result.error);
        return;
      }

      form.reset();
      const refreshed = await api('/api/auth/applicant/recovery-codes', { locale: false });
      if (refreshed.ok) {
        renderCodeCounts(refreshed.data.codes, refreshed.data.low_code_threshold);
      }
      showFormMessage(form, 'ok', t('codes.regenerated'));
      document.querySelector('#noCodesBanner')?.setAttribute('hidden', '');
    });
  });
}

/* -------------------------------------------------------------------------
 * Password
 * ---------------------------------------------------------------------- */

function wirePasswordForm() {
  const form = document.querySelector('#changePasswordForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const values = readForm(form);
    setWorking(form, true);

    const result = await api('/api/auth/applicant/change-password', {
      method: 'POST',
      locale: false,
      body: {
        current_password: values.current_password,
        new_password: values.new_password,
        new_password_confirm: values.new_password_confirm,
      },
    });

    setWorking(form, false);

    if (!result.ok) {
      applyApiError(form, result.error);
      return;
    }

    form.reset();
    // 5d: changing the password revokes every trusted device. The list on this
    // page has to reflect that immediately, not after a reload.
    showFormMessage(form, 'ok', t('auth.passwordChanged'));
    await loadDevices();
  });
}

/**
 * The password typed into a section, or null.
 *
 * Adding or removing a passkey and revoking a device all changed the second
 * factor, and the endpoints now ask for the password to prove the session is
 * being used by the person who owns it and not by whoever found the
 * laptop. Read at the moment of the action and never stored.
 */
function passwordFrom(id) {
  const input = document.querySelector(id);
  const value = input?.value ?? '';
  return value === '' ? null : value;
}

/** Clear the field once the action it authorised has succeeded. */
function clearPassword(id) {
  const input = document.querySelector(id);
  if (input) input.value = '';
}

/* -------------------------------------------------------------------------
 * Passkeys
 *
 * The second factor that works today. A passkey is registered in two requests,
 * because WebAuthn is a challenge and a response: the server issues one, the
 * authenticator signs it, and the server checks the signature against a
 * challenge it knows it issued.
 * ---------------------------------------------------------------------- */

async function loadPasskeys() {
  const list = document.querySelector('#passkeyList');
  const empty = document.querySelector('#passkeyEmpty');
  const add = document.querySelector('#addPasskey');
  if (!list) return;

  // A browser that cannot do this is told so, and the button goes instead of
  // sitting there failing. That is a genuine incapability, not an
  // unshipped phase, so it is not the section 0c disabled pattern.
  if (!passkeysSupported()) {
    document.querySelector('#passkeyUnsupported')?.removeAttribute('hidden');
    if (add) add.hidden = true;
  }

  const result = await api('/api/auth/applicant/passkeys', { locale: false });
  if (!result.ok) {
    if (empty) {
      empty.textContent = result.error.message;
      empty.hidden = false;
    }
    return;
  }

  const passkeys = result.data.passkeys ?? [];
  passkeyCount = passkeys.length;

  if (passkeys.length === 0) {
    list.replaceChildren();
    if (empty) {
      empty.textContent = t('security.passkeyNone');
      empty.hidden = false;
    }
    // Removing the last one puts the account back where it started, so the
    // first passkey warning is no longer describing anything true.
    document.querySelector('#passkeyFirstWarning')?.setAttribute('hidden', '');
    return;
  }

  if (empty) empty.hidden = true;

  list.replaceChildren(
    ...passkeys.map((passkey) => {
      const item = document.createElement('li');
      item.className = 'device-row';
      item.innerHTML = `
        <div class="device-detail">
          <span class="device-label">${escapeHtml(passkey.label ?? t('security.passkeyUnnamed'))}</span>
          <span class="device-meta muted">${escapeHtml(passkeyMeta(passkey))}</span>
        </div>
        <button type="button" class="btn btn-quiet" data-remove-passkey="${escapeAttr(passkey.id)}">
          <span data-icon="close" data-icon-size="16"></span>
          <span>${escapeHtml(t('security.passkeyRemove'))}</span>
        </button>
      `;
      return item;
    })
  );

  hydrateIcons(list);

  list.querySelectorAll('[data-remove-passkey]').forEach((button) => {
    button.addEventListener('click', async () => {
      showPasskeyError(null);

      // Removing a passkey turns part of the second factor off, and 7g already
      // treats disabling 2FA as a danger zone action. Same three steps, same
      // component the account deletion in phase 6 will use.
      const confirmed = await confirmDangerousAction({
        title: t('danger.removePasskeyTitle'),
        consequences: [
          t('danger.removePasskeyConsequence1'),
          t('danger.removePasskeyConsequence2'),
          t('danger.removePasskeyConsequence3'),
        ],
        irreversible: t('danger.removePasskeyIrreversible'),
        confirmLabel: t('danger.removePasskeyConfirm'),
        username: user.username,
      });

      if (!confirmed) return;

      button.disabled = true;
      const id = button.getAttribute('data-remove-passkey');
      const removed = await api('/api/auth/applicant/passkeys', {
        method: 'POST',
        locale: false,
        body: { action: 'remove', id, current_password: confirmed.password },
      });
      if (!removed.ok) {
        button.disabled = false;
        showPasskeyError(removed.error.message);
        return;
      }
      // Removing the last one turns the second factor off, which changes how
      // signing in works. Say so here and do not leave it to be discovered at
      // the next sign in.
      if (removed.data.second_factor_off) showPasskeyError(t('security.passkeyLastRemoved'));
      await loadPasskeys();
    });
  });
}

function passkeyMeta(passkey) {
  const parts = [];
  parts.push(
    passkey.backed_up ? t('security.passkeySynced') : t('security.passkeyThisDevice')
  );
  if (passkey.last_used_at) {
    parts.push(t('devices.lastUsed', { date: formatDate(passkey.last_used_at) }));
  } else if (passkey.created_at) {
    parts.push(t('security.passkeyAdded', { date: formatDate(passkey.created_at) }));
  }
  return parts.join('. ');
}

function wirePasskeyButton() {
  const add = document.querySelector('#addPasskey');
  if (!add || !passkeysSupported()) return;

  add.addEventListener('click', async () => {
    showPasskeyError(null);

    const password = passwordFrom('#passkeyPassword');
    if (!password) {
      showPasskeyError(t('auth.passwordRequired'));
      document.querySelector('#passkeyPassword')?.focus();
      return;
    }

    // Read before the two requests, because loadPasskeys() at the end of them
    // has already moved the count on by one.
    const isFirstPasskey = passkeyCount === 0;

    add.disabled = true;

    try {
      const started = await api('/api/auth/applicant/passkeys', {
        method: 'POST',
        locale: false,
        body: { action: 'start', current_password: password },
      });

      if (!started.ok) {
        showPasskeyError(started.error.message);
        return;
      }

      const credential = await createPasskey(started.data.options);

      const finished = await api('/api/auth/applicant/passkeys', {
        method: 'POST',
        locale: false,
        body: { action: 'finish', response: credential },
      });

      if (!finished.ok) {
        showPasskeyError(finished.error.message);
        return;
      }

      clearPassword('#passkeyPassword');
      await loadPasskeys();

      // The first passkey is the one that changes how every other device
      // behaves: from now on the second step is on this device, and anywhere
      // else needs a backup code or a passkey of its own. Said here, in red,
      // instead of being found out at the next sign in on a different machine.
      if (isFirstPasskey) {
        document.querySelector('#passkeyFirstWarning')?.removeAttribute('hidden');
      }

      // A passkey with no backup code behind it is one lost phone away from a
      // locked account, so this is the moment to say so.
      if ((finished.data.codes?.backup ?? 0) === 0) {
        showPasskeyError(t('security.passkeyNeedsBackupCodes'));
      }
    } catch (cause) {
      // Closing the system prompt is not a failure and is not reported as one.
      if (!wasCancelled(cause)) {
        console.warn('[careers-gftv] passkey registration:', cause);
        showPasskeyError(t('security.passkeyFailed'));
      }
    } finally {
      add.disabled = false;
    }
  });
}

function showPasskeyError(message) {
  const holder = document.querySelector('#passkeyError');
  if (!holder) return;
  if (!message) {
    holder.hidden = true;
    holder.textContent = '';
    return;
  }
  holder.textContent = message;
  holder.hidden = false;
}

/* -------------------------------------------------------------------------
 * Trusted devices
 * ---------------------------------------------------------------------- */

async function loadDevices() {
  const list = document.querySelector('#deviceList');
  const empty = document.querySelector('#deviceEmpty');
  if (!list) return;

  const result = await api('/api/auth/applicant/trusted-devices', { locale: false });

  if (!result.ok) {
    list.replaceChildren();
    if (empty) {
      empty.textContent = result.error.message;
      empty.hidden = false;
    }
    return;
  }

  const devices = result.data.devices ?? [];
  list.removeAttribute('aria-busy');

  if (devices.length === 0) {
    list.replaceChildren();
    if (empty) {
      empty.textContent = t('devices.none');
      empty.hidden = false;
    }
    document.querySelector('#revokeAllDevices')?.setAttribute('hidden', '');
    return;
  }

  if (empty) empty.hidden = true;
  document.querySelector('#revokeAllDevices')?.removeAttribute('hidden');

  list.replaceChildren(
    ...devices.map((device) => {
      const item = document.createElement('li');
      item.className = 'device-row';
      item.innerHTML = `
        <div class="device-detail">
          <span class="device-label">${escapeHtml(device.label ?? t('devices.unnamed'))}</span>
          <span class="device-meta muted">${escapeHtml(deviceMeta(device))}</span>
        </div>
        <button type="button" class="btn btn-quiet" data-revoke="${escapeAttr(device.id)}">
          <span data-icon="close" data-icon-size="16"></span>
          <span>${escapeHtml(t('devices.revoke'))}</span>
        </button>
      `;
      return item;
    })
  );

  hydrateIcons(list);

  list.querySelectorAll('[data-revoke]').forEach((button) => {
    button.addEventListener('click', async () => {
      const password = passwordFrom('#devicePassword');
      if (!password) {
        showDeviceError(t('auth.passwordRequired'));
        document.querySelector('#devicePassword')?.focus();
        return;
      }

      showDeviceError(null);
      button.disabled = true;
      const id = button.getAttribute('data-revoke');
      const result = await api('/api/auth/applicant/trusted-devices', {
        method: 'POST',
        locale: false,
        body: { action: 'revoke', id, current_password: password },
      });
      if (!result.ok) {
        button.disabled = false;
        showDeviceError(result.error.message);
        return;
      }
      clearPassword('#devicePassword');
      await loadDevices();
    });
  });
}

function deviceMeta(device) {
  const parts = [];
  if (device.last_used_at) {
    parts.push(t('devices.lastUsed', { date: formatDate(device.last_used_at) }));
  }
  if (device.expires_at) {
    parts.push(t('devices.expires', { date: formatDate(device.expires_at) }));
  }
  return parts.join('. ');
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return String(value).slice(0, 10);
  }
}

function wireDeviceButtons() {
  const all = document.querySelector('#revokeAllDevices');
  all?.addEventListener('click', async () => {
    const password = passwordFrom('#devicePassword');
    if (!password) {
      showDeviceError(t('auth.passwordRequired'));
      document.querySelector('#devicePassword')?.focus();
      return;
    }

    showDeviceError(null);
    all.disabled = true;
    const result = await api('/api/auth/applicant/trusted-devices', {
      method: 'POST',
      locale: false,
      body: { action: 'revoke_all', current_password: password },
    });
    all.disabled = false;
    if (!result.ok) {
      showDeviceError(result.error.message);
      return;
    }
    clearPassword('#devicePassword');
    await loadDevices();
  });

function showDeviceError(message) {
  const holder = document.querySelector('#deviceError');
  if (!holder) return;
  if (!message) {
    holder.hidden = true;
    holder.textContent = '';
    return;
  }
  holder.textContent = message;
  holder.hidden = false;
}
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
