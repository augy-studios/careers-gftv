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
 * @param {{ targetTable?: string, targetId?: string }} [target]
 */
export function auditApplicant(user, action, metadata = {}, target = {}) {
  return recordAudit({
    realm: 'applicant',
    actorId: user?.id ?? null,
    actorLabel: user?.username ?? null,
    action,
    targetTable: target.targetTable ?? null,
    targetId: target.targetId ?? null,
    metadata,
  });
}

/**
 * The staff equivalent.
 * @param {{ id: string, username?: string }} user
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {{ targetTable?: string, targetId?: string }} [target]
 */
export function auditStaff(user, action, metadata = {}, target = {}) {
  return recordAudit({
    realm: 'staff',
    actorId: user?.id ?? null,
    actorLabel: user?.username ?? null,
    action,
    targetTable: target.targetTable ?? null,
    targetId: target.targetId ?? null,
    metadata,
  });
}
