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

import { t } from './i18n.js';

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
  document.addEventListener('gftv:localechange', draw);

  draw();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
