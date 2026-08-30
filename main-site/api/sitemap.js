// GET /sitemap.xml
//
// Section 4: "generated, not hand written, since postings change constantly.
// Serve it from a function rewritten to that path in vercel.json, listing the
// home page, /search, the static pages, /status, and every published job at its
// /jobs/{uuid} URL with a lastmod from updated_at."
//
// What is in it and what is never in it lives in api/_lib/discovery.js, which is
// pure and is what the phase file measures. This file is the query and the
// headers.
//
// **Which postings are live is read straight from the table**, one select for
// id and updated_at where status is published. That is word for word what
// gftvjobs_search_jobs does with its default statuses, and it is a second place
// the rule is written down — so `tests/phase12-test.mjs --only=discovery`
// compares this route's ids against /api/public/jobs.json's and fails when the
// two disagree. The alternative was to page the RPC for ids and then query
// again for the dates, since the RPC does not return updated_at: one
// definition, at the cost of the RPC's translation and ranking work for data a
// sitemap throws away. Settled 31 August 2026 for the select and the check.
//
// **updated_at is trustworthy for a lastmod**, per deviation 56. Nothing in
// this build touches a posting's row without changing it.
//
// **It answers 404 until indexing is turned on**, settled 31 August 2026. The
// alternative was to serve it from part 5 with robots.txt still saying stay
// away, which would have let this route be proved against the real database on
// a deployment months before it is needed. What decided it is that there is
// nothing to prove *to*: a sitemap of a site nobody may crawl is a list of
// seeded sample postings at a guessable address, and "nothing is crawled mid
// pass" is easier to keep as a fact than as a robots.txt directive.
//
// **The cost is named rather than absorbed**: the query and the XML below are
// not exercised against the database until part 8 flips INDEXING, so
// `--only=discovery-live` is part of that commit and not optional. Until then
// it checks the gate — that this address is a 404 — and says the rest is
// waiting.

import { createRequire } from 'node:module';

import { methodNotAllowed, failInternal } from './_lib/respond.js';
import { siteUrl } from './_lib/env.js';
import { supabase, T } from './_lib/supabase.js';
import { isFeatureOff, maintenanceMessage, featureOverrides } from './_lib/maintenance.js';
import { INDEXING, sitemapXml, STATIC_PAGES } from './_lib/discovery.js';

// The phase list, for one field: /status renders this file and nothing else, so
// its `updated` is honestly when that page last changed. Required rather than
// imported with an attribute, so the bundler traces it into the function, which
// is what api/_lib/maintenance.js already does with the same file.
const require = createRequire(import.meta.url);
const buildStatus = require('../assets/build-status.json');

/**
 * The most postings this will list.
 *
 * The protocol's ceiling is 50,000 URLs or 50 MB per file, and a board that
 * ever approached it would need a sitemap index rather than a bigger number
 * here. Five thousand is far above anything GFTV will have open and low enough
 * that a runaway insert cannot turn this route into a slow one. A run that hits
 * it is logged, because a sitemap silently missing its tail is the failure
 * nothing on screen would ever show.
 */
const MAX_POSTINGS = 5000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    // **404 rather than 503, and the difference is the claim being made.**
    // There is no sitemap for this site yet, which is a fact about the site
    // rather than an outage, and the two must not share a status code: the
    // switch below is temporary and this is a phase that has not finished.
    // Same shape as the three reasons a control can be disabled.
    if (!INDEXING) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      res.statusCode = 404;
      return res.end(
        'There is no sitemap for this site yet. Careers@GFTV is being released ' +
          'in phases and is not open to search engines. See /status.\n'
      );
    }

    // 0c's "Search engine listing". Off answers 503 rather than an empty
    // sitemap: an empty one is a claim that there is nothing to list, and a
    // crawler reads it as postings having been taken down. A 5xx is read as
    // "come back later", and every major crawler keeps the copy it has.
    if (await isFeatureOff('sitemap')) {
      const overrides = await featureOverrides();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', '3600');
      res.statusCode = 503;
      // Plain text rather than this API's JSON envelope. The caller is a
      // crawler that asked for XML, and the status code is the part it reads.
      return res.end(`${maintenanceMessage(overrides.sitemap?.note ?? null)}\n`);
    }

    const site = siteUrl();

    const { data, error } = await supabase
      .from(T.jobs)
      .select('id, updated_at')
      // Published, and nothing else. Section 4 excludes closed, draft and
      // archived, and an archived posting renders only for an applicant with
      // history — a URL that 404s for everybody else has no business here.
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(MAX_POSTINGS);

    if (error) return failInternal(res, error, 'sitemap');

    const jobs = Array.isArray(data) ? data : [];
    if (jobs.length >= MAX_POSTINGS) {
      console.warn(
        `[careers-gftv] sitemap: ${jobs.length} postings, at the ${MAX_POSTINGS} ceiling. ` +
          `Anything past it is not listed. A board this size needs a sitemap index.`
      );
    }

    const xml = sitemapXml({
      site,
      paths: STATIC_PAGES,
      lastmod: { '/status': buildStatus.updated ?? null },
      jobs,
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Section 4: "Cache it with s-maxage so it is not rebuilt per request." An
    // hour at the edge, and a day of serving the previous copy while a new one
    // is fetched. A posting reaching a crawler an hour late costs nothing; the
    // board itself is a minute fresh and is what a person reads.
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
    );
    res.statusCode = 200;
    res.end(xml);
  } catch (cause) {
    if (res.headersSent) {
      console.error('[careers-gftv] sitemap, after headers:', cause);
      return res.end();
    }
    return failInternal(res, cause, 'sitemap');
  }
}
