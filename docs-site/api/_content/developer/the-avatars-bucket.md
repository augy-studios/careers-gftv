---
title: The avatars bucket
access: developer
order: 7
summary: The one file this portal stores, how it is configured, what may go in it, and how it is served.
---

# The avatars bucket

**One square image per applicant account, and nothing else.**
`main-site/AVATARS.md` is the guide, and it is described here so a reader needs
no second tab for the shape of it.

**It changes a settled decision, deliberately.** Section 10 item 1 of the
specification reads: no Supabase Storage, no uploads. That was written about
applications, and applications and resumes stay in Google Forms regardless. The
avatar is the recorded exception and the only one.

## The constraint that shapes all of it

**The browser never receives an anon key**, so there is no Supabase client in
the frontend at all. That rules out the usual pattern, where the browser uploads
straight to Storage and policies on `storage.objects` decide who may write.

So the bytes come through a function:

```text
browser                       Vercel function              Supabase Storage
  resize, crop, encode WebP
  POST image/webp        -->  check magic bytes, size
                              upload with the service key  -->
                              write gftvjobs_users.avatar_url
  { avatar_url }         <--
```

Two consequences, both of which decide the design:

- **A Vercel function takes a request body of at most 4.5 MB.** Compressing in
  the browser is what makes the upload possible, and not a nicety.
- **`readJson` caps bodies at 64 KB**, which is right for JSON and far too small
  for an image. `api/account/avatar.js` reads the raw body with its own cap. Do
  not raise that default globally.

## The bucket

**No migration creates it.** It has to exist before the endpoint works, and the
SQL is in section 1 of `AVATARS.md`.

| Field | Value |
|---|---|
| Name | `gftvjobs-avatars` |
| Public | Yes |
| File size limit | 256 KB |
| Allowed types | `image/webp` only |
| Policies on `storage.objects` | None |

**An account with no picture renders its initial instead**, which is the
ordinary case and not a failure. So a missing bucket looks exactly like nobody
having uploaded anything, until somebody tries.

## The three files

| File | What it does |
|---|---|
| `assets/js/avatar.js` | Square crop, resize and WebP encode, in the browser. |
| `api/account/avatar.js` | Takes the bytes, POST to set and DELETE to remove. |
| `api/_lib/avatars.js` | The Storage half: the bucket, the magic byte check, and the upload order. |

## Things that are otherwise forgotten

**Deleting an account must delete its objects.** The danger zone cascades the
applicant's rows, and Storage is not part of that cascade. Everything for one
account is under `{user_id}/`.

**The path carries a random component per upload**, so caches update by
themselves. A URL that differs from the one on the session means the picture has
changed.

**The previous object is deleted after the new URL is stored, and never
before.** A failure between the two leaves an orphan, which is cheap; the other
order leaves an account pointing at nothing.

**No image processing on the server.** The endpoint does a length check and
twelve bytes of magic number. Do not add a decoder to a request path for a
convenience the browser already provided.

**A deactivated account's picture stays readable at its URL**, because the
bucket is public. That is the trade the bucket makes. Changing it means a private
bucket and a signed URL for every view, including the dashboard's.

## Offline, and why the worker never touches it

**The applicant's own avatar is kept as a blob in IndexedDB**, keyed by their
user id. It is wiped with the rest of their data on sign out.

**The service worker never caches a Storage URL**, and does not intercept cross
origin requests at all. The reason is the dashboard: it renders other people's
faces, and a cache-on-use rule could not tell those from the reader's own.

> [!TIP]
> The placeholder is still required and still matters. Anybody signed out,
> anybody offline before their first load, and every avatar in the dashboard
> falls back to it. So it has to read correctly with the display name as its
> `alt`.
