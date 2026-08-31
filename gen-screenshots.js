// Capture the two install screenshots manifest.json declares.
//
//   node gen-screenshots.js
//   BASE=https://careers-gftv-preview.vercel.app node gen-screenshots.js
//
// Writes main-site/images/install-narrow.png at 1080x2340 and
// install-wide.png at 1920x1080, which are the exact sizes the manifest
// claims. Chrome checks that claim and drops a screenshot whose real size does
// not match, silently.
//
// Both are of /search, because that is the one screen this app is for: the
// home page is mostly explanation and the account pages need a session, and a
// screenshot of somebody's account in an install dialog is not a screenshot
// this build wants to be able to take by accident.
//
// The narrow one is captured at 360 CSS pixels with a device pixel ratio of 3,
// not at a 1080 pixel viewport. Those are different pictures: the first is what
// a phone shows, the second is a desktop layout shrunk into a tall window.
//
// It shoots the deployment rather than a local server because there is no local
// server in this repo — the site is static files plus Vercel functions, and the
// functions are what fill the board.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'main-site', 'images');
const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';

const SHOTS = [
  {
    file: 'install-narrow.png',
    path: '/search',
    viewport: { width: 360, height: 780 },
    scale: 3,
    // At 360 wide the whole viewport is heading, unpaid callout, and search
    // box, and the board itself is below the fold. An install screenshot of a
    // job board with no jobs in it is the wrong picture, so scroll the first
    // card into the middle of the frame.
    scrollToBoard: true,
  },
  {
    file: 'install-wide.png',
    path: '/search',
    viewport: { width: 1920, height: 1080 },
    scale: 1,
    scrollToBoard: false,
  },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

for (const shot of SHOTS) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: shot.viewport,
    deviceScaleFactor: shot.scale,
    locale: 'en-GB',
    // The board is the point of the picture, so wait for cards rather than for
    // the page. A screenshot taken on load is a screenshot of a skeleton.
    colorScheme: 'light',
  });
  const page = await context.newPage();

  await page.goto(shot.path, { waitUntil: 'domcontentloaded' });

  // Not "a .job-card exists": the loading state draws four skeleton cards
  // carrying that same class, and waiting for one of those photographs a board
  // of grey bars under the words "Loading roles." The board drops aria-busy
  // when the real results land, so that is the thing to wait for.
  await page.waitForFunction(
    () => {
      const board = document.querySelector('#results');
      return board && !board.hasAttribute('aria-busy') &&
        board.querySelector('.job-card:not([aria-hidden])');
    },
    null,
    { timeout: 20000 }
  );

  if (shot.scrollToBoard) {
    await page.evaluate(() => {
      document
        .querySelector('#results .job-card')
        ?.scrollIntoView({ block: 'center' });
    });
  }

  // The phase notice is dismissible and is part of the site as it stands, so it
  // stays in the picture. An install dialog showing a screenshot without it
  // would be showing a site that does not exist yet.
  await page.waitForTimeout(400);

  const file = join(OUT, shot.file);
  await page.screenshot({ path: file });

  const { width, height } = shot.viewport;
  console.log(
    `${shot.file.padEnd(20)} ${width * shot.scale}x${height * shot.scale}` +
      `  (${width}x${height} at ${shot.scale}x)`
  );

  await context.close();
}

await browser.close();
