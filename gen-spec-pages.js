// careers-gftv-spec.md, rendered as one page per top level section.
//
//   node gen-spec-pages.js           write the pages
//   node gen-spec-pages.js --check   fail if they are out of date
//
// 16h: the specification is "rendered as pages and not one wall". This is that,
// and it is a generator instead of twenty hand written files for the one reason
// phase 14 keeps arriving at: a copy that can drift is a copy that will. The
// brief is amended deliberately and more than once a phase, and a docs page
// somebody forgot to update is worse than no docs page, because it is wrong and
// looks maintained.
//
// **Where the pages go, and why it is a section of its own.** 16h gives the
// four guides four sections, and api/_lib/pages.js refuses anything deeper than
// a section and a page -- so developer/spec/*.md is not a legal path and the
// alternative was thirty five flat entries in one sidebar with two kinds of page
// interleaved. 16h already anticipated this: "the sidebar stays able to take
// another section later without rework". This is the first thing to ask that of.
//
// **Twenty pages, counted and not estimated.** The working memo said eighteen
// for four days; the file has twenty top level sections, because 0, 0b and 0c
// are three of them. Nothing here is told the number: it counts what it finds,
// so the next section added to the brief gets a page without anybody editing
// this script.
//
// **Fenced blocks are the trap this was written around.** Section 2 and section
// 15 both paste a .env.example into a ```bash block, and every line of those
// blocks opens with a #. A splitter that looked for headings by prefix alone
// would cut the specification into pieces at "# Supabase project URL." and lose
// the rest of section 2 into a page of its own. So the scan tracks fences and a
// heading inside one is text.
//
// **No page carries a "generated, do not edit" banner and that is deliberate.**
// These pages are a faithful reproduction: a line this script wrote on top of
// the brief's own words is a line the brief does not have, on twenty pages, for
// a warning that only matters to somebody already editing the file. The notice
// is on the section's landing page, where a reader meets it once, and --check is
// what actually stops a hand edit surviving.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'reference', 'careers-gftv-spec.md');
const OUT = join(HERE, 'docs-site', 'api', '_content', 'spec');

const CHECK = process.argv.includes('--check');

/** The tier every page here carries. 16e: no default, and one key decides. */
const ACCESS = 'developer';

/**
 * Where this section sits among the others in the sidebar.
 *
 * The four guides are 1, 2 and 3 with the staff landing at 0, so the
 * specification is 4 and the working memo is 5. Both are reference and both
 * come after the guides somebody is meant to read first.
 */
const SECTION_ORDER = 4;

/* -------------------------------------------------------------------------
 * Reading the file
 * ---------------------------------------------------------------------- */

/**
 * Split the document into its top level sections, ignoring fenced blocks.
 *
 * A section is a `## ` line and everything under it until the next one. The
 * preamble is whatever sits above the first, minus the `# ` title, and it is
 * returned separately because it belongs to no section and goes on the landing
 * page.
 *
 * @param {string} source
 * @returns {{ title: string, preamble: string, sections: { number: string, heading: string, body: string }[] }}
 */
export function readSpec(source) {
  // **The byte order mark comes off first.** next-steps.md carries one and
  // careers-gftv-spec.md does not, which is exactly the kind of difference that
  // shows up as one generator working and its twin quietly not: with the mark
  // still attached, the first line does not start with "# ", so the title is
  // never found and the document's own heading falls into the preamble.
  // api/_lib/pages.js strips it in frontMatter for the same reason.
  const lines = source.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');

  let title = '';
  let fenced = false;
  const preamble = [];
  const sections = [];

  for (const line of lines) {
    // ``` or ~~~ at the start of a line opens and closes a block. Everything
    // between them is somebody's file or command and never a heading.
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
    }

    if (!fenced && line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      // "6. Database" and "0b. Phasing and the next-steps file" both open with
      // the number the whole project refers to the section by, so that is what
      // the address is built from and what survives a reworded heading.
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
    preamble: preamble.join('\n').trim(),
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
 * A section is `## N.` in the brief and becomes the page's `#`, so the `###`
 * under it has to become `##` or every page skips a level from h1 to h3.
 * `tests/phase13-test.mjs`'s accessibility pass found that on every generated
 * page on 11 September 2026, the first full run since the pages existed. The
 * same function is in gen-memo-pages.js for the same reason, and the 华文
 * pages under docs-site/translations/ carry the lifted levels by hand.
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

/**
 * The address a section's page answers at.
 *
 * **Built from the number and never from the words.** A heading gets reworded
 * -- section 8 was "Admin dashboard" before it carried the path in brackets --
 * and a slug built from the words would move the page, break every link into it
 * and leave the old address answering nothing. The number is the thing this
 * project actually refers to a section by.
 */
const slugFor = (number) => `section-${number}`;

/** Whitespace collapsed to one line, for a value that lives in front matter. */
const oneLine = (value) => value.replace(/\s+/g, ' ').trim();

/**
 * A heading as a title, which means as text and not as markdown.
 *
 * Three of the twenty carry a code span -- "8. Admin dashboard (`/admin`)" --
 * and a title is never rendered: the sidebar, the breadcrumb and the browser tab
 * all escape it and print what they were given. So the backticks come off here
 * and stay on the heading inside the page, where the renderer does something
 * with them.
 */
const asTitle = (heading) => oneLine(heading.replace(/`/g, ''));

/**
 * The first sentence of a section, as its summary.
 *
 * The summary is the sidebar's tooltip and the search result, so it has to be
 * the section's own words and not a description somebody wrote once. Tables,
 * fenced blocks, bullets and headings are skipped on the way to the first line
 * of prose, because none of those is a sentence.
 *
 * A section that opens with a table and never gets to a sentence returns null,
 * and the page carries no summary rather than a wrong one.
 */
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

    // **Emphasis comes off and an identifier does not.** Stripping every `*`
    // and `_` turned section 6's opening line into "any existing gftvhello
    // table", which is a summary that names the wrong table: the file says
    // `gftvhello_*` and the underscore and star are the name. So only the
    // markers that are actually markup here are removed.
    const prose = line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/`/g, '');
    const sentence = /^(.*?[.!?])(?:\s|$)/.exec(prose)?.[1] ?? prose;
    return oneLine(sentence) || null;
  }

  return null;
}

/**
 * Front matter, in the four key shape api/_lib/pages.js parses.
 *
 * Deliberately not YAML, per that file: four scalar keys, one per line, no
 * quoting. Which means a value has to be one line and has to not open with a
 * quote mark, and oneLine above is what guarantees the first.
 */
function frontMatter({ title, order, summary }) {
  const lines = [`title: ${title}`, `access: ${ACCESS}`, `order: ${order}`];
  if (summary) lines.push(`summary: ${summary}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** One section as a page: its own heading, then the section verbatim. */
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
 * The section's landing page: what this is, and every section as a link.
 *
 * **The contents table is the reason the landing page is generated too.** A
 * hand written list of twenty links is a list that goes stale the first time a
 * section is added, which is the same failure the pages themselves were
 * generated to avoid, one level up.
 */
function indexPage(spec) {
  const rows = spec.sections
    .map((section) => `| [${asTitle(section.heading)}](/staff/spec/${slugFor(section.number)}) |`)
    .join('\n');

  return (
    frontMatter({
      title: 'The specification',
      order: SECTION_ORDER,
      summary: 'The brief the whole build answers to, one page per section, generated from the file.',
    }) +
    `
# ${spec.title}

${spec.preamble}

> [!NOTE]
> These pages are generated from \`reference/careers-gftv-spec.md\`, which is in
> the repository. Edit that file and run \`node gen-spec-pages.js\`. An edit made
> here is undone by the next run, and \`node gen-spec-pages.js --check\` is what
> fails when the two have parted company.

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

/** Every page this run would write, as a map of file name to contents. */
export function build(source) {
  const spec = readSpec(source);
  const files = new Map();

  files.set('index.md', indexPage(spec));
  spec.sections.forEach((section, index) => {
    files.set(`${slugFor(section.number)}.md`, pageFor(section, index + 1));
  });

  return { spec, files };
}

/**
 * The brief, or a message saying where it went.
 *
 * **The brief was gitignored until 7 September 2026**, by `*spec.md`, and that
 * was found by this script's own pages being committed while their source was
 * not: a fresh clone held twenty one pages and nothing to regenerate them from.
 * Part 10e moved it to `reference/careers-gftv-spec.md` and un-ignored it, so
 * the ordinary case is now that the file is here.
 *
 * **This branch is kept anyway**, because `--check` running in a checkout that
 * somehow lacks the file should say which file and stop, not die on an ENOENT
 * with a stack trace. Section 2's rule applied to a file in place of an
 * environment variable: name the thing that is missing. The committed pages
 * stay exactly as they are either way.
 */
async function readSource() {
  try {
    return await readFile(SOURCE, 'utf8');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    console.error(
      `reference/careers-gftv-spec.md is not here, so there is nothing to generate from.\n` +
        `It is a committed file as of 7 September 2026, so a complete checkout has it.\n` +
        `The pages it produces are committed under docs-site/api/_content/spec/ and are unchanged.`
    );
    process.exit(CHECK ? 0 : 1);
  }
}

const source = await readSource();
const { spec, files } = build(source);

// **A section taken out of the brief has to take its page with it.** Otherwise
// the sidebar keeps an entry for a section that no longer exists, which is the
// stale copy this whole script exists to prevent, arriving by deletion instead
// of by edit.
await mkdir(OUT, { recursive: true });
const existing = (await readdir(OUT)).filter((name) => name.endsWith('.md'));
const stale = existing.filter((name) => !files.has(name));

const problems = [];

for (const [name, contents] of files) {
  const path = join(OUT, name);
  const current = await readFile(path, 'utf8').catch(() => null);

  if (current === contents) continue;

  if (CHECK) {
    problems.push(current === null ? `${name} has never been written` : `${name} is out of date`);
    continue;
  }

  await writeFile(path, contents, 'utf8');
}

for (const name of stale) {
  if (CHECK) {
    problems.push(`${name} is a page for a section the brief no longer has`);
    continue;
  }
  await unlink(join(OUT, name));
}

if (CHECK) {
  for (const problem of problems) console.error(`docs-site/api/_content/spec/${problem}`);
  if (problems.length > 0) {
    console.error('\nRegenerate with: node gen-spec-pages.js');
    process.exit(1);
  }
  console.log(`docs-site/api/_content/spec/ is current: ${files.size} pages from ${spec.sections.length} sections.`);
} else {
  console.log(`Wrote ${files.size} pages into docs-site/api/_content/spec/.`);
  for (const section of spec.sections) {
    console.log(`  ${slugFor(section.number).padEnd(14)} ${section.heading}`);
  }
  if (stale.length > 0) console.log(`Removed ${stale.length} page(s) for sections the brief no longer has.`);
}
