// /admin/maintenance. Section 8.12, and the switches in 0c.
//
// "A list of every key in the feature map whose phase has shipped, each with a
// switch, its current state, and where in the site it appears. A feature that
// has not shipped is not listed: it is already off, and offering to turn it off
// again is noise."
//
// Everything on this page is about being honest with the person reading it in
// the middle of something going wrong, so four sentences on it are not
// decoration and should not be trimmed:
//
//   **An override survives a deploy**, because it is a row and not a file.
//   **Nothing turns itself back on.** A feature left off is left off until
//   somebody comes back for it.
//   **This is not the applications toggle**, which is a policy choice and lives
//   in 8.10. They read completely differently to an applicant, and which of the
//   two it is is the one thing somebody turned away actually wants to know.
//   **The note is public** and is shown to applicants exactly as typed.
//
// The denylist is shown greyed with its reason instead of hidden, so an admin
// looking for the sign in switch finds out why there is not one instead of
// concluding the page is broken.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import { formatDate } from './format.js';
import { confirmAction } from './danger-confirm.js';
import { mountAdminPage, adminApiError, adminMessage, emptyRow } from './admin-shell.js';

/**
 * The note's cap, matching NOTE_MAX in api/_lib/maintenance.js.
 *
 * Written here, not fetched, because a maxlength on the field is a
 * courtesy, not the enforcement: the endpoint validates it regardless, and a
 * field that let somebody type a thousand characters and then refused the save
 * would be worse than one that stopped them at the limit.
 */
const NOTE_MAX = 300;

const PATH = '/admin/maintenance';

let payload = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });
}

async function load() {
  const result = await api('/api/admin/maintenance', { locale: false });

  if (!result.ok) {
    adminApiError(result.error);
    return;
  }

  payload = result.data;
  draw();
}

function draw() {
  drawFeatures();
  drawDenied();
}

function drawFeatures() {
  const holder = document.querySelector('#featureList');
  if (!holder) return;

  const features = payload?.features ?? [];

  if (features.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noFlippableFeatures'));
    return;
  }

  holder.innerHTML = features
    .map(
      (feature) => `
      <article class="glass-card feature-switch${feature.off ? ' is-off' : ''}"
               data-feature-key="${escapeHtml(feature.key)}">
        <div class="feature-switch-head">
          <div>
            <h3>${escapeHtml(t(`featureName.${feature.key}`))}</h3>
            <p class="muted admin-sub">${escapeHtml(whereFor(feature.key))}</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-switch ${feature.off ? '' : 'checked'}>
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-label">${escapeHtml(
              t(feature.off ? 'admin.featureOff' : 'admin.featureOn')
            )}</span>
          </label>
        </div>

        ${
          feature.off
            ? `<div class="feature-switch-state">
                 <p>${escapeHtml(
                   t('admin.switchedOffBy', {
                     who: feature.by ?? t('admin.unknownWho'),
                     date: feature.since ? formatDate(feature.since) : '',
                   })
                 )}</p>
                 ${
                   feature.note
                     ? `<p class="feature-note">${escapeHtml(feature.note)}</p>`
                     : `<p class="muted">${escapeHtml(t('admin.noPublicNote'))}</p>`
                 }
               </div>`
            : ''
        }
      </article>`
    )
    .join('');

  hydrateIcons(holder);

  holder.querySelectorAll('[data-feature-key]').forEach((card) => {
    const key = card.getAttribute('data-feature-key');
    const feature = features.find((candidate) => candidate.key === key);

    card.querySelector('[data-switch]')?.addEventListener('change', (event) => {
      // The checkbox reads as "this feature is on", so an unchecked box means
      // off.
      const turningOff = !event.target.checked;

      // Put it straight back, before anything is asked. The switch shows what
      // is true, and what is true does not change until the endpoint says so.
      // Leaving it moved while the confirmation is open showed a control in a
      // state nothing had agreed to yet, and next to a label still reading
      // "On", because the label is drawn from the payload and the track is
      // drawn by :checked. Reverting here means the two can never disagree:
      // the redraw after a successful flip is the only thing that moves it.
      revert(event.target, turningOff);

      flip(feature, turningOff);
    });
  });
}

/**
 * Put the switch back to the state the flip was trying to leave.
 *
 * The box reads as "this feature is on", so a flip to off started from on and a
 * flip to on started from off: the state to go back to is `off` itself. It was
 * written as `!off`, which is the same expression with the opposite meaning, so
 * a flip that failed left the switch showing the state the server had just
 * refused to move to. A control lying about what is switched off is bad on any
 * page and worst on this one.
 *
 * Setting `checked` from script fires no change event, so this cannot loop.
 *
 * @param {HTMLInputElement} control
 * @param {boolean} off whether the flip was trying to switch the feature off
 */
function revert(control, off) {
  control.checked = off;
}

async function flip(feature, off) {
  const name = t(`featureName.${feature.key}`);

  // Both directions are confirmed, and switching one back **on** is confirmed
  // for the reason that is easy to miss: during an incident this page is being
  // read by somebody under pressure, and a mis-click that quietly turns a
  // broken feature back on is worse than one that turns a working feature off.
  // The off direction carries the note; 8.12: "Prefill nothing and suggest
  // nothing: an admin who has just broken something writes a better sentence
  // than a dropdown does."
  const answer = await confirmAction({
    title: t(off ? 'admin.confirmOffTitle' : 'admin.confirmOnTitle', { feature: name }),
    body: t(off ? 'admin.confirmOffBody' : 'admin.confirmOnBody', { feature: name }),
    confirmLabel: t(off ? 'admin.confirmOffAction' : 'admin.confirmOnAction'),
    danger: off,
    field: off
      ? {
          label: t('admin.notePrompt', { feature: name }),
          hint: t('admin.notePromptHint'),
          multiline: true,
          maxLength: NOTE_MAX,
        }
      : undefined,
  });

  // Cancelled. The switch was already put back before the question was asked,
  // so there is nothing to undo here.
  if (answer === null) return;

  const note = answer.value;

  const result = await api('/api/admin/maintenance', {
    method: 'POST',
    locale: false,
    body: { key: feature.key, off, note: note || null },
  });

  if (!result.ok) {
    // Also already showing the state that is still true, for the same reason.
    adminApiError(result.error);
    return;
  }

  adminMessage(
    'ok',
    t(off ? 'admin.featureSwitchedOff' : 'admin.featureSwitchedOn', {
      feature: t(`featureName.${feature.key}`),
    })
  );

  await load();
}

function drawDenied() {
  const holder = document.querySelector('#deniedList');
  if (!holder) return;

  const denied = payload?.denied ?? [];

  holder.innerHTML = denied
    .map(
      (feature) => `
      <li class="denied-feature">
        <span class="denied-feature-name">${escapeHtml(t(`featureName.${feature.key}`))}</span>
        <span class="muted">${escapeHtml(reasonFor(feature))}</span>
      </li>`
    )
    .join('');
}

/**
 * Why a feature cannot be flipped, in the reader's language where we have it.
 *
 * The endpoint sends the reason in English, like every message from this API,
 * and the dictionary wins when it has an entry, exactly as api.js already does
 * for error messages. That way a denylist entry added in code shows up here
 * immediately, in English, and not as a missing key.
 */
/**
 * Where in the site a feature appears, per 8.12: each switch shows "its current
 * state, and where in the site it appears".
 *
 * Empty when the dictionary has no line for it, and never the raw key. A
 * feature key added to build-status.json without a line here is a missing
 * sentence, and printing "saved_jobs" under the heading would look like a bug
 * instead of the omission it is.
 */
function whereFor(key) {
  const lookup = `featureWhere.${key}`;
  const translated = t(lookup);
  return translated === lookup ? '' : translated;
}

function reasonFor(feature) {
  const key = `featureDenied.${feature.key}`;
  const translated = t(key);
  return translated === key ? feature.reason : translated;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
