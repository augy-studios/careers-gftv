// The job board at /search.
//
// Section 4: there is one browse surface, not two. With no query parameters
// this is the full listing, newest first. With a query or any filter it is the
// results page. Same page, same components, same URL, so a shared link always
// reproduces exactly what the sender was looking at.
//
// That last sentence is the design. Every piece of state lives in the query
// string and nowhere else: the query, the filters, the sort, and the page.
// There is no state object that the URL is written from, because two sources of
// truth is how a shared link stops matching the screen. readState() reads the
// URL, everything renders from what it returns, and writeState() puts it back.
//
// Section 4 asks for history.replaceState as filters change rather than a
// reload, which is what happens here. One consequence is worth stating rather
// than discovering: replaceState creates no history entry, so pressing back
// after applying four filters leaves the board rather than undoing one filter.
// That is the specified behaviour. popstate is still listened for, so arriving
// through history from somewhere else redraws correctly.
//
// Nothing on this page requires a session. Section 4: "The search results page
// is fully public too, filters and tags included."

import { api } from './api.js';
import { t, getLocale } from './i18n.js';
import { iconMarkup } from './icons.js';
import { renderJobCards } from './job-card.js';
import { markAppliedCards } from './apply-badges.js';
import { formatCount, commitmentLabel } from './format.js';

/* -------------------------------------------------------------------------
 * The shape of the URL
 * ---------------------------------------------------------------------- */

// Kept in step with api/_lib/jobs.js, which parses the same names on the other
// side. Two of them, closing_within_days and no_deadline, have been live in the
// footer since phase 1 and cannot be renamed without breaking those links.
const PARAMS = Object.freeze({
  q: 'q',
  departments: 'dept',
  tags: 'tags',
  matchAll: 'match',
  commitments: 'commitment',
  location: 'location',
  remote: 'remote',
  postedWithin: 'posted_within_days',
  closingWithin: 'closing_within_days',
  noDeadline: 'no_deadline',
  sort: 'sort',
  page: 'page',
});

// The four quick chips from section 4. Each one is a single parameter, which is
// what lets a chip be toggled by comparing the URL rather than by keeping a
// flag beside it.
//
// days is a fallback, not the source of truth. The real numbers come back with
// the facets, so the chip a reader clicks and the count printed on it were made
// from one number rather than two that agree today. These are here only for the
// window between the page appearing and the facets landing, in which a chip is
// already clickable and would otherwise apply no filter at all. Keep them in
// step with CHIP_DAYS in api/public/facets.js.
//
// key: is the dictionary key. Named that way on purpose: check-i18n.js reads
// this shape, so these four keys are checked rather than invisible to it.
const CHIPS = [
  { id: 'posted_today', key: 'search.chipPostedToday', param: PARAMS.postedWithin, from: 'posted_today', days: 1 },
  { id: 'posted_week', key: 'search.chipPostedWeek', param: PARAMS.postedWithin, from: 'posted_week', days: 7 },
  { id: 'closing_soon', key: 'search.chipClosingSoon', param: PARAMS.closingWithin, from: 'closing_soon', days: 14 },
  { id: 'no_deadline', key: 'search.chipNoDeadline', param: PARAMS.noDeadline, from: null, days: null },
];

/** The window a chip filters on, preferring the server's answer. */
function chipDays(chip, dayCounts) {
  return dayCounts?.[chip.from] ?? chip.days;
}

const SORTS = [
  { id: 'relevance', key: 'search.sortRelevance' },
  { id: 'newest', key: 'search.sortNewest' },
  { id: 'closing', key: 'search.sortClosing' },
];

const REMOTE_OPTIONS = [
  { id: '', key: 'search.remoteAny' },
  { id: 'true', key: 'search.remoteOnly' },
  { id: 'false', key: 'search.onSiteOnly' },
];

const RECENT_KEY = 'gftv-careers.recentSearches';
const RECENT_MAX = 8;
const SUGGEST_DEBOUNCE_MS = 250;

/* -------------------------------------------------------------------------
 * Elements
 * ---------------------------------------------------------------------- */

const el = {};

function collectElements() {
  el.form = document.querySelector('#searchForm');
  el.input = document.querySelector('#searchInput');
  el.clear = document.querySelector('#searchClear');
  el.suggestions = document.querySelector('#suggestions');
  el.recent = document.querySelector('#recentSearches');
  el.chips = document.querySelector('#quickChips');
  el.summary = document.querySelector('#resultSummary');
  el.notice = document.querySelector('#resultNotice');
  el.results = document.querySelector('#results');
  el.pagination = document.querySelector('#pagination');
  el.filterPanel = document.querySelector('#filterPanel');
  el.filterToggle = document.querySelector('#filterToggle');
  el.filterBackdrop = document.querySelector('#filterBackdrop');
  el.filterBody = document.querySelector('#filterBody');
  el.filterCount = document.querySelector('#filterCount');
  el.sort = document.querySelector('#sortSelect');
}

/* -------------------------------------------------------------------------
 * URL state
 * ---------------------------------------------------------------------- */

function readState() {
  const params = new URLSearchParams(window.location.search);

  const list = (name) =>
    params
      .getAll(name)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

  const int = (name) => {
    const raw = params.get(name);
    const parsed = Number(raw);
    return raw !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  return {
    q: (params.get(PARAMS.q) ?? '').trim(),
    departments: unique(list(PARAMS.departments)),
    tags: unique(list(PARAMS.tags)),
    matchAll: params.get(PARAMS.matchAll) === 'all',
    commitments: unique(list(PARAMS.commitments)),
    location: (params.get(PARAMS.location) ?? '').trim(),
    remote: params.get(PARAMS.remote) === 'true' ? 'true'
      : params.get(PARAMS.remote) === 'false' ? 'false' : '',
    postedWithin: int(PARAMS.postedWithin),
    closingWithin: int(PARAMS.closingWithin),
    noDeadline: params.get(PARAMS.noDeadline) === 'true',
    sort: SORTS.some((s) => s.id === params.get(PARAMS.sort)) ? params.get(PARAMS.sort) : '',
    page: int(PARAMS.page) ?? 1,
  };
}

/**
 * The query string for a state. Empty values are left out entirely rather than
 * written as blanks, so /search stays /search until something is actually
 * filtered and a shared link carries no noise.
 */
function toParams(state) {
  const params = new URLSearchParams();

  if (state.q) params.set(PARAMS.q, state.q);
  if (state.departments.length) params.set(PARAMS.departments, state.departments.join(','));
  if (state.tags.length) params.set(PARAMS.tags, state.tags.join(','));
  if (state.matchAll && state.tags.length > 1) params.set(PARAMS.matchAll, 'all');
  if (state.commitments.length) params.set(PARAMS.commitments, state.commitments.join(','));
  if (state.location) params.set(PARAMS.location, state.location);
  if (state.remote) params.set(PARAMS.remote, state.remote);
  if (state.postedWithin) params.set(PARAMS.postedWithin, String(state.postedWithin));
  if (state.closingWithin) params.set(PARAMS.closingWithin, String(state.closingWithin));
  if (state.noDeadline) params.set(PARAMS.noDeadline, 'true');
  if (state.sort) params.set(PARAMS.sort, state.sort);
  if (state.page > 1) params.set(PARAMS.page, String(state.page));

  return params;
}

/**
 * Write the state back into the address bar and re-run the search.
 *
 * @param {object} changes fields to merge over the current state
 * @param {{ keepPage?: boolean }} [options] every change resets to page one
 *        except an explicit page change, because a reader on page four who
 *        adds a filter is not asking for page four of the new result set.
 */
function updateState(changes, options = {}) {
  const next = { ...readState(), ...changes };
  if (!options.keepPage) next.page = changes.page ?? 1;

  const params = toParams(next);
  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;

  window.history.replaceState(null, '', url);
  draw();
}

function activeFilterCount(state) {
  return (
    state.departments.length +
    state.tags.length +
    state.commitments.length +
    (state.location ? 1 : 0) +
    (state.remote ? 1 : 0) +
    (state.postedWithin ? 1 : 0) +
    (state.closingWithin ? 1 : 0) +
    (state.noDeadline ? 1 : 0)
  );
}

/* -------------------------------------------------------------------------
 * Fetching
 * ---------------------------------------------------------------------- */

let facets = null;

// Three states, not two. "Not loaded yet" and "failed to load" look identical
// if all you have is a null, and the panel would tell every reader the filters
// could not be loaded for the moment before they arrive. Which is a lie roughly
// every time it is shown.
let facetsState = 'loading';

let searchToken = 0;
let inFlight = null;

async function loadFacets() {
  facetsState = 'loading';
  renderFilterPanel();

  const result = await api('/api/public/facets');

  facets = result.ok ? result.data : null;
  facetsState = result.ok ? 'ready' : 'error';

  renderChips();
  renderFilterPanel();
}

async function runSearch(state) {
  // Every search supersedes the one before it. Without this a slow request for
  // "vid" can land after a fast one for "video" and put the wrong results on
  // screen, which is the classic way an as-you-type board lies.
  const token = ++searchToken;

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  showLoading();

  const query = toParams(state);
  const result = await api(`/api/public/search?${query.toString()}`, {
    signal: controller.signal,
  });

  if (token !== searchToken) return;
  inFlight = null;

  if (!result.ok) {
    if (result.error?.code === 'aborted') return;
    showError(result.error?.message ?? t('search.loadError'));
    return;
  }

  renderResults(state, result.data);
}

/* -------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------- */

function showLoading() {
  el.summary.textContent = t('search.loading');
  el.notice.hidden = true;
  el.pagination.replaceChildren();
  el.results.setAttribute('aria-busy', 'true');

  // Skeletons rather than a spinner, per section 3: the shape of the answer is
  // known here, so the page does not jump when it arrives. Delayed by 250ms, so
  // a fast search is never seen to load.
  el.results.innerHTML = Array.from({ length: 4 })
    .map(
      () => `
      <article class="glass-card job-card delayed" aria-hidden="true">
        <div class="skeleton skeleton-line title"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line short"></div>
      </article>`
    )
    .join('');
}

function showError(message) {
  el.results.replaceChildren();
  el.results.removeAttribute('aria-busy');
  el.pagination.replaceChildren();
  el.summary.textContent = '';

  el.notice.hidden = false;
  el.notice.className = 'callout warn';
  el.notice.replaceChildren();

  const text = document.createElement('p');
  text.textContent = message;

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-secondary';
  retry.textContent = t('search.retry');
  retry.addEventListener('click', draw);

  el.notice.append(text, retry);
}

function renderResults(state, data) {
  const jobs = data.jobs ?? [];

  // Section 4 asks for three distinguishable states, and they are easy to
  // collapse into one by accident:
  //
  //   results          the ordinary case
  //   did you mean     nothing matched the words, but these are close. The RPC
  //                    says so with match_mode 'trigram'.
  //   nothing at all   not even a near miss, so offer the popular tags as a way
  //                    back in rather than a dead end.
  const nearMiss = data.match_mode === 'trigram' && jobs.length > 0;

  // Announced rather than merely displayed. The results region is a live
  // region, so a reader who cannot see the list still hears how many there are.
  const count = Number(data.total ?? 0);
  const countText = count === 1 ? t('search.resultCountOne') : t('search.resultCount', { count: formatCount(count) });
  el.summary.textContent = state.q
    ? `${countText} ${t('search.forQuery', { query: state.q })}`
    : countText;

  if (jobs.length === 0) {
    renderEmpty(state);
    return;
  }

  if (nearMiss) {
    el.notice.hidden = false;
    el.notice.className = 'callout note';
    el.notice.replaceChildren();

    const heading = document.createElement('p');
    heading.textContent = t('search.didYouMeanHeading', { query: state.q });

    const body = document.createElement('p');
    body.className = 'muted';
    body.textContent = t('search.didYouMeanBody');

    el.notice.append(heading, body);
  } else {
    el.notice.hidden = true;
  }

  // No hydrateIcons pass. jobCard builds its icons as markup rather than as
  // data-icon placeholders, precisely so a list of twenty cards is one string
  // rather than twenty extra DOM walks.
  renderJobCards(el.results, jobs, { showHeadline: Boolean(state.q) });
  renderPagination(data);

  // 7f: a posting inside its cooldown says so here as well as on the posting
  // itself, so nobody clicks through only to be turned away. Not awaited: it is
  // per applicant, most readers are signed out, and the results must never wait
  // on a session check.
  markAppliedCards(el.results);
}

function renderEmpty(state) {
  el.results.removeAttribute('aria-busy');
  el.pagination.replaceChildren();
  el.notice.hidden = true;

  const wrap = document.createElement('div');
  wrap.className = 'glass-card card empty-state';

  const heading = document.createElement('h2');
  heading.textContent = state.q
    ? t('search.noResultsHeading', { query: state.q })
    : t('search.emptyHeading');

  const body = document.createElement('p');
  body.textContent = state.q ? t('search.noResultsBody') : t('search.emptyBody');

  wrap.append(heading, body);

  // The way back in. Section 4 asks for the most popular tags here rather than
  // an apology, because a reader who searched for something we do not have
  // still wants to know what we do.
  const popular = (facets?.tags ?? []).slice(0, 8);
  if (popular.length > 0) {
    const label = document.createElement('p');
    label.className = 'modal-section-label';
    label.textContent = t('search.popularTags');

    const list = document.createElement('ul');
    list.className = 'chip-row';
    list.append(
      ...popular.map((tag) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'chip chip-tag';
        link.href = `/search?${PARAMS.tags}=${encodeURIComponent(tag.slug)}`;
        link.textContent = `${tag.name} (${formatCount(tag.count)})`;
        item.append(link);
        return item;
      })
    );

    wrap.append(label, list);
  }

  if (activeFilterCount(state) > 0 || state.q) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-secondary';
    reset.textContent = t('search.clearAll');
    reset.addEventListener('click', clearEverything);
    wrap.append(reset);
  }

  el.results.replaceChildren(wrap);
}

function renderPagination(data) {
  const pages = Number(data.pages ?? 1);
  const page = Number(data.page ?? 1);

  el.pagination.replaceChildren();
  if (pages <= 1) return;

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn btn-secondary';
  previous.innerHTML = `${iconMarkup('chevron-left', { size: 16 })}<span></span>`;
  previous.lastElementChild.textContent = t('search.previous');
  previous.disabled = page <= 1;
  previous.addEventListener('click', () => goToPage(page - 1));

  const label = document.createElement('span');
  label.className = 'page-indicator tabular';
  label.textContent = t('search.pageOf', { page, pages });

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-secondary';
  next.innerHTML = `<span></span>${iconMarkup('chevron-right', { size: 16 })}`;
  next.firstElementChild.textContent = t('search.next');
  next.disabled = page >= pages;
  next.addEventListener('click', () => goToPage(page + 1));

  el.pagination.append(previous, label, next);
}

function goToPage(page) {
  updateState({ page }, { keepPage: true });
  // The results changed but the viewport did not. Without this, page two opens
  // scrolled to where page one's tenth card was.
  el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* -------------------------------------------------------------------------
 * Quick chips
 * ---------------------------------------------------------------------- */

function renderChips() {
  if (!el.chips) return;

  const state = readState();
  const counts = facets?.chips ?? {};
  const dayCounts = facets?.chip_days ?? {};

  el.chips.replaceChildren(
    ...CHIPS.map((chip) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip chip-quick';

      const active = isChipActive(chip, state, dayCounts);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));

      const label = document.createElement('span');
      label.textContent = t(chip.key);
      button.append(label);

      const count = counts[chip.id];
      if (Number.isFinite(count)) {
        const badge = document.createElement('span');
        badge.className = 'chip-count tabular';
        badge.textContent = formatCount(count);
        button.append(badge);
      }

      button.addEventListener('click', () => toggleChip(chip, dayCounts));
      item.append(button);
      return item;
    })
  );
}

function isChipActive(chip, state, dayCounts) {
  if (chip.id === 'no_deadline') return state.noDeadline;
  if (chip.param === PARAMS.postedWithin) return state.postedWithin === chipDays(chip, dayCounts);
  if (chip.param === PARAMS.closingWithin) return state.closingWithin === chipDays(chip, dayCounts);
  return false;
}

/**
 * Chips are toggles, and the three that constrain a date are mutually
 * exclusive with each other.
 *
 * "Closing soon" and "no deadline" cannot both hold: the first requires a
 * closes_at inside the window and the second requires it to be null, so
 * selecting both would always return nothing. Rather than let a reader build
 * that and wonder, selecting one clears the other.
 */
function toggleChip(chip, dayCounts) {
  const state = readState();
  const active = isChipActive(chip, state, dayCounts);

  const cleared = { postedWithin: null, closingWithin: null, noDeadline: false };

  if (active) {
    updateState(cleared);
    return;
  }

  if (chip.id === 'no_deadline') {
    updateState({ ...cleared, noDeadline: true });
  } else if (chip.param === PARAMS.postedWithin) {
    updateState({ ...cleared, postedWithin: chipDays(chip, dayCounts) });
  } else {
    updateState({ ...cleared, closingWithin: chipDays(chip, dayCounts) });
  }
}

/* -------------------------------------------------------------------------
 * The filter panel
 * ---------------------------------------------------------------------- */

function renderFilterPanel() {
  if (!el.filterBody) return;

  const state = readState();

  // Ticking a checkbox changes the URL, which redraws the whole panel, which
  // destroys the checkbox that was ticked. A mouse user never notices. A
  // keyboard user loses their place on every single filter and has to tab back
  // from the top of the panel, which makes the panel effectively unusable
  // without a pointer.
  //
  // So the control that had focus is identified before the rebuild and given it
  // back afterwards. Every control carries data-filter-key for exactly this.
  const focusKey = el.filterBody.contains(document.activeElement)
    ? document.activeElement.getAttribute('data-filter-key')
    : null;

  el.filterBody.replaceChildren();

  if (facetsState === 'loading') {
    // A spinner rather than skeletons: the shape of a filter panel is not known
    // until its contents are, since it has as many rows as there are teams.
    // Delayed by 250ms, so a fast response is never seen to load.
    const waiting = document.createElement('p');
    waiting.className = 'loading-row';
    waiting.innerHTML = '<span class="spinner small delayed"></span><span></span>';
    waiting.lastElementChild.textContent = t('common.loading');
    el.filterBody.append(waiting);
    return;
  }

  if (facetsState === 'error' || !facets) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = t('search.facetsError');
    el.filterBody.append(message);
    return;
  }

  el.filterBody.append(
    checkboxGroup(
      'dept',
      t('search.department'),
      (facets.departments ?? []).map((d) => ({
        value: d.slug,
        label: d.name,
        count: d.count,
      })),
      state.departments,
      (values) => updateState({ departments: values })
    )
  );

  el.filterBody.append(
    tagGroup(facets.tags ?? [], state)
  );

  el.filterBody.append(
    checkboxGroup(
      'commitment',
      t('search.commitment'),
      (facets.commitments ?? []).map((c) => ({
        value: c.key,
        label: commitmentLabel(c.key),
        count: c.count,
      })),
      state.commitments,
      (values) => updateState({ commitments: values })
    )
  );

  el.filterBody.append(locationGroup(state), remoteGroup(state));

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn btn-quiet filter-clear';
  clear.textContent = t('search.clearFilters');
  clear.disabled = activeFilterCount(state) === 0;
  clear.addEventListener('click', () =>
    updateState({
      departments: [],
      tags: [],
      matchAll: false,
      commitments: [],
      location: '',
      remote: '',
      postedWithin: null,
      closingWithin: null,
      noDeadline: false,
    })
  );

  el.filterBody.append(clear);
  syncFilterCount(state);

  if (focusKey) {
    const restored = el.filterBody.querySelector(
      `[data-filter-key="${CSS.escape(focusKey)}"]`
    );
    // A text field gets its caret put back at the end as well, since focus
    // alone would leave it at position zero mid word.
    restored?.focus();
    if (restored instanceof HTMLInputElement && restored.type === 'search') {
      const end = restored.value.length;
      restored.setSelectionRange(end, end);
    }
  }
}

function checkboxGroup(name, legend, options, selected, onChange) {
  const group = document.createElement('fieldset');
  group.className = 'filter-group';

  const caption = document.createElement('legend');
  caption.textContent = legend;
  group.append(caption);

  if (options.length === 0) {
    const none = document.createElement('p');
    none.className = 'muted';
    none.textContent = t('search.filterNone');
    group.append(none);
    return group;
  }

  for (const option of options) {
    const row = document.createElement('label');
    row.className = 'check-row filter-row';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = option.value;
    box.setAttribute('data-filter-key', `${name}:${option.value}`);
    box.checked = selected.includes(option.value);
    box.addEventListener('change', () => {
      const next = [...group.querySelectorAll('input:checked')].map((input) => input.value);
      onChange(next);
    });

    const label = document.createElement('span');
    label.textContent = option.label;

    const count = document.createElement('span');
    count.className = 'filter-count tabular';
    count.textContent = formatCount(option.count);

    row.append(box, label, count);
    group.append(row);
  }

  return group;
}

/**
 * The tag cloud. Section 4 asks for a chip row where several tags can be
 * selected at once, OR matching by default, with a "match all selected tags"
 * toggle for AND, a count beside each, and no tag with zero published jobs.
 *
 * The zero case is handled on the server, which never sends one.
 */
function tagGroup(tags, state) {
  const group = document.createElement('fieldset');
  group.className = 'filter-group';

  const caption = document.createElement('legend');
  caption.textContent = t('search.tags');
  group.append(caption);

  if (tags.length === 0) {
    const none = document.createElement('p');
    none.className = 'muted';
    none.textContent = t('search.filterNone');
    group.append(none);
    return group;
  }

  const cloud = document.createElement('ul');
  cloud.className = 'chip-row tag-cloud';

  cloud.append(
    ...tags.map((tag) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip chip-tag';
      button.setAttribute('data-filter-key', `tag:${tag.slug}`);

      const active = state.tags.includes(tag.slug);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));

      const label = document.createElement('span');
      label.textContent = tag.name;

      const count = document.createElement('span');
      count.className = 'chip-count tabular';
      count.textContent = formatCount(tag.count);

      button.append(label, count);
      button.addEventListener('click', () => toggleTag(tag.slug));

      item.append(button);
      return item;
    })
  );

  group.append(cloud);

  // Only offered once there is something for it to mean. With one tag selected
  // "match all" and "match any" are the same query, and a control that changes
  // nothing is a control that teaches nobody anything.
  if (state.tags.length > 1) {
    const row = document.createElement('label');
    row.className = 'check-row';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('data-filter-key', 'match-all');
    box.checked = state.matchAll;
    box.addEventListener('change', () => updateState({ matchAll: box.checked }));

    const label = document.createElement('span');
    label.textContent = t('search.matchAllTags');

    row.append(box, label);
    group.append(row);
  }

  return group;
}

function toggleTag(slug) {
  const state = readState();
  const next = state.tags.includes(slug)
    ? state.tags.filter((value) => value !== slug)
    : [...state.tags, slug];
  updateState({ tags: next });
}

function locationGroup(state) {
  const group = document.createElement('div');
  group.className = 'filter-group field';

  const label = document.createElement('label');
  label.setAttribute('for', 'locationFilter');
  label.textContent = t('search.location');

  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'locationFilter';
  input.setAttribute('data-filter-key', 'location');
  input.value = state.location;
  input.placeholder = t('search.locationPlaceholder');
  input.autocomplete = 'off';

  // On change rather than on input. A substring match rebuilt on every
  // keystroke is a request per keystroke for a field somebody is halfway
  // through typing.
  input.addEventListener('change', () => updateState({ location: input.value.trim() }));

  group.append(label, input);
  return group;
}

function remoteGroup(state) {
  const group = document.createElement('div');
  group.className = 'filter-group field';

  const label = document.createElement('label');
  label.setAttribute('for', 'remoteFilter');
  label.textContent = t('search.remote');

  const select = document.createElement('select');
  select.id = 'remoteFilter';
  select.setAttribute('data-filter-key', 'remote');

  for (const option of REMOTE_OPTIONS) {
    const choice = document.createElement('option');
    choice.value = option.id;
    choice.textContent = t(option.key);
    choice.selected = option.id === state.remote;
    select.append(choice);
  }

  select.addEventListener('change', () => updateState({ remote: select.value }));

  group.append(label, select);
  return group;
}

function syncFilterCount(state) {
  const count = activeFilterCount(state);
  if (el.filterCount) {
    el.filterCount.textContent = count > 0 ? formatCount(count) : '';
    el.filterCount.hidden = count === 0;
  }
  if (el.filterToggle) {
    el.filterToggle.setAttribute(
      'aria-label',
      count > 0 ? t('search.filtersActive', { count }) : t('search.filters')
    );
  }
}

/* -------------------------------------------------------------------------
 * The filter panel as a bottom sheet
 * ---------------------------------------------------------------------- */

function wireFilterSheet() {
  if (!el.filterPanel || !el.filterToggle) return;

  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    el.filterPanel.setAttribute('data-open', 'true');
    el.filterPanel.setAttribute('aria-hidden', 'false');
    el.filterToggle.setAttribute('aria-expanded', 'true');
    if (el.filterBackdrop) el.filterBackdrop.hidden = false;
    document.body.setAttribute('data-scroll-locked', 'true');
    el.filterPanel.querySelector('button, input, select, a[href]')?.focus();
  };

  const close = () => {
    el.filterPanel.removeAttribute('data-open');
    el.filterPanel.setAttribute('aria-hidden', isSheet() ? 'true' : 'false');
    el.filterToggle.setAttribute('aria-expanded', 'false');
    if (el.filterBackdrop) el.filterBackdrop.hidden = true;
    document.body.setAttribute('data-scroll-locked', 'false');
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  };

  const isOpen = () => el.filterPanel.getAttribute('data-open') === 'true';

  el.filterToggle.addEventListener('click', () => (isOpen() ? close() : open()));

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-filters]')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen() || event.key !== 'Escape') return;
    event.preventDefault();
    close();
  });

  // Widening past the breakpoint must never leave the page scroll locked behind
  // a panel that is now an ordinary column. Same failure the navigation drawer
  // guards against in shell.js, same fix.
  const desktop = window.matchMedia('(min-width: 1024px)');
  const sync = () => {
    if (!isSheet()) {
      el.filterPanel.removeAttribute('data-open');
      el.filterPanel.setAttribute('aria-hidden', 'false');
      el.filterToggle.setAttribute('aria-expanded', 'false');
      if (el.filterBackdrop) el.filterBackdrop.hidden = true;
      document.body.setAttribute('data-scroll-locked', 'false');
    } else if (!isOpen()) {
      el.filterPanel.setAttribute('aria-hidden', 'true');
    }
  };

  desktop.addEventListener('change', sync);
  sync();

  function isSheet() {
    return !desktop.matches;
  }
}

/* -------------------------------------------------------------------------
 * Suggestions
 * ---------------------------------------------------------------------- */

const suggest = {
  items: [],
  active: -1,
  timer: null,
  token: 0,
};

/** One Han character is a real query. One Latin letter is not. */
function minimumQueryLength() {
  return getLocale() === 'en' ? 2 : 1;
}

function wireSuggestions() {
  if (!el.input || !el.suggestions) return;

  el.input.addEventListener('input', () => {
    if (el.clear) el.clear.hidden = el.input.value === '';

    clearTimeout(suggest.timer);
    const value = el.input.value.trim();

    if (value.length < minimumQueryLength()) {
      closeSuggestions();
      renderRecent();
      return;
    }

    suggest.timer = setTimeout(() => fetchSuggestions(value), SUGGEST_DEBOUNCE_MS);
  });

  el.input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSuggestions();
      return;
    }

    if (suggest.items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' && suggest.active >= 0) {
      // Only when something is highlighted. With nothing highlighted, Enter
      // submits the form and searches for what was typed, which is what
      // somebody who ignored the list expects.
      event.preventDefault();
      choose(suggest.items[suggest.active]);
    }
  });

  el.input.addEventListener('focus', () => {
    if (el.input.value.trim() === '') renderRecent();
  });

  // A click outside closes the list. Focusout alone is not enough: clicking a
  // suggestion moves focus before the click lands.
  document.addEventListener('pointerdown', (event) => {
    if (el.form?.contains(event.target)) return;
    closeSuggestions();
  });
}

async function fetchSuggestions(value) {
  const token = ++suggest.token;
  const result = await api(`/api/public/suggest?q=${encodeURIComponent(value)}`);
  if (token !== suggest.token) return;
  if (!result.ok) return closeSuggestions();

  renderSuggestions(result.data.suggestions ?? {});
}

function renderSuggestions(groups) {
  const sections = [
    { key: 'search.groupTitles', kind: 'title', items: groups.titles ?? [] },
    { key: 'search.groupTags', kind: 'tag', items: groups.tags ?? [] },
    { key: 'search.groupDepartments', kind: 'department', items: groups.departments ?? [] },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) return closeSuggestions();

  suggest.items = [];
  suggest.active = -1;
  el.suggestions.replaceChildren();

  for (const section of sections) {
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', t(section.key));

    const heading = document.createElement('p');
    heading.className = 'suggestion-heading';
    heading.textContent = t(section.key);
    group.append(heading);

    for (const item of section.items) {
      const index = suggest.items.length;
      const entry = { ...item, kind: section.kind, index };
      suggest.items.push(entry);

      const option = document.createElement('div');
      option.className = 'suggestion';
      option.id = `suggestion-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');

      const label = document.createElement('span');
      label.textContent = item.label;
      option.append(label);

      if (section.kind !== 'title' && Number(item.count) > 0) {
        const count = document.createElement('span');
        count.className = 'chip-count tabular';
        count.textContent = formatCount(item.count);
        option.append(count);
      }

      // pointerdown rather than click, so the choice registers before the
      // document level pointerdown handler closes the list under it.
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        choose(entry);
      });
      option.addEventListener('mouseenter', () => setActive(index));

      group.append(option);
      entry.element = option;
    }

    el.suggestions.append(group);
  }

  el.suggestions.hidden = false;
  el.input.setAttribute('aria-expanded', 'true');
}

function moveActive(step) {
  const next = suggest.active + step;
  setActive(next < 0 ? suggest.items.length - 1 : next >= suggest.items.length ? 0 : next);
}

function setActive(index) {
  suggest.items.forEach((item, i) => {
    const active = i === index;
    item.element?.classList.toggle('active', active);
    item.element?.setAttribute('aria-selected', String(active));
  });
  suggest.active = index;

  const item = suggest.items[index];
  if (item?.element) {
    el.input.setAttribute('aria-activedescendant', item.element.id);
    item.element.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * What selecting a suggestion does, which differs by kind.
 *
 * A title carries the posting's uuid, so it goes straight there rather than
 * running a search for the posting's own name and hoping it comes first. A tag
 * or a department carries a slug and becomes a filter.
 */
function choose(item) {
  closeSuggestions();

  if (item.kind === 'title') {
    window.location.href = `/jobs/${encodeURIComponent(item.value)}`;
    return;
  }

  el.input.value = '';
  if (el.clear) el.clear.hidden = true;

  if (item.kind === 'tag') {
    const state = readState();
    updateState({
      q: '',
      tags: unique([...state.tags, item.value]),
    });
  } else {
    const state = readState();
    updateState({
      q: '',
      departments: unique([...state.departments, item.value]),
    });
  }
}

function closeSuggestions() {
  suggest.items = [];
  suggest.active = -1;
  el.suggestions.hidden = true;
  el.suggestions.replaceChildren();
  el.input?.setAttribute('aria-expanded', 'false');
  el.input?.removeAttribute('aria-activedescendant');
}

/* -------------------------------------------------------------------------
 * Recent searches
 * ---------------------------------------------------------------------- */

// localStorage and nowhere else. Section 4: nothing search related is stored
// server side against an account. This is a convenience for one browser, and
// treating it as anything more would make it a record of what somebody was
// looking for, which is not a thing a job board should keep.

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function rememberSearch(value) {
  if (!value) return;
  const next = [value, ...readRecent().filter((v) => v !== value)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full. The search still runs.
  }
}

function renderRecent() {
  if (!el.recent) return;

  const recent = readRecent();
  el.recent.replaceChildren();

  if (recent.length === 0 || el.input.value.trim() !== '') {
    el.recent.hidden = true;
    return;
  }

  const heading = document.createElement('p');
  heading.className = 'suggestion-heading';
  heading.textContent = t('search.recentHeading');
  el.recent.append(heading);

  const row = document.createElement('ul');
  row.className = 'chip-row';

  row.append(
    ...recent.map((value) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = value;
      button.addEventListener('click', () => {
        el.input.value = value;
        if (el.clear) el.clear.hidden = false;
        el.recent.hidden = true;
        updateState({ q: value });
      });
      item.append(button);
      return item;
    })
  );

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn btn-quiet small-btn';
  clear.textContent = t('search.recentClear');
  clear.addEventListener('click', () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Nothing to do. The list is gone from the page either way.
    }
    renderRecent();
  });

  el.recent.append(row, clear);
  el.recent.hidden = false;
}

/* -------------------------------------------------------------------------
 * Wiring
 * ---------------------------------------------------------------------- */

function clearEverything() {
  el.input.value = '';
  if (el.clear) el.clear.hidden = true;
  window.history.replaceState(null, '', window.location.pathname);
  draw();
}

function wireForm() {
  el.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    closeSuggestions();
    const value = el.input.value.trim();
    rememberSearch(value);
    updateState({ q: value });
  });

  el.clear?.addEventListener('click', () => {
    el.input.value = '';
    el.clear.hidden = true;
    el.input.focus();
    updateState({ q: '' });
  });

  el.sort?.addEventListener('change', () => updateState({ sort: el.sort.value }));

  // A tag pill on a card filters rather than navigating, per section 4. The
  // pill is a real link so that opening it in a new tab and copying its address
  // both work; this intercepts the ordinary click and applies it in place.
  el.results?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-tag-slug]');
    if (!pill) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    toggleTag(pill.getAttribute('data-tag-slug'));
  });
}

function syncControls(state) {
  if (el.input && document.activeElement !== el.input) el.input.value = state.q;
  if (el.clear) el.clear.hidden = (el.input?.value ?? '') === '';

  if (el.sort) {
    el.sort.replaceChildren(
      ...SORTS.map((option) => {
        const choice = document.createElement('option');
        choice.value = option.id;
        choice.textContent = t(option.key);
        // Relevance is the default whenever there is a query and newest when
        // there is not, which is the RPC's rule and is mirrored here rather
        // than guessed at.
        choice.selected = option.id === (state.sort || (state.q ? 'relevance' : 'newest'));
        return choice;
      })
    );
  }

  document.title = state.q
    ? t('search.pageTitleQuery', { query: state.q })
    : t('search.pageTitle');
}

/* -------------------------------------------------------------------------
 * Draw
 * ---------------------------------------------------------------------- */

function draw() {
  const state = readState();
  syncControls(state);
  syncFilterCount(state);
  renderChips();
  renderFilterPanel();
  // Section 4 offers recent searches under an empty search box, so they are
  // drawn here rather than only on focus: a reader arriving at /search should
  // see them without having to click into the field first. renderRecent hides
  // itself the moment there is a query, which is what keeps them from sitting
  // under a box that already has something in it.
  renderRecent();
  runSearch(state);
}

function boot() {
  collectElements();
  if (!el.results) return;

  wireForm();
  wireSuggestions();
  wireFilterSheet();

  // Facets and the first search go together rather than in sequence. The
  // results are what the reader came for, and they must not wait on the filter
  // panel's counts.
  loadFacets();
  draw();

  // Arriving through history, which replaceState does not itself create but
  // another page might. Redraw from whatever the URL now says.
  window.addEventListener('popstate', draw);

  // Everything on this page is written by JavaScript, so a language change is a
  // redraw rather than a retranslation. It also re-runs the search, which is
  // the point: the postings themselves come back in the new language, and a
  // board that switched its chrome to Chinese while leaving the roles in
  // English would be the worst of both.
  document.addEventListener('gftv:localechange', () => {
    loadFacets();
    draw();
  });
}

function unique(values) {
  return [...new Set(values)];
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
