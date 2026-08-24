// The annotation layer, section 7i's "Suggesting a correction in place".
//
// A helper reading any page selects the wording that reads wrongly and suggests
// a replacement for that exact span, without leaving the page and without ever
// typing an identifier. The span is anchored the way the W3C Web Annotation Data
// Model anchors one — the exact quote plus a short run of text either side — and
// lands in 8.11's queue beside the reports from 7h's form, told apart by
// `origin` and nothing else.
//
// **This module is loaded only when the layer is switched on**, through a dynamic
// import in shell.js, which asks the server first. 7i: "Visible only to granted
// helpers and admins. To everyone else the attributes are inert markup and the
// layer does not load at all." Nothing in here is on the path of an ordinary
// reader, and nothing in here may ever become so.
//
// Seven things in it are decisions, not plumbing:
//
//   **Off by default, and selection keeps working.** 7i: "A helper is a reader
//   first, and text selection has to keep working normally for copying." So a
//   selection does nothing on its own. It offers a small control near the words,
//   which is one click away from being ignored entirely.
//
//   **The marker is read from the document, never typed.** Content carries
//   data-tr="type:id:field", written by the page that rendered it; interface
//   strings carry the data-i18n key they have always carried. The layer walks up
//   from the selection to whichever it finds first.
//
//   **The language is the one the words are in, not the one the interface is
//   in.** A reader in Chinese looking at a posting with no ready Chinese
//   translation is reading English, and a suggestion filed against zh would point
//   the queue at a row that does not exist. The page states the answer on its
//   container and this reads it.
//
//   **"By word" means by character in Chinese**, and that is not a shortcut.
//   7i asks for the captured quote to be adjustable by word instead of by a
//   perfect drag, because touch selection is imprecise. Han script has no word
//   boundaries for a browser to find, so the step there is one character, which
//   is the unit somebody actually wants to nudge. The control says the same
//   thing in both cases and behaves differently underneath.
//
//   **A quote is captured from rendered text and matched against stored text.**
//   Those are the same string for a sentence and are not for a span crossing a
//   bold run, a bullet, or a link, because the column holds markdown and the page
//   holds the result of rendering it. The queue shows that as detached, per 7i,
//   which is the honest answer: the words were on the page when somebody selected
//   them. Loosening the match until it finds something is how a suggestion gets
//   applied to the wrong sentence.
//
//   **Existing suggestions are drawn for the posting and not for interface
//   strings.** Underlining what has already been raised is what turns this from a
//   suggestion box into a review pass. Doing it for the dictionary would mean
//   asking the server about every key the page happened to render.
//
//   **The panel is not modal.** Above 1024px it sits beside the text; below it is
//   a bottom sheet. Either way the words being talked about stay on screen and
//   stay selected, which is the whole point of suggesting in place.

import { api } from './api.js';
import { t, getLocale } from './i18n.js';
import { escapeHtml } from './markdown.js';
import { iconMarkup, hydrateIcons } from './icons.js';

/** How much text either side is stored, per the W3C selector's "short run". */
const CONTEXT = 96;

/** The longest span the server will take. */
const QUOTE_MAX = 600;

/** Han, Hiragana, Katakana, and Hangul: scripts a browser cannot word-break. */
const NO_WORD_BREAKS = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

let started = false;
let who = null;
let panel = null;
let hint = null;
let current = null;
let underlined = false;

/**
 * Turn the layer on.
 *
 * @param {{ locales: string[], canSuggest: boolean, realm: string }} context
 *        from /api/translations/annotations. Staff arrive with canSuggest false
 *        and no languages, per deviation 52: they get the underlines, which is
 *        what "visible to admins" buys them, and the suggestion box belongs to
 *        whoever holds the role in that language.
 */
export function startAnnotating(context) {
  if (started) return;
  started = true;
  who = context ?? { locales: [], canSuggest: false, realm: null };

  document.documentElement.setAttribute('data-annotating', 'true');

  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('keydown', onKeyDown);
  // Resize only, and not scroll. The control is positioned in document
  // coordinates, so it travels with the words on its own; the only thing a
  // scroll could change is whether it sits above or below them, and flipping it
  // under somebody's finger while they scroll is worse than leaving it where it
  // was put.
  window.addEventListener('resize', positionHint);
  // The posting redraws itself on a language change, which throws away every
  // underline and every marker with it. This listener is registered after that
  // page's own, so by the time it runs the new markup is in the document.
  document.addEventListener('gftv:localechange', onLocaleChange);

  refreshUnderlines();
}

/** Turn it off, and leave the document as it was found. */
export function stopAnnotating() {
  if (!started) return;
  started = false;

  document.documentElement.removeAttribute('data-annotating');

  document.removeEventListener('selectionchange', onSelectionChange);
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', positionHint);
  document.removeEventListener('gftv:localechange', onLocaleChange);

  hideHint();
  closePanel();
  removeUnderlines();
}

function onLocaleChange() {
  underlined = false;
  hideHint();
  refreshUnderlines();
}

/* -------------------------------------------------------------------------
 * Reading the selection
 * ---------------------------------------------------------------------- */

/**
 * What is selected, and what it is part of.
 *
 * Returns null for everything that is not an offer to make: a collapsed
 * selection, a selection outside anything translatable, one inside the layer's
 * own controls, or one in a language this caller does not hold.
 */
function readSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const raw = range.toString();
  if (raw.trim() === '') return null;

  const marker = markerFor(range.commonAncestorContainer);
  if (!marker) return null;

  const target = targetFor(marker);
  if (!target) return null;
  if (!mayAnnotate(target.locale)) return null;

  const anchor = anchorFrom(range, marker);
  if (!anchor) return null;

  return { ...target, ...anchor, container: marker, rect: range.getBoundingClientRect() };
}

/**
 * The nearest element saying what this text is.
 *
 * data-tr first and data-i18n second is not an ordering preference, it is what
 * `closest` does with a comma: the nearest ancestor matching either wins, and a
 * content field never sits inside an interface string.
 */
function markerFor(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element) return null;

  // Never the layer's own panel, which is full of data-i18n text of its own and
  // would otherwise offer to file a suggestion about the word "Cancel".
  if (element.closest('[data-annotate-ui]')) return null;

  return element.closest('[data-tr], [data-i18n]');
}

/** What a marker names: a row and a field, or a dictionary key. */
function targetFor(marker) {
  const content = marker.getAttribute('data-tr');

  if (content) {
    const [type, id, field] = content.split(':');
    if (!type || !id || !field) return null;

    return {
      targetType: type,
      targetId: id,
      targetKey: null,
      field,
      // The language the words are actually in, from the container the page put
      // it on. Falls back to the interface language, which is right for
      // everything except a posting falling back to English.
      locale: marker.closest('[data-tr-locale]')?.getAttribute('data-tr-locale') ?? getLocale(),
      label: t(`admin.target_${type}`),
    };
  }

  const key = marker.getAttribute('data-i18n');
  if (!key) return null;

  return {
    targetType: 'interface',
    targetId: null,
    targetKey: key,
    field: null,
    // An interface string is in the language the interface is in, by definition.
    locale: getLocale(),
    label: t('annotate.interfaceString'),
  };
}

/** Whether this caller may suggest a correction in the language these words are in. */
function mayAnnotate(locale) {
  if (!who?.canSuggest) return false;
  return (who.locales ?? []).includes(locale);
}

/**
 * The quote, and enough of what is around it to find it again.
 *
 * The offsets are counted in the container's own text and not in the DOM, so
 * a span crossing two elements — a sentence with a bold word in the middle — is
 * one run of characters here, which is what the stored column looks like.
 */
function anchorFrom(range, container) {
  const text = container.textContent ?? '';
  if (text === '') return null;

  const before = range.cloneRange();
  before.selectNodeContents(container);
  try {
    before.setEnd(range.startContainer, range.startOffset);
  } catch {
    // The selection is not inside this container after all, which happens when
    // it started outside and reached in. Nothing to anchor.
    return null;
  }

  const start = before.toString().length;
  const end = start + range.toString().length;

  return trimAnchor(text, start, end);
}

/**
 * Trim whitespace off both ends of a captured span.
 *
 * A double click that catches the space after a word, or a drag that overshoots
 * a line ending, would otherwise store a quote with an edge nobody selected on
 * purpose, and whitespace is exactly what differs most between the rendered page
 * and the stored column.
 */
function trimAnchor(text, start, end) {
  let from = start;
  let to = Math.min(end, text.length);

  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;

  if (to <= from) return null;
  if (to - from > QUOTE_MAX) to = from + QUOTE_MAX;

  return { text, start: from, end: to };
}

function quoteOf(anchor) {
  return anchor.text.slice(anchor.start, anchor.end);
}

function prefixOf(anchor) {
  return anchor.text.slice(Math.max(0, anchor.start - CONTEXT), anchor.start);
}

function suffixOf(anchor) {
  return anchor.text.slice(anchor.end, anchor.end + CONTEXT);
}

/* -------------------------------------------------------------------------
 * The small control that appears near the words
 * ---------------------------------------------------------------------- */

let hintTimer = 0;

function onSelectionChange() {
  // Debounced, because a drag fires this on every pixel and each one reads the
  // container's whole text.
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    if (panel?.isConnected) return;

    const found = readSelection();
    if (!found) {
      hideHint();
      return;
    }

    current = found;
    showHint(found.rect);
  }, 120);
}

function showHint(rect) {
  if (!hint) {
    hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'annotate-hint';
    hint.setAttribute('data-annotate-ui', '');
    // The label carries data-i18n as well as being written now: the control is
    // built once and reused for the rest of the page's life, so a language
    // change would otherwise leave it in the old one. The shell's own
    // retranslation pass walks the whole document and reaches it there.
    hint.innerHTML =
      `${iconMarkup('globe', { size: 15 })}` +
      `<span data-i18n="annotate.suggest">${escapeHtml(t('annotate.suggest'))}</span>`;
    hint.addEventListener('mousedown', (event) => {
      // The selection is lost the instant something else takes focus on a
      // mousedown, and the selection is the whole payload.
      event.preventDefault();
    });
    hint.addEventListener('click', () => openPanel());
    document.body.append(hint);
    hydrateIcons(hint);
  }

  hint.hidden = false;
  hint.dataset.top = String(rect.top + window.scrollY);
  hint.dataset.left = String(rect.left + window.scrollX + rect.width / 2);
  positionHint();
}

function positionHint() {
  if (!hint || hint.hidden) return;

  const top = Number(hint.dataset.top ?? 0);
  const left = Number(hint.dataset.left ?? 0);

  // Above the selection where there is room, below it otherwise, and never off
  // the left or right edge of a phone.
  const height = hint.offsetHeight || 36;
  const width = hint.offsetWidth || 160;
  const above = top - window.scrollY > height + 12;

  hint.style.top = `${above ? top - height - 8 : top + 24}px`;
  hint.style.left = `${Math.max(8 + width / 2, Math.min(left, window.innerWidth - width / 2 - 8))}px`;
}

function hideHint() {
  if (hint) hint.hidden = true;
}

/**
 * The keyboard's way in.
 *
 * 7i: "Keyboard reachable throughout. A helper who cannot use a pointer selects
 * with the keyboard and opens the same control." Selecting with shift and the
 * arrow keys fires selectionchange like any other selection, so the control is
 * already offered; what a keyboard cannot easily do is reach a button floating
 * beside the text without losing the selection on the way. Alt and S is the way
 * in that does not move focus at all, and the toggle says so.
 */
function onKeyDown(event) {
  if (event.key === 'Escape' && panel?.isConnected) {
    closePanel();
    return;
  }

  // `code` over `key`, because Alt and a letter produces a different
  // character on several layouts — Alt and S is ß on a Mac — and the shortcut is
  // about the key somebody presses and not what it would have typed.
  if (!event.altKey || event.code !== 'KeyS') return;
  if (panel?.isConnected) return;

  const found = readSelection();
  if (!found) return;

  event.preventDefault();
  current = found;
  openPanel();
}

/* -------------------------------------------------------------------------
 * The panel, which is a bottom sheet below 1024px
 * ---------------------------------------------------------------------- */

function openPanel(preset = null) {
  if (preset) current = preset;
  if (!current) return;

  hideHint();
  closePanel();

  panel = document.createElement('div');
  panel.className = 'annotate-panel glass-card';
  panel.setAttribute('data-annotate-ui', '');
  panel.setAttribute('role', 'dialog');
  // Not modal, deliberately: 7i wants the selection to stay visible above the
  // sheet, and a modal would take the page away from underneath it.
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', t('annotate.title'));

  panel.innerHTML = `
    <div class="annotate-head">
      <h2>${escapeHtml(t('annotate.title'))}</h2>
      <button type="button" class="icon-btn small" data-close
              aria-label="${escapeHtml(t('common.close'))}">&times;</button>
    </div>

    <div class="annotate-body">
      <p class="muted annotate-where"></p>
      ${
        current.existing
          ? `<p class="callout note">${escapeHtml(
              t('annotate.alreadyRaised', { count: current.existing })
            )}</p>`
          : ''
      }

      <blockquote class="annotate-quote">
        <span class="muted" data-prefix></span><mark data-quote></mark><span
          class="muted" data-suffix></span>
      </blockquote>

      <div class="annotate-adjust" role="group"
           aria-label="${escapeHtml(t('annotate.adjustLabel'))}">
        <span class="muted">${escapeHtml(t('annotate.adjustStart'))}</span>
        <button type="button" class="icon-btn small" data-adjust="start-out"
                aria-label="${escapeHtml(t('annotate.startOut'))}">&minus;</button>
        <button type="button" class="icon-btn small" data-adjust="start-in"
                aria-label="${escapeHtml(t('annotate.startIn'))}">+</button>
        <span class="muted">${escapeHtml(t('annotate.adjustEnd'))}</span>
        <button type="button" class="icon-btn small" data-adjust="end-in"
                aria-label="${escapeHtml(t('annotate.endIn'))}">&minus;</button>
        <button type="button" class="icon-btn small" data-adjust="end-out"
                aria-label="${escapeHtml(t('annotate.endOut'))}">+</button>
      </div>

      <div class="field">
        <label for="annotateNote">${escapeHtml(t('annotate.note'))}</label>
        <textarea id="annotateNote" rows="2" maxlength="2000"></textarea>
        <p class="field-error" data-note-error hidden></p>
      </div>

      <div class="field">
        <label for="annotateSuggestion">${escapeHtml(t('annotate.replacement'))}</label>
        <textarea id="annotateSuggestion" rows="2" maxlength="2000"></textarea>
        <p class="field-hint">${escapeHtml(t('annotate.neverApplied'))}</p>
      </div>

      <p class="form-message" data-message role="status" hidden></p>

      <div class="modal-foot">
        <button type="button" class="btn btn-secondary" data-close>${escapeHtml(
          t('report.cancel')
        )}</button>
        <button type="button" class="btn btn-primary" data-send>${escapeHtml(
          t('annotate.send')
        )}</button>
      </div>
    </div>`;

  document.body.append(panel);
  wirePanel();
  paintQuote();

  panel.querySelector('.annotate-where').textContent = whereLine();
  panel.querySelector('#annotateNote')?.focus();
}

function whereLine() {
  const parts = [current.label];
  if (current.field) parts.push(fieldName(current.targetType, current.field));
  if (current.targetKey) parts.push(current.targetKey);
  parts.push(t(`language.name_${current.locale}`));
  return parts.filter(Boolean).join(' · ');
}

/** The field's name, from 8.11's own keys in place of a second set. */
function fieldName(targetType, field) {
  for (const key of [`admin.field_${targetType}_${field}`, `admin.field_${field}`]) {
    const label = t(key);
    if (label !== key) return label;
  }
  return String(field).replace(/_/g, ' ');
}

function paintQuote() {
  if (!panel || !current) return;

  panel.querySelector('[data-prefix]').textContent = prefixOf(current);
  panel.querySelector('[data-quote]').textContent = quoteOf(current);
  panel.querySelector('[data-suffix]').textContent = suffixOf(current);
}

function wirePanel() {
  panel.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closePanel());
  });

  panel.querySelectorAll('[data-adjust]').forEach((button) => {
    button.addEventListener('click', () => {
      adjust(button.getAttribute('data-adjust'));
      paintQuote();
    });
  });

  panel.querySelector('[data-send]')?.addEventListener('click', () => {
    send().catch((cause) => {
      console.error('[careers-gftv] send suggestion:', cause);
      setMessage(t('error.unexpected'), 'danger');
    });
  });
}

function closePanel() {
  panel?.remove();
  panel = null;
}

/* -------------------------------------------------------------------------
 * Adjusting the span
 * ---------------------------------------------------------------------- */

/**
 * Move one end of the quote by a word.
 *
 * **Or by a character, in a script that has no word boundaries.** 7i asks for
 * this because touch selection is imprecise, and the unit it names is a word.
 * Han, kana, and Hangul have no spaces for a browser to break on, so a step
 * there is one character, which is the thing somebody actually wants to nudge.
 * The control is labelled the same in both cases: the reader is adjusting the
 * selection, and the size of a step is not a fact they should have to hold.
 */
function adjust(what) {
  if (!current) return;

  const { text } = current;
  let { start, end } = current;

  if (what === 'start-out') start = stepLeft(text, start);
  else if (what === 'start-in') start = stepRight(text, start);
  else if (what === 'end-in') end = stepLeft(text, end);
  else if (what === 'end-out') end = stepRight(text, end);

  // **Refused, not clamped**, which is the difference between a control
  // that has reached the end of its travel and one that does something silly at
  // it. Clamping turned "end one word earlier" on a single word into a one
  // character quote, which is not a thing anybody asked for and is a worse
  // anchor than the one they had.
  if (end <= start) return;
  if (end - start > QUOTE_MAX) return;

  current.start = start;
  current.end = end;
}

function stepLeft(text, index) {
  if (index <= 0) return 0;
  if (NO_WORD_BREAKS.test(text[index - 1] ?? '')) return index - 1;

  let at = index;
  while (at > 0 && /\s/.test(text[at - 1])) at -= 1;
  while (at > 0 && !/\s/.test(text[at - 1])) at -= 1;
  return at;
}

function stepRight(text, index) {
  if (index >= text.length) return text.length;
  if (NO_WORD_BREAKS.test(text[index] ?? '')) return index + 1;

  let at = index;
  while (at < text.length && /\s/.test(text[at])) at += 1;
  while (at < text.length && !/\s/.test(text[at])) at += 1;
  return at;
}

/* -------------------------------------------------------------------------
 * Sending it
 * ---------------------------------------------------------------------- */

async function send() {
  const note = panel.querySelector('#annotateNote').value.trim();
  const suggestion = panel.querySelector('#annotateSuggestion').value.trim();

  if (note === '') {
    setNoteError(t('annotate.noteRequired'));
    panel.querySelector('#annotateNote').focus();
    return;
  }
  setNoteError(null);

  const button = panel.querySelector('[data-send]');
  button.disabled = true;
  setMessage(null);

  const result = await api('/api/translations/annotations', {
    method: 'POST',
    locale: false,
    body: {
      target_type: current.targetType,
      target_id: current.targetId,
      target_key: current.targetKey,
      field: current.field,
      locale: current.locale,
      note,
      suggested_text: suggestion === '' ? null : suggestion,
      quote: quoteOf(current),
      quote_prefix: prefixOf(current),
      quote_suffix: suffixOf(current),
    },
  });

  if (!result.ok) {
    button.disabled = false;
    setMessage(result.error?.message ?? t('error.unexpected'), 'danger');
    return;
  }

  // 7h's promise, kept here too: confirm plainly, say a person will read it, and
  // never promise a timeframe.
  panel.querySelector('.annotate-body').innerHTML =
    `<p class="callout note">${escapeHtml(t('annotate.thanks'))}</p>` +
    `<div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>${escapeHtml(
      t('common.close')
    )}</button></div>`;

  panel.querySelectorAll('[data-close]').forEach((close) => {
    close.addEventListener('click', () => closePanel());
  });
  panel.querySelector('[data-close]')?.focus();

  // The span this one is about now has one more against it. Redrawn instead of
  // incremented, because somebody else may have added one while this panel was
  // open and the count is the point of the underline.
  underlined = false;
  refreshUnderlines();
}

function setMessage(text, kind) {
  const el = panel?.querySelector('[data-message]');
  if (!el) return;
  el.className = text ? `callout ${kind} form-message` : 'form-message';
  el.textContent = text ?? '';
  el.hidden = !text;
}

function setNoteError(text) {
  const el = panel?.querySelector('[data-note-error]');
  if (!el) return;
  el.textContent = text ?? '';
  el.hidden = !text;
  panel.querySelector('#annotateNote')?.setAttribute('aria-invalid', text ? 'true' : 'false');
}

/* -------------------------------------------------------------------------
 * What has already been raised
 * ---------------------------------------------------------------------- */

/**
 * Underline the spans somebody has already complained about, with a count.
 *
 * 7i: "This is what turns it from a suggestion box into a review pass: a helper
 * can see what has already been raised and not raise it again."
 *
 * **One target, which is the posting.** A page carries one content row worth
 * asking about and several incidental ones — a team name, four tag names — and
 * asking about each would be six requests to underline two words. The posting is
 * where the words are.
 */
async function refreshUnderlines() {
  if (!started || underlined) return;

  removeUnderlines();

  const marker = document.querySelector('[data-tr^="job:"]');
  if (!marker) return;

  const [, jobId] = (marker.getAttribute('data-tr') ?? '').split(':');
  if (!jobId) return;

  const locale =
    marker.closest('[data-tr-locale]')?.getAttribute('data-tr-locale') ?? getLocale();

  underlined = true;

  const result = await api(
    `/api/translations/annotations?type=job&id=${encodeURIComponent(
      jobId
    )}&locale=${encodeURIComponent(locale)}`,
    { locale: false }
  );

  if (!result.ok) return;

  for (const span of result.data?.spans ?? []) {
    drawUnderline(jobId, locale, span);
  }
}

/**
 * Draw one underline, if the words are still where they were.
 *
 * **Only when the quote sits inside a single text node.** Wrapping a range that
 * crosses element boundaries means rebuilding that part of the document, which
 * on a posting body is markdown output with links and emphasis in it. Skipping
 * those is a missing underline; getting it wrong is a mangled posting.
 */
function drawUnderline(jobId, locale, span) {
  const container = document.querySelector(
    `[data-tr="job:${CSS.escape(jobId)}:${CSS.escape(span.field ?? '')}"]`
  );
  if (!container || !span.quote) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const at = node.nodeValue.indexOf(span.quote);
    if (at === -1) continue;

    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + span.quote.length);

    const mark = document.createElement('mark');
    mark.className = 'annotate-underline';
    mark.dataset.count = String(span.count);

    const label = t('annotate.underlineLabel', { count: span.count, text: span.quote });

    range.surroundContents(mark);

    // **A control only for somebody who could add to it.** Staff read the layer
    // and do not write to it, per deviation 52, so for them this is a mark on
    // the page and not a button that opens a box they cannot send. The title
    // carries the count either way; the aria-label is only set where the role
    // is, because a role of button replaces the words inside it in the
    // accessibility tree and the sentence has to survive that.
    mark.title = label;

    if (!who?.canSuggest) return;

    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    mark.setAttribute('aria-label', label);

    const open = () =>
      openPanel({
        targetType: 'job',
        targetId: jobId,
        targetKey: null,
        field: span.field,
        locale,
        label: t('admin.target_job'),
        text: container.textContent ?? '',
        start: (container.textContent ?? '').indexOf(span.quote),
        end: (container.textContent ?? '').indexOf(span.quote) + span.quote.length,
        existing: span.count,
      });

    mark.addEventListener('click', open);
    mark.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });

    return;
  }
}

function removeUnderlines() {
  document.querySelectorAll('mark.annotate-underline').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}
