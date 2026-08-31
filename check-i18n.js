// Checks that every dictionary key the code asks for actually exists.
//
// Written after two keys shipped that did not: footer.buildStatus, referenced
// by the footer since phase 1, and theme.timeBasedNote. Both rendered their own
// key on screen, in both languages, and nothing caught them because a missing
// key is not an error anywhere. t() falls back to the key on purpose, so that a
// missing string degrades to something searchable and not to a blank
// element, and the cost of that kindness is that it fails silently.
//
// This is the thing that makes it not silent. Run it before shipping:
//
//   node check-i18n.js
//
// What it reads:
//
//   data-i18n="key"                      in HTML and in JS template literals
//   data-i18n-html="key"
//   data-i18n-attr="aria-label:key,..."
//   t('key')                             literal first arguments only
//
//   key: 'nav.findRole'                  in the NAV and FOOTER tables
//
// That last one is not decoration. footer.buildStatus was referenced from the
// FOOTER table and nowhere else, so a checker that only read markup and t()
// calls would have missed exactly the key that was missing.
//
// What it cannot read: a key built at runtime, such as t(`field.${code}`).
// Those are listed separately as unverifiable, and their families are declared
// in DYNAMIC_FAMILIES below so the unused check does not report every member of
// them as dead.
//
// It also checks for a *duplicate* key, added in phase 8 part 11 after part 8
// shipped one. JSON has no duplicate key error: the second wins silently, so
// admin.colRaised meaning a date was overwritten by admin.colRaised meaning a
// count, and a column heading changed on a page nobody was looking at. Parsing
// cannot see it, so the raw text is counted as well.
//
// Comments are stripped before scanning, or this file would flag the worked
// examples in i18n.js as missing keys, which it did on the first run.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved against this file and not the working directory, so it behaves
// the same whether it is run from the repo root or through npm run check-i18n
// from main-site.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'main-site');
const EN = join(ROOT, 'assets/i18n/en.json');
const ZH = join(ROOT, 'assets/i18n/zh.json');

// Key prefixes assembled at runtime. Everything under them is reachable even
// though no literal names it.
const DYNAMIC_FAMILIES = [
  'field.',
  'error.',
  'commitment.',
  'theme.', // theme.<colour theme id>, from COLOR_THEMES
  'status.',
  'placeholder.',
  'feature.',
  'codes.',
  'job.',
  // apply.refused_<reason>, built from the reason code the start endpoint
  // returns, so no literal in the source names any of the six.
  'apply.',
  // Phase 7. The dashboard builds a great many keys at runtime: a status, a
  // question type, an event source, a blocker code, a translation state.
  'admin.',
  // The maintenance switches in 8.12 are keyed by feature, and the feature list
  // is build-status.json instead of anything in the source, so no literal
  // names any of them.
  'featureName.',
  'featureWhere.',
  'featureDenied.',
  // tasks.type_<task type>, from the union in api/_lib/tasks.js.
  'tasks.',
  // The helper area, 7i. helper.found_<state>, built from the three states
  // api/_lib/helper-area.js gives a search result.
  'helper.',
  // The annotation layer, 7i. Its switch names itself and describes itself from
  // a key chosen at runtime: what it says depends on whether the caller may
  // suggest or only read, and on which way it is set.
  'annotate.',
  // Phase 8 part 11. These six were reported as dead through seven phases and
  // are nothing of the kind: every one is assembled from a value that arrives
  // in a payload. They are written as narrow prefixes rather than as whole
  // families, so audit.* and report.status_* are covered while a genuinely dead
  // report.* or settings.* key is still reported.
  //
  // audit.<action>, from gftvjobs_audit_log.action, in admin-applicants-page.js.
  'audit.',
  'applications.bucket_',
  'saved.filter_',
  'settings.pictureError_',
  'report.status_',
  'language.name_',
  // Phase 12 part 7. The service status page renders on the server and marks
  // each element with the key it came from, so four of its families are built
  // from a value rather than named: the headline state, a component's state, a
  // probe target, and a day's colour on the uptime bar. Narrow prefixes, so a
  // dead serviceStatus.* key is still reported.
  'serviceStatus.headline.',
  'serviceStatus.state.',
  'serviceStatus.target.',
  'serviceStatus.day.',
];

// A dictionary key: dotted, no interpolation. Anything with a ${ in it came
// out of a template literal and is a runtime expression, not a key.
const KEY_SHAPE = /^[A-Za-z][\w]*(?:\.[\w]+)+$/;

function isKey(candidate) {
  return typeof candidate === 'string' && KEY_SHAPE.test(candidate);
}

/**
 * Remove comments, so worked examples inside them are not read as real usage.
 * Block comments go wholesale; line comments only when the line is entirely a
 * comment, which leaves a trailing // in a URL alone.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(ROOT).filter((f) => f.endsWith('.html') || f.endsWith('.js'));

const used = new Map(); // key -> [where]
const dynamic = new Map(); // expression -> [where]
const mentioned = new Set(); // every key shaped literal anywhere in the source

function note(map, key, where) {
  if (!map.has(key)) map.set(key, []);
  if (!map.get(key).includes(where)) map.get(key).push(where);
}

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const source = file.endsWith('.js') ? stripComments(raw) : raw;
  const where = relative(HERE, file).replace(/\\/g, '/');

  for (const m of source.matchAll(/data-i18n(?:-html)?=["']([^"']+)["']/g)) {
    if (isKey(m[1])) note(used, m[1], where);
  }

  for (const m of source.matchAll(/data-i18n-attr=["']([^"']+)["']/g)) {
    for (const pair of m[1].split(',')) {
      const key = pair.split(':')[1]?.trim();
      if (isKey(key)) note(used, key, where);
    }
  }

  // Every key shaped string literal inside a t( ... ) call, which covers
  // t('key'), t('key', vars), and t(cond ? 'a' : 'b'). That last form is not
  // exotic: common.modeLight and common.modeDark are only ever reached through
  // one, and were reported as dead because of it.
  //
  // Scoped to the call, not to the whole file, on purpose. Matching every
  // dotted string anywhere would pick up things like careers.globalfurry.tv and
  // report those as missing keys.
  for (const call of source.matchAll(/\bt\(/g)) {
    const region = source.slice(call.index, call.index + 240);
    const end = region.indexOf(')');
    const args = region.slice(0, end === -1 ? region.length : end);
    for (const literal of args.matchAll(/['"]([^'"]+)['"]/g)) {
      if (isKey(literal[1])) note(used, literal[1], where);
    }
  }

  // The NAV and FOOTER tables in shell.js, which name their labels by key.
  for (const m of source.matchAll(/\b(?:key|headingKey)\s*:\s*['"]([^'"]+)['"]/g)) {
    if (isKey(m[1])) note(used, m[1], where);
  }

  // t(`...${...}...`) and t(someVariable), which cannot be resolved here.
  for (const m of source.matchAll(/\bt\(\s*(`[^`]*\$\{[^`]*`|[A-Za-z_$][\w$]*)\s*[,)]/g)) {
    note(dynamic, m[1].replace(/\s+/g, ' '), where);
  }

  // Every key shaped literal anywhere in the file, whatever it is doing there.
  //
  // This feeds the unused report and nothing else, which is what makes it safe
  // to be this loose: careers.globalfurry.tv lands in here too, and a set that
  // can only ever *suppress* a "never referenced" line cannot invent a missing
  // key. It exists because the unused list had grown to 54 entries, none of
  // them dead: account.tileSaved is passed as titleKey, saved.needAccount as
  // messageKey, home.featuredHeading through a ternary into a variable. A list
  // that is entirely false positives is a list nobody reads, which is the only
  // way a genuinely dead key stays in the dictionary.
  for (const literal of source.matchAll(/['"`]([A-Za-z][\w]*(?:\.[\w]+)+)['"`]/g)) {
    mentioned.add(literal[1]);
  }
}

const enRaw = readFileSync(EN, 'utf8');
const zhRaw = readFileSync(ZH, 'utf8');
const en = JSON.parse(enRaw);
const zh = JSON.parse(zhRaw);

let problems = 0;

/**
 * Keys written twice in one file.
 *
 * JSON.parse keeps the last one and says nothing, so this counts the keys in
 * the raw text instead and compares. Every key in these two files is at the top
 * level and on its own line, which is what makes a line anchored match honest:
 * a colon inside a value cannot look like a key, and neither can a brace.
 */
function duplicateKeys(raw) {
  const seen = new Set();
  const twice = new Set();
  for (const m of raw.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
    if (seen.has(m[1])) twice.add(m[1]);
    seen.add(m[1]);
  }
  return [...twice].sort();
}

for (const [name, raw] of [['en.json', enRaw], ['zh.json', zhRaw]]) {
  const twice = duplicateKeys(raw);
  if (twice.length > 0) {
    problems += twice.length;
    console.log(
      `\nWritten twice in ${name}, so the second silently wins (${twice.length}):`
    );
    for (const key of twice) console.log(`  ${key}`);
  }
}

const missing = [...used.keys()].filter((k) => !(k in en)).sort();
if (missing.length > 0) {
  problems += missing.length;
  console.log(`\nMissing from en.json, so they render as their own key on screen (${missing.length}):`);
  for (const key of missing) {
    console.log(`  ${key}`);
    for (const where of used.get(key)) console.log(`      ${where}`);
  }
}

const missingZh = [...used.keys()].filter((k) => k in en && !(k in zh)).sort();
if (missingZh.length > 0) {
  // Not fatal. English is the fallback layer by design, so these read in
  // English instead of breaking, but a Chinese reader sees English.
  console.log(`\nIn en.json but not zh.json, so they read in English (${missingZh.length}):`);
  for (const key of missingZh) console.log(`  ${key}`);
}

const onlyZh = Object.keys(zh).filter((k) => !(k in en) && k !== '_comment').sort();
if (onlyZh.length > 0) {
  problems += onlyZh.length;
  console.log(`\nIn zh.json but not en.json, which breaks the fallback (${onlyZh.length}):`);
  for (const key of onlyZh) console.log(`  ${key}`);
}

const unused = Object.keys(en)
  .filter((k) => k !== '_comment')
  .filter((k) => !used.has(k))
  .filter((k) => !mentioned.has(k))
  .filter((k) => !DYNAMIC_FAMILIES.some((prefix) => k.startsWith(prefix)))
  .sort();

if (unused.length > 0) {
  console.log(`\nIn the dictionaries but never referenced (${unused.length}). Not an error:`);
  console.log('  a key can be for a page that has not been built yet.');
  for (const key of unused) console.log(`  ${key}`);
}

if (dynamic.size > 0) {
  console.log(`\nBuilt at runtime, so not checkable here (${dynamic.size}):`);
  for (const [expression, where] of dynamic) {
    console.log(`  ${expression}   ${where.join(', ')}`);
  }
}

console.log(
  `\n${used.size} literal keys referenced, ${Object.keys(en).length - 1} in en.json, ` +
    `${Object.keys(zh).length - 1} in zh.json.`
);

if (problems > 0) {
  console.log(`\n${problems} problem${problems === 1 ? '' : 's'}. Fix before shipping.`);
  process.exit(1);
}

console.log('No missing keys.');
