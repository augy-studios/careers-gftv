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
//   content/            ->  /...        public, built to static HTML by the build
//   api/_content/       ->  /staff/...  gated, served by api/content.js
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
export function projectRoot() {
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

/**
 * Every file in one tree, split into the pages and everything else.
 *
 * The second half is 16e's "images for gated pages live beside them": a file
 * that is not a page, sitting in a section directory, is an asset that section's
 * pages may point at. Reading both in one walk is what keeps the two lists
 * describing the same directory.
 */
function treeFiles(root, directory) {
  const here = join(root, directory);
  if (!existsSync(here)) return { pages: [], assets: [] };

  const pages = [];
  const assets = [];
  const walk = (relativePath) => {
    const entries = readdirSync(join(here, relativePath), { withFileTypes: true });
    for (const entry of entries) {
      const next = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }
      if (entry.name.toLowerCase().endsWith('.md')) pages.push(next);
      else assets.push(next);
    }
  };

  walk('');
  return { pages: pages.sort(), assets: assets.sort() };
}

/**
 * The file types an asset may be, and what each is served as.
 *
 * **No SVG**, deliberately. An SVG is a document that can carry script, served
 * from this origin, and the one thing a gated asset is for is a screenshot.
 * Adding it would trade the whole of that argument for a file format nothing
 * here needs.
 */
export const ASSET_TYPES = Object.freeze({
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
});

/**
 * File types that may sit in the gated tree and have no address at all.
 *
 * **A data file is read by a page, and never by a URL.** Phase 13's decision 6
 * puts `test-scripts.json` in `api/_content/developer/` for the developer guide
 * to embed, and states the reason it must not also be fetchable: a raw path
 * would be a second entry point to a file whose only supported one is the page
 * explaining what it does. So the loader knows this kind exists -- otherwise the
 * first one committed would stop the site loading as an unrecognised file -- and
 * gives it nothing.
 */
const DATA_EXTENSIONS = ['.json'];

/**
 * The front matter key a page names its data file with, and the rules on it.
 *
 * **The file travels inside the page's own answer.** Phase 14 part 7 is the
 * page the paragraph above was written for, and this is the other half of that
 * decision: the content route reads the named file and sends it as a field
 * beside the markdown, so it goes through the session check the page went
 * through and has no address of its own to share, bookmark or script against.
 *
 * Three rules, each refusing at load time rather than at the request that would
 * have failed:
 *
 * - **A bare file name**, resolved against the directory the page sits in. A
 *   path would be a way to read a file from another section, which is the tier
 *   boundary crossed by a string in front matter.
 * - **`.json` only**, which is what `DATA_EXTENSIONS` above already says has no
 *   address. Naming a `.png` here would ask this route to send an image as a
 *   field of a JSON body.
 * - **The gated tree only.** A public page is a static file on the CDN and its
 *   data would have to be one too, which is a second public surface: exactly
 *   what putting the file behind the gate was for.
 */
const DATA_KEY = 'data';

/**
 * The address a page's bare image file names resolve against.
 *
 * A query parameter, because that is how the content route is addressed: part 5
 * found that a file based dynamic route binds nothing in a bare `api/` project
 * on Vercel, so there is no `/api/content/staff/admin/shot.webp` to point at.
 * The renderer appends `/shot.webp` to whatever this returns, which lands inside
 * the parameter and is exactly where it belongs.
 */
function assetBaseOf(path, isIndex) {
  const directory = isIndex ? path : path.replace(/\/[^/]*$/, '');
  return `/api/content?path=${directory === '/' ? '' : directory}`;
}

/**
 * Read one tree into page records, collecting every problem instead of throwing
 * on the first. An author who has three pages missing an `access` key should be
 * told about three of them.
 */
function readTree(root, directory, pipeline, prefix, problems) {
  const pages = [];
  const { pages: files, assets } = treeFiles(root, directory);

  // **A file in the public tree that is not a page is refused**, and the message
  // says where it belongs. 16g puts public screenshots in public/, which is
  // copied into the build output as it stands; a picture dropped in here would
  // be served from a directory the build does not publish and would render as a
  // broken image on a page nobody looked at again.
  if (pipeline === 'public') {
    for (const relativePath of assets) {
      problems.push(
        `${directory}/${relativePath}: not a page. A public image goes in public/, ` +
          'per 16g, and is linked by an absolute path.'
      );
    }
  }

  for (const relativePath of files) {
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

    const named = (data[DATA_KEY] ?? '').trim();
    let dataFile = null;

    if (named !== '') {
      const extension = named.slice(named.lastIndexOf('.')).toLowerCase();
      const beside = join(root, directory, relativePath, '..', named);

      if (pipeline !== 'gated') {
        problems.push(
          `${where}: ${DATA_KEY} is only for the gated tree. ` +
            `A public page is a file on the CDN and so is anything beside it.`
        );
      } else if (named.includes('/') || named.includes('\\') || named.startsWith('.')) {
        problems.push(
          `${where}: ${DATA_KEY} is "${named}". It is a bare file name beside the page, and never a path.`
        );
      } else if (!DATA_EXTENSIONS.includes(extension)) {
        problems.push(
          `${where}: ${DATA_KEY} is "${named}". Data files are one of: ${DATA_EXTENSIONS.join(', ')}.`
        );
      } else if (!existsSync(beside)) {
        problems.push(`${where}: ${DATA_KEY} names "${named}", and there is no such file beside the page.`);
      } else {
        dataFile = beside;
      }
    }

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
      // Null for every page but the one that names a data file. Same rule as
      // `file`: the path was built at load time from the tree, never from a
      // request.
      dataFile,
    });
  }

  return pages;
}

/**
 * The gated tree's assets: the files beside a page that are not pages.
 *
 * **An asset is gated at its section's own level**, and there is nothing in a
 * file for it to carry an `access` key in. That is the honest reading of a
 * directory whose sections are one per tier, and it fails safe in the one
 * direction that matters: an asset can never be more open than the section it
 * sits in, and the section is the thing a reader had to pass to be told the
 * image exists at all.
 */
function readAssets(root, directory, prefix, problems) {
  const out = [];

  for (const relativePath of treeFiles(root, directory).assets) {
    const where = `${directory}/${relativePath}`;
    const segments = relativePath.split('/');
    const name = segments[segments.length - 1];
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();

    if (DATA_EXTENSIONS.includes(extension)) continue;

    if (!Object.hasOwn(ASSET_TYPES, extension)) {
      problems.push(
        `${where}: ${extension || 'no extension'} is not something this site serves. ` +
          `Assets are one of: ${Object.keys(ASSET_TYPES).join(', ')}.`
      );
      continue;
    }

    if (segments.length !== 2) {
      problems.push(
        `${where}: an asset sits in a section directory beside the page that uses it, ` +
          'because the section is what decides who may fetch it.'
      );
      continue;
    }

    out.push({
      path: `${prefix}/${relativePath}`,
      section: segments[0],
      type: ASSET_TYPES[extension],
      file: join(root, directory, relativePath),
    });
  }

  return out;
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

  const assetFiles = readAssets(root, GATED_DIR, GATED_PREFIX, problems);

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

  const assets = new Map();
  for (const asset of assetFiles) {
    const section = bySlug.get(`gated:${asset.section}`);
    if (!section) {
      problems.push(
        `${asset.path}: its section has no index.md, so nothing says who may fetch it.`
      );
      continue;
    }
    if (assets.has(asset.path)) {
      problems.push(`${asset.path}: two files claim this path.`);
      continue;
    }
    assets.set(asset.path, { ...asset, access: section.access });
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
    assets,
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
    // The data file this page carries, or null. It goes out inside the page's
    // own answer, which is what keeps it behind the same check the page is
    // behind and gives it no address of its own.
    dataFile: page.dataFile ?? null,
    // Only a gated page has one. A public page's images are in public/ and are
    // written as absolute paths, per 16g, so a bare file name on one has no
    // directory to be in and the build refuses it.
    assetBase: page.pipeline === 'gated' ? assetBaseOf(page.path, page.isIndex) : null,
    prev: at > 0 ? flat[at - 1] : null,
    next: at !== -1 && at < flat.length - 1 ? flat[at + 1] : null,
  };
}

/**
 * The asset at this path, if this reader may fetch it.
 *
 * Null for both halves of the same pair the pages answer: no such file, and not
 * for you. **A screenshot of the admin interface is a list of applicants**, so
 * the file being unreadable and the file not existing look identical from
 * outside, exactly as 16a asks of a page.
 *
 * @param {string} path
 * @param {string} readerAccess
 * @returns {null | { file: string, type: string }}
 */
export function readableAsset(path, readerAccess) {
  const { assets } = loadPages();
  const asset = assets.get(path);
  if (!asset) return null;
  if (!canRead(readerAccess, asset.access)) return null;
  return { file: asset.file, type: asset.type };
}

/**
 * Turn the path segments of a request into a page path, or null.
 *
 * **Nothing built here ever reaches the filesystem.** The result is looked up in
 * the map loadPages built, so a caller sending `../../etc/passwd` gets a lookup
 * miss and a 404 like any other unknown path. The validation below is about
 * keeping the lookup key tidy, and is not what makes traversal impossible.
 *
 * The home page is not answered here: it is the one page with no segments at
 * all, and the route maps an empty parameter to it. It had an `/index` alias
 * while the address was a path, and part 5 took the alias away with the path.
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

/**
 * The same, for an asset: a file name in the last segment instead of a slug.
 *
 * **Nothing built here reaches the filesystem either.** The result is a key
 * looked up in the map the loader built, so a dot or a slash smuggled through a
 * segment is a lookup miss like any other. What the shape below does is decide
 * which of the two lookups a request is asking for, and a request that is
 * neither is a 404 without either map being consulted.
 *
 * @param {unknown} segments
 * @returns {string|null}
 */
export function assetPathFromSegments(segments) {
  const parts = Array.isArray(segments) ? segments : typeof segments === 'string' ? [segments] : [];
  if (parts.length === 0) return null;

  const clean = parts.map((part) => String(part).trim());
  const name = clean[clean.length - 1];

  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!Object.hasOwn(ASSET_TYPES, extension)) return null;
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9]+$/.test(name)) return null;
  if (clean.slice(0, -1).some((part) => !/^[a-z0-9][a-z0-9-]*$/.test(part))) return null;

  return `/${clean.join('/')}`;
}
