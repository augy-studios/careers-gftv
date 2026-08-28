// POST /api/account/danger/delete
//
// Section 7g's danger zone. Unlinking Telegram and disabling Telegram 2FA are
// the other two actions it lists, and both landed in phase 11 on the settings
// page's own panel rather than here: deleting an account is the one that cannot
// be undone, and it is the only one that needs this file's ritual in full.
//
// Phase 11 part 3 added 7g step 3's second half, the fresh Telegram code.
//
// **There is no separate verify-password route, and that is deliberate.**
// Section 9 lists `api/account/danger/*` as "verify password, then each
// destructive action", and building the first half would produce exactly the
// thing 7g forbids: an endpoint whose answer is "the password was correct",
// which a client then acts on. 7g: "which is verified server side against the
// bcrypt hash on a dedicated endpoint. Never accept a client side password was
// correct signal." The honest reading is that the destructive endpoint verifies
// the password itself, in the same request as the action, which is what this
// does. Recorded in next-steps.md rather than left to be rediscovered.
//
// The three steps 7g fixes are enforced twice over. The client walks them in
// assets/js/danger-confirm.js, and this route re-checks the two that can be
// checked: the typed username has to match the session's own, and the password
// has to verify. Reaching step 3 in a browser proves nothing here.
//
// What deletion does and does not do, per 7g:
//
//   **Cascades the applicant's own rows.** Sessions, saved jobs, ratings,
//   applications and their events, tasks, passkeys, and both code sets all
//   carry on delete cascade from migrations 002 through 008.
//
//   **Keeps gftvjobs_analytics with applicant_id set to null**, per the
//   on delete set null in migration 007, "so historical funnel numbers stay
//   intact". Do not add a cascade there to tidy up.
//
//   **Keeps gftvjobs_translation_reports the same way**, per migration 015: a
//   report that led to a correction is the record of why the wording changed.
//
//   **Deletes their avatar objects.** Storage is not part of any cascade and
//   would quietly keep the picture forever. See AVATARS.md, section 4.
//
//   **Does not touch their Google Form responses.** The portal never had them.
//   The panel says so before the button is pressed, and says to contact the team
//   separately, per 7g step 1.
//
//   **Writes the audit row before the delete runs**, so the record survives it.
//   migration 012 puts no foreign key on actor_id for exactly this row.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../../_lib/respond.js';
import { supabase, T } from '../../_lib/supabase.js';
import { requireApplicant } from '../../_lib/session.js';
import { verifyRealmPassword } from '../../_lib/accounts.js';
import { linkState, verifyLoginCode } from '../../_lib/telegram.js';
import { AUDIT, recordAudit } from '../../_lib/audit.js';
import { removeAllAvatarObjects } from '../../_lib/avatars.js';
import { clearCookie, COOKIE } from '../../_lib/cookies.js';
import { FIELD } from '../../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForUser,
  subjectForIp,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  // 7g: "Rate limit these endpoints hard, and lock the danger zone for an hour
  // after several failed password attempts." Checked before the bcrypt round,
  // so a locked out caller costs nothing.
  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'danger', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  // Step 2, re-checked. Case sensitively, whitespace trimmed only, exactly as
  // 7g words it and exactly as the client compares it.
  const typed = String(body.confirm_username ?? '').trim();
  if (typed !== session.user.username) {
    return fail(res, ERR.BAD_REQUEST, 'That username did not match.', {
      details: { confirm_username: FIELD.INVALID },
    });
  }

  try {
    // Step 3, the password half.
    const correct = await verifyRealmPassword('applicant', session.user.id, body.password);

    if (!correct) {
      await recordFailures('danger', subjects, LIMITS.danger);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { password: FIELD.INVALID },
      });
    }

    // Step 3, the second factor half, added by phase 11 part 3. 7g: "If Telegram
    // 2FA is enabled on the account, also require a fresh code from the bot at
    // this step, since that is the point of having it."
    //
    // **A trusted device never gets past this**, which 5d says outright and
    // which is the reason the check is on the account rather than on the
    // browser: trust exists to save somebody a step at sign in, and the thing
    // being asked for here is not a sign in.
    //
    // The read fails closed. An account that says it wants a code, on a request
    // where we could not find out whether the code was right, does not get to
    // delete itself on the strength of a password.
    const link = await linkState(session.user.id);

    if (link?.twofaEnabled === true) {
      const verified = await verifyLoginCode(session.user.id, body.code);

      if (!verified) {
        await recordFailures('danger', subjects, LIMITS.danger);
        return fail(res, ERR.UNAUTHORISED, 'That code was not right.', {
          details: { code: FIELD.INVALID },
        });
      }
    }

    // Before the delete, never after. The account is about to stop existing and
    // this row is the only thing that will say it ever did.
    await recordAudit({
      realm: 'applicant',
      actorId: session.user.id,
      actorLabel: session.user.username,
      action: AUDIT.ACCOUNT_DELETED,
      targetTable: T.users,
      targetId: session.user.id,
      reason: 'Requested by the account holder from the danger zone.',
      metadata: {
        username: session.user.username,
        created_at: session.user.created_at ?? null,
      },
    });

    // Storage first, because it is the one thing that needs the id and the URL
    // while the row still exists. A failure in here is logged and swallowed: an
    // orphaned image is worth far less than the deletion the person asked for.
    await removeAllAvatarObjects(session.user.id);

    const { error } = await supabase.from(T.users).delete().eq('id', session.user.id);
    if (error) return failInternal(res, error, 'account delete');

    // The session rows went with the cascade, so every other browser is already
    // signed out. These two clear the cookies in this one so the page it lands
    // on does not spend a request discovering that.
    clearCookie(res, COOKIE.applicantSession);
    clearCookie(res, COOKIE.applicantDevice);

    // The lockout counter is keyed on an account that no longer exists. Cleared
    // so the rows do not sit there until the phase 9 cron sweeps them.
    await clearAll('danger', subjects);

    // 7g: "Show a final confirmation screen after the fact, not just a redirect
    // to the home page." The client owns that screen; this says the deletion
    // happened so it has something true to show.
    return ok(res, { deleted: true, username: session.user.username });
  } catch (cause) {
    return failInternal(res, cause, 'account delete');
  }
}
