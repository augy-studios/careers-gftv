// The discovery files, from section 4: robots.txt, sitemap.xml, and the pointer
// between them. Phase 12 part 5.
//
// Section 4 puts these in this phase for a reason it states plainly: "Building
// them earlier just means listing placeholder routes." Half the site answered
// with the phase placeholder until recently, and a sitemap is a list of things
// worth reading.
//
// **Everything about whether this site may be indexed is one constant.**
// INDEXING below is read by api/robots.js and by nothing else that decides
// policy. While it is false the portal tells every crawler to stay away, which
// is the state it has been in since phase 1 and the state settled decision 3
// keeps it in until part 8: the three files are written here, and indexing is
// turned back on as the last act of the phase, so nothing is crawled mid pass.
//
// **The constant is half of a pair, and the phase file checks the other half.**
// vercel.json carries a global `X-Robots-Tag: noindex, nofollow` on every path,
// and that header and this constant say the same thing in two places. A
// robots.txt is a request not to crawl; the header is an instruction not to
// index, and it is what covers a URL somebody linked to from elsewhere, which a
// crawler may fetch without ever reading this file. Both went up together in
// phase 1 and both come out together in part 8, so
// `tests/phase12-test.mjs --only=discovery` fails when one moves without the
// other. vercel.json cannot carry a comment, so this is where that is written
// down. **The second X-Robots-Tag, on `/api/(.*)`, is separate and permanent.**
//
// **Both files are served from functions, and the static robots.txt had to go.**
// Vercel matches the filesystem before it consults rewrites — phase 3's rule,
// learned the hard way — so a `robots.txt` sitting in main-site/ would win over
// the rewrite and the switch below would be decoration. The file was deleted in
// the same commit that added this one, and the phase file checks that neither
// it nor a sitemap.xml has come back.
//
// llms.txt is the exception and stays a static file: it is prose about a site
// rather than an answer about its data, it changes when a page is added and
// never otherwise, and there is nothing in it for a switch to turn off.

/**
 * Whether this site may be listed in search engines.
 *
 * **Part 8 flips this to true and removes the global X-Robots-Tag from
 * vercel.json in the same commit.** Neither half works alone: allowing a crawl
 * while the header stands means pages that are fetched and never listed, and
 * removing the header while this is false means pages that are never fetched.
 */
export const INDEXING = false;

/**
 * The portal's own address, and it is a fallback rather than a source.
 *
 * `siteUrl()` reads SITE_URL and throws when it is unset, which is right for
 * every other route: a function that cannot tell where it is should fail rather
 * than guess. robots.txt is the exception, because **a 5xx robots.txt is read
 * by every major crawler as "do not crawl this site for now"**, so a missing
 * environment variable would quietly pause crawling of the whole portal and
 * nothing on screen would say so. Nothing in the file depends on the
 * environment except the absolute Sitemap line, so it falls back to this and
 * answers correctly. **Only api/robots.js may use it**, and only in a catch.
 */
export const CANONICAL_ORIGIN = 'https://careers.globalfurry.tv';

/** What vercel.json's global header says while INDEXING is false. */
export const NOINDEX_HEADER = 'noindex, nofollow';

/** Where the generated sitemap is served. Written once, used by both files. */
export const SITEMAP_PATH = '/sitemap.xml';

/**
 * The prefixes robots.txt keeps crawlers out of, per section 4: "allows the
 * public pages, disallows /admin, /account, and /api".
 *
 * /login, /register and /forgot-password are deliberately not here. They are
 * public pages that a person may legitimately arrive at from a search, they
 * carry `<meta name="robots" content="noindex">` in their own markup, and a
 * Disallow would stop a crawler ever reading that tag.
 */
export const DISALLOW = Object.freeze(['/admin', '/account', '/api']);

/**
 * Nothing under one of these ever enters the sitemap, whatever hands it to
 * sitemapXml. Section 4 names the first four; the rest are pages that exist and
 * are not destinations.
 */
export const NEVER_LISTED = Object.freeze([
  '/admin',
  '/account',
  '/api',
  '/login',
  '/register',
  // Not in section 4's list by name, and it belongs with /login for the same
  // reason: it is a step in getting back into an account.
  '/forgot-password',
  // 0c's placeholder for an unbuilt route, and the two pages that exist to be
  // served rather than to be visited.
  '/placeholder',
  '/offline',
  '/404',
]);

/**
 * The static pages in the sitemap, in the order section 4 lists them: "the home
 * page, /search, the static pages, /status, and every published job".
 *
 * **Neither /privacy nor /terms is here, although 4 calls them static.** Both
 * are 302 redirects to policy.globalfurry.tv in vercel.json, and a sitemap
 * entry for a URL that redirects off the site advertises somebody else's page
 * as one of ours. They are listed on the policy site or they are not listed.
 *
 * `lastmod` is a claim about when a page's content last changed, so most of
 * these carry none: a deploy that touches a stylesheet has not changed what the
 * FAQ says, and a date taken from a file's mtime in a fresh checkout is a date
 * about the checkout. /status is the one exception and it is honest — the page
 * renders assets/build-status.json and nothing else, so that file's own
 * `updated` field is exactly when the page last changed.
 */
export const STATIC_PAGES = Object.freeze(['/', '/search', '/about', '/faq', '/status']);

/** A posting's id, as it appears in a URL. Anything else is not a posting. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------
 * robots.txt
 * ---------------------------------------------------------------------- */

/**
 * The body of robots.txt.
 *
 * Three states rather than two, and they are told apart on purpose. The build
 * has needed this distinction once per phase since 10: not built, switched off,
 * and working are different claims, and a file a person reads with curl should
 * say which one it is looking at.
 *
 * @param {{ indexing: boolean, site: string, sitemap?: boolean }} options
 *   `sitemap` false points at nothing while the feature is switched off. The
 *   crawl rules are unchanged in that state — see api/robots.js for why.
 * @returns {string}
 */
export function robotsBody({ indexing, site, sitemap = true }) {
  const head = ['# www.robotstxt.org/', '#'];

  if (!indexing) {
    return [
      ...head,
      '# TEMPORARY. Careers@GFTV is being built and released in public, and',
      '# until it is finished it should not appear in search results. The board',
      '# still carries seeded sample postings, and a search result leading',
      '# somebody to one of those is worse than no search result at all.',
      '#',
      '# This file is generated by api/robots.js. The switch is INDEXING in',
      '# api/_lib/discovery.js, and it is false. The other half is the global',
      '# X-Robots-Tag: noindex, nofollow in vercel.json, which covers a URL',
      '# already known to a crawler that may not fetch the page and so cannot',
      '# read a tag on it. Both come out together.',
      '',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  const lines = [
    ...head,
    '# Careers@GFTV, the volunteer and staff recruitment portal for Global',
    '# Furry Television. The public pages are open. The dashboard, an',
    "# applicant's own account area, and the API are not.",
    '#',
    '# Generated by api/robots.js.',
    '',
    'User-agent: *',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    '',
  ];

  if (sitemap) {
    lines.push(`Sitemap: ${site}${SITEMAP_PATH}`, '');
  } else {
    // Said out loud rather than left as an absence, so somebody reading this
    // file during an outage is not left wondering whether it was ever there.
    lines.push(
      '# The sitemap is temporarily switched off. Nothing else has changed.',
      ''
    );
  }

  return lines.join('\n');
}

/* -------------------------------------------------------------------------
 * sitemap.xml
 * ---------------------------------------------------------------------- */

/**
 * The sitemap, built from a list of static paths and a list of postings.
 *
 * Pure, so the phase file can measure it without a database: everything that
 * decides what is in a sitemap is here, and api/sitemap.js is the query and the
 * headers.
 *
 * **A path under one of NEVER_LISTED throws rather than being dropped.** A
 * caller passing one has made a mistake in code, and a sitemap that quietly
 * omits what it was asked for is a sitemap nobody can check. A posting whose id
 * is not uuid shaped is dropped instead, because that one arrives from a row
 * rather than from a programmer.
 *
 * @param {{ site: string, paths?: string[], lastmod?: Record<string, string|null>,
 *           jobs?: Array<{ id: string, updated_at?: string|null }> }} input
 * @returns {string}
 */
export function sitemapXml({ site, paths = STATIC_PAGES, lastmod = {}, jobs = [] }) {
  const origin = String(site).replace(/\/+$/, '');

  const entries = [];

  for (const path of paths) {
    const forbidden = NEVER_LISTED.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (forbidden) {
      throw new Error(
        `sitemapXml was asked to list ${path}, which is under ${forbidden}. ` +
          `Section 4 excludes it, and NEVER_LISTED in api/_lib/discovery.js is the list.`
      );
    }
    entries.push({ loc: `${origin}${path === '/' ? '/' : path}`, lastmod: w3cDate(lastmod[path]) });
  }

  for (const job of jobs) {
    if (!UUID.test(String(job?.id ?? ''))) continue;
    entries.push({ loc: `${origin}/jobs/${job.id}`, lastmod: w3cDate(job.updated_at) });
  }

  const seen = new Set();
  const body = entries
    .filter((entry) => {
      if (seen.has(entry.loc)) return false;
      seen.add(entry.loc);
      return true;
    })
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      // A lastmod that could not be read is left out rather than defaulted to
      // now. "Changed today" is a claim, and the build's own rule is that a
      // value which could not be established is absent and never a number.
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  // No changefreq and no priority. Google has said for years that it ignores
  // both, and a field nobody reads is a field that goes stale without anybody
  // finding out.
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * A timestamp as sitemaps.org wants it, or null.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function w3cDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }[character];
  });
}
