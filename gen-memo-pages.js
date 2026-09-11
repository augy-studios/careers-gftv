// next-steps.md, rendered as one page per section, as a snapshot.
//
//   node gen-memo-pages.js           write the pages
//   node gen-memo-pages.js --check   fail on a page nobody generated, and say
//                                    how far behind the file the snapshot is
//
// 0b asks for the working memo and 16h asks for it published. It is the record
// of why the build looks the way it does, and until 7 September 2026 it was
// gitignored, so it died with the last session unless something captured it.
// This is that capture.
//
// **The pages are committed markdown, and the reason for that changed under
// this script on the day it was written.** The first argument was that the
// memo was invisible to Vercel's checkout, so a generator running at deploy
// time would find nothing and write nine empty pages. Part 10e moved the file
// to reference/next-steps.md and un-ignored it, which retires that argument
// completely: the build could now generate these pages itself.
//
// It still does not, for two reasons that outlast the move.
//
//   - **A translation is keyed to a page address, not to a page.** The 华文 of
//     these nine pages is nine authored files under translations/zh/staff/memo/,
//     and gen-review.js compares them to the English paragraph for paragraph. An
//     English page regenerated at deploy time from a file that moves several
//     times a day would part company with its translation on any deploy, with
//     nothing to notice: the check that would catch it runs here, over committed
//     files, not there.
//   - **A snapshot is the thing 16h asked for.** the-working-memo.md tells a
//     reader to look at the date on the landing page and judge how far behind
//     the file it is. A page that regenerated itself every deploy would be
//     current, undated in any meaningful sense, and would say nothing about the
//     working copy it came from.
//
// ---------------------------------------------------------------------------
// Why --check does not compare the pages to the file
// ---------------------------------------------------------------------------
//
// Because a snapshot is supposed to lag, and the published page says so.
//
// gen-spec-pages.js --check regenerates and fails on any difference, which is
// right for it: the brief is amended deliberately, a few times a phase, and a
// page that disagrees with it is a page that is wrong. The memo is the opposite
// kind of file. It is rewritten several times a day, every day of a phase, so
// the same check would be red from the moment the seam commits until somebody
// regenerates -- which is a check that is always failing, and a check that is
// always failing is one people stop reading. **Both files are committed as of
// part 10e and that changes nothing here**: the difference between them was
// never who could see them, it was how often they move.
//
// So this one asserts what is actually broken and reports what is merely old:
//
//   fails    a page that is not one of these sections, a section with no page,
//            front matter that no longer parses, or a page whose body has been
//            edited by hand into something this script would not produce
//   reports  how many sections have moved since the snapshot was taken, and
//            the date it was taken on
//
// A hand edit is the thing worth failing on, and it is worth saying why: the
// only reason to edit a generated page is that somebody wants the published
// memo to say something the memo does not. That is the published record and the
// working record disagreeing, which is the one failure this whole arrangement
// exists to make impossible.

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'reference', 'next-steps.md');
const OUT = join(HERE, 'docs-site', 'api', '_content', 'memo');

const CHECK = process.argv.includes('--check');

const ACCESS = 'developer';

/** After the specification, which is 4. Both are reference, in that order. */
const SECTION_ORDER = 5;

/* -------------------------------------------------------------------------
 * Reading the file
 * ---------------------------------------------------------------------- */

/**
 * The memo split into its numbered sections, ignoring fenced blocks.
 *
 * Same shape as gen-spec-pages.js and the same trap: the memo quotes commands,
 * SQL and front matter in fenced blocks, and several of those lines open with a
 * `#`. A splitter that went by prefix alone would cut a section in half at a
 * comment inside somebody's example.
 *
 * The preamble here is larger than the specification's and matters more. It is
 * the paragraph that says where the build stands, and it is the first thing
 * anybody reading the memo is meant to read.
 */
export function readMemo(source) {
  // **This file is the one with a byte order mark**, and it cost an afternoon:
  // with the mark attached the first line does not start with "# ", so the
  // title was never found, the landing page was written with an empty heading,
  // and an empty heading is a line markdown.js used to spin on forever. Both
  // halves of that are fixed; this is the half that stops the mark reaching
  // anything else.
  const lines = source.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');

  let title = '';
  let fenced = false;
  const preamble = [];
  const sections = [];

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;

    if (!fenced && line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      const number = (/^([0-9]+[a-z]?)\./.exec(heading)?.[1] ?? '').toLowerCase();
      sections.push({ number, heading, lines: [] });
      continue;
    }

    if (!fenced && line.startsWith('# ') && sections.length === 0 && title === '') {
      title = line.slice(2).trim();
      continue;
    }

    if (sections.length === 0) preamble.push(line);
    else sections[sections.length - 1].lines.push(line);
  }

  return {
    title,
    // The `---` rule the memo puts under its preamble is a divider in a file
    // that has no other use for one. On a page it would draw a line under the
    // introduction and above the callout, which is a line the page does not
    // want, so it comes off here.
    preamble: preamble.join('\n').trim().replace(/\n*^---$/m, '').trim(),
    sections: sections.map(({ number, heading, lines: body }) => ({
      number,
      heading,
      body: liftHeadings(body.join('\n').trim()),
    })),
  };
}

/**
 * Raise every heading in a section's body by one level.
 *
 * A section is `## N.` in the memo and becomes the page's `#`, so the `###`
 * under it has to become `##` or every page skips a level from h1 to h3. That
 * is the outline defect phase 12 part 2 fixed on five portal pages, and
 * `tests/phase13-test.mjs`'s accessibility pass found it on every generated
 * page on 11 September 2026, the first full run since the pages existed.
 * Fenced blocks are left alone: a `#` inside one is a comment, not a heading.
 * The 华文 pages under docs-site/translations/ are hand written and carry the
 * lifted levels themselves.
 */
export function liftHeadings(body) {
  let fenced = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(/^(#{3,6}) /, (match, hashes) => `${hashes.slice(1)} `);
    })
    .join('\n');
}

/* -------------------------------------------------------------------------
 * Turning one into a page
 * ---------------------------------------------------------------------- */

const slugFor = (number) => `section-${number}`;
const oneLine = (value) => value.replace(/\s+/g, ' ').trim();
const asTitle = (heading) => oneLine(heading.replace(/`/g, ''));

/** The first sentence of a section, as its summary. As gen-spec-pages.js. */
export function summaryOf(body) {
  let fenced = false;

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || line === '') continue;
    if (line.startsWith('#') || line.startsWith('|') || line.startsWith('>')) continue;
    if (/^(?:[-*+]|\d+[.)])\s+/.test(line)) continue;

    const prose = line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/`/g, '');
    const sentence = /^(.*?[.!?])(?:\s|$)/.exec(prose)?.[1] ?? prose;
    return oneLine(sentence) || null;
  }

  return null;
}

function frontMatter({ title, order, summary }) {
  const lines = [`title: ${title}`, `access: ${ACCESS}`, `order: ${order}`];
  if (summary) lines.push(`summary: ${summary}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function pageFor(section, order) {
  return (
    frontMatter({
      title: asTitle(section.heading),
      order,
      summary: summaryOf(section.body),
    }) +
    `\n# ${section.heading}\n\n${section.body}\n`
  );
}

/**
 * The landing page: what the memo is, when this copy was taken, and the list.
 *
 * **The date is the load bearing part of this page.** the-working-memo.md tells
 * a reader to check it, and without it the published copy is a document with no
 * way of telling whether it is a week or a year behind the file it came from.
 */
function indexPage(memo, taken) {
  const rows = memo.sections
    .map((section) => `| [${asTitle(section.heading)}](/staff/memo/${slugFor(section.number)}) |`)
    .join('\n');

  return (
    frontMatter({
      title: 'The working memo',
      order: SECTION_ORDER,
      summary: 'The memo the build was run from, captured as a snapshot, one page per section.',
    }) +
    `
# ${memo.title}

${memo.preamble}

> [!WARNING]
> A snapshot, and not a live file. This copy was taken on ${taken}. The working
> copy is \`reference/next-steps.md\`, and it is rewritten several times a day
> while a phase runs. It moves on without these pages, so if the build is still
> running then the file is ahead of what you are reading.

> [!NOTE]
> These pages are generated from \`reference/next-steps.md\` by
> \`node gen-memo-pages.js\`. An edit made here is undone by the next run and is
> reported by \`node gen-memo-pages.js --check\`.

## The sections

| Section |
|---|
${rows}
`
  );
}

/* -------------------------------------------------------------------------
 * Running it
 * ---------------------------------------------------------------------- */

/** Singapore order, which is what every other date on either site uses. */
const dateOf = (when) =>
  when.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

/** The date the committed snapshot says it was taken on, or null. */
function takenFrom(index) {
  return /This copy was taken on ([^.]+)\./.exec(index ?? '')?.[1]?.replace(/\s+/g, ' ') ?? null;
}

/** A page's body, with its front matter removed, for comparing two snapshots. */
const bodyOf = (page) => page.replace(/^---\n[\s\S]*?\n---\n/, '');

const digest = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);

/** The memo, or a message saying where it went. As gen-spec-pages.js. */
async function readSource() {
  try {
    return await readFile(SOURCE, 'utf8');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    console.error(
      `reference/next-steps.md is not here, so there is nothing to generate from.\n` +
        `It is a committed file as of 7 September 2026, so a complete checkout has it.\n` +
        `Any pages it has already produced are committed and are unchanged.`
    );
    process.exit(CHECK ? 0 : 1);
  }
}

const source = await readSource();
const memo = readMemo(source);

await mkdir(OUT, { recursive: true });
const existing = (await readdir(OUT)).filter((name) => name.endsWith('.md'));
const committed = new Map();
for (const name of existing) {
  committed.set(name, await readFile(join(OUT, name), 'utf8'));
}

// The date on the landing page is kept when nothing about the memo has moved,
// so re-running the generator on an unchanged file does not restamp it. A
// snapshot's date is when the content was captured and not when somebody last
// ran a script.
const previous = takenFrom(committed.get('index.md'));
const fresh = dateOf(new Date());

const wouldBe = new Map();
wouldBe.set('index.md', indexPage(memo, previous ?? fresh));
memo.sections.forEach((section, index) => {
  wouldBe.set(`${slugFor(section.number)}.md`, pageFor(section, index + 1));
});

const moved = [...wouldBe]
  .filter(([name]) => name !== 'index.md')
  .filter(([name, page]) => bodyOf(committed.get(name) ?? '') !== bodyOf(page));

if (CHECK) {
  const problems = [];

  for (const name of existing) {
    if (!wouldBe.has(name)) problems.push(`${name} is a page for a section the memo no longer has`);
  }
  for (const name of wouldBe.keys()) {
    if (!committed.has(name)) problems.push(`${name} has never been written`);
  }

  // **A hand edit, told apart from a stale snapshot.** Both leave the page
  // disagreeing with the file, and only one of them is a defect. The difference
  // is the front matter: this script writes it from the section, so a page
  // whose front matter is not what this run would produce was edited by a
  // person, while a page whose body has merely moved on is a snapshot doing
  // what a snapshot does.
  for (const [name, page] of wouldBe) {
    const current = committed.get(name);
    if (!current) continue;
    const head = (text) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? null;
    if (head(current) === null) {
      problems.push(`${name} has no front matter block, so it is not a page any more`);
    } else if (name !== 'index.md' && head(current) !== head(page)) {
      problems.push(`${name} has front matter this generator would not write, so it was edited by hand`);
    }
  }

  for (const problem of problems) console.error(`docs-site/api/_content/memo/${problem}`);
  if (problems.length > 0) {
    console.error('\nRegenerate with: node gen-memo-pages.js');
    process.exit(1);
  }

  console.log(`docs-site/api/_content/memo/ is well formed: ${wouldBe.size} pages from ${memo.sections.length} sections.`);
  console.log(`  snapshot taken ${previous ?? 'on a date the landing page does not carry'}`);
  if (moved.length === 0) {
    console.log('  and it is current: nothing in the memo has moved since.');
  } else {
    console.log(`  ${moved.length} of ${memo.sections.length} sections have moved since, which is a snapshot lagging and not a fault:`);
    for (const [name] of moved) console.log(`    ${name}`);
    console.log('  Regenerate at the seam with: node gen-memo-pages.js');
  }
} else {
  // Restamp only when something actually changed, per the note above.
  const taken = moved.length === 0 && previous ? previous : fresh;
  wouldBe.set('index.md', indexPage(memo, taken));

  for (const [name, page] of wouldBe) await writeFile(join(OUT, name), page, 'utf8');
  for (const name of existing) {
    if (!wouldBe.has(name)) await unlink(join(OUT, name));
  }

  console.log(`Wrote ${wouldBe.size} pages into docs-site/api/_content/memo/, snapshot of ${taken}.`);
  for (const section of memo.sections) {
    console.log(`  ${slugFor(section.number).padEnd(12)} ${digest(section.body)}  ${asTitle(section.heading)}`);
  }
}
