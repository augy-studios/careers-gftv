// Reading the board's query string, and shaping a posting for a public caller.
//
// Section 4 puts every piece of search state in the URL: the query, the
// filters, the sort, and the page. That makes a result set shareable and the
// back button meaningful, and it means the client and this file have to agree
// exactly on the parameter names. They are listed once here and nowhere else.
//
// The names are load bearing beyond this file. shell.js already links to
// /search?closing_within_days=14 and /search?no_deadline=true from the footer,
// written in phase 1 against these names. Renaming one breaks a link that has
// been live since then.
//
// Everything here is defensive by default. This is the one part of the API a
// stranger can call with anything they like, so an unparseable number becomes
// absent rather than an error, an unknown sort becomes the default, and a
// filter list is capped rather than passed through at whatever length arrived.

/**
 * Results per page. The RPC's own default is 20 and its ceiling is 100; this
 * is the site's answer and the only place it is written down.
 */
export const PAGE_SIZE = 20;

/** The five keys migration 021 allows. Anything else is dropped. */
export const COMMITMENT_TYPES = Object.freeze([
  'full_time',
  'part_time',
  'volunteer',
  'contract',
  'internship',
]);

/** Sorts the RPC understands. Anything else falls back to its own default. */
export const SORTS = Object.freeze(['relevance', 'newest', 'closing']);

// A filter list longer than this is not a person using the interface. The tag
// cloud cannot select more tags than exist, and the cap keeps a hand written
// URL from turning into a very large array in a query plan.
const MAX_LIST = 40;

// Long enough for a real search, short enough that nobody is posting an essay
// through the query string. websearch_to_tsquery would cope; the trigram path
// on the other side of it is the one that would not enjoy a 10 KB argument.
const MAX_QUERY = 120;

// The furthest a caller may page. 500 pages of 20 is more postings than GFTV
// will ever have open at once, and without a ceiling a crawler walking page
// numbers costs a query each time for an empty result.
const MAX_PAGE = 500;

/**
 * Parse the request URL into everything the search RPC takes.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string} locale already validated by localeFromRequest
 * @returns {{ q: string|null, filters: object, page: number, limit: number,
 *             offset: number, sort: string|null }}
 */
export function parseSearchParams(req, locale) {
  const params = searchParams(req);

  const q = text(params.get('q'), MAX_QUERY);

  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : null;

  const filters = { locale };

  // statuses is deliberately not read from the query string. A caller must
  // never be able to ask this endpoint for drafts, and the RPC defaults to
  // published on its own, so the safest thing is to never mention it.

  const departments = slugList(params, 'dept');
  if (departments.length > 0) filters.department_slugs = departments;

  const tags = slugList(params, 'tags');
  if (tags.length > 0) filters.tag_slugs = tags;

  // Only meaningful alongside tags, and section 4 makes OR the default with a
  // "match all selected tags" toggle for AND.
  if (params.get('match') === 'all') filters.match_all_tags = true;

  // Not slugList. A commitment type is a key from migration 021's fixed set,
  // not a slug, and every one of them has an underscore in it, which the slug
  // pattern rejects. The allowlist below is the validation here, and a stricter
  // one than any pattern: nothing outside those five keys survives.
  const commitments = valueList(params, 'commitment').filter((value) =>
    COMMITMENT_TYPES.includes(value)
  );
  if (commitments.length > 0) filters.commitment_types = commitments;

  const location = text(params.get('location'), 80);
  if (location) filters.location = location;

  // Absent and false are different things here. Absent means "do not filter on
  // remote at all", false means "on site only", and the RPC reads a null as the
  // first of those.
  const remote = bool(params.get('remote'));
  if (remote !== null) filters.is_remote = remote;

  const postedWithin = int(params.get('posted_within_days'), 1, 3650);
  if (postedWithin !== null) filters.posted_within_days = postedWithin;

  const closingWithin = int(params.get('closing_within_days'), 1, 3650);
  if (closingWithin !== null) filters.closing_within_days = closingWithin;

  // Contradictory on its face with closing_within_days, and the RPC resolves it
  // by applying both, which returns nothing. That is the honest answer to a
  // reader who has somehow selected "closing soon" and "no deadline" together,
  // and the interface only lets one of the two be active at a time anyway.
  if (bool(params.get('no_deadline')) === true) filters.no_deadline = true;

  if (sort) filters.sort = sort;

  const page = int(params.get('page'), 1, MAX_PAGE) ?? 1;

  return {
    q,
    filters,
    sort,
    page,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

/**
 * One row from gftvjobs_search_jobs, shaped for the browser.
 *
 * Field by field rather than spreading the row, so a column added to the RPC
 * later cannot leak into a public payload by accident. That matters more than
 * usual here: section 4 is explicit that application_form_url must never appear
 * in a public payload, and the safest way to keep a promise like that is for
 * this function to be a list of what is allowed rather than a list of what is
 * removed.
 *
 * @param {object} row
 */
export function publicJob(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    // Contains <mark> and nothing else. Sanitised here rather than in the
    // browser, because ts_headline copies its source text through unescaped and
    // that source is written by an admin.
    headline: sanitiseHeadline(row.headline),
    department: row.department_id
      ? {
          id: row.department_id,
          name: row.department_name,
          slug: row.department_slug,
        }
      : null,
    location: row.location,
    is_remote: row.is_remote === true,
    commitment_type: row.commitment_type,
    // Migration 026 and 028. The board states pay as a fact about this posting
    // rather than as a promise in the site's copy.
    is_paid: row.is_paid === true,
    status: row.status,
    published_at: row.published_at,
    // Null means open until filled. Never coalesced, never defaulted, and the
    // client renders a sentence for it rather than a blank.
    closes_at: row.closes_at,
    tags: Array.isArray(row.tags) ? row.tags : [],
    // Whether a ready translation in the requested language was used. False on
    // a posting that exists only in the default language, which is what puts
    // the "English only" badge on the card.
    has_translation: row.has_translation === true,
  };
}

/**
 * Make a ts_headline snippet safe to assign with innerHTML.
 *
 * ts_headline wraps matches in the delimiters it was given and copies
 * everything else through untouched, so a posting whose summary contains a less
 * than sign arrives with that sign intact. Escaping the whole string would
 * escape the <mark> tags along with it and put the literal text on screen, so
 * the string is split on the tags, every other part is escaped, and the tags
 * themselves are the only markup that survives.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sanitiseHeadline(value) {
  if (typeof value !== 'string' || value === '') return '';

  return value
    .split(/(<\/?mark>)/i)
    .map((part) =>
      /^<\/?mark>$/i.test(part) ? part.toLowerCase() : escapeHtml(part)
    )
    .join('');
}

/* -------------------------------------------------------------------------
 * Small parsers
 * ---------------------------------------------------------------------- */

/** The query string, whatever shape the platform handed us the URL in. */
export function searchParams(req) {
  try {
    return new URL(req.url ?? '/', 'https://careers.invalid').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function text(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, maxLength);
}

/**
 * A comma separated list of slugs, deduplicated and capped.
 *
 * Repeating the parameter works too, so both ?tags=a,b and ?tags=a&tags=b mean
 * the same thing. Somebody hand editing a URL will try one of the two and
 * should not have to guess which.
 */
function slugList(params, name) {
  // Slugs are lowercase and hyphenated, per migration 004. Anything else
  // cannot match a row, so it is dropped rather than sent to the database.
  return valueList(params, name).filter((slug) =>
    /^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)
  );
}

/** The same splitting without the slug shape, for values that are not slugs. */
function valueList(params, name) {
  const seen = new Set();

  for (const raw of params.getAll(name)) {
    for (const piece of String(raw).split(',')) {
      const value = piece.trim().toLowerCase();
      if (value === '' || value.length > 60) continue;
      seen.add(value);
      if (seen.size >= MAX_LIST) return [...seen];
    }
  }

  return [...seen];
}

function int(value, min, max) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

/** true, false, or null for absent. An unrecognised value is absent. */
function bool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
