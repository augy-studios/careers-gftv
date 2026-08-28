// The audit log.
//
// gftvjobs_audit_log was created in migration 012 for 7g ("every destructive
// action writes an audit row before it executes"), 8.9, and section 11. Those
// are phases 6, 8, and 9. This file starts using it in phase 2, for the
// security events, because those are exactly the ones worth having a record of
// before something goes wrong rather than after.
//
// What is logged: password changes and resets, passkeys added and removed,
// trusted devices revoked, recovery codes regenerated, and staff sign ins with
// the factor that satisfied them.
//
// What is not: ordinary applicant sign ins. One row per sign in is a table
// that grows without telling anybody anything, and the session row already
// records that a sign in happened.
//
// Two rules this file keeps:
//
//   1. No IP addresses, ever. Section 6 puts no IP anywhere in this build, and
//      an audit row is not an exception. The user agent label is coarse enough
//      to recognise your own laptop and no more, the same one the trusted
//      device list shows.
//   2. A failed write never fails the request. The action the person asked for
//      has happened or is about to; refusing it because the log was
//      unreachable would be strictly worse than a missing row. Everything is
//      logged to the server console as well, so nothing is silently lost.

import { supabase, T } from './supabase.js';

/**
 * The actions this build writes. A fixed list rather than free text, so the
 * admin view in phase 8 can group them and a typo is not a new category.
 */
export const AUDIT = Object.freeze({
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET: 'password_reset',
  PASSKEY_ADDED: 'passkey_added',
  PASSKEY_REMOVED: 'passkey_removed',
  TRUSTED_DEVICE_REVOKED: 'trusted_device_revoked',
  TRUSTED_DEVICES_REVOKED_ALL: 'trusted_devices_revoked_all',
  RECOVERY_CODES_GENERATED: 'recovery_codes_generated',
  STAFF_SIGNED_IN: 'staff_signed_in',
  // Phase 6, the account area. ACCOUNT_DELETED is the one row in this list that
  // outlives its subject: 7g requires the audit row to be written before the
  // action runs, and migration 012 deliberately puts no foreign key on actor_id
  // so the record survives the account it describes.
  AVATAR_SET: 'avatar_set',
  AVATAR_REMOVED: 'avatar_removed',
  ACCOUNT_DELETED: 'account_deleted',
  // Phase 7, the dashboard. Every one of these is a staff action, so they are
  // all written through auditStaff and all carry the actor's gftvhello id.
  //
  // What is logged is what changes somebody else's world: a posting going
  // public or disappearing, a person's application moving, a feature going off
  // across the whole site. What is not is an admin editing the wording of a
  // draft, which is a row with an updated_at on it already.
  JOB_CREATED: 'job_created',
  JOB_STATUS_CHANGED: 'job_status_changed',
  JOB_DELETED: 'job_deleted',
  DEPARTMENT_DELETED: 'department_deleted',
  TAG_DELETED: 'tag_deleted',
  TAGS_MERGED: 'tags_merged',
  APPLICATION_STATUS_CHANGED: 'application_status_changed',
  // Added 23 August 2026 with the bulk delete on the tracking page. Its own
  // action rather than a variant of the status change, because it is the only
  // thing on that page that cannot be undone: the row, its whole timeline, and
  // the reapply cooldown it was carrying all go, and the metadata names every
  // applicant and posting affected because the rows will not be there to say.
  APPLICATION_DELETED: 'application_deleted',
  COOLDOWN_WAIVED: 'cooldown_waived',
  TASK_RAISED: 'task_raised',
  TASK_RESOLVED: 'task_resolved',
  // 8.12, and both directions on purpose: "Turning a feature back on is as much
  // an event as turning it off, and an outage nobody recorded the end of is one
  // nobody can measure."
  FEATURE_DISABLED: 'feature_disabled',
  FEATURE_ENABLED: 'feature_enabled',
  // Phase 8, the rest of the dashboard.
  //
  // SETTING_CHANGED is one action rather than one per key, and it carries the
  // key in its metadata. 8.10 edits five things and phase 9 will add more; a
  // constant per setting would make the audit view's grouping a list that grows
  // every time somebody adds a row to gftvjobs_settings.
  //
  // APPLICATIONS_CLOSED and APPLICATIONS_OPENED are the exception, and they are
  // separate for the same reason the two feature actions above are: turning
  // applications off across the whole site is not "a setting changed", it is the
  // board closing, and it should be legible in the log without reading the
  // metadata of every setting write.
  SETTING_CHANGED: 'setting_changed',
  APPLICATIONS_CLOSED: 'applications_closed',
  APPLICATIONS_OPENED: 'applications_opened',
  // 8.5. Inviting is logged because it reaches a real person; shortlisting is
  // logged because it is a decision about somebody made without telling them,
  // which is exactly the kind of thing a log exists for. Withdrawing is logged
  // for the same reason both directions of a maintenance flip are: an invite
  // nobody recorded the end of is one nobody can explain later.
  INVITE_SENT: 'invite_sent',
  INVITE_WITHDRAWN: 'invite_withdrawn',
  APPLICANT_SHORTLISTED: 'applicant_shortlisted',
  // 8.8. Who can reach the dashboard, in all three directions. The third is not
  // a tidy up: handing the decision back to somebody's gftv.asia role is a
  // different act from granting or revoking, and a log that recorded it as
  // either would misdescribe what happens the next time that role changes.
  PORTAL_ACCESS_GRANTED: 'portal_access_granted',
  PORTAL_ACCESS_REVOKED: 'portal_access_revoked',
  PORTAL_ACCESS_RESET: 'portal_access_reset',
  // 8.9. Deleting an applicant account from the dashboard is deliberately not
  // in this list: it writes ACCOUNT_DELETED with the staff realm, because it is
  // the same event from the account's point of view and the actor is what tells
  // the two apart.
  APPLICANT_DEACTIVATED: 'applicant_deactivated',
  APPLICANT_REACTIVATED: 'applicant_reactivated',
  // The one action in the build that breaks non repudiation, per 8.9. Once an
  // admin can set a password, this log can no longer prove the applicant did
  // something themselves, which is why it is its own action rather than another
  // password_changed row.
  APPLICANT_PASSWORD_SET: 'applicant_password_set',
  APPLICANT_RESET_FORCED: 'applicant_reset_forced',
  APPLICANT_TELEGRAM_UNLINKED: 'applicant_telegram_unlinked',
  // Phase 11. The applicant's own two, and they are not the same event as the
  // admin action above them: that one is somebody being unlinked, these are
  // somebody unlinking. What a log has to answer later is who decided.
  //
  // **TELEGRAM_LINKED is written by the bot, not by this codebase.** The site
  // issues a token and returns; the row that says a link exists is written by
  // the process that received the token, which is the only thing that knows the
  // link happened. It writes the same realm and the same actor id, because it
  // is still the applicant's action.
  TELEGRAM_LINKED: 'telegram_linked',
  TELEGRAM_UNLINKED: 'telegram_unlinked',
  // 7i and 8.11. The two actions on /admin/translations that write here at all:
  // everything else on that page is an admin editing wording, which phase 7
  // settled is not an audit event. Granting is, because it hands somebody
  // standing write access to a language across every posting.
  //
  // Revoking is logged for a second reason on top of that one. Migration 023 has
  // no revoked state and the primary key is (user_id, locale), so a revoke
  // deletes the row and this is the only surviving record that the role was ever
  // held or why it was taken away.
  TRANSLATION_HELPER_GRANTED: 'translation_helper_granted',
  TRANSLATION_HELPER_REVOKED: 'translation_helper_revoked',
  // 7i's helper area, and **the one editing action in this build that is
  // logged**, which is worth stating plainly because the line above says the
  // opposite about the admin queue. Three things make a helper's save different
  // from an admin's, and the first is the one that decides it:
  //
  //   **A helper is not staff, so there is no second record anywhere.** An admin
  //   editing wording leaves a staff session, a gftvhello identity, and a
  //   dashboard they reached through the access overlay. A helper leaves an
  //   applicant cookie and migration 034's updated_by, which says who last wrote
  //   a row and nothing about what they wrote before or how often.
  //
  //   **The role is standing write access to an entire language**, across every
  //   posting, team, and tag, granted to somebody deliberately outside the
  //   building. Granting it is logged for exactly that reason; leaving what it
  //   is then used for unlogged would record the decision and not the effect.
  //
  //   **Two of the three things they edit go live on save**, per deviation 51:
  //   014 gives is_ready to postings alone, so a team or tag name reaches every
  //   job card the moment it is written.
  //
  // One action rather than one per target type, with the type, the language, and
  // the fields touched in the metadata. Same call SETTING_CHANGED made: a
  // constant per kind of row is a category list that grows with the schema.
  TRANSLATION_EDITED: 'translation_edited',
  // Phase 9, section 13's fallbacks. An admin asserting that a form submission
  // made under one email address belongs to an account registered under
  // another, which is the ordinary unmatched case and not a suspicious one.
  //
  // Logged for the same reason TRANSLATION_EDITED is, and it is the second
  // deliberate exception to "editing is not an audit event": the assertion is a
  // judgement rather than a fact, it is made about somebody else, and it has
  // consequences the person it is made about will feel — their application
  // reads as submitted and their reapply cooldown starts. If it is ever wrong,
  // this row is the only record of who decided it and on what evidence.
  SUBMISSION_LINKED: 'submission_linked',
});

/**
 * Write one audit row.
 *
 * Awaited by its callers rather than fired and forgotten, so the row is on
 * disk before the response goes out, but never allowed to throw.
 *
 * @param {{
 *   realm: 'staff'|'applicant'|'system',
 *   actorId?: string|null,
 *   actorLabel?: string|null,
 *   action: string,
 *   targetTable?: string|null,
 *   targetId?: string|null,
 *   reason?: string|null,
 *   metadata?: Record<string, unknown>
 * }} entry
 */
export async function recordAudit(entry) {
  try {
    const { error } = await supabase.from(T.auditLog).insert({
      actor_realm: entry.realm,
      actor_id: entry.actorId ?? null,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    });

    if (error) {
      console.error('[careers-gftv] audit write failed:', entry.action, error);
    }
  } catch (cause) {
    console.error('[careers-gftv] audit write threw:', entry.action, cause);
  }
}

/**
 * The same shape for an applicant event, so the realm and the label are not
 * spelled out at every call site.
 * @param {{ id: string, username?: string }} user
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {{ targetTable?: string, targetId?: string, reason?: string|null }} [target]
 */
export function auditApplicant(user, action, metadata = {}, target = {}) {
  return recordAudit({
    realm: 'applicant',
    actorId: user?.id ?? null,
    actorLabel: user?.username ?? null,
    action,
    targetTable: target.targetTable ?? null,
    targetId: target.targetId ?? null,
    reason: target.reason ?? null,
    metadata,
  });
}

/**
 * The staff equivalent.
 * @param {{ id: string, username?: string }} user
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {{ targetTable?: string, targetId?: string, reason?: string|null }} [target]
 *        The reason is optional to pass and required by some callers: 8.9 will
 *        not deactivate, set a password, or delete an account without one, and
 *        that requirement is enforced at the route rather than here, so a
 *        caller that legitimately has nothing to say is not forced to invent it.
 */
export function auditStaff(user, action, metadata = {}, target = {}) {
  return recordAudit({
    realm: 'staff',
    actorId: user?.id ?? null,
    actorLabel: user?.username ?? null,
    action,
    targetTable: target.targetTable ?? null,
    targetId: target.targetId ?? null,
    reason: target.reason ?? null,
    metadata,
  });
}
