// Inline SVG icons.
//
// gftv-theme.md: no emoji as icons, inline SVG coloured with currentColor. The
// stroke properties are set once on svg in theme.css, so the paths here carry
// geometry only.
//
// Usage in markup:
//   <span data-icon="close"></span>
// then call hydrateIcons() once, or let shell.js do it. Icons added to the DOM
// later are hydrated by passing the new subtree to hydrateIcons(root).
//
// Every icon is a 24 by 24 viewBox. Keep them that way so sizing is one CSS
// rule instead of a per icon adjustment.

const PATHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  palette:
    '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3z"/>' +
    '<circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="13" rx="2"/>' +
    '<path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  // Hammer. Used by the Build status navigation item, the "Being built now"
  // status pill on /status, and the placeholder page eyebrow. All three read
  // from this one entry, so they cannot drift apart.
  // The head is a rectangle rotated to sit square on the handle, drawn as an
  // explicit quad and not with a transform so it scales with the viewBox.
  build:
    '<path d="M14.8 2.6 L20.4 8.2 L17.2 11.4 L11.6 5.8 Z"/>' +
    '<path d="M14.4 8.6 L4 19"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  // Globe, for the language switcher. A globe is read as "language" across
  // scripts, which a text label cannot be: a reader who cannot read the
  // interface language is exactly the person who needs to find this control.
  globe:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18"/>' +
    '<path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  // Phase 2, the authentication pages.
  //
  // The eye is the show and hide control on a password field. There is one
  // shape in place of an eye and a crossed out eye, because the button carries
  // aria-pressed and a visible label change already, and two shapes that
  // differ by a single stroke read as noise at 18 pixels.
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
    '<path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/>',
  // A key, for recovery and backup codes. Both sets use it, and the page copy
  // is what distinguishes them, since 5c is emphatic that they are not
  // interchangeable and an icon cannot carry that.
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15.5 12v2.5"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  // Phase 3, the job board.
  //
  // A pin, not the globe, for a posting's location. The globe already
  // means "language" everywhere else on this site, and one shape cannot carry
  // two meanings on the same page.
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  // Funnel, for the filter panel button.
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  tag: '<path d="M3 12.5V4a1 1 0 0 1 1-1h8.5L21 11.5 12.5 20z"/><circle cx="7.5" cy="7.5" r="1.25"/>',
  chevronDown: '<path d="M5 9l7 7 7-7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  // Two arrows, for the sort control.
  sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>',
  // Phase 4, the posting page.
  //
  // Two people, for the number of openings on a posting. Not the briefcase,
  // which already means "department" on the same list of facts, and one shape
  // cannot carry two meanings on the same page.
  users:
    '<circle cx="9" cy="8" r="3.5"/>' +
    '<path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>' +
    '<path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M17.5 14.4a6.5 6.5 0 0 1 4 5.6"/>',
  // A calendar, for the posted and closing dates. The clock is the commitment,
  // which is a duration, not a date, and the two sit next to each other.
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/>' +
    '<path d="M3.5 10h17M8 3v4M16 3v4"/>',
  // The rating star, from the handoff modal in 7c. The only icon in this set
  // that is ever filled instead of stroked: an empty star and a chosen star
  // have to differ at a glance across a row of five, and a stroke weight change
  // does not carry that at 28px on a phone. app.css sets the fill on the
  // chosen ones and leaves the rest as outlines.
  star:
    '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z"/>',
  // Four panes. The dashboard glyph, for the staff link in the header. The
  // hammer would read better as "tools" but it is already the Build status
  // item, and two hammers in one menu is worse than a duller icon.
  grid:
    '<rect x="4" y="4" width="7" height="7" rx="1.5"/>' +
    '<rect x="13" y="4" width="7" height="7" rx="1.5"/>' +
    '<rect x="4" y="13" width="7" height="7" rx="1.5"/>' +
    '<rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  // Phase 6, the account area.
  //
  // A bookmark, for saving a posting. The second icon in this set that is ever
  // filled, not stroked, and for the same reason as the star: saved and
  // not saved have to differ at a glance on a card, and a stroke weight change
  // does not carry that. app.css fills it when the control is pressed.
  //
  // Not the star, which already means "how well was this posting written" in
  // the handoff modal. One shape cannot carry two meanings on one site.
  bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1z"/>',
  // A person, for account settings. The two person glyph above is "openings" on
  // a posting, and this is deliberately the single figure so the two do not read
  // as the same thing at 18px.
  user: '<circle cx="12" cy="8" r="3.75"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  // Phase 7, the dashboard. Everything below is sidebar or toolbar furniture:
  // small, stroked, and deliberately dull, because a dashboard is read and
  // not looked at, and a screen of expressive icons is harder to scan.
  //
  // Bars over a line, for analytics. A line chart at 18px is a squiggle;
  // three bars stay legible and say "counts", not "trend", which is what
  // 8.4's funnel actually is.
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/>' +
    '<rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  // A slider in place of a cog. The cog is what "build" already implies in this
  // set, and settings here are values somebody adjusts, not machinery.
  settings:
    '<path d="M4 8h10M18 8h2M4 16h4M12 16h8"/>' +
    '<circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/>' +
    '<path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  // Two rows of grip dots, the ordinary handle for a draggable row. Reordering
  // is also possible from the keyboard everywhere it appears, per the phase 12
  // pass this set is written to survive.
  drag: '<circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="9" cy="12" r="1.2"/>' +
    '<circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  // Phase 10, section 14.
  //
  // The globe again, struck through. Being offline is a state of the network
  // and not a fault, so it is deliberately not the warning triangle: the
  // fallback page and the banner both say something true and unalarming, and
  // an icon that shouts would be the loudest thing on either.
  // The meridian the language globe carries is dropped here on purpose. Three
  // strokes inside the circle plus a diagonal is a smudge at 16 pixels, which
  // is the size it is used at, and the strike is the part that has to survive.
  offline:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18"/>' +
    '<path d="M3 21 21 3"/>',
};

// A few names read better in markup with a hyphen.
const ALIASES = {
  'chevron-right': 'chevronRight',
  'chevron-down': 'chevronDown',
  'chevron-left': 'chevronLeft',
  'arrow-left': 'arrowLeft',
};

/**
 * Build one icon element.
 * @param {string} name
 * @param {{ size?: number, label?: string }} [options] label makes the icon
 *        meaningful to a screen reader. Leave it off for decoration, which is
 *        the usual case since the icon sits next to real text.
 * @returns {SVGElement|null}
 */
export function icon(name, options = {}) {
  const key = ALIASES[name] ?? name;
  const path = PATHS[key];
  if (!path) {
    console.warn(`[careers-gftv] unknown icon: ${name}`);
    return null;
  }

  const size = options.size ?? 20;
  const wrapper = document.createElement('div');
  wrapper.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
    `width="${size}" height="${size}" ` +
    (options.label
      ? `role="img" aria-label="${escapeAttr(options.label)}">`
      : `aria-hidden="true" focusable="false">`) +
    `${path}</svg>`;

  return wrapper.firstElementChild;
}

/**
 * Replace every <span data-icon="name"> in a subtree with its SVG.
 * @param {ParentNode} [root]
 */
export function hydrateIcons(root = document) {
  const targets = root.querySelectorAll('[data-icon]:not([data-icon-done])');
  targets.forEach((el) => {
    const svg = icon(el.getAttribute('data-icon'), {
      size: Number(el.getAttribute('data-icon-size')) || 20,
      label: el.getAttribute('data-icon-label') || undefined,
    });
    if (!svg) return;
    el.replaceChildren(svg);
    el.setAttribute('data-icon-done', '');
    el.style.display = 'inline-flex';
  });
}

/** Icon markup as a string, for templates built with innerHTML. */
export function iconMarkup(name, options = {}) {
  const el = icon(name, options);
  return el ? el.outerHTML : '';
}

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
