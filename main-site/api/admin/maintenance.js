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
//   **Any staff member with dashboard access may flip a feature.** Not admins
//   only. 8.12 puts this page in the dashboard and does not restrict it, and the
//   reason not to add a restriction is the point of the page: it exists for the
//   person who is looking at a broken feature at the time, which is as likely to
//   be the job poster who noticed as the admin who is asleep. Everything it can
//   do is reversible by anybody else with the same access, and both directions
//   are audited.
//
//   **The note is optional and is never prefilled.** 8.12: "Prefill nothing and
//   suggest nothing: an admin who has just broken something writes a better
//   sentence than a dropdown does."

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import {
  NOTE_MAX,
  deniedFeatures,
  featureOverrides,
  flippableFeatures,
  isFlippable,
  hasShipped,
  setFeatureOverride,
} from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await flip(req, res, session);

    const overrides = await featureOverrides();

    return ok(res, {
      features: flippableFeatures().map((feature) => ({
        ...feature,
        off: overrides[feature.key]?.off === true,
        note: overrides[feature.key]?.note ?? null,
        since: overrides[feature.key]?.at ?? null,
        by: overrides[feature.key]?.by ?? null,
      })),
      // Shown greyed with the reason rather than hidden, per 8.12.
      denied: deniedFeatures(),
    });
  } catch (cause) {
    return failInternal(res, cause, 'admin maintenance');
  }
}

async function flip(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  const key = String(body.key ?? '').trim();
  const off = body.off === true;

  if (!key) {
    return fail(res, ERR.BAD_REQUEST, 'Which feature?', { details: { key: FIELD.REQUIRED } });
  }

  if (!isFlippable(key)) {
    return fail(res, ERR.FORBIDDEN, 'That one cannot be switched off from here.', {
      details: { key: FIELD.INVALID },
    });
  }

  if (!hasShipped(key)) {
    // A feature that has not shipped is already off. Offering to turn it off
    // again is noise, and honouring it would put an override on a key whose
    // phase might later ship into an outage nobody remembers declaring.
    return fail(res, ERR.CONFLICT, 'That feature has not shipped yet.', {
      details: { key: FIELD.INVALID },
    });
  }

  const note = validateText(body.note, NOTE_MAX);
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That note is too long.', { details: { note: note.code } });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;

  await setFeatureOverride(key, off, { note: note.value, staffUser: session.user });

  // Both directions, per 8.12: an outage nobody recorded the end of is one
  // nobody can measure.
  await auditStaff(
    session.user,
    off ? AUDIT.FEATURE_DISABLED : AUDIT.FEATURE_ENABLED,
    { feature: key, note: note.value },
    { targetTable: 'gftvjobs_settings', targetId: null }
  );

  await recordFailures('admin', subjects, LIMITS.admin);

  const overrides = await featureOverrides();
  return ok(res, {
    key,
    off,
    note: overrides[key]?.note ?? null,
    since: overrides[key]?.at ?? null,
    by: overrides[key]?.by ?? null,
  });
}
