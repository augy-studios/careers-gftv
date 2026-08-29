// Phase 11 verification run, the site half. From next-steps.md section 2.
//
//   node tests/phase11-test.mjs              everything
//   node tests/phase11-test.mjs --only=qr    one or more sections
//
// **This file covers the portal and not the bot.** Deviation 91 settled that
// the Python on the VPS is checked by a person against a checklist, and that
// decision stands. What is here is ordinary portal work on /account/settings,
// where the Playwright habit applies exactly as it always has.
//
// Every section needs no deployment, no credentials and no network, which is
// phase 10's arrangement kept rather than a new claim. The two riskiest pieces
// of part 2 are both checkable that way:
//
//   **The QR encoder**, written from the standard because handing a linking
//   token to an image service would hand a credential to a third party. A QR
//   with a wrong mask or a wrong interleave still looks exactly like a QR, so
//   it is decoded with jsqr, an independent implementation, and compared with
//   what went in. jsqr is a devDependency and never reaches a browser.
//
//   **The path the browser draws from it**, which is a second place the symbol
//   can be wrong. The panel section reads the `d` attribute back out of the
//   page, rebuilds the matrix from it, and decodes that. Nothing between the
//   encoder and the pixels is taken on trust.
//
// Part 3 added three sections, and the third is the one worth knowing about.
// `signin` and `twofa` are ordinary page work. **`seam` is the boundary between
// the two languages**: the bot writes a bcrypt hash in Python and the site reads
// it with bcryptjs, and the failure that would cause is a correct code refused
// at a login form with nothing in any log to explain it. It is checked against a
// hash a real Python bcrypt produced rather than against a claim that the two
// agree.

import jsQRModule from 'jsqr';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeQr } from '../main-site/api/_lib/qr.js';
// The only other module this file imports rather than reads. password.js pulls
// in bcryptjs and tokens.js and nothing else, so it can be exercised for real;
// anything reaching supabase.js requires the environment at import time, which
// is exactly what "no credentials" in the header above promises not to need.
import { verifySecret } from '../main-site/api/_lib/password.js';

const jsQR = jsQRModule.default ?? jsQRModule;

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', 'main-site');

const ONLY = (() => {
  const arg = process.argv.find((value) => value.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();

/* -------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const skips = [];
let currentSection = '';

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function bad(name, detail) {
  failed += 1;
  failures.push({ section: currentSection, name, detail });
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
}

function check(name, condition, detail) {
  if (condition) ok(name);
  else bad(name, detail);
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

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

/* -------------------------------------------------------------------------
 * Reading a QR back
 * ---------------------------------------------------------------------- */

const QUIET = 4;
const SCALE = 4;

/** Rows of '0' and '1' as an RGBA bitmap jsqr will read. */
function toImage(rows) {
  const size = rows.length;
  const side = (size + QUIET * 2) * SCALE;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (rows[y][x] !== '1') continue;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const index = (((y + QUIET) * SCALE + dy) * side + (x + QUIET) * SCALE + dx) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }

  return { data, width: side, height: side };
}

function decode(rows) {
  const image = toImage(rows);
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

/* -------------------------------------------------------------------------
 * A static server over main-site/, as phase 10's file has it
 * ---------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveRoute(pathname) {
  if (pathname === '/') return join(SITE, 'index.html');
  const bare = pathname.replace(/^\/|\/$/g, '');
  for (const candidate of [bare, `${bare}.html`, `${bare}/index.html`]) {
    const full = join(SITE, candidate);
    if (await isFile(full)) return full;
  }
  return null;
}

async function serveSite() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = await resolveRoute(url.pathname);

    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Nothing here is testing the worker, and a worker left over from the
      // phase 10 file's own runs would serve its precached copies instead of
      // the working tree. Everything is served no-store for that reason.
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
}

async function until(page, predicate, { timeout = 10000, every = 150 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (cause) {
      if (!/Execution context was destroyed|Target closed/.test(String(cause))) throw cause;
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(every);
  }
}

/* =========================================================================
 * 1. The encoder
 * ====================================================================== */

define('qr', 'The QR encoder, round tripped through an independent decoder', async () => {
  const link = `https://t.me/careersgftv_bot?start=${'A'.repeat(43)}`;

  const real = encodeQr(link);
  check('1. a real linking deep link encodes', real.rows.length === real.size, `v${real.version}`);
  check('2. and decodes back to exactly what went in', decode(real.rows) === link, decode(real.rows));

  // One per version, so the alignment patterns, the version information block
  // that only exists from version 7, and the two group block layouts at 8 and 9
  // are all exercised rather than assumed.
  const lengths = [10, 20, 40, 55, 75, 95, 115, 140, 175];
  let versions = new Set();
  let allBack = true;

  for (const length of lengths) {
    const text = 'x'.repeat(length);
    const result = encodeQr(text);
    versions.add(result.version);
    if (decode(result.rows) !== text) allBack = false;
  }

  check('3. every version from 1 to 9 is reachable', versions.size === 9, [...versions].join(', '));
  check('4. and all nine decode back to what went in', allBack);

  // The boundary between two versions is where an off by one in the capacity
  // table shows up, and nowhere else.
  const at = encodeQr('x'.repeat(84));
  const over = encodeQr('x'.repeat(85));
  check('5. the version 5 capacity boundary is where the table says', at.version === 5 && over.version === 6, `${at.version} then ${over.version}`);

  const utf8 = '国际兽视 Careers';
  check('6. multi byte text survives the round trip', decode(encodeQr(utf8).rows) === utf8);

  let refused = false;
  try {
    encodeQr('x'.repeat(181));
  } catch {
    refused = true;
  }
  check('7. more than a version 9 holds is refused rather than truncated', refused);
});

/* =========================================================================
 * 2. The panel
 * ====================================================================== */

define('panel', 'The Telegram panel on /account/settings, in a browser', async () => {
  const server = await serveSite();
  console.log(`      serving main-site at ${server.base}`);

  const browser = await chromium.launch();

  // **Service workers are blocked here, and that is load bearing.** Every page
  // on this site registers one, and a worker that has activated serves
  // /assets/build-status.json out of its own precache. Requests it answers never
  // reach page.route, so the stubbed phase list silently stopped arriving after
  // a reload and the gate check failed against a copy of the real file. Whether
  // that happened at all depended on how quickly the worker installed, which is
  // the worst kind of flake: it passed alone and failed in a full run.
  //
  // Blocking it is right rather than convenient. What the worker does is phase
  // 10's file's job, and it covers it properly there.
  const ctx = await browser.newContext({ baseURL: server.base, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  const USER = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    display_name: 'Sam Tan',
    username: 'samtan',
  };

  const TOKEN = 'A'.repeat(43);
  const URL_IN_QR = `https://t.me/careersgftv_bot?start=${TOKEN}`;

  const json = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });

  // What the fake endpoint answers. Changed between checks rather than
  // re-registering routes, which Playwright matches in reverse order and which
  // is an easy way to end up asserting against a route that never ran.
  let linkState = null;
  let telegramReachable = true;
  let shipped = false;

  try {
    await ctx.route('**/api/**', (route) => route.fulfill(json({})));
    await ctx.route('**/api/auth/applicant/session*', (route) => route.fulfill(json({ user: USER })));
    await ctx.route('**/api/translations/mine*', (route) => route.fulfill(json({ reports: [] })));

    await ctx.route('**/api/account/telegram*', async (route) => {
      if (!telegramReachable) return route.abort('failed');

      if (route.request().method() === 'GET') {
        return route.fulfill(json({ linked: linkState !== null, link: linkState }));
      }

      const body = JSON.parse(route.request().postData() ?? '{}');

      if (body.action === 'unlink') {
        linkState = null;
        return route.fulfill(json({ linked: false, removed: true, skipped: 2 }));
      }

      const qr = encodeQr(URL_IN_QR);
      return route.fulfill(
        json({
          linked: false,
          url: URL_IN_QR,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          ttlMs: 10 * 60 * 1000,
          qr: { size: qr.size, rows: qr.rows },
        })
      );
    });

    // The phase list, so the gate can be seen doing its job in both positions.
    // The status is written either way rather than only on the way up: phase 11
    // reads `shipped` in the file itself now, and a fixture that only forces the
    // shipped half would quietly stop testing the gated one.
    const statusFile = JSON.parse(await readFile(join(SITE, 'assets', 'build-status.json'), 'utf8'));
    await ctx.route('**/assets/build-status.json', (route) => {
      const copy = structuredClone(statusFile);
      for (const phase of copy.phases) {
        if (phase.number === 11) phase.status = shipped ? 'shipped' : 'building';
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(copy),
      });
    });

    /* The gate, while the phase is still building ------------------------- */

    await page.goto('/account/settings', { waitUntil: 'domcontentloaded' });
    const shown = await until(page, () => !document.querySelector('#telegramUnlinked')?.hidden);
    check('8. the section resolves to a state rather than staying blank', shown);

    const gated = await page.locator('#telegramStart');
    check(
      '9. the Link control is disabled while phase 11 has not shipped',
      await gated.isDisabled(),
      'section 0c: a control for an unshipped feature is visible, disabled, and says which phase'
    );
    check(
      '10. and says which phase it arrives in rather than why it is greyed out',
      /Phase 11/.test((await gated.getAttribute('title')) ?? ''),
      await gated.getAttribute('title')
    );

    /* With the phase shipped, the flow runs ------------------------------- */

    shipped = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await until(page, () => document.querySelector('#telegramStart')?.disabled === false);
    check('11. and is live once the phase reads shipped', await gated.isDisabled() === false);

    await gated.click();
    const drawn = await until(page, () => Boolean(document.querySelector('#telegramQr svg path')));
    check('12. asking for a code draws a QR', drawn);

    const url = await page.textContent('#telegramUrl');
    check('13. the deep link is on screen as text to copy', url === URL_IN_QR, url);
    check(
      '14. and the button opens the same link',
      (await page.getAttribute('#telegramOpen', 'href')) === URL_IN_QR
    );

    /* The drawn symbol, read back off the page ---------------------------- */

    const drawnPath = await page.getAttribute('#telegramQr svg path', 'd');
    const viewBox = await page.getAttribute('#telegramQr svg', 'viewBox');
    const side = Number((viewBox ?? '0 0 0 0').split(' ')[2]);
    const size = side - QUIET * 2;

    const rebuilt = Array.from({ length: size }, () => new Array(size).fill('0'));
    for (const [, x, y] of (drawnPath ?? '').matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      rebuilt[Number(y) - QUIET][Number(x) - QUIET] = '1';
    }
    const rows = rebuilt.map((row) => row.join(''));

    check(
      '15. what the browser actually drew decodes to the deep link',
      decode(rows) === URL_IN_QR,
      'the encoder and the path builder are two places this can be wrong, and this reads the second'
    );
    check(
      '16. drawn as one path rather than a rect per module',
      (await page.locator('#telegramQr svg path').count()) === 1
    );
    check(
      '17. on a white plate, since a transparent quiet zone does not scan on a dark theme',
      (await page.getAttribute('#telegramQr svg rect', 'fill')) === '#ffffff'
    );

    /* The flip, without a refresh ----------------------------------------- */

    linkState = {
      id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      username: 'samtan_tg',
      displayName: 'Sam',
      twofaEnabled: false,
      linkedAt: '2026-08-28T04:00:00Z',
    };

    const flipped = await until(
      page,
      () => !document.querySelector('#telegramLinked')?.hidden,
      { timeout: 15000 }
    );
    check('18. the page flips to linked while it sits there, per section 15 step 4', flipped);
    check(
      '19. and names the Telegram account it linked to',
      ((await page.textContent('#telegramLinkedLine')) ?? '').includes('@samtan_tg'),
      await page.textContent('#telegramLinkedLine')
    );
    check('20. the code panel goes when it is spent', await page.locator('#telegramCode').isHidden());

    /* Unlinking ------------------------------------------------------------ */

    await page.click('#telegramUnlink');
    const asked = await until(page, () => Boolean(document.querySelector('.danger-dialog [data-confirm]')));
    check('21. unlinking asks first', asked);
    // `.danger-dialog` and not `.modal`. The shell's own theme and language
    // dialogs are in the static markup of every page and carry `.modal`, so the
    // looser selector reads the first of those and finds a colour picker. The
    // same family of mistake as waiting for an element that was already there.
    check(
      '22. and says what it does not do, since nothing about the account changes',
      ((await page.textContent('.danger-dialog')) ?? '').includes('stays exactly as it is'),
      await page.textContent('.danger-dialog')
    );

    await page.click('.danger-dialog [data-confirm]');
    const back = await until(page, () => !document.querySelector('#telegramUnlinked')?.hidden);
    check('23. confirming returns the section to offering a link', back);

    /* The third state ------------------------------------------------------ */

    telegramReachable = false;
    await page.reload({ waitUntil: 'domcontentloaded' });
    const unknown = await until(page, () => !document.querySelector('#telegramUnknown')?.hidden);
    check(
      '24. a read that could not be made is its own state, not a No',
      unknown,
      'phase 10: saying "not linked" because we could not ask invites a linked person to link again'
    );
    check(
      '25. and neither of the two answers is shown beside it',
      (await page.locator('#telegramUnlinked').isHidden()) &&
        (await page.locator('#telegramLinked').isHidden())
    );
  } finally {
    await browser.close();
    server.close();
  }
});

/* =========================================================================
 * 3. The wiring
 * ====================================================================== */

define('wiring', 'What the two halves have to agree about', async () => {
  const sw = await readFile(join(SITE, 'sw.js'), 'utf8');
  check(
    '26. the new module is precached, like every other page module',
    sw.includes("'/assets/js/telegram-link.js'"),
    'the settings page is precached, so a module it imports and the worker does not hold is a page that half loads offline'
  );

  const markup = await readFile(join(SITE, 'account', 'settings', 'index.html'), 'utf8');
  for (const id of ['telegramStart', 'telegramRestart', 'telegramUnlink']) {
    check(
      `27. ${id} carries both reasons it can be disabled`,
      new RegExp(`id="${id}"[\\s\\S]{0,200}?data-feature="telegram_link"`).test(markup) &&
        new RegExp(`id="${id}"[\\s\\S]{0,200}?data-needs-network`).test(markup),
      'not shipped and needs a connection are different claims and never share a sentence'
    );
  }

  const en = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'en.json'), 'utf8'));
  const zh = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'zh.json'), 'utf8'));
  const added = Object.keys(en).filter((key) => key.startsWith('settings.telegram'));
  check(
    '28. every telegram string exists in both languages',
    added.length >= 20 && added.every((key) => typeof zh[key] === 'string' && zh[key].length > 0),
    `${added.length} keys`
  );

  // **The duplicated rule.** Unlinking skips queued rows and leaves claimed
  // ones alone, and that rule is written twice: once in the site's unlink and
  // once in the bot's, because they are different languages talking to one
  // table. Phase 10's lesson was that a duplicated rule needs a check that the
  // two copies still agree, and this is the cheapest form of it: both must
  // filter on queued, and neither may name claimed.
  const siteUnlink = await readFile(join(SITE, 'api', '_lib', 'telegram.js'), 'utf8');
  const botUnlink = await readFile(join(HERE, '..', 'telegram-bot', 'supabase.py'), 'utf8');

  const siteRule = /\.eq\('status', 'queued'\)/.test(siteUnlink);
  const botRule = /"status": "eq\.queued"/.test(botUnlink);
  check(
    '29. both halves skip only queued rows on an unlink',
    siteRule && botRule,
    `site ${siteRule}, bot ${botRule}`
  );

  // **Reading a claimed row is fine and writing to one is not**, which is the
  // distinction this check learned in part 4: the admin panel counts claimed
  // rows so that "waiting for the bot" and "in the bot's hands" are different
  // numbers on screen. So the rule is about statements rather than about the
  // word. Every statement naming `claimed` must be a read.
  const statements = siteUnlink
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    .split(';')
    .filter((statement) => /'claimed'/.test(statement));
  check(
    '30. and neither writes to a row the drain has already claimed',
    statements.every((statement) => !/\.update\(|\.insert\(|\.delete\(/.test(statement)),
    'a claimed row belongs to the drain, and two writers on one row is how a claim stops meaning anything'
  );
});

/* =========================================================================
 * 4. Part 3. The second step, in a browser
 * ====================================================================== */

define('signin', 'The sign in page with a Telegram code in play', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  const json = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });

  // What the password step answers. Rewritten between checks rather than
  // re-routed, for the reason the panel section gives: Playwright matches
  // routes in reverse order and a second registration is an easy way to assert
  // against one that never ran.
  let secondStep = { methods: ['telegram_code'], code_requested: true };

  async function signIn() {
    await page.fill('#identifier', 'samtan');
    await page.fill('#password', 'a-real-password');
    await page.click('#loginForm button[type=submit]');
    return until(page, () => document.querySelector('#step2')?.hidden === false);
  }

  try {
    await ctx.route('**/api/**', (route) => route.fulfill(json({})));
    await ctx.route('**/api/auth/applicant/session*', (route) => route.fulfill(json({ user: null })));
    await ctx.route('**/api/auth/applicant/login', (route) =>
      route.fulfill(
        json({
          two_factor_required: true,
          challenge: 'x'.repeat(43),
          expires_at: new Date(Date.now() + 600000).toISOString(),
          ...secondStep,
        })
      )
    );

    /* Telegram alone ------------------------------------------------------ */

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    check('31. the password step hands over to the second one', await signIn());

    check(
      '32. an account with no passkey is not shown a passkey button',
      await page.locator('#usePasskeyButton').isHidden(),
      'the button used to be shown to everybody who got this far, because a passkey was the only way to get here'
    );
    check(
      '33. and is told a code is on its way',
      await page.locator('#telegramCodeNote').isVisible()
    );
    check(
      '34. the one code field asks for either kind of code',
      ((await page.textContent('#codeFormLabel')) ?? '').includes('backup'),
      await page.textContent('#codeFormLabel')
    );
    check(
      '35. and the wording follows the language rather than the markup',
      (await page.getAttribute('#codeFormHint', 'data-i18n')) === 'auth.telegramCodeHint',
      'assigned text would snap back to the markup on the next gftv:localechange'
    );

    /* Both factors -------------------------------------------------------- */

    secondStep = { methods: ['passkey', 'telegram_code'], code_requested: true };
    await page.reload({ waitUntil: 'domcontentloaded' });
    await signIn();

    check(
      '36. an account with both is offered both',
      (await page.locator('#usePasskeyButton').isVisible()) &&
        (await page.locator('#telegramCodeNote').isVisible()),
      'part 3 added a factor rather than replacing one'
    );

    /* The push that could not be asked for --------------------------------- */

    secondStep = { methods: ['telegram_code'], code_requested: false };
    await page.reload({ waitUntil: 'domcontentloaded' });
    await signIn();

    check(
      '37. a code that was never asked for is not announced as on its way',
      await page.locator('#telegramCodeNote').isHidden(),
      'the one sentence on this page that would leave somebody waiting for nothing'
    );
    check(
      '38. and the fallback is named instead',
      ((await page.textContent('#secondStepError')) ?? '').includes('/code'),
      await page.textContent('#secondStepError')
    );

    /* A one tap link that could not be used --------------------------------- */

    await page.goto('/login?magic=wrong_browser&redirect=%2Faccount', {
      waitUntil: 'domcontentloaded',
    });
    const said = await until(
      page,
      () => !document.querySelector('#loginForm [data-form-message]')?.hidden
    );
    check('39. a refused sign in link says why on the page it lands on', said);
    check(
      '40. and the parameter is taken off the URL, so a refresh does not repeat it',
      !page.url().includes('magic=') && page.url().includes('redirect='),
      page.url()
    );
  } finally {
    await browser.close();
    server.close();
  }
});

/* =========================================================================
 * 5. Part 3. The switch, and what the two languages have to agree about
 * ====================================================================== */

define('twofa', 'Turning the second factor on, and the bcrypt seam', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  const json = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });

  const refusal = (reason, message) => ({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'bad_request', message, details: { reason } } }),
  });

  const USER = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', display_name: 'Sam Tan', username: 'samtan' };
  const link = {
    id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    username: 'samtan_tg',
    displayName: 'Sam',
    twofaEnabled: false,
    linkedAt: '2026-08-28T04:00:00Z',
  };

  let hasBackupCodes = false;

  try {
    await ctx.route('**/api/**', (route) => route.fulfill(json({})));
    await ctx.route('**/api/auth/applicant/session*', (route) => route.fulfill(json({ user: USER })));
    await ctx.route('**/api/translations/mine*', (route) => route.fulfill(json({ reports: [] })));

    await ctx.route('**/api/account/telegram*', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(json({ linked: true, link }));

      const body = JSON.parse(route.request().postData() ?? '{}');

      if (body.action === 'twofa') {
        if (body.enabled && !hasBackupCodes) {
          return route.fulfill(
            refusal('no_backup_codes', 'Generate your two factor backup codes first.')
          );
        }
        link.twofaEnabled = body.enabled === true;
        return route.fulfill(json({ linked: true, twofaEnabled: link.twofaEnabled, changed: true }));
      }

      return route.fulfill(json({ queued: true }));
    });

    // The phase has to read shipped, or the switch is disabled by the gate and
    // this section would be testing 0c rather than the switch.
    const statusFile = JSON.parse(await readFile(join(SITE, 'assets', 'build-status.json'), 'utf8'));
    await ctx.route('**/assets/build-status.json', (route) => {
      const copy = structuredClone(statusFile);
      for (const phase of copy.phases) if (phase.number === 11) phase.status = 'shipped';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(copy),
      });
    });

    await page.goto('/account/settings', { waitUntil: 'domcontentloaded' });
    await until(page, () => !document.querySelector('#telegramLinked')?.hidden);

    const toggle = page.locator('#telegramTwofaToggle');
    check('41. a linked account gets the second factor switch', await toggle.isVisible());

    await toggle.check();
    const refused = await until(
      page,
      () => !document.querySelector('#telegramTwofaError')?.hidden
    );
    check(
      '42. turning it on with no backup codes is refused by name',
      refused && ((await page.textContent('#telegramTwofaError')) ?? '').includes('backup codes'),
      await page.textContent('#telegramTwofaError')
    );
    check(
      '43. and the switch goes back rather than claiming a state the account does not have',
      (await toggle.isChecked()) === false,
      'a security control sitting where somebody left it while the account says otherwise is the worst kind of wrong'
    );

    hasBackupCodes = true;
    await toggle.check();
    const accepted = await until(
      page,
      () => document.querySelector('#telegramTwofaToggle')?.checked === true
    );
    check('44. and it stays on once the account can afford to lose Telegram', accepted);
  } finally {
    await browser.close();
    server.close();
  }
});

define('seam', 'What the site and the bot have to agree about for a code', async () => {
  // **The one thing in this phase that crosses a language boundary as data.**
  // The bot generates a login code and writes a bcrypt hash; the site reads that
  // hash with bcryptjs. Python's bcrypt writes a $2b$ prefix and bcryptjs writes
  // $2a$, and a verifier that refused the other's prefix would fail in the worst
  // possible place: a correct code rejected at a login form, with nothing in any
  // log to say why. This hash was produced by python bcrypt at cost 12 for the
  // code below, and the check is that the site's own comparison accepts it.
  const FROM_PYTHON = '$2b$12$92.xe3F42rHFHJovXSyp2evh53.WeHgRfAmuB4Aay.6SEdDEQ6gTy';

  check(
    '45. the site verifies a hash the bot wrote',
    await verifySecret('483920', FROM_PYTHON),
    'bcryptjs and python bcrypt have to read each other, or a correct code is refused at sign in'
  );
  check(
    '46. and refuses a wrong code against it',
    (await verifySecret('483921', FROM_PYTHON)) === false
  );

  // Read as text rather than imported. api/_lib/telegram.js reaches supabase.js,
  // which requires the environment at import time, and this file runs with none:
  // that is what "no credentials" in the header means.
  const site = await readFile(join(SITE, 'api', '_lib', 'telegram.js'), 'utf8');
  const bot = await readFile(join(HERE, '..', 'telegram-bot', 'supabase.py'), 'utf8');
  const handlers = await readFile(join(HERE, '..', 'telegram-bot', 'handlers.py'), 'utf8');

  const prefix = site.match(/PENDING_PREFIX = '([^']+)'/)?.[1];
  check(
    '47. the sentinel the site writes is the one the bot claims on',
    Boolean(prefix) && bot.includes(`"like.${prefix}*"`),
    `site ${prefix}, and the bot filters on ${bot.match(/"like\.[^"]+"/)?.[0]}`
  );
  check(
    '48. and it can never be mistaken for a hash',
    Boolean(prefix) && !prefix.startsWith('$2'),
    'a bcrypt hash always starts $2, which is what keeps a request and a real code apart in one column'
  );

  const siteMinutes = site.match(/CODE_TTL_MS = (\d+) \* 60 \* 1000/)?.[1];
  const botMinutes = handlers.match(/timedelta\(minutes=(\d+)\)/)?.[1];
  check(
    '49. five minutes means five minutes on both sides',
    siteMinutes === '5' && botMinutes === '5',
    `site ${siteMinutes}, bot ${botMinutes}`
  );

  const magic = await readFile(join(SITE, 'api', 'auth', 'applicant', 'magic.js'), 'utf8');
  check(
    '50. the magic link answers GET and nothing else',
    /methodNotAllowed\(req, res, \['GET'\]\)/.test(magic),
    'a HEAD here would be a request to sign somebody in with the answer thrown away'
  );

  const en = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'en.json'), 'utf8'));
  const zh = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'zh.json'), 'utf8'));
  const added = Object.keys(en).filter(
    (key) => key.startsWith('auth.magic') || key.startsWith('danger.code')
  );
  check(
    '51. every string part 3 added exists in both languages',
    added.length >= 10 && added.every((key) => typeof zh[key] === 'string' && zh[key].length > 0),
    `${added.length} keys`
  );

  // The bot's own dictionary, which check-i18n.js cannot see. strings.py checks
  // its own keys at import and the bot refuses to start on a mismatch, so this
  // is the cheap half: the two blocks that carry part 3's wording both exist.
  const strings = await readFile(join(HERE, '..', 'telegram-bot', 'strings.py'), 'utf8');
  check(
    '52. and the bot carries its code message in both as well',
    (strings.match(/"code\.message":/g) ?? []).length === 2,
    'strings.py stops the bot on a mismatch, but only for keys that reached the file at all'
  );
});

/* =========================================================================
 * 7. Part 4. The outbox panel, and what the drain has to agree with
 * ====================================================================== */

define('outbox', 'The notification queue on /admin, and the drain behind it', async () => {
  const server = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: server.base, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  const json = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });

  // What /api/admin/stats answers, swapped between visits rather than by
  // registering a second route, which Playwright matches in reverse order.
  let outbox = null;

  const baseStats = {
    postings: { draft: 0, published: 0, closed: 0, archived: 0, closing_soon: 0, no_deadline: 0, draft_without_form: 0 },
    applications_by_status: {},
    recent_applications: [],
    recent_registrations: [],
    cron: { readable: false, run: null },
  };

  const APPLICANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const summary = (over) => ({
    queued: 0,
    claimed: 0,
    failed: 0,
    skipped_recently: 0,
    sent_recently: 0,
    oldest_queued_at: null,
    recent_failures: [],
    ...over,
  });

  const read = async () => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await until(page, () => (document.querySelector('#adminOutbox')?.textContent ?? '').trim().length > 0);
    return page.evaluate(() => ({
      className: document.querySelector('#adminOutbox')?.className ?? '',
      text: document.querySelector('#adminOutbox')?.textContent ?? '',
    }));
  };

  try {
    await ctx.route('**/api/**', (route) => route.fulfill(json({})));
    await ctx.route('**/api/admin/me*', (route) =>
      route.fulfill(
        json({
          staff: { id: 'staff-1', username: 'admin', is_admin: true, is_editor: true },
          locales: [{ code: 'en', native_name: 'English', is_default: true }],
          counts: {},
        })
      )
    );
    await ctx.route('**/api/admin/stats*', (route) => route.fulfill(json({ ...baseStats, outbox })));

    /* Could not be read, which is a third state ---------------------------- */

    outbox = { readable: false, summary: null };
    let panel = await read();
    check(
      '53. an unreadable queue says so rather than reading as empty',
      panel.className.includes('warn') && /could not be read/i.test(panel.text),
      panel.text.trim()
    );

    /* Nothing has ever been queued ---------------------------------------- */

    outbox = { readable: true, summary: summary({}) };
    panel = await read();
    check(
      '54. an empty table is said plainly and is not drawn as a healthy queue',
      panel.className.includes('note') && /Nothing has been queued/i.test(panel.text),
      panel.text.trim()
    );

    /* Working -------------------------------------------------------------- */

    outbox = { readable: true, summary: summary({ sent_recently: 12, claimed: 1, skipped_recently: 3 }) };
    panel = await read();
    check(
      '55. a queue that is moving reads as a note with the day\'s count',
      panel.className.includes('note') && panel.text.includes('12'),
      panel.text.trim()
    );
    check(
      '56. and claimed is counted separately from queued',
      /being sent now/i.test(panel.text),
      'a queued row is waiting for the bot and a claimed one is in its hands'
    );

    /* Stuck ---------------------------------------------------------------- */

    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    outbox = { readable: true, summary: summary({ queued: 4, oldest_queued_at: anHourAgo }) };
    panel = await read();
    check(
      '57. a queue that has stopped moving warns that the bot may not be running',
      panel.className.includes('warn') && panel.text.includes('4'),
      panel.text.trim()
    );

    /* Failed, which outranks stuck ----------------------------------------- */

    outbox = {
      readable: true,
      summary: summary({
        queued: 4,
        failed: 2,
        oldest_queued_at: anHourAgo,
        recent_failures: [
          {
            id: 'n-1',
            kind: 'telegram_test',
            error: 'User is blocked',
            attempts: 4,
            created_at: anHourAgo,
            applicant_id: APPLICANT_ID,
          },
        ],
      }),
    };
    panel = await read();
    check(
      '58. a row that gave up is an error and outranks a slow queue',
      panel.className.includes('error') && panel.text.includes('2'),
      panel.text.trim()
    );
    check(
      '59. the failure names its kind and its error, which is what an admin acts on',
      panel.text.includes('telegram_test') && panel.text.includes('User is blocked'),
      panel.text.trim()
    );
    // /admin is open to job posters as well as admins, and deviation 57 settled
    // that a list naming applicants is the property that makes a panel admins
    // only. The route sends no applicant at all; this is the check that a
    // payload carrying one anyway never reaches the page.
    check(
      '60. and no applicant is named on it',
      !panel.text.includes(APPLICANT_ID),
      'a panel that named who was being messaged would have to be admins only'
    );
  } finally {
    await browser.close();
    server.close();
  }

  /* The two halves of the drain ------------------------------------------- */

  const site = await readFile(join(SITE, 'api', '_lib', 'telegram.js'), 'utf8');
  const drain = await readFile(join(HERE, '..', 'telegram-bot', 'outbox.py'), 'utf8');
  const migration = await readFile(
    join(HERE, '..', 'migrations', '011_telegram_and_notifications.sql'),
    'utf8'
  );

  // The kind the site queues has to be one the drain can render, because the
  // claim filters on exactly the renderers this build holds: a kind missing from
  // that dictionary is not a broken message, it is a row that is never claimed
  // at all and waits, silently, for a bot that knows it.
  const kindBlock = site.match(/export const KIND = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
  const queued = [
    // The three from part 5, named in one frozen object so a kind cannot be
    // added by typing a string at a call site, and the test message part 3
    // wrote, which is still the only kind queued from outside that object.
    ...[...kindBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]),
    ...[...site.matchAll(/kind: '([a-z_]+)'/g)].map((match) => match[1]),
  ];
  const renderable = [...drain.matchAll(/^\s{4}"([a-z_]+)": render/gm)].map((match) => match[1]);
  check(
    '61. every kind the site queues is one the drain can render',
    queued.length >= 4 && queued.every((kind) => renderable.includes(kind)),
    `site queues ${queued.join(', ')}, the drain renders ${renderable.join(', ')}`
  );

  // Migration 011 constrains the status column, and PostgREST answers a
  // violation with a 400 the drain logs and nothing else notices. Both files are
  // read rather than trusted for the same reason phase 10 checks its two copies
  // of the queue's verdict rule.
  const allowed = (migration.match(/check \(status in \(([^)]+)\)\)/)?.[1] ?? '')
    .split(',')
    .map((value) => value.trim().replace(/'/g, ''));
  const written = [...drain.matchAll(/finish\(\s*row,\s*"([a-z]+)"/g)].map((match) => match[1]);
  check(
    '62. every ending the drain writes is one the table allows',
    allowed.length === 5 && written.length > 0 && written.every((status) => allowed.includes(status)),
    `allowed ${allowed.join(', ')}, written ${[...new Set(written)].join(', ')}`
  );

  // Section 15 fixes the poll at fifteen to thirty seconds, and the number
  // matters to the panel above as well as to the bot: the staleness threshold
  // there is written against a drain that polls on that order.
  const poll = Number(drain.match(/POLL_SECONDS = ([\d.]+)/)?.[1]);
  check(
    '63. the drain polls inside the window section 15 gives it',
    poll >= 15 && poll <= 30,
    `${poll}s`
  );

  // A claim taken and never finished is the restart mid drain, and the lease is
  // the only thing that recovers it. A lease longer than the panel's staleness
  // threshold would mean the panel accusing a healthy bot of being dead.
  const lease = Number(drain.match(/LEASE_MINUTES = (\d+)/)?.[1]);
  const stale = Number(
    (await readFile(join(SITE, 'assets', 'js', 'admin-page.js'), 'utf8')).match(
      /OUTBOX_STALE_MINUTES = (\d+)/
    )?.[1]
  );
  check(
    '64. and a claim expires well before the panel calls the queue stuck',
    lease > 0 && stale > lease,
    `lease ${lease} minutes, panel warns after ${stale}`
  );

  // The claim has to be one conditional update that answers with what it moved.
  // Deviation 91 makes this a requirement rather than a preference: it is what
  // makes a double send after a restart impossible rather than unlikely, and no
  // amount of checking by hand would catch a select followed by an update.
  const supabasePy = await readFile(join(HERE, '..', 'telegram-bot', 'supabase.py'), 'utf8');
  const claim = supabasePy.match(/async def claim_notifications[\s\S]*?return rows/)?.[0] ?? '';
  check(
    '65. the claim is one conditional update and never a read followed by a write',
    /await self\.update\(/.test(claim) && !/await self\.select\(|await self\.one\(/.test(claim),
    'nothing reads then writes: the database decides which instance owns a row'
  );

  const en = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'en.json'), 'utf8'));
  const zh = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'zh.json'), 'utf8'));
  const added = Object.keys(en).filter((key) => key.startsWith('admin.outbox'));
  check(
    '66. every string part 4 added exists in both languages',
    added.length >= 11 && added.every((key) => typeof zh[key] === 'string' && zh[key].length > 0),
    `${added.length} keys`
  );
});

/* -------------------------------------------------------------------------
 * The three kinds and the toggles, part 5
 *
 * Every check here reads a file. The messages themselves are walked by a person
 * in a real chat, per deviation 91, and what a person cannot check by reading a
 * chat window is whether the two halves still describe the same three kinds:
 * the site queues into a table the bot claims from, both sides name the kinds
 * separately, and a disagreement is silent at both ends. That is what this is.
 * ---------------------------------------------------------------------- */

define('notify', 'The three notification kinds, and what can silence them', async () => {
  const site = await readFile(join(SITE, 'api', '_lib', 'telegram.js'), 'utf8');
  const tasks = await readFile(join(SITE, 'api', '_lib', 'admin-tasks.js'), 'utf8');
  const drain = await readFile(join(HERE, '..', 'telegram-bot', 'outbox.py'), 'utf8');
  const supabasePy = await readFile(join(HERE, '..', 'telegram-bot', 'supabase.py'), 'utf8');
  const strings = await readFile(join(HERE, '..', 'telegram-bot', 'strings.py'), 'utf8');
  const migration = await readFile(
    join(HERE, '..', 'migrations', '011_telegram_and_notifications.sql'),
    'utf8'
  );

  const kindBlock = site.match(/export const KIND = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
  const kinds = [...kindBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

  // Section 15 fixes the set: invite, task_raised, application_status_changed,
  // all three in the first version. Three is as much the check as the names are,
  // since a fourth queued by the site is a row an older bot never claims.
  check(
    '67. the site names exactly section 15\'s three kinds',
    kinds.length === 3 &&
      ['invite', 'task_raised', 'application_status_changed'].every((kind) => kinds.includes(kind)),
    kinds.join(', ')
  );

  // The mapping from a task type to a kind is the whole of what makes a raise
  // deliver anything, and every type gftvjobs_tasks allows has to be in it or a
  // task of that type reaches the outbox as the default and nobody meant it to.
  const mapped = [...(tasks.match(/const NOTIFY_KIND = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? '')
    .matchAll(/^\s{2}([a-z_]+):/gm)].map((match) => match[1]);
  const types = [...(
    await readFile(join(SITE, 'api', '_lib', 'tasks.js'), 'utf8')
  ).match(/TASK_TYPES = Object\.freeze\(\[([^\]]+)\]/)?.[1].matchAll(/'([a-z_]+)'/g)].map(
    (match) => match[1]
  );
  check(
    '68. every task type a task can hold is mapped to a kind',
    types.length > 0 && types.every((type) => mapped.includes(type)),
    `types ${types.join(', ')}, mapped ${mapped.join(', ')}`
  );

  // Only raiseDecisionNotice writes a notice, so mapping notice onto
  // application_status_changed is what settles "only the decision notice", 29
  // August 2026. A second writer of that type would quietly widen it.
  const notices = [...tasks.matchAll(/type: 'notice'/g)].length;
  const decisions = [
    ...(await readFile(join(SITE, 'api', '_lib', 'admin-applications.js'), 'utf8')).matchAll(
      /type: 'notice'/g
    ),
  ].length;
  check(
    '69. a notice task is raised in one place, which is what makes the kind mean one thing',
    notices === 0 && decisions === 1,
    `admin-tasks ${notices}, admin-applications ${decisions}`
  );

  // The toggle the applicant flips and the toggle the drain reads are the same
  // column or the switch does nothing, and it does nothing silently: the message
  // simply keeps arriving. One dictionary, checked against the migration that
  // created the columns.
  const columnBlock = supabasePy.match(/NOTIFY_COLUMN = \{([\s\S]*?)\}/)?.[1] ?? '';
  const toggles = Object.fromEntries(
    [...columnBlock.matchAll(/"([a-z_]+)": "([a-z_]+)"/g)].map((match) => [match[1], match[2]])
  );
  check(
    '70. every kind the site queues has a toggle the bot honours',
    kinds.every((kind) => typeof toggles[kind] === 'string'),
    Object.keys(toggles).join(', ')
  );
  check(
    '71. and every toggle column exists on the table migration 011 created',
    Object.values(toggles).length === 3 &&
      Object.values(toggles).every((column) => migration.includes(`${column}  `) || migration.includes(`${column} `)),
    Object.values(toggles).join(', ')
  );

  // Section 15: security messages are not subject to the toggles. The absence of
  // an entry is what implements that, so it is worth a check of its own rather
  // than being left as something everybody remembers.
  check(
    '72. and nothing gives the login code or the test message one',
    !Object.keys(toggles).includes('telegram_test') && !/notify_(code|login|security)/.test(supabasePy),
    'silencing a security message is what an attacker would want'
  );

  // Section 15: always include an unsubscribe hint in the footer of a
  // notification. It points at /notify, which has to be a command that answers.
  check(
    '73. every notification carries the unsubscribe hint, and the test message does not',
    /def footer\(/.test(drain) &&
      (drain.match(/\+ footer\(locale\)/g) ?? []).length === 3 &&
      /notify\.footer/.test(drain),
    'the hint belongs on the three kinds a toggle governs'
  );
  check(
    '74. and the command it names is one the bot answers',
    /"notify": handle_notify/.test(
      await readFile(join(HERE, '..', 'telegram-bot', 'handlers.py'), 'utf8')
    ),
    'a footer pointing at an unbuilt command would be worse than no footer'
  );

  // The same rule strings.py enforces at import, checked here as well because
  // this file can say which part left a gap. Both languages, every new key.
  const en = [...strings.matchAll(/"(notify\.[a-zA-Z_.]+|decline\.[a-z]+|button\.(?:viewRole|decline|openTasks|openApplications))":/g)]
    .map((match) => match[1]);
  const counts = en.reduce((into, key) => into.set(key, (into.get(key) ?? 0) + 1), new Map());
  check(
    '75. every string part 5 added exists in both languages',
    counts.size >= 20 && [...counts.values()].every((count) => count === 2),
    [...counts.entries()].filter(([, count]) => count !== 2).map(([key]) => key).join(', ')
  );
});

define('commands', 'The four list commands, and what they read from the site', async () => {
  // Part 6 is entirely bot side: no route, no page, no migration and nothing an
  // applicant clicks on the portal. So every check here reads a file, and each
  // one is a place the two halves have to agree while being deployed hours
  // apart. What a person walking the bot sees is whether a list answers; what
  // they cannot see is whether it is answering with the portal's own words.
  const BOT = join(HERE, '..', 'telegram-bot');
  const handlers = await readFile(join(BOT, 'handlers.py'), 'utf8');
  const commandList = await readFile(join(BOT, 'commands.py'), 'utf8');
  const supabasePy = await readFile(join(BOT, 'supabase.py'), 'utf8');
  const configPy = await readFile(join(BOT, 'config.py'), 'utf8');
  const strings = await readFile(join(BOT, 'strings.py'), 'utf8');

  const listed = [...commandList.matchAll(/name="([a-z]+)"/g)].map((match) => match[1]);
  const built = [
    ...(handlers.match(/HANDLERS = \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/"([a-z]+)":/g),
  ].map((match) => match[1]);

  // `start` splits the list into what answers and what does not, so this is the
  // check that part 6 emptied the second half rather than the check that the
  // wording is right: nine listed, nine built, nothing left saying it arrives in
  // a later phase.
  check(
    '76. every command the bot lists is one it now answers',
    listed.length === 9 && listed.every((name) => built.includes(name)),
    `listed ${listed.join(', ')}; built ${built.join(', ')}`
  );

  // /jobs reads the public feed rather than the postings table, settled
  // 29 August 2026. The address is the contract rather than the file behind it,
  // and vercel.json is what makes that address exist at all.
  const vercel = JSON.parse(await readFile(join(SITE, 'vercel.json'), 'utf8'));
  const feedRoute = (vercel.rewrites ?? []).find(
    (rule) => rule.source === '/api/public/jobs.json'
  );
  check(
    '77. the address the bot fetches openings from is one the site answers on',
    /\/api\/public\/jobs\.json/.test(configPy) &&
      feedRoute?.destination === '/api/public/jobs-feed',
    `rewrite ${JSON.stringify(feedRoute ?? null)}`
  );
  check(
    '78. and /jobs obeys the board\'s own switch rather than a Telegram one',
    /name="jobs",\s*\n\s*feature="job_search"/.test(commandList),
    'an admin taking the board down has to take the bot\'s copy of it down too'
  );

  // The status words. A status called one thing on /account/applications and
  // another in the chat is two answers to one question, and the chat is the one
  // nobody can check against anything.
  const [enTable, zhTable] = strings.split(/\n {4}"zh": \{/);
  const words = (table) =>
    Object.fromEntries(
      [...table.matchAll(/"application\.status\.([a-z_]+)": "([^"]*)"/g)].map((match) => [
        match[1],
        match[2],
      ])
    );
  const botEn = words(enTable);
  const botZh = words(zhTable ?? '');

  const allowed = [
    ...(
      (await readFile(join(HERE, '..', 'migrations', '006_applications_and_events.sql'), 'utf8'))
        .match(/gftvjobs_applications_status_check[\s\S]*?check \(status in \(([\s\S]*?)\)\)/)?.[1] ??
      ''
    ).matchAll(/'([a-z_]+)'/g),
  ].map((match) => match[1]);

  check(
    '79. the bot has a word for every status an application can hold',
    allowed.length === 9 && allowed.every((status) => botEn[status] && botZh[status]),
    `allowed ${allowed.join(', ')}; bot ${Object.keys(botEn).join(', ')}`
  );

  const siteEn = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'en.json'), 'utf8'));
  const siteZh = JSON.parse(await readFile(join(SITE, 'assets', 'i18n', 'zh.json'), 'utf8'));
  const differs = allowed.filter(
    (status) => botEn[status] !== siteEn[`status.${status}`] || botZh[status] !== siteZh[`status.${status}`]
  );
  check(
    '80. and every one of them is the word the portal already uses, in both languages',
    differs.length === 0,
    differs.map((status) => `${status}: ${botEn[status]} vs ${siteEn[`status.${status}`]}`).join('; ')
  );

  // What /tasks counts. 7g derives apply prompts live from gftvjobs_analytics
  // and never copies them into gftvjobs_tasks, so a count of the tasks table
  // alone is not the number the page shows. Both filters are copied into Python
  // and both are checked against the module that owns them.
  const tasksJs = await readFile(join(SITE, 'api', '_lib', 'tasks.js'), 'utf8');
  const applyJs = await readFile(join(SITE, 'api', '_lib', 'apply.js'), 'utf8');
  const siteOpen = [
    ...(tasksJs.match(/OPEN_STATUSES = Object\.freeze\(\[([^\]]+)\]/)?.[1] ?? '').matchAll(
      /'([a-z_]+)'/g
    ),
  ].map((match) => match[1]);
  const botOpen = [
    ...(supabasePy.match(/OPEN_TASK_STATUSES = \(([^)]*)\)/)?.[1] ?? '').matchAll(/"([a-z_]+)"/g),
  ].map((match) => match[1]);
  const clickEvent = applyJs.match(/APPLY_CLICK = '([a-z_]+)'/)?.[1];

  check(
    '81. the bot counts the same open statuses /account/tasks does',
    siteOpen.length === 2 && siteOpen.join() === botOpen.join(),
    `site ${siteOpen.join(', ')}; bot ${botOpen.join(', ')}`
  );
  check(
    '82. and an unanswered prompt is an apply click, never a view row',
    clickEvent && supabasePy.includes(`APPLY_CLICK = "${clickEvent}"`) &&
      /event_type.*APPLY_CLICK[\s\S]*response_state": "eq\.pending/.test(supabasePy),
    'a count that forgot the event type would report every posting somebody read'
  );

  // The invite list and the decline button have to agree about what an open
  // invitation is, or the list offers a role whose button answers "there is
  // nothing here to decline".
  const invite008 = await readFile(
    join(HERE, '..', 'migrations', '008_tasks_invites_and_submissions.sql'),
    'utf8'
  );
  const botInvite = [
    ...(supabasePy.match(/OPEN_INVITE_STATUSES = \(([^)]*)\)/)?.[1] ?? '').matchAll(/"([a-z_]+)"/g),
  ].map((match) => match[1]);
  check(
    '83. the invitations the bot lists are the ones its decline button can write',
    botInvite.join() === 'invited,seen' &&
      supabasePy.includes('"status": "in.(invited,seen)"') &&
      invite008.includes("'invited', 'seen'"),
    botInvite.join(', ')
  );

  // Five tables joined the service key's reach for this part and every one of
  // them is read only. A write would be a command that changed somebody's
  // account for asking a question, and nothing on the portal would show it.
  const written = ['jobs', 'job_translations', 'applications', 'tasks', 'analytics'].filter(
    (table) =>
      new RegExp(`(insert|update|delete)\\(\\s*"${table}"`).test(supabasePy) ||
      new RegExp(`_request\\(\\s*"(POST|PATCH|DELETE)",\\s*"${table}"`).test(supabasePy)
  );
  check(
    '84. and nothing part 6 reads is ever written to',
    written.length === 0,
    written.join(', ')
  );

  // The same rule strings.py enforces at import, checked here because this file
  // can say which part left the gap.
  const added = [
    ...strings.matchAll(
      /"(list\.[a-zA-Z]+|invites\.[a-zA-Z]+|tasks\.(?:none|one|many)|applications\.[a-zA-Z]+|application\.status\.[a-z_]+|jobs\.[a-zA-Z]+|button\.openBoard)":/g
    ),
  ].map((match) => match[1]);
  const counts = added.reduce((into, key) => into.set(key, (into.get(key) ?? 0) + 1), new Map());
  check(
    '85. every string part 6 added exists in both languages',
    counts.size >= 25 && [...counts.values()].every((count) => count === 2),
    [...counts.entries()].filter(([, count]) => count !== 2).map(([key]) => key).join(', ')
  );
});

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

async function main() {
  console.log('Phase 11 verification, the site half');
  console.log('  the bot is checked by a person, per deviation 91');
  console.log('  every section here needs no deployment, no credentials, and no network');

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
      bad(`${entry.name} threw`, String(cause?.stack ?? cause));
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
