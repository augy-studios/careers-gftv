// The stack of bars at the top of the page, and the one rule all of them obey.
//
// Three things insert themselves above everything else in <body>: the
// connection bar in offline.js, the phase notice in build-status.js, and the
// header itself in shell.js. Until phase 12 each of them called
// `document.body.prepend` and then corrected for whichever of the others
// happened to be there already — offline.js carried the ordering as a comment
// about a file it does not import, and build-status.js carried the other half
// as `connection.after(bar)`. Two things doing one job is how the sentences
// drift apart, which is phase 10's rule, and this is the shape it takes when
// the job is an ordering.
//
// **And all three of them were prepending above the skip link.** Every page in
// the build writes `<a class="skip-link" href="#main">` as its first body
// child, which is the only place a skip link can be: the whole of what it does
// is to be the first thing Tab reaches. The header is built by JavaScript and
// prepended, so on every page the skip link ended up *after* the entire header
// — a keyboard reader tabbed through the notice, the brand, the theme button,
// the language button and the drawer toggle, and only then arrived at an offer
// to skip them. It was correct in the markup and wrong in the document, which
// is why reading the HTML would never have found it.
//
// Found by `tests/phase12-test.mjs --only=a11y` on 30 August 2026, on all seven
// public pages in both languages.
//
// So one function owns the stack. The order below is the order these sit in,
// top down, and the skip link is above all of it.

// Most urgent first. The connection state outranks the phase notice, which
// outranks the header, and nothing may reorder another entry by drawing later.
const ORDER = ['connection-notice', 'phase-notice', 'site-header'];

/**
 * Put a bar at the top of the body, in its place in the stack and below the
 * skip link.
 *
 * Safe to call again for an element already in the document: it moves rather
 * than duplicates, which is what a language change redrawing one bar needs.
 *
 * @param {HTMLElement} element
 * @param {'connection-notice'|'phase-notice'|'site-header'} kind
 */
export function insertTopBar(element, kind) {
  const rank = ORDER.indexOf(kind);
  if (rank === -1) throw new Error(`insertTopBar: unknown bar "${kind}"`);

  element.dataset.topBar = kind;

  // Only direct children of the body count. A `.phase-notice` rendered inside
  // some future panel is not part of this stack and must not move the header.
  const present = ORDER.map((name, index) => ({
    index,
    el: document.body.querySelector(`:scope > [data-top-bar="${name}"]`),
  })).filter((entry) => entry.el && entry.el !== element);

  const below = present.find((entry) => entry.index > rank);
  if (below) {
    below.el.before(element);
    return;
  }

  const above = [...present].reverse().find((entry) => entry.index < rank);
  if (above) {
    above.el.after(element);
    return;
  }

  // Nothing else in the stack yet. Below the skip link, which is the whole
  // point of this file, and at the top of the body when a page has none — the
  // server rendered posting page writes its own markup and is checked for the
  // skip link separately rather than being special cased here.
  const skip = document.body.querySelector(':scope > .skip-link');
  if (skip) skip.after(element);
  else document.body.prepend(element);
}
