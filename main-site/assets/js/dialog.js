// A modal, built by JavaScript rather than written into a page.
//
// The theme modal and the language modal in shell.js are written into the DOM
// by that file and wired there, because there is exactly one of each and they
// exist on every page. The modals this phase adds are different: a sign in
// prompt and a translation report form appear only when somebody asks for
// them, on whichever page they were standing on.
//
// So this is the same modal, in a function. Same markup, same .modal-backdrop
// and .modal classes, same CSS, and the same behaviour a reader has already
// learned from the theme picker: Escape closes it, the backdrop closes it,
// there is a close control in the corner, focus is trapped while it is open and
// goes back where it came from afterwards, and the page behind it does not
// scroll.
//
// Phase 12's polish pass should move shell.js's two modals onto this, so there
// is one implementation rather than two that agree today. That is a refactor of
// working code and did not belong in the same change as the page it was written
// for.

import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Build a modal and put it on the page, closed.
 *
 * The caller owns the content and its wiring. This owns the shell, the
 * behaviour, and nothing else.
 *
 * @param {{ id: string, titleKey: string, bodyHtml: string, className?: string }} options
 * @returns {{ element: HTMLElement, panel: HTMLElement, open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function createDialog(options) {
  const existing = document.querySelector(`#${options.id}`);
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.className = `modal-backdrop hidden${options.className ? ` ${options.className}` : ''}`;
  wrap.id = options.id;
  wrap.innerHTML = `
    <div class="modal glass-card" role="dialog" aria-modal="true"
         aria-labelledby="${options.id}Title">
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
    return !wrap.classList.contains('hidden');
  }

  function open() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    wrap.classList.remove('hidden');
    document.body.setAttribute('data-scroll-locked', 'true');
    // The first thing inside the panel, which is the close control, unless the
    // caller has marked something better. A form wants its first field.
    const target = panel.querySelector('[data-autofocus]') ?? panel.querySelector(FOCUSABLE);
    target?.focus();
  }

  function close() {
    if (!isOpen()) return;
    wrap.classList.add('hidden');
    document.body.setAttribute('data-scroll-locked', 'false');
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  wrap.addEventListener('click', (event) => {
    // Backdrop click closes, same as every other modal on the site.
    if (event.target === wrap) close();
    if (event.target.closest('[data-close-dialog]')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapFocus(panel, event);
    }
  });

  return { element: wrap, panel, open, close, isOpen };
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

function trapFocus(panel, event) {
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
