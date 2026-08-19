// GET  /api/auth/applicant/profile   the signed in applicant's own details
// PATCH /api/auth/applicant/profile  edit them
//
// Section 5b: "Applicant account page: edit profile and change password." The
// page itself is phase 6; the endpoint is here because the phase that owns
// accounts owns what an account can change about itself.
//
// Changing the username or the email needs the current password. Both are
// login identifiers, so a borrowed unlocked laptop should not be enough to
// move an account onto an address its owner does not control. The display
// name and the phone number are not identifiers and do not ask.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireApplicant, publicApplicant } from '../../_lib/session.js';
import {
  validateUsername,
  validateDisplayName,
  validateEmail,
  validateText,
  collect,
  has,
  FIELD,
} from '../../_lib/validate.js';
import {
  isUsernameTaken,
  isEmailTaken,
  uniqueViolationDetails,
  verifyRealmPassword,
} from '../../_lib/accounts.js';
import { supabase, T } from '../../_lib/supabase.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

const RETURNING =
  'id, username, display_name, email, avatar_url, phone, locale, totp_secret, created_at';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'PATCH'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    return ok(res, { user: publicApplicant(session.user) });
  }

  const body = await readJson(req, res);
  if (!body) return;

  try {
    const checks = {};
    if (has(body, 'username')) checks.username = validateUsername(body.username);
    if (has(body, 'display_name')) checks.display_name = validateDisplayName(body.display_name);
    if (has(body, 'email')) checks.email = validateEmail(body.email);
    // A phone number is stored as typed. There is no verification and no
    // messaging in this build, so a format rule would only reject valid
    // numbers from countries nobody thought about.
    if (has(body, 'phone')) checks.phone = validateText(body.phone, 40);

    if (Object.keys(checks).length === 0) {
      return fail(res, ERR.BAD_REQUEST, 'There was nothing to change.');
    }

    const { values, details } = collect(checks);
    if (details) {
      return fail(res, ERR.BAD_REQUEST, 'Some of those details need fixing.', { details });
    }

    const changingUsername =
      values.username !== undefined && values.username !== session.user.username;
    const changingEmail = values.email !== undefined && values.email !== session.user.email;

    if (changingUsername || changingEmail) {
      const subjects = [subjectForIp(req), subjectForUser('applicant', session.user.id)];
      if (await limited(res, 'password_change', subjects)) return;

      const correct = await verifyRealmPassword('applicant', session.user.id, body.current_password);
      if (!correct) {
        await recordFailures('password_change', subjects, LIMITS.passwordChange);
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const taken = {};
      if (changingUsername && (await isUsernameTaken(values.username, session.user.id))) {
        taken.username = FIELD.TAKEN;
      }
      if (changingEmail && (await isEmailTaken(values.email, session.user.id))) {
        taken.email = FIELD.TAKEN;
      }
      if (Object.keys(taken).length > 0) {
        return fail(res, ERR.CONFLICT, 'Those details could not be saved.', { details: taken });
      }
    }

    const update = {};
    for (const field of ['username', 'display_name', 'email', 'phone']) {
      if (values[field] !== undefined) update[field] = values[field];
    }

    const { data, error } = await supabase
      .from(T.users)
      .update(update)
      .eq('id', session.user.id)
      .select(RETURNING)
      .single();

    if (error) {
      const conflict = uniqueViolationDetails(error);
      if (conflict) {
        return fail(res, ERR.CONFLICT, 'Those details could not be saved.', {
          details: conflict,
        });
      }
      return failInternal(res, error, 'profile update');
    }

    return ok(res, { user: publicApplicant(data) });
  } catch (cause) {
    return failInternal(res, cause, 'profile');
  }
}
