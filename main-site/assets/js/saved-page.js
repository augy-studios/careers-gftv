// /account/saved, from 7g.
//
// "Postings the applicant saved, including ones that have since closed or
// expired, which stay visible with a clear no longer accepting applications
// badge rather than vanishing from the list. Sort by recently saved, with a
// filter for still open versus closed."
//
// The unsave control is the same component the board and the posting page use,
// so a reader unsaving from here presses the bookmark they already know. What
// this page adds is the one thing a list needs and a card does not: the row
// leaves the list when it is unsaved, instead of sitting there filled out with
// an empty bookmark on it.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { formatDate } from './format.js';
import { mountAccountPage, pageData } from './account-shell.js';
import { jobRowHead, escapeHtml } from './account-row.js';
import { saveButtonMarkup, mountSaveButtons } from './save-button.js';

const PATH = '/account/saved';

const FILTERS = ['all', 'open', 'closed'];

let filter = 'all';
let payload = null;

// The session mountAccountPage handed back, kept so load() can reach the
// applicant id when it needs the copy on this device. Offline that session is
// the profile saved here rather than one the server confirmed, which is exactly
// what makes this page readable with no connection.
let mounted = null;

async function boot() {
  const session = await mountAccountPage({ current: PATH });
  if (!session) return;
  mounted = session;

  const requested = new URL(window.location.href).searchParams.get('filter');
  if (requested && FILTERS.includes(requested)) filter = requested;

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });

  // Unsaving from a row on this page has to take the row away, and the control
  // itself knows nothing about the list it is standing in. It says what
  // happened and this reloads, which also keeps the counts honest.
  document.addEventListener('gftv:savechange', () => load());
}

async function load() {
  const list = document.querySelector('#savedList');
  list?.setAttribute('aria-busy', 'true');

  const result = await api(`/api/saved/mine?with_jobs=true&filter=${encodeURIComponent(filter)}`);

  list?.removeAttribute('aria-busy');

  // Section 14: saved jobs come from a local copy of the applicant's own data
  // when there is no connection, marked with the time it was cached.
  const resolved = await pageData(mounted, 'saved', result);

  const error = document.querySelector('#savedError');
  if (!resolved) {
    if (error) {
      error.textContent = result.error?.message ?? t('error.unexpected');
      error.hidden = false;
    }
    return;
  }

  if (error) error.hidden = true;
  payload = resolved.data;
  draw();
}

function draw() {
  drawFilters();

  const list = document.querySelector('#savedList');
  const empty = document.querySelector('#savedEmpty');
  if (!list) return;

  const rows = payload.saved ?? [];
  const nothingAtAll = (payload.counts?.all ?? 0) === 0;

  if (empty) empty.hidden = !nothingAtAll;

  if (rows.length === 0) {
    list.innerHTML = nothingAtAll
      ? ''
      : `<p class="muted account-empty-bucket">${escapeHtml(t('saved.emptyFilter'))}</p>`;
    return;
  }

  list.innerHTML = rows.map(rowMarkup).join('');
  hydrateIcons(list);
  mountSaveButtons(list);
}

function drawFilters() {
  const holder = document.querySelector('#savedFilters');
  if (!holder) return;

  const counts = payload?.counts ?? {};

  holder.innerHTML = FILTERS.map((name) => {
    const current = name === filter;
    return (
      `<button type="button" class="bucket-tab" role="tab" data-filter="${name}"` +
      ` aria-selected="${current}"${current ? '' : ' tabindex="-1"'}>` +
      `<span>${escapeHtml(t(`saved.filter_${name}`))}</span>` +
      `<span class="bucket-count">${counts[name] ?? 0}</span>` +
      `</button>`
    );
  }).join('');

  holder.querySelectorAll('[data-filter]').forEach((tab) => {
    tab.addEventListener('click', () => {
      filter = tab.getAttribute('data-filter');
      writeFilterToUrl();
      load();
    });
  });
}

function writeFilterToUrl() {
  try {
    const url = new URL(window.location.href);
    if (filter === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', filter);

    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}`);
  } catch {
    // Untidy, not broken.
  }
}

function rowMarkup(row) {
  return `
    <article class="glass-card account-row" data-job-id="${escapeHtml(row.job.id)}">
      ${jobRowHead(row.job)}

      <div class="account-row-state">
        <span class="account-row-dates">${escapeHtml(
          t('saved.savedOn', { date: formatDate(row.saved_at) })
        )}</span>
      </div>

      <div class="account-row-actions">
        ${
          // A closed posting still links back and can still be unsaved. What it
          // does not get is an invitation to apply, because it would fail.
          row.job.is_open
            ? `<a class="btn btn-secondary" href="/jobs/${encodeURIComponent(
                row.job.id
              )}">${escapeHtml(t('saved.openRole'))}</a>`
            : ''
        }
        ${saveButtonMarkup(row.job.id, { withLabel: true })}
      </div>
    </article>`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
