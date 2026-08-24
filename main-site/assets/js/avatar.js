// Turning whatever came out of somebody's photo library into one small square
// WebP, in the browser, before anything is uploaded.
//
// This is copied from main-site/AVATARS.md, which is the guide for the whole
// mechanism. Read section 1 of that file before changing anything here: the
// compression is not a nicety, it is what makes the upload possible at all. A
// Vercel serverless function accepts a request body of at most 4.5 MB, the
// bucket refuses anything over 256 KB and anything that is not image/webp, and
// the browser never receives a Supabase key so the bytes have to come through
// our own function either way.
//
// Re-encoding through a canvas strips EXIF as a side effect, and that side
// effect is worth having on purpose: phone photos carry GPS coordinates, and an
// avatar upload should not publish where somebody lives.

/** The output edge. 512 is plenty for an avatar and is what AVATARS.md fixes. */
const EDGE = 512;

/**
 * Quality 0.82 is the knee of the curve for photographs: visibly identical to
 * 1.0 at avatar size and a fraction of the bytes. The lower steps are the
 * fallback for an image that somehow still comes out large.
 */
const QUALITIES = [0.82, 0.7, 0.55];

/** The bucket's ceiling, repeated so the refusal happens before the request. */
const MAX_BYTES = 256 * 1024;

/**
 * Whether this browser can produce WebP at all.
 *
 * For the disabled control pattern in section 0c: a control that cannot work
 * says so instead of failing when it is pressed.
 */
export function canEncodeWebp() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Square crop, resize, and encode to WebP.
 *
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 * @throws when the browser cannot encode WebP, or when the result is still too
 *         large at the lowest quality. Both are refusals, not a silent
 *         upload of something the bucket will reject.
 */
export async function toAvatarWebp(file) {
  const bitmap = await createImageBitmap(file);

  // Centre crop to a square first, so the resize does not squash a portrait.
  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - edge) / 2;
  const sy = (bitmap.height - edge) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = EDGE;
  canvas.height = EDGE;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, EDGE, EDGE);
  bitmap.close();

  for (const quality of QUALITIES) {
    const blob = await encode(canvas, quality);

    if (!blob || blob.type !== 'image/webp') {
      // Every browser this site supports encodes WebP. If one does not, refuse
      // instead of silently uploading a PNG the bucket will reject anyway.
      throw new AvatarError('unsupported');
    }

    if (blob.size <= MAX_BYTES) return blob;
  }

  throw new AvatarError('too_large');
}

function encode(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/** A refusal this module made, with a code the page turns into a sentence. */
export class AvatarError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AvatarError';
    this.code = code;
  }
}
