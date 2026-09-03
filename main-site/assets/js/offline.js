// The client half of the service worker, per specification section 14.
//
// **Two of its three jobs moved out in phase 14 part 4.** Registering the
// worker and the bar above the header are now connection-bar.js, because the
// docs site ships a worker too and update-bar-spec.md is portable by its own
// first lines. What is left here is what is about the portal rather than about
// a worker:
//
//   1. The controls that cannot work without a connection.
//   2. The postings held for offline reading, and when one was stored.
//
// `initOffline` still exists and still does what it did. It hands
// connection-bar.js the three things the two sites differ on: where the bar
// goes in the portal's stack of three, that "cannot reach us" links to /status,
// and that the network gating below is re-run on every state change.
//
// `workerVersion` moved with the registration and is re-exported here, so a
// console that has been asking offline.js for it since phase 1 keeps working.

import { t } from './i18n.js';
import { insertTopBar } from './top-bars.js';
import { initConnectionBar, workerVersion } from './connection-bar.js';

export { workerVersion };

/* -------------------------------------------------------------------------
 * Listening
 * ---------------------------------------------------------------------- */

export function initOffline() {
  initConnectionBar({
    // Above the phase notice and the header, below the skip link. The ordering
    // lives in top-bars.js and not in a comment here about a file this one does
    // not import, which is what it was until phase 12 part 2.
    insert: (bar) => insertTopBar(bar, 'connection-notice'),
    // This site's own status page, which is the right place to send somebody
    // who cannot reach this site.
    statusHref: '/status',
    // Every reason sitting on a disabled control is written by JavaScript too,
    // so it moves with the bar: on both connection events and on a language
    // change.
    onChange: () => applyNetworkGating(),
  });
}

/* -------------------------------------------------------------------------
 * Controls that cannot work without a connection
 *
 * Section 14: "controls that cannot work offline are disabled with a reason on
 * the control itself, never a dead button that fails on click."
 *
 * **This is a third reason a control can be disabled, and the three are never
 * conflated.** build-status.js says in as many words that there are two — a
 * feature that has not shipped yet, and one an admin has switched off — and it
 * is right to keep them apart, because they are different claims about the
 * site. Offline is a different claim again, and it is about the reader rather
 * than about us: nothing is broken, nothing is unbuilt, and it will work in a
 * moment. Sharing the machinery would have meant sharing the wording.
 *
 * Markup:
 *
 *   <button data-needs-network>Apply</button>
 *   <button data-needs-network="apply" data-needs-network-hint>Apply</button>
 *
 * The value picks a more specific sentence where there is one. It is not a
 * dictionary key: the keys are written out as literals in reasonFor so that
 * check-i18n can see all four of them.
 *
 * `data-needs-network-hint` adds the reason beside the control as text, which
 * matters because a disabled control is dropped from the accessibility tree in
 * some browsers and the `title` with it. **It is opt in rather than automatic**
 * so that two marked controls sitting side by side — the avatar's Choose and
 * Remove — do not put the same sentence on screen twice.
 *
 * The three reasons resolve in this order, and the order is the point:
 *
 *   1. not built yet   build-status.js. The most fundamental: there is nothing
 *                      to reach even on a perfect connection.
 *   2. switched off    build-status.js. It exists and we have taken it down.
 *   3. no connection   here. It exists, it is on, and you cannot reach it.
 * ---------------------------------------------------------------------- */

// Only controls this disabled are re-enabled when the connection returns.
// Without this, coming back online would quietly enable a control that
// build-status.js had disabled because its feature has not shipped or has been
// switched off — turning an outage into a button that 503s.
//
// A WeakSet rather than a list: pages redraw, and a strong reference to a
// detached button is a leak with no upside.
const disabledByUs = new WeakSet();

/** Already disabled for one of the two older reasons, which both outrank this. */
function gatedElsewhere(el) {
  return el.getAttribute('data-shipped') === 'false' || el.hasAttribute('data-maintenance');
}

// One counter for the whole page. A hint is identified by its own id rather
// than by the control's, because not every control that carries one has an id
// of its own and inventing one for it would change something the rest of the
// build may be selecting on.
let hintCount = 0;

/**
 * Add or remove one id in an element's aria-describedby, leaving anything else
 * in there alone. A control may be described by more than one thing, and
 * writing the attribute whole is how the other description gets lost.
 */
function describedBy(el, id, present) {
  if (!id) return;
  const tokens = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  const without = tokens.filter((token) => token !== id);
  const next = present ? [...without, id] : without;
  if (next.length > 0) el.setAttribute('aria-describedby', next.join(' '));
  else el.removeAttribute('aria-describedby');
}

function reasonFor(token) {
  if (token === 'apply') return t('offline.needsApply');
  if (token === 'signin') return t('offline.needsSignIn');
  if (token === 'upload') return t('offline.needsUpload');
  return t('offline.needsNetwork');
}

/**
 * Disable, or re-enable, every control in `root` that needs the network.
 *
 * Safe to call as often as a page redraws. It is called from here on both
 * connection events and on a language change, and pages that draw a control
 * after that call it themselves for the subtree they just built.
 *
 * @param {ParentNode} [root]
 */
export function applyNetworkGating(root = document) {
  const offline = !navigator.onLine;

  root.querySelectorAll('[data-needs-network]').forEach((el) => {
    if (offline) {
      // Left alone when the feature is unbuilt or switched off. That sentence is
      // the more fundamental of the two and overwriting it would tell somebody
      // to check their connection about a feature that does not exist.
      if (gatedElsewhere(el)) return;

      const reason = reasonFor(el.getAttribute('data-needs-network') ?? '');

      // `'disabled' in el` because not everything marked is a button. Setting
      // the property on an anchor does nothing at all, which would leave a live
      // link claiming to be disabled.
      if ('disabled' in el) el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', reason);
      el.setAttribute('data-offline-disabled', 'true');
      disabledByUs.add(el);

      if (el.hasAttribute('data-needs-network-hint')) {
        const existing = el.nextElementSibling;
        let hint;
        if (existing?.classList.contains('offline-hint')) {
          // Replaced, not appended, so a language change rewrites the sentence
          // rather than stacking a second one under it.
          hint = existing;
          hint.textContent = reason;
        } else {
          hint = document.createElement('p');
          hint.className = 'offline-hint';
          hint.textContent = reason;
          el.after(hint);
        }

        // **Beside is not attached.** Phase 10 put the sentence next to the
        // control because a disabled control loses its title in some browsers,
        // and then left it as a loose paragraph with nothing pointing at it: a
        // reader who moved to the control heard a greyed out button and no
        // reason, and a reader who moved through the text heard a reason with
        // nothing to attach it to. Phase 12 part 2 gives it an id and points
        // the control at it.
        if (!hint.id) {
          hintCount += 1;
          hint.id = `offlineHint${hintCount}`;
        }
        describedBy(el, hint.id, true);
      }
      return;
    }

    if (!disabledByUs.has(el)) return;

    // The connection is back, but that is not enough on its own. A control can
    // be disabled for more than one reason at a time, and build-status.js may
    // have gated this one *after* we did — its pass runs when a fetch lands, so
    // the order is not fixed. Re-enabling on our reason alone would put a live
    // Apply button on a page whose feature has not shipped, or has been switched
    // off during an outage, which is the worst of the three states: a control
    // that works right up until the endpoint refuses it.
    const stillHeld = gatedElsewhere(el);

    // Ours to give up either way: the offline reason is gone, whoever else is
    // still holding the control down.
    disabledByUs.delete(el);
    el.removeAttribute('data-offline-disabled');
    const hint = el.nextElementSibling;
    if (hint?.classList.contains('offline-hint')) {
      // The reference goes before the paragraph does, or the control is left
      // pointing at an id that is no longer in the document.
      describedBy(el, hint.id, false);
      hint.remove();
    }

    if (stillHeld) return;

    if ('disabled' in el) el.disabled = false;
    el.removeAttribute('aria-disabled');
    el.removeAttribute('title');
  });
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
