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
import { initI18n, t, translateDom, getLocale, applyLocale, LOCALES } from './i18n.js';
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

// Intl wants a BCP 47 tag and our locale ids are not quite that. The portal's
// format.js carries the same two, for the same reason: both are Singapore, so a
// date reads as 1 September 2026 and never in the American order. They are two
// short maps and not one shared module, because nothing can be imported across
// the two projects and a generated copy of four lines would be a rule to keep.
const INTL_LOCALE = {
  en: 'en-SG',
  zh: 'zh-Hans-SG',
};

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
    // for a light and dark toggle, so the time based preference is set on the
    // portal and not here.
    //
    // **This site starts at its own defaults, and cannot do otherwise.** An
    // earlier version of this comment said a reader who chose a theme on the
    // portal keeps it here, which is wrong: localStorage is per origin and
    // docs.careers.globalfurry.tv is not careers.globalfurry.tv, so nothing
    // crosses. The only mechanism that would is a cookie on
    // .globalfurry.tv, and 5h forbids exactly that -- "the parent domain
    // carries other GFTV apps that have no business seeing this cookie".
    //
    // So the palette here is always classic and the mode always starts light,
    // and pressing this once replaces that with an explicit choice stored
    // against this origin. The hello palette is generated in, measured, and
    // unreachable from this site's own chrome, which is 16d's header having no
    // colour control and not an oversight.
    applyMode(document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark');
    drawMode();
  });
}

/**
 * The language control. Phase 13 part 6a, when the whole site became bilingual.
 *
 * **A reader arriving from the portal is in English whatever they chose there,
 * and this is the only way out of that.** localStorage is per origin and
 * docs.careers.globalfurry.tv is not careers.globalfurry.tv; the one mechanism
 * that would carry the choice is a cookie on .globalfurry.tv, which 5h forbids
 * because the parent domain carries other GFTV apps. So the first page is
 * English and this is how somebody says otherwise, once, against this origin.
 * Section 5 item 27 is the account of it.
 *
 * Every language in LOCALES, so phase 15's Malay and Tamil appear here by
 * being added there and nothing in this file moves.
 */
function drawLocale() {
  const select = el('docsLocale');
  if (!select) return;

  const current = getLocale();

  // The native name and not the English one. Somebody looking for their own
  // language is looking for the word they call it, which is why LOCALES carries
  // both and this reads the second.
  select.innerHTML = LOCALES.map(
    (locale) =>
      `<option value="${escapeHtml(locale.id)}"${locale.id === current ? ' selected' : ''}>` +
      `${escapeHtml(locale.native)}</option>`
  ).join('');
}

function wireLocale() {
  const select = el('docsLocale');
  if (!select) return;

  select.addEventListener('change', async (event) => {
    // applyLocale fetches the dictionary, stores the choice, sets lang and
    // data-locale on the document, and dispatches gftv:localechange. Everything
    // that draws its own content listens for that, which is why nothing here
    // redraws the page itself.
    await applyLocale(event.currentTarget.value);
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

  // **A page with no page.** The two form pages in 16d -- sign in and account
  // settings -- are not in the page list and have no section, so they pass null
  // and get the home crumb alone. Added in phase 13 part 6, and found by
  // opening /account: this threw on page.section and the article stayed empty,
  // which is the shape phase 12 kept naming -- a helper that assumed the one
  // caller it had.
  if (!page) {
    mount.innerHTML = '';
    return;
  }

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

/** The tab title, from one string, so the two pipelines cannot word it apart. */
function tabTitle(title) {
  return t('page.tabTitle', { title, site: t('shell.siteName') });
}

/**
 * When this page last changed, or nothing at all.
 *
 * **Null is drawn as no line**, per 16e's date and phase 12's rule about gaps: a
 * page git could not date carries no date, and a reader is never shown one this
 * site made up. The date is formatted in the reader's own locale, so phase 14's
 * dictionary brings the wording and this needs no second format.
 */
function drawUpdated(iso) {
  const mount = el('docsUpdated');
  if (!mount) return;

  if (!iso) {
    mount.hidden = true;
    mount.textContent = '';
    return;
  }

  const date = new Date(`${iso}T00:00:00Z`);
  const formatted = Number.isNaN(date.valueOf())
    ? iso
    : new Intl.DateTimeFormat(INTL_LOCALE[getLocale()] ?? INTL_LOCALE.en, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        // The date is a day and not a moment, so it is read back in the zone it
        // was written in. Without this, a reader west of UTC is shown the day
        // before the one git recorded.
        timeZone: 'UTC',
      }).format(date);

  mount.textContent = t('page.updated', { date: formatted });
  mount.hidden = false;
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

  // The build writes the public pages out as HTML with the article already in
  // it. Nothing is fetched for one of those, and the contents are built from the
  // headings the same renderer numbered at build time.
  //
  // **Everything around the article is drawn here either way.** The build could
  // have written the breadcrumbs and the pager into the file, and then this site
  // would have two things drawing its chrome and one of them would eventually be
  // a version behind. So the build writes the page's data into the document and
  // the functions below are the same ones a gated page goes through.
  if (article.hasAttribute('data-prerendered')) {
    const headings = [...article.querySelectorAll('h2[id], h3[id], h4[id]')].map((node) => ({
      id: node.id,
      text: node.textContent.replace(/#$/, '').trim(),
      level: Number(node.tagName.slice(1)),
    }));

    let data = null;
    try {
      data = JSON.parse(el('docsPageData')?.textContent ?? 'null');
    } catch {
      // A page whose data block did not parse still has its article, which is
      // what the reader came for. The chrome around it stays as the shell drew
      // it rather than half filled in.
      data = null;
    }

    if (data) {
      document.title = tabTitle(data.page.title);
      drawBreadcrumbs(data.page, nav);
      drawPager(data.prev, data.next);
      drawUpdated(data.updated);
    }

    return { page: data?.page ?? null, headings };
  }

  article.innerHTML = `<p class="docs-loading" data-i18n="page.loading"></p>`;
  translateDom(article);

  // **The page is named in a parameter and not in the path.** Part 5 found that
  // a file based dynamic route binds nothing in a bare api/ project on Vercel:
  // the old `/api/content/portal/applying` never reached the function at all,
  // and locally it looked perfect. The home page is an empty parameter, so it
  // needs no alias either.
  const path = window.location.pathname.replace(/\/+$/, '');
  const result = await get(`/api/content?path=${encodeURIComponent(path)}`);

  if (!result.ok) {
    const missing = result.status === 404;
    const offline = result.status === 0 && navigator.onLine === false;

    article.innerHTML = missing
      ? state('page.notFoundBody', 'page.notFoundTitle')
      : state(offline ? 'page.offline' : 'page.errorBody', 'page.errorTitle');

    translateDom(article);
    setRobots(true);
    document.title = tabTitle(t(missing ? 'page.notFoundTitle' : 'page.errorTitle'));
    drawPager(null, null);
    drawUpdated(null);
    return { page: null, headings: [] };
  }

  setRobots(false);
  const data = result.data;
  // The images beside a gated page are addressed from where the page itself was
  // read, which the server sent: nothing in the browser works out where a gated
  // file lives.
  const { html, headings } = render(data.markdown, { assetBase: data.asset_base });
  article.innerHTML = html;
  translateDom(article);

  document.title = tabTitle(data.page.title);
  drawBreadcrumbs(data.page, nav);
  drawPager(data.prev, data.next);
  drawUpdated(data.updated);

  // An address with a fragment in it arrives before the page it points into
  // exists, so the browser has already given up scrolling by now.
  if (window.location.hash.length > 1) {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }

  return { page: data.page, headings };
}

/* -------------------------------------------------------------------------
 * Search
 * ---------------------------------------------------------------------- */

/**
 * Two indexes, fetched once, and never merged anywhere but here.
 *
 * 16e: "the public index is a static file. The gated index is served per role by
 * api/search-index, built at deploy time into one file per tier and never merged
 * into the public one." So this tab holds whichever halves its reader is
 * entitled to, and the merge happens in the reader's own browser where the
 * mistake is not available to make: a signed out reader never fetches the second
 * half, and the server would send them an empty one if they did.
 *
 * **The two halves fail separately**, because they are different sentences. The
 * public half failing is search being broken; the staff half failing is the
 * staff guides being unsearchable this time, which a signed in reader has to be
 * told rather than left to conclude their guides hold nothing.
 */
const index = { loading: null, entries: [], failed: false, staffFailed: false };

/**
 * Fetch both halves once, and hand every later caller the same promise.
 *
 * **A flag set at the top of an async function is not a lock.** The first
 * keystroke focuses the field and starts this; the keystroke itself calls it
 * again a moment later, and a `loaded` boolean would have let that second call
 * return immediately with an index that was still arriving -- so the first
 * search a reader ever ran answered "nothing matched" and the second worked.
 * Phase 10's rule in its third shape: what is awaited is the work, not a flag
 * somebody set beside it.
 */
function loadIndex(signedIn) {
  index.loading ??= fetchIndex(signedIn);
  return index.loading;
}

async function fetchIndex(signedIn) {
  try {
    const response = await fetch('/search-index.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(String(response.status));
    index.entries = await response.json();
  } catch {
    index.failed = true;
  }

  if (!signedIn) return;

  const staff = await get('/api/search-index');
  if (staff.ok) index.entries = index.entries.concat(staff.data?.entries ?? []);
  else index.staffFailed = true;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One entry against one query, or null when it does not answer it.
 *
 * Every term has to appear somewhere in the page, so two words narrow a search
 * instead of widening it. Where a term appears is what orders the results: a
 * word in a title is what somebody is looking for, a word in a heading is the
 * part of the page they want, and a word in the body is the page mentioning it.
 */
function scoreEntry(entry, terms) {
  const title = String(entry.title ?? '').toLowerCase();
  const summary = String(entry.summary ?? '').toLowerCase();
  const blocks = (entry.blocks ?? []).map((block) => ({
    ...block,
    hay: `${block.heading ?? ''} ${block.text ?? ''}`.toLowerCase(),
  }));

  const found = new Set();
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) {
      score += 6;
      found.add(term);
    }
    if (summary.includes(term)) {
      score += 3;
      found.add(term);
    }
    for (const block of blocks) {
      if (!block.hay.includes(term)) continue;
      score += String(block.heading ?? '').toLowerCase().includes(term) ? 2 : 1;
      found.add(term);
    }
  }

  if (found.size < terms.length) return null;

  // The heading the match sits under, per 16e: "show the matching heading in the
  // result, and jump straight to the anchor."
  let best = null;
  let bestHits = 0;
  for (const block of blocks) {
    const hits = terms.filter((term) => block.hay.includes(term)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = block;
    }
  }

  return { entry, score, block: best };
}

/**
 * The words around the first match, with the terms marked.
 *
 * **It cuts at a space and never inside a word.** The first version took sixty
 * characters either side of the hit and produced "…s guide is phase 14's", which
 * reads as a rendering fault before it reads as an excerpt -- and a reader
 * deciding whether a result is the one they want is reading the first two words
 * of it.
 */
function snippet(text, terms) {
  const source = String(text ?? '');
  if (source === '') return '';

  const lower = source.toLowerCase();
  const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((i) => i !== -1), Infinity);

  let start = Number.isFinite(at) ? Math.max(0, at - 60) : 0;
  if (start > 0) {
    const space = source.indexOf(' ', start);
    start = space === -1 || space > start + 20 ? start : space + 1;
  }

  let end = Math.min(source.length, start + 180);
  if (end < source.length) {
    const space = source.lastIndexOf(' ', end);
    end = space <= start ? end : space;
  }

  const marked = escapeHtml(
    (start > 0 ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '')
  );

  return marked.replace(
    new RegExp(terms.map(escapeRegExp).join('|'), 'gi'),
    (hit) => `<mark>${hit}</mark>`
  );
}

function drawResults(query) {
  const panel = el('docsSearchResults');
  const field = el('docsSearch');
  if (!panel || !field) return;

  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);

  if (terms.length === 0) {
    closeResults();
    return;
  }

  const notes = [];
  if (index.failed) notes.push(t('search.failed'));
  if (index.staffFailed) notes.push(t('search.staffFailed'));

  const results = index.entries
    .map((entry) => scoreEntry(entry, terms))
    .filter((result) => result !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const parts = notes.map((note) => `<p class="docs-result-note">${escapeHtml(note)}</p>`);

  if (results.length === 0 && !index.failed) {
    parts.push(`<p class="docs-result-note">${escapeHtml(t('search.none', { query }))}</p>`);
  }

  parts.push(
    ...results.map((result, at) => {
      // **A page's own h1 is not a heading to show.** It carries the same words
      // as the title above it, and a result reading "Using the portal / Using
      // the portal" over a link to the top of the page it is already naming
      // tells a reader nothing twice. The other headings are the whole point of
      // showing one.
      const inTitle = result.block?.heading === result.entry.title;
      const anchor = result.block?.id && !inTitle ? `#${result.block.id}` : '';
      const heading =
        result.block?.heading && !inTitle
          ? `<span class="docs-result-heading">${escapeHtml(result.block.heading)}</span>`
          : '';
      const text = snippet(result.block?.text ?? result.entry.summary ?? '', terms);

      return (
        `<a class="docs-result" role="option" id="docs-result-${at}" aria-selected="false"` +
        ` href="${escapeHtml(result.entry.path)}${anchor}">` +
        `<span class="docs-result-title">${escapeHtml(result.entry.title)}</span>${heading}` +
        `<span class="docs-result-snippet">${text}</span></a>`
      );
    })
  );

  panel.innerHTML = parts.join('');
  panel.hidden = false;
  field.setAttribute('aria-expanded', 'true');
  field.removeAttribute('aria-activedescendant');
}

function closeResults() {
  const panel = el('docsSearchResults');
  const field = el('docsSearch');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  if (field) {
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  }
}

/** Move the highlight, which is what the field's aria-activedescendant names. */
function moveResult(step) {
  const panel = el('docsSearchResults');
  const field = el('docsSearch');
  if (!panel || panel.hidden) return;

  const options = [...panel.querySelectorAll('.docs-result')];
  if (options.length === 0) return;

  // Nothing highlighted yet is its own case and not an index to do arithmetic
  // on: down goes to the first result and up goes to the last, which is what
  // every list of this shape does.
  const current = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
  const next =
    current === -1
      ? step > 0
        ? 0
        : options.length - 1
      : (current + step + options.length) % options.length;

  for (const [at, option] of options.entries()) {
    option.setAttribute('aria-selected', at === next ? 'true' : 'false');
  }
  options[next].scrollIntoView({ block: 'nearest' });
  field.setAttribute('aria-activedescendant', options[next].id);
}

function wireSearch(reader) {
  const field = el('docsSearch');
  const panel = el('docsSearchResults');
  if (!field || !panel) return;

  const signedIn = reader?.signed_in === true;

  field.addEventListener('focus', () => loadIndex(signedIn), { once: true });

  field.addEventListener('input', async () => {
    await loadIndex(signedIn);
    drawResults(field.value.trim());
  });

  field.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveResult(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Escape') {
      closeResults();
      return;
    }
    if (event.key === 'Enter') {
      const chosen =
        panel.querySelector('.docs-result[aria-selected="true"]') ??
        panel.querySelector('.docs-result');
      if (chosen) {
        event.preventDefault();
        window.location.assign(chosen.getAttribute('href'));
      }
    }
  });

  // A result inside the page being read is a fragment away, and a fragment does
  // not reload anything -- so the panel has to be shut by hand or it stays over
  // the heading the reader just jumped to.
  panel.addEventListener('click', () => closeResults());

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.docs-search')) closeResults();
  });
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
 * The two pages with no article, 16d
 * ---------------------------------------------------------------------- */

/**
 * 16d: "The two pages with no article to hold, sign in and account settings,
 * render inside the same shell all the same, header and sidebar included, with
 * the content column carrying a form where the prose would be. Keep the
 * callouts, the spacing, and the type scale there too, so signing in feels like
 * part of the same site instead of a detour through a different one."
 *
 * So they are not a second layout. Each one puts its container into the article
 * this file already drew and hands over to a module, and everything around it --
 * the header, the sidebar, the theme, the search -- is untouched.
 *
 * **Two of the three modules are the portal's, generated.** 5f asks for the
 * settings suite to be specified once and mounted twice and 5g's reset flow got
 * the same treatment in phase 13 part 6; the sign in form is this site's own,
 * because the portal's staff login is marked up in its own page and predates
 * any of this.
 *
 * The container attributes are where this site says what a stylesheet cannot:
 * where a signed out reader goes, and where back goes.
 */
const FORM_PAGES = Object.freeze({
  '/login': {
    module: '/assets/js/docs-login.js',
    titleKey: 'login.pageTitle',
    container:
      '<div id="docsLogin" data-account="/account" data-forgot="/forgot-password"></div>',
  },
  '/account': {
    module: '/assets/js/staff-account.js',
    titleKey: 'staffAccount.pageTitle',
    container:
      '<div id="staffAccount" data-signin="/login" data-back="/" ' +
      'data-account-url="https://gftv.asia/account"></div>',
  },
  '/forgot-password': {
    module: '/assets/js/staff-forgot-password.js',
    titleKey: 'staffReset.pageTitle',
    container: '<div id="staffForgotPassword" data-signin="/login" data-back="/"></div>',
  },
});

/**
 * Draw one of them, if this address is one.
 *
 * **They are never indexed.** A sign in form and somebody's account settings
 * have nothing for a crawler, and part 4's rule applies: the catch-all rewrite
 * means an address resolves with a 200 whatever it is, so the meta tag is the
 * only honest signal available here.
 *
 * @returns {Promise<boolean>} whether this page was one of them
 */
async function drawFormPage(path) {
  const page = FORM_PAGES[path];
  if (!page) return false;

  const article = el('docsArticle');
  if (!article) return false;

  article.innerHTML = page.container;
  setRobots(true);
  document.title = tabTitle(t(page.titleKey));

  drawBreadcrumbs(null, null);
  drawPager(null, null);
  drawUpdated(null);

  // Imported rather than loaded by the page, because the shell is one document
  // serving every address: a script tag in it would run the account page's
  // module on every guide anybody opens.
  await import(page.module);
  return true;
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
  drawLocale();
  wireLocale();
  wireMenu();
  wireArticle();

  // A sidebar that could not be fetched is an empty one, and never a guess. The
  // page itself still renders, which is the right way round: somebody who
  // followed a link came for the page and not for the navigation.
  const { data } = await get('/api/nav');
  const nav = data?.nav ?? { home: null, staff_home: null, sections: [] };

  // Search waits for the reader, because which halves of the index this tab may
  // fetch is the one thing about it that is not the same for everybody.
  wireSearch(data?.reader ?? null);

  drawAccount(data?.reader ?? null);
  drawSidebar(nav, window.location.pathname.replace(/\/+$/, '') || '/');

  // A form page takes the article instead of a guide. Checked before
  // drawPage, so /account never asks the content route for a page that is not
  // there and never draws "there is no page here" on its way to a form.
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (await drawFormPage(path)) {
    drawContents([]);
  } else {
    const { headings } = await drawPage(nav);
    drawContents(headings);
  }

  // Anything that renders its own content redraws when the language changes.
  // Nothing switches language on this site yet -- there is no control for it,
  // per 16d -- and the listener is here from the start so that phase 14 adds a
  // dictionary and not a bug.
  document.addEventListener('gftv:localechange', () => {
    drawMode();
    drawLocale();
    drawAccount(data?.reader ?? null);
  });
}

start();
