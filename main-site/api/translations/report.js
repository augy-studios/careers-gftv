// POST /api/translations/report
//
// Section 7h. Nobody on the GFTV side necessarily reads both languages well
// enough to catch a bad posting before an applicant does, so the applicants are
// the correction loop. This is where a report lands.
//
// Four things about it are decisions rather than implementation, and each one
// is easy to undo by accident:
//
//   1. **A suggested wording is never applied.** This route stores it and
//      nothing else. An admin reads it first, every time, in the phase 8 queue.
//      The form says so on screen, so a reporter is not left assuming their
//      text is now live.
//   2. **The reporter may write in either language.** `locale` is the language
//      that reads wrongly, not the language the report is written in. Somebody
//      reporting bad Chinese is often the person who reads Chinese least well.
//   3. **A report is not a task.** It is outbound from the applicant rather
//      than something the portal needs from them, so it never goes into
//      gftvjobs_tasks and never counts towards the /account/tasks badge. An
//      admin who needs to ask a follow up question raises an ordinary
//      info_request, which is what that table is for.
//   4. **It requires an account**, so the team can come back about it. A logged
//      out visitor gets the sign in prompt from section 4 on the client side
//      and this route answers 401, which is the same check on the server rather
//      than a hidden control.
//
// Reporting a problem with the *default* language is allowed and is not a bug.
// Migration 015 uses a foreign key rather than a check constraint for exactly
// that reason: the English can be the wrong one.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { getApplicantSession } from '../_lib/session.js';
import { validateLocale, validateText, FIELD } from '../_lib/validate.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../_lib/rate-limit.js';
import {
  fetchJobRecord,
  hasHistoryWithJob,
  isVisible,
  isUuid,
} from '../_lib/job-detail.js';
import { unavailable } from '../_lib/maintenance.js';

// Migration 015's check constraint, repeated here so a bad value is a field
// error the form can point at rather than a database error the client cannot
// read.
const TARGET_TYPES = ['job', 'department', 'tag', 'interface'];

// Which part reads wrongly. These name columns on the translation row, since
// the locale already says which language. Optional: a reporter may not know
// which field they mean, and "the whole posting" is the default the form
// offers.
const FIELDS = [
  'title',
  'summary',
  'description',
  'responsibilities',
  'requirements',
  'nice_to_have',
  'location',
  'compensation_note',
  'sections',
  'og_description',
  // Departments and tags carry only these two.
  'name',
];

const NOTE_MAX = 2000;
const SUGGESTION_MAX = 2000;
const KEY_MAX = 120;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  // 8.12's shared guard. Off means off, including the API: a disabled
  // control stops nobody with a stale tab or a phase 10 queued action.
  if (await unavailable(res, 'translation_report')) return;

  const session = await getApplicantSession(req);
  if (!session) {
    return fail(
      res,
      ERR.UNAUTHORISED,
      'Reporting a translation problem needs an account, so we can come back to you about it.'
    );
  }

  const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
  if (await limited(res, 'report', subjects)) return;

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const targetType = String(body.target_type ?? '').trim();
  if (!TARGET_TYPES.includes(targetType)) details.target_type = FIELD.INVALID;

  const locale = validateLocale(body.locale);
  if (!locale.ok) details.locale = locale.code;

  const note = validateText(body.note, NOTE_MAX, { required: true });
  if (!note.ok) details.note = note.code;

  const suggestion = validateText(body.suggested_text, SUGGESTION_MAX);
  if (!suggestion.ok) details.suggested_text = suggestion.code;

  // Absent, empty, and "the whole posting" are the same thing and all become
  // null. Anything else has to be a field that exists.
  let field = null;
  if (body.field !== undefined && body.field !== null && String(body.field).trim() !== '') {
    const candidate = String(body.field).trim();
    if (!FIELDS.includes(candidate)) details.field = FIELD.INVALID;
    else field = candidate;
  }

  let targetId = null;
  let targetKey = null;

  if (targetType === 'interface') {
    // A dictionary key, for example nav.findRole. Migration 015 requires the
    // key and forbids an id on this branch.
    const key = String(body.target_key ?? '').trim();
    if (key === '' || key.length > KEY_MAX || !/^[A-Za-z][\w]*(?:\.[\w]+)+$/.test(key)) {
      details.target_key = FIELD.INVALID;
    } else {
      targetKey = key;
    }
  } else {
    const id = String(body.target_id ?? '').trim();
    if (!isUuid(id)) details.target_id = FIELD.INVALID;
    else targetId = id;
  }

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That report could not be sent.', { details });
  }

  try {
    // The target has to exist, and for a posting it has to be one this reporter
    // could actually be reading. Without this check the endpoint confirms that
    // a draft posting exists to anybody who guesses its uuid, which is the one
    // thing /jobs/{uuid} is careful not to do.
    const targetOk = await targetExists(targetType, targetId, session.user.id);
    if (!targetOk) {
      return fail(res, ERR.NOT_FOUND, 'That is not something we can take a report about.');
    }

    const { data, error } = await supabase
      .from(T.translationReports)
      .insert({
        target_type: targetType,
        target_id: targetId,
        target_key: targetKey,
        field,
        locale: locale.value,
        reporter_id: session.user.id,
        note: note.value,
        suggested_text: suggestion.value,
        status: 'open',
      })
      .select('id, created_at')
      .single();

    if (error) return failInternal(res, error, 'translation report');

    // Counted on the way out rather than on a failure, per the note on the
    // report bucket in rate-limit.js. A successful report is exactly the thing
    // being bounded here.
    await recordFailures('report', subjects, LIMITS.report);

    return ok(res, { id: data.id, created_at: data.created_at }, { status: 201 });
  } catch (cause) {
    return failInternal(res, cause, 'translation report');
  }
}

/**
 * Whether the thing being reported about exists, and may be seen.
 *
 * Interface strings are not checked against anything. The dictionaries are
 * files rather than rows, this function cannot read them, and a report naming a
 * key that has since been renamed is still a real report about wording somebody
 * saw on screen.
 */
async function targetExists(targetType, targetId, applicantId) {
  if (targetType === 'interface') return true;

  if (targetType === 'job') {
    const record = await fetchJobRecord({ id: targetId });
    if (!record) return false;

    const hasHistory =
      record.job.status === 'archived'
        ? await hasHistoryWithJob(record.job.id, applicantId)
        : false;

    return isVisible(record.job, hasHistory);
  }

  const table = targetType === 'department' ? T.departments : T.tags;
  const { data, error } = await supabase.from(table).select('id').eq('id', targetId).limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
