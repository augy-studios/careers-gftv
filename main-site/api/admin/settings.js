// /api/admin/settings
//
// Section 8.10: "portal title, hero copy, featured job selection, application
// open or closed global toggle. The portal title and hero copy are edited in
// both languages."
//
//   GET   every editable setting, the active languages, and the postings the
//         featured picker can choose from
//   POST  { action: 'save'|'applications' }
//
// This is the write half settings.js has been waiting for since migration 029.
// The read half already exists and is used on every apply, so nothing here
// invents a second way to read a setting: putSetting is the one writer, and it
// drops the cache so the next read goes to the table.
//
// Four things this route is careful about, and each one is a sentence the page
// also has to say out loud, because a setting that changes silently is worse
// than one that refuses:
//
//   **The cooldown at zero switches the feature off**, per the decision table,
//   and existing dates are ignored rather than cleared. Turning it back on
//   restores what was there, which is why nothing here writes to
//   gftvjobs_applications.
//
//   **Changing the cooldown does not move a cooldown already being served.**
//   cooldown_until is stored on the row when an application is confirmed, so a
//   change here only reaches the next person to apply.
//
//   **applications_open takes about a minute to reach a page somebody already
//   has open**, per deviation 16 and CACHE_MS in settings.js. It is not
//   instant, and an admin closing the board during an incident needs to know
//   that rather than reload twice and assume it failed.
//
//   **A featured posting that is not published is not featured.** The picker
//   only offers published postings, and the saved list is filtered again on the
//   way in, because a posting can be unpublished after it was chosen.
//
// Not admins only, per 8.10 and the same reasoning as deviation 40: the
// specification marks 8.8 and 8.9 as admins only and marks nothing else, and a
// job poster editing the hero line is the person the page is for. Both
// directions of the applications toggle are audited with the actor, so a change
// nobody expected has a name on it.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { isUuid, params, activeLocales, defaultLocale } from '../_lib/admin.js';
import { allSettings, putSetting, DEFAULT_REAPPLY_COOLDOWN_DAYS } from '../_lib/settings.js';
import { unavailable } from '../_lib/maintenance.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

/**
 * The settings this page edits, and nothing else.
 *
 * gftvjobs_settings also holds feature_overrides, which belongs to 8.12 and its
 * own page, and will hold whatever phase 9 adds. An allowlist rather than "every
 * row in the table" is what stops this form becoming a raw editor for a table
 * that other features depend on the shape of.
 */
const TEXT_SETTINGS = Object.freeze({
  portal_title: { max: 80, required: true },
  hero_heading: { max: 120, required: true },
  hero_body: { max: 400, required: false },
});

/** Matches the ceiling in migration 029's check constraint. */
const MAX_COOLDOWN_DAYS = 3650;

/**
 * How many postings may be featured at once.
 *
 * The home page shows a row of them, and a "featured" list containing most of
 * the board is a list nobody reads as a recommendation. Not a database
 * constraint: the column is a jsonb array and this is an editorial limit, which
 * is the kind that changes without a migration.
 */
const MAX_FEATURED = 6;

/** How many postings the picker offers. Published only, newest first. */
const PICKER_LIMIT = 100;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  // Off means off, including the API, per 0c. The dashboard greys the section
  // out as well, and a stale tab is exactly the case a disabled button misses.
  if (await unavailable(res, 'admin_settings')) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin settings');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);

  const [settings, locales, base] = await Promise.all([
    // Fresh, not the minute old cache. This is the page somebody is editing,
    // and showing them a value from before their last save would look exactly
    // like a save that did not work.
    allSettings({ refresh: true }),
    activeLocales(),
    defaultLocale(),
  ]);

  const values = settings ?? {};

  const featuredIds = Array.isArray(values.featured_job_ids)
    ? values.featured_job_ids.filter((id) => isUuid(id))
    : [];

  const [featured, picker] = await Promise.all([
    postingsByIds(featuredIds),
    search.get('picker') === 'false' ? [] : publishedPostings(),
  ]);

  // In the admin's chosen order rather than the database's, and dropping
  // anything that has since been unpublished or deleted. The page says how many
  // were dropped rather than quietly showing a shorter list.
  const chosen = featuredIds
    .map((id) => featured.get(id))
    .filter((row) => row !== undefined);

  return ok(res, {
    locales,
    default_locale: base,
    settings: {
      portal_title: localeObject(values.portal_title),
      hero_heading: localeObject(values.hero_heading),
      hero_body: localeObject(values.hero_body),
      featured_job_ids: chosen.map((row) => row.id),
      applications_open: values.applications_open !== false,
      reapply_cooldown_days: cooldownValue(values.reapply_cooldown_days),
    },
    featured: chosen,
    // What was saved but can no longer be shown, so the difference is visible
    // rather than being read as somebody else having edited the list.
    featured_unavailable: featuredIds.length - chosen.length,
    postings: picker,
    limits: {
      max_featured: MAX_FEATURED,
      max_cooldown_days: MAX_COOLDOWN_DAYS,
      default_cooldown_days: DEFAULT_REAPPLY_COOLDOWN_DAYS,
    },
  });
}

/**
 * A per locale setting as an object, whatever shape the row is in.
 *
 * Migration 018 turned the three text settings from plain strings into per
 * locale objects and rewrote the seeded rows, but a value written by hand
 * before that, or by somebody editing the table directly, is still a string.
 * Reading it as the default language's wording is the honest interpretation:
 * that is what it was.
 */
function localeObject(value) {
  if (typeof value === 'string') return { en: value };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter(([, text]) => typeof text === 'string')
    );
  }
  return {};
}

function cooldownValue(raw) {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0 || days > MAX_COOLDOWN_DAYS) {
    return DEFAULT_REAPPLY_COOLDOWN_DAYS;
  }
  return days;
}

/** The postings the featured picker offers: published, newest first. */
async function publishedPostings() {
  const { data, error } = await supabase
    .from(T.jobs)
    .select('id, title, slug, status, published_at, closes_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(PICKER_LIMIT);

  if (error) throw error;
  return data ?? [];
}

/**
 * The chosen postings, by id, keeping only the ones still publishable.
 *
 * A posting closed or archived after being featured is dropped here rather than
 * on the home page, so the admin sees the same list the reader will.
 */
async function postingsByIds(ids) {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from(T.jobs)
    .select('id, title, slug, status, published_at, closes_at')
    .in('id', ids)
    .eq('status', 'published');

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['save', 'applications'];

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

  return action === 'save'
    ? save(res, session, body, done)
    : toggleApplications(res, session, body, done);
}

/**
 * Save the portal title, the hero copy, the featured list, and the cooldown.
 *
 * Everything is validated before anything is written. Five settings are five
 * rows and there is no transaction across them, so a save that fails halfway
 * would leave the site with a new title and an old hero line, which is the one
 * outcome worth avoiding here.
 */
async function save(res, session, body, done) {
  const locales = await activeLocales();
  const base = await defaultLocale();
  const codes = locales.map((locale) => locale.code);
  const details = {};

  const text = {};

  for (const [key, rules] of Object.entries(TEXT_SETTINGS)) {
    const given = body[key];
    if (given === undefined) continue;

    if (!given || typeof given !== 'object' || Array.isArray(given)) {
      details[key] = FIELD.INVALID;
      continue;
    }

    const written = {};

    for (const [locale, value] of Object.entries(given)) {
      if (!codes.includes(locale)) {
        details[`${key}.${locale}`] = FIELD.INVALID;
        continue;
      }

      const checked = validateText(value, rules.max);
      if (!checked.ok) {
        details[`${key}.${locale}`] = checked.code;
        continue;
      }

      // A blank translation is an absent one rather than an empty string, so
      // localisedSetting falls back to the default language instead of
      // rendering nothing. That fallback is the whole reason 018 made these
      // objects rather than columns.
      if (checked.value) written[locale] = checked.value;
    }

    // 8.10 edits these "in both languages", and the default language is the one
    // every reader falls back to. A portal title nobody wrote is a header with
    // a blank in it.
    if (rules.required && !written[base]) {
      details[`${key}.${base}`] = FIELD.REQUIRED;
    }

    text[key] = written;
  }

  let featured;
  if (body.featured_job_ids !== undefined) {
    const ids = Array.isArray(body.featured_job_ids) ? body.featured_job_ids : null;

    if (ids === null || ids.some((id) => !isUuid(id))) {
      details.featured_job_ids = FIELD.INVALID;
    } else if (ids.length > MAX_FEATURED) {
      details.featured_job_ids = FIELD.TOO_LONG;
    } else {
      // Deduplicated in the order given: the same posting twice is a slip, and
      // the second one would render as a second card of the same role.
      const unique = [...new Set(ids)];
      const publishable = await postingsByIds(unique);
      const missing = unique.filter((id) => !publishable.has(id));

      if (missing.length > 0) {
        details.featured_job_ids = FIELD.INVALID;
      } else {
        featured = unique;
      }
    }
  }

  let cooldown;
  if (body.reapply_cooldown_days !== undefined) {
    const days = Number(body.reapply_cooldown_days);
    if (!Number.isInteger(days) || days < 0 || days > MAX_COOLDOWN_DAYS) {
      details.reapply_cooldown_days = FIELD.INVALID;
    } else {
      cooldown = days;
    }
  }

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'Those settings could not be saved.', { details });
  }

  const changed = [];

  for (const [key, value] of Object.entries(text)) {
    await putSetting(key, value, { staffId: session.user.id });
    changed.push(key);
  }

  if (featured !== undefined) {
    await putSetting('featured_job_ids', featured, { staffId: session.user.id });
    changed.push('featured_job_ids');
  }

  if (cooldown !== undefined) {
    await putSetting('reapply_cooldown_days', cooldown, { staffId: session.user.id });
    changed.push('reapply_cooldown_days');
  }

  if (changed.length > 0) {
    await auditStaff(
      session.user,
      AUDIT.SETTING_CHANGED,
      {
        keys: changed,
        // The cooldown is the one value worth having in the log rather than
        // only in the row: it decides how long somebody is locked out of
        // reapplying, and "it was 90 last month" is a question somebody will
        // ask. The wording settings are not copied here, because a hero line
        // in two languages in every audit row is noise.
        ...(cooldown !== undefined ? { reapply_cooldown_days: cooldown } : {}),
        ...(featured !== undefined ? { featured_count: featured.length } : {}),
      },
      { targetTable: T.settings }
    );
  }

  await done();
  return ok(res, { saved: changed });
}

/**
 * The global applications toggle, per 8.10.
 *
 * Its own action rather than a field on the save above, and its own audit
 * action rather than a setting_changed row, because it is not an editorial
 * change: it closes the board. 8.12 is explicit that this and a maintenance
 * flip are never merged, and the two read completely differently to somebody
 * turned away — one is policy, the other is something broken — so the log has
 * to be able to tell them apart at a glance too.
 */
async function toggleApplications(res, session, body, done) {
  if (typeof body.open !== 'boolean') {
    return fail(res, ERR.BAD_REQUEST, 'Say whether applications are open.', {
      details: { open: FIELD.REQUIRED },
    });
  }

  const open = body.open;
  const note = validateText(body.note, 300);
  if (!note.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That note could not be saved.', {
      details: { note: note.code },
    });
  }

  await putSetting('applications_open', open, { staffId: session.user.id });

  await auditStaff(
    session.user,
    open ? AUDIT.APPLICATIONS_OPENED : AUDIT.APPLICATIONS_CLOSED,
    // The note is optional, per 8.10, and is kept when it is given. Closing the
    // board is the kind of thing somebody asks about a fortnight later, and the
    // sentence written at the time is a better answer than the timestamp.
    { note: note.value ?? null },
    { targetTable: T.settings }
  );

  await done();
  return ok(res, { applications_open: open });
}
