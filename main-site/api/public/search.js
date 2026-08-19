// GET /api/public/search
//
// The job board. Section 4: there is one browse surface, not two. With no
// parameters this returns every published posting newest first, and with a
// query or any filter it returns the matching subset. Same endpoint either way,
// because /search is the same page either way.
//
// Public, and deliberately so. Section 4: "The search results page is fully
// public too, filters and tags included. Nothing there requires a session." No
// session is read here at all, not even optionally, so nothing about a caller
// can change what comes back.
//
// All the work is in gftvjobs_search_jobs, from migrations 016 and 028. This
// route parses the query string, calls it, and shapes the rows. The weighting,
// the language resolution, the trigram fallback, and the snippets are the
// database's business, per section 2.
//
// The parameter names are in api/_lib/jobs.js. They are the URL the reader sees
// and shares, so they are part of the interface rather than an implementation
// detail.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, RPC } from '../_lib/supabase.js';
import { localeFromRequest } from '../_lib/validate.js';
import { parseSearchParams, publicJob, PAGE_SIZE } from '../_lib/jobs.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  const locale = localeFromRequest(req);
  const { q, filters, sort, page, limit, offset } = parseSearchParams(req, locale);

  try {
    const { data, error } = await supabase.rpc(RPC.searchJobs, {
      q,
      filters,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) return failInternal(res, error, 'public search');

    const rows = Array.isArray(data) ? data : [];

    // total_count rides on every row, so pagination costs no second query. With
    // no rows there is nothing to read it from, and the total is zero.
    const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

    // Which strategy actually found these. The client needs it to tell three
    // states apart that otherwise look identical:
    //
    //   browse     no query, so this is the full listing
    //   fts        the query matched properly
    //   substring  the query matched a translation, in a non default language
    //   trigram    nothing matched, and these are near misses. Section 4's
    //              "no results for X, did you mean Y" state, which is a
    //              different thing from an empty page.
    //
    // With no rows at all the RPC has nothing to report it on, so fall back to
    // what the request itself implies.
    const matchMode = rows.length > 0 ? rows[0].match_mode : q ? 'trigram' : 'browse';

    return ok(
      res,
      {
        jobs: rows.map(publicJob),
        total,
        page,
        page_size: PAGE_SIZE,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        match_mode: matchMode,
        // Echoed back so the client can confirm what was actually applied
        // rather than assuming its own URL parsing agreed with ours.
        query: q,
        sort: sort ?? (q ? 'relevance' : 'newest'),
        locale,
      },
      { headers: CACHE }
    );
  } catch (cause) {
    return failInternal(res, cause, 'public search');
  }
}

// Public data with no per caller variation, so the edge may hold it briefly.
// Sixty seconds is short enough that a posting published now appears within a
// minute, and long enough to absorb the burst of identical requests that a
// shared link produces. stale-while-revalidate means a reader never waits for
// the refresh.
//
// This works only because vercel.json scopes its no-store rule to /api/auth.
// If that ever widens back to the whole API, this header stops having an
// effect and nothing else breaks.
const CACHE = {
  'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
};
