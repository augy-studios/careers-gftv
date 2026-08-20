// GET /api/tasks/count
//
// 7g: "A badge in the account navigation shows the count of open items across
// both sources, so the page is discoverable without an email or a push
// notification."
//
// Its own route rather than a field on api/tasks/mine, because the badge is
// drawn on every page of the account area and none of those pages wants the
// tasks themselves. Two count queries with head:true, so nothing but the numbers
// crosses the wire.
//
// **A signed out caller gets zeroes, not a 401.** The badge is part of the
// account navigation, which is rendered before the session check on some of
// these pages resolves, and an error in the console for the ordinary signed out
// case is noise that trains everybody to ignore the console.

import { ok, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { getApplicantSession } from '../_lib/session.js';
import { openItemCount } from '../_lib/tasks.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  res.setHeader('Cache-Control', 'no-store');

  const session = await getApplicantSession(req);
  if (!session) return ok(res, { tasks: 0, prompts: 0, total: 0 });

  try {
    return ok(res, await openItemCount(session.user.id));
  } catch (cause) {
    return failInternal(res, cause, 'task count');
  }
}
