// GET /api/translations/mine
//
// "Listing a reader their own reports", which next-steps.md put in this phase
// with the rest of the account area.
//
// 7h ends with a promise: "Confirm plainly on submission, and say that a person
// will look at it. Do not promise a timeframe." This is the other half of
// keeping that promise. A reporter who never hears anything again learns that
// reporting is shouting into a hole, and 7h's whole argument is that the
// applicants are the correction loop and telling us has to stay worth doing.
//
// Three decisions in the shape:
//
//   **Resolution notes are shown.** 8.11 requires a note on every resolution
//   including a rejection, for exactly this reason: "The reporter took the
//   trouble to tell you; closing it silently teaches them not to bother next
//   time." A note nobody ever reads would not be worth the constraint.
//
//   **Who resolved it is not shown.** The status and the note are the answer.
//   An applicant has no relationship with an individual staff account, and this
//   portal reads gftvhello_users for as little as it can get away with.
//
//   **This is not a task and never counts towards the badge**, per 7h. It is
//   outbound from the applicant. It lives on the account settings page, beside
//   the other things that are theirs, rather than in the inbox of things we need
//   from them.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireApplicant } from '../_lib/session.js';
import { localeFromRequest } from '../_lib/validate.js';
import { jobSummaries } from '../_lib/dashboard.js';

const MAX_ROWS = 100;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  res.setHeader('Cache-Control', 'no-store');

  const session = await requireApplicant(req, res);
  if (!session) return;

  try {
    const { data, error } = await supabase
      .from(T.translationReports)
      .select(
        'id, target_type, target_id, target_key, field, locale, note, ' +
          'suggested_text, status, resolution_note, resolved_at, created_at'
      )
      .eq('reporter_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) return failInternal(res, error, 'my translation reports');

    const rows = data ?? [];

    // Only the postings. A report against a department, a tag, or an interface
    // string carries enough on its own: the reporter wrote the note and knows
    // what they were looking at, and resolving three more kinds of target to a
    // name is three more queries for a line of context nobody is missing.
    const jobs = await jobSummaries(
      rows.filter((row) => row.target_type === 'job').map((row) => row.target_id),
      localeFromRequest(req)
    );

    const reports = rows.map((row) => ({
      id: row.id,
      target_type: row.target_type,
      target_key: row.target_key ?? null,
      field: row.field ?? null,
      locale: row.locale,
      note: row.note,
      suggested_text: row.suggested_text ?? null,
      status: row.status,
      // Null while the report is open, and the page says so rather than leaving
      // an empty line where an answer will eventually be.
      resolution_note: row.resolution_note ?? null,
      resolved_at: row.resolved_at ?? null,
      created_at: row.created_at,
      job: row.target_type === 'job' ? (jobs.get(row.target_id) ?? null) : null,
    }));

    return ok(res, {
      reports,
      open_count: reports.filter((report) => report.status === 'open').length,
    });
  } catch (cause) {
    return failInternal(res, cause, 'my translation reports');
  }
}
