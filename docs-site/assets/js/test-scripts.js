// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The download table on the developer guide's test scripts page.
//
// **The scripts arrive inside the page, and this file hands them over.** The
// content route sends `data` beside the markdown for a page whose front matter
// names a data file, so `tests/*.mjs` reaches the browser through the same
// session check the page did. There is no address for a script: the download is
// a `blob:` URL built in this tab, unique to it, and dead when it closes.
//
// **What that is not.** A blob hides where a file came from, not what is in it.
// The text is already in the page and the network tab has it, which is fine and
// is the point: somebody who reads a script before running it against a live
// database is doing the right thing. Nothing in `tests/` holds a credential.
//
// **Everything here is drawn with `textContent` and `createElement`.** The
// scripts are source code, and source code assigned as markup is a script tag
// away from being run. This module is the one place in this site that handles a
// string it did not render through `markdown.js`, so it is the one place that
// rule has to be held by hand.

import { t } from './i18n.js';

/** Where the block goes: after this heading, or at the foot of the article. */
const ANCHOR_ID = 'the-scripts';

/**
 * Bytes as a reader reads them. Two decimals is noise on a 16 KB file, so
 * kilobytes are whole and the unit changes at a thousand.
 */
function sizeOf(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '';
  if (value < 1024) return t('scripts.bytes', { count: String(value) });
  return t('scripts.kilobytes', { count: String(Math.round(value / 1024)) });
}

/**
 * The file itself, decoded from the base64 the generator wrote.
 *
 * Base64 because a script full of backticks and dollar signs travelling as a
 * raw JSON string is a string every pipeline between here and there gets a
 * chance to interpret. `atob` gives bytes as characters, and the loop below
 * turns them back into the bytes they were, which is what keeps a Chinese
 * comment or an em space in a test script intact.
 */
function decode(content) {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/**
 * Hand one script to the browser as a download.
 *
 * The object URL is revoked on the next turn of the event loop rather than
 * immediately: the click has to have been dispatched before the address stops
 * resolving, and a revoke in the same tick cancels the download in some
 * browsers instead of tidying up after it.
 */
function download(script) {
  const blob = new Blob([decode(script.content)], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = script.name;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** One row: what the script is, how big it is, and the button that saves it. */
function rowFor(script) {
  const row = document.createElement('tr');

  const name = document.createElement('td');
  const code = document.createElement('code');
  code.textContent = script.name;
  name.append(code);

  if (script.description) {
    const description = document.createElement('p');
    description.className = 'docs-scripts-description';
    description.textContent = script.description;
    name.append(description);
  }

  for (const line of script.usage ?? []) {
    const usage = document.createElement('p');
    const command = document.createElement('code');
    command.textContent = line;
    usage.className = 'docs-scripts-usage';
    usage.append(command);
    name.append(usage);
  }

  const size = document.createElement('td');
  size.className = 'docs-scripts-size';
  size.textContent = `${t('scripts.lines', { count: String(script.lines) })}, ${sizeOf(script.bytes)}`;

  // The first twelve characters, which is what tells two versions of one script
  // apart and is short enough to read across at a glance. The whole digest is
  // in the file the generator wrote, for anybody who wants to verify one.
  const checksum = document.createElement('td');
  const digest = document.createElement('code');
  digest.className = 'docs-scripts-digest';
  digest.textContent = String(script.sha256 ?? '').slice(0, 12);
  digest.title = String(script.sha256 ?? '');
  checksum.append(digest);

  const action = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-secondary small-btn';
  button.textContent = t('scripts.download');
  button.setAttribute('aria-label', t('scripts.downloadLabel', { name: script.name }));
  button.addEventListener('click', () => download(script));
  action.append(button);

  row.append(name, size, checksum, action);
  return row;
}

/**
 * Draw the table into a page that carries the scripts, and nothing at all into
 * one that does not.
 *
 * **A page with no data is not a broken page.** The content route sends `null`
 * when the file cannot be read, and the guide reads correctly without it, so
 * this returns quietly instead of writing an error into somebody's article.
 *
 * @param {HTMLElement} article the rendered page
 * @param {null | { generated?: string, count?: number, scripts?: object[] }} data
 */
export function mountScripts(article, data) {
  const scripts = Array.isArray(data?.scripts) ? data.scripts : null;
  if (!article || !scripts || scripts.length === 0) return;

  const block = document.createElement('div');
  block.className = 'docs-scripts';

  const scroller = document.createElement('div');
  scroller.className = 'docs-scroller';

  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');

  for (const key of ['scripts.name', 'scripts.size', 'scripts.checksum', 'scripts.file']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = t(key);
    headRow.append(cell);
  }

  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const script of scripts) body.append(rowFor(script));
  table.append(body);

  scroller.append(table);
  block.append(scroller);

  if (data.generated) {
    const note = document.createElement('p');
    note.className = 'docs-scripts-generated';
    note.textContent = t('scripts.generated', { date: data.generated });
    block.append(note);
  }

  const anchor = article.querySelector(`#${ANCHOR_ID}`);
  if (anchor) anchor.after(block);
  else article.append(block);
}
