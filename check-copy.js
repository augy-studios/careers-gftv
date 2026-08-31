// House style, checked. Runs over every English string a reader can see and
// fails on a phrase this project has decided not to use.
//
//   node check-copy.js            report and exit non-zero on a finding
//   node check-copy.js --list     print what it scans, and stop
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
// **English only, because the rule is about an English phrase.** zh.json and
// the bot's Chinese strings carry no equivalent and are not scanned.
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

/* -------------------------------------------------------------------------
 * Where the copy is
 * ---------------------------------------------------------------------- */

/** Every English string in the interface dictionary. */
function dictionaryStrings() {
  const dict = JSON.parse(read('main-site/assets/i18n/en.json'));
  return Object.entries(dict)
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => ({ where: `en.json ${key}`, text: value }));
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
  const site = path.join(repo, 'main-site');

  (function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      if (item === 'node_modules' || item === 'api') continue;
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

      out.push({ where: `main-site/${relative}`, text: markup });
    }
  })(site);

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

const SOURCES = [
  ['the interface dictionary', dictionaryStrings],
  ['the phase list on /status', buildStatusStrings],
  ['llms.txt', llmsStrings],
  ['the pages themselves', pageStrings],
  ["the Telegram bot's own strings", botStrings],
  ["the bot's profile text", botProfileStrings],
];

/* -------------------------------------------------------------------------
 * Running it
 * ---------------------------------------------------------------------- */

if (process.argv.includes('--list')) {
  console.log('check-copy.js reads:\n');
  for (const [label, load] of SOURCES) {
    console.log(`  ${label.padEnd(30)} ${load().length} strings`);
  }
  console.log('\nBanned phrases:');
  for (const rule of BANNED) console.log(`  "${rule.phrase}" — use ${rule.instead.join(', ')}`);
  process.exit(0);
}

const findings = [];
let scanned = 0;

for (const [, load] of SOURCES) {
  for (const entry of load()) {
    scanned += 1;
    for (const rule of BANNED) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(entry.text)) continue;

      // The sentence around it, so a finding can be fixed without opening the
      // file to work out which one it means.
      const at = entry.text.toLowerCase().indexOf(rule.phrase);
      const from = Math.max(0, at - 60);
      const excerpt = entry.text.slice(from, at + rule.phrase.length + 60).replace(/\s+/g, ' ');
      findings.push({ where: entry.where, phrase: rule.phrase, excerpt, instead: rule.instead });
    }
  }
}

console.log(`${scanned} strings read from ${SOURCES.length} sources.`);

if (findings.length === 0) {
  console.log('No banned phrasing in anything a reader sees.');
  process.exit(0);
}

console.log(`\n${findings.length} to fix:\n`);
for (const finding of findings) {
  console.log(`  ${finding.where}`);
  console.log(`    ...${finding.excerpt}...`);
  console.log(`    use instead: ${finding.instead.join(', ')}\n`);
}

process.exit(1);
