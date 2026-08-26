// The chrome every page of the dashboard shares: the session guard, the
// sidebar, the top bar, and the two counts on it.
//
// The applicant area's account-shell.js is the same idea one level down, and
// the two are deliberately separate files. They guard different realms with
// different cookies, they redirect to different sign in pages, and merging them
// would be the first step towards the one thing this build has refused since
// phase 2: a shared "current user" that a staff session could satisfy.
//
// Four rules it keeps:
//
//   **Signed out is a redirect to /admin/login**, carrying where you were.
//   Section 8's access check is re-applied by every route, so this redirect is
//   about not showing somebody an empty dashboard, not about security.
//
//   **The role decides what is drawn and never what is allowed.** api/admin/me
//   answers with is_admin read off the gftvhello row on that request. Every
//   admin only route checks it again. A forged localStorage value buys a link
//   to a page that refuses the caller.
//
//   **An admin only item is absent for a job poster, not disabled.** Section
//   0c's disabled state means "this is coming in a later phase", and using it
//   for "you are not allowed" would make a permission look like a build status.
//
//   **An unbuilt section gets the phase sentence**, per 0c: "A staff member
//   clicking an unbuilt section gets the same message rather than an empty
//   screen." Those items stay in the sidebar, disabled, with the reason.

import { api, noteStaffSession } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import { applyNetworkGating } from './offline.js';
import {
  loadBuildStatus,
  loadFeatureOverrides,
  applyFeatureGating,
  isFeatureShipped,
  isFeatureOff,
  featureNote,
  maintenanceSentence,
} from './build-status.js';

/**
 * The sidebar, in section 8's own order.
 *
 * Every item names its feature key, which is what decides whether it is a link
 * or a disabled item with the phase sentence on it. Nothing here hardcodes a
 * phase number, per 0c.
 *
 * adminOnly follows 10 item 2: who else can reach the dashboard is not a job
 * poster's business, and neither is an applicant's account.
 */
const ADMIN_NAV = [
  { href: '/admin', key: 'admin.navOverview', icon: 'grid', feature: 'admin_dashboard' },
  { href: '/admin/jobs', key: 'admin.navJobs', icon: 'briefcase', feature: 'admin_jobs' },
  {
    href: '/admin/applications',
    key: 'admin.navApplications',
    icon: 'users',
    feature: 'admin_applications',
    badge: 'new_applications',
  },
  { href: '/admin/analytics', key: 'admin.navAnalytics', icon: 'chart', feature: 'admin_analytics' },
  { href: '/admin/invites', key: 'admin.navInvites', icon: 'bell', feature: 'admin_invites' },
  {
    href: '/admin/departments',
    key: 'admin.navDepartments',
    icon: 'grid',
    feature: 'admin_departments',
  },
  { href: '/admin/tags', key: 'admin.navTags', icon: 'tag', feature: 'admin_tags' },
  {
    href: '/admin/admins',
    key: 'admin.navAdmins',
    icon: 'shield',
    feature: 'admin_admins',
    adminOnly: true,
  },
  {
    href: '/admin/applicants',
    key: 'admin.navApplicants',
    icon: 'user',
    feature: 'admin_applicants',
    adminOnly: true,
  },
  { href: '/admin/settings', key: 'admin.navSettings', icon: 'settings', feature: 'admin_settings' },
  {
    href: '/admin/translations',
    key: 'admin.navTranslations',
    icon: 'globe',
    feature: 'admin_translations',
    // 8.11: "Show the count of open reports in the admin sidebar, so the queue
    // is visible without going looking for it."
    badge: 'open_translation_reports',
  },
  {
    href: '/admin/maintenance',
    key: 'admin.navMaintenance',
    icon: 'build',
    feature: 'admin_maintenance',
  },
  { href: '/admin/security', key: 'admin.navSecurity', icon: 'key', feature: 'staff_login' },
];

let context = null;
let buildStatus = null;

/**
 * Guard the page, draw the chrome, and hand back who is signed in.
 *
 * @param {{ current: string }} options the path of the page being drawn, for
 *        aria-current. Passed in instead of read from the address bar, so a
 *        page is never wrong about which item is its own.
 * @returns {Promise<{ staff: object, locales: object[], counts: object }|null>}
 *          null when the page is being replaced by a redirect.
 */
export async function mountAdminPage(options) {
  // The overrides are loaded alongside, so a control belonging to a switched
  // off feature is drawn correctly the first time without flickering.
  const [result, status] = await Promise.all([
    api('/api/admin/me', { locale: false }),
    loadBuildStatus().then(async (loaded) => {
      await loadFeatureOverrides();
      return loaded;
    }),
  ]);

  buildStatus = status;

  if (!result.ok) {
    // Section 14, and the sharpest statement of it in the build: "cache its
    // shell only, and show an offline notice instead of stale management data.
    // Never let an admin act on a cached view of applications."
    //
    // Being unable to ask is not a refusal. Redirecting on a network failure
    // would send an admin to /admin/login, which cannot work without a
    // connection either, from a page that was working a moment ago.
    //
    // **Nothing of the dashboard is drawn, not even the sidebar.** The sidebar
    // is built from this caller's role and access flags, and those are exactly
    // what could not be read. A dashboard drawn from a guess about who somebody
    // is would be the one thing this whole phase is careful not to do, and
    // returning null stops every page module before it asks for any data.
    if (result.error?.code === 'network') {
      renderAdminOffline();
      return null;
    }

    // 401 and 403 both mean "not somebody who can be here". The sign in page
    // is the right answer to both: a staff member without portal access needs
    // to know they are signed in and still cannot get in, and the login page
    // says so instead of a dashboard drawn empty.
    //
    // The path comes from the address bar, not from options.current.
    // current is which sidebar item to mark, which is not the same question:
    // the editor marks Postings, so a session that expired inside it recorded
    // /admin/jobs and lost both the page and the id of the posting being
    // edited. /admin/login ignores the parameter today, per the note in
    // admin-login-page.js, so this is about the value being true when phase 8
    // starts honouring it.
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/admin/login?redirect=${encodeURIComponent(here)}`);
    return null;
  }

  context = result.data;

  // The public header offers staff a way back to /admin, per deviation 20, and
  // only bothers asking about a staff session when this browser has seen one.
  // A successful /api/admin/me *is* that proof, so record it and hand the
  // session straight to shell.js instead of making it ask again.
  //
  // Without this the item never appears on the page somebody has just signed in
  // to: /admin/login clears the flag on load, when there is genuinely no
  // session yet, and nothing on the dashboard side used to set it back.
  noteStaffSession(true);
  document.dispatchEvent(
    new CustomEvent('gftv:staffsession', { detail: { user: context.staff } })
  );

  renderSidebar(options.current);
  renderTopbar();
  renderMaintenanceBanner();
  wireSidebarDrawer();

  document.querySelector('#adminLoading')?.remove();
  const page = document.querySelector('#adminPage');
  if (page) page.hidden = false;

  document.addEventListener('gftv:localechange', () => {
    renderSidebar(options.current);
    renderTopbar();
    renderMaintenanceBanner();
  });

  return context;
}

/** Who is signed in, for a page that needs the role after mounting. */
export function adminContext() {
  return context;
}

/** Whether the signed in staff member is an admin. Drawing only. */
export function isAdminUser() {
  return context?.staff?.is_admin === true;
}

/** The active languages, for the editor tabs. Read from gftvjobs_locales. */
export function adminLocales() {
  return context?.locales ?? [{ code: 'en', native_name: 'English', is_default: true }];
}

/* -------------------------------------------------------------------------
 * The sidebar
 * ---------------------------------------------------------------------- */

function renderSidebar(current) {
  const holder = document.querySelector('#adminNav');
  if (!holder) return;

  renderSidebarHead(holder.closest('.admin-sidebar'));

  const counts = context?.counts ?? {};

  holder.innerHTML = ADMIN_NAV.filter((item) => !item.adminOnly || isAdminUser())
    .map((item) => {
      const shipped = isFeatureShipped(buildStatus, item.feature);
      const off = shipped && isFeatureOff(item.feature);
      const isCurrent = item.href === current;

      const badge =
        item.badge && counts[item.badge] ? `<span class="admin-badge">${counts[item.badge]}</span>` : '';

      const label =
        `<span data-icon="${item.icon}" data-icon-size="18"></span>` +
        `<span>${escapeHtml(t(item.key))}</span>${badge}`;

      // An unbuilt section stays visible and disabled with the reason, per 0c.
      // applyFeatureGating below does the wording and the explainer; this only
      // decides whether it is a link at all.
      if (!shipped) {
        return (
          `<span class="admin-nav-item" data-feature="${item.feature}">${label}</span>`
        );
      }

      return (
        `<a href="${item.href}" class="admin-nav-item"` +
        `${isCurrent ? ' aria-current="page"' : ''}` +
        `${off ? ' data-off="true"' : ''}>${label}</a>`
      );
    })
    .join('');

  // The documentation link, which leaves the portal. 8a: the staff manual lives
  // on the docs site, and this marks it as going somewhere else because the
  // reader signs in there separately, per 5h. /admin/docs is a redirect kept so
  // an old bookmark still works, and is what this points at in place of the
  // docs site's address, so the destination can move without a deploy here.
  const docs = document.createElement('a');
  docs.className = 'admin-nav-item admin-nav-external';
  docs.href = '/admin/docs';
  docs.rel = 'noopener';
  docs.innerHTML =
    '<span data-icon="book" data-icon-size="18"></span>' +
    `<span>${escapeHtml(t('admin.navDocs'))}</span>` +
    '<span data-icon="external" data-icon-size="14"></span>';
  holder.append(docs);

  hydrateIcons(holder);
  applyFeatureGating(buildStatus, holder);
}

/**
 * The head of the sidebar when it is a drawer, below 900px.
 *
 * Drawn at every width and hidden by the stylesheet above the breakpoint, so
 * nothing here has to know which layout is on screen. It is rebuilt with the
 * rest of the sidebar on a locale change, which is why the label and the
 * button's name go through t() at draw time rather than being written into the
 * page once.
 *
 * The button matters more than the label: the drawer used to open in flow and
 * push the dashboard down, so the toggle that opened it scrolled away with the
 * page and closing it meant hunting for the button again. A way out at the top
 * of the panel is the fix that survives however somebody got here.
 */
function renderSidebarHead(aside) {
  if (!aside) return;

  aside.querySelector('.admin-sidebar-head')?.remove();

  const head = document.createElement('div');
  head.className = 'admin-sidebar-head';
  head.innerHTML =
    `<span class="modal-section-label">${escapeHtml(t('admin.menuToggle'))}</span>` +
    '<button type="button" class="icon-btn small" data-admin-menu-close ' +
    `aria-label="${escapeHtml(t('common.closeMenu'))}">` +
    '<span data-icon="close" data-icon-size="18"></span>' +
    '</button>';

  aside.prepend(head);
  hydrateIcons(head);
}

/* -------------------------------------------------------------------------
 * The sidebar as a drawer, below 900px
 *
 * The public drawer in shell.js is the same shape and the two are deliberately
 * not shared: that one lives in the header's stacking context and closes at
 * 1024px, this one is a child of the page and closes at 900px, and the only
 * code they would have in common is four attribute writes.
 *
 * They do agree on the one thing that is visible: an admin page carries both
 * toggles, so they come in from opposite edges, each from the side its own
 * button is on. See the notes on .site-nav and .admin-sidebar in app.css.
 * ---------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const drawerWidth = window.matchMedia('(max-width: 900px)');

let navBackdrop = null;
let navLastFocus = null;

const adminLayout = () => document.querySelector('.admin-layout');
const adminSidebar = () => document.querySelector('.admin-sidebar');
const adminMenuToggle = () => document.querySelector('[data-admin-menu]');

/** Whether the drawer is open. False at every width where there is no drawer. */
function isNavOpen() {
  return adminLayout()?.classList.contains('nav-open') === true;
}

/**
 * Off canvas and closed still means out of reach.
 *
 * The sidebar used to be display: none when closed, so nothing in it could be
 * tabbed to or read out. A drawer that is merely translated off the edge is
 * still in the page, and without this a phone reader would tab from the top bar
 * into twelve invisible links.
 */
function syncNavReach() {
  const sidebar = adminSidebar();
  if (!sidebar) return;

  const out = drawerWidth.matches && !isNavOpen();
  sidebar.inert = out;
  sidebar.setAttribute('aria-hidden', out ? 'true' : 'false');
}

function openNav() {
  if (!drawerWidth.matches) return;

  const layout = adminLayout();
  const sidebar = adminSidebar();
  if (!layout || !sidebar) return;

  navLastFocus = document.activeElement;
  layout.classList.add('nav-open');
  adminMenuToggle()?.setAttribute('aria-expanded', 'true');
  if (navBackdrop) navBackdrop.hidden = false;
  document.body.setAttribute('data-scroll-locked', 'true');
  syncNavReach();
  sidebar.querySelector(FOCUSABLE)?.focus();
}

function closeNav() {
  adminLayout()?.classList.remove('nav-open');
  adminMenuToggle()?.setAttribute('aria-expanded', 'false');
  if (navBackdrop) navBackdrop.hidden = true;
  document.body.setAttribute('data-scroll-locked', 'false');
  // Before the focus is put back, so the browser is never asked to leave focus
  // inside something that has just been made inert.
  syncNavReach();
  if (navLastFocus instanceof HTMLElement) navLastFocus.focus();
  navLastFocus = null;
}

/** Called from the top bar's button, which is redrawn on a locale change. */
function toggleNav() {
  if (isNavOpen()) closeNav();
  else openNav();
}

let drawerWired = false;

function wireSidebarDrawer() {
  if (drawerWired) return;
  drawerWired = true;

  // On the body and not inside .admin-layout: the layout is a grid, and the
  // backdrop belongs to the viewport rather than to a column of it. At the root
  // it also outranks the sticky header at 50, so the header bar dims with the
  // page. See .admin-nav-backdrop in app.css.
  navBackdrop = document.createElement('div');
  navBackdrop.className = 'admin-nav-backdrop';
  navBackdrop.hidden = true;
  navBackdrop.setAttribute('data-admin-menu-close', '');
  document.body.append(navBackdrop);

  syncNavReach();

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-admin-menu-close]')) closeNav();
    // Going somewhere closes the drawer, per section 3. The href is a real
    // navigation, so this only matters for the moment before it lands.
    else if (isNavOpen() && event.target.closest('.admin-sidebar a')) closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (!isNavOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNav();
    } else if (event.key === 'Tab') {
      trapFocus(adminSidebar(), event);
    }
  });

  // Widening past the breakpoint must not leave the page scroll locked behind a
  // panel that is now an ordinary column. The same failure shell.js guards
  // against, and the same fix.
  const sync = () => {
    if (!drawerWidth.matches) {
      adminLayout()?.classList.remove('nav-open');
      adminMenuToggle()?.setAttribute('aria-expanded', 'false');
      if (navBackdrop) navBackdrop.hidden = true;
      document.body.setAttribute('data-scroll-locked', 'false');
    }
    syncNavReach();
  };

  if (typeof drawerWidth.addEventListener === 'function') {
    drawerWidth.addEventListener('change', sync);
  }
}

function trapFocus(panel, event) {
  if (!panel) return;

  const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* -------------------------------------------------------------------------
 * The top bar
 * ---------------------------------------------------------------------- */

function renderTopbar() {
  const holder = document.querySelector('#adminTopbar');
  if (!holder) return;

  const staff = context?.staff ?? {};

  // Deliberately not a second site header. The public header from shell.js is
  // above this, exactly as it is on /admin/login and /admin/security, and
  // duplicating its brand, theme, and language controls here would be two of
  // each on one page. What this bar carries is the one thing that header cannot
  // say: which staff account is signed in, and how to sign *that* one out. The
  // header's own sign out is the applicant's, and the two realms are never
  // merged.
  holder.innerHTML = `
    <button type="button" class="icon-btn admin-menu-toggle" data-admin-menu
            aria-label="${escapeHtml(t('admin.menuToggle'))}" aria-expanded="false">
      <span data-icon="menu" data-icon-size="20"></span>
    </button>
    <span class="admin-whoami">
      <span class="admin-whoami-name">${escapeHtml(staff.username ?? '')}</span>
      <span class="admin-role-pill">${escapeHtml(
        t(staff.is_admin ? 'admin.roleAdmin' : 'admin.rolePoster')
      )}</span>
    </span>
    <div class="admin-topbar-right">
      <button type="button" class="btn btn-quiet small" data-admin-signout>
        ${escapeHtml(t('admin.signOutStaff'))}
      </button>
    </div>`;

  hydrateIcons(holder);

  holder.querySelector('[data-admin-signout]')?.addEventListener('click', async () => {
    await api('/api/auth/staff/logout', { method: 'POST', locale: false });
    // The counterpart to the note on the way in. Without it the next public
    // page would ask the server about a staff session that has just been ended,
    // get told no, and clear the flag itself: correct, but a wasted request on
    // a page that is drawn for everybody.
    noteStaffSession(false);
    // The staff realm only. An applicant signed in on the same browser stays
    // signed in, because they are two accounts and not one.
    window.location.href = '/admin/login';
  });

  // The drawer itself is wired once, in wireSidebarDrawer. This button is
  // rebuilt on every locale change, so it only ever asks for the toggle, and it
  // is told what the drawer is doing rather than assuming it is shut: the bar
  // is redrawn while somebody is reading it, and switching language with the
  // drawer open must not leave the button saying it is closed.
  const menu = holder.querySelector('[data-admin-menu]');
  menu?.setAttribute('aria-expanded', String(isNavOpen()));
  menu?.addEventListener('click', toggleNav);
}

/* -------------------------------------------------------------------------
 * The maintenance banner
 * ---------------------------------------------------------------------- */

/**
 * A line at the top of the dashboard when anything is switched off.
 *
 * 8.12 does not ask for this and it is worth having anyway: an override
 * survives a deploy and nothing turns itself back on, so the failure mode of
 * the whole mechanism is a feature left off that everybody has forgotten. A
 * line on the page every staff member opens is what stops that being noticed
 * three weeks later by an applicant.
 */
function renderMaintenanceBanner() {
  document.querySelector('.admin-maintenance-banner')?.remove();

  // Every key in the feature map, not just the ones with a sidebar item: most
  // of what can be switched off is on the public site.
  const off = Object.keys(buildStatus?.features ?? {}).filter((key) => isFeatureOff(key));
  if (off.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'callout warn admin-maintenance-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<p>${escapeHtml(
    t('admin.maintenanceBanner', { count: off.length })
  )} <a href="/admin/maintenance">${escapeHtml(t('admin.maintenanceBannerLink'))}</a></p>`;

  document.querySelector('#adminPage')?.prepend(bar);
}

/**
 * The dashboard with no connection: a notice, and nothing else.
 *
 * Section 14 permits the shell to be cached and forbids stale management data,
 * so this draws neither a sidebar nor a page. What is on screen is one card
 * saying why, and the address bar still holds the page that was asked for, so
 * reloading when the connection returns lands back on it.
 *
 * It redraws on a language change and gets out of the way on `online`, where a
 * reload is the honest way back: every page module stopped when mountAdminPage
 * returned null, and there is nothing on screen to bring up to date.
 */
function renderAdminOffline() {
  document.querySelector('#adminLoading')?.remove();

  const draw = () => {
    document.querySelector('#adminOffline')?.remove();

    const card = document.createElement('div');
    card.id = 'adminOffline';
    card.className = 'glass-card placeholder';
    card.innerHTML = `
      <p class="eyebrow">
        <span data-icon="offline" data-icon-size="16"></span>
        <span>${escapeHtml(t('offline.eyebrow'))}</span>
      </p>
      <h1>${escapeHtml(t('admin.offlineHeading'))}</h1>
      <p class="sentence">${escapeHtml(t('admin.offlineBody'))}</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" id="adminOfflineRetry"
                data-needs-network>${escapeHtml(t('offline.retry'))}</button>
      </div>`;

    const main = document.querySelector('main') ?? document.body;
    main.prepend(card);

    card
      .querySelector('#adminOfflineRetry')
      ?.addEventListener('click', () => window.location.reload());

    hydrateIcons(card);
    applyNetworkGating(card);
  };

  draw();
  document.addEventListener('gftv:localechange', draw);
  window.addEventListener('online', draw);
  window.addEventListener('offline', draw);
}

/**
 * The sentence for a feature that is switched off, for a page that wants to say
 * so in its own layout and not through a disabled control.
 */
export function offSentence(featureKey) {
  return isFeatureOff(featureKey) ? maintenanceSentence(featureNote(featureKey)) : null;
}

/* -------------------------------------------------------------------------
 * Small shared pieces
 * ---------------------------------------------------------------------- */

/**
 * Show a message at the top of a page's content.
 *
 * Every dashboard page needs one and none of them needs its own. role="alert"
 * on a failure so a screen reader hears it without moving focus, role="status"
 * on a success so it does not interrupt.
 *
 * @param {'ok'|'error'} kind
 * @param {string} text
 */
export function adminMessage(kind, text) {
  const holder = document.querySelector('#adminMessage');
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

/** Hide whatever adminMessage last put on screen. */
export function clearAdminMessage() {
  const holder = document.querySelector('#adminMessage');
  if (holder) holder.hidden = true;
}

/**
 * The empty state every list shares.
 * @param {string} text
 */
export function emptyRow(text) {
  return `<p class="muted admin-empty">${escapeHtml(text)}</p>`;
}

/**
 * Run an async handler from a listener, and say so when it throws.
 *
 * The single most expensive habit in this build, twice over. Phase 7 shipped two
 * bare async click handlers in two different files: `collect()` threw a
 * ReferenceError in the editor, and `dialog.open()` threw one on the tracking
 * page where the variable was `detailDialog`. In both cases the rejection went
 * to the console and nothing at all reached the screen, so the whole applicant
 * detail panel had never worked and nobody could tell from looking at it. A
 * control that does nothing is indistinguishable from a control that is slow.
 *
 * It lives here instead of in each page because "every page phase 8 adds needs
 * one" is exactly the kind of rule that gets followed four times and forgotten
 * on the fifth. `admin-job-editor.js` keeps its own copy for now; the two are
 * the same function and merging them is a phase 12 tidy up, not a phase 8 one.
 *
 * The message is deliberately generic: whatever went wrong is a fault in the
 * page, not something the admin can act on, and the console still has
 * the real cause for whoever reads it.
 *
 * @param {() => unknown} action
 * @param {string} label what it was, for the console line
 */
export function runAction(action, label) {
  try {
    const result = action();
    if (result && typeof result.catch === 'function') {
      result.catch((cause) => {
        console.error(`[careers-gftv] ${label}:`, cause);
        adminMessage('error', t('error.unexpected'));
      });
    }
  } catch (cause) {
    console.error(`[careers-gftv] ${label}:`, cause);
    adminMessage('error', t('error.unexpected'));
  }
}
