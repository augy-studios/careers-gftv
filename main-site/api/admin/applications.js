// /api/admin/applications
//
// Section 8.3, applicant tracking.
//
//   GET  ?id=<uuid>          one row, with its timeline and the tasks on it
//   GET  ?job=&status=&from=&until=&q=&sort=&page=   the list, with bucket counts
//   GET  ?format=csv&...     the same filtered set as a file
//   POST { action: 'status'|'bulk_status'|'waive'|'note' }
//
// What this tracks, and the copy on the page says so too: who was handed over
// to which form, not the answers themselves. Those stay in Google Forms and
// each posting links out to its response sheet.
//
// The three rules from 21 August 2026 are enforced in api/_lib/admin-applications.js
// rather than here, and this route's job is the two that are about the request:
//
//   **A decision needs a message.** Accepting and rejecting both raise a notice
//   task, per 7g, and the poster writes it. There is no template, so a request
//   that moves somebody to accepted or rejected without one is refused rather
//   than quietly making the change and telling nobody. A rejection is the one
//   message on this site most worth writing properly.
//
//   **A multi-recipient change confirms who first.** 8.5's rule for bulk
//   invites, applied here for the same reason: this reaches real people, and
//   each task is frozen the moment it is written. The client shows exactly who
//   will receive it; this refuses a bulk decision that does not name the same
//   count the caller was shown.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText, localeFromRequest } from '../_lib/validate.js';
import { isUuid, params, pageRange, enumParam } from '../_lib/admin.js';
import { isInCooldown } from '../_lib/settings.js';
import { readAnswers } from '../_lib/questions.js';
import { openTasksFor, tasksForApplicant } from '../_lib/admin-tasks.js';
import {
  APPLICATION_STATUSES,
  APPLICATION_SORTS,
  DECISION_STATUSES,
  listApplications,
  bucketCounts,
  adminApplicationRow,
  changeStatus,
  waiveCooldown,
  raiseDecisionNotice,
  statusHistory,
  fetchApplicationRow,
  applicationsCsv,
} from '../_lib/admin-applications.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

/** The most rows one bulk change may touch. A screenful, not a table. */
const MAX_BULK = 50;

const NOTE_MAX = 2000;
const MESSAGE_TITLE_MAX = 200;
const MESSAGE_BODY_MAX = 5000;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin applications');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

function filtersFrom(search) {
  const jobId = search.get('job');
  const from = search.get('from');
  const until = search.get('until');

  return {
    jobId: isUuid(jobId ?? '') ? jobId : null,
    status: enumParam(search, 'status', APPLICATION_STATUSES),
    // Dates arrive as YYYY-MM-DD from a date input. Anything unparseable is
    // dropped rather than refused: a filter is a narrowing, and the honest
    // answer to a broken one is the unfiltered list rather than an error.
    from: parseDate(from, 'start'),
    until: parseDate(until, 'end'),
    q: (search.get('q') ?? '').trim().slice(0, 120) || null,
    sort: enumParam(search, 'sort', APPLICATION_SORTS),
  };
}

function parseDate(value, edge) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;

  const date = new Date(parsed);
  // A date range whose end is midnight excludes the day the reader picked,
  // which is the sort of off by one that makes somebody conclude the filter is
  // broken. The end of a range is the end of that day.
  if (edge === 'end' && !/T/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

async function read(req, res) {
  const search = params(req);
  const locale = localeFromRequest(req);
  const id = search.get('id');

  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not an application id.');

    const row = await fetchApplicationRow(id);
    if (!row) return fail(res, ERR.NOT_FOUND, 'That application could not be found.');

    const [history, tasks] = await Promise.all([
      statusHistory(id),
      tasksForApplicant(row.applicant_id, { jobId: row.job_id }),
    ]);

    return ok(res, {
      application: adminApplicationRow(row, { inCooldown: await isInCooldown(row) }),
      history,
      // Each task's answers are paired with the question they answer, per 8.3,
      // and the option labels are resolved into the admin's own language.
      tasks: tasks.map((task) => ({
        id: task.id,
        task_type: task.task_type,
        title: task.title,
        body: task.body,
        status: task.status,
        response_text: task.response_text,
        responded_at: task.responded_at,
        resolved_at: task.resolved_at,
        created_at: task.created_at,
        answers: readAnswers(task.questions, task.answers, locale),
        question_count: Array.isArray(task.questions) ? task.questions.length : 0,
      })),
    });
  }

  const filters = filtersFrom(search);

  if (search.get('format') === 'csv') {
    // The filtered set, not the page. An export that gave you twenty five rows
    // because that is what was on screen would be worse than no export.
    const { rows } = await listApplications({ ...filters, rangeFrom: 0, rangeTo: 4999 });
    const shaped = rows.map((row) => adminApplicationRow(row));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.statusCode = 200;
    // A byte order mark, so a spreadsheet opening this on a Windows machine
    // reads the Chinese display names as UTF-8 rather than as the local code
    // page. Excel still needs it and nothing else minds it.
    res.end(`﻿${applicationsCsv(shaped)}`);
    return undefined;
  }

  const { from, to, page, size } = pageRange(search, { size: 25, max: 100 });

  const [{ rows, total }, counts] = await Promise.all([
    listApplications({ ...filters, rangeFrom: from, rangeTo: to }),
    bucketCounts({ jobId: filters.jobId, from: filters.from, until: filters.until }),
  ]);

  const openTasks = await openTasksFor(rows.map((row) => row.applicant_id));

  const shaped = await Promise.all(
    rows.map(async (row) =>
      adminApplicationRow(row, {
        openTasks: (openTasks.get(row.applicant_id) ?? []).filter(
          // Only tasks about this posting, or about none. A task raised on a
          // different role is that role's row's business.
          (task) => !task.job_id || task.job_id === row.job_id
        ),
        inCooldown: await isInCooldown(row),
      })
    )
  );

  return ok(res, { applications: shaped, counts, total, page, limit: size });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['status', 'bulk_status', 'waive', 'note'];

async function write(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(res, 'admin', subjects)) return;
  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  switch (action) {
    case 'status':
      return moveOne(res, session, body, done);
    case 'bulk_status':
      return moveMany(res, session, body, done);
    case 'waive':
      return waive(res, session, body, done);
    default:
      return writeNote(res, session, body, done);
  }
}

/**
 * The note and the decision message, validated once for both the single and the
 * bulk path.
 */
function checkMessage(body, status) {
  const details = {};

  const note = validateText(body.note, NOTE_MAX);
  if (!note.ok) details.note = note.code;

  let message = null;

  if (DECISION_STATUSES.includes(status)) {
    const title = validateText(body.message?.title, MESSAGE_TITLE_MAX, { required: true });
    const text = validateText(body.message?.body, MESSAGE_BODY_MAX);

    if (!title.ok) details['message.title'] = title.code;
    if (!text.ok) details['message.body'] = text.code;

    if (title.ok && text.ok) message = { title: title.value, body: text.value };
  }

  return { note: note.ok ? note.value : null, message, details: Object.keys(details).length ? details : null };
}

/**
 * Move one row, and raise the notice task when the move is a decision.
 *
 * The order is deliberate: the status changes first and the task is raised
 * second. A failure to raise leaves an applicant who has been rejected and not
 * told, which an admin can see on the tracking row and fix by raising one; the
 * other order would leave somebody told they had been rejected by a row that
 * still says under review.
 */
async function moveOne(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not an application id.');

  const next = String(body.status ?? '');
  if (!APPLICATION_STATUSES.includes(next)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a status an application can be in.', {
      details: { status: FIELD.INVALID },
    });
  }

  const checked = checkMessage(body, next);
  if (checked.details) {
    return fail(
      res,
      ERR.BAD_REQUEST,
      DECISION_STATUSES.includes(next)
        ? 'Write the message this applicant will read.'
        : 'That change could not be saved.',
      { details: checked.details }
    );
  }

  const application = await fetchApplicationRow(id);
  if (!application) return fail(res, ERR.NOT_FOUND, 'That application could not be found.');

  if (application.status === next) {
    // Not an error, and not a write either. An event row whose from and to are
    // the same status is noise in a log an admin reads to understand what
    // happened, which is the rule startApplication already keeps.
    return ok(res, { id, status: next, unchanged: true });
  }

  const updated = await changeStatus(application, next, checked.note, session.user);

  let task = null;
  if (checked.message) {
    task = await raiseDecisionNotice(application, checked.message, session.user);
  }

  await auditStaff(
    session.user,
    AUDIT.APPLICATION_STATUS_CHANGED,
    {
      from: application.status,
      to: next,
      applicant: application.applicant?.username ?? null,
      job: application.job?.title ?? null,
      notified: Boolean(task),
    },
    { targetTable: 'gftvjobs_applications', targetId: id }
  );

  await done();
  return ok(res, { id, status: updated.status, task_id: task?.id ?? null });
}

/**
 * Move several rows at once, per 8.3's bulk status change.
 *
 * confirm_count is the client saying how many people it showed the admin. A
 * mismatch means the list moved underneath them, which is exactly the case
 * 8.5's confirmation step exists for, so it is refused rather than applied to
 * whatever is there now.
 */
async function moveMany(res, session, body, done) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => isUuid(id)) : [];

  if (ids.length === 0) return fail(res, ERR.BAD_REQUEST, 'Nothing was selected.');
  if (ids.length > MAX_BULK) {
    return fail(res, ERR.BAD_REQUEST, `That is more than ${MAX_BULK} rows at once.`, {
      details: { ids: FIELD.TOO_LONG },
    });
  }

  const next = String(body.status ?? '');
  if (!APPLICATION_STATUSES.includes(next)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a status an application can be in.', {
      details: { status: FIELD.INVALID },
    });
  }

  if (Number(body.confirm_count) !== ids.length) {
    return fail(res, ERR.CONFLICT, 'Confirm who this will reach before sending it.', {
      details: { confirm_count: FIELD.MISMATCH, expected: ids.length },
    });
  }

  const checked = checkMessage(body, next);
  if (checked.details) {
    return fail(res, ERR.BAD_REQUEST, 'Write the message these applicants will read.', {
      details: checked.details,
    });
  }

  const moved = [];
  const skipped = [];

  // One at a time rather than one update over an id list, because each row
  // needs its own event row naming where it came from, and its own task. A
  // single update would lose both.
  for (const id of ids) {
    const application = await fetchApplicationRow(id);
    if (!application || application.status === next) {
      skipped.push(id);
      continue;
    }

    await changeStatus(application, next, checked.note, session.user);
    if (checked.message) {
      await raiseDecisionNotice(application, checked.message, session.user);
    }
    moved.push(id);
  }

  await auditStaff(
    session.user,
    AUDIT.APPLICATION_STATUS_CHANGED,
    { to: next, moved: moved.length, skipped: skipped.length, bulk: true },
    { targetTable: 'gftvjobs_applications', targetId: null }
  );

  await done();
  return ok(res, { moved, skipped, status: next });
}

/**
 * Waive an active cooldown on one row, per 7f.
 *
 * The one thing this deliberately does not do is change the status. A waive
 * says "you may apply again", not "this never happened", and 7f is explicit
 * that a status change and the cooldown are separate levers.
 */
async function waive(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not an application id.');

  const note = validateText(body.note, NOTE_MAX);
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That note is too long.', { details: { note: note.code } });
  }

  const application = await fetchApplicationRow(id);
  if (!application) return fail(res, ERR.NOT_FOUND, 'That application could not be found.');

  if (!application.cooldown_until) {
    return fail(res, ERR.CONFLICT, 'There is no cooldown on this application to waive.');
  }

  const updated = await waiveCooldown(application, session.user, note.value);

  await auditStaff(
    session.user,
    AUDIT.COOLDOWN_WAIVED,
    {
      applicant: application.applicant?.username ?? null,
      job: application.job?.title ?? null,
      was_until: application.cooldown_until,
    },
    { targetTable: 'gftvjobs_applications', targetId: id }
  );

  await done();
  return ok(res, { id, cooldown_until: updated.cooldown_until });
}

/**
 * The admin's running note on a row, changed without a status change.
 *
 * No event row: migration 006's history is a status history, and an event whose
 * from and to are the same status with a note attached would make the timeline
 * unreadable. The note is on the row, with its own updated_at.
 */
async function writeNote(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not an application id.');

  const note = validateText(body.note, NOTE_MAX);
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That note is too long.', { details: { note: note.code } });
  }

  const { data, error } = await supabase
    .from(T.applications)
    .update({ admin_note: note.value })
    .eq('id', id)
    .select('id, admin_note, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) return fail(res, ERR.NOT_FOUND, 'That application could not be found.');

  await done();
  return ok(res, { id, admin_note: data.admin_note });
}
