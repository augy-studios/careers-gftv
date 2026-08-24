// The home page.
//
// Section 4 lists what belongs here: a hero with a search box that submits into
// /search, a small grid of openings pulled live from the API with a link to the
// full board, a "why volunteer with GFTV" section, browse by department, and
// how applying works.
//
// Three of those are live and are this module's business: the department
// dropdown in the hero, the openings grid, and the department list. The value
// cards and the numbered steps are ordinary markup with data-i18n attributes,
// because they are copy, not data, and the shell already retranslates
// them on a language change.
//
// The hero search box submits to /search instead of searching in place. There
// is one browse surface, per section 4, and it is not this page.

import { api } from './api.js';
import { t } from './i18n.js';
import { renderJobCards } from './job-card.js';
import { markAppliedCards } from './apply-badges.js';
import { formatCount } from './format.js';
import { loadSiteSettings } from './site-settings.js';

// Enough to show the board is alive without turning the home page into the
// board. Anyone who wants more is one link away.
const LATEST_COUNT = 6;

const el = {};

// What the grid can show. Two lists and not one, because which of them is
// drawn is a setting and either can arrive first: 8.10's featured roles come
// from the settings endpoint and the latest openings from the board's own.
let latest = [];
let featured = [];

function collectElements() {
  el.form = document.querySelector('#heroSearchForm');
  el.input = document.querySelector('#heroSearchInput');
  el.department = document.querySelector('#heroDepartment');
  el.latest = document.querySelector('#latestOpenings');
  el.latestNote = document.querySelector('#latestNote');
  el.heading = document.querySelector('#openingsHeading');
  el.departments = document.querySelector('#departmentList');
}

/* -------------------------------------------------------------------------
 * The hero search box
 * ---------------------------------------------------------------------- */

function wireHeroForm() {
  el.form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const params = new URLSearchParams();
    const q = el.input?.value.trim() ?? '';
    const department = el.department?.value ?? '';

    if (q) params.set('q', q);
    if (department) params.set('dept', department);

    const query = params.toString();
    window.location.href = query ? `/search?${query}` : '/search';
  });
}

/**
 * Fill the department dropdown from the live facets.
 *
 * Only departments with published postings come back, so the dropdown can never
 * offer a choice that leads to an empty board. Left as a single "any
 * department" option when the call fails, which still submits a working search.
 */
function renderDepartmentOptions(departments) {
  if (!el.department) return;

  const any = document.createElement('option');
  any.value = '';
  any.textContent = t('home.heroDepartmentAny');

  el.department.replaceChildren(
    any,
    ...departments.map((department) => {
      const option = document.createElement('option');
      option.value = department.slug;
      option.textContent = department.name;
      return option;
    })
  );
}

/* -------------------------------------------------------------------------
 * Browse by department
 * ---------------------------------------------------------------------- */

function renderDepartments(departments) {
  if (!el.departments) return;

  el.departments.removeAttribute('aria-busy');

  if (departments.length === 0) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = t('home.departmentsEmpty');
    el.departments.replaceChildren(note);
    return;
  }

  el.departments.replaceChildren(
    ...departments.map((department) => {
      const item = document.createElement('li');

      const link = document.createElement('a');
      link.className = 'glass-card department-card';
      link.href = `/search?dept=${encodeURIComponent(department.slug)}`;

      const name = document.createElement('span');
      name.className = 'department-name';
      name.textContent = department.name;

      const count = document.createElement('span');
      count.className = 'department-count tabular';
      count.textContent =
        department.count === 1
          ? t('home.departmentCountOne')
          : t('home.departmentCount', { count: formatCount(department.count) });

      link.append(name, count);
      item.append(link);
      return item;
    })
  );
}

/* -------------------------------------------------------------------------
 * Latest openings
 * ---------------------------------------------------------------------- */

/**
 * The hero wording and the featured roles, from 8.10.
 *
 * Both are settings with a perfectly good default already on the page: the hero
 * falls back to the dictionary, and with nothing featured the grid shows the
 * latest openings, which is what migration 012's own comment says the empty
 * list means. So a failed request changes nothing and is not reported.
 *
 * The hero fields lose their data-i18n attribute while a setting is overriding
 * them and get it back when it is cleared, so emptying the field on the
 * settings page restores the written copy without freezing the last value
 * on screen.
 */
async function loadSiteCopy() {
  const settings = await loadSiteSettings();
  if (!settings) return;

  applyCopy('#heroHeading', 'home.heroHeading', settings.hero_heading);
  applyCopy('#heroLede', 'home.heroLede', settings.hero_body);

  featured = settings.featured ?? [];
  drawOpenings();
}

function applyCopy(selector, key, value) {
  const node = document.querySelector(selector);
  if (!node) return;

  if (value) {
    node.removeAttribute('data-i18n');
    node.textContent = value;
  } else {
    node.setAttribute('data-i18n', key);
    node.textContent = t(key);
  }
}

async function loadLatest() {
  if (!el.latest) return;

  el.latest.setAttribute('aria-busy', 'true');

  // No query and no filters, so the RPC sorts by newest on its own. The home
  // page deliberately does not sort by closing date: a posting closing on
  // Friday is urgent, but the question this section answers is "what is new".
  //
  // This asks for a full page and shows the first six of it. The endpoint has
  // no size parameter by design, since the page size is the board's and having
  // two callers able to set it is how the two stop agreeing. A page of twenty
  // rows is small enough that trimming it here costs less than the parameter
  // would.
  const result = await api('/api/public/search?page=1');

  if (!result.ok) {
    el.latest.replaceChildren();
    el.latest.removeAttribute('aria-busy');
    if (el.latestNote) {
      el.latestNote.hidden = false;
      el.latestNote.className = 'callout warn';
      el.latestNote.textContent = t('home.latestError');
    }
    return;
  }

  latest = (result.data.jobs ?? []).slice(0, LATEST_COUNT);
  drawOpenings();
}

/**
 * The grid, which is the featured roles when there are any and the latest
 * openings when there are not.
 *
 * That is migration 012's own rule for the setting, written down where the
 * decision is visible: "Empty means show the latest published postings
 * instead." One grid in place of two sections, because a home page with a
 * featured row and a latest row shows the same three postings twice on a board
 * this size.
 *
 * The heading changes with it, and changes by swapping the dictionary key
 * and not the text, so a language change still retranslates it.
 */
function drawOpenings() {
  if (!el.latest) return;

  const showing = featured.length > 0 ? featured : latest;

  if (el.heading) {
    const key = featured.length > 0 ? 'home.featuredHeading' : 'home.latestHeading';
    el.heading.setAttribute('data-i18n', key);
    el.heading.textContent = t(key);
  }

  if (showing.length === 0) {
    el.latest.replaceChildren();
    el.latest.removeAttribute('aria-busy');
    if (el.latestNote) {
      el.latestNote.hidden = false;
      el.latestNote.className = 'callout note';
      el.latestNote.textContent = t('home.latestEmpty');
    }
    return;
  }

  if (el.latestNote) el.latestNote.hidden = true;

  renderJobCards(el.latest, showing);

  // The same cooldown badge the board shows, per 7f. The home page renders the
  // same card, so it tells the same truth about it.
  markAppliedCards(el.latest);
}

async function loadFacets() {
  const result = await api('/api/public/facets');
  const departments = result.ok ? result.data.departments ?? [] : [];
  renderDepartmentOptions(departments);
  renderDepartments(departments);
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

function boot() {
  collectElements();
  wireHeroForm();

  loadFacets();
  loadLatest();
  loadSiteCopy();

  // These sections write their own strings, so none of them is reached by
  // translateDom. A language change redraws them, and re-fetches, because the
  // postings, the department names, and the hero wording all come back in the
  // new language.
  document.addEventListener('gftv:localechange', () => {
    loadFacets();
    loadLatest();
    loadSiteCopy();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
