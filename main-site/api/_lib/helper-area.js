// The helper area, section 7i. The applicant half of the translation helper
// role, whose admin half is translation-helpers.js.
//
// 7i grants a helper two things and refuses them a third:
//
//   "Edit any translation row in their language, freely and without approval."
//   "See what is missing: every posting, department, and tag with no
//    translation in their language, and every translation started but not
//    ready. This is the same audit view as 8.11, scoped to their language and
//    without the admin controls."
//   "**They cannot make a translation live.** Only an admin sets is_ready,
//    which is the flag readers depend on."
//
// The audit half is not here. It is translation-audit.js, which part 7 split out
// of the queue for exactly this reason: the same list, scoped to one language, is
// what 8.11's tab and this area both need, and a second copy would be a second
// place for the ordering and the state names to drift. This file is the editing
// half and the guard.
//
// Seven things in it are decisions rather than plumbing, and each one is easy to
// undo by accident:
//
//   **The guard is a row, never a boolean.** gftvjobs_translation_helpers has a
//   primary key of (user_id, locale), per 7i: "As soon as a third language
//   exists, someone who reads Chinese should not be approving Tamil, and a
//   single boolean would let them." So every read and every write in this file
//   takes a locale and checks that exact pair.
//
//   **is_ready is not in any list here**, and that is the whole of 7i's
//   "access can be granted before trust is". A row this file creates is created
//   unready and inherits nothing; a row that is already ready stays ready and
//   this file will not blank the three fields migration 014's check constraint
//   needs, which is a field error rather than a constraint error a helper cannot
//   read.
//
//   **The form URL, the prefill map, and the response sheet are not editable
//   here, though they are columns on the translation row.** A helper is a
//   language speaker rather than staff, and those three decide where an
//   applicant's details are sent. 7i is about wording. This is the one
//   allowlist in the file whose absence would be a real hole rather than a
//   missing feature.
//
//   **The base row is never written.** A helper edits their language, never the
//   source. The admin queue can rewrite the default language because 8.11 is
//   explicit that "the English can be the wrong one"; a helper reporting bad
//   English uses 7h's form like anybody else.
//
//   **The field table is this file's own**, and not imported from
//   admin-jobs.js. That is the same call admin-jobs.js itself makes about
//   job-detail.js's PUBLIC_COLUMNS: an allowlist exists so that a payload
//   cannot be widened by an edit to shaping code somewhere else, and two
//   allowlists that cannot grow into each other are worth more than one that is
//   shared. The lengths match the constants in admin-jobs.js and in the two
//   reference CRUD routes, and the two the database actually enforces, the
//   og_description ceiling and a blank name, are enforced here as well so a
//   helper gets a sentence rather than a 500.
//
//   **An edit writes updated_by, every time.** Migration 034 exists for that
//   column and 8.11's helper list is built around it: "what each has drafted"
//   had no answer in this database until it existed. A save that forgot it would
//   leave the admin roster reading a dash forever and nobody would notice,
//   because a dash is what it correctly shows for a column nothing has written.
//
//   **This file writes no audit row and the route above it writes one on every
//   save.** The split is deliberate rather than an omission here: what to log is
//   a decision about an action, and this file is the shape of a row. The
//   reasoning for logging a helper's edit at all, when 8.11's queue logs nothing
//   an admin edits, is on AUDIT.TRANSLATION_EDITED in audit.js — the short of it
//   is that an admin leaves a staff session behind them and a helper leaves an
//   applicant cookie and one column.

import { supabase, T } from './supabase.js';
import { FIELD, validateText } from './validate.js';

/** The three things 7i lets a helper translate. Interface strings are files. */
export const HELPER_TARGETS = Object.freeze(['job', 'department', 'tag']);

/**
 * The wording a helper may write, per target type, with its ceiling.
 *
 * Ordered as the page draws them, which is the order a reader meets them on a
 * posting rather than the column order of the table.
 *
 * `sections` is not in here. It is a jsonb array rather than a string and has
 * its own validator below, because the admin queue's own refusal to edit one
 * through a single textarea is about a textarea rather than about sections: this
 * area gets the same builder the job editor has, since a helper with no way to
 * translate a section would have a row on their list they could never clear.
 */
const WORDING = Object.freeze({
  job: Object.freeze([
    { name: 'title', max: 200 },
    { name: 'summary', max: 500, multiline: true },
    { name: 'description', max: 20000, multiline: true, markdown: true },
    { name: 'responsibilities', max: 20000, multiline: true, markdown: true },
    { name: 'requirements', max: 20000, multiline: true, markdown: true },
    { name: 'nice_to_have', max: 20000, multiline: true, markdown: true },
    { name: 'location', max: 120 },
    { name: 'compensation_note', max: 500, multiline: true },
    // 300 is migration 014's own check constraint, not a preference.
    { name: 'og_description', max: 300, multiline: true },
  ]),
  department: Object.freeze([
    { name: 'name', max: 80 },
    { name: 'description', max: 500, multiline: true },
  ]),
  tag: Object.freeze([
    { name: 'name', max: 60 },
    { name: 'description', max: 300, multiline: true },
  ]),
});

/** The sections builder's bounds, matching migration 019's validator. */
const HEADING_MAX = 120;
const SECTION_BODY_MAX = 20000;
const MAX_SECTIONS = 20;

/**
 * The three fields migration 014 insists on once a job translation is ready.
 *
 * Not a rule this file invented: gftvjobs_job_translations_ready_needs_body
 * refuses a ready row without them, and a helper who cleared the summary of a
 * live translation would otherwise get a database error with nothing they could
 * act on in it.
 */
const READY_NEEDS = Object.freeze(['title', 'summary', 'description']);

/** Fields the two reference tables will not accept as null, per migration 014. */
const REQUIRED = Object.freeze({ job: [], department: ['name'], tag: ['name'] });

const TRANSLATION_TABLE = Object.freeze({
  job: T.jobTranslations,
  department: T.departmentTranslations,
  tag: T.tagTranslations,
});

const TRANSLATION_KEY = Object.freeze({
  job: 'job_id',
  department: 'department_id',
  tag: 'tag_id',
});

const BASE_TABLE = Object.freeze({
  job: T.jobs,
  department: T.departments,
  tag: T.tags,
});

/** What names the thing on screen, per type. */
const LABEL_COLUMN = Object.freeze({ job: 'title', department: 'name', tag: 'name' });

/** The names of the fields a given type carries, for a select list. */
function fieldNames(targetType) {
  return (WORDING[targetType] ?? []).map((field) => field.name);
}

/**
 * What the page needs to describe a field it is drawing.
 *
 * Sent to the browser rather than repeated there, so adding a field is one edit
 * in this file rather than one here and one in the page module that would
 * silently disagree about a ceiling.
 */
export function fieldSpecs(targetType) {
  return (WORDING[targetType] ?? []).map((field) => ({
    name: field.name,
    max: field.max,
    multiline: field.multiline === true,
    markdown: field.markdown === true,
    // Whether clearing it will be refused, which the page says next to the
    // label rather than after a failed save.
    required: (REQUIRED[targetType] ?? []).includes(field.name),
  }));
}

/* -------------------------------------------------------------------------
 * The guard
 * ---------------------------------------------------------------------- */

/**
 * Which languages this account may help with.
 *
 * Intersected with the active, non default languages rather than returned as
 * stored, for two reasons that are both real states rather than tidiness. A
 * language switched off in gftvjobs_locales is one the site has stopped serving,
 * so a role over it is a role over nothing and the audit view excludes it
 * anyway. The default language has no translation rows at all: migration 014
 * refuses one with a check constraint.
 *
 * **The grant's note is deliberately not read.** It is an admin's reason for
 * granting, written to be read off 8.11's list a year later, and it may name
 * whoever vouched for the person. It is not theirs to see, and this is the only
 * place that would leak it.
 *
 * @param {string} userId
 * @param {Array<{ code: string, native_name?: string, is_default?: boolean }>} locales
 *        from activeLocales()
 * @returns {Promise<Array<{ code: string, native_name: string, granted_at: string }>>}
 */
export async function grantedLocales(userId, locales) {
  const { data, error } = await supabase
    .from(T.translationHelpers)
    .select('locale, granted_at')
    .eq('user_id', userId);

  if (error) throw error;

  const held = new Map((data ?? []).map((row) => [row.locale, row.granted_at]));

  return (locales ?? [])
    .filter((locale) => !locale.is_default && held.has(locale.code))
    .map((locale) => ({
      code: locale.code,
      native_name: locale.native_name ?? locale.code,
      english_name: locale.english_name ?? locale.code,
      granted_at: held.get(locale.code) ?? null,
    }));
}

/* -------------------------------------------------------------------------
 * Reading one thing to translate
 * ---------------------------------------------------------------------- */

/**
 * One posting, team, or tag, with the source wording beside the translation.
 *
 * 8.2's rule about the editor applies here for the same reason: "Each tab shows
 * the source language's wording beside the field being written, so a translator
 * is never working from memory." A helper is more likely to need it than an
 * admin, not less.
 *
 * Only the allowlisted wording is selected on either side. The base row carries
 * the application form URL and the prefill map, and a payload that read the row
 * whole to render nine paragraphs would put both on the screen of somebody who
 * is not staff.
 *
 * @param {{ targetType: string, targetId: string, locale: string }} target
 * @returns {Promise<{ ok: true, target: object } | { ok: false, reason: string }>}
 */
export async function fetchTranslationTarget({ targetType, targetId, locale }) {
  if (!HELPER_TARGETS.includes(targetType)) return { ok: false, reason: 'unknown_target' };

  const base = await baseRow(targetType, targetId);
  if (!base) return { ok: false, reason: 'gone' };

  // Archived postings are off the board for everybody except the people who
  // already applied, per 7g, and migration 032's view excludes them for that
  // reason. The audit a helper reads and the thing a helper may open have to
  // agree, or the list is a list of doors and one of them is locked.
  if (targetType === 'job' && base.status === 'archived') {
    return { ok: false, reason: 'archived' };
  }

  const translation = await translationRow(targetType, targetId, locale);
  const fields = fieldNames(targetType);

  const source = {};
  const current = {};
  for (const field of fields) {
    source[field] = typeof base[field] === 'string' ? base[field] : null;
    current[field] = typeof translation?.[field] === 'string' ? translation[field] : null;
  }

  return {
    ok: true,
    target: {
      target_type: targetType,
      target_id: targetId,
      locale,
      label: base[LABEL_COLUMN[targetType]] ?? null,
      // What state the thing being translated is in, which is how much this
      // matters: a draft posting with no Chinese is nothing to worry about, and
      // a published one is a page somebody is reading in the wrong language now.
      source_status: sourceStatus(targetType, base),
      source,
      current,
      // Sections are a posting's only jsonb wording, per migration 019. Both
      // sides, because a translation may carry a different number from the
      // source and 8.2 is explicit that merging two is not a mistake.
      source_sections: targetType === 'job' ? sectionList(base.sections) : null,
      sections: targetType === 'job' ? sectionList(translation?.sections) : null,
      has_row: translation !== null,
      // Read only here, and said on screen rather than implied by the absence of
      // a control: 7i's "only an admin sets is_ready" is the sentence a helper
      // needs to understand why their finished work is not on the site yet.
      is_ready: targetType === 'job' ? translation?.is_ready === true : null,
      updated_at: translation?.updated_at ?? null,
      fields: fieldSpecs(targetType),
    },
  };
}

/**
 * What state the source is in, which the view answers differently per type.
 *
 * The same three answers migration 032's view gives, so a row opened from the
 * audit says the same thing on both screens. "published" means nothing about a
 * tag: what matters there is whether it is on any posting at all.
 */
function sourceStatus(targetType, base) {
  if (targetType === 'job') return base.status ?? null;
  if (targetType === 'department') return base.is_active ? 'active' : 'inactive';
  return (base.usage_count ?? 0) > 0 ? 'in_use' : 'unused';
}

const BASE_SELECT = Object.freeze({
  job: `id, status, sections, ${fieldNames('job').join(', ')}`,
  department: `id, is_active, ${fieldNames('department').join(', ')}`,
  tag: `id, usage_count, ${fieldNames('tag').join(', ')}`,
});

const TRANSLATION_SELECT = Object.freeze({
  job: `locale, is_ready, updated_at, sections, ${fieldNames('job').join(', ')}`,
  department: `locale, updated_at, ${fieldNames('department').join(', ')}`,
  tag: `locale, updated_at, ${fieldNames('tag').join(', ')}`,
});

async function baseRow(targetType, targetId) {
  const table = BASE_TABLE[targetType];
  if (!table || !targetId) return null;

  const { data, error } = await supabase
    .from(table)
    .select(BASE_SELECT[targetType])
    .eq('id', targetId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function translationRow(targetType, targetId, locale) {
  const table = TRANSLATION_TABLE[targetType];
  if (!table || !targetId) return null;

  const { data, error } = await supabase
    .from(table)
    .select(TRANSLATION_SELECT[targetType])
    .eq(TRANSLATION_KEY[targetType], targetId)
    .eq('locale', locale)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** A sections value as an array of {heading, body}, whatever the column held. */
function sectionList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      heading: typeof entry.heading === 'string' ? entry.heading : '',
      body: typeof entry.body === 'string' ? entry.body : '',
    }));
}

/* -------------------------------------------------------------------------
 * Finding something that is not on the audit
 * ---------------------------------------------------------------------- */

/** How many of each type a search answers with. Enough to recognise one. */
const SEARCH_LIMIT = 8;

/**
 * Anything translatable, by the name it has in the source language.
 *
 * The audit answers "what is left", which is the list a helper works through.
 * This answers the other question 7i's first bullet implies: a translation that
 * is finished and *wrong* is not on the audit at all, by design, and it is the
 * one a reader has just complained about. Without this the only way to reach it
 * would be the annotation layer, which is a different tool for a different
 * moment.
 *
 * Matched on the source label rather than on the translation, because somebody
 * looking for a posting knows it by the name they read on the board, and the
 * translation they are looking for may not exist yet.
 *
 * The state here is thinner than the audit's on purpose: missing, drafted, or
 * done. "Thin" is a comparison across two tables that migration 032's view
 * makes properly, and repeating half of it in a search would give a second,
 * quieter answer to the same question.
 *
 * @param {string} locale
 * @param {string} term
 */
export async function searchTranslatable(locale, term) {
  const needle = String(term ?? '').trim();
  if (needle.length < 2) return [];

  const pattern = `%${likeNeedle(needle)}%`;

  const [jobs, departments, tags] = await Promise.all([
    supabase
      .from(T.jobs)
      .select('id, title, status')
      .neq('status', 'archived')
      .ilike('title', pattern)
      .order('updated_at', { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase
      .from(T.departments)
      .select('id, name, is_active')
      .ilike('name', pattern)
      .order('name', { ascending: true })
      .limit(SEARCH_LIMIT),
    supabase
      .from(T.tags)
      .select('id, name, usage_count')
      .ilike('name', pattern)
      .order('usage_count', { ascending: false })
      .limit(SEARCH_LIMIT),
  ]);

  for (const result of [jobs, departments, tags]) {
    if (result.error) throw result.error;
  }

  const rows = [
    ...(jobs.data ?? []).map((row) => ({
      target_type: 'job',
      target_id: row.id,
      label: row.title,
      source_status: row.status,
    })),
    ...(departments.data ?? []).map((row) => ({
      target_type: 'department',
      target_id: row.id,
      label: row.name,
      source_status: row.is_active ? 'active' : 'inactive',
    })),
    ...(tags.data ?? []).map((row) => ({
      target_type: 'tag',
      target_id: row.id,
      label: row.name,
      source_status: (row.usage_count ?? 0) > 0 ? 'in_use' : 'unused',
    })),
  ];

  return await withStates(rows, locale);
}

/**
 * What somebody typed, as a literal to match rather than as a pattern.
 *
 * The same three rules admin-applications.js settled on for the tracking page's
 * applicant box, and the same reasons: `_` is a real character in a posting
 * title, `%` is a real character in a tag name, and the star is dropped rather
 * than escaped because PostgREST spells `%` as `*` in a like filter and
 * substitutes it before Postgres ever sees the pattern, so no escape survives.
 *
 * A second copy rather than an import, because that one is an admin read model
 * for a view this file does not touch, and a shared escaper across two search
 * surfaces is a thing somebody widens for one of them.
 */
function likeNeedle(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (char) => `\\${char}`)
    .replace(/\*/g, '');
}

/**
 * The translation state of each of these, in one query per type.
 *
 * One query per type rather than one per row, which is the shape
 * translation-helpers.js settled on for the same problem: a page of results
 * turned into twenty four round trips is the version that looks fine until the
 * list is long.
 */
async function withStates(rows, locale) {
  const wanted = { job: [], department: [], tag: [] };
  for (const row of rows) wanted[row.target_type].push(row.target_id);

  const found = new Map();

  await Promise.all(
    HELPER_TARGETS.map(async (type) => {
      if (wanted[type].length === 0) return;

      const { data, error } = await supabase
        .from(TRANSLATION_TABLE[type])
        .select(`${TRANSLATION_KEY[type]}${type === 'job' ? ', is_ready' : ''}`)
        .eq('locale', locale)
        .in(TRANSLATION_KEY[type], wanted[type]);

      if (error) throw error;

      for (const row of data ?? []) {
        found.set(`${type}:${row[TRANSLATION_KEY[type]]}`, {
          // A team or tag translation has no is_ready. Migration 014 leaves it
          // off both tables on purpose: a team name is either written in a
          // language or it is not, and nothing about it is half published.
          ready: type === 'job' ? row.is_ready === true : true,
        });
      }
    })
  );

  return rows.map((row) => {
    const state = found.get(`${row.target_type}:${row.target_id}`);
    return {
      ...row,
      state: !state ? 'missing' : state.ready ? 'done' : 'drafted',
    };
  });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

/**
 * Validate what the page sent, against the fields this type actually has.
 *
 * A patch rather than a whole row: a save that names three fields writes three
 * columns, so a field this file has never heard of is ignored rather than
 * refused, and a field it knows about that was not sent is left as it stands.
 * That is what keeps a stale tab from blanking a column somebody else filled in
 * between the page loading and Save being pressed.
 *
 * @param {string} targetType
 * @param {object} body
 * @returns {{ values: object, details: Record<string,string>|null }}
 */
export function checkHelperFields(targetType, body) {
  const details = {};
  const values = {};

  for (const field of WORDING[targetType] ?? []) {
    if (!(field.name in body)) continue;

    const result = validateText(body[field.name], field.max);
    if (result.ok) values[field.name] = result.value;
    else details[field.name] = result.code;
  }

  if (targetType === 'job' && 'sections' in body) {
    const sections = checkSections(body.sections);
    if (sections.ok) values.sections = sections.value;
    else details.sections = sections.code;
  }

  return { values, details: Object.keys(details).length > 0 ? details : null };
}

/**
 * The sections builder's value, per 8.2 and migration 019.
 *
 * An array of {heading, body} in display order, both required on every section,
 * which is what gftvjobs_sections_valid enforces. A section left entirely empty
 * is dropped rather than refused: somebody who adds a row and changes their mind
 * should not have to find it again to save.
 *
 * The count is deliberately not compared with the source's. 8.2: "a translator
 * who merges two has not done anything wrong, so do not enforce a matching
 * count."
 */
function checkSections(value) {
  if (value === null || value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, code: FIELD.INVALID };
  if (value.length > MAX_SECTIONS) return { ok: false, code: FIELD.TOO_LONG };

  const cleaned = [];

  for (const section of value) {
    if (!section || typeof section !== 'object') return { ok: false, code: FIELD.INVALID };

    const heading = String(section.heading ?? '').replace(/\s+/g, ' ').trim();
    const body = String(section.body ?? '').trim();

    if (heading === '' && body === '') continue;
    if (heading === '' || body === '') return { ok: false, code: FIELD.REQUIRED };
    if (heading.length > HEADING_MAX) return { ok: false, code: FIELD.TOO_LONG };
    if (body.length > SECTION_BODY_MAX) return { ok: false, code: FIELD.TOO_LONG };

    cleaned.push({ heading, body });
  }

  return { ok: true, value: cleaned };
}

/** Whether a validated value is anything at all. Sections count when non empty. */
function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * Write one translation row, as a helper.
 *
 * **is_ready is never in the patch**, in either direction. A row created here is
 * created unready, because the column defaults to false and nothing sets it; a
 * row that is already ready stays ready and keeps working, because taking a live
 * translation down is as much an editorial decision as putting one up and
 * neither is a helper's.
 *
 * **updated_by is always in the patch.** Migration 034's column is what makes
 * 8.11's "what each has drafted" answerable, and a save that omitted it would
 * leave the admin roster showing a dash that looks exactly like the column not
 * having been applied yet.
 *
 * @param {{ targetType: string, targetId: string, locale: string,
 *           values: object, userId: string }} input
 * @returns {Promise<{ ok: true, created: boolean } |
 *                   { ok: false, reason: string, details?: object }>}
 */
export async function saveTranslation(input) {
  const { targetType, targetId, locale, values, userId } = input;

  const table = TRANSLATION_TABLE[targetType];
  const key = TRANSLATION_KEY[targetType];
  if (!table) return { ok: false, reason: 'unknown_target' };

  if (Object.keys(values).length === 0) return { ok: false, reason: 'nothing_to_save' };

  const existing = await translationRow(targetType, targetId, locale);

  // Migration 014 makes name not null on both reference tables, so a blank one
  // is refused rather than attempted, whether the row is being created or
  // rewritten.
  for (const field of REQUIRED[targetType] ?? []) {
    const value = field in values ? values[field] : (existing?.[field] ?? null);
    if (value === null || String(value).trim() === '') {
      return { ok: false, reason: 'cannot_be_blank', details: { [field]: FIELD.REQUIRED } };
    }
  }

  // A live translation may not be hollowed out. The database refuses it through
  // gftvjobs_job_translations_ready_needs_body, and a helper reading "there is a
  // problem with this request" would have no idea which of nine boxes did it.
  if (targetType === 'job' && existing?.is_ready === true) {
    const details = {};
    for (const field of READY_NEEDS) {
      const value = field in values ? values[field] : (existing[field] ?? null);
      if (value === null || String(value).trim() === '') details[field] = FIELD.REQUIRED;
    }
    if (Object.keys(details).length > 0) {
      return { ok: false, reason: 'live_needs_body', details };
    }
  }

  if (!existing) {
    // Opening something and pressing Save without writing anything would
    // otherwise create a row of nulls, which moves it off the audit's "not
    // started" pile into "drafted" while containing nothing. That is worse than
    // no row: the state is what tells a helper where to go next.
    if (!Object.values(values).some((value) => hasContent(value))) {
      return { ok: false, reason: 'nothing_to_save' };
    }

    const { error } = await supabase.from(table).insert({
      [key]: targetId,
      locale,
      ...values,
      updated_by: userId,
    });

    if (error) throw error;
    return { ok: true, created: true };
  }

  const { error } = await supabase
    .from(table)
    .update({ ...values, updated_by: userId })
    .eq(key, targetId)
    .eq('locale', locale);

  if (error) throw error;
  return { ok: true, created: false };
}
