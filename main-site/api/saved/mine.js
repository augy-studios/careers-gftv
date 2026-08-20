// GET /api/saved/mine[?with_jobs=true][?filter=all|open|closed]
//
// Section 7g's saved jobs, read side.
//
// Thin by default and wide when asked, exactly as api/applications/mine.js is
// and for the same reason. The board and the posting page ask the thin question,
// "which of these have I saved", to decide whether the save control is pressed;
// /account/saved asks the wide one and gets the postings themselves.
//
// Two rules from 7g:
//
//   **Postings that have closed or expired stay on the list.** They "stay
//   visible with a clear no longer accepting applications badge rather than
//   vanishing from the list". So nothing here filters on status unless the
//   reader asks for that filter, and is_open on the summary is what draws the
//   badge.
//
//   **Sort by recently saved.** created_at on the saved row, not on the
//   posting: the order is the order they were saved in, which is the order the
//   person remembers them in.
//
// A signed out caller gets an empty list rather than a 401, like the two apply
// routes that run on public pages. The save control is drawn on every card on
// the board, and most readers are not signed in.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { localeFromRequest } from '../_lib/validate.js';
import { jobSummaries } from '../_lib/dashboard.js';

// Generous. Somebody who has saved more than this has the oldest ones left off,
// which costs a row on one page rather than anything they can act on.
const MAX_ROWS = 300;

const FILTERS = ['all', 'open', 'closed'];

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  // Per session and changes the moment somebody presses a star. A shared cache
  // holding one applicant's saved list would show it to the next reader through
  // the same edge node.
  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url ?? '/', 'https://careers.invalid');
  const withJobs = url.searchParams.get('with_jobs') === 'true';
  const filter = url.searchParams.get('filter') ?? 'all';

  if (!FILTERS.includes(filter)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not one of the filters.', {
      details: { filter: 'invalid' },
    });
  }

  const session = await getApplicantSession(req);
  if (!session) return ok(res, { saved: [], job_ids: [] });

  try {
    const { data, error } = await supabase
      .from(T.savedJobs)
      .select('job_id, created_at')
      .eq('applicant_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) return failInternal(res, error, 'saved jobs');

    const rows = data ?? [];
    const jobIds = rows.map((row) => row.job_id);

    // The thin answer. Ids and the dates they were saved on, which is all a
    // save control on a card needs to know.
    if (!withJobs) {
      return ok(res, {
        job_ids: jobIds,
        saved: rows.map((row) => ({ job_id: row.job_id, saved_at: row.created_at })),
      });
    }

    const summaries = await jobSummaries(jobIds, localeFromRequest(req));

    const saved = rows
      // A posting hard deleted in phase 7 takes its saved rows with it, per the
      // cascade in migration 007. This is here so a row with no posting behind
      // it is skipped rather than drawn as a card with a blank title.
      .filter((row) => summaries.has(row.job_id))
      .map((row) => ({
        job_id: row.job_id,
        saved_at: row.created_at,
        job: summaries.get(row.job_id),
      }));

    const counts = {
      all: saved.length,
      open: saved.filter((row) => row.job.is_open).length,
      closed: saved.filter((row) => !row.job.is_open).length,
    };

    return ok(res, {
      job_ids: jobIds,
      saved: saved.filter((row) => {
        if (filter === 'open') return row.job.is_open;
        if (filter === 'closed') return !row.job.is_open;
        return true;
      }),
      counts,
      filter,
    });
  } catch (cause) {
    return failInternal(res, cause, 'saved jobs');
  }
}
