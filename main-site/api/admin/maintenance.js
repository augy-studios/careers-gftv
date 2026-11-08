// /api/admin/maintenance
//
// Section 8.12, and 0c's maintenance switches. Built in phase 7 rather than with
// the rest of the settings in 8.10, because a lever for turning a broken feature
// off is worth having before the phases that add the most surface.
//
//   GET   every flippable feature, its state, and the denylist with its reasons
//   POST  { key, off, note }
//
// The reasoning behind all of it is in api/_lib/maintenance.js. What is decided
// here rather than there:
//
//   **Admins only, since phase 14 part 5.** 8.12 puts this page in the dashboard
//   and does not restrict it, but 10 item 2 names "the maintenance switches in
//   8.12" in its list of what only an admin may do, and this route had guarded
//   with requireStaff since phase 7. Deviation 130.
//
//   This file used to argue the other way, and the argument is worth keeping
//   because it is not a bad one: the page exists for the person looking at a
//   broken feature at the time, which is as likely to be the job poster who
//   noticed as the admin who is asleep. What settled it is that switching a
//   feature off reaches every visitor of both sites, nothing turns it back on by
//   itself, and the specification had already decided. A poster who notices
//   still sees the banner saying something is off; the page it is switched back
//   on from is an admin's.
//
//   **The note is optional and is never prefilled.** 8.12: "Prefill nothing and
//   suggest nothing: an admin who has just broken something writes a better
//   sentence than a dropdown does."

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  failInternal,
  readJson,
} from '../_lib/respond.js';
import { requireAdmin } from '../_lib/admin.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import {
  NOTE_MAXIMUM,
  deniedFeatures,
  featureOverrides,
  flippableFeatures,
  isFlippable,
  isHeld,
  hasShipped,
  setFeatureOverride,
} from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

/**
 * Read or change the maintenance switches. Admins only, because a switch turns a
 * feature off for every visitor of both sites.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD', 'POST'])) return;

  // Not requireStaff. 10 item 2 names the maintenance switches as admins only.
  // Turning a shipped feature off reaches every visitor of both sites and
  // nothing turns it back on by itself, which is not a job poster's decision to
  // take alone. Phase 14 part 5, deviation 130.
  const session = await requireAdmin(request, response);
  if (!session) return;

  response.setHeader('Cache-Control', 'no-store');

  try {
    if (request.method === 'POST') return await flip(request, response, session);

    const overrides = await featureOverrides();

    return ok(response, {
      features: flippableFeatures().map((feature) => ({
        ...feature,
        off: overrides[feature.key]?.off === true,
        note: overrides[feature.key]?.note ?? null,
        since: overrides[feature.key]?.at ?? null,
        by: overrides[feature.key]?.by ?? null,
        // Phase 15 part 1. Off until switched on, and off right now because
        // nobody has: the page says that instead of "switched off by", since
        // nobody did. Once an admin has switched it off themselves the record
        // carries their name and this reads false.
        held:
          isHeld(feature.key) &&
          overrides[feature.key]?.off === true &&
          !overrides[feature.key]?.by,
      })),
      // Shown greyed with the reason rather than hidden, per 8.12.
      denied: deniedFeatures(),
    });
  } catch (cause) {
    return failInternal(response, cause, 'admin maintenance');
  }
}

/**
 * Switch one shipped feature off for everybody, or back on, with a note shown to
 * visitors explaining why. Features that cannot be switched off, or have not
 * shipped, are refused.
 */
async function flip(request, response, session) {
  const body = await readJson(request, response);
  if (body === null) return;

  const key = String(body.key ?? '').trim();
  const off = body.off === true;

  if (!key) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'Which feature?', {
      details: { key: FIELD.REQUIRED },
    });
  }

  if (!isFlippable(key)) {
    return fail(response, ERROR_CODES.FORBIDDEN, 'That one cannot be switched off from here.', {
      details: { key: FIELD.INVALID },
    });
  }

  if (!hasShipped(key)) {
    // A feature that has not shipped is already off. Offering to turn it off
    // again is noise, and honouring it would put an override on a key whose
    // phase might later ship into an outage nobody remembers declaring.
    return fail(response, ERROR_CODES.CONFLICT, 'That feature has not shipped yet.', {
      details: { key: FIELD.INVALID },
    });
  }

  const note = validateText(body.note, NOTE_MAXIMUM);
  if (!note.ok) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That note is too long.', {
      details: { note: note.code },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(response, 'admin', subjects)) return;

  await setFeatureOverride(key, off, { note: note.value, staffUser: session.user });

  // Both directions, per 8.12: an outage nobody recorded the end of is one
  // nobody can measure.
  let auditAction;

  if (off) {
    auditAction = AUDIT.FEATURE_DISABLED;
  } else {
    auditAction = AUDIT.FEATURE_ENABLED;
  }

  await auditStaff(
    session.user,
    auditAction,
    { feature: key, note: note.value },
    { targetTable: 'gftvjobs_settings', targetId: null }
  );

  await recordFailures('admin', subjects, LIMITS.admin);

  const overrides = await featureOverrides();
  return ok(response, {
    key,
    off,
    note: overrides[key]?.note ?? null,
    since: overrides[key]?.at ?? null,
    by: overrides[key]?.by ?? null,
  });
}
