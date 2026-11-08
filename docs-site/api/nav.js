// GET /api/nav
//
// The sidebar, and who the site thinks is reading it.
//
// 16a: "the sidebar renders only what the reader is entitled to. A signed out
// reader sees the three public sections and a sign in link, not a wall of
// padlocks." So the filtering happens here and the browser is handed a tree with
// nothing in it that it is not allowed to open. There is no client side filter
// to get wrong, and nothing in the payload names a page the reader cannot read.
//
// **The one thing this endpoint says out loud.** 16a's single exception to the
// silence: "the docs home page says plainly that staff documentation exists and
// is behind a sign in." That sentence is the home page's, in part 4's shell, and
// it is a fixed line of copy: this payload still carries no gated titles, no
// gated paths, and no count of them. Hiding the existence of a staff area
// protects nothing when the sign in form is right there; naming the pages inside
// it does the opposite.
//
// Not cached at the edge. The answer depends on a session cookie, and a shared
// cache that got that wrong once would serve one reader's sidebar to another.

import { ok, methodNotAllowed, failInternal } from './_lib/respond.js';
import { reader } from './_lib/reader.js';
import { navFor } from './_lib/pages.js';
import { localeParameter, titlesFor, localiseNav } from './_lib/docs-translations.js';

/**
 * The documentation's navigation tree for this reader: the public sections for
 * everybody, plus the staff sections their tier allows, named in their language.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD'])) return;

  try {
    const { user, tier, role } = await reader(request);

    // **The gate first and the language second, always in that order.** What is
    // in the tree is decided by the tier; what it is called is decided by the
    // reader's language. Swapping the two would mean a title lookup that could
    // put a page back into a nav the gate had taken out of it.
    const locale = localeParameter(request.query?.locale);
    const navigation = localiseNav(navFor(tier), await titlesFor(locale));

    return ok(
      response,
      {
        reader: {
          signed_in: user !== null,
          // The account name, and never the flags it was derived from. A tier is
          // this site's own idea and the browser is told it so the shell can
          // draw the right account control, not so it can decide anything.
          username: user?.username ?? null,
          role,
          tier,
        },
        nav: navigation,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (cause) {
    return failInternal(response, cause, 'nav');
  }
}
