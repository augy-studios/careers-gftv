// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The documentation shell: the sidebar, the on-page contents, the account
// control, the mode toggle, and the page itself.
//
// **One shell, both pipelines.** 16e: "a reader must not be able to tell which
// pipeline a page came from." A gated page arrives here as markdown from
// /api/content and is rendered in the browser; a public page is rendered into
// the same document by part 5's build script and arrives already in the DOM.
// This file handles both, and the only thing it branches on is whether the
// article it found was already filled in.
//
// **Nothing here decides what a reader may see.** The sidebar is whatever
// /api/nav returned, and that endpoint filtered it against the session on the
// server. There is deliberately no tier in this file and no comparison against
// one: a gate that runs in the browser is not a gate, and one that runs in both
// places is a gate that can disagree with itself.
//
// The portal's shell.js is not the ancestor of this one. That file draws a
// navigation bar, a footer, a theme modal, a notice bar and a build status
// banner for an application; this draws a manual.

import { initTheme, applyMode } from './theme.js';
import { initI18n, t, translateDom } from './i18n.js';
import { render } from './markdown.js';

const CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
  '<path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.6"' +
  ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

const MENU_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  '<path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" stroke-width="1.6"' +
  ' stroke-linecap="round"/></svg>';

const el = (id) => document.getElementById(id);

/** Every string that reaches the DOM as markup goes through this first. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One JSON call, in the shape respond.js answers in.
 *
 * The status comes back with the data because **a 404 and a failure are
 * different things and must not be drawn the same way**. Phase 10's rule, in
 * its third shape: a failed request is a third state and never a No. A page
 * that is not there says so; a request that did not arrive says that instead,
 * because telling somebody their page does not exist when the network dropped
 * is the site being wrong with confidence.
 *
 * What stays deliberately indistinguishable is the pair inside the 404: a page
 * nobody wrote and a page above the reader's tier, per 16a. The server already
 * collapsed those into one answer and nothing here can separate them.
 *
 * @returns {{ ok: boolean, status: number, data: unknown }} status 0 is a
 *          request that never completed.
 */
async function get(path) {
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    return { ok: body?.ok === true, status: response.status, data: body?.data ?? null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/* -------------------------------------------------------------------------
 * The header
 * ---------------------------------------------------------------------- */

function drawMode() {
  const button = el('docsMode');
  if (!button) return;

  const dark = document.documentElement.getAttribute('data-mode') === 'dark';
  button.textContent = t(dark ? 'header.modeDark' : 'header.modeLight');
  button.setAttribute('aria-label', t(dark ? 'header.modeLabelDark' : 'header.modeLabel'));
}

function wireMode() {
  const button = el('docsMode');
  if (!button) return;

  button.addEventListener('click', () => {
    // Two states here, and three in the portal's switcher. 16d asks this header
    // for a light and dark toggle, so the time based preference is reachable on
    // the portal and not here; a reader who has chosen it there keeps it, and
    // pressing this once replaces it with an explicit choice.
    applyMode(document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark');
    drawMode();
  });
}

/**
 * The account control: a sign in link, or the reader's name and role with a
 * menu. 16b, and it keeps its place at every width.
 */
function drawAccount(reader) {
  const mount = el('docsAccount');
  if (!mount) return;

  if (!reader?.signed_in) {
    mount.innerHTML =
      '<a class="docs-btn" href="/login" data-i18n="account.signIn"' +
      ' data-i18n-attr="title:account.signInHint">Sign in</a>';
    translateDom(mount);
    return;
  }

  // The role in words a reader recognises, per 16b. The tier the server sent is
  // deliberately not shown: "developer" is a word this site invented for its own
  // sidebar and says nothing true about somebody's account.
  const role = reader.role === 'admin' ? t('account.roleAdmin') : t('account.rolePoster');

  mount.innerHTML =
    '<button type="button" class="docs-btn" id="docsAccountBtn" aria-expanded="false"' +
    ` aria-haspopup="menu">${escapeHtml(reader.username ?? '')}` +
    ` <span class="docs-account-role">${escapeHtml(role)}</span></button>` +
    `<div class="docs-account-menu" id="docsAccountMenu" role="menu" hidden` +
    ` aria-label="${escapeHtml(t('account.menu'))}">` +
    '<a role="menuitem" href="/account" data-i18n="account.settings">Account settings</a>' +
    '<button role="menuitem" type="button" id="docsSignOut" data-i18n="account.signOut">Sign out</button>' +
    '</div>';

  translateDom(mount);

  const button = el('docsAccountBtn');
  const menu = el('docsAccountMenu');

  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!mount.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      close();
      button.focus();
    }
  });

  el('docsSignOut').addEventListener('click', async (event) => {
    const control = event.currentTarget;
    control.disabled = true;
    control.textContent = t('account.signingOut');

    try {
      const response = await fetch('/api/auth/staff/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(String(response.status));
      // A full load and not a redraw. Signing out changes what the sidebar is
      // allowed to contain, and the server is the only thing that knows the new
      // answer.
      window.location.assign('/');
    } catch {
      control.disabled = false;
      control.textContent = t('account.signOutFailed');
    }
  });
}

/* -------------------------------------------------------------------------
 * The sidebar
 * ---------------------------------------------------------------------- */

function drawSidebar(nav, currentPath) {
  const mount = el('docsSidebar');
  if (!mount) return;

  const link = (page) =>
    `<li><a href="${escapeHtml(page.path)}"` +
    `${page.path === currentPath ? ' aria-current="page"' : ''}>` +
    `${escapeHtml(page.title)}</a></li>`;

  const parts = [];

  if (nav.home) {
    parts.push(`<ul class="docs-sidebar-top">${link(nav.home)}</ul>`);
  }

  // The staff home sits above the gated sections as their own heading would, so
  // a reader who has just signed in can see where the staff half starts. A
  // signed out reader has neither, and no padlock in place of them: 16a is
  // explicit that locked entries teach nothing and invite guessing at URLs.
  const sections = [...nav.sections];
  if (nav.staff_home) {
    parts.push(`<ul class="docs-sidebar-top">${link(nav.staff_home)}</ul>`);
  }

  for (const section of sections) {
    const open = section.pages.some((page) => page.path === currentPath);
    const id = `docs-nav-${escapeHtml(section.pipeline)}-${escapeHtml(section.slug)}`;

    parts.push(
      '<div class="docs-sidebar-section">' +
        `<button type="button" class="docs-sidebar-heading" aria-expanded="${open ? 'true' : 'false'}"` +
        ` aria-controls="${id}">${escapeHtml(section.title)}${CHEVRON}</button>` +
        `<ul id="${id}"${open ? '' : ' hidden'}>${section.pages.map(link).join('')}</ul>` +
        '</div>'
    );
  }

  // The portal link's second home. Below 640px the header has no room for it,
  // so it is here instead, and the stylesheet shows exactly one of the two.
  parts.push(
    '<div class="docs-sidebar-foot">' +
      '<a href="https://careers.globalfurry.tv" data-i18n="header.portal">The portal</a></div>'
  );

  mount.innerHTML = parts.join('');
  translateDom(mount);

  mount.addEventListener('click', (event) => {
    const heading = event.target.closest('.docs-sidebar-heading');
    if (!heading) return;
    const list = document.getElementById(heading.getAttribute('aria-controls'));
    const open = heading.getAttribute('aria-expanded') === 'true';
    heading.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (list) list.hidden = open;
  });
}

/** The off canvas panel, below 640px. */
function wireMenu() {
  const button = el('docsMenu');
  const sidebar = el('docsSidebar');
  if (!button || !sidebar) return;

  button.innerHTML = MENU_ICON;
  button.setAttribute('aria-label', t('header.menu'));

  let scrim = null;

  const close = () => {
    sidebar.removeAttribute('data-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', t('header.menu'));
    scrim?.remove();
    scrim = null;
  };

  const open = () => {
    sidebar.setAttribute('data-open', 'true');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', t('header.menuClose'));
    scrim = document.createElement('div');
    scrim.className = 'docs-scrim';
    scrim.addEventListener('click', close);
    document.body.appendChild(scrim);
    sidebar.querySelector('a, button')?.focus();
  };

  button.addEventListener('click', () => {
    if (sidebar.getAttribute('data-open') === 'true') close();
    else open();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.getAttribute('data-open') === 'true') {
      close();
      button.focus();
    }
  });

  // Following a link inside the panel has to shut it, or the reader arrives at
  // the new page with the menu still over it.
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
}

/* -------------------------------------------------------------------------
 * The page
 * ---------------------------------------------------------------------- */

function drawBreadcrumbs(page, nav) {
  const mount = el('docsBreadcrumbs');
  if (!mount) return;

  const trail = [{ path: '/', title: t('nav.breadcrumbHome') }];

  if (page.section) {
    const section = nav.sections.find(
      (candidate) => candidate.slug === page.section && candidate.pipeline === page.pipeline
    );
    if (section && section.path !== page.path) trail.push(section);
  }

  mount.innerHTML = trail
    .filter((entry) => entry.path !== page.path)
    .map((entry) => `<a href="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</a>`)
    .join('<span>/</span>');
}

function drawPager(prev, next) {
  const mount = el('docsPager');
  if (!mount) return;

  // 16e: previous and next never point at a page the reader cannot open. That
  // is already true of whatever arrived here, because the server built both
  // from the same filtered order it built the sidebar from.
  const entry = (page, direction, labelKey) =>
    page
      ? `<a class="docs-pager-${direction}" href="${escapeHtml(page.path)}">` +
        `<small>${escapeHtml(t(labelKey))}</small>${escapeHtml(page.title)}</a>`
      : '';

  mount.innerHTML = entry(prev, 'prev', 'nav.previous') + entry(next, 'next', 'nav.next');
  mount.hidden = !prev && !next;
}

function drawContents(headings) {
  const aside = el('docsToc');
  const inline = el('docsTocInline');

  if (headings.length === 0) {
    if (aside) aside.innerHTML = '';
    if (inline) inline.hidden = true;
    return;
  }

  const list =
    '<ol>' +
    headings
      .map(
        (heading) =>
          `<li data-level="${heading.level}"><a href="#${escapeHtml(heading.id)}">` +
          `${escapeHtml(heading.text)}</a></li>`
      )
      .join('') +
    '</ol>';

  if (aside) {
    aside.innerHTML = `<h2 data-i18n="nav.contents">On this page</h2>${list}`;
    translateDom(aside);
  }

  if (inline) {
    inline.hidden = false;
    inline.innerHTML = `<summary data-i18n="nav.contentsShow">On this page</summary>${list}`;
    translateDom(inline);
  }

  spyOnHeadings(headings);
}

/**
 * Highlight the heading being read.
 *
 * An observer and not a scroll handler: a scroll listener runs on every frame
 * and this runs when a heading crosses the line. The line is a quarter of the
 * way down the viewport, so the highlighted entry is the heading somebody is
 * reading under and not the one about to leave the top of the screen.
 */
function spyOnHeadings(headings) {
  const aside = el('docsToc');
  if (!aside || !('IntersectionObserver' in window)) return;

  const links = new Map(
    [...aside.querySelectorAll('a')].map((link) => [link.getAttribute('href').slice(1), link])
  );

  let current = null;
  const mark = (id) => {
    if (id === current) return;
    if (current) links.get(current)?.removeAttribute('aria-current');
    current = id;
    links.get(id)?.setAttribute('aria-current', 'true');
  };

  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target.id);
        else seen.delete(entry.target.id);
      }
      const first = headings.find((heading) => seen.has(heading.id));
      if (first) mark(first.id);
    },
    { rootMargin: '-25% 0px -70% 0px' }
  );

  for (const heading of headings) {
    const node = document.getElementById(heading.id);
    if (node) observer.observe(node);
  }
}

/**
 * Keep a page the shell could not fill out of a search index.
 *
 * **The status is 200 and the page is not there**, which is the one thing the
 * catch-all rewrite costs: an address matching no page still resolves to this
 * document, and a crawler reads the status before it reads the words. A robots
 * meta is honest to the crawler even though the header is not, and it is two
 * lines instead of a function invocation on every page view. Serving the real
 * status is available in part 5, when the page list exists at build time.
 *
 * Applied to the error state as well. A page that failed to load is not a page
 * anybody should be able to find.
 */
function setRobots(noindex) {
  let meta = document.querySelector('meta[name="robots"]');

  if (!noindex) {
    meta?.remove();
    return;
  }

  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = 'noindex';
}

function state(bodyKey, titleKey) {
  return (
    '<div class="docs-state">' +
    `<h1 data-i18n="${titleKey}"></h1><p data-i18n="${bodyKey}"></p></div>`
  );
}

/**
 * Fill the article, from whichever pipeline this page came through.
 *
 * @returns {Promise<{ page: object|null, headings: Array }>}
 */
async function drawPage(nav) {
  const article = el('docsArticle');
  if (!article) return { page: null, headings: [] };

  // Part 5 writes the public pages out as HTML with the article already in it.
  // Nothing is fetched for one of those, and the contents are built from the
  // headings the same renderer numbered at build time.
  if (article.hasAttribute('data-prerendered')) {
    const headings = [...article.querySelectorAll('h2[id], h3[id], h4[id]')].map((node) => ({
      id: node.id,
      text: node.textContent.replace(/#$/, '').trim(),
      level: Number(node.tagName.slice(1)),
    }));
    return { page: null, headings };
  }

  article.innerHTML = `<p class="docs-loading" data-i18n="page.loading"></p>`;
  translateDom(article);

  // The home page is the one page whose address has no segments, so it is asked
  // for by the alias the loader answers to. Everything else is its own path.
  const path = window.location.pathname.replace(/\/+$/, '');
  const result = await get(`/api/content${path === '' ? '/index' : path}`);

  if (!result.ok) {
    const missing = result.status === 404;
    const offline = result.status === 0 && navigator.onLine === false;

    article.innerHTML = missing
      ? state('page.notFoundBody', 'page.notFoundTitle')
      : state(offline ? 'page.offline' : 'page.errorBody', 'page.errorTitle');

    translateDom(article);
    setRobots(true);
    document.title = `${t(missing ? 'page.notFoundTitle' : 'page.errorTitle')} — ${t('shell.siteName')}`;
    drawPager(null, null);
    return { page: null, headings: [] };
  }

  setRobots(false);
  const data = result.data;
  const { html, headings } = render(data.markdown);
  article.innerHTML = html;
  translateDom(article);

  document.title = `${data.page.title} — ${t('shell.siteName')}`;
  drawBreadcrumbs(data.page, nav);
  drawPager(data.prev, data.next);

  // An address with a fragment in it arrives before the page it points into
  // exists, so the browser has already given up scrolling by now.
  if (window.location.hash.length > 1) {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }

  return { page: data.page, headings };
}

/* -------------------------------------------------------------------------
 * Things inside a rendered page
 * ---------------------------------------------------------------------- */

function wireArticle() {
  const article = el('docsArticle');
  if (!article) return;

  article.addEventListener('click', async (event) => {
    const copy = event.target.closest('.docs-copy');
    if (copy) {
      const code = copy.closest('.docs-code')?.querySelector('code');
      try {
        await navigator.clipboard.writeText(code?.textContent ?? '');
        copy.textContent = t('code.copied');
      } catch {
        // Denied, or an insecure context. Say so instead of looking as though
        // it worked, which is the failure a silent catch would ship.
        copy.textContent = t('code.copyFailed');
      }
      setTimeout(() => {
        copy.textContent = t('code.copy');
      }, 2000);
      return;
    }

    const tab = event.target.closest('.docs-tabs button');
    if (tab) selectTab(tab);
  });

  // One keyboard for the tab strips, the same one the portal's six use:
  // arrows move, Home and End jump, and the panel follows the selection.
  article.addEventListener('keydown', (event) => {
    const tab = event.target.closest('.docs-tabs button');
    if (!tab) return;

    const tabs = [...tab.parentElement.querySelectorAll('button')];
    const at = tabs.indexOf(tab);
    let next = null;

    if (event.key === 'ArrowRight') next = tabs[(at + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(at - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;

    event.preventDefault();
    selectTab(next);
    next.focus();
  });
}

function selectTab(tab) {
  for (const sibling of tab.parentElement.querySelectorAll('button')) {
    const chosen = sibling === tab;
    sibling.setAttribute('aria-selected', chosen ? 'true' : 'false');
    sibling.tabIndex = chosen ? 0 : -1;
    const panel = document.getElementById(sibling.getAttribute('aria-controls'));
    if (panel) panel.hidden = !chosen;
  }
}

/* -------------------------------------------------------------------------
 * Start
 * ---------------------------------------------------------------------- */

async function start() {
  initTheme();
  await initI18n();

  translateDom(document);
  drawMode();
  wireMode();
  wireMenu();
  wireArticle();

  // The search field is drawn now and answers nothing until part 5 builds the
  // index behind it. 0c's pattern: a control that is not there yet says so on
  // itself, and does not fail when it is pressed.
  const search = el('docsSearch');
  if (search) {
    search.disabled = true;
    search.title = t('search.unavailable');
  }

  // A sidebar that could not be fetched is an empty one, and never a guess. The
  // page itself still renders, which is the right way round: somebody who
  // followed a link came for the page and not for the navigation.
  const { data } = await get('/api/nav');
  const nav = data?.nav ?? { home: null, staff_home: null, sections: [] };

  drawAccount(data?.reader ?? null);
  drawSidebar(nav, window.location.pathname.replace(/\/+$/, '') || '/');

  const { headings } = await drawPage(nav);
  drawContents(headings);

  // Anything that renders its own content redraws when the language changes.
  // Nothing switches language on this site yet -- there is no control for it,
  // per 16d -- and the listener is here from the start so that phase 14 adds a
  // dictionary and not a bug.
  document.addEventListener('gftv:localechange', () => {
    drawMode();
    drawAccount(data?.reader ?? null);
  });
}

start();
