// /api/translations/helper
//
// Section 7i's helper area, the applicant half of the translation helper role.
//
//   GET                                   which languages this account may help
//                                         with. Any applicant may ask; an empty
//                                         list is the answer for almost everybody
//   GET  ?view=audit&locale=              what is left to translate in one of
//                                         them, per 7i's "see what is missing"
//   GET  ?view=target&type=&id=&locale=   one thing, with the source wording
//                                         beside the translation
//   GET  ?view=search&locale=&q=          anything translatable, by its source
//                                         name, for the rows the audit leaves out
//   POST { action: 'save' }               write one translation row
//
// **The roster is the one branch with no locale guard**, and that is deliberate
// rather than an oversight. "What may I help with" is a question any signed in
// applicant may ask about their own account, and the honest answer for nearly all
// of them is nothing. Everything else on this route takes a language and checks
// the (user_id, locale) row for it, per 7i: the role is granted per language, and
// "as soon as a third language exists, someone who reads Chinese should not be
// approving Tamil".
//
// **This is the applicant realm, end to end.** 7i is explicit that helpers
// "deliberately do not go through gftvhello or the admin access overlay: the
// person best placed to fix the Chinese has no reason to be a GFTV staff
// member". So nothing here reads a staff session, and an admin who is also a
// helper is one because somebody granted their applicant account the role.
//
// **is_ready is not a parameter of anything here.** 7i: "They cannot make a
// translation live. Only an admin sets is_ready, which is the flag readers depend
// on. Access can therefore be granted before trust is." The page says so and this
// end has no way to write it, which is the half that counts.
//
// **The audit is translation-audit.js, unchanged.** Part 7 split that file out of
// the queue for exactly this: 8.11's tab and this area want the same list scoped
// to one language, and 7i says so in as many words, "the same audit view as 8.11,
// scoped to their language and without the admin controls". A second
// implementation would be a second place for the ordering to drift.
//
// **Nothing here writes an audit row.** Phase 7's line was that what is logged is
// what changes somebody else's world rather than somebody editing wording, "which
// is a row with an updated_at on it already". Since migration 034 it is a row
// with an updated_at and an updated_by, which is a better record than a log line:
// it says which row and who last wrote it. Granting the role is what gets logged,
// in both directions, and that is 8.11's half.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireApplicant } from '../_lib/session.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import { FIELD } from '../_lib/validate.js';
import { searchParams } from '../_lib/jobs.js';
import { isUuid } from '../_lib/job-detail.js';
// The cached read of gftvjobs_locales and the two query string helpers, which
// live in admin.js because phase 7 needed them first. Imported rather than
// copied: a second cache of the same table is a second answer to "which
// languages does this site have", and nothing else in that file is touched here.
import { activeLocales, pageRange, enumParam } from '../_lib/admin.js';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_STATES,
  AUDIT_TARGETS,
  auditCounts,
  listNeedsTranslation,
} from '../_lib/translation-audit.js';
import {
  HELPER_TARGETS,
  checkHelperFields,
  fetchTranslationTarget,
  grantedLocales,
  saveTranslation,
  searchTranslatable,
} from '../_lib/helper-area.js';

/** How long a search term may be. A name, not a paragraph. */
const SEARCH_MAX = 80;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  // 8.12's shared guard, and the reason this feature has its own key in the
  // map: the helper area and the annotation layer are switched off separately,
  // because one misbehaving is not a reason to take the other down.
  if (await unavailable(res, 'translation_helpers')) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res, session);
  } catch (cause) {
    return failInternal(res, cause, 'helper area');
  }
}

/* -------------------------------------------------------------------------
 * The guard
 * ---------------------------------------------------------------------- */

/**
 * The language this request is about, checked against the account's own grants.
 *
 * Answers the request and returns null when the caller does not hold the role in
 * it, which covers three cases with one sentence: no grant at all, a grant in a
 * different language, and a grant in a language the site has stopped serving.
 * Telling them apart on the wire would be telling somebody which languages exist
 * to be granted, and the page has the roster for the only distinction that
 * matters.
 *
 * @returns {Promise<{ code: string } | null>}
 */
async function requireGranted(res, session, wanted) {
  const locales = await activeLocales();
  const granted = await grantedLocales(session.user.id, locales);

  const code = String(wanted ?? '').trim();
  const found = granted.find((locale) => locale.code === code);

  if (!found) {
    fail(
      res,
      ERR.FORBIDDEN,
      'You do not hold the translation helper role for that language.',
      { details: { locale: FIELD.INVALID, reason: 'not_a_helper' } }
    );
    return null;
  }

  return found;
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res, session) {
  const search = searchParams(req);
  const view = search.get('view');

  if (!view) return await roster(res, session);

  const granted = await requireGranted(res, session, search.get('locale'));
  if (!granted) return;

  if (view === 'audit') return await audit(res, search, granted);
  if (view === 'target') return await target(res, search, granted);
  if (view === 'search') return await find(res, search, granted);

  return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.');
}

/**
 * What this account may help with.
 *
 * The whole payload for somebody who holds nothing, which is what the account
 * navigation reads to decide whether to offer the area at all. An empty list is a
 * fact rather than a refusal, so this branch answers 200 for every signed in
 * applicant: a 403 here would make "you are not a helper" indistinguishable from
 * "something went wrong" on every account page in the site.
 */
async function roster(res, session) {
  const locales = await activeLocales();
  const granted = await grantedLocales(session.user.id, locales);

  return ok(res, { locales: granted });
}

/**
 * What is left to translate in one language, per 7i.
 *
 * 8.11's own audit, scoped to the one language this caller holds and with no
 * controls of its own. The state is a filter with a count beside it rather than
 * an order, for the reason translation-audit.js gives: PostgREST has no CASE in
 * an order clause, so ordering on the state column would give drafted, missing,
 * thin, which is alphabetical and meaningless.
 */
async function audit(res, search, granted) {
  const { from, to, page, size } = pageRange(search, { size: AUDIT_PAGE_SIZE, max: 100 });
  const targetType = enumParam(search, 'target', AUDIT_TARGETS);
  const state = enumParam(search, 'state', AUDIT_STATES);

  const [{ rows, total }, counts] = await Promise.all([
    listNeedsTranslation({ locale: granted.code, targetType, state, from, to }),
    auditCounts({ locale: granted.code, targetType }),
  ]);

  return ok(res, {
    audit: rows,
    counts,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    locale: granted.code,
  });
}

/** One thing to translate, with the source wording beside it. */
async function target(res, search, granted) {
  const targetType = enumParam(search, 'type', HELPER_TARGETS);
  const targetId = search.get('id');

  if (!targetType || !isUuid(targetId ?? '')) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something to translate.');
  }

  const result = await fetchTranslationTarget({
    targetType,
    targetId,
    locale: granted.code,
  });

  if (!result.ok) {
    // Archived and deleted are the same answer to the caller. A helper has no
    // business learning that a posting exists but has been taken off the board,
    // and the audit does not list one either.
    return fail(res, ERR.NOT_FOUND, 'That is not something you can translate.');
  }

  return ok(res, { target: result.target });
}

/** Anything translatable, by its name in the source language. */
async function find(res, search, granted) {
  const term = String(search.get('q') ?? '').trim().slice(0, SEARCH_MAX);
  const rows = await searchTranslatable(granted.code, term);

  return ok(res, { results: rows, locale: granted.code });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

/** Why a save was refused, as a sentence rather than a code the page invents. */
const REFUSALS = {
  unknown_target: 'That is not something this page can write.',
  nothing_to_save: 'Nothing was changed, so there was nothing to save.',
  cannot_be_blank: 'That one cannot be left empty in this language.',
  live_needs_body:
    'This translation is live, so it needs its title, summary, and description in this language. Ask an admin to unpublish it if you need to start again.',
};

async function write(req, res, session) {
  const body = await readJson(req, res);
  if (body === null) return;

  if (String(body.action ?? '').trim() !== 'save') {
    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const granted = await requireGranted(res, session, body.locale);
  if (!granted) return;

  const targetType = HELPER_TARGETS.includes(String(body.type ?? '')) ? String(body.type) : null;
  const targetId = String(body.id ?? '');

  if (!targetType || !isUuid(targetId)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not something to translate.');
  }

  // Per account rather than per address, like the apply bucket and for the same
  // reason: GFTV runs stands at conventions, where a room shares one address.
  // Counted on success, because there is no secret being guessed here and what is
  // worth bounding is how many rows one account can rewrite in an hour.
  const subjects = [subjectForUser('applicant', session.user.id)];
  if (await limited(res, 'translate', subjects)) return;

  // The thing being written has to exist, and has to be one this area may open.
  // Checked before the fields, so an archived posting is a 404 rather than a
  // validation pass followed by an insert against a row nobody may touch.
  const existing = await fetchTranslationTarget({
    targetType,
    targetId,
    locale: granted.code,
  });

  if (!existing.ok) {
    return fail(res, ERR.NOT_FOUND, 'That is not something you can translate.');
  }

  // An object or nothing. `in` throws on a primitive, and a body is whatever
  // somebody sent rather than whatever the page sends.
  const wanted = body.values && typeof body.values === 'object' ? body.values : {};

  const { values, details } = checkHelperFields(targetType, wanted);
  if (details) {
    return fail(res, ERR.BAD_REQUEST, 'That could not be saved.', { details });
  }

  const saved = await saveTranslation({
    targetType,
    targetId,
    locale: granted.code,
    values,
    userId: session.user.id,
  });

  if (!saved.ok) {
    return fail(res, ERR.BAD_REQUEST, REFUSALS[saved.reason] ?? 'That could not be saved.', {
      details: { ...(saved.details ?? {}), reason: saved.reason },
    });
  }

  await recordFailures('translate', subjects, LIMITS.translate);

  // Read back rather than echoed. The page redraws against what is stored, which
  // is what shows a helper that their edit created the row, and what shows the
  // ready flag they cannot change still sitting where it was.
  const updated = await fetchTranslationTarget({
    targetType,
    targetId,
    locale: granted.code,
  });

  return ok(res, {
    target: updated.ok ? updated.target : null,
    created: saved.created,
  });
}
