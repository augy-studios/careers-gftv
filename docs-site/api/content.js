// GET /api/content?path=/portal/applying
//
// One page, or one image beside a gated page, if this reader may read it.
//
// **The address is a query parameter and not a path, and that was learned the
// hard way.** This route was `api/content/[...page].js` from part 3 until part 5
// was checked against the deployment, where every request to it answered 404:
// Vercel's file based dynamic routes are a framework's feature, and in a bare
// `api/` project a `[...catchall]` binds nothing into `req.query` and does not
// match more than one segment at all. One segment reached this handler with an
// empty `page`, and two never reached it. Locally it looked perfect, because the
// stand in server that part 3 and part 4 were proved against read the segments
// itself.
//
// That is phase 3's rule for the fourth time — **a route answering locally is
// not evidence that the platform routes it** — and the fix is the shape the
// portal has always used: a plain function, addressed explicitly. There is no
// dynamic route file anywhere in this repository now.
//
// **404 and never 401, for both misses.** 16a: "a page above the reader's tier
// returns 404 rather than 401. Same reasoning 8a gave: a 401 confirms the page
// exists to anyone probing for it." So a path nobody has ever written and a path
// belonging to the developer guide answer identically to a signed out reader:
// same status, same body, same headers. The two cases are not separable here
// because `readablePage` already collapsed them into one null, which is what
// keeps a later edit from splitting them apart by accident.
//
// **Nothing a caller sends reaches the filesystem.** The parameter is split into
// segments, the segments are turned into a path, the path is looked up in the
// map the loader built, and the file read is the one that map recorded. `../` is
// a lookup miss.
//
// This route serves either pipeline. A gated page has no other address, and a
// public page also exists as a static file once the build has run -- 16e asks
// that "a reader must not be able to tell which pipeline a page came from", and
// a route that refused half of them would be the first place they could.
//
// **It serves the images beside a gated page as well**, from part 5. 16e:
// "images for gated pages live beside them and stream through the same
// authenticated route. A gated page with a public screenshot is a leak with
// extra steps." One route, so an image cannot end up behind a check somebody
// wrote a second time, and a missing file and a forbidden one are the same 404
// they are for a page. What decides an image's tier is the section it sits in,
// which is the only thing a file with no front matter can be asked.
//
// The markdown is returned as it was written: the browser renders it with the
// same module the build script uses, per 16e's one renderer.

import { ok, fail, ERR, methodNotAllowed, failInternal } from './_lib/respond.js';
import { reader } from './_lib/reader.js';
import {
  readablePage,
  readableAsset,
  pagePathFromSegments,
  assetPathFromSegments,
  frontMatter,
} from './_lib/pages.js';
import { updatedFor } from './_lib/generated.js';
import { readFile } from 'node:fs/promises';

/** One sentence, for every reason this route says no. */
function notFound(res) {
  return fail(res, ERR.NOT_FOUND, 'There is no page here.', {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * The `path` parameter, as segments.
 *
 * **The home page is `/` and needs no alias.** It had one — `/api/content/index`
 * — for as long as the address was a path, because a catch-all route cannot be
 * asked for no segments; and on the deployment `cleanUrls` redirected that to
 * `/api/content` before it ever arrived. A parameter can carry a single slash,
 * so the special case is gone rather than fixed.
 *
 * Vercel gives a repeated parameter as an array. Only the first is read: a
 * request naming two paths is one path with something appended to it, and
 * picking either is a guess.
 */
function segmentsOf(query) {
  const raw = Array.isArray(query?.path) ? query.path[0] : query?.path;
  return String(raw ?? '')
    .split('/')
    .filter((segment) => segment !== '');
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const segments = segmentsOf(req.query);

    const assetPath = assetPathFromSegments(segments);
    if (assetPath !== null) {
      const { tier } = await reader(req);
      const asset = readableAsset(assetPath, tier);
      if (!asset) return notFound(res);

      const bytes = await readFile(asset.file);
      res.setHeader('Content-Type', asset.type);
      res.setHeader('Content-Length', String(bytes.length));
      // **`private`, so this never enters a shared cache**, which is the half
      // that matters: a screenshot of the admin interface is a list of
      // applicants, and a cache holding one for the next reader is the leak the
      // gate was built to prevent arriving one hop later.
      //
      // The five minutes is the reader's own browser, and it is the one place a
      // gated response is allowed to sit, because a page carrying a dozen
      // screenshots would otherwise refetch every one of them on every view.
      // What it costs is written down rather than discovered: somebody whose
      // access is revoked can still see an image their own browser already
      // fetched, for up to five minutes, on a page that no longer loads for
      // them. The page itself stays `no-store`, so nothing new is ever shown.
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.statusCode = 200;
      return res.end(bytes);
    }

    // No segments is the home page, and any other path is itself.
    const path = segments.length === 0 ? '/' : pagePathFromSegments(segments);
    if (path === null) return notFound(res);

    const { tier } = await reader(req);
    const found = readablePage(path, tier);
    if (!found) return notFound(res);

    // The body, and never the file. The front matter is configuration the
    // loader has already read, and everything in it that a reader should see is
    // in the payload beside this as a field of its own. Sending the block as
    // well put "title:" and "access:" on the top of every page, and the `---`
    // that closes it rendered as a rule.
    const source = await readFile(found.file, 'utf8');
    const markdown = frontMatter(source)?.body ?? source;

    // **A data file travels inside the page and has no address of its own.**
    // Phase 13's decision 6, and `api/_lib/pages.js` carries the whole of the
    // reasoning: the only supported entry point to `test-scripts.json` is the
    // page that explains what those scripts write to a live database, so it is
    // read here, behind the check this page just passed, and never served.
    //
    // A file that has stopped being readable or has stopped being JSON sends
    // `null` and not a 500. The page is a guide with a table of downloads at the
    // foot of it, and the guide is still worth reading without them.
    let data = null;
    if (found.dataFile) {
      try {
        data = JSON.parse(await readFile(found.dataFile, 'utf8'));
      } catch {
        data = null;
      }
    }

    return ok(
      res,
      {
        page: found.page,
        prev: found.prev,
        next: found.next,
        data,
        // Where a bare image file name on this page points, which is this
        // route's own address for the directory the page was read from. The
        // browser is told it instead of working it out, so the one place that
        // knows where a gated file lives stays the one that reads it.
        asset_base: found.assetBase,
        // Null when the build could not date it, and null is drawn as no date
        // at all. Never today's.
        updated: updatedFor(found.page.path),
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
