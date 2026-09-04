// THIS SITE'S OWN FILE. Not generated.
//
// 16g asks for "its own package.json and Playwright config scoped to docs-site
// so it never becomes a dependency of the portal build", and this is the second
// half of that. The first half is `scripts/package.json` beside it, which is
// what actually does the scoping: Vercel installs `docs-site/package.json` and
// never walks into a subdirectory, so `playwright` and `sharp` are reachable
// from a person's laptop and from nothing that deploys.
//
// **It is not a `@playwright/test` config, and calling it one would be a lie
// this file would rather avoid.** There is no test runner here. `capture.mjs`
// is a script that drives `chromium` directly, the way `gen-screenshots.js` has
// since phase 10, and it imports the values below. The name is 16g's word for
// the file and the shape is what this repository actually does.
//
// **Everything here exists to make two runs produce the same bytes.** 16g:
// "Make runs deterministic: disable animations and transitions, freeze or mask
// relative dates and any 'last updated' text, and mask anything that changes
// between runs. A screenshot set that produces a diff on every capture stops
// being reviewable." A set that rewrites 25 files on every run is a set nobody
// reads the diff of, and a picture nobody reviews is a picture that is wrong.

/**
 * Where the capture points, and it is deliberately not defaulted to production.
 *
 * `gen-screenshots.js` defaults to the live portal because an install screenshot
 * is of the public board and nothing else. This script signs in, opens the
 * dashboard, and photographs lists of applicants, so the address is something
 * the person running it has to type. `capture.mjs` refuses to start without it.
 */
export const BASE_ENV = 'BASE';

/**
 * The instant every shot is taken at.
 *
 * **Frozen and not masked**, which is the choice 16g leaves open and this build
 * takes for a reason: a masked date leaves a black bar in the middle of a column
 * a guide is explaining, and a frozen one leaves the real column reading the
 * same thing every run. Playwright's own clock is used rather than a hand
 * written `Date` shim, so a relative label computed in a worker or a timer gets
 * the same answer as one computed in the page.
 *
 * The value is a Monday morning in Singapore, which is when somebody would
 * actually be doing a weekly review, and it is in the past so that nothing in a
 * seeded posting reads as closing in negative days.
 */
export const CLOCK = '2026-09-07T09:30:00+08:00';

/**
 * The browser locale. `en-GB` for the same reason the portal's own formatting
 * is: this is a Singapore project and a screenshot showing 9/7/2026 would be
 * showing a date half its readers would read as July.
 */
export const LOCALE = 'en-GB';

/** Singapore, so a timestamp in a picture is the one a reader here would see. */
export const TIMEZONE = 'Asia/Singapore';

/**
 * Injected into every page before anything is captured.
 *
 * The portal holds one duration in `--transition`, per phase 12's polish pass,
 * so setting that token would cover the transitions and nothing else. This
 * covers the token, the animations, the smooth scrolling and the caret, because
 * the failure being avoided is a shot taken 20ms into a fade and there is no
 * benefit to being precise about which fade.
 */
export const STILL_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  :root { --transition: 0s !important; }
`;

/**
 * How long to wait for a shot's `waitFor` selector.
 *
 * Long, because the dashboard's lists are several queries deep and this runs
 * against a deployment over a real network. A capture that times out is a shot
 * missing from the set, and the script says which one and carries on rather than
 * abandoning the other 24.
 */
export const TIMEOUT_MS = 30000;

/**
 * What a masked region is filled with.
 *
 * **Set, because Playwright's default is `#FF00FF`.** Seventeen staff shots
 * carry at least one mask, and left alone every one of them would have a hot
 * magenta rectangle in the top right of an otherwise quiet interface. This is
 * `--surface-active` from `theme.css` in the classic light theme, flattened —
 * `rgba(235, 235, 235, 0.95)` over white — so a mask reads as a blank field
 * rather than as an error somebody forgot to fix.
 *
 * It is deliberately not `transparent` or the page background: a mask a reader
 * cannot see is a mask nobody reviews, and the point of one is that something
 * was withheld on purpose.
 *
 * **Every shot in the manifest is light mode**, so one value covers all of them.
 * A dark shot would want the dark theme's own, which is a decision to take when
 * the first one is asked for and not a default to inherit.
 */
export const MASK_COLOR = '#ebebeb';

/**
 * What webp quality the files are written at.
 *
 * 80 is the point where a screenshot of an interface stops losing hairlines. The
 * six public shots are precached by the docs service worker, so their size is a
 * download every reader makes; the nineteen gated ones are fetched through the
 * content route and are not.
 */
export const WEBP_QUALITY = 80;
