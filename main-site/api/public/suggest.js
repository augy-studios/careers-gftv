// GET /api/public/suggest?q=...
//
// As-you-type suggestions for the search box. Section 4: matching job titles,
// matching tags, and matching departments, grouped under those three headings,
// debounced at around 250ms with a two character minimum, and fully keyboard
// navigable. The debounce and the keyboard handling are the client's; the
// grouping is done here so the client renders what it is given.
//
// gftvjobs_suggest, from migration 016, does the matching. It also decides the
// minimum length itself, and it is right to: one Han character is a real query
// and one Latin letter is not, so the minimum is one for a language Postgres
// cannot tokenise and two otherwise. The client applies its own two character
// floor for English, and this endpoint applies none at all, so the two never
// disagree about a language neither of them has been told about.
//
// A title suggestion carries the posting's uuid as its value, so selecting one
// goes straight to the posting rather than running a search for its own title.
// A tag or department carries its slug, because selecting one filters the
// board. Slugs are never translated, per 3a, which is what lets a filter
// survive a language change.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, RPC } from '../_lib/supabase.js';
import { localeFromRequest } from '../_lib/validate.js';
import { searchParams } from '../_lib/jobs.js';

// Longer than any real prefix somebody types into a suggestion box. The RPC
// substring matches, so a very long argument is wasted work on both sides.
const MAX_QUERY = 80;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  const locale = localeFromRequest(req);
  const raw = searchParams(req).get('q');
  const q = typeof raw === 'string' ? raw.trim().slice(0, MAX_QUERY) : '';

  // Answered without touching the database. The RPC returns nothing for an
  // empty query anyway, and a keystroke that cannot match is not worth a round
  // trip.
  if (q === '') {
    return ok(res, empty(q, locale), { headers: CACHE });
  }

  try {
    const { data, error } = await supabase.rpc(RPC.suggest, {
      q,
      p_locale: locale,
    });

    if (error) return failInternal(res, error, 'public suggest');

    const rows = Array.isArray(data) ? data : [];

    const grouped = {
      titles: [],
      tags: [],
      departments: [],
    };

    for (const row of rows) {
      const item = {
        label: row.label,
        value: row.value,
        // Zero on a title, where a count would mean nothing. On a tag it is how
        // many published postings carry it, and on a department how many it
        // has. The client shows it where it is meaningful and not where it is
        // not.
        count: Number(row.match_count ?? 0),
      };

      if (row.kind === 'title') grouped.titles.push(item);
      else if (row.kind === 'tag') grouped.tags.push(item);
      else if (row.kind === 'department') grouped.departments.push(item);
    }

    return ok(
      res,
      {
        query: q,
        locale,
        suggestions: grouped,
        total:
          grouped.titles.length + grouped.tags.length + grouped.departments.length,
      },
      { headers: CACHE }
    );
  } catch (cause) {
    return failInternal(res, cause, 'public suggest');
  }
}

function empty(q, locale) {
  return {
    query: q,
    locale,
    suggestions: { titles: [], tags: [], departments: [] },
    total: 0,
  };
}

// Cached harder than search is. A prefix somebody is typing is one of a small
// set that everybody types, the answer changes only when a posting is
// published, and this fires several times per search rather than once.
const CACHE = {
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=900',
};
