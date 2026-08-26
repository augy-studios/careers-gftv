// Checks that every entry in the service worker's precache list is a file that
// actually exists.
//
//   node check-precache.js
//
// Written for phase 10 because that list is the one object in the phase that
// can switch every offline behaviour off at once, and it does it silently.
// sw.js adds its entries one at a time rather than through cache.addAll, so a
// bad path now costs one file instead of the whole install — but a file that
// is not there is still a page that does not work offline, and nothing on
// screen would ever say so.
//
// The failure this is really written for is the second kind: not a typo on the
// day the list is written, but a module renamed or deleted six phases later by
// somebody who has never opened sw.js. That is exactly how the entry ends up
// naming a file that is not there.
//
// What it does:
//
//   1. Reads the PRECACHE array out of main-site/sw.js. Not imported: sw.js is
//      a classic worker script that references `self` at the top level, so it
//      cannot be imported by node. The array is read as text.
//   2. Resolves every entry the way Vercel does with cleanUrls on, so
//      '/search' is checked against search/index.html and '/about' against
//      either about.html or about/index.html.
//   3. Exits non-zero on anything missing.
//
// It also lists files that exist and are not precached, which is information
// and not an error. Some of those absences are deliberate and are named in
// EXPECTED_ABSENT below, with the reason.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved against this file and not the working directory, so it behaves the
// same run from anywhere.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'main-site');
const SW = join(ROOT, 'sw.js');

// Absent from the precache list on purpose. Anything here is skipped by the
// "not precached" listing, so that listing stays worth reading.
const EXPECTED_ABSENT = {
  '404.html':
    'never navigated to by address. Vercel serves it for an unknown path, and ' +
    'offline this worker cannot tell an unknown path from an uncached one.',
  'placeholder.html':
    'reached only through a rewrite for an unbuilt route, same reasoning.',
  'HLC-main.png': 'the og:image. Only a crawler fetches it.',
  'HLC-512.png': 'manifest icon, read by the launcher at install time.',
  'HLC-192-maskable.png': 'manifest icon, same.',
  'HLC-512-maskable.png': 'manifest icon, same.',
  'images/install-narrow.png': 'an install dialog screenshot, not part of the site.',
  'images/install-wide.png': 'an install dialog screenshot, not part of the site.',
  'sw.js': 'this file. A worker does not precache itself.',
  'robots.txt': 'read by crawlers, which are never offline.',
  'vercel.json': 'not served.',
  'package.json': 'not served.',
  'package-lock.json': 'not served.',
  'AVATARS.md': 'documentation, not served.',
  'README.md': 'documentation, not served.',
  '.env.example':
    'a dotfile. Vercel does not deploy it: /.env.example answers 404 on ' +
    'production, checked 26 August 2026. It holds no real value either way.',
};

/* -------------------------------------------------------------------------
 * Reading the list out of sw.js
 * ---------------------------------------------------------------------- */

function precacheEntries() {
  const source = readFileSync(SW, 'utf8');

  const opened = source.indexOf('const PRECACHE = [');
  if (opened === -1) {
    console.error('Could not find "const PRECACHE = [" in main-site/sw.js.');
    process.exit(1);
  }

  const closed = source.indexOf('\n];', opened);
  if (closed === -1) {
    console.error('Found PRECACHE in main-site/sw.js but not the "];" that closes it.');
    process.exit(1);
  }

  const body = source.slice(opened, closed);

  // Comments first, or the worked examples in the block comment above the array
  // would be read as entries.
  const withoutComments = body.replace(/\/\/[^\n]*/g, '');

  return [...withoutComments.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/* -------------------------------------------------------------------------
 * Resolving a route to a file, the way cleanUrls does
 * ---------------------------------------------------------------------- */

/**
 * The candidate files an address could be served from.
 *
 * cleanUrls is on, so '/about' may be about.html or about/index.html and both
 * are correct. Anything carrying a file extension is taken literally.
 */
function candidates(entry) {
  if (entry === '/') return ['index.html'];

  const bare = entry.replace(/^\//, '');
  if (/\.[a-z0-9]+$/i.test(bare)) return [bare];

  return [`${bare}.html`, `${bare}/index.html`];
}

/* -------------------------------------------------------------------------
 * What is on disk
 * ---------------------------------------------------------------------- */

function servedFiles() {
  const out = [];

  function walk(directory) {
    for (const item of readdirSync(directory)) {
      // api/ is serverless functions, never a static asset. node_modules is not
      // deployed.
      if (item === 'node_modules' || item === 'api') continue;

      const full = join(directory, item);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      out.push(relative(ROOT, full).split('\\').join('/'));
    }
  }

  walk(ROOT);
  return out;
}

/* -------------------------------------------------------------------------
 * The check
 * ---------------------------------------------------------------------- */

const entries = precacheEntries();

if (entries.length === 0) {
  console.error('The PRECACHE array in main-site/sw.js parsed as empty.');
  process.exit(1);
}

const missing = [];
const resolved = new Set();
const duplicates = [];
const seen = new Set();

for (const entry of entries) {
  if (seen.has(entry)) duplicates.push(entry);
  seen.add(entry);

  const found = candidates(entry).find((relativePath) => existsSync(join(ROOT, relativePath)));
  if (found) resolved.add(found);
  else missing.push({ entry, tried: candidates(entry) });
}

const notPrecached = servedFiles()
  .filter((file) => !resolved.has(file))
  .filter((file) => !(file in EXPECTED_ABSENT));

console.log(`${entries.length} precache entries, ${resolved.size} resolved to a file.`);

if (duplicates.length > 0) {
  console.log(`\n${duplicates.length} listed more than once:`);
  for (const entry of duplicates) console.log(`  ${entry}`);
}

if (notPrecached.length > 0) {
  console.log(`\n${notPrecached.length} served files are not precached.`);
  console.log('Information, not an error. Add it to PRECACHE, or to');
  console.log('EXPECTED_ABSENT in this file with the reason.');
  for (const file of notPrecached) console.log(`  ${file}`);
}

if (missing.length > 0) {
  console.error(`\n${missing.length} precache entries name a file that does not exist:`);
  for (const item of missing) {
    console.error(`  ${item.entry}`);
    for (const tried of item.tried) console.error(`      tried main-site/${tried}`);
  }
  console.error('\nEvery one of these is a page or an asset that will not work offline.');
  process.exit(1);
}

console.log('\nEvery precache entry exists.');
