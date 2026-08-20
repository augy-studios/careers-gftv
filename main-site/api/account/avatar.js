// POST   /api/account/avatar   raw image/webp body
// DELETE /api/account/avatar   remove it
//
// The endpoint main-site/AVATARS.md describes. Read that file before changing
// this one: it records why Supabase Storage is used at all, given that section
// 10 item 1 says it is not, and it is the checklist this route is written
// against.
//
// **Not readJson.** That caps bodies at 64 KB and expects JSON, and the cap is
// right for JSON. An image is read raw, with its own cap, and the default is not
// raised globally to accommodate this one route.
//
// **The magic bytes are checked, not the Content-Type header.** The header is
// whatever the client felt like sending. The bucket's allowed_mime_types is a
// second line of defence and neither of them is a reason to skip the first.
//
// The browser sends WebP because it encoded it: assets/js/avatar.js resizes and
// re-encodes through a canvas before uploading, which is what makes the upload
// fit in one request at all and which strips EXIF as a side effect. That side
// effect is worth having on purpose: phone photos carry GPS coordinates, and an
// avatar should not publish where somebody lives.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireApplicant, publicApplicant } from '../_lib/session.js';
import { randomToken } from '../_lib/tokens.js';
import { AUDIT, auditApplicant } from '../_lib/audit.js';
import {
  AVATAR_MAX_BYTES,
  isWebp,
  removeAvatarObject,
  storeAvatar,
} from '../_lib/avatars.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST', 'DELETE'])) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'avatar', subjects)) return;

  try {
    if (req.method === 'DELETE') return remove(res, session);
    return upload(req, res, session, subjects);
  } catch (cause) {
    return failInternal(res, cause, 'avatar');
  }
}

async function upload(req, res, session, subjects) {
  const buffer = await readImage(req, res);
  if (buffer === null) return;

  if (buffer.length === 0) {
    return fail(res, ERR.BAD_REQUEST, 'That request carried no image.');
  }

  if (!isWebp(buffer)) {
    return fail(res, ERR.BAD_REQUEST, 'That file is not a WebP image.', {
      details: { avatar: 'invalid' },
    });
  }

  const url = await storeAvatar(
    session.user.id,
    session.user.avatar_url ?? null,
    buffer,
    randomToken(16)
  );

  await recordFailures('avatar', subjects, LIMITS.avatar);

  await auditApplicant(
    session.user,
    AUDIT.AVATAR_SET,
    { bytes: buffer.length },
    { targetTable: T.users, targetId: session.user.id }
  );

  return ok(res, { user: publicApplicant({ ...session.user, avatar_url: url }) });
}

async function remove(res, session) {
  const previous = session.user.avatar_url ?? null;

  const { error } = await supabase
    .from(T.users)
    .update({ avatar_url: null })
    .eq('id', session.user.id);

  if (error) return failInternal(res, error, 'avatar remove');

  // After the column is cleared, for the same reason storeAvatar deletes after
  // it writes: an object removed before the column would leave a broken image
  // on screen if the write then failed.
  await removeAvatarObject(previous);

  await auditApplicant(
    session.user,
    AUDIT.AVATAR_REMOVED,
    {},
    { targetTable: T.users, targetId: session.user.id }
  );

  return ok(res, { user: publicApplicant({ ...session.user, avatar_url: null }) });
}

/**
 * Read the raw request body, refusing anything over the cap as it arrives
 * rather than after the whole thing is in memory.
 *
 * Answers the request itself and returns null when it refuses, matching
 * readJson's contract so the caller reads the same way.
 */
async function readImage(req, res) {
  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > AVATAR_MAX_BYTES) {
        fail(res, ERR.PAYLOAD_TOO_LARGE, 'That image is too large.', {
          details: { avatar: 'too_long' },
        });
        return null;
      }
      chunks.push(chunk);
    }
  } catch (cause) {
    failInternal(res, cause, 'avatar body');
    return null;
  }

  return Buffer.concat(chunks);
}
