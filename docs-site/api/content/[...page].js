// GET /api/content/{path}
//
// One page, if this reader may read it.
//
// **404 and never 401, for both misses.** 16a: "a page above the reader's tier
// returns 404 rather than 401. Same reasoning 8a gave: a 401 confirms the page
// exists to anyone probing for it." So a path nobody has ever written and a path
// belonging to the developer guide answer identically to a signed out reader:
// same status, same body, same headers. The two cases are not separable here
// because `readablePage` already collapsed them into one null, which is what
// keeps a later edit from splitting them apart by accident.
//
// **Nothing a caller sends reaches the filesystem.** The segments are turned
// into a path, the path is looked up in the map the loader built, and the file
// read is the one that map recorded. `../` in a segment is a lookup miss.
//
// This route serves either pipeline. A gated page has no other address, and a
// public page also exists as a static file once part 5 builds one -- 16e asks
// that "a reader must not be able to tell which pipeline a page came from", and
// a route that refused half of them would be the first place they could.
//
// What this is not, yet: the markdown is returned as it was written. Rendering
// it, streaming the images beside it, and the split search index are part 5.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { reader } from '../_lib/reader.js';
import { readablePage, pagePathFromSegments } from '../_lib/pages.js';
import { readFile } from 'node:fs/promises';

/** One sentence, for every reason this route says no. */
function notFound(res) {
  return fail(res, ERR.NOT_FOUND, 'There is no page here.', {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const path = pagePathFromSegments(req.query?.page);
    if (path === null) return notFound(res);

    const { tier } = await reader(req);
    const found = readablePage(path, tier);
    if (!found) return notFound(res);

    const markdown = await readFile(found.file, 'utf8');

    return ok(
      res,
      {
        page: found.page,
        prev: found.prev,
        next: found.next,
        markdown,
      },
      // Never a shared cache. The answer depends on a session cookie, and this
      // is the route where getting that wrong hands one reader another reader's
      // page.
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (cause) {
    return failInternal(res, cause, 'content page');
  }
}
