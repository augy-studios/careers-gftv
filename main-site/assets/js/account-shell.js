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

  // Not awaited. The badge is one number on a navigation item and must never be
  // on the path that gets the page drawn.
  refreshTaskBadge();

  return session;
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
