// GET /robots.txt
//
// vercel.json rewrites that address here, and main-site/robots.txt was deleted
// in the same commit: Vercel matches the filesystem before it consults
// rewrites, so a static file of that name would win and this function would
// never run. That is phase 3's rule, and it is the one this route would fail
// silently on.
//
// **A generated robots.txt is not the obvious choice, and it is here for one
// reason: the switch.** Whether the portal may be crawled is one constant,
// INDEXING in api/_lib/discovery.js, and the phase file checks it agrees with
// the global X-Robots-Tag in vercel.json. A hand edited file would put the same
// decision in two places with nothing comparing them, which is the shape this
// build has been bitten by often enough to have a rule about it.
//
// **The maintenance switch changes what this file points at, not who may read
// the site.** `sitemap` is the feature key from 0c's map — "Search engine
// listing" — and switching it off removes the Sitemap line and takes
// /sitemap.xml out of service. It deliberately does *not* write Disallow: /.
// Crawlers cache robots.txt for about a day, so an off switch that blocked
// crawling would take a day to undo and would not remove anything already
// listed. That is not a switch, it is a one way door, and the rule from phase
// 10's deviation 89 is that a switch works in both directions or it is not one.

import { methodNotAllowed, failInternal } from './_lib/respond.js';
import { siteUrl } from './_lib/env.js';
import { isFeatureOff } from './_lib/maintenance.js';
import { INDEXING, CANONICAL_ORIGIN, robotsBody } from './_lib/discovery.js';

export default async function handler(req, res) {
  // HEAD alongside GET, per phase 4's rule. A link checker fetching robots.txt
  // with HEAD is exactly the kind of caller this route exists for.
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    // **This is the one route that guesses rather than failing.** Every major
    // crawler reads a 5xx robots.txt as "do not crawl this site for now", so an
    // unset SITE_URL would pause crawling of the whole portal over a
    // configuration fault, silently. Nothing in this file depends on the
    // environment except the absolute Sitemap line, so it falls back to the
    // canonical origin and answers correctly. Logged, because a deployment
    // that cannot read its own address is still wrong.
    let site;
    try {
      site = siteUrl();
    } catch (cause) {
      console.warn('[careers-gftv] robots.txt: SITE_URL unreadable, using the canonical origin:', cause);
      site = CANONICAL_ORIGIN;
    }

    // While indexing is off the body says the same thing whatever any switch
    // is set to, so nothing is read and no query is made. A blocked site should
    // not be spending a settings read per crawler.
    const sitemap = INDEXING ? !(await isFeatureOff('sitemap')) : true;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // Crawlers keep their own copy for around a day, so the edge cache here is
    // about cost rather than freshness. Five minutes means a flip of the
    // maintenance switch is visible to somebody checking with curl.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
    res.statusCode = 200;
    res.end(robotsBody({ indexing: INDEXING, site, sitemap }));
  } catch (cause) {
    // Whatever is left after the fallback above, which is either the settings
    // read or something unforeseen. A robots.txt that cannot be produced must
    // not answer 200 with an empty body: an empty file means "crawl
    // everything", which is the opposite of what this site says. A 5xx is read
    // as "come back later", which is the safe direction for the rest.
    return failInternal(res, cause, 'robots.txt');
  }
}
