// /admin, the overview. Section 8.1.
//
// "Counts of published jobs, open applications by status, recent applications,
// recent registrations. Simple stat cards plus a recent activity table. Present
// the applicant pipeline as bucket tabs with live counts so an admin can jump
// straight into any bucket, and carry the same bucket tabs into the applicant
// tracking page."
//
// The bucket tabs here are links, not tabs, and that is the difference
// worth stating: on the tracking page they filter the list underneath them, and
// here there is no list to filter. Drawing them as tabs that navigate would be
// a control that lies about what it does, so each one is a link to the tracking
// page already filtered, which is what 8.1 means by "jump straight into any
// bucket".

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { escapeHtml } from './markdown.js';
import { formatDate } from './format.js';
import { mountAdminPage, adminMessage, emptyRow } from './admin-shell.js';

const PATH = '/admin';

/** The nine statuses, in pipeline order, as the tracking page has them. */
const BUCKETS = [
  'started',
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
];

let payload = null;

async function boot() {
  const context = await mountAdminPage({ current: PATH });
  if (!context) return;

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });
}

async function load() {
  const result = await api('/api/admin/stats');

  if (!result.ok) {
    adminMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  payload = result.data;
  draw();
}

function draw() {
  drawPostings();
  drawBuckets();
  drawRecentApplications();
  drawRecentRegistrations();
}

/* -------------------------------------------------------------------------
 * The stat cards
 * ---------------------------------------------------------------------- */

function drawPostings() {
  const holder = document.querySelector('#adminPostingStats');
  if (!holder) return;

  const counts = payload?.postings ?? {};

  // Each tile links where an admin would go next after reading it, which is
  // what makes a number on a dashboard useful and not decorative.
  const tiles = [
    { key: 'published', value: counts.published, href: '/admin/jobs?status=published' },
    { key: 'draft', value: counts.draft, href: '/admin/jobs?status=draft' },
    { key: 'closingSoon', value: counts.closing_soon, href: '/admin/jobs?sort=closing' },
    { key: 'noDeadline', value: counts.no_deadline, href: '/admin/jobs?sort=closing' },
  ];

  holder.innerHTML = tiles
    .map(
      (tile) =>
        `<a class="glass-card admin-stat" href="${tile.href}">` +
        `<span class="admin-stat-value tabular">${escapeHtml(String(tile.value ?? 0))}</span>` +
        `<span class="admin-stat-label">${escapeHtml(t(`admin.stat_${tile.key}`))}</span>` +
        `</a>`
    )
    .join('');

  // The one number that is a queue and not a count: drafts that cannot be
  // published because they have no application form yet. Shown only when there
  // are any, since a zero here is not news.
  const blocked = document.querySelector('#adminBlockedDrafts');
  if (blocked) {
    const count = counts.draft_without_form ?? 0;
    blocked.hidden = count === 0;
    if (count > 0) {
      blocked.innerHTML = `<p>${escapeHtml(t('admin.draftsWithoutForm', { count }))} <a href="/admin/jobs?status=draft">${escapeHtml(
        t('admin.openDrafts')
      )}</a></p>`;
    }
  }
}

function drawBuckets() {
  const holder = document.querySelector('#adminBuckets');
  if (!holder) return;

  const counts = payload?.applications_by_status ?? {};

  holder.innerHTML = [
    `<a class="bucket-tab" href="/admin/applications">` +
      `<span>${escapeHtml(t('admin.bucket_all'))}</span>` +
      `<span class="bucket-count">${counts.all ?? 0}</span></a>`,
    ...BUCKETS.map(
      (bucket) =>
        `<a class="bucket-tab" href="/admin/applications?status=${bucket}">` +
        `<span>${escapeHtml(t(`status.${bucket}`))}</span>` +
        `<span class="bucket-count">${counts[bucket] ?? 0}</span></a>`
    ),
  ].join('');
}

/* -------------------------------------------------------------------------
 * The two recent lists
 * ---------------------------------------------------------------------- */

function drawRecentApplications() {
  const holder = document.querySelector('#adminRecentApplications');
  if (!holder) return;

  const rows = payload?.recent_applications ?? [];
  if (rows.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noRecentApplications'));
    return;
  }

  holder.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('admin.colApplicant'))}</th>
          <th scope="col">${escapeHtml(t('admin.colRole'))}</th>
          <th scope="col">${escapeHtml(t('admin.colStatus'))}</th>
          <th scope="col">${escapeHtml(t('admin.colUpdated'))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.applicant?.display_name ?? t('admin.deletedAccount'))}
              <span class="muted admin-sub">${escapeHtml(row.applicant?.username ?? '')}</span></td>
            <td>${
              row.job
                ? `<a href="/admin/applications?job=${encodeURIComponent(row.job.id)}">${escapeHtml(
                    row.job.title
                  )}</a>`
                : escapeHtml(t('admin.deletedPosting'))
            }</td>
            <td><span class="status-pill status-${escapeHtml(row.status)}">${escapeHtml(
              t(`status.${row.status}`)
            )}</span></td>
            <td class="tabular">${escapeHtml(formatDate(row.updated_at))}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function drawRecentRegistrations() {
  const holder = document.querySelector('#adminRecentRegistrations');
  if (!holder) return;

  const rows = payload?.recent_registrations ?? [];
  if (rows.length === 0) {
    holder.innerHTML = emptyRow(t('admin.noRecentRegistrations'));
    return;
  }

  // A list of who has arrived, and nothing more. No email and no phone: 8.9's
  // applicant users page is where an account is looked at, and that page is
  // admins only, so an overview a job poster can see must not be a contact
  // list. The server does not send them either.
  holder.innerHTML = `
    <ul class="admin-people">
      ${rows
        .map(
          (row) => `
        <li>
          <span class="admin-person-name">${escapeHtml(row.display_name ?? '')}</span>
          <span class="muted admin-sub">${escapeHtml(row.username)}</span>
          <span class="muted tabular">${escapeHtml(formatDate(row.created_at))}</span>
          ${
            row.is_active
              ? ''
              : `<span class="badge badge-closed">${escapeHtml(t('admin.deactivated'))}</span>`
          }
        </li>`
        )
        .join('')}
    </ul>`;

  hydrateIcons(holder);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
