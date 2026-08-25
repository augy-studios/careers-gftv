// Phase 9 verification run, from next-steps.md section 2, "How to verify it".
//
//   node phase9-test.mjs                       everything that can run
//   node phase9-test.mjs --only=formcheck      one or more sections
//   BASE=https://... node phase9-test.mjs      against a preview deployment
//
// Copied from phase8-test.mjs rather than started over, and keeping its habits:
// a define() per section so --only= works, a detail string on every check,
// skip() rather than silence, no fixed wait after an action that makes a
// request, and the two guards added on 25 August 2026 — cleanup takes every
// posting off the board before it does anything else, and the run prints what
// it will spend against each ceiling before it starts.
//
// **Three things this phase can check that no earlier phase could**, and they
// are the reason to write the file rather than clicking through it:
//
//   1. A duplicate delivery is a 200 and one row. The unique constraint from
//      migration 008 doing its job. Send the same payload twice.
//   2. A webhook confirmation overrides a No. The only place in this build
//      where an answer a person gave is changed by something else.
//   3. The cron is idempotent. Run it twice; the second run must change nothing.
//
// **And one it cannot**: that the schedule actually fires. Only Vercel's
// dashboard says that. What this run checks instead is the thing that makes a
// dead schedule visible without going there — the last-run panel on /admin.
//
// **This run triggers the real daily maintenance against the real site.** That
// is not a side effect to apologise for: it is what the endpoint is for, it is
// idempotent, and running it by hand is the documented way to test it. But it
// does mean that a posting somewhere on the board whose closing date has passed
// will be closed a few hours earlier than the schedule would have closed it,
// and that expired sessions will be swept. Both are correct. Neither is
// reversible. Run `--only=formcheck` if that is not wanted: that section talks
// to nothing.

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';

/**
 * A required environment variable.
 *
 * No default, deliberately. A staff password with a fallback in a committed
 * file is a staff password in the repository, whatever the fallback is for.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}. See tests/README.md.`);
    process.exit(1);
  }
  return value;
}

const STAFF = {
  username: requireEnv('STAFF_USER'),
  password: requireEnv('STAFF_PASS'),
};

/**
 * The two shared secrets, optional and loudly missing.
 *
 * Neither has a fallback and neither can be derived: they are the whole of what
 * authenticates the two endpoints this phase added. Without them the run still
 * checks the refusals — that a caller with no secret is turned away is itself
 * one of the more important checks here — and skips everything past them with a
 * line saying which variable to set.
 */
const WEBHOOK_SECRET = process.env.FORM_WEBHOOK_SECRET ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

const DEFAULT_APPLICANT_PASS = 'correct horse battery staple 9';

const STAMP = Date.now();

const REUSE_APPLICANT = process.env.APPLICANT_USER ?? '';
const APPLICANT = {
  username: REUSE_APPLICANT || `smoke-p9-${STAMP}`.slice(0, 24),
  display_name: `Smoke P9 ${STAMP}`,
  email: `smoke-p9-${STAMP}@example.invalid`,
  password: process.env.APPLICANT_PASS ?? DEFAULT_APPLICANT_PASS,
};

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

function short(value, max = 200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'undefined';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* -------------------------------------------------------------------------
 * Request helpers
 * ---------------------------------------------------------------------- */

let firstRateLimit = null;

function noteRateLimit(path, result) {
  if (result.status !== 429 || firstRateLimit) return;
  firstRateLimit = {
    path,
    retryAfter: result.json?.error?.details?.retry_after ?? null,
  };
}

async function get(ctx, path, options = {}) {
  const response = await ctx.request.get(`${BASE}${path}`, {
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    failOnStatusCode: false,
  });
  const result = await shape(response);
  noteRateLimit(path, result);
  return result;
}

async function post(ctx, path, body, options = {}) {
  const response = await ctx.request.post(`${BASE}${path}`, {
    data: body,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    failOnStatusCode: false,
  });
  const result = await shape(response);
  noteRateLimit(path, result);
  return result;
}

async function shape(response) {
  const status = response.status();
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON. The caller sees the text and decides.
  }

  return {
    status,
    json,
    text,
    headers: response.headers(),
    ok: json?.ok === true,
    data: json?.data ?? null,
    error: json?.error ?? null,
    details: json?.error?.details ?? null,
  };
}

/** Wait until the address bar settles on something matching. */
async function waitForPath(page, predicate, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const url = new URL(page.url());
    if (predicate(url)) return url;
    await page.waitForTimeout(250);
  }
  return null;
}

async function dismissApplyPrompt(page) {
  const closed = await page.evaluate(() => {
    const el = document.querySelector('#applyDialog');
    if (!el || !el.open) return false;
    el.close();
    return true;
  });
  if (closed) await page.waitForTimeout(300);
  return closed;
}

/* -------------------------------------------------------------------------
 * Sign in and fixtures
 * ---------------------------------------------------------------------- */

const created = { jobs: [], applicants: [] };

async function signInStaff(page, who = STAFF) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: 15000 });
  await page.fill('#username', who.username);
  await page.fill('#password', who.password);
  await page.click('#staffLoginForm button[type="submit"]');
  return waitForPath(page, (url) => url.pathname === '/admin');
}

/**
 * Register an applicant through the register page.
 *
 * The phase 6 rule, still true: the page generates the recovery code set and
 * the API alone does not, so a script that registers through the API is not a
 * registered user.
 */
async function registerApplicant(page, who) {
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#registerForm', { timeout: 15000 });
  await page.fill('#username', who.username);
  await page.fill('#display_name', who.display_name);
  await page.fill('#email', who.email);
  await page.fill('#password', who.password);
  await page.fill('#password_confirm', who.password);
  await page.click('#registerForm button[type="submit"]');

  await page.waitForSelector('[data-confirm]', { timeout: 30000 });
  await page.check('[data-confirm]');
  await page.click('[data-done]');

  created.applicants.push(who.username);
  return waitForPath(page, (url) => url.pathname.startsWith('/account'));
}

let smokeTagId = null;
async function ensureTag(staff) {
  if (smokeTagId) return smokeTagId;
  const list = await get(staff, '/api/admin/tags');
  smokeTagId = (list.data?.tags ?? [])[0]?.id ?? null;
  return smokeTagId;
}

/**
 * A throwaway posting, published.
 *
 * The form URL is a Google Forms address that has never existed, which is
 * deliberate and is the fixture the health check section needs: it 404s, which
 * is the one form state section 11 names that a status line can prove. Nothing
 * else in the run opens it.
 */
async function createPublishedJob(staff, overrides = {}) {
  const tagId = await ensureTag(staff);

  const made = await post(staff, '/api/admin/jobs', {
    action: 'create',
    job: {
      title: `SMOKE P9 ${STAMP} ${overrides.label ?? 'posting'}`,
      summary: 'A throwaway posting written by the phase 9 verification run.',
      description: 'First sentence of the throwaway posting. Second sentence.',
      application_form_url:
        overrides.formUrl ??
        'https://docs.google.com/forms/d/e/SMOKE-P9-NEVER-EXISTED/viewform',
      ...(overrides.job ?? {}),
    },
    ...(tagId ? { tag_ids: [tagId] } : {}),
  });

  if (!made.ok) return made;
  created.jobs.push(made.data.job.id);

  const live = await post(staff, '/api/admin/jobs', {
    action: 'status',
    id: made.data.job.id,
    status: 'published',
  });

  // A failed publish is returned as a failure, per the note phase 8 left on
  // this function: falling back to the create result made a posting that was
  // refused publication look successful, and every later check failed
  // somewhere else with a 404.
  if (!live.ok) {
    return {
      ...live,
      data: { job: made.data.job },
      error: {
        message:
          `the posting was created but not published: ${short(live.error?.message, 120)}. ` +
          'publishBlockers wants a form URL, at least one tag, and a title.',
      },
    };
  }

  return { ...live, data: { ...live.data, job: made.data.job } };
}

/** One posting's funnel, which is where a webhook confirmation shows up. */
async function funnel(staff, jobId) {
  const result = await get(staff, `/api/admin/analytics?job=${jobId}`);
  return result.ok ? result.data.job : null;
}

/** A delivery to the webhook, with whatever secret is given. */
function deliver(ctx, payload, secret = WEBHOOK_SECRET) {
  return post(ctx, '/api/webhooks/form-submit', payload, {
    headers: secret ? { 'x-portal-secret': secret } : {},
  });
}

/** Trigger the cron, with whatever secret is given. */
function runCron(ctx, secret = CRON_SECRET) {
  return post(ctx, '/api/cron/daily', {}, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

const SECTIONS = [];
function define(name, title, fn) {
  SECTIONS.push({ name, title, fn });
}

async function main() {
  console.log(`Phase 9 verification against ${BASE}`);
  console.log(`Staff: ${STAFF.username}   Applicant: ${APPLICANT.username}`);
  console.log(
    `Secrets: FORM_WEBHOOK_SECRET ${WEBHOOK_SECRET ? 'set' : 'NOT SET'}, ` +
      `CRON_SECRET ${CRON_SECRET ? 'set' : 'NOT SET'}`
  );

  // What a full run spends, said before it starts rather than discovered in the
  // middle. There is no endpoint that reports a bucket's remaining budget.
  console.log(
    '\nWhat this run spends, against ceilings that are per hour:\n' +
      '  admin        ~15 writes of 200, per staff account\n' +
      '  adminDelete  up to 2 of 10, per staff account\n' +
      '  apply        1 of 20, per applicant account\n' +
      '  formWebhook  ~6 of 120, per posting\n' +
      'Comfortably re-runnable, unlike phase 8: this phase writes little.'
  );

  if (!ONLY || ONLY.some((name) => name !== 'formcheck')) {
    console.log(
      '\nThis run triggers the REAL daily maintenance against the deployment.\n' +
        '  It will close any posting whose closing date has passed and sweep expired rows.\n' +
        '  Both are correct and neither is reversible. Use --only=formcheck to avoid it.'
    );
  }

  const browser = await chromium.launch();

  const ctx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const applicantCtx = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });
  const anon = await browser.newContext({ baseURL: BASE, locale: 'en-GB' });

  const state = { browser, ctx, applicantCtx, anon, pageErrors: [] };

  state.staffPage = await ctx.newPage();
  state.staffPage.on('pageerror', (error) =>
    state.pageErrors.push({ where: state.staffPage.url(), error: String(error) })
  );

  state.applicantPage = await applicantCtx.newPage();
  state.applicantPage.on('pageerror', (error) =>
    state.pageErrors.push({ where: state.applicantPage.url(), error: String(error) })
  );

  state.anonPage = await anon.newPage();

  try {
    for (const entry of SECTIONS) {
      if (ONLY && !ONLY.includes(entry.name)) continue;
      section(entry.title);
      try {
        await entry.fn(state);
      } catch (cause) {
        bad(`${entry.title} threw`, String(cause?.stack ?? cause));
      }
    }
  } finally {
    await cleanup(state);
    await browser.close();
  }

  report(state);
}

async function cleanup(state) {
  if (process.env.NO_CLEANUP === '1') {
    if (created.jobs.length > 0) {
      console.log(`\nLeft behind, NO_CLEANUP=1: ${created.jobs.join(' ')}`);
    }
    return;
  }

  if (!state.staffPage || created.jobs.length === 0) return;
  section('Cleanup');

  // **Off the board before anything else**, which is the guard phase 8's run of
  // 25 August 2026 bought the hard way: every step here is a write, the admin
  // bucket is per hour, and a budget that runs out halfway must not leave a
  // SMOKE posting on the live board. A leftover row is untidy; a leftover
  // posting is on the site.
  const stillUp = [];
  for (const id of [...new Set(created.jobs)]) {
    const row = await get(state.staffPage, `/api/admin/jobs?id=${id}`);
    if (!row.ok || row.data.job.status === 'draft') continue;

    const down = await post(state.staffPage, '/api/admin/jobs', {
      action: 'status',
      id,
      status: 'draft',
    });
    if (!down.ok) stillUp.push(`${row.data.job.slug} (${id}): ${short(down.error?.message, 80)}`);
  }

  if (stillUp.length > 0) {
    bad(
      `${stillUp.length} SMOKE postings are still on the board. Take them down now`,
      stillUp.join(' | ')
    );
  } else {
    ok('every posting this run made is off the board');
  }

  const left = [];
  for (const id of [...new Set(created.jobs)]) {
    if (process.env.CLEANUP === 'draft') {
      left.push(`${id}: left as a draft, CLEANUP=draft`);
      continue;
    }

    // The caller's own password, not the slug. Deviation 49, and the fault
    // section 5 item 10 records against phase 7's file.
    const gone = await post(state.staffPage, '/api/admin/jobs', {
      action: 'delete',
      id,
      password: STAFF.password,
    });

    if (gone.ok) ok(`deleted ${id}`);
    else left.push(`${id}: ${short(gone.error?.message, 80)}`);
  }

  if (left.length > 0) {
    if (process.env.CLEANUP === 'draft') {
      console.log(`  – ${left.length} postings left as drafts, off the board.`);
    } else {
      bad(`${left.length} postings could not be deleted`, left.join(' | '));
      console.log('      They are drafts, so they are off the board. Delete them by hand later.');
    }
  }

  if (created.applicants.length > 0) {
    console.log('\n  Applicant accounts this run made, per section 5 item 5:');
    for (const who of created.applicants) console.log(`      ${who}`);
  }

  // The unmatched submissions this run posted are left deliberately. They are
  // rows in a list an admin reads, all of them addressed to example.invalid and
  // all stamped, and deleting them would need a route that exists for no other
  // reason. Named here so whoever reads the list knows what they are.
  console.log(`\n  Unmatched submissions left on /admin/analytics: search for ${STAMP}.`);
}

function report(state) {
  console.log(`\n${'-'.repeat(70)}`);

  const noise = state.pageErrors.filter((entry) => /Transition was skipped/.test(entry.error));
  const real = state.pageErrors.filter((entry) => !/Transition was skipped/.test(entry.error));

  if (noise.length > 0) {
    console.log(`\n${noise.length} "Transition was skipped" rejections, which are browser noise.`);
  }
  if (real.length > 0) {
    console.log(`\nPage errors (${real.length}):`);
    for (const entry of real.slice(0, 20)) console.log(`  ${entry.where}\n    ${entry.error}`);
  }
  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const entry of failures) {
      console.log(`  [${entry.section}] ${entry.name}`);
      if (entry.detail) console.log(`      ${entry.detail}`);
    }
  }
  if (skips.length > 0) {
    console.log(`\nNot run (${skips.length}):`);
    for (const entry of skips) console.log(`  [${entry.section}] ${entry.name} — ${entry.why}`);
  }
  if (firstRateLimit) {
    console.log(
      `\nA RATE LIMIT WAS CROSSED, first at ${firstRateLimit.path}` +
        (firstRateLimit.retryAfter ? ` (retry after ${firstRateLimit.retryAfter}s)` : '') +
        '\n  Every refusal after that point may be the bucket rather than the rule.'
    );
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} not run.`);
}

/* =========================================================================
 * The form health check, on its own, with no network and no deployment.
 * ====================================================================== */

define('formcheck', 'The form health check, items 1 to 9', async () => {
  // Imported from the working tree rather than exercised through the
  // deployment, and this is the one section that can be: checkFormUrl is pure
  // apart from the fetch it is handed, which is exactly why fetchImpl is an
  // option on it. Everything below would otherwise need a Google Form in each
  // of five states, which is not a fixture anybody can maintain.
  let checkFormUrl;
  try {
    ({ checkFormUrl } = await import('../main-site/api/_lib/form-check.js'));
  } catch (cause) {
    bad('the form check module could not be imported', String(cause).slice(0, 200));
    return;
  }

  const fake = (status, body = '', url = 'https://docs.google.com/forms/d/e/x/viewform') =>
    async () => ({
      status,
      ok: status >= 200 && status < 300,
      url,
      body: null,
      text: async () => body,
    });

  const live = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(200, '<html>FB_PUBLIC_LOAD_DATA_ = [[]]</html>'),
  });
  check('1. a live form is ok', live.state === 'ok', `state=${live.state}, note=${live.note}`);

  const closed = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(200, '<html>This form is no longer accepting responses.</html>'),
  });
  check(
    '2. a closed form is a warning, not an error',
    closed.state === 'warning',
    `state=${closed.state}, note=${closed.note}`
  );

  const closedZh = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(200, '<html>此表单不再接受回复。</html>'),
  });
  check(
    '3. and in Chinese too, because the respondent\'s own Google language decides',
    closedZh.state === 'warning',
    `state=${closedZh.state}`
  );

  const gone = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(404, 'Not found'),
  });
  check('4. a deleted form is an error', gone.state === 'error', `state=${gone.state}`);

  const private_ = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(200, '<html>Sign in</html>', 'https://accounts.google.com/signin'),
  });
  check(
    '5. a form that redirects to a Google sign in is a warning',
    private_.state === 'warning',
    `state=${private_.state}, note=${private_.note}`
  );

  // The rule the whole file is shaped around, and the one worth a check of its
  // own: a page that loads and matches nothing must leave the stored state
  // alone rather than claiming ok. This is what makes a Google wording change
  // degrade to "no new information" instead of turning every closed form green.
  const unknown = await checkFormUrl('https://example.invalid/form', {
    fetchImpl: fake(200, '<html>something else entirely</html>', 'https://example.invalid/form'),
  });
  check(
    '6. an unrecognisable page learns nothing and writes nothing',
    unknown.state === null,
    `state=${unknown.state}, note=${unknown.note}`
  );

  const upstream = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: fake(503, 'busy'),
  });
  check(
    '7. Google having an outage is not a fact about the form',
    upstream.state === null,
    `state=${upstream.state}`
  );

  const refused = await checkFormUrl('https://docs.google.com/forms/d/e/x/viewform', {
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  check(
    '8. a refused connection learns nothing either',
    refused.state === null,
    `state=${refused.state}, note=${refused.note}`
  );

  const notUrl = await checkFormUrl('not a url at all', { fetchImpl: fake(200) });
  check(
    '9. an address nothing could ever load is an error',
    notUrl.state === 'error',
    `state=${notUrl.state}`
  );
});

/* =========================================================================
 * Setup.
 * ====================================================================== */

define('setup', 'Setup, items 10 to 13', async (state) => {
  const landed = await signInStaff(state.staffPage);
  check('10. staff sign in reaches /admin', landed !== null, `at ${state.staffPage.url()}`);

  await dismissApplyPrompt(state.staffPage);

  const me = await get(state.staffPage, '/api/admin/me');
  state.isAdmin = me.data?.staff?.is_admin === true;
  check('11. the role is known', me.ok, short(me.text, 160));

  if (REUSE_APPLICANT) {
    await state.applicantPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await state.applicantPage.waitForSelector('#loginForm', { timeout: 15000 });
    await state.applicantPage.fill('#identifier', APPLICANT.username);
    await state.applicantPage.fill('#password', APPLICANT.password);
    await state.applicantPage.click('#loginForm button[type="submit"]');
    await waitForPath(state.applicantPage, (url) => url.pathname.startsWith('/account'));
    skip('12. applicant registration', `reusing ${APPLICANT.username}, per APPLICANT_USER.`);
  } else {
    const registered = await registerApplicant(state.applicantPage, APPLICANT);
    check(
      '12. an applicant registers through the register page',
      registered !== null,
      `at ${state.applicantPage.url()}`
    );
  }

  const session = await get(state.applicantPage, '/api/auth/applicant/session');
  state.applicantId = session.data?.user?.id ?? null;
  // The address the webhook will match on. Read back from the session rather
  // than assumed, because a reused account has whatever address it was
  // registered with and not the one this run composed.
  state.applicantEmail = session.data?.user?.email ?? APPLICANT.email;
  check(
    '13. the applicant\'s address is known, which is what the webhook matches on',
    Boolean(state.applicantEmail),
    short(session.text, 160)
  );

  const job = await createPublishedJob(state.staffPage, { label: 'webhook' });
  state.jobId = job.data?.job?.id ?? null;
  check('13. a throwaway posting is published', job.ok, short(job.error?.message, 200));
});

/* =========================================================================
 * The webhook, section 13.
 * ====================================================================== */

define('webhook', 'The submission webhook, section 13, items 14 to 28', async (state) => {
  if (!state.jobId) {
    skip('14 to 28', 'setup did not leave a posting to deliver against.');
    return;
  }

  const payload = () => ({
    job_id: state.jobId,
    form_response_id: `smoke-p9-${STAMP}-${Math.random().toString(36).slice(2, 8)}`,
    email: state.applicantEmail,
    submitted_at: new Date().toISOString(),
  });

  /* Step 1, the secret. -------------------------------------------------- */

  // The most important refusal in the phase. /api/webhooks/form-submit is a
  // public URL like any other and everything behind it is a write.
  const noSecret = await post(state.anonPage, '/api/webhooks/form-submit', payload());
  check(
    '14. a delivery carrying no secret is refused',
    noSecret.status === 401,
    `answered ${noSecret.status}: ${short(noSecret.text, 160)}`
  );

  const wrongSecret = await deliver(state.anonPage, payload(), 'not-the-secret');
  check(
    '15. and so is a wrong one',
    wrongSecret.status === 401,
    `answered ${wrongSecret.status}`
  );

  // GET is not a thing this endpoint does, and HEAD is deliberately not
  // alongside it: everything here is a write.
  const wrongMethod = await get(state.anonPage, '/api/webhooks/form-submit');
  check(
    '16. GET is refused with an Allow header naming POST',
    wrongMethod.status === 405 && /POST/.test(wrongMethod.headers.allow ?? ''),
    `status ${wrongMethod.status}, Allow: ${wrongMethod.headers.allow}`
  );

  if (!WEBHOOK_SECRET) {
    skip(
      '17 to 28',
      'FORM_WEBHOOK_SECRET is not set, so nothing past the refusals can be delivered. ' +
        'Take the value from the Vercel project settings.'
    );
    return;
  }

  /* Step 2, validation. -------------------------------------------------- */

  const malformed = await deliver(state.anonPage, {
    job_id: 'not-a-uuid',
    form_response_id: '',
    email: 'not an address',
    submitted_at: 'the day before yesterday',
  });
  check(
    '17. a malformed payload is a 400 naming every bad field',
    malformed.status === 400 &&
      malformed.details?.job_id &&
      malformed.details?.form_response_id &&
      malformed.details?.email &&
      malformed.details?.submitted_at,
    `status ${malformed.status}, details ${short(malformed.details)}`
  );

  // A form with no email question can never match anybody, so an empty address
  // is a validation failure rather than a row nobody could ever resolve.
  const noEmail = await deliver(state.anonPage, { ...payload(), email: '' });
  check(
    '18. a delivery with no email address is refused rather than left unmatched',
    noEmail.status === 400,
    `status ${noEmail.status}: ${short(noEmail.text, 160)}`
  );

  // A JOB_ID left pointing at a deleted posting is the ordinary setup mistake,
  // and the one thing in the response somebody setting up a form will read.
  const noPosting = await deliver(state.anonPage, {
    ...payload(),
    job_id: '00000000-0000-4000-8000-000000000000',
  });
  check(
    '19. a JOB_ID naming no posting is a 200 that says so',
    noPosting.status === 200 && noPosting.data?.reason === 'no_such_posting',
    `status ${noPosting.status}: ${short(noPosting.text, 200)}`
  );

  /* Steps 3 to 5, the confirmation. -------------------------------------- */

  const before = await funnel(state.staffPage, state.jobId);

  // The applicant clicks Apply, which is what creates the analytics row the
  // webhook will later override.
  const started = await post(state.applicantPage, '/api/applications/start', {
    job_id: state.jobId,
  });
  check('20. the applicant is handed over to the form', started.ok, short(started.text, 200));

  const analyticsId = started.data?.analytics_id ?? started.data?.pending_id ?? null;

  // And answers No, which is the answer the webhook has to be able to overrule.
  if (analyticsId) {
    const saidNo = await post(state.applicantPage, '/api/applications/respond', {
      analytics_id: analyticsId,
      answer: 'no',
    });
    check(
      '21. and answers No, which the funnel records as a real No',
      saidNo.ok && saidNo.data?.did_apply === false,
      short(saidNo.text, 200)
    );
  } else {
    skip('21. the applicant answers No', `no analytics id came back: ${short(started.data)}`);
  }

  const afterNo = await funnel(state.staffPage, state.jobId);
  check(
    '22. the funnel counts the No and no Yes',
    afterNo && afterNo.answered_yes === (before?.answered_yes ?? 0),
    `answered_yes ${afterNo?.answered_yes}, answered_no ${afterNo?.answered_no}`
  );

  // **Check 2 of the three.** The only place in this build where an answer a
  // person gave is changed by something else.
  const confirming = payload();
  const delivered = await deliver(state.anonPage, confirming);
  check(
    '23. a matched delivery is recorded',
    delivered.status === 200 && delivered.data?.recorded === true && delivered.data?.matched === true,
    `status ${delivered.status}: ${short(delivered.text, 200)}`
  );
  check(
    '24. and it says out loud that it overrode a No',
    delivered.data?.overrode === 'no',
    `overrode=${delivered.data?.overrode}. This is the one override in the build and it must be legible.`
  );

  const afterWebhook = await funnel(state.staffPage, state.jobId);
  check(
    '25. the funnel now counts a Yes, attributed to the webhook and not the applicant',
    afterWebhook &&
      afterWebhook.answered_yes === (afterNo?.answered_yes ?? 0) + 1 &&
      afterWebhook.yes_by_source.webhook === (afterNo?.yes_by_source.webhook ?? 0) + 1,
    `answered_yes ${afterWebhook?.answered_yes}, by source ${short(afterWebhook?.yes_by_source)}`
  );

  const mine = await get(state.applicantPage, '/api/applications/mine');
  const row = (mine.data?.applications ?? []).find((entry) => entry.job_id === state.jobId);
  check(
    '26. and the applicant\'s tracking row moved to submitted',
    row?.status === 'submitted',
    `status=${row?.status}, applied_at=${row?.applied_at}`
  );

  /* Step 3, the duplicate. ----------------------------------------------- */

  // **Check 1 of the three.** The unique constraint from migration 008 doing
  // its job: the same response id twice is a 200 and one row, not an error and
  // not a second cooldown.
  const again = await deliver(state.anonPage, confirming);
  check(
    '27. the same delivery a second time is a 200 saying duplicate',
    again.status === 200 && again.data?.duplicate === true,
    `status ${again.status}: ${short(again.text, 200)}`
  );

  const afterDuplicate = await funnel(state.staffPage, state.jobId);
  check(
    '27. and it changed nothing',
    afterDuplicate &&
      afterDuplicate.answered_yes === afterWebhook?.answered_yes &&
      afterDuplicate.yes_by_source.webhook === afterWebhook?.yes_by_source.webhook,
    `answered_yes ${afterDuplicate?.answered_yes} vs ${afterWebhook?.answered_yes}`
  );

  /* Step 6, the unmatched list. ------------------------------------------ */

  const stranger = await deliver(state.anonPage, {
    ...payload(),
    email: `nobody-${STAMP}@example.invalid`,
  });
  check(
    '28. a delivery from an address no account uses is recorded and unmatched',
    stranger.status === 200 && stranger.data?.recorded === true && stranger.data?.matched === false,
    `status ${stranger.status}: ${short(stranger.text, 200)}`
  );

  const unmatched = await get(state.staffPage, '/api/admin/submissions');
  if (state.isAdmin) {
    check(
      '28. and it appears on the unmatched list an admin works through',
      unmatched.ok &&
        (unmatched.data?.unmatched ?? []).some((entry) =>
          entry.email.includes(`nobody-${STAMP}`)
        ),
      short(unmatched.text, 200)
    );
  } else {
    check(
      '28. and the unmatched list refuses a job poster, because every row is an email address',
      unmatched.status === 403,
      `status ${unmatched.status}: ${short(unmatched.text, 160)}`
    );
  }
});

/* =========================================================================
 * The cron, section 11.
 * ====================================================================== */

define('cron', 'The daily maintenance run, section 11, items 29 to 40', async (state) => {
  /* The secret. ---------------------------------------------------------- */

  const noSecret = await post(state.anonPage, '/api/cron/daily', {});
  check(
    '29. a run carrying no secret is refused',
    noSecret.status === 401,
    `answered ${noSecret.status}: ${short(noSecret.text, 160)}. ` +
      'Vercel sends nothing when CRON_SECRET is unset, so an absent header must never mean "this is the scheduler".'
  );

  const wrongSecret = await runCron(state.anonPage, 'not-the-secret');
  check('30. and so is a wrong one', wrongSecret.status === 401, `answered ${wrongSecret.status}`);

  // HEAD is deliberately absent here, unlike everywhere else in this API.
  // Everything this route does is a write, and a link checker sending HEAD must
  // not run a maintenance pass.
  const head = await state.anonPage.request.head(`${BASE}/api/cron/daily`, {
    failOnStatusCode: false,
  });
  check(
    '31. HEAD is refused, unlike every read route in this build',
    head.status() === 405,
    `answered ${head.status()}`
  );

  if (!CRON_SECRET) {
    skip(
      '32 to 40',
      'CRON_SECRET is not set, so no run can be triggered. Take the value from the Vercel project settings.'
    );
    return;
  }

  /* A posting that has to close. ----------------------------------------- */

  const expiring = await createPublishedJob(state.staffPage, { label: 'expiring' });
  const openEnded = await createPublishedJob(state.staffPage, { label: 'open ended' });

  if (!expiring.ok || !openEnded.ok) {
    skip('32 to 40', `the fixtures could not be published: ${short(expiring.error?.message)}`);
    return;
  }

  const expiringId = expiring.data.job.id;
  const openEndedId = openEnded.data.job.id;

  // Backdated after publishing, because publishing with a date already in the
  // past is not something an admin would ever be asked to do and is not what is
  // being checked. What is being checked is a posting whose date passes while
  // it is live, which is every posting eventually.
  // `update`, and the fields nest under `job`. checkPayload reads
  // body.job, so a closes_at at the top level is silently ignored and the
  // posting keeps whatever date it had — which would make the whole section
  // pass for the wrong reason.
  const backdated = await post(state.staffPage, '/api/admin/jobs', {
    action: 'update',
    id: expiringId,
    job: { closes_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
  });
  check('32. a published posting is backdated past its closing date', backdated.ok, short(backdated.text, 200));

  /* The run. ------------------------------------------------------------- */

  const first = await runCron(state.anonPage);
  check(
    '33. a run with the right secret is a 200',
    first.status === 200 && first.data?.ran === true,
    `status ${first.status}: ${short(first.text, 300)}`
  );
  check(
    '34. and every task completed',
    first.data?.ok === true,
    `failed tasks: ${short(first.data?.failed)}. results: ${short(first.data?.results, 300)}`
  );

  const closedNow = await get(state.staffPage, `/api/admin/jobs?id=${expiringId}`);
  check(
    '35. the posting past its closing date was closed',
    closedNow.data?.job?.status === 'closed',
    `status=${closedNow.data?.job?.status}`
  );

  // Section 11 says so outright, and 8.1 has drawn a badge for exactly these
  // since phase 7, so the interface has been promising it for a month.
  const stillOpen = await get(state.staffPage, `/api/admin/jobs?id=${openEndedId}`);
  check(
    '36. a posting with no closing date was left alone',
    stillOpen.data?.job?.status === 'published',
    `status=${stillOpen.data?.job?.status}. Open until filled is a real state and never auto-closes.`
  );

  // The health check writes columns admin-jobs.js has been reading since phase
  // 7. The form URL on these fixtures has never existed, so it 404s.
  check(
    '37. the form health check flagged a posting whose form does not exist',
    stillOpen.data?.job?.form_check_state === 'error' ||
      closedNow.data?.job?.form_check_state === 'error',
    `open-ended=${stillOpen.data?.job?.form_check_state}, ` +
      `closed=${closedNow.data?.job?.form_check_state}. ` +
      'Only published postings are checked, so the closed one may not have been reached.'
  );

  /* Idempotency. --------------------------------------------------------- */

  // **Check 3 of the three.** Running it twice must change nothing the second
  // time. The audit rows are written from the rows the update actually
  // returned, so "closed nothing" and "wrote no audit rows" are the same fact,
  // and the run record is the only place a script can read either.
  const second = await runCron(state.anonPage);
  check(
    '38. a second run straight after closes nothing',
    second.data?.results?.auto_closed === 0,
    `auto_closed=${second.data?.results?.auto_closed}. ` +
      'The audit rows follow the closed rows, so a second run writing none depends on this being zero.'
  );
  check(
    '38. and gives up on no prompts',
    second.data?.results?.prompts_timed_out === 0,
    `prompts_timed_out=${second.data?.results?.prompts_timed_out}`
  );

  skip(
    '39. that no audit row was written by the second run',
    'nothing in the API exposes gftvjobs_audit_log for a system actor. Confirm with:\n' +
      "        select action, actor_label, created_at from gftvjobs_audit_log\n" +
      "        where actor_realm = 'system' order by created_at desc limit 10;"
  );

  /* The record. ---------------------------------------------------------- */

  const stats = await get(state.staffPage, '/api/admin/stats');
  const run = stats.data?.cron?.run ?? null;

  check(
    '40. the overview carries the last run, and says whether it could be read at all',
    stats.data?.cron?.readable === true && run !== null,
    `cron=${short(stats.data?.cron, 240)}. ` +
      'readable false means the query failed, which is not the same claim as "it has never run".'
  );
  check(
    '40. and the run it carries is finished and successful',
    run?.finished_at && run?.ok === true,
    `started_at=${run?.started_at}, finished_at=${run?.finished_at}, ok=${run?.ok}`
  );
});

/* =========================================================================
 * The two panels.
 * ====================================================================== */

define('panel', 'The overview and editor panels, items 41 to 46', async (state) => {
  await state.staffPage.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await dismissApplyPrompt(state.staffPage);

  const panel = await state.staffPage
    .waitForSelector('#adminCronRun', { timeout: 20000 })
    .then(() => state.staffPage.textContent('#adminCronRun'))
    .catch(() => null);

  check(
    '41. the overview draws a maintenance panel',
    typeof panel === 'string' && panel.trim() !== '',
    `panel text: ${short(panel, 200)}`
  );

  // The whole reason the panel exists: a cron has no reader, so the one thing
  // it must never do is look the same when it is working and when it has
  // stopped. An empty box is exactly that failure.
  check(
    '42. and the panel says something rather than sitting empty',
    typeof panel === 'string' && panel.replace(/\s+/g, ' ').trim().length > 20,
    `panel text: ${short(panel, 200)}`
  );

  const tone = await state.staffPage
    .getAttribute('#adminCronRun', 'class')
    .catch(() => null);
  check(
    '43. the panel is not drawing an error after a successful run',
    typeof tone === 'string' && !tone.includes('error'),
    `class=${tone}`
  );

  if (state.isAdmin) {
    await state.staffPage.goto(`${BASE}/admin/analytics`, { waitUntil: 'domcontentloaded' });
    const shown = await state.staffPage
      .waitForSelector('#unmatchedSection:not([hidden])', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check('44. the analytics page shows the unmatched list to an admin', shown, `at ${state.staffPage.url()}`);
  } else {
    skip('44. the unmatched list', 'this staff account is a job poster, and the panel is admins only.');
  }

  /* The editor help, section 13's last setup line. ------------------------ */

  if (!state.jobId) {
    skip('45 and 46. the editor help text', 'setup did not leave a posting to open.');
    return;
  }

  await state.staffPage.goto(`${BASE}/admin/jobs/edit?id=${state.jobId}`, {
    waitUntil: 'domcontentloaded',
  });

  const help = await state.staffPage
    .waitForSelector('.field-help', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    '45. the editor carries the webhook checklist beside the form URL field',
    help,
    'Section 13: "Put this checklist in the admin job editor as collapsible help text."'
  );

  const idShown = await state.staffPage
    .textContent('#jobIdForScript')
    .catch(() => null);
  check(
    '46. and shows the posting id, so nobody retypes one out of the address bar',
    idShown?.trim() === state.jobId,
    `shown=${short(idShown, 80)}, expected=${state.jobId}`
  );
});

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
