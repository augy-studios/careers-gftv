// Phase 14 verification run, from next-steps.md section 2.
//
//   node tests/phase14-test.mjs                  everything that can run
//   node tests/phase14-test.mjs --only=chrome    one or more sections
//
// **Nothing here needs a credential, a database or a deployment**, which is
// phase 13's own rule and phase 10's before it. Part 1 is chrome: markup, a
// generated module, two dictionaries and a stylesheet, and every one of those
// is wrong before it is deployed or it is not wrong at all. The browser half
// runs over `docs-site/dist/`, which `scripts/build.js` has already written.
//
// It reads that output and never writes to either content tree, so a run leaves
// the working tree exactly as it found it and can be run beside anything.
//
// The sections, and what each one is about:
//
//   chrome     part 1: the docs header's two controls, and the portal's
//   browser    the same header, opened, pressed, and reloaded
//   contrast   both modals against WCAG AA, in all four theme combinations
//   a11y       both modals against the accessibility rules, open

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DOCS = join(REPO, 'docs-site');
const MAIN = join(REPO, 'main-site');
const DIST = join(DOCS, 'dist');

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

/* -------------------------------------------------------------------------
 * The stand in server
 *
 * `dist/`, then the shell, in that order, which is Vercel's own and the reason
 * the built pages take over from the rewrite without anything being switched.
 * `/api/nav` is answered as a stranger, because the header this section is
 * about is drawn before that request is made and does not depend on it.
 * ---------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

function serve() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/nav') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          data: { reader: { signed_in: false }, nav: { home: null, staff_home: null, sections: [] } },
        })
      );
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: { code: 'not_found' } }));
    }

    const candidates = [
      join(DIST, url.pathname.slice(1)),
      join(DIST, `${url.pathname.slice(1)}.html`),
      join(DIST, 'shell.html'),
    ];
    const file = candidates.find((candidate) => existsSync(candidate) && extname(candidate) !== '');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
}

async function listen(server) {
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  return `http://127.0.0.1:${server.address().port}`;
}

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

define('chrome', "Part 1: gftv-theme.md's chrome, on both sites", async () => {
  const shellHtml = read(join(DOCS, 'shell.html'));
  const docsShell = read(join(DOCS, 'assets/js/shell.js'));
  const docsCss = read(join(DOCS, 'assets/css/docs.css'));
  const portalShell = read(join(MAIN, 'assets/js/shell.js'));
  const generator = read(join(REPO, 'gen-docs-lib.js'));

  const docsEn = JSON.parse(read(join(DOCS, 'assets/i18n/en.json')));
  const docsZh = JSON.parse(read(join(DOCS, 'assets/i18n/zh.json')));

  /* --- The header itself ------------------------------------------------- */

  // **The ids, and they are the whole of why no transform rule was needed.**
  // chrome-modals.js addresses its openers with document.querySelector, so a
  // docs header that named its buttons anything else would carry two controls
  // that opened nothing at all — and nothing would throw.
  for (const id of ['themeButton', 'languageButton']) {
    check(
      `1. the docs header carries #${id}`,
      new RegExp(`id="${id}"`).test(shellHtml),
      'chrome-modals.js finds its opener by this id and no parameter is passed'
    );
  }

  check(
    '2. both are icon buttons, per gftv-theme.md',
    [...shellHtml.matchAll(/<button[^>]*id="(themeButton|languageButton)"[^>]*>/g)].every((m) =>
      m[0].includes('class="icon-btn"')
    ),
    "its acceptance checklist is about a theme button's icon, which presumes one"
  );

  check(
    '3. and each says it opens a dialog',
    [...shellHtml.matchAll(/<button[^>]*id="(themeButton|languageButton)"[^>]*>/g)].every((m) =>
      m[0].includes('aria-haspopup="dialog"')
    ),
    'a button that opens a modal and does not say so is a button somebody presses twice'
  );

  /* --- And what it no longer carries -------------------------------------- */

  // A control replaced in the markup and left behind in the stylesheet, the
  // dictionary or the module is the half-application this whole part is about,
  // seen once more. So all four places are asked.
  const leftovers = [
    ['the header markup', shellHtml],
    ['the docs shell', docsShell],
    ['the stylesheet', docsCss],
  ];

  for (const [where, source] of leftovers) {
    check(
      `4. ${where} has nothing left of the old mode button or the language select`,
      !/docsMode|docsLocale|\.docs-lang\b/.test(source.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, '')),
      'the comment blocks are exempt: they are free to name what they replaced'
    );
  }

  for (const [locale, dict] of [['en', docsEn], ['zh', docsZh]]) {
    const retired = Object.keys(dict).filter((key) =>
      ['header.modeLight', 'header.modeDark', 'header.modeLabel', 'header.modeLabelDark', 'header.language'].includes(key)
    );
    check(
      `5. ${locale}.json has retired the five keys nothing asks for any more`,
      retired.length === 0,
      JSON.stringify(retired)
    );
  }

  /* --- The palette that was paid for and unreachable ---------------------- */

  // **Every colour theme has a name in both dictionaries.** check-i18n.js
  // cannot ask this: the swatch labels are built as `theme.${theme.id}` out of
  // COLOR_THEMES, so they are a runtime family there and are declared as one.
  // A palette added to theme.js with no key here would ship a swatch labelled
  // "theme.something" on the second site.
  const { COLOR_THEMES } = await import('../docs-site/assets/js/theme.js');

  check(
    '6. theme.js offers more than one palette, so the control has something to do',
    COLOR_THEMES.length > 1,
    `${COLOR_THEMES.length} colour themes`
  );

  for (const [locale, dict] of [['en', docsEn], ['zh', docsZh]]) {
    const absent = COLOR_THEMES.filter((theme) => !(`theme.${theme.id}` in dict));
    check(
      `7. every palette is named in ${locale}.json`,
      absent.length === 0,
      absent.map((theme) => `theme.${theme.id}`).join(', ')
    );
  }

  /* --- One implementation, and the generator that makes it one ------------ */

  for (const path of ['assets/js/chrome-modals.js', 'assets/js/dialog.js']) {
    check(
      `8. gen-docs-lib.js owns ${path}`,
      generator.includes(`path: '${path}'`),
      'a hand written copy here is the duplication decision 1 exists to prevent'
    );

    const copy = read(join(DOCS, path));
    check(
      `8a. and the docs copy says it is generated`,
      copy.startsWith('// GENERATED FILE. Do not edit this copy.'),
      path
    );

    // The banner and nothing else. Not "are the two files the same", which
    // gen-docs-lib.js is emphatic they are deliberately not — but these two
    // carry no rules at all, so for them it is the same question.
    const source = read(join(MAIN, path));
    check(
      `8b. and differs from the portal's by the banner alone`,
      copy.endsWith(source) && copy.slice(0, -source.length).trim().startsWith('//'),
      `${path}: a rule would have to be declared in gen-docs-lib.js for anything else`
    );
  }

  check(
    '9. the portal imports the four functions instead of defining them',
    /import \{[\s\S]*?\} from '\.\/chrome-modals\.js';/.test(portalShell) &&
      !/function (render|wire)(Theme|Language)Modal\(/.test(portalShell),
    'the extraction moved code out of the file that draws every page of the portal'
  );

  /* --- The portal must come out of this unchanged ------------------------- */

  // **The risky half of the part, and this is the cheap half of proving it.**
  // Both of the portal's buttons carry a feature key, so 8.12 can switch either
  // off from the maintenance page; the docs site has no feature gating and its
  // two deliberately do not. Losing one in a refactor of the file that draws
  // them would leave a maintenance switch pointing at nothing.
  for (const [id, feature] of [
    ['themeButton', 'theme_switcher'],
    ['languageButton', 'language_switcher'],
  ]) {
    const button = portalShell.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
    check(
      `10. the portal's #${id} still carries data-feature="${feature}"`,
      button.includes(`data-feature="${feature}"`),
      button || 'no such button in main-site/assets/js/shell.js'
    );
  }

  check(
    '11. the portal precaches chrome-modals.js, which shell.js now imports on every page',
    read(join(MAIN, 'sw.js')).includes("'/assets/js/chrome-modals.js'"),
    'a precached shell whose import is not precached is a header that breaks offline'
  );
});

define('browser', 'The same header, opened, pressed, and reloaded', async () => {
  if (!existsSync(join(DIST, 'shell.html'))) {
    skip('the built output', 'run `node scripts/build.js` from docs-site/ first');
    return;
  }

  const server = serve();
  const base = await listen(server);
  console.log(`      serving the built site at ${base}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });

    /* --- Icons, for the first time on this site ------------------------- */

    check(
      '12. hydrateIcons filled both header buttons',
      (await page.locator('#languageButton svg').count()) === 1 &&
        (await page.locator('#themeButton svg').count()) === 1,
      'icons.js has been generated into this site since part 4 and used zero times'
    );

    /* --- The theme modal ------------------------------------------------ */

    await page.click('#themeButton');
    const themeModal = page.locator('#themeModal');
    check('13. the theme button opens a modal', await themeModal.evaluate((el) => el.open));

    check(
      '14. it offers the three mode preferences gftv-theme.md describes',
      (await page.locator('#themeModal .mode-btn').count()) === 3,
      'light, dark, and the time based preference, which is a preference and not a mode'
    );

    const swatches = page.locator('#themeModal .swatch');
    check(
      '15. and a swatch for every palette',
      (await swatches.count()) > 1,
      `${await swatches.count()} swatches`
    );

    // **The check the part exists for.** The hello palette has been generated
    // into this site since part 4 and measured in all four combinations by part
    // 7, and until now nothing on screen could select it.
    await page.click('#themeModal [data-color-theme="hello"]');
    check(
      '16. the hello palette is reachable from this header',
      (await page.getAttribute('html', 'data-color-theme')) === 'hello',
      'it was paid for and unreachable for a phase, per section 5 item 27'
    );

    check(
      '17. choosing one leaves the modal open',
      await themeModal.evaluate((el) => el.open),
      'closing is a separate explicit action, so a wrong choice is corrected in place'
    );

    // Dark as well, so both axes are proved and not only the new one.
    await page.click('#themeModal [data-mode="dark"]');
    check(
      '18. and the mode is still an explicit choice',
      (await page.getAttribute('html', 'data-mode')) === 'dark',
      'a preference stored against this origin, and never inherited from the portal'
    );

    await page.keyboard.press('Escape');
    check('19. Escape closes it, which is the browser’s own', !(await themeModal.evaluate((el) => el.open)));

    check(
      '20. and focus comes back to the button that opened it',
      await page.evaluate(() => document.activeElement?.id === 'themeButton')
    );

    /* --- And it survives a reload --------------------------------------- */

    // The pre-paint script in shell.html reads both from localStorage before
    // the first paint, so a choice that did not survive here would be a reader
    // watching the site change colour on every page.
    await page.reload({ waitUntil: 'networkidle' });
    check(
      '21. both choices survive a reload, before first paint',
      (await page.getAttribute('html', 'data-color-theme')) === 'hello' &&
        (await page.getAttribute('html', 'data-mode')) === 'dark'
    );

    /* --- The language modal --------------------------------------------- */

    await page.click('#languageButton');
    const languageModal = page.locator('#languageModal');
    check('22. the language button opens its own modal', await languageModal.evaluate((el) => el.open));

    const natives = await page.locator('#languageModal .locale-btn .locale-native').allInnerTexts();
    check(
      '23. every language is named in its own script',
      natives.includes('English') && natives.includes('华文'),
      JSON.stringify(natives)
    );

    await page.click('#languageModal [data-locale="zh"]');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-locale') === 'zh');

    check(
      '24. choosing 华文 sets the document’s language as well as the attribute',
      (await page.getAttribute('html', 'lang')) === 'zh-Hans-SG',
      'a page tagged as English in 华文 is what a screen reader reads aloud in the wrong voice'
    );

    check(
      '25. and the chrome around it follows',
      (await page.locator('#themeModal h2').innerText()).trim() === '主题',
      'the modals are on the page before the choice is made, so they are retranslated in place'
    );

    /* --- The page behind an open modal ---------------------------------- */

    check(
      '26. the page behind an open modal is inert, not merely covered',
      await page.evaluate(() => {
        const field = document.querySelector('#docsSearch');
        field?.focus();
        return document.activeElement !== field;
      }),
      'a native <dialog> gives this; the hand-rolled modal it replaced did not'
    );

    /* --- A reader who arrives already in 华文 ---------------------------- */

    // **The one thing a language change cannot prove.** applyLocale ends with
    // translateDom(document), so switching language on this page would repaint
    // the swatch labels whatever the shell did — and the labels are built by
    // wireThemeModal *after* createDialog translated the body it was handed. So
    // the case that matters is the reload: initI18n runs before the modals
    // exist, and without drawChromeModals' own pass the two palettes would be
    // named in English to a reader who had already chosen 华文.
    //
    // The choice is in localStorage from check 24 above, so this is that reader
    // arriving, and the page is held blank until the dictionary applies.
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('#themeButton');

    const labels = await page.locator('#themeModal .swatch span[data-i18n]').allInnerTexts();
    check(
      '27. the palette names are in 华文 on a page that opened in it',
      labels.includes('经典'),
      JSON.stringify(labels)
    );

    check(
      '27a. and so is the theme button’s own label, which is written and not marked up',
      ((await page.getAttribute('#themeButton', 'aria-label')) ?? '').startsWith('主题与外观'),
      'sync() writes it with t(), so it is wrong unless the dictionary is loaded first'
    );
  } finally {
    await browser.close();
    server.close();
  }
});

/* -------------------------------------------------------------------------
 * Contrast
 *
 * **Phase 13's contrast section already walks this site's page**, in all four
 * combinations — the article, the callouts, the tables, the tabs, the sidebar,
 * the breadcrumbs, the pager and the search panel. So the theme reaching the
 * whole site and not the header alone is measured, and has been for a phase.
 *
 * **What it has never walked is the inside of these two modals**, because until
 * part 1 this site had no modal to open. That is what this section is: the same
 * arithmetic, the same compositing, pointed at the components part 1 made
 * reachable. Every one of them comes out of theme.css, which the portal
 * measured in phase 12 part 3 — and a token clearing AA on one site says
 * nothing about what a second site composites it over, which is the whole
 * reason that section exists in the first place.
 * ---------------------------------------------------------------------- */

/**
 * Runs in the page. Composites every foreground against what is really behind
 * it and reports the ratio beside the threshold its own size and weight earn.
 *
 * Lifted from `tests/phase13-test.mjs`'s own measurement, deliberately
 * unchanged: two implementations of a contrast calculation are two answers, and
 * this file would be the one nobody re-derived.
 */
function measureModals() {
  /**
   * A computed colour, in any of the three shapes a browser answers in.
   *
   * **The third one is why this is not phase 13's parser verbatim.** Every token
   * that section measures is a literal `rgba()`, so its regex has never been
   * wrong; `--border-control` and `.swatch-dot`'s ring are `color-mix()`, which
   * Chrome resolves to `color(srgb 0.1 0.1 0.18 / 0.55)` — 0-to-1 channels, no
   * commas, and a slash before the alpha. A parser that returned null there
   * would have reported the two most interesting values in this section as
   * unreadable, and `advisory` would have swallowed one of them silently.
   */
  const parse = (value) => {
    const text = String(value);

    const srgb = text.match(/color\(srgb\s+([^)]+)\)/);
    if (srgb) {
      const [r, g, b, a = 1] = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: r * 255, g: g * 255, b: b * 255, a: Number.isNaN(a) ? 1 : a };
    }

    const m = text.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    // Commas or spaces, and a slash before the alpha in the modern syntax.
    const [r, g, b, a = 1] = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  };

  const over = (src, dst) => ({
    r: src.r * src.a + dst.r * (1 - src.a),
    g: src.g * src.a + dst.g * (1 - src.a),
    b: src.b * src.a + dst.b * (1 - src.a),
    a: 1,
  });

  // Up the ancestor chain collecting every background until one is opaque, then
  // composited back down. **The step that cannot be skipped here either**:
  // .mode-btn and .swatch are painted with --surface, which carries an alpha in
  // all four combinations, so neither ever sits on the colour its own token
  // names. The dim is on ::backdrop and not in this chain, which is correct:
  // .modal is opaque, so nothing behind it reaches the pixel.
  const backdropOf = (start) => {
    const layers = [];
    for (let node = start; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (!bg || bg.a === 0) continue;
      layers.push(bg);
      if (bg.a >= 1) break;
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) out = over(layers[i], out);
    return out;
  };

  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const one = lum(a);
    const two = lum(b);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  };

  // 1.4.3's own definition of large, read off the element and not guessed.
  const isLarge = (cs) => {
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    return size >= 24 || (size >= 18.66 && weight >= 700);
  };

  const found = [];

  const add = (label, fg, bg, need, advisory = false) => {
    if (!fg || !bg) {
      found.push({ label, ratio: 0, need, advisory, unreadable: true });
      return;
    }
    const composited = fg.a < 1 ? over(fg, bg) : fg;
    found.push({ label, ratio: Math.round(ratio(composited, bg) * 100) / 100, need, advisory });
  };

  const text = (label, selector) => {
    const el = document.querySelector(selector);
    if (!el) {
      found.push({ label, ratio: 0, need: 4.5, missing: true });
      return;
    }
    const cs = getComputedStyle(el);
    add(label, parse(cs.color), backdropOf(el), isLarge(cs) ? 3 : 4.5);
  };

  /** An icon drawn in currentColor. 1.4.11's 3:1, and never 1.4.3's 4.5. */
  const icon = (label, selector) => {
    const el = document.querySelector(selector);
    if (!el) {
      found.push({ label, ratio: 0, need: 3, missing: true });
      return;
    }
    add(label, parse(getComputedStyle(el).color), backdropOf(el), 3);
  };

  const boundary = (label, selector, property, advisory = false) => {
    const el = document.querySelector(selector);
    if (!el) {
      found.push({ label, ratio: 0, need: 3, advisory, missing: true });
      return;
    }
    add(label, parse(getComputedStyle(el)[property]), backdropOf(el.parentElement), 3, advisory);
  };

  /* --- The shell both modals share -------------------------------------- */

  text('modal heading', '#themeModal .modal-head h2');
  icon('modal close control', '#themeModal .modal-head .icon-btn');
  text('modal section label', '#themeModal .modal-section-label');

  /* --- The mode toggle --------------------------------------------------- */

  text('mode button, unselected', '#themeModal .mode-btn:not(.active)');
  text('mode button, selected', '#themeModal .mode-btn.active');
  icon('mode button icon, unselected', '#themeModal .mode-btn:not(.active) svg');
  icon('mode button icon, selected', '#themeModal .mode-btn.active svg');
  // A control's own edge, so 1.4.11 applies in full and this is not advisory:
  // it is what says where an unselected button is. The selected one has no
  // border by design — it is a filled control, and a fill is a boundary.
  boundary('mode button edge, unselected', '#themeModal .mode-btn:not(.active)', 'borderTopColor');
  // The note is hidden unless the preference is "time". It is shown by hand
  // here: what is measured is its colour against its backdrop, and that does
  // not depend on why it is on screen.
  text('mode note', '#themeModal #modeNote');

  /* --- The swatches ------------------------------------------------------ */

  text('swatch label, unselected', '#themeModal .swatch:not(.active) span[data-i18n]');
  text('swatch label, selected', '#themeModal .swatch.active span[data-i18n]');
  boundary('swatch edge, unselected', '#themeModal .swatch:not(.active)', 'borderTopColor');
  // **Advisory, and the reason is that the dot is not the information.** It is
  // a sample of the palette it names, and the name is beside it in words. The
  // ring around it exists so that the classic swatch, which is #ffffff, does
  // not vanish on a light modal — and `statesInHue` below is what proves the
  // selected state is carried by more than a hue.
  boundary('swatch dot ring', '#themeModal .swatch-dot', 'borderTopColor', true);

  /* --- The language list ------------------------------------------------- */

  text('language heading', '#languageModal .modal-head h2');
  text('language row, unselected', '#languageModal .locale-btn:not(.active) .locale-native');
  text('language row, selected', '#languageModal .locale-btn.active .locale-native');
  icon('language tick', '#languageModal .locale-btn.active .locale-check svg');
  boundary('language row edge, unselected', '#languageModal .locale-btn:not(.active)', 'borderTopColor');
  text('language note', '#languageModal .locale-note');

  /* --- What a ratio cannot say ------------------------------------------- */

  // Every pair above can clear AA while the only thing separating "this is the
  // mode you are in" from "this is the other one" is a colour. Each of the
  // three has to differ by something a reader who cannot separate two hues
  // still perceives.
  const pair = (selector) => {
    const on = document.querySelector(`${selector}.active`);
    const off = document.querySelector(`${selector}:not(.active)`);
    if (!on || !off) return null;
    const a = getComputedStyle(on);
    const b = getComputedStyle(off);
    return {
      fill: a.backgroundColor !== b.backgroundColor,
      weight: a.fontWeight !== b.fontWeight,
      border: a.borderTopColor !== b.borderTopColor,
      ring: a.boxShadow !== b.boxShadow,
    };
  };

  return {
    found,
    statesInHue: {
      mode: pair('#themeModal .mode-btn'),
      swatch: pair('#themeModal .swatch'),
      locale: pair('#languageModal .locale-btn'),
      // The tick is the language list's non-colour signal, and it is the reason
      // that list can be told apart with no colour vision at all.
      tickShown:
        getComputedStyle(document.querySelector('#languageModal .locale-btn.active .locale-check'))
          .visibility === 'visible',
      tickHidden:
        getComputedStyle(
          document.querySelector('#languageModal .locale-btn:not(.active) .locale-check')
        ).visibility === 'hidden',
    },
    // Proved on two values whose answers are known, so a section reporting all
    // green would have to have measured something.
    selfCheck: {
      extremes: Math.round(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) * 100) / 100,
      translucent:
        Math.round(
          ratio(over({ r: 0, g: 0, b: 0, a: 0.3 }, { r: 255, g: 255, b: 255 }), { r: 255, g: 255, b: 255 }) * 100
        ) / 100,
    },
  };
}

const THEMES = [
  ['classic', 'light'],
  ['classic', 'dark'],
  ['hello', 'light'],
  ['hello', 'dark'],
];

/**
 * Open both modals and leave them open.
 *
 * One at a time, and this is not fussiness: `showModal()` makes the page behind
 * it inert, so the second header button cannot be clicked while the first modal
 * is up. Opened through the modules' own API for the same reason the buttons
 * are pressed in the `browser` section — a dialog opened by the test is not
 * proof the control opens it.
 */
async function openBoth(page) {
  await page.click('#themeButton');
  await page.keyboard.press('Escape');
  await page.click('#languageButton');
  await page.evaluate(() => {
    document.querySelector('#themeModal')?.showModal();
    // The note is shown without changing the preference, so the mode under
    // measurement stays the one this pass is about.
    const note = document.querySelector('#modeNote');
    if (note) {
      note.hidden = false;
      if (note.textContent.trim() === '') note.textContent = 'Currently light.';
    }
  });
}

define('contrast', 'Both modals against WCAG AA, in all four combinations', async () => {
  if (!existsSync(join(DIST, 'shell.html'))) {
    skip('the built output', 'run `node scripts/build.js` from docs-site/ first');
    return;
  }

  const server = serve();
  const base = await listen(server);
  const browser = await chromium.launch();

  let number = 28;

  try {
    for (const [colour, mode] of THEMES) {
      const label = `${colour} ${mode}`;
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

      // Set before the first navigation, so the pre-paint script in the head
      // reads it and the page never renders in the wrong theme at all.
      await context.addInitScript(
        ([c, m]) => {
          try {
            localStorage.setItem('gftv-careers.colorTheme', c);
            localStorage.setItem('gftv-careers.mode', m);
            localStorage.setItem('gftv-careers.locale', 'en');
          } catch {
            // A context with storage blocked would measure the defaults, and
            // the attribute check below is what would catch that.
          }
        },
        [colour, mode]
      );

      const page = await context.newPage();
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });

      // Resting colours, per phase 12 part 3: the modal eases in and its
      // controls ease their fill, and WCAG asks what a reader sees once the
      // page has settled. With no transition it has settled by the next frame,
      // which beats a wait tuned to a duration somebody may edit.
      await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
      });

      const applied = await page.evaluate(() => ({
        colour: document.documentElement.getAttribute('data-color-theme'),
        mode: document.documentElement.getAttribute('data-mode'),
      }));

      check(
        `${number}. ${label}: the combination under measurement is the one on the page`,
        applied.colour === colour && applied.mode === mode,
        `the document is ${applied.colour} ${applied.mode}`
      );
      number += 1;

      await openBoth(page);
      const result = await page.evaluate(measureModals);

      if (colour === 'classic' && mode === 'light') {
        check(
          `${number}. the arithmetic is right on values whose answers are known`,
          result.selfCheck.extremes === 21 && result.selfCheck.translucent === 2.11,
          `${result.selfCheck.extremes}:1 and ${result.selfCheck.translucent}:1, expected 21 and 2.11`
        );
        number += 1;
      }

      // **A component that was not on the page is a gap and not a pass.** The
      // commonest way this could go quietly wrong is a renamed class: every
      // pair would come back missing and nothing would fail.
      const missing = result.found.filter((entry) => entry.missing).map((entry) => entry.label);
      check(
        `${number}. ${label}: every component this section names is on screen`,
        missing.length === 0,
        `not drawn: ${missing.join(', ')}`
      );
      number += 1;

      const failing = result.found.filter(
        (entry) => !entry.missing && !entry.advisory && entry.ratio < entry.need
      );
      check(
        `${number}. ${label}: every modal component clears WCAG AA`,
        failing.length === 0,
        failing.map((entry) => `${entry.label} ${entry.ratio}:1, needs ${entry.need}:1`).join('; ')
      );
      number += 1;

      // Printed with their numbers, per phase 12 part 3's habit: an advisory
      // that nobody can see the number of is an advisory nobody revisits.
      for (const entry of result.found.filter((item) => item.advisory && !item.missing)) {
        console.log(`      advisory — ${entry.label}: ${entry.ratio}:1 against ${entry.need}:1`);
      }

      const states = result.statesInHue;
      const hueOnly = Object.entries({
        mode: states.mode,
        swatch: states.swatch,
        locale: states.locale,
      })
        .filter(([, value]) => !value || !(value.fill || value.weight || value.border || value.ring))
        .map(([name]) => name);

      check(
        `${number}. ${label}: no selected state is told apart by hue alone`,
        hueOnly.length === 0,
        `${hueOnly.join(', ')} — 1.4.1: colour is never the only visual means`
      );
      number += 1;

      check(
        `${number}. ${label}: and the language list carries a tick, which is not a colour at all`,
        states.tickShown && states.tickHidden,
        JSON.stringify({ shown: states.tickShown, hidden: states.tickHidden })
      );
      number += 1;

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

/* -------------------------------------------------------------------------
 * Accessibility
 * ---------------------------------------------------------------------- */

define('a11y', 'Both modals against the accessibility rules, open', async () => {
  if (!existsSync(join(DIST, 'shell.html'))) {
    skip('the built output', 'run `node scripts/build.js` from docs-site/ first');
    return;
  }

  const server = serve();
  const base = await listen(server);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await openBoth(page);

    const report = await page.evaluate(() => {
      const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

      const nameOf = (el) =>
        (
          el.getAttribute('aria-label') ??
          document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ??
          el.textContent ??
          ''
        ).trim();

      const modals = ['#themeModal', '#languageModal'];
      const out = { nameless: [], unlabelled: [], small: [], unpressed: [], danglingAria: [], focusInside: null };

      for (const selector of modals) {
        const modal = document.querySelector(selector);
        if (!modal) continue;

        // The dialog's own name, which is what a screen reader announces when
        // it opens. dialog.js points aria-labelledby at the heading it wrote.
        const labelledBy = modal.getAttribute('aria-labelledby');
        const heading = labelledBy ? document.getElementById(labelledBy) : null;
        if (!heading || heading.textContent.trim() === '') out.unlabelled.push(selector);

        for (const el of modal.querySelectorAll(FOCUSABLE)) {
          if (nameOf(el) === '') out.nameless.push(`${selector} ${el.className || el.tagName}`);

          // WCAG 2.2, 2.5.8 target size at AA: 24 by 24 CSS pixels. Every
          // control here is drawn well over it, which is worth holding to
          // rather than discovering after a redesign.
          const box = el.getBoundingClientRect();
          if (box.width < 24 || box.height < 24) {
            out.small.push(`${selector} ${el.className || el.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`);
          }
        }

        // Every ARIA reference inside a modal resolving, which is the rule that
        // catches an id renamed on one side of a pair.
        for (const el of modal.querySelectorAll('[aria-labelledby], [aria-controls], [aria-describedby]')) {
          for (const attribute of ['aria-labelledby', 'aria-controls', 'aria-describedby']) {
            const value = el.getAttribute(attribute);
            if (!value) continue;
            for (const id of value.split(/\s+/)) {
              if (!document.getElementById(id)) out.danglingAria.push(`${selector} ${attribute}=${id}`);
            }
          }
        }
      }

      // A toggle with no pressed state is a control a screen reader reads as an
      // ordinary button, so nothing announces which mode or language is on.
      for (const selector of ['#themeModal .mode-btn', '#themeModal .swatch', '#languageModal .locale-btn']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!['true', 'false'].includes(el.getAttribute('aria-pressed'))) out.unpressed.push(selector);
        }
      }

      // Exactly one of each group is pressed, so the state is a choice and not
      // a set of independent switches that all happen to be off.
      out.pressedCounts = {
        mode: [...document.querySelectorAll('#themeModal .mode-btn[aria-pressed="true"]')].length,
        swatch: [...document.querySelectorAll('#themeModal .swatch[aria-pressed="true"]')].length,
        locale: [...document.querySelectorAll('#languageModal .locale-btn[aria-pressed="true"]')].length,
      };

      // **The theme modal and not the language one**, because openBoth() raises
      // the theme modal last and a modal dialog stack puts focus in the one on
      // top. Asking the wrong one of the two is a check that reads as a defect
      // in the page and is a defect in the question.
      out.focusInside = document.querySelector('#themeModal')?.contains(document.activeElement) === true;

      // Ids written twice, counted across the whole document now that both
      // modals have added their own.
      const seen = new Set();
      out.duplicateIds = [];
      for (const el of document.querySelectorAll('[id]')) {
        if (seen.has(el.id)) out.duplicateIds.push(el.id);
        seen.add(el.id);
      }

      return out;
    });

    check(
      '49. everything reachable by Tab inside either modal has an accessible name',
      report.nameless.length === 0,
      report.nameless.join(', ')
    );

    check(
      '50. and each dialog has one of its own, from the heading it wrote',
      report.unlabelled.length === 0,
      report.unlabelled.join(', ')
    );

    check(
      '51. every ARIA reference inside them resolves',
      report.danglingAria.length === 0,
      report.danglingAria.join(', ')
    );

    check(
      '52. no id is written twice once both modals are on the page',
      report.duplicateIds.length === 0,
      report.duplicateIds.join(', ')
    );

    check(
      '53. every choice in either modal carries a pressed state',
      report.unpressed.length === 0,
      `${[...new Set(report.unpressed)].join(', ')} — without it nothing announces which one is on`
    );

    check(
      '54. and exactly one of each group is pressed',
      report.pressedCounts.mode === 1 &&
        report.pressedCounts.swatch === 1 &&
        report.pressedCounts.locale === 1,
      JSON.stringify(report.pressedCounts)
    );

    check(
      '55. every control clears 2.5.8’s 24px target size',
      report.small.length === 0,
      report.small.join(', ')
    );

    check(
      '56. opening a modal puts focus inside it',
      report.focusInside,
      'showModal() does this, which is the third thing the hand-rolled shell got wrong'
    );

    /* --- The palette reaches the page, and not only the bar -------------- */

    // **The question worth asking out loud.** The two attributes go on <html>
    // and every colour block in theme.css and docs.css selects on them, so a
    // palette that stopped at the header would be a very odd defect — but "it
    // must, by construction" is exactly the reasoning this build keeps finding
    // holes in. So it is measured: pick the other palette from the header, on a
    // page with an article on it, and see what moved.
    // Both of them, and closed through the elements rather than by pressing
    // Escape twice: the page underneath is inert while either is up, so a
    // header button cannot be clicked until the stack is empty.
    await page.evaluate(() => {
      document.querySelector('#themeModal')?.close();
      document.querySelector('#languageModal')?.close();
    });

    // **The transition is suppressed, and not waited out.** theme.css gives
    // `body` a background-color transition, so a snapshot taken in the same tick
    // as the click reads the colour it is animating *from* — which looks exactly
    // like a palette that reached the tokens and stopped at the page. The first
    // shape of this check slept 600ms instead, which is section 3's own rule
    // broken: "a fixed wait after a click is a race, not a delay", and a wait
    // tuned to 220ms breaks the day somebody edits one token. Phase 12 part 3's
    // contrast section reached the same conclusion about the same transition,
    // and this is its answer.
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

    // Two frames: the first is where the style recalculation lands, the second
    // is where it has been painted from.
    const settle = () =>
      page.evaluate(
        () =>
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );

    const snapshot = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          palette: document.documentElement.getAttribute('data-color-theme'),
          bg: root.getPropertyValue('--bg').trim(),
          text: root.getPropertyValue('--text').trim(),
          body: getComputedStyle(document.body).backgroundColor,
          // A page colour that is actually drawn, and not a token: the article's
          // own prose, which belongs to neither the header nor this part.
          prose: getComputedStyle(document.querySelector('.docs-article p') ?? document.body).color,
          // The sidebar is the third column and belongs to neither. Asked
          // separately, because a palette that reached the two things part 1
          // touched and stopped is the failure this is shaped for.
          sidebar: getComputedStyle(document.querySelector('.docs-sidebar') ?? document.body)
            .borderRightColor,
        };
      });

    await settle();
    const before = await snapshot();

    await page.click('#themeButton');
    await page.click('#themeModal [data-color-theme="hello"]');
    await page.keyboard.press('Escape');
    await settle();

    const after = await snapshot();

    check(
      '57. choosing a palette from the header sets it on the document, not on the header',
      after.palette === 'hello',
      'the attribute is on <html>, so every colour block on the page selects on it'
    );

    check(
      '58. and the tokens the whole site is drawn from move with it',
      before.bg !== after.bg && before.text !== after.text,
      JSON.stringify({ bg: [before.bg, after.bg], text: [before.text, after.text] })
    );

    // **Drawn colour, and not only tokens.** A token that moved while nothing
    // repainted would be a palette applied to a variable. `--link` is
    // deliberately the same red in both palettes — the GFTV link colour is
    // constant — so the prose, the page background and the sidebar's own rule
    // are what is asked instead.
    check(
      '59. and so does what is actually painted, on the page and in the sidebar',
      before.prose !== after.prose && before.body !== after.body && before.sidebar !== after.sidebar,
      JSON.stringify({
        prose: [before.prose, after.prose],
        body: [before.body, after.body],
        sidebar: [before.sidebar, after.sidebar],
      })
    );
  } finally {
    await browser.close();
    server.close();
  }
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 14 verification');
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
