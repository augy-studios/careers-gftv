// THIS SITE'S OWN FILE. Not generated.
//
// The docs site's three discovery files: robots.txt, sitemap.xml and llms.txt.
// Phase 14 part 8.
//
// **They are generated from the `access` key, which is the only thing on this
// site that decides who may read a page.** `pages.js` turns that key into an
// answer for a request; this turns the same key into three files for a crawler,
// so a page cannot be public to a reader and absent from the sitemap, or gated
// to a reader and advertised in it. There is no second list.
//
// ---------------------------------------------------------------------------
// Why these are static files and the portal's are functions
// ---------------------------------------------------------------------------
//
// `main-site/api/_lib/discovery.js` exists because the portal's answer depends
// on two things a file cannot know: a maintenance switch read from the database,
// and the set of published postings. Neither is true here. **What is in this
// site's sitemap is decided at deploy time and cannot change until the next
// one**, because a page is a committed markdown file, so a function would be
// three routes doing a database-free computation on every request that a build
// already did once.
//
// So `scripts/build.js` writes all three into `dist/`, where Vercel serves them
// from the filesystem. That is also what makes them work at all: this project
// rewrites `/((?!api/|assets/).*)` to the shell, and a rewrite would swallow
// `/robots.txt` if the filesystem did not win first. Phase 3's rule, used in the
// right direction for once.
//
// ---------------------------------------------------------------------------
// What a crawler is kept out of, and the two instruments
// ---------------------------------------------------------------------------
//
// **`/staff` answers 200 to everybody**, and that is not a defect: the shell is
// served at every gated address and fills itself in from `api/content`, which is
// where the gate is. A crawler fetching `/staff/admin/daily-run` gets the shell,
// no article, and the shell's own generic card.
//
// It should not be in an index all the same, and robots.txt alone will not do
// it: **a Disallow is a request not to crawl, and it is not an instruction not
// to list.** A URL somebody linked to from elsewhere can be listed on the
// strength of the link, with no fetch and therefore no chance to read anything
// on the page. That is the portal's own reasoning for keeping an X-Robots-Tag
// beside its robots.txt, and it applies here to the gated half.
//
// So there are two halves and they say the same thing:
//
//   Disallow: /staff        in robots.txt, from DISALLOW below
//   X-Robots-Tag: noindex   on /staff and /staff/(.*), in vercel.json
//
// `tests/phase14-test.mjs --only=discovery` compares them and fails when one
// moves without the other, in both directions. vercel.json cannot carry a
// comment, so this is where that is written down.

/**
 * Whether this site may be listed in search engines.
 *
 * True, and it has been in effect since the site went up: unlike the portal,
 * this one has never carried a global X-Robots-Tag and has had no robots.txt at
 * all, so every crawler that found it has been free to read everything. What
 * part 8 changes is not whether it is crawled but what it is told.
 *
 * The constant is here so that the answer is written down in one place and
 * checked against vercel.json, which is the discipline the portal's own
 * INDEXING earned over three phases. Turning it off is one edit here and a
 * global header added there, and the phase file fails until both have moved.
 */
export const INDEXING = true;

/** This site's own address. The build reads the shell's canonical link instead;
    this is what the checks compare that against. */
export const CANONICAL_ORIGIN = 'https://docs.careers.globalfurry.tv';

/** What the header on the gated half says, and what vercel.json has to carry. */
export const NOINDEX_HEADER = 'noindex';

/** The two source patterns in vercel.json that header sits on. */
export const NOINDEX_SOURCES = Object.freeze(['/staff', '/staff/(.*)']);

/** Where the generated sitemap is served. Written once, used by both files. */
export const SITEMAP_PATH = '/sitemap.xml';

/**
 * The prefixes robots.txt keeps crawlers out of.
 *
 * `/staff` is the gated tree, which is `GATED_PREFIX` in `pages.js` and the
 * address `main-site/vercel.json` has redirected `/admin/docs` to since phase 8.
 * `/api` is every function, including the sign in and the content route: none of
 * them is a page, and the content route answers 404 to a crawler anyway.
 *
 * **`/login` is deliberately not here**, and the portal gives the reason for its
 * own: it is a public address somebody may legitimately arrive at from a search,
 * and a Disallow would stop a crawler ever reading what is on it. It is not in
 * the sitemap either — it is a step in getting somewhere, and not a destination.
 */
export const DISALLOW = Object.freeze(['/staff', '/api']);

/**
 * The opening of llms.txt.
 *
 * Prose, because that is what the format is for: a model arriving at a
 * documentation site needs to be told what it is documentation of before a list
 * of page titles means anything. Everything after this is generated from the
 * public page list, so the part that goes stale is the part nobody wrote.
 *
 * It says the gated half exists and says it is not listed. A model that knows
 * four guides exist and can read three of them will say so, which is better than
 * one that concludes the staff guides were never written.
 */
export const LLMS_PREAMBLE = [
  '# Careers@GFTV documentation',
  '',
  '> Guides to Careers@GFTV, the recruitment portal for Global Furry Television,',
  '> and to its Telegram bot. Written for the people who use them: somebody',
  '> applying for a volunteer role, somebody helping with translations, and the',
  '> volunteers who run the board.',
  '',
  'The pages below are the public half and are readable by anyone. There is a',
  'second half for staff, at /staff, covering the dashboard, administration and',
  'the build itself. It is not listed here and is not readable without a staff',
  'account, so nothing in this file points at it.',
  '',
  'Everything is written in English. The portal itself is published in English',
  'and Singapore Mandarin.',
].join('\n');

/* -------------------------------------------------------------------------
 * robots.txt
 * ---------------------------------------------------------------------- */

/**
 * The body of robots.txt.
 *
 * Two states, told apart on purpose, the way the portal's three are: a person
 * reading this file with curl should be able to see which one they are looking
 * at instead of inferring it from an absence.
 *
 * @param {{ indexing: boolean, site: string }} options
 * @returns {string}
 */
export function robotsBody({ indexing, site }) {
  const head = ['# www.robotstxt.org/', '#'];

  if (!indexing) {
    return [
      ...head,
      '# The Careers@GFTV documentation is temporarily not to be listed.',
      '#',
      '# This file is generated by scripts/build.js. The switch is INDEXING in',
      '# scripts/discovery.js, and it is false. The other half is a global',
      '# X-Robots-Tag in vercel.json, which covers a URL already known to a',
      '# crawler that may not fetch the page and so cannot read a tag on it.',
      '# Both come out together.',
      '',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  return [
    ...head,
    '# The Careers@GFTV documentation. The guides to the portal, the Telegram',
    '# bot and helping with translations are open. The staff guides under /staff',
    '# are not: they are served per role behind a sign in, and the addresses',
    '# below the gate answer with an empty shell to anybody else.',
    '#',
    '# Generated by scripts/build.js, from each page\'s own access key.',
    '',
    'User-agent: *',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${site}${SITEMAP_PATH}`,
    '',
  ].join('\n');
}

/* -------------------------------------------------------------------------
 * sitemap.xml
 * ---------------------------------------------------------------------- */

/**
 * The sitemap, from the public pages and their dates.
 *
 * Pure, so the phase file can measure it without running a build.
 *
 * **A page under one of DISALLOW throws rather than being dropped.** The caller
 * is `scripts/build.js` with a list it filtered itself, so one arriving here is
 * a mistake in code, and a sitemap that quietly omits what it was asked for is a
 * sitemap nobody can check. The portal's own rule, and the reason it has one.
 *
 * `lastmod` is git's date for the file, which is the honest answer to "when did
 * this page last change": the build already reads it for the line at the foot of
 * every page, so the sitemap and the page cannot disagree. A page git has never
 * seen carries no date, here as there.
 *
 * @param {{ site: string, paths: string[], lastmod?: Record<string, string|null> }} input
 * @returns {string}
 */
export function sitemapXml({ site, paths, lastmod = {} }) {
  const origin = String(site).replace(/\/+$/, '');
  const seen = new Set();
  const entries = [];

  for (const path of paths) {
    const forbidden = DISALLOW.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (forbidden) {
      throw new Error(
        `sitemapXml was asked to list ${path}, which is under ${forbidden}. ` +
          'DISALLOW in scripts/discovery.js is the list, and a gated page is never in a sitemap.'
      );
    }

    const loc = `${origin}${path === '/' ? '/' : path}`;
    if (seen.has(loc)) continue;
    seen.add(loc);
    entries.push({ loc, lastmod: w3cDate(lastmod[path]) });
  }

  const body = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      // Absent rather than defaulted to now, which is this build's rule about
      // every value it could not establish.
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  // No changefreq and no priority, for the reason the portal's sitemap gives:
  // Google has said for years that it ignores both, and a field nobody reads is
  // a field that goes stale without anybody finding out.
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    '',
  ].join('\n');
}

/* -------------------------------------------------------------------------
 * llms.txt
 * ---------------------------------------------------------------------- */

/**
 * llms.txt, from the public sections and the pages in them.
 *
 * The portal's is a hand written file and stays one: it is prose about a job
 * board, and there are five pages to list. This site has thirty and they are
 * already grouped, titled and summarised in front matter, so a hand written copy
 * would be the same information typed twice with nothing comparing them.
 *
 * A page with no summary is listed by title alone. The alternative is inventing
 * a line of description for it here, which is the one thing a generated file
 * must never do.
 *
 * @param {{ site: string, sections: Array<{ title: string, pages: Array<{ path: string,
 *          title: string, summary: string|null }> }>, home?: { path: string,
 *          title: string, summary: string|null }|null }} input
 * @returns {string}
 */
export function llmsTxt({ site, sections, home = null }) {
  const origin = String(site).replace(/\/+$/, '');
  const link = ({ path, title, summary }) =>
    `- [${title}](${origin}${path === '/' ? '/' : path})` + (summary ? `: ${summary}` : '');

  const out = [LLMS_PREAMBLE, ''];

  if (home) {
    out.push('## Start here', '', link(home), '');
  }

  for (const section of sections) {
    out.push(`## ${section.title}`, '');
    for (const page of section.pages) out.push(link(page));
    out.push('');
  }

  return out.join('\n');
}

/* -------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------- */

/**
 * A date as sitemaps.org wants it, or null.
 *
 * The build hands this a `YYYY-MM-DD` from git, which `Date` reads as midnight
 * UTC. That is a day and not a moment, and a day is all a commit date is worth
 * claiming.
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
