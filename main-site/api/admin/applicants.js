// /api/admin/applicants
//
// Section 8.9, applicant accounts. **Admins only, all of it**, per the section:
// "a job poster works with applicants through the tracking page in 8.3 and has
// no business in the account itself."
//
//   GET                     the list, searched and paged
//   GET  ?id=<uuid>         one account, its history, and what has been done to it
//   POST { action: 'deactivate'|'reactivate'|'set_password'|'force_reset'
//                  |'unlink_telegram'|'delete' }
//
// Every action except the first two revokes every session and trusted device,
// per 8.9 and 5d, and every one of them writes an audit row with a reason. The
// reason is required on four of the six, and which four is the whole argument:
//
//   **Deactivating and reactivating take an optional note.** They are the
//   ordinary, reversible pair. 8.9 calls deactivating "the ordinary action".
//
//   **Setting a password requires one, always.** 8.9: "it writes an audit row
//   with a required reason". This is the one action in the build that breaks
//   non repudiation, and a log entry that cannot say why is exactly the entry
//   somebody will need.
//
//   **Forcing a reset and unlinking Telegram require one**, per 8.9: "both
//   logged with the admin's id and a required reason".
//
//   **Deleting does not require one.** It is behind the confirmation instead,
//   where the admin types their own password, which is a stronger guard than a
//   sentence somebody satisfies with a full stop. The reason is recorded when
//   it is given.
//
// The confirmation is the client's, in danger-confirm.js, and what this end
// re-checks is the part a browser cannot be trusted with: the admin's own
// password, verified against the bcrypt hash in the same request as the delete.
// Reaching the last step in a browser proves nothing here.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { T } from '../_lib/supabase.js';
import { requireAdmin, isUuid, params, pageRange } from '../_lib/admin.js';
import { AUDIT, auditStaff, recordAudit } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { checkPasswordStrength } from '../_lib/password.js';
import { unavailable } from '../_lib/maintenance.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import { verifyRealmPassword } from '../_lib/accounts.js';
import {
  PAGE_SIZE,
  listApplicants,
  fetchApplicant,
  setApplicantActive,
  setApplicantPassword,
  forcePasswordReset,
  unlinkTelegram,
  deleteApplicant,
} from '../_lib/admin-applicants.js';

const REASON_MAX = 300;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireAdmin(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_applicants')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin applicants');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);

  const id = search.get('id');
  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not an applicant id.');

    const detail = await fetchApplicant(id);
    if (!detail) return fail(res, ERR.NOT_FOUND, 'That account could not be found.');

    return ok(res, detail);
  }

  const { from, to, page, size } = pageRange(search, { size: PAGE_SIZE, max: 100 });

  const activeParam = search.get('active');
  const { rows, total } = await listApplicants({
    term: search.get('q') ?? '',
    active: activeParam === 'true' ? true : activeParam === 'false' ? false : null,
    rangeFrom: from,
    rangeTo: to,
  });

  return ok(res, {
    applicants: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
  });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = [
  'deactivate',
  'reactivate',
  'set_password',
  'force_reset',
  'unlink_telegram',
  'delete',
];

/**
 * Which actions will not proceed without a reason, per 8.9.
 *
 * Deletion is not among them, deliberately. 8.9 attaches a required reason to
 * setting a password and to the two assisted paths, and puts deletion behind
 * 7g's three step confirmation instead, which is a different and stronger
 * guard: an admin types the account's username exactly. Requiring a sentence as
 * well would be inventing a rule the brief does not have, and one somebody
 * would satisfy with a full stop.
 */
const NEEDS_REASON = ['set_password', 'force_reset', 'unlink_telegram'];

async function write(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  // Deletion is on the tighter bucket, like a posting's. It destroys somebody's
  // history and a stolen admin session should get very few of them.
  const bucket = action === 'delete' ? 'adminDelete' : 'admin';
  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, bucket, subjects)) return;

  const applicantId = String(body.applicant_id ?? '');
  if (!isUuid(applicantId)) return fail(res, ERR.BAD_REQUEST, 'That is not an applicant id.');

  const reason = validateText(body.reason, REASON_MAX, {
    required: NEEDS_REASON.includes(action),
  });
  if (!reason.ok) {
    return fail(res, ERR.BAD_REQUEST, 'Say why before doing this.', {
      details: { reason: reason.code },
    });
  }

  const detail = await fetchApplicant(applicantId);
  if (!detail) return fail(res, ERR.NOT_FOUND, 'That account could not be found.');

  const account = detail.account;
  const done = () => recordFailures(bucket, subjects, LIMITS[bucket]);

  switch (action) {
    case 'deactivate':
    case 'reactivate':
      return setActive(res, session, account, action === 'reactivate', reason.value, done);
    case 'set_password':
      return setPassword(res, session, account, body, reason.value, done);
    case 'force_reset':
      return forceReset(res, session, account, reason.value, done);
    case 'unlink_telegram':
      return unlink(res, session, account, detail.telegram, reason.value, done);
    default:
      return remove(req, res, session, account, body, reason.value, done);
  }
}

async function setActive(res, session, account, active, reason, done) {
  const row = await setApplicantActive(account.id, active);

  await auditStaff(
    session.user,
    active ? AUDIT.APPLICANT_REACTIVATED : AUDIT.APPLICANT_DEACTIVATED,
    { username: account.username },
    { targetTable: T.users, targetId: account.id, reason }
  );

  await done();
  return ok(res, { id: account.id, is_active: row?.is_active !== false });
}

/**
 * Set somebody's password.
 *
 * The password is checked for strength here as well as in the browser, with the
 * same function the applicant's own change uses: an admin choosing a password
 * for somebody else is not a reason to accept a weaker one, and 10 characters
 * is the whole of the rule.
 *
 * The response deliberately echoes nothing back. **Never display an existing
 * password**, per 8.9, which is not a limitation but a fact: only a bcrypt hash
 * is stored. What the admin typed is theirs to hand over, once.
 */
async function setPassword(res, session, account, body, reason, done) {
  const strength = checkPasswordStrength(body.password);
  if (!strength.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That password could not be used.', {
      details: { password: strength.code },
    });
  }

  await setApplicantPassword(account.id, body.password);

  await auditStaff(
    session.user,
    AUDIT.APPLICANT_PASSWORD_SET,
    {
      username: account.username,
      sessions_revoked: true,
      trusted_devices_revoked: true,
      // Recorded because it is the mitigation: the applicant has to choose
      // their own on the next sign in, so the window in which an admin knows
      // the password is one sign in long.
      must_change_password: true,
    },
    { targetTable: T.users, targetId: account.id, reason }
  );

  await done();
  return ok(res, {
    id: account.id,
    sessions_revoked: true,
    trusted_devices_revoked: true,
    must_change_password: true,
  });
}

async function forceReset(res, session, account, reason, done) {
  await forcePasswordReset(account.id);

  await auditStaff(
    session.user,
    AUDIT.APPLICANT_RESET_FORCED,
    { username: account.username, sessions_revoked: true, trusted_devices_revoked: true },
    { targetTable: T.users, targetId: account.id, reason }
  );

  await done();
  return ok(res, { id: account.id, must_change_password: true });
}

async function unlink(res, session, account, telegram, reason, done) {
  if (!telegram) {
    return fail(res, ERR.CONFLICT, 'That account has no Telegram linked.', {
      details: { reason: 'not_linked' },
    });
  }

  await unlinkTelegram(account.id);

  await auditStaff(
    session.user,
    AUDIT.APPLICANT_TELEGRAM_UNLINKED,
    { username: account.username, sessions_revoked: true, trusted_devices_revoked: true },
    { targetTable: T.users, targetId: account.id, reason }
  );

  await done();
  return ok(res, { id: account.id, unlinked: true });
}

/**
 * Delete an account permanently.
 *
 * **The admin types their own password, and this verifies it**, per the
 * reversal of deviation 38 on 23 August 2026. Typing the account's username
 * proved only that the person could read the row in front of them; this
 * destroys somebody else's history, and the last step should prove who is
 * doing it. Verified in the same request as the deletion, never through a
 * separate endpoint answering "that password was correct", which 7g forbids.
 *
 * The audit row is written before the delete and carries the staff realm, so
 * the log distinguishes "this person deleted their own account" from "an admin
 * deleted it". Both are `account_deleted`, because they are the same event from
 * the account's point of view, and the actor is what tells them apart.
 */
async function remove(req, res, session, account, body, reason, done) {
  // The danger bucket and its hour long lock, per 7g. The same shape the
  // applicant's own danger zone uses, applied to a staff session being guessed
  // at, and checked before the bcrypt round so a locked out caller costs
  // nothing.
  const dangerSubjects = [subjectForUser('staff', session.user.id), subjectForIp(req)];
  if (await limited(res, 'danger', dangerSubjects)) return;

  const correct = await verifyRealmPassword('staff', session.user.id, body.password);
  if (!correct) {
    await recordFailures('danger', dangerSubjects, LIMITS.danger);
    return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
      details: { password: FIELD.INVALID },
    });
  }

  await clearAll('danger', dangerSubjects);

  await recordAudit({
    realm: 'staff',
    actorId: session.user.id,
    actorLabel: session.user.username,
    action: AUDIT.ACCOUNT_DELETED,
    targetTable: T.users,
    targetId: account.id,
    reason,
    metadata: {
      username: account.username,
      display_name: account.display_name,
      created_at: account.created_at,
      deleted_by_admin: true,
    },
  });

  await deleteApplicant(account.id);

  await done();
  return ok(res, { id: account.id, deleted: true, username: account.username });
}
