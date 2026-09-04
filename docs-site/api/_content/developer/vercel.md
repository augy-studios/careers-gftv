---
title: Vercel
access: developer
order: 10
summary: Two projects on one repository, the settings for each, the generated copies, the headers, the cron, and how previews differ.
---

# Vercel

**Two projects, one repository.** Each has its own root directory, its own
environment variables and its own `vercel.json`.

| Project | Root directory | Domain | Build command |
|---|---|---|---|
| Portal | `main-site` | `careers.globalfurry.tv` | none |
| Documentation | `docs-site` | `docs.careers.globalfurry.tv` | `node scripts/build.js` |

Both are Framework preset **Other**, install command `npm install`, and Node 20
or later. The region is `sin1`, set in each `vercel.json` and not in a form.

**The portal serves its root directory as static files**, with no output
directory and no build. **The docs site serves `dist/`.** Its build command and
output directory are in `vercel.json`, so a fresh project needs nothing typed
into a form.

To point a domain at a project: add it in the project settings, then add the
CNAME Vercel gives you at the DNS provider. The certificate is issued once the
record resolves.

## The consequence that shapes the whole repository

**A Vercel project builds from its own root and cannot reach outside it.** So
`docs-site/api/` cannot import a single file from `main-site/api/_lib/`, and 5h
answers that by duplicating what the two share.

```sh
node gen-docs-lib.js          # write the docs site's copies
node gen-docs-lib.js --check  # fail when one is out of date
```

**A change to `main-site/api/_lib/` or `main-site/assets/js/` is half a
change.** Run the generator, or `--check` fails before the deploy does.

**Nothing generated is ever edited.** Every copy opens by saying so and naming
its source. A hand written file appearing in a generated directory fails the
check. One nobody declared, sitting beside a dozen generated ones, is how the
next person concludes the whole directory is theirs.

**The places the two sites genuinely differ are rules in the generator**, each
with its reason beside it. They are the session cookie, the session table, the
audit stamp, the variable list, and the relying party pair. **A rule whose text no
longer appears stops the run**, and never quietly drops the difference it was
there to keep.

## The environment variables

Each project reads only what is set on itself, so the docs project's four are
entered again there. Every one is documented in the `.env.example` beside it.

| Variable | Portal | Docs | Bot |
|---|---|---|---|
| `SUPABASE_URL` | Yes | Yes | Yes |
| `SUPABASE_SERVICE_KEY` | Yes | Yes | Yes |
| `SITE_URL` | Yes | Yes | Yes |
| `DOCS_URL` | | Yes | |
| `FORM_WEBHOOK_SECRET` | Yes | | |
| `CRON_SECRET` | Yes | | |
| `TELEGRAM_BOT_USERNAME` | Optional | | |

> [!WARNING]
> **On the docs project, `SITE_URL` is still the portal.** It is the WebAuthn
> relying party id, and pointing it at this site breaks every passkey registered
> on the portal. This site's own origin is `DOCS_URL`.

**`SITE_URL` being unset on the docs project is a real outage that no check in
this repository can see.** Two staff routes answered 500 for a phase while every
public check passed, because all of them ask as a stranger.

**Rotating `FORM_WEBHOOK_SECRET` is coordinated**, because it lives in two
places: the project settings and the Script Properties of every form's Apps
Script. Submissions arriving between the two steps are rejected. Rotating
`CRON_SECRET` needs no coordination.

## `vercel.json`

**Nothing in that file can carry a comment.** Vercel validates it against a
schema that rejects any property it does not know, at the root and inside a
rewrite as well. A `$comment` key fails the build. The reasoning lives in the
README beside it and in the module that depends on it.

Two headers matter more than the rest, and both sites carry them:

- **`sw.js` is served `Cache-Control: no-cache`**, with
  `Service-Worker-Allowed: /`. A stale worker pins an old build indefinitely.
- **`build-status.json` gets a short `s-maxage`**, so a phase flipping to
  shipped reaches people quickly.

**The docs site's `includeFiles` glob covers three directories**: both content
trees and `api/_generated/`. The public tree is included because the navigation
route reads the whole page list to draw a sidebar for a signed out reader too. A
function that cannot find it throws at the first request and names the entry.

**The build runs before the functions are packaged**, which is what carries
`api/_generated/` to them. That ordering is Vercel's and this build does not
control it.

## The rule that has caught this build out four times

**Vercel matches the filesystem before it consults rewrites.**

- There is no `main-site/robots.txt`, because a file of that name would win and
  the function would never run.
- There is no `main-site/status/index.html`, for the same reason.
- `/admin/:path*` sends everything to the placeholder, and every real page under
  `/admin` wins anyway.

**And a file based dynamic route binds nothing in a bare `api/` project.**
`api/content/[...page].js` never received a request on the deployment while
looking perfect locally. Every route in this repository is a plain function,
addressed explicitly.

> [!TIP]
> A route answering locally is not evidence that the platform routes it. Check
> it on a deployment. `node tests/phase13-test.mjs --only=live` asks the docs
> deployment everything a stranger can ask and needs no credential.

## The cron

`main-site/api/cron/daily.js`, scheduled by the `crons` entry in the portal's
`vercel.json` for 18:00 UTC, which is 02:00 in Singapore. Vercel fires within
roughly an hour, so nothing depends on the exact minute.

**It is authenticated by `Authorization: Bearer $CRON_SECRET` and nothing
else**, because the caller is a scheduler and there is no session. Vercel sends
nothing at all when the variable is unset. So the route refuses a request
carrying no secret, instead of assuming the scheduler sent it.

It closes postings past their closing date and gives up on apply prompts nobody
answered after fourteen days. It deletes expired rows, and checks each published
posting's form. **It never unpublishes anything**, and it is safe to run twice.

```bash
curl -sS -X POST https://careers.globalfurry.tv/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

**Where it reports is the admin overview**, from `gftvjobs_cron_runs`. Nobody
watches a cron, so a run that stops firing is otherwise silent.

## Previews

**A preview deployment is a different host**, so a passkey registered against
production does not work on one. Password plus an authenticator code still does.
Say that before somebody concludes previews are broken.

**There is one database behind every deployment.** A preview is not a sandbox:
seeding sample data on a preview puts it in production's board and sitemap.
