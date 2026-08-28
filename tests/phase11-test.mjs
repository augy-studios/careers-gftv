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
    const statusFile = JSON.parse(await readFile(join(SITE, 'assets', 'build-status.json'), 'utf8'));
    await ctx.route('**/assets/build-status.json', (route) => {
      const copy = structuredClone(statusFile);
      if (shipped) {
        for (const phase of copy.phases) if (phase.number === 11) phase.status = 'shipped';
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

  const siteClaims = /'claimed'/.test(siteUnlink.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
  check(
    '30. and neither reaches into a row the drain has already claimed',
    !siteClaims,
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
