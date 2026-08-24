// /api/translations/annotations
//
// Section 7i, "Suggesting a correction in place".
//
//   GET                                  whether this caller may annotate, and
//                                        in which languages. The layer asks
//                                        before it loads anything
//   GET  ?type=&id=&locale=              the unresolved spans already raised
//                                        against one thing, for the underlines
//   POST                                 one suggestion against one span
//
// **Separate from api/translations/report.js, which writes the same table.** 7h's
// form is open to any applicant, guarded by `translation_report`, and bounded by
// a bucket sized for somebody who has read one posting. This is open to helpers
// and staff, guarded by `translation_annotations`, and bounded by a bucket sized
// for a review pass. What 7i asked to be single is the queue those rows land in,
// not the endpoint, and one handler carrying two permission models and two
// feature keys is the shape that grows a hole nobody meant to open.
//
// **Nothing here is an interface string editor**, per 7i, and nothing here
// applies anything. A suggestion against a dictionary key is stored with the key
// and read by an admin who edits assets/i18n and deploys; a suggestion against
// content is stored and read by an admin who applies it in 8.11 or does not. The
// promise 7h makes to a reporter — "an admin reads it first, every time" — is the
// same promise here.
//
// **The layer does not load for anybody this route would refuse.** The GET with
// no parameters is what it asks first, and it answers 200 with `can: false`
// rather than 403: whether somebody holds a role is not a failure, and a page
// that treated it as one would log an error on every load for every reader.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { unavailable } from '../_lib/maintenance.js';
import { FIELD, validateLocale, validateText } from '../_lib/validate.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import { searchParams } from '../_lib/jobs.js';
// The same three readers 7h's form uses to decide whether a target exists and
// may be seen. Imported rather than repeated: what a posting's visibility means
// is job-detail.js's answer, and a second copy of it here is a second place for
// a draft to start resolving.
import { fetchJobRecord, hasHistoryWithJob, isVisible, isUuid } from '../_lib/job-detail.js';
import { supabase, T } from '../_lib/supabase.js';
import {
  ANNOTATABLE_FIELDS,
  CONTEXT_MAX,
  QUOTE_MAX,
  annotator,
  createAnnotation,
  listAnnotations,
  mayAnnotateLocale,
} from '../_lib/annotations.js';

const NOTE_MAX = 2000;
const SUGGESTION_MAX = 2000;
const KEY_MAX = 120;

/** Migration 015's four target types. */
const TARGET_TYPES = ['job', 'department', 'tag', 'interface'];

/** A dictionary key, the same shape 7h's form checks. */
const KEY_SHAPE = /^[A-Za-z][\w]*(?:\.[\w]+)+$/;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  // 8.12's shared guard. The layer has its own key rather than sharing the
  // helper area's: one of the two misbehaving is not a reason to take the other
  // down, and this one is the half that appears on pages a stranger is reading.
  if (await unavailable(res, 'translation_annotations')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    const who = await annotator(req);

    if (req.method === 'POST') return await write(req, res, who);
    return await read(req, res, who);
  } catch (cause) {
    return failInternal(res, cause, 'annotations');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res, who) {
  const search = searchParams(req);
  const type = search.get('type');

  if (!type) {
    // "May I, and in what?" A plain answer rather than a refusal: to everybody
    // else the markers are inert and the layer never loads, which is a state
    // rather than an error.
    return ok(res, {
      // Whether the layer loads at all, which is a wider question than whether
      // this caller may write: staff get the underlines and not the box, per
      // deviation 52.
      can: Boolean(who),
      can_suggest: who?.mayWrite === true,
      realm: who?.realm ?? null,
      locales: who?.locales ?? [],
    });
  }

  if (!who) return fail(res, ERR.FORBIDDEN, 'That is not something you can do.');

  if (!TARGET_TYPES.includes(type) || type === 'interface') {
    // Interface strings have no underlines, and the reason is in annotations.js:
    // the layer would have to ask about every key the page happened to render.
    return fail(res, ERR.BAD_REQUEST, 'That is not something with suggestions on it.');
  }

  const targetId = search.get('id');
  if (!isUuid(targetId ?? '')) return fail(res, ERR.BAD_REQUEST, 'That is not a valid id.');

  const locale = validateLocale(search.get('locale'));
  if (!locale.ok) return fail(res, ERR.BAD_REQUEST, 'That is not a language this site has.');

  const spans = await listAnnotations({
    targetType: type,
    targetId,
    locale: locale.value,
  });

  return ok(res, { spans, locale: locale.value });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

async function write(req, res, who) {
  if (!who?.mayWrite) {
    // Staff land here too, per deviation 52, and the sentence is written for
    // them as much as for anybody: an admin reading a posting has the editor and
    // 8.11's queue, and can hold the helper role on their own applicant account
    // if they would rather suggest than change it.
    return fail(
      res,
      ERR.FORBIDDEN,
      'Suggesting a correction in place is for translation helpers. The report link at the foot of a posting is open to everybody, and an admin can change the wording directly.'
    );
  }

  const body = await readJson(req, res);
  if (body === null) return;

  const details = {};

  const targetType = String(body.target_type ?? '').trim();
  if (!TARGET_TYPES.includes(targetType)) details.target_type = FIELD.INVALID;

  const locale = validateLocale(body.locale);
  if (!locale.ok) details.locale = locale.code;

  // Required, per the shape 7h settled on and migration 015's own not-null: the
  // suggestion is the wording, and the note is the person. A row that carried a
  // replacement and nothing else would leave an admin guessing whether the
  // current text is wrong, ambiguous, or merely not to somebody's taste.
  const note = validateText(body.note, NOTE_MAX, { required: true });
  if (!note.ok) details.note = note.code;

  const suggestion = validateText(body.suggested_text, SUGGESTION_MAX);
  if (!suggestion.ok) details.suggested_text = suggestion.code;

  // The span itself. Required here and optional on 7h's form, which is the whole
  // difference between the two: an annotation that does not say which words it
  // is about is a report, and there is already a route for one.
  const quote = validateText(body.quote, QUOTE_MAX, { required: true });
  if (!quote.ok) details.quote = quote.code;

  const prefix = context(body.quote_prefix);
  const suffix = context(body.quote_suffix);

  // Which part of the thing the span sits in. The layer reads it off the marker
  // in the document rather than asking, so an invalid one is a bug in the page
  // rather than something a person typed, and it is refused rather than dropped.
  let field = null;
  if (targetType !== 'interface') {
    const candidate = String(body.field ?? '').trim();
    if (!ANNOTATABLE_FIELDS[targetType]?.includes(candidate)) details.field = FIELD.INVALID;
    else field = candidate;
  }

  let targetId = null;
  let targetKey = null;

  if (targetType === 'interface') {
    const key = String(body.target_key ?? '').trim();
    if (key === '' || key.length > KEY_MAX || !KEY_SHAPE.test(key)) {
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
    return fail(res, ERR.BAD_REQUEST, 'That suggestion could not be sent.', { details });
  }

  // The language is checked against what this caller holds *after* the shape, so
  // a helper who has picked up a second language mid-session gets a sentence
  // about the language rather than a validation error listing four fields.
  if (!mayAnnotateLocale(who, locale.value)) {
    return fail(res, ERR.FORBIDDEN, 'You do not hold the helper role for that language.', {
      details: { locale: FIELD.INVALID, reason: 'not_a_helper' },
    });
  }

  // Per account, counted on success, like the apply and report buckets: nothing
  // here is a guess at a secret, and what is worth bounding is how many rows one
  // account can add to the queue in an hour. Five times the report bucket,
  // because a helper working through a posting properly raises several spans in
  // one sitting and that is the behaviour the role exists to produce.
  const subjects = [subjectForUser(who.realm, who.user.id)];
  if (await limited(res, 'annotate', subjects)) return;

  const reachable = await targetExists(targetType, targetId, who);
  if (!reachable) {
    return fail(res, ERR.NOT_FOUND, 'That is not something we can take a suggestion about.');
  }

  const created = await createAnnotation({
    targetType,
    targetId,
    targetKey,
    field,
    locale: locale.value,
    // Always an applicant, per deviation 52, which is what migration 015's
    // foreign key wants and what makes the queue name the person correctly.
    reporterId: who.user.id,
    note: note.value,
    suggestion: suggestion.value,
    quote: quote.value,
    prefix,
    suffix,
  });

  await recordFailures('annotate', subjects, LIMITS.annotate);

  return ok(res, { id: created.id, created_at: created.created_at }, { status: 201 });
}

/**
 * A run of text either side of the quote, bounded.
 *
 * Truncated rather than refused, unlike everything else on this request. The
 * prefix and the suffix are captured by the layer from whatever happened to be
 * around the selection, so their length is a property of the page rather than a
 * choice anybody made, and failing a suggestion because a paragraph was long
 * would be refusing the person for something the document did.
 */
function context(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, CONTEXT_MAX);
}

/**
 * Whether the thing being annotated exists, and may be seen by this caller.
 *
 * The same check 7h's form makes, and for the same reason: without it the
 * endpoint confirms that a draft posting exists to anybody who guesses its uuid,
 * which is the one thing /jobs/{uuid} is careful not to do.
 *
 * Only ever asked about a helper, since staff do not write here. A helper is an
 * ordinary applicant account, so a draft posting is invisible to them exactly as
 * it is to everybody else.
 */
async function targetExists(targetType, targetId, who) {
  // The dictionaries are files this cannot read, per 7i. A suggestion naming a
  // key that has since been renamed is still a real suggestion about wording
  // somebody saw on screen.
  if (targetType === 'interface') return true;

  if (targetType === 'job') {
    const record = await fetchJobRecord({ id: targetId });
    if (!record) return false;

    const hasHistory =
      record.job.status === 'archived'
        ? await hasHistoryWithJob(record.job.id, who.user.id)
        : false;

    return isVisible(record.job, hasHistory);
  }

  const table = targetType === 'department' ? T.departments : T.tags;
  const { data, error } = await supabase.from(table).select('id').eq('id', targetId).limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
