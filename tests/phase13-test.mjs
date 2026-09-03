// Phase 13 verification run, from next-steps.md section 2.
//
//   node tests/phase13-test.mjs                  everything that can run
//   node tests/phase13-test.mjs --only=index     one or more sections
//   DOCS_BASE=https://... node tests/phase13-test.mjs --only=live
//
// **Every section but `live` needs no deployment, no credentials and no
// network**, like phase 10's and for a related reason: what phase 13 part 5
// builds is a build, and a build is wrong before it is deployed or it is not
// wrong at all. Phase 9's lesson is kept as well — nothing reads a credential
// above a section, so `--only=` cannot be defeated by a `requireEnv` at module
// level.
//
// **`live` is the section this phase most needed and did not have.** Parts 3 and
// 4 shipped a content route that answered 404 to every request on the deployment
// and looked perfect against a local stand in for two parts. It needs no
// credential either — everything it asks, it asks as a stranger — so there is no
// reason not to run it.
//
// It is the phase's file and not part 5's, so parts 6 and 7 add sections to it.
// What is here is part 5: the two pipelines, the split search index, the gated
// images, and the refusals the build makes.
//
// **It writes two fixtures into the gated content tree and removes them again.**
// There is no other way to prove a gated image end to end while every page in
// both trees is still a placeholder: the thing under test is a file beside a
// page and the route that serves it. Both paths are checked for absence first,
// so a run can never overwrite something somebody wrote, and the finally at the
// foot removes them and rebuilds whatever the run replaced.
//
// The sections, and what each one is about:
//
//   build      what the build wrote, and what it deliberately did not
//   index      the split search index, which is the check 16e asks for by name
//   render     the marks part 5 added to the renderer
//   refusals   every way the build says no, each one fired on purpose
//   shell      a browser over the built output and a stand in for the routes
//   live       the same questions, asked of the deployment

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, extname, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', 'docs-site');
const DIST = join(DOCS, 'dist');
const GENERATED = join(DOCS, 'api/_generated');

const ONLY = (() => {
  const arg = process.argv.find((value) => value.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();

/* -------------------------------------------------------------------------
 * Reporting. Phase 8's habits, kept.
 * ---------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const skips = [];
let currentSection = '';

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  failures.push({ section: currentSection, name, detail });
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
}

function skip(name, why) {
  skipped += 1;
  skips.push({ section: currentSection, name, why });
  console.log(`  – ${name}`);
  console.log(`      ${why}`);
}

function section(title) {
  currentSection = title;
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------------------
 * The build, and the fixtures
 * ---------------------------------------------------------------------- */

/** Run the build. Never throws: its exit code and output are the subject. */
function build() {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, ['scripts/build.js'], {
        cwd: DOCS,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (cause) {
    return { code: cause.status ?? 1, out: `${cause.stdout ?? ''}${cause.stderr ?? ''}` };
  }
}

// A 1x1 png. Small enough to sit in a source file, real enough that a browser
// reports a natural width for it, which is how the gated image check tells a
// picture that loaded from an <img> that merely exists.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const FIXTURE_IMAGE = join(DOCS, 'api/_content/admin/example.png');
const FIXTURE_PAGE = join(DOCS, 'api/_content/admin/example-shot.md');
const FIXTURE_PATH = '/staff/admin/example-shot';

function writeFixtures() {
  for (const file of [FIXTURE_IMAGE, FIXTURE_PAGE]) {
    if (existsSync(file)) {
      console.error(`${file} already exists. This run writes and deletes it, so it stops here.`);
      process.exit(1);
    }
  }

  writeFileSync(FIXTURE_IMAGE, PNG);
  writeFileSync(
    FIXTURE_PAGE,
    [
      '---',
      'title: An example shot',
      'access: admin',
      'order: 9',
      'summary: A page with a picture on it.',
      '---',
      '',
      '# An example shot',
      '',
      'A picture that only an admin may fetch.',
      '',
      '![The overview](example.png "The overview, with seeded data.")',
      '',
      '## Waiting for a capture',
      '',
      '![The applications table](pending:admin-applications "Coming with the capture run.")',
      '',
    ].join('\n')
  );
}

const clearFixtures = () => {
  for (const file of [FIXTURE_IMAGE, FIXTURE_PAGE]) rmSync(file, { force: true });
};

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/* -------------------------------------------------------------------------
 * The modules under test, imported once
 * ---------------------------------------------------------------------- */

const pagesModule = await import('../docs-site/api/_lib/pages.js');
const generatedModule = await import('../docs-site/api/_lib/generated.js');
const markdown = await import('../docs-site/assets/js/markdown.js');

const {
  loadPages,
  readablePage,
  readableAsset,
  pagePathFromSegments,
  assetPathFromSegments,
  frontMatter,
  navFor,
} = pagesModule;
const { gatedIndexFor, updatedFor } = generatedModule;
const { render } = markdown;

/**
 * Every .js file under a directory. Phase 13 part 6 uses it for two rules that
 * are about the whole of both projects instead of about one file: which files
 * write gftvhello_users, and which columns they write.
 */
function walkJs(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js')) out.push(path);
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

/* -------------------------------------------------------------------------
 * The stand in server, and the browser it is opened in
 *
 * **Part 7 would have been the third and fourth copy of this**, so it is one
 * function instead. The static half of every server in this file is the same
 * three lines and always was: the filesystem, then the rewrite, in that order,
 * which is Vercel's own and is the reason the built pages take over from the
 * shell without anything being switched.
 * ---------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

/** Answer from `dist/`, falling through to the shell the way the rewrite does. */
function serveFromDist(res, pathname) {
  const candidates = [
    join(DIST, pathname.slice(1)),
    join(DIST, `${pathname.slice(1)}.html`),
    join(DIST, 'shell.html'),
  ];
  const file = candidates.find((candidate) => existsSync(candidate) && extname(candidate) !== '');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

/** Listen on a free port, and answer with the address to open. */
async function listen(server) {
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * The settings payload every panel of 5f is drawn from.
 *
 * **Everything in it is a fixture**, and the awkward ones are the point: a
 * count that could not be read, a session on each site, a passkey registered on
 * the other one. Hoisted to here in part 7 because the responsive and
 * accessibility passes measure `/account`, and a second copy of this would be a
 * second thing to keep in step with the module it is a fixture for.
 */
const ACCOUNT_FIXTURE = Object.freeze({
  site: 'docs',
  profile: { username: 'staffer', display_name: 'A Staffer', email: 'a@example.invalid', available: true },
  passkeys: [
    {
      id: 'p1',
      label: 'Laptop',
      registered_on: 'portal',
      last_used_at: '2026-09-01T02:00:00.000Z',
      created_at: '2026-08-01T02:00:00.000Z',
    },
  ],
  relying_party: 'careers.globalfurry.tv',
  totp_enabled: true,
  // **The awkward one.** The recovery count could not be read; the backup set
  // genuinely has none left. Drawing both as "0 left" is the defect this
  // fixture exists to catch.
  codes: { recovery: null, backup: 0 },
  codes_low: { recovery: false, backup: false },
  low_code_threshold: 3,
  codes_per_set: 10,
  devices: [{ id: 'd1', label: null, last_used_at: '2026-09-01T02:00:00.000Z', expires_at: null }],
  sessions: [
    { id: 's1', site: 'docs', created_at: '2026-09-02T01:00:00.000Z', expires_at: '2026-09-03T01:00:00.000Z', current: true },
    { id: 's2', site: 'portal', created_at: '2026-09-01T01:00:00.000Z', expires_at: '2026-09-30T01:00:00.000Z', current: false },
  ],
  sessions_failed: false,
  password_min_length: 10,
  // The state this ships in. The panels are what the page draws while the three
  // writes that reach gftv.asia are switched off.
  hello_writes_enabled: false,
});

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

define('build', 'What the build wrote, and what it did not', async () => {
  const { pages } = loadPages({ fresh: true });
  const publicPages = [...pages.values()].filter((page) => page.pipeline === 'public');
  const gatedPages = [...pages.values()].filter((page) => page.pipeline === 'gated');

  check(
    '1. one static file per public page',
    publicPages.every((page) =>
      existsSync(join(DIST, page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`))
    ),
    `${publicPages.length} public pages`
  );

  check(
    '2. no gated page is in the output',
    gatedPages.every((page) => !existsSync(join(DIST, `${page.path.slice(1)}.html`))),
    'a gated page in the static root is the leak the two pipelines exist to prevent'
  );

  const distFiles = walk(DIST);
  check('3. no markdown in the output', !distFiles.some((file) => file.endsWith('.md')));
  check('4. neither content tree is in the output', !existsSync(join(DIST, 'content')) && !existsSync(join(DIST, 'api')));
  check('5. the shell is in the output, for the gated addresses', existsSync(join(DIST, 'shell.html')));
  check('6. the assets are in the output', existsSync(join(DIST, 'assets/js/shell.js')));
  check(
    '7. what the functions read is outside the output',
    existsSync(join(GENERATED, 'updated.json')) && !existsSync(join(DIST, 'api/_generated')),
    'api/_generated is carried by includeFiles and is never a URL'
  );

  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  check('8. a built page is marked prerendered', home.includes('id="docsArticle" data-prerendered'));
  check('9. a built page carries its own title', /<title>[^<]*\|[^<]*<\/title>/.test(home));
  check('10. and no data-i18n on it to overwrite it', !/<title data-i18n/.test(home));
  check('11. a built page carries no front matter', !home.includes('access: public'));

  const block = /<script type="application\/json" id="docsPageData">([\s\S]*?)<\/script>/.exec(home);
  const data = block ? JSON.parse(block[1]) : null;
  check('12. the data block parses and names the page', data?.page?.path === '/');
  check(
    '13. the data block carries no build machine path',
    data !== null && data.page.file === undefined,
    'page.file is an absolute path on whoever ran the build'
  );
  check('14. the data block carries a date', /^\d{4}-\d{2}-\d{2}$/.test(data?.updated ?? ''));
});

define('index', 'The split search index, and the dates', async () => {
  const { pages } = loadPages({ fresh: true });
  const publicPages = [...pages.values()].filter((page) => page.pipeline === 'public');

  const publicIndex = JSON.parse(readFileSync(join(DIST, 'search-index.json'), 'utf8'));
  const publicText = JSON.stringify(publicIndex);

  check(
    '15. the public index holds every public page',
    publicIndex.length === publicPages.length,
    `${publicIndex.length} of ${publicPages.length}`
  );
  check('16. the public index holds no gated path', !publicText.includes('/staff'));

  // Not the titles. The public home page names the staff documentation on
  // purpose, per 16a's one exception to the silence, so "Staff documentation"
  // appears in the public index correctly. What must never appear is a sentence
  // out of a gated page.
  //
  // **A shared opening is not a leak, and phase 14 part 5 is where that stopped
  // being theoretical.** Twenty poster pages quote the same interface strings
  // the public guides quote -- "Will be available in Phase 5", "Temporarily
  // unavailable while we fix something" -- and one of them opens with the same
  // sentence about the site being released in phases. Three prefixes then
  // appeared in both indexes, and none of them came from a gated page.
  //
  // So a hit is traced instead of counted: find the public entry carrying it,
  // and read that entry's own source file. If the words are in the file the
  // entry was built from, the public index is reporting a public page. A leak
  // is a public entry carrying words its own source does not have, which is
  // what this now fails on.
  // The index holds a block's words with the marks taken out, so the source is
  // read the same way before the two are compared. Without this, a page that
  // bolds the sentence it quotes reads as a page that never said it.
  const plain = (text) =>
    text
      .replace(/[*_`#|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const sourceOf = new Map(
    publicPages.map((page) => [page.path, plain(readFileSync(page.file, 'utf8'))])
  );
  const gatedSentences = gatedIndexFor('developer')
    .flatMap((entry) => entry.blocks.map((entry) => entry.text))
    .filter((text) => text.length >= 30)
    .map((text) => text.slice(0, 30));
  const leaked = gatedSentences.filter((text) => {
    const carriers = publicIndex.filter((entry) => JSON.stringify(entry).includes(text));
    if (carriers.length === 0) return false;
    return carriers.some((entry) => !(sourceOf.get(entry.path) ?? '').includes(text));
  });
  check(
    '17. the public index holds no sentence from a gated page',
    gatedSentences.length > 0 && leaked.length === 0,
    `${gatedSentences.length} gated sentences compared, ${leaked.length} in a public entry ` +
      `whose own page does not say it: ${leaked.join(' | ')}`
  );

  const poster = gatedIndexFor('poster');
  const developer = gatedIndexFor('developer');
  check('18. a signed out reader gets nothing from the gated index', gatedIndexFor('public').length === 0);
  check('19. a poster gets gated pages only', poster.every((entry) => entry.path.startsWith('/staff')));
  check('20. a poster cannot see a developer page', !JSON.stringify(poster).includes('/staff/developer'));
  check('21. a developer gets more than a poster', developer.length > poster.length);
  check(
    '22. the gated index holds no public page',
    !developer.some((entry) => !entry.path.startsWith('/staff'))
  );
  check(
    '23. a result can name the heading it matched and its anchor',
    developer.some((entry) => entry.blocks.some((block) => block.id && block.heading)),
    '16e: show the matching heading in the result, and jump straight to the anchor'
  );

  const committed = [...pages.values()].filter((page) => page.path !== FIXTURE_PATH);
  const dated = committed.filter((page) => /^\d{4}-\d{2}-\d{2}$/.test(updatedFor(page.path) ?? ''));

  if (dated.length === 0) {
    skip(
      '24. every committed page has a date',
      'git dated nothing, so this is a clone with no history rather than a defect'
    );
  } else {
    check(
      '24. every committed page has a date',
      dated.length === committed.length,
      `${dated.length} of ${committed.length}`
    );
  }

  check(
    '25. a page git cannot date carries none',
    updatedFor(FIXTURE_PATH) === null,
    'a gap is data: no date, and never the day the deploy happened'
  );
});

define('render', 'The marks part 5 added to the renderer', async () => {
  const figure = render('![A shot](example.png "The caption.")', {
    assetBase: '/api/content?path=/staff/admin',
  }).html;
  check(
    '26. a bare file name resolves against the page it is on',
    figure.includes('src="/api/content?path=/staff/admin/example.png"')
  );
  check('27. an image in a block of its own is a figure', figure.includes('<figcaption>The caption.</figcaption>'));

  const pending = render('![The overview](pending:overview "Soon.")').html;
  check('28. a pending image is a slot and not an image', pending.includes('docs-pending') && !pending.includes('<img'));
  check('29. a pending slot carries the alt text the shot will have', pending.includes('The overview'));

  const inline = render('Text with ![a shot](/screenshots/x.webp) in it.').html;
  check('30. an image inside a sentence stays an image', inline.startsWith('<p>') && inline.includes('<img'));
  check('31. an absolute src is left as it was written', inline.includes('src="/screenshots/x.webp"'));
  check('32. an unsafe src renders as text', !render('![x](javascript:alert(1))').html.includes('javascript:'));

  const { headings, outline } = render('# One\n\ntext\n\n## Two\n\nmore\n\n### Three');
  check('33. the contents leave the h1 out', headings.length === 2 && headings[0].text === 'Two');
  check('34. the outline keeps it, in document order', outline.length === 3 && outline[0].text === 'One');
  check(
    '35. every outline entry has the id its heading was given',
    outline.every((entry) => typeof entry.id === 'string' && entry.id !== ''),
    'the build splits a page by these, so a wrong id is a search result pointing nowhere'
  );
});

define('refusals', 'Every way the build says no', async () => {
  let number = 36;
  const fire = (what, file, body, expected) => {
    try {
      writeFileSync(file, body);
      const result = build();
      check(
        `${number}. ${what}`,
        result.code !== 0 && result.out.includes(expected),
        result.out.split('\n').slice(0, 2).join(' ')
      );
    } finally {
      rmSync(file, { force: true });
      number += 1;
    }
  };

  fire(
    'a page with no access key stops the build',
    join(DOCS, 'content/portal/zz-test-nameless.md'),
    '---\ntitle: No key\n---\n\n# No key\n',
    'no access key'
  );
  fire(
    'a page whose access is misspelled',
    join(DOCS, 'content/portal/zz-test-typo.md'),
    '---\ntitle: Typo\naccess: pubic\n---\n\n# Typo\n',
    'which is not one of'
  );
  fire(
    'a gated page pointing at a public image',
    join(DOCS, 'api/_content/admin/zz-test-leaky.md'),
    '---\ntitle: Leaky\naccess: admin\n---\n\n# Leaky\n\n![x](/screenshots/x.webp)\n',
    'address outside this page'
  );
  fire(
    'a gated page pointing at a file that is not there',
    join(DOCS, 'api/_content/admin/zz-test-missing.md'),
    '---\ntitle: Missing\naccess: admin\n---\n\n# Missing\n\n![x](nowhere.png)\n',
    'not a file beside it'
  );
  fire(
    'a public page with a bare image name',
    join(DOCS, 'content/portal/zz-test-bare.md'),
    '---\ntitle: Bare\naccess: public\n---\n\n# Bare\n\n![x](shot.webp)\n',
    'has no directory'
  );
  fire(
    'a picture dropped into the public tree',
    join(DOCS, 'content/portal/zz-test-stray.png'),
    PNG,
    'not a page'
  );
  fire(
    'an asset of a type this site does not serve',
    join(DOCS, 'api/_content/admin/zz-test-notes.txt'),
    'hello',
    'is not something this site serves'
  );
  fire(
    'an asset outside every section',
    join(DOCS, 'api/_content/zz-test-loose.png'),
    PNG,
    'sits in a section directory'
  );

  // The one file that is none of the above: a page embeds it and nothing else
  // can reach it. Decision 6 puts the developer guide's test-scripts.json here,
  // and part 5's asset rule would have refused it as an unrecognised file.
  const dataFile = join(DOCS, 'api/_content/developer/zz-test-data.json');
  try {
    writeFileSync(dataFile, '{"scripts":[]}');
    const result = build();
    check(`${number}. a data file in the gated tree is allowed`, result.code === 0, result.out);
    number += 1;
    check(
      `${number}. and has no address of its own`,
      readableAsset('/staff/developer/zz-test-data.json', 'developer') === null,
      'the only supported way to that content is the page explaining what it does'
    );
    number += 1;
  } finally {
    rmSync(dataFile, { force: true });
  }

  const clean = build();
  check(`${number}. the build is clean again once they are gone`, clean.code === 0, clean.out);
});

define('shell', 'The shell, over the built output and the three routes', async () => {
  // The three routes, over the real modules. **The tier arrives in a header,
  // which is this file standing in for a session and nothing else**: on the site
  // it comes from reader.js, out of a session row, and never from anything a
  // client sent. Serving it this way is what lets every check here run with no
  // database and no credential.
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const tier = req.headers['x-tier'] ?? 'public';
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/nav') {
      return json({
        ok: true,
        data: {
          reader: {
            signed_in: tier !== 'public',
            username: tier === 'public' ? null : 'staffer',
            role: tier === 'developer' ? 'admin' : tier === 'public' ? null : 'job poster',
            tier,
          },
          nav: navFor(tier),
        },
      });
    }

    if (url.pathname === '/api/search-index') {
      return json({ ok: true, data: { entries: gatedIndexFor(tier) } });
    }

    // **The platform's own 404, for the shape that does not exist.** Part 3
    // wrote this route as `api/content/[...page].js` and part 5 found, against
    // the deployment, that a bare `api/` project on Vercel binds nothing from a
    // file based dynamic route and does not match more than one segment at all.
    // The stand in server it had been proved against read the segments itself,
    // which is how a route that answered nothing on production looked perfect
    // here. So this one refuses the path shape outright: **a harness that is
    // more capable than the platform is a harness that hides this class of
    // defect**, and this is the class phase 3 has now been bitten by four times.
    if (url.pathname.startsWith('/api/content/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('The page could not be found. NOT_FOUND');
    }

    if (url.pathname === '/api/content') {
      const segments = (url.searchParams.get('path') ?? '').split('/').filter(Boolean);

      const assetPath = assetPathFromSegments(segments);
      if (assetPath !== null) {
        const asset = readableAsset(assetPath, tier);
        if (!asset) return json({ ok: false, error: { code: 'not_found' } }, 404);
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'private, max-age=300' });
        return res.end(readFileSync(asset.file));
      }

      const path = segments.length === 0 ? '/' : pagePathFromSegments(segments);
      const found = path === null ? null : readablePage(path, tier);
      if (!found) return json({ ok: false, error: { code: 'not_found' } }, 404);

      return json({
        ok: true,
        data: {
          page: found.page,
          prev: found.prev,
          next: found.next,
          asset_base: found.assetBase,
          updated: updatedFor(found.page.path),
          markdown: frontMatter(readFileSync(found.file, 'utf8'))?.body ?? '',
        },
      });
    }

    return serveFromDist(res, url.pathname);
  });

  const base = await listen(server);
  console.log(`      serving the built site at ${base}`);

  const browser = await chromium.launch();

  const open = async (path, tier, viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: tier === 'public' ? {} : { 'x-tier': tier },
    });
    const page = await context.newPage();
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    return { context, page };
  };

  try {
    {
      const { context, page } = await open('/portal/creating-an-account', 'public');
      check('47. a built page renders its article', (await page.locator('#docsArticle h1').count()) === 1);
      check('48. and its breadcrumbs', (await page.locator('#docsBreadcrumbs a').count()) > 0);
      check('49. and its pager', await page.locator('#docsPager a').first().isVisible());
      check(
        '50. and when it was last updated',
        /Last updated \d+ \w+ \d{4}/.test((await page.locator('#docsUpdated').textContent()) ?? ''),
        (await page.locator('#docsUpdated').textContent()) ?? ''
      );
      check('51. its tab title carries the site name', (await page.title()).includes('Careers@GFTV docs'));
      check(
        '52. and it fetched no content route to do any of it',
        !(await page.evaluate(() =>
          performance.getEntriesByType('resource').some((entry) => entry.name.includes('/api/content'))
        )),
        'a static page that still fetches its own body is not a static page'
      );
      await context.close();
    }

    {
      const { context, page } = await open('/', 'public');
      await page.fill('#docsSearch', 'telegram');
      await page.waitForSelector('.docs-result');
      check('53. search finds a public page', (await page.locator('.docs-result').count()) > 0);
      check('54. and marks the words it matched', (await page.locator('.docs-result mark').count()) > 0);

      await page.fill('#docsSearch', 'developer');
      await page.waitForTimeout(150);
      const hits = (await page.locator('.docs-result').allTextContents()).join(' ').toLowerCase();
      check(
        '55. a signed out reader cannot find a developer page',
        !hits.includes('developer guide'),
        '16e: a public reader must not be able to find a developer page heading in search'
      );

      await page.fill('#docsSearch', 'portal');
      await page.waitForSelector('.docs-result');
      await page.keyboard.press('ArrowDown');
      check(
        '56. the first arrow down takes the first result',
        (await page.locator('#docsSearch').getAttribute('aria-activedescendant')) === 'docs-result-0'
      );
      await page.keyboard.press('ArrowUp');
      check(
        '57. arrow up from there wraps to the last',
        (await page.locator('#docsSearch').getAttribute('aria-activedescendant')) ===
          `docs-result-${(await page.locator('.docs-result').count()) - 1}`
      );
      await page.keyboard.press('Escape');
      check('58. escape shuts the panel', await page.locator('#docsSearchResults').isHidden());

      await page.fill('#docsSearch', 'portal');
      await page.waitForSelector('.docs-result');
      await page.locator('.docs-result').first().click();
      await page.waitForLoadState('networkidle');
      check('59. a result goes to its page', new URL(page.url()).pathname.startsWith('/portal'));
      await context.close();
    }

    {
      const { context, page } = await open('/', 'developer');
      await page.fill('#docsSearch', 'developer');
      await page.waitForSelector('.docs-result');
      const hits = (await page.locator('.docs-result').allTextContents()).join(' ').toLowerCase();
      check('60. an admin does find the developer guide', hits.includes('developer'));
      await context.close();
    }

    {
      const { context, page } = await open(FIXTURE_PATH, 'developer');
      check('61. a gated page renders in the same shell', (await page.locator('#docsArticle h1').count()) === 1);
      check('62. its image is drawn', (await page.locator('.docs-figure img').count()) === 1);
      check(
        '63. through the authenticated route, addressed the way the platform routes',
        ((await page.locator('.docs-figure img').first().getAttribute('src')) ?? '').startsWith(
          '/api/content?path=/staff/admin/'
        ),
        'a path shaped address here is the defect part 5 found on the deployment'
      );
      check(
        '64. and it loads',
        await page.locator('.docs-figure img').first().evaluate((img) => img.naturalWidth > 0)
      );
      check('65. a shot not yet captured is a slot', (await page.locator('.docs-pending').count()) === 1);
      check(
        '66. a page git cannot date shows no date',
        await page.locator('#docsUpdated').isHidden(),
        'the fixture is written by this run and never committed'
      );

      const admin = await page.evaluate(async () => {
        const response = await fetch('/api/content?path=/staff/admin/example.png');
        return { status: response.status, cache: response.headers.get('cache-control') };
      });
      check('67. an admin may fetch the image', admin.status === 200);
      check(
        '68. and it never enters a shared cache',
        (admin.cache ?? '').includes('private'),
        `Cache-Control: ${admin.cache}`
      );

      await page.goto(`${base}/staff/developer/start-here`, { waitUntil: 'networkidle' });
      check(
        '69. a committed gated page shows when it was last updated',
        /Last updated \d+ \w+ \d{4}/.test((await page.locator('#docsUpdated').textContent()) ?? ''),
        (await page.locator('#docsUpdated').textContent()) ?? ''
      );
      check(
        '70. and draws its breadcrumbs and pager from the same functions',
        (await page.locator('#docsBreadcrumbs a').count()) > 0 &&
          (await page.locator('#docsPager a').count()) > 0
      );
      await context.close();
    }

    {
      const { context, page } = await open('/', 'public');
      const status = await page.evaluate(async () => {
        const response = await fetch('/api/content?path=/staff/admin/example.png');
        return response.status;
      });
      check(
        '71. a signed out reader gets 404 for that image',
        status === 404,
        'the same answer a file nobody wrote gets'
      );

      // The shape the platform never routed. It is checked here so that going
      // back to it is a failing check rather than a silent 404 on production.
      const asPath = await page.evaluate(async () => {
        const response = await fetch('/api/content/staff/admin/example.png');
        return response.status;
      });
      check('72. and the path shaped address answers nothing to anybody', asPath === 404);
      await context.close();
    }

    let number = 73;
    for (const width of [375, 1440]) {
      const { context, page } = await open('/', 'public', { width, height: 900 });
      await page.fill('#docsSearch', 'portal');
      await page.waitForSelector('.docs-result');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      check(`${number}. no sideways scroll at ${width}px with results open`, overflow <= 0, `${overflow}px`);
      number += 1;

      const inside = await page
        .locator('#docsSearchResults')
        .evaluate((panel) => panel.getBoundingClientRect().right <= window.innerWidth + 1);
      check(`${number}. the results panel stays on screen at ${width}px`, inside);
      number += 1;

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

define('account', "5f's settings suite, and the two pages with no article", async () => {
  const REPO = resolve(DOCS, '..');

  /* ---- What no browser is needed for -------------------------------- */

  // **Section 2's rule, made checkable.** It permits this project to write the
  // challenge, trusted device and backup code rows the login flow owns, and
  // names two exceptions on gftvhello_users itself: password_hash per 5g, and
  // totp_secret per phase 13 decision 7. Both live in one file so that a third
  // is a diff somebody reviews, and this is what says so: any other file
  // updating that table is a rule broken silently.
  const writers = [];
  for (const site of ['main-site', 'docs-site']) {
    for (const file of walkJs(join(REPO, site, 'api'))) {
      const src = readFileSync(file, 'utf8');
      // .from(T.staffUsers) followed by .update or .insert or .delete, on the
      // same statement. Reads are everywhere and are permitted.
      if (/\.from\(T\.staffUsers\)[\s\S]{0,200}?\.(update|insert|delete)\(/.test(src)) {
        writers.push(relative(REPO, file).split(sep).join('/'));
      }
    }
  }

  check(
    '77. exactly two files write gftvhello_users, and both are staff-account.js',
    writers.length === 2 && writers.every((file) => file.endsWith('api/_lib/staff-account.js')),
    `wrote: ${writers.join(', ') || 'nothing'}`
  );

  const staffAccountLib = readFileSync(join(REPO, 'main-site/api/_lib/staff-account.js'), 'utf8');
  const updated = [...staffAccountLib.matchAll(/\.update\(\{\s*([a-z_]+)/g)].map((m) => m[1]);

  check(
    '78. and the only columns it writes are the two section 2 names',
    updated.length === 2 &&
      updated.includes('password_hash') &&
      updated.includes('totp_secret'),
    `wrote: ${updated.join(', ')}`
  );

  // **The hold, and both of its halves.** The three things that reach gftv.asia
  // are deployed and switched off until each has been run once against a real
  // account, per the answer settled 2 September 2026. It is a constant and not
  // a maintenance switch because `featureOverrides` records only what an admin
  // has turned off and ignores any feature whose phase has not shipped, so a
  // switch would have been inert now and on at the moment part 7 ships the
  // phase. `INDEXING` is the precedent, and so is the shape of its check: the
  // two halves are asserted against each other, so lifting it in one place and
  // not the other cannot ship quietly.
  const held = staffAccountLib.includes('export const HELLO_WRITES_ENABLED = false;');

  const guarded = ['account.js', 'totp.js', 'danger.js', 'forgot-password.js', 'reset-password.js']
    .filter((name) =>
      readFileSync(join(REPO, 'main-site/api/auth/staff', name), 'utf8').includes('held(res)')
    );

  check(
    '79. every route that writes gftvhello_users is behind the hold',
    guarded.length === 5,
    `guarded: ${guarded.join(', ')}`
  );

  check(
    '80. and the two writers refuse on their own as well',
    staffAccountLib.split('if (!HELLO_WRITES_ENABLED) return false;').length - 1 === 2,
    'a route added later without the guard has to fail closed'
  );

  const accountPage = readFileSync(join(REPO, 'main-site/assets/js/staff-account.js'), 'utf8');

  check(
    `81. the hold is ${held ? 'on' : 'OFF'}, and the page draws it either way`,
    accountPage.includes('hello_writes_enabled') && accountPage.includes('heldNote()'),
    'lifting it is one line in staff-account.js and part 7 is where that happens'
  );

  // 5g's flow is refused at its first step and not at its last, which is the
  // one placement decision in the hold that costs somebody something if it is
  // wrong: this endpoint verifies a recovery code and reset-password spends it.
  const forgot = readFileSync(join(REPO, 'main-site/api/auth/staff/forgot-password.js'), 'utf8');

  check(
    '82. and 5g is held before a recovery code is ever verified',
    forgot.indexOf('held(res)') < forgot.indexOf('verifyCode('),
    'refusing at the end would take a code off somebody already locked out'
  );

  // **The two lists that have to agree**, and phase 12's habit of comparing a
  // list against the thing it is a list of. The route refuses an action that is
  // not in ACTIONS; the page draws a button per entry in DANGER. A button with
  // no route behind it is a danger zone that does nothing, and a route with no
  // button is an action nobody can reach.
  const dangerRoute = readFileSync(join(REPO, 'main-site/api/auth/staff/danger.js'), 'utf8');
  const dangerPage = accountPage;

  const routeActions = [
    ...dangerRoute.slice(dangerRoute.indexOf('const ACTIONS')).matchAll(/'([a-z_]+)',/g),
  ]
    .map((m) => m[1])
    .slice(0, 6);
  const pageActions = [...dangerPage.matchAll(/\{ action: '([a-z_]+)', reaches:/g)].map((m) => m[1]);

  check(
    '83. the danger zone route and the page agree on all six actions',
    routeActions.length === 6 &&
      pageActions.length === 6 &&
      routeActions.every((action) => pageActions.includes(action)),
    `route: ${routeActions.join(', ')} / page: ${pageActions.join(', ')}`
  );

  // 5f: "There is no delete account." It is a sentence on the page and an
  // action nowhere, and this is the half a later edit is most likely to undo.
  check(
    '84. and none of them deletes the account',
    !routeActions.some((action) => action.includes('delete')) &&
      dangerRoute.includes('There is no delete account'),
    'the gftvhello account is not this project’s to delete'
  );

  // **The adapter, checked rather than trusted.** Decision 8 settled that the
  // two sites differ by a stylesheet: the module writes the portal's class
  // names and docs.css defines the same names in this site's language. A class
  // the docs stylesheets have never heard of is a panel that renders unstyled
  // on one site and nowhere says so.
  const classes = new Set();
  for (const file of ['staff-account.js', 'staff-forgot-password.js']) {
    const src = readFileSync(join(REPO, 'main-site/assets/js', file), 'utf8');
    for (const m of src.matchAll(/class="([^"$`]+)"/g)) {
      for (const name of m[1].split(/\s+/)) if (name) classes.add(name);
    }
  }

  const docsCss =
    readFileSync(join(DOCS, 'assets/css/docs.css'), 'utf8') +
    readFileSync(join(DOCS, 'assets/css/theme.css'), 'utf8');

  const undefined_ = [...classes].filter(
    (name) => !new RegExp(`\\.${name.replace(/-/g, '\\-')}(?![\\w-])`).test(docsCss)
  );

  check(
    '85. every class the shared page writes is defined on the docs site',
    undefined_.length === 0,
    `undefined here: ${undefined_.join(', ')}`
  );

  // 5g's two sets, in both realms, over four distinct tables. 5c and 5g both
  // turn on them never being interchangeable, and two of the four belong to
  // gftv.asia, so a mapping that collapsed any pair would be a code from one
  // set satisfying the other's check.
  const setsFile = readFileSync(join(REPO, 'main-site/api/_lib/accounts.js'), 'utf8');
  const tables = [...setsFile.matchAll(/table: (T\.[a-zA-Z]+),/g)].map((m) => m[1]);

  check(
    '86. the two code sets are four distinct tables across the two realms',
    tables.length === 4 && new Set(tables).size === 4,
    tables.join(', ')
  );

  /* ---- The pages, in a browser -------------------------------------- */

  // The stand in for the settings endpoints. Everything it answers is
  // ACCOUNT_FIXTURE, whose awkward corners are the point of this section.
  const account = ACCOUNT_FIXTURE;

  let signedIn = true;

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/nav') {
      return json({
        ok: true,
        data: {
          reader: signedIn
            ? { signed_in: true, username: 'staffer', role: 'admin', tier: 'developer' }
            : { signed_in: false, username: null, role: null, tier: 'public' },
          nav: { home: '/', staff_home: null, sections: [] },
        },
      });
    }

    if (url.pathname === '/api/auth/staff/session') {
      return signedIn
        ? json({ ok: true, data: { user: { id: 'u1', username: 'staffer' } } })
        : json({ ok: false, error: { code: 'unauthorised' } }, 401);
    }

    if (url.pathname === '/api/auth/staff/account') {
      return signedIn
        ? json({ ok: true, data: account })
        : json({ ok: false, error: { code: 'unauthorised' } }, 401);
    }

    if (url.pathname === '/api/search-index') return json({ ok: true, data: { entries: [] } });

    return serveFromDist(res, url.pathname);
  });

  const base = await listen(server);

  const browser = await chromium.launch();

  const open = async (path) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    return { context, page };
  };

  try {
    const { context, page } = await open('/account');

    check(
      '87. /account draws the settings suite inside the documentation shell',
      (await page.locator('#staffAccount .card').count()) >= 9 &&
        (await page.locator('.docs-sidebar').count()) === 1,
      '16d: the two pages with no article render inside the same shell'
    );

    const text = await page.locator('#staffAccount').innerText();

    check(
      '88. the password panel says the change reaches gftv.asia',
      /gftv\.asia/.test(text) && /one account/i.test(text),
      '5g requires that sentence in those words'
    );

    // The fixture's whole reason for existing.
    const recovery = await page.locator('[data-count-for="recovery"]').innerText();
    const backup = await page.locator('[data-count-for="backup"]').innerText();

    check(
      '89. a count that could not be read is drawn as unknown, not as zero',
      /could not be read/i.test(recovery) && /0/.test(backup),
      `recovery: ${recovery} / backup: ${backup}`
    );

    check(
      '90. a passkey says which site it was registered from',
      /jobs portal/i.test(text),
      '5f, and migration 039 is what makes it answerable'
    );

    check(
      '91. the trusted device list says it is the account’s and not this site’s',
      /including any trusted on the other/i.test(text) &&
        /earned per site/i.test(text),
      'deviation 125, and both halves or neither'
    );

    check(
      '92. the sessions panel labels both sites and marks this browser',
      /Documentation site/.test(text) && /Jobs portal/.test(text) && /This browser/.test(text),
      '5f: where the account is signed in, on both sites'
    );

    check(
      '93. and says plainly that it cannot name a device',
      /nothing about the device/i.test(text),
      'decision 10: what a row can say is what migration 038 put in it'
    );

    check(
      '94. the danger zone shows the five that are not held, and no delete account',
      (await page.locator('[data-danger]').count()) === 5 &&
        /no delete account/i.test(text) &&
        /switched off until it has been checked/i.test(text),
      '5f names six; remove_totp writes gftvhello_users and is held, and the panel says so where its button was'
    );

    await context.close();
  } finally {
    // Nothing here shares state with the rest of the file, so a failure above
    // must still put the browser and the server down.
  }

  {
    // **A signed in reader never sees the form**, which is the first thing the
    // module does and is worth its own check: arriving here signed in usually
    // means a stale tab, and drawing a sign in form to somebody who is already
    // signed in is how they end up typing a password they did not need to.
    const { context: signedInContext, page: signedInPage } = await open('/login');
    await signedInPage.waitForURL((url) => new URL(url).pathname === '/', { timeout: 5000 }).catch(() => {});

    check(
      '95. a signed in reader at /login is sent on rather than shown the form',
      new URL(signedInPage.url()).pathname === '/',
      `landed on ${signedInPage.url()}`
    );

    await signedInContext.close();
  }

  signedIn = false;

  {
    const { context, page } = await open('/login');
    const text = await page.locator('#docsLogin').innerText();

    check(
      '96. /login draws the sign in form in the same shell',
      (await page.locator('#docsUsername').count()) === 1 &&
        (await page.locator('.docs-sidebar').count()) === 1,
      '16b, and the header has linked here since part 4'
    );

    check(
      '97. "trust this device" is not on the password panel',
      (await page.locator('#docsTrustDevice').count()) === 0 &&
        (await page.locator('#docsStaySignedIn').count()) === 1,
      '5d: only offer it once the second factor has been satisfied'
    );

    check(
      '98. and the form links to the reset flow',
      /forgotten your password/i.test(text),
      '5g, and a recovery flow nobody can find is one nobody uses'
    );

    await context.close();
  }

  {
    const { context, page } = await open('/forgot-password');
    const text = await page.locator('#staffForgotPassword').innerText();

    check(
      '99. /forgot-password asks for a username and a recovery code',
      (await page.locator('#staffResetUsername').count()) === 1 &&
        (await page.locator('#staffResetCode').count()) === 1,
      "5g's flow mirrors 5c step for step"
    );

    check(
      '100. and says on its first panel that the reset reaches gftv.asia',
      /gftv\.asia/.test(text),
      'somebody who reads it at step 3 has already spent a recovery code'
    );

    check(
      '101. and that a recovery code is not a backup code',
      /not a two step backup code/i.test(text),
      '5g: a code lying in a chat log must not be able to do both'
    );

    await context.close();
  }

  {
    // **A signed out reader is sent to sign in, and never shown a page drawn
    // from nothing.** The module redirects before it draws, which is the same
    // ordering both dashboards got wrong in phase 10.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
    await page.waitForURL(/\/login$/, { timeout: 5000 }).catch(() => {});

    check(
      '102. a signed out reader at /account is sent to sign in',
      new URL(page.url()).pathname === '/login',
      `landed on ${page.url()}`
    );

    await context.close();
    signedIn = true;
  }

  await browser.close();
  await new Promise((resolve_) => server.close(resolve_));
});

define('live', 'The same questions, asked of the deployment', async () => {
  // Read here and not at the top of the file, which is phase 9's rule: a value
  // a section flag is supposed to make optional has to be read after the flag.
  const BASE = (process.env.DOCS_BASE ?? 'https://docs.careers.globalfurry.tv').replace(/\/+$/, '');
  console.log(`      asking ${BASE}`);

  const get = async (path) => {
    const response = await fetch(`${BASE}${path}`, { redirect: 'follow' });
    return { status: response.status, headers: response.headers, body: await response.text() };
  };

  try {
    await fetch(BASE, { method: 'HEAD' });
  } catch (cause) {
    skip('the deployment', `${BASE} could not be reached: ${cause?.message ?? cause}`);
    return;
  }

  const home = await get('/');
  check(
    '103. the home page is a file the build wrote',
    home.status === 200 && home.body.includes('data-prerendered'),
    `${home.status}, prerendered=${home.body.includes('data-prerendered')}`
  );
  check(
    '104. and it carries its own title, not the shell\'s',
    /<title>Careers@GFTV documentation \|/.test(home.body),
    (/<title>([^<]*)/.exec(home.body) ?? [])[1] ?? ''
  );

  const page = await get('/portal/creating-an-account');
  check(
    '105. so does a page two levels down',
    page.status === 200 && page.body.includes('data-prerendered') && page.body.includes('docsPageData')
  );

  // **The output directory is the whole public surface.** Before the build
  // existed, this address served the file as text/markdown: a second address for
  // every public page, and the shape that would have served a gated one if the
  // trees had ever been arranged differently.
  const raw = await get('/content/portal/index.md');
  check(
    '106. the content tree is not served as markdown',
    !(raw.headers.get('content-type') ?? '').includes('markdown'),
    `Content-Type: ${raw.headers.get('content-type')}`
  );

  const index = await get('/search-index.json');
  let entries = [];
  try {
    entries = JSON.parse(index.body);
  } catch {
    entries = [];
  }
  check('107. the public search index is served', index.status === 200 && entries.length > 0);
  check(
    '108. and holds nothing from the staff half',
    !index.body.includes('/staff'),
    '16e, on the deployment this time'
  );

  const byParameter = await get('/api/content?path=/portal');
  check(
    '109. the content route answers a page',
    byParameter.status === 200 && byParameter.body.includes('"path":"/portal"'),
    `${byParameter.status}: ${byParameter.body.slice(0, 80)}`
  );

  // **The shape that never worked.** From part 3 until part 5 this was how the
  // route was addressed, and every request to it answered 404 while the local
  // stand in served it perfectly. It is checked here so that going back to it is
  // a failing check and not a silent outage.
  const byPath = await get('/api/content/portal');
  check('110. and the path shaped address answers nothing', byPath.status === 404);

  const homeRoute = await get('/api/content?path=');
  check(
    '111. the home page needs no alias',
    homeRoute.status === 200 && homeRoute.body.includes('"path":"/"'),
    'part 4 aliased it as /api/content/index, which cleanUrls redirected away'
  );

  const gated = await get('/api/content?path=/staff');
  check('112. a gated page is 404 to a stranger, and never 401', gated.status === 404);
  check(
    '113. the content route is never cached anywhere shared',
    (byParameter.headers.get('cache-control') ?? '').includes('no-store'),
    `Cache-Control: ${byParameter.headers.get('cache-control')}`
  );

  // **This is the ordering assumption, and it is the whole reason to run this
  // section.** The date comes from api/_generated/updated.json, which the build
  // command wrote and which only reaches the function if Vercel packages the
  // functions afterwards. A date here is that, proven.
  let updated = null;
  try {
    updated = JSON.parse(byParameter.body).data.updated;
  } catch {
    updated = null;
  }
  check(
    '114. what the build wrote reached the functions',
    /^\d{4}-\d{2}-\d{2}$/.test(updated ?? ''),
    `updated: ${JSON.stringify(updated)} — includeFiles covers api/_generated, and the build ran first`
  );

  const search = await get('/api/search-index');
  check(
    '115. the gated index endpoint answers a stranger with an empty list',
    search.status === 200 && search.body.includes('"entries":[]'),
    'a 401 would confirm the size of what they cannot see'
  );

  const nav = await get('/api/nav');
  check(
    '116. and the sidebar names no staff page to a stranger',
    nav.status === 200 && !nav.body.includes('/staff'),
    `${nav.status}`
  );

  // One browser over the real thing, because the checks above are all text. What
  // it adds is the client against the live index: search is the only part of
  // this phase whose data arrives as a second request the page makes itself.
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const live = await context.newPage();
    await live.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    check('117. the live home page draws its article', (await live.locator('#docsArticle h1').count()) === 1);
    check('118. and its sidebar', (await live.locator('#docsSidebar a').count()) > 0);
    check(
      '119. and when it was last updated',
      /Last updated \d+ \w+ \d{4}/.test((await live.locator('#docsUpdated').textContent()) ?? ''),
      (await live.locator('#docsUpdated').textContent()) ?? ''
    );

    await live.fill('#docsSearch', 'telegram');
    await live.waitForSelector('.docs-result', { timeout: 15000 });
    check('120. and search answers over the live index', (await live.locator('.docs-result').count()) > 0);

    await live.goto(`${BASE}/staff/developer/start-here`, { waitUntil: 'networkidle' });
    check(
      '121. a gated page reads as "there is no page here" to a stranger',
      (await live.locator('.docs-state').count()) === 1,
      'the same words a page nobody wrote gets'
    );
    check(
      '122. and it asks a crawler not to index that',
      (await live.locator('meta[name="robots"]').count()) === 1
    );

    await context.close();

    /* ---- Part 6, on the deployment ---------------------------------- */

    // **Everything here was an afternoon of curl before it was a section**, the
    // same way part 5's twenty checks were, and for the same reason: three new
    // addresses and eleven new modules reached the docs site through a catch-all
    // rewrite and a build that has to copy them into dist/. A stranger can ask
    // all of it, so there is no reason not to.
    for (const [number, path] of [
      ['123', '/login'],
      ['124', '/account'],
      ['125', '/forgot-password'],
    ]) {
      const page = await get(path);
      check(
        `${number}. ${path} is served, and by the shell`,
        page.status === 200 && page.body.includes('docsArticle'),
        `16d: the pages with no article render inside the same shell. Got ${page.status}`
      );
    }

    // The eight generated modules and the two this site owns. A page that is
    // served and whose module the build did not copy is a blank content column
    // and an error only the console sees, which is exactly what part 6's own
    // breadcrumbs defect looked like.
    const modules = [
      'docs-login.js',
      'staff-account.js',
      'staff-forgot-password.js',
      'api.js',
      'danger-confirm.js',
      'recovery-codes.js',
      'icons.js',
      'format.js',
      'run-action.js',
      'passkeys.js',
    ];

    const missing = [];
    for (const name of modules) {
      const asset = await get(`/assets/js/${name}`);
      if (asset.status !== 200 || asset.body.length === 0) missing.push(name);
    }

    check(
      '126. and every module those three pages import is in the output',
      missing.length === 0,
      `missing from dist/: ${missing.join(', ')}`
    );

    const post = async (path, body) => {
      const response = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // A non JSON body is itself the finding, and the status carries it.
      }
      return { status: response.status, error: parsed?.error ?? null };
    };

    // **The hold, asked of the deployment, in whichever state the tree says.**
    // Until 3 September 2026 these two asserted 503 and `held`: the one thing
    // about part 6 a stranger could prove end to end, and worth proving, because
    // a constant meant to ship false that shipped true would be three credential
    // paths live and unwalked with nothing else to say so.
    //
    // **The lift made the assertion the wrong way round rather than unnecessary.**
    // The deployment can now disagree with the tree in the other direction — a
    // push that did not land, or one project deployed and not the other, which
    // happened during item 24's walk and had the portal answering `held` while
    // the docs site answered normally. So the expectation is read from the same
    // constant check 166 reads, and these two ask the deployment to agree with
    // it.
    const heldInTree = /HELLO_WRITES_ENABLED\s*=\s*false/.test(
      readFileSync(join(DOCS, 'api/_lib/staff-account.js'), 'utf8')
    );
    const isHeld = (answer) => answer.status === 503 && answer.error?.details?.reason === 'held';

    const forgot = await post('/api/auth/staff/forgot-password', { username: 'x', code: 'y' });
    check(
      `127. 5g on the deployment is ${heldInTree ? 'held, before any code is verified' : 'live, as the tree says'}`,
      isHeld(forgot) === heldInTree,
      `got ${forgot.status} / ${forgot.error?.details?.reason ?? 'no reason'} — the tree says ${
        heldInTree ? 'held' : 'lifted'
      }`
    );

    const reset = await post('/api/auth/staff/reset-password', { ticket: 'x' });
    check(
      '128. and the half that writes the password agrees with it',
      isHeld(reset) === heldInTree,
      `got ${reset.status} / ${reset.error?.details?.reason ?? 'no reason'} — the tree says ${
        heldInTree ? 'held' : 'lifted'
      }`
    );

    // **The order of the two guards, which is not arbitrary.** requireStaff runs
    // before held() on the settings routes, so a stranger is told to sign in and
    // never told which features are switched off. A held route answering 503 to
    // somebody with no session would be this site describing its own internals
    // to anybody who asked.
    const account = await post('/api/auth/staff/account', {});
    check(
      '129. a stranger is refused before the hold is ever mentioned',
      account.status === 401,
      `got ${account.status}: a signed out caller must not learn what is held`
    );

  } finally {
    await browser.close();
  }
});

/* =========================================================================
 * Part 7. The pass deviation 118 handed over, and the seam.
 *
 * **The numbering stops here on purpose.** Everything above is numbered so a
 * check can be cited by number, and next-steps.md does cite them. The two
 * sweeps below report once per page per language, so their count moves the day
 * somebody adds a page — numbering them would renumber the file every time the
 * site grows. They carry the page and the language in the label instead, which
 * is what phase 12's own sweeps do. `contrast` and `seam` are a fixed list and
 * number on from 129.
 * ====================================================================== */

// Section 3 of the specification: "no horizontal scrolling at any width down to
// 320px". The same six phase 12 measured the portal at.
const DOCS_WIDTHS = [320, 375, 414, 768, 1024, 1440];

// 375 is where the sidebar is a panel behind the hamburger and 1024 is where
// all three columns are on screen. As far as this sweep is concerned they are
// two different documents.
const DOCS_A11Y_WIDTHS = [375, 1024];

// **Both languages, because part 6a made this site bilingual.** Decision 17
// landed zh.json in phase 13 instead of 14, so a one language pass over this
// site would now be a pass over half of it — and 华文 sets its own font stack
// and does not wrap where English does, which is most of why the second pass
// exists at all.
const DOCS_LOCALES = ['en', 'zh'];

// A table cell narrower than this is what makes a heading break after its first
// letter. Inherited from phase 12, which found it by looking.
const DOCS_CELL_FLOOR = 88;

const DOCS_SCROLL_SLACK = 1;

// The same list shell.js uses to decide what the sidebar panel's focus trap
// contains.
const DOCS_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The whole site, as a tier sees it.
 *
 * Every route is answered from the real modules but for the settings payload,
 * which is ACCOUNT_FIXTURE. **The tier arrives in a header, which is this file
 * standing in for a session and nothing else**: on the site it comes from
 * reader.js out of a session row, and never from anything a client sent.
 */
function docsServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const tier = req.headers['x-tier'] ?? 'public';
    const signedIn = tier !== 'public';
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/nav') {
      return json({
        ok: true,
        data: {
          reader: {
            signed_in: signedIn,
            username: signedIn ? 'staffer' : null,
            role: tier === 'developer' || tier === 'admin' ? 'admin' : signedIn ? 'job poster' : null,
            tier,
          },
          nav: navFor(tier),
        },
      });
    }

    if (url.pathname === '/api/search-index') return json({ ok: true, data: { entries: gatedIndexFor(tier) } });

    if (url.pathname === '/api/auth/staff/session') {
      return signedIn
        ? json({ ok: true, data: { user: { id: 'u1', username: 'staffer' } } })
        : json({ ok: false, error: { code: 'unauthorised' } }, 401);
    }

    if (url.pathname === '/api/auth/staff/account') {
      return signedIn
        ? json({ ok: true, data: ACCOUNT_FIXTURE })
        : json({ ok: false, error: { code: 'unauthorised' } }, 401);
    }

    if (url.pathname === '/api/content') {
      const segments = (url.searchParams.get('path') ?? '').split('/').filter(Boolean);
      const path = segments.length === 0 ? '/' : pagePathFromSegments(segments);
      const found = path === null ? null : readablePage(path, tier);
      if (!found) return json({ ok: false, error: { code: 'not_found' } }, 404);

      return json({
        ok: true,
        data: {
          page: found.page,
          prev: found.prev,
          next: found.next,
          asset_base: found.assetBase,
          updated: updatedFor(found.page.path),
          markdown: frontMatter(readFileSync(found.file, 'utf8'))?.body ?? '',
        },
      });
    }

    return serveFromDist(res, url.pathname);
  });
}

/**
 * A context with the language, the theme and the tier already chosen.
 *
 * The locale is set before the first paint, because shell.html reads
 * `gftv-careers.locale` in an inline script in its own head and holds the page
 * blank until the dictionary applies for anything but English. Setting it after
 * a load would measure the English page and call it 华文.
 */
async function docsContext(browser, base, locale, tier) {
  const ctx = await browser.newContext({
    baseURL: base,
    serviceWorkers: 'block',
    locale: locale === 'zh' ? 'zh-SG' : 'en-GB',
    extraHTTPHeaders: tier === 'public' ? {} : { 'x-tier': tier },
  });

  await ctx.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(`${key}.locale`, value);
        localStorage.setItem(`${key}.mode`, 'light');
        localStorage.setItem(`${key}.colorTheme`, 'classic');
      } catch {
        /* a context with storage blocked is a context this run cannot use */
      }
    },
    ['gftv-careers', locale]
  );

  return ctx;
}

/** One page at one width, settled. */
async function visit(page, base, path, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });

  // Every address here draws itself after at least one fetch, and a page
  // measured before it has drawn is a page measured empty. The dictionary is
  // the second wait: the shell holds the document blank behind
  // data-i18n-pending until it applies, and a 华文 page measured inside that
  // window is a page with nothing laid out in it.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute('data-i18n-pending'), null, { timeout: 3000 })
    .catch(() => {});
}

/**
 * Everything one docs page is asked about at one width, in the page's own
 * context.
 *
 * Phase 12's three layout rules, plus the two 16d states in words: search and
 * the account control keep their place in the header at every width and never
 * go inside the hamburger.
 */
function measureDocs({ floorPx }) {
  const describe = (el) => {
    const cls = String(el.className || '').split(' ').filter(Boolean)[0];
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  };

  const seen = (el) => Boolean(el) && el.checkVisibility({ checkVisibilityCSS: true });

  const scrolled = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  // What is actually sticking out, named by its ancestry, because "the page
  // scrolls sideways" is not a finding anybody can act on.
  let widest = null;
  if (scrolled > 1) {
    const limit = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.right <= limit + 1) continue;
      const chain = [];
      for (let node = el; node && chain.length < 4; node = node.parentElement) chain.push(describe(node));
      widest = { right: Math.round(box.right), chain: chain.join(' < ') };
      break;
    }
  }

  // A table on a docs page lives inside .docs-scroller and scrolls in its own
  // box, so a narrow cell there is the scroller doing its job. What this is
  // looking for is a cell squeezed by the column it is in.
  const tight = [];
  for (const cell of document.querySelectorAll('th, td')) {
    const box = cell.getBoundingClientRect();
    const text = (cell.textContent ?? '').trim();
    if (text === '' || box.width === 0) continue;
    if (cell.closest('.docs-scroller')) continue;
    if (box.width < floorPx) tight.push(`${cell.tagName.toLowerCase()} "${text.slice(0, 24)}" ${Math.round(box.width)}px`);
  }

  // A long label wrapping is a long label; a short one wrapping is a cramped
  // control. Four Han characters count as about a word, because 华文 puts no
  // spaces between them and every Chinese label would otherwise be one.
  const cramped = [];
  for (const button of document.querySelectorAll('button, .docs-btn')) {
    const text = (button.textContent ?? '').trim();
    if (text.length < 2) continue;
    const box = button.getBoundingClientRect();
    if (box.height === 0) continue;
    const lineHeight = parseFloat(getComputedStyle(button).lineHeight) || 20;
    const spaced = text.split(/\s+/).filter(Boolean).length;
    const han = (text.match(/[㐀-鿿]/g) ?? []).length;
    const words = han > 0 ? Math.ceil(han / 4) : spaced;
    if (box.height > lineHeight * 2.2 && words <= 3) {
      cramped.push(`"${text.slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
  }

  const onScreen = (el) => {
    if (!seen(el)) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.left >= -1 && box.right <= window.innerWidth + 1;
  };

  const sidebar = document.querySelector('#docsSidebar');

  return {
    scrolled,
    widest,
    tight: tight.slice(0, 6),
    cramped: cramped.slice(0, 6),
    // 16d, in the two sentences it gives the reason for: search is how people
    // navigate documentation on a phone, and a reader who cannot find how to
    // sign out assumes they have not.
    search: onScreen(document.querySelector('#docsSearch')),
    account: onScreen(document.querySelector('#docsAccount')),
    layout: {
      menu: seen(document.querySelector('#docsMenu')),
      sidebar: seen(sidebar) && (sidebar?.getBoundingClientRect().left ?? -1) >= -1,
      toc: seen(document.querySelector('#docsToc')),
      tocInline: seen(document.querySelector('#docsTocInline')),
    },
  };
}

/** Every width for one page, reported once per rule: six near identical
 *  failures say the same thing once. */
function reportDocs(label, results) {
  const lines = (pick) => results.filter(pick).map((r) => `${r.width}px`).join(', ');

  const scrolls = results.filter((r) => r.scrolled > DOCS_SCROLL_SLACK);
  check(
    `${label} does not scroll sideways at any width`,
    scrolls.length === 0,
    scrolls.map((r) => `${r.width}px by ${r.scrolled}px: ${r.widest?.chain ?? 'unknown'}`).join('; ')
  );

  const tight = results.filter((r) => r.tight.length > 0);
  check(
    `${label} has no table cell under ${DOCS_CELL_FLOOR}px outside a scroller`,
    tight.length === 0,
    tight.map((r) => `${r.width}px: ${r.tight.join(', ')}`).join('; ')
  );

  const cramped = results.filter((r) => r.cramped.length > 0);
  check(
    `${label} has no short control label wrapping`,
    cramped.length === 0,
    cramped.map((r) => `${r.width}px: ${r.cramped.join(', ')}`).join('; ')
  );

  check(
    `${label} keeps search and the account control on screen at every width`,
    results.every((r) => r.search && r.account),
    `search missing at ${lines((r) => !r.search) || 'nowhere'}; account missing at ${lines((r) => !r.account) || 'nowhere'}`
  );
}

define('responsive', 'Every page at six widths, in both languages', async () => {
  console.log(`      ${DOCS_WIDTHS.join(', ')} across both trees and the three form pages, en and 华文`);

  const { pages } = loadPages({ fresh: true });
  const publicPaths = [...pages.values()].filter((p) => p.pipeline === 'public').map((p) => p.path).sort();
  const gatedPaths = [...pages.values()].filter((p) => p.pipeline === 'gated').map((p) => p.path).sort();

  // Two readers, because they are two different documents. A signed out reader
  // has a shorter sidebar, no account menu and the two pages that send a signed
  // in reader away; a signed in one has everything and `/account`, which is the
  // widest thing this site draws.
  const READERS = [
    { tier: 'public', paths: [...publicPaths, '/login', '/forgot-password'] },
    { tier: 'developer', paths: [...publicPaths, ...gatedPaths, '/account'] },
  ];

  const server = docsServer();
  const base = await listen(server);
  const browser = await chromium.launch();

  try {
    for (const locale of DOCS_LOCALES) {
      for (const { tier, paths } of READERS) {
        const ctx = await docsContext(browser, base, locale, tier);
        const page = await ctx.newPage();

        // **The pass is proved to be the pass it claims to be, before it
        // runs.** Nothing else here would notice a 华文 run that had quietly
        // measured English: the widths are the same and it would report the
        // same clean six. Phase 12 part 1's rule, and part 6a is what makes it
        // apply to this site at all.
        await visit(page, base, '/', 1440);
        const applied = await page.evaluate(() => ({
          locale: document.documentElement.getAttribute('data-locale'),
          lang: document.documentElement.getAttribute('lang'),
          brand: (document.querySelector('.docs-brand')?.textContent ?? '').trim(),
        }));
        check(
          `the ${locale} pass as ${tier} is actually rendering ${locale}`,
          applied.locale === locale &&
            applied.lang === (locale === 'zh' ? 'zh-Hans-SG' : 'en') &&
            /[一-鿿]/.test(applied.brand) === (locale === 'zh'),
          `data-locale ${applied.locale}, lang ${applied.lang}, brand "${applied.brand}"`
        );

        // And that the sidebar arrived, for the same reason: a page with no
        // navigation in it holds every width comfortably.
        const entries = await page.locator('.docs-sidebar a').count();
        check(
          `the ${locale} sidebar as ${tier} is drawn from the page list`,
          entries >= (tier === 'public' ? 4 : 8),
          `${entries} entries`
        );

        for (const path of paths) {
          const results = [];
          for (const width of DOCS_WIDTHS) {
            await visit(page, base, path, width);
            results.push({ width, ...(await page.evaluate(measureDocs, { floorPx: DOCS_CELL_FLOOR })) });
          }
          reportDocs(`${path} in ${locale} as ${tier}`, results);
        }

        await ctx.close();
      }
    }

    /* --- The three column arrangement, which is the README's own table --- */

    // **Measured on the run's own fixture page, and that is not a convenience.**
    // `.docs-toc:empty` collapses the contents column, which is right — a page
    // with no headings under its title has no contents to draw — and every page
    // in both trees is a phase 14 placeholder with exactly one heading in it. So
    // the only page on this site that can answer "is the contents column there
    // at 1024px" is one with a second heading, and the fixture this run writes
    // has one. Probing a placeholder instead would have reported the column
    // missing at every width and called it a finding.
    const ctx = await docsContext(browser, base, 'en', 'developer');
    const page = await ctx.newPage();
    const layouts = [];
    for (const width of DOCS_WIDTHS) {
      await visit(page, base, FIXTURE_PATH, width);
      layouts.push({
        width,
        columns: await page.evaluate(
          () => getComputedStyle(document.querySelector('.docs-layout')).gridTemplateColumns.split(/\s+/).length
        ),
        ...(await page.evaluate(measureDocs, { floorPx: DOCS_CELL_FLOOR })),
      });
    }
    await ctx.close();

    const at = (width) => layouts.find((entry) => entry.width === width)?.layout ?? {};
    const columnsAt = (width) => layouts.find((entry) => entry.width === width)?.columns ?? 0;

    check(
      '130. at 1024px and up all three columns are on screen',
      [1024, 1440].every((width) => at(width).sidebar && at(width).toc && !at(width).tocInline),
      [1024, 1440].map((w) => `${w}px: ${JSON.stringify(at(w))}`).join('; ')
    );

    check(
      '131. between 640 and 1024px the contents become a block above the page',
      at(768).sidebar && !at(768).toc && at(768).tocInline,
      `768px: ${JSON.stringify(at(768))}`
    );

    check(
      '132. below 640px the sidebar is behind the hamburger and off screen',
      [320, 375, 414].every((width) => at(width).menu && !at(width).sidebar),
      [320, 375, 414].map((w) => `${w}px: ${JSON.stringify(at(w))}`).join('; ')
    );

    check(
      '133. and the hamburger is not there when the sidebar is',
      [1024, 1440].every((width) => !at(width).menu),
      [1024, 1440].map((w) => `${w}px menu: ${at(w).menu}`).join('; ')
    );

    // The grid underneath the three checks above, asked separately because
    // `.docs-toc:empty` is allowed to collapse the column and the track is
    // there either way. A page with nothing to put in its contents must not be
    // the reason the layout reads as two columns.
    check(
      '133a. and the grid itself is one, two and three tracks at those widths',
      [320, 375, 414].every((width) => columnsAt(width) === 1) &&
        columnsAt(768) === 2 &&
        [1024, 1440].every((width) => columnsAt(width) === 3),
      layouts.map((entry) => `${entry.width}px: ${entry.columns}`).join(', ')
    );
  } finally {
    await browser.close();
    await new Promise((closed) => server.close(closed));
  }
});

/**
 * The eight accessibility rules, in the page's own context.
 *
 * Phase 12 part 2's audit, with this site's skip link. **None of them is a
 * preference**: each is a thing a keyboard or a screen reader either can or
 * cannot do, so each fails with the element that broke it and not with a count.
 *
 * The accessible name is an approximation of the real algorithm and is
 * deliberately generous, which is the right direction for a check that fails a
 * run: everything it reports is genuinely nameless, and the cost is a name it
 * credits that a browser might compute differently.
 */
function auditDocsA11y({ focusable, skipSelector }) {
  const seen = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && el.closest('[inert]') === null;

  const describe = (el) => {
    const cls = String(el.className || '').split(' ').filter(Boolean)[0];
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  };

  const textOf = (el) => (el?.textContent ?? '').trim();

  function accessibleName(el) {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const joined = labelledby
        .split(/\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(' ');
      if (joined) return joined;
    }

    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (textOf(forLabel)) return textOf(forLabel);
      }
      const wrapping = el.closest('label');
      if (textOf(wrapping)) return textOf(wrapping);
      if (el.tagName === 'INPUT' && /^(submit|button|reset)$/.test(el.type) && el.value.trim()) {
        return el.value.trim();
      }
      // **A placeholder is not a name**, and this is the one place the audit is
      // strict instead of generous: some browsers fall back to it, which is
      // exactly what makes an unlabelled field survive a hand test.
      return '';
    }

    if (textOf(el)) return textOf(el);

    const alt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    return '';
  }

  // 1. Everything a reader can reach with Tab can be named out loud.
  const unnamed = [];
  const reachable = [...document.querySelectorAll(focusable)].filter(
    (el) => seen(el) && el.getAttribute('tabindex') !== '-1'
  );
  for (const el of reachable) if (accessibleName(el) === '') unnamed.push(describe(el));

  // 2. Nothing focusable inside aria-hidden. The one rule here that is a
  //    contradiction and not an omission: the page has told a screen reader the
  //    subtree does not exist and left the keyboard able to walk into it. A
  //    sidebar that closes by moving off the edge is how this happens.
  const hiddenFocusable = [];
  for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
    for (const el of hidden.querySelectorAll(focusable)) {
      if (!seen(el) || el.getAttribute('tabindex') === '-1') continue;
      hiddenFocusable.push(`${describe(el)} inside ${describe(hidden)}`);
    }
  }

  // 3. Every ARIA reference points at something on the page.
  const IDREF = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-activedescendant', 'aria-owns'];
  const dangling = [];
  for (const attr of IDREF) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) dangling.push(`${describe(el)} ${attr}="${id}"`);
      }
    }
  }
  for (const el of document.querySelectorAll('label[for]')) {
    const id = el.getAttribute('for');
    if (id && !document.getElementById(id)) dangling.push(`${describe(el)} for="${id}"`);
  }

  // 4. One id, one element. A duplicate makes every reference above a coin toss.
  const counts = new Map();
  for (const el of document.querySelectorAll('[id]')) counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `#${id} x${n}`);

  // 5. One h1, and no level skipped on the way down. **This one is about the
  //    renderer as much as the shell**: a guide's outline is whatever its
  //    markdown wrote, and a page starting at ## under the shell's h1 is how a
  //    skip arrives without anybody typing one.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(seen);
  const levels = headings.map((el) => Number(el.tagName[1]));
  const h1 = headings.filter((el) => el.tagName === 'H1');
  const skips = [];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) {
      skips.push(
        `h${levels[i - 1]} "${textOf(headings[i - 1]).slice(0, 20)}" to h${levels[i]} "${textOf(headings[i]).slice(0, 20)}"`
      );
    }
  }

  // 6. Every image says what it is, or says it is decoration.
  const images = [];
  for (const img of document.querySelectorAll('img')) {
    if (!seen(img)) continue;
    if (img.hasAttribute('alt')) continue;
    if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') continue;
    images.push(`${describe(img)} ${img.getAttribute('src')?.slice(-30) ?? ''}`);
  }

  // 7. No positive tabindex anywhere. One is enough to reorder the document
  //    against the order it is written in.
  const positive = [...document.querySelectorAll('[tabindex]')]
    .filter((el) => Number(el.getAttribute('tabindex')) > 0)
    .map((el) => `${describe(el)} tabindex="${el.getAttribute('tabindex')}"`);

  // 8. The skip link is the first thing Tab reaches, and it lands somewhere.
  const first = reachable[0] ?? null;
  const skipLink = document.querySelector(skipSelector);
  const target = skipLink ? document.getElementById((skipLink.getAttribute('href') ?? '').replace(/^#/, '')) : null;

  return {
    unnamed: [...new Set(unnamed)].slice(0, 8),
    hiddenFocusable: [...new Set(hiddenFocusable)].slice(0, 8),
    dangling: [...new Set(dangling)].slice(0, 8),
    duplicates: duplicates.slice(0, 8),
    h1Count: h1.length,
    skips: skips.slice(0, 4),
    images: images.slice(0, 6),
    positive: positive.slice(0, 6),
    skipLinkFirst: Boolean(skipLink) && first === skipLink,
    skipLinkLands: Boolean(target),
  };
}

/** The eight rules, reported once per page rather than once per width. */
function reportDocsA11y(label, results) {
  const gather = (key) => results.filter((r) => r[key].length > 0);
  const lines = (key) => gather(key).map((r) => `${r.width}px: ${r[key].join(', ')}`).join('; ');

  check(`${label}: everything reachable by Tab has a name`, gather('unnamed').length === 0, lines('unnamed'));
  check(
    `${label}: nothing focusable sits inside aria-hidden`,
    gather('hiddenFocusable').length === 0,
    lines('hiddenFocusable')
  );
  check(`${label}: every ARIA reference resolves`, gather('dangling').length === 0, lines('dangling'));
  check(`${label}: no id is used twice`, gather('duplicates').length === 0, lines('duplicates'));
  check(
    `${label}: exactly one h1 at every width`,
    results.every((r) => r.h1Count === 1),
    results.map((r) => `${r.width}px: ${r.h1Count}`).join(', ')
  );
  check(`${label}: no heading level is skipped`, gather('skips').length === 0, lines('skips'));
  check(`${label}: every image has an alt or is marked decorative`, gather('images').length === 0, lines('images'));
  check(`${label}: no positive tabindex`, gather('positive').length === 0, lines('positive'));
  check(
    `${label}: the skip link is first and lands on something`,
    results.every((r) => r.skipLinkFirst && r.skipLinkLands),
    results.map((r) => `${r.width}px: first ${r.skipLinkFirst}, lands ${r.skipLinkLands}`).join('; ')
  );
}

define('a11y', 'Every page against the accessibility rules, in both languages', async () => {
  console.log(`      ${DOCS_A11Y_WIDTHS.join(', ')} across both trees and the three form pages, en and 华文`);

  const { pages } = loadPages({ fresh: true });
  const publicPaths = [...pages.values()].filter((p) => p.pipeline === 'public').map((p) => p.path).sort();
  const gatedPaths = [...pages.values()].filter((p) => p.pipeline === 'gated').map((p) => p.path).sort();

  const READERS = [
    { tier: 'public', paths: [...publicPaths, '/login', '/forgot-password'] },
    { tier: 'developer', paths: [...publicPaths, ...gatedPaths, '/account'] },
  ];

  const server = docsServer();
  const base = await listen(server);
  const browser = await chromium.launch();

  try {
    let proved = false;

    for (const locale of DOCS_LOCALES) {
      for (const { tier, paths } of READERS) {
        const ctx = await docsContext(browser, base, locale, tier);
        const page = await ctx.newPage();

        // **Prove the audit can fail before trusting that it passed.** Phase 12
        // part 1 learned this the expensive way: a clean first run is what a
        // broken measurement looks like from the outside. Two defects go into a
        // real page — a control with nothing to say, and a link left focusable
        // inside an aria-hidden container — and both have to come back named.
        if (!proved) {
          proved = true;
          await visit(page, base, '/', 1024);
          await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.id = 'a11yProbe';
            probe.innerHTML =
              '<button type="button" id="probeNameless"></button>' +
              '<div aria-hidden="true"><a href="/portal" id="probeLink">Reachable</a></div>';
            document.body.append(probe);
          });
          const caught = await page.evaluate(auditDocsA11y, {
            focusable: DOCS_FOCUSABLE,
            skipSelector: '.docs-skip',
          });
          await page.evaluate(() => document.querySelector('#a11yProbe')?.remove());
          check(
            'the audit reports a control with no accessible name',
            caught.unnamed.some((entry) => entry.includes('probeNameless')),
            caught.unnamed.join(', ') || 'nothing reported'
          );
          check(
            'the audit reports a focusable element inside aria-hidden',
            caught.hiddenFocusable.some((entry) => entry.includes('probeLink')),
            caught.hiddenFocusable.join(', ') || 'nothing reported'
          );
        }

        for (const path of paths) {
          const results = [];
          for (const width of DOCS_A11Y_WIDTHS) {
            await visit(page, base, path, width);
            results.push({
              width,
              ...(await page.evaluate(auditDocsA11y, {
                focusable: DOCS_FOCUSABLE,
                skipSelector: '.docs-skip',
              })),
            });
          }
          reportDocsA11y(`${path} in ${locale} as ${tier}`, results);
        }

        await ctx.close();
      }
    }

    /* --- The two panels a keyboard has to be able to drive --------------- */

    // The sweep above asks whether a page is *described* correctly. It cannot
    // ask whether anything *works*, and the sidebar panel and the search
    // combobox are both behaviours: a panel that closes by moving off the edge
    // passes every static rule in the file and still holds the tab order.
    const ctx = await docsContext(browser, base, 'en', 'public');
    const page = await ctx.newPage();

    await visit(page, base, '/', 375);
    await page.locator('#docsMenu').click();
    await page.waitForTimeout(120);

    check(
      '134. the sidebar panel says it is open, and the keyboard is inside it',
      (await page.locator('#docsMenu').getAttribute('aria-expanded')) === 'true' &&
        (await page.evaluate(() => document.activeElement?.closest('#docsSidebar') !== null)),
      `expanded ${await page.locator('#docsMenu').getAttribute('aria-expanded')}`
    );

    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);

    check(
      '135. escape shuts it and gives the button back the focus',
      (await page.locator('#docsMenu').getAttribute('aria-expanded')) === 'false' &&
        (await page.evaluate(() => document.activeElement?.id === 'docsMenu')),
      `expanded ${await page.locator('#docsMenu').getAttribute('aria-expanded')}, focus on ${await page.evaluate(() => document.activeElement?.id)}`
    );

    check(
      '136. and nothing in the shut panel is in the tab order',
      await page.evaluate(() => {
        const sidebar = document.querySelector('#docsSidebar');
        if (!sidebar) return false;
        return [...sidebar.querySelectorAll('a[href], button:not([disabled])')].every(
          (el) => !el.checkVisibility({ checkVisibilityCSS: true }) || el.closest('[inert]') !== null
        );
      }),
      'a panel moved off the edge is a panel a keyboard can still walk into'
    );

    await ctx.close();
  } finally {
    await browser.close();
    await new Promise((closed) => server.close(closed));
  }
});

/**
 * The docs components, measured where they are drawn.
 *
 * **Phase 12 part 3 measured the tokens and this measures what was built from
 * them**, which is that part's own lesson: a ratio cannot tell you a state is
 * drawn only in hue, and a token passing AA says nothing about a component that
 * puts one token on another. Every pair below is a colour on the colour it
 * actually sits on, composited first, at the threshold its own size and weight
 * earn it.
 */
function measureDocsContrast() {
  const parse = (css) => {
    if (!css || css === 'transparent' || css === 'none') return null;
    const nums = css.match(/-?[\d.]+(?:e-?\d+)?/g);
    if (!nums || nums.length < 3) return null;
    // Chromium answers "rgb(r, g, b)" for an ordinary colour and
    // "color(srgb r g b / a)" with 0..1 channels for anything that came out of
    // a color-mix. Both forms are in this palette — every --callout-*-bg is a
    // color-mix — so a parser that handled one would read half of what it
    // measured as very nearly black and pass everything.
    const scale = css.startsWith('color(') ? 255 : 1;
    const value = nums.map(Number);
    return { r: value[0] * scale, g: value[1] * scale, b: value[2] * scale, a: nums.length > 3 ? value[3] : 1 };
  };

  const over = (src, dst) => ({
    r: src.r * src.a + dst.r * (1 - src.a),
    g: src.g * src.a + dst.g * (1 - src.a),
    b: src.b * src.a + dst.b * (1 - src.a),
    a: 1,
  });

  // What is really behind a pixel: up the ancestor chain collecting every
  // background until one is opaque, then composited back down. The step that
  // cannot be skipped, because --surface carries an alpha in all four
  // combinations and an element on a card never sits on the colour its own
  // token names.
  const backdropOf = (start) => {
    const layers = [];
    for (let node = start; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (!bg || bg.a === 0) continue;
      layers.push(bg);
      if (bg.a >= 1) break;
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) out = over(layers[i], out);
    return out;
  };

  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const one = lum(a);
    const two = lum(b);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  };

  // 1.4.3's own definition of large, read off the element and not guessed:
  // 24px, or 18.66px at weight 700 or heavier. The callout labels are 12px bold
  // and the captions 13.6px regular, and neither is a size anybody would have
  // got right from memory.
  const isLarge = (cs) => {
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    return size >= 24 || (size >= 18.66 && weight >= 700);
  };

  const found = [];

  const add = (label, fg, bg, need, advisory = false) => {
    if (!fg || !bg) {
      found.push({ label, ratio: 0, need, advisory, unreadable: true });
      return;
    }
    const composited = fg.a < 1 ? over(fg, bg) : fg;
    found.push({ label, ratio: Math.round(ratio(composited, bg) * 100) / 100, need, advisory });
  };

  /** Text against whatever it is really sitting on. */
  const text = (label, selector) => {
    const el = document.querySelector(selector);
    if (!el) {
      found.push({ label, ratio: 0, need: 4.5, missing: true });
      return;
    }
    const cs = getComputedStyle(el);
    add(label, parse(cs.color), backdropOf(el), isLarge(cs) ? 3 : 4.5);
  };

  /**
   * A boundary against what is *outside* it, which is the parent's backdrop and
   * never the fill it encloses. Measuring a callout's rule against the tint it
   * draws is the mistake that makes every callout pass.
   *
   * **`advisory` is 1.4.11's own scope and not a way round it.** That criterion
   * is about "visual information required to identify user interface components
   * and states". A rule that only divides one region of a document from the
   * next identifies nothing, and holding a 1px `--border` separator to 3:1
   * would mean drawing a heavier line across every page on the site to satisfy
   * a rule that was never about it. Every advisory here is a line whose meaning
   * is carried by something else as well, and `statesInHue` below is what says
   * so instead of this comment.
   */
  const boundary = (label, selector, property, advisory = false) => {
    const el = document.querySelector(selector);
    if (!el) {
      found.push({ label, ratio: 0, need: 3, advisory, missing: true });
      return;
    }
    add(label, parse(getComputedStyle(el)[property]), backdropOf(el.parentElement), 3, advisory);
  };

  /* --- The chrome ------------------------------------------------------- */

  text('brand', '.docs-brand');
  // The header's two icon buttons, which were a word and a <select> until phase
  // 14 part 1 put gftv-theme.md's own controls here. Their glyph is
  // currentColor, so measuring the button's colour measures the icon.
  text('language button', '#languageButton');
  text('theme button', '#themeButton');
  text('portal link', '.docs-portal-link');
  text('skip link', '.docs-skip');
  text('sidebar heading', '.docs-sidebar-heading');
  text('sidebar link', '.docs-sidebar a:not(.docs-sidebar-heading)');
  text('sidebar current entry', '.docs-sidebar a[aria-current="page"]');
  text('breadcrumb link', '.docs-breadcrumbs a');
  text('contents link', '.docs-toc a');
  // The pager is a <small> for the direction and the page's own title beside
  // it, which is the anchor's own colour and not a span of its own.
  text('pager label', '.docs-pager a small');
  text('pager title', '.docs-pager a');
  text('last updated', '#docsUpdated');
  // Advisory: it separates the header from the page and identifies nothing.
  boundary('header rule', '.docs-header', 'borderBottomColor', true);

  /* --- What the renderer draws ------------------------------------------ */

  text('body text', '.docs-article p');
  text('body link', '.docs-article a:not(.docs-anchor)');
  text('heading anchor', '.docs-anchor');
  text('inline code', '.docs-article :not(pre) > code');
  text('code block', '.docs-code pre code');
  text('code language', '.docs-code-lang');
  text('copy button', '.docs-copy');
  text('table heading', '.docs-scroller th');
  text('table cell', '.docs-scroller td');
  text('details summary', '.docs-details summary');
  text('figure caption', '.docs-figure figcaption');
  text('pending slot label', '.docs-pending-label');
  text('pending slot alt', '.docs-pending-alt');
  boundary('pending slot edge', '.docs-pending', 'borderTopColor');
  text('tab, unselected', '.docs-tabs button[aria-selected="false"]');
  text('tab, selected', '.docs-tabs button[aria-selected="true"]');
  text('tab panel', '.docs-tabpanel p');
  // Advisory: the strip's baseline. Which tab is selected is carried by the
  // fill, the weight and the text colour, and statesInHue is what proves it.
  boundary('tab strip rule', '.docs-tabs', 'borderBottomColor', true);

  // The four callouts. **Each is told apart by a word as well as a tint**,
  // which is docs.css's own rule: three of the four tints are 14% of a status
  // colour and would be four shades of pale to a reader who cannot separate
  // them. So the label is measured as text, the rule is advisory, and the word
  // being there at all is checked below.
  for (const kind of ['note', 'tip', 'warning', 'danger']) {
    const selector = `.docs-callout[data-callout="${kind}"]`;
    text(`${kind} callout label`, `${selector} .docs-callout-label`);
    text(`${kind} callout text`, `${selector} p:last-child`);
    boundary(`${kind} callout rule`, selector, 'borderLeftColor', true);
  }

  /* --- Search, which is drawn over the page ------------------------------ */

  text('search field', '#docsSearch');
  text('result title', '.docs-result-title');
  text('result heading', '.docs-result-heading');
  text('result snippet', '.docs-result-snippet');
  text('result match', '.docs-result-snippet mark');
  text('active result', '.docs-result[aria-selected="true"] .docs-result-title');

  /* --- What a ratio cannot say ------------------------------------------ */

  // **Phase 12 part 3's finding, asked of this site's own components.**
  // Arithmetic cannot tell you a state is drawn only in hue: every pair above
  // can clear AA while the only thing separating "this tab is selected" from
  // "this one is not" is a colour. Both states here have to differ by something
  // a reader who cannot separate the two hues still perceives.
  const tabs = [...document.querySelectorAll('.docs-tabs button')];
  const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
  const unselected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'false');

  const statesInHue = { tabs: null, callouts: [] };

  if (selected && unselected) {
    const a = getComputedStyle(selected);
    const b = getComputedStyle(unselected);
    statesInHue.tabs = {
      weight: a.fontWeight !== b.fontWeight,
      fill: a.backgroundColor !== b.backgroundColor,
      border: a.borderTopColor !== b.borderTopColor,
    };
  }

  // Every callout carries its kind as a word. Without it the four are a tint
  // apiece, and three of the tints are the same 14% of a status colour.
  for (const kind of ['note', 'tip', 'warning', 'danger']) {
    const label = document.querySelector(`.docs-callout[data-callout="${kind}"] .docs-callout-label`);
    statesInHue.callouts.push({ kind, word: (label?.textContent ?? '').trim() });
  }

  return {
    found,
    statesInHue,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    // The arithmetic, proved on two values whose answers are known, so a
    // section that reported all green would have to have measured something.
    selfCheck: {
      extremes: Math.round(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) * 100) / 100,
      boundary: Math.round(ratio({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 }) * 100) / 100,
      translucent:
        Math.round(
          ratio(over({ r: 0, g: 0, b: 0, a: 0.3 }, { r: 255, g: 255, b: 255 }), { r: 255, g: 255, b: 255 }) * 100
        ) / 100,
    },
  };
}

// All four, because theme.css is generated into this site whole and every
// colour block in it selects on both attributes.
//
// **All four are now reachable from the chrome**, as of phase 14 part 1. This
// comment used to say the palette was "a control away if it is ever wanted" and
// that measuring it early beat finding out with thirty guides already written;
// the control landed before the guides did, and it landed on a palette these
// checks had already been measuring for a phase. That is the argument for
// measuring a combination nobody can reach, kept here because it was paid off.
const DOCS_THEMES = [
  ['classic', 'light'],
  ['classic', 'dark'],
  ['hello', 'light'],
  ['hello', 'dark'],
];

// Everything the renderer can draw, on one page, so what is measured is the
// markup markdown.js actually emits and not a hand written imitation of it.
const CONTRAST_FIXTURE = [
  '# The components, drawn once',
  '',
  'A paragraph with [a link](/portal) and some `inline code` in it.',
  '',
  '> [!NOTE]',
  '> Something worth knowing.',
  '',
  '> [!TIP]',
  '> Something worth trying.',
  '',
  '> [!WARNING]',
  '> Something worth care.',
  '',
  '> [!DANGER]',
  '> Something that cannot be undone.',
  '',
  '```sh',
  'node scripts/build.js',
  '```',
  '',
  '| Column | What it holds |',
  '|---|---|',
  '| One | A cell. |',
  '',
  ':::details More about it',
  'The body of the collapsible block.',
  ':::',
  '',
  ':::tabs',
  '::tab On a desktop',
  'What a desktop does.',
  '::tab On a phone',
  'What a phone does.',
  ':::',
  '',
  '![The overview](pending:overview "A caption for the shot that is coming.")',
  '',
].join('\n');

define('contrast', 'The docs components, in all four theme combinations', async () => {
  console.log(`      ${DOCS_THEMES.map(([t, m]) => `${t} ${m}`).join(', ')}`);

  const server = docsServer();
  const base = await listen(server);
  const browser = await chromium.launch();

  try {
    // **The run's own fixture page, as a reader who can see everything.** It is
    // the one address on this site with a second heading under its title, so it
    // is the only one that draws a contents column, a pager with something on
    // both sides, and a search result whose heading is not just the page name.
    // Every other page is a phase 14 placeholder, and probing one would have
    // reported four components missing and measured the rest.
    const ctx = await docsContext(browser, base, 'en', 'developer');
    const page = await ctx.newPage();
    await visit(page, base, FIXTURE_PATH, 1440);

    // The renderer's own output, put where the renderer puts it. Rendered in
    // node by the same module the browser imports, so nothing here is a second
    // implementation of the markup.
    const { html } = render(CONTRAST_FIXTURE, {});
    await page.evaluate((markup) => {
      document.querySelector('#docsArticle').innerHTML = markup;
      const details = document.querySelector('.docs-details');
      if (details) details.open = true;
    }, html);

    // The search panel is drawn over the page and its colours are its own.
    // **"admin" is the query that draws every part of a result**: it matches
    // one page's own title, which is a result with no heading line, and another
    // page's second heading, which is a result that carries one — and both of
    // them match inside the text, which is where the highlight is drawn. A
    // query matching only a heading returns a result with an empty snippet and
    // no highlight in it at all.
    await page.fill('#docsSearch', 'admin');
    await page.waitForSelector('.docs-result');
    await page.keyboard.press('ArrowDown');

    // **A theme change is animated and this section measures resting
    // colours.** A custom property is not animatable and flips on the instant
    // while a background eases over --transition, so for the length of that
    // transition the page really is one mode's text on the other's background
    // and getComputedStyle says so. Suppressed instead of waited out: a wait
    // tuned to a duration is a check that breaks the day somebody edits a
    // token, and WCAG asks what a reader sees once the page has settled.
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

    const backgrounds = new Map();
    let number = 137;

    for (const [theme, mode] of DOCS_THEMES) {
      const label = `${theme} ${mode}`;

      // Setting the two attributes is exactly what the mode toggle does, and
      // every colour block selects on both, so nothing has to be reloaded.
      // Two frames: the first is where the style recalculation lands and the
      // second is where it has been painted from.
      await page.evaluate(
        ([t, m]) => {
          document.documentElement.dataset.colorTheme = t;
          document.documentElement.dataset.mode = m;
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        },
        [theme, mode]
      );

      const result = await page.evaluate(measureDocsContrast);

      if (theme === 'classic' && mode === 'light') {
        check('the ratio is 21:1 for black on white', result.selfCheck.extremes === 21, `${result.selfCheck.extremes}:1`);
        check(
          'the ratio is 4.54:1 for #767676 on white',
          result.selfCheck.boundary === 4.54,
          `${result.selfCheck.boundary}:1`
        );
        // Black at 30% over white composites to rgb(178.5), which is 2.11:1
        // against white. Compared without compositing it would be 21:1, which
        // is the shape of the mistake: half the colours here carry an alpha of
        // their own — every --callout-*-bg is a color-mix and --border is an
        // rgba — so a comparison that skipped this step would give a
        // comfortable pass to a rule a reader can barely see.
        check(
          'a translucent foreground is composited before it is compared',
          result.selfCheck.translucent === 2.11,
          `${result.selfCheck.translucent}:1, expected 2.11:1`
        );
      }

      backgrounds.set(label, result.bodyBackground);

      // **A component that was not on the page is a gap and not a pass.** The
      // commonest way this section could go quietly wrong is a renamed class:
      // every pair would come back missing and nothing would fail.
      const missing = result.found.filter((entry) => entry.missing).map((entry) => entry.label);
      check(
        `${number}. ${label}: every component this section names is on the page`,
        missing.length === 0,
        `not drawn: ${missing.join(', ')}`
      );
      number += 1;

      const failing = result.found.filter((entry) => !entry.missing && !entry.advisory && entry.ratio < entry.need);
      check(
        `${number}. ${label}: every docs component clears its threshold`,
        failing.length === 0,
        failing.map((entry) => `${entry.label} ${entry.ratio}:1, needs ${entry.need}:1`).join('; ')
      );
      number += 1;

      // **The state, which the arithmetic above cannot see.** Every pair can
      // clear AA while the only thing telling a reader which tab is selected is
      // a hue. This is the check the advisory boundaries lean on, so it runs in
      // every combination and not in the one somebody looked at.
      const tabs = result.statesInHue.tabs;
      const wordless = result.statesInHue.callouts.filter((entry) => entry.word === '');
      check(
        `${number}. ${label}: no state here is drawn in colour alone`,
        Boolean(tabs) && (tabs.weight || tabs.fill) && wordless.length === 0,
        `${JSON.stringify(tabs)}; callouts with no word: ${wordless.map((e) => e.kind).join(', ') || 'none'}`
      );
      number += 1;

      const rank = (entries) =>
        [...entries].sort((a, b) => a.ratio - b.ratio).slice(0, 3).map((e) => `${e.label} ${e.ratio}:1`).join(', ');
      const measured = result.found.filter((entry) => !entry.missing);
      console.log(`      ${label}: closest three — ${rank(measured.filter((e) => !e.advisory))}`);
      // The advisory lines are printed rather than skipped, each with what it
      // is: a number nobody is acting on is still a number somebody can read.
      console.log(`      ${label}: advisory separators — ${rank(measured.filter((e) => e.advisory))}`);
    }

    check(
      '149. the four combinations paint four different backgrounds',
      new Set(backgrounds.values()).size === 4,
      [...backgrounds].map(([k, v]) => `${k} ${v}`).join('; ')
    );

    // The plumbing, not the arithmetic: a colour that genuinely fails has to
    // come back named. Injected into a real callout on the real page, so what
    // is proved is the whole path from getComputedStyle to the reported line.
    // **A group that has only ever passed is a group nobody has seen work.**
    await page.evaluate(() => {
      document.documentElement.dataset.colorTheme = 'classic';
      document.documentElement.dataset.mode = 'light';
      const style = document.createElement('style');
      style.id = 'docsContrastProbe';
      style.textContent = '.docs-callout[data-callout="note"] p:last-child { color: #f4f4f4 }';
      document.head.append(style);
      return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const broken = await page.evaluate(measureDocsContrast);
    await page.evaluate(() => document.querySelector('#docsContrastProbe')?.remove());
    const caught = broken.found.find((entry) => entry.label === 'note callout text');
    check(
      '150. a failing pair is reported rather than passed over',
      Boolean(caught) && caught.ratio < caught.need,
      caught ? `${caught.ratio}:1 against ${caught.need}:1` : 'nothing reported'
    );

    await ctx.close();
  } finally {
    await browser.close();
    await new Promise((closed) => server.close(closed));
  }
});

/* =========================================================================
 * The seam
 * ====================================================================== */

// Section 2 names the READMEs this repository has. Phase 12's seam checks the
// portal's half; what is new here is that a second project has a second
// variable list, and a list somebody wrote is a list with something missing
// from it.
const PRE_DEPLOY = [
  ['node gen-docs-lib.js --check', /gen-docs-lib\.js --check/],
  ['node scripts/build.js', /scripts\/build\.js/],
  ['node docs-site/scripts/embed-tests.mjs --check', /embed-tests\.mjs --check/],
];

define('seam', 'The second project: its variables, its README, and its deployment', async () => {
  const REPO = resolve(DOCS, '..');
  const read = (file) => readFileSync(join(REPO, file), 'utf8');

  /* --- Every variable this project reads is documented twice ------------ */

  // env.js refuses a name that is not on its own list, so a variable in
  // .env.example that it has never heard of would throw on the first request
  // that read it. Both directions, because each catches the other's silence.
  const envModule = read('docs-site/api/_lib/env.js');
  const known = [...envModule.matchAll(/^\s{2}'([A-Z0-9_]+)',$/gm)].map((match) => match[1]);
  const example = read('docs-site/.env.example');
  const rootReadme = read('README.md');
  const docsReadme = read('docs-site/README.md');

  check('151. the docs project reads four variables', known.length === 4, known.join(', '));

  const undocumented = [...example.matchAll(/^([A-Z0-9_]+)=/gm)]
    .map((match) => match[1])
    .filter((name) => !known.includes(name));
  check(
    '152. .env.example carries nothing env.js has never heard of',
    undocumented.length === 0,
    `${undocumented.join(', ')} — requireEnv throws on a name that is not on its list`
  );

  const uncommented = known.filter(
    (name) => !new RegExp(`^#[^\\n]*\\n(?:#[^\\n]*\\n)*${name}=`, 'm').test(example)
  );
  check(
    '153. and every one of them has a comment above it saying where to get it',
    uncommented.length === 0,
    `${uncommented.join(', ')} — section 2 asks for the comment, not just the name`
  );

  const unlisted = known.filter((name) => !rootReadme.includes(`\`${name}\``));
  check(
    '154. all four are in the root README’s table as well',
    unlisted.length === 0,
    `${unlisted.join(', ')} — section 17 asks for both sets in one place`
  );

  // **The one that is worth a check of its own**, per 5e: SITE_URL on this site
  // is the portal. Every document that names it has to say so, because setting
  // it to this site is the change that breaks every passkey registered on the
  // portal and breaks it silently.
  check(
    '155. .env.example says SITE_URL is the portal and not this site',
    /SITE_URL[\s\S]{0,400}$/.test(example) &&
      /#[^\n]*\*\*Not this site\.\*\*/.test(example) &&
      /relying party id/i.test(example),
    '5e: the pair is the one thing on this site that is not a copy'
  );

  check(
    '156. and the root README says which project each variable belongs to',
    /\| Project \| Root directory \| Domain \| From phase \|/.test(rootReadme) &&
      rootReadme.includes('`docs-site`') &&
      rootReadme.includes('docs.careers.globalfurry.tv'),
    'two Vercel projects on one repository is the thing a reader gets wrong'
  );

  /* --- The project settings live in the file, not in a form ------------- */

  const vercel = JSON.parse(read('docs-site/vercel.json'));

  check(
    '157. the build command and the output directory are in vercel.json',
    vercel.buildCommand === 'node scripts/build.js' && vercel.outputDirectory === 'dist',
    `${vercel.buildCommand} into ${vercel.outputDirectory}`
  );

  // A function that cannot find content/ throws at its first request. Both
  // trees, because api/nav.js reads the whole page list to build a sidebar for
  // a signed out reader too, and api/_generated/, which the build writes and
  // the functions read.
  const included = JSON.stringify(vercel.functions ?? {});
  check(
    '158. includeFiles carries both content trees and what the build wrote',
    ['content', '_content', '_generated'].every((dir) => included.includes(dir)),
    included.slice(0, 200)
  );

  // `/shell` and not `/shell.html`, because cleanUrls is on: the destination is
  // written the way the platform will resolve it, and the extension here would
  // be an address that does not exist.
  check(
    '159. every address that is not a file or an API route rewrites to the shell',
    vercel.cleanUrls === true &&
      (vercel.rewrites ?? []).some(
        (rule) => rule.destination === '/shell' && /\(\?!api\/|assets\//.test(rule.source)
      ),
    JSON.stringify(vercel.rewrites ?? [])
  );

  /* --- The README describes the site that is actually here -------------- */

  // Phase 8's rule turned on the document instead of the code: a README naming
  // a part that has not happened is the stale README failure, and this one has
  // said "what is not here yet" since part 5.
  check(
    '160. the README does not still describe a part that has shipped',
    !/is not here yet is parts? 6/i.test(docsReadme) && !/The project itself, its domain and its variables are part 7/.test(docsReadme),
    'part 6 shipped on 2 September 2026 and the project has existed since before part 3'
  );

  check(
    '161. it says the site is bilingual, which 16f said it was not',
    /bilingual|both languages|华文/.test(docsReadme) && /zh\.json/.test(docsReadme),
    'decision 15 overruled 16f on 3 September 2026, and this file is where a reader finds that out'
  );

  const preDeploy = PRE_DEPLOY.filter(([, pattern]) => !pattern.test(docsReadme)).map(([name]) => name);
  check(
    '162. and it names every command that belongs before a docs deploy',
    preDeploy.length === 0,
    `${preDeploy.join(', ')} — a check nobody can find is a check nobody runs`
  );

  /* --- The generator's four directories, in both directions ------------- */

  // gen-docs-lib.js --check is the command that fails when a change lands in
  // main-site/api/_lib/ and stops there. What it cannot say is whether anybody
  // is told to run it, which is what this pair is for.
  for (const [where, file] of [
    ['the root README', 'README.md'],
    ['the docs README', 'docs-site/README.md'],
  ]) {
    check(
      `163${where === 'the root README' ? '' : 'a'}. ${where} names gen-docs-lib.js --check`,
      /gen-docs-lib\.js --check/.test(read(file)),
      '5h keeps the two copies identical only if somebody runs the thing that says so'
    );
  }

  /* --- The service worker rule -------------------------------------------
   *
   * **This check was the other way round until phase 14 part 4.** Phase 13
   * decision 3 said no worker while the content was five placeholder pages, and
   * this asserted there was none, so that the README's rule and the tree could
   * not disagree. Thirty pages and a staff tier reversed the decision, and the
   * reason given for it turned around on the way: what decision 3 worried about
   * was a stale gated page, and network first is what stops one.
   *
   * The rule the README carries is the same either way, which is why only the
   * first half of this moved. `tests/phase14-test.mjs --only=worker` is where
   * the worker's own behaviour is asserted; this stays a check that the two
   * halves agree with each other.
   * ---------------------------------------------------------------------- */

  check(
    '164. this site has a service worker, and its README carries the VERSION rule',
    existsSync(join(DOCS, 'sw.js')) &&
      // Case insensitive: the sentence used to open with "Once this site has a
      // worker of its own, bump ..." and now opens with "Bump", because the
      // condition it was waiting on has happened.
      /bump its `VERSION` on\s+every\s+change to this site/i.test(docsReadme),
    'phase 14 part 4 reversed decision 3; the README has to have moved with it'
  );

  /* --- What the phase says about itself --------------------------------- */

  const buildStatus = JSON.parse(readFileSync(join(REPO, 'main-site/assets/build-status.json'), 'utf8'));
  const phase13 = (buildStatus.phases ?? []).find((phase) => phase.number === 13);

  check(
    '165. build-status.json knows what phase 13 is doing',
    phase13 !== undefined && ['building', 'shipped'].includes(phase13.status),
    `phase 13 reads ${phase13?.status ?? 'nothing'}`
  );

  // **The order is walk, lift, then flip**, settled 2 September 2026 and
  // recorded in section 5 item 24. A phase reading `shipped` on /status while
  // three panels read "switched off" is a strange thing to advertise, so the
  // two are checked against each other in the one direction that matters.
  const staffAccount = readFileSync(join(DOCS, 'api/_lib/staff-account.js'), 'utf8');
  const held = /HELLO_WRITES_ENABLED\s*=\s*false/.test(staffAccount);

  console.log(`      the hold on the gftv.asia writes is ${held ? 'on' : 'lifted'}`);

  check(
    '166. the phase does not read shipped while the gftv.asia writes are still held',
    !(held && phase13?.status === 'shipped'),
    'section 5 item 24: walk, lift, then flip, and this is the half a file can check'
  );

  /* --- The one link on this page that leaves both sites ------------------ */

  // **A 200 is not a page here.** gftv.asia is a one page app with a catch all,
  // so https://gftv.asia/account answered 200 while serving the same shell as
  // everything else -- a reader sent to the wrong view, and no status code, no
  // fetch and no link checker able to say so. It shipped on both sites from
  // part 6 and was found on 3 September 2026 by somebody pressing the button
  // during item 24's walk, which is the whole argument for that walk existing.
  //
  // Both halves, because 5f asks for this link on both sites and they are set
  // in two different files: the portal's in its own markup, the docs site's in
  // shell.js's route table. One fixed and one missed is the failure this pair
  // exists to make loud.
  const accountUrls = [
    ['the portal', readFileSync(join(REPO, 'main-site/admin/security/index.html'), 'utf8')],
    ['the docs site', readFileSync(join(DOCS, 'assets/js/shell.js'), 'utf8')],
  ];

  // **The attribute, not the file.** Both of these carry a comment explaining
  // why the root is right, and a comment has to be free to name the address it
  // is warning about -- a check that greps the whole source forbids its own
  // explanation, which is what the first version of this did.
  for (const [where, source] of accountUrls) {
    const values = [...source.matchAll(/data-account-url="([^"]*)"/g)].map((match) => match[1]);
    check(
      `167${where === 'the portal' ? '' : 'a'}. ${where} sends staff to gftv.asia's root and not to a path under it`,
      values.length > 0 && values.every((value) => value === 'https://gftv.asia'),
      `${JSON.stringify(values)} — a client routed catch all answers 200 for a path it does not have`
    );
  }
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 13 verification');
  console.log('  no section needs a credential; only `live` needs the network');

  // A mistyped --only= otherwise runs nothing and exits 0, which reads exactly
  // like a clean run.
  const unknown = (ONLY ?? []).filter((name) => !SECTIONS.some((entry) => entry.name === name));
  if (unknown.length > 0) {
    console.error(`\nNo such section: ${unknown.join(', ')}`);
    console.error(`Sections: ${SECTIONS.map((entry) => entry.name).join(', ')}`);
    process.exit(1);
  }

  writeFixtures();

  try {
    const first = build();
    if (first.code !== 0) {
      console.error('\nThe build failed before any check ran:');
      console.error(first.out);
      process.exit(1);
    }

    for (const entry of SECTIONS) {
      if (ONLY && !ONLY.includes(entry.name)) continue;
      section(entry.title);
      try {
        await entry.fn();
      } catch (cause) {
        check(`${entry.name} threw`, false, String(cause?.stack ?? cause));
      }
    }
  } finally {
    // The fixtures go, and the output is rebuilt without them, so a run leaves
    // the tree exactly as it found it.
    clearFixtures();
    build();
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const item of failures) console.log(`  ${item.section} — ${item.name}`);
  }
  if (skips.length > 0) {
    console.log('\nSkipped:');
    for (const item of skips) console.log(`  ${item.section} — ${item.name}: ${item.why}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((cause) => {
  clearFixtures();
  console.error(cause);
  process.exit(1);
});
