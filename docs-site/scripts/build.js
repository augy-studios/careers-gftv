#!/usr/bin/env node
// The docs site's build. Run from the project root:
//
//   node scripts/build.js
//
// It is this project's Vercel Build Command, named in vercel.json so that the
// project settings have nothing to remember, and it is **the one build step in
// this repository**. 16e states the exception and gives the reason: hand
// maintaining a shared sidebar and header across thirty files is how
// documentation rots. It does not license one on the portal, which still has
// none, and decision 2 fixed its shape -- deploy time, Node built-ins only, no
// dependency of any kind. The markdown renderer it uses is the same module the
// browser uses, and there is no second copy of the layout anywhere.
//
// What it writes, and where each thing goes:
//
//   dist/                      **everything the world may fetch, and nothing
//                              else.** It is the project's outputDirectory, so
//                              a file that is not copied in here is not a URL.
//                              That is what keeps content/*.md from being served
//                              as raw markdown beside the pages built from it.
//     index.html, ...          one static page per public page, the shell with
//                              its article already filled in
//     assets/, shell.html      copied as they are; the shell still serves every
//                              gated address through the rewrite
//     screenshots/...          public/ copied in, per 16g
//     search-index.json        the public search index
//     robots.txt               the three discovery files, part 8, written from
//     sitemap.xml              the same `access` key that drives the gate. See
//     llms.txt                 scripts/discovery.js for why they are files here
//                              and functions on the portal.
//
//   api/_generated/            **not public.** Written for the functions to
//     search-poster.json       read, and carried to them by the includeFiles
//     search-admin.json        entry in vercel.json.
//     search-developer.json
//     updated.json
//
// **The split is the whole security argument**, per 16e: "the public index is a
// static file. The gated index is served per role by api/search-index, built at
// deploy time into one file per tier and never merged into the public one.
// Check it: a public reader must not be able to find a developer page's heading
// in search, which is exactly the mistake a single index makes easy." The two
// halves are written into two different directories by the loop below, and the
// public one is built from the public tree alone.
//
// **It fails rather than coping.** A page with no `access` key stops the build,
// which is 16e's own instruction; so does a gated page pointing at a public
// image, an image with no file behind it, and a shell that no longer carries a
// marker this script fills in. A build that quietly produced a site missing a
// page is the failure this whole arrangement exists to make impossible.
//
// **This file is a `.js` in a directory that now has its own package.json**, and
// that is worth one sentence because it is the kind of thing that breaks a
// deployment at 2am. `scripts/package.json` arrived with part 8 to keep
// Playwright and sharp out of both deployed projects, per 16g. Node resolves a
// module's type from the *nearest* package.json, so that file has to carry
// `"type": "module"` or this script stops parsing as ESM and the Vercel build
// fails on its first import. It does carry it, and `tests/phase14-test.mjs`
// checks that it still does.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { loadPages, readablePage, frontMatter, projectRoot } from '../api/_lib/pages.js';
import { ACCESS_VALUES } from '../api/_lib/tiers.js';
import { render, IMAGE } from '../assets/js/markdown.js';
import { SHOTS, SHOTS_BY_NAME, filesFor, markdownSrc } from './screenshots.manifest.js';
import { INDEXING, DISALLOW, robotsBody, sitemapXml, llmsTxt } from './discovery.js';

const ROOT = projectRoot();
const REPO = resolve(ROOT, '..');
const DIST = join(ROOT, 'dist');
const GENERATED = join(ROOT, 'api/_generated');

const problems = [];
const fail = (message) => problems.push(message);

/* -------------------------------------------------------------------------
 * The last updated date, from git
 * ---------------------------------------------------------------------- */

/**
 * Every page's most recent commit date, as a map of repository relative path to
 * an ISO date.
 *
 * One `git log` and not one per file: thirty processes to answer thirty
 * questions git can answer in a single pass. The output is newest first, so the
 * first date a path appears under is its last change.
 *
 * **A page git cannot date carries no date at all.** Phase 12's rule -- a gap is
 * data, and nothing is allowed to fill it in -- and there are two honest ways to
 * arrive at one: a page that has never been committed, and a page older than the
 * clone Vercel made, which is shallow. Both draw as no date. Neither draws as
 * today, which would be this build claiming a page was reviewed on the day it
 * happened to be deployed.
 */
function gitDates() {
  const dates = new Map();

  let output;
  try {
    output = execFileSync(
      'git',
      ['log', '--format=%cI', '--name-only', '--', 'docs-site/content', 'docs-site/api/_content'],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch {
    // No git, or no repository. Every page carries no date, and the pages say so
    // by leaving the line out.
    return dates;
  }

  // A commit's date, then its files. The two are told apart by shape and not by
  // a separator: an ISO timestamp is not a path anything in either tree can
  // have, and a marker character would have to be one no file name may contain.
  let date = null;
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      date = trimmed.slice(0, 10);
      continue;
    }
    if (trimmed === '' || date === null || dates.has(trimmed)) continue;
    dates.set(trimmed, date);
  }

  return dates;
}

const repoPath = (file) => relative(REPO, file).split(sep).join('/');

/* -------------------------------------------------------------------------
 * The shell, filled in
 * ---------------------------------------------------------------------- */

const shell = readFileSync(join(ROOT, 'shell.html'), 'utf8');
// The tab title is one string in the dictionary and not a separator written
// here, so that a static page and a gated one cannot be worded apart -- and so
// that phase 14 translates it once.
const dictionary = JSON.parse(readFileSync(join(ROOT, 'assets/i18n/en.json'), 'utf8'));
const tabTitle = (title) =>
  dictionary['page.tabTitle']
    .replace('{title}', title)
    .replace('{site}', dictionary['shell.siteName']);

/**
 * This site's own origin, read off the shell's canonical link.
 *
 * **Read rather than written down here**, which is the same instinct as every
 * other marker below: the head has to carry the origin anyway, because a card
 * scraper never runs the page and cannot be handed one at runtime. Writing it a
 * second time in this file would be two copies of an address that changes once
 * and has to change in both, and the failure would be silent -- every card
 * pointing at a hostname the site no longer answers on.
 */
const ORIGIN = (() => {
  const found = shell.match(/<link rel="canonical" href="(https?:\/\/[^"]+)"/);
  if (!found) {
    fail(
      'shell.html: no canonical link to read the origin from. Every page\'s ' +
        'og:url and canonical are built from it, so it cannot be removed there alone.'
    );
    return '';
  }
  return found[1].replace(/\/$/, '');
})();

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Replace exactly one thing, and refuse to guess.
 *
 * The same instinct as `gen-docs-lib.js`'s rules, for the same reason: this
 * script depends on markup it does not own, and the failure it has to avoid is
 * writing thirty pages that quietly lost their title. A marker that matches
 * twice is as wrong as one that matches nothing.
 */
function replaceOnce(source, pattern, replacement, what, where = 'shell.html') {
  // The source's own flags are kept and `g` added, so a caller that needs `m`
  // for a line anchored marker gets it. Without this the flags were dropped and
  // a multiline pattern counted zero matches while replacing one, which is the
  // half working state this function exists to make impossible.
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const hits = [...source.matchAll(new RegExp(pattern.source, flags))].length;
  if (hits !== 1) {
    fail(
      `${where}: expected exactly one ${what}, found ${hits}. ` +
        'The build fills it in, so it cannot be renamed there alone.'
    );
    return source;
  }
  return source.replace(pattern, () => replacement);
}

/**
 * One public page, as a document.
 *
 * The article is filled in and marked `data-prerendered`, which is the flag
 * shell.js reads to know it has nothing to fetch. Everything else the shell
 * draws -- the sidebar, the breadcrumbs, the pager, the contents -- it draws
 * from the same functions it uses for a gated page, off the data block below.
 * **The only thing built twice would have been the chrome**, and it is not.
 */
function pageDocument(page, html, data) {
  let out = shell;

  out = replaceOnce(
    out,
    /<title[^>]*>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(tabTitle(page.title))}</title>`,
    'title element'
  );

  if (page.summary) {
    out = replaceOnce(
      out,
      /<meta name="description"[\s\S]*?>/,
      `<meta name="description" content="${escapeHtml(page.summary)}">`,
      'description meta'
    );
  }

  // The link card, per page. **Only a static page gets one**, and the shell's
  // own defaults are what a gated address keeps: the card is read by something
  // that is not signed in and never will be, so a gated page advertising its own
  // title and summary in a preview would be 16e's leak arriving through a meta
  // tag instead of through the sitemap.
  const url = `${ORIGIN}${page.path === '/' ? '/' : page.path}`;

  out = replaceOnce(
    out,
    /<link rel="canonical"[\s\S]*?>/,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    'canonical link'
  );
  out = replaceOnce(
    out,
    /<meta property="og:url"[\s\S]*?>/,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    'og:url meta'
  );
  out = replaceOnce(
    out,
    /<meta property="og:title"[\s\S]*?>/,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    'og:title meta'
  );
  if (page.summary) {
    out = replaceOnce(
      out,
      /<meta property="og:description"[\s\S]*?>/,
      `<meta property="og:description" content="${escapeHtml(page.summary)}">`,
      'og:description meta'
    );
  }

  out = replaceOnce(
    out,
    /<article class="docs-article" id="docsArticle"><\/article>/,
    `<article class="docs-article" id="docsArticle" data-prerendered>${html}</article>`,
    'article element'
  );

  // The one place a JSON blob goes into markup. `<` is escaped so that a page
  // title containing "</script>" is a string and not the end of this block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return replaceOnce(
    out,
    /<\/body>/,
    `<script type="application/json" id="docsPageData">${json}</script>\n</body>`,
    'closing body tag'
  );
}

/* -------------------------------------------------------------------------
 * The search index
 * ---------------------------------------------------------------------- */

/**
 * Split a page's source into the blocks its headings divide it into, so a search
 * result can name the heading it matched under and jump straight to that anchor,
 * per 16e.
 *
 * **The heading ids come from the renderer and are never worked out here.** This
 * function decides where a block ends; `render` decided what a heading is and
 * what it is called. The count is compared against the outline afterwards, and a
 * disagreement stops the build -- which is the check that keeps this from
 * becoming a second, quietly different, copy of the rule.
 */
function blocksOf(source, outline) {
  const blocks = [{ id: null, heading: null, lines: [] }];
  let fenced = false;
  let container = false;
  let seen = 0;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();

    if (fenced) {
      if (trimmed === '```') fenced = false;
      continue;
    }
    if (container) {
      if (trimmed === ':::') container = false;
      else blocks[blocks.length - 1].lines.push(line);
      continue;
    }
    if (trimmed.startsWith('```')) {
      fenced = true;
      continue;
    }
    if (/^:::\w/.test(trimmed)) {
      container = true;
      continue;
    }

    if (/^#{1,4}\s+\S/.test(line)) {
      const heading = outline[seen++];
      blocks.push({ id: heading?.id ?? null, heading: heading?.text ?? null, lines: [] });
      continue;
    }

    blocks[blocks.length - 1].lines.push(line);
  }

  return { blocks, seen };
}

/** A block's words, with the marks taken out. What search matches against. */
function plainText(lines) {
  return lines
    .join('\n')
    .replace(new RegExp(IMAGE.source, 'g'), ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, ' ')
    .replace(/^\s*>+\s?/gm, ' ')
    // A tab's label opens a panel and is not a sentence in one. Without this,
    // searching for "tab" finds every page that has one.
    .replace(/^\s*::+\w*/gm, ' ')
    .replace(/[*_`#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One index entry.
 *
 * Nothing is truncated. A guide's answer is as likely to be in its last
 * paragraph as its first, and an index that quietly stopped indexing a page
 * halfway would be a search that says a word appears nowhere while it is on the
 * screen behind it. If the file size ever becomes the problem, that is a
 * decision to take in the open and not a default to inherit.
 */
function indexEntry(page, body, sectionTitle, outline) {
  const { blocks, seen } = blocksOf(body, outline);

  if (seen !== outline.length) {
    fail(
      `${page.path}: the index found ${seen} headings and the renderer numbered ` +
        `${outline.length}. The two disagree about what a heading is, and a search ` +
        'result would point at the wrong anchor.'
    );
  }

  return {
    path: page.path,
    title: page.title,
    section: page.section,
    section_title: sectionTitle,
    summary: page.summary,
    blocks: blocks
      .map((block) => ({ id: block.id, heading: block.heading, text: plainText(block.lines) }))
      .filter((block) => block.text !== '' || block.heading !== null),
  };
}

/* -------------------------------------------------------------------------
 * Images
 * ---------------------------------------------------------------------- */

/**
 * Every image a page points at, checked against where its pipeline allows one to
 * be.
 *
 * 16e: "a gated page with a public screenshot is a leak with extra steps." So a
 * gated page may only carry a bare file name, which resolves to the file beside
 * it and is served through the authenticated route; an absolute path on one is
 * refused here rather than reviewed later. A public page is the mirror: its
 * images are in public/ and are written absolutely, so a bare name on one has no
 * directory to be in.
 */
function checkImages(page, body, assets, slots) {
  for (const match of body.matchAll(new RegExp(IMAGE.source, 'g'))) {
    const src = match[2];

    // **A `.webp` is one of 16g's screenshots and a marker is one waiting to be
    // taken**, so both are collected for the reconciliation below and are held
    // to the manifest. Any other image type is not a screenshot: the capture
    // script writes webp and nothing else, and `ASSET_TYPES` allows four more
    // for the day a page wants a diagram. Those are checked for placement here
    // and are not asked to be in a manifest of captures.
    if (/^pending:/i.test(src)) {
      slots.push({ page, name: src.slice('pending:'.length).trim(), src, pending: true });
      continue;
    }

    if (src.toLowerCase().endsWith('.webp')) {
      slots.push({ page, name: shotNameFrom(src), src, pending: false });
    }

    const absolute = /^[a-z]+:/i.test(src) || src.startsWith('/');

    if (page.pipeline === 'gated') {
      if (absolute) {
        fail(
          `${page.path}: the image "${src}" is an address outside this page. A gated ` +
            "page's images sit beside it and are written as a file name, so that they " +
            'go through the same session check the page did.'
        );
        continue;
      }
      const beside = `${page.isIndex ? page.path : page.path.replace(/\/[^/]*$/, '')}/${src}`;
      if (!assets.has(beside)) {
        fail(`${page.path}: the image "${src}" is not a file beside it.`);
      }
      continue;
    }

    if (!absolute) {
      fail(
        `${page.path}: the image "${src}" has no directory. A public page's images live ` +
          'in public/, per 16g, and are written as an absolute path.'
      );
    }
  }
}

/**
 * The shot a written image source names, whichever way it was written.
 *
 * `/screenshots/x.webp` on a public page and `x.webp` on a gated one are the two
 * forms `markdownSrc` produces, and this is its inverse. Anything else comes
 * back as the source itself, which will not be in the manifest and is reported
 * as such.
 */
function shotNameFrom(src) {
  const name = src.slice(src.lastIndexOf('/') + 1);
  return name.toLowerCase().endsWith('.webp') ? name.slice(0, -'.webp'.length) : src;
}

/**
 * 16g's manifest against the pages, in both directions, plus where each file is
 * allowed to be.
 *
 * **This is the check that makes the manifest safe to be a written list.**
 * `pages.js` refuses to hold one because a list somebody wrote is a list with
 * something missing from it; a screenshot has no filesystem to be derived from
 * before it is taken, so the manifest is written and this is what stops it
 * drifting. A slot naming no entry and an entry no slot names are both failures,
 * so neither half can be added alone.
 *
 * The tier rules are 16g's own sentence — "a shot for a gated page that lands in
 * the public directory is a build failure rather than a review comment" — and
 * they are checked from three sides: the manifest's tier against the page's
 * pipeline, the manifest's sections against the page's section, and the file on
 * disk against the directory `filesFor` says it belongs in.
 */
function checkScreenshots(slots, assets) {
  const referenced = new Set();

  for (const { page, name, src, pending } of slots) {
    const shot = SHOTS_BY_NAME.get(name);

    if (!shot) {
      fail(
        `${page.path}: the image "${src}" names no shot in scripts/screenshots.manifest.js. ` +
          'Every picture on this site is one of 16g\'s captures, and the manifest is the list.'
      );
      continue;
    }

    referenced.add(name);

    // The tier, from the two ends. A public page may only carry a public shot,
    // and a gated page may only carry one written for a section it is in.
    if (page.pipeline === 'public' && shot.tier !== 'public') {
      fail(
        `${page.path}: "${name}" is a ${shot.tier} shot on a public page. ` +
          'A gated screenshot on a page anybody can read is 16e\'s leak with extra steps.'
      );
    } else if (page.pipeline === 'gated' && shot.tier === 'public') {
      fail(
        `${page.path}: "${name}" is a public shot on a gated page. It would be fetched ` +
          'from public/, which tells a signed out reader the gated page exists.'
      );
    } else if (page.pipeline === 'gated' && !(shot.sections ?? []).includes(page.section)) {
      fail(
        `${page.path}: "${name}" is not written into the ${page.section} section. ` +
          `Its sections are: ${(shot.sections ?? []).join(', ') || 'none'}. An asset is gated ` +
          'at its section\'s own level, so a file in another section is not reachable from here.'
      );
    }

    if (pending) continue;

    // A written source has to be the one `markdownSrc` produces, so the two
    // pipelines cannot be written each other's way round and pass the looser
    // check above.
    if (src !== markdownSrc(shot)) {
      fail(
        `${page.path}: "${name}" is written as "${src}" and belongs as "${markdownSrc(shot)}". ` +
          'A public shot is an absolute path into public/; a gated one is a bare file name.'
      );
    }

    // And the file has to be there. The gated half is already in the `assets`
    // map the loader built; the public half is on disk under public/, which
    // nothing else in this build looks at.
    if (shot.tier === 'public' && !existsSync(join(ROOT, `public/screenshots/${name}.webp`))) {
      fail(`${page.path}: "${name}" has no file at public/screenshots/${name}.webp.`);
    }
  }

  for (const shot of SHOTS) {
    if (referenced.has(shot.name)) continue;
    fail(
      `scripts/screenshots.manifest.js: "${shot.name}" is in the manifest and no page points ` +
        'at it. A shot nobody points at is a file nobody reviews; add the slot or remove the entry.'
    );
  }

  // 16g's build failure, checked against the disk rather than against intent: a
  // gated shot that has found its way into the public directory is world
  // readable whatever every page says.
  for (const shot of SHOTS) {
    if (shot.tier === 'public') continue;
    if (existsSync(join(ROOT, `public/screenshots/${shot.name}.webp`))) {
      fail(
        `public/screenshots/${shot.name}.webp: a ${shot.tier} tier shot in the public directory. ` +
          `Everything in public/ is copied into dist/ and is world readable. It belongs at ` +
          `${filesFor(shot).join(' and ')}.`
      );
    }
  }

  // And the mirror: a `.webp` beside a gated page that no shot claims. Scoped to
  // the one extension the capture script writes, so the rule stays "every
  // screenshot is in the manifest" and does not become "this site may only ever
  // carry screenshots" — which is true today and is not a thing to enforce.
  for (const path of assets.keys()) {
    if (!path.toLowerCase().endsWith('.webp')) continue;
    const name = shotNameFrom(path);
    if (!SHOTS_BY_NAME.has(name)) {
      fail(
        `${path}: no shot in the manifest is written into this file. ` +
          'Screenshots are captured by scripts/capture.mjs and are never added by hand.'
      );
    }
  }
}

/* -------------------------------------------------------------------------
 * The service worker's precache list
 * ---------------------------------------------------------------------- */

/**
 * Every address under a directory of `dist/`, as the browser would ask for it.
 *
 * Files and not routes, so no `cleanUrls` reasoning applies: `/assets/css/docs.css`
 * is fetched by that name from the markup, and a font by the name `theme.css`
 * writes into it.
 */
function addressesUnder(root, prefix) {
  if (!existsSync(root)) return [];

  const found = [];
  const walk = (from, at) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(from, entry.name), `${at}/${entry.name}`);
      else found.push(`${at}/${entry.name}`);
    }
  };
  walk(root, prefix);
  return found.sort();
}

/**
 * Write `dist/sw.js` from `sw.js`, with the precache list filled in.
 *
 * **The list is generated because this project has a build step**, which 16e
 * makes it the stated exception for. The portal writes its list by hand and
 * `node check-precache.js` fails on an entry that is not on disk; that check
 * exists because a hand written list can name a file that is not there. Here
 * the list is the files that are there, so the failure it guards against is not
 * available to make.
 *
 * The marker is replaced with `replaceOnce`, like every other marker this
 * script depends on: a worker that quietly lost its list would precache nothing
 * and report that everything was fine.
 */
function writeWorker(pagePaths) {
  const source = readFileSync(join(ROOT, 'sw.js'), 'utf8');

  const entries = [
    // The fallback for any address that was never cached. It has to be first in
    // the file it is needed from, so it is first here as well.
    '/shell.html',
    ...pagePaths.sort(),
    '/search-index.json',
    ...addressesUnder(join(DIST, 'assets'), '/assets'),
    // Whatever `public/` holds, which is the brand images today and 16g's
    // screenshots from part 8. Both are wanted offline: a guide with a missing
    // screenshot is a guide with a step missing. Read from `public/` and not
    // from `dist/`, so this cannot pick up the pages the loop above wrote.
    ...addressesUnder(join(ROOT, 'public'), ''),
  ];

  const list = entries.map((entry) => `  '${entry}',`).join('\n');

  // `\r?` because this repository is checked out with CRLF on Windows, and a
  // `$` anchor after a carriage return matches nothing. Found on the first run.
  const out = replaceOnce(
    source,
    /^ {2}\/\* BUILD:PRECACHE \*\/\r?$/m,
    list,
    'BUILD:PRECACHE marker',
    'sw.js'
  );

  writeFileSync(join(DIST, 'sw.js'), out);
  return entries.length;
}

/* -------------------------------------------------------------------------
 * The discovery files
 * ---------------------------------------------------------------------- */

/**
 * Write `robots.txt`, `sitemap.xml` and `llms.txt` into `dist/`.
 *
 * **The list is the public pages this build wrote, and there is no second one.**
 * That is the whole argument for generating these: the `access` key decides who
 * may read a page, `pages.js` turns it into an answer for a request, and this
 * turns the same key into three files for a crawler. A gated page cannot be in
 * the sitemap because it never became a static path.
 *
 * Files rather than functions, unlike the portal's. `scripts/discovery.js` has
 * the reasoning; the short version is that nothing here depends on a database or
 * a switch, so a route would repeat on every request a computation the build
 * already did once.
 *
 * @param {string[]} publicPaths every page written into dist/
 * @param {Record<string,string>} updated each page's git date, where it has one
 * @param {Array<object>} sections the loader's sections, both pipelines
 * @param {Map<string, object>} pages every page by path, for the home page
 */
function writeDiscovery(publicPaths, updated, sections, pages) {
  writeFileSync(join(DIST, 'robots.txt'), robotsBody({ indexing: INDEXING, site: ORIGIN }));

  writeFileSync(
    join(DIST, 'sitemap.xml'),
    sitemapXml({ site: ORIGIN, paths: [...publicPaths].sort(), lastmod: updated })
  );

  // The home page is listed on its own above the sections, because it belongs to
  // none of them and a model reading a flat list of guides would otherwise never
  // be told where the site starts.
  const listed = sections
    .filter((section) => section.pipeline === 'public')
    .map((section) => ({
      title: section.title,
      pages: section.pages.map((page) => ({
        path: page.path,
        title: page.title,
        summary: page.summary,
      })),
    }));

  const home = publicPaths.includes('/') ? pages.get('/') : null;
  const homePage = home ? { path: '/', title: home.title, summary: home.summary } : null;

  writeFileSync(join(DIST, 'llms.txt'), llmsTxt({ site: ORIGIN, sections: listed, home: homePage }));

  return {
    listed: publicPaths.length,
    disallowed: DISALLOW.length,
    sections: listed.length,
  };
}

/* -------------------------------------------------------------------------
 * The build
 * ---------------------------------------------------------------------- */

function build() {
  // Throws, naming every problem it found, on anything wrong with either tree --
  // a missing `access` key included, which is 16e's "fail the build" and is why
  // nothing here catches it.
  const { pages, assets, sections } = loadPages({ fresh: true });

  const dates = gitDates();
  const sectionTitles = new Map(
    sections.map((section) => [`${section.pipeline}:${section.slug}`, section.title])
  );

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  mkdirSync(GENERATED, { recursive: true });

  // The shell and the assets as they are. The shell is still what serves every
  // gated address, and it is the file each page below was built from.
  cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'shell.html'), join(DIST, 'shell.html'));

  // 16g's screenshots, whose contents become addresses at the root: a shot at
  // public/screenshots/x.webp is /screenshots/x.webp, which is how a public page
  // writes it.
  if (existsSync(join(ROOT, 'public'))) {
    cpSync(join(ROOT, 'public'), DIST, { recursive: true });
  }

  const updated = {};
  const publicIndex = [];
  // Every image slot on the site, pending or taken, collected as the pages are
  // read and reconciled against 16g's manifest once they all have been. In one
  // pass, so the two lists are always describing the same tree.
  const slots = [];
  // The addresses the worker precaches, collected as each page is written so
  // the list is the pages that exist and never a second answer to that question.
  const publicPaths = [];
  const gatedIndex = new Map(ACCESS_VALUES.filter((tier) => tier !== 'public').map((t) => [t, []]));

  let written = 0;

  for (const page of pages.values()) {
    const source = readFileSync(page.file, 'utf8');
    const body = frontMatter(source)?.body ?? source;
    const date = dates.get(repoPath(page.file)) ?? null;
    if (date) updated[page.path] = date;

    checkImages(page, body, assets, slots);

    // A reader at exactly this page's tier, which is the one reader every page
    // has. For a public page that is a signed out one, and the neighbours below
    // are the neighbours they get.
    const found = readablePage(page.path, page.access);
    const { html, outline } = render(body, { assetBase: found?.assetBase ?? null });
    const entry = indexEntry(page, body, sectionTitles.get(`${page.pipeline}:${page.section}`), outline);

    if (page.pipeline === 'gated') {
      gatedIndex.get(page.access).push(entry);
      continue;
    }

    publicIndex.push(entry);

    // The neighbours a signed out reader gets, which are the only neighbours a
    // static page can carry: it is one file, served to everybody, and 16e's
    // "previous and next never point at a page the reader cannot open" is
    // satisfied for every reader by pointing at public pages alone. A signed in
    // reader reading a public page sees the same pager, which is the honest
    // half of a static pipeline.
    const data = {
      // The same shape the content route sends, and named field by field: `file`
      // is an absolute path on a build machine and belongs in no payload, and a
      // spread with a delete after it is one edit away from shipping it.
      page: {
        path: page.path,
        title: page.title,
        access: page.access,
        summary: page.summary,
        section: page.section,
        pipeline: page.pipeline,
      },
      prev: found?.prev ?? null,
      next: found?.next ?? null,
      updated: date,
    };

    const out = join(DIST, page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, pageDocument(page, html, data));
    publicPaths.push(page.path);
    written += 1;
  }

  checkScreenshots(slots, assets);

  // The three discovery files, from the pages this build just wrote. Public
  // paths only, and they are the same list the worker precaches: a page that is
  // not a static file is not a URL a crawler can be sent to.
  const discovery = writeDiscovery(publicPaths, updated, sections, pages);

  // Before the problems check, so a marker that stopped matching stops the
  // build with everything else rather than being recorded after the last thing
  // that reads the list.
  const precached = writeWorker(publicPaths);

  if (problems.length > 0) {
    console.error(`The build stopped, with ${problems.length} to fix:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  writeFileSync(join(DIST, 'search-index.json'), JSON.stringify(publicIndex));
  for (const [tier, entries] of gatedIndex) {
    writeFileSync(join(GENERATED, `search-${tier}.json`), JSON.stringify(entries));
  }
  writeFileSync(join(GENERATED, 'updated.json'), JSON.stringify(updated));

  const dated = Object.keys(updated).length;
  console.log(`Built ${written} public pages into dist/.`);
  console.log(
    `Search: ${publicIndex.length} public entries in dist/search-index.json, ` +
      [...gatedIndex].map(([tier, entries]) => `${entries.length} ${tier}`).join(', ') +
      ' in api/_generated/.'
  );
  console.log(
    dated === pages.size
      ? `Dated all ${pages.size} pages from git.`
      : `Dated ${dated} of ${pages.size} pages from git; the rest carry no date.`
  );
  console.log(`The worker precaches ${precached} addresses, written into dist/sw.js.`);

  const pending = slots.filter((slot) => slot.pending).length;
  console.log(
    `Screenshots: ${SHOTS.length} in the manifest, ${slots.length - pending} taken, ` +
      `${pending} still pending.`
  );
  console.log(
    `Discovery: ${discovery.listed} pages in dist/sitemap.xml, ` +
      `${discovery.disallowed} prefixes disallowed, ` +
      `${discovery.sections} sections in dist/llms.txt.`
  );
}

build();
