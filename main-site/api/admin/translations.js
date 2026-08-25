// /api/admin/translations
//
// Section 8.11, the queue of translation problems and the tooling to act on
// them.
//
//   GET                      the queue, filtered and paged, with the status counts
//   GET  ?id=<uuid>          one report, with the wording it is about
//   GET  ?view=audit         what is left untranslated in one language, per 8.11
//   GET  ?view=helpers       who holds the helper role, per 7i. Admins only
//   GET  ?view=helpers&search=  applicant accounts to grant it to. Admins only
//   POST { action: 'edit' }           rewrite one field of what it points at
//   POST { action: 'resolve' }        move it through the queue with a note
//   POST { action: 'grant_helper' }   grant the role in one language. Admins only
//   POST { action: 'revoke_helper' }  take it away. Admins only
//
// The audit is a read and nothing more: it has no actions of its own, because
// everything it finds is fixed in the editor or on the team and tag pages. It
// sits on this route rather than on one of its own because it is the second half
// of the same section and the same page, and because a route per tab would mean
// two places to keep the language handling in step.
//
// **Not admins only**, and that is the same call phase 8 made about analytics.
// 8.8 and 8.9 say admins only and give their reasons; 8.11 does not. A job
// poster whose posting reads wrongly in Chinese is exactly the person who should
// be able to fix the sentence, and everything they can change from here they can
// already change in the editor. Section 10 item 1's "an admin has full control"
// is about an admin overriding a poster's work, not about keeping a poster out.
//
// **The two helper actions are admins only, and nothing else here is.** 7i says
// the role is granted by an admin, and it is a different kind of act from
// working the queue: it hands somebody standing write access to every
// translation in a language, across every posting, rather than fixing one
// sentence. The tab is absent for a job poster, per deviation 34, and both
// actions refuse here regardless, because a hidden control stops nobody.
//
// **Nothing in the queue writes an audit row**, and that is deliberate rather
// than forgotten. Phase 7 set the line: what is logged is what changes somebody
// else's world, and what is not is an admin editing wording, "which is a row
// with an updated_at on it already". A resolution is stronger than that: 015
// stores resolved_by, resolved_at, and the note on the report itself, precisely
// "so a row cannot quietly leave the queue without an accountable trail". A
// second copy in the audit log would be a second place to look and a second
// place to disagree.
//
// **Granting and revoking are the exception, and both are logged.** They are
// squarely the first half of that line, and a revoke leaves nothing behind to
// read: migration 023 has no revoked state, so the row is deleted and the log is
// the only record that the role was ever held. That is why the reason is
// required in both directions rather than only on the way out.
//
// **An interface report is refused an edit here**, per 7i. The dictionaries are
// files; the wording is a code change and a deploy. The page says so, and this
// end refuses it as well, because a hidden control stops nobody.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireStaff } from '../_lib/session.js';
import {
  params,
  pageRange,
  enumParam,
  isAdmin,
  isUuid,
  defaultLocale,
  activeLocales,
} from '../_lib/admin.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';
import { supabase, T } from '../_lib/supabase.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
// The invite picker, reused rather than copied. 8.5's reader is already exactly
// what this needs and for the same reason: enough to be sure you have the right
// person, which is a name, a username, and a picture, and no account detail at
// all. Writing a second thin applicant search here would be two places to keep
// the same escaping decisions in step.
import { searchInviteApplicants } from '../_lib/invites.js';
import {
  PAGE_SIZE,
  REPORT_STATUSES,
  RESOLVED_STATUSES,
  TARGET_TYPES,
  ORIGINS,
  listReports,
  reportCounts,
  fetchReport,
  applyWording,
  resolveReport,
} from '../_lib/translation-queue.js';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_STATES,
  AUDIT_TARGETS,
  auditCounts,
  auditLocale,
  listNeedsTranslation,
} from '../_lib/translation-audit.js';
import {
  PAGE_SIZE as HELPER_PAGE_SIZE,
  fetchHelper,
  fetchHelperAccount,
  grantHelper,
  helperLocalesFor,
  listHelpers,
  revokeHelper,
} from '../_lib/translation-helpers.js';

/** Long enough for a paragraph of explanation, short of an essay. */
const NOTE_MAX = 2000;

/**
 * The ceiling on a corrected wording.
 *
 * A posting's description is the longest thing this can rewrite, and the column
 * is plain text with no limit of its own. This is a bound on a request rather
 * than an editorial rule, and it is set under readJson's 64KB body cap rather
 * than near it: Chinese is three bytes a character in UTF-8, so a limit counted
 * in characters has to leave room for the worst case or it refuses a valid
 * correction with a body-too-large rather than a field error.
 */
const WORDING_MAX = 12000;

/**
 * The ceiling on a grant or revoke reason.
 *
 * Shorter than a resolution note on purpose. This one is a sentence about a
 * person, read a year later off a list, and the dialog says as much: 8.8's
 * access reasons are bounded the same way and for the same reason.
 */
const HELPER_REASON_MAX = 300;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  if (await unavailable(res, 'admin_translations')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res, session);
  } catch (cause) {
    return failInternal(res, cause, 'admin translations');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res, session) {
  const search = params(req);
  const source = await defaultLocale();

  const id = search.get('id');
  if (id) {
    if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a report id.');

    const report = await fetchReport(id, source);
    if (!report) return fail(res, ERR.NOT_FOUND, 'That report could not be found.');

    return ok(res, { report, source_locale: source });
  }

  if (search.get('view') === 'audit') return await audit(res, search, source);
  if (search.get('view') === 'helpers') {
    if (!adminOnly(res, session)) return;
    return await helpers(res, search, source);
  }

  const { from, to, page, size } = pageRange(search, { size: PAGE_SIZE, max: 100 });

  const [{ rows, total }, counts] = await Promise.all([
    listReports({
      bucket: search.get('bucket') === 'all' ? 'all' : 'unfinished',
      status: enumParam(search, 'status', REPORT_STATUSES),
      // The language is checked against the query rather than a constant, so a
      // language added to gftvjobs_locales later filters without a deploy.
      locale: await localeParam(search),
      targetType: enumParam(search, 'target', TARGET_TYPES),
      origin: enumParam(search, 'origin', ORIGINS),
      from,
      to,
    }),
    reportCounts(),
  ]);

  return ok(res, {
    reports: rows,
    counts,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    source_locale: source,
  });
}

/**
 * A language code from the query string, checked against gftvjobs_locales.
 *
 * Not against LOCALES in validate.js, which is the hot path's fixed list. A
 * report may exist against a language that has since been deactivated, and an
 * admin filtering for it should still find it.
 */
async function localeParam(search) {
  const raw = (search.get('locale') ?? '').trim();
  if (!raw || !/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(raw)) return null;

  const { data, error } = await supabase.from(T.locales).select('code').eq('code', raw).maybeSingle();
  if (error) throw error;

  return data ? raw : null;
}

/**
 * The needs-translation audit, per 8.11.
 *
 * One language, chosen rather than filtered: the view crosses every active non
 * default language, and a list of all of them at once would need a language
 * column on every row and counts that answer nothing. The chosen code comes back
 * in the payload, so a page that asked for a language this site does not have
 * finds out what it was actually shown instead of mislabelling it.
 *
 * The languages come from activeLocales rather than from gftvjobs_locales
 * directly, unlike the queue's own filter above. The difference is deliberate:
 * the queue may be filtered by a language that has since been deactivated,
 * because a report against it still exists and still deserves an answer, while
 * there is nothing to audit in a language the site has stopped serving.
 */
async function audit(res, search, source) {
  const locales = await activeLocales();
  const chosen = auditLocale(search.get('locale'), locales);

  if (!chosen) {
    // One language configured, which is a real state on the day a second one is
    // being set up rather than an error. An empty list with a null language is
    // what the page reads to say so.
    return ok(res, {
      audit: [],
      counts: {},
      total: 0,
      page: 1,
      pages: 1,
      page_size: AUDIT_PAGE_SIZE,
      locale: null,
      source_locale: source,
    });
  }

  const { from, to, page, size } = pageRange(search, { size: AUDIT_PAGE_SIZE, max: 100 });
  const targetType = enumParam(search, 'target', AUDIT_TARGETS);
  const state = enumParam(search, 'state', AUDIT_STATES);

  const [{ rows, total }, counts] = await Promise.all([
    listNeedsTranslation({ locale: chosen.code, targetType, state, from, to }),
    auditCounts({ locale: chosen.code, targetType }),
  ]);

  return ok(res, {
    audit: rows,
    counts,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    locale: chosen.code,
    source_locale: source,
  });
}

/* -------------------------------------------------------------------------
 * Translation helpers, per 7i
 * ---------------------------------------------------------------------- */

/**
 * The admins only guard, written here rather than with requireAdmin.
 *
 * requireAdmin re-reads the session, and this route has already read one: the
 * rest of it is open to a job poster, so the guard is per view and per action
 * rather than at the door. Same 403 and the same sentence, so a caller cannot
 * tell the two apart.
 */
function adminOnly(res, session) {
  if (isAdmin(session.user)) return true;
  fail(res, ERR.FORBIDDEN, 'Only an admin can do that.');
  return false;
}

/**
 * Who holds the helper role, and who could be given it.
 *
 * The search is on the same view rather than on one of its own, like the queue's
 * ?id=: it is the same page asking a second question about the same subject, and
 * a separate view name would need the same admin guard written twice.
 */
async function helpers(res, search, source) {
  const term = search.get('search');
  if (term !== null) {
    const applicants = await searchInviteApplicants(term);
    // What each of them already helps with, so the picker states it rather than
    // inferring it from the page of the list that happens to be loaded.
    const held = await helperLocalesFor(applicants.map((applicant) => applicant.id));

    return ok(res, {
      applicants: applicants.map((applicant) => ({
        ...applicant,
        helps_with: held.get(applicant.id) ?? [],
      })),
    });
  }

  const locales = await activeLocales();
  const { from, to, page, size } = pageRange(search, { size: HELPER_PAGE_SIZE, max: 100 });

  const { rows, total } = await listHelpers({
    locale: helperLocale(search.get('locale'), locales),
    from,
    to,
  });

  return ok(res, {
    helpers: rows,
    total,
    page,
    page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    // The languages the role can be granted in, which is every active language
    // except the default one. The default is what everything is translated
    // *from*, and 014's own check constraint refuses a translation row for it,
    // so a helper in English would be somebody with a role over nothing.
    grantable: locales.filter((locale) => !locale.is_default),
    source_locale: source,
  });
}

/**
 * The language a filter or a grant is about.
 *
 * Checked against the active languages rather than gftvjobs_locales, unlike the
 * queue's own filter: a report against a deactivated language still deserves an
 * answer, while granting somebody a role in a language the site has stopped
 * serving is a role over nothing.
 */
function helperLocale(wanted, locales) {
  const code = String(wanted ?? '').trim();
  if (!code) return null;

  const found = locales.find((locale) => locale.code === code && !locale.is_default);
  return found ? found.code : null;
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['edit', 'resolve', 'grant_helper', 'revoke_helper'];

/** The two that are about a person rather than about a report. */
const HELPER_ACTIONS = ['grant_helper', 'revoke_helper'];

/** Why an edit was refused, as a sentence rather than a code the page invents. */
const REFUSALS = {
  interface_is_code:
    'An interface string lives in assets/i18n and is changed by editing that file and deploying, not from here.',
  not_editable: 'That part cannot be rewritten from this page. Open it in the editor instead.',
  cannot_be_blank: 'That one cannot be left empty.',
  needs_name_first: 'Write the name in this language before its description.',
};

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

  if (HELPER_ACTIONS.includes(action)) {
    if (!adminOnly(res, session)) return;
    return await helperAction(res, session, action, body, () =>
      recordFailures('admin', subjects, LIMITS.admin)
    );
  }

  const reportId = String(body.report_id ?? '');
  if (!isUuid(reportId)) return fail(res, ERR.BAD_REQUEST, 'That is not a report id.');

  const source = await defaultLocale();
  const report = await fetchReport(reportId, source);
  if (!report) return fail(res, ERR.NOT_FOUND, 'That report could not be found.');

  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  if (action === 'edit') return edit(res, report, body, source, done);
  return resolve(res, session, report, body, source, done);
}

/**
 * Rewrite the wording a report is about.
 *
 * **An edit is not a resolution**, and the two are separate requests on purpose.
 * 8.11 makes the note the thing that closes a report, because "the reporter took
 * the trouble to tell you; closing it silently teaches them not to bother next
 * time". Folding the two together would make the note something an admin skips
 * by finishing the edit, which is exactly the failure the requirement exists to
 * prevent. The page moves the status straight to fixed after a successful edit
 * so the second step is one sentence and a click, rather than a thing to
 * remember.
 */
async function edit(res, report, body, source, done) {
  // **The field is the report's own, never the caller's.** This page fixes what
  // somebody complained about; anything else on that row is the editor's job and
  // has the editor's validation behind it. Taking the field from the request
  // would make this a general purpose single field writer that happens to need a
  // report id, which is not what 8.11 asks for and is a wider write surface than
  // the queue needs.
  // **The target type is tested before the field**, and the order is the whole
  // point of these six lines. An interface report names a key rather than a
  // field, so testing the field first sent every one of them out through the
  // sentence below, which says "Open it in the editor instead" — and there is no
  // editor for an interface string, which is precisely what 7i refuses to build.
  // The refusal held either way; the advice was wrong, and `interface_is_code`
  // in REFUSALS was unreachable for the ordinary case. Found by the run of
  // 25 August 2026, item 63.
  if (report.target_type === 'interface') {
    return fail(res, ERR.BAD_REQUEST, REFUSALS.interface_is_code, {
      details: { text: FIELD.INVALID, reason: 'interface_is_code' },
    });
  }

  const field = report.field ?? '';
  if (!field) {
    return fail(res, ERR.BAD_REQUEST, 'That report does not name a part to rewrite.', {
      details: { text: FIELD.INVALID, reason: 'not_editable' },
    });
  }

  const wording = validateText(body.text, WORDING_MAX);
  if (!wording.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That wording could not be saved.', {
      details: { text: wording.code },
    });
  }

  const result = await applyWording(
    {
      target_type: report.target_type,
      target_id: report.target_id,
      locale: report.locale,
    },
    field,
    wording.value,
    source
  );

  if (!result.ok) {
    return fail(res, ERR.BAD_REQUEST, REFUSALS[result.reason] ?? 'That could not be changed.', {
      details: { text: FIELD.INVALID, reason: result.reason },
    });
  }

  await done();

  // The report is re-read so the panel redraws against what is now stored
  // rather than against what the browser hoped it wrote. It also re-runs the
  // anchor check, so an annotation whose quote the edit has just removed shows
  // as detached at once instead of at the next page load.
  const updated = await fetchReport(report.id, source);
  return ok(res, { report: updated, saved: true });
}

/**
 * Move a report through the queue.
 *
 * The note is required on fixed and rejected, per 8.11, and optional on
 * accepted, which is the state for work in progress rather than a resolution.
 * Moving back to open clears the note entirely: a stale resolution note is read
 * by the reporter through api/translations/mine.js, and one left behind on a
 * reopened report would tell somebody they had been answered when they had not.
 */
async function resolve(res, session, report, body, source, done) {
  const status = String(body.status ?? '').trim();
  if (!REPORT_STATUSES.includes(status)) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a state a report can be in.', {
      details: { status: FIELD.INVALID },
    });
  }

  const note = validateText(body.note, NOTE_MAX, {
    required: RESOLVED_STATUSES.includes(status),
  });
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'Say what happened before closing this.', {
      details: { note: note.code },
    });
  }

  await resolveReport(report.id, {
    status,
    note: note.value,
    staffId: session.user.id,
  });

  await done();

  const updated = await fetchReport(report.id, source);
  return ok(res, { report: updated });
}

/**
 * Grant or revoke the helper role in one language, per 7i.
 *
 * **A reason is required in both directions**, which is one more than 7i asks
 * for: it says granting requires one. Revoking gets the same requirement because
 * of what a revoke does here — migration 023 has no revoked state, so the row is
 * deleted and the audit row is the only record left that the role was ever held.
 * 8.8 could afford an optional reason on the way in because its denied row
 * survives to be read; this cannot.
 *
 * **A revoke does not need the account to still exist.** Deleting an applicant
 * cascades their helper rows, so the ordinary case is handled by the database,
 * but the row is what is being deleted here and reading the account first would
 * turn a tidy up into a 404.
 */
async function helperAction(res, session, action, body, done) {
  const userId = String(body.user_id ?? '');
  if (!isUuid(userId)) return fail(res, ERR.BAD_REQUEST, 'That is not an account id.');

  const locales = await activeLocales();
  const locale = helperLocale(body.locale, locales);
  if (!locale) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a language somebody can help with.', {
      details: { locale: FIELD.INVALID },
    });
  }

  const reason = validateText(body.reason, HELPER_REASON_MAX, { required: true });
  if (!reason.ok) {
    return fail(res, ERR.BAD_REQUEST, 'Say why, so whoever reads this list later knows.', {
      details: { reason: reason.code },
    });
  }

  if (action === 'revoke_helper') {
    const removed = await revokeHelper(userId, locale);
    if (!removed) {
      return fail(res, ERR.NOT_FOUND, 'That account does not help with that language.');
    }

    await done();
    await auditStaff(
      session.user,
      AUDIT.TRANSLATION_HELPER_REVOKED,
      { locale },
      {
        targetTable: T.translationHelpers,
        targetId: userId,
        reason: reason.value,
      }
    );

    return ok(res, { revoked: true, locale });
  }

  const account = await fetchHelperAccount(userId);
  if (!account) return fail(res, ERR.NOT_FOUND, 'That account could not be found.');

  // A deactivated account cannot sign in, so granting it the role would put
  // somebody on the list who cannot open the helper area. Refused rather than
  // warned about: 8.9 is where an account is reactivated, and doing it in the
  // other order costs nothing.
  if (!account.is_active) {
    return fail(res, ERR.BAD_REQUEST, 'That account is deactivated. Reactivate it first.', {
      details: { user_id: FIELD.INVALID, reason: 'account_deactivated' },
    });
  }

  const existing = await fetchHelper(userId, locale);

  await grantHelper({
    userId,
    locale,
    note: reason.value,
    staffId: session.user.id,
  });

  await done();
  await auditStaff(
    session.user,
    AUDIT.TRANSLATION_HELPER_GRANTED,
    // Whether this was a first grant or a rewritten reason, because the row
    // itself no longer says: a second grant re-stamps granted_at, so the log is
    // the only place the difference survives.
    { locale, username: account.username, regranted: Boolean(existing) },
    {
      targetTable: T.translationHelpers,
      targetId: userId,
      reason: reason.value,
    }
  );

  return ok(res, { granted: true, locale, regranted: Boolean(existing) });
}
