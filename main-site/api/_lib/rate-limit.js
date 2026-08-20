// Rate limiting, table backed.
//
// Section 9 allows a table backed or an in-memory limiter and asks which was
// chosen to be stated. Table backed, because each Vercel function instance has
// its own memory: an in-memory counter resets whenever a new instance starts,
// which is constantly, and could not hold the one hour lockout section 5c
// requires. The table is gftvjobs_rate_limits, created in migration 012.
//
// The shape is a fixed window counter. Every failure increments the row for
// the current window, and crossing the limit writes locked_until. A fixed
// window lets a burst straddle a boundary and get up to twice the limit in a
// short span, which for a login form guarded by bcrypt is not worth a sliding
// window's extra round trips.
//
// The increment is a read then a write rather than an atomic one, since
// PostgREST has no increment and adding an RPC for it would mean a migration
// in an auth phase. Two requests landing in the same millisecond can therefore
// share a count. The slippage is one or two attempts on a limit of five, in
// front of a hash that takes a quarter of a second, so it does not change what
// the limiter is for.
//
// Every subject that comes from the network is hashed, per the comment on
// gftvjobs_rate_limits.subject and the section 6 rule that no IP is stored
// anywhere in this build.

import { supabase, T } from './supabase.js';
import { sha256 } from './tokens.js';
import { ERR, fail } from './respond.js';

/**
 * The limits, in one place, so what is guarded and how hard is readable
 * without going through the routes.
 *
 * limit    failures allowed inside one window
 * windowMs how long that window is
 * lockMs   how long the lockout lasts once the limit is crossed
 */
export const LIMITS = Object.freeze({
  // 5c: "lock the flow for an hour after repeated failures". That sentence is
  // about code entry, and the same shape is right for a password.
  login: { limit: 8, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  twoFactor: { limit: 6, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  recoveryCode: { limit: 5, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  passwordChange: { limit: 6, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 },
  // Generating a set of codes is not an attack surface in itself, but it does
  // ten bcrypt hashes, so it is worth a ceiling.
  codeGeneration: { limit: 10, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  // Reporting a translation problem, per 7h: "Rate limit it per account and
  // per IP, like every other write."
  //
  // This is the one bucket counted on success rather than on failure, and the
  // difference matters. Every other limit here guards a guess at a secret, so
  // a correct answer costs nothing; this one guards a table a signed in
  // applicant can write to freely, so the thing worth bounding is how many
  // rows one account can add in an hour. Twelve is more reports than anybody
  // reading a posting will legitimately file and few enough that a script
  // filling the admin queue stops quickly.
  report: { limit: 12, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  // Starting an application handoff, per section 9's "rate limit application
  // submission". Counted on success, for the same reason the report bucket is:
  // there is no secret to guess here, and what is worth bounding is how many
  // analytics rows one account can add to the funnel in an hour.
  //
  // Twenty is more roles than the board has had open at once and far more than
  // anybody applies to in a sitting, so a person who is genuinely working
  // through the openings never meets it. It exists so a script cannot fill
  // gftvjobs_analytics, which is the table the phase 8 funnel is computed from.
  //
  // Also the one bucket applied per account and not per IP. GFTV runs stands at
  // conventions, where a room shares one address behind NAT, and the reason is
  // written out in full at the call site in api/applications/start.js.
  apply: { limit: 20, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  // Passkey ceremonies. A failure here is usually somebody cancelling the
  // system prompt, so the ceiling is generous: it is there to stop a script
  // opening challenges in a loop, not to punish a person who changed their
  // mind twice.
  passkey: { limit: 20, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  // The dashboard's own writes, all counted on success for the same reason the
  // report and apply buckets are: there is no secret being guessed, and what is
  // worth bounding is how many rows one account can add in an hour.
  //
  // Withdrawing and saving are both bounded by how many postings exist, so
  // neither ceiling is reachable by anybody using the site. They are here so a
  // script cannot fill gftvjobs_application_events or gftvjobs_saved_jobs.
  withdraw: { limit: 20, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  save: { limit: 120, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  // Replying to a task. One round per task, per 7g, so this is generous by an
  // order of magnitude and exists only as a ceiling.
  taskReply: { limit: 30, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  // Re-encoding is cheap, but an unbounded upload endpoint is not. Per account
  // and per IP, since the thing being bounded is bytes rather than guesses.
  avatar: { limit: 12, windowMs: 60 * 60 * 1000, lockMs: 30 * 60 * 1000 },
  // The dashboard's writes, phase 7. Per staff account, counted on success,
  // and deliberately loose: an admin working through a morning of postings,
  // statuses, and tags does a great many writes, and a limit they can reach is
  // a limit that stops the work rather than an attack.
  //
  // It is here at all because every write in this build is bounded, and because
  // a compromised staff session should not be able to rewrite the whole board
  // before anybody notices. Two hundred an hour is roughly one every twenty
  // seconds sustained for an hour, which no person does.
  admin: { limit: 200, windowMs: 60 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  // Permanent deletion, which is admins only and behind the three step
  // confirmation. Separate from the bucket above and far tighter: deleting a
  // posting destroys funnel history and is almost never the right answer, per
  // 8.2, so a script with a stolen session gets very few of them.
  adminDelete: { limit: 10, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  // 7g: "Rate limit these endpoints hard, and lock the danger zone for an hour
  // after several failed password attempts." Harder than the login bucket,
  // because there is no legitimate reason to get your own password wrong four
  // times on the page that deletes your account.
  danger: { limit: 4, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 },
});

/**
 * The caller's IP, hashed.
 *
 * A hash rather than the address, so the table never holds an IP. It is not a
 * secret: anyone with both the database and a candidate address could confirm
 * a guess. What it does buy is that a copy of this table discloses no
 * addresses on its own, and the daily cron sweeps the rows anyway.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function subjectForIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded ?? '').split(',')[0];

  const ip = first.trim() || req.socket?.remoteAddress || 'unknown';
  return `ip:${sha256(ip).slice(0, 32)}`;
}

/** A subject for an account, when the account is known. */
export function subjectForUser(realm, userId) {
  return `user:${realm}:${userId}`;
}

/**
 * A subject for an identifier typed into a form, for the case where no account
 * was found. Hashed, because a username typed into a login box is a guess
 * about a person and does not need recording in the clear.
 */
export function subjectForIdentifier(identifier) {
  return `id:${sha256(String(identifier ?? '').toLowerCase()).slice(0, 32)}`;
}

function windowStart(windowMs) {
  return new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
}

/**
 * Whether this subject is currently locked out.
 *
 * Checked before the work rather than after, so a locked out caller costs no
 * bcrypt round. Reads across windows, since the lock is set in the window the
 * limit was crossed in and outlives it.
 *
 * @param {string} bucket
 * @param {string} subject
 * @returns {Promise<{ locked: boolean, retryAfter: number }>}
 */
export async function checkLock(bucket, subject) {
  const { data, error } = await supabase
    .from(T.rateLimits)
    .select('locked_until')
    .eq('bucket', bucket)
    .eq('subject', subject)
    .gt('locked_until', new Date().toISOString())
    .order('locked_until', { ascending: false })
    .limit(1);

  if (error) {
    // Fail open. A limiter that cannot read its own table must not become an
    // outage: the password check behind it is still doing its job.
    console.error('[careers-gftv] checkLock:', error);
    return { locked: false, retryAfter: 0 };
  }

  const until = data?.[0]?.locked_until;
  if (!until) return { locked: false, retryAfter: 0 };

  const seconds = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
  return { locked: true, retryAfter: seconds };
}

/**
 * Record one failed attempt, and lock the subject if that crosses the limit.
 *
 * @param {string} bucket
 * @param {string} subject
 * @param {{ limit: number, windowMs: number, lockMs: number }} config
 * @returns {Promise<{ attempts: number, locked: boolean }>}
 */
export async function recordFailure(bucket, subject, config) {
  const start = windowStart(config.windowMs);

  const { data: existing, error: readError } = await supabase
    .from(T.rateLimits)
    .select('attempts')
    .eq('bucket', bucket)
    .eq('subject', subject)
    .eq('window_start', start)
    .maybeSingle();

  if (readError) {
    console.error('[careers-gftv] recordFailure read:', readError);
    return { attempts: 0, locked: false };
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  const locked = attempts >= config.limit;

  const { error: writeError } = await supabase.from(T.rateLimits).upsert(
    {
      bucket,
      subject,
      window_start: start,
      attempts,
      locked_until: locked ? new Date(Date.now() + config.lockMs).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'bucket,subject,window_start' }
  );

  if (writeError) console.error('[careers-gftv] recordFailure write:', writeError);

  return { attempts, locked };
}

/**
 * Clear the counters for a subject. Called on success, so a person who
 * mistyped a password four times and then got it right does not carry those
 * four into their next session.
 * @param {string} bucket
 * @param {string} subject
 */
export async function clearFailures(bucket, subject) {
  const { error } = await supabase
    .from(T.rateLimits)
    .delete()
    .eq('bucket', bucket)
    .eq('subject', subject);

  if (error) console.error('[careers-gftv] clearFailures:', error);
}

/**
 * Guard a route. Checks every subject and answers the request itself when any
 * of them is locked out.
 *
 * Section 5c asks for a limit per account and per IP, which is why this takes
 * a list rather than one subject.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} bucket
 * @param {string[]} subjects
 * @returns {Promise<boolean>} true when the request should stop here
 */
export async function limited(res, bucket, subjects) {
  for (const subject of subjects) {
    const { locked, retryAfter } = await checkLock(bucket, subject);
    if (!locked) continue;

    res.setHeader('Retry-After', String(retryAfter));
    fail(
      res,
      ERR.RATE_LIMITED,
      'Too many attempts. Try again later.',
      { details: { retry_after: retryAfter } }
    );
    return true;
  }
  return false;
}

/**
 * Record a failure against several subjects at once, the counterpart to
 * limited().
 * @param {string} bucket
 * @param {string[]} subjects
 * @param {{ limit: number, windowMs: number, lockMs: number }} config
 */
export async function recordFailures(bucket, subjects, config) {
  await Promise.all(subjects.map((subject) => recordFailure(bucket, subject, config)));
}

/**
 * Clear several subjects at once.
 * @param {string} bucket
 * @param {string[]} subjects
 */
export async function clearAll(bucket, subjects) {
  await Promise.all(subjects.map((subject) => clearFailures(bucket, subject)));
}
