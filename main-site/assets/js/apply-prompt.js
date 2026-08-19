// The prompt that follows an applicant around, from 7c's "Resuming a pending
// prompt".
//
// "A small shared script runs on every page of the portal. If an applicant
// session exists, it calls that endpoint once per page load and opens the modal
// if anything comes back." This is that script, imported by shell.js so it is
// on every page without any page having to remember it.
//
// Why it exists at all, rather than the job page simply reopening its own
// modal: the applicant may come back on a different device, or with the browser
// cleared, or on a page that is not the posting. The prompt is state, not a
// page, so the server has to be the one that knows.
//
// Five rules, four of which are about not being annoying:
//
//   **The check runs on every page. The modal opens once a visit.** 7c says
//   both of these and they are easy to read as one thing: the script "calls
//   that endpoint once per page load and opens the modal if anything comes
//   back", and, a few lines later, "the modal reopens on their next visit, so
//   nothing is lost by closing it." A *visit*, not a page load. Opening on
//   every page load is the literal reading of the first sentence and it makes
//   the second one untrue: somebody who closes the modal and then reads four
//   postings gets it thrown at them five times, which is nagging, and 7c is
//   explicit that this is "a light tap on the shoulder, not an ambush".
//
//   So the check stays on every page, because that is what finds the prompt
//   wherever the applicant happens to be, and SHOWN below stops it opening a
//   second time in the same tab session. Their next visit asks again.
//
//   **The server is the source of truth.** localStorage holds the same row id
//   purely as a fast path. Treat it as a cache that can be wrong: if the server
//   says nothing is pending, clear it and show nothing.
//
//   **Only ever one at a time.** If several prompts are pending, take the most
//   recent and leave the rest for a later visit.
//
//   **Nothing is gated on answering.** Asking again is about recovering a
//   possible Yes, not about withholding anything, so a dismissal costs the
//   applicant nothing and the modal is as easy to leave as the theme picker.
//
//   **There is no route for it.** /jobs/{uuid}?prompt={id} is the only linkable
//   form, per 7c, and the parameter is stripped with history.replaceState once
//   the modal is open so it does not linger in a shared link.
//
// Where a dismissed prompt goes instead of coming back at you: the posting it
// belongs to replaces its Apply button with "You have an unanswered question
// about this application", which reopens it, and phase 6 builds
// /account/tasks, which 7g calls "the canonical place for it", with a count in
// the account navigation so it is discoverable without being pushed. Until
// that page exists the posting is the only standing affordance, and a visit
// that opens the modal once is what covers the gap.

import { api, applicantSession } from './api.js';

// The modal is imported on demand rather than at the top, and this is the one
// place in the build where that is worth doing. shell.js imports this file, so
// it is on every page of the portal: the login page, the status page, the 404.
// A static import would pull apply-dialog.js and its own three dependencies
// into all of them, and there is no bundler here, so each one is a request.
// Almost nobody has an outstanding prompt, and on the posting page, where the
// fast path below actually matters, apply.js has already imported the same
// module, so this resolves from cache and costs nothing.
let modal = null;

function loadModal() {
  if (!modal) modal = import('./apply-dialog.js');
  return modal;
}

// Alongside the theme, locale, and intent keys, in the same namespace, so
// everything this site stores in a browser is findable in one place.
const CACHE_KEY = 'gftv-careers.pendingPrompt';

// Which prompts this tab has already put on screen. sessionStorage rather than
// localStorage, deliberately: "next visit" is the unit 7c uses, and a new tab
// or a browser reopened tomorrow is a new visit. localStorage would mean a
// prompt dismissed once was never shown again on that device, which loses the
// recoverable Yes the whole mechanism exists for.
const SHOWN_KEY = 'gftv-careers.promptShown';

function alreadyShown(id) {
  try {
    return (JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') ?? []).includes(id);
  } catch {
    // Storage blocked. Falling back to showing it is the safe direction: the
    // prompt is easy to close and losing it is worse than seeing it twice.
    return false;
  }
}

function markShown(id) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') ?? [];
    if (!seen.includes(id)) seen.push(id);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify(seen.slice(-20)));
  } catch {
    // Nothing to do. Worst case it opens again on the next page.
  }
}

/** The posting this page is, or null if it is not a posting page. */
function currentJobId() {
  const match = window.location.pathname.match(
    /^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
  );
  return match ? match[1].toLowerCase() : null;
}

function readCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (!stored || typeof stored.id !== 'string' || typeof stored.jobId !== 'string') return null;
    return stored;
  } catch {
    return null;
  }
}

/**
 * Remember, or forget, the outstanding prompt.
 *
 * The title is stored in whichever language it was fetched in, which is a known
 * and accepted staleness: somebody who switches language between two page loads
 * sees the previous language's title for the moment before the server's answer
 * arrives. Not worth a second cache keyed by locale.
 */
function writeCache(prompt) {
  try {
    if (!prompt) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        id: prompt.id,
        jobId: prompt.job_id,
        title: prompt.job_title,
        rating: prompt.rating ?? null,
      })
    );
  } catch {
    // Storage blocked. The server check still works, so all that is lost is the
    // head start.
  }
}

/**
 * The analytics row id in ?prompt=, if there is one.
 *
 * Never trusted. It names a row, and the check that it belongs to this session
 * is that it appears in what the server sent back, which is scoped to the
 * session cookie and cannot be widened by a parameter.
 */
function linkedPromptId() {
  try {
    return new URL(window.location.href).searchParams.get('prompt');
  } catch {
    return null;
  }
}

function stripPromptParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('prompt')) return;
    url.searchParams.delete('prompt');
    const search = url.searchParams.toString();
    history.replaceState(
      history.state,
      '',
      `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
    );
  } catch {
    // Nothing to do. A parameter left in the address bar is untidy, not broken.
  }
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

export async function resumePendingPrompt() {
  const session = await applicantSession();
  if (!session?.user) {
    // Signed out. Anything cached belongs to somebody who has since signed out
    // of this browser, and leaving it would show them a prompt on their next
    // visit before the server had a chance to disagree.
    writeCache(null);
    return;
  }

  const jobId = currentJobId();
  const cached = readCache();

  // The fast path, and the one case 7c gives for it: the applicant just came
  // back to the posting they were handed over from, and the modal should be
  // there before a request resolves. Narrowed to that case on purpose. Opening
  // a modal about a different posting on the strength of a cache that might be
  // stale, and then closing it again a moment later, is worse than waiting.
  //
  // Started here and awaited below, so the pending request and the module
  // fetch run alongside each other rather than one after the other.
  const fastPath =
    jobId && cached && cached.jobId === jobId && !alreadyShown(cached.id)
      ? loadModal().then((dialog) => {
          if (dialog.applyDialogOpen()) return;
          markShown(cached.id);
          dialog.openApplyDialog({
            mode: 'resume',
            jobId: cached.jobId,
            jobTitle: cached.title ?? '',
            analyticsId: cached.id,
            rating: cached.rating ?? null,
          });
        })
      : null;

  const result = await api('/api/applications/pending');
  if (!result.ok) return;

  const prompts = result.data?.prompts ?? [];

  // Whatever the fast path decided has to have finished before the server's
  // answer is acted on, or the two race to open and close the same modal.
  if (fastPath) await fastPath;

  if (prompts.length === 0) {
    writeCache(null);
    // The cache was wrong and the modal it opened is about a row the server
    // says is answered. Close it rather than letting somebody answer a question
    // twice.
    if (cached) document.querySelector('#applyDialog')?.close();
    stripPromptParam();
    return;
  }

  // A deep link names one. Otherwise the most recent, and the rest wait for a
  // later page load.
  const linked = linkedPromptId();
  const chosen =
    (linked && prompts.find((prompt) => prompt.id === linked)) ??
    prompts.find((prompt) => prompt.job_id === jobId) ??
    prompts[0];

  writeCache(chosen);

  // A deep link is somebody deliberately asking for this prompt, from
  // /account/tasks in phase 6 or from a link they kept. That is a request, not
  // an interruption, so it opens whether or not this visit has already shown
  // it. Read before the parameter is stripped.
  const requested = linkedPromptId() === chosen.id;
  stripPromptParam();

  // Once a visit. The check above still ran, and the posting's own Apply slot
  // still shows the standing prompt, so nothing is lost by not opening here.
  if (!requested && alreadyShown(chosen.id)) return;

  const dialog = await loadModal();

  if (dialog.applyDialogOpen()) {
    // Already up from the fast path. Leave it alone when it is the same row:
    // all the server added is the title and the rating, and replacing a modal
    // somebody has started reading is worse than a missing star. The rating is
    // filled in in place instead, since an empty row of stars reads to somebody
    // who has already rated as though their rating had been lost.
    if (cached?.id === chosen.id) {
      dialog.updateApplyDialogRating(chosen.id, chosen.rating ?? null);
      return;
    }

    // A different row, so the cache was stale. Close the wrong one first, or
    // the reopen below is refused by the one-at-a-time rule.
    document.querySelector('#applyDialog')?.close();
  }

  markShown(chosen.id);
  dialog.openApplyDialog({
    mode: 'resume',
    jobId: chosen.job_id,
    jobTitle: chosen.job_title ?? '',
    analyticsId: chosen.id,
    rating: chosen.rating ?? null,
  });
}

// Answering clears the prompt this module is holding, whichever page it
// happened on.
document.addEventListener('gftv:applychange', () => writeCache(null));
