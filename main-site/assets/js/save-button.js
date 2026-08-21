// Saving a posting, from 7g: "Unsave action, and a save or unsave toggle on
// both the job cards in /search and the job detail page."
//
// One control, three places. The board, the home page's latest openings, and
// the posting itself all render the same button and read the same cached answer,
// because a reader who has learned that the filled bookmark means saved should
// not have to learn it twice.
//
// Two things about it are decisions rather than implementation:
//
//   **Saving completes on return from signing in, unlike applying.** Section 4
//   says so explicitly, and the difference is deliberate: applying opens a tab
//   and writes an analytics row, so it must wait for a real gesture, while
//   saving is one row that the person has already asked for and that they can
//   undo with the same button. So consumeIntent('save') does the write here,
//   where apply.js only highlights a button.
//
//   **The state is one request per page, shared.** Same shape as
//   apply-badges.js and for the same reason: a card is public and cacheable,
//   this is per applicant, and folding it into the card renderer would put a
//   session request in front of the board for the majority of readers who have
//   saved nothing.

import { api, applicantSession } from './api.js';
import { t } from './i18n.js';
import { iconMarkup } from './icons.js';
import { openSignInPrompt, consumeIntent } from './signin-prompt.js';
import { loadBuildStatus, applyFeatureGating } from './build-status.js';

let promise = null;

/**
 * The postings this applicant has saved, as a set of job ids. Empty for anybody
 * signed out, which costs them no request.
 * @returns {Promise<Set<string>>}
 */
function savedIds() {
  if (promise) return promise;

  promise = applicantSession()
    .then((session) => {
      if (!session?.user) return null;
      return api('/api/saved/mine', { locale: false });
    })
    .then((result) => new Set(result?.ok ? (result.data.job_ids ?? []) : []));

  return promise;
}

/** Forget the cached answer. */
export function refreshSaved() {
  promise = null;
}

/**
 * The markup for one save control, for templates built with innerHTML.
 *
 * Drawn in the unsaved state, always, and corrected in place once the session
 * answer lands. That is the same order the Apply button uses: the signed out
 * answer is right for most readers and holding the card back until a request
 * resolves would delay everybody to tidy up the few.
 *
 * @param {string} jobId
 * @param {{ withLabel?: boolean }} [options] the posting page shows the word,
 *        a card shows the bookmark alone with the word for screen readers.
 */
export function saveButtonMarkup(jobId, options = {}) {
  return (
    `<button type="button" class="save-btn${options.withLabel ? ' save-btn-wide btn btn-secondary' : ' icon-btn'}"` +
    ` data-save-job="${escapeAttr(jobId)}" aria-pressed="false" data-feature="saved_jobs">` +
    iconMarkup('bookmark', { size: options.withLabel ? 18 : 20 }) +
    `<span class="save-btn-text${options.withLabel ? '' : ' visually-hidden'}"></span>` +
    `</button>`
  );
}

/**
 * Wire every save control in a subtree and paint its current state.
 *
 * Safe to call repeatedly. A control already wired is skipped, so a redraw of
 * part of a page does not stack listeners.
 *
 * @param {ParentNode} root
 */
export async function mountSaveButtons(root = document) {
  const buttons = [...root.querySelectorAll('[data-save-job]')];
  if (buttons.length === 0) return;

  for (const button of buttons) {
    if (!button.hasAttribute('data-save-wired')) {
      button.setAttribute('data-save-wired', '');
      button.addEventListener('click', onClick);
    }
    // Labelled before the answer arrives, so a card is never a bookmark with no
    // accessible name while the request is in flight.
    paint(button, button.getAttribute('aria-pressed') === 'true');
  }

  // Section 0c's disabled state has to reach controls created after the page's
  // own gating pass ran, exactly as the Apply button does.
  loadBuildStatus().then((status) => applyFeatureGating(status, root));

  const saved = await savedIds();
  for (const button of buttons) {
    paint(button, saved.has(button.getAttribute('data-save-job')));
  }

  resumeAfterSignIn(root);
}

/* -------------------------------------------------------------------------
 * Drawing and clicking
 * ---------------------------------------------------------------------- */

function paint(button, isSaved) {
  button.setAttribute('aria-pressed', String(isSaved));

  const label = t(isSaved ? 'saved.unsaveAction' : 'saved.saveAction');
  const text = button.querySelector('.save-btn-text');
  if (text) text.textContent = label;

  // The title carries the same words for a pointer user, since a card's control
  // shows the bookmark alone.
  //
  // Except when the control is gated. applyFeatureGating puts the phase or the
  // maintenance sentence on the title, and it runs before the second paint that
  // follows savedIds(), so writing "Save this role" here unconditionally
  // replaced the only explanation a pointer user gets for a bookmark that is
  // greyed out. The gated state is the more useful of the two sentences, and it
  // is the one that answers the question somebody hovering is actually asking.
  const gated =
    button.getAttribute('data-shipped') === 'false' ||
    button.getAttribute('data-maintenance') === 'true';
  if (!gated) button.setAttribute('title', label);
}

async function onClick(event) {
  const button = event.currentTarget;
  const jobId = button.getAttribute('data-save-job');
  if (!jobId) return;

  const session = await applicantSession();

  if (!session?.user) {
    // Section 4: the same prompt Apply uses, with its own sentence, and the
    // posting carried through the round trip so the write can complete on
    // return. The board is one page with twenty cards on it, so "save" alone
    // would not say which.
    openSignInPrompt({
      intent: 'save',
      messageKey: 'saved.needAccount',
      target: jobId,
    });
    return;
  }

  const wasSaved = button.getAttribute('aria-pressed') === 'true';
  await toggle(button, jobId, wasSaved ? 'unsave' : 'save');
}

async function toggle(button, jobId, action) {
  button.disabled = true;

  // Painted before the request lands. The button is a toggle on a row the
  // person owns, so the optimistic state is almost always right, and a bookmark
  // that waits 200ms to fill in feels broken on a phone.
  paint(button, action === 'save');

  const result = await api('/api/saved/toggle', {
    method: 'POST',
    locale: false,
    body: { job_id: jobId, action },
  });

  button.disabled = false;

  if (!result.ok) {
    // Put it back. Whatever the server refused, the row did not change, and a
    // control claiming otherwise is worse than one that did nothing.
    paint(button, action !== 'save');
    button.setAttribute('data-save-error', result.error?.message ?? '');
    return;
  }

  button.removeAttribute('data-save-error');
  refreshSaved();

  // Anything else on the page holding a saved list redraws from this rather
  // than polling. /account/saved is the page that cares.
  document.dispatchEvent(
    new CustomEvent('gftv:savechange', {
      detail: { jobId, saved: action === 'save' },
    })
  );

  // Every other control for the same posting on this page follows, so the card
  // and the posting page do not disagree when both are on screen.
  document
    .querySelectorAll(`[data-save-job="${cssEscape(jobId)}"]`)
    .forEach((other) => paint(other, action === 'save'));
}

/* -------------------------------------------------------------------------
 * Coming back from signing in
 * ---------------------------------------------------------------------- */

/**
 * Complete a save that was interrupted by the sign in prompt.
 *
 * Section 4: "If they clicked save rather than apply, complete the save on
 * return and say so." The saying so is the button itself, which comes back
 * filled in, plus a brief highlight so it is noticed on a board full of cards.
 */
function resumeAfterSignIn(root) {
  const intent = consumeIntent('save');
  if (!intent?.target) return;

  const button = root.querySelector(`[data-save-job="${cssEscape(intent.target)}"]`);
  if (!button) return;

  if (button.getAttribute('aria-pressed') === 'true') {
    // Already saved, from another tab or an earlier visit. Nothing to write,
    // and the control is already telling the truth.
    highlight(button);
    return;
  }

  toggle(button, intent.target, 'save').then(() => highlight(button));
}

function highlight(button) {
  button.setAttribute('data-highlight', 'true');
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Briefly. A permanent ring around a control is noise the second time
  // somebody looks at the page.
  setTimeout(() => button.removeAttribute('data-highlight'), 2600);
}

function cssEscape(value) {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/["\\]/g, '\\$&');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// The language change redraws the labels, which are written by JavaScript rather
// than carried on data-i18n attributes, because the word depends on the state as
// well as on the language.
document.addEventListener('gftv:localechange', () => {
  document
    .querySelectorAll('[data-save-job]')
    .forEach((button) => paint(button, button.getAttribute('aria-pressed') === 'true'));
});
