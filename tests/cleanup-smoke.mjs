// Delete the postings a verification run left behind.
//
//   STAFF_USER=... STAFF_PASS='...' node tests/cleanup-smoke.mjs
//   node tests/cleanup-smoke.mjs --dry-run
//
// A full run makes more postings than the ten an hour deletion budget allows it
// to remove, per section 8.2, so this exists to finish the job in the next hour
// rather than leaving somebody to click through /admin/jobs.
//
// It only ever touches postings whose title starts with the prefix below, and
// it takes each one off the board before deleting it, so a partial run still
// leaves nothing published.

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://careers.globalfurry.tv';
// The current phase's prefix. Override it to clear an older one's leftovers:
// PREFIX='SMOKE P7' node tests/cleanup-smoke.mjs
const PREFIX = process.env.PREFIX ?? 'SMOKE P8';
const DRY_RUN = process.argv.includes('--dry-run');


/** A required environment variable. No default: a staff password with a
    fallback in a committed file is a staff password in the repository. */
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

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#staffLoginForm', { timeout: 20000 });
  await page.fill('#username', STAFF.username);
  await page.fill('#password', STAFF.password);
  await page.click('#staffLoginForm button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 20000 });

  const json = async (path, body) => {
    const response = body
      ? await page.request.post(`${BASE}${path}`, {
          data: body,
          headers: { 'Content-Type': 'application/json' },
          failOnStatusCode: false,
        })
      : await page.request.get(`${BASE}${path}`, {
          headers: { Accept: 'application/json' },
          failOnStatusCode: false,
        });
    const text = await response.text();
    try {
      return { status: response.status(), ...JSON.parse(text) };
    } catch {
      return { status: response.status(), ok: false, raw: text };
    }
  };

  const listed = await json(`/api/admin/jobs?q=${encodeURIComponent(PREFIX)}&limit=100`);
  // Contains rather than starts with. A run titles one posting after a
  // spreadsheet formula to check the CSV guard, so its title begins with `=`
  // and the prefix sits after it. startsWith left exactly that posting behind
  // on 25 August 2026, which is the one somebody would most want gone.
  const rows = (listed.data?.jobs ?? []).filter((row) => row.title.includes(PREFIX));

  console.log(`${rows.length} postings match "${PREFIX}" at ${BASE}`);
  if (rows.length === 0) process.exit(0);

  if (DRY_RUN) {
    for (const row of rows) console.log(`  ${row.status.padEnd(10)} ${row.slug}`);
    process.exit(0);
  }

  let deleted = 0;
  const left = [];

  for (const row of rows) {
    // Off the board first, always, so a budget that runs out mid list still
    // leaves nothing published.
    if (row.status !== 'draft') {
      await json('/api/admin/jobs', { action: 'status', id: row.id, status: 'draft' });
    }

    // The caller's own password, not the slug. Deviation 49 reversed deviation
    // 38 on 23 August 2026: the last step proves who is asking rather than that
    // they can read the row in front of them. This script still sent `confirm`
    // and no password until 25 August 2026, which meant **it deleted nothing**
    // and said so one posting at a time.
    const result = await json('/api/admin/jobs', {
      action: 'delete',
      id: row.id,
      password: STAFF.password,
    });

    if (result.ok) {
      deleted += 1;
      console.log(`  deleted ${row.slug}`);
    } else {
      left.push(row.slug);
      console.log(`  kept    ${row.slug} — ${result.error?.message ?? result.status}`);
    }
  }

  console.log(`\n${deleted} deleted, ${left.length} left as drafts.`);
  if (left.length > 0) {
    console.log('The deletion budget is ten an hour. Run this again in an hour for the rest.');
  }
} finally {
  await browser.close();
}
