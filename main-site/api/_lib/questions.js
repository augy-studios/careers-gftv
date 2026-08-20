// Question sets on tasks, per 7g and 8.3. The other half of migration 031.
//
// A job poster can attach up to twenty questions to an info request, or to a
// posting so that everybody who applies is asked. Four types: short answer,
// long answer, choice (pick one), and checkbox (pick any). This module owns the
// shape, both directions: what the composer may store, and what a reply may
// contain.
//
// Four rules from 7g run through everything here. They are the ones that will
// be got wrong if the section is skimmed, so they are stated at the top rather
// than left in the function that happens to enforce each one.
//
//   **The set is frozen once sent.** Editing it orphans answers already given,
//   so a task's questions are written when it is raised and never again. That
//   is enforced where tasks are written, not here, but it is why a posting's
//   template is *copied* onto each task rather than referenced: editing the
//   template changes only what the next applicant is asked.
//
//   **Answers are validated against the set stored on that task**, never
//   against what the browser sends back. The browser was sent the questions and
//   cannot be trusted to send back an answer to one of them. checkAnswers takes
//   the stored set as its second argument for exactly that reason, and there is
//   no version of it that takes the questions from a request body.
//
//   **An answer stores an option value, never a label.** The label is per
//   language; the value is not. A label stored as an answer would be unreadable
//   in the other language and unmatchable against the question's own options.
//
//   **There is no file upload**, on a question or anywhere near one. Section 10
//   item 1 gave up exactly one exception, and it is the avatar. The four types
//   are the whole list, and adding a fifth is a decision rather than a case
//   statement.
//
// Every text a reader sees is a per language object: { "en": ..., "zh": ... }.
// A language nobody wrote falls back to one that was, rather than rendering
// empty, per the third decision of 21 August 2026.

import { FIELD } from './validate.js';

/** The cap from section 10 item 1, enforced here and in migration 031. */
export const MAX_QUESTIONS = 20;

/** Options per list question. Generous; it is a ceiling, not a target. */
export const MAX_OPTIONS = 40;

/** The four types. Fixed: a new one is a renderer and a validator, not a row. */
export const QUESTION_TYPES = Object.freeze([
  'short_answer',
  'long_answer',
  'choice',
  'checkbox',
]);

/** Types that carry options, and are answered with one of them. */
export const LIST_TYPES = Object.freeze(['choice', 'checkbox']);

const LABEL_MAX = 300;
const HELP_MAX = 500;
const OPTION_VALUE_MAX = 80;
const SHORT_ANSWER_MAX = 500;
const LONG_ANSWER_MAX = 5000;
const ID_MAX = 40;

/** A question id, as the composer generates them. Narrow so it can key an object. */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;

/** An option value: language independent, so ASCII and no spaces. */
const VALUE_SHAPE = /^[A-Za-z0-9._-]{1,80}$/;

/* -------------------------------------------------------------------------
 * The composer's side: what may be stored
 * ---------------------------------------------------------------------- */

/**
 * Clean one per language text object.
 *
 * Languages the composer sent blank are dropped rather than stored empty, so
 * "which languages is this question missing" is answerable by looking at the
 * keys. 8.3 asks the composer to show exactly that at a glance.
 *
 * @param {unknown} value
 * @param {readonly string[]} locales the active language codes
 * @param {number} maxLength
 * @returns {{ ok: true, value: object } | { ok: false, code: string }}
 */
function cleanLocaleText(value, locales, maxLength) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: FIELD.REQUIRED };
  }

  const cleaned = {};

  for (const locale of locales) {
    const raw = value[locale];
    if (typeof raw !== 'string') continue;

    // Collapse whitespace, the same treatment a display name gets: a label
    // pasted out of a document should not arrive with a newline in it.
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    if (text.length > maxLength) return { ok: false, code: FIELD.TOO_LONG };

    cleaned[locale] = text;
  }

  // A label written in no language at all renders blank in every language,
  // which is worse than a save that fails.
  if (Object.keys(cleaned).length === 0) return { ok: false, code: FIELD.REQUIRED };

  return { ok: true, value: cleaned };
}

/**
 * Validate and clean a whole question set, as the composer submits it.
 *
 * Returns the cleaned set rather than a boolean, per the rule at the top of
 * validate.js: a route must never check one value and store another.
 *
 * The failure shape names the question, because a composer with twenty
 * questions in it needs to know which one, and "invalid" on the whole form is
 * the sort of error that gets worked around by deleting everything.
 *
 * @param {unknown} value
 * @param {{ locales: readonly string[] }} context
 * @returns {{ ok: true, value: object[] } | { ok: false, code: string, index?: number, field?: string }}
 */
export function checkQuestionSet(value, context) {
  const locales = context.locales ?? ['en'];

  if (value === null || value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, code: FIELD.INVALID };
  if (value.length > MAX_QUESTIONS) return { ok: false, code: FIELD.TOO_LONG };

  const cleaned = [];
  const seenIds = new Set();

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const bad = (code, field) => ({ ok: false, code, index, field });

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad(FIELD.INVALID);

    const id = String(raw.id ?? '').trim();
    if (id === '' || id.length > ID_MAX || !ID_SHAPE.test(id)) return bad(FIELD.INVALID, 'id');
    // A duplicate id makes one answer unreachable and the other ambiguous.
    if (seenIds.has(id)) return bad(FIELD.INVALID, 'id');
    seenIds.add(id);

    const type = String(raw.type ?? '');
    if (!QUESTION_TYPES.includes(type)) return bad(FIELD.INVALID, 'type');

    const label = cleanLocaleText(raw.label, locales, LABEL_MAX);
    if (!label.ok) return bad(label.code, 'label');

    const question = {
      id,
      type,
      required: raw.required === true,
      label: label.value,
    };

    // help is optional in the composer and stays absent rather than being
    // stored as an empty object, so the renderer's check is a truthiness test.
    if (raw.help !== null && raw.help !== undefined && Object.keys(raw.help ?? {}).length > 0) {
      const help = cleanLocaleText(raw.help, locales, HELP_MAX);
      if (!help.ok) return bad(help.code, 'help');
      question.help = help.value;
    }

    if (LIST_TYPES.includes(type)) {
      const options = raw.options;
      if (!Array.isArray(options) || options.length === 0) {
        return bad(FIELD.REQUIRED, 'options');
      }
      if (options.length > MAX_OPTIONS) return bad(FIELD.TOO_LONG, 'options');

      const seenValues = new Set();
      question.options = [];

      for (const option of options) {
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          return bad(FIELD.INVALID, 'options');
        }

        const optionValue = String(option.value ?? '').trim();
        if (optionValue === '' || optionValue.length > OPTION_VALUE_MAX) {
          return bad(FIELD.REQUIRED, 'options');
        }
        if (!VALUE_SHAPE.test(optionValue)) return bad(FIELD.INVALID, 'options');
        if (seenValues.has(optionValue)) return bad(FIELD.INVALID, 'options');
        seenValues.add(optionValue);

        const optionLabel = cleanLocaleText(option.label, locales, LABEL_MAX);
        if (!optionLabel.ok) return bad(optionLabel.code, 'options');

        question.options.push({ value: optionValue, label: optionLabel.value });
      }
    }

    cleaned.push(question);
  }

  return { ok: true, value: cleaned };
}

/* -------------------------------------------------------------------------
 * The reader's side: one language
 * ---------------------------------------------------------------------- */

/**
 * One per language text, in the reader's language.
 *
 * Falls back to a language that was written rather than rendering empty, per
 * the third decision of 21 August 2026: English first, since it is the default
 * language and the one most likely to be there, then whatever else the composer
 * wrote. A question nobody can read is worse than a question in the wrong
 * language.
 *
 * @param {object} text
 * @param {string} locale
 * @returns {string}
 */
export function readText(text, locale) {
  if (!text || typeof text !== 'object') return '';
  if (typeof text[locale] === 'string' && text[locale] !== '') return text[locale];
  if (typeof text.en === 'string' && text.en !== '') return text.en;

  for (const value of Object.values(text)) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

/**
 * A question set as one reader sees it.
 *
 * The values stay exactly as stored. Only the labels are resolved, because the
 * value is what an answer carries and translating it would break the match
 * against the question's own options.
 *
 * @param {unknown} questions
 * @param {string} locale
 */
export function readQuestions(questions, locale) {
  if (!Array.isArray(questions)) return [];

  return questions.map((question) => {
    const shaped = {
      id: question.id,
      type: question.type,
      required: question.required === true,
      label: readText(question.label, locale),
    };

    const help = readText(question.help, locale);
    if (help) shaped.help = help;

    if (Array.isArray(question.options)) {
      shaped.options = question.options.map((option) => ({
        value: option.value,
        label: readText(option.label, locale),
      }));
    }

    return shaped;
  });
}

/**
 * Answers paired with the questions they answer, for the admin view in 8.3:
 * "Answers come back on the tracking row beside the question each one answers,
 * never as a bare list of values, so an admin reading it a month later does not
 * have to work out what was asked."
 *
 * An answer whose question is no longer in the set is still listed, labelled
 * with its own key. That cannot happen while the freeze holds, and showing it
 * rather than dropping it is what would make a broken freeze visible.
 *
 * @param {unknown} questions the set stored on the task
 * @param {unknown} answers
 * @param {string} locale the admin's own language, per 8.3
 */
export function readAnswers(questions, answers, locale) {
  const set = Array.isArray(questions) ? questions : [];
  const given = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};

  const paired = set.map((question) => {
    const value = given[question.id];
    const options = Array.isArray(question.options) ? question.options : [];

    // The label in the admin's own language, resolved from the option value,
    // per 8.3. The value is what is stored; this is only how it is shown.
    const labelFor = (optionValue) => {
      const option = options.find((candidate) => candidate.value === optionValue);
      return option ? readText(option.label, locale) : String(optionValue);
    };

    let display = null;
    if (Array.isArray(value)) display = value.map(labelFor);
    else if (typeof value === 'string' && value !== '') {
      display = LIST_TYPES.includes(question.type) ? [labelFor(value)] : [value];
    }

    return {
      id: question.id,
      type: question.type,
      required: question.required === true,
      question: readText(question.label, locale),
      answered: display !== null && display.length > 0,
      values: Array.isArray(value) ? value : value === undefined ? [] : [value],
      display: display ?? [],
    };
  });

  const known = new Set(set.map((question) => question.id));
  for (const [id, value] of Object.entries(given)) {
    if (known.has(id)) continue;
    paired.push({
      id,
      type: null,
      required: false,
      question: id,
      answered: true,
      values: Array.isArray(value) ? value : [value],
      display: Array.isArray(value) ? value.map(String) : [String(value)],
      orphaned: true,
    });
  }

  return paired;
}

/* -------------------------------------------------------------------------
 * The reply: what an applicant may send back
 * ---------------------------------------------------------------------- */

/**
 * Validate a reply's answers against the set stored on the task.
 *
 * Section 9 spells out what this has to check, and it is the only thing that
 * may: "every required question answered, every choice and checkbox answer one
 * of that question's own option values, and nothing naming a question the task
 * does not carry."
 *
 * The last of those is the one worth keeping when this is next edited. Dropping
 * an unknown key silently would let a reply carry anything at all into a jsonb
 * column that an admin later reads as though it were an answer.
 *
 * @param {unknown} answers what the browser sent
 * @param {unknown} questions the set stored on the task
 * @returns {{ ok: true, value: object|null } | { ok: false, details: Record<string,string> }}
 */
export function checkAnswers(answers, questions) {
  const set = Array.isArray(questions) ? questions : [];

  if (set.length === 0) {
    // No questions on this task. An answers object here is a client sending
    // something that cannot mean anything, so it is refused rather than
    // ignored: the alternative is storing it and finding out later.
    if (answers === null || answers === undefined) return { ok: true, value: null };
    if (typeof answers === 'object' && Object.keys(answers).length === 0) {
      return { ok: true, value: null };
    }
    return { ok: false, details: { answers: FIELD.INVALID } };
  }

  if (answers === null || answers === undefined) {
    // Required questions still have to be answered, so an absent object fails
    // the same way an empty one does, through the loop below.
    return checkAnswers({}, questions);
  }

  if (typeof answers !== 'object' || Array.isArray(answers)) {
    return { ok: false, details: { answers: FIELD.INVALID } };
  }

  const known = new Map(set.map((question) => [question.id, question]));
  const details = {};

  for (const id of Object.keys(answers)) {
    if (!known.has(id)) details[id] = FIELD.INVALID;
  }

  const cleaned = {};

  for (const question of set) {
    const raw = answers[question.id];
    const field = question.id;

    if (question.type === 'checkbox') {
      const values = raw === undefined || raw === null ? [] : raw;
      if (!Array.isArray(values)) {
        details[field] = FIELD.INVALID;
        continue;
      }

      const allowed = new Set((question.options ?? []).map((option) => option.value));
      const chosen = [];

      for (const value of values) {
        if (typeof value !== 'string' || !allowed.has(value)) {
          details[field] = FIELD.INVALID;
          break;
        }
        // A duplicate tick is the same tick. Silently deduped rather than
        // refused: nothing about it is a person's mistake to correct.
        if (!chosen.includes(value)) chosen.push(value);
      }

      if (details[field]) continue;
      if (question.required && chosen.length === 0) {
        details[field] = FIELD.REQUIRED;
        continue;
      }
      if (chosen.length > 0) cleaned[field] = chosen;
      continue;
    }

    if (raw === undefined || raw === null || raw === '') {
      if (question.required) details[field] = FIELD.REQUIRED;
      continue;
    }

    if (typeof raw !== 'string') {
      details[field] = FIELD.INVALID;
      continue;
    }

    if (question.type === 'choice') {
      const allowed = new Set((question.options ?? []).map((option) => option.value));
      if (!allowed.has(raw)) {
        details[field] = FIELD.INVALID;
        continue;
      }
      cleaned[field] = raw;
      continue;
    }

    const max = question.type === 'long_answer' ? LONG_ANSWER_MAX : SHORT_ANSWER_MAX;
    // Only the ends are trimmed. A long answer's own line breaks are the
    // applicant's formatting and are theirs to keep.
    const text = raw.trim();
    if (text === '') {
      if (question.required) details[field] = FIELD.REQUIRED;
      continue;
    }
    if (text.length > max) {
      details[field] = FIELD.TOO_LONG;
      continue;
    }

    cleaned[field] = text;
  }

  if (Object.keys(details).length > 0) return { ok: false, details };

  // An empty object would satisfy migration 031's constraint but says nothing.
  // Null is the honest value for a reply that answered no questions, and it is
  // what an ordinary reply box task stores.
  return { ok: true, value: Object.keys(cleaned).length > 0 ? cleaned : null };
}

/**
 * Whether a stored set has anything in it. One place, because "does this task
 * carry questions" is asked by the renderer, the admin list, and the auto-raise.
 */
export function hasQuestions(questions) {
  return Array.isArray(questions) && questions.length > 0;
}
