---
title: Playwright
access: developer
order: 11
summary: The capture script, the manifest, how a shot is added and re-run, and the rules about seeded data and live credentials.
---

# Playwright

**Every screenshot on this site is captured with Playwright and never by
hand.** The rules below are 16g's, and they do not change.

Playwright is a dev dependency of the root `package.json`, which is why the
scripts that use it live at that level. The capture script for this site lives
in `docs-site/scripts/` with a configuration scoped to `docs-site`, so it never
becomes a dependency of the portal.

```sh
npm install
npx playwright install chromium
```

## The rules that will not change

- **On demand, against a local or seeded instance.** Never as part of the Vercel
  build, and never against production. Vercel cannot run a browser on a build
  anyway, and production holds real applicant data.
- **Every shot shows invented people applying to invented roles**, from the seed
  script. No real applicant, email or Telegram handle ever appears.
- **Never capture a live recovery code, backup code, login code, linking token
  or Google Form URL.** Where a page needs one illustrated, seed a fake value and
  say in the caption that it is an example.
- **Runs are deterministic.** Animations disabled, relative dates frozen or
  masked, and anything that changes between runs masked. A set that produces a
  diff on every capture stops being reviewable.
- **Desktop and phone, light and dark**, so the guides can show the hamburger
  navigation and the narrow layouts.

## Where a shot goes, and why the build enforces it

| The page | The file | Written as |
|---|---|---|
| Public | `docs-site/public/screenshots/` | an absolute path, `/screenshots/name.webp` |
| Gated | beside the page in `api/_content/<section>/` | a bare file name |

**A gated page's images stream through the same authenticated route the page
did.** A gated page with a public screenshot is a leak with extra steps, so both
directions are build failures. A picture in `content/` stops the build, and so
does a gated page pointing at a public image.

**An asset is gated at its section's level.** There is nowhere in a `.png` for
an `access` key. The section is what a reader had to pass to be told the image
exists.

**No SVG.** An SVG is a document that can carry script, served from this origin,
and what a gated asset is for is a screenshot. The types served are `.webp`,
`.png`, `.jpg`, `.jpeg` and `.gif`.

## The manifest

The capture run is driven by a manifest and never by arguments, so a shot is
reproducible by whoever comes next. Each entry names the page path, the
viewport, the theme and mode, and the element to wait for. It also names the
tier, any region to mask, and whether the capture is the full page or one
selector.

**Adding a shot is an entry in the manifest and a slot on the page.** Re-running
one is running the capture for that entry alone.

## Pending slots

Until a shot exists, the page carries a placeholder that reads as pending and
not as broken:

```text
![The overview](pending:admin-overview-desktop-light "The dashboard overview.")
```

It renders with the alt text and caption the real shot will have. **The name is
the file name it will be given**, built from the manifest entry, so a slot and
its future capture cannot disagree.

> [!TIP]
> A typo in a slot name is a shot nobody takes. The phase 14 checks compare the
> slot names in the guides against the naming shape and fail on a duplicate.

## Seeding, and the cost of it

`node seed.mjs` at the repository root writes the sample postings and two sample
accounts. One reads English and one reads Singapore Mandarin, so the Chinese
pages can be captured signed in. It prints their passwords once.

```sh
node seed.mjs                 # says what it would do, and writes nothing
node seed.mjs --yes           # does it
node seed.mjs --clear --yes   # removes it, and the phase 3 dev seed with it
```

> [!WARNING]
> **It refuses to write while the portal is open to search engines**, which it
> has been since phase 12 part 8. A capture run is therefore a deliberate
> `--anyway`, followed by clearing as soon as the shots are taken.

**There is one database behind every deployment**, so capturing against a
preview does not avoid this. The sitemap is cached an hour at the edge. A sample
posting seeded and cleared inside that hour can still have been handed to a
crawler. The window is the only thing under anybody's control, so keep it short.

**Clearing the seed invalidates two files that are not screenshots.** The
portal's two install screenshots in `manifest.json` are real captures of
`/search`, so run `node gen-screenshots.js` afterwards.

## The other capture scripts

Three scripts in `tests/` use Playwright for images and are not part of this
pipeline. They are described on [the test
scripts](/staff/developer/the-test-scripts) page, and you can download each one
from it.

| Script | What it produces |
|---|---|
| `capture-themes.mjs` | Twenty images, four theme combinations over five surfaces. |
| `screenshot.mjs` | The dashboard at one width, with the working tree's CSS served in place of the deployment's. |
| `layout-check.mjs` | Narrow width layout checks, for the rule that a table may scroll inside its own box and the page body may not. |

**`capture-themes.mjs` is not a check and never passes or fails.** It produces
images for a person to look at, and the person is the check. It exists because
contrast is arithmetic, and arithmetic cannot tell you that a token which clears
AA looks wrong.
