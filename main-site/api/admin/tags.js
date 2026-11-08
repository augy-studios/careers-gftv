// /api/admin/tags
//
// Section 8.7: "list with usage counts and search. Create, rename, recolour, and
// delete, where deleting warns how many postings will lose the tag. Merge two
// tags into one, moving all job links across and removing the duplicate. Find
// and clean up orphan tags with zero postings."
//
//   GET   ?q=&orphans=true   the list, with usage counts
//   POST  { action: 'save'|'delete'|'merge' }
//
// Two things about usage_count, because it is the column most likely to be
// written by mistake:
//
//   **It is maintained by trigger, not by this file.** Migration 004 says so and
//   migration 007 has the trigger. Nothing here writes it, and the merge below
//   moves join rows and lets the trigger do the counting, which is also why the
//   merge cannot be one update statement.
//
//   **It counts published postings only.** So a tag reading zero can still be on
//   three drafts, and deleting it would take it off them. The delete path counts
//   the join rows rather than reading usage_count for exactly that reason, and
//   the orphan view says which of the two it is showing.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  failInternal,
  readJson,
} from '../_lib/respond.js';
import { supabase, TABLES } from '../_lib/supabase.js';
import { requireStaff } from '../_lib/session.js';
import { AUDIT, auditStaff } from '../_lib/audit.js';
import { FIELD, validateText } from '../_lib/validate.js';
import {
  isUuid,
  parameters,
  slugify,
  freeSlug,
  activeLocales,
  defaultLocale,
} from '../_lib/admin.js';
import { LIMITS, limited, recordFailures, subjectForUser } from '../_lib/rate-limit.js';

const NAME_MAXIMUM = 60;
const DESCRIPTION_MAXIMUM = 300;

/** A hex colour, which is the only shape the pill styling can use. */
const COLOUR = /^#[0-9a-fA-F]{6}$/;

export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['GET', 'HEAD', 'POST'])) return;

  const session = await requireStaff(request, response);
  if (!session) return;

  response.setHeader('Cache-Control', 'no-store');

  try {
    if (request.method === 'POST') return await write(request, response, session);
    return await read(request, response);
  } catch (cause) {
    return failInternal(response, cause, 'admin tags');
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

async function read(request, response) {
  const search = parameters(request);
  const searchTerm = (search.get('q') ?? '').trim().slice(0, 60);

  let query = supabase
    .from(TABLES.tags)
    .select('id, name, slug, colour, description, usage_count, created_at')
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true })
    .limit(500);

  if (searchTerm) {
    // Substring rather than trigram. The trigram index in 004 is what makes the
    // *public* type-ahead forgiving of a typo; an admin looking for a tag they
    // wrote knows what it is called.
    query = query.ilike('name', `%${searchTerm.replace(/[,()%]/g, ' ')}%`);
  }

  const [tags, links, translations, locales] = await Promise.all([
    query,
    supabase.from(TABLES.jobTags).select('tag_id'),
    supabase.from(TABLES.tagTranslations).select('tag_id, locale, name, description'),
    activeLocales(),
  ]);

  if (tags.error) throw tags.error;
  if (links.error) throw links.error;
  if (translations.error) throw translations.error;

  // Postings of any status, which is the number that matters for deleting.
  const linked = new Map();
  for (const row of links.data ?? []) {
    linked.set(row.tag_id, (linked.get(row.tag_id) ?? 0) + 1);
  }

  const byTag = new Map();
  for (const row of translations.data ?? []) {
    const map = byTag.get(row.tag_id) ?? {};
    map[row.locale] = { name: row.name, description: row.description ?? null };
    byTag.set(row.tag_id, map);
  }

  const needed = locales.filter((locale) => !locale.is_default).map((locale) => locale.code);

  let rows = (tags.data ?? []).map((row) => {
    const translated = byTag.get(row.id) ?? {};
    return {
      ...row,
      translations: translated,
      missing_locales: needed.filter((code) => !translated[code]?.name),
      // Two different numbers, both shown, because they answer two different
      // questions and a single "count" would be wrong for one of them.
      published_count: row.usage_count,
      job_count: linked.get(row.id) ?? 0,
    };
  });

  if (search.get('orphans') === 'true') {
    // An orphan is a tag on no posting at all, draft or otherwise. A tag on
    // three drafts is not an orphan, however zero its usage_count reads.
    rows = rows.filter((row) => row.job_count === 0);
  }

  return ok(response, { tags: rows, locales });
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const ACTIONS = ['save', 'delete', 'merge'];

async function write(request, response, session) {
  const body = await readJson(request, response);
  if (body === null) return;

  const action = String(body.action ?? '').trim();
  if (!ACTIONS.includes(action)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { action: FIELD.INVALID },
    });
  }

  const subjects = [subjectForUser('staff', session.user.id)];
  if (await limited(response, 'admin', subjects)) return;
  const done = () => recordFailures('admin', subjects, LIMITS.admin);

  switch (action) {
    case 'save':
      return save(response, body, done);
    case 'delete':
      return remove(response, session, body, done);
    default:
      return merge(response, session, body, done);
  }
}

/**
 * Create, rename, or recolour.
 *
 * The slug is generated once, on creation, and never changes with a rename. A
 * tag slug appears in a shared /search?tags= URL, per section 4, and renaming
 * "OBS" to "OBS Studio" must not break a link somebody posted in Discord.
 */
async function save(response, body, done) {
  let id;

  if (body.id) {
    id = String(body.id);
  } else {
    id = null;
  }

  if (id && !isUuid(id)) return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a tag id.');

  const details = {};

  const name = validateText(body.name, NAME_MAXIMUM, { required: true });
  if (!name.ok) details.name = name.code;

  const description = validateText(body.description, DESCRIPTION_MAXIMUM);
  if (!description.ok) details.description = description.code;

  let colour = null;
  if (body.colour !== null && body.colour !== undefined && body.colour !== '') {
    if (typeof body.colour === 'string' && COLOUR.test(body.colour.trim())) {
      colour = body.colour.trim().toLowerCase();
    } else {
      details.colour = FIELD.INVALID;
    }
  }

  const locales = await activeLocales();
  const base = await defaultLocale();
  const translations = {};

  for (const [locale, value] of Object.entries(body.translations ?? {})) {
    if (locale === base || !locales.some((item) => item.code === locale)) {
      details[`translations.${locale}`] = FIELD.INVALID;
      continue;
    }

    const translatedName = validateText(value?.name, NAME_MAXIMUM);
    const translatedDescription = validateText(value?.description, DESCRIPTION_MAXIMUM);

    if (!translatedName.ok) details[`${locale}.name`] = translatedName.code;
    if (!translatedDescription.ok) details[`${locale}.description`] = translatedDescription.code;

    if (translatedName.ok && translatedDescription.ok) {
      translations[locale] = {
        name: translatedName.value,
        description: translatedDescription.value,
      };
    }
  }

  if (Object.keys(details).length > 0) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That tag could not be saved.', { details });
  }

  const row = { name: name.value, description: description.value, colour };
  if (!id) row.slug = await freeSlug(TABLES.tags, slugify(name.value) || 'tag');

  let saved;

  if (id) {
    saved = await supabase
      .from(TABLES.tags)
      .update(row)
      .eq('id', id)
      .select('id, name, slug, colour')
      .single();
  } else {
    saved = await supabase.from(TABLES.tags).insert(row).select('id, name, slug, colour').single();
  }

  if (saved.error) {
    if (saved.error.code === '23505') {
      return fail(response, ERROR_CODES.CONFLICT, 'There is already a tag with that name.', {
        details: { name: FIELD.TAKEN },
      });
    }
    throw saved.error;
  }

  await writeTagTranslations(saved.data.id, translations, locales);

  await done();
  let status;

  if (id) {
    status = 200;
  } else {
    status = 201;
  }

  return ok(response, { tag: saved.data }, { status: status });
}

/**
 * Save a tag's name in each language given. Languages left empty are removed so
 * they fall back to the default language.
 */
async function writeTagTranslations(tagId, translations, locales) {
  const rows = [];
  const blanked = [];

  for (const locale of locales) {
    if (locale.is_default) continue;

    const value = translations[locale.code];
    if (value?.name) {
      rows.push({
        tag_id: tagId,
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
      .from(TABLES.tagTranslations)
      .upsert(rows, { onConflict: 'tag_id,locale' });
    if (error) throw error;
  }

  if (blanked.length > 0) {
    const { error } = await supabase
      .from(TABLES.tagTranslations)
      .delete()
      .eq('tag_id', tagId)
      .in('locale', blanked);
    if (error) throw error;
  }
}

/**
 * Delete a tag, warning how many postings lose it, per 8.7.
 *
 * The join rows cascade, per migration 005, so the postings survive and lose
 * the tag. That can quietly make a published posting untaggable enough to fail
 * the publish rule if it is ever unpublished and republished, which is worth an
 * admin knowing before rather than after.
 */
async function remove(response, session, body, done) {
  const id = String(body.id ?? '');
  if (!isUuid(id)) return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a tag id.');

  const { data: tag, error: readError } = await supabase
    .from(TABLES.tags)
    .select('id, name, slug')
    .eq('id', id)
    .maybeSingle();

  if (readError) throw readError;
  if (!tag) return fail(response, ERROR_CODES.NOT_FOUND, 'That tag could not be found.');

  const { count, error: countError } = await supabase
    .from(TABLES.jobTags)
    .select('job_id', { count: 'exact', head: true })
    .eq('tag_id', id);

  if (countError) throw countError;
  const affected = count ?? 0;

  if (Number(body.confirm_count) !== affected) {
    return fail(response, ERROR_CODES.CONFLICT, 'Confirm what this affects before deleting it.', {
      details: { confirm_count: FIELD.MISMATCH, job_count: affected },
    });
  }

  await auditStaff(
    session.user,
    AUDIT.TAG_DELETED,
    { name: tag.name, slug: tag.slug, jobs_affected: affected },
    { targetTable: TABLES.tags, targetId: id }
  );

  const { error } = await supabase.from(TABLES.tags).delete().eq('id', id);
  if (error) throw error;

  await done();
  return ok(response, { id, deleted: true, jobs_affected: affected });
}

/**
 * Merge one tag into another, per 8.7.
 *
 * Every posting carrying the source gains the target, then the source is
 * deleted and takes its own join rows with it. The insert has to skip postings
 * that already carry both, because the primary key on gftvjobs_job_tags is the
 * pair and a merge of two overlapping tags is the ordinary case rather than the
 * exception: near duplicates are usually applied together, which is why
 * somebody is merging them.
 *
 * The translations are not merged. The target keeps its own names, because a
 * merge is a decision that the target is the right wording and importing the
 * source's Chinese would undo exactly that decision.
 */
async function merge(response, session, body, done) {
  const sourceId = String(body.source_id ?? '');
  const targetId = String(body.target_id ?? '');

  if (!isUuid(sourceId) || !isUuid(targetId)) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'Those are not tag ids.');
  }
  if (sourceId === targetId) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'A tag cannot be merged into itself.', {
      details: { target_id: FIELD.INVALID },
    });
  }

  const { data: tags, error: readError } = await supabase
    .from(TABLES.tags)
    .select('id, name, slug')
    .in('id', [sourceId, targetId]);

  if (readError) throw readError;

  const source = (tags ?? []).find((tag) => tag.id === sourceId);
  const target = (tags ?? []).find((tag) => tag.id === targetId);
  if (!source || !target)
    return fail(response, ERROR_CODES.NOT_FOUND, 'One of those tags could not be found.');

  const [sourceLinks, targetLinks] = await Promise.all([
    supabase.from(TABLES.jobTags).select('job_id').eq('tag_id', sourceId),
    supabase.from(TABLES.jobTags).select('job_id').eq('tag_id', targetId),
  ]);

  if (sourceLinks.error) throw sourceLinks.error;
  if (targetLinks.error) throw targetLinks.error;

  const already = new Set((targetLinks.data ?? []).map((row) => row.job_id));
  const toAdd = (sourceLinks.data ?? [])
    .map((row) => row.job_id)
    .filter((jobId) => !already.has(jobId));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from(TABLES.jobTags)
      .insert(toAdd.map((jobId) => ({ job_id: jobId, tag_id: targetId })));
    if (error) throw error;
  }

  await auditStaff(
    session.user,
    AUDIT.TAGS_MERGED,
    {
      from: source.name,
      into: target.name,
      moved: toAdd.length,
      already_had: (sourceLinks.data ?? []).length - toAdd.length,
    },
    { targetTable: TABLES.tags, targetId }
  );

  // The source's own join rows go with it, per the cascade in 005, and the
  // triggers in 007 correct both usage counts.
  const { error } = await supabase.from(TABLES.tags).delete().eq('id', sourceId);
  if (error) throw error;

  await done();
  return ok(response, { merged: sourceId, into: targetId, moved: toAdd.length });
}
