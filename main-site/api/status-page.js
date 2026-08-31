// GET /status, rewritten here by vercel.json. Phase 12 part 7.
//
// **One address, two pages, and one derivation deciding which.** 0c gives this
// route both jobs: the phase list while the build is on, and the service status
// page once it is over. `viewFor()` in api/_lib/status.js reads
// build-status.json and answers; the last phase flipping to `shipped` is the
// switchover, and there is nothing to remember to do on the day. The two pages
// are never on screen together, which is the rule 0c states and the reason it
// gives: a page listing both what is unbuilt and what is degraded gives a
// reader two reasons a thing might not work and no way to tell which.
//
// **The static page had to be deleted for any of this to work.** Vercel matches
// the filesystem before it consults rewrites, so `main-site/status/index.html`
// would have won over the rewrite and the gate would have been decoration.
// Phase 3 learned that rule and part 5 paid it for `robots.txt`; this is the
// same move, and `--only=polish-live` and `--only=status-live` are how it is
// proved rather than assumed.
//
// **The service page reads four things and none of them is a session.** 0c:
// "Keep it readable with no JavaScript and no session, and cache it briefly at
// the edge. It is the page people load when things are going wrong, and it
// should be the cheapest page on the site."
//
// **A query that fails is a panel that says so.** Every read below is settled
// on its own and a failure leaves its panel in the "no answer" state rather
// than failing the page: the one thing this page must never do is be down
// because something it monitors is. That is the same direction
// api/public/feature-status fails in, applied to a page rather than to a
// control.

import { methodNotAllowed } from './_lib/respond.js';
import { sendHtml } from './_lib/page-shell.js';
import { supabase, T } from './_lib/supabase.js';
import { getStaffSession, hasPortalAccess } from './_lib/session.js';
import { AUDIT } from './_lib/audit.js';
import { featureOverrides, flippableFeatures, deniedFeatures } from './_lib/maintenance.js';
import {
  VIEW,
  DAYS,
  TARGET_KEYS,
  viewFor,
  uptimeFor,
  headline,
  declaredIncidents,
  observedIncidents,
  renderServiceBody,
  renderBuildBody,
  statusDocument,
} from './_lib/status.js';

/**
 * How long the edge may serve this page. Sixty seconds, with a further two
 * minutes of stale while it revalidates.
 *
 * 0c asks for a brief edge cache and the number is a judgement about what this
 * page is for. The probe writes once a minute, so a shorter window buys nothing
 * a reader could see; and a page somebody is reloading during an outage must
 * not be a page that queries four tables per reload, because the reloads arrive
 * together. **`must-revalidate` is not on it**: serving a minute old status
 * page while the origin is unwell is the correct behaviour for this route
 * specifically.
 */
const CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=120';

export default async function handler(req, res) {
  // HEAD alongside GET, per the rule phase 4 added after the phase 3 routes
  // answered 405 to a monitor. This page is the one a monitor is most likely to
  // ask about.
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  try {
    const preview = await wantsPreview(req);
    const view = viewFor({ preview });

    if (view === VIEW.build) {
      // Unchanged behaviour: the same markup, the same client module, the same
      // build-status.json behind it. Cached the way a static page was.
      return sendHtml(res, statusDocument({ view, body: renderBuildBody() }), {
        headers: { 'Cache-Control': CACHE },
      });
    }

    const model = await serviceModel();

    return sendHtml(res, statusDocument({ view, body: renderServiceBody(model) }), {
      headers: {
        // A preview belongs to the person looking at it and to nobody else. It
        // is the same URL as the public page, so anything cacheable here would
        // be a staff-only render served to the next reader. **Vary: Cookie**
        // because the two renders share an address and differ by session, which
        // is the rule api/job-page.js already follows for its private renders.
        'Cache-Control': preview ? 'private, no-store' : CACHE,
        ...(preview ? { Vary: 'Cookie' } : {}),
      },
    });
  } catch (cause) {
    return floor(res, cause);
  }
}

/**
 * The page that answers when the page cannot be built.
 *
 * **This route used to be a file that could not fail.** Part 7 made it a
 * function, and the one route whose entire job is to work while things are
 * going wrong is the wrong one to leave without a floor under it. Settled
 * 31 August 2026.
 *
 * It depends on nothing: no environment variable, no dictionary, no database,
 * no stylesheet that has to load. That is what makes it a floor rather than a
 * second thing that can break — `renderDocument` reads SITE_URL, and an unset
 * SITE_URL is one of the failures this exists to survive.
 *
 * 200 rather than 500, and that is the deliberate half: a monitor asking this
 * address wants to know the site is answering, and what a reader needs is a
 * sentence rather than a stack trace. What went wrong is in the log, where the
 * person who can fix it will look.
 */
function floor(res, cause) {
  console.error('[careers-gftv] status page:', cause);

  return sendHtml(
    res,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Status | Careers@GFTV</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1>Careers@GFTV</h1>
<p>This page could not be built just now. That is a fault in this page rather
than a report about anything else, so it says nothing either way about whether
the rest of the site is working.</p>
<p><a href="/search">Find a role</a></p>
</main>
</body>
</html>
`,
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Whether this request may see the service page early.
 *
 * **Staff only, and read only.** The hatch exists so the four panels and the
 * ninety day aggregate are exercised against real data before the flip rather
 * than on the day of it, which is the cost part 5 accepted for `/sitemap.xml`
 * and named. Anybody without a portal session gets the ordinary gate, so the
 * two pages can never both be public.
 *
 * A session lookup that throws is not a reason to fail the page: it answers
 * false and the reader gets whatever `build-status.json` says they should.
 */
async function wantsPreview(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('view') !== 'service') return false;

    const session = await getStaffSession(req);
    if (!session?.user) return false;
    return await hasPortalAccess(session.user);
  } catch (cause) {
    console.error('[careers-gftv] status preview:', cause);
    return false;
  }
}

/* -------------------------------------------------------------------------
 * The four panels
 * ---------------------------------------------------------------------- */

async function serviceModel() {
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Three reads and the overrides, and every one of them catches its own
  // failure, for the reason at the top of this file: a panel with no answer is
  // a panel that says so. None of these promises can reject, so `Promise.all`
  // cannot fail-fast one panel into taking the other three with it.
  const [overrides, days, incidents, audit] = await Promise.all([
    readOverrides(),
    readDays(since),
    readIncidents(since),
    readAudit(since),
  ]);

  const off = Object.keys(overrides);

  // **The whole of what this page knows about its own freshness.** Every
  // target's day row carries when it was last written, so the newest of them is
  // when the probe was last heard from. A page that skipped this would read an
  // absence of recorded failures as good news.
  const probeLastSeen = days.reduce((newest, row) => {
    const when = row?.last_checked_at;
    if (!when) return newest;
    return !newest || new Date(when) > new Date(newest) ? when : newest;
  }, null);

  return {
    now,
    probeLastSeen,
    headline: headline({ lastSeen: probeLastSeen, incidents, off, now }),
    components: components(overrides),
    uptime: TARGET_KEYS.map((target) => ({
      target,
      ...uptimeFor(
        days.filter((row) => row.target === target),
        { now }
      ),
    })),
    declared: declaredIncidents(audit),
    observed: observedIncidents(incidents, { now }),
  };
}

/**
 * Every flippable feature, plus the denylisted ones.
 *
 * 0c: "The denylisted features are listed too, and always as available: they
 * cannot be switched off, and omitting them would make the list look shorter
 * than the site."
 */
function components(overrides) {
  const flippable = flippableFeatures().map(({ key, phase }) => ({
    key,
    phase,
    denied: false,
    off: overrides[key]?.off === true,
    note: overrides[key]?.note ?? null,
    since: overrides[key]?.at ?? null,
    reason: null,
  }));

  const denied = deniedFeatures()
    // A denylisted feature whose phase has not shipped is not part of the site
    // yet, and listing it here would be the build page's job leaking into this
    // one.
    .filter((entry) => entry.shipped)
    .map((entry) => ({
      key: entry.key,
      phase: entry.phase ?? 99,
      denied: true,
      off: false,
      note: null,
      since: null,
      reason: entry.reason,
    }));

  return [...flippable, ...denied].sort((a, b) => a.phase - b.phase || a.key.localeCompare(b.key));
}

/* -------------------------------------------------------------------------
 * The reads
 * ---------------------------------------------------------------------- */

async function readOverrides() {
  try {
    return await featureOverrides();
  } catch (cause) {
    // The same direction the rest of the build fails in: everything reads as
    // on. A settings blip must not draw the whole site as switched off.
    console.error('[careers-gftv] status overrides:', cause);
    return {};
  }
}

/**
 * Ninety days of day rows, which is one per target per day and not one per
 * check. Migration 037 writes them that way, so this is 360 rows at most.
 */
async function readDays(since) {
  const { data, error } = await supabase
    .from(T.statusDays)
    .select('target, day, checks, failures, duration_total_ms, slowest_ms, last_checked_at')
    .gte('day', since.slice(0, 10))
    .order('day', { ascending: true });

  if (error) {
    console.error('[careers-gftv] status days:', error);
    // Empty, which draws ninety unknown days rather than ninety good ones, and
    // an unknown headline rather than a confident one.
    return [];
  }
  return data ?? [];
}

/**
 * The outages themselves, one row each.
 *
 * **An outage still open is read whenever it started**, which is why the filter
 * is on the end rather than only on the start: an incident that began before
 * this window and has never been closed is the most important row on the page,
 * and a naive `started_at >= since` would be the one query that drops it.
 */
async function readIncidents(since) {
  const { data, error } = await supabase
    .from(T.statusIncidents)
    .select('target, started_at, last_failed_at, ended_at, failures, status_code')
    .or(`started_at.gte.${since},ended_at.is.null`)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[careers-gftv] status incidents:', error);
    return [];
  }
  return data ?? [];
}

/** The declared half, from the audit rows 8.12 has written since phase 8. */
async function readAudit(since) {
  const { data, error } = await supabase
    .from(T.auditLog)
    .select('action, created_at, metadata')
    .in('action', [AUDIT.FEATURE_DISABLED, AUDIT.FEATURE_ENABLED])
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[careers-gftv] status audit:', error);
    return [];
  }
  return data ?? [];
}
