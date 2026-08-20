// Avatars, server side. The guide is main-site/AVATARS.md and it is worth
// reading before changing anything here, because the first section of it changes
// a settled decision: section 10 item 1 says "no Supabase Storage, no uploads",
// and this one square image per account is the recorded exception to it.
// Applications and resumes stay in Google Forms regardless.
//
// The shape is forced by section 2. The browser never receives an anon key, so
// it cannot upload to Storage the way a Supabase app normally would. The bytes
// come through a function using the service key, which is also why the browser
// compresses first: a Vercel function takes at most 4.5 MB of request body, and
// nothing here decodes an image.
//
// **No image processing on the server.** Everything in this file is a length
// check and twelve bytes of magic number. Do not add a resize library: the
// browser already did the work, and an image decoder in a request path is a
// large attack surface for a small convenience.

import { supabase, T } from './supabase.js';

/** The bucket from AVATARS.md. Public, 256 KB, image/webp only, no policies. */
export const AVATAR_BUCKET = 'gftvjobs-avatars';

/** The bucket's own ceiling, repeated here so the refusal is ours and readable. */
export const AVATAR_MAX_BYTES = 256 * 1024;

/**
 * Whether a buffer is actually a WebP file.
 *
 * A WebP starts with RIFF, then four bytes of length, then WEBP. Checked
 * because the Content-Type header is whatever the client felt like sending, and
 * the bucket's allowed_mime_types is a second line of defence rather than the
 * first. SVG is the case this exists for: it is a script execution vector and is
 * exactly what would be tried against a naive content type check.
 *
 * @param {Buffer} buffer
 */
export function isWebp(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

/**
 * The object path inside the bucket that a stored public URL points at.
 *
 * Public URLs are .../object/public/{bucket}/{path}, so the path is whatever
 * follows the bucket name. Returns null for anything that is not one of our own
 * URLs, which is what stops a hand edited avatar_url turning a delete into a
 * request to remove somebody else's object.
 *
 * @param {string|null} url
 * @returns {string|null}
 */
export function objectPathFromUrl(url) {
  if (typeof url !== 'string' || url === '') return null;

  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const path = url.slice(at + marker.length).split('?')[0];
  return path === '' ? null : decodeURIComponent(path);
}

/**
 * Remove one stored avatar object, named by its public URL.
 *
 * Never throws and never fails a request. An orphaned object costs a few
 * kilobytes; a request that failed because a cleanup did costs somebody their
 * avatar or their account deletion.
 *
 * @param {string|null} url
 */
export async function removeAvatarObject(url) {
  const path = objectPathFromUrl(url);
  if (!path) return;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.warn('[careers-gftv] avatar cleanup:', error);
}

/**
 * Remove everything one account has ever uploaded.
 *
 * AVATARS.md, section 4, first item: "Deleting an account must delete its
 * objects. The phase 6 danger zone cascades the applicant's rows; Storage is not
 * part of that cascade and will quietly keep the picture forever."
 *
 * Everything for one account is under {user_id}/, which is the whole reason the
 * paths are laid out that way. Listing rather than deleting the stored URL alone
 * catches the orphans a failed cleanup left behind on an earlier upload.
 *
 * @param {string} userId
 */
export async function removeAllAvatarObjects(userId) {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, {
    limit: 100,
  });

  if (error) {
    console.warn('[careers-gftv] avatar list for deletion:', error);
    return;
  }

  const paths = (data ?? []).map((entry) => `${userId}/${entry.name}`);
  if (paths.length === 0) return;

  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  if (removeError) console.warn('[careers-gftv] avatar bulk cleanup:', removeError);
}

/**
 * Store a new avatar for an applicant and return its public URL.
 *
 * The order is the one AVATARS.md fixes and it is not arbitrary: upload, then
 * write the column, then delete the old object. If the delete fails the account
 * has a working avatar and one orphan; if the write failed after a delete the
 * account would have a broken one. Orphans are cheap, broken avatars are not.
 *
 * @param {string} userId
 * @param {string|null} previousUrl
 * @param {Buffer} buffer
 * @param {string} filename a random name, so caches update by themselves
 * @returns {Promise<string>} the public URL
 */
export async function storeAvatar(userId, previousUrl, buffer, filename) {
  const path = `${userId}/${filename}.webp`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, {
    contentType: 'image/webp',
    // A year. The filename changes on every upload, so a stale cache is
    // impossible and there is nothing to revalidate.
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) throw error;

  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl;

  if (!url) throw new Error('storage returned no public URL for the avatar');

  const { error: writeError } = await supabase
    .from(T.users)
    .update({ avatar_url: url })
    .eq('id', userId);

  if (writeError) {
    // The column still points at the previous object, or at nothing. Clean up
    // the one just uploaded rather than leaving a file nothing references.
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw writeError;
  }

  await removeAvatarObject(previousUrl);

  return url;
}
