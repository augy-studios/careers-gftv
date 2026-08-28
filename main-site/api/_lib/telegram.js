// The site's half of Telegram linking. Specification section 15.
//
// **The site never calls the bot**, and this file is where that rule is easiest
// to break. Nothing here opens a connection to Telegram, waits for a bot, or
// checks whether one is running. It writes a token row and hands back a link,
// and the bot picks the work up from the database on its own schedule.
//
// The three tables all come from migration 011 and none of them are named the
// way the rest of this build names things: the column is `applicant_id` rather
// than `user_id`, and `linked_at` rather than `created_at`. That is worth
// knowing before writing a query against them from memory.
//
// **What a linking token is.** 32 bytes of CSPRNG output, base64url, stored as a
// SHA-256 hash and never in the clear. High entropy and looked up by hash, so
// the fast hash is right and the lookup is one indexed query, per the note at
// the top of tokens.js. Ten minutes, single use, per section 15 step 5.
//
// **Starting a new one spends the old one.** Section 15 says tokens are single
// use, and a person who opens the settings page three times should not be
// leaving three live credentials for their own account lying in a table. Only
// the newest QR works, which is also what somebody looking at two screens
// expects.

import { supabase, T } from './supabase.js';
import { randomToken, sha256 } from './tokens.js';
import { optionalEnv } from './env.js';

/** Ten minutes, per section 15 step 5. */
export const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * The bot the deep link points at.
 *
 * Section 15 fixes this as `careersgftv_bot` and the default is that. It is
 * overridable because during this phase a second bot is the only way to try the
 * flow without pointing real applicants at a half built one, and because the
 * value is public: it is in the link itself.
 */
export const BOT_USERNAME = optionalEnv('TELEGRAM_BOT_USERNAME', 'careersgftv_bot');

/** The deep link that sends `/start <token>` to the bot. */
export function deepLink(token) {
  return `https://t.me/${BOT_USERNAME}?start=${token}`;
}

/**
 * The link as the account page needs to draw it, or null when there is none.
 *
 * A failure to read is thrown rather than swallowed here, unlike the admin
 * dashboard's copy of this query, which returns null so that a phase 11 table
 * cannot take the phase 8 account panel down. The difference is what the answer
 * is for: this one *is* the page, and quietly reporting "not linked" to
 * somebody who is linked would invite them to link again and be refused by a
 * unique constraint they cannot see.
 */
export async function linkState(applicantId) {
  const { data, error } = await supabase
    .from(T.telegramLinks)
    .select('id, telegram_username, telegram_display_name, twofa_enabled, linked_at')
    .eq('applicant_id', applicantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    username: data.telegram_username ?? null,
    displayName: data.telegram_display_name ?? null,
    twofaEnabled: data.twofa_enabled === true,
    linkedAt: data.linked_at,
  };
}

/**
 * Issue a linking token and spend any earlier one.
 *
 * @param {string} applicantId
 * @returns {Promise<{ token: string, url: string, expiresAt: string }>}
 */
export async function createLinkToken(applicantId) {
  const now = new Date();

  // Spend the outstanding ones first. Marked used rather than deleted, so the
  // nightly sweep still sees them and so a token that stopped working leaves a
  // trace of why.
  const { error: spendError } = await supabase
    .from(T.telegramTokens)
    .update({ used_at: now.toISOString() })
    .eq('applicant_id', applicantId)
    .eq('purpose', 'link')
    .is('used_at', null);

  if (spendError) throw spendError;

  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);

  const { error } = await supabase.from(T.telegramTokens).insert({
    applicant_id: applicantId,
    token_hash: sha256(token),
    purpose: 'link',
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;

  return { token, url: deepLink(token), expiresAt: expiresAt.toISOString() };
}

/**
 * Remove the link, and stop anything queued for a chat that no longer exists.
 *
 * **Queued rows are skipped and claimed rows are left alone**, which is phase 11
 * open decision 3, settled 28 August 2026. A claimed row is in the drain's
 * hands: it has been taken out of the queue by one conditional update and is
 * about to be sent, and writing to it from here would put two processes on one
 * row and make the claim mean less than it does. The bot re-reads the link
 * immediately before each send and skips a row whose link has gone, so the only
 * message that can still arrive after an unlink is one already handed to
 * Telegram, which nothing anywhere could have called back.
 *
 * **Nothing is deleted.** The outbox is the record of what we tried to send, and
 * a row marked skipped says something a missing row does not.
 *
 * Sessions and trusted devices are untouched, unlike the admin's assisted
 * unlink in 8.9. That one is part of handing an account back to somebody who
 * may have lost control of it; this one is a person tidying up their own
 * settings, and signing them out of everything for it would be a punishment for
 * housekeeping.
 *
 * @param {string} applicantId
 * @returns {Promise<{ removed: boolean, skipped: number }>}
 */
export async function unlink(applicantId) {
  const { data: deleted, error } = await supabase
    .from(T.telegramLinks)
    .delete()
    .eq('applicant_id', applicantId)
    .select('id');

  if (error) throw error;

  const { data: stopped, error: skipError } = await supabase
    .from(T.notifications)
    .update({
      status: 'skipped',
      // The column is named error and this is not one. It is the answer to the
      // question an admin reading a skipped row actually has, which is why.
      error: 'telegram unlinked before it was sent',
    })
    .eq('applicant_id', applicantId)
    .eq('status', 'queued')
    .select('id');

  if (skipError) throw skipError;

  return { removed: (deleted?.length ?? 0) > 0, skipped: stopped?.length ?? 0 };
}
