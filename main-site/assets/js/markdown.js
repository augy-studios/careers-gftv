// The small markdown subset a posting body is written in.
//
// Section 6 calls gftvjobs_jobs.description "markdown or html". This renders a
// deliberately small subset of the first and none of the second, and the order
// of operations is the whole security argument:
//
//   **Everything is escaped before any pattern runs.** A posting containing a
//   literal <script> renders as those five characters, and the patterns below
//   can only ever match marks an admin typed rather than markup they smuggled
//   in. Nothing here has to decide whether a tag is safe, because no tag ever
//   reaches it.
//
// That matters less than it would for content a stranger writes, and is still
// the right default: the phase 7 editor is one compromised staff account away
// from being exactly that.
//
// Supported: paragraphs, bullet lists, bold, italic, and links to http, https,
// mailto, and this site. Everything else renders as the characters that were
// typed, which is the honest failure for a mark nobody meant as a mark.
//
// No imports, no DOM, and no dictionary. It is used by the posting page today
// and by the admin editor's preview in phase 7, and it is the one part of the
// posting page that can be exercised without a browser.

/**
 * Paragraphs, with any run of bulleted lines becoming a list.
 *
 * Blank lines separate paragraphs. A single newline inside a paragraph is a
 * line break rather than a new paragraph, which is what an admin typing into a
 * textarea means by pressing return once.
 *
 * @param {unknown} value
 * @returns {string} HTML
 */
export function renderProse(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';

  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim());
      const bulleted = lines.filter((line) => /^[-*+]\s+/.test(line));

      // A block is a list only when every line in it is a bullet. A block with
      // one bullet in the middle is prose that happens to contain a dash.
      if (lines.length > 0 && bulleted.length === lines.length) {
        return `<ul>${lines
          .map((line) => `<li>${inline(line.replace(/^[-*+]\s+/, ''))}</li>`)
          .join('')}</ul>`;
      }

      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/**
 * One item per line.
 *
 * Responsibilities, requirements, and nice-to-haves are lists by nature, and
 * both the seed data and the phase 7 editor write them one per line. A leading
 * bullet mark is tolerated and removed, so an admin who typed one does not get
 * two.
 *
 * A single line is a paragraph rather than a list of one, since a bulleted list
 * with one item reads as a formatting mistake.
 *
 * @param {unknown} value
 * @returns {string} HTML
 */
export function renderLines(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';

  const lines = value
    .split('\n')
    .map((line) => line.trim().replace(/^[-*+]\s+/, ''))
    .filter((line) => line !== '');

  if (lines.length === 0) return '';
  if (lines.length === 1) return `<p>${inline(lines[0])}</p>`;

  return `<ul>${lines.map((line) => `<li>${inline(line)}</li>`).join('')}</ul>`;
}

/**
 * Inline formatting, applied to already escaped text.
 * @param {string} text
 * @returns {string} HTML
 */
export function inline(text) {
  return (
    escapeHtml(text)
      // [label](https://example.com). The address is checked rather than
      // trusted: a javascript: URL inside a link is the one thing this subset
      // could otherwise be used to smuggle, and escaping the text does nothing
      // about an href.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) =>
        safeHref(href) ? `<a href="${href}" rel="noopener">${label}</a>` : match
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  );
}

/**
 * Whether a link address may be rendered as a link.
 *
 * An allowlist by scheme, not a blocklist. Anything unrecognised, including a
 * scheme relative //host address and anything with a control character folded
 * into it, renders as the text that was typed.
 */
export function safeHref(href) {
  return /^(https?:\/\/[^"'<>\s]+|mailto:[^"'<>\s]+|\/[^/"'<>\s][^"'<>\s]*|\/)$/i.test(href);
}

/**
 * HTML escaping. Exported because everything that renders a posting field needs
 * exactly this and there should be one of it.
 * @param {unknown} value
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
