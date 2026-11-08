// POST /api/auth/applicant/locale
//
// Section 3a, and the reason migration 020 exists. The language choice lives in
// localStorage, which means the browser knows it and the server does not. That
// is fine until the server has to start the conversation, which is exactly what
// the Telegram bot does in section 15: invitations, task requests, and status
// changes go to people who are not looking at the site.
//
// So this endpoint records the choice against the account whenever a signed in
// applicant changes language. localStorage stays the source of truth for
// rendering; this column is what phase 11 reads.
//
// Being signed out is not an error. i18n.js calls this on every language change
// without knowing whether anybody is signed in, and a 401 on every anonymous
// language switch would be noise in the console rather than information.

import {
  ok,
  fail,
  ERROR_CODES,
  methodNotAllowed,
  readJson,
  failInternal,
} from '../../_lib/respond.js';
import { getApplicantSession } from '../../_lib/session.js';
import { validatePublishedLocale } from '../../_lib/locales.js';
import { supabase, TABLES } from '../../_lib/supabase.js';

/**
 * Remember the signed in applicant's chosen language, so messages sent to them
 * (Telegram, tasks) use it.
 */
export default async function handler(request, response) {
  if (methodNotAllowed(request, response, ['POST'])) return;

  const body = await readJson(request, response);
  if (!body) return;

  const locale = await validatePublishedLocale(body.locale);
  if (!locale.ok) {
    return fail(response, ERROR_CODES.BAD_REQUEST, 'That is not a language this site has.', {
      details: { locale: locale.code },
    });
  }

  try {
    const session = await getApplicantSession(request);
    if (!session) return ok(response, { stored: false, locale: locale.value });

    if (session.user.locale === locale.value) {
      return ok(response, { stored: true, locale: locale.value });
    }

    const { error } = await supabase
      .from(TABLES.users)
      .update({ locale: locale.value })
      .eq('id', session.user.id);

    if (error) return failInternal(response, error, 'applicant locale');

    return ok(response, { stored: true, locale: locale.value });
  } catch (cause) {
    return failInternal(response, cause, 'applicant locale');
  }
}
