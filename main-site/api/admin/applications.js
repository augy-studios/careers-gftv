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

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  failInternal,
  readJson,
} from '../_lib/respond.js';
import { supabase, TABLES } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { requestLocale } from '../_lib/locales.js';
import { isUuid, isAdmin, parameters, pageRange, enumParameter } from '../_lib/admin.js';
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
  deletionImpact,
  deleteApplications,
} from '../_lib/admin-applications.js';
import {
  LIMITS,
  limited,
  recordFailures,
  clearAll,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import { verifyRealmPassword } from '../_lib/accounts.js';

/** The most rows one bulk change may touch. A screenful, not a table. */
const MAXIMUM_BULK = 50;

const NOTE_MAXIMUM = 2000;
const MESSAGE_TITLE_MAXIMUM = 200;
const MESSAGE_BODY_MAXIMUM = 5000;

export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(request, response);
  if (!session) return;

  response.setHeader('Cache-Control', 'no-store');

  try {
    if (request.method === 'POST') return await write(request, response, session);
    return await read(request, response);
  } catch (cause) {
    return failInternal(response, cause, 'admin applications');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

function filtersFrom(search) {
  const jobId = search.get('job');
  const from = search.get('from');
  const until = search.get('until');

  let jobIdValue;

  if (isUuid(jobId ?? '')) {
    jobIdValue = jobId;
  } else {
    jobIdValue = null;
  }

  return {
    jobId: jobIdValue,
    status: enumParameter(search, 'status', APPLICATION_STATUSES),
    // Dates arrive as YYYY-MM-DD from a date input. Anything unparseable is
    // dropped rather than refused: a filter is a narrowing, and the honest
    // answer to a broken one is the unfiltered list rather than an error.
    from: parseDate(from, 'start'),
    until: parseDate(until, 'end'),
    q: (search.get('q') ?? '').trim().slice(0, 120) || null,
    sort: enumParameter(search, 'sort', APPLICATION_SORTS),
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

/**
 * Read the applicant tracking table, one application in detail, or the whole
 * filtered list as a CSV file.
 */
async function read(request, response) {
  const search = parameters(request);
  const locale = await requestLocale(request);
  const id = search.get('id');

  if (id) {
    if (!isUuid(id))
      return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an application id.');

    const row = await fetchApplicationRow(id);
    if (!row) return fail(response, ERROR_CODES.NOT_FOUND, 'That application could not be found.');

    const [history, tasks] = await Promise.all([
      statusHistory(id),
      tasksForApplicant(row.applicant_id, { jobId: row.job_id }),
    ]);

    return ok(response, {
      application: adminApplicationRow(row, { inCooldown: await isInCooldown(row) }),
      history,
      // Each task's answers are paired with the question they answer, per 8.3,
      // and the option labels are resolved into the admin's own language.
      tasks: tasks.map((task) => {
        const answers = readAnswers(task.questions, task.answers, locale);
        let questionCount;

        if (Array.isArray(task.questions)) {
          questionCount = task.questions.length;
        } else {
          questionCount = 0;
        }

        return {
          id: task.id,
          task_type: task.task_type,
          title: task.title,
          body: task.body,
          status: task.status,
          response_text: task.response_text,
          responded_at: task.responded_at,
          resolved_at: task.resolved_at,
          created_at: task.created_at,
          answers,
          question_count: questionCount,
        };
      }),
    });
  }

  const filters = filtersFrom(search);

  if (search.get('format') === 'csv') {
    // The filtered set, not the page. An export that gave you twenty five rows
    // because that is what was on screen would be worse than no export.
    const { rows } = await listApplications({ ...filters, rangeFrom: 0, rangeTo: 4999 });
    const shaped = rows.map((row) => adminApplicationRow(row));

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    response.statusCode = 200;
    // A byte order mark, so a spreadsheet opening this on a Windows machine
    // reads the Chinese display names as UTF-8 rather than as the local code
    // page. Excel still needs it and nothing else minds it.
    response.end(`﻿${applicationsCsv(shaped)}`);
    return undefined;
  }

  const { from, to: rangeEnd, page, size } = pageRange(search, { size: 25, max: 100 });

  const [{ rows, total, truncated }, counts] = await Promise.all([
    listApplications({ ...filters, rangeFrom: from, rangeTo: rangeEnd }),
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

  // `truncated` says the applicant box matched more people than one search
  // filters by, so the count beside it is of the capped set rather than of
  // everybody. It is only ever true when that box has something in it.
  return ok(response, { applications: shaped, counts, total, page, limit: size, truncated });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['status', 'bulk_status', 'waive', 'note', 'impact', 'bulk_delete'];

/**
 * The two that are admins only, per the decision of 23 August 2026.
 *
 * Everything else on this page is a job poster's: they work the pipeline, they
 * raise tasks, they accept and reject. Permanent deletion is not, and it is the
 * only irreversible thing this route does. 8.2 makes deleting a posting admins
 * only and 8.9 makes deleting an account admins only; a tracking row is the
 * third of the same kind, so it follows them rather than the page it sits on.
 *
 * `impact` is on the list as well, because the panel it feeds names how many
 * people are serving a cooldown they would stop serving. That is a question
 * about somebody else's account and there is no reason a poster needs the
 * answer, given the action behind it refuses them.
 */
const ADMIN_ONLY = ['impact', 'bulk_delete'];

/**
 * Change applications: one status, several at once, a note, a waived cooldown,
 * or a permanent deletion. Deleting is for admins only.
 */
async function write(request, response, session) {
  const body = await readJson(request, response);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  // The control is absent for a job poster rather than disabled, per deviation
  // 34, and this is the half that matters: a hidden button stops nobody.
  if (ADMIN_ONLY.includes(action) && !isAdmin(session.user)) {
    return fail(response, ERROR_CODES.FORBIDDEN, 'Only an admin can do that.');
  }

  // Deletion is on the tighter bucket, like a posting's and an account's. It
  // destroys history and a stolen staff session should get very few of them.
  let bucket;

  if (action === 'bulk_delete') {
    bucket = 'adminDelete';
  } else {
    bucket = 'admin';
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(response, bucket, subjects)) return;
  const done = () => recordFailures(bucket, subjects, LIMITS[bucket]);

  switch (action) {
    case 'status':
      return moveOne(response, session, body, done);
    case 'bulk_status':
      return moveMany(response, session, body, done);
    case 'waive':
      return waive(response, session, body, done);
    case 'impact':
      return impact(response, body);
    case 'bulk_delete':
      return removeMany(request, response, session, body, done);
    default:
      return writeNote(response, session, body, done);
  }
}

/**
 * The ids a bulk action was given, checked and bounded.
 *
 * Shared by the two bulk paths so the ceiling cannot drift between them: a
 * deletion must never be allowed to touch more rows in one request than a status
 * change is.
 *
 * @returns {{ ok: true, ids: string[] } | { ok: false, send: () => void }}
 */
function bulkIds(response, body) {
  let ids;

  if (Array.isArray(body.ids)) {
    ids = body.ids.filter((id) => isUuid(id));
  } else {
    ids = [];
  }

  if (ids.length === 0) {
    return {
      ok: false,
      send: () => fail(response, ERROR_CODES.BAD_REQUEST, 'Nothing was selected.'),
    };
  }

  if (ids.length > MAXIMUM_BULK) {
    return {
      ok: false,
      send: () =>
        fail(response, ERROR_CODES.BAD_REQUEST, `That is more than ${MAXIMUM_BULK} rows at once.`, {
          details: { ids: FIELD.TOO_LONG },
        }),
    };
  }

  return { ok: true, ids };
}

/**
 * The note and the decision message, validated once for both the single and the
 * bulk path.
 */
function checkMessage(body, status) {
  const details = {};

  const note = validateText(body.note, NOTE_MAXIMUM);
  if (!note.ok) details.note = note.code;

  let message = null;

  if (DECISION_STATUSES.includes(status)) {
    const title = validateText(body.message?.title, MESSAGE_TITLE_MAXIMUM, { required: true });
    const text = validateText(body.message?.body, MESSAGE_BODY_MAXIMUM);

    if (!title.ok) details['message.title'] = title.code;
    if (!text.ok) details['message.body'] = text.code;

    if (title.ok && text.ok) message = { title: title.value, body: text.value };
  }

  let noteValue;

  if (note.ok) {
    noteValue = note.value;
  } else {
    noteValue = null;
  }

  let detailsValue;

  if (Object.keys(details).length) {
    detailsValue = details;
  } else {
    detailsValue = null;
  }

  return { note: noteValue, message, details: detailsValue };
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
async function moveOne(response, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an application id.');

  const next = String(body.status ?? '');
  if (!APPLICATION_STATUSES.includes(next)) {
    return fail(
      response,
      ERROR_CODES.BAD_REQUEST,
      'That is not a status an application can be in.',
      {
        details: { status: FIELD.INVALID },
      }
    );
  }

  const checked = checkMessage(body, next);
  if (checked.details) {
    let failureMessage;

    if (DECISION_STATUSES.includes(next)) {
      failureMessage = 'Write the message this applicant will read.';
    } else {
      failureMessage = 'That change could not be saved.';
    }

    return fail(response, ERROR_CODES.BAD_REQUEST, failureMessage, { details: checked.details });
  }

  const application = await fetchApplicationRow(id);
  if (!application)
    return fail(response, ERROR_CODES.NOT_FOUND, 'That application could not be found.');

  if (application.status === next) {
    // Not an error, and not a write either. An event row whose from and to are
    // the same status is noise in a log an admin reads to understand what
    // happened, which is the rule startApplication already keeps.
    return ok(response, { id, status: next, unchanged: true });
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
  return ok(response, { id, status: updated.status, task_id: task?.id ?? null });
}

/**
 * Move several rows at once, per 8.3's bulk status change.
 *
 * confirm_count is the client saying how many people it showed the admin. A
 * mismatch means the list moved underneath them, which is exactly the case
 * 8.5's confirmation step exists for, so it is refused rather than applied to
 * whatever is there now.
 */
async function moveMany(response, session, body, done) {
  const checked_ids = bulkIds(response, body);
  if (!checked_ids.ok) return checked_ids.send();
  const ids = checked_ids.ids;

  const next = String(body.status ?? '');
  if (!APPLICATION_STATUSES.includes(next)) {
    return fail(
      response,
      ERROR_CODES.BAD_REQUEST,
      'That is not a status an application can be in.',
      {
        details: { status: FIELD.INVALID },
      }
    );
  }

  if (Number(body.confirm_count) !== ids.length) {
    return fail(response, ERROR_CODES.CONFLICT, 'Confirm who this will reach before sending it.', {
      details: { confirm_count: FIELD.MISMATCH, expected: ids.length },
    });
  }

  const checked = checkMessage(body, next);
  if (checked.details) {
    return fail(
      response,
      ERROR_CODES.BAD_REQUEST,
      'Write the message these applicants will read.',
      {
        details: checked.details,
      }
    );
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
  return ok(response, { moved, skipped, status: next });
}

/**
 * What deleting the selected rows would destroy, counted from the database.
 *
 * A read, but a POST, because the id list is a body rather than a query string:
 * fifty uuids is 1800 characters of URL and some proxies stop well short of
 * that. It writes nothing and is not rate limited any harder than the panel
 * that calls it.
 *
 * 8.2's rule for a posting, applied here: the panel "names exactly what goes
 * with the posting, counted from the database rather than described in the
 * abstract". Somebody about to do something irreversible is owed a number.
 */
async function impact(response, body) {
  const checked = bulkIds(response, body);
  if (!checked.ok) return checked.send();

  return ok(response, { impact: await deletionImpact(checked.ids) });
}

/**
 * Delete tracking rows permanently, per the change of 23 August 2026.
 *
 * **Not in 8.3**, which lists bulk status change and CSV export and nothing
 * else, and added deliberately rather than by reading it into the section. Four
 * things go with it, and none is optional:
 *
 *   **Admins only.** Every other permanent deletion in this build is, and this
 *   destroys the same kind of thing they do.
 *
 *   **The admin types their own password**, verified here against the bcrypt
 *   hash in the same request as the delete, per 7g's rule that a separate
 *   endpoint answering "that password was correct" is never accepted. Deviation
 *   49's argument applies exactly: a session is a cookie in a browser somebody
 *   may have walked away from, and this destroys history that cannot be
 *   restored.
 *
 *   **The count is confirmed.** 8.5's rule, the same one moveMany keeps: a
 *   mismatch means the list moved underneath the admin, and the confirmation
 *   they read was about a different set of people.
 *
 *   **The audit row is written before the delete**, so the record survives the
 *   rows it describes. Migration 012 puts no foreign key on target_id for
 *   exactly that reason.
 *
 * What it does not do is tell the applicant. 8.3's decision messages exist
 * because accepting and rejecting are things a person needs to hear; a row
 * being tidied out of a dashboard is not.
 *
 * **It does clear a cooldown, and that is a real consequence rather than a side
 * effect to be quiet about.** applied_at and cooldown_until live on the row, so
 * an applicant serving a reapply cooldown stops serving it the moment their row
 * goes. Section 3's rule is that exactly three things write those columns, and a
 * rejection is not a waive; this is a fourth way they stop applying, so the
 * impact panel counts it, the audit row records it, and the response says how
 * many were affected.
 */
async function removeMany(request, response, session, body, done) {
  const checked = bulkIds(response, body);
  if (!checked.ok) return checked.send();

  const ids = checked.ids;

  if (Number(body.confirm_count) !== ids.length) {
    return fail(
      response,
      ERROR_CODES.CONFLICT,
      'Confirm what this will delete before deleting it.',
      {
        details: { confirm_count: FIELD.MISMATCH, expected: ids.length },
      }
    );
  }

  // Validated before the bcrypt round rather than after it. A field error is a
  // field error whatever the password was, and checking it first means a caller
  // who got the body wrong does not spend a guess out of the danger bucket.
  const reason = validateText(body.reason, NOTE_MAXIMUM);
  if (!reason.ok) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That reason is too long.', {
      details: { reason: reason.code },
    });
  }

  const before = await deletionImpact(ids);

  // A panel that could not count is not a panel showing zero, and an admin who
  // was shown a dash has not been told what they are destroying. Refuse rather
  // than proceed on an unknown.
  if (before.events === null || before.tasks === null) {
    return fail(
      response,
      ERROR_CODES.SERVER_ERROR,
      'What these rows carry could not be counted. Do not delete them until it can be.'
    );
  }

  // The danger bucket and its hour long lock, per 7g, checked before the bcrypt
  // round so a locked out caller costs nothing. Separate from the adminDelete
  // bucket above, which bounds how many deletions succeed; this one bounds how
  // many passwords may be guessed.
  const dangerSubjects = [subjectForUser('staff', session.user.id), subjectForIp(request)];
  if (await limited(response, 'danger', dangerSubjects)) return;

  const correct = await verifyRealmPassword('staff', session.user.id, body.password);
  if (!correct) {
    await recordFailures('danger', dangerSubjects, LIMITS.danger);
    return fail(response, ERROR_CODES.UNAUTHORISED, 'That password was not right.', {
      details: { password: FIELD.INVALID },
    });
  }

  await clearAll('danger', dangerSubjects);

  // Written before the delete, per 7g, and carrying who and what rather than
  // just how many: an admin reading this a year later needs to know whose
  // history went, and the rows themselves will not be there to say.
  const rows = [];
  for (const id of ids) {
    const application = await fetchApplicationRow(id);
    if (!application) continue;
    rows.push({
      id,
      applicant: application.applicant?.username ?? null,
      job: application.job?.title ?? null,
      status: application.status,
    });
  }

  await auditStaff(
    session.user,
    AUDIT.APPLICATION_DELETED,
    {
      count: rows.length,
      events_deleted: before.events,
      tasks_detached: before.tasks,
      cooldowns_ended: before.cooldowns,
      bulk: true,
      rows,
    },
    { targetTable: TABLES.applications, targetId: null, reason: reason.value }
  );

  const deleted = await deleteApplications(rows.map((row) => row.id));

  await done();
  return ok(response, {
    deleted,
    count: deleted.length,
    events_deleted: before.events,
    tasks_detached: before.tasks,
    cooldowns_ended: before.cooldowns,
  });
}

/**
 * Waive an active cooldown on one row, per 7f.
 *
 * The one thing this deliberately does not do is change the status. A waive
 * says "you may apply again", not "this never happened", and 7f is explicit
 * that a status change and the cooldown are separate levers.
 */
async function waive(response, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an application id.');

  const note = validateText(body.note, NOTE_MAXIMUM);
  if (!note.ok) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That note is too long.', {
      details: { note: note.code },
    });
  }

  const application = await fetchApplicationRow(id);
  if (!application)
    return fail(response, ERROR_CODES.NOT_FOUND, 'That application could not be found.');

  if (!application.cooldown_until) {
    return fail(
      response,
      ERROR_CODES.CONFLICT,
      'There is no cooldown on this application to waive.'
    );
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
  return ok(response, { id, cooldown_until: updated.cooldown_until });
}

/**
 * The admin's running note on a row, changed without a status change.
 *
 * No event row: migration 006's history is a status history, and an event whose
 * from and to are the same status with a note attached would make the timeline
 * unreadable. The note is on the row, with its own updated_at.
 */
async function writeNote(response, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an application id.');

  const note = validateText(body.note, NOTE_MAXIMUM);
  if (!note.ok) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That note is too long.', {
      details: { note: note.code },
    });
  }

  const { data, error } = await supabase
    .from(TABLES.applications)
    .update({ admin_note: note.value })
    .eq('id', id)
    .select('id, admin_note, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) return fail(response, ERROR_CODES.NOT_FOUND, 'That application could not be found.');

  await done();
  return ok(response, { id, admin_note: data.admin_note });
}
