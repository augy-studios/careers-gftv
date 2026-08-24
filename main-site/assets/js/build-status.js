// Build status: the phase notice, the disabled control pattern, and the
// placeholder page copy.
//
// Section 0c. One file, /assets/build-status.json, is the source of truth.
// Everything reads from it, flipping a phase to shipped is the only edit
// needed when it goes live, and no copy anywhere hardcodes a phase number.
// The Telegram bot and the docs site read the same file, so the three stay in
// step.
//
// Phase names and descriptions live in that JSON in both languages, as name
// and name_zh, because they are content, not interface strings, and
// three separate consumers read them. Everything else here comes from the
// dictionaries in assets/i18n.
//
// Every render function is idempotent. The shell calls them again on a
// language change, so a second call must replace what the first produced
// instead of stacking on top of it.

import { hydrateIcons } from './icons.js';
import { t, getLocale } from './i18n.js';

const SOURCE = '/assets/build-status.json';
const OVERRIDES = '/api/public/feature-status';
const NOTICE_KEY = 'gftv-careers.phaseNoticeDismissed';

/** The sentence section 0c fixes word for word, in the active language. */
export function unavailableSentence(phase) {
  return t('feature.unavailable', { phase });
}

/**
 * The other sentence, added in phase 7 with the maintenance switches in 8.12.
 *
 * **Never the phase one.** Telling somebody a feature they used last week "will
 * be available in Phase 6" is a lie about a shipped feature, and it also makes
 * a real outage indistinguishable from an unbuilt one. The admin's note is
 * appended exactly as typed and is optional.
 */
export function maintenanceSentence(note) {
  const base = t('feature.maintenance');
  return note ? `${base} ${note}` : base;
}

let cache = null;
let inFlight = null;

/**
 * Load the status file once per page. Falls back to a minimal shape instead
 * of throwing, so a network blip never takes the whole page down with it.
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

/* -------------------------------------------------------------------------
 * The maintenance overrides, 8.12
 * ---------------------------------------------------------------------- */

// Which shipped features are switched off right now, and the public note on
// each. Deliberately a second, separate load instead of something folded into
// the file above, per section 9: the phase list is a static file three
// consumers already read, and this is the one thing the browser needs that a
// static file cannot answer.
//
// **A failure leaves everything on.** That is the direction to fail in. A
// client that blanked a control it could not get a status for would turn a
// settings blip into a site that looks broken, which is precisely the state
// this exists to describe, not to cause.
let overridesCache = null;
let overridesInFlight = null;

/**
 * The current overrides, as a feature key to { note, since } map.
 * @returns {Promise<Record<string, { note: string|null, since: string|null }>>}
 */
export function loadFeatureOverrides() {
  if (overridesCache) return Promise.resolve(overridesCache);
  if (overridesInFlight) return overridesInFlight;

  overridesInFlight = fetch(OVERRIDES, { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((payload) => {
      overridesCache = payload?.ok === true ? (payload.data?.off ?? {}) : {};
      return overridesCache;
    })
    .catch((cause) => {
      console.warn('[careers-gftv] could not load feature overrides:', cause);
      overridesCache = {};
      return overridesCache;
    })
    .finally(() => {
      overridesInFlight = null;
    });

  return overridesInFlight;
}

/** Whether one feature is currently switched off. Synchronous, over the cache. */
export function isFeatureOff(featureKey) {
  return Boolean(overridesCache?.[featureKey]);
}

/** The public note on a switched off feature, or null. */
export function featureNote(featureKey) {
  return overridesCache?.[featureKey]?.note ?? null;
}

/* -------------------------------------------------------------------------
 * Reading a phase in the active language
 * ---------------------------------------------------------------------- */

/**
 * A localised field from a phase entry. Falls back to English instead of
 * showing nothing, on the same principle as the dictionary lookup: a phase
 * added without a translation should read in English, not disappear.
 * @param {object} phase
 * @param {'name'|'description'|'shipped_note'} field
 */
export function phaseText(phase, field) {
  if (!phase) return '';
  if (getLocale() === 'zh') {
    const translated = phase[`${field}_zh`];
    if (typeof translated === 'string' && translated !== '') return translated;
  }
  return phase[field] ?? '';
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
 *
 * Idempotent: any bar already on the page is removed first, so a language
 * change redraws without stacking a second bar above the first.
 *
 * @param {object} status
 */
export function renderPhaseNotice(status) {
  document.querySelector('.phase-notice')?.remove();

  if (allShipped(status)) return;

  const signature = shippedSignature(status);
  let dismissed = null;
  try {
    dismissed = localStorage.getItem(NOTICE_KEY);
  } catch {
    // Private browsing with storage blocked. Show the notice instead of failing.
  }
  if (dismissed === signature) return;

  const bar = document.createElement('div');
  bar.className = 'phase-notice';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t('notice.regionLabel'));
  bar.innerHTML = `
    <div class="phase-notice-inner">
      <p>${escapeHtml(t('notice.text'))} <a href="/status">${escapeHtml(t('notice.link'))}</a></p>
      <button type="button" class="icon-btn small" data-dismiss-notice
              aria-label="${escapeHtml(t('notice.dismiss'))}">
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

// Controls whose explainer listener is already attached. A language change
// re-runs the gating to update the wording, and without this the listener
// would be added a second time and the explainer would fire twice per click.
const wired = new WeakSet();

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

    // Two reasons a control can be disabled, and they are never conflated. A
    // feature that has not shipped gets the phase sentence; one that has
    // shipped and been switched off gets the maintenance sentence and the
    // admin's note. The second only applies to something that shipped, so the
    // order below is the whole of the logic.
    const shipped = isFeatureShipped(status, key);
    const off = shipped && isFeatureOff(key);

    if (shipped && !off) {
      el.setAttribute('data-shipped', 'true');
      el.removeAttribute('data-maintenance');
      return;
    }

    const sentence = off ? maintenanceSentence(featureNote(key)) : unavailableSentence(phase);
    el.setAttribute('data-shipped', shipped ? 'true' : 'false');
    if (off) el.setAttribute('data-maintenance', 'true');
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
      // Replace, not append, so a language change rewrites the hint.
      const existing = el.nextElementSibling;
      if (existing?.classList.contains('feature-hint')) {
        existing.textContent = sentence;
      } else {
        const hint = document.createElement('span');
        hint.className = 'feature-hint';
        hint.textContent = sentence;
        el.after(hint);
      }
    }

    if (wired.has(el)) return;
    wired.add(el);

    // A disabled button fires no click event, so listen on the way down from a
    // parent instead. This is what makes the explainer reachable at all. The
    // phase is read again at click time so the wording follows the language.
    const holder = el.parentElement ?? document.body;
    holder.addEventListener(
      'pointerdown',
      (event) => {
        if (!el.contains(event.target) && event.target !== el) return;
        // Both the sentence and the reason are read again at click time, so the
        // wording follows the language and a feature switched back on while the
        // page was open explains itself correctly.
        const nowOff = isFeatureShipped(status, key) && isFeatureOff(key);
        showFeatureExplainer(
          nowOff ? maintenanceSentence(featureNote(key)) : unavailableSentence(phase),
          nowOff ? null : phase,
          status
        );
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
  // A null phase means this is a maintenance sentence and not a phase one,
  // so there is no phase to describe underneath it. Saying what phase 6 covers
  // to somebody whose saved roles are temporarily off would be answering a
  // question they did not ask with something that is not true of their case.
  const info = phase === null ? null : phaseInfo(status, phase);

  if (!explainer) {
    explainer = document.createElement('div');
    explainer.className = 'feature-explainer glass-card';
    explainer.setAttribute('role', 'status');
    document.body.append(explainer);
  }

  const detail = info
    ? t('feature.phaseCovers', {
        number: info.number,
        name: phaseText(info, 'name'),
        description: phaseText(info, 'description'),
      })
    : '';

  explainer.innerHTML = `
    <p><strong>${escapeHtml(sentence)}</strong></p>
    ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
    <p><a href="/status">${escapeHtml(t('feature.seeFullStatus'))}</a></p>
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
// vercel.json needs a single rewrite target in place of one page per route.
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
  // 7i's helper area. Listed before the bare /account entry matters not at all,
  // since the longest prefix wins, but leaving it out would file the page under
  // account_settings and describe the wrong feature the day either is switched
  // off.
  ['/account/translations', 'translation_helpers'],
  ['/account', 'account_settings'],
  // The dashboard's own sections, per 0c: "A staff member clicking an unbuilt
  // section gets the same message rather than an empty screen." The ones phase
  // 7 built resolve to their own key and never reach the placeholder, because
  // they are real pages; they are listed anyway so the sidebar can gate itself
  // from the same map and not from a second list.
  ['/admin/docs', 'admin_docs'],
  ['/admin/translations', 'admin_translations'],
  ['/admin/analytics', 'admin_analytics'],
  ['/admin/invites', 'admin_invites'],
  ['/admin/admins', 'admin_admins'],
  ['/admin/applicants', 'admin_applicants'],
  ['/admin/settings', 'admin_settings'],
  ['/admin/jobs', 'admin_jobs'],
  ['/admin/applications', 'admin_applications'],
  ['/admin/departments', 'admin_departments'],
  ['/admin/tags', 'admin_tags'],
  ['/admin/maintenance', 'admin_maintenance'],
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
    if (titleEl) titleEl.textContent = t('placeholder.title');
    if (sentenceEl) sentenceEl.textContent = t('placeholder.sentence');
    if (coversEl) coversEl.textContent = '';
    return;
  }

  const name = phaseText(info, 'name');

  if (titleEl) titleEl.textContent = t('placeholder.titleForPhase', { name });
  if (sentenceEl) sentenceEl.textContent = unavailableSentence(phase);
  if (coversEl) {
    coversEl.textContent = t('placeholder.covers', {
      number: info.number,
      description: phaseText(info, 'description'),
    });
  }

  document.title = t('placeholder.pageTitle', { name });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
