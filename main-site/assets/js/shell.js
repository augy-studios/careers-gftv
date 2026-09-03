// The shared shell: header, navigation, footer, and the phase notice. Imported
// by every page as the single entry point.
//
//   <script type="module" src="/assets/js/shell.js"></script>
//
// The chrome is rendered here instead of copied into every HTML file, since a
// header duplicated across twenty files is a header that drifts. Page content
// stays in the HTML.
//
// Section 3 rules that this file is responsible for: the hamburger panel opens
// from the left, traps focus while open, closes on Escape, on backdrop tap, and
// on navigating away, has an obvious close control, is reachable by keyboard,
// sets aria-expanded on the trigger and aria-hidden on the panel, and locks
// body scroll while open. The two modals this header opens follow the same
// rules and get them from dialog.js instead of from a second copy; they live in
// chrome-modals.js since phase 14 part 1, because the docs site's header needs
// the same two and cannot import anything from this project.

import { initTheme } from './theme.js';
import { initI18n, t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { insertTopBar } from './top-bars.js';
// The two modals this header opens. Their own file since phase 14 part 1, so
// that gen-docs-lib.js can put the same implementation in the docs site's
// header: gftv-theme.md prescribes that control's markup, and a second copy of
// it written over there is exactly the duplication decision 1 exists to stop.
import {
  renderThemeModal,
  renderLanguageModal,
  wireThemeModal,
  wireLanguageModal,
} from './chrome-modals.js';
import {
  loadBuildStatus,
  loadFeatureOverrides,
  renderPhaseNotice,
  applyFeatureGating,
  renderPlaceholder,
} from './build-status.js';
import {
  api,
  applicantSession,
  staffSession,
  hasStaffHint,
  hasHelperHint,
  noteHelperSession,
} from './api.js';
import { loadSiteSettings, cachedPortalTitle } from './site-settings.js';
import { resumePendingPrompt } from './apply-prompt.js';
// Registers the service worker on import, and owns the update prompt and the
// connection banner. Every page used to carry its own inline register() call;
// this is the one owner, which is what the update prompt needs to exist at all.
import { initOffline } from './offline.js';
import { syncUser, wipeAll, storedUserId, readMine } from './idb.js';
import { initQueue } from './queue.js';

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

// Every entry is a real route. A route belonging to a later phase renders the
// placeholder page in place of a dead link, per section 0c, so nothing here is
// disabled or hidden.
// Labels are dictionary keys, not text. translateDom fills them in and
// refills them whenever the language changes, so nothing here is written twice.
const NAV = [
  { href: '/search', key: 'nav.findRole', icon: 'search' },
  { href: '/account/applications', key: 'nav.myApplications', icon: 'briefcase' },
  { href: '/status', key: 'nav.buildStatus', icon: 'build' },
  { href: '/login', key: 'nav.signIn', icon: 'chevron-right' },
];

const FOOTER = [
  {
    headingKey: 'footer.rolesHeading',
    links: [
      { href: '/search', key: 'footer.allOpenings' },
      { href: '/search?closing_within_days=14', key: 'footer.closingSoon' },
      { href: '/search?no_deadline=true', key: 'footer.openUntilFilled' },
    ],
  },
  {
    headingKey: 'footer.accountHeading',
    links: [
      { href: '/login', key: 'footer.signIn' },
      { href: '/register', key: 'footer.createAccount' },
      { href: '/account/tasks', key: 'footer.outstandingTasks' },
    ],
  },
  {
    headingKey: 'footer.aboutHeading',
    links: [
      { href: '/about', key: 'footer.about' },
      { href: '/faq', key: 'footer.faq' },
      { href: '/status', key: 'footer.buildStatus' },
      // The privacy notice and the terms are GFTV wide, not specific to
      // this portal, so they live on the central policy site and open in a new
      // tab. /privacy and /terms still resolve, as redirects in vercel.json,
      // for anyone who types them or follows an older link.
      {
        href: 'https://policy.globalfurry.tv/legal/privacy',
        key: 'footer.privacy',
        external: true,
      },
      {
        href: 'https://policy.globalfurry.tv/legal/terms',
        key: 'footer.terms',
        external: true,
      },
    ],
  },
];

/**
 * One footer link. An external one opens in a new tab, carries rel="noopener"
 * so the new tab cannot reach back through window.opener, and says out loud
 * that it opens a new tab, since a link that moves you somewhere unexpected
 * without warning is a WCAG 3.2.5 problem, not a style choice.
 */
function footerLink(link) {
  if (!link.external) {
    return `<li><a href="${link.href}" data-i18n="${link.key}"></a></li>`;
  }

  return (
    `<li><a class="external-link" href="${link.href}" target="_blank" rel="noopener noreferrer">` +
    `<span data-i18n="${link.key}"></span>` +
    `<span data-icon="external" data-icon-size="14"></span>` +
    `<span class="visually-hidden" data-i18n="common.opensNewTab"></span>` +
    `</a></li>`
  );
}

/* -------------------------------------------------------------------------
 * Render
 * ---------------------------------------------------------------------- */

function renderHeader() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner">
      <a class="brand" href="/">
        <span class="brand-mark" data-icon="briefcase" data-icon-size="18"></span>
        <span data-i18n="brand.name" data-brand-name></span>
      </a>

      <button type="button" class="icon-btn nav-toggle" id="navToggle"
              aria-expanded="false" aria-controls="siteNav"
              data-i18n-attr="aria-label:common.openMenu">
        <span data-icon="menu" data-icon-size="22"></span>
      </button>

      <!-- The language control is its own button instead of a section inside
           the theme modal. Someone who reads only Mandarin and lands on the
           English site cannot be expected to find a switch labelled "Theme",
           whereas a globe is legible without reading anything.

           Both carry a feature key, so 8.12 can switch either off from the
           maintenance page. Off disables the button with the maintenance
           sentence without removing it, per 0c: a control that vanishes
           looks like a site that has lost a feature, and a disabled one with
           the reason on it says what has actually happened. Whatever language
           and theme the reader already had stay applied, because both live in
           localStorage and are read before first paint; what is switched off is
           the ability to change them, which is the part that can break. -->
      <button type="button" class="icon-btn" id="languageButton"
              aria-haspopup="dialog" data-feature="language_switcher"
              data-i18n-attr="aria-label:common.language">
        <span data-icon="globe" data-icon-size="22"></span>
      </button>

      <button type="button" class="icon-btn" id="themeButton"
              aria-haspopup="dialog" data-feature="theme_switcher"
              data-i18n-attr="aria-label:common.appearance">
        <span data-icon="palette" data-icon-size="22"></span>
      </button>

      <nav class="site-nav" id="siteNav" data-i18n-attr="aria-label:nav.label" aria-hidden="true">
        <div class="site-nav-head">
          <span class="modal-section-label" data-i18n="common.menu"></span>
          <button type="button" class="icon-btn small" data-close-nav
                  data-i18n-attr="aria-label:common.closeMenu">
            <span data-icon="close" data-icon-size="18"></span>
          </button>
        </div>
        ${NAV.map((item) => {
          const current = path === item.href.split('?')[0] ? ' aria-current="page"' : '';
          return `<a href="${item.href}"${current}><span data-icon="${item.icon}" data-icon-size="18"></span><span data-i18n="${item.key}"></span></a>`;
        }).join('')}
      </nav>
    </div>
  `;

  // The backdrop goes inside the header, not on the body.
  //
  // .site-header is position: sticky with a z-index, and sticky always creates
  // a stacking context. That means .site-nav's z-index is resolved inside the
  // header and cannot rise above the header's own 50 at the root, so a
  // backdrop sitting on the body at 80 would paint over the drawer as well as
  // the page. Putting the backdrop in the same stacking context as the drawer
  // makes their z-indexes comparable, so the page dims and the drawer does
  // not.
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('data-close-nav', '');
  header.append(backdrop);

  // Below the skip link and below the two notice bars, per top-bars.js. It
  // used to be a plain prepend, which put the whole header ahead of the skip
  // link on every page in the build.
  insertTopBar(header, 'site-header');
  return { header, backdrop };
}

function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div>
        <h2 data-i18n="brand.name" data-brand-name></h2>
        <p data-i18n="footer.tagline"></p>
      </div>
      ${FOOTER.map(
        (group) => `
        <div>
          <h2 data-i18n="${group.headingKey}"></h2>
          <ul>
            ${group.links.map(footerLink).join('')}
          </ul>
        </div>`
      ).join('')}
      <p class="site-footer-legal">
        <span data-i18n="footer.legal"></span>
        <a href="/status" data-i18n="footer.legalLink"></a>
      </p>
    </div>
  `;
  document.body.append(footer);
  return footer;
}

/* -------------------------------------------------------------------------
 * Focus trapping, for the navigation panel
 *
 * The two modals had a copy of this each until phase 12 part 6 moved them onto
 * dialog.js and a native <dialog>, which traps focus itself. The drawer is not
 * a dialog — it is a panel that becomes an ordinary inline nav above 1024 — so
 * it keeps the hand-rolled trap, and this is now its only caller.
 * ---------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(panel, event) {
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

function lockScroll(locked) {
  document.body.setAttribute('data-scroll-locked', locked ? 'true' : 'false');
}

/* -------------------------------------------------------------------------
 * Wiring
 * ---------------------------------------------------------------------- */

function wireNav(header, backdrop) {
  const toggle = header.querySelector('#navToggle');
  const nav = header.querySelector('#siteNav');
  const desktop = window.matchMedia('(min-width: 1024px)');
  let lastFocus = null;

  function isOffCanvas() {
    return !desktop.matches;
  }

  function open() {
    if (!isOffCanvas()) return;
    lastFocus = document.activeElement;
    nav.setAttribute('data-open', 'true');
    nav.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    // Through the dictionary, not hardcoded. This read "Close menu" in English
    // to a Mandarin reader until the same pass that found theme.timeBasedNote.
    toggle.setAttribute('aria-label', t('common.closeMenu'));
    backdrop.hidden = false;
    lockScroll(true);
    // **This works because of one line of CSS, and it is worth knowing which.**
    // The closed drawer is `visibility: hidden`, so that a keyboard reader
    // cannot tab into an off-screen panel the page has told a screen reader is
    // not there. An element that is not visible cannot take focus, so the open
    // rule in app.css shows it with `visibility 0s` and no delay, and this call
    // lands on something focusable in the same style recalculation. A
    // `visibility` transition with a duration on it would put the focus back on
    // the button behind the drawer, silently.
    nav.querySelector(FOCUSABLE)?.focus();
  }

  function close() {
    nav.removeAttribute('data-open');
    nav.setAttribute('aria-hidden', isOffCanvas() ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', t('common.openMenu'));
    backdrop.hidden = true;
    lockScroll(false);
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  function isOpen() {
    return nav.getAttribute('data-open') === 'true';
  }

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-nav]')) close();
    // Navigating to a new page closes the panel, per section 3.
    if (isOpen() && event.target.closest('.site-nav a')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapFocus(nav, event);
    }
  });

  // Widening past the breakpoint must not leave the page scroll locked behind
  // a panel that is now inline.
  const syncBreakpoint = () => {
    if (!isOffCanvas()) {
      nav.removeAttribute('data-open');
      nav.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.hidden = true;
      lockScroll(false);
    } else if (!isOpen()) {
      nav.setAttribute('aria-hidden', 'true');
    }
  };

  desktop.addEventListener('change', syncBreakpoint);
  syncBreakpoint();
}

/* -------------------------------------------------------------------------
 * Who is signed in
 * ---------------------------------------------------------------------- */

/**
 * Swap the Sign in item for the account once there is a session.
 *
 * Only the applicant realm appears in this header. The staff realm has its own
 * sign in at /admin/login and its own dashboard chrome from phase 7, and the
 * two are never merged into one "current user" anywhere in this build.
 *
 * The nav is drawn before the session is known, so the signed out state is
 * what paints first and this quietly replaces it. That way a slow session
 * check never delays the page, and somebody signed out sees the right thing
 * immediately, with no flicker.
 */
async function reflectApplicantSession() {
  const nav = document.querySelector('#siteNav');
  if (!nav) return;

  const signIn = nav.querySelector('a[href="/login"]');
  if (!signIn) return;

  let session = await applicantSession();

  // Offline, the session request fails and reads as signed out. The account
  // pages fall back to the profile saved on this device, so the header has to
  // as well: a page listing somebody's own applications under a "Sign in" link
  // is the site disagreeing with itself about who is looking at it.
  if (!session?.user && session?.unreachable) {
    const userId = await storedUserId();
    const saved = userId ? await readMine(userId, 'profile') : null;
    if (saved?.data) session = { user: saved.data };
  }

  if (!session?.user) return;

  const account = document.createElement('a');
  // The account area's own landing page, which phase 6 built. It pointed at
  // /account/security until then, because that was the only page of the account
  // area that existed.
  account.href = '/account';
  account.innerHTML =
    '<span data-icon="user" data-icon-size="18"></span>' +
    // Classed so app.css can cap it. A display name is arbitrary text of
    // arbitrary length dropped into a fixed width bar, and it is the one nav
    // item that may be cut short and not allowed to push the row around.
    `<span class="nav-account-name"></span>`;
  // The display name is data, not a dictionary string, so it is set as text
  // instead of through data-i18n and is never passed through innerHTML.
  account.lastElementChild.textContent = session.user.display_name;

  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'nav-signout';
  signOut.innerHTML =
    '<span data-icon="arrow-left" data-icon-size="18"></span>' +
    '<span data-i18n="nav.signOut"></span>';

  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    await api('/api/auth/applicant/logout', { method: 'POST', locale: false });

    // Section 14: the offline copy of the applicant's own data is cleared
    // completely on logout. Awaited, and after the request rather than before:
    // a logout that failed leaves them signed in, and wiping first would take
    // their offline copy away from a session that is still theirs.
    await wipeAll();

    // A reload, not a redirect, so somebody signing out from a posting
    // stays on it, signed out.
    window.location.reload();
  });

  signIn.replaceWith(account, signOut);
  hydrateIcons(nav);
  translateNewChrome(nav);
}

/**
 * Offer staff a way back to the dashboard.
 *
 * The two realms stay separate: this is its own cookie, its own request, and
 * its own nav item, and nothing here merges a staff account and an applicant
 * account into one "current user". Somebody who is both gets two items, which
 * is the honest rendering of being signed into two things.
 *
 * **Gated on a hint, so it costs nothing for almost everybody.** Asking the
 * server about a staff session on every page load, for every reader, to serve
 * the handful of people who have one, is the reason this was left out until
 * now. api.js records a flag once a staff session has actually been seen in
 * this browser, and only then is the question asked. The flag decides whether
 * to ask, never what the answer is: the server re-checks the session and the
 * access flags on every admin route regardless, per section 8.
 *
 * The link points at /admin, which phase 7 turned into the real dashboard.
 *
 * @param {{ user: object }|null} [known] a staff session the caller has already
 *        proved, which skips both the hint and the request. The dashboard
 *        passes one: it has just had /api/admin/me answer, so asking the server
 *        a second question about the same cookie would be waste.
 *
 *        It also fixes the case the hint alone cannot reach. On a fresh browser
 *        the sequence is: open /admin/login with no session, so the hint is
 *        cleared; sign in; land on /admin. The hint is false at the moment this
 *        runs, so without the dashboard telling it, the header would offer no
 *        way back to /admin on the very page somebody has just signed in to.
 */
async function reflectStaffSession(known = null) {
  if (!known && !hasStaffHint()) return;

  const nav = document.querySelector('#siteNav');
  if (!nav) return;

  const session = known ?? (await staffSession());
  if (!session?.user) return;
  if (nav.querySelector('#navAdmin')) return;

  const link = document.createElement('a');
  link.href = '/admin';
  link.id = 'navAdmin';
  link.innerHTML =
    '<span data-icon="grid" data-icon-size="18"></span>' +
    '<span data-i18n="nav.adminDashboard"></span>';

  // First in the list. Somebody signed in as staff and looking at the public
  // site is on their way to the dashboard more often than not.
  nav.querySelector('a')?.before(link);

  hydrateIcons(nav);
  translateNewChrome(nav);
}

/* -------------------------------------------------------------------------
 * 7i's annotation layer, and the switch that turns it on
 * ---------------------------------------------------------------------- */

/**
 * Whether the layer is on, in this browser, across pages.
 *
 * localStorage over a session or a column: it is a reading preference
 * about this browser, like the theme and the language, and a helper who turns it
 * on to work through a posting should not find it off again on the next one.
 */
const ANNOTATE_KEY = 'gftv-careers.annotating';

let annotateModule = null;

function annotatingOn() {
  try {
    return localStorage.getItem(ANNOTATE_KEY) === 'on';
  } catch {
    return false;
  }
}

function setAnnotating(on) {
  try {
    if (on) localStorage.setItem(ANNOTATE_KEY, 'on');
    else localStorage.removeItem(ANNOTATE_KEY);
  } catch {
    // Storage blocked. The layer still works for this page load.
  }
}

/**
 * Offer the layer to somebody who may use it, per 7i.
 *
 * **Gated on a hint, exactly like the staff link above**, and for the same
 * reason: this runs on every page of the site for every reader, and asking the
 * server whether each of them is a translation helper would spend a request per
 * page to serve the handful who are. api.js records the answer once an account
 * page has read the roster, and staff already carry their own hint.
 *
 * **The module is loaded only when the layer is switched on.** 7i: "To everyone
 * else the attributes are inert markup and the layer does not load at all." The
 * dynamic import is what makes that literally true and not a claim about
 * behaviour: annotate.js is never fetched by a reader who cannot use it.
 *
 * The server is still asked before the toggle is drawn, because a hint is a
 * hint: a revoked helper has a stale flag in localStorage and gets no toggle,
 * and the endpoint answers `can: false` instead of refusing, since not holding
 * a role is a state, not an error.
 */
async function offerAnnotationLayer() {
  if (!hasHelperHint() && !hasStaffHint()) return;

  const nav = document.querySelector('#siteNav');
  if (!nav || nav.querySelector('#navSuggest')) return;

  const result = await api('/api/translations/annotations', { locale: false });

  if (!result.ok) {
    // The feature switched off from /admin/maintenance answers 503, and a
    // network failure answers nothing. **The hint is left exactly as it was**
    // either way: clearing it here would mean an outage quietly demoting every
    // helper in the building, and they would each have to visit their account
    // area to be recognised again once it came back.
    return;
  }

  if (result.data?.can !== true) {
    // A stale hint, which is what a revoked role looks like from here. Cleared,
    // so the question is not asked again on every page of this browser.
    noteHelperSession(false);
    return;
  }

  if (result.data.realm === 'applicant') noteHelperSession(true);

  const context = {
    locales: result.data.locales ?? [],
    // False for staff, per deviation 52: they get the underlines and not the
    // box. It changes what the switch says as well as what it does, because
    // "suggest corrections" would be the wrong name for what they are turning
    // on.
    canSuggest: result.data.can_suggest === true,
    realm: result.data.realm,
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'navSuggest';
  button.className = 'nav-suggest';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML =
    '<span data-icon="globe" data-icon-size="18"></span>' +
    `<span data-i18n="${
      context.canSuggest ? 'annotate.toggle' : 'annotate.toggleReadOnly'
    }"></span>`;

  // Beside the account item instead of first: this is a tool somebody turns on
  // while reading, not a way to somewhere else.
  const signOut = nav.querySelector('.nav-signout');
  if (signOut) signOut.before(button);
  else nav.append(button);

  hydrateIcons(nav);
  translateNewChrome(nav);

  // The state is on the button, not in a variable, so aria-pressed and
  // what is actually running cannot disagree. A screen reader announces the
  // change from the pressed state itself; the title carries the Alt and S
  // shortcut, which is the one thing a pressed state cannot say.
  const apply = async (on) => {
    button.setAttribute('aria-pressed', on ? 'true' : 'false');

    // Set now and declared for later. The sentence depends on which way the
    // switch is set, so it cannot live in the markup, and a title written once
    // would still be in the old language after somebody used the globe.
    const key = !context.canSuggest
      ? 'annotate.readOnlyHint'
      : on
        ? 'annotate.toggleOnHint'
        : 'annotate.toggleOffHint';
    button.setAttribute('data-i18n-attr', `title:${key}`);
    button.title = t(key);

    if (!on) {
      annotateModule?.stopAnnotating();
      return;
    }

    annotateModule = annotateModule ?? (await import('./annotate.js'));
    annotateModule.startAnnotating(context);
  };

  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    setAnnotating(next);
    apply(next).catch((cause) => {
      // A failed dynamic import is the realistic case: offline, or a deploy
      // mid-session. The switch goes back instead of sitting on with nothing
      // behind it, which would be a control that did nothing.
      console.error('[careers-gftv] annotation layer:', cause);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('data-i18n-attr', 'title:annotate.toggleOffHint');
      button.title = t('annotate.toggleOffHint');
      setAnnotating(false);
    });
  });

  await apply(annotatingOn());
}

/**
 * A staff session the dashboard proved, held for whichever of the two arrives
 * second.
 *
 * The listener is registered at module scope, not inside boot(), on
 * purpose. boot() awaits the dictionary and the build status file before it
 * reaches its own reflect call, and the dashboard shell awaits one request, so
 * either can finish first. Registered here, the event is never missed; held in
 * a variable, it is not lost when it arrives before the header exists to put
 * the item in.
 */
let knownStaff = null;

document.addEventListener('gftv:staffsession', (event) => {
  knownStaff = event.detail ?? null;
  // A no-op when the header has not been drawn yet, which is the case boot()
  // covers by passing knownStaff to its own call.
  reflectStaffSession(knownStaff);
});

// The nav item added above carries a data-i18n key that was never present when
// the language was first applied, so it needs one pass of its own. Later
// language changes reach it through the shell's ordinary retranslation.
function translateNewChrome(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

/**
 * The portal title from 8.10, in the header and the footer.
 *
 * The name is a dictionary key by default, and a setting when somebody has
 * written one. Applied in three passes instead of one, which is what makes it
 * arrive without a flash of the old name: what this browser saw last time goes
 * on immediately, the network answer replaces it when it lands, and a language
 * change asks again because the wording is per language.
 *
 * Clearing the setting restores the dictionary instead of leaving the last
 * value on screen, which is why the data-i18n attribute is put back and not
 * simply overwritten. Without that, emptying the field on the settings page
 * would look like a save that did nothing.
 */
function applyPortalTitle(title = cachedPortalTitle()) {
  document.querySelectorAll('[data-brand-name]').forEach((node) => {
    if (title) {
      node.removeAttribute('data-i18n');
      node.textContent = title;
    } else {
      node.setAttribute('data-i18n', 'brand.name');
      node.textContent = t('brand.name');
    }
  });
}

async function boot() {
  initTheme();

  const { header, backdrop } = renderHeader();
  const themeModal = renderThemeModal();
  const languageModal = renderLanguageModal();
  renderFooter();

  hydrateIcons(document);
  wireNav(header, backdrop);
  wireThemeModal(themeModal);
  wireLanguageModal(languageModal);

  // Language is applied after the chrome exists, so one pass translates the
  // header, the footer, the modals, and the page's own markup together.
  await initI18n();

  const status = await loadBuildStatus();

  // The maintenance overrides, alongside the build status and before the first
  // gating pass. Without this every public page gates on "has the phase
  // shipped" alone: isFeatureOff reads a module level cache that only this call
  // fills, so a feature an admin had switched off stayed fully enabled
  // everywhere outside the dashboard and /status, which are the two places that
  // loaded it themselves. The API still answered 503, so the control worked and
  // then failed, which is the worst of the three possible behaviours.
  //
  // Not awaited as part of the same expression as loadBuildStatus, because a
  // failure to read the overrides must leave the site working with everything
  // on instead of holding the page: that is the direction to fail in, and it
  // is why the loader resolves to an empty map and never rejects.
  await loadFeatureOverrides();

  const paint = () => {
    renderPhaseNotice(status);
    applyFeatureGating(status);
    renderPlaceholder(status);
    applyPortalTitle();
  };

  paint();

  // After the first paint, so the connection bar sits above a phase notice that
  // already exists rather than racing it for the top of the body. Its own
  // strings redraw on a language change, like everything else drawn from here.
  initOffline();

  // Section 14's other flush path, and the one every browser takes: anything
  // queued while offline goes on the next page load with a connection. Not
  // awaited — nothing on screen waits for it, and it says what happened by
  // event rather than by return value.
  initQueue();

  // These render their own strings instead of carrying data-i18n attributes,
  // so they are redrawn on a language change and not retranslated in place.
  document.addEventListener('gftv:localechange', paint);

  // The portal title, per 8.10. Not awaited: the header is already drawn and
  // correct, and this only replaces the name when an admin has set one. A
  // failed request leaves the dictionary's name, which is the right answer to
  // "we could not ask".
  loadSiteSettings().then((settings) => {
    if (settings) applyPortalTitle(settings.portal_title ?? '');
  });

  document.addEventListener('gftv:localechange', () => {
    loadSiteSettings().then((settings) => {
      if (settings) applyPortalTitle(settings.portal_title ?? '');
    });
  });

  // Last, and not awaited by anything above it. Whether somebody is signed in
  // changes one item in the navigation and nothing else, so it must never be
  // on the path that gets the page drawn.
  // Section 14: on a login whose user id differs from the one stored, wipe the
  // database **before anything is written**. Done here rather than inside
  // reflectApplicantSession, which returns early on any page whose nav is not
  // where it expects — a wipe that depends on a header having rendered is a
  // wipe that will one day not happen. It shares the cached session promise, so
  // it costs no request of its own, and a null session deliberately does
  // nothing: offline that request fails every time, and treating a failure as a
  // sign out would throw the offline copy away exactly when it is the only one.
  applicantSession().then((session) => syncUser(session?.user?.id ?? null));

  reflectApplicantSession();
  // knownStaff is set by the listener above when the dashboard got there first,
  // which it can: boot() awaits two fetches before reaching this line. Null
  // falls back to the hint and behaves exactly as it did before.
  reflectStaffSession(knownStaff);

  // 7i's layer, for the handful of people who may use it. Not awaited, gated on
  // a hint, and it loads no code at all for anybody else.
  offerAnnotationLayer().catch((cause) => {
    console.error('[careers-gftv] annotation layer:', cause);
  });

  // 7c: the outstanding apply prompt follows the applicant across the portal
  // instead of living on the posting they started from, so the check runs on
  // every page. It shares the session request above and does not make its own,
  // and does nothing at all for a logged out reader.
  //
  // **Except inside the staff dashboard.** Being signed into both realms on one
  // browser is supported and expected, and this header is the same one /admin
  // draws, so a staff member who had also applied for something got the
  // applicant's "have you applied?" modal opening over the dashboard: a modal
  // about their own application, on a page about everybody else's, intercepting
  // pointer events across the whole screen until it was dismissed. It appeared
  // in any tab that had not already shown it, which is every new tab, because
  // the once-a-visit guard is in sessionStorage.
  //
  // Nothing is lost by skipping it here. The prompt is not dismissed and not
  // marked shown; it is simply not raised on a page belonging to the other
  // realm, and it opens on the next public or account page as it always did.
  if (!window.location.pathname.startsWith('/admin')) resumePendingPrompt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
