// The sign in prompt, and the intent that survives it.
//
// Section 4, on what a logged out visitor sees: in place of the control, show
// something that reads as the action, not as a wall, and open "a small
// sign in prompt explaining in one line that applications need an account, with
// two equal options, log in and create an account, and a note that registration
// takes a moment and needs no approval". Saving a job gets the same treatment,
// "and so does anything else that writes against an account", which is what
// brings the translation report control here.
//
// Two rules from that section shape this file, and both are easy to lose:
//
//   1. **Two equal options.** Log in and create an account are the same size
//      and the same weight. Somebody who has never been here before is not a
//      lesser case than somebody returning, and styling one as the obvious
//      choice guesses wrong half the time.
//   2. **Intent survives the round trip.** "If they clicked save rather than
//      apply, complete the save on return and say so." The intent is stored
//      against the path it was formed on, carried through login and
//      registration by the ?redirect= that api/_lib/redirects.js validates, and
//      picked up again by whatever page they land back on.
//
// The one thing this does not do is auto-start anything on return, and section
// 4 is explicit about why for the apply flow: there is no user gesture behind a
// post-login redirect, so a new tab would be blocked and a modal would appear
// out of nowhere. Reopening a form the reader deliberately opened before they
// were interrupted is the gentler case, so the report intent does reopen its
// own dialog; nothing that opens a tab or writes a row may.

import { t } from './i18n.js';
import { createDialog } from './dialog.js';

// Kept alongside the theme and locale keys, in the same namespace, so
// everything this site stores in a browser is findable in one place.
const INTENT_KEY = 'gftv-careers.intent';

/**
 * Remember what somebody was trying to do before they were sent to sign in.
 *
 * sessionStorage over localStorage. An intent is about this tab and this
 * moment, and one left in localStorage would fire again next week on a posting
 * the reader had forgotten about.
 *
 * @param {string} intent a short verb, for example 'report'
 * @param {string|null} [target] what the verb was aimed at, where the path does
 *        not already say. Apply and report are always about the posting being
 *        read, so they need none; saving is offered from the board, where one
 *        page carries twenty cards and "save" on its own names nothing.
 */
export function rememberIntent(intent, target = null) {
  try {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ intent, target, path: window.location.pathname })
    );
  } catch {
    // Storage blocked. The sign in still works; only the resumption is lost.
  }
}

/**
 * Take back an intent formed on this page, if there is one.
 *
 * Consumed on read, so a reload does not reopen the dialog a second time. The
 * path is checked because a reader may have signed in from one posting and
 * navigated to another before the page that cares about it ran.
 *
 * @param {string} [expected] only return this intent
 * @returns {{ intent: string, target: string|null }|null}
 */
export function consumeIntent(expected) {
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  if (!stored || typeof stored.intent !== 'string') return null;
  if (stored.path !== window.location.pathname) return null;
  if (expected && stored.intent !== expected) return null;

  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // Nothing to do. Worst case it is offered once more.
  }

  return { intent: stored.intent, target: typeof stored.target === 'string' ? stored.target : null };
}

/**
 * Where to come back to. The full address of this page, so the filters on a
 * board or the anchor on a posting survive the trip.
 *
 * api/_lib/redirects.js validates this on the way back in, and only ever
 * accepts a relative path on this origin, so nothing here has to be trusted.
 */
function returnTo() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

let dialog = null;

/**
 * Open the prompt.
 *
 * @param {{ intent: string, messageKey: string, target?: string|null }} options
 *        messageKey is the one line explaining why this particular action needs
 *        an account. It is passed in instead of fixed here, because "you need
 *        an account to apply" and "you need an account so we can come back to
 *        you about a translation" are different sentences and a generic one
 *        would answer neither.
 */
export function openSignInPrompt(options) {
  rememberIntent(options.intent, options.target ?? null);

  const redirect = encodeURIComponent(returnTo());

  if (!dialog) {
    dialog = createDialog({
      id: 'signInPrompt',
      titleKey: 'signin.title',
      className: 'signin-prompt',
      bodyHtml: `
        <p class="signin-message" id="signInMessage"></p>
        <div class="signin-actions">
          <a class="btn btn-primary" id="signInLogin" data-i18n="signin.logIn"></a>
          <a class="btn btn-primary" id="signInRegister" data-i18n="signin.createAccount"></a>
        </div>
        <p class="signin-note" data-i18n="signin.note"></p>
      `,
    });
  }

  // Rewritten every time it opens and not once when it is built, so the
  // sentence follows the language and the redirect follows the page.
  //
  // The key is written onto the element as well as resolved. The dialog lives
  // in the document, so shell.js's translateDom reaches it on a language
  // change, but only through an attribute: a string set as textContent alone
  // would stay in the language the prompt was opened in.
  const message = dialog.panel.querySelector('#signInMessage');
  message.setAttribute('data-i18n', options.messageKey);
  message.textContent = t(options.messageKey);
  dialog.panel.querySelector('#signInLogin').href = `/login?redirect=${redirect}`;
  dialog.panel.querySelector('#signInRegister').href = `/register?redirect=${redirect}`;

  dialog.open();
}
