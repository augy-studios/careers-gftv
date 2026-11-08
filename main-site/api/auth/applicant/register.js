// POST /api/auth/applicant/register
//
// Section 5b. Username, display name, email, password, confirm. Uniqueness on
// username and email. Accounts are active immediately: no approval queue, no
// email verification, because there is no email in this build at all.
//
// The account is signed in on success, so registration and login are one step
// from the applicant's point of view and the ?redirect= from section 4 carries
// through to the posting they started from.
//
// Recovery codes are not generated here. The response asks the client to
// generate them straight away, which it does with the password still in the
// form, so registration itself stays one password hash rather than eleven.
// Nothing about the account depends on that second call succeeding.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import {
  validateUsername,
  validateDisplayName,
  validateEmail,
  collect,
  FIELD,
} from '../../_lib/validate.js';
import { validatePublishedLocale } from '../../_lib/locales.js';
import { checkPasswordStrength, hashSecret, PASSWORD_MINIMUM_LENGTH } from '../../_lib/password.js';
import { isUsernameTaken, isEmailTaken, uniqueViolationDetails } from '../../_lib/accounts.js';
import { supabase, TABLES } from '../../_lib/supabase.js';
import { createApplicantSession, publicApplicant } from '../../_lib/session.js';
import { LIMITS, limited, recordFailure, subjectForIp } from '../../_lib/rate-limit.js';

/**
 * Create an applicant account from a username, display name, email and
 * password. Checks every field and that the username and email are free, creates
 * the account, signs the person in, and returns their recovery codes once.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  // Per IP only. There is no account to limit against yet, and limiting by the
  // username being registered would let anyone block a name they do not own.
  const ipSubject = subjectForIp(request);
  if (await limited(response, 'register', [ipSubject])) return;

  const { values, details } = collect({
    username: validateUsername(body.username),
    display_name: validateDisplayName(body.display_name),
    email: validateEmail(body.email),
  });

  const fieldErrors = details ?? {};

  const strength = checkPasswordStrength(body.password);
  if (!strength.ok) fieldErrors.password = strength.code;

  if (typeof body.password_confirm !== 'string' || body.password_confirm !== body.password) {
    fieldErrors.password_confirm = FIELD.MISMATCH;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'Some of those details need fixing.', {
      details: fieldErrors,
    });
  }

  const locale = await validatePublishedLocale(body.locale);

  try {
    // A courtesy check, so the form can point at the field rather than saying
    // "that did not work". The unique indexes are the actual guarantee and are
    // handled below.
    const [usernameTaken, emailTaken] = await Promise.all([
      isUsernameTaken(values.username),
      isEmailTaken(values.email),
    ]);

    const takenErrors = {};
    if (usernameTaken) takenErrors.username = FIELD.TAKEN;
    if (emailTaken) takenErrors.email = FIELD.TAKEN;

    if (Object.keys(takenErrors).length > 0) {
      await recordFailure('register', ipSubject, LIMITS.register);
      return fail(response, ERROR_CODES.CONFLICT, 'That account could not be created.', {
        details: takenErrors,
      });
    }

    const passwordHash = await hashSecret(body.password);

    let localeValue;

    if (locale.ok) {
      localeValue = locale.value;
    } else {
      localeValue = 'en';
    }

    const { data, error } = await supabase
      .from(TABLES.users)
      .insert({
        username: values.username,
        display_name: values.display_name,
        email: values.email,
        password_hash: passwordHash,
        locale: localeValue,
      })
      .select(
        'id, username, display_name, email, avatar_url, phone, locale, totp_secret, created_at'
      )
      .single();

    if (error) {
      const conflict = uniqueViolationDetails(error);
      if (conflict) {
        await recordFailure('register', ipSubject, LIMITS.register);
        return fail(response, ERROR_CODES.CONFLICT, 'That account could not be created.', {
          details: conflict,
        });
      }
      return failInternal(response, error, 'register insert');
    }

    await createApplicantSession(response, data.id, body.stay_signed_in === true);

    return ok(
      response,
      {
        user: publicApplicant(data),
        // 5c: recovery codes are the only self serve way back into an account,
        // so the client shows the dialog immediately rather than leaving it to
        // a settings page nobody visits.
        generate_recovery_codes: true,
        password_min_length: PASSWORD_MINIMUM_LENGTH,
      },
      { status: 201 }
    );
  } catch (cause) {
    return failInternal(response, cause, 'register');
  }
}
