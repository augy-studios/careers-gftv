// Invites and shortlists, section 8.5.
//
// "From a posting or from an applicant record, invite one or more applicants to
// a specific job with an optional note. Also mark an applicant against a
// posting without notifying them, for internal shortlisting."
//
// One table for both, which is what migration 008 always intended: its own
// comment calls gftvjobs_invites "an invite to apply, and also the internal
// shortlist marker". Migration 032 added the state that was missing, so a
// shortlist is now this row before anybody was told, and inviting somebody who
// is already shortlisted is that row changing status rather than a second
// record of the same intention.
//
// Four rules this module keeps, and each one is a decision rather than plumbing:
//
//   **An invite is delivered as a task.** Decided 23 August 2026. 8.5 says an
//   invite "sends real messages" and Telegram does not arrive until phase 11,
//   so the channel is the applicant's outstanding tasks: the row is the record,
//   the task is how they find out, and phase 11 adds Telegram as a second
//   channel rather than the first. Section 15 already says the same thing about
//   the decision notice.
//
//   **A shortlist notifies nobody, and that is the whole difference.** No task,
//   no notified_at, and nothing an applicant can see anywhere. Somebody being
//   considered has not been approached, and the moment those two states share a
//   code path is the moment somebody gets a message about a job they were only
//   being thought about for.
//
//   **Shortlisting never moves a row backwards.** If somebody has already been
//   invited, shortlisting them again updates the note and leaves the status
//   alone. A row that went from invited back to shortlisted would claim nobody
//   had been contacted, when a task saying otherwise is sitting on their
//   dashboard.
//
//   **Withdrawing keeps the row.** 8.5: "Withdraw an invite, which stops
//   further reminders but leaves the record." Nothing here deletes an invite
//   that was actually sent. Removing a shortlist entry does delete, because
//   nothing was ever sent and there is no record to keep.

import { supabase, T } from './supabase.js';
import { raiseTasks } from './admin-tasks.js';

/** Every state migration 008 and 032 allow, in the order a row moves through. */
export const INVITE_STATUSES = Object.freeze([
  'shortlisted',
  'invited',
  'seen',
  'applied',
  'declined',
  'withdrawn',
]);

/**
 * The states that mean the applicant has been told.
 *
 * Used to refuse the two things that would misrepresent what happened:
 * shortlisting somebody who has been invited, and deleting a row that was sent.
 *
 * `seen` and `declined` are in this list and nothing in phase 8 writes them.
 * They are phase 11's: Telegram delivery knows when a message was read and can
 * offer a decline button, which a task on a dashboard cannot. Leaving them
 * unwritten is better than inventing a moment to claim either.
 */
const CONTACTED = Object.freeze(['invited', 'seen', 'applied', 'declined', 'withdrawn']);

/** How many people one send may reach. A confirmation lists them all by name. */
export const MAX_RECIPIENTS = 50;

const INVITE_COLUMNS = `
  id, job_id, applicant_id, status, note, created_at, updated_at, notified_at, invited_by,
  applicant:${T.users} ( id, username, display_name, avatar_url, is_active ),
  job:${T.jobs} ( id, title, slug, status )
`;

/**
 * The invites and shortlist entries for a posting, or for an applicant.
 *
 * 8.5 asks for both directions: "Invited applicants appear on the posting with
 * their invite status, and the applicant list shows what each person has been
 * invited to." Same query, different filter.
 *
 * @param {{ jobId?: string|null, applicantId?: string|null, status?: string|null,
 *           rangeFrom?: number, rangeTo?: number }} options
 */
export async function listInvites(options = {}) {
  let query = supabase.from(T.invites).select(INVITE_COLUMNS, { count: 'exact' });

  if (options.jobId) query = query.eq('job_id', options.jobId);
  if (options.applicantId) query = query.eq('applicant_id', options.applicantId);
  if (options.status) query = query.eq('status', options.status);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(options.rangeFrom ?? 0, options.rangeTo ?? 49);

  if (error) throw error;

  return { rows: (data ?? []).map(inviteRow), total: count ?? 0 };
}

function inviteRow(row) {
  return {
    id: row.id,
    job_id: row.job_id,
    applicant_id: row.applicant_id,
    status: row.status,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // The one field that answers "has this person heard about this yet", which
    // the status cannot: a withdrawn invite was sent, and a shortlist was not.
    notified_at: row.notified_at,
    applicant: row.applicant
      ? {
          id: row.applicant.id,
          username: row.applicant.username,
          display_name: row.applicant.display_name,
          avatar_url: row.applicant.avatar_url ?? null,
          is_active: row.applicant.is_active !== false,
        }
      : null,
    job: row.job ? { id: row.job.id, title: row.job.title, slug: row.job.slug, status: row.job.status } : null,
  };
}

/**
 * Applicants to pick from, for the invite composer.
 *
 * **Deliberately thin, and not 8.9's read model.** 8.5 is not admins only, so a
 * job poster reaches this, while 8.9's applicant list is admins only precisely
 * because it shows the account: the email, the phone, the history. What is
 * needed to invite somebody is enough to be sure you are inviting the right
 * person, which is a name, a username, and a picture. When phase 8 builds 8.9
 * it gets its own reader rather than widening this one.
 *
 * Deactivated accounts are excluded. Inviting somebody who cannot sign in would
 * raise a task on a dashboard they cannot reach.
 *
 * @param {string} term
 * @param {number} limit
 */
export async function searchInviteApplicants(term, limit = 20) {
  const trimmed = String(term ?? '').trim();

  let query = supabase
    .from(T.users)
    .select('id, username, display_name, avatar_url')
    .eq('is_active', true)
    .order('display_name', { ascending: true })
    .limit(Math.min(50, Math.max(1, limit)));

  if (trimmed) {
    // Name or username. Not the email: a poster searching by address is looking
    // somebody up rather than picking them off a list, and 8.9 is where an
    // account is looked up.
    //
    // The term is stripped rather than escaped. PostgREST's or() is a comma
    // separated list, so a comma or a bracket in the term ends the filter early
    // and whatever follows is parsed as another condition, while % and _ are
    // ilike wildcards that would quietly widen the search. Getting all four
    // right across two layers of syntax is the kind of thing that works in one
    // client and not the next, and nobody looks somebody up by punctuation.
    const safe = trimmed.replace(/[%_,()*."\\]/g, ' ').trim();
    if (safe) {
      query = query.or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Which of these applicants already have a row on this posting.
 * @returns {Promise<Map<string, object>>} keyed by applicant id
 */
async function existingFor(jobId, applicantIds) {
  if (applicantIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.invites)
    .select('id, applicant_id, status, notified_at')
    .eq('job_id', jobId)
    .in('applicant_id', applicantIds);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.applicant_id, row]));
}

/**
 * Mark people against a posting without telling them, per 8.5.
 *
 * @param {{ jobId: string, applicantIds: string[], note?: string|null, staffId?: string|null }} input
 * @returns {Promise<{ added: string[], updated: string[], alreadyContacted: string[] }>}
 */
export async function shortlistApplicants(input) {
  const existing = await existingFor(input.jobId, input.applicantIds);

  const added = [];
  const updated = [];
  const alreadyContacted = [];

  for (const applicantId of input.applicantIds) {
    const row = existing.get(applicantId);
    if (!row) added.push(applicantId);
    else if (CONTACTED.includes(row.status)) alreadyContacted.push(applicantId);
    else updated.push(applicantId);
  }

  if (added.length > 0) {
    const { error } = await supabase.from(T.invites).insert(
      added.map((applicantId) => ({
        job_id: input.jobId,
        applicant_id: applicantId,
        status: 'shortlisted',
        note: input.note ?? null,
        invited_by: input.staffId ?? null,
      }))
    );
    if (error) throw error;
  }

  // An existing shortlist entry keeps its place and takes the new note. The
  // note is why somebody is on the list, and rewriting it is the point of
  // shortlisting the same person twice.
  if (updated.length > 0 && input.note !== undefined) {
    const { error } = await supabase
      .from(T.invites)
      .update({ note: input.note ?? null })
      .eq('job_id', input.jobId)
      .in('applicant_id', updated)
      .eq('status', 'shortlisted');
    if (error) throw error;
  }

  return { added, updated, alreadyContacted };
}

/**
 * Invite people to a posting, and tell them.
 *
 * The write and the telling are two steps and the order matters: the row goes
 * in first, so a failure to raise the tasks leaves people invited but not
 * contacted, which an admin can see and fix. The other order would send a
 * message about an invite that does not exist.
 *
 * notified_at is set here and nowhere else. Phase 11's Telegram delivery is a
 * second channel for the same invite and must not treat a row it has already
 * delivered as new.
 *
 * @param {{ job: { id: string, title: string }, applicantIds: string[],
 *           note?: string|null, staffId?: string|null, title: string }} input
 * @returns {Promise<{ invited: string[], skipped: string[] }>}
 */
export async function inviteApplicants(input) {
  const existing = await existingFor(input.job.id, input.applicantIds);

  const fresh = [];
  const promote = [];
  const skipped = [];

  for (const applicantId of input.applicantIds) {
    const row = existing.get(applicantId);
    if (!row) fresh.push(applicantId);
    // Somebody already invited is not invited twice. A second task about the
    // same posting reads as a reminder nobody asked for, and 8.5's reminders
    // are phase 11's business.
    else if (CONTACTED.includes(row.status)) skipped.push(applicantId);
    else promote.push(applicantId);
  }

  const now = new Date().toISOString();
  const invited = [...fresh, ...promote];

  if (fresh.length > 0) {
    const { error } = await supabase.from(T.invites).insert(
      fresh.map((applicantId) => ({
        job_id: input.job.id,
        applicant_id: applicantId,
        status: 'invited',
        note: input.note ?? null,
        invited_by: input.staffId ?? null,
        notified_at: now,
      }))
    );
    if (error) throw error;
  }

  if (promote.length > 0) {
    const { error } = await supabase
      .from(T.invites)
      .update({
        status: 'invited',
        note: input.note ?? null,
        invited_by: input.staffId ?? null,
        notified_at: now,
      })
      .eq('job_id', input.job.id)
      .in('applicant_id', promote)
      .eq('status', 'shortlisted');
    if (error) throw error;
  }

  if (invited.length > 0) {
    // One insert for everybody, like 8.3's multi-recipient send. A task carries
    // the posting, so the applicant's dashboard renders the role beside the
    // message and the link is the ordinary one rather than something typed into
    // the note.
    await raiseTasks(
      invited.map((applicantId) => ({
        applicantId,
        jobId: input.job.id,
        type: 'invite',
        title: input.title,
        body: input.note ?? null,
        raisedBy: input.staffId ?? null,
      }))
    );
  }

  return { invited, skipped };
}

/**
 * Withdraw an invite, per 8.5.
 *
 * The row stays and the status says what happened. What it stops is phase 11's
 * reminders, which read the status before they send. The task already raised is
 * left alone deliberately: it was sent, the applicant may have read it, and
 * deleting a message somebody has already seen so the record looks tidy is not
 * something this build does.
 */
export async function withdrawInvite(jobId, applicantId) {
  const { data, error } = await supabase
    .from(T.invites)
    .update({ status: 'withdrawn' })
    .eq('job_id', jobId)
    .eq('applicant_id', applicantId)
    .in('status', ['invited', 'seen'])
    .select('id, status')
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Take somebody off the shortlist.
 *
 * Only ever a shortlist entry, which is why the filter is on the status rather
 * than on the id. Nothing that was sent is deleted: an invite is withdrawn.
 */
export async function removeShortlisted(jobId, applicantId) {
  const { data, error } = await supabase
    .from(T.invites)
    .delete()
    .eq('job_id', jobId)
    .eq('applicant_id', applicantId)
    .eq('status', 'shortlisted')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Move an invite to `applied` when the person it named applies.
 *
 * Called from api/applications/start.js, where 7a already writes the tracking
 * row. This is the one status transition nobody performs by hand, and it is
 * what makes 8.5's "invited applicants appear on the posting with their invite
 * status" worth reading: an invite that led somewhere looks different from one
 * that did not.
 *
 * Never fails the apply. Somebody standing in front of an application form must
 * not be stopped because a marker could not be updated, which is the same rule
 * raisePostingQuestions follows.
 */
export async function markInviteApplied(jobId, applicantId) {
  try {
    const { error } = await supabase
      .from(T.invites)
      .update({ status: 'applied' })
      .eq('job_id', jobId)
      .eq('applicant_id', applicantId)
      // Withdrawn stays withdrawn: somebody applying after an invite was pulled
      // has applied off their own bat, and rewriting the row would claim the
      // invite worked.
      .in('status', ['invited', 'seen']);

    if (error) console.warn('[careers-gftv] invite not marked applied:', error);
  } catch (cause) {
    console.warn('[careers-gftv] invite not marked applied:', cause);
  }
}
