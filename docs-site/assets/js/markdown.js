// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The markdown a documentation page is written in.
//
// **Why not the portal's `markdown.js`.** That one renders a posting body:
// paragraphs, bullets, bold, italic, and links, and nothing else, because that
// is the whole of what an admin types into a textarea. A documentation page is
// mostly headings, and every heading is a table of contents entry, an anchor,
// and a search result. The two subsets barely overlap, and growing the portal's
// renderer with tables nothing on the portal will ever contain would be the
// worse of the two duplications.
//
// **One renderer, both pipelines.** 16e: "the two pipelines share one layout,
// one sidebar component, one table of contents, and one stylesheet. A reader
// must not be able to tell which pipeline a page came from." So this module has
// no DOM in it and no imports at all: the browser calls it for a gated page, and
// part 5's build script calls the same functions in Node for a public one.
//
// **Everything is escaped before any pattern runs**, which is the portal's rule
// and the whole security argument. A page containing a literal <script> renders
// as those characters. Nothing here decides whether a tag is safe, because no
// tag ever reaches it -- and that stays true even though every page in both
// trees is written by us, because "behind a login" was never the same thing as
// "safe to paste anything into".
//
// What is supported, and nothing else is:
//
//   # to ####            headings, each with an id derived from its text
//   paragraphs           blank line separated, wrapped lines joined, and two
//                        trailing spaces for a line break
//   - * +  /  1.         bulleted and numbered lists
//   ```lang ... ```      a code block, with the language shown and a copy button
//   `code`               inline
//   > text               a quote
//   > [!NOTE]            a callout: NOTE, TIP, WARNING, DANGER
//   | a | b |            tables, with the second row as the alignment rule
//   :::details Summary   a collapsible block, closed by :::
//   :::tabs / ::tab X    tabbed blocks, for anything that differs by device
//   ---                  a rule
//   **bold**  *italic*  [text](href)
//
// Anything else renders as the characters that were typed, which is the honest
// failure for a mark nobody meant as a mark.

/* -------------------------------------------------------------------------
 * Inline
 * ---------------------------------------------------------------------- */

/** The five characters that could otherwise close a tag or open one. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A link target we are willing to emit.
 *
 * Same allowlist as the portal's, one entry longer: a documentation page links
 * to its neighbours by root relative path far more often than it links out.
 * Anything else renders as text, so a `javascript:` URL in a page is visible
 * instead of clickable.
 */
export function safeHref(href) {
  const value = String(href ?? '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('#')) return value;
  return null;
}

/**
 * Inline marks, over already escaped text.
 *
 * Code spans are lifted out first and put back last, so a backtick span
 * containing `**` keeps its asterisks and a span containing a bracket pair is
 * never read as a link. That ordering is the only subtle thing in this file.
 */
export function inline(text) {
  const spans = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (match, code) => {
    spans.push(`<code>${code}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const safe = safeHref(href);
    return safe === null ? match : `<a href="${escapeHtml(safe)}">${label}</a>`;
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (match, index) => spans[Number(index)]);
}

/* -------------------------------------------------------------------------
 * Headings
 * ---------------------------------------------------------------------- */

/**
 * An id for a heading, from its own words.
 *
 * Derived and not written down, so a heading and its anchor cannot disagree.
 * The cost is stated rather than discovered: **renaming a heading breaks every
 * link to it**, including one somebody has bookmarked, which is the trade every
 * documentation site makes and is why headings are worth getting right once.
 */
export function slugify(text) {
  const base = String(text ?? '')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'section' : base;
}

/* -------------------------------------------------------------------------
 * Blocks
 * ---------------------------------------------------------------------- */

const CALLOUTS = ['note', 'tip', 'warning', 'danger'];

/**
 * A list, where an item may be wrapped over more than one line.
 *
 * **Every page in both trees is hard wrapped**, so a bullet longer than the
 * column runs onto the next line, and a renderer that made every line an item
 * would turn one sentence into three bullets. A line starting with a mark opens
 * an item; anything else continues the one before it.
 */
function listBlock(lines) {
  const MARK = /^(?:[-*+]|\d+[.)])\s+/;
  const ordered = /^\d+[.)]\s+/.test(lines[0]);
  const items = [];

  for (const line of lines) {
    if (MARK.test(line) || items.length === 0) items.push(line.replace(MARK, ''));
    else items[items.length - 1] += ` ${line}`;
  }

  const html = items.map((item) => `<li>${inline(item)}</li>`).join('');
  return ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`;
}

function tableBlock(lines) {
  const cells = (line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);

  // Wrapped in its own scroller. 16d: "code and command blocks scroll
  // horizontally within their own container on small screens, never pushing the
  // page sideways", and a table is the other thing that does that.
  return (
    '<div class="docs-scroller"><table><thead><tr>' +
    head.map((cell) => `<th>${inline(cell)}</th>`).join('') +
    '</tr></thead><tbody>' +
    body
      .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
      .join('') +
    '</tbody></table></div>'
  );
}

function quoteBlock(lines) {
  const stripped = lines.map((line) => line.replace(/^>\s?/, ''));
  const alert = /^\[!(\w+)\]\s*$/.exec(stripped[0] ?? '');

  if (alert && CALLOUTS.includes(alert[1].toLowerCase())) {
    const kind = alert[1].toLowerCase();
    const body = stripped.slice(1).join('\n');
    return (
      `<div class="docs-callout" data-callout="${kind}">` +
      `<p class="docs-callout-label" data-i18n="callout.${kind}">${kind}</p>` +
      `${render(body).html}</div>`
    );
  }

  return `<blockquote>${render(stripped.join('\n')).html}</blockquote>`;
}

/**
 * A `:::` container: `details` or `tabs`.
 *
 * Both are 16d's, and both exist because a documentation page has two things a
 * posting never has -- an aside most readers should skip, and a procedure that
 * differs between a desktop and a phone. Anything else after the colons renders
 * as the characters that were typed.
 */
function containerBlock(kind, argument, body) {
  if (kind === 'details') {
    return (
      `<details class="docs-details"><summary>${inline(argument || 'Details')}</summary>` +
      `<div class="docs-details-body">${render(body).html}</div></details>`
    );
  }

  if (kind === 'tabs') {
    const panels = [];
    let label = null;
    let buffer = [];

    const flush = () => {
      if (label === null) return;
      panels.push({ label, body: buffer.join('\n') });
      buffer = [];
    };

    for (const line of body.split('\n')) {
      const header = /^::tab\s+(.+)$/.exec(line.trim());
      if (header) {
        flush();
        label = header[1].trim();
        continue;
      }
      if (label !== null) buffer.push(line);
    }
    flush();

    if (panels.length === 0) return '';

    const group = `tabs-${slugify(panels.map((panel) => panel.label).join('-'))}`;
    return (
      `<div class="docs-tabs" role="tablist">` +
      panels
        .map(
          (panel, index) =>
            `<button type="button" role="tab" id="${group}-t${index}"` +
            ` aria-controls="${group}-p${index}"` +
            ` aria-selected="${index === 0 ? 'true' : 'false'}"` +
            ` tabindex="${index === 0 ? '0' : '-1'}">${inline(panel.label)}</button>`
        )
        .join('') +
      '</div>' +
      panels
        .map(
          (panel, index) =>
            `<div class="docs-tabpanel" role="tabpanel" id="${group}-p${index}"` +
            ` aria-labelledby="${group}-t${index}"${index === 0 ? '' : ' hidden'}>` +
            `${render(panel.body).html}</div>`
        )
        .join('')
    );
  }

  return `<p>${inline(`:::${kind} ${argument}`.trim())}</p>`;
}

/**
 * Render a whole page.
 *
 * @param {string} source markdown, with the front matter already removed
 * @returns {{ html: string, headings: Array<{ id: string, text: string, level: number }> }}
 *
 * The headings come back with the HTML because the table of contents is built
 * from the same pass that numbered them. Scanning the rendered DOM for them
 * afterwards would work in a browser and not in the build script, and 16e wants
 * one of these, not two.
 */
export function render(source) {
  const lines = String(source ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n');

  const html = [];
  const headings = [];
  const used = new Map();
  let index = 0;

  const take = (test) => {
    const run = [];
    while (index < lines.length && test(lines[index])) run.push(lines[index++]);
    return run;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = /^```(\S*)\s*$/.exec(line.trim());
    if (fence) {
      index += 1;
      const body = take((next) => next.trim() !== '```');
      if (index < lines.length) index += 1;

      const language = fence[1] ? escapeHtml(fence[1]) : '';
      html.push(
        '<div class="docs-code">' +
          `<div class="docs-code-bar"><span class="docs-code-lang">${language}</span>` +
          '<button type="button" class="docs-copy" data-i18n="code.copy"' +
          ' data-i18n-attr="aria-label:code.copyLabel">Copy</button></div>' +
          `<div class="docs-scroller"><pre><code>${escapeHtml(body.join('\n'))}</code></pre></div>` +
          '</div>'
      );
      continue;
    }

    const container = /^:::(\w+)\s*(.*)$/.exec(line.trim());
    if (container) {
      index += 1;
      const body = take((next) => next.trim() !== ':::');
      if (index < lines.length) index += 1;
      html.push(containerBlock(container[1].toLowerCase(), container[2].trim(), body.join('\n')));
      continue;
    }

    const heading = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      index += 1;
      const level = heading[1].length;
      const text = heading[2];
      const rendered = inline(text);

      // Two headings with the same words get -2, -3, and so on, in the order
      // they appear. Silent, because a page is allowed to say "Troubleshooting"
      // twice and a renderer that refused would be wrong about which one to
      // blame.
      let id = slugify(text);
      const seen = used.get(id) ?? 0;
      used.set(id, seen + 1);
      if (seen > 0) id = `${id}-${seen + 1}`;

      // The h1 is the page title and is deliberately not a contents entry:
      // a table of contents whose first line is the heading above it is one
      // wasted line on every page.
      if (level > 1) headings.push({ id, text: text.replace(/[*`]/g, ''), level });

      // **The anchor is reachable by keyboard**, which is the whole reason it
      // carries a name instead of aria-hidden. It was written the other way
      // first -- hidden from assistive technology and tabindex="-1" -- and that
      // is a control only a pointer can use, on a site whose readers include
      // people copying a link to a procedure. The cost is one tab stop per
      // heading, which is what every documentation site pays for it.
      html.push(
        `<h${level} id="${id}">${rendered}` +
          `<a class="docs-anchor" href="#${id}" data-i18n-attr="aria-label:page.headingLink">#</a>` +
          `</h${level}>`
      );
      continue;
    }

    if (/^(---+|\*\*\*+)\s*$/.test(line.trim())) {
      index += 1;
      html.push('<hr>');
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      html.push(quoteBlock(take((next) => next.trimStart().startsWith('>')).map((l) => l.trim())));
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      // To the blank line, and not to the last bullet: a wrapped item's second
      // line does not start with a mark and belongs to the item above it.
      const run = take(
        (next) => next.trim() !== '' && !/^(#{1,4}\s|```|:::|>|\|)/.test(next.trim())
      );
      html.push(listBlock(run.map((l) => l.trim())));
      continue;
    }

    // A table is a header row, an alignment rule, and its body. The rule is
    // what tells a table apart from a paragraph that happens to contain a pipe.
    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1] ?? '')) {
      html.push(tableBlock(take((next) => next.includes('|')).map((l) => l.trim())));
      continue;
    }

    const paragraph = take(
      (next) =>
        next.trim() !== '' &&
        !/^(#{1,4}\s|```|:::|>|\s*(?:[-*+]|\d+[.)])\s|---+\s*$)/.test(next)
    );

    // **Lines inside a paragraph are joined, not broken.** The portal's renderer
    // does the opposite, and is right to: an admin typing into a textarea and
    // pressing return once means a new line. A documentation page is a file
    // somebody wrapped at eighty columns, and breaking on every newline turned
    // every paragraph on this site into a column of ragged lines. A line break
    // is still available and is markdown's own: two spaces at the end of a line.
    const joined = paragraph
      .map((line, at) =>
        at < paragraph.length - 1 && /\s{2,}$/.test(line) ? `${line.trim()}\u0000br\u0000` : line.trim()
      )
      .join(' ');

    html.push(`<p>${inline(joined).split('\u0000br\u0000').join('<br>')}</p>`);
  }

  return { html: html.join(''), headings };
}
