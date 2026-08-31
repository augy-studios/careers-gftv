// /api/admin/applicants
//
// Section 8.9, applicant accounts. **Admins only, all of it**, per the section:
// "a job poster works with applicants through the tracking page in 8.3 and has
// no business in the account itself."
//
//   GET                     the list, searched and paged
//   GET  ?id=<uuid>         one account, its history, and what has been done to it
//   POST { action: 'deactivate'|'reactivate'|'update_details'|'set_password'
//                  |'force_reset'|'unlink_telegram'|'delete' }
//
// Every action writes an audit row with a reason, and every one except the
// first two revokes every session and trusted device, per 8.9 and 5d.
// **`update_details` is the one that revokes conditionally**: it moves up to
// five fields and two of them are login identifiers, so a username or an email
// changing signs the account out and a display name, a phone number or a
// language preference does not. That action is not in 8.9 at all — added
// 31 August 2026 because it was asked for — and everything else on this page is
// unchanged by it.
//
// The reason is required on five of the seven, and which five is the argument:
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
//   **Editing details requires one**, by the same reasoning rather than by the
//   brief, which does not have the action at all. Changing what somebody signs
//   in with is the kind of thing a log has to be able to explain, and the row
//   carries both sides of every field that moved.
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
import { requireAdmin, isUuid, params, pageRange, activeLocales } from '../_lib/admin.js';
import { AUDIT, auditStaff, recordAudit } from '../_lib/audit.js';
import {
  FIELD,
  validateText,
  validateUsername,
  validateDisplayName,
  validateEmail,
  collect,
  has,
} from '../_lib/validate.js';
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
import {
  verifyRealmPassword,
  isUsernameTaken,
  isEmailTaken,
  uniqueViolationDetails,
} from '../_lib/accounts.js';
import {
  PAGE_SIZE,
  listApplicants,
  fetchApplicant,
  setApplicantActive,
  setApplicantPassword,
  forcePasswordReset,
  unlinkTelegram,
  deleteApplicant,
  updateApplicantDetails,
  EDITABLE,
  IDENTIFIERS,
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
  'update_details',
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
const NEEDS_REASON = ['update_details', 'set_password', 'force_reset', 'unlink_telegram'];

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
    case 'update_details':
      return updateDetails(res, session, account, body, reason.value, done);
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
 * Edit the details on somebody's account.
 *
 * **Not in 8.9**, and added on 31 August 2026 because it was asked for. The
 * brief gives this page search, deactivation, deletion, a password, a forced
 * reset and an unlink; five editable fields is new surface, and it is written
 * to the rules the rest of the page already follows rather than to new ones.
 *
 * **Validated with the same functions the applicant's own edit uses.** An admin
 * typing somebody's email is not a reason to accept an address the owner could
 * not have typed themselves, and two validators for one column is how the two
 * paths drift. `api/auth/applicant/profile.js` is the other caller.
 *
 * **Uniqueness is checked before the write and again by the database.** The
 * check gives a field level answer the page can draw beside the input; the
 * constraint is what actually holds, because between the two there is a moment
 * where somebody else can register the same address. `uniqueViolationDetails`
 * turns the second into the same shape as the first.
 *
 * **A field that has not moved is not a change.** Sending the current username
 * back is a no-op rather than a revoke: an admin correcting a display name
 * should not sign somebody out because the form posted every field.
 */
async function updateDetails(res, session, account, body, reason, done) {
  const checks = {};
  if (has(body, 'username')) checks.username = validateUsername(body.username);
  if (has(body, 'display_name')) checks.display_name = validateDisplayName(body.display_name);
  if (has(body, 'email')) checks.email = validateEmail(body.email);
  if (has(body, 'phone')) checks.phone = validateText(body.phone, 40);
  if (has(body, 'locale')) checks.locale = validateText(body.locale, 10, { required: true });

  if (Object.keys(checks).length === 0) {
    return fail(res, ERR.BAD_REQUEST, 'There was nothing to change.', {
      details: { fields: FIELD.REQUIRED },
    });
  }

  const { ok: valid, values, details } = collect(checks);
  if (!valid) {
    return fail(res, ERR.BAD_REQUEST, 'Those details could not be saved.', { details });
  }

  // Only the language codes this portal actually ships. A locale nothing has a
  // dictionary for renders every page in fallback and reads as a broken site to
  // the one person it was set for.
  if (values.locale !== undefined) {
    const locales = await activeLocales();
    if (!locales.some((locale) => locale.code === values.locale)) {
      return fail(res, ERR.BAD_REQUEST, 'That is not a language this site ships.', {
        details: { locale: FIELD.INVALID },
      });
    }
  }

  const changes = {};
  for (const field of EDITABLE) {
    if (values[field] === undefined) continue;
    const before = field === 'locale' ? account.locale ?? 'en' : account[field] ?? null;
    if (values[field] === before) continue;
    changes[field] = values[field];
  }

  if (Object.keys(changes).length === 0) {
    return ok(res, { id: account.id, account, changed: [], sessions_revoked: false });
  }

  const taken = {};
  if (changes.username && (await isUsernameTaken(changes.username, account.id))) {
    taken.username = FIELD.TAKEN;
  }
  if (changes.email && (await isEmailTaken(changes.email, account.id))) {
    taken.email = FIELD.TAKEN;
  }
  if (Object.keys(taken).length > 0) {
    return fail(res, ERR.CONFLICT, 'Those details could not be saved.', { details: taken });
  }

  let updated;
  try {
    updated = await updateApplicantDetails(account.id, changes);
  } catch (cause) {
    const conflict = uniqueViolationDetails(cause);
    if (conflict) {
      return fail(res, ERR.CONFLICT, 'Those details could not be saved.', { details: conflict });
    }
    throw cause;
  }

  // **Both sides of every field that moved.** An audit row saying "the email
  // was changed" answers nothing six months later; the whole point of logging
  // an admin editing somebody else's identifiers is being able to say what it
  // was before. The password is the one thing never recorded either side, and
  // it is not one of these fields.
  const moved = Object.keys(changes);
  await auditStaff(
    session.user,
    AUDIT.APPLICANT_DETAILS_UPDATED,
    {
      username: account.username,
      fields: moved,
      before: Object.fromEntries(moved.map((field) => [field, account[field] ?? null])),
      after: Object.fromEntries(moved.map((field) => [field, changes[field]])),
      sessions_revoked: updated.revoked,
      trusted_devices_revoked: updated.revoked,
    },
    { targetTable: T.users, targetId: account.id, reason }
  );

  await done();
  return ok(res, {
    id: account.id,
    account: updated.account,
    changed: moved,
    // Named rather than implied, so the page can say "they have been signed
    // out" in the same breath as "saved" instead of leaving an admin to find
    // out from the person they just edited.
    sessions_revoked: updated.revoked,
    trusted_devices_revoked: updated.revoked,
    identifiers_changed: moved.filter((field) => IDENTIFIERS.includes(field)),
  });
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
