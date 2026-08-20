// One posting, as a row on a dashboard list.
//
// Written once because three pages show the same thing: My applications, Saved
// roles, and the items on Outstanding tasks that are about a posting. A reader
// who has learned to read one of them should not have to learn the other two.
//
// Not assets/js/job-card.js, and the difference is worth stating so the two do
// not get merged later. A card is a posting being advertised: it sells the role,
// carries a summary, tag pills, and a save control, and is built from a public
// search result. A row is a posting the reader already has a relationship with:
// what matters is which one it is, what state it is in, and what they can do
// about it now. The summary and the tags would be noise on a list somebody is
// scanning for the one they applied to in March.
//
// 7g's rule that shapes it: **the link must resolve for a posting that has since
// closed, expired, or been archived**, so an applicant can always reread what
// they applied for. Nothing here checks the status before drawing the link,
// because the visibility rule in api/_lib/job-detail.js already grants it to
// anybody with history, and history is exactly what put the row on this page.

import { t } from './i18n.js';
import { iconMarkup } from './icons.js';
import { formatDate, commitmentLabel } from './format.js';

/**
 * The head of a row: the title, where it sits, and whether it is still open.
 *
 * @param {object} job a summary from api/_lib/dashboard.js
 * @returns {string} markup
 */
export function jobRowHead(job) {
  return `
    <div class="account-row-head">
      <h3 class="account-row-title">
        <a href="/jobs/${encodeURIComponent(job.id)}">${escapeHtml(job.title ?? '')}</a>
      </h3>
      <div class="account-row-badges">
        ${statusBadge(job)}
      </div>
    </div>
    <ul class="account-row-meta">
      ${job.department ? metaItem('briefcase', job.department.name) : ''}
      ${metaItem('pin', locationText(job))}
      ${metaItem('clock', commitmentLabel(job.commitment_type))}
    </ul>`;
}

/**
 * The badge saying whether the posting is still taking applications.
 *
 * 7g asks for it on saved roles: a posting that has closed "stays visible with a
 * clear no longer accepting applications badge rather than vanishing from the
 * list". The same badge is right on My applications, where a role closing is
 * often the answer to "why have I not heard anything".
 *
 * is_open is resolved on the server, because it needs the status and the clock
 * together and a null closes_at is open until filled and never expires.
 */
function statusBadge(job) {
  if (job.is_archived) {
    return `<span class="badge badge-closed">${escapeHtml(t('account.jobArchived'))}</span>`;
  }
  if (!job.is_open) {
    return `<span class="badge badge-closed">${escapeHtml(t('account.jobClosed'))}</span>`;
  }
  if (job.closes_at) {
    return `<span class="badge badge-open">${escapeHtml(
      t('account.jobClosesOn', { date: formatDate(job.closes_at) })
    )}</span>`;
  }
  return `<span class="badge badge-open">${escapeHtml(t('job.openUntilFilled'))}</span>`;
}

function metaItem(icon, value) {
  if (!value) return '';
  return `<li>${iconMarkup(icon, { size: 15 })}<span>${escapeHtml(value)}</span></li>`;
}

/**
 * Where the role is. Remote and a place are not exclusive, exactly as on a
 * card: a role can be remote and still tied to a timezone or a country.
 */
function locationText(job) {
  const parts = [];
  if (job.location) parts.push(job.location);
  if (job.is_remote && !/remote|远程/i.test(job.location ?? '')) parts.push(t('job.remote'));
  return parts.join(' · ');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
