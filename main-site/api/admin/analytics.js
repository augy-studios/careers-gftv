// /api/admin/analytics
//
// Section 8.4. Three answers from one route, decided by the query string:
//
//   GET                    the sortable table across every posting
//   GET ?job=<uuid>        one posting's funnel plus its daily series
//   GET ?format=csv        the same table as a file
//
// No POST. Nothing on this page changes anything, which is worth stating rather
// than leaving to be noticed: every other admin route in this build is an
// action based POST plus a GET, and this one is the exception because analytics
// is a question and not a decision.
//
// **Not admins only.** 8.4 does not restrict it, and 8.8 and 8.9 are the two
// sections the specification does mark, so the absence is deliberate rather
// than an oversight. A job poster looking at whether their own posting converts
// is exactly who this page is for. Nothing here names an applicant: the funnel
// is counts, and the one place an admin reads a person's row is 8.3.
//
// The counting is in migration 033's views, the judgements are in
// api/_lib/analytics.js, and this file parses a query string and answers.

import { ok, fail, ERR, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { isUuid, params, pageRange, enumParam } from '../_lib/admin.js';
import { unavailable } from '../_lib/maintenance.js';
import {
  jobFunnels,
  jobFunnel,
  funnelSeries,
  funnelCsv,
  FUNNEL_SORTS,
  SERIES_DAYS,
  RATING_MINIMUM,
  FLAG_MIN_CLICKS,
  FLAG_MAX_RATE,
} from '../_lib/analytics.js';

/** The posting statuses the table can be filtered by. Matches migration 005. */
const STATUSES = Object.freeze(['draft', 'published', 'closed', 'archived']);

/** How many rows a CSV export covers. The filtered set, not the page, per 8.3. */
const EXPORT_MAX = 2000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_analytics')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    const search = params(req);

    const jobId = search.get('job');
    if (jobId) {
      if (!isUuid(jobId)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');
      return await detail(res, jobId, search);
    }

    if (search.get('format') === 'csv') return await exportCsv(res, search);

    return await table(res, search);
  } catch (cause) {
    return failInternal(res, cause, 'admin analytics');
  }
}

/* -------------------------------------------------------------------------
 * The table
 * ---------------------------------------------------------------------- */

async function table(res, search) {
  const { from, to, page, size } = pageRange(search, { size: 25, max: 100 });

  const { rows, total, sort, direction } = await jobFunnels({
    status: enumParam(search, 'status', STATUSES),
    sort: search.get('sort'),
    direction: search.get('direction') === 'asc' ? 'asc' : 'desc',
    rangeFrom: from,
    rangeTo: to,
  });

  return ok(res, {
    jobs: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    sorts: FUNNEL_SORTS,
    // What it was actually sorted by, which is not always what was asked for: an
    // unknown column falls back to `views` rather than being refused, per the
    // convention enumParam sets across every admin route. Named here so a page
    // cannot draw an arrow on a column the server did not use, which is what
    // the run of 25 August 2026 found: the fallback was silent.
    sort,
    direction,
    // The thresholds behind the flag and the suppression travel with the
    // payload, so the page can explain a flag in the same words the server
    // used to decide it rather than repeating two numbers that might drift.
    rules: {
      rating_minimum: RATING_MINIMUM,
      flag_min_clicks: FLAG_MIN_CLICKS,
      flag_max_rate: FLAG_MAX_RATE,
    },
  });
}

/* -------------------------------------------------------------------------
 * One posting
 * ---------------------------------------------------------------------- */

async function detail(res, jobId, search) {
  const days = Number(search.get('days')) || SERIES_DAYS;

  const [funnel, series] = await Promise.all([jobFunnel(jobId), funnelSeries(jobId, days)]);

  // The view covers every posting, so a miss here means the posting itself is
  // gone rather than that it has no analytics.
  if (!funnel) return fail(res, ERR.NOT_FOUND, 'That posting could not be found.');

  return ok(res, {
    job: funnel,
    series,
    // Stated rather than implied. Migration 033 groups by UTC date, and a chart
    // whose bars are eight hours out of step with the reader's day is worse
    // than one that says which day it means.
    series_timezone: 'UTC',
    rules: {
      rating_minimum: RATING_MINIMUM,
      flag_min_clicks: FLAG_MIN_CLICKS,
      flag_max_rate: FLAG_MAX_RATE,
    },
  });
}

/* -------------------------------------------------------------------------
 * The export
 * ---------------------------------------------------------------------- */

async function exportCsv(res, search) {
  // The filtered set rather than the page, the same rule 8.3's export follows.
  const { rows } = await jobFunnels({
    status: enumParam(search, 'status', STATUSES),
    sort: search.get('sort'),
    direction: search.get('direction') === 'asc' ? 'asc' : 'desc',
    rangeFrom: 0,
    rangeTo: EXPORT_MAX - 1,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="analytics-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.statusCode = 200;
  // A byte order mark, so Excel on Windows reads the Chinese titles as UTF-8
  // rather than as the local code page. Same as 8.3's export.
  res.end(`﻿${funnelCsv(rows)}`);
  return undefined;
}
