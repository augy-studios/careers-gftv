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

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env.js';

const url = requireEnv('SUPABASE_URL');
const serviceKey = requireEnv('SUPABASE_SERVICE_KEY');

export const supabase = createClient(url, serviceKey, {
  auth: {
    // Supabase Auth is not used anywhere in this build. Sessions are our own
    // rows in gftvhello_sessions and gftvjobs_sessions.
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

  // Content
  departments: 'gftvjobs_departments',
  tags: 'gftvjobs_tags',
  jobs: 'gftvjobs_jobs',
  jobTags: 'gftvjobs_job_tags',

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
  rateLimits: 'gftvjobs_rate_limits',
  adminAccess: 'gftvjobs_admin_access',

  // Staff realm. Read only, apart from the session, challenge, trusted device,
  // and backup code rows the login flow legitimately owns. Never insert,
  // update, or delete anything else here.
  staffUsers: 'gftvhello_users',
  staffSessions: 'gftvhello_sessions',
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
