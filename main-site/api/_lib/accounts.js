// Account lookup and the two code sets.
//
// Not in the phase 2 file list, added because four routes need the same three
// things and none of them belongs in session.js: finding an account by what
// somebody typed, checking whether a username or an email is taken, and
// generating, counting, and consuming a set of recovery or backup codes.
//
// About the lookups. Both realms compare usernames case insensitively, and
// gftvjobs_users carries unique indexes on lower(username) and lower(email) to
// enforce that. PostgREST has no lower() in a filter, so the query uses ilike
// and the result is confirmed in JavaScript.
//
// ilike is a superset here, never a subset: an underscore in the typed value
// is a single character wildcard to Postgres, so the query can return extra
// rows but can never miss the row that matches exactly. Confirming with a
// lowercase comparison afterwards is what makes the answer exact. Nothing is
// interpolated into SQL; PostgREST parameterises the value.

import { supabase, T } from './supabase.js';
import { randomRecoveryCode } from './tokens.js';
import {
  hashCodeSet,
  findMatchingCode,
  verifySecret,
  verifyAgainstNothing,
} from './password.js';

/** Columns a login needs. The password hash is only ever read here. */
const APPLICANT_AUTH_COLUMNS =
  'id, username, display_name, email, password_hash, avatar_url, phone, locale, totp_secret, is_active, must_change_password, created_at';

const STAFF_AUTH_COLUMNS =
  'id, username, password_hash, is_approved, is_admin, is_editor, totp_secret';

function sameText(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

/**
 * Find an applicant by username, case insensitively.
 * @param {string} username
 * @returns {Promise<object|null>}
 */
export async function findApplicantByUsername(username) {
  const { data, error } = await supabase
    .from(T.users)
    .select(APPLICANT_AUTH_COLUMNS)
    .ilike('username', String(username ?? ''))
    .limit(20);

  if (error) {
    console.error('[careers-gftv] findApplicantByUsername:', error);
    return null;
  }

  return (data ?? []).find((row) => sameText(row.username, username)) ?? null;
}

/**
 * Find an applicant by email, case insensitively.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findApplicantByEmail(email) {
  const { data, error } = await supabase
    .from(T.users)
    .select(APPLICANT_AUTH_COLUMNS)
    .ilike('email', String(email ?? ''))
    .limit(20);

  if (error) {
    console.error('[careers-gftv] findApplicantByEmail:', error);
    return null;
  }

  return (data ?? []).find((row) => sameText(row.email, email)) ?? null;
}

/**
 * Find an applicant by whatever they typed into the one identifier field.
 * Section 5b: login takes a username or an email.
 * @param {string} identifier
 * @returns {Promise<object|null>}
 */
export async function findApplicantByIdentifier(identifier) {
  const value = String(identifier ?? '').trim();
  if (value === '') return null;

  // An @ means it can only be an email, since the username charset excludes
  // it. Anything else is tried as a username first and as an email second, so
  // an address typed without its domain still finds nothing rather than
  // erroring.
  if (value.includes('@')) return findApplicantByEmail(value);

  return (await findApplicantByUsername(value)) ?? (await findApplicantByEmail(value));
}

/**
 * Find a staff account by username, case insensitively. Read only: nothing in
 * this build ever writes to gftvhello_users.
 * @param {string} username
 * @returns {Promise<object|null>}
 */
export async function findStaffByUsername(username) {
  const { data, error } = await supabase
    .from(T.staffUsers)
    .select(STAFF_AUTH_COLUMNS)
    .ilike('username', String(username ?? ''))
    .limit(20);

  if (error) {
    console.error('[careers-gftv] findStaffByUsername:', error);
    return null;
  }

  return (data ?? []).find((row) => sameText(row.username, username)) ?? null;
}

/**
 * Whether a username is already registered, optionally ignoring one account so
 * somebody can save their profile without their own name colliding.
 * @param {string} username
 * @param {string|null} [exceptId]
 */
export async function isUsernameTaken(username, exceptId = null) {
  const found = await findApplicantByUsername(username);
  return Boolean(found) && found.id !== exceptId;
}

/**
 * Whether an email is already registered.
 * @param {string} email
 * @param {string|null} [exceptId]
 */
export async function isEmailTaken(email, exceptId = null) {
  const found = await findApplicantByEmail(email);
  return Boolean(found) && found.id !== exceptId;
}

/**
 * Verify an account's current password, in either realm.
 *
 * Exists because the session row does not carry the password hash and must not
 * start carrying it: a hash held in memory on every authenticated request, for
 * the handful of routes that re-check a password, is exposure bought for
 * nothing. The routes that need it fetch it here, for the length of one call.
 *
 * This was a real bug before it was a design note. change-password, the email
 * and username half of profile, and recovery code generation all compared
 * against session.user.password_hash, which getApplicantSession never selected,
 * so every one of them rejected every correct password. Nothing revealed it
 * except reading the select.
 *
 * The staff branch reads gftvhello_users.password_hash and only reads it.
 * Section 2 permits that: the prohibition is on writing.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {unknown} password
 * @returns {Promise<boolean>}
 */
export async function verifyRealmPassword(realm, userId, password) {
  const table = realm === 'staff' ? T.staffUsers : T.users;

  const { data, error } = await supabase
    .from(table)
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] verifyRealmPassword:', error);
    // Fail closed. A password check that cannot read the hash must not pass.
    await verifyAgainstNothing(password);
    return false;
  }

  if (!data?.password_hash) {
    await verifyAgainstNothing(password);
    return false;
  }

  return verifySecret(password, data.password_hash);
}

/**
 * Turn a unique violation from the database into a field error.
 *
 * The pre-flight checks above are a courtesy, not the guarantee. Two
 * registrations for the same name a millisecond apart both pass them, and the
 * unique index is what actually decides. Postgres 23505 is that index
 * speaking, and its message names the index that fired.
 *
 * @param {{ code?: string, message?: string }} error
 * @returns {Record<string,string>|null} details for respond.fail
 */
export function uniqueViolationDetails(error) {
  if (!error || error.code !== '23505') return null;

  const message = String(error.message ?? '');
  if (message.includes('username')) return { username: 'taken' };
  if (message.includes('email')) return { email: 'taken' };
  return { username: 'taken' };
}

/* -------------------------------------------------------------------------
 * The two code sets, 5c
 * ---------------------------------------------------------------------- */

/**
 * Which set, in which realm. Four tables, and this is the only place that maps
 * a realm and a name onto one, so nothing downstream can query the wrong one.
 *
 * **The two sets never do each other's job, in either realm**, per 5c and 5g:
 *
 *   recovery  gets past the password, on the forgot password flow. A full
 *             account credential.
 *   backup    gets past the second factor only.
 *
 * They are separate tables rather than one with a purpose column so the
 * boundary is enforced by the schema and not by remembering a filter. 5g says
 * the same thing about the staff pair in almost the same words: "a code lying
 * in a chat log must not be able to do both."
 *
 * **The staff recovery set is this build's own table and the staff backup set
 * is not.** `gftvjobs_staff_recovery_codes` came with migration `038`;
 * `gftvhello_backup_codes` belongs to gftv.asia and is one of the four things
 * section 2 permits this project to write, because the login flow owns it. So a
 * staff member regenerating their backup codes here changes what gets them past
 * the second factor at gftv.asia too, and 5f's page says so.
 *
 * The account id column is here for the same reason the table is: three of the
 * four call it `user_id` and the fourth calls it `staff_user_id`, matching the
 * session tables `038` created in the same file.
 */
export const CODE_SET = Object.freeze({
  applicant: Object.freeze({
    recovery: Object.freeze({ table: T.recoveryCodes, column: 'user_id' }),
    backup: Object.freeze({ table: T.backupCodes, column: 'user_id' }),
  }),
  staff: Object.freeze({
    recovery: Object.freeze({ table: T.staffRecoveryCodes, column: 'staff_user_id' }),
    backup: Object.freeze({ table: T.staffBackupCodes, column: 'user_id' }),
  }),
});

/** The set names, in the order a settings page shows them. */
export const CODE_SETS = Object.freeze(['recovery', 'backup']);

/** Codes per set. 5c says ten, and 5g says the staff set works exactly as 5c does. */
export const CODES_PER_SET = 10;

/** Below this, the settings page warns and offers to regenerate. 5c says three. */
export const LOW_CODE_WARNING = 3;

/**
 * Whether a count is low enough to warn about.
 *
 * A function and not a `<` at six call sites, because codeCounts answers `null`
 * for a count it could not read and `null < 3` is `true` in JavaScript. That
 * comparison would turn a database blip into a page telling somebody they are
 * nearly out of the only way back into their account, at the exact moment it
 * cannot tell them anything of the kind.
 *
 * @param {number|null} count
 */
export function codesLow(count) {
  return typeof count === 'number' && count < LOW_CODE_WARNING;
}

/**
 * @param {'staff'|'applicant'} realm
 * @param {'recovery'|'backup'} which
 * @returns {{ table: string, column: string }}
 */
function setFor(realm, which) {
  const entry = CODE_SET[realm]?.[which];
  if (!entry) throw new Error(`unknown code set: ${realm}/${which}`);
  return entry;
}

/**
 * Whether a realm and a set name a real pair, for a route validating what
 * somebody posted. Kept beside setFor so a caller never has to reach into
 * CODE_SET and get the nesting order the wrong way round.
 *
 * @param {string} realm
 * @param {string} which
 */
export function isCodeSet(realm, which) {
  return Boolean(CODE_SET[realm]?.[which]);
}

/**
 * Generate a fresh set, replacing whatever was there.
 *
 * Section 5c: "Regenerating a set invalidates every remaining code in that set
 * and only that set." The delete is therefore scoped to one table, and the two
 * tables are never touched in the same call.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {'recovery'|'backup'} which
 * @returns {Promise<string[]>} the codes in the clear, to be shown once
 */
export async function generateCodeSet(realm, userId, which) {
  const { table, column } = setFor(realm, which);

  const codes = Array.from({ length: CODES_PER_SET }, () => randomRecoveryCode());
  const rows = await hashCodeSet(codes, userId, column);

  const { error: deleteError } = await supabase.from(table).delete().eq(column, userId);
  if (deleteError) throw new Error(`could not clear the old codes: ${deleteError.message}`);

  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) throw new Error(`could not store the new codes: ${insertError.message}`);

  // Returned once and never again. Nothing logs these and nothing stores them
  // in the clear.
  return codes;
}

/**
 * How many codes are left in each set.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @returns {Promise<{ recovery: number|null, backup: number|null }>} a count
 *          that could not be read is null, never 0
 */
export async function codeCounts(realm, userId) {
  const counts = await Promise.all(
    CODE_SETS.map(async (which) => {
      const { table, column } = setFor(realm, which);

      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(column, userId);

      if (error) {
        console.error(`[careers-gftv] codeCounts ${realm}/${which}:`, error);
        // **Null and not zero.** The rule api/admin/me set and the cron panel
        // extended: "the table could not be read" and "there are none left" are
        // different claims, and only one of them is ours to make. It matters
        // more here than anywhere it has mattered before, because zero is what
        // makes a settings page tell somebody they have no way back into their
        // account and push them to spend the ten codes they still have.
        return null;
      }
      return count ?? 0;
    })
  );

  return { recovery: counts[0], backup: counts[1] };
}

/**
 * Verify a typed code against one set without spending it.
 *
 * The forgot password flow in 5c needs exactly this: step 2 verifies the code
 * and issues a ticket, step 3 sets the password and consumes it. Anything else
 * would burn a code for somebody who verified and then closed the tab.
 *
 * The returned id is what the ticket records, since the code is not sent again
 * at step 3 and a bcrypt hash cannot be searched for.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {'recovery'|'backup'} which
 * @param {string} typed
 * @returns {Promise<string|null>} the matching row id
 */
export async function verifyCode(realm, userId, which, typed) {
  const { table, column } = setFor(realm, which);

  const { data, error } = await supabase
    .from(table)
    .select('id, code_hash')
    .eq(column, userId);

  if (error) {
    console.error('[careers-gftv] verifyCode:', error);
    return null;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    // Still pay for one comparison, so an account with no codes left does not
    // answer measurably faster than one with ten.
    await findMatchingCode(typed, [{ id: 'none', code_hash: null }]);
    return null;
  }

  return findMatchingCode(typed, rows);
}

/**
 * Delete one code by id. The other half of verifyCode.
 * @param {'staff'|'applicant'} realm
 * @param {'recovery'|'backup'} which
 * @param {string} codeId
 * @returns {Promise<boolean>}
 */
export async function deleteCode(realm, which, codeId) {
  const { table } = setFor(realm, which);
  const { error } = await supabase.from(table).delete().eq('id', codeId);
  if (error) {
    console.error('[careers-gftv] deleteCode:', error);
    return false;
  }
  return true;
}

/**
 * Verify a typed code against one set and consume it.
 *
 * Single use, with the row deleted rather than flagged, per 5c. The delete is
 * what makes it single use, so a caller must treat a true here as the code
 * having been spent whatever happens next.
 *
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {'recovery'|'backup'} which
 * @param {string} typed
 * @returns {Promise<boolean>}
 */
export async function consumeCode(realm, userId, which, typed) {
  const { table, column } = setFor(realm, which);

  const { data, error } = await supabase
    .from(table)
    .select('id, code_hash')
    .eq(column, userId);

  if (error) {
    console.error('[careers-gftv] consumeCode read:', error);
    return false;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    // Still pay for the comparison, so an account with no codes left does not
    // answer measurably faster than one with ten.
    await findMatchingCode(typed, [{ id: 'none', code_hash: null }]);
    return false;
  }

  const matchedId = await findMatchingCode(typed, rows);
  if (!matchedId) return false;

  const { error: deleteError } = await supabase.from(table).delete().eq('id', matchedId);
  if (deleteError) {
    // The code was right but could not be spent. Refusing is the safe answer:
    // a code that is accepted and left in place is a reusable credential.
    console.error('[careers-gftv] consumeCode delete:', deleteError);
    return false;
  }

  return true;
}
