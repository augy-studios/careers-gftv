// One job card, used by the home page and by the board.
//
// Written once because two renderers drift. The home page's "latest openings"
// grid and /search show the same postings, and a reader who has learned to read
// one card should not have to learn the other.
//
// What section 4 says a card carries: title, department, location, commitment
// type, posted date, closing date, and up to four tag pills. Clicking a tag
// pill filters by that tag and does not open the job.
//
// That last requirement is what shapes the markup. A card cannot be one big
// anchor with more anchors inside it, because nested links are invalid and
// browsers recover from them unpredictably. So the card is an <article>, the
// title is the only link, and the title's link is stretched over the whole card
// with a pseudo element in app.css. The tag pills sit above it on the z axis
// and stay clickable in their own right.
//
// Where the card links to: /jobs/{uuid}, which is phase 4. Until that ships the
// route renders the placeholder page in the normal layout, which is exactly
// what section 0c's unbuilt route handling is for. Nothing here changes when
// phase 4 lands; the placeholder simply stops appearing.

import { t, getLocale, DEFAULT_LOCALE } from './i18n.js';
import { iconMarkup } from './icons.js';
import { closingText, postedText, commitmentLabel } from './format.js';
import { saveButtonMarkup, mountSaveButtons } from './save-button.js';

/**
 * Build one card.
 *
 * @param {object} job a row from /api/public/search
 * @param {{ showHeadline?: boolean }} [options] the headline is the search
 *        snippet with the matched terms marked. Off on the home page, which
 *        has no query to have matched anything.
 * @returns {HTMLElement}
 */
export function jobCard(job, options = {}) {
  const card = document.createElement('article');
  card.className = 'glass-card job-card';
  card.setAttribute('data-job-id', job.id);

  const closing = closingText(job.closes_at);
  const posted = postedText(job.published_at);
  const commitment = commitmentLabel(job.commitment_type);

  // Section 4: up to four. The rest are counted, not dropped silently,
  // so a posting with nine tags does not look like a posting with four.
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const shown = tags.slice(0, 4);
  const hidden = tags.length - shown.length;

  card.innerHTML = `
    <div class="job-card-badges">
      ${
        job.is_paid
          ? `<span class="badge badge-paid">${escapeHtml(t('job.paidBadge'))}</span>`
          : `<span class="badge badge-unpaid">${escapeHtml(t('job.unpaidBadge'))}</span>`
      }
      ${
        // Only ever shown when the reader has asked for a language this posting
        // has no ready translation for. It is a statement about this posting,
        // not about the site, and 3a is emphatic that being findable and
        // badged beats being hidden.
        job.has_translation === false && !isDefaultLanguageReader()
          ? `<span class="badge badge-untranslated">${escapeHtml(
              t('job.untranslatedBadge')
            )}</span>`
          : ''
      }
    </div>

    <!-- 7g's save toggle. It sits outside the title's stretched link and
         not inside the badges row, because a control inside the area the
         stretched link covers is unreachable: the pseudo element in app.css
         paints over the whole card, and only things lifted above it on the z
         axis, like the tag pills, stay clickable. -->
    <div class="job-card-save">${saveButtonMarkup(job.id)}</div>

    <h3 class="job-card-title">
      <a href="/jobs/${encodeURIComponent(job.id)}">${escapeHtml(job.title ?? '')}</a>
    </h3>

    <p class="job-card-summary">${
      options.showHeadline && job.headline
        ? // The one field on this page assigned as markup. It arrives already
          // sanitised by api/_lib/jobs.js, which escapes everything except the
          // <mark> tags ts_headline put in. Do not point this at any other
          // field, and do not stop escaping it on the server.
          job.headline
        : escapeHtml(truncate(job.summary ?? '', 240))
    }</p>

    <ul class="job-card-meta">
      ${
        job.department
          ? metaItem('briefcase', job.department.name)
          : ''
      }
      ${metaItem('pin', locationText(job))}
      ${commitment ? metaItem('clock', commitment) : ''}
    </ul>

    <div class="job-card-foot">
      <span class="job-card-dates">
        ${posted ? `<span class="job-card-posted">${escapeHtml(posted)}</span>` : ''}
        ${
          closing.text
            ? `<span class="job-card-closing${
                closing.urgent ? ' urgent' : ''
              }${closing.openEnded ? ' open-ended' : ''}">${escapeHtml(
                closing.text
              )}</span>`
            : ''
        }
      </span>

      ${
        shown.length > 0
          ? `<ul class="job-card-tags">
              ${shown
                .map(
                  (tag) =>
                    `<li><a class="chip chip-tag" href="/search?tags=${encodeURIComponent(
                      tag.slug
                    )}" data-tag-slug="${escapeAttr(tag.slug)}">${escapeHtml(
                      tag.name
                    )}</a></li>`
                )
                .join('')}
              ${
                hidden > 0
                  ? `<li><span class="chip chip-more">${escapeHtml(
                      t('job.moreTags', { count: hidden })
                    )}</span></li>`
                  : ''
              }
            </ul>`
          : ''
      }
    </div>
  `;

  return card;
}

/**
 * Render a list of jobs into a container, replacing whatever was there.
 * @param {Element} container
 * @param {object[]} jobs
 * @param {{ showHeadline?: boolean }} [options]
 */
export function renderJobCards(container, jobs, options = {}) {
  container.replaceChildren(...jobs.map((job) => jobCard(job, options)));
  container.removeAttribute('aria-busy');

  // Not awaited. The cards are on screen; whether this reader has saved any of
  // them is a correction in place, exactly as the cooldown badge is.
  mountSaveButtons(container);
}

/* -------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------- */

function metaItem(icon, value) {
  if (!value) return '';
  return `<li>${iconMarkup(icon, { size: 15 })}<span>${escapeHtml(value)}</span></li>`;
}

/**
 * Where the role is. Remote and a place are not exclusive: a role can be remote
 * and still be tied to a timezone or a country, and a posting that says both
 * should show both.
 */
function locationText(job) {
  const parts = [];
  if (job.location) parts.push(job.location);
  if (job.is_remote && !/remote|远程/i.test(job.location ?? '')) {
    parts.push(t('job.remote'));
  }
  return parts.join(' · ');
}

/**
 * Whether the reader is looking at the site in the language postings are
 * written in. The untranslated badge is meaningless to them: every posting
 * would carry it, since has_translation is false for the default language by
 * definition, there being no translation row for it.
 */
function isDefaultLanguageReader() {
  return getLocale() === DEFAULT_LOCALE;
}

/**
 * Cut at a word boundary instead of mid word, and only when there is something
 * to cut. The server already caps the snippet; this is for the summary, which
 * arrives whole.
 */
function truncate(value, max) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // No spaces at all is the ordinary case for Chinese, where cutting anywhere
  // is a valid character boundary and there is no word boundary to find.
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
