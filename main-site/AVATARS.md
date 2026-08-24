# Avatars

How an applicant's profile picture gets from their phone into Supabase Storage,
and how to set up the bucket it lands in.

**This changes a settled decision.** Section 10 item 1 of the specification
reads: "Applications and resumes: handled entirely in Google Forms. The portal
stores no files and builds no application form. No Supabase Storage, no
uploads." That was written about applications, but the sentence is broad, and
an avatar is the first file this portal will store. Everything below assumes
that change is deliberate. Applications and resumes stay in Google Forms
regardless: this is one small square image per account and nothing else.

`gftvjobs_users.avatar_url` has existed since migration `002` and is nullable.
Nothing writes it yet. The upload endpoint belongs to **phase 6**, with the
rest of the account settings page; the bucket can be created now.

---

## The constraint that shapes all of this

Section 2: *"The browser never talks to Supabase directly and never receives an
anon key, so there is no Supabase client bundled into the frontend at all."*

That rules out the usual Supabase pattern, where the browser uploads straight
to Storage with an anon key and RLS policies on `storage.objects` decide who
may write. There is no anon key to give it.

So the bytes go through us:

```
browser                     Vercel function                Supabase Storage
   |                              |                               |
   | resize + encode to WebP      |                               |
   |----- POST image/webp ------->|                               |
   |                              | validate magic bytes, size    |
   |                              |------ upload, service key --->|
   |                              |<----- public URL -------------|
   |                              | write gftvjobs_users.avatar_url
   |<---- { avatar_url } ---------|                               |
```

Two consequences worth knowing before you write any of it:

- **A Vercel serverless function accepts a request body of at most 4.5 MB.**
  The image has to fit in one request, so compressing in the browser is not a
  nicety, it is what makes the upload possible at all.
- **`readJson` in `api/_lib/respond.js` caps bodies at 64 KB.** That default is
  right for JSON and far too small for an image. Do not raise it globally. Read
  the raw body instead, as shown below.

---

## 1. Create the bucket

### In the dashboard

Supabase, Storage, **New bucket**.

| Field | Value | Why |
|---|---|---|
| Name | `gftvjobs-avatars` | Matches the `gftvjobs_` prefix every other object in this project uses, so it is obvious which app owns it in a shared project. |
| Public bucket | **on** | Avatars are shown beside applications in the admin dashboard and in the header. A private bucket means a signed URL per view, which expires, which breaks caching and the offline story in section 14 for no real gain: an avatar is not a secret. |
| File size limit | `262144` (256 KB) | A ceiling the storage layer enforces even if the endpoint has a bug. Post-compression avatars land around 20 to 60 KB. |
| Allowed MIME types | `image/webp` | Same reasoning. Nothing else can be stored here even by mistake. |

### Or in the SQL editor

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gftvjobs-avatars',
  'gftvjobs-avatars',
  true,
  262144,
  array['image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

### Policies: add none

`storage.objects` has row level security on by default, and this project adds
no policies to it, exactly as every `gftvjobs_` table has RLS on with no
policies. The service role bypasses RLS, so the function can write; nothing
holding an anon key can write anything. **Public bucket** means reads are
served without a key, which is the only thing that needs to be open.

If you find yourself writing a storage policy, stop: it means something is
trying to reach Storage without going through the API, and that is the thing
section 2 forbids.

### Confirm it

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'gftvjobs-avatars';

-- Should be zero. A policy here would mean something other than the service
-- role is expected to write, which is not the design.
select count(*) from pg_policies
where schemaname = 'storage' and tablename = 'objects';
```

---

## 2. Compress in the browser

Resize and re-encode before uploading. `canvas.toBlob` with `image/webp` does
both, and a 4 MB phone photo comes out around 30 KB.

```js
/**
 * Square crop, resize, and encode to WebP.
 *
 * Re-encoding through a canvas strips EXIF as a side effect, which is not a
 * side effect worth losing: phone photos carry GPS coordinates, and an avatar
 * upload should not publish where somebody lives.
 *
 * @param {File} file
 * @param {number} size the output edge, 512 is plenty for an avatar
 * @returns {Promise<Blob>}
 */
export async function toAvatarWebp(file, size = 512) {
  const bitmap = await createImageBitmap(file);

  // Centre crop to a square first, so the resize does not squash a portrait.
  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - edge) / 2;
  const sy = (bitmap.height - edge) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82)
  );

  if (!blob || blob.type !== 'image/webp') {
    // Every browser this site supports encodes WebP. If one does not, refuse
    // instead of silently uploading a PNG the bucket will reject anyway.
    throw new Error('this browser cannot produce WebP');
  }

  return blob;
}
```

Quality `0.82` is the knee of the curve for photographs: visibly identical to
`1.0` at avatar size and a fraction of the bytes. Check the result before
sending, and re-encode at a lower quality if it is somehow still large.

Feature detection, for the disabled control pattern in section 0c:

```js
export function canEncodeWebp() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}
```

---

## 3. The endpoint

`main-site/api/account/avatar.js`, phase 6. The shape, with the parts that
matter spelled out:

```js
// POST   /api/account/avatar   raw image/webp body
// DELETE /api/account/avatar   remove it

const BUCKET = 'gftvjobs-avatars';
const MAX_BYTES = 256 * 1024;

/** Read the raw body. Not readJson: that caps at 64 KB and expects JSON. */
async function readImage(req, res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      fail(res, ERR.PAYLOAD_TOO_LARGE, 'That image is too large.');
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * A WebP file starts with RIFF, then four bytes of length, then WEBP.
 *
 * Checked because the Content-Type header is whatever the client felt like
 * sending. The bucket's allowed_mime_types is a second line of defence, not
 * the first, and neither of them is a reason to skip this one.
 */
function isWebp(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}
```

Then, in order:

1. `requireApplicant`, and rate limit the route. Re-encoding is cheap but an
   unbounded upload endpoint is not.
2. Read the body, check the length, check the magic bytes. Reject anything
   else, including SVG, which is a script execution vector and is exactly what
   an attacker would try to slip past a naive content type check.
3. Upload to `{user_id}/{random}.webp`:

   ```js
   const path = `${session.user.id}/${randomToken(16)}.webp`;

   const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
     contentType: 'image/webp',
     // A year. The filename changes on every upload, so a stale cache is
     // impossible and there is nothing to revalidate.
     cacheControl: '31536000',
     upsert: false,
   });
   ```

   The random component is the point: the path changes on every upload, so the
   browser cache and every CDN in between update for free, and yesterday's URL
   does not silently serve today's picture.

4. Get the public URL, write it, and **delete the old object**:

   ```js
   const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

   const previous = session.user.avatar_url;

   await supabase.from(T.users).update({ avatar_url: pub.publicUrl })
     .eq('id', session.user.id);

   if (previous) await removeObject(previous);
   ```

   In that order. If the delete fails, the account still has a working avatar
   and one orphan; if the update fails after a delete, the account has a broken
   one. Orphans are cheap, broken avatars are not.

5. Write an audit row, per `api/_lib/audit.js`.

To turn a stored public URL back into an object path for deletion, split on
`/object/public/{BUCKET}/`. Store the path in the database instead if you would
rather not parse the URL back, but that means a second column.

---

## 4. Things that will otherwise be forgotten

- **Deleting an account must delete its objects.** The phase 6 danger zone
  cascades the applicant's rows; Storage is not part of that cascade and will
  quietly keep the picture forever. `supabase.storage.from(BUCKET).remove()`
  takes a list, and everything for one account is under `{user_id}/`.
- **`publicApplicant` already returns `avatar_url`**, so the moment the column
  is populated it appears in every session response. Nothing else needs
  changing to read it.
- **The offline story, section 14.** An avatar is a network image inside an
  installed app. Phase 10 decides whether it is precached, cached on use, or
  left to fail to a placeholder. Leave a placeholder that reads correctly when
  the image does not load, and set `alt` to the display name.
- **`is_active` false does not hide an avatar.** A deactivated account's
  picture stays publicly readable at its URL, because the bucket is public.
  That is the trade made in section 1 above. If it matters, the bucket has to
  be private and every view has to be a signed URL.
- **No image processing on the server.** Everything above is a length check and
  twelve bytes of magic number. Do not add a resize library to the function:
  the browser already did the work, and an image decoder in a request path is a
  large attack surface for a small convenience.

---

## Checklist

- [ ] Bucket `gftvjobs-avatars` exists, public, 256 KB limit, `image/webp` only
- [ ] Zero policies on `storage.objects`
- [ ] The browser encodes WebP before uploading and never sees a Supabase key
- [ ] The endpoint checks magic bytes, not the Content-Type header
- [ ] The path carries a random component, so caches update by themselves
- [ ] The previous object is deleted after the new URL is stored, not before
- [ ] Account deletion removes everything under `{user_id}/`
- [ ] A missing image degrades to a placeholder with the display name as `alt`
