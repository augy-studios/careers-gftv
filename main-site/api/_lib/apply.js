// The apply flow, server side. Sections 7a, 7b, 7c, and 7f.
//
// Three routes share every rule in here and must never disagree about any of
// them: api/applications/start.js hands an applicant over to the form,
// api/applications/respond.js records what they say afterwards, and
// api/applications/mine.js tells the posting page and the board which button to
// draw. Put a rule in one route and the other two drift.
//
// The rule this file exists for, above the rest:
//
//   **The Google Form URL is read here and only here.** api/_lib/job-detail.js
//   deliberately never selects application_form_url, form_prefill, or
//   response_sheet_url, so a stranger cannot lift the form and bypass the gate,
//   per section 4. This module is the authenticated counterpart: it selects
//   them, and nothing it returns to a caller carries the raw URL except the one
//   place that is the whole point, the prefilled link handed to an applicant
//   whose session has already been checked.
//
// Four more that are decisions rather than implementation:
//
//   **No answer means no.** did_apply starts false and stays false until
//   something positively confirms otherwise. A pending row is not an
//   application: no cooldown starts, and the funnel does not count it.
//
//   **Ask isInCooldown, never compare cooldown_until to the clock.** That
//   comparison is right in every case except the one the setting exists for:
//   with reapply_cooldown_days at zero the stored dates are ignored rather than
//   cleared, and only the helper in settings.js knows that.
//
//   **A tracking row never moves backwards.** Section 7a says a start upserts
//   the row to 'started', which is right for a new row and for one the
//   applicant withdrew. It is wrong for a row an admin has moved to
//   'shortlisted': a second apply click must not undo that. See startStatusFor.
//
//   **Prefill is best effort and never fails the handoff.** 7b: if a job has no
//   form_prefill map, open the plain form URL.

import { supabase, T } from './supabase.js';
import { cooldownUntil, isInCooldown, getSetting } from './settings.js';

/* -------------------------------------------------------------------------
 * Reading a posting, from the authenticated side
 * ---------------------------------------------------------------------- */

// Everything the apply flow needs and nothing it does not. response_sheet_url
// is absent deliberately: it is admin facing, per migration 005, and no part of
// this flow has any use for it.
const APPLY_COLUMNS = [
  'id',
  'title',
  'status',
  'closes_at',
  'application_form_url',
  'form_prefill',
  // Migration 031. The posting's question template, read here because 7a is
  // where the auto-raise in 7g hangs: the tracking row is already being written
  // at that point, so asking for one more column beats a second query.
  'task_questions',
].join(', ');

/**
 * One posting, with its form, for an applicant who has already been
 * authenticated.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>} null when there is no such posting. An error
 *          throws, so the caller answers 500 rather than 404.
 */
export async function fetchApplyJob(jobId) {
  const { data, error } = await supabase
    .from(T.jobs)
    .select(APPLY_COLUMNS)
    .eq('id', jobId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * The form for one posting in one language, per 3a and migration 014.
 *
 * Some roles run a separate Mandarin form rather than one bilingual form, so a
 * translation row may point at its own, with its own entry ids and its own
 * response sheet. A blank column there falls back to the posting's.
 *
 * Gated on is_ready, which is the part worth stating: an unfinished translation
 * is not shown to a reader, so the reader is looking at the English posting,
 * and handing them a Chinese form for a posting they are reading in English
 * would be a worse answer than the fallback. The form follows the language the
 * posting was actually served in.
 *
 * @param {object} job from fetchApplyJob
 * @param {string} locale
 * @returns {Promise<{ url: string|null, prefill: object|null }>}
 */
export async function resolveForm(job, locale) {
  const base = { url: job.application_form_url ?? null, prefill: job.form_prefill ?? null };

  // Migration 014 forbids a translation row for the default language, so there
  // is nothing to look up and one query is saved on the common path.
  if (locale === 'en') return base;

  const { data, error } = await supabase
    .from(T.jobTranslations)
    .select('application_form_url, form_prefill')
    .eq('job_id', job.id)
    .eq('locale', locale)
    .eq('is_ready', true)
    .maybeSingle();

  if (error) {
    // A failed lookup here must not fail the handoff. The posting's own form is
    // the honest fallback and is what the reader would have got anyway if the
    // translation had left the column blank.
    console.warn('[careers-gftv] translated form lookup:', error);
    return base;
  }

  const url = data?.application_form_url;
  if (!url || String(url).trim() === '') return base;

  // The prefill map follows the form it belongs to, per migration 014: a
  // different form has different entry ids, so the posting's map must never be
  // applied to a translation's form. Null here means no prefill, not fallback.
  return { url: String(url).trim(), prefill: data.form_prefill ?? null };
}

/* -------------------------------------------------------------------------
 * Prefill, 7b
 * ---------------------------------------------------------------------- */

// The applicant fields a form_prefill map may name. An allowlist rather than a
// lookup on the session object, so a map naming password_hash gets nothing.
const PREFILLABLE = Object.freeze({
  email: (user) => user.email,
  display_name: (user) => user.display_name,
  username: (user) => user.username,
  phone: (user) => user.phone,
});

/** A Google Forms entry id, which is what the map's keys have to be. */
const ENTRY_KEY = /^entry\.\d{1,20}$/;

/**
 * Whether a URL can carry prefill at all.
 *
 * 7b: prefill only works on the long form viewform address, never on a
 * forms.gle short link. Phase 7's editor validates this on save; this checks it
 * again at use, because a row written before that validator existed would
 * otherwise produce a link with query parameters a short link silently drops.
 *
 * @param {string} url
 */
export function canPrefill(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'docs.google.com') return false;
    return parsed.pathname.startsWith('/forms/') && parsed.pathname.includes('/viewform');
  } catch {
    return false;
  }
}

/**
 * The address to hand the applicant.
 *
 * Built server side from the session, never from anything the client sent, per
 * 7b. Two limitations that belong in the admin help text rather than here, but
 * are worth knowing while reading this: the values are editable by the
 * applicant once the form is open, so the email in a response is not proof of
 * identity, and a form with no map opens plain.
 *
 * @param {string} url the resolved form address
 * @param {object|null} prefill the form_prefill map
 * @param {object} user the session's applicant
 * @returns {string}
 */
export function buildFormUrl(url, prefill, user) {
  if (!prefill || typeof prefill !== 'object' || Array.isArray(prefill)) return url;
  if (!canPrefill(url)) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  let added = 0;

  for (const [entry, field] of Object.entries(prefill)) {
    if (!ENTRY_KEY.test(entry)) continue;

    const read = PREFILLABLE[String(field)];
    if (!read) continue;

    const value = read(user);
    if (value === null || value === undefined || String(value).trim() === '') continue;

    // URL encoding is the URLSearchParams' job, and letting it do that is the
    // whole reason this is built with a URL object rather than by concatenation.
    parsed.searchParams.set(entry, String(value));
    added += 1;
  }

  // Google's own prefilled links carry this, and it is what tells the form the
  // parameters are prefill rather than something else. Only added when there is
  // something to prefill, so a map that named nothing usable opens the plain
  // form rather than a URL with a stray parameter on it.
  if (added === 0) return url;
  parsed.searchParams.set('usp', 'pp_url');

  return parsed.toString();
}

/* -------------------------------------------------------------------------
 * Whether this posting can be applied to
 * ---------------------------------------------------------------------- */

/**
 * Reasons a posting cannot be applied to. Stable strings, because the client
 * branches on them and renders its own sentence in the reader's language.
 */
export const REFUSAL = Object.freeze({
  NOT_OPEN: 'not_open',
  EXPIRED: 'expired',
  APPLICATIONS_CLOSED: 'applications_closed',
  NO_FORM: 'no_form',
  COOLDOWN: 'cooldown',
  PENDING: 'pending',
  // Added 21 August 2026 with the accept and reject rules in 8.3. Unlike every
  // other refusal here this one is permanent, and it must never render as a
  // date: a date invites somebody to come back for a role they already have.
  ACCEPTED: 'accepted',
});

/** Whether the global applications toggle is on, per 8.10 and 7a. */
export async function applicationsOpen() {
  // The fallback is the documented policy rather than the permissive value in
  // every other setting, and this one is the exception on purpose: the
  // documented state of the toggle is on, so an unreadable settings table must
  // not close the board. Migration 012 seeds it true.
  return (await getSetting('applications_open', true)) !== false;
}

/**
 * Why this posting cannot be applied to, or null when it can.
 *
 * The order matters. A closed posting is closed whatever the toggle says, and a
 * posting with no form cannot be applied to however open it is, so the reasons
 * that are about the posting come before the one that is about the site.
 *
 * @param {object} job from fetchApplyJob
 * @param {boolean} open the global toggle
 * @returns {string|null} a REFUSAL
 */
export function refusalFor(job, open) {
  if (job.status !== 'published') return REFUSAL.NOT_OPEN;

  // A null closes_at passes this check, per 7a. Open until filled is a real
  // state and never expires.
  if (job.closes_at && Date.parse(job.closes_at) < Date.now()) return REFUSAL.EXPIRED;

  if (!job.application_form_url) return REFUSAL.NO_FORM;
  if (!open) return REFUSAL.APPLICATIONS_CLOSED;

  return null;
}

/**
 * Why *this applicant* cannot apply to a posting that is otherwise open, or
 * null.
 *
 * Separate from refusalFor because the two answer different questions and are
 * needed at different moments: refusalFor is about the posting and is the same
 * for everybody, so the posting page can inline it, while this one needs a
 * tracking row and arrives with the per applicant state.
 *
 * Only the permanent case lives here. The cooldown is still asked of
 * isInCooldown at the call site, because that answer depends on a setting and
 * this function is deliberately synchronous.
 *
 * @param {{ status?: string }|null} application
 * @returns {string|null} a REFUSAL
 */
export function refusalForApplicant(application) {
  // 8.3, 21 August 2026: "Accepting closes that posting to that applicant for
  // good, while rejecting closes it only until the cooldown runs out." A
  // rejected row is handled by RESETTABLE and the cooldown; this is the other
  // half, and it has no end date by design.
  if (application?.status === 'accepted') return REFUSAL.ACCEPTED;
  return null;
}

/* -------------------------------------------------------------------------
 * The tracking row and its history
 * ---------------------------------------------------------------------- */

/**
 * The applicant's tracking row for one posting, or null.
 * @param {string} jobId
 * @param {string} applicantId
 */
export async function fetchApplication(jobId, applicantId) {
  const { data, error } = await supabase
    .from(T.applications)
    .select('id, status, started_at, applied_at, cooldown_until, updated_at')
    .eq('job_id', jobId)
    .eq('applicant_id', applicantId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

// Statuses a start click may set. Anything past 'started' belongs to an admin
// working through the pipeline, and a second click on Apply must not undo that.
// 'withdrawn' is in the list because 7e is explicit that somebody who pulls out
// is not locked out of a role they change their mind about.
//
// 'rejected' joined it on 21 August 2026, with the accept and reject rules in
// 8.3, and it is the one entry here that is about somebody else's decision
// rather than the applicant's own. A rejection closes the role until the
// cooldown runs out and no longer, per 7f, so once that period is served the
// row starts fresh at 'started'. Without this the row would stay reading "Not
// this time" on both the applicant's list and the admin's while they reapply.
//
// 'accepted' is deliberately absent and is the opposite case: accepting closes
// the posting to that applicant for good, which refusalForApplicant answers
// before a start click ever reaches this list.
const RESETTABLE = ['started', 'withdrawn', 'rejected'];

// The same list for a *confirmation*, and it is deliberately the shorter one.
//
// A start click is a new attempt and may reopen a rejected row. A confirmed Yes
// is an answer about an attempt that has already happened, and it arrives
// through a prompt that can sit unanswered for fourteen days: if a rejection
// landed in the meantime, moving the row to 'submitted' would silently undo it.
// Splitting the two lists is the only thing standing between those two cases,
// which is why they are not one constant with a comment.
const CONFIRMABLE = ['started', 'withdrawn'];

/**
 * What the tracking row's status should be after a start click.
 * @param {object|null} application
 * @returns {string|null} null when it should be left exactly as it is
 */
export function startStatusFor(application) {
  if (!application) return 'started';
  if (!RESETTABLE.includes(application.status)) return null;
  if (application.status === 'started') return null;
  return 'started';
}

/**
 * Append a row to the status history.
 *
 * Never fails the request. The tracking row is the state and this is the
 * record of how it got there; losing one line of history is not worth turning
 * an apply into an error page.
 *
 * @param {string} applicationId
 * @param {string|null} fromStatus
 * @param {string} toStatus
 * @param {'applicant'|'system'|'admin'|'webhook'|'cron'} source
 * @param {string|null} [note]
 * @param {{ changedBy?: string|null }} [options] the gftvhello uuid of the
 *        staff member, for an admin action. Migration 006 puts a foreign key on
 *        that column, so it takes a staff id and nothing else: an applicant id
 *        here would fail the insert, which is why it is a named option rather
 *        than a positional argument next to source.
 */
export async function writeApplicationEvent(
  applicationId,
  fromStatus,
  toStatus,
  source,
  note = null,
  options = {}
) {
  const { error } = await supabase.from(T.applicationEvents).insert({
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    note,
    source,
    // Null for everything that is not an admin acting. Phase 7's tracking page
    // is the first caller that passes one; every call from the applicant side
    // leaves it null and lets source carry the meaning, per migration 006.
    changed_by: options.changedBy ?? null,
  });

  if (error) console.error('[careers-gftv] application event:', error);
}

/**
 * Create or update the tracking row for a start click, and record the move.
 *
 * @param {string} jobId
 * @param {string} applicantId
 * @param {object|null} existing from fetchApplication
 * @returns {Promise<object>} the row as it now stands
 */
export async function startApplication(jobId, applicantId, existing) {
  if (!existing) {
    const { data, error } = await supabase
      .from(T.applications)
      .insert({ job_id: jobId, applicant_id: applicantId, status: 'started' })
      .select('id, status, started_at, applied_at, cooldown_until')
      .single();

    if (error) throw error;

    await writeApplicationEvent(data.id, null, 'started', 'applicant');
    return data;
  }

  const next = startStatusFor(existing);
  if (next === null) {
    // Nothing to change. The analytics row already records the click, and an
    // event row whose from and to are the same status is noise in a log an
    // admin reads to understand what happened.
    return existing;
  }

  const { data, error } = await supabase
    .from(T.applications)
    .update({
      status: next,
      // Reopening after a withdrawal clears both, so the row reads as a fresh
      // attempt rather than carrying the dates of the one that was pulled.
      applied_at: null,
      cooldown_until: null,
    })
    .eq('id', existing.id)
    .select('id, status, started_at, applied_at, cooldown_until')
    .single();

  if (error) throw error;

  await writeApplicationEvent(data.id, existing.status, next, 'applicant');
  return data;
}

/**
 * Record a confirmed application, per 7f.
 *
 * Called on a positive confirmation and nowhere else. The webhook in section 13
 * is the other caller phase 9 adds, which is why the source is a parameter.
 *
 * @param {object} application the current row
 * @param {'applicant'|'webhook'} source
 * @returns {Promise<object>} the row as it now stands
 */
export async function confirmApplication(application, source) {
  const now = new Date();

  // await, because cooldownUntil returns null when the cooldown is switched
  // off, and null is what goes in the column. Not now(), and not the
  // confirmation date.
  const until = await cooldownUntil(now);

  // Same rule as a start click: never move a row backwards. An admin who has
  // already shortlisted somebody does not want a late Yes in the modal
  // resetting them to 'submitted'. CONFIRMABLE rather than RESETTABLE, per the
  // note on the two lists.
  const moves = CONFIRMABLE.includes(application.status);
  const next = moves ? 'submitted' : application.status;

  const { data, error } = await supabase
    .from(T.applications)
    .update({
      status: next,
      applied_at: now.toISOString(),
      cooldown_until: until,
    })
    .eq('id', application.id)
    .select('id, status, started_at, applied_at, cooldown_until')
    .single();

  if (error) throw error;

  if (moves) {
    await writeApplicationEvent(
      data.id,
      application.status,
      next,
      source === 'webhook' ? 'webhook' : 'applicant'
    );
  }

  return data;
}

/* -------------------------------------------------------------------------
 * The analytics row behind a prompt
 * ---------------------------------------------------------------------- */

/**
 * The event type this whole flow is about.
 *
 * **Filter on it everywhere, from the first version.** Phase 8 starts writing
 * 'view' rows into the same table at response_state pending, and every query
 * here that forgets this filter would then put a "tell us what you think" modal
 * in front of everybody who merely read a posting. Nothing writes a view row
 * today, which is exactly why this is easy to leave out and impossible to
 * notice.
 */
export const APPLY_CLICK = 'apply_click';

/**
 * Log the handoff, per 7a step 2.
 *
 * One row per click rather than one per applicant, which is what makes the
 * funnel meaningful. did_apply false and response_state pending, always: this
 * records that somebody was handed over, never that they applied.
 *
 * @param {string} jobId
 * @param {string} applicantId
 * @param {string|null} referrer
 * @returns {Promise<{ id: string }>}
 */
export async function logApplyClick(jobId, applicantId, referrer) {
  const { data, error } = await supabase
    .from(T.analytics)
    .insert({
      job_id: jobId,
      applicant_id: applicantId,
      event_type: APPLY_CLICK,
      did_apply: false,
      response_state: 'pending',
      // No IP and no user agent, per section 6. Where the traffic came from is
      // enough, and it is capped so a long referrer cannot fill the column.
      referrer: referrer ? String(referrer).slice(0, 500) : null,
    })
    .select('id, created_at')
    .single();

  if (error) throw error;
  return data;
}

/**
 * The applicant's unanswered prompts, newest first.
 *
 * @param {string} applicantId
 * @param {{ jobId?: string, limit?: number }} [options]
 * @returns {Promise<object[]>} rows of id, job_id, created_at
 */
export async function fetchPending(applicantId, options = {}) {
  let query = supabase
    .from(T.analytics)
    .select('id, job_id, created_at')
    .eq('applicant_id', applicantId)
    .eq('event_type', APPLY_CLICK)
    .eq('response_state', 'pending')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 20);

  if (options.jobId) query = query.eq('job_id', options.jobId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * The applicant's own ratings for a set of postings, as a job id to score map.
 *
 * Never anybody else's, and never an average. A rating is admin facing per
 * migration 007, and a visible score would discourage applications to a role a
 * handful of people rated low.
 *
 * @param {string} applicantId
 * @param {string[]} jobIds
 * @returns {Promise<Map<string, number>>}
 */
export async function fetchOwnRatings(applicantId, jobIds) {
  const map = new Map();
  if (jobIds.length === 0) return map;

  const { data, error } = await supabase
    .from(T.ratings)
    .select('job_id, rating')
    .eq('applicant_id', applicantId)
    .in('job_id', jobIds);

  if (error) {
    // A rating that fails to load means the stars start empty, which is the
    // same thing they do for somebody who has not rated yet. Not worth failing
    // the request the applicant actually made.
    console.warn('[careers-gftv] own ratings:', error);
    return map;
  }

  for (const row of data ?? []) map.set(row.job_id, row.rating);
  return map;
}

/* -------------------------------------------------------------------------
 * The shape the client draws a button from
 * ---------------------------------------------------------------------- */

/**
 * One tracking row, as the posting page and the board read it.
 *
 * in_cooldown is resolved here rather than left to the client, because the
 * client cannot know whether the cooldown is switched off and comparing
 * cooldown_until to the clock would be wrong exactly when it matters.
 *
 * @param {object} application
 * @param {string|null} pendingId the applicant's unanswered prompt for this
 *        posting, if there is one
 */
export async function publicApplication(application, pendingId = null) {
  return {
    job_id: application.job_id ?? null,
    status: application.status,
    started_at: application.started_at ?? null,
    applied_at: application.applied_at ?? null,
    cooldown_until: application.cooldown_until ?? null,
    in_cooldown: await isInCooldown(application),
    pending_id: pendingId,
  };
}
