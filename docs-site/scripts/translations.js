// THIS SITE'S OWN FILE. Not generated.
//
// The 华文 tree, read off disk and checked against the pages it translates.
//
// ---------------------------------------------------------------------------
// Why there is a tree at all, when 16e says the translations live in Supabase
// ---------------------------------------------------------------------------
//
// They do, and they still do: the database is what every reader is served
// from, on both halves of the site and in the Telegram bot. What 16e does not
// say is where a translation is written before it gets there, and eighty two
// pages have to be written somewhere.
//
// Phase 14 part 9 settled it: **the files are the authoring source and the
// table is a copy the build writes, one direction.** Exactly the arrangement
// section 6 already gives gftvjobs_docs_pages, applied to the other table.
//
// What that buys, and it is the whole argument:
//
//   - **A translation is a diff.** The Chinese of a page sits beside the
//     English in the same commit, and a reviewer is sent a branch instead of
//     eighty two rows. This build's Chinese has never had a human pass; the
//     round trip in section 5 is what this shape is for.
//   - **A wipe costs nothing.** Drop both tables and the next deploy refills
//     them. Nothing here is the only copy of anything.
//   - **The table cannot drift from the tree**, because the build makes the
//     table match the tree every time it runs, deletions included.
//
// What it costs, said plainly: **changing one word means a commit and a
// deploy**, and a volunteer translator with no access to this repository
// cannot fix anything themselves. That is a real loss against the arrangement
// 16e imagined, where a helper edits a row and the gated half picks it up on
// the next request. Nothing edits those rows today, so what is lost is a
// surface that does not exist; whoever builds it re-reads this paragraph
// first, because the day it exists this decision is the thing standing in
// front of it.
//
// ---------------------------------------------------------------------------
// The shape of the tree, and why it is keyed by address
// ---------------------------------------------------------------------------
//
//   translations/zh/index.md              ->  /
//   translations/zh/portal/applying.md    ->  /portal/applying
//   translations/zh/staff/index.md        ->  /staff
//   translations/zh/staff/admin/index.md  ->  /staff/admin
//   translations/zh/staff/admin/daily-run.md -> /staff/admin/daily-run
//
// **One tree for both pipelines**, because a translation is keyed by the
// address and the address space is one. The English lives in two directories --
// content/ is on the CDN and api/_content/ is not -- and that split is about
// who may fetch a file, which is a question no file in here answers. A 华文
// tree split the same way would be inviting somebody to think it did.
//
// The tier is still decided in exactly one place: the English page's front
// matter. A file in here that carried an `access` key is refused, which is the
// same sentence 16e writes about the table and the same reason.
//
// ---------------------------------------------------------------------------
// What is not in a translation file
// ---------------------------------------------------------------------------
//
// No `order`, because the reading order is the English tree's and a section
// that sorted differently per language would be two sites. No `access`. No
// `data`, because the file a page embeds is the same file in every language.
// Three keys: title, summary, and the optional `ready` that holds a page back.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadPages, frontMatter, projectRoot } from '../api/_lib/pages.js';

/** Where the tree lives, relative to this project's root. */
export const TRANSLATIONS_DIR = 'translations';

/** The language the files themselves are written in, per 3a. */
export const BASE_LOCALE = 'en';

/**
 * The languages this site has, derived from the dictionaries on disk.
 *
 * **Derived and never written down**, which is phase 12's rule and the same one
 * pages.js opens with. Phase 15 adds Malay and Tamil as two dictionary files,
 * and this list grows without anybody remembering that it exists. A locale with
 * a translations directory and no dictionary is reported, because that is
 * somebody translating the guides into a language the interface cannot be read
 * in.
 */
export function localesOnDisk(root = projectRoot()) {
  const here = join(root, 'assets/i18n');
  if (!existsSync(here)) return [];

  return readdirSync(here)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((locale) => locale !== BASE_LOCALE)
    .sort();
}

/**
 * Where one page's translation goes, in one locale.
 *
 * The index rule is the loader's own: a section's landing page is `index.md`
 * inside the section's directory, so `/staff/admin` is a directory here and not
 * a file, and `/staff/admin/daily-run` can sit beside it.
 *
 * @param {{ path: string, isIndex: boolean }} page
 * @param {string} locale
 */
export function fileForPage(page, locale) {
  const tail =
    page.path === '/'
      ? 'index.md'
      : page.isIndex
        ? `${page.path.slice(1)}/index.md`
        : `${page.path.slice(1)}.md`;

  return `${TRANSLATIONS_DIR}/${locale}/${tail}`;
}

/** Every `.md` under one locale's directory, as tree relative paths. */
function filesUnder(root, locale) {
  const here = join(root, TRANSLATIONS_DIR, locale);
  if (!existsSync(here)) return [];

  const found = [];
  const walk = (at) => {
    for (const entry of readdirSync(join(here, at), { withFileTypes: true })) {
      const next = at === '' ? entry.name : `${at}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else found.push(next);
    }
  };

  walk('');
  return found.sort();
}

/**
 * The whole tree, checked against the pages it claims to translate.
 *
 * Collects every problem instead of throwing on the first, exactly as the page
 * loader does and for the same reason: somebody with three files in the wrong
 * place should be told about three of them.
 *
 * **Both directions are checked**, which is this repository's rule about any
 * list beside a derived one. A file naming a page that does not exist is a
 * translation nobody will ever read, and a page with no file is a page that
 * falls back to English -- so the first is a problem and the second is only
 * counted, because a partial translation is a state 3a explicitly allows and
 * the notice on the page is what says so.
 *
 * @param {{ root?: string }} [options]
 * @returns {{
 *   locales: string[],
 *   rows: Array<{ locale: string, path: string, title: string, summary: string|null,
 *                 body: string, ready: boolean, file: string, where: string }>,
 *   missing: Array<{ locale: string, path: string }>,
 *   problems: string[],
 * }}
 */
export function loadTranslations(options = {}) {
  const root = options.root ?? projectRoot();
  const { pages } = loadPages();
  const problems = [];
  const rows = [];
  const missing = [];

  const known = localesOnDisk(root);

  // A directory here for a language the interface has no dictionary for. It
  // would upsert rows against a locale gftvjobs_locales may not even carry, and
  // nothing would ever serve them.
  const treeRoot = join(root, TRANSLATIONS_DIR);
  const directories = existsSync(treeRoot)
    ? readdirSync(treeRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  for (const locale of directories) {
    if (locale === BASE_LOCALE) {
      problems.push(
        `${TRANSLATIONS_DIR}/${locale}/: the English is the files in content/ and ` +
          'api/_content/, per 16e. A second copy of it here would be free to disagree ' +
          'with the pages the site actually serves.'
      );
      continue;
    }
    if (!known.includes(locale)) {
      problems.push(
        `${TRANSLATIONS_DIR}/${locale}/: there is no assets/i18n/${locale}.json, so the ` +
          'interface cannot be read in this language. Add the dictionary, or take the ' +
          'directory away.'
      );
    }
  }

  // Which file each page expects, in each locale, so a file that matches none
  // of them can say what it should have been called.
  const expected = new Map();
  for (const locale of directories) {
    if (locale === BASE_LOCALE) continue;
    for (const page of pages.values()) {
      expected.set(fileForPage(page, locale), { page, locale });
    }
  }

  for (const locale of directories) {
    if (locale === BASE_LOCALE) continue;

    const seen = new Set();

    for (const relative of filesUnder(root, locale)) {
      const where = `${TRANSLATIONS_DIR}/${locale}/${relative}`;

      if (!relative.toLowerCase().endsWith('.md')) {
        problems.push(
          `${where}: not a page. A translation tree holds markdown and nothing else; ` +
            'an image is the same file in every language and lives beside the English.'
        );
        continue;
      }

      const match = expected.get(where);
      if (!match) {
        problems.push(
          `${where}: there is no page at this address. A translation is named for the ` +
            'page it translates, so this is either a page that has been renamed or a ' +
            'file in the wrong place.'
        );
        continue;
      }

      const parsed = frontMatter(readFileSync(join(root, where), 'utf8'));
      if (!parsed) {
        problems.push(`${where}: no front matter block. Every page opens with one.`);
        continue;
      }

      const { data, body } = parsed;
      const title = (data.title ?? '').trim();

      if (title === '') {
        problems.push(`${where}: no title. It is the sidebar entry and the browser tab.`);
      }

      // 16e, and it is the one rule in this file that is about safety and not
      // about tidiness: "the access key stays in the file and is never in the
      // table". A translation that could name its own tier would be a second
      // answer to the question the two pipelines exist to have one answer to.
      if (Object.hasOwn(data, 'access')) {
        problems.push(
          `${where}: carries an access key. Who may read a page is decided by the ` +
            `English page's front matter and by nothing else, per 16e.`
        );
      }

      for (const key of ['order', 'data']) {
        if (Object.hasOwn(data, key)) {
          problems.push(
            `${where}: carries a ${key} key. It belongs to the English page, which is ` +
              'what decides the reading order and what file a page embeds, in every language.'
          );
        }
      }

      if (body.trim() === '') {
        problems.push(
          `${where}: no body. An empty translation reads as a blank page, where no file ` +
            'at all reads as English with a notice on it, which is what 3a asks for.'
        );
        continue;
      }

      seen.add(match.page.path);

      rows.push({
        locale,
        path: match.page.path,
        title,
        summary: (data.summary ?? '').trim() || null,
        body,
        // A file is ready unless it says otherwise. The opposite default would
        // mean a finished translation sitting invisible because somebody did
        // not know a key existed, which is the failure 3a's is_ready is meant
        // to prevent and not the one it is meant to cause.
        ready: (data.ready ?? '').trim().toLowerCase() !== 'false',
        file: join(root, where),
        where,
      });
    }

    for (const page of pages.values()) {
      if (!seen.has(page.path)) missing.push({ locale, path: page.path });
    }
  }

  return { locales: directories.filter((l) => l !== BASE_LOCALE), rows, missing, problems };
}
