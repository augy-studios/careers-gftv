// Capture the install screenshots each site's manifest.json declares.
//
//   node gen-screenshots.js
//   node gen-screenshots.js main          one site only, or docs
//   BASE=https://careers-gftv-preview.vercel.app node gen-screenshots.js main
//   DOCS_BASE=http://localhost:3000 node gen-screenshots.js docs
//
// Writes install-narrow.png at 1080x2340 and install-wide.png at 1920x1080 into
// main-site/images/ and docs-site/public/images/, which are the exact sizes the
// two manifests claim. Chrome checks that claim and drops a screenshot whose
// real size does not match, silently.
//
// The portal's pair is of /search, because that is the one screen the app is
// for: the home page is mostly explanation and the account pages need a
// session, and a screenshot of somebody's account in an install dialog is not a
// screenshot this build wants to be able to take by accident. The docs site's
// pair is of its home page, which is the map of the guides and the page an
// installed copy opens on.
//
// **Both sites are photographed in the Hello theme, light mode**, settled
// 13 September 2026. The theme is two localStorage keys the pre-paint script in
// every head reads before the first colour block is evaluated, so they are
// written into the context before any page script runs and the picture never
// shows a classic frame that switched to yellow a moment later.
//
// **Every shot is rendered above 1x.** The wide one is a 1280x720 viewport at
// 1.5x and not a 1920x1080 viewport at 1x: same desktop layout, same output
// size, and the text is rendered with half again as many pixels, which is the
// difference between a heading an install dialog can show and a soft grey
// smear. The narrow one is captured at 360 CSS pixels with a device pixel ratio
// of 3, not at a 1080 pixel viewport. Those are different pictures: the first is
// what a phone shows, the second is a desktop layout shrunk into a tall window.
//
// It shoots the deployments rather than a local server because there is no
// local server in this repo — both sites are static files plus Vercel functions,
// and the functions are what fill the board and the docs' account row.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The two localStorage keys theme.js reads, with APP_KEY as both sites set it. */
const THEME_KEYS = {
  'gftv-careers.colorTheme': 'hello',
  'gftv-careers.mode': 'light',
};

/**
 * The portal holds one duration in `--transition` and the docs site inherits
 * it, so setting the token would cover the transitions and nothing else. This
 * covers the token, the animations and the caret, because the failure being
 * avoided is a shot taken 20ms into a fade and there is no benefit to being
 * precise about which fade.
 */
const STILL_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  :root { --transition: 0s !important; }
`;

/**
 * The two frames, shared by both sites. `scale` is the device pixel ratio, and
 * the output is `width * scale` by `height * scale`, which has to be the string
 * in the manifest.
 */
const FRAMES = [
  { file: 'install-narrow.png', viewport: { width: 360, height: 780 }, scale: 3 },
  { file: 'install-wide.png', viewport: { width: 1280, height: 720 }, scale: 1.5 },
];

const SITES = {
  main: {
    out: join(HERE, 'main-site', 'images'),
    base: process.env.BASE ?? 'https://careers.globalfurry.tv',
    path: '/search',
    // Not "a .job-card exists": the loading state draws four skeleton cards
    // carrying that same class, and waiting for one of those photographs a
    // board of grey bars under the words "Loading roles." The board drops
    // aria-busy when the real results land, so that is the thing to wait for,
    // and what lands is either cards or the empty state. Both are the board as
    // it stands: the 13 September 2026 capture was taken after the seed was
    // cleared and before the first real posting, and shows the empty state on
    // purpose rather than a seed the site's own switch refuses to write.
    ready: () => {
      const board = document.querySelector('#results');
      return Boolean(
        board &&
          !board.hasAttribute('aria-busy') &&
          (board.querySelector('.job-card:not([aria-hidden])') || board.querySelector('.empty-state'))
      );
    },
    // At 360 wide the whole viewport is heading, unpaid callout, and search
    // box, and the board itself is below the fold. An install screenshot of a
    // job board with no board in it is the wrong picture, so scroll the first
    // card into the middle of the frame. The empty state is one short card,
    // and centring it drags the footer into the bottom half of the picture, so
    // that one sits at the bottom edge with the search box and the quick
    // filters filling the frame above it. First match wins.
    narrowScrollTo: [
      ['#results .job-card', 'center'],
      ['#results .empty-state', 'end'],
    ],
  },
  docs: {
    out: join(HERE, 'docs-site', 'public', 'images'),
    base: process.env.DOCS_BASE ?? 'https://docs.careers.globalfurry.tv',
    path: '/',
    // The English home page is written into the shell at build time, so the
    // article is there on load; the sidebar and the account row are drawn by
    // shell.js once the dictionary has arrived, and a frame without the sidebar
    // is a frame of an article with no way to the next one.
    ready: () =>
      Boolean(
        document.querySelector('#docsArticle h1') &&
          !document.querySelector('#docsArticle .docs-loading') &&
          document.querySelector('#docsSidebar a')
      ),
    narrowScrollTo: null,
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SITES);
for (const name of names) {
  if (!SITES[name]) {
    console.error(`unknown site "${name}"; expected one of ${Object.keys(SITES).join(', ')}`);
    process.exit(1);
  }
}

const browser = await chromium.launch();

for (const name of names) {
  const site = SITES[name];
  await mkdir(site.out, { recursive: true });

  for (const frame of FRAMES) {
    const context = await browser.newContext({
      baseURL: site.base,
      viewport: frame.viewport,
      deviceScaleFactor: frame.scale,
      locale: 'en-GB',
      timezoneId: 'Asia/Singapore',
      colorScheme: 'light',
    });

    // Before any script on the page: the pre-paint script in <head> reads these
    // and sets data-color-theme and data-mode on <html> before first paint.
    await context.addInitScript((keys) => {
      for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value);
    }, THEME_KEYS);

    const page = await context.newPage();
    await page.goto(site.path, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: STILL_CSS });

    await page.waitForFunction(site.ready, null, { timeout: 30000 });

    // The webfont, so a frame is not of the fallback face a moment before the
    // swap. Sharp text was the point of rendering above 1x.
    await page.evaluate(() => document.fonts.ready);

    if (frame.file === 'install-narrow.png' && site.narrowScrollTo) {
      await page.evaluate((targets) => {
        for (const [selector, block] of targets) {
          const found = document.querySelector(selector);
          if (found) {
            found.scrollIntoView({ block });
            return;
          }
        }
      }, site.narrowScrollTo);
    }

    // The phase notice is dismissible and is part of the portal as it stands,
    // so it stays in the picture. An install dialog showing a screenshot
    // without it would be showing a site that does not exist yet.
    await page.waitForTimeout(400);

    const file = join(site.out, frame.file);
    await page.screenshot({ path: file });

    const { width, height } = frame.viewport;
    console.log(
      `${name.padEnd(5)} ${frame.file.padEnd(20)} ${width * frame.scale}x${height * frame.scale}` +
        `  (${width}x${height} at ${frame.scale}x)`
    );

    await context.close();
  }
}

await browser.close();
