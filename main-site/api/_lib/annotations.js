// The annotation layer's server side, section 7i.
//
// 7h's form asks a reader what is wrong with a posting. This is the other way in:
// a helper reading any page selects the words that read wrongly and suggests a
// replacement for that exact span, without leaving the page or knowing what a
// dictionary key is.
//
// **One queue, not two.** 7i is explicit, and migration 023 is what makes it
// true: an annotation is a row in gftvjobs_translation_reports with `origin` of
// 'annotation' and the three anchor columns filled in. 8.11's queue already reads
// them, part 6 built the panel that shows the quote and says when it has come
// adrift, and nothing on the admin side changes for this.
//
// Six things here are decisions rather than plumbing:
//
//   **A separate route from 7h's form, writing the same table.** api/translations/
//   report.js is open to any applicant, guarded by `translation_report`, and
//   bounded by a bucket sized for somebody reading one posting. This is open to
//   helpers and staff, guarded by `translation_annotations`, and bounded by a
//   bucket sized for a review pass. One handler with two permission models and
//   two feature keys inside it is the shape that quietly grows a hole; the queue
//   they land in is what 7i asked to be single, not the endpoint.
//
//   **The anchor is the W3C TextQuoteSelector**, per 7i: the exact quote plus a
//   short run of text either side. Worth copying rather than inventing, and it
//   is what lets a suggestion still be found after the surrounding text has been
//   edited, and be shown as detached rather than applied to the wrong place when
//   it cannot.
//
//   **The quote is captured from what is on screen, and the queue matches it
//   against what is stored.** Those are not always the same string: a posting's
//   body is markdown, so a span crossing a bold run or a bullet marker exists in
//   the rendered text and not in the column. That case ends as `detached` in the
//   admin panel, which is the honest answer and the one 7i asks for. It is a
//   limit of matching rendered text, not a bug to be papered over by loosening
//   the match until it finds something.
//
//   **Staff read the layer and do not write to it.** 7i says the layer is
//   "visible only to granted helpers and admins", and visible is the word: what
//   it gives an admin is the underlines, so they can see what has been raised
//   while they read. Suggesting is a helper's act, and the reason is migration
//   015's own shape — reporter_id is a foreign key to gftvjobs_users, so a staff
//   row cannot be recorded as the reporter and would arrive in the queue as a
//   report from a deleted account. An admin who wants to suggest rather than
//   edit is granted the helper role on their own applicant account, which is 7i's
//   model rather than a workaround. Deviation 52 has the argument.
//
//   **A helper may annotate only a language they hold.** The role is granted per
//   language, per 7i, and an annotation names the language that reads wrongly. So
//   the check is the same (user_id, locale) row the helper area guards on, and
//   not a boolean. Staff are not scoped this way: an admin works across every
//   language in 8.11 already.
//
//   **Underlines are drawn for content and not for interface strings.** The
//   layer asks this file what has already been raised against the posting it is
//   on, which is one row id. Doing the same for the dictionary would mean asking
//   about every key the page happened to render, and the answer would change
//   with the page rather than with the wording.

import { supabase, T } from './supabase.js';
import { getApplicantSession, getStaffSession, hasPortalAccess } from './session.js';

/** Migration 023's two origins. This file only ever writes the second. */
export const ANNOTATION_ORIGIN = 'annotation';

/**
 * What a span may be annotated against, per target type.
 *
 * The same fields 7h's form offers, plus the two that only exist on the page:
 * `compensation_note`, which the form leaves out because a reader is unlikely to
 * name it, and `sections`, which a reader cannot name at all and which a helper
 * selecting words inside one does not have to.
 *
 * An interface report names no field. Its key is the whole address.
 */
export const ANNOTATABLE_FIELDS = Object.freeze({
  job: Object.freeze([
    'title',
    'summary',
    'description',
    'responsibilities',
    'requirements',
    'nice_to_have',
    'location',
    'compensation_note',
    'sections',
  ]),
  department: Object.freeze(['name', 'description']),
  tag: Object.freeze(['name', 'description']),
  interface: Object.freeze([]),
});

/** The longest span somebody may select. A sentence or two, not a page. */
export const QUOTE_MAX = 600;

/** How much text either side is stored. The W3C selector's "short run". */
export const CONTEXT_MAX = 120;

/** How many annotations one target's underlines are drawn from. */
const LIST_CAP = 200;

/**
 * Who is asking, and what they may annotate.
 *
 * Both realms, checked in the order that costs least: the applicant cookie is
 * the one almost every caller has, and the staff check is two queries behind a
 * cookie most browsers do not carry.
 *
 * @returns {Promise<null | {
 *   realm: 'applicant'|'staff',
 *   user: object,
 *   mayWrite: boolean,
 *   locales: string[]
 * }>} `locales` is the set this caller may suggest against, and it is empty for
 *   staff, who read the layer rather than write to it.
 */
export async function annotator(req) {
  const applicant = await getApplicantSession(req);

  if (applicant?.user) {
    const { data, error } = await supabase
      .from(T.translationHelpers)
      .select('locale')
      .eq('user_id', applicant.user.id);

    if (error) throw error;

    const locales = (data ?? []).map((row) => row.locale);
    if (locales.length > 0) {
      return {
        realm: 'applicant',
        user: applicant.user,
        mayWrite: true,
        locales,
      };
    }
  }

  const staff = await getStaffSession(req);
  if (staff?.user && (await hasPortalAccess(staff.user))) {
    return {
      realm: 'staff',
      user: staff.user,
      // Read only, per deviation 52. The layer draws the underlines so an admin
      // can see what has been raised while they read; the suggestion box is a
      // helper's, because 015's reporter_id is a foreign key to gftvjobs_users
      // and a staff row would arrive in the queue as a deleted account.
      mayWrite: false,
      locales: [],
    };
  }

  // Signed in as an ordinary applicant, or not signed in at all. The same
  // answer either way: to everyone else the attributes are inert markup and the
  // layer does not load, per 7i.
  return null;
}

/** Whether this caller may suggest a correction in this language. */
export function mayAnnotateLocale(who, locale) {
  if (!who?.mayWrite) return false;
  return who.locales.includes(locale);
}

/* -------------------------------------------------------------------------
 * Reading what has already been raised
 * ---------------------------------------------------------------------- */

const ANNOTATION_COLUMNS =
  'id, field, locale, quote, quote_prefix, quote_suffix, status, created_at';

/**
 * The unresolved annotations against one thing, grouped by the span they point
 * at.
 *
 * **Unresolved only.** 7i's reason for showing them at all is that it "turns it
 * from a suggestion box into a review pass: a helper can see what has already
 * been raised and not raise it again". A fixed report has been acted on and the
 * words underneath it have usually changed, so drawing it would mark a span that
 * is no longer the one complained about.
 *
 * Grouped here rather than in the browser because the count is the whole point
 * of the grouping and the page should not have to invent it. Two people
 * complaining about the same sentence is one underline reading 2, which is a
 * different fact from two underlines.
 *
 * @param {{ targetType: string, targetId: string, locale: string }} target
 */
export async function listAnnotations({ targetType, targetId, locale }) {
  const { data, error } = await supabase
    .from(T.translationReports)
    .select(ANNOTATION_COLUMNS)
    .eq('origin', ANNOTATION_ORIGIN)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('locale', locale)
    .in('status', ['open', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(LIST_CAP);

  if (error) throw error;

  const spans = new Map();

  for (const row of data ?? []) {
    if (!row.quote) continue;

    // Keyed on the field and the quote together. The same sentence can appear in
    // two fields of one posting, and an underline drawn in the wrong one is
    // worse than no underline.
    const key = `${row.field ?? ''} ${row.quote}`;
    const entry = spans.get(key);

    if (entry) {
      entry.count += 1;
      continue;
    }

    spans.set(key, {
      field: row.field ?? null,
      quote: row.quote,
      // The prefix and suffix of the newest one, which is what the ordering
      // above is for. They only narrow a quote that appears more than once, so
      // taking them from any single row is honest; taking them from the newest
      // means they describe the wording as it stands most recently.
      quote_prefix: row.quote_prefix ?? '',
      quote_suffix: row.quote_suffix ?? '',
      count: 1,
    });
  }

  return [...spans.values()];
}

/* -------------------------------------------------------------------------
 * Writing one
 * ---------------------------------------------------------------------- */

/**
 * Store one suggestion against one span.
 *
 * `origin` is set here rather than taken from the caller. It is the column the
 * whole queue distinguishes the two kinds of report by, and a route that let a
 * body choose it would be a way to file a form report that looks like an
 * annotation, or the reverse.
 *
 * @param {{
 *   targetType: string, targetId: string|null, targetKey: string|null,
 *   field: string|null, locale: string, reporterId: string|null,
 *   note: string, suggestion: string|null,
 *   quote: string, prefix: string, suffix: string
 * }} input
 */
export async function createAnnotation(input) {
  const { data, error } = await supabase
    .from(T.translationReports)
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      target_key: input.targetKey,
      field: input.field,
      locale: input.locale,
      reporter_id: input.reporterId,
      note: input.note,
      suggested_text: input.suggestion,
      status: 'open',
      origin: ANNOTATION_ORIGIN,
      quote: input.quote,
      quote_prefix: input.prefix,
      quote_suffix: input.suffix,
    })
    .select('id, created_at')
    .single();

  if (error) throw error;
  return data;
}
