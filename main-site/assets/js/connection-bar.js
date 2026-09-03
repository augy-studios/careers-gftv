// The bar above the header: registering the worker, and the three things that
// bar can say. Phase 14 part 4.
//
// **This was the top half of offline.js and it moved because a second site
// needed it.** `update-bar-spec.md` is portable by its own first lines — "drop
// it into any site that ships a service worker" — and the docs site now ships
// one, so the choice was one implementation or two. This is the one. It is
// generated into docs-site by gen-docs-lib.js, which is the same answer
// theme.css, icons.js and the two account suites already have.
//
// What stayed in offline.js is what is about the portal rather than about a
// worker: the controls that cannot work without a connection, the postings
// cache, and the two questions a console can ask the worker. Nothing here knows
// what a posting is.
//
// ---------------------------------------------------------------------------
// One registration
// ---------------------------------------------------------------------------
//
// Registration happens on `load` rather than immediately. The install fetches
// the whole precache list, and starting that while the page is still fetching
// its own is how a service worker makes a first visit slower for no gain.
//
// ---------------------------------------------------------------------------
// The two connection wordings, and why there are two
// ---------------------------------------------------------------------------
//
// `navigator.onLine` false is a reliable "there is definitely no network".
// `onLine` true means only that an interface is up — not that anything is
// reachable. So a Vercel outage on perfect wifi reads as online, and a banner
// saying "you are offline" would send that reader to reset their router.
//
// So there are two sentences. `onLine` false gets "you are offline". Repeated
// failures to reach the API while `onLine` is true get the second wording,
// which is a different problem and only one of them is ours. api.js announces
// both outcomes as events rather than calling in here, which keeps the
// dependency one way: this file imports nothing api.js needs.
//
// ---------------------------------------------------------------------------
// What the caller supplies
// ---------------------------------------------------------------------------
//
// Three things, and each of them is a place the two sites genuinely differ:
//
//   `insert`      where the bar goes. The portal has a stack of three bars in a
//                 fixed order and top-bars.js owns that ordering; the docs site
//                 has one bar and puts it after the skip link. Sharing
//                 top-bars.js would have meant generating a file whose entire
//                 subject is the portal's other two bars.
//   `statusHref`  where "cannot reach us" links to. The portal's own /status
//                 page, and on the docs site that is a different origin.
//   `onChange`    anything else the caller redraws when the state moves. The
//                 portal re-runs its network gating; the docs site has none.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

/**
 * How many API calls have to fail in a row before the second wording appears.
 *
 * One failure is a blip and saying so would be noise. Two in a row, with the
 * machine claiming to be online, is worth telling somebody about.
 */
const UNREACHABLE_AFTER = 2;

const SW_URL = '/sw.js';

let registration = null;
let waitingWorker = null;
let reloading = false;
let consecutiveFailures = 0;
let updateDismissed = false;

/** Set by initConnectionBar. Nothing in this file runs before that. */
let options = {
  insert: (bar) => document.body.prepend(bar),
  statusHref: null,
  onChange: () => {},
};

/* -------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------- */

function watchForUpdate() {
  if (!registration) return;

  // A worker already waiting when the page opened. This is the ordinary case
  // on the second page view after a deploy, and without it the prompt would
  // only ever appear to somebody who happened to have the page open at the
  // moment the new worker finished installing.
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting;
    render();
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      // `installed` with a controller present means an update. `installed` with
      // no controller is a first install, which has nothing to prompt about:
      // there is no previous version on screen to protect.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting ?? installing;
        render();
      }
    });
  });
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register(SW_URL)
    .then((reg) => {
      registration = reg;
      watchForUpdate();
    })
    .catch((cause) => {
      // A refused registration is not a reason to break the page. Private
      // browsing in some browsers, and any http origin that is not localhost,
      // land here, and the site works without a worker exactly as it did
      // before it had one.
      console.warn('[careers-gftv] service worker registration failed:', cause);
    });

  // The swap, once somebody has accepted it. Reloading here rather than in the
  // click handler is what makes the page come back on the new version: the
  // controller has changed by this point, so the reload is served by the new
  // worker and not the one being replaced.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/* -------------------------------------------------------------------------
 * The bar
 * ---------------------------------------------------------------------- */

/**
 * Which of the three things, if any, the bar is currently saying.
 *
 * One bar and one state, in this order. Being offline outranks being unable to
 * reach the site, which outranks an update: two bars stacked above the header
 * stops being unobtrusive, which is the word section 14 uses.
 *
 * @returns {'offline'|'unreachable'|'update'|null}
 */
function state() {
  if (!navigator.onLine) return 'offline';
  if (consecutiveFailures >= UNREACHABLE_AFTER) return 'unreachable';
  if (waitingWorker && !updateDismissed) return 'update';
  return null;
}

/**
 * Draw, move or remove the bar.
 *
 * **The live region is the paragraph, and it is put on the page before its
 * text is.** Phase 10 built the whole bar — role, label, icon, sentence and
 * buttons — and then prepended it, which is a live region arriving with its
 * content already inside it. A screen reader announces a live region when its
 * contents *change*; a node that was never on the page without its text has
 * nothing to compare against, so the bar that says the connection has gone was
 * announced by nothing at all. Phase 12 part 2 inserts the paragraph empty and
 * writes into it a frame later.
 *
 * **And the bar itself is a region rather than a live one.** In the update
 * state it holds two buttons, and controls inside a live region are read out
 * again every time the region is touched. The paragraph is the thing that
 * changes and the paragraph is the thing that is announced; the buttons sit
 * beside it, inside a landmark a reader can find on purpose.
 */
function render() {
  const current = state();
  let bar = document.querySelector('.connection-notice');
  const fresh = !bar;

  if (current === null) {
    bar?.remove();
    return;
  }

  if (fresh) {
    bar = document.createElement('div');
    bar.className = 'connection-notice';
    bar.setAttribute('role', 'region');
    bar.innerHTML = '<div class="connection-notice-inner"><p data-message role="status"></p></div>';
    options.insert(bar);
  }

  bar.dataset.state = current;
  bar.setAttribute('aria-label', t('offline.bannerLabel'));

  const inner = bar.querySelector('.connection-notice-inner');
  const message = inner.querySelector('[data-message]');

  // Everything but the message is rebuilt on every state change. The message
  // element is kept, because a live region replaced is a live region
  // registered again with its content already in it — the failure above, one
  // state change later.
  for (const node of [...inner.children]) if (node !== message) node.remove();

  const icon = document.createElement('span');
  icon.setAttribute('data-icon', current === 'update' ? 'download' : 'offline');
  icon.setAttribute('data-icon-size', '16');
  inner.prepend(icon);

  if (current === 'update') {
    inner.insertAdjacentHTML('beforeend', actionFor(current));
    inner.querySelector('[data-sw-update]')?.addEventListener('click', acceptUpdate);
    inner.querySelector('[data-sw-later]')?.addEventListener('click', () => {
      updateDismissed = true;
      render();
    });
  }

  const write = () => {
    message.innerHTML = bodyFor(current);
  };
  if (fresh) requestAnimationFrame(write);
  else write();

  hydrateIcons(bar);
}

function bodyFor(current) {
  if (current === 'offline') return escapeHtml(t('offline.bannerOffline'));
  if (current === 'unreachable') {
    const sentence = escapeHtml(t('offline.bannerUnreachable'));
    // **The link is omitted rather than pointed somewhere plausible when there
    // is nowhere to point.** A status page belongs to the site that is down,
    // and a bar on the docs site linking to the portal's would be telling a
    // reader to go and look at a second site to find out about this one.
    if (!options.statusHref) return sentence;
    return (
      `${sentence} <a href="${escapeHtml(options.statusHref)}">` +
      `${escapeHtml(t('offline.bannerUnreachableLink'))}</a>`
    );
  }
  return escapeHtml(t('offline.updateReady'));
}

function actionFor(current) {
  if (current !== 'update') return '';
  return (
    `<button type="button" class="btn btn-secondary small-btn" data-sw-update>` +
    `${escapeHtml(t('offline.updateReload'))}</button>` +
    `<button type="button" class="btn btn-quiet small-btn" data-sw-later>` +
    `${escapeHtml(t('offline.updateLater'))}</button>`
  );
}

/**
 * Accept the update.
 *
 * **The only place in the build that asks for skipWaiting.** Neither worker
 * calls skipWaiting or clients.claim in install or activate, exactly as section
 * 14 requires, so this message is the whole of the update path on both sites.
 * The reload happens on controllerchange rather than here.
 */
function acceptUpdate() {
  if (!waitingWorker) return;
  waitingWorker.postMessage('skip-waiting');
}

/* -------------------------------------------------------------------------
 * Starting
 * ---------------------------------------------------------------------- */

/**
 * Register the worker and wire the bar.
 *
 * @param {object} [config]
 * @param {(bar: HTMLElement) => void} [config.insert] where the bar belongs.
 * @param {string|null} [config.statusHref] where "cannot reach us" links, if
 *        anywhere.
 * @param {() => void} [config.onChange] run after every state change.
 */
export function initConnectionBar(config = {}) {
  options = { ...options, ...config };

  // On `load`, so registration is not competing with the page's own requests.
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });

  window.addEventListener('online', () => {
    // Section 14: remove it the moment connectivity returns. The failure count
    // goes with it, or a reader who came back online would keep the second
    // wording until their next successful request.
    consecutiveFailures = 0;
    render();
    options.onChange();
  });

  window.addEventListener('offline', () => {
    render();
    options.onChange();
  });

  // Announced by api.js. `reached` means an HTTP response arrived, whatever its
  // status: a 503 from a maintenance switch is the site answering, and the
  // banner has no business saying otherwise.
  document.addEventListener('gftv:apireached', () => {
    if (consecutiveFailures === 0) return;
    consecutiveFailures = 0;
    render();
  });

  document.addEventListener('gftv:apifailed', () => {
    consecutiveFailures += 1;
    if (consecutiveFailures === UNREACHABLE_AFTER) render();
  });

  // Every string in the bar is written by JavaScript rather than carried on a
  // data-i18n attribute, so it has to be redrawn on a language change or it
  // stays in the language the page opened in.
  document.addEventListener('gftv:localechange', () => {
    render();
    options.onChange();
  });

  render();
  options.onChange();
}

/**
 * The running worker's VERSION, or null.
 *
 * Nothing on screen uses this. It is the one question worth being able to ask
 * from a console when a returning visitor reports seeing an old build, and the
 * portal's worker has answered it since phase 1.
 */
export function workerVersion() {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return resolve(null);

    const timer = setTimeout(() => resolve(null), 2000);
    navigator.serviceWorker.addEventListener(
      'message',
      (event) => {
        clearTimeout(timer);
        resolve(event.data?.version ?? null);
      },
      { once: true }
    );
    controller.postMessage('version');
  });
}

/**
 * Post a message to the controlling worker, with no answer expected.
 *
 * Used by the docs site to tell its worker which tier it is caching for and
 * when a reader has signed out. It is here rather than in that site's shell
 * because "talk to the worker" is this file's subject, and a second site
 * writing its own `navigator.serviceWorker.controller` dance is how the two
 * drift.
 *
 * @param {unknown} message
 */
export function tellWorker(message) {
  navigator.serviceWorker?.controller?.postMessage(message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}
