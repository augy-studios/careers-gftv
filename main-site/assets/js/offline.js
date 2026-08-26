// The client half of the service worker, per specification section 14.
//
// Three jobs, and they are here together because they are the same subject:
//
//   1. Register the worker. Once, from one file.
//   2. The update prompt. A new worker waits until somebody accepts it.
//   3. The connection banner, in both of its wordings.
//
// ---------------------------------------------------------------------------
// One registration
// ---------------------------------------------------------------------------
//
// Until phase 10 every page carried its own inline
// `navigator.serviceWorker.register('/sw.js')`, in thirty three HTML files and
// in the server rendered posting page. That was correct while registering was
// the whole of it and stopped being correct the moment there was an update to
// prompt about: the prompt needs the ServiceWorkerRegistration object, and an
// inline script in the markup has nowhere to hand it to.
//
// Registration happens on `load` rather than immediately. The install fetches
// ninety nine files, and starting that while the page is still fetching its own
// is how a service worker makes a first visit slower for no gain.
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
// failures to reach the API while `onLine` is true get "we cannot reach
// Careers@GFTV", which is a different problem and only one of them is ours.
// api.js announces both outcomes as events rather than calling in here, which
// keeps the dependency one way: this file imports nothing api.js needs.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

const SW_URL = '/sw.js';

/**
 * How many API calls have to fail in a row before the second wording appears.
 *
 * One failure is a blip and saying so would be noise. Two in a row, with the
 * machine claiming to be online, is worth telling somebody about.
 */
const UNREACHABLE_AFTER = 2;

let registration = null;
let waitingWorker = null;
let reloading = false;
let consecutiveFailures = 0;
let updateDismissed = false;

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
      // before phase 10.
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

// At module load, so registration is not waiting on the whole boot sequence,
// but on `load`, so it is not competing with the page's own requests.
if (document.readyState === 'complete') registerWorker();
else window.addEventListener('load', registerWorker, { once: true });

/* -------------------------------------------------------------------------
 * The banner
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

function render() {
  const current = state();
  const existing = document.querySelector('.connection-notice');

  if (current === null) {
    existing?.remove();
    return;
  }

  const bar = existing ?? document.createElement('div');
  bar.className = 'connection-notice';
  bar.dataset.state = current;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-label', t('offline.bannerLabel'));

  bar.innerHTML = `
    <div class="connection-notice-inner">
      <span data-icon="${current === 'update' ? 'download' : 'offline'}" data-icon-size="16"></span>
      <p>${bodyFor(current)}</p>
      ${actionFor(current)}
    </div>
  `;

  if (current === 'update') {
    bar.querySelector('[data-sw-update]')?.addEventListener('click', acceptUpdate);
    bar.querySelector('[data-sw-later]')?.addEventListener('click', () => {
      updateDismissed = true;
      render();
    });
  }

  if (!existing) {
    // Above the phase notice, which renderPhaseNotice knows to insert after
    // this one when both are present. The connection state is the more urgent
    // of the two and neither should be able to reorder the other.
    document.body.prepend(bar);
  }

  hydrateIcons(bar);
}

function bodyFor(current) {
  if (current === 'offline') return escapeHtml(t('offline.bannerOffline'));
  if (current === 'unreachable') {
    return (
      `${escapeHtml(t('offline.bannerUnreachable'))} ` +
      `<a href="/status">${escapeHtml(t('offline.bannerUnreachableLink'))}</a>`
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
 * **The only place in the build that asks for skipWaiting.** sw.js calls
 * neither skipWaiting nor clients.claim in install or activate, exactly as
 * section 14 requires, so this message is the whole of the update path. The
 * reload happens on controllerchange rather than here.
 */
function acceptUpdate() {
  if (!waitingWorker) return;
  waitingWorker.postMessage('skip-waiting');
}

/* -------------------------------------------------------------------------
 * Listening
 * ---------------------------------------------------------------------- */

export function initOffline() {
  window.addEventListener('online', () => {
    // Section 14: remove it the moment connectivity returns. The failure count
    // goes with it, or a reader who came back online would keep the second
    // wording until their next successful request.
    consecutiveFailures = 0;
    render();
  });

  window.addEventListener('offline', render);

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
  document.addEventListener('gftv:localechange', render);

  render();
}

/* -------------------------------------------------------------------------
 * Asking the worker what it is holding
 * ---------------------------------------------------------------------- */

/**
 * One question, one answer, over a private channel.
 *
 * A MessageChannel rather than a plain postMessage and a global listener: two
 * pages on this origin share one worker, and a broadcast reply would have every
 * open tab hearing an answer to a question another tab asked.
 *
 * Resolves to null when there is no worker in control, which is the ordinary
 * state on a first visit and after a hard reload, and is not a failure.
 */
function ask(message, timeout = 2000) {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return resolve(null);

    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeout);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data ?? null);
    };

    try {
      controller.postMessage(message, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * The postings held for offline reading, most recently viewed first.
 *
 * Each carries its titles in every language the posting is ready in, so a list
 * drawn from this follows a language change like everything else.
 *
 * @returns {Promise<Array<{ path: string, titles: Record<string,string>, isOpen: boolean, cachedAt: number }>>}
 */
export async function cachedPostings() {
  const reply = await ask({ type: 'cached-postings' });
  return Array.isArray(reply?.postings) ? reply.postings : [];
}

/**
 * When the copy of one address was stored, or null if it is not held.
 *
 * Null is the honest answer for "not cached" and is deliberately not the same
 * as "just now": a page that showed the current time for something it had never
 * stored would be the exact mistake section 14's last updated line exists to
 * prevent.
 *
 * @param {string} path
 * @returns {Promise<number|null>}
 */
export async function cachedAt(path) {
  const reply = await ask({ type: 'cached-at', path });
  return typeof reply?.at === 'number' ? reply.at : null;
}

/**
 * The running worker's VERSION, or null.
 *
 * Nothing on screen uses this. It is the one question worth being able to ask
 * from a console when a returning visitor reports seeing an old build, and the
 * worker has answered it since phase 1.
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}
