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
import { formatDate, formatDateTime, hoursSince } from './format.js';
import { mountAdminPage, adminApiError, adminMessage, emptyRow } from './admin-shell.js';

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
    adminApiError(result.error);
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
  drawCron();
  drawOutbox();
}

/* -------------------------------------------------------------------------
 * The last maintenance run, section 11's last line
 * ---------------------------------------------------------------------- */

/**
 * How long after a run this panel starts saying the schedule looks stuck.
 *
 * The cron is daily and Vercel fires it within roughly an hour of the stated
 * time, so a healthy gap is twenty four to twenty five hours. Thirty six leaves
 * room for a late fire and a clock difference without letting a schedule that
 * has genuinely stopped sit quietly for a second day.
 */
const CRON_STALE_HOURS = 36;

/**
 * The panel that makes a silent failure visible.
 *
 * A cron has no reader, which is the whole reason this exists: every other
 * route in the build reports to somebody who is waiting, and a scheduled task
 * that stops firing is invisible until somebody wonders why a posting is still
 * open. So this panel is written to distinguish states that all look like
 * "nothing here" and mean completely different things:
 *
 *   could not be read  the query failed. Not a claim about the cron at all.
 *   never run          the table is readable and empty.
 *   switched off       an admin flipped `cron` on /admin/maintenance.
 *   did not finish     a started_at with no finished_at. Killed mid-pass.
 *   failed             it ran and a task threw.
 *   stale              it succeeded, but too long ago for a daily schedule.
 *   ok                 it ran, recently, and everything worked.
 */
function drawCron() {
  const holder = document.querySelector('#adminCronRun');
  if (!holder) return;

  const cron = payload?.cron ?? null;

  if (!cron?.readable) {
    holder.className = 'callout warn';
    holder.innerHTML = `<p>${escapeHtml(t('admin.cronUnreadable'))}</p>`;
    return;
  }

  const run = cron.run;

  if (!run) {
    holder.className = 'callout warn';
    holder.innerHTML = `<p>${escapeHtml(t('admin.cronNever'))}</p>`;
    return;
  }

  const when = escapeHtml(formatDateTime(run.started_at));
  const age = hoursSince(run.started_at);
  const results = run.results ?? {};

  let tone = 'note';
  let headline;

  if (results.skipped) {
    // Recorded on purpose rather than left as no run at all. Without this the
    // panel would say the same thing for "an admin switched it off" and "the
    // scheduler is broken", which need opposite responses.
    tone = 'warn';
    headline = t('admin.cronSwitchedOff', { when });
  } else if (!run.finished_at) {
    tone = 'warn';
    headline = t('admin.cronUnfinished', { when });
  } else if (run.ok === false) {
    tone = 'error';
    headline = t('admin.cronFailed', { when });
  } else if (age !== null && age > CRON_STALE_HOURS) {
    tone = 'warn';
    headline = t('admin.cronStale', { when, hours: Math.round(age) });
  } else {
    headline = t('admin.cronOk', { when });
  }

  // A run that completed while postings sit with an unusable form is not a
  // clean thing to look at, so the tone follows the standing state as well as
  // the run itself. Only ever a bump: an error stays an error, a warn stays a
  // warn, and a null — the task failed and reported no number — is not a claim
  // that anything is broken, so it does not bump either.
  if (tone === 'note' && results.form_checks_failed > 0) tone = 'warn';

  const parts = [`<p>${escapeHtml(headline)}</p>`];

  if (run.error) {
    parts.push(`<p class="muted">${escapeHtml(run.error)}</p>`);
  }

  // The counts, only where the run actually reported one. A null means the task
  // failed and nothing here turns that into a zero: "closed nothing" and "could
  // not tell you" are different sentences and only one of them is true.
  const counts = [
    ['cronClosed', results.auto_closed],
    ['cronTimedOut', results.prompts_timed_out],
    ['cronSwept', results.expired_rows_deleted],
    ['cronFormsChecked', results.forms_checked],
    // Standing state, not news, and it is here because the flagged list below
    // is news: cron.js only names a posting whose state *changed* on this run,
    // so a form that broke last week is in neither the list nor, until this
    // line existed, anywhere else on the page. Nine unusable forms and a panel
    // reading "9 application forms checked" is the exact failure this panel is
    // for — looking the same whether things are working or not.
    ['cronFormsFailed', results.form_checks_failed],
  ].filter(([, value]) => typeof value === 'number');

  if (counts.length > 0) {
    parts.push(
      `<ul class="admin-cron-counts">${counts
        .map(
          ([key, value]) =>
            `<li>${escapeHtml(t(`admin.${key}`, { count: value }))}</li>`
        )
        .join('')}</ul>`
    );
  }

  // Postings whose application form is not usable. The one thing in this panel
  // that is a queue rather than a number, so it links where the work is.
  const flagged = Array.isArray(results.flagged_postings) ? results.flagged_postings : [];

  if (flagged.length > 0) {
    parts.push(
      `<p>${escapeHtml(t('admin.cronFlagged', { count: flagged.length }))}</p>` +
        `<ul class="admin-cron-flagged">${flagged
          .map(
            (posting) =>
              `<li><a href="/admin/jobs/edit?id=${encodeURIComponent(posting.id)}">${escapeHtml(
                posting.title ?? ''
              )}</a> <span class="muted">${escapeHtml(
                t(`admin.formCheck_${posting.state}`)
              )}</span></li>`
          )
          .join('')}</ul>`
    );
  }

  holder.className = `callout ${tone}`;
  holder.innerHTML = parts.join('');
}

/* -------------------------------------------------------------------------
 * The Telegram outbox, section 15 and phase 11 part 4
 * ---------------------------------------------------------------------- */

/**
 * How long a row may sit queued before this panel says the drain looks stuck.
 *
 * The bot polls every twenty seconds and retries a failure for about twenty
 * minutes before giving up, so anything still queued after half an hour is not
 * a slow pass. It is either a bot that is not running or a kind this build of
 * the bot does not know how to send, and both need somebody to look.
 */
const OUTBOX_STALE_MINUTES = 30;

/**
 * The panel that makes a bot nobody can see visible.
 *
 * The same job as the cron panel above it and one degree harder. The cron at
 * least runs on this deployment; the drain runs on a VPS that this repository
 * does not deploy to and cannot ask anything of, so what is drawn here is
 * inferred entirely from the state of the queue:
 *
 *   could not be read  the query failed. Not a claim about the bot at all.
 *   nothing yet        the table is readable and nothing has ever been queued.
 *   failed             rows gave up after their retries. Section 15's "left
 *                      failed for an admin to see", and this is the admin.
 *   stuck              rows are queued and the oldest is older than a drain
 *                      that is running could explain.
 *   working            things are moving, or there is nothing to move.
 *
 * A failure outranks a stuck queue: a queue that is not moving is usually the
 * bot being restarted, and a row that has exhausted its attempts is somebody
 * who was told nothing.
 */
function drawOutbox() {
  const holder = document.querySelector('#adminOutbox');
  if (!holder) return;

  const outbox = payload?.outbox ?? null;

  if (!outbox?.readable) {
    holder.className = 'callout warn';
    holder.innerHTML = `<p>${escapeHtml(t('admin.outboxUnreadable'))}</p>`;
    return;
  }

  const summary = outbox.summary ?? {};
  const queued = summary.queued ?? 0;
  const claimed = summary.claimed ?? 0;
  const failed = summary.failed ?? 0;
  const sent = summary.sent_recently ?? 0;
  const skipped = summary.skipped_recently ?? 0;

  const waitingMinutes = summary.oldest_queued_at
    ? Math.round((hoursSince(summary.oldest_queued_at) ?? 0) * 60)
    : null;

  let tone = 'note';
  let headline;

  if (failed > 0) {
    tone = 'error';
    headline = t('admin.outboxFailed', { count: failed });
  } else if (waitingMinutes !== null && waitingMinutes > OUTBOX_STALE_MINUTES) {
    tone = 'warn';
    headline = t('admin.outboxStuck', {
      count: queued,
      when: formatDateTime(summary.oldest_queued_at),
    });
  } else if (queued + claimed + sent + skipped === 0) {
    // Nothing has been sent and nothing is waiting. Said plainly rather than
    // drawn as a healthy queue, because an empty table and a working bot look
    // identical from here and only one of them has been demonstrated.
    headline = t('admin.outboxNothing');
  } else {
    headline = t('admin.outboxOk', { count: sent });
  }

  const parts = [`<p>${escapeHtml(headline)}</p>`];

  const counts = [
    ['outboxQueued', queued],
    // Claimed is in here rather than folded into queued because they are
    // different claims: a queued row is waiting for the bot, and a claimed one
    // is in its hands, either being sent now or waiting out a backoff.
    ['outboxClaimed', claimed],
    ['outboxSkipped', skipped],
  ].filter(([, value]) => typeof value === 'number' && value > 0);

  if (counts.length > 0) {
    parts.push(
      `<ul class="admin-cron-counts">${counts
        .map(([key, value]) => `<li>${escapeHtml(t(`admin.${key}`, { count: value }))}</li>`)
        .join('')}</ul>`
    );
  }

  // The failures themselves, which are the only thing on this panel somebody
  // can act on. No applicant is named, deliberately: this page is open to job
  // posters and a list of who is being messaged is not.
  const failures = Array.isArray(summary.recent_failures) ? summary.recent_failures : [];

  if (failures.length > 0) {
    parts.push(
      `<ul class="admin-cron-flagged">${failures
        .map(
          (row) =>
            `<li><strong>${escapeHtml(row.kind ?? '')}</strong> ` +
            `<span class="muted">${escapeHtml(
              t('admin.outboxFailureLine', {
                when: formatDateTime(row.created_at),
                attempts: row.attempts ?? 0,
              })
            )}</span>` +
            (row.error ? `<br><span class="muted">${escapeHtml(row.error)}</span>` : '') +
            '</li>'
        )
        .join('')}</ul>`
    );
  }

  holder.className = `callout ${tone}`;
  holder.innerHTML = parts.join('');
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
