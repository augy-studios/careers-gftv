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
//   where they were instead of told they cannot be. The ?redirect= is validated
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

import { api, applicantSession, noteHelperSession } from './api.js';
import { t } from './i18n.js';
import { formatDateTime } from './format.js';
import { putMine, readMine, storedUserId } from './idb.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import { makeRunAction } from './run-action.js';
import {
  loadBuildStatus,
  loadFeatureOverrides,
  featureNote,
  isFeatureOff,
} from './build-status.js';

// One entry per page, in the order somebody would use them: what have I done,
// what did I keep, what do you need from me, then the account itself.
//
// The helper area sits between the two halves of that, because it is the one
// item that is neither: it is work somebody does for us, not something we
// need from them. It appears only for an account that holds the role in at least
// one language, per 7i, which is why it is not in this table.
const ACCOUNT_NAV = [
  { href: '/account', key: 'account.navOverview', icon: 'grid' },
  { href: '/account/applications', key: 'account.navApplications', icon: 'briefcase' },
  { href: '/account/saved', key: 'account.navSaved', icon: 'bookmark' },
  { href: '/account/tasks', key: 'account.navTasks', icon: 'bell', badge: true },
  { href: '/account/settings', key: 'account.navSettings', icon: 'user' },
  { href: '/account/security', key: 'account.navSecurity', icon: 'shield' },
];

/** Where the helper item goes when there is one: after the tasks item. */
const HELPER_NAV = {
  href: '/account/translations',
  key: 'account.navTranslations',
  icon: 'globe',
  after: '/account/tasks',
};

let cachedCount = null;
let helperPromise = null;
let navWired = false;

/**
 * Guard the page, draw the account navigation, and hand back the session.
 *
 * @param {{ current: string }} options the path of the page being drawn, used
 *        for aria-current. Passed in instead of read from the address bar so a
 *        page is never wrong about which item is its own.
 * @returns {Promise<{ user: object }|null>} null when the page is being replaced
 *          by a redirect, in which case the caller should stop.
 */
export async function mountAccountPage(options) {
  let session = await applicantSession();
  let offline = false;

  if (!session?.user) {
    // **Being unable to ask is not an answer.** Phase 10: offline the session
    // request fails every single time, and redirecting on that would send an
    // applicant from their own dashboard to the one page in the build that
    // cannot work without a connection. So a network failure falls back to the
    // profile saved on this device, and only a real signed out answer redirects.
    const saved = session?.unreachable ? await offlineSession() : null;

    if (!saved) {
      // replace over assign: somebody signed out who presses back should
      // not land on the page that just bounced them.
      window.location.replace(`/login?redirect=${encodeURIComponent(options.current)}`);
      return null;
    }

    session = saved;
    offline = true;
  }

  renderAccountNav(options.current);
  renderAccountIdentity(session.user);

  // Kept on every successful mount, so the identity is there to draw with the
  // next time there is no connection. Not awaited: nothing on screen waits for
  // it, and a browser that refuses IndexedDB simply never has an offline copy.
  if (!offline) putMine(session.user.id, 'profile', session.user);

  // Not awaited. 7i's helper area is an item almost no account has, and the
  // navigation must not wait on a request to find that out.
  addHelperNav(options.current);

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
 * The account area with no connection
 * ---------------------------------------------------------------------- */

/**
 * The session as this device last saw it, or null.
 *
 * **This authenticates nothing and does not pretend to.** It answers one
 * question — who was signed in here — so that the account pages can draw the
 * copy of their own data that section 14 requires. Every endpoint still checks
 * the real cookie, so an applicant reading this offline can look at what they
 * already had and change nothing at all.
 *
 * @returns {Promise<{ user: object, offline: true }|null>}
 */
async function offlineSession() {
  const userId = await storedUserId();
  if (!userId) return null;

  const saved = await readMine(userId, 'profile');
  if (!saved?.data) return null;

  return { user: saved.data, offline: true };
}

/**
 * The "saved on your device" line at the top of an account page.
 *
 * One element for the whole area rather than one per page, because it says the
 * same thing everywhere and three copies is three places for it to drift.
 * Passing null removes it, which is what a page does the moment a request
 * succeeds: a line saying this is old, over a list that has just come back from
 * the server, is the one thing it exists to prevent.
 *
 * @param {number|null} cachedAt
 */
export function renderCachedLine(cachedAt) {
  const existing = document.querySelector('#accountCached');

  if (!cachedAt) {
    existing?.remove();
    return;
  }

  const page = document.querySelector('#accountPage');
  if (!page) return;

  const line = existing ?? document.createElement('p');
  line.id = 'accountCached';
  line.className = 'board-cached';
  line.setAttribute('role', 'status');
  line.textContent = t('account.savedCopy', { when: formatDateTime(cachedAt) });
  if (!existing) page.prepend(line);
}

/**
 * Resolve a page's data from the server, or from the copy on the device.
 *
 * The one place the three account pages share their offline behaviour, so that
 * "keep a copy on success, use it on a network failure, and say which of the
 * two happened" is written once.
 *
 * **A network failure is the only thing that falls back.** A 500 or a 503 is
 * the site answering, and quietly showing yesterday's applications in place of
 * an error would hide a real fault behind stale data.
 *
 * @param {{ user: { id: string } }} session
 * @param {'applications'|'saved'|'tasks'} kind
 * @param {{ ok: boolean, data: *, error: * }} result
 * @returns {Promise<{ data: *, cachedAt: number|null }|null>} null when the
 *          caller should show its own error, which it already knows how to do
 */
export async function pageData(session, kind, result) {
  const userId = session?.user?.id;

  if (result.ok) {
    if (userId) putMine(userId, kind, result.data);
    renderCachedLine(null);
    return { data: result.data, cachedAt: null };
  }

  if (result.error?.code !== 'network' || !userId) return null;

  const copy = await readMine(userId, kind);
  if (!copy) return null;

  renderCachedLine(copy.cachedAt);
  return { data: copy.data, cachedAt: copy.cachedAt };
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
 * deliberately shows nothing and never claims zero, so Saved roles rendered
 * with a blank count line and no reason anywhere on the page.
 *
 * Three decisions in it:
 *
 *   **It names what is off**, without counting. The staff banner says "3
 *   features" because an admin is about to open the page that lists them; an
 *   applicant has no such page and a number tells them nothing. featureName
 *   already carries a reader-facing name for every key.
 *
 *   **It skips anything admin_*.** Whether the staff dashboard is available is
 *   not an applicant's business and is not something they could act on. The
 *   filter is on the key prefix in place of a second list, so a feature added
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

  // Redrawn, not retranslated: the feature names and the note are
  // written here instead of carried on data-i18n attributes.
  document.addEventListener('gftv:localechange', () => renderMaintenanceBanner(), { once: true });
}

/* -------------------------------------------------------------------------
 * The navigation
 * ---------------------------------------------------------------------- */

function renderAccountNav(current, items = ACCOUNT_NAV) {
  const holder = document.querySelector('#accountNav');
  if (!holder) return;

  holder.innerHTML = items
    .map((item) => {
      const isCurrent = item.href === current;
      return (
        `<a href="${item.href}" class="account-nav-item"${
          isCurrent ? ' aria-current="page"' : ''
        }>` +
        `<span data-icon="${item.icon}" data-icon-size="18"></span>` +
        `<span data-i18n="${item.key}"></span>` +
        (item.badge ? '<span class="account-badge" id="accountTaskBadge" hidden></span>' : '') +
        `</a>`
      );
    })
    .join('');

  hydrateIcons(holder);
  translateWithin(holder);

  // The items carry data-i18n attributes that were not in the document when the
  // language was first applied. Later changes reach them through shell.js's own
  // retranslation pass, which walks the whole document.
  //
  // Registered once and not on every draw. The navigation is drawn a second
  // time when the helper roster comes back, and a listener per draw would
  // retranslate and repaint the badge twice for every language change from then
  // on.
  if (navWired) return;
  navWired = true;

  document.addEventListener('gftv:localechange', () => {
    const nav = document.querySelector('#accountNav');
    if (nav) translateWithin(nav);
    paintBadge(cachedCount);
  });
}

/* -------------------------------------------------------------------------
 * The helper area's navigation item, 7i
 * ---------------------------------------------------------------------- */

/**
 * Which languages this account may help translate.
 *
 * Cached for the page, like applicantSession, because the navigation and the
 * helper page itself both ask and neither should cost its own request.
 *
 * **An empty list is the answer for almost everybody, and it is not an error.**
 * /api/translations/helper answers 200 with nothing in it for an ordinary
 * account, so a failure here means the request itself failed or the feature is
 * switched off, and both end the same way: no item, and the maintenance banner
 * above says why if there is a why.
 *
 * @returns {Promise<Array<{ code: string, native_name: string, granted_at: string }>>}
 */
export function helperRoster({ refresh = false } = {}) {
  if (refresh || !helperPromise) {
    helperPromise = api('/api/translations/helper', { locale: false }).then((result) => {
      const locales = result.ok ? (result.data?.locales ?? []) : [];
      // The hint 7i's annotation layer reads on every page of the site. Set from
      // here because this is the one call that asks the question directly, and
      // an account page is where somebody finds out they have been granted
      // anything. Cleared when the answer is no, so a revoked role stops
      // offering the layer on the next account page instead of on the next
      // browser.
      if (result.ok) noteHelperSession(locales.length > 0);
      return locales;
    });
  }
  return helperPromise;
}

/**
 * Add the helper item once we know whether there is one to add.
 *
 * Drawn after the rest instead of waited for, so the navigation is on screen
 * immediately for the overwhelming majority of accounts that will never have this
 * item. The redraw is the whole list and not an insertion, because the item
 * has to land in the middle of it and rebuilding six links is cheaper to reason
 * about than splicing one in.
 */
async function addHelperNav(current) {
  const locales = await helperRoster();
  if (locales.length === 0) return;

  const items = [];
  for (const item of ACCOUNT_NAV) {
    items.push(item);
    if (item.href === HELPER_NAV.after) items.push(HELPER_NAV);
  }

  renderAccountNav(current, items);
  paintBadge(cachedCount);
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
 * nullable and most accounts will never set one. The fallback is the initial,
 * not a stock silhouette, and the alt text is the display name, per
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
  // The first character of the display name, which is a grapheme and not a
  // code unit: a name starting with an emoji or a surrogate pair would
  // otherwise render as half a character.
  span.textContent = [...String(user.display_name ?? '?')][0] ?? '?';
  return span;
}

/* -------------------------------------------------------------------------
 * Saying something, and surviving a throw
 * ---------------------------------------------------------------------- */

/**
 * A line at the top of an account page, for something that is not about one
 * form.
 *
 * The counterpart of adminMessage in admin-shell.js, and it reads #accountMessage
 * for the same reason that one reads #adminMessage: a page with several panels
 * has nowhere else to put "that saved" where somebody will see it. A page without
 * the element gets nothing, which is why every caller may call it.
 *
 * @param {'ok'|'error'} kind
 * @param {string} text
 */
export function accountMessage(kind, text) {
  const holder = document.querySelector('#accountMessage');
  if (!holder) return;

  holder.className = `callout ${kind === 'ok' ? 'note' : 'danger'}`;
  holder.setAttribute('role', kind === 'ok' ? 'status' : 'alert');
  holder.textContent = text;
  holder.hidden = false;

  if (kind === 'ok') {
    window.clearTimeout(holder.dataset.timer);
    holder.dataset.timer = String(
      window.setTimeout(() => {
        holder.hidden = true;
      }, 6000)
    );
  }
}

/**
 * Run an async handler from a listener, and say so when it throws.
 *
 * The same guard admin-shell.js grew after phase 7 shipped two bare async click
 * handlers whose rejections went to the console while the screen showed nothing
 * at all. The account area had no equivalent, which was fine while every action
 * here was a form submission with its own error line, and stops being fine the
 * moment a page has buttons that fetch.
 *
 * **The body of it is in run-action.js since phase 12 part 6**, shared with the
 * admin area's. The two were the same function with a different message bar,
 * and that is the argument this line now makes in one place.
 *
 * @param {() => unknown} action
 * @param {string} label for the console, naming what was being done
 */
export const runAction = makeRunAction(accountMessage);

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

  // A failed count hides the badge instead of showing a zero. "0" is a claim
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
