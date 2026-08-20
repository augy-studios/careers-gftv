// /api/admin/departments
//
// Section 8.6: "simple CRUD, with the name and description edited as an English
// and Mandarin pair. A department cannot be left active without a Chinese name,
// since it appears on every job card and in the search filters."
//
//   GET   the list, with translations and a count of postings in each
//   POST  { action: 'save'|'delete'|'reorder' }
//
// The one rule worth reading twice is 8.6's own, and it is generalised here
// rather than written against Chinese: **an active department needs a name in
// every active language**, read from gftvjobs_locales. That is what makes
// adding Malay in phase 15 a matter of writing the names rather than of finding
// every place a language was hardcoded. A department with a missing name can
// still exist; it just cannot be active, which is the state that puts it on a
// card and in the filters.
//
// Deleting is the case to be careful about and is not a cascade: migration 005
// sets a posting's department_id to null when its department goes, so nothing
// is destroyed and some postings quietly lose their team. The count comes back
// with the refusal so an admin sees the number before they decide.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { supabase, T } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import { isUuid, params, slugify, freeSlug, activeLocales, defaultLocale } from '../_lib/admin.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') return await write(req, res, session);
    return await read(req, res);
  } catch (cause) {
    return failInternal(res, cause, 'admin departments');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(req, res) {
  const search = params(req);

  const [departments, translations, locales] = await Promise.all([
    supabase
      .from(T.departments)
      .select('id, name, slug, description, sort_order, is_active, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from(T.departmentTranslations).select('department_id, locale, name, description'),
    activeLocales(),
  ]);

  if (departments.error) throw departments.error;
  if (translations.error) throw translations.error;

  const byDepartment = new Map();
  for (const row of translations.data ?? []) {
    const map = byDepartment.get(row.department_id) ?? {};
    map[row.locale] = { name: row.name, description: row.description ?? null };
    byDepartment.set(row.department_id, map);
  }

  const counts = search.get('counts') === 'false' ? new Map() : await postingCounts();
  const needed = locales.filter((locale) => !locale.is_default).map((locale) => locale.code);

  return ok(res, {
    locales,
    departments: (departments.data ?? []).map((row) => {
      const translated = byDepartment.get(row.id) ?? {};
      return {
        ...row,
        translations: translated,
        // Which languages are still missing a name, so the list shows it
        // without opening each one. The same question 8.2's editor answers
        // about a posting.
        missing_locales: needed.filter((code) => !translated[code]?.name),
        job_count: counts.get(row.id) ?? 0,
      };
    }),
  });
}

/**
 * How many postings sit in each department.
 *
 * One query for every posting's department_id rather than a count per
 * department, because there are eight departments and a few dozen postings, and
 * a group by would need an RPC and therefore a migration.
 */
async function postingCounts() {
  const { data, error } = await supabase.from(T.jobs).select('department_id');
  if (error) throw error;

  const counts = new Map();
  for (const row of data ?? []) {
    if (!row.department_id) continue;
    counts.set(row.department_id, (counts.get(row.department_id) ?? 0) + 1);
  }
  return counts;
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['save', 'delete', 'reorder'];

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
    case 'save':
      return save(res, session, body, done);
    case 'delete':
      return remove(res, session, body, done);
    default:
      return reorder(res, body, done);
  }
}

async function save(res, session, body, done) {
  const id = body.id ? String(body.id) : null;
  if (id && !isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a department id.');

  const details = {};

  const name = validateText(body.name, NAME_MAX, { required: true });
  if (!name.ok) details.name = name.code;

  const description = validateText(body.description, DESCRIPTION_MAX);
  if (!description.ok) details.description = description.code;

  const locales = await activeLocales();
  const base = await defaultLocale();
  const translations = {};

  for (const [locale, value] of Object.entries(body.translations ?? {})) {
    if (locale === base || !locales.some((item) => item.code === locale)) {
      details[`translations.${locale}`] = FIELD.INVALID;
      continue;
    }

    // Migration 014 makes name not null on a translation row, so a blank name
    // means "no translation" and the row is deleted rather than written empty.
    const translatedName = validateText(value?.name, NAME_MAX);
    const translatedDescription = validateText(value?.description, DESCRIPTION_MAX);

    if (!translatedName.ok) details[`${locale}.name`] = translatedName.code;
    if (!translatedDescription.ok) details[`${locale}.description`] = translatedDescription.code;

    if (translatedName.ok && translatedDescription.ok) {
      translations[locale] = {
        name: translatedName.value,
        description: translatedDescription.value,
      };
    }
  }

  const isActive = body.is_active !== false;

  // 8.6's rule, generalised to every active language. Checked before anything
  // is written, so a save that fails leaves nothing half done.
  if (isActive) {
    for (const locale of locales) {
      if (locale.is_default) continue;
      if (!translations[locale.code]?.name) {
        details[`${locale.code}.name`] = FIELD.REQUIRED;
      }
    }
  }

  if (Object.keys(details).length > 0) {
    return fail(res, ERR.BAD_REQUEST, 'That department could not be saved.', { details });
  }

  const slug = id
    ? undefined
    : await freeSlug(T.departments, slugify(name.value) || 'team');

  const row = {
    name: name.value,
    description: description.value,
    is_active: isActive,
    ...(slug ? { slug } : {}),
  };

  const saved = id
    ? await supabase.from(T.departments).update(row).eq('id', id).select('id, name, slug').single()
    : await supabase.from(T.departments).insert(row).select('id, name, slug').single();

  if (saved.error) {
    // The unique index on lower(name) is the likely cause, and it is a field
    // error rather than a server one: two teams called Production is a thing
    // somebody typed, not a thing that went wrong.
    if (saved.error.code === '23505') {
      return fail(res, ERR.CONFLICT, 'There is already a team with that name.', {
        details: { name: FIELD.TAKEN },
      });
    }
    throw saved.error;
  }

  await writeTranslations(saved.data.id, translations, locales, base);

  await done();
  return ok(res, { department: saved.data }, { status: id ? 200 : 201 });
}

async function writeTranslations(departmentId, translations, locales, base) {
  const rows = [];
  const blanked = [];

  for (const locale of locales) {
    if (locale.is_default || locale.code === base) continue;

    const value = translations[locale.code];
    if (value?.name) {
      rows.push({
        department_id: departmentId,
        locale: locale.code,
        name: value.name,
        description: value.description,
      });
    } else {
      blanked.push(locale.code);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from(T.departmentTranslations)
      .upsert(rows, { onConflict: 'department_id,locale' });
    if (error) throw error;
  }

  if (blanked.length > 0) {
    const { error } = await supabase
      .from(T.departmentTranslations)
      .delete()
      .eq('department_id', departmentId)
      .in('locale', blanked);
    if (error) throw error;
  }
}

/**
 * Delete a department.
 *
 * Not a cascade: migration 005 sets a posting's department_id to null, so the
 * postings survive and lose their team. That is a change to live postings, so
 * the count has to be confirmed rather than described, exactly as 8.2 does for
 * a posting's own deletion.
 */
async function remove(res, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(res, ERR.BAD_REQUEST, 'That is not a department id.');

  const { data: department, error: readError } = await supabase
    .from(T.departments)
    .select('id, name, slug')
    .eq('id', id)
    .maybeSingle();

  if (readError) throw readError;
  if (!department) return fail(res, ERR.NOT_FOUND, 'That team could not be found.');

  const { count, error: countError } = await supabase
    .from(T.jobs)
    .select('id', { count: 'exact', head: true })
    .eq('department_id', id);

  if (countError) throw countError;
  const affected = count ?? 0;

  if (Number(body.confirm_count) !== affected) {
    return fail(res, ERR.CONFLICT, 'Confirm what this affects before deleting it.', {
      details: { confirm_count: FIELD.MISMATCH, job_count: affected },
    });
  }

  await auditStaff(
    session.user,
    AUDIT.DEPARTMENT_DELETED,
    { name: department.name, slug: department.slug, jobs_affected: affected },
    { targetTable: T.departments, targetId: id }
  );

  const { error } = await supabase.from(T.departments).delete().eq('id', id);
  if (error) throw error;

  await done();
  return ok(res, { id, deleted: true, jobs_affected: affected });
}

/**
 * Reorder the list.
 *
 * sort_order decides where a team appears on the home page and in the filters,
 * so it is a display choice rather than a change to anybody's data, and it is
 * not audited.
 */
async function reorder(res, body, done) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => isUuid(id)) : [];
  if (ids.length === 0) return fail(res, ERR.BAD_REQUEST, 'Nothing to reorder.');

  // Tens rather than ones, so a team can be dropped between two later without
  // rewriting the whole list.
  for (let index = 0; index < ids.length; index += 1) {
    const { error } = await supabase
      .from(T.departments)
      .update({ sort_order: (index + 1) * 10 })
      .eq('id', ids[index]);
    if (error) throw error;
  }

  await done();
  return ok(res, { ordered: ids.length });
}
