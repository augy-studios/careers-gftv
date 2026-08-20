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
//   about not showing somebody an empty dashboard rather than about security.
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

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
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
 *        aria-current. Passed in rather than read from the address bar, so a
 *        page is never wrong about which item is its own.
 * @returns {Promise<{ staff: object, locales: object[], counts: object }|null>}
 *          null when the page is being replaced by a redirect.
 */
export async function mountAdminPage(options) {
  // The overrides are loaded alongside, so a control belonging to a switched
  // off feature is drawn correctly the first time rather than flickering.
  const [result, status] = await Promise.all([
    api('/api/admin/me', { locale: false }),
    loadBuildStatus().then(async (loaded) => {
      await loadFeatureOverrides();
      return loaded;
    }),
  ]);

  buildStatus = status;

  if (!result.ok) {
    // 401 and 403 both mean "not somebody who can be here". The sign in page
    // is the right answer to both: a staff member without portal access needs
    // to know they are signed in and still cannot get in, and the login page
    // says so rather than a dashboard drawn empty.
    window.location.replace(`/admin/login?redirect=${encodeURIComponent(options.current)}`);
    return null;
  }

  context = result.data;

  renderSidebar(options.current);
  renderTopbar();
  renderMaintenanceBanner();

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
  // an old bookmark still works, and is what this points at rather than the
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
    // The staff realm only. An applicant signed in on the same browser stays
    // signed in, because they are two accounts and not one.
    window.location.href = '/admin/login';
  });

  holder.querySelector('[data-admin-menu]')?.addEventListener('click', (event) => {
    const layout = document.querySelector('.admin-layout');
    const open = layout?.classList.toggle('nav-open');
    event.currentTarget.setAttribute('aria-expanded', String(Boolean(open)));
  });
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
 * The sentence for a feature that is switched off, for a page that wants to say
 * so in its own layout rather than through a disabled control.
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
