// The Apply control on a posting, and everything that decides what it says.
//
// Sections 7a, 7c, and 7f, plus section 4's rules about a logged out visitor
// and about coming back from signing in. The modal itself is apply-dialog.js;
// this is the button in front of it.
//
// One posting can be in seven states, and the button is a different thing in
// each one. They are resolved in this order, because more than one can be true
// at once and the reader needs the most specific answer:
//
//   accepted   they have the role. Added 21 August 2026 with the accept and
//              reject rules in 8.3, and it is first because it is the only one
//              that never ends: accepting closes the posting to that applicant
//              for good, per 7f. **It must never render as a date.** A date
//              invites somebody to come back for a role they already have.
//   pending    an unanswered prompt from a previous handoff. 7c: the Apply
//              button is replaced by a prompt that reopens the modal, so a
//              second handoff cannot stack on an unresolved one.
//   cooldown   applied recently. 7f: "Applied on 4 March. You can apply again
//              from 4 June."
//   closed     the posting is not published, or is past its closing date. A
//              null closes_at never expires.
//   paused     the global applications toggle is off, per 8.10.
//   applied    applied, but the cooldown is switched off site wide, so they
//              may apply again. The button stays live with a quiet note.
//   open       the ordinary case.
//
// **A logged out visitor gets the ordinary case**, per section 4: "show a
// control that reads as an apply action, not as a wall". The state above is
// per applicant and there is no applicant, so there is nothing to resolve. The
// click opens the sign in prompt, and the real answer arrives when they return.
//
// **Nothing here is the enforcement.** api/applications/start.js checks the
// session, the posting, the toggle, the cooldown, and the pending prompt on
// every call. This decides what to draw, and the two agree because both read
// the same rules from the same place.

import { t } from './i18n.js';
import { api, applicantSession } from './api.js';
import { formatDate } from './format.js';
import { iconMarkup, hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import { openSignInPrompt, consumeIntent } from './signin-prompt.js';
import { openApplyDialog, applyDialogOpen } from './apply-dialog.js';
import { loadBuildStatus, applyFeatureGating } from './build-status.js';

let posting = null;

// The applicant's state for this posting, once. Held across redraws so a
// language change costs no request, and refreshed only when something actually
// changes it.
let applicationState = null;
let statePromise = null;

// Tri-state, and the third value is the reason it is not a boolean. Whether
// somebody is signed in has to be answerable *synchronously* by the time they
// click, because 7c requires the modal to open in the same tick as the click
// and an await before showModal is exactly what breaks it. Until the session
// check lands the honest answer is "not known yet", and the click handler takes
// the slow path for it rather than guessing.
let signedIn = null;

// Whether the applicant answered No in the modal on this visit. Not read back
// from the server, and it deliberately does not survive a reload: the tracking
// row for a No is identical to one for a handoff nobody answered, which is the
// point of 7c's "no answer means no", so there is nothing to read.
let saidNo = false;

/**
 * Wire the Apply control for a posting. Called after every draw of the page,
 * because a language change replaces the elements this wired.
 *
 * @param {{ id: string, title: string, isOpen: boolean, isArchived: boolean,
 *           applicationsOpen: boolean }} job
 */
export function mountApply(job) {
  posting = job;

  const slot = document.querySelector('#applySlot');
  if (!slot) return;

  paint(slot);

  // Resolved once per page load. The first paint is the signed out answer,
  // which is right for most readers and is corrected in place for the rest;
  // holding the button back until a request lands would delay the common case
  // to tidy up the rare one.
  loadState().then(() => {
    const current = document.querySelector('#applySlot');
    if (current) paint(current);
    resumeAfterSignIn();
  });
}

/* -------------------------------------------------------------------------
 * State
 * ---------------------------------------------------------------------- */

function loadState({ refresh = false } = {}) {
  if (refresh) statePromise = null;
  if (statePromise) return statePromise;

  statePromise = applicantSession()
    .then((session) => {
      signedIn = Boolean(session?.user);
      if (!signedIn) return null;
      return api(`/api/applications/mine?job_id=${encodeURIComponent(posting.id)}`, {
        locale: false,
      });
    })
    .then((result) => {
      applicationState = result?.ok ? (result.data.applications?.[0] ?? null) : null;
      return applicationState;
    });

  return statePromise;
}

/** Which of the seven states this posting is in for this reader. */
function currentState() {
  // Before the cooldown, and before everything else about the posting: somebody
  // who has been accepted is not waiting for anything and should not be told a
  // date, per 8.3.
  if (applicationState?.status === 'accepted') return 'accepted';
  if (applicationState?.pending_id) return 'pending';
  if (applicationState?.in_cooldown) return 'cooldown';
  if (posting.isArchived || !posting.isOpen) return 'closed';
  if (!posting.applicationsOpen) return 'paused';
  if (applicationState?.applied_at) return 'applied';
  return 'open';
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function paint(slot) {
  const state = currentState();
  slot.setAttribute('data-apply-state', state);

  if (state === 'accepted') {
    // A panel, like the cooldown, and for the same two reasons: the sentence is
    // longer than a control should carry, and a disabled button is dropped from
    // the accessibility tree in some browsers, which would hide the only
    // explanation on the page from the readers who most need it.
    //
    // No date anywhere in it. This state does not end.
    slot.innerHTML = `
      <p class="apply-state-panel apply-accepted" role="status">
        ${iconMarkup('check', { size: 18 })}
        <span>${escapeHtml(t('apply.acceptedSentence'))}</span>
      </p>`;
    hydrateIcons(slot);
    return;
  }

  if (state === 'pending') {
    slot.innerHTML = `
      <button type="button" class="btn btn-primary" id="applyButton">
        ${escapeHtml(t('apply.pendingButton'))}
      </button>
      <p class="apply-note">${escapeHtml(t('apply.pendingNote'))}</p>`;
    slot.querySelector('#applyButton').addEventListener('click', reopenPrompt);
    return;
  }

  if (state === 'cooldown') {
    // 7f asks for a disabled state carrying the whole sentence. It is rendered
    // as a panel rather than as a disabled <button> for two reasons: the
    // sentence is two clauses long and reads badly inside a control, and a
    // disabled button is dropped from the accessibility tree in some browsers,
    // which would hide the only explanation on the page.
    slot.innerHTML = `
      <p class="apply-state-panel" role="status">
        ${iconMarkup('check', { size: 18 })}
        <span>${escapeHtml(cooldownSentence())}</span>
      </p>`;
    hydrateIcons(slot);
    return;
  }

  if (state === 'closed' || state === 'paused') {
    slot.innerHTML = `
      <button type="button" class="btn btn-primary" id="applyButton" disabled
              aria-disabled="true">
        ${escapeHtml(t('job.apply'))}
      </button>
      <p class="apply-note">${escapeHtml(
        t(state === 'paused' ? 'apply.pausedNote' : 'apply.closedNote')
      )}</p>`;
    return;
  }

  // open, and applied-with-the-cooldown-off, which is the same button with a
  // line above it saying when they last applied.
  //
  // saidNo is 7c's "offers a line to reopen the form", after an explicit No.
  // The button is the way back in, since a second handoff is a second row and
  // there is nothing to reopen that is not simply applying again, so the line
  // says what state they are in rather than pretending to be a different
  // control.
  slot.innerHTML = `
    ${
      state === 'applied'
        ? `<p class="apply-note">${escapeHtml(
            t('apply.appliedOn', { date: formatDate(applicationState.applied_at) })
          )}</p>`
        : saidNo
          ? `<p class="apply-note">${escapeHtml(t('apply.notAppliedNote'))}</p>`
          : ''
    }
    <button type="button" class="btn btn-primary" id="applyButton" data-feature="apply">
      ${escapeHtml(t('job.apply'))}
    </button>
    <p class="apply-note apply-confirmation" id="applyConfirmation" role="status" hidden></p>`;

  slot.querySelector('#applyButton').addEventListener('click', onApplyClick);

  // The button this branch draws is the only one carrying data-feature, and it
  // was created after the page's own gating pass ran. Section 0c's disabled
  // state has to reach it too, or the Apply button would be live while phase 5
  // was still marked as building.
  loadBuildStatus().then((status) => applyFeatureGating(status, slot));
}

function cooldownSentence() {
  const applied = applicationState.applied_at;
  const until = applicationState.cooldown_until;

  if (!applied) return t('apply.cooldownUntil', { until: formatDate(until) });

  return t('apply.cooldownSentence', {
    applied: formatDate(applied),
    until: formatDate(until),
  });
}

/* -------------------------------------------------------------------------
 * Clicking
 * ---------------------------------------------------------------------- */

/**
 * Apply.
 *
 * The order in here is 7c's and is the part that must not be rearranged: the
 * modal goes up first, in this tick, and the network call is handed to it as a
 * promise. Nothing is awaited before showModal.
 *
 * **The start call is not prefetched on hover**, which is a deliberate
 * departure from 7c step 2. That step reads as though prefetching the form URL
 * were free, and it is not: api/applications/start is the endpoint that writes
 * the gftvjobs_analytics row, so calling it on mouseenter would log an apply
 * click for a hover, put a pending prompt in front of somebody who never
 * clicked anything, and make the phase 8 funnel meaningless. Splitting it into
 * a prefetchable read and a click time write would be two round trips to save
 * nothing, because 7c step 3 already holds the tab back for 800ms and the start
 * call lands well inside that window.
 */
function onApplyClick(event) {
  const button = event.currentTarget;

  if (signedIn === true) return handOff(button);

  if (signedIn === false) {
    // Section 4: the control reads as the action, and the wall is one line in a
    // prompt with two equal ways past it.
    return promptToSignIn();
  }

  // The session check has not landed yet, which takes a click inside the first
  // moment of the page. Nothing can be done synchronously here, so the modal
  // opens a beat late and 7c step 5's blocked tab handling covers the rest.
  loadState().then(() => (signedIn ? handOff(button) : promptToSignIn()));
}

function promptToSignIn() {
  openSignInPrompt({ intent: 'apply', messageKey: 'apply.needAccount' });
}

async function handOff(button) {
  button.disabled = true;

  // Fired first and passed in unresolved, so the modal is on screen while it is
  // still in flight.
  const ready = start();

  openApplyDialog({
    mode: 'handoff',
    jobId: posting.id,
    jobTitle: posting.title,
    ready,
  });

  await ready;
  button.disabled = false;
}

/**
 * The start call, reshaped into what the modal needs.
 *
 * Every refusal comes back as ok:false with a sentence, because from the
 * modal's point of view "the cooldown says no" and "the network is down" are
 * the same kind of event: there is no form to open and something has to be said.
 */
async function start() {
  const result = await api('/api/applications/start', {
    method: 'POST',
    body: { job_id: posting.id },
  });

  if (result.ok) {
    return { ok: true, analyticsId: result.data.analytics_id, formUrl: result.data.form_url };
  }

  // A refusal names its reason, and the client has its own wording for each so
  // the sentence is in the reader's language rather than the API's English.
  const reason = result.error?.details?.reason;
  const key = reason ? `apply.refused_${reason}` : null;
  const translated = key ? t(key) : null;

  // Whatever the refusal was, the button was drawn from state that is now known
  // to be stale. Refresh it, so the page stops offering something the server
  // has just declined.
  loadState({ refresh: true }).then(() => {
    const slot = document.querySelector('#applySlot');
    if (slot) paint(slot);
  });

  return {
    ok: false,
    message: translated && translated !== key ? translated : result.error?.message,
  };
}

/** Reopen the modal for a prompt that is still unanswered. */
function reopenPrompt() {
  if (applyDialogOpen()) return;

  openApplyDialog({
    mode: 'resume',
    jobId: posting.id,
    jobTitle: posting.title,
    analyticsId: applicationState.pending_id,
    rating: applicationState.rating ?? null,
  });
}

/* -------------------------------------------------------------------------
 * Coming back from signing in
 * ---------------------------------------------------------------------- */

/**
 * Section 4, and the part of it that is a rule rather than a nicety: "do not
 * auto-start the handoff. There is no user gesture behind a post-login
 * redirect, so the new tab would be blocked and the modal would appear out of
 * nowhere. Land them on the posting with the Apply button now active, scrolled
 * into view and briefly highlighted, and a short confirmation line."
 *
 * The next click is theirs.
 */
function resumeAfterSignIn() {
  if (!consumeIntent('apply')) return;

  const slot = document.querySelector('#applySlot');
  const button = slot?.querySelector('#applyButton');
  if (!slot || !button) return;

  const confirmation = slot.querySelector('#applyConfirmation');
  if (confirmation) {
    confirmation.textContent = t('apply.signedInNow');
    confirmation.hidden = false;
  }

  slot.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Briefly, and only briefly. A permanent ring around a control is noise the
  // second time somebody looks at the page.
  slot.setAttribute('data-highlight', 'true');
  setTimeout(() => slot.removeAttribute('data-highlight'), 2600);
}

/* -------------------------------------------------------------------------
 * Staying in step
 * ---------------------------------------------------------------------- */

// Answering in the modal changes what the button should say, and the modal has
// no idea which page it is standing on. It says what happened and this redraws.
document.addEventListener('gftv:applychange', (event) => {
  if (!posting || event.detail?.jobId !== posting.id) return;

  applicationState = event.detail.application ?? applicationState;
  if (applicationState) applicationState.pending_id = null;
  saidNo = event.detail.didApply !== true;

  const slot = document.querySelector('#applySlot');
  if (slot) paint(slot);
});
