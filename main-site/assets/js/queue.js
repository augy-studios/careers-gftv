// Section 14's queued actions: the rating and the Yes or No, sent when the
// connection comes back.
//
// Two actions and no more, both from the handoff modal in 7c:
//
//   rating   POST /api/ratings/upsert        { job_id, rating }
//   answer   POST /api/applications/respond  { analytics_id, answer }
//
// **Nothing else is ever queued, and that is a decision rather than a
// limitation.** Section 6 says the offline story is for the public surface and
// that a dashboard write is never queued. Replying to a task is permitted by
// section 14 and is a task reply rather than a dashboard write, but it is also
// a free text answer against a question set that may have changed, so it is not
// here either: the honest version of that offline is a disabled control with
// the reason on it, which is part 9's.
//
// ---------------------------------------------------------------------------
// The three rules that matter
// ---------------------------------------------------------------------------
//
// **1. A queued answer is pending, not done.** Section 14 in as many words: "a
// queued answer still counts as pending until the server confirms it. Do not
// start the reapply cooldown from a local queue entry." Five things in this
// build write `applied_at` and `cooldown_until` and **this is not a sixth**.
// The Apply control shows a queued answer as waiting to be sent, and only the
// server's reply moves it on.
//
// **2. Every action is idempotent, so a replay cannot double count.** Neither
// endpoint appends: the rating is keyed on the applicant and the posting, and
// the answer is keyed on the analytics row id. That is what makes it safe for
// this file and the service worker's `sync` handler to both try the same row.
//
// **3. A refusal is not a failure, and the three kinds are handled
// differently.** See verdictFor below. The one that would otherwise be a real
// defect is a 404: an action for a posting that has since been deleted can
// never land, and retrying it forever leaves somebody looking at "waiting to
// send" for the rest of the year.

import { api } from './api.js';
import { enqueue, listQueue, removeQueued, noteAttempt } from './idb.js';

/** The two actions, and where each one goes. */
const ACTIONS = {
  rating: { path: '/api/ratings/upsert' },
  answer: { path: '/api/applications/respond' },
};

// The Background Sync tag. sw.js listens for this exact string; changing it
// here without changing it there means a queue that never flushes in the
// background and nothing on screen to say so.
export const SYNC_TAG = 'careers-gftv-queue';

// How many failed sends before an action is treated as stuck rather than
// waiting. It is not dropped — nothing is dropped for being slow — but the
// interface stops implying it is about to go through.
const STUCK_AFTER = 5;

let flushing = null;
let queued = [];

/* -------------------------------------------------------------------------
 * What a refusal means
 * ---------------------------------------------------------------------- */

/**
 * What to do with what came back.
 *
 * **Keep this in step with `queueVerdict` in sw.js**, which is the same rule
 * written again for the Background Sync handler. A service worker is a classic
 * script and cannot import this module, and the alternative — the worker asking
 * an open page to flush — would defeat the point of Background Sync, which is
 * flushing when no page is open at all.
 *
 * @returns {'done'|'retry'|'signin'|'drop'}
 */
export function verdictFor(result) {
  if (result.ok) return 'done';

  const code = result.error?.code;

  // Nothing reached the site, or the site could not answer. Both are worth
  // trying again, and a 503 from a switched off feature is the case section 0c
  // wrote this build's queue into: "a disabled button stops nobody who has a
  // queued offline action from phase 10".
  if (code === 'network' || code === 'not_yet_available') return 'retry';
  if (code === 'rate_limited' || code === 'server_error') return 'retry';

  // The session went while they were away. The action is kept, because it is
  // still what they meant, and they are told rather than left wondering.
  if (code === 'unauthorised') return 'signin';

  // Everything else is the server having decided: the posting is gone, the
  // cooldown says no, the payload is wrong. Retrying cannot change any of them,
  // and an action that can never land must not sit in the queue pretending.
  return 'drop';
}

/* -------------------------------------------------------------------------
 * Adding
 * ---------------------------------------------------------------------- */

/**
 * Queue an action for later.
 *
 * @param {'rating'|'answer'} kind
 * @param {object} body exactly what the endpoint takes
 * @param {{ jobId?: string, analyticsId?: string }} [meta] what the interface
 *        needs to find this action again and show it as waiting
 */
export async function queueAction(kind, body, meta = {}) {
  if (!ACTIONS[kind]) return null;

  const id = await enqueue({ kind, body, ...meta });
  await refresh();

  // Ask for a background flush where the browser has one. Safari does not, and
  // everywhere without it the flush on the next load with a connection is the
  // whole story — which is why that path is not a fallback bolted on but the
  // one every browser takes.
  try {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.sync?.register(SYNC_TAG);
  } catch {
    // No Background Sync, or permission refused. Nothing is lost.
  }

  return id;
}

/* -------------------------------------------------------------------------
 * Reading, for the interface
 * ---------------------------------------------------------------------- */

/** Refresh the cached view of the queue and tell the page it changed. */
async function refresh() {
  queued = await listQueue();
  document.dispatchEvent(new CustomEvent('gftv:queuechange', { detail: { count: queued.length } }));
  return queued;
}

/** Everything waiting, as last read. Synchronous, for a render. */
export function queuedActions() {
  return queued;
}

/**
 * Whether an answer for this posting is waiting to be sent.
 *
 * This is what keeps rule 1 true on screen: the Apply control asks, and shows
 * "waiting to send" instead of the applied state that a confirmed answer would
 * have earned.
 */
export function answerWaitingFor(jobId) {
  return queued.some((row) => row.kind === 'answer' && row.jobId === jobId);
}

/** Whether anything at all is stuck rather than merely waiting. */
export function anythingStuck() {
  return queued.some((row) => (row.attempts ?? 0) >= STUCK_AFTER);
}

/* -------------------------------------------------------------------------
 * Sending
 * ---------------------------------------------------------------------- */

/**
 * Try to send everything waiting, oldest first.
 *
 * Serial rather than parallel, on purpose. The two endpoints are cheap, the
 * queue is short by construction, and a burst of parallel writes from a phone
 * that has just come back online is the shape of request that meets a rate
 * limit — which this would then treat as a reason to retry, in a loop.
 *
 * Concurrent calls share one run: the `online` event, the page load, and a
 * message from the worker can all arrive within a second of each other.
 *
 * @returns {Promise<{ sent: number, kept: number, dropped: number }>}
 */
export function flushQueue() {
  if (flushing) return flushing;

  flushing = (async () => {
    const rows = await listQueue();
    const counts = { sent: 0, kept: 0, dropped: 0 };

    for (const row of rows) {
      const action = ACTIONS[row.kind];
      if (!action) {
        // A kind this build no longer has. Nothing can send it, so nothing
        // should keep it.
        await removeQueued(row.id);
        counts.dropped += 1;
        continue;
      }

      const result = await api(action.path, {
        method: 'POST',
        locale: false,
        body: row.body,
      });

      const verdict = verdictFor(result);

      if (verdict === 'done') {
        await removeQueued(row.id);
        counts.sent += 1;

        // Reconcile against what the server actually said, per section 14, and
        // **this is the only place a queued answer is allowed to become an
        // applied one**. The event is the same one the modal fires when an
        // answer lands live, so the Apply control has one path to follow.
        if (row.kind === 'answer') {
          document.dispatchEvent(
            new CustomEvent('gftv:applychange', {
              detail: {
                jobId: row.jobId,
                analyticsId: row.analyticsId,
                didApply: result.data?.did_apply === true,
                application: result.data?.application ?? null,
                fromQueue: true,
              },
            })
          );
        }
        continue;
      }

      if (verdict === 'drop') {
        await removeQueued(row.id);
        counts.dropped += 1;
        document.dispatchEvent(
          new CustomEvent('gftv:queuedropped', {
            detail: { kind: row.kind, jobId: row.jobId, reason: result.error?.code ?? null },
          })
        );
        continue;
      }

      // retry and signin both keep the row. They differ in what is said about
      // it, which is the interface's business and not this loop's.
      await noteAttempt(row.id, result.error?.code ?? 'network');
      counts.kept += 1;

      // A network failure means the rest will fail too. Stopping here leaves
      // the queue in order and spends one request finding out rather than one
      // per waiting action.
      if (result.error?.code === 'network') break;
    }

    await refresh();
    return counts;
  })().finally(() => {
    flushing = null;
  });

  return flushing;
}

/* -------------------------------------------------------------------------
 * When to send
 * ---------------------------------------------------------------------- */

/**
 * Start watching. Called once from the shell.
 *
 * Section 14: "flush the queue with the Background Sync API where available,
 * and on the next page load with a connection everywhere else, since Safari
 * does not support Background Sync." Both paths are here, and the load path is
 * not a fallback: it is what every browser does, with Background Sync as the
 * extra that also works when no page is open.
 */
export async function initQueue() {
  await refresh();

  window.addEventListener('online', () => {
    flushQueue();
  });

  // The worker says it flushed something in the background, so the page's cached
  // view of the queue is out of date.
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'queue-flushed') refresh();
  });

  if (queued.length > 0 && navigator.onLine) flushQueue();
}
