// The offline fallback page, per specification section 14: "an offline
// fallback page for an uncached route".
//
// The service worker answers a navigation it has no cached copy of with this
// page's markup, and the address bar keeps the route that was asked for. Two
// things follow from that, and they are the whole design of this file:
//
//   - **Retry is a reload, not a link.** location still holds the route the
//     reader wanted, so reloading retries exactly that. Sending them to the
//     home page instead would lose the thing they were trying to reach.
//   - **This page is read with no connection.** Everything it needs — the two
//     stylesheets, the font, the icons, the dictionary — comes from the cache
//     or does not come at all. Nothing here fetches.
//
// The connection state is live rather than read once. `navigator.onLine` plus
// the `online` and `offline` events is what section 14 asks for, and it is
// worth knowing what those actually mean: `onLine` false is a reliable "there
// is definitely no network", while true means only that the machine has an
// interface up, not that anything is reachable. So a true reading enables the
// retry control and never claims more than that.

import { t, getLocale, DEFAULT_LOCALE } from './i18n.js';
import { formatDateTime } from './format.js';
import { cachedPostings } from './offline.js';
import { storedUserId, readMine } from './idb.js';

const el = {};

/**
 * Draw the connection state and the retry control for it.
 *
 * Called on load, on both connection events, and on a language change. Every
 * string here is written by JavaScript rather than carried on a data-i18n
 * attribute, so it has to be redrawn when the language changes or it would be
 * left in the language the page opened in.
 */
function draw() {
  const online = navigator.onLine;

  if (el.state) {
    el.state.textContent = online ? t('offline.stateOnline') : t('offline.stateOffline');
  }

  if (!el.retry) return;

  el.retry.textContent = t('offline.retry');
  el.retry.disabled = !online;

  if (online) {
    el.retry.removeAttribute('aria-disabled');
    el.retry.removeAttribute('title');
    return;
  }

  // Section 14: a control that cannot work offline is disabled with the reason
  // on the control, never a dead button that fails on click. The visible half
  // of the reason is the state line directly above, which is a live region, so
  // a reader who cannot see the button is told why as it changes.
  el.retry.setAttribute('aria-disabled', 'true');
  el.retry.setAttribute('title', t('offline.retryOffline'));
}

/* -------------------------------------------------------------------------
 * The postings still readable
 * ---------------------------------------------------------------------- */

// Held rather than re-asked on every redraw. The worker's answer does not
// change while this page is open — nothing is being cached, because nothing is
// loading — and a language change must not cost another round trip to it.
let held = [];

/**
 * Section 14: the fallback page offers the cached postings as somewhere to go.
 *
 * Each posting carries its titles in every language it is ready in, so this
 * follows a language change by redrawing rather than by asking again. A posting
 * with no title in the active language falls back to the default, which is the
 * same rule the posting page itself uses.
 */
function drawHeld() {
  const section = document.querySelector('#offlineHeld');
  const list = document.querySelector('#offlineHeldList');
  if (!section || !list) return;

  if (held.length === 0) {
    // Hidden rather than empty. A heading over nothing tells somebody there is
    // somewhere to go when there is not.
    section.hidden = true;
    return;
  }

  const locale = getLocale();
  section.hidden = false;
  section.querySelector('h2').textContent = t('offline.heldHeading');

  list.replaceChildren(
    ...held.map((posting) => {
      const item = document.createElement('li');

      const link = document.createElement('a');
      link.href = posting.path;
      // A title is data, not a dictionary string, so it is set as text and
      // never passed through innerHTML.
      link.textContent =
        posting.titles?.[locale] ?? posting.titles?.[DEFAULT_LOCALE] ?? posting.path;
      item.append(link);

      if (posting.cachedAt) {
        const when = document.createElement('span');
        when.className = 'offline-held-when';
        when.textContent = t('offline.heldSaved', { when: formatDateTime(posting.cachedAt) });
        item.append(when);
      }

      return item;
    })
  );
}

// The applicant's own saved roles, from the copy on this device. Empty for
// anybody who has never signed in here, which is most readers.
let saved = [];

/**
 * Section 14's other half of "somewhere to go": saved jobs.
 *
 * Read straight from IndexedDB rather than through the account shell, because
 * this page is not in the account area and must not redirect anybody anywhere.
 * Nothing here is a claim about being signed in: it is the copy this device
 * already holds, and every endpoint still checks the real cookie.
 */
function drawSaved() {
  const section = document.querySelector('#offlineSaved');
  const list = document.querySelector('#offlineSavedList');
  if (!section || !list) return;

  if (saved.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  section.querySelector('h2').textContent = t('offline.savedHeading');

  list.replaceChildren(
    ...saved.map((row) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/jobs/${row.job.id}`;
      link.textContent = row.job.title ?? row.job.id;
      item.append(link);
      return item;
    })
  );
}

function init() {
  el.state = document.querySelector('#offlineState');
  el.retry = document.querySelector('#offlineRetry');

  if (el.retry) {
    el.retry.addEventListener('click', () => {
      // Reload rather than assigning to location.href. A reload re-requests the
      // same address and lets the worker answer it properly this time; setting
      // href to the same value is a no-op in some browsers.
      window.location.reload();
    });
  }

  window.addEventListener('online', draw);
  window.addEventListener('offline', draw);

  // The shell applies the stored language after this module has already run,
  // and the language can change again at any time, so draw on both. The icon in
  // the markup is hydrated by the shell, not here.
  document.addEventListener('gftv:localechange', () => {
    draw();
    drawHeld();
    drawSaved();
  });

  draw();

  // Not awaited, and the section stays hidden until it answers. The rest of the
  // page is useful without it, and the worker may not be in control at all —
  // on a first visit, or after a hard reload — in which case there is nothing
  // held and nothing to say.
  cachedPostings().then((postings) => {
    held = postings;
    drawHeld();
  });

  savedRoles().then((rows) => {
    saved = rows;
    drawSaved();
  });
}

/** The saved roles this device holds, or an empty list. */
async function savedRoles() {
  const userId = await storedUserId();
  if (!userId) return [];

  const copy = await readMine(userId, 'saved');
  // Only rows that carry the posting itself. /account/saved asks for
  // with_jobs=true, so they do; a row without one could not be linked to
  // anywhere useful and is dropped rather than listed as a dead entry.
  return (copy?.data?.saved ?? []).filter((row) => row?.job?.id);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
