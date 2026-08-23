// POST /api/auth/applicant/change-password
//
// Current password, new password, confirm. Section 5d: "Changing the password,
// resetting via recovery code, unlinking Telegram, or disabling 2FA revokes
// all of them", meaning every trusted device. Every other session goes too,
// since the usual reason for changing a password is that somebody else may
// have had it.
//
// The session that made the change survives, so a person does not have to sign
// in again in the tab they were already in. That is the one exception, and it
// is deliberate.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import {
  requireApplicant,
  invalidateAllSessions,
  revokeAllTrustedDevices,
} from '../../_lib/session.js';
import { hashSecret, checkPasswordStrength } from '../../_lib/password.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';
import { FIELD } from '../../_lib/validate.js';
import { supabase, T } from '../../_lib/supabase.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const body = await readJson(req, res);
  if (!body) return;

  const subjects = [subjectForIp(req), subjectForUser('applicant', session.user.id)];
  if (await limited(res, 'password_change', subjects)) return;

  try {
    const strength = checkPasswordStrength(body.new_password);
    const details = {};

    if (!strength.ok) details.new_password = strength.code;
    if (
      typeof body.new_password_confirm !== 'string' ||
      body.new_password_confirm !== body.new_password
    ) {
      details.new_password_confirm = FIELD.MISMATCH;
    }

    if (Object.keys(details).length > 0) {
      return fail(res, ERR.BAD_REQUEST, 'That new password could not be used.', { details });
    }

    const correct = await verifyRealmPassword('applicant', session.user.id, body.current_password);
    if (!correct) {
      await recordFailures('password_change', subjects, LIMITS.passwordChange);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    const { error } = await supabase
      .from(T.users)
      .update({
        password_hash: await hashSecret(body.new_password),
        // 8.9's forced reset, cleared by the thing it was asking for. An admin
        // assisting somebody locked out sets this flag; choosing a password is
        // what satisfies it, and nothing else does. Written unconditionally
        // rather than only when it is set, because a second update to clear a
        // flag that is already false is one query nobody notices and a branch
        // that forgets it is a person stuck on the reset screen forever.
        must_change_password: false,
      })
      .eq('id', session.user.id);

    if (error) return failInternal(res, error, 'change password');

    await clearAll('password_change', subjects);

    // Order matters only in that both must happen. Neither is allowed to be
    // skipped because the other failed, which is why they are awaited
    // separately rather than raced.
    await invalidateAllSessions('applicant', session.user.id, {
      keepSessionId: session.sessionId,
    });
    await revokeAllTrustedDevices('applicant', session.user.id);

    await auditApplicant(session.user, AUDIT.PASSWORD_CHANGED, {
      other_sessions_ended: true,
      trusted_devices_revoked: true,
    });

    return ok(res, {
      changed: true,
      // Said out loud so the interface can say it too, rather than the person
      // discovering it on their other laptop.
      other_sessions_ended: true,
      trusted_devices_revoked: true,
    });
  } catch (cause) {
    return failInternal(res, cause, 'change password');
  }
}
