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

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { loadPages, readablePage, frontMatter, projectRoot } from '../api/_lib/pages.js';
import { ACCESS_VALUES } from '../api/_lib/tiers.js';
import { render, IMAGE } from '../assets/js/markdown.js';

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
function replaceOnce(source, pattern, replacement, what) {
  const hits = [...source.matchAll(new RegExp(pattern.source, 'g'))].length;
  if (hits !== 1) {
    fail(
      `shell.html: expected exactly one ${what}, found ${hits}. ` +
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
function checkImages(page, body, assets) {
  for (const match of body.matchAll(new RegExp(IMAGE.source, 'g'))) {
    const src = match[2];
    if (/^pending:/i.test(src)) continue;

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
  const gatedIndex = new Map(ACCESS_VALUES.filter((tier) => tier !== 'public').map((t) => [t, []]));

  let written = 0;

  for (const page of pages.values()) {
    const source = readFileSync(page.file, 'utf8');
    const body = frontMatter(source)?.body ?? source;
    const date = dates.get(repoPath(page.file)) ?? null;
    if (date) updated[page.path] = date;

    checkImages(page, body, assets);

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
    written += 1;
  }

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
}

build();
