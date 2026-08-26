// /account/applications, from 7g.
//
// "Every posting the applicant has applied to or started an application for,
// newest first, with status, the date they applied, and the cooldown state where
// one is active."
//
// Four things on this page are requirements, not choices:
//
//   **Bucket tabs with live counts**, so somebody can filter to what they have
//   submitted, what they started and never finished, and what is closed out. The
//   counts come from the server across every bucket, so a tab is never wrong
//   about how many are behind it.
//
//   **The link back to the posting resolves even for a closed, expired, or
//   archived role.** That is the visibility rule in 7g, and it is why this list
//   never filters on the posting's status.
//
//   **An unanswered prompt reopens the modal in place** instead of sending
//   somebody to the posting to find it. openApplyDialog takes mode: 'resume' and
//   mounts on any page, which is exactly what that requirement needs. There is
//   no second modal.
//
//   **Withdrawing goes through a confirmation that says what it does not do.**
//   7e: "Make clear on screen that withdrawing here does not delete their Google
//   Form response, and that they should contact the team if they need it
//   removed." The portal never had the response, and the panel says so before
//   the button and not after.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { formatDate } from './format.js';
import { mountAccountPage, refreshTaskBadge, pageData } from './account-shell.js';
import { jobRowHead, escapeHtml } from './account-row.js';
import { openApplyDialog, applyDialogOpen } from './apply-dialog.js';
import { confirmDangerousAction } from './danger-confirm.js';

const PATH = '/account/applications';

// The tabs, in the order somebody reads them: everything, then the two that are
// live, then the one that is over.
const TABS = ['all', 'in_progress', 'submitted', 'closed'];

let user = null;
let bucket = 'all';
let payload = null;

// The session mountAccountPage handed back. Offline it is the profile saved on
// this device rather than one the server confirmed, which is what makes this
// page readable with no connection.
let mounted = null;

async function boot() {
  const session = await mountAccountPage({ current: PATH });
  if (!session) return;

  mounted = session;
  user = session.user;

  // The tab is in the address bar, so a link somebody keeps or shares reopens
  // the list they were looking at. Same rule the board follows.
  const requested = new URL(window.location.href).searchParams.get('bucket');
  if (requested && TABS.includes(requested)) bucket = requested;

  await load();

  // Everything on this page writes its own strings instead of carrying
  // data-i18n attributes, because the wording depends on the row's state as
  // well as on the language. So a language change is a redraw, and it redraws
  // from the payload already in hand without fetching again.
  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });

  // Answering the prompt from a row changes that row's state, and the modal has
  // no idea which page it is standing on. It says what happened; this reloads.
  document.addEventListener('gftv:applychange', () => load());
}

/* -------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------- */

async function load() {
  const list = document.querySelector('#applicationList');
  list?.setAttribute('aria-busy', 'true');

  // Every bucket is fetched, not just the one being shown, and the server
  // filters. The counts come back with it, so the tabs and the list are one
  // answer, not two that can disagree.
  const result = await api(
    `/api/applications/mine?with_jobs=true&bucket=${encodeURIComponent(bucket)}`
  );

  list?.removeAttribute('aria-busy');

  // Section 14: My applications comes from a local copy of the applicant's own
  // data when there is no connection, marked with the time it was cached.
  const resolved = await pageData(mounted, 'applications', result);

  const error = document.querySelector('#applicationsError');
  if (!resolved) {
    if (error) {
      error.textContent = result.error?.message ?? t('error.unexpected');
      error.hidden = false;
    }
    return;
  }

  if (error) error.hidden = true;
  payload = resolved.data;
  draw();
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function draw() {
  drawTabs();

  const list = document.querySelector('#applicationList');
  const empty = document.querySelector('#applicationsEmpty');
  if (!list) return;

  const rows = payload.applications ?? [];
  const nothingAtAll = (payload.counts?.all ?? 0) === 0;

  // Two different empty states, and they are not the same news. Nothing at all
  // means go and find a role; nothing in this bucket means the other tabs have
  // your applications in them.
  if (empty) empty.hidden = !nothingAtAll;

  if (rows.length === 0) {
    list.innerHTML = nothingAtAll
      ? ''
      : `<p class="muted account-empty-bucket">${escapeHtml(t('applications.emptyBucket'))}</p>`;
    return;
  }

  list.innerHTML = rows.map(rowMarkup).join('');
  hydrateIcons(list);
  wireRows(list);
}

function drawTabs() {
  const holder = document.querySelector('#bucketTabs');
  if (!holder) return;

  const counts = payload?.counts ?? {};

  holder.innerHTML = TABS.map((name) => {
    const current = name === bucket;
    return (
      `<button type="button" class="bucket-tab" role="tab" data-bucket="${name}"` +
      ` aria-selected="${current}"${current ? '' : ' tabindex="-1"'}>` +
      `<span>${escapeHtml(t(`applications.bucket_${name}`))}</span>` +
      `<span class="bucket-count">${counts[name] ?? 0}</span>` +
      `</button>`
    );
  }).join('');

  holder.querySelectorAll('[data-bucket]').forEach((tab) => {
    tab.addEventListener('click', () => {
      bucket = tab.getAttribute('data-bucket');
      writeBucketToUrl();
      load();
    });
  });
}

/**
 * Keep the tab in the address bar.
 *
 * replaceState over pushState, matching the board: pressing back after
 * flipping through four tabs leaves the page and does not undo one tab, and
 * that is the specified behaviour, not an oversight.
 */
function writeBucketToUrl() {
  try {
    const url = new URL(window.location.href);
    if (bucket === 'all') url.searchParams.delete('bucket');
    else url.searchParams.set('bucket', bucket);

    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}`);
  } catch {
    // Untidy, not broken.
  }
}

function rowMarkup(row) {
  const job = row.job;

  return `
    <article class="glass-card account-row" data-job-id="${escapeHtml(job.id)}"
             data-status="${escapeHtml(row.status)}">
      ${jobRowHead(job)}

      <div class="account-row-state">
        <span class="status-pill status-${escapeHtml(row.status)}">
          ${escapeHtml(statusLabel(row.status))}
        </span>
        <span class="account-row-dates">${escapeHtml(datesLine(row))}</span>
      </div>

      ${
        row.in_cooldown
          ? `<p class="account-row-note">${iconMarkup('clock', { size: 16 })}<span>${escapeHtml(
              t('apply.cooldownUntil', { until: formatDate(row.cooldown_until) })
            )}</span></p>`
          : ''
      }

      <div class="account-row-actions">
        ${
          row.pending_id
            ? `<button type="button" class="btn btn-secondary" data-answer-prompt="${escapeHtml(
                row.pending_id
              )}">${escapeHtml(t('applications.answerPrompt'))}</button>`
            : ''
        }
        ${
          canWithdraw(row.status)
            ? `<button type="button" class="btn btn-quiet" data-withdraw="${escapeHtml(
                job.id
              )}">${escapeHtml(t('applications.withdrawAction'))}</button>`
            : ''
        }
      </div>
    </article>`;
}

/**
 * Whether withdrawing is offered.
 *
 * Not offered on a row that is already withdrawn, and not on one the team has
 * closed out: withdrawing from a role you were not offered is not a thing to
 * ask somebody whether they are sure about. The server refuses nothing here,
 * because withdrawing from a closed row is harmless; this is about not putting
 * a pointless button in front of somebody.
 */
function canWithdraw(status) {
  return !['withdrawn', 'rejected', 'accepted'].includes(status);
}

function statusLabel(status) {
  const key = `status.${status}`;
  const label = t(key);
  // An unknown status renders as nothing instead of as its own key. A status
  // added in phase 7 without a dictionary entry should look plain, not broken.
  return label === key ? '' : label;
}

/** The one line of dates a row carries. Applied beats started, when both exist. */
function datesLine(row) {
  if (row.applied_at) return t('applications.appliedOn', { date: formatDate(row.applied_at) });
  if (row.started_at) return t('applications.startedOn', { date: formatDate(row.started_at) });
  return '';
}

/* -------------------------------------------------------------------------
 * Acting on a row
 * ---------------------------------------------------------------------- */

function wireRows(list) {
  list.querySelectorAll('[data-answer-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      if (applyDialogOpen()) return;

      const row = findRow(button.closest('[data-job-id]')?.getAttribute('data-job-id'));
      if (!row) return;

      // The same modal 7c opens everywhere else, in place. Not a second one.
      openApplyDialog({
        mode: 'resume',
        jobId: row.job_id,
        jobTitle: row.job?.title ?? '',
        analyticsId: button.getAttribute('data-answer-prompt'),
        rating: row.rating ?? null,
      });
    });
  });

  list.querySelectorAll('[data-withdraw]').forEach((button) => {
    button.addEventListener('click', () => withdraw(button.getAttribute('data-withdraw')));
  });
}

function findRow(jobId) {
  return (payload?.applications ?? []).find((row) => row.job_id === jobId) ?? null;
}

/**
 * Withdraw, behind the three step confirmation.
 *
 * The same component the danger zone uses, and deliberately so: 7e's warning
 * about the Google Form response is the kind of thing people click past, and
 * the typed username is what stops it happening by muscle memory on a list.
 *
 * The password step is part of that component and the endpoint does not ask for
 * one, which is the one place this differs from the danger zone. Withdrawing is
 * reversible by applying again, so it does not need a credential; what it needs
 * is for the consequences to be read.
 */
async function withdraw(jobId) {
  const row = findRow(jobId);
  if (!row) return;

  const confirmed = await confirmDangerousAction({
    title: t('applications.withdrawTitle', { title: row.job?.title ?? '' }),
    consequences: [
      t('applications.withdrawConsequence1'),
      t('applications.withdrawConsequence2'),
      t('applications.withdrawConsequence3'),
    ],
    irreversible: t('applications.withdrawForms'),
    confirmLabel: t('applications.withdrawAction'),
    username: user.username,
    // Withdrawing is not a credentialled action. The consequences and the typed
    // username are the whole ritual here.
    skipPassword: true,
  });

  if (!confirmed) return;

  const result = await api('/api/applications/withdraw', {
    method: 'POST',
    locale: false,
    body: { job_id: jobId },
  });

  const error = document.querySelector('#applicationsError');
  if (!result.ok) {
    if (error) {
      error.textContent = result.error?.message ?? t('error.unexpected');
      error.hidden = false;
    }
    return;
  }

  // Withdrawing answers any outstanding prompt for the posting, so the badge on
  // the account navigation is now out of date.
  refreshTaskBadge();
  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
