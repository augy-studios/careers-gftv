// One posting, read from the database and shaped for a public caller.
//
// Three routes need exactly the same work and must never disagree about it:
// api/job-page.js renders the posting page server side, api/public/job.js
// answers the browser with the same posting as JSON, and api/public/jobs-feed.js
// publishes the openings feed. The visibility rules, the language resolution,
// and above all the list of fields a stranger is allowed to see live here and
// only here.
//
// The one rule in this file that matters more than the rest:
//
//   **The Google Form URL must never leave this module.** Section 4: it must
//   not appear in the public job payload, the HTML source, the JSON-LD, or the
//   jobs.json feed, because it is the only thing the login gate actually
//   protects. publicJobDetail below is written as a list of what is allowed
//   rather than a list of what is removed, exactly as publicJob in jobs.js is,
//   and application_form_url, form_prefill, and response_sheet_url are not
//   selected from the database at all. Phase 5 fetches them from an
//   authenticated endpoint of its own.
//
// The second rule, from 7g, amends section 4's 404 rule and is easy to get
// backwards: a posting resolves when it is published or closed, or when the
// caller is an applicant who has applied to it or saved it. A draft is a 404
// for everybody, including a signed in applicant. Archived is a 404 for anyone
// with no history with it.

import { supabase, T } from './supabase.js';

/**
 * A uuid, by shape rather than by version.
 *
 * Deliberately loose about the version and variant nibbles. This decides
 * whether a URL segment is an id or a slug, and a strict pattern would turn a
 * legitimate row whose id happens not to be a v4 into a 404 that nothing on
 * this site could explain.
 */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}

/** A slug, per migration 004. Lowercase, hyphenated, bounded. */
const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export function isSlug(value) {
  return typeof value === 'string' && SLUG_SHAPE.test(value);
}

// Every column the public side of the site may read. application_form_url,
// form_prefill, response_sheet_url, created_by, and the three form_check_
// columns are absent on purpose: a column that is never selected cannot be
// leaked by a later edit to the shaping code.
const PUBLIC_COLUMNS = [
  'id',
  'slug',
  'title',
  'department_id',
  'summary',
  'description',
  'responsibilities',
  'requirements',
  'nice_to_have',
  'sections',
  'commitment_type',
  'location',
  'is_remote',
  'is_paid',
  'compensation_note',
  'openings',
  'status',
  'og_description',
  'published_at',
  'closes_at',
  'updated_at',
].join(', ');

/** Statuses that render for anybody at all. Draft never does. */
const PUBLIC_STATUSES = ['published', 'closed'];

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/**
 * Everything about one posting, in every language it is ready in.
 *
 * Separate queries rather than a PostgREST embed, matching api/public/facets.js.
 * The board is small, none of these rows are wide, and an embed puts the shape
 * of the answer in a select string where a relationship rename would break it
 * silently.
 *
 * @param {{ id?: string, slug?: string }} lookup
 * @returns {Promise<null | {
 *   job: object,
 *   department: object|null,
 *   tags: object[],
 *   translations: object[],
 *   departmentNames: Map<string, string>,
 *   tagNames: Map<string, Map<string, string>>
 * }>} null when nothing matches. An error throws, so the caller answers 500
 *     rather than 404: "we could not read the database" and "there is no such
 *     posting" are different answers and a reader deserves the right one.
 */
export async function fetchJobRecord(lookup) {
  const query = supabase.from(T.jobs).select(PUBLIC_COLUMNS).limit(1);

  const filtered = lookup.id
    ? query.eq('id', lookup.id)
    : query.eq('slug', lookup.slug);

  const { data, error } = await filtered;
  if (error) throw error;

  const job = data?.[0];
  if (!job) return null;

  const [departmentResult, jobTagsResult, translationsResult] = await Promise.all([
    job.department_id
      ? supabase
          .from(T.departments)
          .select('id, name, slug, description')
          .eq('id', job.department_id)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),

    supabase.from(T.jobTags).select('tag_id').eq('job_id', job.id),

    // Every language this posting is ready in, not just the one asked for. The
    // page inlines them all so switching language redraws from memory rather
    // than costing a request, which is what makes the globe feel instant on a
    // posting the way it does on the board.
    supabase
      .from(T.jobTranslations)
      .select(
        'locale, title, summary, description, responsibilities, requirements, ' +
          'nice_to_have, location, compensation_note, sections, og_description, updated_at'
      )
      .eq('job_id', job.id)
      .eq('is_ready', true),
  ]);

  if (departmentResult.error) throw departmentResult.error;
  if (jobTagsResult.error) throw jobTagsResult.error;
  if (translationsResult.error) throw translationsResult.error;

  const department = departmentResult.data?.[0] ?? null;
  const tagIds = (jobTagsResult.data ?? []).map((row) => row.tag_id);

  const [tagsResult, departmentTranslations, tagTranslations] = await Promise.all([
    tagIds.length > 0
      ? supabase
          .from(T.tags)
          .select('id, name, slug, colour')
          .in('id', tagIds)
          .order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),

    department
      ? supabase
          .from(T.departmentTranslations)
          .select('locale, name')
          .eq('department_id', department.id)
      : Promise.resolve({ data: [], error: null }),

    tagIds.length > 0
      ? supabase
          .from(T.tagTranslations)
          .select('tag_id, locale, name')
          .in('tag_id', tagIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A failed reference lookup is not a failed request, the same judgement
  // api/public/facets.js makes: names fall back to the base rows, and a posting
  // whose department reads in English is far better than no posting.
  if (tagsResult.error) console.warn('[careers-gftv] job tags lookup:', tagsResult.error);
  if (departmentTranslations.error) {
    console.warn('[careers-gftv] department translations:', departmentTranslations.error);
  }
  if (tagTranslations.error) {
    console.warn('[careers-gftv] tag translations:', tagTranslations.error);
  }

  // locale -> name
  const departmentNames = new Map();
  for (const row of departmentTranslations.data ?? []) {
    departmentNames.set(row.locale, row.name);
  }

  // locale -> (tag id -> name)
  const tagNames = new Map();
  for (const row of tagTranslations.data ?? []) {
    if (!tagNames.has(row.locale)) tagNames.set(row.locale, new Map());
    tagNames.get(row.locale).set(row.tag_id, row.name);
  }

  return {
    job,
    department,
    tags: tagsResult.data ?? [],
    translations: translationsResult.data ?? [],
    departmentNames,
    tagNames,
  };
}

/* -------------------------------------------------------------------------
 * Who may see it
 * ---------------------------------------------------------------------- */

/**
 * Whether this applicant has history with this posting.
 *
 * 7g: an archived posting resolves for an applicant with either a
 * gftvjobs_applications row or a gftvjobs_saved_jobs row for it, so somebody
 * can always reread what they applied for. Two cheap existence checks rather
 * than one join, because either one alone is enough.
 *
 * @param {string} jobId
 * @param {string|null} applicantId
 * @returns {Promise<boolean>}
 */
export async function hasHistoryWithJob(jobId, applicantId) {
  if (!applicantId) return false;

  const [applications, saved] = await Promise.all([
    supabase
      .from(T.applications)
      .select('id')
      .eq('job_id', jobId)
      .eq('applicant_id', applicantId)
      .limit(1),
    supabase
      .from(T.savedJobs)
      .select('id')
      .eq('job_id', jobId)
      .eq('applicant_id', applicantId)
      .limit(1),
  ]);

  // A failure here must not open a posting that should be closed, so an
  // unreadable table reads as no history rather than as history.
  if (applications.error) console.warn('[careers-gftv] history applications:', applications.error);
  if (saved.error) console.warn('[careers-gftv] history saved:', saved.error);

  return (applications.data?.length ?? 0) > 0 || (saved.data?.length ?? 0) > 0;
}

/**
 * Whether a posting renders at all, per 7g's amendment to section 4.
 *
 *   published, closed   renders for everybody
 *   archived            renders only with history, and read only
 *   draft, anything else  404 for everybody, including admins. An admin
 *                       preview is phase 7's and needs a session check this
 *                       route deliberately does not have.
 *
 * @param {object} job
 * @param {boolean} hasHistory
 * @returns {boolean}
 */
export function isVisible(job, hasHistory) {
  if (PUBLIC_STATUSES.includes(job.status)) return true;
  if (job.status === 'archived') return hasHistory === true;
  return false;
}

/* -------------------------------------------------------------------------
 * Resolving a language
 * ---------------------------------------------------------------------- */

// The fields a translation row may override. Anything blank on the translation
// falls back to the posting, per migration 014, so a translator need not repeat
// what has not changed.
const TRANSLATABLE = [
  'title',
  'summary',
  'description',
  'responsibilities',
  'requirements',
  'nice_to_have',
  'location',
  'compensation_note',
  // The embed line. It falls back to the posting's like every other field, even
  // though nothing serves a non English embed today: the per language line is
  // stored ready for a ?lang= parameter that does not exist, per section 4, and
  // resolving it here costs nothing and keeps the shape honest.
  'og_description',
];

function blank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * The posting's content in one language.
 *
 * Returns null for a language with no ready translation, so the caller can tell
 * "not translated" from "translated and identical". The default language always
 * resolves, from the base row.
 *
 * @param {object} record from fetchJobRecord
 * @param {string} locale
 * @returns {null | object}
 */
export function resolveContent(record, locale) {
  const { job, department, tags, translations, departmentNames, tagNames } = record;

  const translation =
    locale === 'en' ? null : translations.find((row) => row.locale === locale) ?? null;

  if (locale !== 'en' && !translation) return null;

  const content = {};
  for (const field of TRANSLATABLE) {
    content[field] = translation && !blank(translation[field]) ? translation[field] : job[field];
  }

  // Sections are all or nothing rather than merged entry by entry. A translator
  // who merges two sections into one has not done anything wrong, per migration
  // 019, so an empty array on the translation means "this language has no extra
  // sections" only when the translation is otherwise present, and a translation
  // that left them alone falls back to the posting's.
  const translatedSections = Array.isArray(translation?.sections) ? translation.sections : [];
  content.sections =
    translatedSections.length > 0
      ? translatedSections
      : Array.isArray(job.sections)
        ? job.sections
        : [];

  content.department = department
    ? {
        id: department.id,
        slug: department.slug,
        name: departmentNames.get(locale) ?? department.name,
      }
    : null;

  const namesForLocale = tagNames.get(locale) ?? new Map();
  content.tags = tags.map((tag) => ({
    id: tag.id,
    slug: tag.slug,
    colour: tag.colour,
    name: namesForLocale.get(tag.id) ?? tag.name,
  }));

  // False for the default language by definition: migration 014 forbids a
  // translation row for it, so there is nothing to have been translated. The
  // client uses this to decide whether the untranslated notice means anything
  // to this reader, exactly as the board's badge does.
  content.has_translation = translation !== null;

  return content;
}

/**
 * The parts of a posting that are the same whatever language it is read in.
 * Every field here is either an identifier, a date, or a boolean, so none of
 * them belongs in the per language content above.
 *
 * @param {object} record
 */
export function jobFacts(record) {
  const { job } = record;
  const closesAt = job.closes_at ?? null;
  const expired = closesAt !== null && Date.parse(closesAt) < Date.now();

  return {
    id: job.id,
    slug: job.slug,
    status: job.status,
    is_paid: job.is_paid === true,
    is_remote: job.is_remote === true,
    commitment_type: job.commitment_type ?? null,
    openings: Number(job.openings ?? 1),
    published_at: job.published_at ?? null,
    // Null means open until filled. Never coalesced, and the client renders a
    // sentence for it rather than a blank.
    closes_at: closesAt,
    updated_at: job.updated_at ?? null,

    // Derived once here so the page, the feed, and phase 5's apply endpoint
    // cannot each answer "can this be applied to" differently.
    //
    //   is_open      the Apply button may be live
    //   is_expired   published but past its date, which the phase 9 cron has
    //                not yet swept. It reads as closed to a person.
    //   is_archived  7g's read only state, reachable only with history
    is_open: job.status === 'published' && !expired,
    is_expired: expired,
    is_archived: job.status === 'archived',
  };
}

/**
 * One posting, whole, in one language. The shape api/public/job.js returns and
 * the shape the page hydrates from.
 *
 * @param {object} record
 * @param {string} locale
 */
export function publicJobDetail(record, locale) {
  const content = resolveContent(record, locale) ?? resolveContent(record, 'en');

  return {
    ...jobFacts(record),
    ...content,
    locale,
  };
}

/* -------------------------------------------------------------------------
 * The embed line
 * ---------------------------------------------------------------------- */

// Roughly where unfurlers cut. Discord shows around 350 and most others cut
// nearer 200, so anything past this is guaranteed to be truncated mid sentence
// in at least one client.
const EMBED_MAX = 200;

/**
 * The line that appears when a posting link is unfurled.
 *
 * Section 4, in order: the admin's own og_description if there is one,
 * otherwise the first sentence of the description. The first sentence, not the
 * first N characters, so the embed never ends mid word.
 *
 * Sentence detection is language aware, which is the part that is easy to get
 * wrong: English ends a sentence with a full stop and Mandarin with U+3002, and
 * a Mandarin paragraph contains no full stops at all, so an English-only rule
 * returns the whole paragraph.
 *
 * @param {object} content a resolved content object, whose og_description has
 *        already fallen back to the posting's if the translation left it blank
 * @param {string} locale
 * @returns {string}
 */
export function embedDescription(content, locale) {
  const written = content.og_description;
  if (!blank(written)) return cap(String(written).trim());

  const prose = stripMarkdown(content.description ?? content.summary ?? '');
  if (prose === '') return '';

  return cap(firstSentence(prose, locale));
}

/**
 * The first sentence of a run of prose.
 *
 * Han script gets its own terminators, and both sets are checked whatever the
 * locale says, because a Chinese posting may quote an English sentence and an
 * English one may carry a Chinese name. The locale decides which set is tried
 * first, not which set exists.
 *
 * @param {string} value already stripped of markdown
 * @param {string} locale
 */
export function firstSentence(value, locale) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') return '';

  const order = locale === 'en' ? [latinEnd, hanEnd] : [hanEnd, latinEnd];

  for (const find of order) {
    const end = find(text);
    if (end !== null) return text.slice(0, end).trim();
  }

  // No terminator either script recognises. The whole paragraph is the honest
  // answer, and cap() shortens it.
  return text;
}

/**
 * Where the first Han sentence ends, or null.
 *
 * U+3002 ideographic full stop, U+FF01 fullwidth exclamation, U+FF1F fullwidth
 * question mark. No guard of any kind is needed here, and that is the
 * difference from the Latin case below: Han script has no abbreviation that
 * ends in U+3002, so one of these characters always ends a sentence.
 */
function hanEnd(text) {
  const index = text.search(/[。！？]/);
  return index === -1 ? null : index + 1;
}

// Words that legitimately carry a full stop without ending a sentence. A
// terminator following one of these is skipped, which is why this is not a one
// line regex: "We record at 4 p.m. on Saturdays" would otherwise embed as
// "We record at 4 p.m." and read as though the sentence had been cut off.
//
// The first alternative, a single letter, covers every initialism nobody
// thought to list, including the second half of "p.m." itself.
const ABBREVIATION =
  /(?:^|[\s(])(?:[A-Za-z]|[ap]\.?m|e\.g|i\.e|etc|vs|approx|Mr|Mrs|Ms|Dr|St|No|Ave|Rd)\.$/i;

/**
 * Where the first Latin sentence ends, or null.
 *
 * A terminator only counts when a space or the end of the string follows it,
 * which keeps a decimal point and a domain name out of it, and when what comes
 * before it is not an abbreviation.
 */
function latinEnd(text) {
  const pattern = /[.!?](?=\s|$)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + 1;
    const head = text.slice(0, end);
    if (ABBREVIATION.test(head)) continue;
    // A two character "sentence" is a stray mark rather than a sentence.
    if (head.trim().length < 3) continue;
    return end;
  }

  return null;
}

/**
 * Cut a string to the embed length at a word boundary.
 *
 * No spaces at all is the ordinary case in Chinese, where every character is a
 * valid boundary and there is no word boundary to find, so the fallback is a
 * plain cut rather than a failure to cut at all.
 */
function cap(value) {
  const text = String(value).trim();
  if (text.length <= EMBED_MAX) return text;

  const cut = text.slice(0, EMBED_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > EMBED_MAX * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Plain text from the small markdown subset the body renderer understands.
 *
 * Used for the embed line and for the JSON-LD description's plain text
 * variants. It removes marks rather than escaping them: this output goes into
 * an attribute or a JSON string, never into markup.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stripMarkdown(value) {
  if (typeof value !== 'string') return '';

  return value
    // Links: keep the text, drop the address. An unfurl carrying a bare URL
    // out of the middle of a sentence reads as a broken embed.
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    // Emphasis markers, heading hashes, and list bullets.
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
