// Translation helpers, the admin half. Sections 7i and 8.11.
//
// 8.11: "the list of granted helpers by language, granting and revoking with a
// required reason, and what each has drafted. Granting is what turns a community
// member into a contributor, so it belongs beside the queue their work arrives
// in rather than buried in applicant users."
//
// So this is a third tab on /admin/translations rather than a page of its own,
// and the file it sits beside is deliberate: the annotations in
// translation-queue.js are what helpers send, and this is who they are.
//
// Five things here are decisions rather than plumbing:
//
//   **A helper is an applicant account, and that is a foreign key rather than a
//   preference.** 7i: they "deliberately do not go through gftvhello or the
//   admin access overlay: the person best placed to fix the Chinese has no
//   reason to be a GFTV staff member". Nothing in this file touches the staff
//   realm except to name the admin who granted the role.
//
//   **Granting is admins only, on a route that is not.** The queue and the audit
//   are open to a job poster on purpose, because a poster whose posting reads
//   wrongly in Chinese is the person who should fix the sentence. This is a
//   different act: it hands somebody standing write access to every translation
//   in a language, across every posting, not only the poster's own. 7i says "an
//   admin has granted the role" and this keeps it literal. The tab is absent for
//   a poster, per deviation 34, and both actions refuse server side.
//
//   **A revoke deletes the row, and the audit log is the record.** There is no
//   revoked state in migration 023: the primary key is (user_id, locale) and the
//   row means "is a helper in this language, now". That makes this different
//   from 8.8's access overlay, where a denied row has to survive because absent
//   there means "the gftv.asia role decides" and is a third state. Here absent
//   means one thing, so the reason for a revoke lives in gftvjobs_audit_log,
//   which is why both directions are audited and why the reason is required.
//
//   **Both directions write an audit row, on a route that writes none.** The
//   queue deliberately audits nothing, per phase 7's line that what is logged is
//   what changes somebody else's world rather than an admin editing wording.
//   Granting a standing role over published content is the first thing on this
//   page that is squarely the former.
//
//   **What each helper has drafted is counted per language, not per person.** A
//   row on this list is somebody and a language, so the counts beside it are that
//   language's. Somebody granted zh and ms is two rows with two sets of numbers,
//   which is the only reading that matches a role granted per language.

import { supabase, T } from './supabase.js';

/** Same page size as the queue and the audit, so all three tabs page alike. */
export const PAGE_SIZE = 25;

/**
 * How many reports one page of helpers may have raised between them before the
 * raised counts stop being trustworthy.
 *
 * The counts below are one query per source with the ids batched in, and a
 * count in JavaScript, which is the shape admin-staff.js settled on for the same
 * problem. What that shape cannot do is notice it has been truncated, so this is
 * a stated ceiling rather than a silent one: past it the counts come back null,
 * which every count in this build already means "not read" rather than "zero".
 * Twenty five people would have to average two hundred reports each to reach it.
 */
const COUNT_CEILING = 5000;

/** What the list reads off a helper's account. Nothing wider is needed here. */
const ACCOUNT_COLUMNS = 'id, username, display_name, avatar_url, is_active';

/** The three tables a helper's drafting lands in, per 7i's "edit any translation row". */
const TRANSLATION_TABLES = Object.freeze([
  T.jobTranslations,
  T.departmentTranslations,
  T.tagTranslations,
]);

/**
 * The granted helpers, newest grant first, optionally one language.
 *
 * @param {{ locale?: string|null, from?: number, to?: number }} [options]
 */
export async function listHelpers(options = {}) {
  let query = supabase
    .from(T.translationHelpers)
    .select('user_id, locale, note, granted_by, granted_at', { count: 'exact' })
    .order('granted_at', { ascending: false })
    // The tie breaker is the same call the audit made: a batch of grants made in
    // one sitting shares granted_at closely enough that two pages could hold the
    // same row and miss another. The table has no id of its own.
    .order('user_id', { ascending: true })
    .range(options.from ?? 0, options.to ?? PAGE_SIZE - 1);

  if (options.locale) query = query.eq('locale', options.locale);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [accounts, granters, drafted, raised] = await Promise.all([
    accountsFor(userIds),
    granterNames(rows.map((row) => row.granted_by)),
    draftedCounts(userIds),
    raisedCounts(userIds),
  ]);

  return {
    rows: rows.map((row) => {
      const key = `${row.user_id}|${row.locale}`;

      return {
        user_id: row.user_id,
        locale: row.locale,
        // Why they are on the list, per 7i: "Granting requires a reason,
        // recorded on the row, so an admin reviewing the list a year later
        // knows why each person is on it."
        note: row.note,
        granted_at: row.granted_at,
        granted_by: row.granted_by ? (granters.get(row.granted_by) ?? null) : null,
        applicant: accounts.get(row.user_id) ?? null,
        // 8.11's "what each has drafted", which needed migration 034: the three
        // translation tables carried no author until then, because until 7i the
        // only thing writing them was the admin editor and the audit log knew
        // who that was.
        drafted: drafted === null ? null : (drafted.get(key) ?? 0),
        // What has arrived in the queue from them, which is the other half of
        // the same question and the half that works from day one. A helper who
        // reports rather than edits is doing the job 7h describes and is not
        // idle, and a list that counted only drafts would say they were.
        raised: raised === null ? null : (raised.get(key)?.total ?? 0),
        raised_open: raised === null ? null : (raised.get(key)?.open ?? 0),
      };
    }),
    total: count ?? 0,
  };
}

/**
 * Which languages each of these accounts already helps with.
 *
 * For the picker, so "already a helper" is a fact about the account rather than
 * an inference from whichever page of the list happens to be loaded. The page
 * cannot answer this from what it has: the list is paged and may be filtered to
 * one language, so somebody granted zh on page two would look like a new grant.
 *
 * @param {string[]} ids
 * @returns {Promise<Map<string, string[]>>}
 */
export async function helperLocalesFor(ids) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.translationHelpers)
    .select('user_id, locale')
    .in('user_id', ids);

  if (error) throw error;

  const held = new Map();
  for (const row of data ?? []) {
    held.set(row.user_id, [...(held.get(row.user_id) ?? []), row.locale]);
  }
  return held;
}

/** Whether one account already holds the role in one language. */
export async function fetchHelper(userId, locale) {
  const { data, error } = await supabase
    .from(T.translationHelpers)
    .select('user_id, locale, note, granted_at')
    .eq('user_id', userId)
    .eq('locale', locale)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * The account a grant is about, read thinly.
 *
 * Not fetchApplicant from admin-applicants.js, which is 8.9's read model and
 * runs five more queries to draw a panel of history nobody is looking at here.
 * This is the check that the person exists and can sign in, and the name to put
 * in the audit row.
 */
export async function fetchHelperAccount(userId) {
  const { data, error } = await supabase
    .from(T.users)
    .select(ACCOUNT_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? accountRow(data) : null;
}

/**
 * Grant the role, or rewrite the reason on a grant that already exists.
 *
 * A second grant re-stamps all three columns rather than keeping the first
 * grant's date. The row is the current grant and the log is the history: an
 * admin re-granting with a new reason has made a fresh decision, and a row
 * pairing today's reason with a date from March would describe neither.
 *
 * @param {{ userId: string, locale: string, note: string, staffId: string }} input
 */
export async function grantHelper(input) {
  const { error } = await supabase.from(T.translationHelpers).upsert(
    {
      user_id: input.userId,
      locale: input.locale,
      note: input.note,
      granted_by: input.staffId,
      granted_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,locale' }
  );

  if (error) throw error;
}

/**
 * Take the role away in one language.
 *
 * One language, never the person: somebody granted zh and ms who has been
 * revoked for ms is still the Chinese helper, and a revoke that cleared both
 * would be a decision nobody made.
 *
 * **Nothing they wrote is touched.** A translation a helper drafted stays
 * exactly as it is, live or not, because it is the site's content rather than
 * theirs, and because a revoke that silently reverted a language's postings is
 * not something anybody could predict from the word.
 */
export async function revokeHelper(userId, locale) {
  const { data, error } = await supabase
    .from(T.translationHelpers)
    .delete()
    .eq('user_id', userId)
    .eq('locale', locale)
    .select('user_id')
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* -------------------------------------------------------------------------
 * The parts of a row that are not on the helper row
 * ---------------------------------------------------------------------- */

function accountRow(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url ?? null,
    // A deactivated account keeps the role and is drawn as deactivated rather
    // than dropped. Somebody who cannot sign in cannot draft, and an admin
    // wondering why the Chinese has stopped moving should find that out here
    // rather than on 8.9.
    is_active: row.is_active !== false,
  };
}

async function accountsFor(ids) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from(T.users).select(ACCOUNT_COLUMNS).in('id', ids);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, accountRow(row)]));
}

/**
 * The admins who granted these, named.
 *
 * gftvhello_users read only, as everywhere. A null granted_by is a staff account
 * deleted at gftv.asia since, per 023's "on delete set null", and the page says
 * so rather than leaving the column blank.
 */
async function granterNames(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.staffUsers)
    .select('id, username')
    .in('id', wanted);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.username]));
}

/**
 * How many translation rows each of these people has written, per language.
 *
 * Three queries with the ids batched in and the counting done here, which is the
 * shape admin-staff.js settled on: the alternative is a count query per person
 * per table, which is one page of the list turned into seventy five round trips.
 *
 * Null on a failure or past the ceiling, never zero. Zero on this column is a
 * claim that somebody has done nothing, which is the one thing an admin might
 * revoke a role over.
 *
 * @returns {Promise<Map<string, number>|null>} keyed `${userId}|${locale}`
 */
async function draftedCounts(ids) {
  if (ids.length === 0) return new Map();

  try {
    const results = await Promise.all(
      TRANSLATION_TABLES.map((table) =>
        supabase.from(table).select('updated_by, locale').in('updated_by', ids).limit(COUNT_CEILING)
      )
    );

    const counts = new Map();
    for (const result of results) {
      if (result.error) throw result.error;
      if ((result.data ?? []).length >= COUNT_CEILING) return null;

      for (const row of result.data ?? []) {
        const key = `${row.updated_by}|${row.locale}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  } catch (cause) {
    // Not fatal to the list. Somebody granting a role can do that without the
    // counts, and a page that refused to draw because a count failed would be
    // the worse answer. 42703 here is the shape of migration 034 not having been
    // applied yet, which is worth seeing in the log in those terms.
    console.warn('[careers-gftv] helper draft counts:', cause);
    return null;
  }
}

/**
 * How many reports each of these people has raised, per language, and how many
 * are still open.
 *
 * Both origins, not annotations only. A helper who used the form at the foot of
 * a posting before they were granted the role raised it all the same, and 7i is
 * explicit that both write to the same table and that origin is a distinction
 * for the queue rather than for the person.
 *
 * @returns {Promise<Map<string, { total: number, open: number }>|null>}
 */
async function raisedCounts(ids) {
  if (ids.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from(T.translationReports)
      .select('reporter_id, locale, status')
      .in('reporter_id', ids)
      .limit(COUNT_CEILING);

    if (error) throw error;
    if ((data ?? []).length >= COUNT_CEILING) return null;

    const counts = new Map();
    for (const row of data ?? []) {
      const key = `${row.reporter_id}|${row.locale}`;
      const entry = counts.get(key) ?? { total: 0, open: 0 };
      entry.total += 1;
      if (row.status === 'open' || row.status === 'accepted') entry.open += 1;
      counts.set(key, entry);
    }
    return counts;
  } catch (cause) {
    console.warn('[careers-gftv] helper report counts:', cause);
    return null;
  }
}
