// The official site banner, from gftv-official.md. Phase 15 part 3, the last
// thing in the build, and the one piece of chrome that never goes away.
//
// **What it is, and what it is not.** A slim bar at the very top of every page
// saying this is an official Global Furry Television website, with a control
// that opens a panel teaching how to check that: read the address from the
// end, and look for HTTPS. It is modelled on the Singapore Government masthead
// and has that masthead's limit, which the file is honest about: any phishing
// site can copy it in an afternoon. Its value is the rule it teaches, so the
// copy states the domains and how to read one and never says "safe" or
// "verified". Nothing here changes that and nothing here may.
//
// **Not dismissible.** No close control, nothing stored that hides it. What is
// stored is whether the reader opened the panel, per site, so somebody who
// opened it once is not made to open it again. That is the file's own
// distinction and it is the whole of the storage.
//
// **It replaces the phase notice**, section 0c, and the two are never on the
// page together. shell.js draws this when every phase has shipped and the
// notice otherwise; they share the top of the body and the file says two bars
// above the header is worse than either. The docs site has no notice and draws
// this from its first deploy with it.
//
// **One implementation, generated into both sites** by gen-docs-lib.js, which
// is the build's answer for everything the two shells share. The portal puts
// the bar in its stack through top-bars.js; the docs site has one bar and a
// header in its markup, and mountOfficialBar takes an `insert` for the same
// reason connection-bar.js does.
//
// The domain list is the one place the domains are, and the heading is
// rendered from it, so adding a domain is one edit and not a search through
// copy.
//
// The mark is the GFTV flag, /gftv-flag.png, a 72 by 48 copy of the flag in
// the repository root drawn at 24 by 16, asked for on 13 September 2026 in
// place of an SVG glyph. It is decorative, so the alt is empty. Both sites
// serve it from their root, the docs site's copy through gen-docs-lib.js.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

/** Every ending an official GFTV site has. Subdomains of these are official. */
export const OFFICIAL_DOMAINS = Object.freeze(['globalfurry.tv', 'gftv.asia']);

/**
 * The trusted sites page the file waited for. Given on 12 September 2026, and
 * the link ships with the banner and not before, per the file: a trust banner
 * whose link is a 404 does more harm than one with no link.
 */
export const TRUSTED_SITES_URL = 'https://gftv.asia/trusted-sites';

// Per site, because storage is per origin: opening the panel on the portal does
// not open it on the docs site, which is what "remembered per site" means.
const OPEN_KEY = 'gftv-careers.officialBarOpen';

// The same 150 to 220ms as everything else in the theme.
const MOTION_MS = 180;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberOpen(open) {
  try {
    if (open) localStorage.setItem(OPEN_KEY, '1');
    else localStorage.removeItem(OPEN_KEY);
  } catch {
    // Storage blocked. The panel still opens for this visit.
  }
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The bar, built once and returned again on a second call.
 *
 * Idempotent, as every bar in this build is: a language change asks for it
 * again, and the answer is the element already on the page with its strings
 * refilled. Static strings carry data-i18n and are refilled by translateDom;
 * the domain heading is built from the list and refilled here.
 *
 * @returns {HTMLElement}
 */
export function renderOfficialBar() {
  const existing = document.getElementById('officialBar');
  if (existing) {
    fillDomains(existing);
    return existing;
  }

  const bar = document.createElement('div');
  bar.className = 'gov-bar';
  bar.id = 'officialBar';
  // Not a landmark of its own and not a dialog: page content, per the file.
  bar.innerHTML = `
    <div class="gov-bar-inner">
      <img class="gov-bar-mark" src="/gftv-flag.png" alt="" width="24" height="16" decoding="async">
      <p class="gov-bar-line" data-i18n="official.line"></p>
      <button type="button" class="gov-bar-toggle" id="officialBarToggle"
              aria-expanded="false" aria-controls="officialBarPanel">
        <span data-i18n="official.toggle"></span>
        <span data-icon="chevronDown" data-icon-size="16" aria-hidden="true"></span>
      </button>
    </div>
    <div class="gov-bar-panel" id="officialBarPanel" hidden>
      <div class="gov-bar-panel-inner">
        <div class="gov-bar-point">
          <span data-icon="globe" data-icon-size="20" aria-hidden="true"></span>
          <div>
            <h2 data-official-domains></h2>
            <p data-i18n="official.domainBody"></p>
            <p><a href="${escapeHtml(TRUSTED_SITES_URL)}" data-i18n="official.trustedLink"></a></p>
          </div>
        </div>
        <div class="gov-bar-point">
          <span data-icon="lock" data-icon-size="20" aria-hidden="true"></span>
          <div>
            <h2 data-i18n="official.secureHeading"></h2>
            <p data-i18n="official.secureBody"></p>
          </div>
        </div>
      </div>
    </div>`;

  fillStrings(bar);
  fillDomains(bar);
  hydrateIcons(bar);
  wire(bar);

  document.addEventListener('gftv:localechange', () => {
    fillStrings(bar);
    fillDomains(bar);
  });

  return bar;
}

/** The static strings, for a bar drawn before or after translateDom ran. */
function fillStrings(bar) {
  bar.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

/** The domain heading, from the list and never from copy. */
function fillDomains(bar) {
  const heading = bar.querySelector('[data-official-domains]');
  if (!heading) return;
  heading.textContent = t('official.domainHeading', {
    domains: OFFICIAL_DOMAINS.join(t('official.domainJoin')),
  });
}

function wire(bar) {
  const toggle = bar.querySelector('#officialBarToggle');
  const panel = bar.querySelector('#officialBarPanel');
  if (!toggle || !panel) return;

  // hidden while collapsed, so the panel is out of the accessibility tree and
  // not merely invisible. The animation runs on data-open between the two
  // states: hidden comes off, then the grid row grows; the row shrinks, then
  // hidden goes on. Under reduced motion both happen at once.
  const setOpen = (open, { animate = true } = {}) => {
    toggle.setAttribute('aria-expanded', String(open));
    bar.classList.toggle('is-open', open);

    if (!animate || reducedMotion()) {
      panel.hidden = !open;
      panel.dataset.open = String(open);
      return;
    }

    if (open) {
      panel.hidden = false;
      requestAnimationFrame(() => {
        panel.dataset.open = 'true';
      });
    } else {
      panel.dataset.open = 'false';
      setTimeout(() => {
        if (panel.dataset.open === 'false') panel.hidden = true;
      }, MOTION_MS);
    }
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    rememberOpen(open);
    setOpen(open);
  });

  setOpen(readOpen(), { animate: false });
}

/**
 * Put the bar at the top of the body, for a site with no bar stack.
 *
 * `insert` places the element; the default is below the skip link when there
 * is one and at the top of the body when there is not, which is the rule the
 * portal's top-bars.js states for its whole stack.
 *
 * @param {{ insert?: (bar: HTMLElement) => void }} [options]
 * @returns {HTMLElement}
 */
export function mountOfficialBar({ insert } = {}) {
  const bar = renderOfficialBar();
  if (bar.isConnected) return bar;
  if (insert) {
    insert(bar);
    return bar;
  }
  const skip = document.body.querySelector(':scope > .skip-link');
  if (skip) skip.after(bar);
  else document.body.prepend(bar);
  return bar;
}
