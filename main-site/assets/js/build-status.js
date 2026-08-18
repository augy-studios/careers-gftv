// Build status: the phase notice, the disabled control pattern, and the
// placeholder page copy.
//
// Section 0c. One file, /assets/build-status.json, is the source of truth.
// Everything reads from it, flipping a phase to shipped is the only edit
// needed when it goes live, and no copy anywhere hardcodes a phase number.
// The Telegram bot and the docs site read the same file, so the three stay in
// step.
//
// The sentence below is fixed by the specification and must not be reworded.

import { iconMarkup, hydrateIcons } from './icons.js';

const SOURCE = '/assets/build-status.json';
const NOTICE_KEY = 'gftv-careers.phaseNoticeDismissed';

/** Exact wording from section 0c. The phase number is interpolated. */
export function unavailableSentence(phase) {
  return `Will be available in Phase ${phase}. Sorry for the inconvenience caused.`;
}

let cache = null;
let inFlight = null;

/**
 * Load the status file once per page. Falls back to a minimal shape rather
 * than throwing, so a network blip never takes the whole page down with it.
 * @returns {Promise<object>}
 */
export function loadBuildStatus() {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = fetch(SOURCE, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`build-status.json returned ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cache = data;
      return data;
    })
    .catch((cause) => {
      console.warn('[careers-gftv] could not load build status:', cause);
      cache = { phases: [], features: {} };
      return cache;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** The phase a feature belongs to, or null when the key is unknown. */
export function phaseForFeature(status, featureKey) {
  const phase = status?.features?.[featureKey];
  return typeof phase === 'number' ? phase : null;
}

/** One phase entry, or null. */
export function phaseInfo(status, number) {
  return status?.phases?.find((p) => p.number === number) ?? null;
}

/** Whether the phase behind a feature key has shipped. */
export function isFeatureShipped(status, featureKey) {
  const number = phaseForFeature(status, featureKey);
  if (number === null) return false;
  return phaseInfo(status, number)?.status === 'shipped';
}

/** The phase currently being built, or null once everything has shipped. */
export function currentPhase(status) {
  return status?.phases?.find((p) => p.status === 'building') ?? null;
}

/** True once every phase is shipped, which is when the notice bar retires. */
export function allShipped(status) {
  const phases = status?.phases ?? [];
  return phases.length > 0 && phases.every((p) => p.status === 'shipped');
}

/**
 * A signature of which phases have shipped. The notice dismissal is stored
 * against this, so dismissal is remembered locally and resets when a phase
 * ships, exactly as section 0c asks.
 */
function shippedSignature(status) {
  return (status?.phases ?? [])
    .filter((p) => p.status === 'shipped')
    .map((p) => p.number)
    .join(',');
}

/* -------------------------------------------------------------------------
 * The notice bar
 * ---------------------------------------------------------------------- */

/**
 * Insert the slim phase notice at the very top of the page. Quiet, one line,
 * no colour shouting. Removed entirely once every phase has shipped.
 * @param {object} status
 */
export function renderPhaseNotice(status) {
  if (allShipped(status)) return;

  const signature = shippedSignature(status);
  let dismissed = null;
  try {
    dismissed = localStorage.getItem(NOTICE_KEY);
  } catch {
    // Private browsing with storage blocked. Show the notice rather than fail.
  }
  if (dismissed === signature) return;

  const bar = document.createElement('div');
  bar.className = 'phase-notice';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Build progress');
  bar.innerHTML = `
    <div class="phase-notice-inner">
      <p>Careers@GFTV is being built and released in phases. <a href="/status">See what is live</a></p>
      <button type="button" class="icon-btn small" data-dismiss-notice aria-label="Dismiss this notice">
        <span data-icon="close" data-icon-size="16"></span>
      </button>
    </div>
  `;

  bar.querySelector('[data-dismiss-notice]').addEventListener('click', () => {
    try {
      localStorage.setItem(NOTICE_KEY, signature);
    } catch {
      // Nothing to do. It will simply show again next time.
    }
    bar.remove();
  });

  document.body.prepend(bar);
  hydrateIcons(bar);
}

/* -------------------------------------------------------------------------
 * The disabled control pattern
 * ---------------------------------------------------------------------- */

/**
 * Apply the disabled state to every control belonging to a feature that has
 * not shipped.
 *
 * Markup:
 *   <button data-feature="saved_jobs">Save this role</button>
 *
 * The control stays visible and becomes disabled, with the reason on it.
 * Hiding it would teach people the feature does not exist. Its click handler
 * does nothing but explain.
 *
 * @param {object} status
 * @param {ParentNode} [root]
 */
export function applyFeatureGating(status, root = document) {
  root.querySelectorAll('[data-feature]').forEach((el) => {
    const key = el.getAttribute('data-feature');
    const phase = phaseForFeature(status, key);

    if (phase === null) {
      console.warn(`[careers-gftv] unknown feature key: ${key}`);
      return;
    }

    if (isFeatureShipped(status, key)) {
      el.setAttribute('data-shipped', 'true');
      return;
    }

    const sentence = unavailableSentence(phase);
    el.setAttribute('data-shipped', 'false');
    el.setAttribute('title', sentence);

    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.disabled = true;
      // A disabled control is removed from the accessibility tree in some
      // browsers, so put the reason on a wrapper the reader can still reach.
      el.setAttribute('aria-disabled', 'true');
    } else {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('role', el.getAttribute('role') ?? 'button');
      el.removeAttribute('href');
    }

    if (el.hasAttribute('data-feature-hint')) {
      const hint = document.createElement('span');
      hint.className = 'feature-hint';
      hint.textContent = sentence;
      el.after(hint);
    }

    // A disabled button fires no click event, so listen on the way down from a
    // parent instead. This is what makes the explainer reachable at all.
    const holder = el.parentElement ?? document.body;
    holder.addEventListener(
      'pointerdown',
      (event) => {
        if (!el.contains(event.target) && event.target !== el) return;
        showFeatureExplainer(sentence, phase, status);
      },
      true
    );
  });
}

let explainer = null;
let explainerTimer = null;

/**
 * The small panel a disabled control opens. It explains and does nothing else.
 */
export function showFeatureExplainer(sentence, phase, status) {
  const info = phaseInfo(status, phase);

  if (!explainer) {
    explainer = document.createElement('div');
    explainer.className = 'feature-explainer glass-card';
    explainer.setAttribute('role', 'status');
    document.body.append(explainer);
  }

  explainer.innerHTML = `
    <p><strong>${escapeHtml(sentence)}</strong></p>
    ${info ? `<p>Phase ${info.number}, ${escapeHtml(info.name)}. ${escapeHtml(info.description)}</p>` : ''}
    <p><a href="/status">See the full build status</a></p>
  `;
  explainer.hidden = false;

  clearTimeout(explainerTimer);
  explainerTimer = setTimeout(() => {
    if (explainer) explainer.hidden = true;
  }, 8000);
}

/* -------------------------------------------------------------------------
 * The placeholder page
 * ---------------------------------------------------------------------- */

// Which feature key an unbuilt route belongs to. One static placeholder page
// serves every one of them, and works out where it is from the path, so
// vercel.json needs a single rewrite target rather than one page per route.
//
// Longest prefix wins, so /account/saved resolves before /account.
const ROUTE_FEATURES = [
  ['/search', 'job_search'],
  ['/jobs', 'job_detail'],
  ['/apply', 'apply'],
  ['/login', 'applicant_login'],
  ['/register', 'applicant_register'],
  ['/forgot-password', 'forgot_password'],
  ['/account/applications', 'my_applications'],
  ['/account/saved', 'saved_jobs'],
  ['/account/tasks', 'outstanding_tasks'],
  ['/account/settings', 'account_settings'],
  ['/account', 'account_settings'],
  ['/admin/docs', 'admin_docs'],
  ['/admin', 'admin_dashboard'],
  ['/about', 'static_pages'],
  ['/faq', 'static_pages'],
  // /privacy and /terms are deliberately absent. They are not unbuilt routes
  // waiting on a phase, they are redirects to the central GFTV policy site,
  // handled in vercel.json and never reaching a page here.
];

/** The feature key for a path, or null when nothing matches. */
export function featureForPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  let best = null;

  for (const [prefix, key] of ROUTE_FEATURES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best[0].length) best = [prefix, key];
    }
  }

  return best ? best[1] : null;
}

/**
 * Fill in the placeholder page for an unbuilt route. The page works out which
 * feature it is standing in for from the path, so the phase number and the
 * description both come from the status file and nothing is hardcoded. A page
 * can override that with data-placeholder-for when the path is not enough.
 * @param {object} status
 */
export function renderPlaceholder(status) {
  const holder = document.querySelector('[data-placeholder-for]');
  if (!holder) return;

  const declared = holder.getAttribute('data-placeholder-for');
  const key =
    declared && declared !== 'auto'
      ? declared
      : featureForPath(window.location.pathname);
  const phase = phaseForFeature(status, key);
  const info = phase === null ? null : phaseInfo(status, phase);

  const titleEl = holder.querySelector('[data-placeholder-title]');
  const sentenceEl = holder.querySelector('[data-placeholder-sentence]');
  const coversEl = holder.querySelector('[data-placeholder-covers]');

  if (phase === null || !info) {
    if (sentenceEl) {
      sentenceEl.textContent =
        'This part of Careers@GFTV has not been built yet.';
    }
    return;
  }

  // The markup carries a generic heading so the page still reads sensibly with
  // no JavaScript. Once the phase is known it becomes specific.
  if (titleEl) titleEl.textContent = `${info.name} is not built yet`;
  if (sentenceEl) sentenceEl.textContent = unavailableSentence(phase);
  if (coversEl) {
    coversEl.textContent = `Phase ${info.number} covers: ${info.description}`;
  }

  document.title = `${info.name} | Careers@GFTV`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
