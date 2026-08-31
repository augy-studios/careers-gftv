// Phase 12 part 3's visual pass. Four theme combinations over five surfaces.
//
//   node tests/capture-themes.mjs [output directory]
//
// **This is not a check and it never passes or fails.** Every other file in
// this directory answers a question; this one produces twenty images for a
// person to look at, and the person is the check. It exists because part 3's
// whole verification is arithmetic — `phase12-test.mjs --only=contrast` reads
// real computed colours off real elements and composites them down the
// ancestor chain — and arithmetic cannot tell you that a token which clears AA
// looks wrong.
//
// **It earned its place on the first run.** In hello light an unchecked switch
// draws its track from --surface-active, 70% brand yellow, and a checked one
// from --callout-ok-bg, a 14% green tint, so the *off* state is the louder of
// the two. Both clear 1.4.11 comfortably and no check reports it, because it is
// a hierarchy problem rather than a contrast one. Part 6 owns the fix.
//
// Two things make the captures trustworthy rather than decorative:
//
//   **The theme is set before first paint**, through the same localStorage keys
//   the pre-paint script in every <head> reads, so nothing is captured mid
//   theme transition. A custom property flips on the instant and body's
//   background eases over --transition, so a capture taken too early is one
//   mode's text on the other's background — which is what the contrast section
//   caught itself doing.
//
//   **The pages are served from the working tree with content in them.** An
//   empty board proves the chrome and nothing else, so /search is answered with
//   fixtures. Everything else 503s on purpose, the arrangement part 1 settled.
//
// The swatch sheet is the important plate. Both switch states, the three
// language pills, both stars and the four callout tones are a session and a
// database away on a real page, so they are rendered here from the same classes
// and the same containers the contrast section measures.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 12 part 7's status page, which is a function rather than a file and so
// has to be rendered here rather than read off disk. **Its service view is the
// plate this tool exists for**: five day states, four callout tones and a
// component list, in four theme combinations, and the whole of it is colour
// somebody has to look at.
import {
  VIEW,
  TARGET_KEYS,
  EXPECTED_PER_DAY,
  dayWindow,
  uptimeFor,
  headline,
  declaredIncidents,
  observedIncidents,
  renderServiceBody,
  renderBuildBody,
  statusDocument,
} from '../main-site/api/_lib/status.js';

process.env.SITE_URL ??= 'https://careers.globalfurry.tv';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', 'main-site');

// Gitignored, like zh-review.html: regenerated rather than committed, because
// twenty screenshots go stale the next time a colour token moves.
const OUT = process.argv[2] ?? join(HERE, '..', 'theme-shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const THEMES = [
  ['classic', 'light'],
  ['hello', 'light'],
  ['classic', 'dark'],
  ['hello', 'dark'],
];

const PAGES = [
  ['home', '/'],
  ['search', '/search'],
  ['login', '/login'],
  ['status', '/status'],
  // The page nobody can reach until the last phase ships. It is drawn from a
  // model with something wrong in it on purpose: a feature switched off with a
  // note, an incident that ended and one that has not, and forty five days
  // nothing measured, because a status page of a clean quarter shows none of
  // the states worth looking at.
  ['status-service', '/status?view=service'],
];

/** The four panels, with every state on them at once. */
function serviceModel(now = new Date('2026-08-31T12:00:00Z')) {
  const measured = dayWindow(now)
    .slice(45)
    .map((day, index) => ({
      day,
      // A short day near the start, so the partial state is on the plate too.
      checks: index === 2 ? 200 : EXPECTED_PER_DAY,
      failures: day.endsWith('15') ? 90 : day.endsWith('07') ? EXPECTED_PER_DAY : 0,
      duration_total_ms: (index === 2 ? 200 : EXPECTED_PER_DAY) * 240,
      slowest_ms: 1800,
      last_checked_at: `${day}T23:59:00Z`,
    }));

  const incidents = [
    {
      target: 'search',
      started_at: '2026-08-30T03:00:00Z',
      last_failed_at: '2026-08-30T03:02:00Z',
      ended_at: '2026-08-30T03:03:00Z',
      failures: 3,
      status_code: 502,
    },
  ];

  return {
    now,
    probeLastSeen: '2026-08-31T11:59:00Z',
    headline: headline({ lastSeen: '2026-08-31T11:59:00Z', incidents, off: ['apply'], now }),
    components: [
      { key: 'applicant_login', phase: 2, off: false, note: null, since: null, denied: true, reason: 'Locks everybody out.' },
      {
        key: 'apply',
        phase: 5,
        off: true,
        note: 'The form provider is not answering. We are watching it and will switch this back on as soon as it is.',
        since: '2026-08-31T09:00:00Z',
        denied: false,
        reason: null,
      },
      { key: 'saved_jobs', phase: 6, off: false, note: null, since: null, denied: false, reason: null },
    ],
    uptime: TARGET_KEYS.map((target) => ({ target, ...uptimeFor(measured, { now }) })),
    declared: declaredIncidents([
      { action: 'feature_disabled', created_at: '2026-08-20T10:00:00Z', metadata: { feature: 'apply', note: 'Forms are down.' } },
      { action: 'feature_enabled', created_at: '2026-08-20T12:30:00Z', metadata: { feature: 'apply' } },
    ]),
    observed: observedIncidents(incidents, { now }),
  };
}

/* The components the served pages cannot draw without a session and a
 * database: both switch states, the three language pills, both stars, and the
 * four callout tones side by side. Same classes, same containers as the real
 * markup, which is what the contrast section measures too. */
const SWATCH = `<!doctype html>
<html lang="en" data-color-theme="classic" data-mode="light" data-locale="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Part 3 swatch</title>
<link rel="stylesheet" href="/assets/css/theme.css">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
  body { padding: 1.5rem; }
  h2 { font-size: 1rem; margin: 1.5rem 0 .6rem; }
  h2:first-of-type { margin-top: 0; }
  .row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
  .bank { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0,1fr)); }
  .bank > div { padding: 1rem; border-radius: var(--radius); }
  .on-bg { background: var(--bg); }
  .on-alt { background: var(--bg-alt); }
  .tokens p { margin: 0; font-size: .9375rem; }
</style>
</head>
<body>
<h2>The four panel tones — on --bg, on a glass card, on --bg-alt</h2>
<div class="bank">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}">
    <div class="callout note" style="margin-bottom:.5rem"><p>Note. Its border is the measured exemption.</p></div>
    <div class="callout ok" style="margin-bottom:.5rem"><p>Ok</p></div>
    <div class="callout warn" style="margin-bottom:.5rem"><p>Warn</p></div>
    <div class="callout danger"><p>Danger</p></div>
  </div>`
    )
    .join('')}
</div>

<h2>The three language state pills, and the tab dots</h2>
<div class="bank">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}"><span class="admin-langs">
      <span class="admin-lang admin-lang-complete">EN</span>
      <span class="admin-lang admin-lang-in_progress">ZH</span>
      <span class="admin-lang admin-lang-absent">ZH</span>
    </span>
    <div class="row" style="margin-top:.75rem">
      <span class="lang-state lang-state-complete"></span>
      <span class="lang-state lang-state-in_progress"></span>
      <span class="lang-state lang-state-absent"></span>
    </div></div>`
    )
    .join('')}
</div>

<h2>Both switch states — the rule --border-control was added for</h2>
<div class="bank">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}"><div class="row">
      <label class="switch"><input type="checkbox"><span class="switch-track"></span><span class="switch-label">Off</span></label>
      <label class="switch"><input type="checkbox" checked><span class="switch-track"></span><span class="switch-label">On</span></label>
    </div></div>`
    )
    .join('')}
</div>

<h2>The star, empty and filled — the fill is the other measured exemption</h2>
<div class="bank">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}"><div class="star-row">
      ${[false, false, true, true, true]
        .map(
          (on) =>
            `<label class="star-label" data-on="${on}"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z"/></svg></label>`
        )
        .join('')}
    </div><p class="star-readout">Three stars out of five</p></div>`
    )
    .join('')}
</div>

<h2>Fills with a label on them &mdash; the shape nothing was measuring</h2>
<div class="bank">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}"><div class="row">
      <span class="admin-badge">6</span>
      <button class="btn btn-primary">Save</button>
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-danger">Delete</button>
    </div>
    <div class="row" style="margin-top:.75rem">
      <span class="chip">Remote</span>
      <span class="status-pill" data-status="shipped">Shipped</span>
      <span class="status-pill" data-status="building">Building</span>
      <span class="status-pill" data-status="planned">Planned</span>
    </div></div>`
    )
    .join('')}
</div>

<h2>The text tokens, and the link that changed</h2>
<div class="bank tokens">
  ${['on-bg', 'glass-card', 'on-alt']
    .map(
      (cls) => `<div class="${cls}">
    ${['text', 'text-muted', 'text-light', 'text-muted-strong', 'brand-text', 'ok', 'warn', 'danger']
      .map((t) => `<p style="color: var(--${t})">--${t}</p>`)
      .join('')}
    <p>Body copy with <a href="/faq">a link inside it</a> and <a href="/about" style="color: var(--link-visited)">a visited one</a>.</p>
  </div>`
    )
    .join('')}
</div>
</body></html>`;

const job = (i) => ({
  id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`,
  slug: `role-${i}`,
  title: i === 0 ? 'Volunteer Subtitle Reviewer and Terminology Coordinator' : `Volunteer Role ${i}`,
  summary: 'Review subtitles and terminology, keep wording consistent between episodes.',
  headline: '',
  department: { id: 'd1', name: 'Content Localisation and Subtitling', slug: 'content-localisation' },
  tags: [
    { id: 't1', name: 'Subtitling and terminology', slug: 'subtitling' },
    { id: 't2', name: 'Remote', slug: 'remote' },
  ],
  commitment: 'flexible',
  location_type: 'remote',
  location: null,
  closes_at: i === 1 ? null : '2026-12-01T00:00:00Z',
  published_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-20T00:00:00Z',
  has_translation: i !== 2,
  status: 'published',
});

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolve(pathname) {
  if (pathname === '/') return join(SITE, 'index.html');
  const bare = pathname.replace(/^\/|\/$/g, '');
  for (const c of [bare, `${bare}.html`, `${bare}/index.html`]) {
    const full = join(SITE, c);
    if (await isFile(full)) return full;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // No file behind it since part 7: one derivation decides which of its two
  // pages a reader gets, and the filesystem would have won over the rewrite.
  if (url.pathname === '/status') {
    const service = url.searchParams.get('view') === 'service';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(
      statusDocument({
        view: service ? VIEW.service : VIEW.build,
        body: service ? renderServiceBody(serviceModel()) : renderBuildBody(),
      })
    );
  }

  if (url.pathname === '/__swatch') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(SWATCH);
  }

  if (url.pathname.startsWith('/api/')) {
    const data =
      url.pathname === '/api/public/search'
        ? { jobs: [0, 1, 2, 3].map(job), total: 4, page: 1, per_page: 20, corrected: null, suggestion: null }
        : url.pathname === '/api/public/facets'
          ? {
              departments: [{ id: 'd1', name: 'Content Localisation and Subtitling', slug: 'content-localisation', count: 4 }],
              tags: [
                { id: 't1', name: 'Subtitling and terminology', slug: 'subtitling', count: 3 },
                { id: 't2', name: 'Remote', slug: 'remote', count: 4 },
              ],
              commitments: [{ value: 'flexible', count: 4 }],
              location_types: [{ value: 'remote', count: 4 }],
            }
          : null;
    if (data) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, data }));
    }
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('{"error":{"code":"UNAVAILABLE","message":"no fixture"}}');
  }

  const file = await resolve(url.pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(await readFile(file));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const shots = [];

for (const [theme, mode] of THEMES) {
  const ctx = await browser.newContext({
    baseURL: base,
    serviceWorkers: 'block',
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 1,
  });
  // Before first paint, the way the real pre-paint script reads it, so nothing
  // is captured mid theme transition.
  await ctx.addInitScript(
    ([t, m]) => {
      try {
        localStorage.setItem('gftv-careers.colorTheme', t);
        localStorage.setItem('gftv-careers.mode', m);
        localStorage.setItem('gftv-careers.locale', 'en');
      } catch {}
    },
    [theme, mode]
  );
  const page = await ctx.newPage();

  for (const [name, path] of [...PAGES, ['swatch', '/__swatch']]) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    if (path === '/__swatch') {
      await page.evaluate(
        ([t, m]) => {
          document.documentElement.dataset.colorTheme = t;
          document.documentElement.dataset.mode = m;
        },
        [theme, mode]
      );
    }
    await page.evaluate(() => document.querySelector('#applyDialog')?.close());
    await page.waitForTimeout(250);
    const file = `${name}-${theme}-${mode}.jpg`;
    const buf = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      // Full page for the swatch sheet, and for the service status page: its
      // whole subject is below the fold. Four bars of ninety squares, the five
      // day states and the two incident lists are the plate somebody is meant
      // to look at, and a viewport shot of it is a screenshot of a heading.
      fullPage: path === '/__swatch' || path.startsWith('/status?view=service'),
    });
    await writeFile(join(OUT, file), buf);
    shots.push({ name, theme, mode, file, bytes: buf.length });
    console.log(`${file}  ${(buf.length / 1024).toFixed(0)}kB`);
  }

  await ctx.close();
}

await browser.close();
server.close();
await writeFile(join(OUT, 'shots.json'), JSON.stringify(shots, null, 2));
console.log(`\n${shots.length} captures in ${OUT}`);
