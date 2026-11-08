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

import { ok, fail, ERROR_CODES, methodNotAllowed, failInternal } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import { isUuid, parameters, pageRange, enumParameter } from '../_lib/admin.js';
import { unavailable } from '../_lib/maintenance.js';
import {
  jobFunnels,
  jobFunnel,
  funnelSeries,
  funnelCsv,
  FUNNEL_SORTS,
  SERIES_DAYS,
  RATING_MINIMUM,
  FLAG_MINIMUM_CLICKS,
  FLAG_MAXIMUM_RATE,
} from '../_lib/analytics.js';

/** The posting statuses the table can be filtered by. Matches migration 005. */
const STATUSES = Object.freeze(['draft', 'published', 'closed', 'archived']);

/** How many rows a CSV export covers. The filtered set, not the page, per 8.3. */
const EXPORT_MAXIMUM = 2000;

/**
 * The analytics page: every posting's funnel from views to confirmed
 * applications, one posting in detail with a daily chart, or the table as a CSV.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD'])) return;

  const session = await requireStaff(request, response);
  if (!session) return;

  if (await unavailable(response, 'admin_analytics')) return;

  response.setHeader('Cache-Control', 'no-store');

  try {
    const search = parameters(request);

    const jobId = search.get('job');
    if (jobId) {
      if (!isUuid(jobId))
        return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a posting id.');
      return await detail(response, jobId, search);
    }

    if (search.get('format') === 'csv') return await exportCsv(response, search);

    return await table(response, search);
  } catch (cause) {
    return failInternal(response, cause, 'admin analytics');
  }
}

/* -------------------------------------------------------------------------
 * The table
 * ---------------------------------------------------------------------- */

async function table(response, search) {
  const { from, to: rangeEnd, page, size } = pageRange(search, { size: 25, max: 100 });

  const status = enumParameter(search, 'status', STATUSES);
  let directionValue;

  if (search.get('direction') === 'asc') {
    directionValue = 'asc';
  } else {
    directionValue = 'desc';
  }

  const { rows, total, sort, direction } = await jobFunnels({
    status,
    sort: search.get('sort'),
    direction: directionValue,
    rangeFrom: from,
    rangeTo: rangeEnd,
  });

  return ok(response, {
    jobs: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    sorts: FUNNEL_SORTS,
    // What it was actually sorted by, which is not always what was asked for: an
    // unknown column falls back to `views` rather than being refused, per the
    // convention enumParameter sets across every admin route. Named here so a page
    // cannot draw an arrow on a column the server did not use, which is what
    // the run of 25 August 2026 found: the fallback was silent.
    sort,
    direction,
    // The thresholds behind the flag and the suppression travel with the
    // payload, so the page can explain a flag in the same words the server
    // used to decide it rather than repeating two numbers that might drift.
    rules: {
      rating_minimum: RATING_MINIMUM,
      flag_min_clicks: FLAG_MINIMUM_CLICKS,
      flag_max_rate: FLAG_MAXIMUM_RATE,
    },
  });
}

/* -------------------------------------------------------------------------
 * One posting
 * ---------------------------------------------------------------------- */

async function detail(response, jobId, search) {
  const days = Number(search.get('days')) || SERIES_DAYS;

  const [funnel, series] = await Promise.all([jobFunnel(jobId), funnelSeries(jobId, days)]);

  // The view covers every posting, so a miss here means the posting itself is
  // gone rather than that it has no analytics.
  if (!funnel) return fail(response, ERROR_CODES.NOT_FOUND, 'That posting could not be found.');

  return ok(response, {
    job: funnel,
    series,
    // Stated rather than implied. Migration 033 groups by UTC date, and a chart
    // whose bars are eight hours out of step with the reader's day is worse
    // than one that says which day it means.
    series_timezone: 'UTC',
    rules: {
      rating_minimum: RATING_MINIMUM,
      flag_min_clicks: FLAG_MINIMUM_CLICKS,
      flag_max_rate: FLAG_MAXIMUM_RATE,
    },
  });
}

/* -------------------------------------------------------------------------
 * The export
 * ---------------------------------------------------------------------- */

async function exportCsv(response, search) {
  // The filtered set rather than the page, the same rule 8.3's export follows.
  const status = enumParameter(search, 'status', STATUSES);

  let direction;

  if (search.get('direction') === 'asc') {
    direction = 'asc';
  } else {
    direction = 'desc';
  }

  const { rows } = await jobFunnels({
    status,
    sort: search.get('sort'),
    direction: direction,
    rangeFrom: 0,
    rangeTo: EXPORT_MAXIMUM - 1,
  });

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="analytics-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  response.statusCode = 200;
  // A byte order mark, so Excel on Windows reads the Chinese titles as UTF-8
  // rather than as the local code page. Same as 8.3's export.
  response.end(`﻿${funnelCsv(rows)}`);
  return undefined;
}
