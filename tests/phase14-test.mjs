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
//   chrome       part 1: the docs header's two controls, and the portal's
//   browser      the same header, opened, pressed, and reloaded
//   contrast     both modals against WCAG AA, in all four theme combinations
//   a11y         both modals against the accessibility rules, open
//   worker       part 4: the docs service worker, read as source
//   install      the same worker installed in a real Chromium, then offline
//   boundary     part 5: what a job poster may reach, and what is an admin's
//   guide        part 5: the poster guide, and the procedure it copies
//   admin-guide  part 6: the admin guide, and the access rule it states
//   developer-guide  part 7: the developer guide, and the scripts it embeds
//   captures     part 8: 16g's manifest, and what it may photograph
//   discovery    part 8: robots.txt, sitemap.xml and llms.txt
//   translations part 9: the 华文 tree, the two tables, and what serves them

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

define('worker', 'Part 4: the docs service worker, and what makes it safe', async () => {
  const sw = read(join(DOCS, 'sw.js'));
  const bar = read(join(MAIN, 'assets/js/connection-bar.js'));
  const docsBar = read(join(DOCS, 'assets/js/connection-bar.js'));
  const docsShell = read(join(DOCS, 'assets/js/shell.js'));
  const offline = read(join(MAIN, 'assets/js/offline.js'));
  const build = read(join(DOCS, 'scripts/build.js'));
  const vercel = JSON.parse(read(join(DOCS, 'vercel.json')));
  const docsEn = JSON.parse(read(join(DOCS, 'assets/i18n/en.json')));
  const docsZh = JSON.parse(read(join(DOCS, 'assets/i18n/zh.json')));

  /* --- The lifecycle, section 14's one rule ------------------------------ */

  // The update mechanism rests on the worker not taking over by itself. A
  // skipWaiting in install would replace the page under a reader mid sentence
  // and make the prompt decorative, which is what section 14 forbids.
  const installBlock = sw.slice(
    sw.indexOf("addEventListener('install'"),
    sw.indexOf("addEventListener('activate'")
  );
  check(
    '1. install does not call skipWaiting',
    !installBlock.includes('skipWaiting()'),
    'A new worker waits for the reader to accept it, per section 14.'
  );

  const activateBlock = sw.slice(
    sw.indexOf("addEventListener('activate'"),
    sw.indexOf("addEventListener('message'")
  );
  check(
    '2. activate does not call clients.claim',
    !activateBlock.includes('clients.claim()'),
    'The same rule, other half.'
  );

  check(
    '3. skipWaiting is reachable only from the skip-waiting message',
    /if \(type === 'skip-waiting'\)[\s\S]{0,120}skipWaiting\(\)/.test(sw),
    'The update prompt is the only route to it.'
  );

  check(
    '4. and connection-bar.js is the only thing that posts it',
    bar.includes("postMessage('skip-waiting')") && !docsShell.includes('skip-waiting'),
    'One implementation of the update path, generated into both sites.'
  );

  /* --- What makes caching the gated guides defensible --------------------
   *
   * These six are the decision of 3 September 2026. Cached staff procedure is
   * only safe while the cache is named for a tier and is dropped when the
   * reader changes or leaves. If one of these fails, the decision is wrong and
   * not merely untidy.
   * ---------------------------------------------------------------------- */

  check(
    '5. the gated cache is named for the tier it was filled at',
    /const gatedCacheFor = \(tier\) =>/.test(sw),
    'A reader whose tier changes must not inherit the previous one.'
  );

  check(
    '6. a gated cache that is not the current tier is deleted',
    /async function rememberTier[\s\S]*?key !== wanted[\s\S]*?caches\.delete/.test(sw),
    'The comparison is what notices a revocation nobody announced.'
  );

  check(
    '7. signing out deletes every gated cache',
    /async function forgetGated[\s\S]*?startsWith\(GATED_PREFIX\)[\s\S]*?caches\.delete/.test(sw),
    'Without this a shared machine keeps the staff guides after a sign out.'
  );

  check(
    '8. the shell posts signed-out before it navigates',
    /tellWorker\(\{ type: 'signed-out' \}\)[\s\S]{0,600}window\.location\.assign/.test(docsShell),
    'After the navigation would be too late: the page is gone.'
  );

  check(
    '9. the shell posts the tier on every load',
    docsShell.includes("tellWorker({ type: 'tier'"),
    'A reader whose access was revoked simply arrives as a different tier.'
  );

  check(
    '10. a signed out reader is a tier like any other',
    /tellWorker\(\{ type: 'tier', tier: data\?\.reader\?\.tier \?\? 'public' \}\)/.test(docsShell),
    'Otherwise signing out would leave the previous cache in place.'
  );

  /* --- What must never be cached ----------------------------------------- */

  check(
    '11. nothing under /api/auth is cached in either direction',
    sw.includes('const NEVER =') && sw.includes('if (NEVER.test(url.pathname)) return;'),
    'A session is not a document.'
  );

  check(
    '12. only GET, and only this origin',
    sw.includes("request.method !== 'GET'") && sw.includes('url.origin !== self.location.origin'),
    'A cross origin request belongs to whoever answers it.'
  );

  check(
    '13. only a 200 is ever written to a cache',
    (sw.match(/if \(response\.ok\)/g) ?? []).length >= 3,
    'A cached 404 tells a reader a page does not exist after somebody wrote it.'
  );

  /* --- Freshness, which is phase 13 decision 3's own argument ------------- */

  check(
    '14. a page is network first',
    /async function pageFirst[\s\S]*?await fetch\(request\)[\s\S]*?catch[\s\S]*?cache\.match/.test(sw),
    'A procedure from a cache after the step changed is the failure this avoids.'
  );

  check(
    '15. the API answers are network first',
    /async function apiFirst[\s\S]*?networkFirst\(request, gatedCacheFor\(tier\)\)/.test(sw),
    'The same rule for the gated half.'
  );

  check(
    '16. build output is cache first',
    /async function assetFirst[\s\S]*?cache\.match\(request\)[\s\S]*?await fetch\(request\)/.test(sw),
    'It changes only with a deploy, and a deploy is a new cache.'
  );

  check(
    '17. the shell is the fallback and there is no second offline page',
    sw.includes("cache.match('/shell.html')") && !sw.includes("'/offline'"),
    '16e: a reader must not be able to tell which pipeline a missing page came from.'
  );

  /* --- The precache list, which the build writes -------------------------- */

  check(
    '18. sw.js carries the marker the build fills in',
    sw.includes('/* BUILD:PRECACHE */'),
    'Renaming it in one place stops the build, which is what replaceOnce is for.'
  );

  check(
    '19. the source list is empty, so a stale one cannot ship',
    /const PRECACHE = \[\n {2}\/\* BUILD:PRECACHE \*\/\n\];/.test(sw),
    'Anything written here by hand is a second answer to what exists.'
  );

  // The signature gained `locales` in part 9, which is the one language index
  // per language the build now writes beside the English one.
  check(
    '20. the build writes it from the pages it has just written',
    /function writeWorker\(pagePaths, locales\)[\s\S]*?BUILD:PRECACHE[\s\S]*?writeFileSync\(join\(DIST, 'sw\.js'\)/.test(
      build
    ),
    'The list cannot drift from the tree.'
  );

  if (!existsSync(join(DIST, 'sw.js'))) {
    skip('21. the built worker names every public page', 'dist/sw.js is not there; run the build');
  } else {
    const built = read(join(DIST, 'sw.js'));
    const listed = new Set([...built.matchAll(/^ {2}'([^']+)',$/gm)].map((match) => match[1]));
    const pages = [...listed].filter((entry) => !entry.includes('.'));

    check(
      '21. the built worker names every public section',
      listed.has('/') && listed.has('/bot') && listed.has('/portal') && listed.has('/translations'),
      `found ${pages.length} page addresses`
    );
    check(
      '22. and one address per public page',
      pages.length >= 30,
      `found ${pages.length}, expected at least the 30 the build reports`
    );
    check(
      '23. it precaches the shell, which is the offline fallback',
      listed.has('/shell.html'),
      'Without it an uncached address offline has nothing to draw.'
    );
    check(
      '24. it precaches the search index and both dictionaries',
      listed.has('/search-index.json') &&
        listed.has('/assets/i18n/en.json') &&
        listed.has('/assets/i18n/zh.json'),
      'A 华文 reader offline must not fall back to English.'
    );
    check(
      '25. and no gated address is in it',
      ![...listed].some((entry) => entry.startsWith('/staff')),
      '16e: a gated page must never appear in something served to everybody.'
    );
  }

  /* --- The bar, generated rather than written twice ----------------------- */

  check(
    '26. connection-bar.js is the portal file, generated into this site',
    docsBar.includes('GENERATED FILE') && docsBar.includes('gen-docs-lib.js'),
    'update-bar-spec.md is portable, so there is one implementation.'
  );

  check(
    '27. offline.js delegates to it and keeps its own exports',
    offline.includes("from './connection-bar.js'") &&
      offline.includes('export { workerVersion }') &&
      offline.includes('export function applyNetworkGating'),
    'Five files import offline.js and none of them changed.'
  );

  check(
    '28. the docs site passes no status page to link to',
    /initConnectionBar\(\{[\s\S]*?statusHref: null/.test(docsShell),
    'A bar here linking to the portal status page sends somebody to the wrong site.'
  );

  check(
    '29. the portal still links to its own',
    /statusHref: '\/status'/.test(offline),
    'Which is the right place for somebody who cannot reach the portal.'
  );

  /* --- The strings, and the headers --------------------------------------- */

  const barKeys = [
    'offline.bannerLabel',
    'offline.bannerOffline',
    'offline.bannerUnreachable',
    'offline.updateReady',
    'offline.updateReload',
    'offline.updateLater',
  ];
  check(
    '30. every string the bar draws is in both docs dictionaries',
    barKeys.every((key) => Boolean(docsEn[key]) && Boolean(docsZh[key])),
    barKeys.filter((key) => !docsEn[key] || !docsZh[key]).join(', ')
  );

  const swHeaders = (vercel.headers ?? []).find((entry) => entry.source === '/sw.js');
  check(
    '31. /sw.js is served no-cache',
    Boolean(
      swHeaders?.headers?.some((h) => h.key === 'Cache-Control' && h.value === 'no-cache')
    ),
    'A cached worker is a build nobody can replace.'
  );
  check(
    '32. and with Service-Worker-Allowed',
    Boolean(swHeaders?.headers?.some((h) => h.key === 'Service-Worker-Allowed')),
    'The portal carries the same two.'
  );

  /* --- The portal side of the same change --------------------------------- */

  const portalSw = read(join(MAIN, 'sw.js'));
  check(
    '33. the portal precaches connection-bar.js',
    portalSw.includes("'/assets/js/connection-bar.js'"),
    'offline.js imports it on every page, so missing it turns the bar off.'
  );
});

define('install', 'Part 4: the worker installed, then the network pulled out', async () => {
  if (!existsSync(join(DIST, 'sw.js'))) {
    skip('the built worker', 'run `node scripts/build.js` from docs-site/ first');
    return;
  }

  // **This is the only section in either suite that runs a service worker.**
  // Everything else about part 4 reads source or `dist/`, and a worker is a
  // thing that installs: a fetch handler that throws makes every page on the
  // origin fail for anybody who already has it, and no amount of reading the
  // file finds that. 127.0.0.1 is a secure context, so registration works here
  // exactly as it does on the deployment.
  const server = serve();
  const base = await listen(server);
  console.log(`      serving the built site at ${base}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });

    /* --- It installs at all ---------------------------------------------- */

    const activated = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration.active);
    });
    check(
      '34. the worker registers and reaches active',
      activated,
      'A worker that throws on install never gets here.'
    );

    check(
      '35. and it is controlling nothing yet, because it did not claim',
      (await page.evaluate(() => navigator.serviceWorker.controller === null)) === true,
      'No clients.claim in activate, so the first load stays uncontrolled, per section 14.'
    );

    // The precache runs inside install, so by `ready` it has finished or failed.
    const shellEntries = await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find((name) => name.includes('-shell-'));
      if (!shell) return null;
      const cache = await caches.open(shell);
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });

    check(
      '36. the shell cache exists and the precache filled it',
      Array.isArray(shellEntries) && shellEntries.length >= 50,
      `stored ${shellEntries?.length ?? 0} entries`
    );

    check(
      '37. every page in the built tree is in it',
      Array.isArray(shellEntries) &&
        ['/', '/bot', '/bot/commands', '/portal/applying', '/translations'].every((path) =>
          shellEntries.includes(path)
        ),
      'A precache entry that 404s is dropped one at a time, so a gap here is real.'
    );

    check(
      '38. the shell itself is in it, which is what an uncached address falls back to',
      Array.isArray(shellEntries) && shellEntries.includes('/shell.html')
    );

    /* --- A second load, now controlled ----------------------------------- */

    await page.reload({ waitUntil: 'networkidle' });
    check(
      '39. the second load is controlled by the worker',
      (await page.evaluate(() => navigator.serviceWorker.controller !== null)) === true,
      'Which is the ordinary case for a returning reader.'
    );

    /* --- The tier message, and the cache it names ------------------------ */

    // The stand in server answers /api/nav as a stranger, so the shell posts
    // `public`. What is being checked is that the message arrives and the
    // worker acts on it, not which tier it was.
    const tierCache = await page.evaluate(async () => {
      const names = await caches.keys();
      return names.find((name) => name.includes('-gated-')) ?? null;
    });
    check(
      '40. the shell told the worker which tier it is caching for',
      tierCache === 'careers-gftv-docs-gated-public',
      `found ${tierCache ?? 'no gated cache'}`
    );

    // The clearing is the whole safety argument, so it is exercised rather than
    // read: pretend to be a reader at a higher tier, then post `public` again
    // the way a sign out would, and watch the first cache go.
    const cleared = await page.evaluate(async () => {
      const worker = navigator.serviceWorker.controller;
      const settle = () => new Promise((done) => setTimeout(done, 250));

      worker.postMessage({ type: 'tier', tier: 'admin' });
      await settle();
      const afterAdmin = await caches.keys();

      worker.postMessage({ type: 'signed-out' });
      await settle();
      const afterSignOut = await caches.keys();

      return {
        admin: afterAdmin.filter((name) => name.includes('-gated-')),
        signedOut: afterSignOut.filter((name) => name.includes('-gated-')),
      };
    });

    // **The new tier's cache is not created here, and that is the right
    // behaviour.** `rememberTier` deletes what does not match and nothing else;
    // the cache for the tier now in force is opened lazily by the first API
    // answer that needs storing. So what a tier change guarantees is that the
    // previous reader's cache is *gone*, which is the half the decision rests
    // on. This check expected the new one to exist and was wrong about the
    // code, which is the sort of thing only running it finds.
    check(
      '41. a change of tier drops the cache the previous tier filled',
      !cleared.admin.includes('careers-gftv-docs-gated-public'),
      `left ${cleared.admin.join(', ') || 'none'}`
    );

    check(
      '42. and signing out drops every gated cache there is',
      cleared.signedOut.length === 0,
      `left ${cleared.signedOut.join(', ') || 'none'}`
    );

    /* --- The network, pulled out ----------------------------------------- */

    await context.setOffline(true);

    const precached = await page.goto(`${base}/bot/commands`, { waitUntil: 'domcontentloaded' });
    check(
      '43. a precached page still answers with the network gone',
      precached !== null && precached.status() === 200,
      `status ${precached?.status() ?? 'no response'}`
    );

    check(
      '44. and it is the page, not the shell with an empty article',
      (await page.locator('#docsArticle h1').first().textContent())?.includes('Command reference') ===
        true,
      'The built file carries its own article, so offline it is whole.'
    );

    check(
      '45. its stylesheet came out of the cache too',
      (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !==
        'rgba(0, 0, 0, 0)',
      'An unstyled page offline would mean the assets were never precached.'
    );

    const uncached = await page.goto(`${base}/staff/admin/nothing-here`, {
      waitUntil: 'domcontentloaded',
    });
    check(
      '46. an address that was never cached falls back to the shell',
      uncached !== null && uncached.status() === 200,
      'Not the browser error page: 16e says a reader must not be able to tell.'
    );

    check(
      '47. and the shell it falls back to is the real one',
      (await page.locator('.docs-header').count()) === 1,
      'Chrome, sidebar and search, with the article empty.'
    );

    /* --- And back --------------------------------------------------------- */

    await context.setOffline(false);
    const back = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    check(
      '48. and the site is itself again once the network returns',
      back !== null && back.status() === 200 && (await page.locator('#docsArticle').count()) === 1
    );
  } finally {
    await browser.close();
    server.close();
  }
});

define('boundary', "Part 5: what a job poster may reach, and what is an admin's", () => {
  const shell = read(join(MAIN, 'assets/js/admin-shell.js'));

  /* --- The sidebar ------------------------------------------------------ */

  // One entry per line is not how the file is written, so each item is read as
  // the block between its href and the next closing brace. A regex over the
  // whole file would call an adminOnly on the item above the right answer.
  const navItem = (href) => {
    const at = shell.indexOf(`href: '${href}'`);
    if (at === -1) return null;
    return shell.slice(at, shell.indexOf('},', at));
  };

  // 10 item 2's list, from the side that says what only an admin may do. The
  // first two have been here since phase 8; the second two arrived with this
  // part, and deviation 130 is the account of why they were not.
  for (const [href, what] of [
    ['/admin/admins', 'staff access'],
    ['/admin/applicants', 'applicant accounts'],
    ['/admin/settings', 'the portal settings'],
    ['/admin/maintenance', 'the maintenance switches'],
  ]) {
    const item = navItem(href);
    check(
      `49. ${what} is adminOnly in the sidebar`,
      item !== null && /adminOnly:\s*true/.test(item),
      item === null ? `no nav item for ${href}` : `${href} carries no adminOnly`
    );
  }

  check(
    '50. and a poster still has the sections that are theirs',
    ['/admin/jobs', '/admin/applications', '/admin/analytics', '/admin/invites', '/admin/tags']
      .map((href) => navItem(href))
      .every((item) => item !== null && !/adminOnly/.test(item)),
    'a poster with no postings page would be a poster with nothing to do'
  );

  check(
    '51. the maintenance banner keeps its sentence for a poster and drops its link',
    /admin\.maintenanceBanner'[\s\S]{0,200}isAdminUser\(\)[\s\S]{0,200}\/admin\/maintenance/.test(
      shell
    ),
    'a poster needs to know a feature is off. The page it is switched back on from is not theirs.'
  );

  /* --- The routes ------------------------------------------------------- */

  // **The sidebar is not the check.** Hiding a link stops nobody: 8.2's rule is
  // that the route checks the role again, and phase 7's suite proves that half
  // against a real poster session. This half is the source, so it fails on the
  // commit that removes the guard instead of on the next run with a credential.
  for (const [file, what] of [
    ['api/admin/settings.js', 'the portal settings'],
    ['api/admin/maintenance.js', 'the maintenance switches'],
    ['api/admin/admins.js', 'staff access'],
    ['api/admin/applicants.js', 'applicant accounts'],
    ['api/admin/submissions.js', 'unmatched submissions'],
  ]) {
    const source = read(join(MAIN, file));
    check(
      `52. ${what} guards with requireAdmin`,
      /await requireAdmin\(req, res\)/.test(source),
      `${file} does not call requireAdmin`
    );
    check(
      `52. and ${what} does not also let requireStaff through`,
      !/await requireStaff\(req, res\)/.test(source),
      `${file} still has a requireStaff door beside the admin one`
    );
  }

  check(
    '53. deleting a posting is still admins only, per 8.2',
    /if \(!isAdmin\(session\.user\)\)/.test(read(join(MAIN, 'api/admin/jobs.js'))),
    'the delete branch is the one admin check inside a route a poster may otherwise use'
  );
});

define('guide', 'Part 5: the job poster guide, and the copy it holds twice', () => {
  const dir = join(DOCS, 'api/_content/poster');
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'));

  check('54. the guide is twenty pages', files.length === 20, `${files.length} files in ${dir}`);

  /* --- Front matter ----------------------------------------------------- */

  const pages = files.map((name) => {
    const source = read(join(dir, name));
    const block = source.startsWith('---\n') ? source.slice(4, source.indexOf('\n---', 3)) : '';
    const value = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null;
    return { name, source, title: value('title'), access: value('access'), order: value('order') };
  });

  check(
    '55. every page is gated at the poster tier',
    pages.every((page) => page.access === 'poster'),
    pages.filter((page) => page.access !== 'poster').map((page) => page.name).join(', ')
  );

  const orders = pages.map((page) => Number(page.order)).sort((a, b) => a - b);
  check(
    '56. the twenty orders are 1 to 20 with none repeated',
    orders.every((value, index) => value === index + 1),
    orders.join(', ')
  );

  check(
    '57. every page has a title and a summary',
    pages.every((page) => page.title && /^summary:\s*\S/m.test(page.source)),
    'the title is the sidebar entry and the summary is the search result'
  );

  /* --- The screenshot slots --------------------------------------------- */

  // 16g: until the capture run, a slot reads as pending instead of broken. Part
  // 8 captures exactly these, so the names are the manifest it will be written
  // from, and a typo here is a shot nobody takes.
  const slots = pages
    .flatMap((page) => [...page.source.matchAll(/!\[[^\]]*\]\(pending:([^)\s]+)/g)])
    .map((match) => match[1]);

  check('58. ten screenshot slots are named for part 8', slots.length === 10, slots.join(', '));
  check(
    "58. and each one is named the way 16g asks, subject first and theme last",
    slots.every((name) => /^poster-[a-z-]+-(desktop|phone)-(light|dark)$/.test(name)),
    slots.filter((name) => !/^poster-[a-z-]+-(desktop|phone)-(light|dark)$/.test(name)).join(', ')
  );
  check('58. and no slot is named twice', new Set(slots).size === slots.length, slots.join(', '));

  /* --- The Apps Script steps, which are a second copy ------------------- */

  // **The check the part was asked for.** The dashboard's four step strings are
  // the ones a poster reads beside the form field, and the guide quotes them so
  // that the fiddliest procedure on the site is in front of whoever is doing
  // it. That makes the guide the third copy, after the root README, and a copy
  // nothing compares is the copy that goes stale in public. `commands.py
  // --check` is the same argument for the command table.
  //
  // Normalised because the page wraps at 80 columns and quotes each step as a
  // blockquote: what is compared is the sentence, not its line breaks.
  const flat = read(join(dir, 'confirmed-submissions.md'))
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ');

  const dictionary = JSON.parse(read(join(MAIN, 'assets/i18n/en.json')));

  for (const number of [1, 2, 3, 4]) {
    const step = dictionary[`admin.webhookStep${number}`];
    check(
      `59. step ${number} is quoted from the dashboard word for word`,
      typeof step === 'string' && flat.includes(step.replace(/\s+/g, ' ')),
      `admin.webhookStep${number} is not on the page: "${step}"`
    );
  }

  /* --- The links -------------------------------------------------------- */

  // Every /staff/poster/... link on these pages, against the files that exist.
  // A guide of twenty cross referenced pages is where a dead internal link
  // hides, and the gated pipeline has no build step to catch one.
  const names = new Set(files.map((name) => name.replace(/\.md$/, '')));
  const dead = pages.flatMap((page) =>
    [...page.source.matchAll(/\]\(\/staff\/poster\/([a-z0-9-]+)\)/g)]
      .map((match) => match[1])
      .filter((slug) => !names.has(slug))
      .map((slug) => `${page.name} -> ${slug}`)
  );
  check('60. every link between these pages points at a page that exists', dead.length === 0, dead.join(', '));

  check(
    '61. the staff index no longer says the poster guide is unwritten',
    !/Not written yet[\s\S]*poster/i.test(read(join(DOCS, 'api/_content/index.md'))),
    'the index is what a reader lands on, and it outranks the guide it describes'
  );
});

define('admin-guide', 'Part 6: the admin guide, and the access rule it states', async () => {
  const dir = join(DOCS, 'api/_content/admin');

  // **`tests/phase13-test.mjs` plants two files in this very directory.**
  // `example-shot.md` and `example.png`, to exercise the gated image path,
  // deleted when it finishes. A phase 14 run overlapping one of its runs read
  // fifteen pages and a ninth screenshot slot before this line existed, which
  // is a suite failing because another suite was running. They are skipped by
  // name so the two are independent again, and the names are listed here
  // because a reader of this directory deserves to know why those two are not
  // pages.
  const FIXTURES = new Set(['example-shot.md', 'example.png']);
  const files = readdirSync(dir).filter((name) => name.endsWith('.md') && !FIXTURES.has(name));

  check('62. the guide is fourteen pages', files.length === 14, `${files.length} files in ${dir}`);

  /* --- Front matter ----------------------------------------------------- */

  const pages = files.map((name) => {
    const source = read(join(dir, name));
    const block = source.startsWith('---\n') ? source.slice(4, source.indexOf('\n---', 3)) : '';
    const value = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null;
    return { name, source, title: value('title'), access: value('access'), order: value('order') };
  });

  check(
    '63. every page is gated at the admin tier',
    pages.every((page) => page.access === 'admin'),
    pages.filter((page) => page.access !== 'admin').map((page) => page.name).join(', ')
  );

  // **The index's order means something different from every other page's.**
  // pages.js: "On a section's index.md it orders the sections; on any other page
  // it orders that page within its section." So the index is 2 because the admin
  // guide is the second gated section, and the thirteen below it number
  // themselves. The index is drawn first whatever it carries, which is why this
  // is two checks and not one.
  const index = pages.find((page) => page.name === 'index.md');
  check('64. the index carries order 2, which is what orders the sections', index?.order === '2');

  const orders = pages
    .filter((page) => page.name !== 'index.md')
    .map((page) => Number(page.order))
    .sort((a, b) => a - b);
  check(
    '64. and the thirteen pages under it are 1 to 13 with none repeated',
    orders.length === 13 && orders.every((value, at) => value === at + 1),
    orders.join(', ')
  );

  check(
    '65. every page has a title and a summary',
    pages.every((page) => page.title && /^summary:\s*\S/m.test(page.source)),
    'the title is the sidebar entry and the summary is the search result'
  );

  /* --- The screenshot slots --------------------------------------------- */

  const slots = pages
    .flatMap((page) => [...page.source.matchAll(/!\[[^\]]*\]\(pending:([^)\s]+)/g)])
    .map((match) => match[1]);

  const shape = /^admin-[a-z-]+-(desktop|phone)-(light|dark)$/;
  check('66. eight screenshot slots are named for part 8', slots.length === 8, slots.join(', '));
  check(
    '66. and each one is named the way 16g asks, subject first and theme last',
    slots.every((name) => shape.test(name)),
    slots.filter((name) => !shape.test(name)).join(', ')
  );
  check('66. and no slot is named twice', new Set(slots).size === slots.length, slots.join(', '));

  /* --- The access rule, which this guide states for the third time ------ */

  // **The check this part was asked for.** 16h wants the access page to say how
  // `is_approved`, the override, `is_admin` and `is_editor` combine, and what
  // each role opens on this site. That rule is already implemented twice:
  // hasPortalAccess decides who comes in, and tiers.js decides what opens. A
  // page describing both is the third copy, and a copy nothing compares is the
  // copy that goes stale in front of whoever is granting somebody access.
  const flat = read(join(dir, 'access-and-roles.md')).replace(/\s+/g, ' ');
  const dictionary = JSON.parse(read(join(MAIN, 'assets/i18n/en.json')));

  // The five sentences the dashboard itself shows beside an account, quoted on
  // the page word for word. Normalised the way the poster guide's steps are:
  // what is compared is the sentence and not where the page wrapped it.
  for (const key of [
    'admin.accessState_granted',
    'admin.accessState_denied',
    'admin.accessState_default',
    'admin.roleAdminOpens',
    'admin.rolePosterOpens',
  ]) {
    const sentence = dictionary[key];
    check(
      `67. ${key} is quoted from the dashboard word for word`,
      typeof sentence === 'string' && flat.includes(sentence.replace(/\s+/g, ' ')),
      `not on the page: "${sentence}"`
    );
  }

  // The four tiers, imported from the file that defines them instead of typed
  // out here. A fifth tier, or a rename, fails this without anybody thinking to
  // come back to a markdown file.
  const { ACCESS_VALUES } = await import(
    new URL('../docs-site/api/_lib/tiers.js', import.meta.url).href
  );
  const named = ACCESS_VALUES.filter((tier) => new RegExp(`\\| ${tier} \\|`).test(flat));
  check(
    '68. the page names all four tiers and no others',
    named.length === ACCESS_VALUES.length &&
      named.join() === ACCESS_VALUES.join(),
    `page has ${named.join(', ')} for ${ACCESS_VALUES.join(', ')}`
  );

  // **The order of the three steps is the rule.** Stating them in any other
  // order describes a different rule that happens to use the same words: an
  // override that beat is_approved, or a role that beat an override.
  const order = (haystack, ...patterns) => patterns.map((p) => haystack.search(p));
  const rising = (values) => values.every((v, at) => v >= 0 && (at === 0 || v > values[at - 1]));

  check(
    '69. the page states the three steps in the order the site runs them',
    rising(order(flat, /is_approved/, /override row decides/, /is_admin` or `is_editor/)),
    'is_approved, then the override, then the gftv.asia role'
  );

  const rule = (() => {
    const source = read(join(MAIN, 'api/_lib/session.js'));
    const at = source.indexOf('export async function hasPortalAccess');
    return at === -1 ? '' : source.slice(at, source.indexOf('\n}', at));
  })();
  check(
    '69. and hasPortalAccess still runs them in that order',
    rising(order(rule, /is_approved/, /granted/, /is_admin/)),
    'the page above is a description of this function. If it moved, the page is wrong.'
  );

  /* --- The links -------------------------------------------------------- */

  // Both directions: within this guide, and out into the poster guide, which
  // this one sits on top of and links to on nine pages.
  const here = new Set(files.map((name) => name.replace(/\.md$/, '')));
  const there = new Set(
    readdirSync(join(DOCS, 'api/_content/poster'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''))
  );

  const dead = pages.flatMap((page) => [
    ...[...page.source.matchAll(/\]\(\/staff\/admin\/([a-z0-9-]+)\)/g)]
      .map((match) => match[1])
      .filter((slug) => !here.has(slug))
      .map((slug) => `${page.name} -> /staff/admin/${slug}`),
    ...[...page.source.matchAll(/\]\(\/staff\/poster\/([a-z0-9-]+)\)/g)]
      .map((match) => match[1])
      .filter((slug) => !there.has(slug))
      .map((slug) => `${page.name} -> /staff/poster/${slug}`),
  ]);
  check('70. every link out of these pages points at a page that exists', dead.length === 0, dead.join(', '));

  check(
    '71. the staff index no longer says the admin guide is unwritten',
    !/Not written yet[\s\S]*admin/i.test(read(join(DOCS, 'api/_content/index.md'))) &&
      /\/staff\/admin/.test(read(join(DOCS, 'api/_content/index.md'))),
    'the index is what a reader lands on, and it outranks the guide it describes'
  );
});

define('developer-guide', 'Part 7: the developer guide, and the scripts it hands over', async () => {
  const dir = join(DOCS, 'api/_content/developer');
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'));

  check('72. the guide is seventeen pages', files.length === 17, `${files.length} files in ${dir}`);

  /* --- Front matter ----------------------------------------------------- */

  const pages = files.map((name) => {
    const source = read(join(dir, name));
    const block = source.startsWith('---\n') ? source.slice(4, source.indexOf('\n---', 3)) : '';
    const value = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null;
    return {
      name,
      source,
      block,
      title: value('title'),
      access: value('access'),
      order: value('order'),
      data: value('data'),
    };
  });

  check(
    '73. every page is gated at the developer tier',
    pages.every((page) => page.access === 'developer'),
    pages.filter((page) => page.access !== 'developer').map((page) => page.name).join(', ')
  );

  const index = pages.find((page) => page.name === 'index.md');
  check('74. the index carries order 3, which is what orders the sections', index?.order === '3');

  const orders = pages
    .filter((page) => page.name !== 'index.md')
    .map((page) => Number(page.order))
    .sort((a, b) => a - b);
  check(
    '74. and the sixteen pages under it are 1 to 16 with none repeated',
    orders.length === 16 && orders.every((value, at) => value === at + 1),
    orders.join(', ')
  );

  check(
    '75. every page has a title and a summary',
    pages.every((page) => page.title && /^summary:\s*\S/m.test(page.source)),
    'the title is the sidebar entry and the summary is the search result'
  );

  // **No screenshot slots here, and that is not an omission.** 16h asks for
  // captures of the dashboard, which is what the poster and admin guides
  // describe. This guide describes files, and a photograph of a file is a worse
  // way to read it than the file.
  //
  // Fenced blocks come out first: the Playwright page shows what a slot looks
  // like, inside a code fence, and an example of a marker is not a marker.
  const slots = pages.flatMap((page) => [
    ...page.source.replace(/```[\s\S]*?```/g, '').matchAll(/!\[[^\]]*\]\(pending:/g),
  ]);
  check('76. no page here claims a screenshot', slots.length === 0, `${slots.length} slots`);

  /* --- The data file, and the page that is its only entry point --------- */

  const carriers = pages.filter((page) => page.data !== null);
  check(
    '77. one page names a data file, and it is the test scripts page',
    carriers.length === 1 && carriers[0].name === 'the-test-scripts.md',
    carriers.map((page) => `${page.name} -> ${page.data}`).join(', ')
  );
  check(
    '77. and it names it as a bare file name beside the page',
    carriers[0]?.data === 'test-scripts.json',
    String(carriers[0]?.data)
  );

  // **The file is current, measured against tests/ and not against the
  // generator.** `embed-tests.mjs --check` compares its own output; this
  // compares what it wrote against what is on disk, so a generator that started
  // reading the wrong directory fails here as well.
  const payload = JSON.parse(read(join(dir, 'test-scripts.json')));
  const scripts = readdirSync(join(REPO, 'tests'))
    .filter((name) => name.endsWith('.mjs'))
    .sort();

  check(
    '78. it carries every script in tests/ and nothing else',
    payload.scripts.map((entry) => entry.name).join() === scripts.join(),
    `${payload.scripts.length} embedded, ${scripts.length} on disk`
  );
  check(
    '78. and its count field agrees with its own list',
    payload.count === payload.scripts.length,
    `${payload.count} claimed, ${payload.scripts.length} present`
  );

  // **Raw, and not through `read`.** That helper normalises line endings so a
  // Windows checkout reads like a Unix one, and a hash is of the bytes.
  const raw = (path) => readFileSync(path, 'utf8');

  const stale = payload.scripts.filter((entry) => {
    const source = raw(join(REPO, 'tests', entry.name));
    return (
      entry.sha256 !== createHash('sha256').update(source).digest('hex') ||
      entry.lines !== source.split('\n').length
    );
  });
  check(
    '79. every embedded script matches the file it came from',
    stale.length === 0,
    `${stale.map((entry) => entry.name).join(', ')} — run docs-site/scripts/embed-tests.mjs`
  );

  const decoded = payload.scripts.map((entry) => Buffer.from(entry.content, 'base64').toString('utf8'));
  check(
    '79. and the base64 decodes back to the script itself',
    decoded.every((source, at) => source === raw(join(REPO, 'tests', payload.scripts[at].name))),
    'the download would hand somebody a file that is not what it claims to be'
  );

  // **A credential in tests/ would be published by this page.** Nothing there
  // holds one today, and every script takes what it needs from the environment.
  // This is the check that keeps that true after somebody pastes a key into a
  // script to debug something and forgets.
  //
  // A placeholder is not a credential: every script in that directory shows
  // `STAFF_PASS='...'` in its usage lines, and a rule that flagged those would
  // be switched off within a week. So a value is only interesting when it is
  // long and is not dots.
  const SECRETISH = [
    /eyJhbGciOi[A-Za-z0-9_-]{10,}/, // a JWT, which is the shape of a Supabase key
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:PASS|PASSWORD|SECRET|TOKEN|APIKEY|API_KEY)\s*[:=]\s*['"][^'"\s.$]{12,}['"]/i,
  ];
  const secrets = payload.scripts.filter((entry, at) =>
    SECRETISH.some((pattern) => pattern.test(decoded[at]))
  );
  check(
    '80. no embedded script carries something that looks like a credential',
    secrets.length === 0,
    secrets.map((entry) => entry.name).join(', ')
  );

  /* --- The wiring that carries it, which has no second address ---------- */

  // The three files that make this work, checked as one rule: the data travels
  // inside the page's own answer. A raw path would be a second public surface
  // for a file whose only supported entry point is the page explaining it.
  const { readableAsset } = await import(
    new URL('../docs-site/api/_lib/pages.js', import.meta.url).href
  );
  check(
    '81. the data file has no address of its own, even for an admin',
    readableAsset('/staff/developer/test-scripts.json', 'developer') === null,
    'a raw path would be a second entry point to it'
  );

  check(
    '81. the content route sends it inside the page',
    /found\.dataFile/.test(read(join(DOCS, 'api/content.js'))),
    'api/content.js reads the named file behind the same check the page passed'
  );
  check(
    '81. and the shell hands it to the module that draws it',
    /mountScripts\(article, data\.data\)/.test(read(join(DOCS, 'assets/js/shell.js'))),
    'assets/js/shell.js'
  );

  // **The anchor is a checked copy.** The module inserts the table after a
  // heading whose id it names, and the page writes that heading as prose. A
  // renamed heading is a table that silently moves to the foot of the page.
  const module = read(join(DOCS, 'assets/js/test-scripts.js'));
  const anchor = /ANCHOR_ID = '([a-z0-9-]+)'/.exec(module)?.[1] ?? null;
  const headings = [...carriers[0].source.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  );
  check(
    '82. the page carries the heading the module inserts after',
    anchor !== null && headings.includes(anchor),
    `module wants #${anchor}, page has ${headings.join(', ')}`
  );

  // Source code is never assigned as markup. This module is the one place on
  // this site that handles a string markdown.js did not render.
  check(
    '82. and the module never assigns markup',
    !/innerHTML|insertAdjacentHTML|outerHTML/.test(module),
    'every node is built with createElement and filled with textContent'
  );

  /* --- The links, and the two files this guide points at ---------------- */

  const here = new Set(files.map((name) => name.replace(/\.md$/, '')));
  const dead = pages.flatMap((page) =>
    [...page.source.matchAll(/\]\(\/staff\/developer\/([a-z0-9-]+)\)/g)]
      .map((match) => match[1])
      .filter((slug) => !here.has(slug))
      .map((slug) => `${page.name} -> /staff/developer/${slug}`)
  );
  check('83. every link inside this guide points at a page that exists', dead.length === 0, dead.join(', '));

  // **The two portable files are pointed at and never reproduced**, because
  // this repository's copy of each is already a copy. A page that started
  // quoting either would be the third link in that chain.
  const theme = read(join(dir, 'the-theme.md'));
  const banner = read(join(dir, 'the-official-banner.md'));
  check(
    '84. the theme page names its source and says this copy is already a copy',
    /gftv-theme\.md/.test(theme) && /canonical source is GFTV PolicySpot/i.test(theme),
    'the source is PolicySpot, and this repository holds a copy of it'
  );
  check(
    '84. the banner page is the pointer and not the text',
    /gftv-official\.md/.test(banner) && /pointer/.test(banner) && !/```html/.test(banner),
    'reproducing the markup here would make this the furthest copy from the source'
  );

  check(
    '85. no page here is left saying it is unwritten',
    !pages.some((page) => /Not written yet/i.test(page.source)),
    pages.filter((page) => /Not written yet/i.test(page.source)).map((page) => page.name).join(', ')
  );

  /* --- What the build did with it --------------------------------------- */

  if (!existsSync(join(DIST, 'sw.js'))) {
    skip('86. the module is precached', 'run docs-site/scripts/build.js first');
  } else {
    check(
      '86. the module the page needs is in the generated precache list',
      read(join(DIST, 'sw.js')).includes("'/assets/js/test-scripts.js'"),
      'a module missing from the list is a table that does not draw offline'
    );
  }

  /* --- And it runs, which is the half reading cannot tell you ----------- */

  if (!existsSync(join(DIST, 'shell.html'))) {
    skip('87. the table draws in a browser', 'run `node scripts/build.js` from docs-site/ first');
    return;
  }

  const server = serve();
  const base = await listen(server);
  const browser = await chromium.launch();
  const page = await browser.newContext().then((context) => context.newPage());

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });

    // Two invented scripts, one of them carrying a tag and a backtick, which is
    // what a real one full of template strings looks like on the way through.
    const result = await page.evaluate(async () => {
      const { mountScripts } = await import('/assets/js/test-scripts.js');
      const source = "// <script>alert(1)</script> and a `template` line\n";
      const encode = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

      const article = document.createElement('div');
      const heading = document.createElement('h2');
      heading.id = 'the-scripts';
      article.append(heading);
      document.body.append(article);

      mountScripts(article, {
        generated: '2026-09-04',
        count: 2,
        scripts: [
          { name: 'one.mjs', description: 'The first. <script>alert(1)</script>', usage: ['node tests/one.mjs'], bytes: 40, lines: 1, sha256: 'a'.repeat(64), content: encode(source) },
          { name: 'two.mjs', description: 'The second.', usage: [], bytes: 12, lines: 3, sha256: 'b'.repeat(64), content: encode('two\n') },
        ],
      });

      // The block goes after the heading it names, and never at the foot.
      const block = heading.nextElementSibling;

      // Hold the object URL open for long enough to read it back. The module
      // revokes on the next tick, which is right for a browser and useless for
      // a check.
      const urls = [];
      const revoke = URL.revokeObjectURL;
      URL.revokeObjectURL = () => {};
      const create = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        urls.push(url);
        return url;
      };

      article.querySelector('tbody tr button').click();
      const saved = urls.length === 1 ? await (await fetch(urls[0])).text() : null;

      URL.revokeObjectURL = revoke;
      URL.createObjectURL = create;

      return {
        placed: block?.classList.contains('docs-scripts') ?? false,
        rows: article.querySelectorAll('tbody tr').length,
        scripts: article.querySelectorAll('script').length,
        escaped: article.textContent.includes('<script>alert(1)</script>'),
        saved,
        source,
      };
    });

    check('87. the table draws after the heading the module names', result.placed);
    check('87. and one row per script', result.rows === 2, `${result.rows} rows`);
    check(
      '88. a description carrying a tag renders as text and not as markup',
      result.scripts === 0 && result.escaped,
      'these strings are source code, and source code assigned as markup is source code that runs'
    );
    check(
      '89. the download hands back the file the page was given',
      result.saved === result.source,
      'the blob is built in the tab and there is no address behind it'
    );
  } finally {
    await browser.close();
    server.close();
  }
});

define('captures', "Part 8: 16g's manifest, and what it may photograph", async () => {
  const manifest = await import(`file://${join(DOCS, 'scripts/screenshots.manifest.js')}`);
  const { SHOTS, SHOTS_BY_NAME, ALWAYS_MASKED, VIEWPORTS, filesFor, markdownSrc } = manifest;

  const capture = read(join(DOCS, 'scripts/capture.mjs'));
  const config = read(join(DOCS, 'scripts/playwright.config.js'));
  const scriptsPackage = JSON.parse(read(join(DOCS, 'scripts/package.json')));
  const sitePackage = JSON.parse(read(join(DOCS, 'package.json')));
  const build = read(join(DOCS, 'scripts/build.js'));

  /* --- The scoping, which is the whole of 16g's first bullet -------------- */

  // **The one that would break a deployment rather than a picture.** Node reads
  // a module's type from the nearest package.json, so the file that scopes
  // Playwright away from the build also decides whether scripts/build.js parses
  // as ESM. Without this key the Vercel build fails on its first import.
  check(
    '1. scripts/package.json is a module, so build.js still parses as one',
    scriptsPackage.type === 'module',
    'the nearest package.json decides, and build.js is a .js file in this directory'
  );

  for (const dependency of ['playwright', 'sharp']) {
    check(
      `2. ${dependency} is scoped to scripts/`,
      Object.hasOwn(scriptsPackage.devDependencies ?? {}, dependency),
      '16g: it never becomes a dependency of the portal build'
    );
    check(
      `3. ${dependency} is not a dependency of the deployed docs project`,
      !Object.hasOwn(sitePackage.dependencies ?? {}, dependency) &&
        !Object.hasOwn(sitePackage.devDependencies ?? {}, dependency),
      'Vercel installs docs-site/package.json, and a browser is not something it should fetch'
    );
  }

  check(
    '4. the portal has no capture dependency either',
    !read(join(MAIN, 'package.json')).includes('playwright'),
    'the shots are of main-site and the script is not'
  );

  /* --- The names, and what each one commits to --------------------------- */

  check('5. the manifest holds 25 shots', SHOTS.length === 25, `it holds ${SHOTS.length}`);

  const NAME = /^(portal|poster|admin)-[a-z0-9-]+-(desktop|phone)-(light|dark)$/;
  const TIER_OF_PREFIX = { portal: 'public', poster: 'poster', admin: 'admin' };

  for (const shot of SHOTS) {
    check(
      `6. ${shot.name} is named the way 16g asks`,
      NAME.test(shot.name),
      'subject, then viewport, then mode, so a name says what the file is'
    );

    const prefix = shot.name.split('-')[0];
    check(
      `7. ${shot.name} carries the tier its prefix claims`,
      TIER_OF_PREFIX[prefix] === shot.tier,
      `the prefix says ${TIER_OF_PREFIX[prefix]} and the entry says ${shot.tier}`
    );

    check(
      `8. ${shot.name} names a viewport that exists`,
      Object.hasOwn(VIEWPORTS, shot.viewport),
      `it names "${shot.viewport}"`
    );

    // The name ends in the mode, and the entry carries it separately. Two
    // copies of one fact, so they are compared rather than trusted.
    check(
      `9. ${shot.name} agrees with itself about the mode`,
      shot.name.endsWith(`-${shot.theme}`),
      `the entry says ${shot.theme}`
    );
  }

  /* --- Where a file is allowed to land ----------------------------------- */

  for (const shot of SHOTS) {
    const files = filesFor(shot);

    if (shot.tier === 'public') {
      check(
        `10. ${shot.name} lands in public/screenshots only`,
        files.length === 1 && files[0] === `public/screenshots/${shot.name}.webp`,
        files.join(', ')
      );
      check(
        `11. ${shot.name} is written into a page as an absolute path`,
        markdownSrc(shot).startsWith('/screenshots/'),
        "a public page's images live in public/, per 16g"
      );
      continue;
    }

    check(
      `10. ${shot.name} lands beside the pages that use it`,
      files.length > 0 && files.every((file) => file.startsWith('api/_content/')),
      files.join(', ') || 'nowhere'
    );
    check(
      `11. ${shot.name} is written into a page as a bare file name`,
      !markdownSrc(shot).includes('/'),
      'so it goes through the same session check the page did'
    );
    check(
      `12. ${shot.name} names the sections it is written into`,
      Array.isArray(shot.sections) && shot.sections.length > 0,
      'an asset is gated at its section\'s own level, so the section is the tier'
    );
  }

  // 16g's own build failure, checked as a rule and not as a state: the string
  // that produces a public path must be reachable for public shots alone.
  check(
    '13. no gated shot can produce a public path',
    SHOTS.filter((shot) => shot.tier !== 'public').every((shot) =>
      filesFor(shot).every((file) => !file.startsWith('public/'))
    ),
    '"a shot for a gated page that lands in the public directory is a build failure"'
  );

  /* --- The manifest against the pages, read here rather than trusted ----- */

  const trees = [join(DOCS, 'content'), join(DOCS, 'api/_content')];
  const markdown = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const here = join(directory, entry.name);
      if (entry.isDirectory()) walk(here);
      else if (entry.name.toLowerCase().endsWith('.md')) markdown.push(here);
    }
  };
  for (const tree of trees) walk(tree);

  // **Scoped to `.webp` and the markers, the way the build is.** That extension
  // is the only thing the capture script writes, so "every screenshot is in the
  // manifest" stays checkable without also meaning "this site may only ever
  // carry screenshots" — and `tests/phase13-test.mjs` writes a `.png` fixture
  // into the gated tree for the length of its own run.
  const slots = new Set();
  for (const file of markdown) {
    for (const match of read(file).matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      const src = match[1];
      if (src.startsWith('pending:')) {
        slots.add(src.slice('pending:'.length));
        continue;
      }
      if (!src.toLowerCase().endsWith('.webp')) continue;
      slots.add(src.slice(src.lastIndexOf('/') + 1).slice(0, -'.webp'.length));
    }
  }

  check(
    '14. every slot in the two trees is in the manifest',
    [...slots].every((name) => SHOTS_BY_NAME.has(name)),
    [...slots].filter((name) => !SHOTS_BY_NAME.has(name)).join(', ')
  );
  check(
    '15. every manifest entry is pointed at by a page',
    SHOTS.every((shot) => slots.has(shot.name)),
    SHOTS.filter((shot) => !slots.has(shot.name)).map((shot) => shot.name).join(', ')
  );
  check(
    '16. the build refuses both of those',
    build.includes('names no shot in scripts/screenshots.manifest.js') &&
      build.includes('is in the manifest and no page points'),
    'a list somebody wrote needs the thing that compares it, or it drifts'
  );

  /* --- The routines, against the script and against the portal ----------- */

  const acts = new Set(
    [...capture.matchAll(/^\s{2}async (\w+)\(page\)/gm)].map((match) => match[1])
  );
  for (const shot of SHOTS.filter((entry) => entry.act)) {
    check(
      `17. ${shot.act} exists in capture.mjs`,
      acts.has(shot.act),
      `${shot.name} names it, and a manifest naming a routine that is not there ` +
        'fails at the shot rather than at the start'
    );
  }

  // **Every id the manifest waits on has to be an id the portal has.** This is
  // the check that catches a rename over there before a capture run finds it at
  // 2am with the seed already written.
  const portalSource = ['assets/js', 'admin', 'account', 'login', 'register', 'search']
    .flatMap((where) => {
      const found = [];
      const collect = (directory) => {
        if (!existsSync(directory)) return;
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const here = join(directory, entry.name);
          if (entry.isDirectory()) collect(here);
          else if (/\.(js|html)$/.test(entry.name)) found.push(read(here));
        }
      };
      collect(join(MAIN, where));
      return found;
    })
    .join('\n');

  const ids = new Set();
  for (const shot of SHOTS) {
    for (const selector of [shot.waitFor, shot.gone, shot.clip, ...shot.mask]) {
      if (!selector) continue;
      for (const match of selector.matchAll(/#([a-zA-Z][\w-]*)/g)) ids.add(match[1]);
    }
  }

  for (const id of [...ids].sort()) {
    check(
      `18. the portal still has #${id}`,
      portalSource.includes(`id="${id}"`),
      'a manifest waiting for an element that was renamed is a capture run that times out'
    );
  }

  /* --- What may never be photographed ------------------------------------ */

  // 16g: "Never capture a screen showing a live recovery code, backup code,
  // login code, linking token, or Google Form URL." The recovery code shot is
  // the one that would have, so the routine calls the module with invented
  // values instead of registering an account and reading real ones.
  check(
    '19. the recovery code shot registers nothing',
    !capture.includes('/api/auth/applicant/register') &&
      capture.includes('showRecoveryCodes({ codes, set:'),
    'the dialog is raised with invented codes, which is what the caption promises'
  );
  check(
    '20. and the codes in it are literals in this repository',
    /K7QM-2XPD-9RTA/.test(capture),
    'a code in a picture that came from the database is a code that unlocks something'
  );

  check(
    '21. whoever ran the capture is masked out of every staff shot',
    ALWAYS_MASKED.includes('.admin-whoami-name'),
    'a staff account is gftv.asia\'s and cannot be seeded, so the name is a real one'
  );
  check(
    '22. the staff access list is masked as well',
    SHOTS_BY_NAME.get('admin-staff-access-desktop-light').mask.some((selector) =>
      selector.includes('admin-row-title')
    ),
    '5g means this table is the live list of people whatever the seed holds'
  );

  /* --- The run refuses rather than coping -------------------------------- */

  check(
    '23. the capture refuses to start without the seed',
    capture.includes('SAMPLE POSTING') && capture.includes('this run was stopped'),
    'an unseeded board photographs real applicants, which is 16g\'s one rule about this'
  );
  check(
    '24. BASE has no default',
    !/BASE\s*=\s*process\.env\.BASE\s*\?\?/.test(capture) && capture.includes("requireEnv(\n  'BASE'"),
    'this script signs in and opens the dashboard, so where it points is a decision'
  );
  check(
    '25. no credential has a default either',
    !/STAFF_PASS['"]\s*\]?\s*\?\?/.test(capture) && !capture.includes("SEED_PASSWORD ??"),
    'a password with a fallback in a committed file is a password in the repository'
  );
  check(
    '26. a missed shot keeps its pending marker',
    capture.includes('for (const shot of taken)'),
    'a half finished run must not leave a page pointing at a file that is not there'
  );

  /* --- Determinism -------------------------------------------------------- */

  check(
    '27. the clock is frozen rather than the dates masked',
    config.includes('export const CLOCK') && capture.includes('clock.setFixedTime'),
    'a masked date leaves a black bar where a guide is explaining a column'
  );
  check(
    '28. animations and transitions are switched off',
    config.includes('transition: none !important') && config.includes('animation: none !important'),
    '16g: a set that produces a diff on every capture stops being reviewable'
  );
  check(
    '29. the theme is set before first paint, not left to the browser',
    capture.includes("localStorage.setItem('gftv-careers.mode'"),
    "the portal's switcher is two axes and stores an explicit choice"
  );
});

define('discovery', "Part 8: the docs site's robots.txt, sitemap and llms.txt", async () => {
  const discovery = await import(`file://${join(DOCS, 'scripts/discovery.js')}`);
  const { INDEXING, DISALLOW, NOINDEX_HEADER, NOINDEX_SOURCES, robotsBody, sitemapXml, llmsTxt } =
    discovery;

  const vercel = JSON.parse(read(join(DOCS, 'vercel.json')));
  const site = 'https://docs.careers.globalfurry.tv';

  /* --- The two instruments, which have to say the same thing ------------- */

  const headerFor = (source) =>
    (vercel.headers ?? [])
      .filter((entry) => entry.source === source)
      .flatMap((entry) => entry.headers)
      .find((header) => header.key === 'X-Robots-Tag')?.value ?? null;

  for (const source of NOINDEX_SOURCES) {
    check(
      `1. vercel.json carries X-Robots-Tag on ${source}`,
      headerFor(source) === NOINDEX_HEADER,
      'a Disallow is a request not to crawl; the header is an instruction not to list, ' +
        'and it is what covers a URL somebody linked to from elsewhere'
    );
  }

  check(
    '2. and robots.txt disallows the same tree',
    DISALLOW.includes('/staff'),
    'the two halves move together or the phase file fails'
  );

  check(
    '3. no global X-Robots-Tag while INDEXING is true',
    INDEXING === true &&
      (vercel.headers ?? [])
        .filter((entry) => entry.source === '/(.*)')
        .flatMap((entry) => entry.headers)
        .every((header) => header.key !== 'X-Robots-Tag'),
    'the portal shipped for eleven phases with one, and turning it off is two edits'
  );

  /* --- robots.txt --------------------------------------------------------- */

  const robots = robotsBody({ indexing: true, site });

  check('4. it names the sitemap absolutely', robots.includes(`Sitemap: ${site}/sitemap.xml`));
  check(
    '5. it disallows every prefix in the list and nothing else',
    DISALLOW.every((path) => robots.includes(`Disallow: ${path}`)) &&
      [...robots.matchAll(/^Disallow: (.+)$/gm)].length === DISALLOW.length,
    'a second copy of that list is a second thing to keep in step'
  );
  check(
    '6. /login is not disallowed',
    !robots.includes('Disallow: /login'),
    'it is a public address somebody may arrive at from a search'
  );
  check(
    '7. switched off, it says so in words',
    robotsBody({ indexing: false, site }).includes('Disallow: /') &&
      robotsBody({ indexing: false, site }).includes('scripts/discovery.js'),
    'not built, switched off and working are different claims, and curl should say which'
  );

  /* --- sitemap.xml -------------------------------------------------------- */

  check(
    '8. a gated path throws rather than being dropped',
    (() => {
      try {
        sitemapXml({ site, paths: ['/', '/staff/admin/daily-run'] });
        return false;
      } catch {
        return true;
      }
    })(),
    'a sitemap that quietly omits what it was asked for is a sitemap nobody can check'
  );

  const xml = sitemapXml({
    site,
    paths: ['/', '/portal', '/portal/applying'],
    lastmod: { '/portal': '2026-09-03' },
  });

  check('9. every public path is listed', ['/portal', '/portal/applying'].every((path) =>
    xml.includes(`<loc>${site}${path}</loc>`)
  ));
  check(
    '10. a page with no date carries no lastmod',
    [...xml.matchAll(/<lastmod>/g)].length === 1,
    'a value that could not be established is absent and never a number'
  );
  check(
    '11. no changefreq and no priority',
    !xml.includes('changefreq') && !xml.includes('priority'),
    'a field nobody reads is a field that goes stale without anybody finding out'
  );

  /* --- llms.txt ----------------------------------------------------------- */

  const llms = llmsTxt({
    site,
    home: { path: '/', title: 'Careers@GFTV documentation', summary: 'The guides.' },
    sections: [
      { title: 'Using the portal', pages: [{ path: '/portal', title: 'Using the portal', summary: null }] },
    ],
  });

  check('12. it opens with the format\'s summary line', llms.split('\n')[2].startsWith('> '));
  check(
    '13. a page with no summary is listed by title alone',
    llms.includes(`- [Using the portal](${site}/portal)\n`),
    'inventing a line of description is the one thing a generated file must never do'
  );
  check(
    '14. it names no gated address',
    !/\(https:\/\/[^)]*\/staff/.test(llms),
    'a model told the staff guides exist is fine; one handed their addresses is not'
  );

  /* --- What the build actually wrote -------------------------------------- */

  const dist = join(DOCS, 'dist');
  if (!existsSync(join(dist, 'robots.txt'))) {
    skip('15. the three files are in dist/', 'run node scripts/build.js first');
    return;
  }

  for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    check(`15. dist/${file} was written`, existsSync(join(dist, file)));
  }

  const builtSitemap = read(join(dist, 'sitemap.xml'));
  check(
    '16. nothing gated reached the built sitemap',
    !builtSitemap.includes('/staff'),
    'the list is the pages the build wrote as static files, and a gated page never is one'
  );
  check(
    '17. every public page is in it',
    [...builtSitemap.matchAll(/<loc>/g)].length ===
      [...read(join(dist, 'sw.js')).matchAll(/^ {2}'\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?',$/gm)].length,
    'the sitemap and the precache list are the same set of pages, counted two ways'
  );

  check(
    '18. neither file is also sitting in public/',
    !existsSync(join(DOCS, 'public/robots.txt')) && !existsSync(join(DOCS, 'public/sitemap.xml')),
    'public/ is copied into dist/ before these are written, so a hand written copy ' +
      'would look edited and be overwritten'
  );
});

define('translations', 'Part 9: the 华文 tree, the two tables, and what serves them', async () => {
  const { loadTranslations, localesOnDisk, fileForPage, BASE_LOCALE } = await import(
    `file://${join(DOCS, 'scripts/translations.js')}`
  );
  const { TABLES, REQUIRED } = await import(`file://${join(DOCS, 'scripts/db.js')}`);
  const { loadPages } = await import(`file://${join(DOCS, 'api/_lib/pages.js')}`);

  const build = read(join(DOCS, 'scripts/build.js'));
  const content = read(join(DOCS, 'api/content.js'));
  const nav = read(join(DOCS, 'api/nav.js'));
  const searchIndex = read(join(DOCS, 'api/search-index.js'));
  const generated = read(join(DOCS, 'api/_lib/generated.js'));
  const shell = read(join(DOCS, 'assets/js/shell.js'));
  const worker = read(join(DOCS, 'sw.js'));
  const migration = read(join(REPO, 'migrations/042_docs_translations.sql'));
  const portalLib = read(join(MAIN, 'api/_lib/supabase.js'));
  const docsEn = JSON.parse(read(join(DOCS, 'assets/i18n/en.json')));
  const docsZh = JSON.parse(read(join(DOCS, 'assets/i18n/zh.json')));

  /* --- The tree, against the pages it claims to translate ---------------- */

  const { pages } = loadPages({ fresh: true });
  const tree = loadTranslations({ root: DOCS });

  check(
    '1. the translation tree loads with no problems',
    tree.problems.length === 0,
    tree.problems.join('; ')
  );

  check(
    '2. every locale with a tree has a dictionary beside it',
    tree.locales.every((locale) => localesOnDisk(DOCS).includes(locale)),
    `trees: ${tree.locales.join(', ') || 'none'}; dictionaries: ${localesOnDisk(DOCS).join(', ')}`
  );

  // **The count is the whole point of the part.** 16f made the site bilingual,
  // staff half included, so a page nobody has translated is a page a 华文
  // reader gets in English. That is allowed, and it is worth counting out loud.
  check(
    `3. every page is translated into every language on disk (${tree.rows.length} files, ${tree.missing.length} not)`,
    tree.missing.length === 0,
    tree.missing.map((row) => `${row.locale} ${row.path}`).slice(0, 8).join(', ')
  );

  check(
    '4. every translation is ready, so every one of them is served',
    tree.rows.every((row) => row.ready),
    tree.rows.filter((row) => !row.ready).map((row) => row.where).join(', ')
  );

  // The file name a page's translation has to carry. Derived from the loader
  // and never written down, so a page renamed in the English tree renames its
  // translation's expected path with it.
  const expected = new Set();
  for (const locale of tree.locales) {
    for (const page of pages.values()) expected.add(fileForPage(page, locale));
  }
  check(
    '5. every translation file is named for the page it translates',
    tree.rows.every((row) => expected.has(row.where)),
    tree.rows.filter((row) => !expected.has(row.where)).map((row) => row.where).join(', ')
  );

  check(
    '6. no translation carries an access key, so the tier is decided once',
    tree.rows.every((row) => !read(row.file).match(/^access:/m)),
    '16e: the access key stays in the English file and is never anywhere else'
  );

  /* --- The two tables ----------------------------------------------------- */

  // **Two copies of two table names, compared.** scripts/db.js cannot import
  // `T` from api/_lib/supabase.js, because that module builds a Supabase client
  // at import time and the build exists to avoid that dependency. So the names
  // are written twice and this is what stops them drifting.
  check(
    '7. the build writes the tables api/_lib/supabase.js names',
    portalLib.includes(`docsTranslations: '${TABLES.translations}'`) &&
      portalLib.includes(`docsPages: '${TABLES.pages}'`),
    `db.js says ${TABLES.translations} and ${TABLES.pages}`
  );

  check(
    '8. migration 042 creates both tables and the view over them',
    migration.includes(`create table if not exists ${TABLES.translations}`) &&
      migration.includes(`create table if not exists ${TABLES.pages}`) &&
      migration.includes('create or replace view gftvjobs_docs_public'),
    'the tables and the one thing outside Vercel that may read a page'
  );

  // 16e's leak, spelled as a constraint. The build refuses first; this refuses
  // after it, and the two failures are different sizes.
  check(
    '9. the mirror refuses a gated page at the database',
    migration.includes('gftvjobs_docs_pages_public_only') &&
      migration.includes("page_path <> '/staff' and page_path not like '/staff/%'"),
    'a gated page in gftvjobs_docs_pages is the admin guide on Telegram'
  );

  check(
    '10. the view is an inner join, which is what keeps a gated page out of it',
    /join\s+gftvjobs_docs_translations\s+t\s+on\s+t\.page_path\s*=\s*p\.page_path/.test(migration) &&
      migration.includes('where t.is_ready'),
    'written as a left join it would carry every gated page with null English beside it'
  );

  check(
    '11. the view is revoked from anon and authenticated, per migration 035',
    migration.includes('security_invoker = true') &&
      migration.includes('revoke all on gftvjobs_docs_public from anon, authenticated'),
    'a view runs as its owner, so the row level security under it does not apply'
  );

  /* --- The build ---------------------------------------------------------- */

  check(
    '12. the build refuses a gated page in the mirror before the database does',
    build.includes('a gated page reached the Supabase mirror'),
    'the loop is one continue away from being wrong'
  );

  check(
    '13. the build fails loudly with no credentials, and names the escape hatch',
    build.includes('This build needs the database') &&
      build.includes('--no-database') &&
      REQUIRED.every((name) => build.includes(name) || read(join(DOCS, 'scripts/db.js')).includes(name)),
    '16e: a build that cannot reach Supabase must fail loudly'
  );

  check(
    '14. --no-database is refused on Vercel',
    build.includes('--no-database is refused on Vercel') && build.includes('onVercel()'),
    'a deployment is where nobody sees the banner'
  );

  check(
    '15. the build upserts before it deletes',
    build.indexOf('await upsert(TABLES.translations') < build.indexOf('selectColumns(TABLES.translations'),
    'the other order has a window where a renamed page is in the table under neither name'
  );

  check(
    "16. a translation's date comes from git and is never now()",
    build.includes('updated_at: dates.get(repoPath(row.file)) ?? null'),
    'a row claiming to change on every deploy gives every page a date that moves on its own'
  );

  /* --- What the build wrote ----------------------------------------------- */

  for (const locale of tree.locales) {
    check(
      `17. dist/search-index.${locale}.json was written`,
      existsSync(join(DIST, `search-index.${locale}.json`)),
      'one static index per language, and the English keeps its own name'
    );

    const localised = JSON.parse(read(join(DIST, `search-index.${locale}.json`)));
    const english = JSON.parse(read(join(DIST, 'search-index.json')));
    check(
      `18. the ${locale} index holds every page the English one does`,
      localised.length === english.length,
      `${localised.length} against ${english.length}: an untranslated page is in it in English`
    );

    const home = localised.find((entry) => entry.path === '/');
    const homeEnglish = english.find((entry) => entry.path === '/');
    check(
      `19. the ${locale} index is actually in ${locale}`,
      Boolean(home) && home.title !== homeEnglish.title,
      'a localised index carrying the English titles is an index nobody can search'
    );

    for (const tier of ['poster', 'admin', 'developer']) {
      check(
        `20. api/_generated/search-${tier}.${locale}.json was written`,
        existsSync(join(DOCS, `api/_generated/search-${tier}.${locale}.json`)),
        'the gated indexes are split by tier first and by language second'
      );
    }
  }

  check(
    '21. the worker precaches every language index',
    tree.locales.every((locale) =>
      read(join(DIST, 'sw.js')).includes(`'/search-index.${locale}.json'`)
    ),
    'a reader offline who changes language is the case this is for'
  );

  /* --- The routes --------------------------------------------------------- */

  check(
    '22. the content route applies the gate before the language',
    content.indexOf('readablePage(path, tier)') < content.indexOf('localeParam(req.query?.locale)'),
    'a title lookup that ran first could put a page back into an answer the gate took out'
  );

  check(
    '23. the content route says which language it actually answered in',
    content.includes('locale: translated ? locale : BASE_LOCALE') &&
      content.includes('asked_locale:'),
    'the notice is drawn off what was served and never off what the reader chose'
  );

  check(
    '24. a blank body is not a translated page',
    content.includes('const translated = Boolean(mine?.body)'),
    "3a: a 华文 title over an English body is the half translated page ready exists to prevent"
  );

  check(
    '25. the nav route filters by tier before it swaps any title',
    nav.indexOf('navFor(tier)') < nav.indexOf('titlesFor(locale)') ||
      nav.includes('localiseNav(navFor(tier), await titlesFor(locale))'),
    'what is in the tree is the tier; what it is called is the language'
  );

  check(
    '26. the search index route passes the locale through to the generated files',
    searchIndex.includes('gatedIndexFor(tier, locale)') &&
      generated.includes('search-${tier}.${locale}.json'),
    'the tier chooses the set of files and the language chooses which copy of each'
  );

  check(
    '27. a missing localised gated index falls back to the English one',
    generated.includes('required: false') && generated.includes('required: true'),
    'a missing English index is still the loud failure; a missing localised one is not'
  );

  // Code lines only. The file's own comments say it never throws, and a check
  // that read those would pass on a file that had stopped being true.
  const readPath = read(join(DOCS, 'api/_lib/docs-translations.js'))
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  check(
    '28. every read path fails to English and never throws',
    readPath.some((line) => line.includes('return out;')) &&
      !readPath.some((line) => /\bthrow\b/.test(line)),
    'a database that cannot be reached costs a reader their language and nothing else'
  );

  /* --- The shell ---------------------------------------------------------- */

  check(
    '29. an English reader sends no locale parameter at all',
    shell.includes('locale === DEFAULT_LOCALE ? null : locale'),
    'English is the base row, so the address a signed out reader fetches is unchanged'
  );

  check(
    '30. the prerendered English article is kept for a reader who switches back',
    shell.includes('prerendered ??= article.innerHTML'),
    'switching to 华文 replaces the article, and switching back has nothing to fetch'
  );

  check(
    '31. the language notice is redrawn on every draw and not only on a change',
    shell.includes('drawLanguageNotice') &&
      shell.includes("article.querySelector('[data-language-notice]')?.remove()"),
    'a notice left behind says a page is English while it is read in 华文'
  );

  check(
    '32. the search index is thrown away when the language changes',
    shell.includes('forgetIndex()'),
    'the next keystroke has to reach for the right language'
  );

  check(
    '33. the guide is redrawn on a language change',
    shell.includes('const { headings } = await drawPage(next)'),
    'the comment this replaced said there was nothing to fetch, which was true until there was'
  );

  /* --- The notice, in both dictionaries ----------------------------------- */

  for (const key of ['page.englishOnlyLabel', 'page.englishOnlyBody']) {
    check(
      `34. ${key} is in both dictionaries`,
      typeof docsEn[key] === 'string' && typeof docsZh[key] === 'string',
      '3a: a page with no translation falls back to English with a notice'
    );
  }

  check(
    '35. the notice is a callout and adds no CSS of its own',
    shell.includes('class="docs-callout" data-callout="note"'),
    'the renderer already draws four of them and docs.css already styles them'
  );

  /* --- The worker --------------------------------------------------------- */

  check(
    '36. the worker matches a localised search index',
    worker.includes('SEARCH_INDEX') &&
      /search-index\(\\\.\[a-z\]\{2,3\}/.test(worker.replace(/\\\\/g, '\\')),
    'both are build output and both are precached'
  );

  check(
    '37. VERSION moved with this part',
    worker.includes("careers-gftv-docs-phase14-v5"),
    'the rule is one bump per change to the site, and this part changed the shell'
  );

  /* --- The English half the part had to correct --------------------------- */

  check(
    '38. the staff index no longer says these guides are English only',
    !read(join(DOCS, 'api/_content/index.md')).includes('These guides are in English today'),
    'part 9 is what made that sentence untrue, so part 9 is what takes it out'
  );

  check(
    "39. 3a no longer says the staff half of the docs site stays English",
    read(join(REPO, 'careers-gftv-spec.md')).includes(
      'That was overruled by 16f on 3 September 2026 and built by phase 14 part 9'
    ),
    '3a and 16f cannot be left saying opposite things about the same pages'
  );

  check(
    '40. the base locale is the same word in both halves of the code',
    BASE_LOCALE === 'en' &&
      read(join(DOCS, 'api/_lib/docs-translations.js')).includes("BASE_LOCALE = 'en'"),
    'the tree loader and the read path have to agree what English is'
  );

  /* --- The four concerns, answered after the part was written ------------- */

  // **The portal's own rule, applied to the one element that arrives late.**
  // shell.html's pre-paint script holds the whole document while the dictionary
  // loads and releases it after 1200ms whatever happens; a public article now
  // takes the same hold and the same valve, because the alternative is a 华文
  // reader watching English be replaced.
  const docsCss = read(join(DOCS, 'assets/css/docs.css'));
  const shellHtml = read(join(DOCS, 'shell.html'));

  check(
    '41. a public article is hidden until its translation arrives',
    docsCss.includes('.docs-article[data-awaiting-translation]') &&
      docsCss.includes('visibility: hidden') &&
      shell.includes("article.setAttribute('data-awaiting-translation', '')"),
    'the portal hides the page until the swap, and this is the same technique'
  );

  check(
    '42. the hold has a release valve, at the portal\'s own 1200ms',
    shell.includes('setTimeout(reveal, 1200)') && shellHtml.includes('}, 1200);'),
    'a translation that never arrives must not leave somebody looking at nothing'
  );

  check(
    '43. the valve is cleared and the article revealed on every path out',
    (shell.match(/reveal\(\)/g) ?? []).length >= 2 && shell.includes('clearTimeout(valve)'),
    'the untranslated branch and the drawn branch both have to release it'
  );

  // A translated page has two dates. The site takes the later of the two and so
  // does the view, which is what stops one page being dated twice.
  const updated = existsSync(join(DOCS, 'api/_generated/updated.json'))
    ? JSON.parse(read(join(DOCS, 'api/_generated/updated.json')))
    : {};

  // **Predicted while the tree is uncommitted, and it is not a defect.** The
  // dates come from git, and a file git has never seen carries none on purpose
  // — the same rule phase 13's check 24 states about a page. So this skips
  // until the translations are pushed and asserts from then on, which is the
  // shape that stops it being ignored the day it starts mattering.
  const anyDated = tree.locales.some((locale) =>
    tree.rows.some((row) => Object.hasOwn(updated, `${locale}:${row.path}`))
  );

  if (!anyDated) {
    skip(
      "44. the build writes each translation's own date under its own key",
      'git has not dated the translation tree yet, which is what an uncommitted ' +
        'file looks like. It asserts once the tree is pushed.'
    );
  } else {
    check(
      "44. the build writes each translation's own date under its own key",
      tree.locales.every((locale) =>
        tree.rows.every(
          (row) => row.locale !== locale || Object.hasOwn(updated, `${locale}:${row.path}`)
        )
      ),
      'a page path always opens with a slash, so a locale prefix cannot collide with one'
    );
  }

  check(
    '45. the site takes the later of a translated page\'s two dates',
    generated.includes('return translated > base ? translated : base;') &&
      content.includes('updatedFor(found.page.path, translated ? locale : null)'),
    'a guide written in March whose 华文 moved in September changed in September'
  );

  check(
    '46. the view applies the same rule, so the bot cannot disagree',
    migration.includes('greatest(p.updated_at, t.updated_at)'),
    'one page, one date, whichever of the two readers is asking'
  );

  // Detection was offered for a translation going stale and was not taken, so
  // the reminder is the deliverable. A habit nobody wrote down is not one.
  check(
    '47. editing a page reminds you to check its translations',
    read(join(DOCS, 'README.md')).includes('Check its translations in the same change') &&
      read(join(DOCS, 'api/_content/developer/conventions.md')).includes(
        'Check the translations when you edit a page'
      ),
    'the README section somebody edits from, and the conventions page'
  );

  check(
    '48. the reminder is in 华文 as well, on the page that carries it',
    read(join(DOCS, 'translations/zh/staff/developer/conventions.md')).includes(
      '编辑页面时，请一并检查它的翻译'
    ),
    'a guide about keeping translations current, untranslated, would be the joke telling itself'
  );
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
