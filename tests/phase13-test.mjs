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
  const gatedSentences = gatedIndexFor('developer')
    .flatMap((entry) => entry.blocks.map((entry) => entry.text))
    .filter((text) => text.length >= 30)
    .map((text) => text.slice(0, 30));
  check(
    '17. the public index holds no sentence from a gated page',
    gatedSentences.length > 0 && gatedSentences.every((text) => !publicText.includes(text)),
    `${gatedSentences.length} gated sentences compared`
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
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
  };

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

    // The filesystem, then the rewrite, in that order, which is Vercel's own and
    // is the reason the built pages take over from the shell without anything
    // being switched.
    const candidates = [
      join(DIST, url.pathname.slice(1)),
      join(DIST, `${url.pathname.slice(1)}.html`),
      join(DIST, 'shell.html'),
    ];
    const file = candidates.find((candidate) => existsSync(candidate) && extname(candidate) !== '');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
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
    '97. exactly two files write gftvhello_users, and both are staff-account.js',
    writers.length === 2 && writers.every((file) => file.endsWith('api/_lib/staff-account.js')),
    `wrote: ${writers.join(', ') || 'nothing'}`
  );

  const staffAccountLib = readFileSync(join(REPO, 'main-site/api/_lib/staff-account.js'), 'utf8');
  const updated = [...staffAccountLib.matchAll(/\.update\(\{\s*([a-z_]+)/g)].map((m) => m[1]);

  check(
    '98. and the only columns it writes are the two section 2 names',
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
    '99. every route that writes gftvhello_users is behind the hold',
    guarded.length === 5,
    `guarded: ${guarded.join(', ')}`
  );

  check(
    '100. and the two writers refuse on their own as well',
    staffAccountLib.split('if (!HELLO_WRITES_ENABLED) return false;').length - 1 === 2,
    'a route added later without the guard has to fail closed'
  );

  const accountPage = readFileSync(join(REPO, 'main-site/assets/js/staff-account.js'), 'utf8');

  check(
    `101. the hold is ${held ? 'on' : 'OFF'}, and the page draws it either way`,
    accountPage.includes('hello_writes_enabled') && accountPage.includes('heldNote()'),
    'lifting it is one line in staff-account.js and part 7 is where that happens'
  );

  // 5g's flow is refused at its first step and not at its last, which is the
  // one placement decision in the hold that costs somebody something if it is
  // wrong: this endpoint verifies a recovery code and reset-password spends it.
  const forgot = readFileSync(join(REPO, 'main-site/api/auth/staff/forgot-password.js'), 'utf8');

  check(
    '102. and 5g is held before a recovery code is ever verified',
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
    '103. the danger zone route and the page agree on all six actions',
    routeActions.length === 6 &&
      pageActions.length === 6 &&
      routeActions.every((action) => pageActions.includes(action)),
    `route: ${routeActions.join(', ')} / page: ${pageActions.join(', ')}`
  );

  // 5f: "There is no delete account." It is a sentence on the page and an
  // action nowhere, and this is the half a later edit is most likely to undo.
  check(
    '104. and none of them deletes the account',
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
    '105. every class the shared page writes is defined on the docs site',
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
    '106. the two code sets are four distinct tables across the two realms',
    tables.length === 4 && new Set(tables).size === 4,
    tables.join(', ')
  );

  /* ---- The pages, in a browser -------------------------------------- */

  // The stand in for the settings endpoints. **Everything it answers is a
  // fixture**: the point of this section is what the one shared module draws
  // from a payload, and the payloads that matter most are the awkward ones -- a
  // count that could not be read, a session on each site, a passkey from the
  // other one.
  const account = {
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
    // The state this ships in. The panel checks below are what the page draws
    // while the three writes that reach gftv.asia are switched off.
    hello_writes_enabled: false,
  };

  let signedIn = true;

  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
  };

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

    const candidates = [
      join(DIST, url.pathname.slice(1)),
      join(DIST, `${url.pathname.slice(1)}.html`),
      join(DIST, 'shell.html'),
    ];
    const file = candidates.find((candidate) => existsSync(candidate) && extname(candidate) !== '');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  await new Promise((resolve_) => server.listen(0, '127.0.0.1', resolve_));
  const base = `http://127.0.0.1:${server.address().port}`;

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
      '107. /account draws the settings suite inside the documentation shell',
      (await page.locator('#staffAccount .card').count()) >= 9 &&
        (await page.locator('.docs-sidebar').count()) === 1,
      '16d: the two pages with no article render inside the same shell'
    );

    const text = await page.locator('#staffAccount').innerText();

    check(
      '108. the password panel says the change reaches gftv.asia',
      /gftv\.asia/.test(text) && /one account/i.test(text),
      '5g requires that sentence in those words'
    );

    // The fixture's whole reason for existing.
    const recovery = await page.locator('[data-count-for="recovery"]').innerText();
    const backup = await page.locator('[data-count-for="backup"]').innerText();

    check(
      '109. a count that could not be read is drawn as unknown, not as zero',
      /could not be read/i.test(recovery) && /0/.test(backup),
      `recovery: ${recovery} / backup: ${backup}`
    );

    check(
      '110. a passkey says which site it was registered from',
      /jobs portal/i.test(text),
      '5f, and migration 039 is what makes it answerable'
    );

    check(
      '111. the trusted device list says it is the account’s and not this site’s',
      /including any trusted on the other/i.test(text) &&
        /earned per site/i.test(text),
      'deviation 125, and both halves or neither'
    );

    check(
      '112. the sessions panel labels both sites and marks this browser',
      /Documentation site/.test(text) && /Jobs portal/.test(text) && /This browser/.test(text),
      '5f: where the account is signed in, on both sites'
    );

    check(
      '113. and says plainly that it cannot name a device',
      /nothing about the device/i.test(text),
      'decision 10: what a row can say is what migration 038 put in it'
    );

    check(
      '114. the danger zone shows the five that are not held, and no delete account',
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
      '115. a signed in reader at /login is sent on rather than shown the form',
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
      '116. /login draws the sign in form in the same shell',
      (await page.locator('#docsUsername').count()) === 1 &&
        (await page.locator('.docs-sidebar').count()) === 1,
      '16b, and the header has linked here since part 4'
    );

    check(
      '117. "trust this device" is not on the password panel',
      (await page.locator('#docsTrustDevice').count()) === 0 &&
        (await page.locator('#docsStaySignedIn').count()) === 1,
      '5d: only offer it once the second factor has been satisfied'
    );

    check(
      '118. and the form links to the reset flow',
      /forgotten your password/i.test(text),
      '5g, and a recovery flow nobody can find is one nobody uses'
    );

    await context.close();
  }

  {
    const { context, page } = await open('/forgot-password');
    const text = await page.locator('#staffForgotPassword').innerText();

    check(
      '119. /forgot-password asks for a username and a recovery code',
      (await page.locator('#staffResetUsername').count()) === 1 &&
        (await page.locator('#staffResetCode').count()) === 1,
      "5g's flow mirrors 5c step for step"
    );

    check(
      '120. and says on its first panel that the reset reaches gftv.asia',
      /gftv\.asia/.test(text),
      'somebody who reads it at step 3 has already spent a recovery code'
    );

    check(
      '121. and that a recovery code is not a backup code',
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
      '122. a signed out reader at /account is sent to sign in',
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
    '77. the home page is a file the build wrote',
    home.status === 200 && home.body.includes('data-prerendered'),
    `${home.status}, prerendered=${home.body.includes('data-prerendered')}`
  );
  check(
    '78. and it carries its own title, not the shell\'s',
    /<title>Careers@GFTV documentation \|/.test(home.body),
    (/<title>([^<]*)/.exec(home.body) ?? [])[1] ?? ''
  );

  const page = await get('/portal/creating-an-account');
  check(
    '79. so does a page two levels down',
    page.status === 200 && page.body.includes('data-prerendered') && page.body.includes('docsPageData')
  );

  // **The output directory is the whole public surface.** Before the build
  // existed, this address served the file as text/markdown: a second address for
  // every public page, and the shape that would have served a gated one if the
  // trees had ever been arranged differently.
  const raw = await get('/content/portal/index.md');
  check(
    '80. the content tree is not served as markdown',
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
  check('81. the public search index is served', index.status === 200 && entries.length > 0);
  check(
    '82. and holds nothing from the staff half',
    !index.body.includes('/staff'),
    '16e, on the deployment this time'
  );

  const byParameter = await get('/api/content?path=/portal');
  check(
    '83. the content route answers a page',
    byParameter.status === 200 && byParameter.body.includes('"path":"/portal"'),
    `${byParameter.status}: ${byParameter.body.slice(0, 80)}`
  );

  // **The shape that never worked.** From part 3 until part 5 this was how the
  // route was addressed, and every request to it answered 404 while the local
  // stand in served it perfectly. It is checked here so that going back to it is
  // a failing check and not a silent outage.
  const byPath = await get('/api/content/portal');
  check('84. and the path shaped address answers nothing', byPath.status === 404);

  const homeRoute = await get('/api/content?path=');
  check(
    '85. the home page needs no alias',
    homeRoute.status === 200 && homeRoute.body.includes('"path":"/"'),
    'part 4 aliased it as /api/content/index, which cleanUrls redirected away'
  );

  const gated = await get('/api/content?path=/staff');
  check('86. a gated page is 404 to a stranger, and never 401', gated.status === 404);
  check(
    '87. the content route is never cached anywhere shared',
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
    '88. what the build wrote reached the functions',
    /^\d{4}-\d{2}-\d{2}$/.test(updated ?? ''),
    `updated: ${JSON.stringify(updated)} — includeFiles covers api/_generated, and the build ran first`
  );

  const search = await get('/api/search-index');
  check(
    '89. the gated index endpoint answers a stranger with an empty list',
    search.status === 200 && search.body.includes('"entries":[]'),
    'a 401 would confirm the size of what they cannot see'
  );

  const nav = await get('/api/nav');
  check(
    '90. and the sidebar names no staff page to a stranger',
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

    check('91. the live home page draws its article', (await live.locator('#docsArticle h1').count()) === 1);
    check('92. and its sidebar', (await live.locator('#docsSidebar a').count()) > 0);
    check(
      '93. and when it was last updated',
      /Last updated \d+ \w+ \d{4}/.test((await live.locator('#docsUpdated').textContent()) ?? ''),
      (await live.locator('#docsUpdated').textContent()) ?? ''
    );

    await live.fill('#docsSearch', 'telegram');
    await live.waitForSelector('.docs-result', { timeout: 15000 });
    check('94. and search answers over the live index', (await live.locator('.docs-result').count()) > 0);

    await live.goto(`${BASE}/staff/developer/start-here`, { waitUntil: 'networkidle' });
    check(
      '95. a gated page reads as "there is no page here" to a stranger',
      (await live.locator('.docs-state').count()) === 1,
      'the same words a page nobody wrote gets'
    );
    check(
      '96. and it asks a crawler not to index that',
      (await live.locator('meta[name="robots"]').count()) === 1
    );

    await context.close();
  } finally {
    await browser.close();
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
