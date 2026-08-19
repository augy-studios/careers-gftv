// GET /api/public/jobs.json
//
// The openings feed, from section 4: "the site exposes a public
// api/public/jobs.json feed for anyone aggregating openings."
//
// vercel.json rewrites that address here. The file is named jobs-feed.js rather
// than jobs.json.js because a filename with two extensions is a bet on how a
// platform derives a route from a path, and an explicit rewrite is a fact.
//
// Two deliberate differences from every other route in this API:
//
//   1. **No { ok, data } envelope.** This is the one endpoint whose callers are
//      strangers rather than this site. Somebody pointing a script at a URL
//      ending in .json expects the openings at the top level, and section 9's
//      envelope exists so *our* client can branch on error.code. Errors still
//      use the envelope, because only we ever read those.
//   2. **It is a listing, not a document per posting.** Title, summary, and the
//      canonical link, which is what an aggregator needs to decide whether to
//      link to a role. The full text lives at the posting's own URL.
//
// It reads through gftvjobs_search_jobs, the same function the board uses,
// rather than querying the tables again. That is what keeps the feed and the
// board from ever disagreeing about which postings are live, and it means the
// feed resolves translations by the same rules with no second implementation.
//
// The Google Form URL is not here. publicJob in api/_lib/jobs.js is a list of
// what is allowed rather than a list of what is removed, for exactly this
// reason: a third party server fetches this and caches it.

import { methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, RPC } from '../_lib/supabase.js';
import { siteUrl } from '../_lib/env.js';
import { localeFromRequest } from '../_lib/validate.js';
import { searchParams, publicJob } from '../_lib/jobs.js';

// The RPC's own ceiling. A caller wanting more pages the feed rather than
// asking for everything in one response.
const PAGE_SIZE = 100;
const MAX_PAGE = 50;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  const locale = localeFromRequest(req);
  const params = searchParams(req);

  const requested = Number(params.get('page'));
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= MAX_PAGE ? requested : 1;

  try {
    const { data, error } = await supabase.rpc(RPC.searchJobs, {
      q: null,
      // No query and no filters, so this is every published posting, newest
      // first. statuses is never mentioned, so the RPC's own default applies
      // and a draft cannot be asked for from here any more than from the board.
      filters: { locale, sort: 'newest' },
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });

    if (error) return failInternal(res, error, 'jobs feed');

    const rows = Array.isArray(data) ? data : [];
    const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
    const site = siteUrl();

    const body = {
      site: 'Careers@GFTV',
      url: site,
      // Every role currently listed is voluntary and unpaid unless its own
      // is_paid says otherwise. An aggregator that reprints this without the
      // line would be advertising paid work that does not exist, so the feed
      // states it rather than leaving it to the posting.
      notice:
        'Roles at Global Furry Television are voluntary and unpaid unless the ' +
        'posting sets is_paid. Read the posting before applying.',
      locale,
      generated_at: new Date().toISOString(),
      page,
      page_size: PAGE_SIZE,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
      jobs: rows.map((row) => {
        const job = publicJob(row);
        return {
          id: job.id,
          url: `${site}/jobs/${job.id}`,
          title: job.title,
          summary: job.summary,
          department: job.department?.name ?? null,
          location: job.location,
          is_remote: job.is_remote,
          commitment_type: job.commitment_type,
          is_paid: job.is_paid,
          published_at: job.published_at,
          // Null means open until filled, and it stays null here. A consumer
          // that coalesced it to a date would advertise a deadline GFTV never
          // set, which is worse than an absent field.
          closes_at: job.closes_at,
          tags: job.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
        };
      }),
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Longer than the board's minute. An aggregator polls on its own schedule
    // and does not need a posting within sixty seconds of it going up.
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=300, stale-while-revalidate=900'
    );
    // Read by third party servers by definition, so this is the one route that
    // says so out loud.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.statusCode = 200;
    res.end(JSON.stringify(body, null, 2));
  } catch (cause) {
    // The success path writes headers itself rather than going through ok(), so
    // a throw after that point cannot be answered with an error body. Log it and
    // let the connection close rather than appending JSON to JSON.
    if (res.headersSent) {
      console.error('[careers-gftv] jobs feed, after headers:', cause);
      return res.end();
    }
    return failInternal(res, cause, 'jobs feed');
  }
}
