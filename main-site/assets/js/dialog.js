// A modal, built by JavaScript instead of written into a page.
//
// **One shell for every modal in the build.** The theme modal and the language
// modal in shell.js were written into the DOM by that file and wired there,
// with their own copy of the trap, the Escape handler and the scroll lock;
// phase 12 part 6 moved both onto this, so there is one implementation rather
// than two that agreed today. The modals phase 4 added — a sign in prompt, a
// translation report form — appear only when somebody asks for them, on
// whichever page they were standing on, and were always built here.
//
// **It is a native `<dialog>` since part 6, and that is the whole point of the
// change.** `showModal()` gives four things a hand-rolled modal cannot, and
// three of them were being hand-rolled here badly enough to matter:
//
//   - **The page behind it becomes inert.** Not hidden, not covered: inert, so
//     nothing behind the modal is focusable *or in the accessibility tree*.
//     Part 2's lesson arriving from the other direction — `inert` is the other
//     way of not being there — and the old shell did neither. A screen reader
//     could read the whole page under an open dialog.
//   - **Escape is the browser's.** So is the focus trap, so `trapFocus` and the
//     document level keydown listener are both gone. The old trap filtered on
//     `offsetParent !== null`, which is not the same question as "can this take
//     focus", and it only fired for Tab from the first or last item.
//   - **The top layer**, so `z-index: 100` no longer has to out-rank whatever a
//     page put above it.
//   - **One source of truth for open.** `[open]` is the element's own state,
//     written by the browser. The `.hidden` class it replaces was a second
//     copy of that fact maintained by hand.
//
// **And the fade this file's CSS has always described now actually runs.**
// `.hidden` is `display: none !important` in theme.css, which beat
// `.modal-backdrop.hidden`'s opacity and transform transitions from the day
// both were written: every modal in the build has appeared and disappeared
// instantly for eleven phases while the stylesheet said 220ms. The closed state
// is `:not([open])` now, and theme.css carries the `@starting-style` and
// `allow-discrete` that make a discrete display change animate.
//
// The caller's API is unchanged: `{ element, panel, open, close, isOpen }`.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

/**
 * Build a modal and put it on the page, closed.
 *
 * The caller owns the content and its wiring. This owns the shell, the
 * behaviour, and nothing else.
 *
 * @param {{ id: string, titleKey: string, bodyHtml: string, className?: string }} options
 * @returns {{ element: HTMLDialogElement, panel: HTMLElement, open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function createDialog(options) {
  // Several pages rebuild their dialog on every open — the applicant detail,
  // the tag editor — so this replaces one that may still be showing. Closed
  // before it is removed: a modal dialog taken out of the document without it
  // leaves the top layer's bookkeeping behind, and the page stays inert with
  // nothing on screen to say why.
  const existing = document.querySelector(`#${options.id}`);
  if (existing) {
    if (existing.tagName === 'DIALOG' && existing.open) existing.close();
    existing.remove();
  }

  const wrap = document.createElement('dialog');
  wrap.className = `modal-backdrop${options.className ? ` ${options.className}` : ''}`;
  wrap.id = options.id;

  // The name and the modal semantics belong to the dialog element, which is
  // where a browser already puts role="dialog" and aria-modal="true" of its
  // own accord. Writing either onto the panel inside it would nest a second
  // dialog in the first, which is why the panel is now plain markup.
  wrap.setAttribute('aria-labelledby', `${options.id}Title`);

  wrap.innerHTML = `
    <div class="modal glass-card">
      <div class="modal-head">
        <h2 id="${options.id}Title" data-i18n="${options.titleKey}"></h2>
        <button class="icon-btn small" type="button" data-close-dialog
                data-i18n-attr="aria-label:common.close">
          <span data-icon="close" data-icon-size="18"></span>
        </button>
      </div>
      ${options.bodyHtml}
    </div>
  `;

  document.body.append(wrap);

  const panel = wrap.querySelector('.modal');

  // The heading and the close control carry data-i18n keys that were never in
  // the document when the language was applied, so they need one pass of their
  // own. Later language changes reach them through the ordinary retranslation,
  // and the caller redraws its own content.
  translateWithin(wrap);
  hydrateIcons(wrap);

  let lastFocus = null;

  function isOpen() {
    return wrap.open;
  }

  function open() {
    if (isOpen()) return;
    // A modal that is opened, closed and opened again is the same element, so
    // whatever the last run failed on is still sitting in its message line.
    clearDialogMessage(panel);
    // Remembered rather than left to the browser's own restoration, which is
    // the same behaviour but is not something every engine has always done.
    lastFocus = document.activeElement;
    wrap.showModal();
    document.body.setAttribute('data-scroll-locked', 'true');
    // showModal() focuses the first focusable thing itself, which is the close
    // control. A form wants its first field instead, and says so.
    panel.querySelector('[data-autofocus]')?.focus();
  }

  function close() {
    if (!isOpen()) return;
    wrap.close();
  }

  // Both ways out land here: close(), the close control, the backdrop, and
  // Escape, which the browser handles without asking this file.
  wrap.addEventListener('close', () => {
    clearDialogMessage(panel);
    document.body.setAttribute('data-scroll-locked', 'false');
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  });

  wrap.addEventListener('click', (event) => {
    // Backdrop click closes, same as every other modal on the site. The dialog
    // element *is* the backdrop here — it fills the viewport and paints the
    // dim itself — so a click landing on it rather than on the panel is a
    // click outside.
    if (event.target === wrap) close();
    if (event.target.closest('[data-close-dialog]')) close();
  });

  return { element: wrap, panel, open, close, isOpen };
}

/* -------------------------------------------------------------------------
 * The message line a modal shows instead of the page's
 * ---------------------------------------------------------------------- */

/**
 * The panel of the modal that is on top, or null when none is open.
 *
 * Every modal in the build is a native `<dialog>` opened with `showModal()` —
 * the ones this file builds, the confirmations in danger-confirm.js, the
 * recovery code panel — so `dialog[open]` is the whole set. Document order is
 * open order, because each of them appends itself to the body as it opens, so
 * the last match is the one on top of the stack: the confirmation opened from
 * an applicant detail panel, and not the panel underneath it.
 */
function topDialogPanel() {
  const open = document.querySelectorAll('dialog[open]');
  const top = open[open.length - 1];
  if (!top) return null;
  return top.querySelector('.modal') ?? top;
}

/**
 * Say something inside the open modal, if one is open.
 *
 * **The bug this exists for.** A page level message bar — `#adminMessage`,
 * `#accountMessage` — is in the document, and the document is inert and behind
 * the dim while a modal dialog is showing. So "give this a title first" or "that
 * save failed" was being written to a line nobody standing in the modal could
 * see: the button appeared to do nothing, which is exactly the failure
 * `runAction` was written to stop happening. The modal is where the person is,
 * so the modal is where the answer goes.
 *
 * The line is built on demand rather than baked into the shell, because a page
 * is free to redraw the panel's contents between opens and a holder that was
 * put there at build time would go with it. It sits directly under the heading,
 * above whatever the caller drew, and scrolls itself into view: `.modal` is the
 * scroll container, and a long form can easily have its top off screen by the
 * time somebody reaches the save button.
 *
 * @param {{ tone: string, role: string, text: string }} message
 *   tone is the callout class — note, warn, danger, ok.
 * @returns {boolean} whether a modal took it, so a caller can fall back to the
 *   page's own bar when nothing is open.
 */
export function messageInOpenDialog({ tone, role, text }) {
  const panel = topDialogPanel();
  if (!panel) return false;

  let holder = panel.querySelector('[data-dialog-message]');
  if (!holder) {
    holder = document.createElement('div');
    holder.setAttribute('data-dialog-message', '');
    const head = panel.querySelector('.modal-head');
    if (head) head.after(holder);
    else panel.prepend(holder);
  }

  holder.className = `callout ${tone} modal-message`;
  holder.setAttribute('role', role);
  holder.textContent = text;
  holder.hidden = false;
  holder.scrollIntoView({ block: 'nearest' });

  return true;
}

/**
 * Take the message line back down.
 *
 * @param {ParentNode|null} [panel] the panel to clear. The open modal's own by
 *   default, which is the one a caller clearing up after itself means; a
 *   document wide lookup would find the first holder in the body instead,
 *   inside whichever closed dialog happens to be earliest.
 */
export function clearDialogMessage(panel = topDialogPanel()) {
  const holder = panel?.querySelector('[data-dialog-message]');
  if (holder) holder.hidden = true;
}

/**
 * Apply the dictionary to a subtree that was added after the language was.
 * The same three attributes translateDom handles, over one root.
 */
export function translateWithin(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr')
      .split(',')
      .forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
  });
}
