// GET  /api/account/telegram   is this account linked, and to whom
// POST /api/account/telegram   { action: 'start' | 'unlink' | 'twofa' | 'test' | 'code' }
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
import { requireApplicant, revokeAllTrustedDevices } from '../_lib/session.js';
import { codeCounts } from '../_lib/accounts.js';
import { unavailable } from '../_lib/maintenance.js';
import { AUDIT, auditApplicant } from '../_lib/audit.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForUser,
  subjectForIp,
} from '../_lib/rate-limit.js';
import {
  createLinkToken,
  linkState,
  unlink,
  setTwofa,
  queueTestMessage,
  requestLoginCode,
  LINK_TOKEN_TTL_MS,
} from '../_lib/telegram.js';
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
    if (action === 'twofa') return await twofa(res, session.user, body, subjects);
    if (action === 'test') return await test(res, session.user, subjects);
    if (action === 'code') return await code(res, session.user, subjects);

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

/**
 * Turn the second factor on or off. 7g's Telegram panel, the third control.
 *
 * **Backup codes have to exist first**, per 5c: "Require that set to exist
 * before 2FA can be switched on, generating it in the same flow if it does
 * not." The generating is the client's job on the security page, so the refusal
 * here names what is missing rather than answering a flat no, and the panel
 * sends them to the one page that can fix it.
 *
 * **Both directions revoke every trusted device**, per 5d. Off is the direction
 * 5d actually lists; on is the one that matters more, because a browser trusted
 * while the factor was off would otherwise walk straight past the factor being
 * switched on. It is also what makes an unlink from inside the chat safe: the
 * bot cannot reach the trusted device table and does not need to, since nothing
 * trusted before this moment survives it.
 */
async function twofa(res, user, body, subjects) {
  if (await unavailable(res, 'telegram_2fa')) return;

  const enabled = body.enabled === true;

  const link = await linkState(user.id);
  if (!link) {
    return fail(res, ERR.BAD_REQUEST, 'Link Telegram before turning this on.', {
      details: { reason: 'not_linked' },
    });
  }

  if (enabled) {
    const counts = await codeCounts('applicant', user.id);
    if (counts.backup === 0) {
      return fail(
        res,
        ERR.BAD_REQUEST,
        'Generate your two factor backup codes first. Losing Telegram with no codes means asking an admin to get back in.',
        { details: { reason: 'no_backup_codes' } }
      );
    }
  }

  if (link.twofaEnabled === enabled) {
    // Already where they asked for. Not an error, and nothing is revoked for a
    // switch that did not move: two tabs open on this page should settle on the
    // truth rather than sign somebody out of their own laptop twice.
    return ok(res, { linked: true, twofaEnabled: enabled, changed: false });
  }

  await setTwofa(user.id, enabled);
  await revokeAllTrustedDevices('applicant', user.id);

  await recordFailures('telegramLink', subjects, LIMITS.telegramLink);

  await auditApplicant(
    user,
    enabled ? AUDIT.TELEGRAM_2FA_ENABLED : AUDIT.TELEGRAM_2FA_DISABLED,
    { source: 'settings' }
  );

  return ok(res, { linked: true, twofaEnabled: enabled, changed: true });
}

/**
 * Queue the test message. 7g asks for it beside the unlink and the toggle.
 *
 * It answers as soon as the row is written, which is the honest thing to say
 * and the only thing this side knows: the site never waits on a Telegram send.
 * The wording on the page says a message is on its way rather than that one has
 * arrived, for the same reason.
 */
async function test(res, user, subjects) {
  const link = await linkState(user.id);
  if (!link) {
    return fail(res, ERR.BAD_REQUEST, 'There is nothing linked to send to.', {
      details: { reason: 'not_linked' },
    });
  }

  await queueTestMessage(user.id);
  await recordFailures('telegramLink', subjects, LIMITS.telegramLink);

  return ok(res, { queued: true });
}

/**
 * Ask for a fresh sign in code while already signed in.
 *
 * This is 7g step 3's other half: with Telegram 2FA on, the danger zone asks
 * for a code as well as a password, and something has to send one. It is the
 * same request the password step makes, minus the nonce, so no magic link is
 * ever produced for it — a one tap sign in for somebody who is already signed
 * in would be a credential in a chat window for no reason at all.
 *
 * Its own bucket, and a tight one. Every other action on this route writes a
 * row somebody asked for; this one makes a message arrive on a person's phone,
 * and the thing worth bounding is how many times an hour a borrowed session can
 * do that.
 */
async function code(res, user, subjects) {
  if (await unavailable(res, 'telegram_2fa')) return;

  if (await limited(res, 'telegramCode', subjects)) return;

  const link = await linkState(user.id);
  if (!link?.twofaEnabled) {
    // Section 15: never send a code to a Telegram account that is not currently
    // linked to the account it is for. An account that has not switched the
    // factor on has nothing here to confirm.
    return fail(res, ERR.BAD_REQUEST, 'Telegram sign in codes are not on for this account.', {
      details: { reason: 'not_enabled' },
    });
  }

  const { expiresAt } = await requestLoginCode(user.id);
  await recordFailures('telegramCode', subjects, LIMITS.telegramCode);

  return ok(res, { requested: true, expiresAt });
}
