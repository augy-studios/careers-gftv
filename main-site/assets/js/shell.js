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
import { initI18n, applyLocale, getLocale, t, LOCALES } from './i18n.js';
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
// Labels are dictionary keys rather than text. translateDom fills them in and
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
      // The privacy notice and the terms are GFTV wide rather than specific to
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
 * without warning is a WCAG 3.2.5 problem rather than a style choice.
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
        <span data-i18n="brand.name"></span>
      </a>

      <button type="button" class="icon-btn nav-toggle" id="navToggle"
              aria-expanded="false" aria-controls="siteNav"
              data-i18n-attr="aria-label:common.openMenu">
        <span data-icon="menu" data-icon-size="22"></span>
      </button>

      <!-- The language control is its own button rather than a section inside
           the theme modal. Someone who reads only Mandarin and lands on the
           English site cannot be expected to find a switch labelled "Theme",
           whereas a globe is legible without reading anything. -->
      <button type="button" class="icon-btn" id="languageButton"
              aria-haspopup="dialog"
              data-i18n-attr="aria-label:common.language">
        <span data-icon="globe" data-icon-size="22"></span>
      </button>

      <button type="button" class="icon-btn" id="themeButton"
              aria-haspopup="dialog"
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

  document.body.prepend(header);
  return { header, backdrop };
}

function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div>
        <h2 data-i18n="brand.name"></h2>
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

function renderThemeModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop hidden';
  wrap.id = 'themeModal';
  wrap.innerHTML = `
    <div class="modal glass-card" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
      <div class="modal-head">
        <h2 id="themeModalTitle" data-i18n="theme.title"></h2>
        <button class="icon-btn small" type="button" data-close-modal="themeModal"
                data-i18n-attr="aria-label:common.close">
          <span data-icon="close" data-icon-size="18"></span>
        </button>
      </div>
      <p class="modal-section-label" data-i18n="theme.mode"></p>
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-btn" type="button" data-mode="light" aria-pressed="false">
          <span data-icon="sun" data-icon-size="18"></span><span data-i18n="theme.light"></span>
        </button>
        <button class="mode-btn" type="button" data-mode="dark" aria-pressed="false">
          <span data-icon="moon" data-icon-size="18"></span><span data-i18n="theme.dark"></span>
        </button>
      </div>
      <p class="modal-section-label" data-i18n="theme.colourTheme"></p>
      <div class="swatch-grid" id="swatchGrid"></div>
    </div>
  `;
  document.body.append(wrap);
  return wrap;
}

// Same structure and same behaviour as the theme modal, deliberately.
//
// Each language is named in its own script, never translated. A reader looking
// for Chinese looks for the characters, not for the English word "Chinese",
// so both options read the same whichever language the interface is currently
// in. That is why these two labels are hardcoded rather than dictionary keys.
function renderLanguageModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop hidden';
  wrap.id = 'languageModal';
  wrap.innerHTML = `
    <div class="modal glass-card" role="dialog" aria-modal="true" aria-labelledby="languageModalTitle">
      <div class="modal-head">
        <h2 id="languageModalTitle" data-i18n="language.title"></h2>
        <button class="icon-btn small" type="button" data-close-modal="languageModal"
                data-i18n-attr="aria-label:common.close">
          <span data-icon="close" data-icon-size="18"></span>
        </button>
      </div>
      <div class="locale-list" id="localeList">
        ${LOCALES.map(
          (locale) => `
          <button class="locale-btn" type="button" data-locale="${locale.id}"
                  lang="${locale.htmlLang}" aria-pressed="false">
            <span class="locale-native">${locale.native}</span>
            <span class="locale-check" data-icon="check" data-icon-size="18"></span>
          </button>`
        ).join('')}
      </div>
      <p class="locale-note" data-i18n="language.description"></p>
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

  // The label is a dictionary key rather than theme.label, so the swatch names
  // follow the language. translateDom refills them on every change, which is
  // why the grid is built once here and never rebuilt.
  grid.innerHTML = COLOR_THEMES.map(
    (theme) => `
      <button type="button" class="swatch" data-color-theme="${theme.id}"
              style="--swatch-color: ${theme.hex}" aria-pressed="false">
        <span class="swatch-dot" aria-hidden="true"></span>
        <span data-i18n="theme.${theme.id}">${theme.label}</span>
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

    if (button) {
      button.setAttribute(
        'aria-label',
        t('common.appearanceWithMode', {
          mode: t(mode === 'dark' ? 'common.modeDark' : 'common.modeLight'),
        })
      );
    }
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

function wireLanguageModal(modal) {
  const button = document.querySelector('#languageButton');
  const panel = modal.querySelector('.modal');
  const list = modal.querySelector('#localeList');
  let lastFocus = null;

  function sync() {
    const current = getLocale();
    list.querySelectorAll('.locale-btn').forEach((el) => {
      const active = el.getAttribute('data-locale') === current;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
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

  // Choosing a language updates the modal in place and leaves it open, exactly
  // as the theme modal does. Closing stays a separate, explicit action, so
  // somebody who picked the wrong one can correct it without reopening.
  list.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-locale]');
    if (!choice) return;
    applyLocale(choice.getAttribute('data-locale')).then(sync);
  });

  document.addEventListener('gftv:localechange', sync);
  sync();
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

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
  const paint = () => {
    renderPhaseNotice(status);
    applyFeatureGating(status);
    renderPlaceholder(status);
  };

  paint();

  // These three render their own strings rather than carrying data-i18n
  // attributes, so they are redrawn on a language change rather than
  // retranslated in place.
  document.addEventListener('gftv:localechange', paint);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
