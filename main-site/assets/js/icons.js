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
// rule rather than a per icon adjustment.

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
  build: '<path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 8-8-1.9-1.9a3.5 3.5 0 0 0-4.6-4.6L14.5 6.5z"/><path d="M9 9L4 4"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
};

// A few names read better in markup with a hyphen.
const ALIASES = {
  'chevron-right': 'chevronRight',
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
