// THIS SITE'S OWN FILE. Not generated, and named in gen-docs-lib.js under OWN.
// The portal has nothing to generate it from: guide pages are this site's.
//
// Reading a guide in a language that is not English.
//
// ---------------------------------------------------------------------------
// Why this reads the database when the files are right there
// ---------------------------------------------------------------------------
//
// The 华文 of every page is also a file in `translations/`, carried into the
// function bundle by the same includeFiles entry that carries the English, and
// reading it off disk would be faster than this and would need no network at
// all. It was considered and it is not what happens, for two reasons that
// outlast the convenience:
//
//   **16e says the table is the serving path.** "A page with no translation
//   falls back to English with a notice, and a translation is shown only when
//   its row says it is ready." The row is the thing that decides, and a site
//   that read the file would be deciding from something else.
//
//   **The row is the half that can change without a deploy.** Nothing edits one
//   today -- phase 14 part 9's build overwrites the table from the tree on
//   every deploy -- but a translation helper surface is 7h's shape applied to
//   guides, and the day it exists, a site reading files would ignore every
//   correction it made. Reading the table now means that surface is a write and
//   not a rewrite of this file.
//
// ---------------------------------------------------------------------------
// Everything here fails to English
// ---------------------------------------------------------------------------
//
// **A database that cannot be reached costs a reader their language and costs
// them nothing else**, which is the same shape reader.js uses for the gate:
// there is no path through this file that shows somebody more than they should
// see, so failing open is failing to the English page with the notice on it
// that says exactly what happened.
//
// So nothing here throws and nothing returns a 500. A miss, a blank row, an
// unreachable database and a language nobody has translated into all produce
// the same empty answer, and the caller draws the English page.

import { supabase, T } from './supabase.js';

/** The language the files themselves are written in, per 3a. */
export const BASE_LOCALE = 'en';

/**
 * A locale as it may be used in a query, or null.
 *
 * Shape and not membership. The list of languages lives in
 * `assets/i18n/` and in gftvjobs_locales, and a locale that passes this and
 * exists in neither simply matches no rows -- which is the same answer as a
 * language nobody has started translating into, and is the correct one. What
 * this refuses is a value with a comma or a bracket in it, which is what a
 * PostgREST filter is written with.
 */
export function localeParam(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const locale = String(raw ?? '').trim();
  if (locale === '' || locale === BASE_LOCALE) return null;
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : null;
}

/** A field that is present and not blank, or null. Per 3a's fallback rule. */
const filled = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : value;
};

/**
 * The ready translations of some pages, in one language.
 *
 * One query for however many paths the caller needs, because a page draws its
 * own title beside its previous and next links and three round trips for three
 * titles is three times the latency for one screen.
 *
 * @param {string[]} paths page paths, as pages.js builds them
 * @param {string|null} locale from localeParam
 * @returns {Promise<Map<string, { title: string|null, summary: string|null, body: string|null }>>}
 */
export async function translationsFor(paths, locale) {
  const out = new Map();
  const wanted = [...new Set(paths.filter(Boolean))];
  if (!locale || wanted.length === 0) return out;

  try {
    const { data, error } = await supabase
      .from(T.docsTranslations)
      .select('page_path, title, summary, body')
      .eq('locale', locale)
      // Per 3a. Half a translated page is never shown, and this is the site's
      // half of the rule the view enforces for the bot.
      .eq('is_ready', true)
      .in('page_path', wanted);

    if (error) return out;

    for (const row of data ?? []) {
      out.set(row.page_path, {
        title: filled(row.title),
        summary: filled(row.summary),
        body: filled(row.body),
      });
    }
  } catch {
    // Unreachable, misconfigured, or answering something that is not JSON. The
    // reader gets English, which is a page.
  }

  return out;
}

/**
 * Every ready page title in one language, for the sidebar.
 *
 * The whole set in one query and not one per entry: the sidebar is every page
 * the reader may open, so asking per page would be eighty two round trips to
 * draw one column. Titles only -- a sidebar has no use for a body, and the
 * bodies are the large half of this table by a wide margin.
 *
 * @param {string|null} locale from localeParam
 * @returns {Promise<Map<string, string>>}
 */
export async function titlesFor(locale) {
  const out = new Map();
  if (!locale) return out;

  try {
    const { data, error } = await supabase
      .from(T.docsTranslations)
      .select('page_path, title')
      .eq('locale', locale)
      .eq('is_ready', true);

    if (error) return out;

    for (const row of data ?? []) {
      const title = filled(row.title);
      if (title) out.set(row.page_path, title);
    }
  } catch {
    // English titles, which is what the sidebar has always drawn.
  }

  return out;
}

/**
 * A nav tree with its titles swapped for the ones this reader can read.
 *
 * **The shape is untouched and only the words move.** What is in the tree was
 * decided by `navFor`, which applied the gate; nothing here adds an entry, and
 * a page whose translation is missing keeps its English title, which is the
 * same fallback the page itself gets.
 */
export function localiseNav(nav, titles) {
  if (titles.size === 0) return nav;

  const swap = (page) => (page ? { ...page, title: titles.get(page.path) ?? page.title } : page);

  return {
    home: swap(nav.home),
    staff_home: swap(nav.staff_home),
    sections: nav.sections.map((section) => ({
      ...section,
      // A section's heading is its index page's title, which is a row like any
      // other. `section.path` is that page.
      title: titles.get(section.path) ?? section.title,
      pages: section.pages.map(swap),
    })),
  };
}
