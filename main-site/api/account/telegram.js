// GET  /api/account/telegram   is this account linked, and to whom
// POST /api/account/telegram   { action: 'start' | 'unlink' }
//
// The applicant's own half of section 15's linking flow. The admin's half is
// api/admin/applicants.js, which has been able to read and remove a link since
// phase 8 and is deliberately a different route with a different actor.
//
// **`start` returns a QR matrix, not an image.** api/_lib/qr.js answers rows of
// '0' and '1' and assets/js/telegram-link.js draws one SVG path from them with
// DOM calls. Sending markup for the browser to assign would break the build's
// rule that ts_headline is the only field assigned that way, and sending an
// image would put a linking token, which is a credential, into a URL that gets
// logged, cached and shared by everything it passes through.
//
// **GET is what the page polls.** Section 15 step 4: the settings page flips to
// linked without a refresh. It is a small indexed read of one row, it is
// no-store, and the page stops asking the moment the token expires.
//
// HEAD is not offered. Every other route a stranger may fetch answers it, per
// the rule phase 4 added, and this one is not fetchable by a stranger at all:
// it is behind requireApplicant and there is nothing to preflight.

import { ok, fail, ERR, methodNotAllowed, failInternal, readJson } from '../_lib/respond.js';
import { requireApplicant } from '../_lib/session.js';
import { unavailable } from '../_lib/maintenance.js';
import { AUDIT, auditApplicant } from '../_lib/audit.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import { createLinkToken, linkState, unlink, LINK_TOKEN_TTL_MS } from '../_lib/telegram.js';
import { encodeQr } from '../_lib/qr.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  // 8.12's shared guard. Off means off, including the API: a disabled control
  // stops nobody with a stale tab.
  if (await unavailable(res, 'telegram_link')) return;

  const session = await requireApplicant(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') return await sendState(res, session.user.id);

    const body = await readJson(req, res);
    if (body === null) return;

    const action = typeof body.action === 'string' ? body.action : '';

    // Counted on success, like report, apply, save and withdraw: there is no
    // secret being guessed here, and what is worth bounding is how many token
    // rows one account can add in an hour.
    const subjects = [subjectForUser('applicant', session.user.id), subjectForIp(req)];
    if (await limited(res, 'telegramLink', subjects)) return;

    if (action === 'start') return await start(res, session.user, subjects);
    if (action === 'unlink') return await remove(res, session.user, subjects);

    return fail(res, ERR.BAD_REQUEST, 'That is not something this endpoint does.', {
      details: { field: 'action' },
    });
  } catch (cause) {
    return failInternal(res, cause, 'telegram');
  }
}

async function sendState(res, applicantId) {
  const link = await linkState(applicantId);

  // no-store rather than a short max-age. This is polled while somebody watches
  // the screen for it to change, and a browser reusing its own copy for even
  // thirty seconds would show them a stale answer to the one question they are
  // sitting there asking.
  res.setHeader('Cache-Control', 'no-store');

  return ok(res, { linked: link !== null, link });
}

async function start(res, user, subjects) {
  const existing = await linkState(user.id);
  if (existing) {
    // One Telegram account to one portal account, enforced by unique
    // constraints on both sides in migration 011. Answering with the state
    // rather than an error lets a page with two tabs open settle on the truth.
    return ok(res, { linked: true, link: existing, alreadyLinked: true });
  }

  const { url, expiresAt } = await createLinkToken(user.id);

  await recordFailures('telegramLink', subjects, LIMITS.telegramLink);

  const qr = encodeQr(url);

  return ok(res, {
    linked: false,
    url,
    expiresAt,
    ttlMs: LINK_TOKEN_TTL_MS,
    qr: { size: qr.size, rows: qr.rows },
  });
}

async function remove(res, user, subjects) {
  const { removed, skipped } = await unlink(user.id);

  if (!removed) {
    // Not an error. Somebody who unlinked in the bot a moment ago and then
    // pressed the button here has got what they asked for.
    return ok(res, { linked: false, removed: false });
  }

  await recordFailures('telegramLink', subjects, LIMITS.telegramLink);

  // The applicant's own action, so the applicant realm and their own id. The
  // admin doing it to somebody else is applicant_telegram_unlinked, written by
  // api/_lib/admin-applicants.js, and the two are deliberately different
  // actions: what the log has to be able to answer later is who decided.
  await auditApplicant(user, AUDIT.TELEGRAM_UNLINKED, { skipped, source: 'settings' });

  return ok(res, { linked: false, removed: true, skipped });
}
