// POST /api/auth/staff/danger   { action } one of six
//
// 5f's danger zone, mounted at the foot of the staff account settings page on
// both sites. Its six actions, in 5f's own order:
//
//   remove_passkeys             remove every passkey
//   remove_totp                 remove the authenticator app
//   invalidate_recovery_codes   invalidate every remaining recovery code
//   invalidate_backup_codes     invalidate every remaining backup code
//   revoke_devices              revoke every trusted device on both sites
//   sign_out_everywhere         end every session on both sites
//
// **There is no delete account, and its absence is a sentence on the page.**
// 5f: "The gftvhello account belongs to gftv.asia and is shared with it; this
// project does not get to delete it. Say so on the page and link across, rather
// than leaving a gap a reader reads as an oversight."
//
// **The ritual is 7g's, unchanged, and it is checked here as well as walked in
// the browser.** Consequences with a cancel at least as prominent as the
// continue, then the account's own username typed in full, then the current
// password verified server side, plus a fresh second factor where the account
// has one. Reaching step 3 in a browser proves nothing to this route, so it
// re-checks the two halves that can be re-checked.
//
// **The staff realm's fresh second factor is not the applicant realm's.** 7g's
// version asks the Telegram bot for a code; this one accepts the authenticator
// code, and there is deliberately nothing else it accepts:
//
//   A passkey would have been the better experience and is not offered, because
//   what makes an assertion fresh is a challenge, and the challenge tables here
//   are keyed to a login. Wiring a second ceremony through them to save one
//   typed code would be a login shaped hole beside the danger zone, which is
//   the one place in the build where a shortcut is worth the least.
//
//   A backup code is not accepted either, and that is the sharper half. It gets
//   past the second factor at sign in, which is exactly why: a code lying in a
//   chat log alongside a password should not also remove the passkeys.
//
//   An account with neither an authenticator app nor a passkey is asked for the
//   password alone, which is 7g's rule and not a gap: there is no second factor
//   to be fresh.
//
// **Every action writes its audit row before it executes**, per 5f, and two of
// them reach gftv.asia: remove_totp writes gftvhello_users.totp_secret and
// invalidate_backup_codes clears gftvhello_backup_codes. The page says which.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import {
  requireStaff,
  revokeAllTrustedDevices,
  listTrustedDevices,
} from '../../_lib/session.js';
import { deleteAllPasskeys, listPasskeys } from '../../_lib/webauthn.js';
import { verifyTotp, hasTotp } from '../../_lib/totp.js';
import { verifyRealmPassword, CODE_SET, codeCounts } from '../../_lib/accounts.js';
import { validateSixDigits, FIELD } from '../../_lib/validate.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { SITE } from '../../_lib/site.js';
import {
  setStaffTotpSecret,
  invalidateCodeSet,
  revokeStaffSessions,
  held,
} from '../../_lib/staff-account.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

/** The six, so an unknown action is refused by a list and not by a fallthrough. */
const ACTIONS = Object.freeze([
  'remove_passkeys',
  'remove_totp',
  'invalidate_recovery_codes',
  'invalidate_backup_codes',
  'revoke_devices',
  'sign_out_everywhere',
]);

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  const user = session.user;
  const userId = user.id;

  // 5f: "Rate limit these endpoints hard and lock the danger zone for an hour
  // after several failed password attempts." Checked before the bcrypt round,
  // so a locked out caller costs nothing. The bucket is the same one 7g's
  // danger zone uses, per account and per address, so an account under attack
  // is slowed on both sites at once -- which is the direction part 1 chose for
  // the login buckets and for the same reason.
  const subjects = [subjectForUser('staff', userId), subjectForIp(req)];
  if (await limited(res, 'danger', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  const action = String(body.action ?? '');
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  // Step 2, re-checked. Case sensitively, whitespace trimmed only, exactly as
  // 7g words it and exactly as the client compares it.
  const typed = String(body.confirm_username ?? '').trim();
  if (typed !== user.username) {
    return fail(res, ERR.BAD_REQUEST, 'That username did not match.', {
      details: { confirm_username: FIELD.INVALID },
    });
  }

  try {
    // Step 3, the password half.
    const correct = await verifyRealmPassword('staff', userId, body.password);
    if (!correct) {
      await recordFailures('danger', subjects, LIMITS.danger);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { password: FIELD.INVALID },
      });
    }

    // Step 3, the second factor half.
    //
    // **A trusted device never gets past this**, which 5d says outright and
    // which is why the check is on the account and not on the browser: trust
    // exists to save somebody a step at sign in, and this is not a sign in.
    if (hasTotp(user.totp_secret)) {
      const code = validateSixDigits(body.code);

      if (!code.ok || !verifyTotp(code.value, user.totp_secret)) {
        await recordFailures('danger', subjects, LIMITS.danger);
        return fail(res, ERR.UNAUTHORISED, 'That code was not right.', {
          details: { code: code.ok ? FIELD.INVALID : code.code },
        });
      }
    }

    // **Cleared here and not per branch.** Both proofs have just been given, so
    // whatever the action turns out to be, this caller is not somebody guessing
    // — and a count left standing after a correct password is a lock that
    // arrives on the next legitimate action instead of on an attack.
    await clearAll('danger', subjects);

    const audit = (auditAction, metadata) =>
      auditStaff(user, auditAction, { danger_zone: true, ...metadata });

    if (action === 'remove_passkeys') {
      const before = await listPasskeys('staff', userId);

      await audit(AUDIT.PASSKEYS_REMOVED_ALL, {
        count: before.length,
        // Which site each was registered from, since the rows are about to go
        // and 039 exists so this question has an answer at all.
        registered_on: before.map((passkey) => passkey.registered_on ?? null),
      });

      const result = await deleteAllPasskeys('staff', userId);
      if (!result.ok) return fail(res, ERR.SERVER_ERROR, 'That could not be done. Try again.');

      return ok(res, {
        action,
        removed: result.removed,
        // Both sites, because 5e gives them one relying party id: a passkey
        // removed here was offered on both and is now offered on neither.
        both_sites: true,
        second_factor_off: !hasTotp(user.totp_secret),
      });
    }

    if (action === 'remove_totp') {
      // **The one action here that writes gftvhello_users**, so it is the one
      // the hold covers. The other five move rows this build owns and are live
      // from the first deploy. Checked after the two proofs rather than before
      // them, unlike the routes: somebody who has typed their username, their
      // password and a fresh code deserves to be told which action is held and
      // not to be turned away before the dialog has finished.
      if (held(res)) return;

      if (!hasTotp(user.totp_secret)) {
        return fail(res, ERR.NOT_FOUND, 'This account has no authenticator app.');
      }

      await audit(AUDIT.TOTP_REMOVED, { reaches: 'gftvhello_users.totp_secret' });

      const written = await setStaffTotpSecret(userId, null);
      if (!written) return fail(res, ERR.SERVER_ERROR, 'That could not be done. Try again.');

      // 5d: disabling a second factor revokes every trusted device, because
      // each was trusted on the strength of the thing that has just gone.
      await revokeAllTrustedDevices('staff', userId);

      return ok(res, { action, enrolled: false, reaches_gftv_asia: true, devices_revoked: true });
    }

    if (action === 'invalidate_recovery_codes' || action === 'invalidate_backup_codes') {
      const which = action === 'invalidate_backup_codes' ? 'backup' : 'recovery';
      const before = await codeCounts('staff', userId);

      await audit(AUDIT.CODES_INVALIDATED, {
        set: which,
        // Null when the count could not be read, which is the honest answer and
        // does not stop the action: the row says a set was cleared and admits
        // it does not know how many were in it.
        count: before[which],
        ...(which === 'backup' ? { reaches: 'gftvhello_backup_codes' } : {}),
      });

      const result = await invalidateCodeSet(CODE_SET.staff[which], userId);
      if (!result.ok) return fail(res, ERR.SERVER_ERROR, 'That could not be done. Try again.');

      return ok(res, {
        action,
        set: which,
        removed: result.removed,
        counts: await codeCounts('staff', userId),
        reaches_gftv_asia: which === 'backup',
      });
    }

    if (action === 'revoke_devices') {
      const before = await listTrustedDevices('staff', userId);

      await audit(AUDIT.TRUSTED_DEVICES_REVOKED_ALL, {
        count: before.length,
        // Deviation 125, said in the log as well as on the page: the table is
        // shared, so this is every device on the account and not every device
        // on this site. A row that implied otherwise would be the same claim
        // the page is careful not to make.
        scope: 'both_sites',
      });

      await revokeAllTrustedDevices('staff', userId);

      return ok(res, { action, revoked: before.length, both_sites: true });
    }

    // sign_out_everywhere
    //
    // **Every session on both sites, this one included**, settled 3 September
    // 2026 after somebody pressed the button and found themselves still signed
    // in. This route used to keep the calling session, on the argument that
    // throwing somebody out to prove the action worked costs them a sign in.
    // 5f says "sign out everywhere" with no exception, and the person reaching
    // for this in a danger zone has usually lost a laptop: for them the session
    // that must end is one they cannot press a button from. A button that keeps
    // one session is a button whose name is wrong.
    //
    // **What it still cannot reach is gftv.asia.** Those sessions live in
    // gftvhello_sessions, which is that site's table and not among the four
    // writes section 2 permits this project -- deviation 122 moved this build's
    // staff sessions out of it for that reason. So the consequence line says
    // gftv.asia is unaffected, in both languages, before anybody presses it.
    await audit(AUDIT.SESSIONS_REVOKED_ALL, { kept: 'none', from_site: SITE });

    const result = await revokeStaffSessions(userId);
    if (!result.ok) return fail(res, ERR.SERVER_ERROR, 'That could not be done. Try again.');

    // The client sends the reader to the sign in page on this flag. Their
    // cookie now points at a row that is gone, so the alternative is a settings
    // page whose next request 401s.
    return ok(res, { action, both_sites: true, kept_current: false, signed_out: true });
  } catch (cause) {
    return failInternal(res, cause, 'staff danger zone');
  }
}
