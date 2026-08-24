// /admin/translations. Section 8.11.
//
// The queue of everything somebody has told us reads wrongly, and the tooling to
// act on it. One queue for both origins, per 7i: a form report from the foot of
// a posting and a helper's in-place annotation land in the same table and are
// worked through the same list, distinguished by a badge and not by a tab.
//
// What this page has to get right is not the list. It is the panel, and four
// things in it:
//
//   **The current wording sits beside the suggestion**, per 8.11, "so an admin
//   can see exactly what would change without opening the posting in another
//   tab". Both languages: the source as written, and the language being
//   complained about. A reader reporting bad Chinese is comparing it against the
//   English, and so is whoever fixes it.
//
//   **A suggestion is never applied by clicking accept.** 7h promises the
//   reporter that an admin reads it first, every time. There is a control that
//   copies the suggestion into the editing box, which is a different thing: what
//   gets saved is what is in the box when Save is pressed.
//
//   **An interface report has no editing box at all**, per 7i. It shows the
//   dictionary key and says plainly that this is a code change and a deploy.
//   Building the editor "just for the small ones" is the thing that decision
//   exists to stop.
//
//   **A resolution needs a sentence.** The database refuses fixed or rejected
//   without one, so this is not the only guard; what the page adds is saying why
//   before somebody hits it. The reporter reads that note on their own account
//   page, which is the whole reason the requirement is there.
//
// The second tab is the other half of 8.11, the needs-translation audit: what
// nobody has translated yet, whether or not a reader has complained. It is on
// this page instead of one of its own because the two are the same question
// asked from opposite ends, and somebody who has just fixed a reported sentence
// is the person best placed to see what else in that language is missing.
//
//   **The audit is per language**, and the language is chosen, not
//   filtered. All of them at once would need a language column on every row and
//   a count that answers nothing.
//
//   **A finished translation is not on the list at all**, so an empty list is
//   the real answer to "what is left in Chinese" and the page says it in those
//   words instead of as "no results".
//
//   **The audit has no actions.** Everything on it is fixed in the editor or on
//   the team and tag pages, and every row carries the way through. Building a
//   second editing surface here would be a second set of validation to keep in
//   step with 8.2's.
//
// The third tab is 7i's other half: who is allowed to do this work. 8.11 puts it
// here and not in applicant users because "granting is what turns a
// community member into a contributor, so it belongs beside the queue their work
// arrives in".
//
//   **It is admins only, and the tab is absent instead of disabled**, per
//   deviation 34. The panel is removed from the document for a job poster, not
//   hidden, and the route refuses both actions regardless.
//
//   **A reason is required in both directions**, which is one more than 7i asks
//   for. A revoke deletes the row, so the audit log is the only record left that
//   somebody ever held the role.
//
//   **The counts beside a helper are that language's**, because the role is.
//   Somebody granted two languages is two rows with two sets of numbers.

import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { createDialog } from './dialog.js';
import { confirmAction } from './danger-confirm.js';
import { formatDate } from './format.js';
import {
  mountAdminPage,
  adminMessage,
  emptyRow,
  runAction,
  adminLocales,
  isAdminUser,
} from './admin-shell.js';

const PATH = '/admin/translations';

/** Migration 015's statuses, in the order 8.11 walks them. */
const STATUSES = ['open', 'accepted', 'fixed', 'rejected'];

/** The two that close a report, and so will not go through without a note. */
const RESOLVED = ['fixed', 'rejected'];

/** Migration 015's target types, and 023's two origins. */
const TARGETS = ['job', 'department', 'tag', 'interface'];
const ORIGINS = ['form', 'annotation'];

/**
 * The two halves of 8.11, plus 7i's roster.
 *
 * The third is admins only and is filtered out of this list for everybody else
 * by availableTabs, which is what stops a job poster reaching it by typing
 * ?tab=helpers as well as by clicking.
 */
const TABS = ['queue', 'audit', 'helpers'];

/** How long to wait after a keystroke before searching for somebody. */
const SEARCH_DELAY = 250;

/**
 * Migration 032's three states, and the three things it audits.
 *
 * No `interface` here, unlike the queue's targets: the dictionaries are files
 * and not rows, per 7i, so nothing in the database can say whether a key has
 * been translated. `npm run check-i18n` is what answers that.
 */
const AUDIT_STATES = ['missing', 'drafted', 'thin'];
const AUDIT_TARGETS = ['job', 'department', 'tag'];

/** How many field names a row lists before it says how many more there are. */
const MISSING_SHOWN = 3;

let payload = null;
let state = { status: '', locale: '', target: '', origin: '', page: 1 };
let auditPayload = null;
let auditState = { locale: '', target: '', state: '', page: 1 };
let helperPayload = null;
let helperState = { locale: '', page: 1 };
let tab = 'queue';
let detailDialog = null;
let helperPicker = null;
let searchTimer = 0;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  // Deviation 34: an admin only control is absent, never disabled. Removed
  // instead of hidden, so nothing in it is reachable by a keyboard, by a find
  // in page, or by an accessibility tree that ignores an aria-hidden it cannot
  // see. The route refuses regardless.
  if (!isAdminUser()) document.querySelector('#helpersPanel')?.remove();

  readStateFromUrl();
  drawFilters();
  drawAuditFilters();
  drawHelperFilters();
  applyTabVisibility();
  drawTabs();

  document.querySelector('#reportFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.status = document.querySelector('#statusFilter').value;
    state.locale = document.querySelector('#localeFilter').value;
    state.target = document.querySelector('#targetFilter').value;
    state.origin = document.querySelector('#originFilter').value;
    state.page = 1;
    writeStateToUrl();
    runAction(load, 'translation queue load');
  });

  document.querySelector('#auditFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    auditState.locale = document.querySelector('#auditLocale').value;
    auditState.target = document.querySelector('#auditTarget').value;
    auditState.state = document.querySelector('#auditState').value;
    auditState.page = 1;
    writeStateToUrl();
    runAction(loadAudit, 'needs translation load');
  });

  document.querySelector('#helperFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    helperState.locale = document.querySelector('#helperLocale').value;
    helperState.page = 1;
    writeStateToUrl();
    runAction(loadHelpers, 'translation helpers load');
  });

  document.querySelector('#grantHelper')?.addEventListener('click', () => openHelperPicker());

  await loadCurrentTab();

  document.addEventListener('gftv:localechange', () => {
    drawFilters();
    drawAuditFilters();
    drawHelperFilters();
    drawTabs();
    draw();
    drawAudit();
    drawHelpers();
  });
}

/**
 * The tabs this caller has.
 *
 * A job poster gets two. The third is filtered out here and not only in the
 * strip, so ?tab=helpers in the address bar lands on the queue instead of on an
 * empty panel that then asks the route a question it will refuse.
 */
function availableTabs() {
  return TABS.filter((name) => name !== 'helpers' || isAdminUser());
}

function readStateFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const pick = (name, allowed) => {
    const value = search.get(name) ?? '';
    return allowed.includes(value) ? value : '';
  };

  const page = Math.max(1, Number(search.get('page')) || 1);

  tab = pick('tab', availableTabs()) || 'queue';

  state = {
    // 'all' is not a status. It is the way out of the default view, which shows
    // only what is unfinished: without it there would be no way to look at a
    // report that has already been answered without guessing which of the two
    // closed states it ended in.
    status: pick('status', [...STATUSES, 'all']),
    // Not checked against the active languages here: a report may name one that
    // has since been deactivated, and the route re-checks it against
    // gftvjobs_locales regardless.
    locale: search.get('locale') ?? '',
    target: pick('target', TARGETS),
    origin: pick('origin', ORIGINS),
    page,
  };

  // The two tabs share the names of the filters they have in common, so a
  // language chosen on one is the language the other opens on. Only the active
  // tab's are written back, so the query string says what is on screen and
  // does not carry a set of filters for a list nobody is looking at.
  auditState = {
    locale: search.get('locale') ?? '',
    target: pick('target', AUDIT_TARGETS),
    state: pick('state', AUDIT_STATES),
    page,
  };

  helperState = { locale: search.get('locale') ?? '', page };
}

function writeStateToUrl() {
  const search = new URLSearchParams();

  if (tab === 'audit') {
    search.set('tab', 'audit');
    for (const name of ['locale', 'target', 'state']) {
      if (auditState[name]) search.set(name, auditState[name]);
    }
    if (auditState.page > 1) search.set('page', String(auditState.page));
  } else if (tab === 'helpers') {
    search.set('tab', 'helpers');
    if (helperState.locale) search.set('locale', helperState.locale);
    if (helperState.page > 1) search.set('page', String(helperState.page));
  } else {
    for (const name of ['status', 'locale', 'target', 'origin']) {
      if (state[name]) search.set(name, state[name]);
    }
    if (state.page > 1) search.set('page', String(state.page));
  }

  const query = search.toString();
  window.history.replaceState({}, '', query ? `${PATH}?${query}` : PATH);
}

/* -------------------------------------------------------------------------
 * The two tabs
 * ---------------------------------------------------------------------- */

/**
 * The tab strip.
 *
 * Manual activation over automatic: the arrow keys move focus along the
 * strip and Enter or Space opens the tab focus is on. Each tab is a request, and
 * arrowing across a strip that fetches on every keypress is how a keyboard user
 * ends up waiting for two lists they did not ask for.
 *
 * The roving tabindex is the other half of that, and it is the part the phase 7
 * bucket tabs got half right: they set tabindex="-1" on the unselected ones
 * without handling an arrow key, which leaves those tabs reachable by nothing at
 * all. Either both or neither.
 */
function drawTabs() {
  const holder = document.querySelector('#translationTabs');
  if (!holder) return;

  const hadFocus = holder.contains(document.activeElement);

  const counts = [
    // Open reports, which is what the sidebar badge counts too.
    { name: 'queue', id: 'tabQueue', key: 'admin.tabReports', count: payload?.counts?.open },
    { name: 'audit', id: 'tabAudit', key: 'admin.tabAudit', count: auditPayload?.total },
    { name: 'helpers', id: 'tabHelpers', key: 'admin.tabHelpers', count: helperPayload?.total },
  ].filter((entry) => availableTabs().includes(entry.name));

  holder.innerHTML = counts
    .map(
      (entry) =>
        `<button type="button" class="bucket-tab" role="tab" id="${entry.id}"` +
        ` data-tab="${entry.name}" aria-controls="${entry.name}Panel"` +
        ` aria-selected="${tab === entry.name}"` +
        ` tabindex="${tab === entry.name ? '0' : '-1'}">` +
        `<span>${escapeHtml(t(entry.key))}</span>` +
        // A count that has not been read yet is absent, not zero. A zero
        // on the audit tab would say the translation is finished.
        (entry.count === null || entry.count === undefined
          ? ''
          : `<span class="bucket-count">${escapeHtml(String(entry.count))}</span>`) +
        '</button>'
    )
    .join('');

  const buttons = [...holder.querySelectorAll('[data-tab]')];

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectTab(button.getAttribute('data-tab')));

    button.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = buttons[(index + 1) % buttons.length];
      else if (event.key === 'ArrowLeft') next = buttons[(index - 1 + buttons.length) % buttons.length];
      else if (event.key === 'Home') next = buttons[0];
      else if (event.key === 'End') next = buttons[buttons.length - 1];
      if (!next) return;

      event.preventDefault();
      buttons.forEach((other) => {
        other.tabIndex = other === next ? 0 : -1;
      });
      next.focus();
    });
  });

  // Redrawing the strip destroys the button the keyboard was on, which would
  // drop focus to the document and lose somebody's place mid-page.
  if (hadFocus) holder.querySelector('[aria-selected="true"]')?.focus();
}

function applyTabVisibility() {
  const queuePanel = document.querySelector('#queuePanel');
  const auditPanel = document.querySelector('#auditPanel');
  // Absent altogether for a job poster, which is why this is optional and not
  // a panel that is always there and always hidden.
  const helpersPanel = document.querySelector('#helpersPanel');
  if (queuePanel) queuePanel.hidden = tab !== 'queue';
  if (auditPanel) auditPanel.hidden = tab !== 'audit';
  if (helpersPanel) helpersPanel.hidden = tab !== 'helpers';
}

function selectTab(name) {
  if (!availableTabs().includes(name) || name === tab) return;

  tab = name;
  writeStateToUrl();
  applyTabVisibility();
  drawTabs();
  runAction(loadCurrentTab, `translation ${name} load`);
}

/**
 * Load whichever tab is open.
 *
 * Every time it is opened, not once. An admin who has just fixed three postings
 * and flips to the audit is asking what is left now, and a cached answer from
 * before those edits is the wrong one.
 */
function loadCurrentTab() {
  if (tab === 'audit') return loadAudit();
  if (tab === 'helpers') return loadHelpers();
  return load();
}

/**
 * The four filter selects.
 *
 * The language list comes from gftvjobs_locales through the shell instead of
 * from a constant, for the reason 8.2 gives about the editor's tabs: a language
 * added later should appear without touching this file.
 */
function drawFilters() {
  const options = (list, selected, label) =>
    list
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.value)}"${
            entry.value === selected ? ' selected' : ''
          }>${escapeHtml(label(entry))}</option>`
      )
      .join('');

  const statusList = [
    { value: '', key: 'admin.unfinishedReports' },
    ...STATUSES.map((status) => ({ value: status, key: `admin.reportStatus_${status}` })),
    { value: 'all', key: 'admin.everyReport' },
  ];

  const localeList = [
    { value: '', key: 'admin.anyLanguage' },
    ...adminLocales().map((locale) => ({ value: locale.code, name: locale.native_name })),
  ];

  const targetList = [
    { value: '', key: 'admin.anyTarget' },
    ...TARGETS.map((target) => ({ value: target, key: `admin.target_${target}` })),
  ];

  const originList = [
    { value: '', key: 'admin.anyOrigin' },
    ...ORIGINS.map((origin) => ({ value: origin, key: `admin.origin_${origin}` })),
  ];

  const byKey = (entry) => (entry.name ? entry.name : t(entry.key));

  const status = document.querySelector('#statusFilter');
  const locale = document.querySelector('#localeFilter');
  const target = document.querySelector('#targetFilter');
  const origin = document.querySelector('#originFilter');

  if (status) status.innerHTML = options(statusList, state.status, byKey);
  if (locale) locale.innerHTML = options(localeList, state.locale, byKey);
  if (target) target.innerHTML = options(targetList, state.target, byKey);
  if (origin) origin.innerHTML = options(originList, state.origin, byKey);
}

async function load() {
  const search = new URLSearchParams();
  for (const name of ['locale', 'target', 'origin']) {
    if (state[name]) search.set(name, state[name]);
  }

  // With no status chosen the queue shows what is unfinished, per 8.11's "open
  // ones first". Choosing one means that one exactly; 'all' is the way to see
  // everything including what has already been answered.
  if (state.status === 'all') search.set('bucket', 'all');
  else if (state.status) search.set('status', state.status);
  else search.set('bucket', 'unfinished');

  search.set('page', String(state.page));

  const result = await api(`/api/admin/translations?${search.toString()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  draw();
  // The open count on the tab beside it, so the number is the same one the
  // sidebar badge shows and not a second reading of the same thing.
  drawTabs();
}

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

function draw() {
  const list = document.querySelector('#reportList');
  if (!list || !payload) return;

  const rows = payload.reports ?? [];

  if (rows.length === 0) {
    list.innerHTML = countsMarkup() + emptyRow(t('admin.noReports'));
    drawPager();
    return;
  }

  list.innerHTML =
    countsMarkup() +
    `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colTarget'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguage'))}</th>
          <th scope="col">${escapeHtml(t('admin.colReport'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colReported'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(rowMarkup).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('[data-report-id]').forEach((row) => {
    const id = row.getAttribute('data-report-id');
    row.querySelector('[data-open]')?.addEventListener('click', () => {
      runAction(() => openReport(id), 'open report');
    });
  });

  drawPager();
}

function rowMarkup(report) {
  return `
    <tr data-report-id="${escapeHtml(report.id)}">
      <td>
        <span class="admin-row-title">${escapeHtml(targetLabel(report))}</span>
        <span class="admin-sub muted">${escapeHtml(fieldLabel(report))}</span>
      </td>
      <td>${escapeHtml(localeName(report.locale))}</td>
      <td>
        <span class="admin-row-title">${escapeHtml(excerpt(report.note))}</span>
        <span class="admin-sub muted">${escapeHtml(
          t('admin.reportedBy', { who: reporterName(report) })
        )}${
          report.origin === 'annotation'
            ? ` &middot; ${escapeHtml(t('admin.origin_annotation'))}`
            : ''
        }${report.suggested_text ? ` &middot; ${escapeHtml(t('admin.hasSuggestion'))}` : ''}</span>
      </td>
      <td><span class="badge badge-report-${escapeHtml(report.status)}">${escapeHtml(
        t(`admin.reportStatus_${report.status}`)
      )}</span></td>
      <td class="tabular">${escapeHtml(formatDate(report.created_at))}</td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-quiet small" data-open>${escapeHtml(
          t('admin.openReport')
        )}</button>
      </td>
    </tr>`;
}

/**
 * The four counts, as a line above the table.
 *
 * A null is a count that could not be read and is drawn as a dash instead of as
 * a zero, per the rule api/admin/me.js states about the sidebar badge: a zero is
 * a claim, and a failed request does not entitle us to make one.
 */
function countsMarkup() {
  const counts = payload?.counts ?? {};

  return `<p class="muted admin-counts">${STATUSES.map(
    (status) =>
      `${escapeHtml(t(`admin.reportStatus_${status}`))}: <strong>${
        counts[status] === null || counts[status] === undefined
          ? '&mdash;'
          : escapeHtml(String(counts[status]))
      }</strong>`
  ).join(' &middot; ')}</p>`;
}

function drawPager() {
  drawPagerInto('#reportPager', state, payload?.pages ?? 1, load, 'translation queue page');
}

/**
 * One pager, used by both tabs.
 *
 * The state object is passed in place of its page number, because the button
 * moves it: two lists paging independently is two page numbers, and reading one
 * while writing the other is how a next button starts sending somebody to the
 * other tab's page three.
 */
function drawPagerInto(selector, holderState, pages, loader, label) {
  const holder = document.querySelector(selector);
  if (!holder) return;

  if (pages <= 1) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = `
    <button type="button" class="btn btn-quiet small" data-page="prev"
            ${holderState.page <= 1 ? 'disabled' : ''}>${escapeHtml(t('search.previous'))}</button>
    <span class="muted tabular">${escapeHtml(
      t('admin.pageOf', { page: holderState.page, pages })
    )}</span>
    <button type="button" class="btn btn-quiet small" data-page="next"
            ${holderState.page >= pages ? 'disabled' : ''}>${escapeHtml(t('search.next'))}</button>`;

  holder.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      holderState.page += button.getAttribute('data-page') === 'next' ? 1 : -1;
      writeStateToUrl();
      runAction(loader, label);
    });
  });
}

/* -------------------------------------------------------------------------
 * Naming things
 * ---------------------------------------------------------------------- */

function targetLabel(report) {
  if (report.target_type === 'interface') return report.target_key ?? t('admin.target_interface');
  return report.target_label ?? t('admin.targetGone');
}

/**
 * Which part of it reads wrongly.
 *
 * A null field is not a gap in the data: 7h's form defaults to "the whole
 * posting" precisely because a reporter may not know which field they mean, and
 * that is the answer, not a missing one.
 */
function fieldLabel(report) {
  if (report.target_type === 'interface') return t('admin.target_interface');
  if (!report.field) return t('admin.wholeThing');

  return fieldName(report.target_type, report.field);
}

/**
 * What a column is called on screen, for one of the three content types.
 *
 * The type qualified key first, because the same column name means different
 * things on different tables: a posting's description is the body of the role,
 * and a tag's is one line explaining the tag. Falling straight through to
 * admin.field_description would label the second with the first's wording.
 *
 * Shared with the audit, which names the fields a translation is missing.
 */
function fieldName(targetType, field) {
  for (const key of [`admin.field_${targetType}_${field}`, `admin.field_${field}`]) {
    const label = t(key);
    if (label !== key) return label;
  }

  return String(field).replace(/_/g, ' ');
}

function localeName(code) {
  return adminLocales().find((locale) => locale.code === code)?.native_name ?? code;
}

function reporterName(report) {
  return report.reporter?.display_name ?? t('admin.deletedAccount');
}

function excerpt(text, max = 140) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/* -------------------------------------------------------------------------
 * The needs-translation audit
 * ---------------------------------------------------------------------- */

/**
 * The audit's three selects.
 *
 * The language list is the active languages minus the default one. The default
 * is what everything else is translated *from*, so it is never a thing to
 * audit, and offering it would put an option on screen that can only ever
 * return an empty list.
 */
function drawAuditFilters() {
  const options = (list, selected) =>
    list
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.value)}"${
            entry.value === selected ? ' selected' : ''
          }>${escapeHtml(entry.name ?? t(entry.key))}</option>`
      )
      .join('');

  const localeList = adminLocales()
    .filter((locale) => !locale.is_default)
    .map((locale) => ({ value: locale.code, name: locale.native_name }));

  const targetList = [
    { value: '', key: 'admin.anyTarget' },
    ...AUDIT_TARGETS.map((target) => ({ value: target, key: `admin.target_${target}` })),
  ];

  const stateList = [
    { value: '', key: 'admin.anyState' },
    ...AUDIT_STATES.map((entry) => ({ value: entry, key: `admin.auditState_${entry}` })),
  ];

  const locale = document.querySelector('#auditLocale');
  const target = document.querySelector('#auditTarget');
  const auditStateSelect = document.querySelector('#auditState');

  if (locale) locale.innerHTML = options(localeList, auditState.locale);
  if (target) target.innerHTML = options(targetList, auditState.target);
  if (auditStateSelect) auditStateSelect.innerHTML = options(stateList, auditState.state);
}

async function loadAudit() {
  const search = new URLSearchParams({ view: 'audit' });
  for (const name of ['locale', 'target', 'state']) {
    if (auditState[name]) search.set(name, auditState[name]);
  }
  search.set('page', String(auditState.page));

  const result = await api(`/api/admin/translations?${search.toString()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  auditPayload = result.data;

  // The language the route answered with, which is not always the one asked
  // for: a code this site does not have falls back to the first other language
  // instead of to nothing. Taking it back means the select and the sentences
  // under it name what is actually on screen.
  if (auditPayload.locale) auditState.locale = auditPayload.locale;

  drawAuditFilters();
  drawAudit();
  drawTabs();
}

function drawAudit() {
  const list = document.querySelector('#auditList');
  if (!list || !auditPayload) return;

  // No second language configured. A real state on the day one is being set up,
  // and not the same as nothing being left to translate.
  if (!auditPayload.locale) {
    list.innerHTML = emptyRow(t('admin.auditNeedsSecondLanguage'));
    drawAuditPager();
    return;
  }

  const rows = auditPayload.audit ?? [];
  const language = localeName(auditState.locale);

  if (rows.length === 0) {
    const filtered = Boolean(auditState.target || auditState.state);
    list.innerHTML =
      auditCountsMarkup() +
      emptyRow(
        filtered ? t('admin.noAuditMatches') : t('admin.auditFinished', { language })
      );
    drawAuditPager();
    return;
  }

  list.innerHTML =
    auditCountsMarkup() +
    `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colTarget'))}</th>
          <th scope="col">${escapeHtml(t('admin.colState'))}</th>
          <th scope="col">${escapeHtml(t('admin.colMissing'))}</th>
          <th scope="col">${escapeHtml(t('admin.colUpdated'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(auditRowMarkup).join('')}
      </tbody>
    </table>`;

  drawAuditPager();
}

function auditRowMarkup(row) {
  const href = editorHref(row);

  return `
    <tr>
      <td>
        <span class="admin-row-title">${escapeHtml(row.label ?? t('admin.targetGone'))}</span>
        <span class="admin-sub muted">${escapeHtml(
          t(`admin.target_${row.target_type}`)
        )} &middot; ${escapeHtml(sourceStateLabel(row))}</span>
      </td>
      <td><span class="badge badge-audit-${escapeHtml(row.state)}">${escapeHtml(
        t(`admin.auditState_${row.state}`)
      )}</span></td>
      <td>${escapeHtml(missingLabel(row))}</td>
      <td class="tabular">${escapeHtml(formatDate(row.updated_at))}</td>
      <td class="admin-row-actions">${
        href
          ? `<a class="btn btn-quiet small" href="${escapeHtml(href)}">${escapeHtml(
              row.target_type === 'job' ? t('admin.openInEditor') : t('admin.openTheList')
            )}</a>`
          : ''
      }</td>
    </tr>`;
}

/**
 * What is missing from this one.
 *
 * "Everything" for a row with no translation at all, because listing nine field
 * names to say the same thing is noise. A drafted translation with nothing thin
 * about it gets a dash: the state column has already said what is wrong with it,
 * which is that nobody has marked it ready.
 *
 * The list is capped, not wrapped, per deviation 45: nothing in an admin
 * table wraps except a title, and a translation missing every optional field
 * would otherwise widen the row past the page.
 */
function missingLabel(row) {
  if (row.state === 'missing') return t('admin.auditEverything');

  const fields = row.missing_fields ?? [];
  if (fields.length === 0) return '—';

  const names = fields.slice(0, MISSING_SHOWN).map((field) => fieldName(row.target_type, field));
  if (fields.length > MISSING_SHOWN) {
    names.push(t('admin.andMoreFields', { count: fields.length - MISSING_SHOWN }));
  }

  return names.join(', ');
}

/**
 * What state the thing being translated is in, which decides how much this
 * matters.
 *
 * A draft posting with no Chinese is nothing to worry about; a published one is
 * a page a reader is looking at in the wrong language today. The view answers
 * this differently per type, because "published" means nothing about a tag: it
 * says whether a team is active and whether a tag is on any posting at all.
 */
function sourceStateLabel(row) {
  if (row.target_type === 'job') return t(`admin.jobStatus_${row.source_status}`);
  return t(`admin.sourceState_${row.source_status}`);
}

function auditCountsMarkup() {
  const counts = auditPayload?.counts ?? {};

  return `<p class="muted admin-counts">${AUDIT_STATES.map(
    (entry) =>
      `${escapeHtml(t(`admin.auditState_${entry}`))}: <strong>${
        counts[entry] === null || counts[entry] === undefined
          ? '&mdash;'
          : escapeHtml(String(counts[entry]))
      }</strong>`
  ).join(' &middot; ')}</p>`;
}

function drawAuditPager() {
  drawPagerInto(
    '#auditPager',
    auditState,
    auditPayload?.pages ?? 1,
    loadAudit,
    'needs translation page'
  );
}

/* -------------------------------------------------------------------------
 * Translation helpers, per 7i
 * ---------------------------------------------------------------------- */

/**
 * The one filter this tab has.
 *
 * The same language list the audit offers, and for the same reason: the default
 * language is what everything is translated from, 014 refuses a translation row
 * for it, and a helper in English would hold a role over nothing. Unlike the
 * audit this one has an "any language" option, because the list is of people,
 * not of work, and "who helps us at all" is a question somebody asks.
 */
function drawHelperFilters() {
  const select = document.querySelector('#helperLocale');
  if (!select) return;

  const list = [
    { value: '', label: t('admin.anyLanguage') },
    ...grantableLocales().map((locale) => ({ value: locale.code, label: locale.native_name })),
  ];

  select.innerHTML = list
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.value)}"${
          entry.value === helperState.locale ? ' selected' : ''
        }>${escapeHtml(entry.label)}</option>`
    )
    .join('');
}

/** Every language somebody can be granted: active, and not the default one. */
function grantableLocales() {
  return adminLocales().filter((locale) => !locale.is_default);
}

async function loadHelpers() {
  const search = new URLSearchParams({ view: 'helpers' });
  if (helperState.locale) search.set('locale', helperState.locale);
  search.set('page', String(helperState.page));

  const result = await api(`/api/admin/translations?${search.toString()}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  helperPayload = result.data;
  drawHelpers();
  drawTabs();
}

function drawHelpers() {
  const list = document.querySelector('#helperList');
  if (!list || !helperPayload) return;

  // No second language configured, which is the same real state the audit
  // handles: there is nobody to grant anything to yet, and the grant button
  // would open a picker with an empty language select.
  if (grantableLocales().length === 0) {
    list.innerHTML = emptyRow(t('admin.auditNeedsSecondLanguage'));
    document.querySelector('#grantHelper')?.setAttribute('hidden', '');
    return;
  }

  const rows = helperPayload.helpers ?? [];

  if (rows.length === 0) {
    list.innerHTML = emptyRow(
      helperState.locale
        ? t('admin.noHelpersInLanguage', { language: localeName(helperState.locale) })
        : t('admin.noHelpers')
    );
    drawHelperPager();
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colHelper'))}</th>
          <th scope="col">${escapeHtml(t('admin.colLanguage'))}</th>
          <th scope="col">${escapeHtml(t('admin.colDrafted'))}</th>
          <th scope="col">${escapeHtml(t('admin.colReported'))}</th>
          <th scope="col">${escapeHtml(t('admin.colGranted'))}</th>
          <th scope="col"><span class="visually-hidden">${escapeHtml(
            t('admin.colActions')
          )}</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(helperRowMarkup).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('[data-helper]').forEach((row) => {
    const key = row.getAttribute('data-helper');
    const helper = rows.find((entry) => `${entry.user_id}|${entry.locale}` === key);
    if (!helper) return;

    row.querySelector('[data-revoke]')?.addEventListener('click', () => {
      runAction(() => revoke(helper), 'revoke helper');
    });
  });

  drawHelperPager();
}

function helperRowMarkup(helper) {
  const name = helper.applicant?.display_name ?? t('admin.deletedAccount');
  const username = helper.applicant?.username ?? '';

  return `
    <tr data-helper="${escapeHtml(`${helper.user_id}|${helper.locale}`)}">
      <td>
        <span class="admin-row-title">${escapeHtml(name)}</span>
        <span class="admin-sub muted">${
          username ? escapeHtml(`@${username}`) : ''
        }${
          helper.applicant && !helper.applicant.is_active
            ? ` &middot; ${escapeHtml(t('admin.helperDeactivated'))}`
            : ''
        }</span>
      </td>
      <td>${escapeHtml(localeName(helper.locale))}</td>
      <td class="tabular">${escapeHtml(countLabel(helper.drafted))}</td>
      <td class="tabular">${escapeHtml(countLabel(helper.raised))}${
        helper.raised_open
          ? ` <span class="admin-sub muted">${escapeHtml(
              t('admin.helperOpenReports', { count: helper.raised_open })
            )}</span>`
          : ''
      }</td>
      <td>
        <span class="tabular">${escapeHtml(formatDate(helper.granted_at))}</span>
        <span class="admin-sub muted">${escapeHtml(
          helper.granted_by
            ? t('admin.grantedBy', { who: helper.granted_by })
            : t('admin.grantedByGone')
        )}</span>
      </td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-quiet small" data-revoke>${escapeHtml(
          t('admin.revokeHelper')
        )}</button>
      </td>
    </tr>`;
}

/**
 * A count, or a dash when it could not be read.
 *
 * Never a zero for an unknown. Zero in the drafted column is a claim that
 * somebody has done nothing, which is the one thing on this page an admin might
 * act on, and a failed count is not entitled to make it.
 */
function countLabel(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function drawHelperPager() {
  drawPagerInto(
    '#helperPager',
    helperState,
    helperPayload?.pages ?? 1,
    loadHelpers,
    'translation helpers page'
  );
}

/* -------------------------------------------------------------------------
 * Granting and revoking
 * ---------------------------------------------------------------------- */

/**
 * Find somebody and grant them the role.
 *
 * The language is chosen in the same dialog as the person, and before them: the
 * role is granted per language, so "who" is not a complete answer and a picker
 * that asked for it alone would have to ask again afterwards.
 *
 * The search is the invite picker's, which shows a name, a username, and a
 * picture and nothing else. That is deliberate on both pages: enough to be sure
 * you have the right person, and no account detail, which is 8.9's and is admins
 * only for reasons of its own.
 */
function openHelperPicker() {
  const locales = grantableLocales();
  if (locales.length === 0) return;

  helperPicker = createDialog({
    id: 'helperPicker',
    titleKey: 'admin.grantHelper',
    className: 'admin-composer-dialog',
    bodyHtml: `
      <div class="modal-body">
        <p class="muted">${escapeHtml(t('admin.grantHelperBody'))}</p>

        <div class="field">
          <label for="grantLocale">${escapeHtml(t('admin.helperLanguage'))}</label>
          <select id="grantLocale">${locales
            .map(
              (locale) =>
                `<option value="${escapeHtml(locale.code)}"${
                  locale.code === helperState.locale ? ' selected' : ''
                }>${escapeHtml(locale.native_name)}</option>`
            )
            .join('')}</select>
        </div>

        <div class="field">
          <label for="helperSearch">${escapeHtml(t('admin.findPeople'))}</label>
          <input id="helperSearch" type="search" autocomplete="off" data-autofocus>
        </div>

        <div id="helperResults" class="admin-people" aria-live="polite"></div>

        <div class="modal-actions">
          <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
            t('danger.cancel')
          )}</button>
        </div>
      </div>`,
  });

  const search = helperPicker.element.querySelector('#helperSearch');

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      runAction(() => searchApplicants(search.value), 'helper search');
    }, SEARCH_DELAY);
  });

  // Changing the language redraws the results, because the "already a helper"
  // badge on each of them is about the language chosen. A badge left over from
  // the previous choice would say somebody holds a role they do not.
  helperPicker.element.querySelector('#grantLocale')?.addEventListener('change', () => {
    if (search?.value.trim()) runAction(() => searchApplicants(search.value), 'helper search');
  });

  helperPicker.open();
}

async function searchApplicants(term) {
  const holder = helperPicker?.element.querySelector('#helperResults');
  if (!holder) return;

  if (!term.trim()) {
    holder.innerHTML = '';
    return;
  }

  const result = await api(
    `/api/admin/translations?view=helpers&search=${encodeURIComponent(term)}`
  );

  if (!result.ok) {
    holder.innerHTML = emptyRow(result.error?.message ?? t('error.unexpected'));
    return;
  }

  const found = result.data.applicants ?? [];

  if (found.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noPeopleFound'));
    return;
  }

  const locale = helperPicker.element.querySelector('#grantLocale')?.value ?? '';

  holder.innerHTML = found
    .map((applicant) => {
      // Already a helper in the language currently chosen, as the route says
      // instead of as this page could guess: the list behind it is paged and
      // may be filtered to one language, so somebody granted on page two would
      // read as new. Granting again is allowed and rewrites the reason, so this
      // is a note, not a block: what it stops is an admin adding
      // somebody twice without noticing.
      const already = (applicant.helps_with ?? []).includes(locale);

      return `
        <div class="admin-person">
          <span class="admin-person-name">${escapeHtml(
            applicant.display_name ?? applicant.username
          )}</span>
          <span class="muted">${escapeHtml(`@${applicant.username}`)}</span>
          ${
            already
              ? `<span class="badge badge-open">${escapeHtml(t('admin.alreadyAHelper'))}</span>`
              : ''
          }
          <button type="button" class="btn btn-secondary small"
                  data-grant="${escapeHtml(applicant.id)}">${escapeHtml(
                    t('admin.grantTheRole')
                  )}</button>
        </div>`;
    })
    .join('');

  holder.querySelectorAll('[data-grant]').forEach((button) => {
    button.addEventListener('click', () => {
      const applicant = found.find((row) => row.id === button.getAttribute('data-grant'));
      if (!applicant) return;

      // The language is read at click time and not at draw time, so
      // changing the select after searching grants what is on screen now.
      const chosen = helperPicker.element.querySelector('#grantLocale')?.value ?? locale;
      helperPicker.close();
      runAction(() => grant(applicant, chosen), 'grant helper');
    });
  });
}

/**
 * Grant the role, after asking why.
 *
 * The reason is checked here as well as at the route. The route is the one that
 * decides, but a request that comes back refused after the dialog has closed
 * costs somebody the sentence they typed, and confirmAction has no required
 * field of its own to lean on.
 */
async function grant(applicant, locale) {
  const language = localeName(locale);
  const name = applicant.display_name ?? applicant.username;

  const answer = await confirmAction({
    title: t('admin.confirmGrantHelper', { name, language }),
    body: t('admin.confirmGrantHelperBody', { language }),
    consequences: [t('admin.helperCannotPublish'), t('admin.helperEditsEverything', { language })],
    confirmLabel: t('admin.grantTheRole'),
    field: {
      label: t('admin.reasonRequired'),
      hint: t('admin.helperReasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  if (!answer.value) {
    adminMessage('error', t('admin.helperReasonNeeded'));
    return;
  }

  const result = await api('/api/admin/translations', {
    method: 'POST',
    body: {
      action: 'grant_helper',
      user_id: applicant.id,
      locale,
      reason: answer.value,
    },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.helperGranted', { name, language }));
  await loadHelpers();
}

/**
 * Take the role away.
 *
 * Not a three step confirmation. 7g fixes those for what cannot be undone, and
 * this can: the row is deleted, and granting it again is one dialog. What is
 * genuinely lost is why they were on the list, which is exactly what the
 * required reason and the audit row preserve.
 */
async function revoke(helper) {
  const language = localeName(helper.locale);
  const name = helper.applicant?.display_name ?? t('admin.deletedAccount');

  const answer = await confirmAction({
    title: t('admin.confirmRevokeHelper', { name, language }),
    body: t('admin.confirmRevokeHelperBody', { language }),
    consequences: [t('admin.revokeKeepsTranslations'), t('admin.revokeIsLoggedOnly')],
    confirmLabel: t('admin.revokeHelper'),
    danger: true,
    field: {
      label: t('admin.reasonRequired'),
      hint: t('admin.revokeReasonHint'),
      multiline: true,
      maxLength: 300,
    },
  });

  if (answer === null) return;

  if (!answer.value) {
    adminMessage('error', t('admin.helperReasonNeeded'));
    return;
  }

  const result = await api('/api/admin/translations', {
    method: 'POST',
    body: {
      action: 'revoke_helper',
      user_id: helper.user_id,
      locale: helper.locale,
      reason: answer.value,
    },
  });

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.helperRevoked', { name, language }));
  await loadHelpers();
}

/* -------------------------------------------------------------------------
 * One report
 * ---------------------------------------------------------------------- */

async function openReport(id) {
  const result = await api(`/api/admin/translations?id=${encodeURIComponent(id)}`);

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  showReport(result.data.report);
}

function showReport(report) {
  detailDialog = createDialog({
    id: 'reportDetail',
    titleKey: 'admin.reportTitle',
    className: 'admin-composer-dialog',
    bodyHtml: `<div class="modal-body">${panelMarkup(report)}</div>`,
  });

  wireReport(report);
  detailDialog.open();
}

function panelMarkup(report) {
  return `
    <p class="admin-row-title">${escapeHtml(targetLabel(report))}</p>
    <p class="muted">${escapeHtml(fieldLabel(report))} &middot; ${escapeHtml(
      localeName(report.locale)
    )} &middot; ${escapeHtml(t(`admin.origin_${report.origin}`))}</p>

    <div class="callout">
      <p>${escapeHtml(report.note)}</p>
      <p class="muted">${escapeHtml(
        t('admin.reportedByOn', {
          who: reporterName(report),
          date: formatDate(report.created_at),
        })
      )}</p>
    </div>

    ${quoteMarkup(report)}
    ${suggestionMarkup(report)}
    ${wordingMarkup(report)}
    ${editorMarkup(report)}
    ${resolutionMarkup(report)}

    <div class="modal-actions">
      <button type="button" class="btn btn-quiet" data-close-dialog>${escapeHtml(
        t('common.close')
      )}</button>
    </div>`;
}

/**
 * The quoted span, for an annotation.
 *
 * 7i: "a suggestion whose anchor can no longer be found is shown as detached
 * rather than dropped". Detached does not mean wrong. The words were on the page
 * when somebody selected them, and the most likely reason they are not there now
 * is that the sentence around them has since been rewritten, which is worth
 * knowing and not hiding.
 */
function quoteMarkup(report) {
  if (report.origin !== 'annotation') return '';

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.selectedText'))}</h3>
    <blockquote class="admin-quote">
      ${
        report.quote_prefix
          ? `<span class="muted">${escapeHtml(report.quote_prefix)}</span>`
          : ''
      }<mark>${escapeHtml(report.quote ?? '')}</mark>${
        report.quote_suffix ? `<span class="muted">${escapeHtml(report.quote_suffix)}</span>` : ''
      }
    </blockquote>
    ${
      report.anchor === 'detached'
        ? `<p class="callout warn">${escapeHtml(t('admin.anchorDetached'))}</p>`
        : ''
    }`;
}

function suggestionMarkup(report) {
  if (!report.suggested_text) {
    return `<p class="field-hint">${escapeHtml(t('admin.noSuggestion'))}</p>`;
  }

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.theirSuggestion'))}</h3>
    <blockquote class="admin-quote">${escapeHtml(report.suggested_text)}</blockquote>
    <p class="field-hint">${escapeHtml(t('admin.suggestionNeverApplied'))}</p>`;
}

/**
 * The wording as it stands, in both languages.
 *
 * The source is always shown, because a correction is a comparison. The reported
 * language is shown as it is stored, and "nothing here yet" is a real answer:
 * the reader was looking at the source falling through, which is a different
 * problem from a bad translation and one this panel should not disguise.
 */
function wordingMarkup(report) {
  if (report.target_type === 'interface') {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.interfaceString'))}</h3>
      <p class="callout warn">${escapeHtml(t('admin.interfaceIsCode'))}</p>
      <p><code>${escapeHtml(report.target_key ?? '')}</code></p>`;
  }

  // No field named means "the whole posting", which 7h's form offers as the
  // default. There is no single wording to put beside the suggestion, and two
  // empty quotes would read as though the posting itself were empty.
  if (!report.field) {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.currentWording'))}</h3>
      <p class="field-hint">${escapeHtml(t('admin.noFieldNamed'))}</p>`;
  }

  const wording = report.wording ?? {};

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.currentWording'))}</h3>
    <div class="admin-wording">
      ${
        wording.is_source_locale
          ? ''
          : `<div>
              <p class="field-hint">${escapeHtml(t('admin.sourceWording'))}</p>
              <blockquote class="admin-quote">${escapeHtml(
                wording.source ?? t('admin.nothingHere')
              )}</blockquote>
            </div>`
      }
      <div>
        <p class="field-hint">${escapeHtml(
          t('admin.wordingIn', { language: localeName(report.locale) })
        )}</p>
        <blockquote class="admin-quote">${escapeHtml(
          wording.reported ?? t('admin.nothingHere')
        )}</blockquote>
      </div>
    </div>
    ${
      wording.has_translation_row === false
        ? `<p class="field-hint">${escapeHtml(t('admin.noTranslationRow'))}</p>`
        : ''
    }`;
}

/**
 * The editing box, when there is something this page can honestly rewrite.
 *
 * Absent for an interface string, per 7i, and absent for a report that names no
 * field or names the sections, which a single textarea cannot edit without
 * quietly throwing away everything except the first one. Both of those get a way
 * through to the editor instead, which is the tool that can do it.
 */
function editorMarkup(report) {
  if (report.target_type === 'interface') return '';

  if (!report.editable) {
    return `
      <h3 class="admin-chart-heading">${escapeHtml(t('admin.fixTheWording'))}</h3>
      <p class="field-hint">${escapeHtml(t('admin.notEditableHere'))}</p>
      ${
        editorHref(report)
          ? `<p><a class="btn btn-secondary small" href="${escapeHtml(
              editorHref(report)
            )}">${escapeHtml(t('admin.openInEditor'))}</a></p>`
          : ''
      }`;
  }

  const current = report.wording?.reported ?? '';

  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.fixTheWording'))}</h3>
    <div class="field">
      <label for="wordingBox">${escapeHtml(
        t('admin.wordingIn', { language: localeName(report.locale) })
      )}</label>
      <textarea id="wordingBox" rows="5">${escapeHtml(current)}</textarea>
      <p class="field-hint">${escapeHtml(t('admin.wordingHint'))}</p>
      <p class="field-error" data-error-for="text" hidden></p>
    </div>
    <div class="editor-actions">
      ${
        report.suggested_text
          ? `<button type="button" class="btn btn-quiet small" data-use-suggestion>${escapeHtml(
              t('admin.useSuggestion')
            )}</button>`
          : ''
      }
      <button type="button" class="btn btn-secondary" data-save-wording>${escapeHtml(
        t('admin.saveWording')
      )}</button>
    </div>`;
}

/**
 * Where to go to edit this properly.
 *
 * The posting editor takes the language as a parameter so it opens on the tab
 * the report is about. Teams and tags have no per-row editor: their pages edit
 * every language of one row in place, so the link is the list and the admin
 * finds the row on it.
 */
function editorHref(report) {
  if (report.target_type === 'job' && report.target_id) {
    return `/admin/jobs/edit?id=${encodeURIComponent(
      report.target_id
    )}&locale=${encodeURIComponent(report.locale)}`;
  }
  if (report.target_type === 'department') return '/admin/departments';
  if (report.target_type === 'tag') return '/admin/tags';
  return null;
}

function resolutionMarkup(report) {
  return `
    <h3 class="admin-chart-heading">${escapeHtml(t('admin.resolution'))}</h3>
    <div class="field">
      <label for="reportStatus">${escapeHtml(t('admin.colStatus'))}</label>
      <select id="reportStatus">
        ${STATUSES.map(
          (status) =>
            `<option value="${status}"${
              status === report.status ? ' selected' : ''
            }>${escapeHtml(t(`admin.reportStatus_${status}`))}</option>`
        ).join('')}
      </select>
      <p class="field-hint" data-status-hint></p>
    </div>
    <div class="field">
      <label for="resolutionNote">${escapeHtml(t('admin.resolutionNote'))}</label>
      <textarea id="resolutionNote" rows="3" maxlength="2000">${escapeHtml(
        report.resolution_note ?? ''
      )}</textarea>
      <p class="field-hint">${escapeHtml(t('admin.resolutionNoteHint'))}</p>
      <p class="field-error" data-error-for="note" hidden></p>
    </div>
    <div class="editor-actions">
      <button type="button" class="btn btn-primary" data-save-resolution>${escapeHtml(
        t('admin.saveResolution')
      )}</button>
    </div>`;
}

/* -------------------------------------------------------------------------
 * The panel's controls
 * ---------------------------------------------------------------------- */

function wireReport(report) {
  const root = detailDialog.element;

  const statusSelect = root.querySelector('#reportStatus');
  const hint = root.querySelector('[data-status-hint]');

  const updateHint = () => {
    if (!hint || !statusSelect) return;
    hint.textContent = t(`admin.statusHint_${statusSelect.value}`);
  };

  statusSelect?.addEventListener('change', updateHint);
  updateHint();

  root.querySelector('[data-use-suggestion]')?.addEventListener('click', () => {
    const box = root.querySelector('#wordingBox');
    if (box) {
      box.value = report.suggested_text ?? '';
      box.focus();
    }
  });

  root.querySelector('[data-save-wording]')?.addEventListener('click', () => {
    runAction(() => saveWording(report), 'save wording');
  });

  root.querySelector('[data-save-resolution]')?.addEventListener('click', () => {
    runAction(() => saveResolution(report), 'save resolution');
  });
}

function clearErrors(root) {
  root.querySelectorAll('[data-error-for]').forEach((node) => {
    node.hidden = true;
    node.textContent = '';
  });
}

function showErrors(root, details) {
  for (const [name, code] of Object.entries(details ?? {})) {
    if (typeof code !== 'string') continue;
    const node = root.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (node) {
      node.textContent = t(`field.${code}`);
      node.hidden = false;
    }
  }
}

/**
 * Save the corrected wording.
 *
 * **This does not close the report**, and the panel says so by moving the status
 * select to fixed and leaving the note box waiting. 8.11 makes the note the
 * thing that closes a report, because the reporter reads it; folding the two
 * into one button would make the note something an admin skips by finishing the
 * edit.
 */
async function saveWording(report) {
  const root = detailDialog.element;
  clearErrors(root);

  const box = root.querySelector('#wordingBox');
  if (!box) return;

  const result = await api('/api/admin/translations', {
    method: 'POST',
    // No field is sent. The route rewrites the part the report itself names,
    // deliberately, so this endpoint is not a general single field writer that
    // happens to need a report id.
    body: { action: 'edit', report_id: report.id, text: box.value },
  });

  if (!result.ok) {
    showErrors(root, result.error?.details);
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  adminMessage('ok', t('admin.wordingSaved'));

  const statusSelect = root.querySelector('#reportStatus');
  if (statusSelect && !RESOLVED.includes(statusSelect.value)) {
    statusSelect.value = 'fixed';
    statusSelect.dispatchEvent(new Event('change'));
  }

  root.querySelector('#resolutionNote')?.focus();

  await load();
}

async function saveResolution(report) {
  const root = detailDialog.element;
  clearErrors(root);

  const status = root.querySelector('#reportStatus')?.value ?? report.status;
  const note = root.querySelector('#resolutionNote')?.value.trim() ?? '';

  // Checked here as well as by the route and by migration 015's constraint. The
  // point is not a third guard, it is that somebody finds out before the request
  // and not after it.
  if (RESOLVED.includes(status) && !note) {
    showErrors(root, { note: 'required' });
    adminMessage('error', t('admin.resolutionNeedsNote'));
    return;
  }

  const result = await api('/api/admin/translations', {
    method: 'POST',
    body: { action: 'resolve', report_id: report.id, status, note: note || null },
  });

  if (!result.ok) {
    showErrors(root, result.error?.details);
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  detailDialog?.close();
  adminMessage('ok', t(`admin.reportMoved_${status}`));
  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
