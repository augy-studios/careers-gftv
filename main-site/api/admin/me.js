// GET /api/admin/me
//
// Who is signed in, what they are allowed to see, and the two numbers the
// sidebar carries. The first request every page of the dashboard makes.
//
// It is a separate route from /api/auth/staff/session, which answers "is there
// a staff session" for the public header and knows nothing about the portal's
// own access rules. This one goes through requireStaff, so it also answers
// "and may they be here", and a caller who is signed in at gftv.asia without
// portal access gets 401 from it rather than a session with no dashboard.
//
// **The role it returns decides what is drawn and never what is allowed.**
// Every admin route re-checks is_admin itself, per section 8. What this buys is
// that a job poster is not shown a control that would refuse them, per the note
// in api/_lib/admin.js about absent rather than disabled.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { staffContext, activeLocales } from '../_lib/admin.js';
import { supabase, T } from '../_lib/supabase.js';
import { OPEN_STATUSES } from '../_lib/tasks.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  try {
    // The languages the editor draws a tab for, sent with the identity so the
    // editor does not need its own request before it can render, per 8.2.
    const [locales, counts] = await Promise.all([activeLocales(), sidebarCounts()]);

    // No caching. The whole point of re-checking access on every request is
    // that a revoked grant takes effect at once, and a cached identity would
    // undo that for whatever the cache lasted.
    res.setHeader('Cache-Control', 'no-store');

    return ok(res, { staff: staffContext(session), locales, counts });
  } catch (cause) {
    return failInternal(res, cause, 'admin me');
  }
}

/**
 * The numbers on the sidebar.
 *
 * All three are counts rather than lists, and all three fail to null rather than
 * to zero, for the reason phase 6 wrote out for the applicant's badge: a zero is
 * a claim about the state of something, and a failed request does not entitle us
 * to make one. A badge that is not drawn is better than one that says nothing is
 * waiting when something is.
 *
 * The third arrived with phase 8. 8.11: "Show the count of open reports in the
 * admin sidebar, so the queue is visible without going looking for it." Open
 * only, not open plus accepted: an accepted report is one somebody has already
 * picked up, and leaving it in the badge would hold the number high for as long
 * as the work took and teach everybody to ignore it.
 */
async function sidebarCounts() {
  const [openTasks, newApplications, openReports] = await Promise.all([
    supabase.from(T.tasks).select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
    supabase
      .from(T.applications)
      .select('id', { count: 'exact', head: true })
      // The two buckets that are waiting on somebody here rather than on the
      // applicant. Anything past 'submitted' has been picked up.
      .in('status', ['started', 'submitted']),
    supabase
      .from(T.translationReports)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  ]);

  return {
    open_tasks: openTasks.error ? null : (openTasks.count ?? 0),
    new_applications: newApplications.error ? null : (newApplications.count ?? 0),
    open_translation_reports: openReports.error ? null : (openReports.count ?? 0),
  };
}
