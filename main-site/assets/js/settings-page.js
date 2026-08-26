// /account/settings, from 7g: "Profile fields, password change, Telegram
// linking, and a clearly separated danger zone at the bottom."
//
// **Password, passkeys, recovery codes, and trusted devices are not on this
// page.** They are on /account/security, which phase 2 built and which works,
// and this links to it instead of growing a second copy. Two pages that both
// change a password are two places for the rules about invalidating sessions to
// drift.
//
// What is here instead:
//
//   **The profile.** The endpoint asks for the current password when the
//   username or the email changes, because both are login identifiers, and does
//   not for the display name or the phone, because they are not. The page mirrors
//   that: the password field appears when one of the two identifiers has been
//   edited, so nobody is asked for a credential to fix a typo in their own name.
//
//   **The picture**, per AVATARS.md. Compressed in the browser, checked on the
//   server by its magic bytes, and stored under a random filename so caches
//   update by themselves.
//
//   **The reports they have filed**, per 7h, so telling us about a bad
//   translation is not shouting into a hole.
//
//   **The danger zone**, and its one action. 7g's three steps are enforced here
//   and again on the server, which is where they count: reaching step three in a
//   browser proves nothing, and api/account/danger/delete.js re-checks the typed
//   username and verifies the password itself.

import { api, applicantSession } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { formatDate } from './format.js';
import { mountAccountPage, renderAccountIdentity, avatarNode } from './account-shell.js';
import { escapeHtml } from './account-row.js';
import { confirmDangerousAction } from './danger-confirm.js';
import { toAvatarWebp, canEncodeWebp, AvatarError } from './avatar.js';
import { wipeAll } from './idb.js';
import {
  clearErrors,
  applyApiError,
  showFormMessage,
  setWorking,
  readForm,
  wirePasswordToggles,
} from './forms.js';

const PATH = '/account/settings';

let user = null;

async function boot() {
  wirePasswordToggles(document);

  const session = await mountAccountPage({ current: PATH });
  if (!session) return;

  user = session.user;

  fillProfile();
  wireProfileForm();
  wireAvatar();
  wireDangerZone();
  loadReports();

  // The report list writes its own strings and does not carry data-i18n
  // attributes, because each line depends on the report's state.
  document.addEventListener('gftv:localechange', () => loadReports());
}

/* -------------------------------------------------------------------------
 * Profile
 * ---------------------------------------------------------------------- */

function fillProfile() {
  const form = document.querySelector('#profileForm');
  if (!form) return;

  form.elements.display_name.value = user.display_name ?? '';
  form.elements.username.value = user.username ?? '';
  form.elements.email.value = user.email ?? '';
  form.elements.phone.value = user.phone ?? '';

  syncPasswordField(form);
}

/**
 * Show the password field only once an identifier has actually been edited.
 *
 * Bound to input on the two fields instead of checked at submit, so the reason
 * for the field appearing is visible while it happens and does not arrive as a
 * validation error after the button is pressed.
 */
function syncPasswordField(form) {
  const changing =
    form.elements.username.value !== (user.username ?? '') ||
    form.elements.email.value !== (user.email ?? '');

  const field = document.querySelector('#profilePasswordField');
  if (field) field.hidden = !changing;
}

function wireProfileForm() {
  const form = document.querySelector('#profileForm');
  if (!form) return;

  ['username', 'email'].forEach((name) => {
    form.elements[name].addEventListener('input', () => syncPasswordField(form));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    setWorking(form, true);

    const values = readForm(form);

    // Only what changed. The endpoint refuses a body with nothing in it, which
    // is the right answer to pressing Save having edited nothing.
    const body = {};
    for (const field of ['display_name', 'username', 'email', 'phone']) {
      const current = user[field] ?? '';
      if ((values[field] ?? '') !== current) body[field] = values[field];
    }

    if (Object.keys(body).length === 0) {
      setWorking(form, false);
      showFormMessage(form, 'note', t('settings.nothingChanged'));
      return;
    }

    if (body.username !== undefined || body.email !== undefined) {
      body.current_password = values.current_password ?? '';
    }

    const result = await api('/api/auth/applicant/profile', { method: 'PATCH', body });
    setWorking(form, false);

    if (!result.ok) {
      applyApiError(form, result.error, {
        conflict: t('settings.detailsTaken'),
        unauthorised: t('settings.passwordWrong'),
      });
      return;
    }

    user = result.data.user;
    fillProfile();
    renderAccountIdentity(user);
    showFormMessage(form, 'ok', t('settings.profileSaved'));

    // The password field goes back to hidden and empty. It was needed for one
    // change and holding it on screen invites typing it again.
    const password = document.querySelector('#profilePassword');
    if (password) password.value = '';
  });
}

/* -------------------------------------------------------------------------
 * The picture
 * ---------------------------------------------------------------------- */

function wireAvatar() {
  const preview = document.querySelector('#avatarPreview');
  const input = document.querySelector('#avatarInput');
  const choose = document.querySelector('#avatarChoose');
  const remove = document.querySelector('#avatarRemove');

  if (!preview || !input || !choose) return;

  paintAvatar();

  if (!canEncodeWebp()) {
    // Section 0c's pattern, applied to a capability and not to a phase: the
    // control stays visible and says why it cannot work, because hiding it
    // teaches people the feature does not exist.
    choose.disabled = true;
    choose.setAttribute('aria-disabled', 'true');
    showAvatarError(t('settings.pictureUnsupported'));
    return;
  }

  choose.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    // Cleared immediately so choosing the same file twice fires change again,
    // which it otherwise would not.
    input.value = '';
    if (file) await upload(file);
  });

  remove?.addEventListener('click', () => removeAvatar());
}

function paintAvatar() {
  const preview = document.querySelector('#avatarPreview');
  if (preview) preview.replaceChildren(avatarNode(user));

  const remove = document.querySelector('#avatarRemove');
  if (remove) remove.hidden = !user.avatar_url;
}

async function upload(file) {
  showAvatarError(null);
  showAvatarMessage(null);

  const choose = document.querySelector('#avatarChoose');
  if (choose) choose.disabled = true;

  let blob;
  try {
    blob = await toAvatarWebp(file);
  } catch (cause) {
    if (choose) choose.disabled = false;
    const code = cause instanceof AvatarError ? cause.code : 'unreadable';
    showAvatarError(t(`settings.pictureError_${code}`));
    return;
  }

  // Not through api(), which sends JSON. This is a raw image body, which is
  // what api/account/avatar.js reads and why it does not use readJson.
  let response;
  try {
    response = await fetch('/api/account/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'image/webp', Accept: 'application/json' },
      body: blob,
    });
  } catch {
    if (choose) choose.disabled = false;
    showAvatarError(t('error.network'));
    return;
  }

  if (choose) choose.disabled = false;

  const payload = await response.json().catch(() => null);

  if (!payload?.ok) {
    showAvatarError(payload?.error?.message ?? t('error.unexpected'));
    return;
  }

  user = payload.data.user;
  paintAvatar();
  renderAccountIdentity(user);
  showAvatarMessage(t('settings.pictureSaved'));
}

async function removeAvatar() {
  showAvatarError(null);
  showAvatarMessage(null);

  const result = await api('/api/account/avatar', { method: 'DELETE', locale: false });

  if (!result.ok) {
    showAvatarError(result.error?.message ?? t('error.unexpected'));
    return;
  }

  user = result.data.user;
  paintAvatar();
  renderAccountIdentity(user);
  showAvatarMessage(t('settings.pictureRemoved'));
}

function showAvatarError(message) {
  const holder = document.querySelector('#avatarError');
  if (!holder) return;
  holder.textContent = message ?? '';
  holder.hidden = !message;
}

function showAvatarMessage(message) {
  const holder = document.querySelector('#avatarMessage');
  if (!holder) return;
  holder.textContent = message ?? '';
  holder.hidden = !message;
}

/* -------------------------------------------------------------------------
 * Translation reports, 7h
 * ---------------------------------------------------------------------- */

async function loadReports() {
  const section = document.querySelector('#reportsSection');
  const list = document.querySelector('#reportList');
  if (!section || !list) return;

  const result = await api('/api/translations/mine');
  if (!result.ok) return;

  const reports = result.data?.reports ?? [];

  // Hidden entirely for somebody who has never reported anything. An empty
  // panel explaining a feature they have not used is clutter on a page that is
  // already long.
  section.hidden = reports.length === 0;
  if (reports.length === 0) return;

  list.innerHTML = reports.map(reportMarkup).join('');
  hydrateIcons(list);
}

function reportMarkup(report) {
  return `
    <li class="report-item">
      <div class="report-item-head">
        <span class="status-pill status-${escapeHtml(report.status)}">
          ${escapeHtml(t(`report.status_${report.status}`))}
        </span>
        <span class="muted">${escapeHtml(
          t('report.filedOn', { date: formatDate(report.created_at) })
        )}</span>
      </div>
      <p class="report-item-target">${escapeHtml(reportTargetLine(report))}</p>
      <p class="report-item-note">${escapeHtml(report.note)}</p>
      ${
        report.resolution_note
          ? `<p class="report-item-resolution">${escapeHtml(
              t('report.resolutionLabel')
            )} ${escapeHtml(report.resolution_note)}</p>`
          : ''
      }
    </li>`;
}

/** What the report was about, in one line. */
function reportTargetLine(report) {
  const language = t(`language.name_${report.locale}`);

  if (report.target_type === 'job' && report.job) {
    return t('report.aboutPosting', { title: report.job.title, language });
  }
  if (report.target_type === 'interface') {
    return t('report.aboutInterface', { key: report.target_key ?? '', language });
  }
  return t('report.aboutOther', { language });
}

/* -------------------------------------------------------------------------
 * The danger zone
 * ---------------------------------------------------------------------- */

function wireDangerZone() {
  const button = document.querySelector('#deleteAccount');
  if (!button) return;

  button.addEventListener('click', async () => {
    // 7g's three steps, in order, with no way to skip ahead. The component is
    // the one phase 2 wrote for removing a passkey, which is what next-steps.md
    // asked this phase to use in place of writing a second one.
    const confirmed = await confirmDangerousAction({
      title: t('settings.deleteTitle'),
      consequences: [
        t('settings.deleteConsequence1'),
        t('settings.deleteConsequence2'),
        t('settings.deleteConsequence3'),
        t('settings.deleteConsequence4'),
      ],
      // 7g step 1, named explicitly: say plainly that Google Form responses
      // already submitted are held by Google and are not deleted by this.
      irreversible: t('settings.deleteForms'),
      confirmLabel: t('settings.deleteAction'),
      username: user.username,
    });

    if (!confirmed) return;

    const result = await api('/api/account/danger/delete', {
      method: 'POST',
      locale: false,
      body: {
        confirm_username: user.username,
        password: confirmed.password,
      },
    });

    if (!result.ok) {
      const holder = document.querySelector('#dangerError');
      if (holder) {
        holder.textContent = result.error?.message ?? t('error.unexpected');
        holder.hidden = false;
      }
      return;
    }

    // The account is gone from the server. Its offline copy has to go with it,
    // and this is the one path that does not end in a reload, so nothing else
    // would ever clear it: the deleted screen replaces the page in place,
    // deliberately, so that nobody is bounced to a signed out home page.
    await wipeAll();

    showDeletedScreen();
  });
}

/**
 * 7g: "Show a final confirmation screen after the fact, not just a redirect to
 * the home page."
 *
 * The page is replaced, not navigated away from, because a navigation
 * here would land on a page that has to work out for itself that somebody was
 * just deleted, and would flash the signed out home page on the way.
 */
function showDeletedScreen() {
  document.querySelector('#accountPage')?.remove();

  const screen = document.querySelector('#deletedScreen');
  if (screen) {
    screen.hidden = false;
    screen.querySelector('h1')?.focus();
    screen.scrollIntoView({ block: 'start' });
  }

  // The session this page cached is about an account that no longer exists.
  // Refreshed so the header stops offering the account menu.
  applicantSession({ refresh: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
