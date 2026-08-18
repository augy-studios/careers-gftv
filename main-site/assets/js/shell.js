// The shared shell: header, navigation, footer, theme modal, and the phase
// notice. Imported by every page as the single entry point.
//
//   <script type="module" src="/assets/js/shell.js"></script>
//
// The chrome is rendered here rather than copied into every HTML file, since a
// header duplicated across twenty files is a header that drifts. Page content
// stays in the HTML.
//
// Section 3 rules that this file is responsible for: the hamburger panel opens
// from the left, traps focus while open, closes on Escape, on backdrop tap, and
// on navigating away, has an obvious close control, is reachable by keyboard,
// sets aria-expanded on the trigger and aria-hidden on the panel, and locks
// body scroll while open. The theme modal follows the same rules.

import { initTheme, applyColorTheme, applyMode, getStoredColorTheme, getStoredMode, COLOR_THEMES } from './theme.js';
import { hydrateIcons } from './icons.js';
import {
  loadBuildStatus,
  renderPhaseNotice,
  applyFeatureGating,
  renderPlaceholder,
} from './build-status.js';

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

// Every entry is a real route. A route belonging to a later phase renders the
// placeholder page rather than a dead link, per section 0c, so nothing here is
// disabled or hidden.
const NAV = [
  { href: '/search', label: 'Find a role', icon: 'search' },
  { href: '/account/applications', label: 'My applications', icon: 'briefcase' },
  { href: '/status', label: 'Build status', icon: 'build' },
  { href: '/login', label: 'Sign in', icon: 'chevron-right' },
];

const FOOTER = [
  {
    heading: 'Roles',
    links: [
      { href: '/search', label: 'All openings' },
      { href: '/search?closing_within_days=14', label: 'Closing soon' },
      { href: '/search?no_deadline=true', label: 'Open until filled' },
    ],
  },
  {
    heading: 'Your account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create an account' },
      { href: '/account/tasks', label: 'Outstanding tasks' },
    ],
  },
  {
    heading: 'About',
    links: [
      { href: '/about', label: 'About Careers@GFTV' },
      { href: '/faq', label: 'Frequently asked questions' },
      { href: '/status', label: 'Build status' },
      { href: '/privacy', label: 'Privacy notice' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

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
        Careers@GFTV
      </a>

      <button type="button" class="icon-btn nav-toggle" id="navToggle"
              aria-expanded="false" aria-controls="siteNav" aria-label="Open menu">
        <span data-icon="menu" data-icon-size="22"></span>
      </button>

      <button type="button" class="icon-btn" id="themeButton"
              aria-haspopup="dialog" aria-label="Theme and appearance">
        <span data-icon="palette" data-icon-size="22"></span>
      </button>

      <nav class="site-nav" id="siteNav" aria-label="Main" aria-hidden="true">
        <div class="site-nav-head">
          <span class="modal-section-label">Menu</span>
          <button type="button" class="icon-btn small" data-close-nav aria-label="Close menu">
            <span data-icon="close" data-icon-size="18"></span>
          </button>
        </div>
        ${NAV.map((item) => {
          const current = path === item.href.split('?')[0] ? ' aria-current="page"' : '';
          return `<a href="${item.href}"${current}><span data-icon="${item.icon}" data-icon-size="18"></span>${item.label}</a>`;
        }).join('')}
      </nav>
    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('data-close-nav', '');

  document.body.prepend(backdrop);
  document.body.prepend(header);
  return { header, backdrop };
}

function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div>
        <h2>Careers@GFTV</h2>
        <p>Volunteer and staff openings at Global Furry Television. Browsing and
           reading a posting needs no account. Applying does.</p>
      </div>
      ${FOOTER.map(
        (group) => `
        <div>
          <h2>${group.heading}</h2>
          <ul>
            ${group.links.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join('')}
          </ul>
        </div>`
      ).join('')}
      <p class="site-footer-legal">
        Careers@GFTV is being built and released in phases.
        <a href="/status">See what is live</a>.
      </p>
    </div>
  `;
  document.body.append(footer);
  return footer;
}

function renderThemeModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop hidden';
  wrap.id = 'themeModal';
  wrap.innerHTML = `
    <div class="modal glass-card" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
      <div class="modal-head">
        <h2 id="themeModalTitle">Theme</h2>
        <button class="icon-btn small" type="button" data-close-modal="themeModal" aria-label="Close">
          <span data-icon="close" data-icon-size="18"></span>
        </button>
      </div>
      <p class="modal-section-label">Mode</p>
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-btn" type="button" data-mode="light" aria-pressed="false">
          <span data-icon="sun" data-icon-size="18"></span>Light
        </button>
        <button class="mode-btn" type="button" data-mode="dark" aria-pressed="false">
          <span data-icon="moon" data-icon-size="18"></span>Dark
        </button>
      </div>
      <p class="modal-section-label">Colour theme</p>
      <div class="swatch-grid" id="swatchGrid"></div>
    </div>
  `;
  document.body.append(wrap);
  return wrap;
}

/* -------------------------------------------------------------------------
 * Focus trapping, shared by the nav panel and the theme modal
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
    toggle.setAttribute('aria-label', 'Close menu');
    backdrop.hidden = false;
    lockScroll(true);
    nav.querySelector(FOCUSABLE)?.focus();
  }

  function close() {
    nav.removeAttribute('data-open');
    nav.setAttribute('aria-hidden', isOffCanvas() ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
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

function wireThemeModal(modal) {
  const button = document.querySelector('#themeButton');
  const grid = modal.querySelector('#swatchGrid');
  const modeButtons = [...modal.querySelectorAll('.mode-btn')];
  const panel = modal.querySelector('.modal');
  let lastFocus = null;

  grid.innerHTML = COLOR_THEMES.map(
    (theme) => `
      <button type="button" class="swatch" data-color-theme="${theme.id}"
              style="--swatch-color: ${theme.hex}" aria-pressed="false">
        <span class="swatch-dot" aria-hidden="true"></span>${theme.label}
      </button>`
  ).join('');

  function sync() {
    const colour = getStoredColorTheme();
    const mode = getStoredMode();

    grid.querySelectorAll('.swatch').forEach((el) => {
      const active = el.getAttribute('data-color-theme') === colour;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });

    modeButtons.forEach((el) => {
      const active = el.getAttribute('data-mode') === mode;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });

    const themeIcon = button?.querySelector('svg');
    if (themeIcon) button.setAttribute('aria-label', `Theme and appearance, currently ${mode} mode`);
  }

  function open() {
    lastFocus = document.activeElement;
    modal.classList.remove('hidden');
    lockScroll(true);
    panel.querySelector(FOCUSABLE)?.focus();
  }

  function close() {
    modal.classList.add('hidden');
    lockScroll(false);
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  button?.addEventListener('click', open);

  modal.addEventListener('click', (event) => {
    // Backdrop click closes, same as every other modal on the site.
    if (event.target === modal) close();
    if (event.target.closest('[data-close-modal]')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapFocus(panel, event);
    }
  });

  // Selecting a swatch or a mode updates the modal in place and never closes
  // it. Closing is a separate explicit action.
  grid.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color-theme]');
    if (!swatch) return;
    applyColorTheme(swatch.getAttribute('data-color-theme'));
    sync();
  });

  modeButtons.forEach((el) => {
    el.addEventListener('click', () => {
      applyMode(el.getAttribute('data-mode'));
      sync();
    });
  });

  sync();
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

function boot() {
  initTheme();

  const { header, backdrop } = renderHeader();
  const modal = renderThemeModal();
  renderFooter();

  hydrateIcons(document);
  wireNav(header, backdrop);
  wireThemeModal(modal);

  loadBuildStatus().then((status) => {
    renderPhaseNotice(status);
    applyFeatureGating(status);
    renderPlaceholder(status);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
