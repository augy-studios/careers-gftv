// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
//
// The page list, read off the two content trees, and the gate applied to it.
//
// **The list is derived and never written down.** Phase 12's rule, which caught
// a review page rendering 223 of 1,728 strings while counting all of them: a
// list somebody wrote is a list with something missing from it, and what is
// missing is invisible. So membership comes from the filesystem, and the only
// thing a written value decides is order. Adding a page is adding a file.
//
// **A page's `access` key is the one thing that decides who may read it**, per
// 16e, and this file is where that key is turned into an answer. Both directions
// are checked, because the two mistakes are not the same size:
//
//   a gated page in content/     is a leak. Anything in the static root is world
//                                readable whatever the interface does.
//   a public page in _content/   is a page nobody can find, served through a
//                                function for no reason.
//
// Neither is allowed to load. The first is the reason 16e has two pipelines at
// all, and the second is what an author does when they put a file in the wrong
// place and the site quietly copes.
//
// **The two trees, and the URL each one occupies.**
//
//   content/            ->  /...        public, built to static HTML in part 5
//   api/_content/       ->  /staff/...  gated, served by api/content/[...page].js
//
// `/staff` is not a choice this part made. `main-site/vercel.json` has redirected
// /admin/docs to https://docs.careers.globalfurry.tv/staff since phase 8, and
// 16i lists that redirect as one of the cross links. The tree matches the URL so
// that neither has to be translated into the other.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { ACCESS_VALUES, tierRank, canRead } from './tiers.js';

/** Where the two trees live, relative to this project's root. */
const PUBLIC_DIR = 'content';
const GATED_DIR = 'api/_content';

/** The URL prefix each tree occupies. */
const GATED_PREFIX = '/staff';

/**
 * The project root, worked out once.
 *
 * Two candidates are tried because the answer differs between a Vercel function
 * and this file being imported by a script at the repo root. Vercel runs a Node
 * function with the project root as its working directory and places the
 * `includeFiles` entries relative to it; a script run from anywhere else has a
 * working directory that means nothing here. Walking up from this module's own
 * URL covers the second case and is checked against the directory that has to
 * exist either way.
 */
function projectRoot() {
  const fromModule = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const candidates = [process.cwd(), fromModule];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, PUBLIC_DIR))) return candidate;
  }

  throw new Error(
    `Could not find ${PUBLIC_DIR}/ from any of: ${candidates.join(', ')}. ` +
      'On Vercel this means the includeFiles entry in docs-site/vercel.json is ' +
      'missing or does not cover it.'
  );
}

/* -------------------------------------------------------------------------
 * Front matter
 * ---------------------------------------------------------------------- */

/**
 * Parse the front matter block at the top of a markdown file.
 *
 * The four keys, and what each one does:
 *
 *   title    required. The sidebar entry and the browser tab.
 *   access   required, one of the four in tiers.js. Nothing else decides who may
 *            read the page or which pipeline it goes through.
 *   order    optional. **On a section's index.md it orders the sections; on any
 *            other page it orders that page within its section.** Two meanings
 *            for one key because they are the same question asked at two levels,
 *            and a missing one sorts last by path so a new file is never
 *            invisible for want of a number.
 *   summary  optional. One line, for a section listing and a search result.
 *
 * Deliberately not YAML. Decision 2 settled that this site's build step is Node
 * built-ins only, and what the front matter holds is four scalar keys. A parser
 * that accepts nested structures would be inviting front matter to grow into a
 * place where page behaviour is configured, which is what the `access` key is
 * for and the only thing it is for.
 *
 * @param {string} source
 * @returns {{ data: Record<string,string>, body: string } | null} null when
 *          there is no front matter block at all
 */
export function frontMatter(source) {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return null;

  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;

  const block = text.slice(4, end + 1);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const data = {};

  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;

    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    if (key !== '') data[key] = value;
  }

  return { data, body };
}

/* -------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------- */

function markdownFiles(root, directory) {
  const here = join(root, directory);
  if (!existsSync(here)) return [];

  const out = [];
  const walk = (relativePath) => {
    const entries = readdirSync(join(here, relativePath), { withFileTypes: true });
    for (const entry of entries) {
      const next = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }
      if (entry.name.toLowerCase().endsWith('.md')) out.push(next);
    }
  };

  walk('');
  return out.sort();
}

/**
 * Read one tree into page records, collecting every problem instead of throwing
 * on the first. An author who has three pages missing an `access` key should be
 * told about three of them.
 */
function readTree(root, directory, pipeline, prefix, problems) {
  const pages = [];

  for (const relativePath of markdownFiles(root, directory)) {
    const where = `${directory}/${relativePath}`;
    const parsed = frontMatter(readFileSync(join(root, directory, relativePath), 'utf8'));

    if (!parsed) {
      problems.push(`${where}: no front matter block. Every page opens with one.`);
      continue;
    }

    const { data, body } = parsed;
    const segments = relativePath.replace(/\.md$/i, '').split('/');
    const isIndex = segments[segments.length - 1] === 'index';
    const slugs = isIndex ? segments.slice(0, -1) : segments;

    // Two levels, and the second is the page. 16h describes four guides, each a
    // top level section, and the sidebar has to stay able to take another one
    // without rework -- which a third level would quietly turn into a rewrite.
    if (slugs.length > 2) {
      problems.push(`${where}: nested too deep. A page is a section and a page, and no more.`);
      continue;
    }

    const path = `${prefix}/${slugs.join('/')}`.replace(/\/$/, '') || '/';
    const title = (data.title ?? '').trim();
    const access = (data.access ?? '').trim();

    if (title === '') {
      problems.push(`${where}: no title.`);
    }

    // 16e, and the sentence is worth keeping whole: "fail the build on a page
    // with no access key. A page whose tier was forgotten must not default to
    // public, and defaulting to gated instead just means a page nobody notices
    // is missing."
    if (access === '') {
      problems.push(
        `${where}: no access key. It carries one of: ${ACCESS_VALUES.join(', ')}. ` +
          'There is no default, on purpose.'
      );
    } else if (tierRank(access) === null) {
      problems.push(`${where}: access is "${access}", which is not one of: ${ACCESS_VALUES.join(', ')}.`);
    } else if (pipeline === 'public' && access !== 'public') {
      problems.push(
        `${where}: access is "${access}" and this is the static tree. ` +
          `Anything under ${PUBLIC_DIR}/ is world readable whatever the interface does, ` +
          `so a gated page belongs in ${GATED_DIR}/.`
      );
    } else if (pipeline === 'gated' && access === 'public') {
      problems.push(
        `${where}: access is "public" and this is the gated tree. ` +
          `A public page served through a function is a page nobody can find; it belongs in ${PUBLIC_DIR}/.`
      );
    }

    const order = Number.parseInt(data.order ?? '', 10);

    pages.push({
      path,
      title,
      access,
      summary: (data.summary ?? '').trim() || null,
      order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
      pipeline,
      section: slugs.length === 2 || (isIndex && slugs.length === 1) ? slugs[0] : null,
      isIndex,
      // Never sent anywhere. It is how the content route reads a page without
      // ever building a filesystem path out of something a caller sent.
      file: join(root, directory, relativePath),
    });
  }

  return pages;
}

let cache = null;

/**
 * Every page on the site, both pipelines, unfiltered.
 *
 * Throws when anything is wrong with the trees, and the message names every
 * problem it found. Nothing catches it: a site whose page list cannot be read is
 * not a site that should answer requests with part of one.
 *
 * @param {{ fresh?: boolean }} [options]
 */
export function loadPages(options = {}) {
  if (cache && !options.fresh) return cache;

  const root = projectRoot();
  const problems = [];

  const pages = [
    ...readTree(root, PUBLIC_DIR, 'public', '', problems),
    ...readTree(root, GATED_DIR, 'gated', GATED_PREFIX, problems),
  ];

  const byPath = new Map();
  for (const page of pages) {
    if (byPath.has(page.path)) {
      problems.push(`${page.path}: two files claim this path.`);
      continue;
    }
    byPath.set(page.path, page);
  }

  // A section is a directory, so a directory with no index.md is a section with
  // no landing page and nothing for the sidebar to link its heading to.
  const sections = [];
  for (const page of pages) {
    if (page.section === null || !page.isIndex) continue;
    sections.push({
      slug: page.section,
      title: page.title,
      access: page.access,
      order: page.order,
      pipeline: page.pipeline,
      path: page.path,
      pages: [],
    });
  }

  const bySlug = new Map(sections.map((section) => [`${section.pipeline}:${section.slug}`, section]));
  for (const page of pages) {
    if (page.section === null) {
      // The two homes are the only pages that belong to no section. Anything
      // else sitting at the top of a tree would load, answer requests, and
      // appear in no sidebar -- which is the failure this whole file is arranged
      // to make impossible, arriving through the one door left open.
      if (page.path !== '/' && page.path !== GATED_PREFIX) {
        problems.push(
          `${page.path}: sits outside every section, so nothing would ever link to it. ` +
            'A page goes in a section directory; the two index pages are the only exceptions.'
        );
      }
      continue;
    }
    const section = bySlug.get(`${page.pipeline}:${page.section}`);
    if (!section) {
      problems.push(
        `${page.path}: its section has no index.md. Every section directory carries one, ` +
          'because it is what the sidebar heading links to.'
      );
      continue;
    }
    section.pages.push(page);
  }

  if (problems.length > 0) {
    throw new Error(`The documentation pages did not load:\n  ${problems.join('\n  ')}`);
  }

  const rank = (a, b) => a.order - b.order || a.path.localeCompare(b.path);

  // The public sections first, then the gated ones, and `order` decides within
  // each. The two trees number themselves independently -- they are written by
  // different people at different times -- so sorting on `order` alone would
  // interleave them and put the job poster guide between the portal guide and
  // the bot guide for anybody signed in.
  const PIPELINES = ['public', 'gated'];
  sections.sort(
    (a, b) => PIPELINES.indexOf(a.pipeline) - PIPELINES.indexOf(b.pipeline) || rank(a, b)
  );
  for (const section of sections) {
    // The index first, always. It is the section's own page and a sidebar that
    // buried it under an alphabetical accident would be one nobody trusts.
    section.pages.sort((a, b) => Number(b.isIndex) - Number(a.isIndex) || rank(a, b));
  }

  cache = {
    pages: byPath,
    sections,
    home: byPath.get('/') ?? null,
    staffHome: byPath.get(GATED_PREFIX) ?? null,
  };
  return cache;
}

/* -------------------------------------------------------------------------
 * The gate
 * ---------------------------------------------------------------------- */

/** What a page looks like once it leaves this module. No `file`, ever. */
function publicShape(page) {
  return {
    path: page.path,
    title: page.title,
    access: page.access,
    summary: page.summary,
    section: page.section,
    pipeline: page.pipeline,
  };
}

/**
 * The sidebar, filtered to one reader.
 *
 * 16a: "the sidebar renders only what the reader is entitled to. A signed out
 * reader sees the three public sections and a sign in link, not a wall of
 * padlocks. Locked entries teach nothing and invite guessing at URLs." So a
 * section the reader cannot open is absent, and so is a page inside one they
 * can: the two are filtered separately, because the tiers are cumulative and a
 * section's own tier is its floor and not its ceiling.
 *
 * @param {string} readerAccess from readerTier
 */
export function navFor(readerAccess) {
  const { sections, home, staffHome } = loadPages();

  const visible = [];
  for (const section of sections) {
    if (!canRead(readerAccess, section.access)) continue;
    const pages = section.pages.filter((page) => canRead(readerAccess, page.access));
    if (pages.length === 0) continue;
    visible.push({
      slug: section.slug,
      title: section.title,
      path: section.path,
      pipeline: section.pipeline,
      pages: pages.map(publicShape),
    });
  }

  return {
    home: home && canRead(readerAccess, home.access) ? publicShape(home) : null,
    staff_home: staffHome && canRead(readerAccess, staffHome.access) ? publicShape(staffHome) : null,
    sections: visible,
  };
}

/**
 * Reading order for one reader: the flat sequence the previous and next links
 * walk. Derived from the same filtered nav, which is what 16e asks for --
 * "previous and next never point at a page the reader cannot open" -- without
 * anything having to remember to apply the gate a second time.
 *
 * @param {string} readerAccess
 */
function readingOrder(readerAccess) {
  const nav = navFor(readerAccess);
  const flat = [];
  if (nav.home) flat.push(nav.home);
  for (const section of nav.sections.filter((s) => s.pipeline === 'public')) flat.push(...section.pages);
  if (nav.staff_home) flat.push(nav.staff_home);
  for (const section of nav.sections.filter((s) => s.pipeline === 'gated')) flat.push(...section.pages);
  return flat;
}

/**
 * The page at this path, if this reader may open it, with its neighbours.
 *
 * **Null covers both "there is no such page" and "not for you", and the caller
 * must not tell them apart.** 16a: a page above the reader's tier answers 404
 * and never 401, for the reason 8a already gave -- a 401 confirms the page
 * exists to anyone probing for it. Returning one value for both is what stops a
 * later edit accidentally splitting them into two responses.
 *
 * @param {string} path
 * @param {string} readerAccess
 * @returns {null | { page: object, file: string, prev: object|null, next: object|null }}
 */
export function readablePage(path, readerAccess) {
  const { pages } = loadPages();
  const page = pages.get(path);
  if (!page) return null;
  if (!canRead(readerAccess, page.access)) return null;

  const flat = readingOrder(readerAccess);
  const at = flat.findIndex((entry) => entry.path === path);

  return {
    page: publicShape(page),
    file: page.file,
    prev: at > 0 ? flat[at - 1] : null,
    next: at !== -1 && at < flat.length - 1 ? flat[at + 1] : null,
  };
}

/**
 * Turn the path segments of a request into a page path, or null.
 *
 * **Nothing built here ever reaches the filesystem.** The result is looked up in
 * the map loadPages built, so a caller sending `../../etc/passwd` gets a lookup
 * miss and a 404 like any other unknown path. The validation below is about
 * keeping the lookup key tidy, and is not what makes traversal impossible.
 *
 * @param {unknown} segments
 * @returns {string|null}
 */
export function pagePathFromSegments(segments) {
  const parts = Array.isArray(segments) ? segments : typeof segments === 'string' ? [segments] : [];
  if (parts.length === 0 || parts.length > 3) return null;

  const clean = parts.map((part) => String(part).trim());
  if (clean.some((part) => !/^[a-z0-9][a-z0-9-]*$/.test(part))) return null;

  return `/${clean.join('/')}`;
}
