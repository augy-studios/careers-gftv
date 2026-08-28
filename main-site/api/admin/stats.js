// GET /api/admin/stats
//
// The overview in 8.1: counts of published postings, applications by status,
// recent applications, and recent registrations.
//
// Everything here is a count or a short list, and none of it is a funnel: the
// per posting funnel from gftvjobs_analytics is 8.4 and belongs to phase 8.
// This is the "what happened while I was away" page, which is a different
// question and is answered by looking at the pipeline rather than at the
// analytics table.
//
// The bucket counts are the same ones the tracking page uses, from
// api/_lib/admin-applications.js, so the number on a tab and the number on this
// page can never disagree. 8.1 asks for exactly that: "carry the same bucket
// tabs into the applicant tracking page".

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { supabase, T } from '../_lib/supabase.js';
import { localeFromRequest } from '../_lib/validate.js';
import { bucketCounts } from '../_lib/admin-applications.js';
import { lastRun } from '../_lib/cron.js';
import { outboxSummary } from '../_lib/telegram.js';

/** How many rows the two recent lists carry. Enough to scan, short enough to read. */
const RECENT = 8;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  const locale = localeFromRequest(req);

  try {
    const [postings, buckets, applications, registrations, run, outbox] = await Promise.all([
      postingCounts(),
      bucketCounts(),
      recentApplications(locale),
      recentRegistrations(),
      lastRun(),
      outboxSummary(),
    ]);

    res.setHeader('Cache-Control', 'no-store');

    return ok(res, {
      postings,
      applications_by_status: buckets,
      recent_applications: applications,
      recent_registrations: registrations,
      // Section 11's last line: "Surface the last cron run time and its results
      // on the admin overview."
      //
      // Three states, not two, and the third is why this is an object rather
      // than a row or null. lastRun answers undefined when the table could not
      // be read, and "the cron has never run" is a claim this page is not
      // entitled to make on the strength of a failed query — the same manners
      // api/admin/me keeps when it sends null rather than zero for a count.
      // The panel says "could not be read" for that case and nothing else does.
      cron: { readable: run !== undefined, run: run ?? null },
      // The Telegram outbox, phase 11 part 4. The same three states and for the
      // same reason: "the table could not be read" is not a claim that nothing
      // is waiting.
      //
      // It is on this page rather than on /admin/maintenance because it is the
      // same kind of thing as the panel above it. Both report a process with no
      // reader, and this one reports a process that is not even on this
      // deployment: the bot runs on a VPS, so a queue that stops moving is the
      // only sign the portal gets that it has stopped running.
      outbox: { readable: outbox !== undefined, summary: outbox ?? null },
    });
  } catch (cause) {
    return failInternal(res, cause, 'admin stats');
  }
}

/**
 * Postings by status, plus the two an admin actually acts on.
 *
 * closing_soon is on the same fourteen days the board's own quick chip uses, so
 * "closing soon" means one thing across the site. no_deadline is counted
 * because nothing will ever close those automatically, per 8.2, and a count
 * nobody looks at is how a posting stays open for a year.
 */
async function postingCounts() {
  const countFor = async (build) => {
    const query = build(supabase.from(T.jobs).select('id', { count: 'exact', head: true }));
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  const fortnight = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const [draft, published, closed, archived, closingSoon, noDeadline, noForm] =
    await Promise.all([
      countFor((q) => q.eq('status', 'draft')),
      countFor((q) => q.eq('status', 'published')),
      countFor((q) => q.eq('status', 'closed')),
      countFor((q) => q.eq('status', 'archived')),
      countFor((q) =>
        q.eq('status', 'published').not('closes_at', 'is', null).lte('closes_at', fortnight)
      ),
      countFor((q) => q.eq('status', 'published').is('closes_at', null)),
      countFor((q) => q.eq('status', 'draft').is('application_form_url', null)),
    ]);

  return {
    draft,
    published,
    closed,
    archived,
    closing_soon: closingSoon,
    no_deadline: noDeadline,
    // Drafts that cannot be published yet, which is the queue an admin can
    // actually clear rather than a number to look at.
    draft_without_form: noForm,
  };
}

/**
 * The most recent tracking rows.
 *
 * The posting's title comes from the base row rather than from a translation,
 * and the locale is taken but currently only decides nothing here: an admin
 * list shows the posting as it is stored, because that is the row they will
 * open. Resolving a title into the admin's language on a list that links to an
 * editor tabbed by language would make the two disagree.
 */
async function recentApplications(locale) {
  void locale;

  const { data, error } = await supabase
    .from(T.applications)
    .select(
      `id, status, started_at, applied_at, updated_at,
       applicant:${T.users} ( id, username, display_name, avatar_url ),
       job:${T.jobs} ( id, title )`
    )
    .order('updated_at', { ascending: false })
    .limit(RECENT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    started_at: row.started_at,
    applied_at: row.applied_at,
    updated_at: row.updated_at,
    applicant: row.applicant
      ? {
          id: row.applicant.id,
          username: row.applicant.username,
          display_name: row.applicant.display_name,
          avatar_url: row.applicant.avatar_url ?? null,
        }
      : null,
    job: row.job ? { id: row.job.id, title: row.job.title } : null,
  }));
}

/**
 * The most recent applicant accounts.
 *
 * Username, display name, and when. No email and no phone: this is a "who has
 * arrived" list on an overview, 8.9's applicant users page is where an account
 * is actually looked at, and that page is admins only. An overview a job poster
 * can see should not be a contact list.
 */
async function recentRegistrations() {
  const { data, error } = await supabase
    .from(T.users)
    .select('id, username, display_name, avatar_url, created_at, is_active')
    .order('created_at', { ascending: false })
    .limit(RECENT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at,
    is_active: row.is_active !== false,
  }));
}
