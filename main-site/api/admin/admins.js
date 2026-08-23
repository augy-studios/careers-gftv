// /api/admin/admins
//
// Section 8.8, staff access.
//
//   GET  the accounts that can reach this portal, and the ones an admin has
//        said something about
//   GET  ?search=<term>   staff accounts to grant access to
//   POST { action: 'set', staff_id, state: 'granted'|'denied'|'default', reason }
//
// **Admins only, including the list.** 8.8 says so twice and gives the reason:
// "who else can reach the dashboard is not a job poster's business". requireAdmin
// is what that sentence compiles to, and this is the first route in the build to
// use it for a whole endpoint rather than for one action inside one.
//
// **Nothing here writes to gftvhello_users.** Not the role, not the password,
// not the approval flag. Section 2 forbids it, migration 012 built the overlay
// so it never has to happen, and 8.8 is explicit that this page does not offer
// an admin a button to reset somebody else's password: that path is 5g, where a
// staff member sets their own with a recovery code and their second factor, and
// it changes their gftv.asia password too.
//
// **A reason is required to revoke and optional to grant.** The table has the
// column either way. Taking somebody's access away is the change that will be
// asked about later, by them, and "there is a row saying somebody did it in
// March" is not an answer. Granting is its own explanation most of the time.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { T } from '../_lib/supabase.js';
import { requireAdmin, isUuid, params } from '../_lib/admin.js';
import { auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import {
  ACCESS_STATES,
  ACCESS_AUDIT,
  listStaffAccess,
  searchStaffAccounts,
  setStaffAccess,
  fetchStaffAccount,
} from '../_lib/admin-staff.js';

/** Long enough to say why. Matches the shape of the maintenance note. */
const REASON_MAX = 300;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  // Not requireStaff. The whole endpoint is admins only, per 8.8, and the 403
  // is the honest answer to a job poster who has typed the URL: they are signed
  // in, and this one is not theirs.
  const session = await requireAdmin(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_admins')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);

    const search = params(req);
    if (search.has('search')) {
      return ok(res, { accounts: await searchStaffAccounts(search.get('search')) });
    }

    return ok(res, {
      accounts: await listStaffAccess(),
      // Who is asking, so the page can refuse to let somebody revoke their own
      // access. The server refuses it too; this is so the control is absent
      // rather than offered and then rejected.
      self_id: session.user.id,
      states: ACCESS_STATES,
    });
  } catch (cause) {
    return failInternal(res, cause, 'admin staff access');
  }
}

async function write(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  if (String(body.action ?? '').trim() !== 'set') {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;

  const staffId = String(body.staff_id ?? '');
  if (!isUuid(staffId)) return fail(res, ERR.BAD_REQUEST, 'That is not a staff account.');

  const state = String(body.state ?? '');
  if (!ACCESS_STATES.includes(state)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not an access state.', {
      details: { state: FIELD.INVALID },
    });
  }

  // **Nobody takes their own access away.** Not a safety rail against a mistake
  // so much as against the shape of the mistake: the dashboard would still be
  // on screen, every subsequent request would 401, and the page that undoes it
  // is the one they just locked themselves out of. Another admin can do it,
  // which keeps the action possible without making it self inflicted.
  if (staffId === session.user.id && state !== 'granted') {
    return fail(res, ERR.CONFLICT, 'You cannot take away your own access.', {
      details: { reason: 'self' },
    });
  }

  const reason = validateText(body.reason, REASON_MAX, { required: state === 'denied' });
  if (!reason.ok) {
    return fail(res, ERR.BAD_REQUEST, 'Say why before changing this.', {
      details: { reason: reason.code },
    });
  }

  const account = await fetchStaffAccount(staffId);
  if (!account) return fail(res, ERR.NOT_FOUND, 'That staff account could not be found.');

  await setStaffAccess({
    staffId,
    state,
    reason: reason.value,
    actorId: session.user.id,
  });

  await auditStaff(
    session.user,
    ACCESS_AUDIT[state],
    {
      username: account.username,
      reason: reason.value ?? null,
      // What the gftv.asia role was at the time, because that is what a
      // `default` state will resolve to afterwards and it can change there
      // without this portal ever hearing about it.
      was_admin: account.is_admin === true,
      was_editor: account.is_editor === true,
    },
    { targetTable: T.adminAccess, targetId: staffId }
  );

  await recordFailures('admin', subjects, LIMITS.admin);

  return ok(res, { staff_id: staffId, state });
}
