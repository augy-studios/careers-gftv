// /admin/security. The staff equivalent of /account/security, and deliberately
// much narrower.
//
// Section 2 forbids writing to gftvhello_users, so the password, the
// authenticator app, and the backup codes that go with them are not ours to
// change. They belong to gftv.asia and the page says so rather than showing
// controls that could not work.
//
// What is left is what this portal actually owns: passkeys, in
// gftvjobs_staff_passkeys, and trusted devices. It exists now rather than in
// phase 7 because a staff member who can sign in with a passkey but has
// nowhere to register one has a feature only a developer can operate.
//
// Phase 7 should absorb this into the dashboard shell rather than building a
// second copy of it.

import { api, staffSession } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { passkeysSupported, createPasskey, wasCancelled } from './passkeys.js';
import { confirmDangerousAction } from './danger-confirm.js';

// The signed in staff account, for the typed confirmation step in 7g.
let staffUser = null;

async function boot() {
  const page = document.querySelector('#staffSecurityPage');
  if (!page) return;

  const session = await staffSession();

  if (!session?.user) {
    window.location.replace('/admin/login');
    return;
  }

  staffUser = session.user;
  page.hidden = false;
  document.querySelector('#loadingStaffSecurity')?.remove();
  document.querySelector('#staffName').textContent = session.user.username;

  await loadPasskeys();
  wireAddPasskey();
  await loadDevices();

  document.querySelector('#staffRevokeAll')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const password = passwordFrom('#staffDevicePassword');
    if (!password) {
      showDeviceError(t('auth.passwordRequired'));
      document.querySelector('#staffDevicePassword')?.focus();
      return;
    }

    showDeviceError(null);
    button.disabled = true;
    const result = await api('/api/auth/staff/trusted-devices?all=true', {
      method: 'DELETE',
      locale: false,
      body: { current_password: password },
    });
    button.disabled = false;
    if (!result.ok) {
      showDeviceError(result.error.message);
      return;
    }
    clearPassword('#staffDevicePassword');
    await loadDevices();
  });
}

/**
 * The password typed into a section, or null. Read at the moment of the action
 * and never stored. The endpoints ask for it because a session on its own must
 * not be enough to change what it takes to get a session.
 */
function passwordFrom(id) {
  const value = document.querySelector(id)?.value ?? '';
  return value === '' ? null : value;
}

function clearPassword(id) {
  const input = document.querySelector(id);
  if (input) input.value = '';
}

/* -------------------------------------------------------------------------
 * Passkeys
 * ---------------------------------------------------------------------- */

async function loadPasskeys() {
  const list = document.querySelector('#staffPasskeyList');
  const empty = document.querySelector('#staffPasskeyEmpty');
  const add = document.querySelector('#staffAddPasskey');
  if (!list) return;

  if (!passkeysSupported()) {
    document.querySelector('#staffPasskeyUnsupported')?.removeAttribute('hidden');
    if (add) add.hidden = true;
  }

  const result = await api('/api/auth/staff/passkeys', { locale: false });
  list.removeAttribute('aria-busy');

  if (!result.ok) {
    if (empty) {
      empty.textContent = result.error.message;
      empty.hidden = false;
    }
    return;
  }

  const passkeys = result.data.passkeys ?? [];

  if (passkeys.length === 0) {
    list.replaceChildren();
    if (empty) {
      // Worded from what the account still has. Somebody with an authenticator
      // app is not being told they have no second factor.
      empty.textContent = result.data.totp_enabled
        ? t('staffSecurity.passkeyNoneWithTotp')
        : t('staffSecurity.passkeyNoneNoTotp');
      empty.hidden = false;
    }
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
      showError(null);

      const confirmed = await confirmDangerousAction({
        title: t('danger.removePasskeyTitle'),
        consequences: [
          t('danger.removePasskeyConsequence1'),
          t('danger.removePasskeyConsequence2'),
          t('danger.removePasskeyConsequence3'),
        ],
        irreversible: t('danger.removePasskeyIrreversible'),
        confirmLabel: t('danger.removePasskeyConfirm'),
        username: staffUser.username,
      });

      if (!confirmed) return;

      button.disabled = true;
      const id = button.getAttribute('data-remove-passkey');
      const removed = await api(`/api/auth/staff/passkeys?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        locale: false,
        body: { current_password: confirmed.password },
      });
      if (!removed.ok) {
        button.disabled = false;
        showError(removed.error.message);
        return;
      }
      // Only said when it is true. An account that still has its authenticator
      // app has not lost its second factor by removing a passkey.
      if (removed.data.second_factor_off) showError(t('staffSecurity.lastFactorRemoved'));
      await loadPasskeys();
    });
  });
}

function passkeyMeta(passkey) {
  const parts = [
    passkey.backed_up ? t('security.passkeySynced') : t('security.passkeyThisDevice'),
  ];
  if (passkey.last_used_at) {
    parts.push(t('devices.lastUsed', { date: formatDate(passkey.last_used_at) }));
  } else if (passkey.created_at) {
    parts.push(t('security.passkeyAdded', { date: formatDate(passkey.created_at) }));
  }
  return parts.join('. ');
}

function wireAddPasskey() {
  const add = document.querySelector('#staffAddPasskey');
  if (!add || !passkeysSupported()) return;

  add.addEventListener('click', async () => {
    showError(null);

    const password = passwordFrom('#staffPasskeyPassword');
    if (!password) {
      showError(t('auth.passwordRequired'));
      document.querySelector('#staffPasskeyPassword')?.focus();
      return;
    }

    add.disabled = true;

    try {
      const started = await api('/api/auth/staff/passkeys', {
        method: 'POST',
        locale: false,
        body: { action: 'start', current_password: password },
      });

      if (!started.ok) {
        showError(started.error.message);
        return;
      }

      const credential = await createPasskey(started.data.options);

      const finished = await api('/api/auth/staff/passkeys', {
        method: 'POST',
        locale: false,
        body: { action: 'finish', response: credential },
      });

      if (!finished.ok) {
        showError(finished.error.message);
        return;
      }

      clearPassword('#staffPasskeyPassword');
      await loadPasskeys();
    } catch (cause) {
      if (!wasCancelled(cause)) {
        console.warn('[careers-gftv] staff passkey registration:', cause);
        showError(t('security.passkeyFailed'));
      }
    } finally {
      add.disabled = false;
    }
  });
}

/* -------------------------------------------------------------------------
 * Trusted devices
 * ---------------------------------------------------------------------- */

async function loadDevices() {
  const list = document.querySelector('#staffDeviceList');
  const empty = document.querySelector('#staffDeviceEmpty');
  const revokeAll = document.querySelector('#staffRevokeAll');
  if (!list) return;

  const result = await api('/api/auth/staff/trusted-devices', { locale: false });
  list.removeAttribute('aria-busy');

  if (!result.ok) {
    if (empty) {
      empty.textContent = result.error.message;
      empty.hidden = false;
    }
    return;
  }

  const devices = result.data.devices ?? [];

  if (devices.length === 0) {
    list.replaceChildren();
    if (empty) {
      empty.textContent = t('devices.none');
      empty.hidden = false;
    }
    revokeAll?.setAttribute('hidden', '');
    return;
  }

  if (empty) empty.hidden = true;
  revokeAll?.removeAttribute('hidden');

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
      const password = passwordFrom('#staffDevicePassword');
      if (!password) {
        showDeviceError(t('auth.passwordRequired'));
        document.querySelector('#staffDevicePassword')?.focus();
        return;
      }

      showDeviceError(null);
      button.disabled = true;
      const id = button.getAttribute('data-revoke');
      const result = await api(
        `/api/auth/staff/trusted-devices?id=${encodeURIComponent(id)}`,
        { method: 'DELETE', locale: false, body: { current_password: password } }
      );
      if (!result.ok) {
        button.disabled = false;
        showDeviceError(result.error.message);
        return;
      }
      clearPassword('#staffDevicePassword');
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

function showDeviceError(message) {
  const holder = document.querySelector('#staffDeviceError');
  if (!holder) return;
  if (!message) {
    holder.hidden = true;
    holder.textContent = '';
    return;
  }
  holder.textContent = message;
  holder.hidden = false;
}

function showError(message) {
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
