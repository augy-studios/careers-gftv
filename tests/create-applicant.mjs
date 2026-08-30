// Make the applicant account the account sections need, and give it something
// to be a list of.
//
//   node tests/create-applicant.mjs
//
// **Why this exists.** `tests/phase12-test.mjs` writes nothing at all — it
// signs in, navigates and measures — so its two account sections skip by name
// until somebody has registered `APPLICANT_USER`. They skipped for two days for
// exactly that reason. This is the one script that fills that gap, and it is
// separate from the phase file rather than inside it so the phase file's
// promise stays true.
//
// **And why it does not stop at registering.** Five of those pages are lists.
// A freshly registered account passed the whole accessibility sweep clean, and
// the moment it had an application, three saved roles and two tasks on it,
// three of the five failed the heading outline — h1 straight to h3, with the
// rows in between. An empty dashboard measures the chrome. So this saves some
// postings, applies to one, and raises two tasks where it can.
//
// Everything it creates cascades away when the account is deleted, per 7g, so
// the whole of it is undone by the danger zone in one action.
//
// Reads from .env.test:
//
//   APPLICANT_USER, APPLICANT_PASS   the account. The password has to be ten
//                                    characters or more, which is the whole of
//                                    the policy in api/_lib/password.js.
//   APPLICANT_EMAIL                  or APPLICATION_EMAIL, whichever is set.
//   STAFF_USER, STAFF_PASS           optional. Without them the two tasks are
//                                    skipped and /account/tasks stays an empty
//                                    list, which the sweep will still pass and
//                                    will still be measuring nothing.
//
// It is safe to run against an account that already exists: registration is
// reported as already taken and the content steps carry on.

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';
const USER = process.env.APPLICANT_USER;
const PASS = process.env.APPLICANT_PASS;
const EMAIL = process.env.APPLICANT_EMAIL ?? process.env.APPLICATION_EMAIL;
const STAFF_USER = process.env.STAFF_USER;
const STAFF_PASS = process.env.STAFF_PASS;

if (!USER || !PASS || !EMAIL) {
  console.error('Needs APPLICANT_USER, APPLICANT_PASS and APPLICANT_EMAIL (or APPLICATION_EMAIL).');
  process.exit(1);
}

/** Four question types, so the answer form is the widest one this build draws. */
const QUESTIONS = [
  {
    id: 'q-short',
    type: 'short_answer',
    required: true,
    label: { en: 'Which timezone are you in?', zh: '你在哪个时区？' },
  },
  { id: 'q-long', type: 'long_answer', required: false, label: { en: 'Anything else we should know?' } },
  {
    id: 'q-choice',
    type: 'choice',
    required: true,
    label: { en: 'How did you hear about us?', zh: '你从哪里听说我们的？' },
    options: [
      { value: 'discord', label: { en: 'Discord', zh: 'Discord' } },
      { value: 'friend', label: { en: 'A friend', zh: '朋友介绍' } },
    ],
  },
  {
    id: 'q-check',
    type: 'checkbox',
    required: false,
    label: { en: 'Which days can you help?', zh: '你哪几天有空？' },
    options: [
      { value: 'sat', label: { en: 'Saturday', zh: '星期六' } },
      { value: 'sun', label: { en: 'Sunday', zh: '星期日' } },
    ],
  },
];

const browser = await chromium.launch();

/* -------------------------------------------------------------------------
 * The account
 * ---------------------------------------------------------------------- */

/**
 * **Through the register page, not through the endpoint.** Phase 6's rule: the
 * page generates the recovery code set immediately after signing somebody up
 * and `api/auth/applicant/register` alone does not, so an account made by a
 * script that posts to the endpoint is sent to `/account/security?codes=none`
 * the first time it signs in — registered, but not the way a person is.
 */
async function register(page) {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#registerForm', { timeout: 20000 });
  await page.fill('#username', USER);
  await page.fill('#display_name', 'Test Applicant');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASS);
  await page.fill('#password_confirm', PASS);
  await page.click('#registerForm button[type="submit"]');

  const shown = await page
    .waitForSelector('[data-confirm]', { timeout: 25000 })
    .then(() => true)
    .catch(() => false);

  if (!shown) {
    const said = await page.evaluate(() =>
      [...document.querySelectorAll('.field-error, .form-message, .callout.danger')]
        .filter((el) => el.hidden === false)
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean)
        .join('; ')
    );
    console.log(`  not registered: ${said || 'the recovery codes never appeared'}`);
    return false;
  }

  // The done button only enables once the tick box is ticked, which is the
  // half the endpoint does not do.
  await page.check('[data-confirm]');
  await page.click('[data-done]');
  await page.waitForURL('**/account**', { timeout: 30000 });

  const landed = new URL(page.url());
  if (landed.search.includes('codes=none')) {
    console.log('  registered with no recovery codes, which is not how a person registers');
    return false;
  }
  console.log(`  registered, landed on ${landed.pathname}`);
  return true;
}

async function signIn(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { timeout: 20000 });
  await page.fill('#identifier', USER);
  await page.fill('#password', PASS);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForURL('**/account**', { timeout: 30000 });
}

/* -------------------------------------------------------------------------
 * Something to be a list of
 * ---------------------------------------------------------------------- */

async function saveSome(page, howMany) {
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForSelector('[data-save-job]', { timeout: 20000 });

  let saved = 0;
  for (const button of (await page.$$('[data-save-job]:not([disabled])')).slice(0, howMany)) {
    if ((await button.getAttribute('aria-pressed')) === 'true') {
      saved += 1;
      continue;
    }
    await button.click();
    await page.waitForTimeout(600);
    if ((await button.getAttribute('aria-pressed')) === 'true') saved += 1;
  }
  console.log(`  ${saved} postings saved`);
}

async function applyToOne(ctx, page) {
  const body = await (await page.request.get(`${BASE}/api/public/search?page_size=20`)).json();
  const job = (body?.data?.jobs ?? []).find((entry) => entry.status === 'published');
  if (!job) {
    console.log('  no published posting to apply to');
    return;
  }

  await page.goto(`/jobs/${job.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const button = await page.$('#applyButton');
  if (!button || (await button.isDisabled())) {
    console.log(`  cannot apply to "${job.title}" right now`);
    return;
  }

  // Applying opens the posting's form in a new tab, per section 5. Close it.
  ctx.on('page', async (opened) => {
    await opened.waitForLoadState('domcontentloaded').catch(() => {});
    await opened.close().catch(() => {});
  });

  await button.click();
  await page.waitForSelector('#applyDialog[open]', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#applyStar4')?.click());
  await page.waitForTimeout(400);

  const yes = await page.$('[data-answer="yes"]');
  if (yes && (await yes.isVisible())) {
    await yes.click();
    await page.waitForTimeout(1500);
  }

  const state = await page.evaluate(
    () => document.querySelector('[data-apply-state]')?.getAttribute('data-apply-state') ?? '?'
  );
  console.log(`  applied to "${job.title}", the button now reads ${state}`);
}

async function raiseTasks(ctx) {
  if (!STAFF_USER || !STAFF_PASS) {
    console.log('  no STAFF_USER, so no tasks: /account/tasks will be an empty list');
    return;
  }

  const page = await ctx.newPage();
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: 20000 });
  await page.fill('#username', STAFF_USER);
  await page.fill('#password', STAFF_PASS);
  await page.click('#staffLoginForm button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 30000 });

  const found = await page.evaluate(async (term) => {
    const response = await fetch(`/api/admin/applicants?q=${encodeURIComponent(term)}`, {
      credentials: 'same-origin',
    });
    return response.json();
  }, USER);

  const row = (found?.data?.applicants ?? []).find((entry) => entry.username === USER);
  if (!row) {
    console.log(`  no applicant matching ${USER} in the admin list`);
    await page.close();
    return;
  }

  // **Nothing is raised twice.** A rerun that piles two more tasks on every
  // time turns a fixture into a heap, and the sweep would be measuring a list
  // nobody would ever have.
  const existing = await page.evaluate(async (id) => {
    const response = await fetch(`/api/admin/tasks?applicant=${id}`, { credentials: 'same-origin' });
    const body = await response.json().catch(() => null);
    return (body?.data?.tasks ?? []).length;
  }, row.id);

  if (existing > 0) {
    console.log(`  ${existing} tasks already on this account, raising none`);
    await page.close();
    return;
  }

  const post = (payload) =>
    page.evaluate(async (body) => {
      const response = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    }, payload);

  const stamp = new Date().toISOString().slice(0, 16);

  const plain = await post({
    action: 'raise',
    applicant_ids: [row.id],
    task_type: 'info_request',
    title: `Test plain info request ${stamp}`,
    body: 'No questions on this one. It is the plain reply box.',
  });

  const asked = await post({
    action: 'raise',
    applicant_ids: [row.id],
    task_type: 'info_request',
    title: `Test question set ${stamp}`,
    body: 'Four question types, so the answer form is the widest one this build can draw.',
    questions: QUESTIONS,
  });

  console.log(`  tasks raised: plain ${plain.status}, question set ${asked.status}`);
  await page.close();
}

/* -------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------- */

const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', locale: 'en-GB' });
const page = await ctx.newPage();

try {
  console.log(`${USER} <${EMAIL}> at ${BASE}`);

  if (!(await register(page))) {
    console.log('  signing in instead, in case it already exists');
    await signIn(page);
  }

  await saveSome(page, 3);
  await applyToOne(ctx, page);
  await raiseTasks(ctx);

  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log(
    '\n' +
      (await page.evaluate(
        () => (document.querySelector('.account-summary, #main')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200)
      ))
  );
} catch (cause) {
  console.error('failed:', String(cause?.message ?? cause), 'on', page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
