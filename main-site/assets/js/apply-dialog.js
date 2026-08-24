// The handoff modal, from 7c. One component, two ways in.
//
//   handoff  the applicant just clicked Apply. The modal opens, the form opens
//            in a new tab a moment later, and the modal is waiting when they
//            come back.
//   resume   they left without answering, on this visit or a previous one, and
//            the modal reopens straight into "Tell us what you think" with no
//            tab and no progress indicator.
//
// A native <dialog> with showModal(), which is what 7c asks for and is the one
// modal on this site that is not the .modal-backdrop shell in dialog.js. The
// reason is not style: focus trapping and the backdrop come free and correct,
// including the parts a hand written trap gets wrong, and a browser will never
// treat an in-page <dialog> as a popup to block. Phase 12's polish pass should
// move the other three onto this, not the other way round.
//
// The five rules in 7c that are easy to break, each with the thing that breaks:
//
//   1. **The modal opens before the tab, in the same tick as the click.**
//      Nothing is awaited first. Somebody who watches the modal go up
//      recognises it when they come back; somebody who meets it on return has
//      been ambushed. openApplyDialog is therefore synchronous and takes a
//      promise for the form URL, not a URL.
//
//   2. **At least 800ms, and after a paint, before window.open.** Long enough
//      that the modal is visibly on screen before the new tab steals focus.
//
//   3. **A blocked tab is detected, not fought.** Safari and iOS can refuse a
//      window.open that happens after an await. If it returns null or throws,
//      the modal offers a real anchor instead, because a click on an anchor is
//      a fresh user gesture and always succeeds.
//
//   4. **Dismissing is fine and leaves the row pending**, which already counts
//      as No. Escape closes it, the backdrop closes it, the corner control
//      closes it, and none of that is treated as an answer.
//
//   5. **beforeunload is armed only while the modal is open and unanswered**,
//      per 7d, and removed on every close. It is the only hook a browser gives
//      us and all it does is show a confirmation the site cannot word. That is
//      the honest version; the hostile workarounds in 7d are not built.

import { t } from './i18n.js';
import { api } from './api.js';
import { iconMarkup, hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';

/** How long the modal must be on screen before the tab opens, per 7c step 3. */
const TAB_DELAY_MS = 800;

/**
 * Belt and braces, per 7c: swap the header regardless after this long, in case
 * the tab never took focus. The form can open on a second monitor or behind the
 * current window, and neither fires a visibility change.
 */
const RETURN_FALLBACK_MS = 8000;

const STARS = [1, 2, 3, 4, 5];

let dialog = null;
let state = null;

/* -------------------------------------------------------------------------
 * Building it, once
 * ---------------------------------------------------------------------- */

function build() {
  const el = document.createElement('dialog');
  el.className = 'apply-dialog';
  el.id = 'applyDialog';
  el.setAttribute('aria-labelledby', 'applyDialogTitle');

  // Everything lives inside one wrapper so a backdrop click is detectable: a
  // native <dialog> reports a click on its own padding as a click on the
  // dialog element, and on the content as a click on the content.
  el.innerHTML = `
    <div class="apply-dialog-inner glass-card">
      <div class="modal-head">
        <h2 id="applyDialogTitle" aria-live="polite"></h2>
        <button class="icon-btn small" type="button" data-close-apply>
          <span data-icon="close" data-icon-size="18"></span>
        </button>
      </div>

      <div class="apply-progress" id="applyProgress" role="presentation"><span></span></div>

      <p class="apply-lede" id="applyLede"></p>

      <p class="apply-blocked-action" id="applyBlockedAction" hidden>
        <a class="btn btn-primary" id="applyBlockedLink" target="_blank" rel="noopener"></a>
      </p>

      <fieldset class="star-rating" id="applyRating">
        <legend class="modal-section-label" id="applyRatingLegend"></legend>
        <div class="star-row" id="applyStars"></div>
        <p class="star-readout" id="applyStarReadout" aria-live="polite"></p>
      </fieldset>

      <div class="apply-answer">
        <p class="modal-section-label" id="applyAnswerLegend"></p>
        <div class="apply-answer-buttons">
          <button type="button" class="btn btn-secondary" data-answer="yes"></button>
          <button type="button" class="btn btn-secondary" data-answer="no"></button>
        </div>
        <p class="apply-answer-note" id="applyAnswerNote"></p>
      </div>

      <p class="form-message" id="applyMessage" role="status" hidden></p>

      <p class="apply-quiet-link" id="applyQuietLink" hidden>
        <a target="_blank" rel="noopener"></a>
      </p>
    </div>
  `;

  document.body.append(el);
  hydrateIcons(el);

  el.querySelector('[data-close-apply]').addEventListener('click', () => el.close());

  // Native <dialog> does not close on a backdrop click by itself. The click
  // lands on the dialog element and not on the inner wrapper, which is the
  // whole reason the content is wrapped.
  el.addEventListener('click', (event) => {
    if (event.target === el) el.close();
  });

  // Fires for Escape as well as for close(), so every exit goes through one
  // place and beforeunload can be disarmed in exactly one place with it.
  el.addEventListener('close', onClosed);

  el.querySelector('#applyStars').addEventListener('change', onRatingChange);

  el.querySelectorAll('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => answer(button.getAttribute('data-answer')));
  });

  // Everything in here is written by JavaScript instead of carrying data-i18n
  // attributes, because the wording depends on which state the modal is in as
  // well as on the language. So a language change is a redraw.
  document.addEventListener('gftv:localechange', () => {
    if (state) render();
  });

  return el;
}

/* -------------------------------------------------------------------------
 * Opening it
 * ---------------------------------------------------------------------- */

/**
 * Open the modal.
 *
 * Synchronous on purpose. 7c: "The modal opens immediately, in the same tick as
 * the click, before any network call resolves. Nothing is awaited first."
 *
 * @param {{
 *   mode: 'handoff'|'resume',
 *   jobId: string,
 *   jobTitle: string,
 *   rating?: number|null,
 *   analyticsId?: string|null,
 *   ready?: Promise<{ ok: boolean, analyticsId?: string, formUrl?: string, message?: string }>
 * }} options `ready` is the api/applications/start call, already in flight or
 *   already resolved from a prefetch. Required for handoff, unused for resume.
 */
export function openApplyDialog(options) {
  if (!dialog) dialog = build();

  // Only ever one at a time, per 7c. A second prompt waits for the next page
  // load without stacking.
  if (dialog.open) return;

  state = {
    mode: options.mode,
    jobId: options.jobId,
    jobTitle: options.jobTitle ?? '',
    analyticsId: options.analyticsId ?? null,
    rating: options.rating ?? null,
    formUrl: null,
    // redirecting | returned | blocked | failed
    phase: options.mode === 'resume' ? 'returned' : 'redirecting',
    answered: false,
    openedAt: Date.now(),
    message: null,
  };

  render();
  dialog.showModal();

  // A resumed prompt knows its row from the start. A handoff learns it when the
  // start call lands, and announces there instead.
  announceShown(state.analyticsId);

  armBeforeUnload();
  watchForReturn();

  if (options.mode === 'handoff') {
    handOff(options.ready);
  }
}

/** Whether the modal is on screen. Used to keep the page from opening a second. */
export function applyDialogOpen() {
  return Boolean(dialog?.open);
}

/**
 * Say that a prompt has been put in front of the applicant.
 *
 * apply-prompt.js keeps the once-a-visit ledger and listens for this. It
 * announces instead of writing to that ledger directly for two reasons: this
 * module is imported on demand and that one is on every page, so the dependency
 * only runs in the direction that already exists, and the modal opened by a
 * handoff is not opened by apply-prompt.js at all. Leaving the handoff out was
 * the bug the phase 5 live run found: dismiss the modal after applying and it
 * came straight back on the next page, because nothing had recorded it as seen.
 *
 * Fired when the row id becomes known, which is at open time for a resumed
 * prompt and when the start call lands for a handoff.
 */
function announceShown(analyticsId) {
  if (!analyticsId) return;
  document.dispatchEvent(
    new CustomEvent('gftv:applypromptshown', { detail: { analyticsId } })
  );
}

/**
 * Fill in a rating the modal was opened without.
 *
 * The fast path in apply-prompt.js opens from a cache that may not carry one,
 * and the server's answer arrives a moment later. Showing an empty row of stars
 * to somebody who has already rated reads as though their rating was lost, and
 * replacing the whole modal to fix that would be worse than the problem.
 *
 * Ignored if they have chosen a rating in the meantime: what they just clicked
 * beats what the server knew a moment ago.
 *
 * @param {string} analyticsId
 * @param {number|null} rating
 */
export function updateApplyDialogRating(analyticsId, rating) {
  if (!state || state.analyticsId !== analyticsId) return;
  if (state.rating !== null || rating === null) return;

  state.rating = rating;
  renderStars(dialog);
}

/* -------------------------------------------------------------------------
 * The handoff itself, 7c steps 2 to 6
 * ---------------------------------------------------------------------- */

async function handOff(ready) {
  const mine = state;
  let result;

  try {
    result = await ready;
  } catch {
    result = { ok: false, message: t('apply.startFailed') };
  }

  // The applicant closed the modal while the call was in flight, or opened
  // another posting's. Either way this answer is no longer wanted.
  if (state !== mine) return;

  if (!result?.ok) {
    state.phase = 'failed';
    state.message = result?.message ?? t('apply.startFailed');
    render();
    return;
  }

  state.analyticsId = result.analyticsId;
  state.formUrl = result.formUrl;
  announceShown(state.analyticsId);
  render();

  // After a paint and after 800ms from opening, whichever is later. Two frames
  // and not one: the first is scheduled before the browser has laid the
  // dialog out, the second runs after it has.
  //
  // Read from mine and not from state past this point. The modal can be
  // closed inside either await, which sets state to null, and reading
  // state.openedAt after that would throw instead of simply stopping.
  await nextPaint();
  const waited = Date.now() - mine.openedAt;
  if (waited < TAB_DELAY_MS) await wait(TAB_DELAY_MS - waited);

  if (state !== mine || !dialog.open) return;

  let tab = null;
  try {
    // **No 'noopener' in the feature string, and this is not an oversight.**
    // 7c step 3 says to open with it and step 5 says to treat a null return as
    // a blocked tab. Those two cannot both hold: window.open is specified to
    // return null whenever noopener is set, precisely because the caller is
    // meant to get no handle on the new window. Written literally, every single
    // handoff reports itself blocked and every applicant is told their browser
    // stopped a tab that in fact opened. The live run in phase 5 found exactly
    // that.
    //
    // So the reference is severed a line later instead, which is what the
    // whole web did before noopener existed and gives the protection that
    // actually matters here: the form cannot navigate this tab out from under
    // the applicant through window.opener.
    tab = window.open(state.formUrl, '_blank');
    if (tab) {
      try {
        tab.opener = null;
      } catch {
        // Some engines refuse the assignment across origins. The tab is open,
        // which is the thing this branch is deciding about.
      }
    }
  } catch {
    tab = null;
  }

  if (!tab) {
    // Safari and iOS are stricter and can refuse a window.open that happens
    // after an await. Do not fight it, per 7c step 5: offer an anchor, which is
    // a fresh gesture and always works.
    state.phase = 'blocked';
    render();
    dialog.querySelector('#applyBlockedLink')?.focus();
  }
}

/**
 * Notice the applicant coming back, so the header can change from "Redirecting
 * you" to "Tell us what you think".
 *
 * Three signals, per 7c, because none of them is reliable alone: the tab
 * becoming visible again, the window taking focus, and a timer for the case
 * where neither fires because the form opened on another monitor.
 */
function watchForReturn() {
  const mine = state;
  let left = false;

  const onVisibility = () => {
    if (document.hidden) {
      left = true;
    } else if (left) {
      markReturned();
    }
  };

  const onFocus = () => {
    if (left) markReturned();
  };

  const timer = setTimeout(() => {
    // Not while a blocked tab is being offered. There the header is already
    // doing something more useful than announcing a return that has not
    // happened, and the anchor click switches it when it does.
    if (state === mine && state.phase === 'redirecting') markReturned();
  }, RETURN_FALLBACK_MS);

  function markReturned() {
    if (state !== mine || state.phase === 'returned' || state.phase === 'failed') return;
    state.phase = 'returned';
    render();
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);

  state.stopWatching = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
  };
}

/* -------------------------------------------------------------------------
 * The three sections
 * ---------------------------------------------------------------------- */

function render() {
  const panel = dialog;

  panel.querySelector('#applyDialogTitle').textContent = headerText();
  // Written here instead of through data-i18n, because nothing in this modal
  // is reached by translateDom: it is all redrawn on a language change instead.
  panel.querySelector('[data-close-apply]').setAttribute('aria-label', t('common.close'));
  panel.querySelector('#applyProgress').hidden = state.phase !== 'redirecting';

  const lede = panel.querySelector('#applyLede');
  lede.textContent = ledeText();
  lede.hidden = lede.textContent === '';

  // The large primary anchor a blocked tab gets, per 7c step 6.
  const blocked = panel.querySelector('#applyBlockedAction');
  const blockedLink = panel.querySelector('#applyBlockedLink');
  blocked.hidden = state.phase !== 'blocked';
  if (state.phase === 'blocked') {
    blockedLink.href = state.formUrl;
    blockedLink.textContent = t('apply.openForm');
    blockedLink.onclick = () => {
      // A real click on a real anchor. The tab is opening now, so the modal can
      // stop offering it and start asking.
      state.phase = 'returned';
      setTimeout(render, 0);
    };
  }

  // Both of the lower sections are about an application that exists. When the
  // start call failed there is no analytics row and no posting handed over, so
  // asking whether they applied would be asking about nothing.
  const usable = state.phase !== 'failed';
  panel.querySelector('#applyRating').hidden = !usable;
  panel.querySelector('.apply-answer').hidden = !usable;

  renderStars(panel);

  panel.querySelector('#applyAnswerLegend').textContent = t('apply.answerLegend');
  panel.querySelector('[data-answer="yes"]').textContent = t('apply.yes');
  panel.querySelector('[data-answer="no"]').textContent = t('apply.no');
  panel.querySelector('#applyAnswerNote').textContent = t('apply.answerNote');

  const message = panel.querySelector('#applyMessage');
  message.textContent = state.message ?? '';
  message.className = state.message
    ? `callout ${state.phase === 'failed' ? 'danger' : 'note'} form-message`
    : 'form-message';
  message.hidden = !state.message;

  // The quiet version of the form link, shown in every case once there is a
  // URL, per 7c: a tab can open on another monitor or behind the current window
  // without the applicant noticing.
  const quiet = panel.querySelector('#applyQuietLink');
  const quietLink = quiet.querySelector('a');
  quiet.hidden = !state.formUrl || state.phase === 'blocked';
  if (!quiet.hidden) {
    quietLink.href = state.formUrl;
    quietLink.textContent = t('apply.quietLink');
  }
}

function headerText() {
  if (state.phase === 'failed') return t('apply.failedTitle');
  if (state.phase === 'blocked') return t('apply.blockedTitle');
  if (state.phase === 'returned') return t('apply.tellUsTitle');
  return t('apply.redirectingTitle');
}

function ledeText() {
  if (state.phase === 'failed') return '';
  if (state.phase === 'blocked') return t('apply.blockedBody');
  if (state.phase === 'returned') return t('apply.tellUsBody', { title: state.jobTitle });
  return t('apply.redirectingBody', { title: state.jobTitle });
}

/**
 * Five stars as a real radio group, per 7c: visually hidden inputs and labels,
 * so arrow keys move between them and a screen reader reads a group of five
 * choices, not a row of clickable spans.
 */
function renderStars(panel) {
  panel.querySelector('#applyRatingLegend').textContent = t('apply.rateLegend');

  const row = panel.querySelector('#applyStars');
  row.innerHTML = STARS.map(
    (value) => `
      <input class="visually-hidden star-input" type="radio" name="applyRating"
             id="applyStar${value}" value="${value}"
             ${state.rating === value ? 'checked' : ''}>
      <label class="star-label" for="applyStar${value}"
             data-on="${state.rating !== null && value <= state.rating}">
        ${iconMarkup('star', { size: 30 })}
        <span class="visually-hidden">${escapeHtml(
          t('apply.starLabel', { value, total: STARS.length })
        )}</span>
      </label>`
  ).join('');

  paintStarState(panel);
}

let ratingTimer = null;

function onRatingChange(event) {
  const input = event.target.closest('.star-input');
  if (!input) return;

  const value = Number(input.value);
  state.rating = value;

  // Updated in place, not by redrawing the row, and that is not a
  // micro-optimisation. Arrow keys move focus between radios in a group and
  // check as they go, so a redraw here would rip the focused element out from
  // under somebody arrowing from one star to five, five times in a row.
  paintStarState(dialog);

  // Saved on selection, per 7c, and never blocking: the modal does not wait on
  // it, and a rating given is kept even if the modal is then dismissed without
  // answering the apply question.
  //
  // Debounced, for the same arrow key reason. Holding the right arrow down
  // would otherwise be one write per star crossed, and only the last one is the
  // answer they meant.
  clearTimeout(ratingTimer);
  const jobId = state.jobId;
  ratingTimer = setTimeout(() => saveRating(jobId, value), 350);
}

async function saveRating(jobId, value) {
  const result = await api('/api/ratings/upsert', {
    method: 'POST',
    locale: false,
    body: { job_id: jobId, rating: value },
  });

  if (result.ok || !state || state.jobId !== jobId) return;

  state.message = t('apply.rateFailed');
  render();
}

/** The chosen state of each star, and the readout, without rebuilding the row. */
function paintStarState(panel) {
  panel.querySelectorAll('.star-label').forEach((label, index) => {
    label.setAttribute('data-on', String(state.rating !== null && index + 1 <= state.rating));
  });

  panel.querySelector('#applyStarReadout').textContent =
    state.rating === null
      ? t('apply.rateOptional')
      : t('apply.rateReadout', { value: state.rating, total: STARS.length });
}

/* -------------------------------------------------------------------------
 * The answer
 * ---------------------------------------------------------------------- */

async function answer(value) {
  if (!state.analyticsId) {
    // The start call has not landed, or failed. There is no row to answer
    // against, so there is nothing honest to record.
    state.message = t('apply.noRowYet');
    render();
    return;
  }

  const buttons = [...dialog.querySelectorAll('[data-answer]')];
  buttons.forEach((button) => (button.disabled = true));

  const result = await api('/api/applications/respond', {
    method: 'POST',
    locale: false,
    body: { analytics_id: state.analyticsId, answer: value },
  });

  buttons.forEach((button) => (button.disabled = false));

  if (!result.ok) {
    state.message = result.error?.message || t('apply.answerFailed');
    render();
    return;
  }

  state.answered = true;

  // 7c: answering closes the modal and replaces the Apply button on the page
  // with the resulting state. The page owns that; this says what happened.
  document.dispatchEvent(
    new CustomEvent('gftv:applychange', {
      detail: {
        jobId: state.jobId,
        analyticsId: state.analyticsId,
        didApply: result.data?.did_apply === true,
        application: result.data?.application ?? null,
      },
    })
  );

  dialog.close();
}

/* -------------------------------------------------------------------------
 * Leaving
 * ---------------------------------------------------------------------- */

function onClosed() {
  disarmBeforeUnload();
  state?.stopWatching?.();
  // Deliberately not cleared. A dismissal leaves the row pending, which counts
  // as No, and nothing here needs to know about it: the server is the source of
  // truth and the prompt comes back on the next page load.
  state = null;
}

/**
 * 7d, in full. A browser will not let a page refuse to close, and the closest
 * honest version is a confirmation the applicant can always dismiss. It is
 * armed only while the modal is open and unanswered, and disarmed on every exit
 * including Escape and the backdrop, because somebody who closed the modal has
 * already said they are done with it for now.
 */
function onBeforeUnload(event) {
  if (!state || state.answered) return;
  event.preventDefault();
  // Every browser ignores custom text here and shows its own wording. Setting
  // returnValue is still what triggers the prompt at all in some of them.
  event.returnValue = '';
}

function armBeforeUnload() {
  window.addEventListener('beforeunload', onBeforeUnload);
}

function disarmBeforeUnload() {
  window.removeEventListener('beforeunload', onBeforeUnload);
}

/* -------------------------------------------------------------------------
 * Small things
 * ---------------------------------------------------------------------- */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}
