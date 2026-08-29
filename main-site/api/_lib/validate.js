// Input validation.
//
// Section 9: "Validate and sanitise every input."
//
// Two rules run through this file. The first is that a validator returns a
// cleaned value rather than a boolean, so a route never validates one string
// and then goes on to use a different one. The second is that field level
// failures come back as a code rather than as English, because the client
// renders them from the dictionary and the same endpoint answers a Chinese
// reader. respond.js puts them in error.details, which is the only place
// anything field specific is allowed to travel.
//
// Nothing here builds SQL. Every query in this build goes through PostgREST
// with parameterised filters, so the job of this file is shape and length, not
// escaping.

/** Field error codes. The client maps these to dictionary keys. */
export const FIELD = Object.freeze({
  REQUIRED: 'required',
  TOO_SHORT: 'too_short',
  TOO_LONG: 'too_long',
  INVALID: 'invalid',
  TAKEN: 'taken',
  MISMATCH: 'mismatch',
});

const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const DISPLAY_NAME_MAX = 60;
const EMAIL_MAX = 254;
// Shorter than a display name on purpose. It is read in a list beside a date
// and a revoke button, and "the laptop I use at my sister's place" wrapping onto
// three lines helps nobody pick their own device out.
const DEVICE_NAME_MAX = 40;

/**
 * A username: letters, digits, underscore, hyphen, full stop.
 *
 * Deliberately narrow. Usernames are compared case insensitively and appear in
 * URLs and in Telegram messages, so anything that normalises differently in
 * two places, such as a Unicode homoglyph or a trailing space, is rejected
 * rather than silently folded.
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
export function validateUsername(value) {
  if (typeof value !== 'string') return { ok: false, code: FIELD.REQUIRED };
  const trimmed = value.trim();

  if (trimmed === '') return { ok: false, code: FIELD.REQUIRED };
  if (trimmed.length < USERNAME_MIN) return { ok: false, code: FIELD.TOO_SHORT };
  if (trimmed.length > USERNAME_MAX) return { ok: false, code: FIELD.TOO_LONG };
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return { ok: false, code: FIELD.INVALID };
  // Leading or trailing punctuation reads as a typo and makes two accounts
  // look identical in a list.
  if (/^[._-]|[._-]$/.test(trimmed)) return { ok: false, code: FIELD.INVALID };

  return { ok: true, value: trimmed };
}

/**
 * A display name. Anything a person wants to be called, within reason, so this
 * is length bounded rather than character bounded. Control characters go,
 * since they render as nothing and can hide text.
 * @param {unknown} value
 */
export function validateDisplayName(value) {
  if (typeof value !== 'string') return { ok: false, code: FIELD.REQUIRED };

  // Strip control characters and collapse runs of whitespace, so a name pasted
  // out of a document does not arrive with a newline in the middle.
  const cleaned = [...value]
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return !(code <= 0x1f || code === 0x7f);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned === '') return { ok: false, code: FIELD.REQUIRED };
  if (cleaned.length > DISPLAY_NAME_MAX) return { ok: false, code: FIELD.TOO_LONG };

  return { ok: true, value: cleaned };
}

/**
 * What somebody calls one of their own trusted devices.
 *
 * The same cleaning as a display name and a tighter ceiling, because it is read
 * in a list rather than in a sentence. Nobody but its owner ever sees it, which
 * is why it is bounded rather than restricted: 5d's list exists so a person can
 * recognise their own laptop, and "Mum's iPad" has an apostrophe in it.
 *
 * @param {unknown} value
 */
export function validateDeviceName(value) {
  const cleaned = validateDisplayName(value);
  if (!cleaned.ok) return cleaned;

  if (cleaned.value.length > DEVICE_NAME_MAX) return { ok: false, code: FIELD.TOO_LONG };

  return cleaned;
}

/**
 * An email address.
 *
 * Checked by shape rather than by RFC 5322, on purpose. There is no email in
 * this build, per section 10 item 3, so this address is a login identifier and
 * a contact detail rather than something we deliver to. A validator strict
 * enough to reject a real address would cost more than it saves.
 *
 * Stored as typed and compared lowercased, which is what the unique index on
 * lower(email) enforces.
 *
 * @param {unknown} value
 */
export function validateEmail(value) {
  if (typeof value !== 'string') return { ok: false, code: FIELD.REQUIRED };
  const trimmed = value.trim();

  if (trimmed === '') return { ok: false, code: FIELD.REQUIRED };
  if (trimmed.length > EMAIL_MAX) return { ok: false, code: FIELD.TOO_LONG };
  if (/\s/.test(trimmed)) return { ok: false, code: FIELD.INVALID };

  // One @, something before it, and a dotted host after it.
  if (!/^[^@]+@[^@]+\.[^@.]{2,}$/.test(trimmed)) {
    return { ok: false, code: FIELD.INVALID };
  }

  return { ok: true, value: trimmed };
}

/**
 * A six digit code, as typed. Spaces are tolerated because a phone keyboard
 * and a copied message both add them.
 * @param {unknown} value
 */
export function validateSixDigits(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, code: FIELD.REQUIRED };
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits === '') return { ok: false, code: FIELD.REQUIRED };
  if (digits.length !== 6) return { ok: false, code: FIELD.INVALID };
  return { ok: true, value: digits };
}

/**
 * A locale code. Checked against the list the client knows about rather than
 * against the database, since this is called on a hot path and adding a
 * language is a deploy anyway.
 * @param {unknown} value
 */
export const LOCALES = Object.freeze(['en', 'zh']);

export function validateLocale(value) {
  if (typeof value !== 'string') return { ok: false, code: FIELD.REQUIRED };
  const trimmed = value.trim().toLowerCase();
  if (!LOCALES.includes(trimmed)) return { ok: false, code: FIELD.INVALID };
  return { ok: true, value: trimmed };
}

/**
 * The locale for a request that returns content, defaulting to English.
 * Section 9: "A caller that sends no locale gets English."
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function localeFromRequest(req) {
  try {
    const url = new URL(req.url ?? '/', 'https://careers.invalid');
    const fromQuery = url.searchParams.get('locale');
    const checked = validateLocale(fromQuery);
    if (checked.ok) return checked.value;
  } catch {
    // Unparseable URL. English it is.
  }
  return 'en';
}

/**
 * A free text field with a length cap, used for device labels and notes.
 * @param {unknown} value
 * @param {number} maxLength
 * @param {{ required?: boolean }} [options]
 */
export function validateText(value, maxLength, options = {}) {
  if (typeof value !== 'string') {
    return options.required ? { ok: false, code: FIELD.REQUIRED } : { ok: true, value: null };
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return options.required ? { ok: false, code: FIELD.REQUIRED } : { ok: true, value: null };
  }
  if (trimmed.length > maxLength) return { ok: false, code: FIELD.TOO_LONG };
  return { ok: true, value: trimmed };
}

/**
 * Collect several validators into one details object.
 *
 * Usage:
 *   const { values, details } = collect({
 *     username: validateUsername(body.username),
 *     email: validateEmail(body.email),
 *   });
 *   if (details) return fail(res, ERR.BAD_REQUEST, '...', { details });
 *
 * @param {Record<string, { ok: boolean, value?: unknown, code?: string }>} results
 * @returns {{ values: Record<string, unknown>, details: Record<string,string>|null }}
 */
export function collect(results) {
  const values = {};
  const details = {};
  let failed = false;

  for (const [field, result] of Object.entries(results)) {
    if (result.ok) {
      values[field] = result.value;
    } else {
      details[field] = result.code;
      failed = true;
    }
  }

  return { values, details: failed ? details : null };
}

/**
 * Whether a body field is present at all, for endpoints where a missing field
 * and an invalid one need different answers.
 * @param {unknown} body
 * @param {string} field
 */
export function has(body, field) {
  return (
    body !== null &&
    typeof body === 'object' &&
    Object.prototype.hasOwnProperty.call(body, field)
  );
}
