// GET /api/public/facets
//
// Everything the filter panel and the quick chips need, in one call.
//
// Section 9 lists departments and tags as separate public routes. They are one
// route here on purpose: the board needs both plus the chip counts plus which
// commitment types are actually in use before it can draw its filter panel at
// all, and three requests to draw one panel is three chances for it to appear
// in pieces. Splitting them later costs nothing, since nothing else calls this.
//
// Public and session free, like the rest of api/public.
//
// What it counts, and what it does not:
//
//   Departments      published postings in each. A department with none is
//                    dropped, since a filter that returns nothing is not a
//                    filter, it is a dead end with a name on it.
//   Tags             gftvjobs_tags.usage_count, maintained by the triggers in
//                    migration 007 and already defined as published postings
//                    carrying the tag. Section 4 says hide tags with zero, so
//                    zero is where the list ends.
//   Commitments      only the types some published posting actually uses. All
//                    five keys exist in the dictionary; offering a filter for
//                    a type nobody has posted is the same dead end.
//   Chips            the four quick filters from section 4, each with a live
//                    count.
//
// None of these counts narrow as the reader filters. A tag count that changed
// every time another filter moved would make the panel jump under the cursor,
// and section 4 asks for a count beside each tag rather than a count within the
// current result set.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { localeFromRequest } from '../_lib/validate.js';
import { COMMITMENT_TYPES } from '../_lib/jobs.js';

// The three windows behind the quick chips. Sent to the client so it builds its
// chip links from the same numbers these counts were made with, rather than
// hardcoding 14 in a second place and drifting.
//
// Section 4 fixes closing soon at 14 days and is explicit that it never
// includes a deadline free posting.
const CHIP_DAYS = Object.freeze({
  posted_today: 1,
  posted_week: 7,
  closing_soon: 14,
});

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  const locale = localeFromRequest(req);

  try {
    // Three queries rather than one view. The board is small, none of these
    // rows are wide, and a view would be a migration the phase does not
    // otherwise need.
    const [jobsResult, departmentsResult, tagsResult] = await Promise.all([
      supabase
        .from(T.jobs)
        .select('id, department_id, commitment_type, published_at, closes_at')
        .eq('status', 'published'),

      supabase
        .from(T.departments)
        .select('id, name, slug, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),

      supabase
        .from(T.tags)
        .select('id, name, slug, colour, usage_count')
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true }),
    ]);

    if (jobsResult.error) return failInternal(res, jobsResult.error, 'public facets jobs');
    if (departmentsResult.error) {
      return failInternal(res, departmentsResult.error, 'public facets departments');
    }
    if (tagsResult.error) return failInternal(res, tagsResult.error, 'public facets tags');

    const jobs = jobsResult.data ?? [];
    const departments = departmentsResult.data ?? [];
    const tags = tagsResult.data ?? [];

    // Names in the reader's language. Skipped entirely for the default
    // language, where the base row already is the answer and the translation
    // tables are constrained to never hold a row for it.
    const [departmentNames, tagNames] = await Promise.all([
      translatedNames(T.departmentTranslations, 'department_id', locale),
      translatedNames(T.tagTranslations, 'tag_id', locale),
    ]);

    const now = Date.now();
    const perDepartment = new Map();
    const perCommitment = new Map();
    const chips = {
      posted_today: 0,
      posted_week: 0,
      closing_soon: 0,
      no_deadline: 0,
    };

    for (const job of jobs) {
      if (job.department_id) {
        perDepartment.set(
          job.department_id,
          (perDepartment.get(job.department_id) ?? 0) + 1
        );
      }

      if (job.commitment_type) {
        perCommitment.set(
          job.commitment_type,
          (perCommitment.get(job.commitment_type) ?? 0) + 1
        );
      }

      const published = job.published_at ? Date.parse(job.published_at) : NaN;
      if (Number.isFinite(published)) {
        if (published >= now - days(CHIP_DAYS.posted_today)) chips.posted_today += 1;
        if (published >= now - days(CHIP_DAYS.posted_week)) chips.posted_week += 1;
      }

      if (job.closes_at === null || job.closes_at === undefined) {
        // Open until filled. Deliberately its own count rather than the
        // absence of one, because section 4 offers it as a filter people
        // actively want: a posting with no deadline is one you can think about.
        chips.no_deadline += 1;
      } else {
        const closes = Date.parse(job.closes_at);
        if (
          Number.isFinite(closes) &&
          closes >= now &&
          closes <= now + days(CHIP_DAYS.closing_soon)
        ) {
          chips.closing_soon += 1;
        }
      }
    }

    return ok(
      res,
      {
        locale,
        total: jobs.length,

        departments: departments
          .map((row) => ({
            id: row.id,
            slug: row.slug,
            name: departmentNames.get(row.id) ?? row.name,
            count: perDepartment.get(row.id) ?? 0,
          }))
          .filter((row) => row.count > 0),

        tags: tags.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: tagNames.get(row.id) ?? row.name,
          colour: row.colour,
          count: Number(row.usage_count ?? 0),
        })),

        // Ordered as migration 021 lists them rather than by count, so the
        // filter does not reshuffle itself as postings come and go.
        commitments: COMMITMENT_TYPES.filter((key) => perCommitment.has(key)).map(
          (key) => ({ key, count: perCommitment.get(key) })
        ),

        chips,
        chip_days: CHIP_DAYS,
      },
      { headers: CACHE }
    );
  } catch (cause) {
    return failInternal(res, cause, 'public facets');
  }
}

/**
 * Translated names for a reference table, as a map keyed by the base row's id.
 *
 * Empty for the default language without a query. Migration 014 constrains both
 * translation tables to `locale <> 'en'`, so asking for English would always
 * return nothing and the round trip would be pure cost.
 */
async function translatedNames(table, idColumn, locale) {
  const names = new Map();
  if (locale === 'en') return names;

  const { data, error } = await supabase
    .from(table)
    .select(`${idColumn}, name`)
    .eq('locale', locale);

  // A failed translation lookup is not a failed request. The names fall back to
  // the base rows, which is English, and a filter panel in English is a great
  // deal better than no filter panel.
  if (error) {
    console.warn('[careers-gftv] facets translation lookup failed:', error);
    return names;
  }

  for (const row of data ?? []) names.set(row[idColumn], row.name);
  return names;
}

function days(count) {
  return count * 24 * 60 * 60 * 1000;
}

// Longer than search, because this changes only when a posting is published or
// closed, and every reader of the board asks for it.
const CACHE = {
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=900',
};
