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

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { getApplicantSession } from '../../_lib/session.js';
import { validateLocale } from '../../_lib/validate.js';
import { supabase, T } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = await readJson(req, res);
  if (!body) return;

  const locale = validateLocale(body.locale);
  if (!locale.ok) {
    return fail(res, ERR.BAD_REQUEST, 'That is not a language this site has.', {
      details: { locale: locale.code },
    });
  }

  try {
    const session = await getApplicantSession(req);
    if (!session) return ok(res, { stored: false, locale: locale.value });

    if (session.user.locale === locale.value) {
      return ok(res, { stored: true, locale: locale.value });
    }

    const { error } = await supabase
      .from(T.users)
      .update({ locale: locale.value })
      .eq('id', session.user.id);

    if (error) return failInternal(res, error, 'applicant locale');

    return ok(res, { stored: true, locale: locale.value });
  } catch (cause) {
    return failInternal(res, cause, 'applicant locale');
  }
}
