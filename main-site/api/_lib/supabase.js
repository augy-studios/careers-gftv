// The one Supabase client for the whole API.
//
// Created at module import time rather than per request, because Supabase
// pools connections through PgBouncer and a client per request wastes them.
// Vercel keeps a warm function instance across requests, so this module is
// evaluated once per instance.
//
// This uses the service role key, which bypasses row level security. It is
// server side only and must never reach the browser. There is no Supabase
// client in the frontend at all, and no anon key anywhere in this repo.
//
// Every gftvjobs_ table has RLS enabled with no policies, so anything holding
// an anon key gets nothing while the portal keeps working. That matters
// because the project is shared with other GFTV apps.
//
// **Two footnotes to that sentence, both from the grant sweep on 24 August
// 2026, and both worth knowing before relying on it.**
//
//   **RLS covers four verbs, and the grants are wider than four.** Supabase's
//   default privileges hand anon and authenticated delete, insert, references,
//   select, trigger, truncate, and update on every table in public at creation,
//   and that is true of every app in this project rather than of this one. RLS
//   neutralises select, insert, update, and delete. It does not apply to
//   truncate, which is a table level operation: that grant is live, and what
//   actually stops it is that PostgREST only ever emits those four verbs. The
//   grants were left alone deliberately on 24 August 2026, because narrowing
//   ours alone would leave the schema half in one model and half in another
//   while changing nothing an anon key can reach. **The thing to carry: the
//   defence is RLS plus the shape of PostgREST, not RLS alone.** Anything that
//   ever lets a caller with an anon key run arbitrary SQL changes that answer.
//
//   **A view is not covered at all.** A view runs as its owner, so the RLS on
//   the tables underneath it does not apply. Migration 035 closed the four that
//   existed, and any new one needs both halves in the file that creates it:
//   revoke from anon and authenticated, and security_invoker = on.

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env.js';

const url = requireEnv('SUPABASE_URL');
const serviceKey = requireEnv('SUPABASE_SERVICE_KEY');

export const supabase = createClient(url, serviceKey, {
  auth: {
    // Supabase Auth is not used anywhere in this build. Sessions are our own
    // rows in gftvjobs_staff_sessions and gftvjobs_sessions.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-application-name': 'careers-gftv' },
  },
});

/**
 * Table names, in one place, so a typo is a missing import rather than a
 * silent empty result set.
 */
export const T = Object.freeze({
  // Applicant realm
  users: 'gftvjobs_users',
  sessions: 'gftvjobs_sessions',
  backupCodes: 'gftvjobs_2fa_backup_codes',
  recoveryCodes: 'gftvjobs_recovery_codes',
  passwordResets: 'gftvjobs_password_resets',
  trustedDevices: 'gftvjobs_trusted_devices',
  passkeys: 'gftvjobs_passkeys',
  passkeyChallenges: 'gftvjobs_passkey_challenges',
  loginChallenges: 'gftvjobs_login_challenges',

  // Content
  departments: 'gftvjobs_departments',
  tags: 'gftvjobs_tags',
  jobs: 'gftvjobs_jobs',
  jobTags: 'gftvjobs_job_tags',

  // Translations, per 3a and migration 014. The base row holds the default
  // language and every other language is a row here. Only a row with is_ready
  // set is ever shown, and a blank field falls back to the base row.
  locales: 'gftvjobs_locales',
  jobTranslations: 'gftvjobs_job_translations',
  departmentTranslations: 'gftvjobs_department_translations',
  tagTranslations: 'gftvjobs_tag_translations',
  // 7h's correction loop. Reports are not tasks and never reach
  // gftvjobs_tasks, per migration 015 and the note in api/translations/.
  translationReports: 'gftvjobs_translation_reports',

  // Pipeline
  applications: 'gftvjobs_applications',
  applicationEvents: 'gftvjobs_application_events',
  analytics: 'gftvjobs_analytics',
  ratings: 'gftvjobs_ratings',
  savedJobs: 'gftvjobs_saved_jobs',
  tasks: 'gftvjobs_tasks',
  invites: 'gftvjobs_invites',
  formSubmissions: 'gftvjobs_form_submissions',

  // Telegram
  telegramLinks: 'gftvjobs_telegram_links',
  telegramTokens: 'gftvjobs_telegram_tokens',
  notifications: 'gftvjobs_notifications',

  // Operations
  auditLog: 'gftvjobs_audit_log',
  settings: 'gftvjobs_settings',
  cronRuns: 'gftvjobs_cron_runs',
  // Phase 12 part 7, migration 037. **The only tables in this schema written by
  // something outside Vercel**: the probe on the VPS writes both with the
  // service key, because a status page hosted on the thing it monitors is
  // useless during the outage it exists to report. Nothing in main-site writes
  // to either; the status page reads them and the daily cron sweeps them.
  //
  // A day and an outage rather than a check. Decision 23: storing every request
  // was half a million rows over the window the page draws, nearly all of them
  // recording that nothing happened.
  statusDays: 'gftvjobs_status_days',
  statusIncidents: 'gftvjobs_status_incidents',
  rateLimits: 'gftvjobs_rate_limits',
  adminAccess: 'gftvjobs_admin_access',

  // Phase 8's helper role, from migration 023.
  translationHelpers: 'gftvjobs_translation_helpers',

  // Views, not tables. Read only by construction: PostgREST will refuse a write
  // to any of them, which is the property that makes them safe to expose to the
  // same client the tables use. Migrations 032 and 033.
  needsTranslation: 'gftvjobs_needs_translation',
  applicationSearch: 'gftvjobs_application_search',
  jobFunnel: 'gftvjobs_job_funnel',
  jobFunnelDaily: 'gftvjobs_job_funnel_daily',

  // Staff passkeys live in a gftvjobs_ table on purpose. Section 2 forbids
  // adding to the gftvhello_ namespace, so this mirrors gftvjobs_admin_access:
  // gftvhello_users is referenced, never written to. See migration 025.
  staffPasskeys: 'gftvjobs_staff_passkeys',

  // **The portal's own staff sessions, since migration 038.** They lived in
  // gftvhello_sessions until 31 August 2026, which is what 5a asks for, and the
  // consequence was that one set of rows served two applications: a sign in on
  // either site ended the session on the other, and a 30 day session on this
  // one did not outlive a day. Nothing here shortened or deleted those rows —
  // that was measured before anything was changed — so what was left was the
  // table. **Sharing the accounts is the point of 5a; sharing the session rows
  // was a consequence of it**, and 5h already gives the docs site its own table
  // for exactly this reason. Deviation 122.
  staffSessions: 'gftvjobs_staff_sessions',

  // Staff realm. Read only, apart from the challenge, trusted device, and
  // backup code rows the login flow legitimately owns. Never insert, update, or
  // delete anything else here. **The session row used to be a fourth**, and is
  // not one any more.
  staffUsers: 'gftvhello_users',
  staffTotpChallenges: 'gftvhello_totp_challenges',
  staffTrustedDevices: 'gftvhello_trusted_devices',
  staffBackupCodes: 'gftvhello_backup_codes',
});

/**
 * Postgres functions called with supabase.rpc(). Defined in migration 010.
 */
export const RPC = Object.freeze({
  searchJobs: 'gftvjobs_search_jobs',
  suggest: 'gftvjobs_suggest',
});
