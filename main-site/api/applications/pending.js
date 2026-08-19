// GET /api/applications/pending
//
// Section 7c, "Resuming a pending prompt". The server is the source of truth
// for whether an applicant still owes an answer, and this is where the small
// shared script on every page of the portal asks.
//
// Three things about it:
//
//   **It reads the applicant from the session cookie and never takes an id from
//   the caller.** There is no parameter that could name somebody else's rows.
//
//   **It filters on event_type.** Phase 8 will start writing 'view' rows into
//   the same table at response_state pending, and without this filter every
//   reader who merely opened a posting would be shown a "tell us what you
//   think" modal. Nothing writes a view row today, which is precisely why the
//   filter has to be here from the first version rather than added later.
//
//   **A signed out caller gets an empty list, not a 401.** This runs on every
//   page, including pages a logged out visitor is expected to be on, and an
//   error in the console on the home page for the ordinary case would be noise
//   that trains everybody to ignore the console.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { localeFromRequest } from '../_lib/validate.js';
import { fetchOwnRatings, fetchPending } from '../_lib/apply.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  // Never cached, anywhere. It is per session, it changes the moment somebody
  // answers, and a shared cache holding one applicant's prompts would show them
  // to the next reader through the same edge node.
  res.setHeader('Cache-Control', 'no-store');

  const session = await getApplicantSession(req);
  if (!session) return ok(res, { prompts: [] });

  const locale = localeFromRequest(req);

  try {
    const rows = await fetchPending(session.user.id);
    if (rows.length === 0) return ok(res, { prompts: [] });

    const jobIds = [...new Set(rows.map((row) => row.job_id))];

    const [titles, ratings] = await Promise.all([
      jobTitles(jobIds, locale),
      fetchOwnRatings(session.user.id, jobIds),
    ]);

    const prompts = rows
      // A posting hard deleted in phase 7 takes its analytics rows with it, per
      // the cascade in migration 007, so this should never drop anything. It is
      // here so a prompt with no posting behind it is silently skipped rather
      // than rendered as a modal about a blank title.
      .filter((row) => titles.has(row.job_id))
      .map((row) => ({
        id: row.id,
        job_id: row.job_id,
        job_title: titles.get(row.job_id),
        rating: ratings.get(row.job_id) ?? null,
        created_at: row.created_at,
      }));

    return ok(res, { prompts });
  } catch (cause) {
    return failInternal(res, cause, 'pending prompts');
  }
}

/**
 * Titles for a set of postings, in one language.
 *
 * Only the title, because that is all 7c asks a prompt to carry. Resolved the
 * same way api/_lib/job-detail.js resolves everything else: the base row holds
 * the default language, a ready translation overrides it, and a blank field on
 * the translation falls back rather than blanking the posting.
 *
 * @param {string[]} jobIds
 * @param {string} locale
 * @returns {Promise<Map<string, string>>}
 */
async function jobTitles(jobIds, locale) {
  const map = new Map();

  const { data, error } = await supabase.from(T.jobs).select('id, title').in('id', jobIds);
  if (error) throw error;

  for (const row of data ?? []) map.set(row.id, row.title);

  if (locale === 'en') return map;

  const { data: translated, error: translationError } = await supabase
    .from(T.jobTranslations)
    .select('job_id, title')
    .in('job_id', jobIds)
    .eq('locale', locale)
    .eq('is_ready', true);

  if (translationError) {
    // The English title is a worse answer than the Chinese one and a much
    // better answer than no prompt at all.
    console.warn('[careers-gftv] pending prompt titles:', translationError);
    return map;
  }

  for (const row of translated ?? []) {
    if (row.title && String(row.title).trim() !== '') map.set(row.job_id, row.title);
  }

  return map;
}
