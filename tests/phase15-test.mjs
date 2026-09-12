// Phase 15 verification run, from next-steps.md section 2.
//
//   node tests/phase15-test.mjs                  everything that can run
//   node tests/phase15-test.mjs --only=server    one or more sections
//
// **Nothing here needs a credential, a database or a deployment.** Part 1 is a
// switch, two copies, and every list that assumed two languages, and each of
// those is wrong before it is deployed or it is not wrong at all. The server
// half is imported with settings.js swapped for an in-memory stub, which is the
// one thing phase 7's file said could not be done and can: a module hook
// answers the import, and maintenance.js never learns it was not talking to a
// table.
//
// It reads the tree and never writes to it, so a run leaves the working tree
// exactly as it found it and can be run beside anything.
//
// The sections, and what each one is about:
//
//   keys      the four locale_ keys, their sentences, and the two lists they replaced
//   lists     every place that names the languages, held to the keys
//   server    maintenance.js and locales.js, with a stubbed settings table
//   client    i18n.js's published filter, in Node with a stub document
//   bot       the bot's derived list, and its two fixes from 11 September
//   rich      part 2: the bot's rich messages, and the guides drawn as pages
//   docs      the docs site's copies stay at two languages
//   worker    the portal worker precaches no held dictionary
//   banner    part 3: the official site banner on both shells, and the flip

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, register } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const MAIN = join(REPO, 'main-site');
const DOCS = join(REPO, 'docs-site');
const BOT = join(REPO, 'telegram-bot');

const ONLY = (() => {
  const arg = process.argv.find((value) => value.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();

/* -------------------------------------------------------------------------
 * Reporting. Phase 13's, unchanged, so two runs read the same.
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

/** Normalised on read, so a working tree checked out with CRLF reads the same. */
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** A root script, run as `node <file>`, answering its exit code and output. */
function runScript(file, args = []) {
  const result = spawnSync(process.execPath, [join(REPO, file), ...args], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

function walk(dir, keep) {
  const out = [];
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist' || item.startsWith('.')) continue;
    const full = join(dir, item);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const LOCALES = ['en', 'zh', 'ms', 'ta'];
const HELD = ['ms', 'ta'];

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

/* -------------------------------------------------------------------------
 * keys
 * ---------------------------------------------------------------------- */

define('keys', 'Part 1: the four locale_ keys, and the two lists they replaced', async () => {
  const status = json(join(MAIN, 'assets/build-status.json'));
  const en = json(join(MAIN, 'assets/i18n/en.json'));
  const zh = json(join(MAIN, 'assets/i18n/zh.json'));
  const maintenance = read(join(MAIN, 'api/_lib/maintenance.js'));

  check('build-status.json carries no locales array any more', !('locales' in status), 'the keys are the list');
  check('more_languages is gone from the feature map', !('more_languages' in status.features));
  check('more_languages is gone from the denylist', !maintenance.includes('more_languages:'));

  for (const code of LOCALES) {
    const key = `locale_${code}`;
    const phase = status.features[key];
    check(`${key} is a feature key`, typeof phase === 'number', `phase is ${phase}`);
    check(
      `${key} sits under phase ${code === 'ms' || code === 'ta' ? 15 : 1}`,
      phase === (code === 'ms' || code === 'ta' ? 15 : 1)
    );
    check(`${key} has a name in both dictionaries`, Boolean(en[`featureName.${key}`] && zh[`featureName.${key}`]));
  }

  check('locale_en is denylisted as the fallback layer', maintenance.includes('  locale_en:'));
  check(
    'locale_en has its denied sentence in both dictionaries',
    Boolean(en['featureDenied.locale_en'] && zh['featureDenied.locale_en'])
  );
  for (const code of ['zh', 'ms', 'ta']) {
    check(
      `locale_${code} says where it is, in both dictionaries`,
      Boolean(en[`featureWhere.locale_${code}`] && zh[`featureWhere.locale_${code}`])
    );
  }

  const held = maintenance.slice(maintenance.indexOf('export const HELD'), maintenance.indexOf('});', maintenance.indexOf('export const HELD')));
  for (const code of HELD) {
    check(`locale_${code} is held, off until switched on`, held.includes(`locale_${code}:`));
    check(
      `locale_${code} has its held sentence in both dictionaries`,
      Boolean(en[`featureHeld.locale_${code}`] && zh[`featureHeld.locale_${code}`])
    );
  }
  check('locale_zh is not held: it has shipped and is on unless switched off', !held.includes('locale_zh:'));
  check(
    'the standing held note is shown as held and not as switched off by somebody',
    read(join(MAIN, 'assets/js/admin-maintenance-page.js')).includes('feature.held') &&
      Boolean(en['admin.heldUntilOn'] && zh['admin.heldUntilOn'])
  );

  check(
    'the four keys name a language each, in the language modal',
    ['language.name_ms', 'language.name_ta'].every((key) => en[key] && zh[key] && en[key] === zh[key]),
    'a native name is never translated'
  );

  const counting = [
    'language.description',
    'home.bilingualHeading',
    'home.bilingualBody',
    'about.languagesHeading',
    'about.languagesBody',
    'faq.languageQ',
    'faq.languageA',
    'report.intro',
  ];
  const twoLanguages = /English and (Chinese|华文|Simplified Chinese)|either language|bilingual/i;
  check(
    'no interface string counts the languages as two any more',
    counting.every((key) => !twoLanguages.test(en[key])),
    counting.filter((key) => twoLanguages.test(en[key])).join(', ')
  );
});

/* -------------------------------------------------------------------------
 * lists
 * ---------------------------------------------------------------------- */

define('lists', 'Every place that names the languages, held to the keys', async () => {
  const result = runScript('check-i18n.js');
  check('check-i18n.js passes, and it now reads the keys', result.code === 0, result.out.slice(-600));
  check(
    'check-i18n.js compares the three lists and the pre-paint map',
    read(join(REPO, 'check-i18n.js')).includes('function checkLocaleLists')
  );

  const enRaw = readFileSync(join(MAIN, 'assets/i18n/en.json'));
  for (const code of HELD) {
    const copy = readFileSync(join(MAIN, `assets/i18n/${code}.json`));
    check(`${code}.json is a byte for byte copy of en.json`, copy.equals(enRaw), 'the file itself is what gets sent');
  }

  const i18n = read(join(MAIN, 'assets/js/i18n.js'));
  const ids = [...i18n.matchAll(/^\s*\{ id: '([a-z-]+)'/gm)].map((m) => m[1]);
  check('i18n.js LOCALES lists the four dictionaries in order', ids.join() === LOCALES.join(), ids.join());
  check('i18n.js filters by a published set the shell narrows', /export function setPublishedLocales/.test(i18n) && /published\.has\(/.test(i18n));
  check("applyLocale can apply without remembering, for the shell's fallback", /remember = true/.test(i18n) && /if \(remember\)/.test(i18n));

  const validate = read(join(MAIN, 'api/_lib/validate.js'));
  check("validate.js LOCALES is the four dictionaries", validate.includes("Object.freeze(['en', 'zh', 'ms', 'ta'])"));

  // The pre-paint script, in every page head and in the server rendered shell.
  const map = '{ zh: "zh-Hans-SG", ms: "ms", ta: "ta" }[l] || "en"';
  const pages = walk(MAIN, (f) => f.endsWith('.html'));
  const withPrePaint = pages.filter((f) => read(f).includes('data-i18n-pending'));
  const stale = withPrePaint.filter((f) => !read(f).includes(map));
  check(
    `every one of the ${withPrePaint.length} page heads maps all three non default languages`,
    stale.length === 0,
    stale.map((f) => f.slice(MAIN.length + 1)).join(', ')
  );
  check('the server rendered shell maps them too', read(join(MAIN, 'api/_lib/page-shell.js')).includes(map));
  check(
    'no page head still maps only Chinese',
    pages.every((f) => !read(f).includes('l === "zh" ? "zh-Hans-SG" : "en"'))
  );

  const format = read(join(MAIN, 'assets/js/format.js'));
  check('format.js gives Intl a Singapore tag for each language', format.includes("ms: 'ms-SG'") && format.includes("ta: 'ta-SG'"));

  const modals = read(join(MAIN, 'assets/js/chrome-modals.js'));
  check('the language modal hides a button whose language is not published', /isPublished\(/.test(modals) && /gftv:localespublished/.test(modals));
  const report = read(join(MAIN, 'assets/js/translation-report.js'));
  check('the report form offers only published languages', report.includes('publishedLocales().map('));

  const shell = read(join(MAIN, 'assets/js/shell.js'));
  const narrow = shell.indexOf('setPublishedLocales(publishedLocaleIds(status))');
  check(
    'the shell narrows after both loaders and before the first paint',
    narrow > shell.indexOf('await loadFeatureOverrides();') && narrow < shell.indexOf('const paint = ()'),
    'the published test needs the overrides, and the paint needs the answer'
  );
  check(
    'a reader on a switched off language is moved to English without their choice being overwritten',
    shell.includes("applyLocale(DEFAULT_LOCALE, { remember: false })")
  );

  const buildStatus = read(join(MAIN, 'assets/js/build-status.js'));
  check('phaseText reads name_<locale> and no longer only name_zh', buildStatus.includes('phase[`${field}_${locale}`]'));
  check(
    'the three listings of what is broken leave a held feature out',
    read(join(MAIN, 'assets/js/account-shell.js')).includes('!isFeatureHeld(key)') &&
      read(join(MAIN, 'assets/js/admin-shell.js')).includes('!isFeatureHeld(key)') &&
      read(join(MAIN, 'assets/js/status-page.js')).includes('held !== true')
  );

  const copyCheck = runScript('check-copy.js');
  check('check-copy.js reads the copies as English and passes', copyCheck.code === 0 && /copies of the English/.test(read(join(REPO, 'check-copy.js'))), copyCheck.out.slice(-400));
  const review = runScript('gen-review.js');
  check('gen-review.js is clean with the two copies exempt', review.code === 0 && /every shipped file carrying/.test(review.out), review.out.slice(-400));
});

/* -------------------------------------------------------------------------
 * server
 * ---------------------------------------------------------------------- */

const STUB_SETTINGS = `
  export const store = {};
  export async function getSetting(key, fallback) { return key in store ? structuredClone(store[key]) : fallback; }
  export async function putSetting(key, value) { store[key] = structuredClone(value); }
  export function invalidateSettings() {}
`;

/** Import maintenance.js and locales.js with settings.js answered from memory. */
async function serverModules() {
  const hooks = `
    export async function resolve(specifier, context, next) {
      if (specifier === './settings.js') return { url: 'stub:settings', shortCircuit: true };
      return next(specifier, context);
    }
    export async function load(url, context, next) {
      if (url === 'stub:settings') return { format: 'module', source: ${JSON.stringify(STUB_SETTINGS)}, shortCircuit: true };
      return next(url, context);
    }
  `;
  register('data:text/javascript,' + encodeURIComponent(hooks), pathToFileURL(REPO + '/'));
  process.env.SUPABASE_URL ??= 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub';
  process.env.SUPABASE_SERVICE_KEY ??= 'stub';
  const maintenance = await import(pathToFileURL(join(MAIN, 'api/_lib/maintenance.js')).href);
  const locales = await import(pathToFileURL(join(MAIN, 'api/_lib/locales.js')).href);
  const settings = await import('stub:settings');
  return { maintenance, locales, settings };
}

define('server', 'maintenance.js and locales.js, with a stubbed settings table', async () => {
  const { maintenance, locales, settings } = await serverModules();
  const staffUser = { id: 'u1', username: 'tester' };

  // Phase 15 flipped in part 3, so the pre-flip state is set here, on the
  // required copy of the file, which maintenance.js reads through the same
  // require cache. Put back at the end either way.
  const require = createRequire(import.meta.url);
  const status = require(join(MAIN, 'assets/build-status.json'));
  const phase15 = status.phases.find((p) => p.number === 15);
  const before = phase15.status;
  phase15.status = 'building';
  try {

  check('knownLocales derives the four from the keys, and language_switcher is not one', locales.knownLocales().join() === LOCALES.join(), locales.knownLocales().join());
  check('shippedLocales is English and Chinese before the flip', locales.shippedLocales().join() === 'en,zh');

  let off = await maintenance.featureOverrides();
  check('a fresh table holds the two held keys as off, with their standing note', HELD.every((c) => off[`locale_${c}`]?.off && off[`locale_${c}`].held && off[`locale_${c}`].note));
  check('and nothing else', Object.keys(off).length === 2, Object.keys(off).join());
  check('publishedLocales is English and Chinese', (await locales.publishedLocales()).join() === 'en,zh');

  const pub = await maintenance.publicFeatureStatus();
  check('the public payload marks a held key as held', HELD.every((c) => pub.off[`locale_${c}`]?.held === true));

  check('requestLocale answers English for a held language', (await locales.requestLocale({ url: '/api/x?locale=ms' })) === 'en');
  check('requestLocale answers Chinese for a published one', (await locales.requestLocale({ url: '/api/x?locale=zh' })) === 'zh');
  check('validatePublishedLocale refuses a held language', (await locales.validatePublishedLocale('ta')).ok === false);
  check('validatePublishedLocale refuses a language that does not exist', (await locales.validatePublishedLocale('xx')).ok === false);
  check('validatePublishedLocale accepts a published one', (await locales.validatePublishedLocale(' ZH ')).value === 'zh');

  // Switching a held key on before its phase ships: the record is written, and
  // the phase gate still holds the language back.
  await maintenance.setFeatureOverride('locale_ms', false, { note: null, staffUser });
  check('switching a held key on writes an on record', settings.store.feature_overrides?.locale_ms?.on === true);
  off = await maintenance.featureOverrides();
  check('and it stops reading as off', !('locale_ms' in off));
  check('but a phase that has not shipped still holds it back', (await locales.publishedLocales()).join() === 'en,zh');

  // The flip.
  phase15.status = 'shipped';
    check('after the flip, the switched on language is published', (await locales.publishedLocales()).join() === 'en,zh,ms');
    check('and the one nobody switched on is still held', !(await locales.publishedLocales()).includes('ta'));
    check('locale_ms and locale_ta are on the maintenance page after the flip', maintenance.flippableFeatures().some((f) => f.key === 'locale_ta'));
    check('locale_en is denied there, with its phase', maintenance.deniedFeatures().some((f) => f.key === 'locale_en' && f.phase === 1));

    await maintenance.setFeatureOverride('locale_ms', true, { note: 'wording being checked', staffUser });
    off = await maintenance.featureOverrides();
    check("an admin switching it off again is an ordinary off record with their note, not held", off.locale_ms?.off && off.locale_ms.note === 'wording being checked' && off.locale_ms.held === false && off.locale_ms.by === 'tester');
    check('requestLocale follows the switch', (await locales.requestLocale({ url: '/api/x?locale=ms' })) === 'en');

    await maintenance.setFeatureOverride('locale_zh', true, { note: null, staffUser });
    check('Chinese can be switched off like any feature', !(await locales.publishedLocales()).includes('zh'));
    await maintenance.setFeatureOverride('locale_zh', false, { note: null, staffUser });
    check('and switching it back on removes its record', !('locale_zh' in settings.store.feature_overrides));
    check('the default is always published', (await locales.publishedLocales())[0] === 'en');

  // Off means off, including the API: no route reaches the shape-only checks.
  const routes = walk(join(MAIN, 'api'), (f) => f.endsWith('.js') && !f.includes('_lib'));
  const shapeOnly = routes.filter((f) => /\b(localeFromRequest|validateLocale)\b/.test(read(f)));
  check('no route imports the shape-only locale checks from validate.js', shapeOnly.length === 0, shapeOnly.map((f) => f.slice(MAIN.length + 1)).join(', '));
  const unawaited = routes.filter((f) => /(?<!await )\b(requestLocale|validatePublishedLocale)\(/.test(read(f).replace(/import \{[^}]*\}/g, '')));
  check('every published locale check in a route is awaited', unawaited.length === 0, unawaited.map((f) => f.slice(MAIN.length + 1)).join(', '));
  check('the posting page inlines only published languages', read(join(MAIN, 'api/job-page.js')).includes('for (const locale of await publishedLocales())'));
  } finally {
    phase15.status = before;
  }
});

/* -------------------------------------------------------------------------
 * client
 * ---------------------------------------------------------------------- */

define('client', "i18n.js's published filter, in Node with a stub document", async () => {
  const storage = new Map();
  const events = [];
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  };
  globalThis.document = {
    documentElement: {
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
    },
    querySelectorAll: () => [],
    dispatchEvent: (e) => events.push(e.type),
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const dictionaries = {
    en: json(join(MAIN, 'assets/i18n/en.json')),
    zh: json(join(MAIN, 'assets/i18n/zh.json')),
    ms: json(join(MAIN, 'assets/i18n/ms.json')),
  };
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(url);
    const code = String(url).match(/i18n\/(\w+)\.json/)?.[1];
    if (code && dictionaries[code]) return { ok: true, json: async () => dictionaries[code] };
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const i18n = await import(pathToFileURL(join(MAIN, 'assets/js/i18n.js')).href);

  check('everything is published until the shell says otherwise', i18n.publishedLocales().map((l) => l.id).join() === LOCALES.join());
  storage.set('gftv-careers.locale', 'ms');
  check('so a stored Malay applies before the narrowing', i18n.getStoredLocale() === 'ms');
  let applied = await i18n.applyLocale(i18n.getStoredLocale());
  check('and the page is stamped ms', applied === 'ms' && document.documentElement.attrs.lang === 'ms');

  i18n.setPublishedLocales(['en', 'zh']);
  check('narrowing dispatches gftv:localespublished', events.includes('gftv:localespublished'));
  check('the narrowed list keeps English whatever it is given', i18n.publishedLocales().map((l) => l.id).join() === 'en,zh');
  check('a stored language that is not published reads as English', i18n.getStoredLocale() === 'en');
  check('the active language is reported as not published', !i18n.isPublished(i18n.getLocale()));

  applied = await i18n.applyLocale('en', { remember: false });
  check('the shell fallback applies English', applied === 'en' && document.documentElement.attrs.lang === 'en');
  check('and does not overwrite the stored choice', storage.get('gftv-careers.locale') === 'ms', 'so it is honoured again the day the switch goes on');
  check('asking for a language that is not published applies English', (await i18n.applyLocale('ta')) === 'en');
  check('and a fallback is not remembered as a choice either', storage.get('gftv-careers.locale') === 'ms');
  await i18n.applyLocale('zh');
  check('a published choice is remembered', storage.get('gftv-careers.locale') === 'zh');
  check('a lookup in a copy falls through to the same English', i18n.t('nav.findRole') === dictionaries.zh['nav.findRole']);
});

/* -------------------------------------------------------------------------
 * bot
 * ---------------------------------------------------------------------- */

const BOT_LOCALES = `
import asyncio, json, sys
sys.path.insert(0, ${JSON.stringify(BOT)})
import httpx
from build_status import BuildStatus
class Cfg:
    build_status_url = 'https://x/assets/build-status.json'
    feature_status_url = 'https://x/api/public/feature-status'
    local_build_status = None
data = json.load(open(${JSON.stringify(join(MAIN, 'assets/build-status.json'))}, encoding='utf-8'))
off = {'locale_ms': {'note': 'held', 'since': None, 'held': True}, 'locale_ta': {'note': 'held', 'since': None, 'held': True}}
def handler(req):
    if req.url.path.endswith('build-status.json'):
        return httpx.Response(200, json=data)
    return httpx.Response(200, json={'ok': True, 'data': {'off': off}})
async def main():
    out = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        out.append(list(await BuildStatus(Cfg(), c).locales()))
        for p in data['phases']:
            if p['number'] == 15: p['status'] = 'shipped'
        out.append(list(await BuildStatus(Cfg(), c).locales()))
        del off['locale_ms']
        out.append(list(await BuildStatus(Cfg(), c).locales()))
        off['locale_zh'] = {'note': None, 'since': None}
        out.append(list(await BuildStatus(Cfg(), c).locales()))
        data.clear(); data.update({'phases': [], 'features': {}, 'locales': ['en', 'zh']})
        out.append(list(await BuildStatus(Cfg(), c).locales()))
    print(json.dumps(out))
asyncio.run(main())
`;

define('bot', "The bot's derived list, and its two fixes from 11 September", async () => {
  const handlers = read(join(BOT, 'handlers.py'));
  const supabase = read(join(BOT, 'supabase.py'));
  const buildStatus = read(join(BOT, 'build_status.py'));

  check('build_status.py derives the languages from the locale_ keys', buildStatus.includes('LOCALE_KEY_PREFIX = "locale_"') && buildStatus.includes('state.available'));
  check('and still reads an older file that carried a list', buildStatus.includes('data.get("locales")'));

  const edits = handlers.match(/event\.edit\(/g) ?? [];
  check('every callback edit goes through redraw(), which accepts an unchanged message', edits.length === 1 && handlers.includes('except MessageNotModifiedError:'), `${edits.length} bare event.edit( calls`);
  check('a gateway timeout or a reset connection is SupabaseUnavailable', supabase.includes('class SupabaseUnavailable(SupabaseError)') && supabase.includes('httpx.TransportError'));
  check('every request in supabase.py goes through _send', (supabase.match(/self\._client\.(get|post|request|patch|delete)\(/g) ?? []).length === 1);
  for (const file of ['security.py', 'outbox.py']) {
    const src = read(join(BOT, file));
    check(`${file} reports an outage as two lines and keeps the traceback for everything else`, src.includes('except SupabaseUnavailable as cause:') && src.includes('self._weather.recovered()') && src.includes('log.exception('));
  }

  const python = spawnSync('python', ['-c', 'import httpx, telethon; print("ok")'], { encoding: 'utf8' });
  if (python.status !== 0) {
    skip("the bot's list, run against the real file", 'python with httpx and telethon is not on this machine');
    return;
  }
  const run = spawnSync('python', ['-c', BOT_LOCALES], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  check('the derivation ran', run.status === 0, run.stderr.slice(-600));
  if (run.status !== 0) return;
  const [now, flipped, msOn, zhOff, old] = JSON.parse(run.stdout.trim().split('\n').pop());
  check('before the flip the bot offers English and Chinese', now.join() === 'en,zh', now.join());
  check('after the flip, both held languages stay off', flipped.join() === 'en,zh', flipped.join());
  check('a language switched on is offered', msOn.join() === 'en,zh,ms', msOn.join());
  check('a language switched off is not, and English is always first', zhOff.join() === 'en,ms', zhOff.join());
  check('an older file with a locales list is still read', old.join() === 'en,zh', old.join());
  check('language_switcher never became a language', ![now, flipped, msOn, zhOff].flat().includes('switcher'));

  const syntax = spawnSync('python', ['-m', 'py_compile', join(BOT, 'handlers.py'), join(BOT, 'supabase.py'), join(BOT, 'security.py'), join(BOT, 'outbox.py'), join(BOT, 'build_status.py')], { encoding: 'utf8' });
  check('the five bot files compile', syntax.status === 0, syntax.stderr);
});

/* -------------------------------------------------------------------------
 * rich
 * ---------------------------------------------------------------------- */

const RICH_PROBE = `
import asyncio, json, re, sys
sys.path.insert(0, ${JSON.stringify(BOT)})
from telethon import types
from telethon.errors import FloodWaitError, MessageNotModifiedError
from telethon.tl import functions
import reply, docs

out = {}

# The converter.
r = reply.from_html('<b>Careers@GFTV</b>\\n\\nRole: <b> Video #3 </b> and <i>x</i>, <code>a|b</code>, <a href="https://x.test/a_b">the *portal*</a> &amp; <pre>1\\n 2</pre>')
out['converter'] = r

# Builders.
out['heading'] = reply.heading('<b>Your applications</b>', 2)
out['titled'] = reply.titled('<b>Title</b>\\n\\nBody one.\\n\\nBody two.')
out['table'] = reply.table(['Role', 'Status'], [[reply.from_html('<b>Video | editor</b>'), 'Shortlisted']])
out['bullets'] = reply.bullets([reply.from_html('<b>One</b>'), reply.from_html('Two')])

# The guides, from the two pages that carry a tabbed block and a table.
def page(path):
    body = open(path, encoding='utf-8').read()
    return re.sub(r'^---[\\s\\S]*?\\n---\\n', '', body)
note = lambda kind: f'[{kind} on the site]'
tabs = docs.paginate(docs.render(page(${JSON.stringify(join(DOCS, 'content/portal/offline-and-installing.md'))}), note=note, base='https://docs.test'))
auth = docs.paginate(docs.render(page(${JSON.stringify(join(DOCS, 'api/_content/developer/authentication.md'))}), note=note, base='https://docs.test'))
out['tabs'] = tabs
out['auth'] = auth

# The sends, against a client that answers as told.
class Client:
    def __init__(self, fail):
        self.fail = fail
        self.raw = []
        self.plain = []
    def build_reply_markup(self, buttons):
        return {'buttons': buttons}
    async def __call__(self, request):
        self.raw.append(request)
        if self.fail:
            raise self.fail
        return types.UpdateShortSentMessage(id=42, pts=1, pts_count=1, date=None, out=True)
    async def send_message(self, entity, text, **kwargs):
        self.plain.append((entity, text, kwargs))
    async def edit_message(self, *args, **kwargs):
        self.plain.append((args, kwargs))

async def sends():
    reply_ = reply.rich('# Hi', 'Hi')
    ok = Client(None)
    result = await reply.send_rich_message(ok, 1, reply_, [['b']])
    out['sent_ok'] = {
        'raw': type(ok.raw[0]).__name__,
        'message': ok.raw[0].message,
        'rich': type(ok.raw[0].rich_message).__name__,
        'markdown': ok.raw[0].rich_message.markdown,
        'id': reply.sent_message_id(result),
        'plain_calls': len(ok.plain),
    }
    refused = Client(RuntimeError('RICH_MESSAGE_INVALID'))
    await reply.send_rich_message(refused, 1, reply_, None)
    out['sent_refused'] = {'plain': refused.plain[0][1], 'parse_mode': refused.plain[0][2].get('parse_mode', 'unset')}
    flood = Client(FloodWaitError(request=None, capture=7))
    try:
        await reply.send_rich_message(flood, 1, reply_, None)
        out['flood'] = 'swallowed'
    except FloodWaitError:
        out['flood'] = 'raised'
    try:
        await reply.send_rich_message(ok, 1, reply.rich('# x', '  '), None)
        out['empty'] = 'sent'
    except ValueError:
        out['empty'] = 'refused'
    same = Client(MessageNotModifiedError(request=None))
    await reply.edit_rich_message_at(same, 1, 5, reply_, None)
    out['edit_same'] = {'raw': len(same.raw), 'plain': len(same.plain), 'markup': type(same.raw[0].reply_markup).__name__, 'rows': len(same.raw[0].reply_markup.rows)}
    class Query:
        peer = 1
        msg_id = 5
    class Event:
        query = Query()
    cb = Client(None)
    await reply.edit_rich_message(cb, Event(), reply_, [['b']])
    out['edit_cb'] = type(cb.raw[0]).__name__

asyncio.run(sends())
print(json.dumps(out, default=str))
`;

define('rich', "Part 2: the bot's rich messages, and the guides drawn as pages", async () => {
  const replyPy = read(join(BOT, 'reply.py'));
  const handlers = read(join(BOT, 'handlers.py'));
  const outbox = read(join(BOT, 'outbox.py'));
  const docsPy = read(join(BOT, 'docs.py'));

  check('requirements.txt floors Telethon at 1.44, the first layer with rich_message', /telethon>=1\.44,<2/.test(read(join(BOT, 'requirements.txt'))));
  check('reply.py sends the three raw requests with a rich_message', ['SendMessageRequest', 'EditMessageRequest', 'EditInlineBotMessageRequest'].every((name) => replyPy.includes(`functions.messages.${name}(`)) && (replyPy.match(/rich_message=_rich_markdown\(reply\)/g) ?? []).length === 4);
  check('and applies no parse mode to the plain half', !/parse_mode=["']/.test(replyPy) && /parse_mode=None/.test(replyPy));
  check('a refused rich send falls back to plain text and logs why', replyPy.includes('_fallback_note(') && replyPy.includes('log.warning('));
  check('a flood wait and a blocked chat are passed through to the caller', replyPy.includes('except PASS_THROUGH:\n        raise'));
  check('an edit with no buttons sends an empty keyboard, which is what removes one', replyPy.includes('_NO_BUTTONS = types.ReplyInlineMarkup(rows=[])') && replyPy.includes('else _NO_BUTTONS'));

  for (const [where, name] of [['start', 'handle_start'], ['invites', 'handle_invites'], ['applications', 'handle_applications'], ['jobs', 'handle_jobs'], ['notify', 'handle_notify']]) {
    const body = handlers.slice(handlers.indexOf(`async def ${name}(`), handlers.indexOf('\nasync def ', handlers.indexOf(`async def ${name}(`) + 10));
    check(`/${where} sends a rich message`, body.includes('send_rich_message('), `${name} still uses event.respond for its answer`);
  }
  for (const name of ['handle_notify_callback', 'docs_section', 'docs_page']) {
    const body = handlers.slice(handlers.indexOf(`async def ${name}(`), handlers.indexOf('\nasync def ', handlers.indexOf(`async def ${name}(`) + 10));
    check(`${name} redraws with edit_rich_message`, body.includes('edit_rich_message('));
  }
  check('/tasks stays one plain line, since it has no heading or table', handlers.slice(handlers.indexOf('async def handle_tasks('), handlers.indexOf('async def handle_applications(')).includes('event.respond('));
  check('the command list under /start is a table with two named columns', handlers.includes('table(columns, ready)') && handlers.includes('text("table.command", locale)'));
  check('the four notification kinds render rich replies and the test message does not', (outbox.match(/return Rendered\(join_rich\(parts\)/g) ?? []).length === 3 && outbox.includes('return Rendered(message, buttons)') && outbox.includes('return Rendered(text("test.message", locale))'));
  check('the drain sends a dict through the helper and a string as before', outbox.includes('if isinstance(rendered.message, dict):') && outbox.includes('send_rich_message('));
  check('docs.py draws a table as a table and keeps the notes for what it cannot draw', docsPy.includes('sections[-1][2].append(table(headers, body))') && docsPy.includes('note("image")') && docsPy.includes('note("block")'));

  const python = spawnSync('python', ['-c', 'import telethon; print(telethon.__version__)'], { encoding: 'utf8' });
  const version = python.stdout.trim().split('.').map(Number);
  if (python.status !== 0 || version[0] < 1 || (version[0] === 1 && version[1] < 44)) {
    skip('the converter, the renderer and the sends, run', `python with telethon 1.44 or later is not on this machine (${python.stdout.trim() || python.stderr.trim()})`);
    return;
  }
  const run = spawnSync('python', ['-c', RICH_PROBE], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  check('the probe ran', run.status === 0, run.stderr.slice(-800));
  if (run.status !== 0) return;
  const out = JSON.parse(run.stdout.trim().split('\n').pop());

  const conv = out.converter;
  check('bold becomes ** hugging the text, with the space moved outside', conv.markdown.includes('**Video \\#3**') && !conv.markdown.includes('** Video') && !conv.markdown.includes('3 **'));
  check('a hash in data is escaped for markdown and left alone in the plain half', conv.fallback.includes('Video #3') && conv.markdown.includes('\\#3'));
  check('a code span is literal, pipe and all', conv.markdown.includes('`a|b`'));
  check('a link keeps its address and escapes its label', conv.markdown.includes('[the \\*portal\\*](https://x.test/a_b)') && conv.fallback.includes('the *portal*'));
  check('an entity is decoded once, on both sides', conv.markdown.includes(' & ') && conv.fallback.includes(' & '));
  check('a pre block is fenced', conv.markdown.includes('```\n1\n 2\n```'));
  check('the plain half carries no tag', !/<\/?[a-z]+>/.test(conv.fallback));

  check('a bold string becomes a heading of the asked level', out.heading.markdown === '## Your applications' && out.heading.fallback === 'Your applications');
  check('titled() splits a bold first line from its paragraphs', out.titled.markdown.startsWith('# Title\n\nBody one\\.') || out.titled.markdown.startsWith('# Title\n\nBody one.'));
  check('a table escapes a pipe inside a cell and gives the plain half a line per row', out.table.markdown.includes('| **Video \\| editor** | Shortlisted |') && out.table.fallback === 'Video | editor · Shortlisted');
  check('a bullet list is dashes on one side and bullets on the other', out.bullets.markdown === '- **One**\n- Two' && out.bullets.fallback === '• One\n• Two');

  const tabsMd = out.tabs.map((p) => p.markdown).join('\n\n');
  const tabsPlain = out.tabs.map((p) => p.fallback).join('\n\n');
  check('a tabbed block is drawn as bold titles with their content, not a note', tabsMd.includes('**Android, Chrome**') && !tabsMd.includes('[tabs on the site]'));
  check("the guide's own headings sit at level two", tabsMd.includes('\n## Installing it'));
  check('a callout is a quote with its kind in bold', /> \*\*(Note|Tip|Warning)\*\*\n> /.test(tabsMd) || /> \*\*(Note|Tip|Warning)\*\*/.test(out.auth.map((p) => p.markdown).join('\n')));
  check('a table in a guide is a pipe table on the rich side', out.auth.some((p) => p.markdown.includes('| --- | --- | --- |')));
  check('and a line per row on the plain side, with no pipes', out.auth.every((p) => !p.fallback.includes('| --- |')) && out.auth.some((p) => p.fallback.includes(' · ')));
  check('every page keeps its plain half under the cap and non empty', [...out.tabs, ...out.auth].every((p) => p.fallback.trim() && p.fallback.length <= 4096));
  check('both halves of every page break into the same paragraphs', [...out.tabs, ...out.auth].every((p) => p.markdown.split('\n\n').length === p.fallback.split('\n\n').length));
  check('the plain half of a guide carries no markdown emphasis', !tabsPlain.includes('**'));

  check('a rich send is a raw SendMessageRequest carrying the plain text and the markdown', out.sent_ok.raw === 'SendMessageRequest' && out.sent_ok.message === 'Hi' && out.sent_ok.rich === 'InputRichMessageMarkdown' && out.sent_ok.markdown === '# Hi' && out.sent_ok.plain_calls === 0);
  check('sent_message_id reads the id off the answer', out.sent_ok.id === 42);
  check('a refused rich send falls back to the plain text with no parse mode', out.sent_refused.plain === 'Hi' && out.sent_refused.parse_mode === null);
  check('a flood wait is raised, not hidden behind a second send', out.flood === 'raised');
  check('an empty fallback is refused before anything is sent', out.empty === 'refused');
  check('an unchanged edit is accepted quietly, and an edit with no buttons clears the keyboard', out.edit_same.raw === 1 && out.edit_same.plain === 0 && out.edit_same.markup === 'ReplyInlineMarkup' && out.edit_same.rows === 0);
  check('a callback edit is a raw EditMessageRequest', out.edit_cb === 'EditMessageRequest');
});

/* -------------------------------------------------------------------------
 * docs
 * ---------------------------------------------------------------------- */

define('docs', 'The docs site stays at two languages', async () => {
  const result = runScript('gen-docs-lib.js', ['--check']);
  check('gen-docs-lib.js --check is clean', result.code === 0, result.out.slice(-400));
  const ids = [...read(join(DOCS, 'assets/js/i18n.js')).matchAll(/^\s*\{ id: '([a-z-]+)'/gm)].map((m) => m[1]);
  check("the docs site's i18n.js lists two languages", ids.join() === 'en,zh', ids.join());
  check("the docs site's validate.js lists two", read(join(DOCS, 'api/_lib/validate.js')).includes("Object.freeze(['en', 'zh'])"));
  const dictionaries = readdirSync(join(DOCS, 'assets/i18n')).filter((f) => f.endsWith('.json')).sort();
  check('and it has two dictionaries on disk', dictionaries.join() === 'en.json,zh.json', dictionaries.join());
  check("the docs worker was bumped for the regenerated modules", /phase15-v\d+/.test(read(join(DOCS, 'sw.js'))));
});

/* -------------------------------------------------------------------------
 * worker
 * ---------------------------------------------------------------------- */

define('worker', 'The portal worker precaches no held dictionary', async () => {
  const sw = read(join(MAIN, 'sw.js'));
  check('sw.js was bumped', /careers-gftv-phase15-v\d+/.test(sw));
  check('en.json and zh.json are precached', sw.includes("'/assets/i18n/en.json'") && sw.includes("'/assets/i18n/zh.json'"));
  for (const code of HELD) {
    check(`${code}.json is not, while it is held`, !sw.includes(`'/assets/i18n/${code}.json'`));
  }
  const precache = runScript('check-precache.js');
  check('check-precache.js passes with the two copies expected absent', precache.code === 0 && read(join(REPO, 'check-precache.js')).includes("'assets/i18n/ms.json'"), precache.out.slice(-400));
});

/* -------------------------------------------------------------------------
 * banner
 * ---------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * The portal, served from the working tree with every API answered as a
 * stranger with nothing switched off, and build-status.json served with every
 * phase shipped or with phase 15 building, so both halves of the rule can be
 * looked at: the official bar on one page, the phase notice on the other.
 */
function servePortal(shipped) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/assets/build-status.json') {
      const status = json(join(MAIN, 'assets/build-status.json'));
      const phase15 = status.phases.find((p) => p.number === 15);
      phase15.status = shipped ? 'shipped' : 'building';
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      return res.end(JSON.stringify(status));
    }
    if (url.pathname === '/api/public/feature-status') {
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      return res.end(JSON.stringify({ ok: true, data: { off: {} } }));
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': TYPES['.json'] });
      return res.end(JSON.stringify({ ok: false, error: { code: 'not_found' } }));
    }
    const candidates = [
      join(MAIN, url.pathname.slice(1)),
      join(MAIN, url.pathname.slice(1), 'index.html'),
      join(MAIN, `${url.pathname.slice(1)}.html`),
    ];
    const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!file) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
}

async function listen(server) {
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  return `http://127.0.0.1:${server.address().port}`;
}

define('banner', 'Part 3: the official site banner, and the flip', async () => {
  const status = json(join(MAIN, 'assets/build-status.json'));
  const bar = read(join(MAIN, 'assets/js/official-bar.js'));
  const shellJs = read(join(MAIN, 'assets/js/shell.js'));
  const docsShell = read(join(DOCS, 'assets/js/shell.js'));
  const en = json(join(MAIN, 'assets/i18n/en.json'));
  const zh = json(join(MAIN, 'assets/i18n/zh.json'));
  const docsEn = json(join(DOCS, 'assets/i18n/en.json'));
  const docsZh = json(join(DOCS, 'assets/i18n/zh.json'));

  /* --- The flip ---------------------------------------------------------- */

  check('every phase reads shipped', status.phases.every((p) => p.status === 'shipped'), status.phases.filter((p) => p.status !== 'shipped').map((p) => p.number).join(', '));
  check('phase 15 has its shipped note in both languages', typeof status.phases[14].shipped_note === 'string' && typeof status.phases[14].shipped_note_zh === 'string' && status.phases[14].shipped_note.length > 200);
  check('and the note says the two languages are off, not that they arrived', /both are off/.test(status.phases[14].shipped_note));

  /* --- The module ---------------------------------------------------------- */

  check('the domain list is the one place the domains are', bar.includes("OFFICIAL_DOMAINS = Object.freeze(['globalfurry.tv', 'gftv.asia'])") && bar.includes("t('official.domainHeading', {") && !/globalfurry\.tv or gftv\.asia/.test(bar));
  check('the trusted sites link is the address given on 12 September', bar.includes("TRUSTED_SITES_URL = 'https://gftv.asia/trusted-sites'"));
  check('there is no close control and nothing stored that hides it', !/dismiss|close/i.test(bar.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')) && bar.includes("OPEN_KEY = 'gftv-careers.officialBarOpen'"));
  check('the copy never claims the site is safe or verified', ['official.line', 'official.domainHeading', 'official.domainBody', 'official.secureHeading', 'official.secureBody', 'official.trustedLink'].every((key) => !/\b(safe|verified|trusted site\b)/i.test(en[key]) && !/安全的网站|已验证/.test(zh[key])));
  check('the eight strings are in all four dictionaries, the copy from gftv-official.md', ['official.line', 'official.toggle', 'official.domainHeading', 'official.domainJoin', 'official.domainBody', 'official.trustedLink', 'official.secureHeading', 'official.secureBody'].every((key) => en[key] && zh[key] && docsEn[key] && docsZh[key]));
  check('the portal draws it only when every phase has shipped, in the paint that draws the notice', shellJs.includes("if (allShipped(status)) insertTopBar(renderOfficialBar(), 'official-bar');"));
  check('it is first in the stack, above the connection bar', read(join(MAIN, 'assets/js/top-bars.js')).includes("const ORDER = ['official-bar', 'connection-notice', 'phase-notice', 'site-header'];"));
  check('the docs site mounts the generated copy below its skip link', docsShell.includes('mountOfficialBar({') && read(join(DOCS, 'assets/js/official-bar.js')).includes('gen-docs-lib.js'));
  check('both stylesheets carry the bar, from tokens only', [read(join(MAIN, 'assets/css/app.css')), read(join(DOCS, 'assets/css/docs.css'))].every((css) => {
    const block = css.slice(css.indexOf('.gov-bar {'), css.indexOf('.connection-notice {'));
    return block.includes('env(safe-area-inset-top)') && block.includes('prefers-reduced-motion') && !/#[0-9a-f]{3,6}\b|rgb\(/i.test(block);
  }));
  check('the two icons it needs exist', /^\s+lock:/m.test(read(join(MAIN, 'assets/js/icons.js'))) && /^\s+tv:/m.test(read(join(MAIN, 'assets/js/icons.js'))));
  check('the portal worker precaches the module and both workers were bumped', read(join(MAIN, 'sw.js')).includes("'/assets/js/official-bar.js'") && /phase15-v137/.test(read(join(MAIN, 'sw.js'))) && /phase15-v13\b/.test(read(join(DOCS, 'sw.js'))));

  /* --- In a browser ------------------------------------------------------- */

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    skip('the bar in a real browser', 'playwright is not installed');
    return;
  }

  const browser = await chromium.launch();
  try {
    for (const shipped of [true, false]) {
      const server = servePortal(shipped);
      const base = await listen(server);
      const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        const barCount = await page.locator('#officialBar').count();
        const noticeCount = await page.locator('.phase-notice').count();
        if (shipped) {
          check('with every phase shipped, the bar is on the page and the notice is not', barCount === 1 && noticeCount === 0, `bar ${barCount}, notice ${noticeCount}`);
          check('it is the first thing after the skip link', await page.evaluate(() => document.querySelector('.skip-link')?.nextElementSibling?.id === 'officialBar'));
          check('it sits above the header', await page.evaluate(() => {
            const bar = document.getElementById('officialBar');
            const header = document.querySelector('.site-header');
            return bar && header && bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING;
          }));
          check('one row at 320px', await page.evaluate(() => document.getElementById('officialBar').getBoundingClientRect().height < 48));
          check('collapsed on a first visit: aria-expanded false and the panel hidden', await page.evaluate(() => {
            const toggle = document.getElementById('officialBarToggle');
            const panel = document.getElementById('officialBarPanel');
            return toggle.getAttribute('aria-expanded') === 'false' && panel.hidden && toggle.getAttribute('aria-controls') === 'officialBarPanel';
          }));
          check('the line and the toggle read from the dictionary', (await page.locator('.gov-bar-line').textContent()) === en['official.line'] && (await page.locator('#officialBarToggle').textContent()).includes(en['official.toggle']));
          await page.click('#officialBarToggle');
          await page.waitForTimeout(300);
          check('pressing the toggle opens the panel and tracks aria-expanded', await page.evaluate(() => {
            const toggle = document.getElementById('officialBarToggle');
            const panel = document.getElementById('officialBarPanel');
            return toggle.getAttribute('aria-expanded') === 'true' && !panel.hidden && panel.getBoundingClientRect().height > 40;
          }));
          check('the panel has two real headings, the domain rule first', await page.evaluate(() => {
            const heads = [...document.querySelectorAll('#officialBarPanel h2')].map((h) => h.textContent);
            return heads.length === 2 && heads[0].includes('globalfurry.tv') && heads[0].includes('gftv.asia');
          }));
          check('one column below 640px', await page.evaluate(() => {
            const points = [...document.querySelectorAll('.gov-bar-point')];
            return points[1].getBoundingClientRect().top > points[0].getBoundingClientRect().bottom - 1;
          }));
          check('the trusted sites link is a plain link to the given address', await page.evaluate(() => document.querySelector('#officialBarPanel a')?.getAttribute('href') === 'https://gftv.asia/trusted-sites'));
          check('no button in the bar closes or hides it', await page.evaluate(() => document.querySelectorAll('#officialBar button').length === 1));
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForTimeout(300);
          check('expansion is remembered across a reload', await page.evaluate(() => document.getElementById('officialBarToggle').getAttribute('aria-expanded') === 'true' && !document.getElementById('officialBarPanel').hidden));
          await page.click('#officialBarToggle');
          await page.waitForTimeout(400);
          check('and collapsing hides the panel again, out of the accessibility tree', await page.evaluate(() => document.getElementById('officialBarPanel').hidden));
          await page.click('#languageButton');
          await page.click('.locale-btn[data-locale="zh"]');
          await page.waitForTimeout(300);
          check('a language change refills the bar in place, once', (await page.locator('#officialBar').count()) === 1 && (await page.locator('.gov-bar-line').textContent()) === zh['official.line']);
          check('and the domain heading is rebuilt from the list in that language', (await page.locator('#officialBarPanel h2').first().textContent()) === zh['official.domainHeading'].replace('{domains}', `globalfurry.tv${zh['official.domainJoin']}gftv.asia`));
        } else {
          check('with a phase still building, the notice is on the page and the bar is not', barCount === 0 && noticeCount === 1, `bar ${barCount}, notice ${noticeCount}`);
        }
      } finally {
        await context.close();
        server.close();
      }
    }
  } finally {
    await browser.close();
  }
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 15 verification');
  console.log('  no section needs a credential, a database or the network');

  const unknown = (ONLY ?? []).filter((name) => !SECTIONS.some((entry) => entry.name === name));
  if (unknown.length > 0) {
    console.error(`\nNo such section: ${unknown.join(', ')}`);
    console.error(`Sections: ${SECTIONS.map((entry) => entry.name).join(', ')}`);
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
  console.error(cause);
  process.exit(1);
});
