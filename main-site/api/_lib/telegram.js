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
//
// **Part 3 added the other two purposes**, and they invert who generates the
// secret. A linking token is written here in full because the person carrying
// it is standing in front of this site; a login code and a magic link are
// written here as a *request* and filled in by the bot, because the bot is the
// only thing that can deliver them and a secret this file generated would have
// to cross the table in the clear to reach it. See PENDING_PREFIX.

import { supabase, T } from './supabase.js';
import { randomToken, sha256 } from './tokens.js';
import { verifySecret, verifyAgainstNothing } from './password.js';
import { revokeAllTrustedDevices } from './session.js';
import { optionalEnv } from './env.js';

/** Ten minutes, per section 15 step 5. */
export const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Five minutes, per section 15's login codes and magic links. */
export const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * How many wrong guesses one code takes before it is dead.
 *
 * 5c asks for a cap per code as well as per account. The per account half is
 * the `telegramCode` rate limit bucket; this is the per code half, and it is
 * the tighter of the two on purpose: six digits is a million values, and five
 * guesses against one code is the ceiling that makes the five minute life the
 * thing that matters rather than the guessing.
 */
export const CODE_ATTEMPT_CAP = 5;

/**
 * What sits in `token_hash` on a row the bot has not filled in yet.
 *
 * **The site asks for a code and the bot generates it**, which is the reverse
 * of how section 15 reads and is forced by the rule above it: the site never
 * calls the bot, so the process that sends the message is the only one that can
 * know what it says. A code the site generated would have to reach the bot
 * through this table in the clear, which is exactly what "stored hashed, never
 * in the clear" forbids. So the site writes a row that means *somebody wants a
 * code*, and the bot claims it, generates six digits, sends them, and writes
 * back the bcrypt hash. The plaintext exists in one process and one chat
 * message and nowhere else.
 *
 * The sentinel is a prefix rather than a null because migration 011 has
 * `token_hash text not null` and this phase adds no migration. A bcrypt hash
 * always starts `$2`, so the two can never be confused, and the random tail is
 * what the bot's conditional claim matches on.
 */
export const PENDING_PREFIX = 'pending:';

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

/* -------------------------------------------------------------------------
 * Login codes and magic links, section 15
 * ---------------------------------------------------------------------- */

/**
 * Ask for a code to be sent, and kill every code already outstanding.
 *
 * Section 15: six digits, five minutes, single use, "invalidated on a
 * successful login or on issuing a newer code". The second half is this call's
 * first statement, and it covers the magic link too: one request produces one
 * message, and the message before it stops working the moment this one is
 * written. Two live codes for one account is two chances for somebody reading
 * over a shoulder.
 *
 * **A nonce means a browser is waiting.** Passing one asks for the one tap
 * magic link as well, bound to that browser; passing none asks for the code
 * alone, which is what `/code` typed into the chat gets. The bot decides what
 * to send by whether the row carries a nonce hash, so a request that came from
 * no browser can never produce a link that signs one in.
 *
 * @param {string} applicantId
 * @param {{ nonce?: string|null }} [options]
 * @returns {Promise<{ expiresAt: string }>}
 */
export async function requestLoginCode(applicantId, options = {}) {
  const now = new Date();

  const { error: spendError } = await supabase
    .from(T.telegramTokens)
    .update({ used_at: now.toISOString() })
    .eq('applicant_id', applicantId)
    .in('purpose', ['login_code', 'magic_link'])
    .is('used_at', null);

  if (spendError) throw spendError;

  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  const { error } = await supabase.from(T.telegramTokens).insert({
    applicant_id: applicantId,
    token_hash: `${PENDING_PREFIX}${randomToken(18)}`,
    purpose: 'login_code',
    expires_at: expiresAt.toISOString(),
    browser_nonce_hash: options.nonce ? sha256(options.nonce) : null,
  });

  if (error) throw error;

  return { expiresAt: expiresAt.toISOString() };
}

/**
 * Kill every outstanding code and magic link for one account.
 *
 * Section 15: "invalidated on a successful login or on issuing a newer code."
 * The second half is inside `requestLoginCode`; this is the first, and it is
 * called on *any* successful second step rather than only on the code path. A
 * sign in finished with a passkey leaves the pushed code and its one tap link
 * live for the rest of their five minutes otherwise, which is a credential
 * sitting in a chat window for a sign in that has already happened.
 *
 * @param {string} applicantId
 */
export async function spendOutstandingCodes(applicantId) {
  const { error } = await supabase
    .from(T.telegramTokens)
    .update({ used_at: new Date().toISOString() })
    .eq('applicant_id', applicantId)
    .in('purpose', ['login_code', 'magic_link'])
    .is('used_at', null);

  if (error) throw error;
}

/**
 * Check a typed six digit code and spend it.
 *
 * Only the newest outstanding code is ever considered. `requestLoginCode`
 * spends the older ones as it writes a new one, so this reading the newest is
 * belt and braces rather than the mechanism.
 *
 * **A row still carrying the pending sentinel is not a wrong code**, it is a
 * message that has not been sent yet, and the answer is the same either way on
 * purpose: telling somebody typing at a login form that their code exists but
 * has not left the building yet is a distinction only an attacker benefits
 * from. The caller's generic sentence covers both.
 *
 * @param {string} applicantId
 * @param {string} typed
 * @returns {Promise<boolean>}
 */
export async function verifyLoginCode(applicantId, typed) {
  const digits = String(typed ?? '').replace(/\D/g, '');

  const { data, error } = await supabase
    .from(T.telegramTokens)
    .select('id, token_hash, attempts')
    .eq('applicant_id', applicantId)
    .eq('purpose', 'login_code')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = data?.[0];

  // No code, or one nobody has been sent yet. Pay for a comparison anyway, so
  // an account with nothing outstanding does not answer faster than one with a
  // live code and a wrong guess.
  if (!row || row.token_hash.startsWith(PENDING_PREFIX) || digits.length !== 6) {
    await verifyAgainstNothing(digits);
    return false;
  }

  // 5c's per code cap. Spent rather than merely refused: a code that has been
  // guessed at five times is a code somebody else is working on.
  if ((row.attempts ?? 0) >= CODE_ATTEMPT_CAP) {
    await supabase
      .from(T.telegramTokens)
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id);
    await verifyAgainstNothing(digits);
    return false;
  }

  // Counted before the comparison, not after. A cap that is written once the
  // answer is known is a cap that a request abandoned mid-flight walks past.
  const { error: countError } = await supabase
    .from(T.telegramTokens)
    .update({ attempts: (row.attempts ?? 0) + 1 })
    .eq('id', row.id);

  if (countError) throw countError;

  const matched = await verifySecret(digits, row.token_hash);
  if (!matched) return false;

  // Section 15: invalidated on a successful login. The magic link issued
  // alongside this code goes with it, since the sign in it existed for has just
  // happened by another route.
  await spendOutstandingCodes(applicantId);

  return true;
}

/**
 * Spend a magic link, or say why not.
 *
 * **A full login, not a second factor**, per section 15, so the answer here is
 * enough to create a session on its own. What makes that safe is the nonce: the
 * cookie was set in the browser that asked for the link, the hash of it is on
 * the row, and a link opened anywhere else matches nothing.
 *
 * **A request with no nonce cookie at all does not spend the token.** That is
 * the one branch worth reading twice. Anything that fetches a URL without
 * carrying cookies — an unfurler, a link checker, a scanner in front of a
 * corporate mail box — would otherwise burn somebody's one tap sign in before
 * their thumb reached it, and the failure would look exactly like a bug in the
 * bot. A wrong nonce is different and is spent: that link has demonstrably
 * been somewhere it should not have been.
 *
 * @param {string} token
 * @param {string|null} nonce
 * @returns {Promise<{ ok: true, applicantId: string } | { ok: false, reason: 'unknown'|'no_nonce'|'wrong_browser' }>}
 */
export async function consumeMagicLink(token, nonce) {
  const value = String(token ?? '');
  if (value === '') return { ok: false, reason: 'unknown' };

  const { data, error } = await supabase
    .from(T.telegramTokens)
    .select('id, applicant_id, browser_nonce_hash')
    .eq('token_hash', sha256(value))
    .eq('purpose', 'magic_link')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: 'unknown' };

  if (!nonce) return { ok: false, reason: 'no_nonce' };

  const spend = async () => {
    const { error: spendError } = await supabase
      .from(T.telegramTokens)
      .update({ used_at: new Date().toISOString() })
      .eq('id', data.id);
    if (spendError) throw spendError;
  };

  if (data.browser_nonce_hash !== sha256(nonce)) {
    await spend();
    return { ok: false, reason: 'wrong_browser' };
  }

  await spend();
  return { ok: true, applicantId: data.applicant_id };
}

/**
 * Turn the second factor on or off for a linked account.
 *
 * Answers false when there is no link, which is not an error: the row that
 * would carry the flag is the link itself, so an account with nothing linked
 * has nowhere to record that it wants a code from a chat it does not have.
 *
 * @param {string} applicantId
 * @param {boolean} enabled
 * @returns {Promise<boolean>} whether a link was updated
 */
export async function setTwofa(applicantId, enabled) {
  const { data, error } = await supabase
    .from(T.telegramLinks)
    .update({ twofa_enabled: enabled === true })
    .eq('applicant_id', applicantId)
    .select('id');

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * The kinds this build can queue, per section 15.
 *
 * **One list, in one place, because the bot's is the other half of it.** The
 * drain claims a batch by naming the kinds it can render, so a kind the site
 * queues that `RENDERERS` in `telegram-bot/outbox.py` has never heard of is not
 * a message that fails: it is a row that is never claimed at all and waits,
 * silently, for the pull that teaches the bot what it is. That is deliberate and
 * it is what makes two deployments on two schedules safe, but it only works if
 * adding a kind here is an obvious act rather than a string typed at a call
 * site. `tests/phase11-test.mjs` reads this object and the bot's dictionary and
 * fails when they disagree.
 */
export const KIND = Object.freeze({
  invite: 'invite',
  taskRaised: 'task_raised',
  applicationStatusChanged: 'application_status_changed',
});

/**
 * Put one notification in the outbox, and never fail what raised it.
 *
 * **A failure here is swallowed on purpose.** Telegram is a second channel and
 * never the only record: the task, the invite row and the application event are
 * all written before this is called, and an applicant with no link never
 * receives one of these at all. Letting a failed insert take an invite down with
 * it would trade the delivery nobody is guaranteed for the record everybody
 * depends on. It is the same reasoning `raisePostingQuestions` uses, and the
 * same reasoning behind an audit write never failing its own request.
 *
 * **Nothing here asks whether the applicant has a link.** The row is queued
 * either way and the bot marks it `skipped` when it comes to send it, per
 * section 15. Checking here would be a read the drain has to repeat anyway, and
 * it would answer a question that can change in the seconds between.
 *
 * @param {string} applicantId
 * @param {string} kind one of KIND
 * @param {object} payload what the message is rendered from
 * @returns {Promise<boolean>} whether the row was written
 */
export async function queueNotification(applicantId, kind, payload = {}) {
  const written = await queueNotifications([{ applicantId, kind, payload }]);
  return written > 0;
}

/**
 * The same, for everybody an admin ticked. One insert rather than a loop.
 *
 * 8.5's bulk invite reaches up to the recipient cap in one action, and a loop
 * here would be one round trip each and a half written queue if the fifth throws.
 *
 * @param {Array<{ applicantId: string, kind: string, payload?: object }>} rows
 * @returns {Promise<number>} how many were written
 */
export async function queueNotifications(rows) {
  const wanted = rows.filter((row) => row.applicantId && KINDS.includes(row.kind));
  if (wanted.length === 0) return 0;

  try {
    const { error } = await supabase.from(T.notifications).insert(
      wanted.map((row) => ({
        applicant_id: row.applicantId,
        kind: row.kind,
        payload: row.payload ?? {},
      }))
    );
    if (error) throw error;
    return wanted.length;
  } catch (cause) {
    // Loud in the log and invisible to the caller. The admin panel's queue
    // counts are the other half of noticing this: a queue that stays empty on a
    // morning of invitations is the same evidence as one that stops moving.
    console.error('[careers-gftv] outbox queue:', cause);
    return 0;
  }
}

/** The values of KIND, for the membership test above. */
const KINDS = Object.values(KIND);

/**
 * Queue the test message from 7g's Telegram panel.
 *
 * The outbox, not the token table, because it is a message rather than a
 * credential. It is also the first row anything in this build has ever written
 * to `gftvjobs_notifications`, which has been empty since migration 011 created
 * it, and that is deliberate: part 4 generalises the claim the bot makes for
 * this one kind into the drain proper rather than inventing it there.
 *
 * @param {string} applicantId
 * @returns {Promise<void>}
 */
export async function queueTestMessage(applicantId) {
  const { error } = await supabase.from(T.notifications).insert({
    applicant_id: applicantId,
    kind: 'telegram_test',
    payload: { requested_at: new Date().toISOString() },
  });

  if (error) throw error;
}

/** How much of the outbox's history the "recently" counts cover. */
const OUTBOX_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many failures the panel names. Enough to see a pattern, short enough to read. */
const OUTBOX_FAILURES = 5;

/**
 * What the outbox looks like right now, for the panel on /admin.
 *
 * **Why the portal reads a table the bot owns.** Section 15 says a notification
 * that keeps failing is left `failed` "for an admin to see", and until this
 * existed the only place to see one was the Supabase dashboard. That is the same
 * shape as the cron before phase 9 drew its last run: a process with no reader,
 * failing quietly. The drain has one further problem the cron does not, which is
 * that it runs on a VPS this repository does not deploy, so **a queue that stops
 * moving is the only sign the portal ever gets that the bot is not running.**
 * The oldest queued row is what says that, which is why it is here as a time
 * rather than as part of a count.
 *
 * **Nothing here names an applicant.** /admin is open to job posters as well as
 * admins, deviation 57's reasoning holds, and a list of who is being messaged is
 * exactly the property that made phase 9's submission list admins only. A kind,
 * an error and a time are enough to act on: the account behind a row is one
 * query away for somebody who is allowed to make it.
 *
 * @returns {Promise<object|undefined>} undefined when the table could not be
 *          read, which is a third state and never a claim that the queue is
 *          empty.
 */
export async function outboxSummary() {
  const since = new Date(Date.now() - OUTBOX_WINDOW_MS).toISOString();

  const countFor = async (build) => {
    const { count, error } = await build(
      supabase.from(T.notifications).select('id', { count: 'exact', head: true })
    );
    if (error) throw error;
    return count ?? 0;
  };

  try {
    const [queued, claimed, failed, skipped, sentRecently, oldest, failures] =
      await Promise.all([
        countFor((q) => q.eq('status', 'queued')),
        countFor((q) => q.eq('status', 'claimed')),
        countFor((q) => q.eq('status', 'failed')),
        countFor((q) => q.eq('status', 'skipped').gte('created_at', since)),
        countFor((q) => q.eq('status', 'sent').gte('sent_at', since)),
        supabase
          .from(T.notifications)
          .select('created_at')
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(1),
        supabase
          .from(T.notifications)
          .select('id, kind, error, attempts, created_at')
          .eq('status', 'failed')
          .order('created_at', { ascending: false })
          .limit(OUTBOX_FAILURES),
      ]);

    if (oldest.error) throw oldest.error;
    if (failures.error) throw failures.error;

    return {
      queued,
      claimed,
      failed,
      // Skipped is windowed and the other two standing states are not, and the
      // difference is what each one is for. A failure is work somebody may still
      // have to do something about however old it is; a skip is finished
      // business, an applicant who had no link at the time, and a lifetime total
      // of those would only ever grow.
      skipped_recently: skipped,
      sent_recently: sentRecently,
      oldest_queued_at: oldest.data?.[0]?.created_at ?? null,
      recent_failures: (failures.data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        error: row.error,
        attempts: row.attempts ?? 0,
        created_at: row.created_at,
      })),
    };
  } catch (cause) {
    // Never fatal to the page it is drawn on. The overview answers about
    // postings and applications whether or not a bot exists, and a Telegram
    // panel that could take the dashboard down with it would be a worse trade
    // than one that says it could not be read.
    console.error('outbox summary failed', cause);
    return undefined;
  }
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
 * **Trusted devices go, and sessions stay.** Part 2 left both alone and said so;
 * that was right while there was no second factor behind this link and wrong
 * from the moment part 3 gave it one. 5d lists unlinking Telegram among the
 * things that revoke every trusted device, and the reason is not this sign in
 * but the next one: a browser trusted while 2FA was on would skip the second
 * step again if the account were ever re-linked. Sessions are still untouched,
 * unlike the admin's assisted unlink in 8.9 — that one is part of handing an
 * account back to somebody who may have lost control of it, and this one is a
 * person tidying up their own settings.
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

  const removed = (deleted?.length ?? 0) > 0;
  if (removed) await revokeAllTrustedDevices('applicant', applicantId);

  return { removed, skipped: stopped?.length ?? 0 };
}
