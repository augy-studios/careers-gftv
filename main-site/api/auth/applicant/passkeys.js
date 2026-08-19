// GET    /api/auth/applicant/passkeys        list them
// POST   /api/auth/applicant/passkeys        start or finish registering one
// DELETE /api/auth/applicant/passkeys?id=...  remove one
//
// Passkeys are the applicant realm's second factor. Before this, the realm had
// none and was not due one until the Telegram bot in phase 11.
//
// Registering is two requests, because WebAuthn is a challenge and a response:
//
//   POST { action: "start" }   returns the options for
//                              navigator.credentials.create
//   POST { action: "finish" }  sends back what the authenticator produced
//
// Removing the last passkey turns the second factor off for the account, so it
// is allowed and it says so. What it must never do is leave somebody locked
// out, which is why the second factor is never the only way in: the password
// is always required, and the backup codes get past this step.
//
// Adding and removing a passkey both ask for the current password. A session
// on its own is not enough to change what it takes to get a session: without
// this, a borrowed unlocked laptop could turn the second factor off, or add a
// passkey of its own that survives the password change afterwards. It is the
// same rule 5c already applies to generating codes.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireApplicant } from '../../_lib/session.js';
import { validateText, FIELD } from '../../_lib/validate.js';
import {
  listPasskeys,
  startRegistration,
  finishRegistration,
  deletePasskey,
  passkeyLabel,
  relyingParty,
} from '../../_lib/webauthn.js';
import { codeCounts, verifyRealmPassword } from '../../_lib/accounts.js';
import { auditApplicant, AUDIT } from '../../_lib/audit.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST', 'DELETE'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const userId = session.user.id;

  try {
    if (req.method === 'GET') {
      const passkeys = await listPasskeys('applicant', userId);
      return ok(res, {
        passkeys,
        // The domain the credentials are bound to, so the settings page can be
        // specific about where a passkey does and does not work.
        relying_party: relyingParty().id,
        // 5c: the backup codes are what gets past this factor when the
        // authenticator is not to hand, so the count belongs beside it.
        codes: await codeCounts(userId),
      });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url ?? '/', 'https://careers.invalid');
      const id = url.searchParams.get('id');
      if (!id) return fail(res, ERR.BAD_REQUEST, 'Say which passkey to remove.');

      const body = await readJson(req, res);
      if (!body) return;

      const subjects = [subjectForIp(req), subjectForUser('applicant', userId)];
      if (await limited(res, 'passkey', subjects)) return;

      const correct = await verifyRealmPassword('applicant', userId, body.current_password);
      if (!correct) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const removed = await deletePasskey('applicant', userId, id);
      if (!removed) return fail(res, ERR.NOT_FOUND, 'That passkey is not on the list.');

      const remaining = await listPasskeys('applicant', userId);

      await auditApplicant(session.user, AUDIT.PASSKEY_REMOVED, {
        remaining: remaining.length,
      }, { targetTable: 'gftvjobs_passkeys', targetId: id });

      return ok(res, {
        removed: id,
        // Said out loud, because removing the last one changes how signing in
        // works and nobody should discover that at the next sign in.
        second_factor_off: remaining.length === 0,
      });
    }

    const body = await readJson(req, res);
    if (!body) return;

    const subjects = [subjectForIp(req), subjectForUser('applicant', userId)];
    if (await limited(res, 'passkey', subjects)) return;

    // Asked for once, at the start of the ceremony. The finish step is
    // authorised by the challenge that this one issued.
    if (body.action === 'start') {
      const correct = await verifyRealmPassword('applicant', userId, body.current_password);
      if (!correct) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
          details: { current_password: FIELD.INVALID },
        });
      }

      const options = await startRegistration({
        realm: 'applicant',
        userId,
        username: session.user.username,
        displayName: session.user.display_name,
      });
      return ok(res, { options });
    }

    if (body.action === 'finish') {
      const label = validateText(body.label, 60);
      if (!label.ok) {
        return fail(res, ERR.BAD_REQUEST, 'That name is too long.', {
          details: { label: label.code },
        });
      }

      const result = await finishRegistration({
        realm: 'applicant',
        userId,
        response: body.response,
        label: label.value ?? passkeyLabel(req),
      });

      if (!result.ok) {
        await recordFailures('passkey', subjects, LIMITS.passkey);
        return fail(res, ERR.BAD_REQUEST, registrationMessage(result.reason), {
          details: { reason: result.reason },
        });
      }

      await auditApplicant(session.user, AUDIT.PASSKEY_ADDED, {
        label: result.passkey.label,
        backed_up: result.passkey.backed_up,
      }, { targetTable: 'gftvjobs_passkeys', targetId: result.passkey.id });

      return ok(res, {
        passkey: result.passkey,
        codes: await codeCounts(userId),
      });
    }

    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  } catch (cause) {
    return failInternal(res, cause, 'applicant passkeys');
  }
}

function registrationMessage(reason) {
  if (reason === 'challenge_expired') {
    return 'That took too long. Start again.';
  }
  if (reason === 'already_registered') {
    return 'That passkey is already on this account.';
  }
  return 'That passkey could not be added. Try again.';
}
