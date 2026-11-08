// /api/admin/invites
//
// Section 8.5, invites and shortlists.
//
//   GET  ?job=<uuid>            the shortlist and the invites on one posting
//   GET  ?applicant=<uuid>      what one person has been invited to
//   GET  ?applicants=<term>     people to pick from, for the composer
//   GET  ?jobs=1                the postings an invite can name
//   POST { action: 'shortlist'|'invite'|'withdraw'|'remove' }
//
// **Not admins only.** 8.5 does not restrict it and 8.8 and 8.9 are the two
// sections that do, so a job poster inviting somebody to their own posting is
// the ordinary case. What that costs is watched rather than assumed: the
// applicant picker returns a name, a username, and a picture and nothing else,
// which is what you need to invite the right person and not what you would need
// to look somebody up. 8.9 is where an account is looked at, and it is admins
// only.
//
// **A send names everybody it will reach before it goes.** 8.5 asks for a
// confirmation step "showing exactly who will be contacted, since this sends
// real messages", and 8.3 already applies the same rule to a multi-recipient
// task. The interface does the naming; what this end does is refuse a list
// longer than the cap and answer with exactly who was written to, so the page
// can say so rather than assume.
//
// **Only a published or closed posting can be invited to.** Inviting somebody
// to a draft would send them to a page that 404s, and archiving means the role
// is off the board. A closed posting is allowed on purpose: it still renders,
// and inviting somebody to look at a role that has closed is a thing an admin
// might do while explaining something.

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
import { isUuid, parameters, pageRange, enumParameter } from '../_lib/admin.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import {
  INVITE_STATUSES,
  MAXIMUM_RECIPIENTS,
  listInvites,
  searchInviteApplicants,
  shortlistApplicants,
  inviteApplicants,
  withdrawInvite,
  removeShortlisted,
} from '../_lib/invites.js';

/** The note an applicant reads on the invite. Two or three sentences. */
const NOTE_MAXIMUM = 600;

/** Postings an invite may name. */
const INVITABLE = Object.freeze(['published', 'closed']);

export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(request, response);
  if (!session) return;

  if (await unavailable(response, 'admin_invites')) return;

  response.setHeader('Cache-Control', 'no-store');

  try {
    if (request.method === 'POST') return await write(request, response, session);
    return await read(request, response);
  } catch (cause) {
    return failInternal(response, cause, 'admin invites');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(request, response) {
  const search = parameters(request);

  // The picker. Separate from the list so the composer's typing does not drag
  // the invites of a whole posting back with every keystroke.
  if (search.has('applicants')) {
    return ok(response, { applicants: await searchInviteApplicants(search.get('applicants')) });
  }

  if (search.has('jobs')) {
    return ok(response, { jobs: await invitableJobs() });
  }

  const jobId = search.get('job');
  const applicantId = search.get('applicant');

  if (jobId && !isUuid(jobId))
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a posting id.');
  if (applicantId && !isUuid(applicantId)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an applicant id.');
  }

  const { from, to: rangeEnd, page, size } = pageRange(search, { size: 50, max: 100 });

  const { rows, total } = await listInvites({
    jobId,
    applicantId,
    status: enumParameter(search, 'status', INVITE_STATUSES),
    rangeFrom: from,
    rangeTo: rangeEnd,
  });

  return ok(response, {
    invites: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    statuses: INVITE_STATUSES,
    max_recipients: MAXIMUM_RECIPIENTS,
  });
}

/** The postings the composer offers. Published and closed, newest first. */
async function invitableJobs() {
  const { data, error } = await supabase
    .from(TABLES.jobs)
    .select('id, title, status, published_at')
    .in('status', INVITABLE)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['shortlist', 'invite', 'withdraw', 'remove'];

/**
 * Change invites and shortlists: add people to a shortlist, invite them, withdraw
 * an invite, or remove somebody from the shortlist.
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

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(response, 'admin', subjects)) return;
  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  switch (action) {
    case 'shortlist':
      return shortlist(response, session, body, done);
    case 'invite':
      return invite(response, session, body, done);
    case 'withdraw':
      return withdraw(response, session, body, done);
    default:
      return remove(response, body, done);
  }
}

/**
 * Everything both write paths need checked: the posting, the people, the note.
 *
 * Returned rather than thrown, so the caller answers with field errors in the
 * shape every other admin route uses.
 */
async function readTargets(body) {
  const details = {};

  const jobId = String(body.job_id ?? '');
  if (!isUuid(jobId)) details.job_id = FIELD.INVALID;

  let applicantIds;

  if (Array.isArray(body.applicant_ids)) {
    applicantIds = [...new Set(body.applicant_ids.filter((id) => isUuid(id)))];
  } else {
    applicantIds = [];
  }

  if (applicantIds.length === 0) details.applicant_ids = FIELD.REQUIRED;
  else if (applicantIds.length > MAXIMUM_RECIPIENTS) details.applicant_ids = FIELD.TOO_LONG;

  const note = validateText(body.note, NOTE_MAXIMUM);
  if (!note.ok) details.note = note.code;

  if (Object.keys(details).length > 0) return { details };

  const { data: job, error } = await supabase
    .from(TABLES.jobs)
    .select('id, title, status, department_id')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!job) return { details: { job_id: FIELD.INVALID } };

  return {
    job: { ...job, department: await departmentName(job.department_id) },
    applicantIds,
    note: note.value,
  };
}

/**
 * The department's own name, for the invite that goes to Telegram.
 *
 * Section 15: the message names the role and the department. It is read here,
 * once per send rather than once per recipient, and it is the base row's name in
 * the language it is stored in, matching the posting title beside it and the
 * task title on the dashboard. A failure to read it is a message without a
 * department, never a failed invite.
 */
async function departmentName(departmentId) {
  if (!departmentId) return null;

  const { data, error } = await supabase
    .from(TABLES.departments)
    .select('name')
    .eq('id', departmentId)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv] invite department:', error);
    return null;
  }

  return data?.name ?? null;
}

/**
 * Mark people against a posting without telling them.
 *
 * A draft may be shortlisted against, unlike an invite: thinking about who
 * might suit a role you are still writing is exactly when a shortlist is
 * useful, and nobody is contacted either way.
 */
async function shortlist(response, session, body, done) {
  const target = await readTargets(body);
  if (target.details) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That shortlist could not be saved.', {
      details: target.details,
    });
  }

  const result = await shortlistApplicants({
    jobId: target.job.id,
    applicantIds: target.applicantIds,
    note: target.note,
    staffId: session.user.id,
  });

  if (result.added.length > 0) {
    await auditStaff(
      session.user,
      AUDIT.APPLICANT_SHORTLISTED,
      { job_title: target.job.title, count: result.added.length },
      { targetTable: TABLES.invites, targetId: target.job.id }
    );
  }

  await done();
  return ok(response, {
    added: result.added.length,
    updated: result.updated.length,
    // Named separately so the page can say why somebody was left out rather
    // than silently reporting a smaller number than the admin ticked.
    already_contacted: result.alreadyContacted.length,
  });
}

/**
 * Invite people, and tell them.
 *
 * The title of the task is written here rather than by the client, for the same
 * reason 8.3's decision notice refuses without a message: what an applicant
 * reads is our responsibility, and a title assembled in a browser can be
 * anything. The admin's own words go in the note, which is the body.
 */
async function invite(response, session, body, done) {
  const target = await readTargets(body);
  if (target.details) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'Those invites could not be sent.', {
      details: target.details,
    });
  }

  if (!INVITABLE.includes(target.job.status)) {
    return fail(
      response,
      ERROR_CODES.CONFLICT,
      'Only a published or closed posting can be invited to.',
      {
        details: { job_id: FIELD.INVALID, status: target.job.status },
      }
    );
  }

  const result = await inviteApplicants({
    job: target.job,
    applicantIds: target.applicantIds,
    note: target.note,
    staffId: session.user.id,
    title: `You have been invited to apply: ${target.job.title}`,
  });

  if (result.invited.length > 0) {
    await auditStaff(
      session.user,
      AUDIT.INVITE_SENT,
      { job_title: target.job.title, count: result.invited.length },
      { targetTable: TABLES.invites, targetId: target.job.id }
    );
  }

  await done();
  return ok(response, { invited: result.invited.length, skipped: result.skipped.length });
}

async function withdraw(response, session, body, done) {
  const jobId = String(body.job_id ?? '');
  const applicantId = String(body.applicant_id ?? '');

  if (!isUuid(jobId) || !isUuid(applicantId)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not an invite.');
  }

  const row = await withdrawInvite(jobId, applicantId);
  if (!row) {
    return fail(response, ERROR_CODES.NOT_FOUND, 'There is no invite there to withdraw.');
  }

  await auditStaff(
    session.user,
    AUDIT.INVITE_WITHDRAWN,
    {},
    { targetTable: TABLES.invites, targetId: row.id }
  );

  await done();
  return ok(response, { withdrawn: true });
}

/**
 * Take somebody off a shortlist.
 *
 * Not audited, and that is the difference between this and withdrawing: nothing
 * was ever sent, nobody was told, and a note somebody made about who to think
 * about is theirs to change. An invite that went out is a message to a person
 * and stays in the log.
 */
async function remove(response, body, done) {
  const jobId = String(body.job_id ?? '');
  const applicantId = String(body.applicant_id ?? '');

  if (!isUuid(jobId) || !isUuid(applicantId)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a shortlist entry.');
  }

  const row = await removeShortlisted(jobId, applicantId);
  if (!row) {
    // Either it is not there, or it has been invited since, which is a
    // different thing and has its own control.
    return fail(response, ERROR_CODES.CONFLICT, 'That one is not on the shortlist any more.');
  }

  await done();
  return ok(response, { removed: true });
}
