// The chrome every page in the account area shares: the session guard, the
// sub-navigation, and the count on the tasks item.
//
// Written once because six pages otherwise each grow their own copy of "am I
// signed in, and where am I". The site header in shell.js is above this and
// knows nothing about it; this is the second level, and it only exists inside
// /account.
//
// Three rules it keeps:
//
//   **Signed out is a redirect, not a message.** Every page here is private, and
//   somebody who has been signed out by a session expiring wants to be back
//   where they were rather than told they cannot be. The ?redirect= is validated
//   by api/_lib/redirects.js on the way back in, so nothing here has to be
//   trusted.
//
//   **The badge counts both sources**, per 7g: open tasks plus unanswered apply
//   prompts. api/tasks/count.js is the one place that adds them up, so the badge
//   and the page can never disagree about what "3" meant.
//
//   **/account/security is in this navigation and is not rebuilt.** It exists,
//   it works, and it was built in phase 2. Linking to it is the whole of what
//   this phase owes it.

import { api, applicantSession } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import {
  loadBuildStatus,
  loadFeatureOverrides,
  featureNote,
  isFeatureOff,
} from './build-status.js';

// One entry per page, in the order somebody would use them: what have I done,
// what did I keep, what do you need from me, then the account itself.
const ACCOUNT_NAV = [
  { href: '/account', key: 'account.navOverview', icon: 'grid' },
  { href: '/account/applications', key: 'account.navApplications', icon: 'briefcase' },
  { href: '/account/saved', key: 'account.navSaved', icon: 'bookmark' },
  { href: '/account/tasks', key: 'account.navTasks', icon: 'bell', badge: true },
  { href: '/account/settings', key: 'account.navSettings', icon: 'user' },
  { href: '/account/security', key: 'account.navSecurity', icon: 'shield' },
];

let cachedCount = null;

/**
 * Guard the page, draw the account navigation, and hand back the session.
 *
 * @param {{ current: string }} options the path of the page being drawn, used
 *        for aria-current. Passed in rather than read from the address bar so a
 *        page is never wrong about which item is its own.
 * @returns {Promise<{ user: object }|null>} null when the page is being replaced
 *          by a redirect, in which case the caller should stop.
 */
export async function mountAccountPage(options) {
  const session = await applicantSession();

  if (!session?.user) {
    // replace rather than assign: somebody signed out who presses back should
    // not land on the page that just bounced them.
    window.location.replace(`/login?redirect=${encodeURIComponent(options.current)}`);
    return null;
  }

  renderAccountNav(options.current);
  renderAccountIdentity(session.user);

  document.querySelector('#accountLoading')?.remove();
  const page = document.querySelector('#accountPage');
  if (page) page.hidden = false;

  // 8.9's forced reset, and this one is awaited because it is not a note: an
  // account required to set a new password is shown a line it cannot miss and,
  // on any page except the one that fixes it, is sent there.
  requirePasswordChange(session.user, options.current);

  // Not awaited, for the same reason the badge is not: a feature being switched
  // off is a line at the top of the page, not something the page waits for.
  renderMaintenanceBanner();

  // Not awaited. The badge is one number on a navigation item and must never be
  // on the path that gets the page drawn.
  refreshTaskBadge();

  return session;
}

/* -------------------------------------------------------------------------
 * The forced password change, 8.9
 * ---------------------------------------------------------------------- */

/** Where somebody required to choose a new password is sent. */
const PASSWORD_PAGE = '/account/security';

/**
 * Insist on a new password when an admin has required one.
 *
 * 8.9 gives an admin two assisted actions for somebody locked out, and both set
 * this flag. What it buys is that the admin never has to know the password: the
 * account holder chooses it themselves at the next sign in, which is the whole
 * reason those two paths are the ones to prefer over setting one.
 *
 * **A redirect and a banner, not one or the other.** The redirect handles
 * somebody arriving anywhere in the account area; the banner handles the page
 * they land on, where a redirect would be a loop. Neither is a security
 * boundary and neither pretends to be: the session is real and the API still
 * answers, because locking an account out of its own data to insist it change a
 * password would be a worse outcome than the one being fixed.
 */
function requirePasswordChange(user, current) {
  if (user?.must_change_password !== true) return;

  if (current !== PASSWORD_PAGE) {
    window.location.replace(PASSWORD_PAGE);
    return;
  }

  document.querySelector('.account-password-required')?.remove();

  const bar = document.createElement('div');
  bar.className = 'callout warn account-password-required';
  bar.setAttribute('role', 'alert');
  bar.innerHTML =
    `<p><strong>${escapeHtml(t('account.passwordRequired'))}</strong></p>` +
    `<p>${escapeHtml(t('account.passwordRequiredBody'))}</p>`;

  document.querySelector('#accountPage')?.prepend(bar);
}

/* -------------------------------------------------------------------------
 * The maintenance banner
 * ---------------------------------------------------------------------- */

/**
 * A line at the top of the account area when something an applicant uses is
 * switched off, per 8.12's item 54.
 *
 * The staff dashboard has had one since phase 7 and this is its counterpart,
 * built after the phase 7 verification run found the gap it leaves. Without it
 * the failure is silent in the worst way: /account's tiles read their counts
 * from endpoints that answer 503 when the feature is off, and the tile
 * deliberately shows nothing rather than claiming zero, so Saved roles rendered
 * with a blank count line and no reason anywhere on the page.
 *
 * Three decisions in it:
 *
 *   **It names what is off**, rather than counting. The staff banner says "3
 *   features" because an admin is about to open the page that lists them; an
 *   applicant has no such page and a number tells them nothing. featureName
 *   already carries a reader-facing name for every key.
 *
 *   **It skips anything admin_*.** Whether the staff dashboard is available is
 *   not an applicant's business and is not something they could act on. The
 *   filter is on the key prefix rather than a second list, so a feature added
 *   to the map is covered by whichever side of it the name puts it.
 *
 *   **It shows the notes, and links to /status for the rest.** The note is the
 *   only part written by a person and is the only part that says anything
 *   specific, so a banner that withheld it would be telling somebody their
 *   saved roles are gone and declining to say why. They are capped short at the
 *   endpoint, so however many are off it stays a few lines. Identical notes are
 *   shown once: switching three things off during one incident is one sentence
 *   typed three times, not three sentences.
 */
async function renderMaintenanceBanner() {
  document.querySelector('.account-maintenance-banner')?.remove();

  const status = await loadBuildStatus();
  await loadFeatureOverrides();

  const off = Object.keys(status?.features ?? {})
    .filter((key) => !key.startsWith('admin_'))
    .filter((key) => isFeatureOff(key));

  if (off.length === 0) return;

  const names = off.map((key) => t(`featureName.${key}`));
  const notes = [...new Set(off.map((key) => featureNote(key)).filter(Boolean))];

  const bar = document.createElement('div');
  bar.className = 'callout warn account-maintenance-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML =
    `<p>${escapeHtml(t('account.maintenanceBanner', { features: names.join(', ') }))} ` +
    `<a href="/status">${escapeHtml(t('notice.link'))}</a></p>` +
    notes.map((note) => `<p class="feature-note">${escapeHtml(note)}</p>`).join('');

  document.querySelector('#accountPage')?.prepend(bar);

  // Redrawn rather than retranslated: the feature names and the note are
  // written here rather than carried on data-i18n attributes.
  document.addEventListener('gftv:localechange', () => renderMaintenanceBanner(), { once: true });
}

/* -------------------------------------------------------------------------
 * The navigation
 * ---------------------------------------------------------------------- */

function renderAccountNav(current) {
  const holder = document.querySelector('#accountNav');
  if (!holder) return;

  holder.innerHTML = ACCOUNT_NAV.map((item) => {
    const isCurrent = item.href === current;
    return (
      `<a href="${item.href}" class="account-nav-item"${isCurrent ? ' aria-current="page"' : ''}>` +
      `<span data-icon="${item.icon}" data-icon-size="18"></span>` +
      `<span data-i18n="${item.key}"></span>` +
      (item.badge ? '<span class="account-badge" id="accountTaskBadge" hidden></span>' : '') +
      `</a>`
    );
  }).join('');

  hydrateIcons(holder);
  translateWithin(holder);

  // The items carry data-i18n attributes that were not in the document when the
  // language was first applied. Later changes reach them through shell.js's own
  // retranslation pass, which walks the whole document.
  document.addEventListener('gftv:localechange', () => {
    translateWithin(holder);
    paintBadge(cachedCount);
  });
}

function translateWithin(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

/**
 * The name and picture at the top of every account page.
 *
 * The avatar is optional and always has been: gftvjobs_users.avatar_url is
 * nullable and most accounts will never set one. The fallback is the initial
 * rather than a stock silhouette, and the alt text is the display name, per
 * AVATARS.md, so the page reads correctly when the image does not load.
 */
export function renderAccountIdentity(user) {
  const name = document.querySelector('#accountName');
  if (name) name.textContent = user.display_name;

  const username = document.querySelector('#accountUsername');
  if (username) username.textContent = user.username;

  const avatar = document.querySelector('#accountAvatar');
  if (!avatar) return;

  avatar.replaceChildren(avatarNode(user));
}

/** One avatar, as an image or as an initial. Shared by the header and settings. */
export function avatarNode(user) {
  if (user.avatar_url) {
    const image = document.createElement('img');
    image.src = user.avatar_url;
    image.alt = user.display_name ?? '';
    image.width = 96;
    image.height = 96;
    image.className = 'avatar-image';
    // A broken image is a network problem, not a reason to show a broken icon
    // in the corner of somebody's own account page. Swap to the initial.
    image.addEventListener('error', () => image.replaceWith(initialNode(user)), { once: true });
    return image;
  }

  return initialNode(user);
}

function initialNode(user) {
  const span = document.createElement('span');
  span.className = 'avatar-initial';
  span.setAttribute('aria-hidden', 'true');
  // The first character of the display name, which is a grapheme rather than a
  // code unit: a name starting with an emoji or a surrogate pair would
  // otherwise render as half a character.
  span.textContent = [...String(user.display_name ?? '?')][0] ?? '?';
  return span;
}

/* -------------------------------------------------------------------------
 * The badge
 * ---------------------------------------------------------------------- */

/**
 * Fetch the open item count and paint it.
 *
 * Called on mount and again whenever something on a page changes it, so
 * answering a prompt or replying to a task drops the number without a reload.
 */
export async function refreshTaskBadge() {
  const result = await api('/api/tasks/count', { locale: false });
  cachedCount = result.ok ? (result.data?.total ?? 0) : null;
  paintBadge(cachedCount);
}

function paintBadge(count) {
  const badge = document.querySelector('#accountTaskBadge');
  if (!badge) return;

  // A failed count hides the badge rather than showing a zero. "0" is a claim
  // about the state of somebody's inbox and we do not have one to make.
  if (count === null || count === 0) {
    badge.hidden = true;
    badge.textContent = '';
    badge.removeAttribute('aria-label');
    return;
  }

  badge.hidden = false;
  badge.textContent = String(count);
  badge.setAttribute('aria-label', t('account.tasksBadgeLabel', { count }));
}

// Answering a prompt anywhere in the portal changes the count, and every account
// page carries this navigation, so the badge follows without each page
// remembering to ask.
document.addEventListener('gftv:applychange', () => refreshTaskBadge());
