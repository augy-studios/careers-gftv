// House style, checked. Runs over every string a reader can see and fails on a
// phrase this project has decided not to use, a sentence too long to read
// easily, and a Chinese word that is Mainland and not Singapore.
//
//   node check-copy.js            report and exit non-zero on a finding
//   node check-copy.js --list     print what it scans, and stop
//
// **The plain language rule, from 3 September 2026.** Both sites are written
// for somebody with no technical knowledge who wants to find a role and apply
// for it. That decision produced three checkable things, and they are the three
// rule sets below: no banned phrase, no sentence over 25 words, and Singapore
// Mandarin vocabulary in the Chinese. Everything else about writing plainly --
// naming a technical term and then explaining it, one idea to a sentence, the
// active voice -- is a judgement no script can make, and it is written down in
// the specification instead.
//
// **25 words is the cap and not the target.** The portal's own average is under
// seven. The cap exists to catch the sentence that grew three clauses while
// somebody was being careful, which is the shape this project's copy fails in.
//
// **Why this is a script and not a note in a README.** The rule arrived on
// 1 September 2026 as "all user-facing pages, current and future", and the
// second half of that sentence is the hard part: a rule about copy nobody
// checks lasts exactly as long as the person who remembers it. Every other
// standing rule in this build that survived was one somebody could run —
// `check-i18n.js` for missing keys, `check-precache.js` for the precache list,
// `commands.py --check` for the bot's command list. This is that shape, pointed
// at prose.
//
// **What counts as user-facing, and it is deliberately not everything.** The
// four sources below are what a person reads: the interface dictionary, the
// phase list on /status, the public llms.txt, and the Telegram bot's own
// messages. Source comments, READMEs, the specification, the migrations and
// this file's own tests are not copy and are left alone — the phrase is fine in
// an explanation of a decision, and banning it there would only teach people to
// write worse comments.
//
// **The phrase and sentence rules are English only.** zh.json and the bot's
// Chinese strings carry no equivalent phrase, and Chinese has no spaces to
// count words with. What they do get is the vocabulary rule below, which is
// 3a's table turned into a check.
//
// **What it cannot see.** A sentence built in JavaScript out of two dictionary
// keys, and copy typed by an admin into a maintenance note or a posting. The
// first is rare and reads oddly anyway; the second is somebody else's writing
// and not this project's house style.

const fs = require('fs');
const path = require('path');

const repo = __dirname;
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');

/* -------------------------------------------------------------------------
 * The rule
 * ---------------------------------------------------------------------- */

/** Phrases that must not appear in copy, with what to reach for instead.
 *
 *  One entry today. The shape takes more because a second one will arrive the
 *  same way this did, and a list of one is only a list if it can grow.
 */
const BANNED = [
  {
    pattern: /rather than/gi,
    phrase: 'rather than',
    instead: [
      'instead of',
      'in place of',
      'as opposed to',
      'over',
      'in preference to',
      'without',
      'and not',
    ],
  },
];

/** The longest sentence a reader should meet, in words.
 *
 *  Chosen by measuring: at the moment the rule arrived, the whole portal
 *  dictionary held seven sentences over 25 words and the documentation held 36.
 *  A cap that fails on nothing teaches nothing, and one that fails on a hundred
 *  strings gets switched off in a week.
 */
const MAX_SENTENCE_WORDS = 25;

/** 3a's Singapore Mandarin table, as a check.
 *
 *  **The lookbehind on 中文 is the only fiddly part.** 选中文字 -- "select text"
 *  -- contains those two characters by accident, and a check that reported it
 *  would be a check somebody learns to ignore. Naming the language is what the
 *  rule is about, so the pattern refuses the accidental pairs and nothing else.
 */
const MANDARIN = [
  { pattern: /志愿者/g, word: '志愿者', instead: '义工' },
  { pattern: /电子邮件/g, word: '电子邮件', instead: '电邮' },
  { pattern: /(?<!营)运营/g, word: '运营', instead: '营运' },
  { pattern: /录影棚/g, word: '录影棚', instead: '摄影棚' },
  { pattern: /文档/g, word: '文档', instead: '文件, or 说明文件 for a manual' },
  { pattern: /简体中文/g, word: '简体中文', instead: '华文' },
  { pattern: /(?<![选其集看命])中文(?!字)/g, word: '中文', instead: '华文' },
];

/** The one page that has to contain the words this rule bans.
 *
 *  **The page whose subject is the rule.** 16h gives the translations guide a
 *  page on Singapore Mandarin, and 3a's table is what that page is: two
 *  columns, the word to use and the word not to. Translated into 华文, the
 *  right hand column is six findings, and every one of them is the page doing
 *  its job.
 *
 *  Kept as narrow as it can be. One path, a reason beside it, and the check
 *  below fails if the path stops existing — an exemption that outlives the page
 *  it was written for is a hole nobody remembers opening. The banned phrase and
 *  sentence rules still apply to it; it is exempt from the vocabulary rule
 *  alone.
 */
const MANDARIN_EXEMPT = [
  {
    where: 'docs-site/translations/zh/translations/singapore-mandarin.md',
    why: "3a's vocabulary table, translated. The words it bans are its own subject.",
  },
];

/* -------------------------------------------------------------------------
 * Where the copy is
 * ---------------------------------------------------------------------- */

/** Every English string in either site's interface dictionary. */
function dictionaryStrings() {
  const out = [];

  // The docs site's is small and separate on purpose: the two share no keys, and
  // its shell is keyed now and translated in phase 14, per decision 5.
  for (const site of ['main-site', 'docs-site']) {
    const dict = JSON.parse(read(`${site}/assets/i18n/en.json`));
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === 'string') out.push({ where: `${site} en.json ${key}`, text: value });
    }
  }

  return out;
}

/** The phase list and its notes, which /status renders in full. */
function buildStatusStrings() {
  const status = JSON.parse(read('main-site/assets/build-status.json'));
  const out = [];
  for (const phase of status.phases ?? []) {
    for (const field of ['name', 'description', 'shipped_note']) {
      if (typeof phase[field] === 'string') {
        out.push({ where: `build-status.json phase ${phase.number} ${field}`, text: phase[field] });
      }
    }
  }
  return out;
}

/** The public page for machines, which is prose about this site. */
function llmsStrings() {
  return read('main-site/llms.txt')
    .split('\n')
    .map((line, index) => ({ where: `llms.txt:${index + 1}`, text: line }))
    .filter((entry) => !entry.text.startsWith('#') || /[a-z]{4}/.test(entry.text));
}

/** Every page's visible text, with the comments taken out.
 *
 *  **The comments are why this is not a grep.** Every occurrence of the phrase
 *  in main-site's markup on the day this was written was inside an HTML comment
 *  explaining a decision, and a check that reported those would have been
 *  turned off within a week.
 */
function pageStrings() {
  const out = [];

  // Both sites, as of phase 13 part 4. The docs shell is one HTML file and
  // every fallback string in it is read by somebody whose dictionary has not
  // loaded yet, which is exactly when copy matters most.
  for (const name of ['main-site', 'docs-site']) {
    const site = path.join(repo, name);
    if (!fs.existsSync(site)) continue;

    (function walk(dir) {
      for (const item of fs.readdirSync(dir)) {
        // `dist` is the docs site's build output, phase 13 part 5. Every string
        // in it came from the shell or from a markdown page, both of which are
        // read below from their sources, so scanning it would report each hit
        // twice and blame a generated file for it.
        if (item === 'node_modules' || item === 'api' || item === 'dist') continue;
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!item.endsWith('.html')) continue;

        const relative = full.slice(site.length + 1).split(path.sep).join('/');
        const markup = fs
          .readFileSync(full, 'utf8')
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ');

        out.push({ where: `${name}/${relative}`, text: markup });
      }
    })(site);
  }

  return out;
}

/** The documentation pages, both pipelines.
 *
 *  Added in phase 13 part 3, with the first pages. A guide is copy in the
 *  fullest sense — it is nothing but sentences somebody reads — and the two
 *  trees are here from the part that created them so that phase 14 cannot land
 *  thirty pages the check has never seen.
 *
 *  **The whole file, front matter included.** A page's title and summary are the
 *  sidebar entry and the search result, so they are read more often than the
 *  page is. Markdown has no comment syntax in use here, which is why this needs
 *  none of the stripping `pageStrings` does: there is nowhere in one of these
 *  files to explain a decision, and an explanation belongs in the code anyway.
 */
function docsPageStrings() {
  const out = [];

  for (const tree of ['docs-site/content', 'docs-site/api/_content']) {
    const root = path.join(repo, tree);
    if (!fs.existsSync(root)) continue;

    (function walk(dir) {
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!item.endsWith('.md')) continue;

        const relative = full.slice(root.length + 1).split(path.sep).join('/');
        out.push({ where: `${tree}/${relative}`, text: fs.readFileSync(full, 'utf8') });
      }
    })(root);
  }

  return out;
}

/** What the Telegram bot says, English only.
 *
 *  Read as text and not by importing Python, which `gen-review.js` does need to
 *  do and this does not: what matters here is whether the phrase appears inside
 *  a quoted string, and a docstring explaining a decision is not copy.
 *
 *  **Every file in the directory, and not only `strings.py`.** That file is
 *  where the bot's messages are supposed to live and mostly do, but a sentence
 *  can be built anywhere, and on the day this was written the one hit outside it
 *  was in `db.py` — the message a maintainer sees when an older bot meets a
 *  newer database. That is not chat copy, and it is still a sentence a person
 *  reads, so the scan takes the whole directory and the rule applies to all of
 *  it. **Log lines are in scope by the same choice**, deliberately: an
 *  exclusion list is a second rule to remember and this one is short enough
 *  without it.
 */
function botStrings() {
  const dir = path.join(repo, 'telegram-bot');
  const out = [];

  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.py'))) {
    // Every single or double quoted string on a line that is not a comment.
    // Crude on purpose: a false positive here is a sentence somebody reads, and
    // the cost of checking one by hand is a few seconds.
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    let inDocstring = false;

    lines.forEach((line, index) => {
      const fences = (line.match(/"""/g) ?? []).length;
      if (inDocstring) {
        if (fences > 0) inDocstring = false;
        return;
      }
      if (fences === 1) {
        inDocstring = true;
        return;
      }
      if (fences >= 2) return;

      const withoutComment = line.replace(/#.*$/, '');
      for (const match of withoutComment.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
        out.push({ where: `${file}:${index + 1}`, text: match[2] });
      }
    });
  }

  return out;
}

/** The bot's About and Description, which live in a document.
 *
 *  BotFather's menus set one of each for everybody, so the text sits in fenced
 *  blocks in section 3 of `setup.md` waiting for whatever sets it. It is the
 *  first thing a new person reads above the Start button, which makes it copy
 *  wherever it happens to be stored — the same argument `gen-review.js` makes
 *  for putting it in front of the Chinese reviewer. The anchors here are that
 *  file's, so the two find the same four blocks.
 */
function botProfileStrings() {
  const doc = read('telegram-bot/setup.md');
  const section = (doc.split('\n## 3.')[1] ?? '').split('\n## ')[0];
  const fields = ['About', 'Description', 'About, 华文', 'Description, 华文'];

  return [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match, index) => ({
    where: `setup.md ${fields[index] ?? `block ${index + 1}`}`,
    text: match[1].trim(),
  }));
}

/** Every Chinese string either site ships, for the vocabulary rule.
 *
 *  The two dictionaries and nothing else. Guide content translations live in
 *  Supabase per 16f, so there is no third file here to read, and the day there
 *  is, this is where it goes.
 */
function chineseStrings() {
  const out = [];

  for (const site of ['main-site', 'docs-site']) {
    const file = `${site}/assets/i18n/zh.json`;
    if (!fs.existsSync(path.join(repo, file))) continue;
    const dict = JSON.parse(read(file));
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === 'string') out.push({ where: `${site} zh.json ${key}`, text: value });
    }
  }

  return out;
}

/** The 华文 of every guide page, from phase 14 part 9.
 *
 *  **The largest body of Chinese this project has**, by a wide margin: the
 *  dictionaries are 271 keys a side and this is eighty two pages. It gets the
 *  vocabulary rule for the reason 3a gives -- the table is a rule and not a
 *  preference -- and it gets the banned phrase rule as well, which sounds odd
 *  for a Chinese file until you remember that a translation carries the English
 *  of every link label, command and file name it names.
 *
 *  It does not get the sentence rule. Chinese has no spaces to count words
 *  with, which is the same reason the Chinese dictionaries are exempt.
 */
function chineseDocsStrings() {
  const out = [];
  const root = path.join(repo, 'docs-site/translations');
  if (!fs.existsSync(root)) return out;

  (function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!item.endsWith('.md')) continue;

      const relative = full.slice(repo.length + 1).split(path.sep).join('/');
      out.push({ where: relative, text: fs.readFileSync(full, 'utf8') });
    }
  })(root);

  return out;
}

/** What each source is scanned for.
 *
 *  `sentences` is off for the two sources where counting words would be
 *  nonsense: the pages themselves are read as raw markup, where a "sentence"
 *  runs from one full stop through six tags to the next, and llms.txt is a list
 *  of lines and not prose.
 */
const SOURCES = [
  ['the interface dictionary', dictionaryStrings, { sentences: true }],
  ['the phase list on /status', buildStatusStrings, { sentences: true }],
  ['llms.txt', llmsStrings, {}],
  ['the pages themselves', pageStrings, {}],
  ['the documentation pages', docsPageStrings, { sentences: true, markdown: true }],
  ["the Telegram bot's own strings", botStrings, { sentences: true }],
  ["the bot's profile text", botProfileStrings, { sentences: true }],
  ['the Chinese dictionaries', chineseStrings, { mandarin: true }],
  ['the translated guide pages', chineseDocsStrings, { mandarin: true }],
];

/* -------------------------------------------------------------------------
 * The sentence rule
 * ---------------------------------------------------------------------- */

/** A page or a string, split into the sentences a reader meets.
 *
 *  Markdown is stripped first, because a table row and a fenced command are not
 *  sentences and a link's address is not words. What is left is the prose.
 */
function sentencesOf(text, { markdown = false } = {}) {
  const blocks = [];

  if (markdown) {
    // **A bullet is its own unit, and this is the whole reason this is not one
    // regular expression.** List items rarely end in a full stop, so joining
    // the file into one string reads eight bullets as one 60 word sentence and
    // reports a page that is fine. A line opening with a mark ends the block
    // before it and starts its own.
    const stripped = text
      .replace(/^---[\s\S]*?\n---\n/, '\n')
      .replace(/```[\s\S]*?```/g, '\n');

    let current = [];
    const flush = () => {
      if (current.length > 0) blocks.push(current.join(' '));
      current = [];
    };

    for (const raw of stripped.split('\n')) {
      const line = raw.trim();
      const isMark = /^(?:[-*+]|\d+[.)])\s+/.test(line);
      const skip = line === '' || line.startsWith('|') || line.startsWith('#') || line.startsWith(':::') || line.startsWith('::tab');
      if (skip || isMark) flush();
      if (skip) continue;
      current.push(line.replace(/^(?:[-*+]|\d+[.)])\s+/, ''));
    }
    flush();
  } else {
    blocks.push(text);
  }

  return blocks
    .flatMap((block) =>
      block
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`>]/g, ' ')
        .split(/(?<=[.!?])\s+|\n{2,}/)
    )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const wordsIn = (sentence) => sentence.split(/\s+/).filter(Boolean).length;

/* -------------------------------------------------------------------------
 * Running it
 * ---------------------------------------------------------------------- */

if (process.argv.includes('--list')) {
  console.log('check-copy.js reads:\n');
  for (const [label, load, rules] of SOURCES) {
    const applied = ['banned', rules.sentences && 'sentences', rules.mandarin && 'mandarin']
      .filter(Boolean)
      .join(', ');
    console.log(`  ${label.padEnd(30)} ${String(load().length).padStart(5)} strings   ${applied}`);
  }
  console.log('\nBanned phrases:');
  for (const rule of BANNED) console.log(`  "${rule.phrase}" — use ${rule.instead.join(', ')}`);
  console.log(`\nLongest sentence: ${MAX_SENTENCE_WORDS} words.`);
  console.log('\nSingapore Mandarin, per 3a:');
  for (const rule of MANDARIN) console.log(`  "${rule.word}" — use ${rule.instead}`);
  process.exit(0);
}

const findings = [];
let scanned = 0;

// **An exemption that outlives its page is a hole nobody remembers opening.**
// So the list is checked against the disk before it is used, and a path that
// has been renamed or deleted is a finding like any other.
const exemptFromMandarin = new Set();
for (const entry of MANDARIN_EXEMPT) {
  if (fs.existsSync(path.join(repo, entry.where))) {
    exemptFromMandarin.add(entry.where);
    continue;
  }
  findings.push({
    where: 'check-copy.js',
    what: `an exemption for ${entry.where}, which is not there any more`,
    excerpt: entry.why,
    instead: 'take the entry out of MANDARIN_EXEMPT, or point it at the page that replaced it',
  });
}

for (const [, load, rules] of SOURCES) {
  for (const entry of load()) {
    scanned += 1;

    // **The file's own note is not copy.** Both dictionaries open with a
    // `_comment` explaining what the file is, which nobody meets on a screen.
    const isNote = / _comment$/.test(entry.where);

    for (const rule of BANNED) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(entry.text)) continue;

      // The sentence around it, so a finding can be fixed without opening the
      // file to work out which one it means.
      const at = entry.text.toLowerCase().indexOf(rule.phrase);
      const from = Math.max(0, at - 60);
      const excerpt = entry.text.slice(from, at + rule.phrase.length + 60).replace(/\s+/g, ' ');
      findings.push({
        where: entry.where,
        what: `the phrase "${rule.phrase}"`,
        excerpt,
        instead: rule.instead.join(', '),
      });
    }

    if (rules.sentences && !isNote) {
      for (const sentence of sentencesOf(entry.text, rules)) {
        const words = wordsIn(sentence);
        if (words <= MAX_SENTENCE_WORDS) continue;
        findings.push({
          where: entry.where,
          what: `a sentence of ${words} words`,
          excerpt: sentence.replace(/\s+/g, ' ').slice(0, 160),
          instead: `split it. The cap is ${MAX_SENTENCE_WORDS}`,
        });
      }
    }

    if (rules.mandarin && !isNote && !exemptFromMandarin.has(entry.where)) {
      for (const rule of MANDARIN) {
        rule.pattern.lastIndex = 0;
        const match = rule.pattern.exec(entry.text);
        if (!match) continue;
        const from = Math.max(0, match.index - 20);
        findings.push({
          where: entry.where,
          what: `the word "${rule.word}"`,
          excerpt: entry.text.slice(from, match.index + rule.word.length + 20),
          instead: rule.instead,
        });
      }
    }
  }
}

console.log(`${scanned} strings read from ${SOURCES.length} sources.`);

if (findings.length === 0) {
  console.log('Nothing a reader sees breaks the house style.');
  process.exit(0);
}

console.log(`\n${findings.length} to fix:\n`);
for (const finding of findings) {
  console.log(`  ${finding.where}: ${finding.what}`);
  console.log(`    ...${finding.excerpt}...`);
  console.log(`    ${finding.instead}\n`);
}

process.exit(1);
