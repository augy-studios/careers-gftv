// GET /api/public/site-settings
//
// The public half of 8.10. The settings page writes the portal title, the hero
// copy, and the featured roles; this is what a reader's browser reads them
// back through, and it exists because a setting nothing reads is a control that
// does nothing.
//
// That failure has form in this build. Phase 7's second defect was the
// maintenance overrides being written by a page and read by nothing outside the
// dashboard, so every public control stayed enabled and the API answered 503
// when somebody used it. An editable hero line that never reaches the home page
// is the same shape of mistake, caught before it shipped rather than after.
//
// Three decisions worth keeping:
//
//   **It is not merged into /api/public/feature-status.** That endpoint answers
//   one question, is read during an outage, and deliberately carries no edge
//   cache after phase 7 measured a flip taking 69 seconds to reach a reader.
//   This one is ordinary content and can be cached; folding them together would
//   force one policy onto both.
//
//   **The wording is resolved server side**, to the language the request asks
//   for, so the browser gets a string rather than a per locale object it would
//   have to know the fallback rules for. Those rules live in settings.js and
//   there is one copy of them.
//
//   **The featured postings are shaped through publicJob()**, the same
//   allowlist the board uses. Section 4 is explicit that application_form_url
//   must never appear in a public payload, and the way that promise is kept is
//   by every public list going through the same function rather than by each
//   one remembering.
//
// Nothing here reads a session and nothing about a caller changes the answer.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { localeFromRequest } from '../_lib/validate.js';
import { allSettings, localisedSetting } from '../_lib/settings.js';
import { publicJob } from '../_lib/jobs.js';

/**
 * How stale an answer this endpoint accepts from the settings cache.
 *
 * Shorter than settings.js's own minute, and paired with the edge cache below
 * so the worst case an admin sees is about a minute rather than the ninety
 * seconds phase 7 measured on the feature status endpoint. The settings page
 * says "about a minute" out loud, and this is the number that has to make that
 * sentence true.
 */
const FRESH_MS = 15 * 1000;

const CACHE = {
  'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30',
  // The wording differs per language, so a shared cache must not hand a Chinese
  // reader the English answer. The locale arrives as a query parameter rather
  // than a header, so this is belt and braces rather than the mechanism.
  Vary: 'Accept-Language',
};

/** The most this will return, matching MAX_FEATURED in api/admin/settings.js. */
const MAX_FEATURED = 6;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  const locale = localeFromRequest(req);

  try {
    const settings = (await allSettings({ maxAgeMs: FRESH_MS })) ?? {};

    const [title, heading, body] = await Promise.all([
      localisedSetting('portal_title', locale, ''),
      localisedSetting('hero_heading', locale, ''),
      localisedSetting('hero_body', locale, ''),
    ]);

    // Only the home page renders featured roles, and every other page would be
    // paying for a query it has no use for. The parameter is opt in rather than
    // opt out so a caller that forgets it gets the cheap answer.
    const wantsFeatured = new URL(req.url ?? '/', 'https://careers.invalid').searchParams.has(
      'featured'
    );

    const ids =
      wantsFeatured && Array.isArray(settings.featured_job_ids)
        ? settings.featured_job_ids.filter((id) => typeof id === 'string').slice(0, MAX_FEATURED)
        : [];

    return ok(
      res,
      {
        locale,
        // Empty string rather than null when nothing is set, so the client can
        // treat "not configured" and "configured as blank" the same way: keep
        // whatever the dictionary already says.
        portal_title: title,
        hero_heading: heading,
        hero_body: body,
        featured: await featuredJobs(ids, locale),
      },
      { headers: CACHE }
    );
  } catch (cause) {
    return failInternal(res, cause, 'public site settings');
  }
}

/**
 * The featured postings, in the admin's chosen order.
 *
 * Built with a plain select rather than through gftvjobs_search_jobs, because
 * that function has no "these ids" filter and adding one would mean dropping
 * and recreating a 200 line RPC to answer a question with six answers. What it
 * does share is publicJob(): the rows are assembled into the shape that
 * function expects and passed through it, so the public allowlist is applied
 * exactly once and in the same place as everywhere else.
 *
 * Published only, and re-checked here rather than trusted from the setting: a
 * posting can be closed or archived long after somebody featured it, and the
 * home page must not link to a role that is no longer open.
 */
async function featuredJobs(ids, locale) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from(T.jobs)
    .select(
      `id, slug, title, summary, location, is_remote, commitment_type, is_paid,
       status, published_at, closes_at,
       department:${T.departments} ( id, name, slug ),
       job_tags:${T.jobTags} ( tag:${T.tags} ( id, name, slug, colour ) )`
    )
    .in('id', ids)
    .eq('status', 'published');

  if (error) throw error;

  const rows = data ?? [];
  const translations = await readyTranslations(
    rows.map((row) => row.id),
    locale
  );

  const shaped = new Map(
    rows.map((row) => {
      // A ready translation replaces the fields it carries and nothing else,
      // which is the same fallback rule the search function applies: a blank
      // field on a translation row falls back to the posting rather than
      // rendering empty. has_translation is what puts the "English only" badge
      // on a card, so it says whether one was used, not whether one exists.
      const translated = translations.get(row.id) ?? null;

      return [
        row.id,
        publicJob({
          id: row.id,
          slug: row.slug,
          title: translated?.title || row.title,
          summary: translated?.summary || row.summary,
          headline: null,
          department_id: row.department?.id ?? null,
          department_name: row.department?.name ?? null,
          department_slug: row.department?.slug ?? null,
          location: translated?.location || row.location,
          is_remote: row.is_remote,
          commitment_type: row.commitment_type,
          is_paid: row.is_paid,
          status: row.status,
          published_at: row.published_at,
          closes_at: row.closes_at,
          tags: (row.job_tags ?? [])
            .map((link) => link.tag)
            .filter(Boolean)
            .map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug, colour: tag.colour })),
          has_translation: translated !== null,
        }),
      ];
    })
  );

  // The admin's order, not the database's. That order is the editorial decision
  // the setting exists to record.
  return ids.map((id) => shaped.get(id)).filter((job) => job !== undefined);
}

/**
 * The ready translations for these postings in this language.
 *
 * Nothing is returned for the default language, where the posting itself is the
 * translation, and nothing is returned for a row that is not ready: is_ready is
 * the flag readers depend on, per 7i, and only an admin sets it.
 */
async function readyTranslations(ids, locale) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.jobTranslations)
    .select('job_id, title, summary, location')
    .in('job_id', ids)
    .eq('locale', locale)
    .eq('is_ready', true);

  // A translation lookup that fails must not take the home page down with it.
  // The postings are already in hand, and the English is a worse answer than
  // the Chinese but a much better one than an error.
  if (error) {
    console.warn('[careers-gftv] featured translations:', error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.job_id, row]));
}
