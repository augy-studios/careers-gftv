// The applicant dashboard's server side, shared by the three list pages.
//
// Section 7g gives /account/applications, /account/saved, and /account/tasks
// the same problem: each holds a set of postings the applicant has some
// relationship with, and each has to render those postings' own wording in the
// reader's language. Solving it once here is what keeps the three from
// disagreeing about what a posting is called.
//
// Two rules, both from 7g, and both easy to lose:
//
//   **These lists must keep working for postings that are closed, expired, or
//   archived.** That is the whole difference between this and api/public/*: the
//   board reads published postings and nothing else, and this deliberately does
//   not filter on status at all. An applicant can always reread what they
//   applied for. The reading is scoped by the applicant's own rows rather than
//   by the posting's status, and the only thing that ever reaches this module is
//   a set of ids that came out of a table filtered on their session.
//
//   **A summary carries no form URL.** application_form_url, form_prefill, and
//   response_sheet_url are absent from the column list on purpose, exactly as
//   api/_lib/job-detail.js keeps them out of the public payload. Nothing on the
//   dashboard hands anybody over to a form; that is api/applications/start.js's
//   job and it is the only route that may.

import { supabase, T } from './supabase.js';

// Everything a row on a dashboard list draws, and nothing else. The full
// posting is one click away at /jobs/{uuid}, which is where somebody who wants
// to reread it is going anyway.
const SUMMARY_COLUMNS = [
  'id',
  'slug',
  'title',
  'department_id',
  'status',
  'location',
  'is_remote',
  'is_paid',
  'commitment_type',
  'published_at',
  'closes_at',
].join(', ');

/**
 * The buckets 7g asks My applications to offer, "mirroring the admin ones".
 *
 * Three, not nine. Section 8.1 gives an admin a tab per status because an admin
 * moves rows between them; an applicant only needs to know whether a thing is
 * waiting on them, live, or over, and nine tabs of which seven are usually
 * empty is a worse answer than three that are all meaningful.
 *
 * 'all' is not in the map. It is the absence of a filter.
 */
export const BUCKETS = Object.freeze({
  // Handed over to the form, never confirmed. This is the bucket that is
  // usually waiting on the applicant rather than on us.
  in_progress: ['started'],
  // Applied, and somewhere in the pipeline.
  submitted: ['submitted', 'under_review', 'shortlisted', 'interview', 'offered'],
  // Over, whichever way it went. Withdrawn sits here rather than in its own
  // bucket: from the applicant's side it is closed out, and a bucket holding
  // only the applications they pulled would be a list of their own regrets.
  closed: ['accepted', 'rejected', 'withdrawn'],
});

/** Which bucket a tracking status falls in, or null for an unknown status. */
export function bucketFor(status) {
  for (const [bucket, statuses] of Object.entries(BUCKETS)) {
    if (statuses.includes(status)) return bucket;
  }
  return null;
}

/** Whether a string names a bucket. 'all' is accepted and means no filter. */
export function isBucket(value) {
  return value === 'all' || Object.prototype.hasOwnProperty.call(BUCKETS, value);
}

/**
 * Summaries for a set of postings, in one language.
 *
 * Four queries at most, whatever the length of the list, rather than one per
 * row: the postings, their translations, their departments, and the department
 * translations. Everything after that is map lookups.
 *
 * Resolved exactly the way api/_lib/job-detail.js resolves a single posting: the
 * base row holds the default language, a translation marked ready overrides it,
 * and a blank field on the translation falls back rather than blanking the row.
 * A posting that is missing from the answer has been hard deleted, and every
 * caller drops the row rather than drawing a blank title.
 *
 * @param {string[]} jobIds
 * @param {string} locale
 * @returns {Promise<Map<string, object>>}
 */
export async function jobSummaries(jobIds, locale) {
  const map = new Map();

  const ids = [...new Set(jobIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const { data: jobs, error } = await supabase
    .from(T.jobs)
    .select(SUMMARY_COLUMNS)
    .in('id', ids);

  if (error) throw error;
  if (!jobs || jobs.length === 0) return map;

  const departmentIds = [...new Set(jobs.map((job) => job.department_id).filter(Boolean))];

  const [translations, departments, departmentTranslations] = await Promise.all([
    // Migration 014 forbids a translation row for the default language, so the
    // common path costs nothing.
    locale === 'en'
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from(T.jobTranslations)
          .select('job_id, title, location')
          .in('job_id', ids)
          .eq('locale', locale)
          .eq('is_ready', true),

    departmentIds.length > 0
      ? supabase.from(T.departments).select('id, name, slug').in('id', departmentIds)
      : Promise.resolve({ data: [], error: null }),

    departmentIds.length > 0 && locale !== 'en'
      ? supabase
          .from(T.departmentTranslations)
          .select('department_id, name')
          .in('department_id', departmentIds)
          .eq('locale', locale)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A reference lookup that fails falls back to the base rows rather than
  // failing the request, the same judgement job-detail.js and facets.js make. A
  // list that reads in English is a much better answer than no list.
  if (translations.error) console.warn('[careers-gftv] summary translations:', translations.error);
  if (departments.error) console.warn('[careers-gftv] summary departments:', departments.error);
  if (departmentTranslations.error) {
    console.warn('[careers-gftv] summary department names:', departmentTranslations.error);
  }

  const translated = new Map();
  for (const row of translations.data ?? []) translated.set(row.job_id, row);

  const departmentById = new Map();
  for (const row of departments.data ?? []) departmentById.set(row.id, row);

  const departmentName = new Map();
  for (const row of departmentTranslations.data ?? []) {
    if (!blank(row.name)) departmentName.set(row.department_id, row.name);
  }

  for (const job of jobs) {
    const translation = translated.get(job.id) ?? null;
    const department = job.department_id ? departmentById.get(job.department_id) : null;

    map.set(job.id, {
      id: job.id,
      slug: job.slug,
      title: pick(translation?.title, job.title),
      location: pick(translation?.location, job.location),
      status: job.status,
      is_remote: job.is_remote === true,
      is_paid: job.is_paid === true,
      commitment_type: job.commitment_type ?? null,
      published_at: job.published_at ?? null,
      closes_at: job.closes_at ?? null,
      // Whether the posting is still taking applications, resolved here rather
      // than left to the client. 7g wants a saved posting that has closed to
      // stay on the list carrying a badge, so the badge needs an answer that
      // knows both the status and the clock, and a null closes_at is open until
      // filled and never expires.
      is_open: job.status === 'published' && !expired(job.closes_at),
      is_archived: job.status === 'archived',
      department: department
        ? {
            id: department.id,
            slug: department.slug,
            name: departmentName.get(department.id) ?? department.name,
          }
        : null,
      // False for the default language by definition, exactly as on the board:
      // there is no translation row for it, so there is nothing to have been
      // translated and the badge would mean nothing to that reader.
      has_translation: translation !== null,
    });
  }

  return map;
}

function expired(closesAt) {
  return closesAt !== null && closesAt !== undefined && Date.parse(closesAt) < Date.now();
}

function blank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function pick(translated, base) {
  return blank(translated) ? (base ?? null) : translated;
}
