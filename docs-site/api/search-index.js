// GET /api/search-index
//
// The search index for the staff guides, filtered to whoever is asking.
//
// **The public index is not here.** It is a static file the browser fetched
// before it ever asked this, per 16e: "the public index is a static file. The
// gated index is served per role by api/search-index, built at deploy time into
// one file per tier and never merged into the public one. Check it: a public
// reader must not be able to find a developer page's heading in search, which is
// exactly the mistake a single index makes easy."
//
// So the two halves are two files on disk, two fetches in the browser, and one
// concatenation in the reader's own tab. There is no server side merge, which is
// the shape that makes the mistake possible in the first place.
//
// A signed out reader gets an empty list and a 200. That is not a refusal and it
// is not a gap: they were handed everything they may search in the static file,
// and telling them 401 here would confirm the size of what they cannot see.

import { ok, methodNotAllowed, failInternal } from './_lib/respond.js';
import { reader } from './_lib/reader.js';
import { gatedIndexFor } from './_lib/generated.js';
import { localeParam } from './_lib/docs-translations.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const { tier } = await reader(req);

    // The tier decides which files are read and the language decides which
    // copy of each. **A locale can only ever change the words**, because it is
    // used to pick a file name inside a set the tier already chose.
    const locale = localeParam(req.query?.locale);

    return ok(
      res,
      { entries: gatedIndexFor(tier, locale) },
      // Never a shared cache: the answer is the reader's tier, and an index
      // served to the wrong person is every gated heading at once.
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (cause) {
    return failInternal(res, cause, 'search index');
  }
}
