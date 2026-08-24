// /account, the landing page for the account area.
//
// Not in 7g's list, which names four pages: applications, saved, tasks, and
// settings. This exists because /account has been a real address since phase 1,
// linked from /account/security as "the rest of your account settings", and
// because the account item in the site header has to point somewhere. Sending it
// to one of the four would be a guess about which one somebody wanted.
//
// So it is a hub and nothing more: three counts, each a link to the page behind
// it, and a way back to the board. Everything on it is read from the endpoints
// the other pages already use, and it owns no state of its own.
//
// The counts are drawn as they arrive instead of all at once. Three requests
// that each answer one tile is three tiles that fill in independently, which is
// better than a page that waits for the slowest of them.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { mountAccountPage } from './account-shell.js';
import { escapeHtml } from './account-row.js';

const PATH = '/account';

// One tile per page worth linking to, with where its number comes from.
const TILES = [
  {
    href: '/account/applications',
    icon: 'briefcase',
    titleKey: 'account.tileApplications',
    countKey: 'account.tileApplicationsCount',
    load: async () => {
      const result = await api('/api/applications/mine', { locale: false });
      return result.ok ? (result.data.applications?.length ?? 0) : null;
    },
  },
  {
    href: '/account/saved',
    icon: 'bookmark',
    titleKey: 'account.tileSaved',
    countKey: 'account.tileSavedCount',
    load: async () => {
      const result = await api('/api/saved/mine', { locale: false });
      return result.ok ? (result.data.job_ids?.length ?? 0) : null;
    },
  },
  {
    href: '/account/tasks',
    icon: 'bell',
    titleKey: 'account.tileTasks',
    countKey: 'account.tileTasksCount',
    load: async () => {
      const result = await api('/api/tasks/count', { locale: false });
      return result.ok ? (result.data.total ?? 0) : null;
    },
  },
];

async function boot() {
  const session = await mountAccountPage({ current: PATH });
  if (!session) return;

  draw();

  // Every string on these tiles is written by JavaScript, because each carries a
  // number. A language change is a redraw, and the counts already in hand are
  // reused and not fetched again.
  document.addEventListener('gftv:localechange', () => draw());
}

// Tile index to its last known count, so a redraw does not blank them.
const counts = new Map();

function draw() {
  const holder = document.querySelector('#accountSummary');
  if (!holder) return;

  holder.innerHTML = TILES.map((tile, index) => tileMarkup(tile, index)).join('');
  hydrateIcons(holder);
  holder.removeAttribute('aria-busy');

  TILES.forEach((tile, index) => {
    if (counts.has(index)) return;

    tile.load().then((count) => {
      counts.set(index, count);
      const target = holder.querySelector(`[data-tile="${index}"] .account-tile-count`);
      if (target) target.textContent = countText(tile, count);
    });
  });
}

function tileMarkup(tile, index) {
  return `
    <a class="glass-card account-tile" href="${tile.href}" data-tile="${index}">
      <span class="account-tile-icon">${iconMarkup(tile.icon, { size: 22 })}</span>
      <span class="account-tile-title">${escapeHtml(t(tile.titleKey))}</span>
      <span class="account-tile-count">${escapeHtml(
        countText(tile, counts.get(index))
      )}</span>
    </a>`;
}

/**
 * The line under a tile's title.
 *
 * Three states, and the third is the reason this is a function. Undefined means
 * the request has not landed; null means it failed, and the tile says nothing
 * instead of claiming zero, because "0 saved roles" is a statement about
 * somebody's account that a failed request does not entitle us to make.
 */
function countText(tile, count) {
  if (count === undefined) return t('common.loading');
  if (count === null) return '';
  return t(tile.countKey, { count });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
