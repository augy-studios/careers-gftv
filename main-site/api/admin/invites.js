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

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { isUuid, params, pageRange, enumParam } from '../_lib/admin.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import {
  INVITE_STATUSES,
  MAX_RECIPIENTS,
  listInvites,
  searchInviteApplicants,
  shortlistApplicants,
  inviteApplicants,
  withdrawInvite,
  removeShortlisted,
} from '../_lib/invites.js';

/** The note an applicant reads on the invite. Two or three sentences. */
const NOTE_MAX = 600;

/** Postings an invite may name. */
const INVITABLE = Object.freeze(['published', 'closed']);

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_invites')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin invites');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);

  // The picker. Separate from the list so the composer's typing does not drag
  // the invites of a whole posting back with every keystroke.
  if (search.has('applicants')) {
    return ok(res, { applicants: await searchInviteApplicants(search.get('applicants')) });
  }

  if (search.has('jobs')) {
    return ok(res, { jobs: await invitableJobs() });
  }

  const jobId = search.get('job');
  const applicantId = search.get('applicant');

  if (jobId && !isUuid(jobId)) return fail(res, ERR.BAD_REQUEST, 'That is not a posting id.');
  if (applicantId && !isUuid(applicantId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not an applicant id.');
  }

  const { from, to, page, size } = pageRange(search, { size: 50, max: 100 });

  const { rows, total } = await listInvites({
    jobId,
    applicantId,
    status: enumParam(search, 'status', INVITE_STATUSES),
    rangeFrom: from,
    rangeTo: to,
  });

  return ok(res, {
    invites: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    statuses: INVITE_STATUSES,
    max_recipients: MAX_RECIPIENTS,
  });
}

/** The postings the composer offers. Published and closed, newest first. */
async function invitableJobs() {
  const { data, error } = await supabase
    .from(T.jobs)
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
    case 'shortlist':
      return shortlist(res, session, body, done);
    case 'invite':
      return invite(res, session, body, done);
    case 'withdraw':
      return withdraw(res, session, body, done);
    default:
      return remove(res, body, done);
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

  const applicantIds = Array.isArray(body.applicant_ids)
    ? [...new Set(body.applicant_ids.filter((id) => isUuid(id)))]
    : [];

  if (applicantIds.length === 0) details.applicant_ids = FIELD.REQUIRED;
  else if (applicantIds.length > MAX_RECIPIENTS) details.applicant_ids = FIELD.TOO_LONG;

  const note = validateText(body.note, NOTE_MAX);
  if (!note.ok) details.note = note.code;

  if (Object.keys(details).length > 0) return { details };

  const { data: job, error } = await supabase
    .from(T.jobs)
    .select('id, title, status')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!job) return { details: { job_id: FIELD.INVALID } };

  return { job, applicantIds, note: note.value };
}

/**
 * Mark people against a posting without telling them.
 *
 * A draft may be shortlisted against, unlike an invite: thinking about who
 * might suit a role you are still writing is exactly when a shortlist is
 * useful, and nobody is contacted either way.
 */
async function shortlist(res, session, body, done) {
  const target = await readTargets(body);
  if (target.details) {
    return fail(res, ERR.BAD_REQUEST, 'That shortlist could not be saved.', {
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
      { targetTable: T.invites, targetId: target.job.id }
    );
  }

  await done();
  return ok(res, {
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
async function invite(res, session, body, done) {
  const target = await readTargets(body);
  if (target.details) {
    return fail(res, ERR.BAD_REQUEST, 'Those invites could not be sent.', {
      details: target.details,
    });
  }

  if (!INVITABLE.includes(target.job.status)) {
    return fail(res, ERR.CONFLICT, 'Only a published or closed posting can be invited to.', {
      details: { job_id: FIELD.INVALID, status: target.job.status },
    });
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
      { targetTable: T.invites, targetId: target.job.id }
    );
  }

  await done();
  return ok(res, { invited: result.invited.length, skipped: result.skipped.length });
}

async function withdraw(res, session, body, done) {
  const jobId = String(body.job_id ?? '');
  const applicantId = String(body.applicant_id ?? '');

  if (!isUuid(jobId) || !isUuid(applicantId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not an invite.');
  }

  const row = await withdrawInvite(jobId, applicantId);
  if (!row) {
    return fail(res, ERR.NOT_FOUND, 'There is no invite there to withdraw.');
  }

  await auditStaff(
    session.user,
    AUDIT.INVITE_WITHDRAWN,
    {},
    { targetTable: T.invites, targetId: row.id }
  );

  await done();
  return ok(res, { withdrawn: true });
}

/**
 * Take somebody off a shortlist.
 *
 * Not audited, and that is the difference between this and withdrawing: nothing
 * was ever sent, nobody was told, and a note somebody made about who to think
 * about is theirs to change. An invite that went out is a message to a person
 * and stays in the log.
 */
async function remove(res, body, done) {
  const jobId = String(body.job_id ?? '');
  const applicantId = String(body.applicant_id ?? '');

  if (!isUuid(jobId) || !isUuid(applicantId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a shortlist entry.');
  }

  const row = await removeShortlisted(jobId, applicantId);
  if (!row) {
    // Either it is not there, or it has been invited since, which is a
    // different thing and has its own control.
    return fail(res, ERR.CONFLICT, 'That one is not on the shortlist any more.');
  }

  await done();
  return ok(res, { removed: true });
}
