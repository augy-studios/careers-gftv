// Staff access, section 8.8.
//
// "A list of the gftvhello accounts that can access this portal, with the
// ability to grant or revoke portal access, see 2FA enrolment status and last
// login. Admins only, including the list itself: who else can reach the
// dashboard is not a job poster's business."
//
// **gftvhello_users is read only here, as everywhere.** Section 2 says so and
// migration 012 built `gftvjobs_admin_access` to make it true: `is_admin` and
// `is_editor` are set at gftv.asia, and the only thing this portal writes is an
// overlay row saying yes or no on top of them. The page says that in words,
// because the alternative is a control that looks like it changes a role and
// silently does not.
//
// The access rule, from hasPortalAccess in session.js, and the reason this
// module exists rather than a query in the route:
//
//   1. `is_approved` is required. Nothing here waives it.
//   2. An overlay row decides, if there is one.
//   3. Otherwise `is_admin` or `is_editor` decides.
//
// So "who can reach the dashboard" is not one query and cannot be. It is the
// union of two sets minus a third, and getting it wrong in either direction is
// the kind of mistake nobody notices: too few and somebody with access is
// missing from the list of people with access, too many and a revoked account
// looks live.
//
// **Three states, not two.** A row can be granted, denied, or absent, and
// absent is not the same as denied: it means the gftv.asia role decides. The
// page offers all three, because an admin who revokes somebody and later wants
// to hand the decision back to their role has no other way to say so.

import { supabase, T } from './supabase.js';
import { AUDIT } from './audit.js';

/** What the list reads off a staff account. Nothing else is guaranteed to exist. */
const STAFF_COLUMNS = 'id, username, is_approved, is_admin, is_editor, totp_secret';

/** How many accounts the list carries. Small realm; this is a ceiling, not a page. */
const LIST_LIMIT = 200;

/**
 * The three overlay states, named so the route and the page agree.
 *
 * `default` is the absence of a row rather than a value in one, which is why it
 * is not written to the database anywhere: granting somebody their role back
 * deletes the row.
 */
export const ACCESS_STATES = Object.freeze(['granted', 'denied', 'default']);

/** The audit action for each direction. */
export const ACCESS_AUDIT = Object.freeze({
  granted: AUDIT.PORTAL_ACCESS_GRANTED,
  denied: AUDIT.PORTAL_ACCESS_REVOKED,
  default: AUDIT.PORTAL_ACCESS_RESET,
});

/**
 * Everybody who can reach the dashboard, plus everybody an admin has said
 * something about.
 *
 * A denied account is in the list on purpose. 8.8 is where somebody goes to
 * find out who has access, and "we took it away from this person in March" is
 * part of that answer. It is drawn as denied rather than left out.
 *
 * @returns {Promise<object[]>}
 */
export async function listStaffAccess() {
  const [overlay, eligible] = await Promise.all([
    readOverlay(),
    // The default-eligible set: approved accounts carrying a gftv.asia role.
    supabase
      .from(T.staffUsers)
      .select(STAFF_COLUMNS)
      .eq('is_approved', true)
      .or('is_admin.eq.true,is_editor.eq.true')
      .order('username', { ascending: true })
      .limit(LIST_LIMIT),
  ]);

  if (eligible.error) throw eligible.error;

  const accounts = new Map((eligible.data ?? []).map((row) => [row.id, row]));

  // Anybody named by an overlay row who is not in that set: somebody granted
  // access without a gftv.asia role, and anybody denied who has since lost
  // theirs. Both belong on this page and neither is in the query above.
  const missing = [...overlay.keys()].filter((id) => !accounts.has(id));

  if (missing.length > 0) {
    const { data, error } = await supabase
      .from(T.staffUsers)
      .select(STAFF_COLUMNS)
      .in('id', missing);

    if (error) throw error;
    for (const row of data ?? []) accounts.set(row.id, row);
  }

  const ids = [...accounts.keys()];
  const [passkeys, backupCodes, lastLogins] = await Promise.all([
    countBy(T.staffPasskeys, 'staff_user_id', ids),
    countBy(T.staffBackupCodes, 'user_id', ids),
    lastSignIns(ids),
  ]);

  return ids
    .map((id) => {
      const account = accounts.get(id);
      const row = overlay.get(id) ?? null;

      return {
        id: account.id,
        username: account.username,
        is_approved: account.is_approved === true,
        // The gftv.asia role, shown and never editable here.
        is_admin: account.is_admin === true,
        is_editor: account.is_editor === true,
        // What this portal's own two roles make of that, per 10 item 2.
        role: account.is_admin === true ? 'admin' : 'poster',

        access_state: row ? (row.granted ? 'granted' : 'denied') : 'default',
        // The answer hasPortalAccess would give for this account right now,
        // computed the same way rather than described. A page that showed the
        // overlay without resolving it would make an admin do the rule in their
        // head, and the rule has three steps.
        has_access: resolveAccess(account, row),
        access_reason: row?.reason ?? null,
        access_changed_at: row?.updated_at ?? null,

        // 8.8's "2FA enrolment status", which is three separate facts rather
        // than a boolean: an account with a passkey and no codes is in a
        // different position from one with codes and no passkey.
        second_factor: {
          totp: Boolean(account.totp_secret),
          passkeys: passkeys.get(id) ?? 0,
          backup_codes: backupCodes.get(id) ?? 0,
        },

        last_sign_in: lastLogins.get(id) ?? null,
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** Every overlay row, keyed by staff id. */
async function readOverlay() {
  const { data, error } = await supabase
    .from(T.adminAccess)
    .select('staff_user_id, granted, reason, granted_by, updated_at');

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.staff_user_id, row]));
}

/** The same three steps hasPortalAccess takes, applied to a row already read. */
function resolveAccess(account, overlayRow) {
  if (account.is_approved !== true) return false;
  if (overlayRow) return overlayRow.granted === true;
  return account.is_admin === true || account.is_editor === true;
}

/**
 * How many rows each id has in a table.
 *
 * One query and a count in JavaScript rather than a count query per account.
 * Both of these tables hold a handful of rows per person, so what comes back is
 * small, and the alternative is fifty round trips to draw one list.
 */
async function countBy(table, column, ids) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from(table).select(column).in(column, ids);
  if (error) throw error;

  const counts = new Map();
  for (const row of data ?? []) {
    counts.set(row[column], (counts.get(row[column]) ?? 0) + 1);
  }
  return counts;
}

/**
 * When each account last signed in, and how.
 *
 * Read from `gftvjobs_audit_log` rather than from `gftvhello_sessions`, which
 * is the more obvious source and the wrong one: a session is deleted when it
 * expires or when somebody signs out, so the last session row is "when they
 * last signed in and are still signed in", which is a different question and
 * answers null for everybody who left properly.
 *
 * The audit row is written by both sign in paths and carries which second
 * factor was used, which is worth showing beside the enrolment: an account
 * enrolled in a passkey that always signs in with a backup code is a story.
 */
async function lastSignIns(ids) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.auditLog)
    .select('actor_id, created_at, metadata')
    .eq('action', AUDIT.STAFF_SIGNED_IN)
    .in('actor_id', ids)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const found = new Map();
  for (const row of data ?? []) {
    // Newest first, so the first one seen for an account is its latest.
    if (found.has(row.actor_id)) continue;
    found.set(row.actor_id, {
      at: row.created_at,
      second_factor: row.metadata?.second_factor ?? null,
    });
  }
  return found;
}

/**
 * Staff accounts matching a search, for granting access to somebody who has no
 * gftv.asia role.
 *
 * Deliberately by username only and never by anything else. Section 5a's schema
 * is not this portal's to assume beyond the columns in STAFF_COLUMNS, and a
 * search that guessed at an email column is exactly the kind of thing that
 * failed with a 42703 on the live site once already.
 *
 * @param {string} term
 */
export async function searchStaffAccounts(term) {
  const trimmed = String(term ?? '').trim();
  if (!trimmed) return [];

  // Stripped rather than escaped, like the invite picker: % and _ are ilike
  // wildcards and a comma ends a PostgREST filter list early.
  const safe = trimmed.replace(/[%_,()*."\\]/g, ' ').trim();
  if (!safe) return [];

  const { data, error } = await supabase
    .from(T.staffUsers)
    .select(STAFF_COLUMNS)
    .ilike('username', `%${safe}%`)
    .order('username', { ascending: true })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    is_approved: row.is_approved === true,
    is_admin: row.is_admin === true,
    is_editor: row.is_editor === true,
  }));
}

/**
 * Write, change, or remove the overlay for one account.
 *
 * `default` deletes the row, which is the only way to hand the decision back to
 * the gftv.asia role. Writing granted=true instead would look the same today
 * and be wrong the moment somebody's role changes there.
 *
 * @param {{ staffId: string, state: 'granted'|'denied'|'default',
 *           reason?: string|null, actorId: string }} input
 */
export async function setStaffAccess(input) {
  if (input.state === 'default') {
    const { error } = await supabase
      .from(T.adminAccess)
      .delete()
      .eq('staff_user_id', input.staffId);
    if (error) throw error;
    return { state: 'default' };
  }

  const { error } = await supabase.from(T.adminAccess).upsert(
    {
      staff_user_id: input.staffId,
      granted: input.state === 'granted',
      reason: input.reason ?? null,
      granted_by: input.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'staff_user_id' }
  );

  if (error) throw error;
  return { state: input.state };
}

/** One staff account, for checking a target exists before writing about it. */
export async function fetchStaffAccount(staffId) {
  const { data, error } = await supabase
    .from(T.staffUsers)
    .select(STAFF_COLUMNS)
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
