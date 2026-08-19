// The cooldown, on a card.
//
// 7f, one sentence: "Show the same on the card in the search results, so nobody
// clicks through only to be turned away." The board and the home page both
// render assets/js/job-card.js, so both call this after they render.
//
// It is a pass over cards that already exist rather than something job-card.js
// does itself, and that separation is on purpose. A card is built from a search
// result, which is public, cacheable, and the same for everybody; this is per
// applicant and per session. Folding it into the card would mean every renderer
// of a card needed a session before it could draw one, which would put a
// request in front of the board for the majority of readers who have no
// applications at all.
//
// One request per page load, shared between the two callers and between
// redraws, so switching language does not fetch it again.

import { api, applicantSession } from './api.js';
import { t } from './i18n.js';
import { formatDate } from './format.js';

let promise = null;

/**
 * The applicant's tracking rows, as a job id to row map. Empty for anybody
 * signed out, which is most readers and costs them no request.
 * @returns {Promise<Map<string, object>>}
 */
function myApplications() {
  if (promise) return promise;

  promise = applicantSession()
    .then((session) => {
      if (!session?.user) return null;
      return api('/api/applications/mine', { locale: false });
    })
    .then((result) => {
      const map = new Map();
      if (!result?.ok) return map;
      for (const row of result.data.applications ?? []) map.set(row.job_id, row);
      return map;
    });

  return promise;
}

/**
 * Mark every card in a container that this applicant cannot apply to yet.
 *
 * Only the cooldown, deliberately. An unanswered prompt is not a reason to stop
 * somebody opening a posting, and the modal is going to reach them on this page
 * anyway through the shared script in apply-prompt.js, so a badge saying so
 * would be the same news twice.
 *
 * @param {ParentNode} container
 */
export async function markAppliedCards(container) {
  const cards = [...container.querySelectorAll('[data-job-id]')];
  if (cards.length === 0) return;

  const mine = await myApplications();
  if (mine.size === 0) return;

  for (const card of cards) {
    const row = mine.get(card.getAttribute('data-job-id'));
    if (!row?.in_cooldown) continue;

    // The badges row is where the paid and untranslated badges already sit, so
    // this reads as one more fact about the posting rather than as a warning
    // bolted onto the card.
    const badges = card.querySelector('.job-card-badges');
    if (!badges || badges.querySelector('.badge-cooldown')) continue;

    const badge = document.createElement('span');
    badge.className = 'badge badge-cooldown';
    badge.textContent = t('apply.cardCooldown', { until: formatDate(row.cooldown_until) });
    badges.append(badge);
  }
}

/** Forget the cached answer, for when an application has just changed. */
export function refreshAppliedCards() {
  promise = null;
}

// Answering Yes starts a cooldown, and the board behind the modal is now out of
// date. Cheap to drop the cache; the next render picks up the new state.
document.addEventListener('gftv:applychange', refreshAppliedCards);
