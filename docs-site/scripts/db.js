// THIS SITE'S OWN FILE. Not generated.
//
// The build's connection to Supabase, over PostgREST, with no dependency.
//
// ---------------------------------------------------------------------------
// Why this is fetch and not @supabase/supabase-js
// ---------------------------------------------------------------------------
//
// The client is already a dependency of this project -- api/_lib/supabase.js
// imports it and every function on the site goes through it -- so using it here
// would have cost nothing to install. What it would have cost is decision 2,
// which fixed the shape of this build when it was created: **deploy time, Node
// built-ins only, no dependency of any kind.**
//
// That rule has a practical edge as well as a tidy one. `scripts/` has carried
// its own package.json since part 8, so a module resolved from this directory
// walks up through `scripts/node_modules` before it reaches the project's, and
// what it finds there depends on whether somebody has run `npm install` in a
// directory Vercel never installs. A build that resolves differently on a
// laptop and on a deployment is the kind of thing that is discovered at 2am.
//
// PostgREST is an HTTP API and this is three requests' worth of it. The service
// key goes in a header, the rows go in a body, and `fetch` has been a built-in
// since Node 18.
//
// ---------------------------------------------------------------------------
// The service key, and where it comes from
// ---------------------------------------------------------------------------
//
// The same two variables every function on both sites needs, per 5h: the docs
// site is the same Supabase project, the same service key and the same rows as
// the portal. On Vercel they are the docs project's environment variables.
// Locally they are read out of a .env.local, this project's first and the
// portal's second, for the reason seed.mjs gives: somebody who has already
// written a service key down once should not be asked for it again in a shell
// where it becomes history.
//
// **It is a service key and this is a build script**, which is worth one
// sentence. Nothing it writes is read back into the pages it writes, no value
// from it reaches dist/, and the only thing it sends is content already in the
// repository. A build that leaked the key into a static file would be leaking
// it into the one directory this whole site treats as world readable, so
// nothing here ever writes an environment variable anywhere.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The two variables, named once. */
export const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

/**
 * The two tables this build writes, from migration 042.
 *
 * **A second copy of two names, and it is checked against the first.**
 * `api/_lib/supabase.js` carries `T`, which is the one place table names live
 * for everything that runs as a function; it cannot be imported here because it
 * builds a Supabase client at import time and this file exists precisely to
 * avoid that dependency. So `tests/phase14-test.mjs` compares these two values
 * against `T.docsTranslations` and `T.docsPages`, which is this repository's
 * standing answer to two copies of anything: not a rule that they must not
 * exist, but a check that fails when they disagree.
 */
export const TABLES = Object.freeze({
  translations: 'gftvjobs_docs_translations',
  pages: 'gftvjobs_docs_pages',
});

/**
 * Read a .env.local into process.env, without overwriting anything already set.
 *
 * Two candidates, in order. This project's own comes first so that a docs site
 * pointed somewhere else can be; the portal's is the file that actually exists
 * on most machines, because it is the one main-site/.env.example tells a person
 * to write.
 */
export function loadEnvFile(root) {
  for (const file of [join(root, '.env.local'), join(root, '../main-site/.env.local')]) {
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, name, raw] = match;
      if (process.env[name]) continue;
      process.env[name] = raw.trim().replace(/^["']|["']$/g, '');
    }
  }
}

/** Whether both variables are set. Nothing here reads their values out loud. */
export const haveCredentials = () => REQUIRED.every((name) => process.env[name]);

/** Whether this is running on Vercel, which is where the escape hatch is refused. */
export const onVercel = () => Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

const endpoint = (table, query = '') =>
  `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}${query}`;

/**
 * One request, with the failure spelled out.
 *
 * **Every failure throws**, and that is 16e's instruction: "a build that cannot
 * reach Supabase must fail loudly rather than quietly emit an English-only
 * site. A site missing every translation is the failure that looks like
 * success." So nothing here returns an empty result on an error, and the
 * message carries the status and the body PostgREST sent, because the useful
 * half of a Postgres error is always in the body.
 */
async function request(url, { method, prefer, body }, what) {
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'x-application-name': 'careers-gftv-docs-build',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (cause) {
    throw new Error(`${what}: could not reach Supabase at all. ${cause.message}`, { cause });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${what}: Supabase answered ${response.status}. ${text.slice(0, 500)}`);
  }

  return response;
}

/**
 * Replace rows, matching on a unique constraint.
 *
 * Chunked, because the bodies here are whole guide pages and eighty two of them
 * in one request is a request measured in megabytes. Forty is small enough that
 * a failure names a readable set and large enough that the whole tree is three
 * requests.
 *
 * `return=minimal` keeps the answer empty: the build has no use for the rows it
 * just wrote, and a page body is a large thing to be sent back for nothing.
 *
 * @param {string} table
 * @param {object[]} rows
 * @param {string} onConflict the column list the unique constraint is on
 */
export async function upsert(table, rows, onConflict) {
  for (let at = 0; at < rows.length; at += 40) {
    const chunk = rows.slice(at, at + 40);
    await request(
      endpoint(table, `?on_conflict=${encodeURIComponent(onConflict)}`),
      {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(chunk),
      },
      `writing ${chunk.length} rows to ${table}`
    );
  }
}

/**
 * Some columns of every row in a table.
 *
 * Used to work out what to delete: the build knows what should be there, and
 * the difference is what a page rename or a deleted guide left behind.
 */
export async function selectColumns(table, columns) {
  const response = await request(
    endpoint(table, `?select=${encodeURIComponent(columns)}`),
    { method: 'GET' },
    `reading ${table}`
  );
  return response.json();
}

/**
 * Delete the rows a PostgREST filter names.
 *
 * **A filter and never a bare delete.** PostgREST refuses a delete with no
 * filter at all, which is a property worth relying on instead of working
 * around: the one mistake this function could make is emptying a table, and the
 * API will not let it.
 */
export async function deleteWhere(table, filter, what) {
  await request(endpoint(table, `?${filter}`), { method: 'DELETE', prefer: 'return=minimal' }, what);
}
