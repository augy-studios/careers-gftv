// Builds zh-review.html: every translatable string in the build, English beside
// Chinese, for review by a fluent Singaporean speaker.
//
//   node gen-review.js            write the page, and report what it cannot see
//
// Reads the interface dictionaries, the seeded departments and tags from
// migration 014, the hero copy from 018, the phase list and its shipped notes
// from build-status.json, and the Telegram bot's own strings and command menu
// from the two Python files that hold them, then writes a single self contained
// page to the repo root.
//
// Single file on purpose, which is a deliberate departure from the split
// HTML, CSS, and JS used everywhere in main-site. That convention exists so a
// browser can cache one stylesheet across many pages; this page is served by
// nothing. It is attached to an email or a chat message and opened by a
// reviewer who is not a developer, so it has to survive being dragged out of
// a folder on its own, and it must render with no network. There is no
// JavaScript in the output at all.
//
// The output is gitignored. Regenerate it instead of editing it, and edit
// this file and not the HTML.
//
// **What phase 12 part 4 changed, and why any of it was needed.**
//
// This file was written in phase 3, when the dictionary was about two hundred
// keys in fifteen groups, and it listed those fifteen by name. Nine phases then
// added 1,505 keys in twenty six groups that were never added to the list, so
// the page rendered 223 interface strings, counted 1,728 of them in its own
// header, and told the reviewer it was showing every word of Chinese on the
// portal. **A list of things to include is a list somebody wrote**, and what is
// missing from one is invisible by construction: the same failure phase 12 part
// 3 found when a probe measured 26 colours and never asked about a fill with a
// label on it. So the interface section now renders every key the dictionary
// holds and `ORDER` decides only what comes first; a group nobody has described
// gets a heading, a count and a generic note rather than being dropped.
//
// The same reasoning is why this file now knows what it does **not** read.
// `scanForUnreviewed()` walks everything that ships and reports any file
// carrying Chinese that is neither a source below nor exempt with a reason
// written beside it, so the next file that puts 华文 in front of a reader
// cannot quietly miss the round trip. `tests/phase12-test.mjs` asserts it.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.join(__dirname, '');
const out = path.join(repo, 'zh-review.html');

const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');

/* -------------------------------------------------------------------------
 * What this page reads, and what it deliberately does not
 * ---------------------------------------------------------------------- */

/** Every file that contributes a string to the page, and what it contributes.
 *
 *  Named rather than implied, because the scan below is only as good as this
 *  list: a source missing from here is a source the scan will report, which is
 *  the point.
 */
const SOURCES = {
  'main-site/assets/i18n/en.json': 'The English dictionary, which is the source column.',
  'main-site/assets/i18n/zh.json': 'The interface in 华文, every key.',
  'docs-site/assets/i18n/en.json':
    "The documentation site's own chrome in English, which is the source column for it.",
  'docs-site/assets/i18n/zh.json':
    "The same chrome in 华文. **175 of its 242 keys are lifted from the portal's dictionary unchanged** and are already on this page under their own reference; only the 67 this site owns are new, and they are the ones grouped under docs. below.",
  'main-site/assets/build-status.json': 'The fifteen phases, their descriptions, and the note each shipped one carries.',
  'migrations/013_seed_reference_data.sql': 'The English names and descriptions of the departments and tags.',
  'migrations/014_locales_and_translations.sql': 'Those same departments and tags in 华文.',
  'migrations/018_bilingual_settings.sql': 'The home page hero, which is stored as a setting.',
  'telegram-bot/strings.py': 'Everything the bot says, in both languages.',
  'telegram-bot/commands.py': "The nine command descriptions, which Telegram's own menu shows.",
  'telegram-bot/setup.md':
    "The bot's About and Description, which live in a document because nothing calls the API that sets them yet.",
};

/** Singapore Mandarin, in one place, because three documents state the rule.
 *
 *  `main-site/README.md` and `migrations/README.md` both carry a version of this
 *  list in prose, and the brief on this page carried a third. It is the shape
 *  `commands.py` already solved for the command list: **a list copied into
 *  documents needs a check, not a docstring.** The brief below is generated from
 *  this table and `tests/phase12-test.mjs` measures the strings against it, so
 *  what the reviewer is told and what is enforced cannot drift.
 *
 *  `except` is what keeps a substring from being read as a word. 中文 is the
 *  case that proves it is needed: 选中文字, "select text", contains those two
 *  characters and means nothing of the sort. **华文 has no spaces between
 *  words**, which is the same fact that made a sixteen character tag name look
 *  like a cramped button in part 1, arriving from the other direction.
 */
const USAGE = [
  { mainland: '志愿者', singapore: '义工', except: [] },
  { mainland: '中文', singapore: '华文', except: ['选中文', '中文字'] },
  { mainland: '电子邮件', singapore: '电邮', except: [] },
  { mainland: '运营', singapore: '营运', except: [] },
  { mainland: '合同', singapore: '合约', except: [] },
  { mainland: '录影棚', singapore: '摄影棚', except: [] },
  // **The one that the rule does not settle.** Both READMEs say 文件 rather
  // than 文档, and every occurrence in the build is "the documentation site"
  // rather than a file, which is a different sense of the word. Whether a
  // documentation site is 文档 in Singapore is a wording judgement and not a
  // rule, so it is measured and printed rather than asserted, and it is one of
  // the things the round trip is for. Part 3's precedent for the star fill and
  // the note callout's border, applied to a word.
  {
    mainland: '文档',
    singapore: '文件',
    except: [],
    strict: false,
    why: 'the rule is about a file, and all six are "the documentation site"',
  },
];

/** Where a term appears in a string, with the exceptions taken out. */
function usageHits(text, entry) {
  const value = String(text ?? '');
  const hits = [];
  let from = 0;
  for (;;) {
    const at = value.indexOf(entry.mainland, from);
    if (at === -1) break;
    from = at + 1;
    const around = value.slice(Math.max(0, at - 3), at + entry.mainland.length + 3);
    if (entry.except.some((phrase) => around.includes(phrase))) continue;
    hits.push(at);
  }
  return hits;
}

/** Files that carry Han characters and are not reviewable copy, with the reason.
 *
 *  **A reason rather than a list of paths.** Every entry here is a claim that a
 *  reader never sees these characters as words, and each one is a claim somebody
 *  can check. Anything not in `SOURCES` and not here is reported.
 */
const EXEMPT = {
  'main-site/api/_lib/form-check.js':
    'Chinese it matches, not Chinese it says: the wording Google Forms itself puts on a closed form.',
  'main-site/assets/js/i18n.js':
    "The language's own name, 华文, and the comment arguing for it over 中文.",
  'main-site/assets/js/annotate.js':
    'A character range in a regular expression, not words.',
  'main-site/assets/js/job-page.js':
    '远程 inside a regex over a location an admin typed, so a remote role is not badged twice.',
  'main-site/assets/js/job-card.js': 'The same regex as job-page.js.',
  'main-site/assets/js/account-row.js': 'The same regex again.',
  'main-site/assets/js/format.js': 'A comment about what survives a language switch.',
  // The generated copy, from phase 13 part 6. It carries the same comment
  // because it carries the same file: an exemption for a source and not for its
  // copy would fail on every run of gen-docs-lib.js.
  'docs-site/assets/js/format.js': "The same comment, in the docs site's generated copy.",
  'docs-site/shell.html':
    'A comment about what a 华文 reader would otherwise see before the dictionary arrives. Every string that site shows is in its two dictionaries, which are on this page.',
  'main-site/about/index.html':
    'The organisation name inside an English sentence, and a heading whose text comes from the dictionary.',
  'main-site/assets/i18n/en.json':
    'Three English strings that deliberately carry 华文 or 国际兽视. Reviewed as part of the interface all the same.',
  'telegram-bot/lang.py': 'A comment about which language an account reads in.',
  'migrations/dev-seed-jobs.sql':
    'The dev seed. Every row says SAMPLE POSTING and the file deletes them again; it goes before this is a real site.',
  'migrations/031_task_questions.sql': 'A comment.',
  'main-site/README.md': 'A document, and one of the three places the Singapore Mandarin rule is written down.',
  'migrations/README.md': 'The same rule again, about the seeded departments and tags.',
  'telegram-bot/README.md': 'The by-hand checklist, which asks somebody to switch Telegram to 华文.',
  'docs-site/README.md':
    'A document. It names the language the second sample account reads, in that language, where the screenshot rules are written down.',
  'docs-site/assets/js/i18n.js':
    'The generated copy of the portal\'s i18n.js. Its Chinese is in comments, and the portal\'s original is not on this page either.',
  'docs-site/assets/js/markdown.js':
    'A character range in a regular expression, so a Chinese heading gets an id made of its own words instead of one made of dashes. Not words.',
  'docs-site/assets/i18n/en.json':
    'One 华文 in the file comment, saying when the Chinese dictionary arrives. The strings themselves are English and this site has no Chinese one until phase 14.',
  // Outside SCAN_ROOTS, since the repo root holds this file, the specification
  // and the memo and is not scanned at all. Written down anyway: the judgement
  // is the one dev-seed-jobs.sql gets, and if the root is ever scanned it is
  // already answered rather than arriving as a finding on the day.
  'seed.mjs':
    'The seed script. Its one Chinese posting is sample data marked 样本 in the same breath, and the script deletes it again.',
};

/** Where the scan looks: everything that reaches a reader.
 *
 *  Documents and checks are not in it — `careers-gftv-spec.md`, this file, the
 *  phase test files and `check-precache.js` all carry Chinese and none of it is
 *  copy. `docs-site/` is here rather than waiting for phase 13, so the first
 *  page written into it that carries 华文 is reported the day it appears.
 */
const SCAN_ROOTS = ['main-site', 'telegram-bot', 'migrations', 'docs-site'];

// `dist` is the docs site's build output, phase 13 part 5: copies of files this
// scan already reads at their source, plus one HTML page per public markdown
// page. Reading it would report the same comment twice and ask for an exemption
// on a file nobody wrote.
const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', '__pycache__', 'dist']);
const SCAN_SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.map',
]);

const HAN = /[㐀-䶿一-鿿豈-﫿]/;

/** Files carrying Chinese that are neither a source nor exempt.
 *
 *  Returns `[{ file, lines }]`, empty when everything is accounted for.
 */
function scanForUnreviewed() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(repo, dir), { withFileTypes: true });
    } catch {
      return; // A root that does not exist yet is not a finding.
    }
    for (const entry of entries) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SCAN_SKIP_DIRS.has(entry.name)) walk(relative);
        continue;
      }
      if (SCAN_SKIP_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      if (relative in SOURCES || relative in EXEMPT) continue;
      let text;
      try {
        text = fs.readFileSync(path.join(repo, relative), 'utf8');
      } catch {
        continue;
      }
      if (!HAN.test(text)) continue;
      const lines = text
        .split('\n')
        .map((line, index) => [index + 1, line.trim()])
        .filter(([, line]) => HAN.test(line));
      found.push({ file: relative, lines });
    }
  };
  for (const root of SCAN_ROOTS) walk(root);
  return found;
}

/* -------------------------------------------------------------------------
 * The sources
 * ---------------------------------------------------------------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Where each dictionary group actually appears, so a reviewer has context.
//
// **A group with no entry here is still rendered**, with its name and a generic
// note. Missing context is a worse page; a missing group was a lie about the
// page, and that is the difference between this table and the one it replaced.
const WHERE = {
  common:      ['Shared labels', 'Buttons, menu labels, and screen reader text used on every page.'],
  brand:       ['Product name', 'The wordmark itself. Appears in the header, every page title, and the footer.'],
  nav:         ['Main menu', 'The four items behind the menu button, and inline on wide screens.'],
  footer:      ['Footer', 'Three link columns and the tagline, on every page.'],
  theme:       ['Theme picker', 'The palette button in the header.'],
  language:    ['Language picker', 'The globe button in the header. This is the panel a Chinese reader finds first.'],
  notice:      ['Build notice', 'The slim bar at the very top of every page.'],
  feature:     ['Unavailable features', 'Shown on a control for something not built yet. The wording of the first one is fixed by the brief and cannot change; only its translation is under review.'],
  featureName: ['Feature names', 'What each feature is called on the build status page and wherever one is switched off.'],
  featureWhere:['Where a feature appears', 'The sentence on the status page saying where in the site each feature lives.'],
  featureDenied:['A feature switched off', 'Shown when an admin has turned something off for a while, rather than when it is unbuilt.'],
  placeholder: ['Not-built pages', 'The page shown for a route that belongs to a later phase.'],
  status:      ['Build status page', 'The public page listing every phase.'],
  home:        ['Home page', 'The landing page. The most read Chinese on the site.'],
  about:       ['About page', 'Who GFTV is, and the unpaid notice in full.'],
  faq:         ['FAQ page', 'The questions a reader asks before applying.'],
  search:      ['Job board', 'Search, the filters, the sort order, and what an empty result says.'],
  job:         ['Job postings', 'A posting page, including the notice on one with no Chinese version yet.'],
  commitment:  ['Commitment types', 'The five values a role can have. Also used as search filter labels.'],
  apply:       ['Applying', 'The apply dialog, the form handoff, and the did you apply question afterwards.'],
  signin:      ['Sign in prompt', 'What a signed out reader is shown when they press something that needs an account.'],
  auth:        ['Sign in and register', 'Creating an account, signing in, forgotten passwords, and the unpaid reminder before signing up.'],
  codes:       ['Recovery codes', 'The way back in with no email to send a reset link to.'],
  devices:     ['Trusted devices', 'The devices a second factor is not asked for on.'],
  security:    ['Account security', 'Passwords, passkeys, the second factor, and the sessions list.'],
  staffSecurity:['Staff security', 'The same page for a staff account, which signs in against gftv.asia.'],
  account:     ['Account area', 'The shell around the five pages an applicant has of their own.'],
  applications:['My applications', 'Every role applied to, where each stands, and the waiting period.'],
  saved:       ['Saved roles', 'The bookmark on a card or a posting, and the list it fills.'],
  tasks:       ['Outstanding tasks', 'Anything the team needs from an applicant, and the answer box.'],
  settings:    ['Account settings', 'Details, the picture, the Telegram panel, and the language choice.'],
  danger:      ['Danger zone', 'Deleting an account, which asks three times.'],
  offline:     ['No connection', 'The bar above the header, the offline page, and the sentence beside a control that needs a network.'],
  helper:      ['Translation helpers', 'The area an applicant granted one language works in.'],
  annotate:    ['Suggesting wording', 'Selecting text anywhere on the site and proposing a better version of it.'],
  audit:       ['Account history', 'One line for each thing that has happened to an account.'],
  report:      ['Translation reports', 'The form an applicant uses to tell us a translation reads wrongly. Ships with the job board.'],
  field:       ['Form fields', 'Labels shared by more than one form.'],
  error:       ['Errors', 'What is shown when something fails.'],
  notFound:    ['404 page', 'Shown for an address that does not exist.'],
  admin:       ['Staff dashboard', 'Never seen by an applicant. Worth reading last, and worth reading: a helper granted 华文 works in these pages.'],
};

// The order a reviewer meets the groups in, most read first. Anything not named
// here follows, alphabetically, rather than being left out.
const ORDER = ['brand', 'language', 'home', 'nav', 'footer', 'common', 'search', 'commitment', 'job',
               'apply', 'signin', 'about', 'faq', 'notice', 'feature', 'featureName', 'featureWhere',
               'featureDenied', 'placeholder', 'status', 'notFound', 'report', 'theme', 'offline',
               'auth', 'codes', 'devices', 'security', 'staffSecurity', 'account', 'applications',
               'saved', 'tasks', 'settings', 'danger', 'audit', 'field', 'error',
               'helper', 'annotate', 'admin'];

/** The bot's own strings, asked of the bot rather than parsed out of it.
 *
 *  `strings.py` and `commands.py` both check themselves at import — every locale
 *  carries every key, every command describes itself in every language — so
 *  importing them gets those guarantees for free, and a regular expression over
 *  Python source would get neither. `ensure_ascii` keeps the whole exchange in
 *  ASCII, which is what makes this work on a Windows console without anybody
 *  setting a code page.
 *
 *  **It throws rather than returning nothing.** A page quietly missing the bot's
 *  half is exactly the failure this part of phase 12 exists to remove.
 */
function botStrings() {
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(path.join(repo, 'telegram-bot'))})`,
    'import strings, commands',
    'print(json.dumps({',
    '  "messages": strings.STRINGS,',
    '  "commands": {c.name: c.summary for c in commands.COMMANDS},',
    '}, ensure_ascii=True))',
  ].join('\n');

  const problems = [];
  for (const runner of ['python', 'py', 'python3']) {
    try {
      const stdout = execFileSync(runner, ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(stdout);
    } catch (cause) {
      problems.push(`${runner}: ${String(cause.message ?? cause).split('\n')[0]}`);
    }
  }
  throw new Error(
    'The bot\'s strings could not be read, and a page missing them would not say so.\n  ' +
      problems.join('\n  ')
  );
}

/** The bot's About and Description, in both languages, out of `setup.md`.
 *
 *  **A document is a strange place to keep copy, and it is where this lives.**
 *  BotFather's own menus set one About and one Description for everybody;
 *  per-language versions exist in the Bot API and nothing in this build calls
 *  it yet, so the 华文 pair sits in the setup document waiting for whatever does
 *  it later. It is the first thing a new reader sees above the Start button,
 *  which is reason enough for it to be reviewed rather than left out because of
 *  the file it happens to be in.
 *
 *  Four fenced blocks in section 3, in one order: About and Description in
 *  English, then the same two in 华文. The order is what pairs them, so the
 *  check asserts the first two carry no Han and the last two do — a document
 *  edit that reorders them would otherwise pair English with English and read
 *  as a clean run.
 */
function botProfile() {
  const doc = read('telegram-bot/setup.md');
  // Section 3 and nothing before it. The first shape of this took every fenced
  // block above section 4 and swept up a `/newbot` exchange from section 1,
  // which paired an English block against an English one — and the pairing
  // guard in `tests/phase12-test.mjs` is what said so, on its first run.
  const section = (doc.split('\n## 3.')[1] ?? '').split('\n## ')[0];
  const blocks = [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
  const fields = ['About, 120 characters', 'Description, 512 characters'];
  return blocks.slice(0, 2).map((english, i) => ({
    key: fields[i],
    en: english,
    zh: blocks[i + 2] ?? '',
  }));
}

/** Everything reviewable, in one shape, so the page and the checks agree.
 *
 *  `pairs` is the flat list the checks walk: a reference, the English, and the
 *  Chinese. The page is built from the same object, so a string on the page and
 *  a string under check cannot come apart.
 */
function collect() {
  const en = JSON.parse(read('main-site/assets/i18n/en.json'));
  const zh = JSON.parse(read('main-site/assets/i18n/zh.json'));
  const sql = read('migrations/014_locales_and_translations.sql');
  const settings = read('migrations/018_bilingual_settings.sql');
  const sql013 = read('migrations/013_seed_reference_data.sql');
  const build = JSON.parse(read('main-site/assets/build-status.json'));
  const bot = botStrings();

  const keys = Object.keys(en).filter((k) => k !== '_comment');
  const groups = new Map();
  for (const key of keys) {
    const name = key.split('.')[0];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ key, en: en[key], zh: zh[key] });
  }

  // **The docs site's own chrome, phase 13 part 6a.** Its dictionary is 242
  // keys and 175 of them are the portal's own strings lifted unchanged -- the
  // same sentence in the same words, so putting them on this page twice would
  // ask a reviewer to read and possibly correct one of two copies. Only the
  // keys the portal has never had are added, and they are grouped under a
  // `docs.` prefix because the family names collide: both sites have an
  // `account.`, a `nav.` and a `page.`, and they mean different things.
  const docsEn = JSON.parse(read('docs-site/assets/i18n/en.json'));
  const docsZh = JSON.parse(read('docs-site/assets/i18n/zh.json'));

  for (const key of Object.keys(docsEn)) {
    if (key === '_comment' || key in en) continue;
    const name = `docs.${key.split('.')[0]}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ key, en: docsEn[key], zh: docsZh[key] });
  }

  // Every group, in ORDER's order, then whatever ORDER has never heard of.
  const named = ORDER.filter((name) => groups.has(name));
  const rest = [...groups.keys()].filter((name) => !ORDER.includes(name)).sort();
  const groupOrder = [...named, ...rest];

  // Seed reference data out of the migration. Departments first, then tags.
  const rows = [...sql.matchAll(/\('([a-z-]+)',\s*'([^']+)',\s*'([^']+)'\)/g)].map((m) => ({
    slug: m[1], zh: m[2], desc: m[3],
  }));
  const DEPT_SLUGS = ['production', 'post-production', 'broadcast-engineering', 'creative-and-design',
                      'programming', 'community', 'events', 'operations'];
  const depts = rows.filter((r) => DEPT_SLUGS.includes(r.slug));
  const tags = rows.filter((r) => !DEPT_SLUGS.includes(r.slug));

  // English source for the seeded rows lives in 013.
  const enRows = {};
  for (const m of sql013.matchAll(/\('([^']+)',\s*\n?\s*'([a-z-]+)',\s*\n?\s*'([^']+)'/g)) {
    enRows[m[2]] = { name: m[1], desc: m[3] };
  }
  for (const m of sql013.matchAll(/\('([^']+)',\s+'([a-z-]+)',\s+'([^']+)'\)/g)) {
    if (!enRows[m[2]]) enRows[m[2]] = { name: m[1], desc: m[3] };
  }

  const heroZh = [...settings.matchAll(/'zh',\s*'([^']+)'\)/g)].map((m) => m[1]);
  const heroZh2 = [...settings.matchAll(/'zh',\s*\n?\s*'([^']+)'\)/g)].map((m) => m[1]);
  const hero = [
    { key: 'portal_title', en: 'Careers@GFTV', zh: heroZh[0] || heroZh2[0] },
    { key: 'hero_heading', en: 'Volunteer with Global Furry Television', zh: heroZh[1] || heroZh2[1] },
    { key: 'hero_body', en: "Find a role, apply in a few minutes, and help make the fandom's television station.", zh: heroZh2[heroZh2.length - 1] },
  ];

  // The phase list. Three fields per phase, and the note only where one has
  // shipped, since an unshipped phase carries null in both languages.
  const phases = [];
  for (const phase of build.phases) {
    phases.push({ number: phase.number, field: 'name', en: phase.name, zh: phase.name_zh });
    phases.push({ number: phase.number, field: 'description', en: phase.description, zh: phase.description_zh });
    if (phase.shipped_note) {
      phases.push({ number: phase.number, field: 'shipped note', en: phase.shipped_note, zh: phase.shipped_note_zh });
    }
  }

  const botMessages = Object.keys(bot.messages.en).map((key) => ({
    key, en: bot.messages.en[key], zh: bot.messages.zh[key],
  }));
  const botCommands = Object.entries(bot.commands).map(([name, summary]) => ({
    key: `/${name}`, en: summary.en, zh: summary.zh,
  }));

  const botProfileText = botProfile();

  const data = { en, zh, keys, groups, groupOrder, depts, tags, enRows, hero, phases, botMessages, botCommands, botProfileText };
  data.pairs = flatten(data);
  return data;
}

/** The flat list of what is under review, with the reference each row carries.
 *
 *  The references are the page's own: a reviewer sends back `T4` or `S317` and
 *  a check reports the same code, so a finding and a correction name one thing.
 */
function flatten(data) {
  const pairs = [];
  data.depts.forEach((d, i) => {
    pairs.push({ ref: `D${i + 1}`, source: 'departments', label: d.slug, en: (data.enRows[d.slug] || {}).name || d.slug, zh: d.zh });
    pairs.push({ ref: `DD${i + 1}`, source: 'departments', label: d.slug, en: (data.enRows[d.slug] || {}).desc || '', zh: d.desc });
  });
  data.tags.forEach((t, i) => {
    pairs.push({ ref: `T${i + 1}`, source: 'tags', label: t.slug, en: (data.enRows[t.slug] || {}).name || t.slug, zh: t.zh });
    pairs.push({ ref: `TD${i + 1}`, source: 'tags', label: t.slug, en: (data.enRows[t.slug] || {}).desc || '', zh: t.desc });
  });
  data.hero.forEach((h, i) => pairs.push({ ref: `H${i + 1}`, source: 'hero', label: h.key, en: h.en, zh: h.zh }));

  let n = 0;
  for (const group of data.groupOrder) {
    for (const entry of data.groups.get(group)) {
      n += 1;
      pairs.push({ ref: `S${n}`, source: 'interface', label: entry.key, en: entry.en, zh: entry.zh });
    }
  }
  data.phases.forEach((p, i) =>
    pairs.push({ ref: `P${i + 1}`, source: 'phases', label: `phase ${p.number} ${p.field}`, en: p.en, zh: p.zh }));
  data.botMessages.forEach((m, i) =>
    pairs.push({ ref: `M${i + 1}`, source: 'bot', label: m.key, en: m.en, zh: m.zh }));
  data.botCommands.forEach((c, i) =>
    pairs.push({ ref: `C${i + 1}`, source: 'commands', label: c.key, en: c.en, zh: c.zh }));
  data.botProfileText.forEach((g, i) =>
    pairs.push({ ref: `G${i + 1}`, source: 'profile', label: g.key, en: g.en, zh: g.zh }));
  return pairs;
}

/* -------------------------------------------------------------------------
 * The page
 * ---------------------------------------------------------------------- */

function buildHtml(data) {
  const byRef = new Map(data.pairs.map((p) => [p.ref, p]));

  const row = (ref) => {
    const p = byRef.get(ref);
    return `<tr id="${ref}">
      <td class="ref"><span class="chip">${ref}</span></td>
      <td class="src"><code>${esc(p.label)}</code></td>
      <td class="en" lang="en">${esc(p.en)}</td>
      <td class="zh" lang="zh-Hans-SG">${esc(p.zh)}</td>
    </tr>`;
  };

  const table = (head, refs) => `<div class="tablewrap"><table>
    <thead><tr><th class="ref">Ref</th><th class="src">${head}</th><th class="en">English</th><th class="zh">华文</th></tr></thead>
    <tbody>${refs.map(row).join('')}</tbody></table></div>`;

  const refsFor = (source) => data.pairs.filter((p) => p.source === source).map((p) => p.ref);

  let sections = '';

  // --- The two expensive groups first ---------------------------------------
  const deptRefs = data.depts.map((_, i) => `D${i + 1}`);
  const deptDescRefs = data.depts.map((_, i) => `DD${i + 1}`);
  const tagRefs = data.tags.map((_, i) => `T${i + 1}`);
  const tagDescRefs = data.tags.map((_, i) => `TD${i + 1}`);

  sections += `<section id="reference" class="pinned">
  <div class="secthead">
    <div>
      <p class="eyebrow">Review these first</p>
      <h2>Departments and tags</h2>
    </div>
    <span class="cost">Expensive to change later</span>
  </div>
  <p class="lede">These ${data.depts.length + data.tags.length} names are stored in the database and every job posting points at them. Renaming one after postings exist means editing each posting that uses it, so a correction here is worth far more now than in a month. The web address of a tag never changes, only the name a reader sees.</p>
  <h3>Departments <span class="count">${data.depts.length}</span></h3>
  ${table('Identifier', deptRefs)}
  <h3>Department descriptions <span class="count">${data.depts.length}</span></h3>
  ${table('Identifier', deptDescRefs)}
  <h3>Tags <span class="count">${data.tags.length}</span></h3>
  ${table('Identifier', tagRefs)}
  <h3>Tag descriptions <span class="count">${data.tags.length}</span></h3>
  ${table('Identifier', tagDescRefs)}
</section>`;

  sections += `<section id="hero">
  <div class="secthead"><div><p class="eyebrow">Editable later without cost</p><h2>Home page hero</h2></div></div>
  <p class="lede">Stored as a setting, so an admin can change this from the dashboard once that ships. Still worth getting right, since it is the first Chinese most readers see.</p>
  ${table('Setting', refsFor('hero'))}
</section>`;

  // --- Interface strings ------------------------------------------------------
  const interfaceRefs = refsFor('interface');
  let taken = 0;
  let iface = '';
  for (const group of data.groupOrder) {
    const entries = data.groups.get(group);
    const refs = interfaceRefs.slice(taken, taken + entries.length);
    taken += entries.length;
    const [title, desc] = WHERE[group] || [group, 'Added since this page last described its groups. Read it as ordinary interface text.'];
    iface += `<h3 id="group-${esc(group)}">${esc(title)} <span class="count">${entries.length}</span></h3>
    <p class="note">${esc(desc)}</p>${table('Key', refs)}`;
  }

  sections += `<section id="interface">
  <div class="secthead"><div><p class="eyebrow">Editable any time</p><h2>Interface text</h2></div></div>
  <p class="lede">Every label, button, heading, and message on the site. Changing one of these is a code edit and a deploy, so corrections are cheap but not instant. Text in braces, like <code>{phase}</code>, is filled in by the site and must stay exactly as written, though it can move within the sentence.</p>
  ${iface}
</section>`;

  // --- The phase list ---------------------------------------------------------
  sections += `<section id="phases">
  <div class="secthead"><div><p class="eyebrow">Editable any time</p><h2>The build, phase by phase</h2></div></div>
  <p class="lede">The site is being built in fifteen phases and says so publicly. Each phase carries a name, a description, and once it is live a note saying what a reader can now do. Three separate things read these words: the build status page, the notice bar at the top of every page, and the Telegram bot. The notes are the longest prose on the site and are written for somebody who is not a developer.</p>
  ${table('Phase', refsFor('phases'))}
</section>`;

  // --- The bot ----------------------------------------------------------------
  sections += `<section id="bot">
  <div class="secthead"><div><p class="eyebrow">Editable any time</p><h2>The Telegram bot</h2></div></div>
  <p class="lede">A reader who links their Telegram account is written to in the language their account is set to, so this Chinese arrives in a private chat where nobody is reading over anybody's shoulder. Tags like <code>&lt;b&gt;</code> are how Telegram draws bold and italic text and must stay where they are, in pairs. Everything the bot sends is on the site too; nothing arrives only here.</p>
  <h3>What the bot says <span class="count">${data.botMessages.length}</span></h3>
  <p class="note">Every message, including the ones nobody wants to receive: a code that was not asked for, a button that has expired, an error at our end.</p>
  ${table('Key', refsFor('bot'))}
  <h3>The command menu <span class="count">${data.botCommands.length}</span></h3>
  <p class="note">One line each, shown by Telegram itself in the menu beside the message box. Telegram cuts these short if they run long.</p>
  ${table('Command', refsFor('commands'))}
  <h3>The bot's profile <span class="count">${data.botProfileText.length}</span></h3>
  <p class="note">What somebody sees before they have pressed anything: the card when the bot is forwarded to a friend, and the paragraph above the Start button in an empty chat. Both are capped, at 120 and 512 characters, and 华文 says more per character than English does.</p>
  ${table('Field', refsFor('profile'))}
</section>`;

  const total = data.pairs.length;
  const counts = {
    reference: data.depts.length * 2 + data.tags.length * 2,
    hero: data.hero.length,
    interface: interfaceRefs.length,
    phases: data.phases.length,
    bot: data.botMessages.length + data.botCommands.length + data.botProfileText.length,
  };

  // The usage rule, written from the one table rather than typed a third time.
  const usage = USAGE.map((u) => `${u.singapore} not ${u.mainland}`).join(', ');
  const asked = USAGE.filter((u) => u.strict === false);
  const askedSentence = asked.length === 0 ? '' :
    ` One of them is a question rather than a rule and is left to you: ${asked
      .map((u) => `${u.mainland}, where ${u.why}`).join('; ')}.`;

  const contents = [
    ['#reference', 'Departments and tags', counts.reference, 'Stored in the database. Expensive to change once postings point at them.'],
    ['#hero', 'Home page hero', counts.hero, 'The first Chinese most readers see.'],
    ['#interface', 'Interface text', counts.interface, 'Every label and message on the site. The largest part by far.'],
    ['#phases', 'The build, phase by phase', counts.phases, 'The public build status page, and the notice bar.'],
    ['#bot', 'The Telegram bot', counts.bot, 'What arrives in a private chat, and the profile before anybody presses Start.'],
  ].map(([href, title, n, note]) =>
    `<li><a href="${href}"><b>${esc(title)}</b> <span class="count">${n}</span></a><span class="tocnote">${esc(note)}</span></li>`
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Careers@GFTV 华文校对</title>
<style>
:root{
  --bg:#ffffff; --raised:#f5f5f5; --sunken:#fafafa;
  --text:#1a1a2e; --muted:#4a5568; --faint:#6b7280;
  --line:rgba(180,190,200,.45); --line-strong:rgba(140,155,170,.6);
  --accent:#4a6a8a; --accent-text:#1a3a5a; --accent-wash:rgba(74,106,138,.08);
  --cost:#8a5200; --cost-wash:rgba(138,82,0,.10);
  --radius:10px; --radius-sm:6px;
  --sans:system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:ui-monospace,'SFMono-Regular',Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#0f1317; --raised:#161b21; --sunken:#131820;
    --text:#eceff3; --muted:#a7b2be; --faint:#7d8794;
    --line:rgba(160,180,200,.20); --line-strong:rgba(160,180,200,.34);
    --accent:#8fb0cf; --accent-text:#cfe0f0; --accent-wash:rgba(143,176,207,.12);
    --cost:#fbbf24; --cost-wash:rgba(251,191,36,.13);
  }
}
:root[data-theme="dark"]{
  --bg:#0f1317; --raised:#161b21; --sunken:#131820;
  --text:#eceff3; --muted:#a7b2be; --faint:#7d8794;
  --line:rgba(160,180,200,.20); --line-strong:rgba(160,180,200,.34);
  --accent:#8fb0cf; --accent-text:#cfe0f0; --accent-wash:rgba(143,176,207,.12);
  --cost:#fbbf24; --cost-wash:rgba(251,191,36,.13);
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:var(--sans); font-size:16px; line-height:1.6;
  -webkit-text-size-adjust:100%;
}
.wrap{max-width:76rem;margin:0 auto;padding:2.5rem 1.25rem 5rem;display:flex;flex-direction:column;gap:3rem}
header.top{display:flex;flex-direction:column;gap:1rem;padding-bottom:2rem;border-bottom:2px solid var(--line-strong)}
h1{font-size:clamp(1.75rem,4vw,2.5rem);line-height:1.15;margin:0;font-weight:600;letter-spacing:-.02em;text-wrap:balance}
h1 .zhtitle{font-weight:500}
.standfirst{margin:0;max-width:60ch;color:var(--muted);font-size:1.0625rem}
.stats{display:flex;flex-wrap:wrap;gap:.5rem 2rem;margin-top:.5rem}
.stat{display:flex;flex-direction:column}
.stat b{font-family:var(--mono);font-size:1.375rem;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.2}
.stat span{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--faint)}
.brief{background:var(--raised);border:1px solid var(--line);border-radius:var(--radius);padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:.75rem}
.brief h2{margin:0;font-size:1rem;font-weight:600}
.brief ol{margin:0;padding-left:1.25rem;display:flex;flex-direction:column;gap:.5rem;color:var(--muted)}
.brief li strong{color:var(--text);font-weight:500}
.brief p{margin:0;color:var(--muted);font-size:.9375rem}
.toc{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:.5rem}
.toc li{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .6rem}
.toc a{color:var(--accent-text);text-decoration-color:var(--line-strong);text-underline-offset:.2em}
.tocnote{color:var(--faint);font-size:.875rem}
section{display:flex;flex-direction:column;gap:1rem;scroll-margin-top:1rem}
.secthead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:1rem}
.eyebrow{margin:0 0 .25rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.09em;color:var(--faint);font-weight:500}
h2{margin:0;font-size:1.5rem;font-weight:600;letter-spacing:-.01em}
h3{margin:1.5rem 0 0;font-size:1.0625rem;font-weight:600;display:flex;align-items:baseline;gap:.5rem;scroll-margin-top:1rem}
.count{font-family:var(--mono);font-size:.8125rem;font-weight:400;color:var(--faint);font-variant-numeric:tabular-nums}
.lede{margin:0;max-width:68ch;color:var(--muted)}
.note{margin:.25rem 0 0;max-width:68ch;color:var(--faint);font-size:.875rem}
.cost{align-self:center;background:var(--cost-wash);color:var(--cost);border:1px solid currentColor;border-radius:999px;padding:.2rem .7rem;font-size:.75rem;font-weight:500;white-space:nowrap}
.pinned{border-left:3px solid var(--cost);padding-left:1.25rem;margin-left:-1.25rem}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--sunken)}
table{width:100%;border-collapse:collapse;font-size:.9375rem}
thead th{text-align:left;font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-weight:600;padding:.6rem .85rem;border-bottom:1px solid var(--line);background:var(--raised);position:sticky;top:0}
td{padding:.7rem .85rem;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:target{background:var(--accent-wash)}
td.ref{width:1%;white-space:nowrap}
.chip{font-family:var(--mono);font-size:.75rem;color:var(--accent-text);background:var(--accent-wash);border-radius:var(--radius-sm);padding:.15rem .45rem;font-variant-numeric:tabular-nums}
td.src{width:16%;min-width:9rem}
td.src code{font-family:var(--mono);font-size:.75rem;color:var(--muted);word-break:break-all}
td.en{width:38%;color:var(--muted)}
td.zh{width:38%;font-size:1.0625rem;line-height:1.8}
footer{border-top:1px solid var(--line);padding-top:1.5rem;color:var(--faint);font-size:.875rem;display:flex;flex-direction:column;gap:.5rem}
code{font-family:var(--mono);font-size:.875em}
@media (max-width:900px){
  td.src{display:none} thead th.src{display:none}
  td.en,td.zh{width:auto;display:block;border-bottom:0;padding-bottom:0}
  td.zh{padding-top:.35rem;padding-bottom:.7rem;border-bottom:1px solid var(--line)}
  td.ref{display:block;border-bottom:0;padding-bottom:.25rem}
  thead{display:none}
  tbody tr{display:block;border-bottom:1px solid var(--line)}
  tbody tr:last-child{border-bottom:0}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="wrap">
  <header class="top">
    <h1>Careers@GFTV <span class="zhtitle">华文校对</span></h1>
    <p class="standfirst">Every word of Chinese in the build, beside its English source: the site, the public build status page, and the Telegram bot. None of it has been read by a fluent speaker yet, and the site goes public when the job board ships.</p>
    <div class="stats">
      <div class="stat"><b>${total}</b><span>Entries</span></div>
      <div class="stat"><b>${counts.interface}</b><span>Interface</span></div>
      <div class="stat"><b>${counts.reference}</b><span>Departments and tags</span></div>
      <div class="stat"><b>${counts.bot}</b><span>Telegram bot</span></div>
      <div class="stat"><b>1</b><span>Reviewer needed</span></div>
    </div>
  </header>

  <div class="brief">
    <h2>How to review this</h2>
    <ol>
      <li><strong>Start with departments and tags.</strong> They are marked below. Everything else can be corrected cheaply later; those cannot.</li>
      <li><strong>Read the Chinese first, English second.</strong> The question is whether the Chinese reads naturally to a Singaporean reader, not whether it matches the English word for word.</li>
      <li><strong>Send corrections as a list of reference codes.</strong> Each row has one, like <code>T4</code> or <code>S31</code>. Write the code and your replacement wording. No need to explain unless the reason is not obvious.</li>
      <li><strong>There is a lot of it, and it does not have to be one sitting.</strong> The five parts below are in the order they are worth reading. The staff dashboard is the last group of the interface section and is 769 rows an applicant never sees.</li>
      <li><strong>You can also correct the site from inside the site.</strong> Signed in to the account we have set up for you, select any wording that reads wrongly on any page and a small <em>Suggest</em> control appears beside it. What you write there is filed against that exact phrase and reaches us with the page it was on, which is the better way to raise anything you notice while simply using the site. It cannot replace this page: it only reaches words that happen to be on a screen, and most of what is below is behind a state you would have to go looking for.</li>
    </ol>
    <p>The Chinese should be Singapore Mandarin, not Mainland usage: ${esc(usage)}. Those are checked before this page is sent, so what is left for you is everything a check cannot see.${esc(askedSentence)} Flag anything that reads as Mainland or Taiwanese. The Chinese below renders in your own device's font, which is exactly what a reader will see.</p>
    <ul class="toc">${contents}</ul>
  </div>

  ${sections}

  <footer>
    <p>Generated from the repository on ${new Date().toISOString().slice(0, 10)}. Interface text comes from <code>assets/i18n/zh.json</code>; departments and tags from migration <code>014</code>; hero copy from migration <code>018</code>; the phase list from <code>assets/build-status.json</code>; the bot's own words from <code>telegram-bot/strings.py</code> and <code>commands.py</code>.</p>
    <p>The product name is written 国际兽视 Careers, and GFTV alone is 国际兽视. A space sits between Latin and Han characters, never between Han and Han.</p>
  </footer>
</div>
</body>
</html>`;
}

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

if (require.main === module) {
  const data = collect();
  fs.writeFileSync(out, buildHtml(data));

  const by = (source) => data.pairs.filter((p) => p.source === source).length;
  console.log('written: ' + out);
  console.log(
    `total entries: ${data.pairs.length}  (interface ${by('interface')}, ` +
      `departments ${by('departments')}, tags ${by('tags')}, hero ${by('hero')}, ` +
      `phases ${by('phases')}, bot ${by('bot')}, commands ${by('commands')}, profile ${by('profile')})`
  );
  console.log(`interface groups: ${data.groupOrder.length}, all of them rendered`);

  const unreviewed = scanForUnreviewed();
  if (unreviewed.length === 0) {
    console.log('coverage: every shipped file carrying 华文 is either on this page or exempt with a reason.');
  } else {
    console.log(`\ncoverage: ${unreviewed.length} file(s) carry Chinese this page does not show:`);
    for (const { file, lines } of unreviewed) {
      console.log(`  ${file}`);
      for (const [number, text] of lines.slice(0, 4)) console.log(`      ${number}: ${text.slice(0, 96)}`);
      if (lines.length > 4) console.log(`      and ${lines.length - 4} more line(s)`);
    }
    console.log('\nAdd it to SOURCES and render it, or to EXEMPT with the reason it is not copy.');
    process.exitCode = 1;
  }
}

module.exports = {
  SOURCES, EXEMPT, SCAN_ROOTS, WHERE, ORDER, USAGE,
  collect, flatten, botStrings, botProfile, buildHtml, scanForUnreviewed, usageHits,
};
