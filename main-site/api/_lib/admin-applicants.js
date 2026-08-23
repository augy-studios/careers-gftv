// Applicant accounts, section 8.9.
//
// "List of gftvjobs_users with search, view profile and application history,
// deactivate or reactivate. Admins only, all of it: a job poster works with
// applicants through the tracking page in 8.3 and has no business in the
// account itself."
//
// That last clause is why this file exists separately from the thin picker in
// invites.js. Two readers of the same table, deliberately: one returns a name
// and a picture to anybody who can post a job, and this one returns the account
// and is only ever reached through requireAdmin.
//
// Four things here are decisions rather than queries:
//
//   **Deactivating is the ordinary action and it is reversible.** 8.9 says so.
//   It suspends sign in and keeps every row, which is what getApplicantSession
//   already enforces: a session for a deactivated account resolves to null on
//   the next request, so the person is signed out everywhere within one page
//   load without anything here having to delete their sessions.
//
//   **Deletion does exactly what the applicant's own danger zone does**, and
//   the honest way to guarantee that is to keep the two in step deliberately:
//   the same cascade, the same avatar cleanup, the same audit row written
//   before the delete, and the same two tables that keep their rows with a null
//   id. api/account/danger/delete.js is the other copy.
//
//   **Setting a password breaks non repudiation, and the page has to say so.**
//   8.9 reverses the earlier rule that nobody could, and attaches three
//   conditions: admins only, an audit row with a required reason, and every
//   session and trusted device revoked. All three are enforced here rather than
//   left to the interface, because the interface is not what an admin with curl
//   is using.
//
//   **The two assisted paths are the ones to prefer**, per 8.9, and they are
//   cheaper in exactly the way that matters: forcing a reset does not give
//   anybody a password, so the audit log can still say the applicant chose it.

import { supabase, T } from './supabase.js';
import { hashSecret } from './password.js';
import { invalidateAllSessions, revokeAllTrustedDevices } from './session.js';
import { removeAllAvatarObjects } from './avatars.js';

/** What the list and the detail read. Never the password hash. */
const ACCOUNT_COLUMNS =
  'id, username, display_name, email, phone, avatar_url, locale, is_active, must_change_password, created_at, updated_at';

/** How many rows the list carries at once. */
export const PAGE_SIZE = 25;

/**
 * The applicant list, searched and paged.
 *
 * The search covers the username, the display name, and the email, which is the
 * difference between this and the invite picker: an admin looking somebody up
 * usually has the address they wrote to.
 *
 * @param {{ term?: string, active?: boolean|null, rangeFrom?: number, rangeTo?: number }} options
 */
export async function listApplicants(options = {}) {
  let query = supabase.from(T.users).select(ACCOUNT_COLUMNS, { count: 'exact' });

  const term = String(options.term ?? '').trim();
  if (term) {
    // Stripped rather than escaped: % and _ are ilike wildcards and a comma
    // ends a PostgREST or() list early. Same rule as the invite picker.
    const safe = term.replace(/[%_,()*."\\]/g, ' ').trim();
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,username.ilike.%${safe}%,email.ilike.%${safe}%`
      );
    }
  }

  if (options.active === true) query = query.eq('is_active', true);
  if (options.active === false) query = query.eq('is_active', false);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(options.rangeFrom ?? 0, options.rangeTo ?? PAGE_SIZE - 1);

  if (error) throw error;

  return { rows: (data ?? []).map(accountRow), total: count ?? 0 };
}

function accountRow(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    email: row.email,
    phone: row.phone ?? null,
    avatar_url: row.avatar_url ?? null,
    locale: row.locale ?? 'en',
    is_active: row.is_active !== false,
    must_change_password: row.must_change_password === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * One account, with the history 8.9 asks for.
 *
 * The application history is the applicant's own list rather than the tracking
 * page's read model: this is "what has this person done", not "where is this
 * application up to", and reaching for admin-applications.js here would drag a
 * page's worth of shaping in to render five rows.
 *
 * @param {string} applicantId
 */
export async function fetchApplicant(applicantId) {
  const { data, error } = await supabase
    .from(T.users)
    .select(ACCOUNT_COLUMNS)
    .eq('id', applicantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [applications, invites, tasks, telegram, activity] = await Promise.all([
    applicationHistory(applicantId),
    inviteHistory(applicantId),
    openTaskCount(applicantId),
    telegramLink(applicantId),
    accountActivity(applicantId),
  ]);

  return {
    account: accountRow(data),
    applications,
    invites,
    open_tasks: tasks,
    // Phase 11 owns linking; this is here so 8.9's unlink control knows whether
    // there is anything to unlink. Null until the bot exists.
    telegram,
    activity,
  };
}

async function applicationHistory(applicantId) {
  const { data, error } = await supabase
    .from(T.applications)
    .select(
      `id, status, started_at, applied_at, cooldown_until, updated_at,
       job:${T.jobs} ( id, title )`
    )
    .eq('applicant_id', applicantId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    started_at: row.started_at,
    applied_at: row.applied_at,
    cooldown_until: row.cooldown_until,
    updated_at: row.updated_at,
    job: row.job ? { id: row.job.id, title: row.job.title } : null,
  }));
}

/** 8.5: "the applicant list shows what each person has been invited to". */
async function inviteHistory(applicantId) {
  const { data, error } = await supabase
    .from(T.invites)
    .select(`id, status, note, created_at, notified_at, job:${T.jobs} ( id, title )`)
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    note: row.note,
    created_at: row.created_at,
    notified_at: row.notified_at,
    job: row.job ? { id: row.job.id, title: row.job.title } : null,
  }));
}

async function openTaskCount(applicantId) {
  const { count, error } = await supabase
    .from(T.tasks)
    .select('id', { count: 'exact', head: true })
    .eq('applicant_id', applicantId)
    .in('status', ['open', 'awaiting_admin']);

  if (error) throw error;
  return count ?? 0;
}

async function telegramLink(applicantId) {
  // applicant_id and linked_at, per migration 011. Not user_id and created_at,
  // which is what every other table in this build calls them.
  const { data, error } = await supabase
    .from(T.telegramLinks)
    .select('id, telegram_username, linked_at')
    .eq('applicant_id', applicantId)
    .maybeSingle();

  // Phase 11's table, and nothing writes to it yet. A failure to read it must
  // not take the account page down with it.
  if (error) {
    console.warn('[careers-gftv] telegram link:', error);
    return null;
  }

  return data
    ? { id: data.id, username: data.telegram_username ?? null, linked_at: data.linked_at }
    : null;
}

/**
 * What has been done to this account, and by whom.
 *
 * Both directions of the audit log: rows where the applicant acted, and rows
 * where somebody acted on them. That second set is the one 8.9 needs, because
 * it is where "an admin set this password" lives, and it is the only place an
 * applicant's own claim about what they did can be checked against.
 */
async function accountActivity(applicantId) {
  const { data, error } = await supabase
    .from(T.auditLog)
    .select('id, action, actor_realm, actor_label, reason, metadata, created_at')
    .or(`actor_id.eq.${applicantId},target_id.eq.${applicantId}`)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    actor_realm: row.actor_realm,
    actor_label: row.actor_label,
    reason: row.reason,
    created_at: row.created_at,
  }));
}

/* -------------------------------------------------------------------------
 * Acting on an account
 * ---------------------------------------------------------------------- */

/**
 * Suspend or restore sign in, per 8.9.
 *
 * Nothing else changes and nothing is deleted. A deactivated account keeps its
 * applications, its saved roles, and its history, which is the whole reason
 * this is the ordinary action and deletion is not.
 *
 * Their sessions are not deleted either, and do not need to be:
 * getApplicantSession refuses a session whose account is inactive, so every
 * open tab stops working on its next request rather than at the moment the
 * cookie would have expired.
 */
export async function setApplicantActive(applicantId, active) {
  const { data, error } = await supabase
    .from(T.users)
    .update({ is_active: active })
    .eq('id', applicantId)
    .select('id, username, is_active')
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Set somebody's password, per 8.9, with the three things that are not optional.
 *
 * Everything after the hash is the cost of the action rather than tidying up:
 * an admin who knows a password can sign in as that person, so every session
 * and trusted device goes, and the flag is set so the next sign in makes them
 * choose their own. The audit row is the route's business, and it is required.
 */
export async function setApplicantPassword(applicantId, password) {
  const { error } = await supabase
    .from(T.users)
    .update({
      password_hash: await hashSecret(password),
      // 8.9's assisted path and this one, together: an admin who sets a
      // password hands it over once and the account owner replaces it on the
      // next sign in. Without this the admin's password is the account's
      // password until somebody remembers to change it.
      must_change_password: true,
    })
    .eq('id', applicantId);

  if (error) throw error;

  await revokeEverything(applicantId);
}

/**
 * Force a password reset at the next sign in, per 8.9.
 *
 * The one to prefer, and the difference is worth stating: nobody learns a
 * password here, so the audit log can still say the applicant chose the one
 * they end up with. Setting a password is the action that costs that.
 */
export async function forcePasswordReset(applicantId) {
  const { error } = await supabase
    .from(T.users)
    .update({ must_change_password: true })
    .eq('id', applicantId);

  if (error) throw error;

  await revokeEverything(applicantId);
}

/** Unlink Telegram, per 8.9. Phase 11 is what makes there be anything to unlink. */
export async function unlinkTelegram(applicantId) {
  const { error } = await supabase.from(T.telegramLinks).delete().eq('applicant_id', applicantId);
  if (error) throw error;

  await revokeEverything(applicantId);
}

/**
 * Every session and every trusted device, gone.
 *
 * 8.9 attaches this to all three assisted actions, and 5d already attaches it
 * to a password change: "changing the password, resetting via recovery code,
 * unlinking Telegram, or disabling 2FA revokes all of them". No session is
 * kept, unlike a self service password change, because the person doing this is
 * not the person whose account it is.
 */
async function revokeEverything(applicantId) {
  await invalidateAllSessions('applicant', applicantId);
  await revokeAllTrustedDevices('applicant', applicantId);
}

/**
 * Delete an account permanently, per 8.9 and 7g.
 *
 * The avatar objects go first, because Storage is not part of any cascade and
 * needs the row while it still exists. Everything else is the cascade from
 * migrations 002 to 008, with the two deliberate exceptions: analytics rows
 * keep their history with applicant_id null, per 007, and translation reports
 * keep theirs with reporter_id null, per 015. Do not add a cascade to either.
 *
 * The audit row is written by the route before this is called, so the record
 * survives the account. Migration 012 puts no foreign key on actor_id for
 * exactly that reason.
 */
export async function deleteApplicant(applicantId) {
  await removeAllAvatarObjects(applicantId);

  const { error } = await supabase.from(T.users).delete().eq('id', applicantId);
  if (error) throw error;
}
