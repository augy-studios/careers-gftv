// The job posting page, /jobs/{uuid}.
//
// The document arrives already rendered by api/job-page.js, but only its head:
// the title, the meta description, the Open Graph tags, and the JobPosting
// JSON-LD, which is what an unfurler and a crawler read. The visible page is
// drawn here, from a JSON payload the function inlined into the document.
//
// **There is no fetch on this page.** The posting is already in the document
// when this module runs, in every language it is ready in, which is what makes
// the globe instant here: switching language is a redraw from memory instead
// of a round trip. It also means the posting is on screen in one paint on a
// slow connection, which is the case that matters on a phone at a convention.
//
// What is deliberately not here, and where it went:
//
//   Apply     assets/js/apply.js, which fills the slot this page leaves for it.
//             Six states hang off one button and none of them are this file's
//             business; all it owns is where the control sits on the page.
//   Save      phase 6. The button is present and disabled with the sentence
//             section 0c fixes, through the ordinary data-feature mechanism.
//             Section 4's sign in prompt is for a logged out visitor facing a
//             control that works; a control that does not exist yet is a
//             different thing and 0c is the rule for it.
//   View log  the optional analytics `view` event in section 6. It is left to
//             phase 8 with the rest of the analytics, because a row written
//             here would sit at response_state pending and 7c's pending prompt
//             query has to learn to ignore it first. Writing it early would put
//             a "tell us what you think" modal in front of everybody who read a
//             posting.
//
// Language: everything on this page is written by JavaScript, so a language
// change is a redraw, not a retranslation, exactly as on the board. That
// is also why nothing here caches a formatter or a label.

import { t, getLocale, DEFAULT_LOCALE } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { closingText, postedText, commitmentLabel, formatDate, formatDateTime } from './format.js';
import { cachedAt } from './offline.js';
import { loadBuildStatus, applyFeatureGating } from './build-status.js';
import { wireReportControl, openReportDialog } from './translation-report.js';
import { consumeIntent } from './signin-prompt.js';
import { api, applicantSession } from './api.js';
// The Apply control and everything behind it. This page owns where it sits and
// nothing else about it.
import { mountApply } from './apply.js';
import { saveButtonMarkup, mountSaveButtons } from './save-button.js';
// The posting body's small markdown subset. Its own module because it is pure,
// has no DOM in it, and is the one part of this page that can be exercised
// without a browser. Phase 7's editor preview should use it instead of writing
// a second renderer.
import { renderProse, renderLines, escapeHtml } from './markdown.js';

// Where the board was, so "back to results" returns to it with the query string
// intact and not to a bare /search. sessionStorage over a parameter
// on the link: a posting's address has one canonical form, per section 4, and
// hanging the reader's filters off it would make two.
const LAST_SEARCH_KEY = 'gftv-careers.lastSearch';

let payload = null;
let drawn = false;

/* -------------------------------------------------------------------------
 * The payload
 * ---------------------------------------------------------------------- */

function readPayload() {
  const el = document.querySelector('#jobData');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (cause) {
    console.error('[careers-gftv] job payload:', cause);
    return null;
  }
}

/**
 * The posting in the language being read, or in the default language when this
 * one has no ready translation.
 *
 * The absence of a language in the payload is the signal, not a flag on it:
 * api/job-page.js includes a language only when there is a ready translation
 * for it, so falling back and knowing that we fell back are the same check.
 */
function contentForLocale() {
  const locale = getLocale();
  const content = payload.content[locale];
  return {
    content: content ?? payload.content[DEFAULT_LOCALE],
    // Meaningless to a reader already in the language postings are written in:
    // every posting would carry it, since there is no translation row for the
    // default language by definition. Same rule as the board's badge.
    untranslated: locale !== DEFAULT_LOCALE && !content,
  };
}

/* -------------------------------------------------------------------------
 * Draw
 * ---------------------------------------------------------------------- */

function draw() {
  const holder = document.querySelector('#jobDetail');
  if (!holder || !payload) return;

  const { job } = payload;
  const { content, untranslated } = contentForLocale();

  document.title = t('job.pageTitle', { title: content.title ?? '' });

  const closing = closingText(job.closes_at);
  const posted = postedText(job.published_at);
  const commitment = commitmentLabel(job.commitment_type);

  holder.innerHTML = `
    ${
      // Phase 7's staff preview. The posting underneath is rendered exactly as
      // a reader would see it, which is the entire point, so the one thing this
      // page owes the person looking at it is an unmissable statement that
      // nobody else can. Above the title, not beside it: a preview that
      // has to be noticed is not a badge.
      payload?.preview
        ? `<div class="callout warn job-preview-banner" role="status">
             <p><strong>${escapeHtml(t('job.previewBanner'))}</strong></p>
             <p>${escapeHtml(t('job.previewBannerBody'))}</p>
           </div>`
        : ''
    }
    <header class="job-detail-head">
      <div class="job-card-badges">
        ${
          job.is_paid
            ? badge('badge-paid', t('job.paidBadge'))
            : badge('badge-unpaid', t('job.unpaidBadge'))
        }
        ${untranslated ? badge('badge-untranslated', t('job.untranslatedBadge')) : ''}
        ${job.is_archived ? badge('badge-archived', t('job.archivedBadge')) : ''}
      </div>

      <h1${tr('title')}>${escapeHtml(content.title ?? '')}</h1>

      ${
        // The one line version of the unpaid notice, in the header where the
        // full paragraph would be too much. The paragraph is still on the page,
        // immediately above the Apply button, which is where it matters.
        job.is_paid
          ? ''
          : `<p class="job-unpaid-short">${escapeHtml(t('common.unpaidShort'))}</p>`
      }

      <ul class="job-detail-meta">
        ${
          content.department
            ? meta(
                'briefcase',
                t('job.department'),
                content.department.name,
                '',
                tr('name', 'department', content.department.id)
              )
            : ''
        }
        ${meta('pin', t('job.location'), locationText(job, content), '', locationMarker(job, content))}
        ${commitment ? meta('clock', t('job.commitment'), commitment) : ''}
        ${meta('users', t('job.openings'), openingsText(job))}
        ${posted ? meta('calendar', t('job.postedLabel'), posted) : ''}
        ${
          closing.text
            ? meta('calendar', t('job.closesLabel'), closing.text, closing.urgent ? 'urgent' : '')
            : ''
        }
      </ul>

      ${tagList(content.tags)}
    </header>

    ${noticeFor(job, untranslated)}

    ${
      content.summary
        ? `<p class="lede job-summary"${tr('summary')}>${escapeHtml(content.summary)}</p>`
        : ''
    }

    ${
      // Where the unpaid paragraph belongs: the last thing read before the
      // Apply button. A paid posting says so for itself instead.
      job.is_paid
        ? content.compensation_note
          ? section(
              t('job.compensation'),
              renderProse(content.compensation_note),
              tr('compensation_note')
            )
          : ''
        : `<div class="callout note job-unpaid-notice"><p>${escapeHtml(
            t('job.unpaidNotice')
          )}</p></div>`
    }

    <div class="job-actions">
      <!-- Apply is a slot instead of a button, because it is six different
           things depending on this reader's history with this posting: the
           ordinary button, a cooldown notice, an unanswered prompt, a closed
           state, a paused state, or the button with a line above it. assets/js/
           apply.js owns everything inside it and redraws it in place. -->
      <div class="apply-slot" id="applySlot"></div>
      ${saveButtonMarkup(job.id, { withLabel: true })}
      <button type="button" class="btn btn-quiet" id="shareJob">
        ${iconMarkup('external', { size: 16 })}
        <span>${escapeHtml(t('job.share'))}</span>
      </button>
      <p class="share-note" id="shareNote" role="status" hidden></p>
    </div>

    ${
      content.description
        ? section(t('job.aboutRole'), renderProse(content.description), tr('description'))
        : ''
    }
    ${
      content.responsibilities
        ? section(
            t('job.responsibilities'),
            renderLines(content.responsibilities),
            tr('responsibilities')
          )
        : ''
    }
    ${
      content.requirements
        ? section(t('job.requirements'), renderLines(content.requirements), tr('requirements'))
        : ''
    }
    ${
      content.nice_to_have
        ? section(t('job.niceToHave'), renderLines(content.nice_to_have), tr('nice_to_have'))
        : ''
    }

    ${
      // Extra sections beyond the fixed fields, per migration 019. Array order
      // is display order, and the headings are content, not interface
      // strings, so they are translated on the translation row and arrive here
      // already in the right language.
      // The heading is content here, not an interface string, so the
      // marker covers the whole section instead of the body alone: a helper
      // fixing a heading is fixing the same jsonb array as one fixing a
      // paragraph under it, and `sections` is the field either way.
      (content.sections ?? [])
        .filter((entry) => entry && entry.heading && entry.body)
        .map(
          (entry) =>
            `<div${tr('sections')}>${section(entry.heading, renderProse(entry.body))}</div>`
        )
        .join('')
    }

    <footer class="job-detail-foot">
      <a href="${escapeAttr(backTarget())}" class="job-foot-link" data-back-to-results>
        ${iconMarkup('chevron-left', { size: 16 })}
        <span>${escapeHtml(t('job.backToResults'))}</span>
      </a>
      <button type="button" class="job-foot-link" id="reportTranslation">
        ${iconMarkup('globe', { size: 16 })}
        <span>${escapeHtml(t('report.open'))}</span>
      </button>
    </footer>
  `;

  holder.removeAttribute('aria-busy');

  // Which language the words above are actually in, for 7i's annotation layer.
  // On the container instead of on every marker, because it is one fact about
  // the whole posting and repeating it eleven times is eleven chances for one of
  // them to disagree after a fallback.
  holder.setAttribute('data-tr-locale', contentLocale(untranslated));

  hydrateIcons(holder);
  wireActions(holder);

  // After every draw, because a language change replaces the slot this fills.
  // It holds its own state across those redraws, so switching language costs
  // no request and never flickers back through the signed out button.
  mountApply({
    id: job.id,
    title: content.title ?? '',
    isOpen: job.is_open === true,
    isArchived: job.is_archived === true,
    // From the inlined payload, not a request, so the button is right at
    // first paint. The server checks it again on every apply.
    applicationsOpen: payload.applications_open !== false,
  });

  // Same treatment, and for the same reason: a language change replaces the
  // control, and the saved state is per applicant so it is filled in afterwards
  // and never held for.
  mountSaveButtons(holder);

  // The back link above the posting is in the document the function sent, so it
  // ships pointing at a bare /search. Section 4 wants it to return to the board
  // with the previous query string intact, and only the browser knows what that
  // was, so it is corrected here instead of rendered server side.
  const topBack = document.querySelector('#backToResults');
  if (topBack) topBack.href = backTarget();

  // Anything on this page belonging to a phase that has not shipped is drawn
  // and then disabled with the reason on it. Run after every draw, because a
  // language change replaces the elements the gating was applied to.
  loadBuildStatus().then((status) => applyFeatureGating(status, holder));

  drawn = true;
}

/* -------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------- */

function badge(className, text) {
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

/* -------------------------------------------------------------------------
 * The markers 7i's annotation layer reads
 * ---------------------------------------------------------------------- */

/**
 * Name what a piece of text on this page is, so a helper never has to.
 *
 * 7i: "Everything translatable on the site already carries an attribute naming
 * its source: interface strings render inside elements with data-i18n="key", and
 * content renders inside elements marked with its table, row, and field. The
 * annotation layer walks up from the selection to find it, so the helper never
 * types an identifier."
 *
 * One attribute, not three, because the layer wants all of it or none of
 * it and three lookups per selection is three chances to find half an answer.
 * Inert markup to everybody else, per 7i: nothing reads it unless the layer is
 * loaded, and the layer loads for granted helpers and staff only.
 *
 * **The id is never anything but a uuid from our own payload**, so this is not
 * an escaping hazard, and the field names are literals in this file.
 *
 * @param {string} field the column, on the translation row
 * @param {string} [type] job, department, or tag
 * @param {string} [id] the row, defaulting to the posting being read
 */
function tr(field, type = 'job', id = payload?.job?.id) {
  if (!id) return '';
  return ` data-tr="${type}:${id}:${field}"`;
}

/**
 * Which language the words on this page are actually in.
 *
 * Not the same as the interface language, and the difference is the whole reason
 * this is written down and not assumed: a reader in Chinese looking at a
 * posting with no ready Chinese translation is reading English, and a suggestion
 * filed against zh would point the queue at a row that does not exist. Migration
 * 015 allows a report against the default language for exactly this case, per its
 * own comment that "the English can be the wrong one".
 */
function contentLocale(untranslated) {
  return untranslated ? DEFAULT_LOCALE : getLocale();
}

/**
 * One meta row. The label is read out as well as the value, unlike the board's
 * cards: a card is scanned and a posting is read, and "Remote" on its own is
 * ambiguous when it sits in a list of six other facts.
 */
function meta(icon, label, value, extra = '', marker = '') {
  if (!value) return '';
  return (
    `<li class="${extra}">` +
    `${iconMarkup(icon, { size: 16 })}` +
    `<span class="job-meta-label">${escapeHtml(label)}</span>` +
    `<span class="job-meta-value"${marker}>${escapeHtml(value)}</span>` +
    `</li>`
  );
}

function section(heading, bodyHtml, marker = '') {
  if (!bodyHtml) return '';
  return `
    <section class="job-section">
      <h2>${escapeHtml(heading)}</h2>
      <div class="job-section-body"${marker}>${bodyHtml}</div>
    </section>`;
}

/**
 * Where the role is. Remote and a place are not exclusive, exactly as on the
 * card: a role can be remote and still tied to a timezone or a country.
 */
function locationText(job, content) {
  const parts = [];
  if (content.location) parts.push(content.location);
  if (job.is_remote && !/remote|远程/i.test(content.location ?? '')) {
    parts.push(t('job.remote'));
  }
  return parts.join(' · ');
}

/**
 * The location's marker, when the line is the posting's own words and nothing
 * else.
 *
 * A remote posting has "Remote" appended from the dictionary, so the line on
 * screen is content and interface joined by a separator. Marking it would invite
 * a helper to select across the join and file a quote against `location` that is
 * not in the column, which the queue would show as detached with no way for
 * anybody to work out why. Unmarked is the honest state: the interface half is
 * a code change and the content half is short enough to reach through 7h's form.
 */
function locationMarker(job, content) {
  if (!content.location) return '';
  return locationText(job, content) === content.location ? tr('location') : '';
}

function openingsText(job) {
  const count = Number(job.openings ?? 1);
  if (!Number.isFinite(count) || count < 1) return '';
  return count === 1 ? t('job.oneOpening') : t('job.openingsCount', { count });
}

function tagList(tags) {
  const list = Array.isArray(tags) ? tags : [];
  if (list.length === 0) return '';

  return (
    `<ul class="job-detail-tags" aria-label="${escapeAttr(t('job.tagsLabel'))}">` +
    list
      .map(
        (tag) =>
          `<li><a class="chip chip-tag" href="/search?tags=${encodeURIComponent(
            tag.slug
          )}"${tr('name', 'tag', tag.id)}>${escapeHtml(tag.name)}</a></li>`
      )
      .join('') +
    `</ul>`
  );
}

/**
 * The one notice above the posting, or none.
 *
 * Only one, deliberately. A closed posting that is also untranslated would
 * otherwise stack two warnings above the title, and the reader needs to know
 * they cannot apply before they need to know the wording is in English.
 */
function noticeFor(job, untranslated) {
  if (job.is_archived) {
    return `<div class="callout warn job-notice"><p>${escapeHtml(
      t('job.archivedNotice')
    )}</p></div>`;
  }

  if (!job.is_open) {
    const closedOn = job.closes_at
      ? t('job.closedNoticeDated', { date: formatDate(job.closes_at) })
      : t('job.closedNotice');
    return `<div class="callout warn job-notice"><p>${escapeHtml(closedOn)}</p></div>`;
  }

  if (untranslated) {
    return `<div class="callout note job-notice"><p>${escapeHtml(
      t('job.untranslatedNotice')
    )}</p></div>`;
  }

  return '';
}

/* -------------------------------------------------------------------------
 * Wiring
 * ---------------------------------------------------------------------- */

function wireActions(holder) {
  holder.querySelector('#shareJob')?.addEventListener('click', share);

  const report = holder.querySelector('#reportTranslation');
  if (report) wireReportControl(report, reportTarget);
}

function reportTarget() {
  return { targetType: 'job', targetId: payload.job.id, fields: true };
}

/**
 * Share the posting.
 *
 * The system share sheet where there is one, which on a phone is the thing
 * people expect and puts the link into whichever app they actually use. On a
 * desktop it usually is not there, so the fallback is the clipboard with a
 * confirmation, and the fallback to that is saying plainly that it did not
 * work instead of silently doing nothing.
 */
async function share() {
  const { content } = contentForLocale();
  const url = window.location.href;

  if (navigator.share) {
    try {
      await navigator.share({ title: content.title ?? '', url });
      return;
    } catch (cause) {
      // Cancelling the sheet throws, and cancelling is not a failure. Fall
      // through to the clipboard only when the sheet was never usable.
      if (cause?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    shareNote(t('job.shareCopied'));
  } catch {
    shareNote(t('job.shareFailed'));
  }
}

let shareTimer = null;

function shareNote(text) {
  const note = document.querySelector('#shareNote');
  if (!note) return;
  note.textContent = text;
  note.hidden = false;
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    note.hidden = true;
  }, 4000);
}

/* -------------------------------------------------------------------------
 * Back to results
 * ---------------------------------------------------------------------- */

/**
 * Remember the board the reader came from.
 *
 * The referrer is the whole address including the query string on a same
 * origin navigation, which is exactly what section 4 asks the back link to
 * reproduce. Stored, not read each time, so following a tag from one
 * posting to another and back still returns to the board they started on.
 */
function rememberSearch() {
  try {
    if (!document.referrer) return;
    const from = new URL(document.referrer);
    if (from.origin !== window.location.origin) return;
    if (from.pathname !== '/search') return;
    sessionStorage.setItem(LAST_SEARCH_KEY, `${from.pathname}${from.search}`);
  } catch {
    // Storage or the referrer unavailable. The link falls back to /search.
  }
}

function backTarget() {
  try {
    const stored = sessionStorage.getItem(LAST_SEARCH_KEY);
    if (typeof stored === 'string' && stored.startsWith('/search')) return stored;
  } catch {
    // Storage blocked.
  }
  return '/search';
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

async function resumeIntent() {
  // 7h and section 4: intent survives the sign in round trip. Somebody who
  // clicked report, signed in, and came back gets the form they were reaching
  // for and not a page that has forgotten what they were doing.
  //
  // Only the report intent resumes here, and only because reopening a form is
  // harmless. Nothing that opens a tab or writes a row may, per section 4:
  // there is no user gesture behind a post-login redirect.
  if (!consumeIntent('report')) return;

  const session = await applicantSession();
  if (!session?.user) return;

  openReportDialog(reportTarget());
}

/**
 * Tell the server this posting was opened, per 8.4.
 *
 * **Once per session per posting**, which is 007's rule for the event and the
 * reason the guard is a sessionStorage key instead of a flag in this module:
 * a reader who opens a posting, goes back to the board, and returns has not
 * viewed it twice in any sense an admin cares about, and this page is a real
 * document that reloads every time.
 *
 * **Never for a preview**, per deviation 48. A staff member reading their own
 * draft is not traffic, and counting it would put a number on the analytics
 * page that only ever came from the person reading the page.
 *
 * Nothing is awaited and nothing is reported. The posting is already on screen
 * by the time this runs, and a failed counter is not the reader's problem.
 */
function recordView() {
  if (!payload?.job?.id || payload.preview) return;

  const key = `gftv-careers.viewed.${payload.job.id}`;

  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Storage refused, in a private window or by a setting. Recording the view
    // anyway is the right trade: at worst a reader who reloads three times
    // counts three times, and the alternative is a board whose most private
    // readers are invisible in every number.
  }

  api('/api/public/view', {
    method: 'POST',
    locale: false,
    body: {
      job_id: payload.job.id,
      // Where the reader came from, which only this page knows: the request's
      // own Referer header would say this posting every time. Empty for a
      // direct open, which is itself worth knowing.
      referrer: document.referrer || null,
    },
  }).catch(() => {
    /* A view is a number, not the reader's business. */
  });
}

function boot() {
  payload = readPayload();
  if (!payload) return;

  rememberSearch();
  recordView();

  // Drawn on the language being applied, not immediately. shell.js
  // fetches the dictionary before it dispatches this, and drawing first would
  // put raw keys on screen for a moment: every label on this page comes from
  // t(), and the payload arrives without any of them.
  document.addEventListener('gftv:localechange', () => {
    draw();
    resumeIntent();
    markSavedCopy();
  });

  // Section 14's last updated line. Redrawn on both connection events, so it
  // appears the moment the connection drops and goes the moment it returns
  // rather than waiting for a reload.
  window.addEventListener('offline', markSavedCopy);
  window.addEventListener('online', markSavedCopy);
  markSavedCopy();

  // If the shell never boots, or the dictionary never loads, the posting still
  // has to appear. The dictionary falls back to the key, which is ugly and
  // searchable, and a posting nobody can read is worse. The delay is past the
  // 1200ms the pre-paint script waits before it reveals the page.
  setTimeout(() => {
    if (!drawn) draw();
  }, 1400);
}

/**
 * Say so when this posting is being read from the copy on the device.
 *
 * Section 14: "any cached view carries a quiet last updated timestamp so nobody
 * mistakes an old board for the current one." A posting is the most likely
 * thing in the build to be read from cache and acted on — a closing date that
 * has since moved, or a role that has since closed, is exactly the kind of
 * thing somebody would want to know was a week old.
 *
 * Only while offline. Online the worker serves the cached copy first and
 * refreshes behind it, and a stale marker that appeared for a moment on every
 * page view would be noise that nobody reads by the second week.
 *
 * The time comes from the worker rather than from a guess here. If it has none
 * — no worker in control, which is a first visit or a hard reload — nothing is
 * drawn, because "saved at some point" is not worth saying.
 */
async function markSavedCopy() {
  const holder = document.querySelector('#jobDetail');
  if (!holder) return;

  const existing = document.querySelector('#jobSavedCopy');

  if (navigator.onLine) {
    existing?.remove();
    return;
  }

  const at = await cachedAt(window.location.pathname);
  if (!at) {
    existing?.remove();
    return;
  }

  const line = existing ?? document.createElement('p');
  line.id = 'jobSavedCopy';
  line.className = 'board-cached';
  line.setAttribute('role', 'status');
  line.textContent = t('job.savedCopy', { when: formatDateTime(at) });
  if (!existing) holder.before(line);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
