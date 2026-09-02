// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/staff-account.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. **The only file in either project that writes gftvhello_users**,
// which is why it is one file: section 2's two named exceptions are
// password_hash per 5g and totp_secret per phase 13 decision 7, and collecting
// both here makes a third one a diff somebody reviews. The sessions half
// reads both staff session tables by name, on both sites, because 5f asks
// where the account is signed in and the answer spans the two.
//
// What differs from the portal's copy, and why:
//   - log lines are prefixed [careers-gftv-docs]
// 5f's staff account settings, the server half. Phase 13 part 6.
//
// **This is the only file in either project that writes gftvhello_users.**
// That is the point of it existing at all. Section 2 says never to insert,
// update, or delete a row in any gftvhello_ table beyond the challenge, trusted
// device, and backup code rows the login flow owns, and then names two
// exceptions to that:
//
//   password_hash   5g, and section 2 carries the sentence itself. A staff
//                   recovery code sets a password, and 8.8 says password reset
//                   for these accounts belongs to gftv.asia, so the conflict
//                   was put on the table deliberately and written down instead
//                   of discovered.
//   totp_secret     5f, settled as phase 13 decision 7 on 2 September 2026.
//                   5f asks for the authenticator app to be enrolled and
//                   removed here, and its danger zone asks for removal again;
//                   the secret lives in one column and nowhere else, so the
//                   feature and the prohibition could not both stand.
//
// **There is no third, and a fourth caller is a decision and not a patch.**
// Collecting both here is what makes that enforceable by looking: a grep for
// the table name across this repository finds reads everywhere and writes in
// this one file. Anything that wants to write a third column has to add a
// function below, which is a diff somebody reviews.
//
// **What both exceptions cost is the same thing, and every page says it.** A
// staff account is one account. Changing the password here changes it at
// gftv.asia; enrolling or removing an authenticator here does the same. Nobody
// is notified, because this project has no email, so the audit row written
// before each action is the only trace it leaves. 5g requires that row and this
// file's callers write it.
//
// The sessions half is here for a different reason and carries no exception at
// all: both staff session tables are this build's own, from migration 038.

import { supabase, T } from './supabase.js';
import { hashSecret } from './password.js';
import { fail, ERR } from './respond.js';

/* -------------------------------------------------------------------------
 * The hold, phase 13 part 6
 * ---------------------------------------------------------------------- */

/**
 * Whether this build may write gftvhello_users at all.
 *
 * **False on the commit that introduces those writes, on purpose**, settled
 * 2 September 2026. Three things below reach gftv.asia and not one of them has
 * ever run: a password change, a password reset by recovery code, and enrolling
 * or removing an authenticator app. They are correct as written and they are
 * unproveable from here, because the only real test is doing it to a live staff
 * account that another team's site also signs in.
 *
 * **This is a constant and not a maintenance switch, and the difference is not
 * a preference.** A switch was the obvious answer and the mechanism cannot
 * express it: `featureOverrides` only records features an admin has turned
 * *off*, so a switch is on until somebody flips it, and it ignores any feature
 * whose phase has not shipped -- which phase 13's has not. A switch would
 * therefore be inert now and default on at the exact moment part 7 flips the
 * phase, which is the opposite of what is wanted. `INDEXING` in discovery.js is
 * the precedent this follows instead: one constant, two halves that are checked
 * against each other, and flipping it is a commit somebody reviews.
 *
 * **Turning it on is part 7's, after the walk in section 5 item 24**, and the
 * order is: apply migration `040`, deploy, sign in on the deployment, walk each
 * of the three once against a real account, confirm the gftv.asia sign in still
 * works, then flip this line. Nothing else in 5f waits on it -- every panel that
 * reads, lists, revokes or regenerates a `gftvjobs_` row is live from the first
 * deploy.
 *
 * **What a held route must not say is that it was not built.** Phase 11 settled
 * that a switched off feature says so and never that it does not exist, and the
 * two sentences are never mixed. `held()` below carries its own reason for that
 * reason: it is neither `maintenance`, which means an admin flipped something,
 * nor phase 0c's "will be available in phase N", which would be a lie about
 * code that is sitting right there.
 *
 * @type {boolean}
 */
export const HELLO_WRITES_ENABLED = false;

/**
 * Refuse a route that would write gftvhello_users while the hold is on.
 *
 * **Called before anything else the route does**, and in particular before the
 * audit row: 5f and 5g both require that row to go in before the action
 * executes, so a row written for an action the hold was about to refuse would
 * be the log claiming something happened that did not.
 *
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true when the request should stop here
 */
export function held(res) {
  if (HELLO_WRITES_ENABLED) return false;

  fail(
    res,
    ERR.NOT_YET_AVAILABLE,
    'This is built and is switched off until it has been checked once against a real account. Nothing else on this page is affected.',
    { details: { reason: 'held', feature: 'gftvhello_writes' } }
  );
  return true;
}

/**
 * The two tables a staff account can have a session in, and what to call each
 * on screen.
 *
 * 5f asks for "where the account is signed in, on both sites", so this list is
 * read from both sites and answers the same thing on each. `T.staffSessions` is
 * deliberately not used here: that key means "this site's own", and the
 * generator points it at the docs table in the docs copy, which is exactly the
 * ambiguity a panel listing both must not inherit.
 */
const SESSION_TABLES = Object.freeze([
  Object.freeze({ site: 'portal', table: T.portalSessions }),
  Object.freeze({ site: 'docs', table: T.docsSessions }),
]);

/* -------------------------------------------------------------------------
 * The read only profile, 5f
 * ---------------------------------------------------------------------- */

/**
 * The two fields 5f shows beside the username, and neither is this project's
 * to edit: "Username, display name, and email come from gftvhello_users and are
 * edited at gftv.asia. Say that on the page with a link, rather than showing
 * fields that cannot be saved."
 *
 * **Read defensively, because these two column names are an assumption.**
 * HELLO in session.js carries the reason at length: this repository does not
 * own the gftvhello namespace, every name it uses against those tables started
 * as a guess from section 5a, and one of them was wrong in a way that took the
 * live staff sign in down. The names here have never been read by anything, so
 * they are the same kind of guess — and PostgREST answers a select naming a
 * column that does not exist with a 400 for the whole query, which would take
 * the settings page with it.
 *
 * So a failure here is not an error. It is `available: false`, and the page
 * draws the username it already has plus the sentence sending the reader to
 * gftv.asia, which is where 5f sends them for these fields anyway. **The
 * degraded page is the specified page minus two labels**, which is why this is
 * a fallback and not a thing to fix before shipping.
 *
 * @param {string} userId gftvhello_users.id
 * @returns {Promise<{ display_name: string|null, email: string|null,
 *                     available: boolean }>}
 */
export async function staffProfile(userId) {
  const { data, error } = await supabase
    .from(T.staffUsers)
    .select('display_name, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv-docs] staffProfile:', error);
    return { display_name: null, email: null, available: false };
  }

  return {
    display_name: data?.display_name ?? null,
    email: data?.email ?? null,
    available: true,
  };
}

/* -------------------------------------------------------------------------
 * The two writes section 2 permits, and nothing else
 * ---------------------------------------------------------------------- */

/**
 * Set a staff account's password. **Reaches gftv.asia.**
 *
 * 5g: "A staff password reset performed here changes the password at gftv.asia
 * too, because it is one account. The confirmation screen must say that in
 * those words." The caller is responsible for having said it, for having
 * verified whatever authorised the change, and for the audit row.
 *
 * Nothing else about the account is touched. Revoking the sessions and the
 * trusted devices that 5c step 3 asks for is the caller's, because the two
 * flows that call this want different answers about the session doing the
 * calling: a password change keeps the browser it was made from signed in, and
 * a reset does not.
 *
 * @param {string} userId gftvhello_users.id
 * @param {string} plain the new password, already checked for strength
 * @returns {Promise<boolean>}
 */
export async function setStaffPassword(userId, plain) {
  // Defence in depth behind held(). A route added later that forgets the guard
  // refuses here instead of writing, which is the direction to fail in for the
  // one column 8.8 says belongs to gftv.asia.
  if (!HELLO_WRITES_ENABLED) return false;

  const password_hash = await hashSecret(plain);

  const { error } = await supabase
    .from(T.staffUsers)
    .update({ password_hash })
    .eq('id', userId);

  if (error) {
    console.error('[careers-gftv-docs] setStaffPassword:', error);
    return false;
  }

  return true;
}

/**
 * Enrol or remove a staff account's authenticator app. **Reaches gftv.asia.**
 *
 * One function for both directions rather than an enrol and a remove, because
 * they are one column taking a value or taking null, and two functions would be
 * two places writing the one column this file exists to keep in one place.
 *
 * **The caller verifies a code before enrolling.** A secret written without one
 * is an account whose second factor is a QR code nobody has scanned, and the
 * person it locks out is the account holder. This function will write whatever
 * it is handed, which is why that sentence lives at the call site as well.
 *
 * @param {string} userId gftvhello_users.id
 * @param {string|null} secret base32, or null to remove
 * @returns {Promise<boolean>}
 */
export async function setStaffTotpSecret(userId, secret) {
  if (!HELLO_WRITES_ENABLED) return false;

  const { error } = await supabase
    .from(T.staffUsers)
    .update({ totp_secret: secret })
    .eq('id', userId);

  if (error) {
    console.error('[careers-gftv-docs] setStaffTotpSecret:', error);
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------------
 * Sessions across both sites, 5f
 * ---------------------------------------------------------------------- */

/**
 * Every live session this account has, on both sites.
 *
 * **What a row can say is what migration 038 put in it**: which table it came
 * from, when it started, and when it expires. There is no user agent, no
 * label, and no last used, so the panel says which site and when and states
 * plainly that it cannot name a device — phase 13 decision 10, and the same
 * answer deviation 125 reached about the trusted device list one part earlier.
 * A column could have been added; it would have described sessions created
 * after it and been silent about the ones already there, which is worse than
 * being honest about all of them.
 *
 * Expired rows are excluded here rather than deleted. This is a settings page
 * read, and a read that quietly deletes rows is a read somebody will one day
 * call twice in parallel; the sweep belongs to the daily cron and to the
 * session read that finds one genuinely expired.
 *
 * @param {string} userId gftvhello_users.id
 * @param {string|null} currentSessionId the session making the request
 * @returns {Promise<{ sessions: Array, failed: boolean }>} failed is true when
 *          a table could not be read, so the caller can say so instead of
 *          drawing a short list as a complete one
 */
export async function listStaffSessions(userId, currentSessionId = null) {
  const now = new Date().toISOString();
  let failed = false;
  const sessions = [];

  for (const { site, table } of SESSION_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, created_at, expires_at')
      .eq('staff_user_id', userId)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (error) {
      // **A list that is short because a query failed must not be drawn as a
      // complete one.** Phase 10's third state, on the one page whose job is to
      // tell somebody where their account is signed in: "there is no session on
      // the docs site" and "we could not ask" are different sentences, and only
      // one of them is ours to say.
      console.error(`[careers-gftv-docs] listStaffSessions ${site}:`, error);
      failed = true;
      continue;
    }

    for (const row of data ?? []) {
      sessions.push({
        id: row.id,
        site,
        created_at: row.created_at ?? null,
        expires_at: row.expires_at ?? null,
        current: currentSessionId !== null && row.id === currentSessionId,
      });
    }
  }

  sessions.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  return { sessions, failed };
}

/**
 * Sign out everywhere, on both sites.
 *
 * 5f puts this in the danger zone and says "sessions with sign out everywhere",
 * and 5h's separation is what makes the second table necessary: signing out of
 * one site does not sign you out of the other, so an action that means
 * everywhere has to name both.
 *
 * **The caller decides whether to keep its own session.** Both are legitimate
 * and they are different promises: the danger zone's "sign out everywhere"
 * keeps the browser it was pressed in, so somebody who has just proved their
 * password is not thrown out of the page they are working on, while a password
 * reset keeps nothing.
 *
 * @param {string} userId gftvhello_users.id
 * @param {{ keepSessionId?: string|null }} [options]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function revokeStaffSessions(userId, options = {}) {
  const keep = options.keepSessionId ?? null;
  let ok = true;

  for (const { site, table } of SESSION_TABLES) {
    let query = supabase.from(table).delete().eq('staff_user_id', userId);
    if (keep) query = query.neq('id', keep);

    const { error } = await query;
    if (error) {
      console.error(`[careers-gftv-docs] revokeStaffSessions ${site}:`, error);
      ok = false;
    }
  }

  return { ok };
}

/* -------------------------------------------------------------------------
 * Wholesale removals for the danger zone, 5f
 * ---------------------------------------------------------------------- */

/**
 * Removing every passkey is `deleteAllPasskeys` in webauthn.js, and it is there
 * rather than here because that file is the one place that knows which column
 * holds the owner in each realm. This note exists so the danger zone's six
 * actions can be found from one place.
 */

/**
 * Invalidate every remaining code in one set.
 *
 * 5f's danger zone asks for the two separately — "invalidate every remaining
 * recovery code" and "invalidate every remaining backup code" — and 5c's rule
 * that regenerating one set never touches the other is the same rule seen from
 * the other side. So this takes one set and the caller names it, and there is
 * deliberately no call that clears both.
 *
 * @param {{ table: string, column: string }} set from accounts.js CODE_SET
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, removed: number }>}
 */
export async function invalidateCodeSet(set, userId) {
  const { data, error } = await supabase
    .from(set.table)
    .delete()
    .eq(set.column, userId)
    .select('id');

  if (error) {
    console.error('[careers-gftv-docs] invalidateCodeSet:', error);
    return { ok: false, removed: 0 };
  }

  return { ok: true, removed: (data ?? []).length };
}
