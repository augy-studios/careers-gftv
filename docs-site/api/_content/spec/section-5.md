---
title: 5. Authentication
access: developer
order: 8
summary: There are two separate account realms.
---

# 5. Authentication

There are two separate account realms. Keep their session cookies, endpoints, and middleware fully separate.

### 5a. Staff and admin realm (existing tables, do not alter them)

Uses the existing `gftvhello_users` and `gftvhello_sessions` tables, so the same accounts that sign in at gftv.asia work here.

Login flow:
1. POST username and password. Look up `gftvhello_users` by username (case-insensitive), verify the bcrypt hash.
2. Reject if `is_approved` is false.
3. Reject if the account does not have admin access to this portal (see the open question in section 10 on which flag governs this).
4. If a valid `gftvhello_trusted_devices` row matches the device token cookie and has not expired, skip 2FA and issue a session.
5. Else, if `totp_secret` is not null, create a row in `gftvhello_totp_challenges` with a random token and return a "2FA required" response carrying that challenge token. The password step must not issue a session.
6. The client posts the challenge token plus either a 6 digit TOTP code or a backup code. Verify TOTP against `totp_secret` with a one step window either side. Backup codes are verified against `gftvhello_backup_codes` by bcrypt comparison, and the matching row is deleted on use, single use only.
7. On success, delete the challenge row, insert a `gftvhello_trusted_devices` row if "trust this device" was ticked, then insert into `gftvhello_sessions` with `expires_at` set by the "stay signed in" choice per 5d, and set the session cookie.
8. Accounts with a null `totp_secret` and no registered passkey skip straight from step 4 to step 7.

Step 6 also accepts a passkey, per 5e. Where the account has one, the passkey is offered first and the code is the fallback, since typing a code is the worse experience and only exists for the account that cannot do better.

This same flow runs on the docs site, against the same accounts, per 5h. The two differ in the cookie they set, the session table they write, and the origin they check a passkey against, and in nothing else.

Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, expiry matching `expires_at`. Use a distinct cookie name for this realm, for example `gftv_staff_session`.

Do not write to `gftvhello_signing_keys` or `gftvhello_used_request_tokens`. Leave those tables alone.

Also handle logout (delete the session row) and expired session cleanup on read.

### 5b. Applicant realm (new tables)

Create `gftvjobs_users` and `gftvjobs_sessions`, modelled on the gftvhello pair but with no admin check on sign in and no approval requirement. Leave a nullable `totp_secret` column in place so app based 2FA can be added later without a migration. Telegram 2FA, per section 15, is the second factor that ships.

- Registration UI: username, display name, email, password, confirm password. Uniqueness on username and email, clear inline validation, password strength minimum stated on screen.
- Login with username or email plus password. Sets its own cookie, for example `gftv_applicant_session`.
- Accounts are active immediately. No admin approval, no email verification for now.
- Applicant account page: edit profile and change password, plus the dashboard pages in 7g and the settings page with its danger zone.

### 5c. Recovery codes (applicant realm)

There is no email in this build, so recovery codes are the only self serve way back into an account. Say that on screen, more than once, and design accordingly.

Generate **two separate sets**, and never let one do the other's job:

1. **2FA backup codes**, in `gftvjobs_2fa_backup_codes`. Accepted in place of a Telegram code at the second step of login. They get past the second factor only, never past the password.
2. **Account recovery codes**, in `gftvjobs_recovery_codes`. Accepted on the forgot password flow. These are a full account credential, since one of them plus nothing else lets someone set a new password. That is exactly why they must not be the same codes as the 2FA set: a backup code lying in a chat log should not also be a password reset.

Two tables, not one with a purpose column, so the boundary is enforced by the schema rather than by remembering a filter.

Rules for both sets:

- Ten codes per set, generated server side from a CSPRNG, formatted in two groups for legibility, for example `k7m2-9xqp`.
- Stored bcrypt hashed, one row per code. Never stored or logged in the clear, and never recoverable after the one time they are shown.
- Shown once, on generation, with copy and download to a text file, and a checkbox confirming they have been saved before the dialog closes.
- Single use. Consumed on success, with the row deleted rather than flagged.
- Regenerating a set invalidates every remaining code in that set and only that set.
- Account settings shows how many codes remain in each set, with a warning below three and a prompt to regenerate.
- Generating either set requires the current password.
- Rate limit code entry per account and per IP, and lock the flow for an hour after repeated failures. Compare in constant time and give the same generic error for a wrong code and an unknown account.

**Forgot password flow**

1. The applicant enters their username or email and one unused code from `gftvjobs_recovery_codes`.
2. Verify both. On success, issue a short lived, single use reset ticket bound to that browser and move them to a set new password screen. Never accept a password change in the same request that verifies the code, and never reveal whether the account exists.
3. On the new password being set: consume the recovery code, invalidate every session for that account, revoke every trusted device, and if Telegram is linked, send a message saying the password was changed and when.
4. If the account has fewer than three recovery codes left afterwards, push them straight to regenerate.
5. Someone with no codes left cannot recover alone. Give admins a verified reset path in the admin dashboard that clears the password and forces a reset on next login, and log who did it.

### 5d. Session length and trusted devices (both realms)

Two separate controls on both login forms. They are independent and must not be collapsed into one checkbox:

- **"Stay signed in for 30 days on this device"** controls how long the session lasts. Off gives a session that expires in 12 hours. On sets `expires_at` 30 days out. This is about the session cookie and nothing else.
- **"Trust this device"** controls whether the second factor is asked for again. Off means 2FA every login. On records a trusted device for 30 days, and logins from it skip the second step while the password is still required every time.

Implementation:

- Staff realm: use the existing `gftvhello_trusted_devices` table, which already carries a 30 day default. Do not alter it and do not create a parallel table.
- Applicant realm: create `gftvjobs_trusted_devices` mirroring it, but store the device token hashed rather than in the clear, since it is new and there is no compatibility to preserve.
- The device token is 32 random bytes in its own long lived `HttpOnly`, `Secure`, `SameSite=Lax` cookie, separate from the session cookie, so it survives logout. That is the point: logging out should not mean answering 2FA again on your own laptop.
- Rotate the token on every successful use and push the expiry out, so a stolen token has a short window and an actively used device does not expire mid use.
- Trust is per device and per account. A shared browser signing into a second account gets its own record.
- Only offer "trust this device" once the second factor has actually been satisfied, never on the password screen, and put a plain line next to it saying not to use it on a shared or public computer.
- Account settings lists trusted devices with when each was added and last used, a revoke button per device, and a revoke all. Changing the password, resetting via recovery code, unlinking Telegram, or disabling 2FA revokes all of them.
- Trusted devices never bypass the danger zone in `/account/settings`. That always asks for the password, and for a fresh code where 2FA is on.

### 5e. Passkeys (both realms, both sites)

Passkeys shipped in phase 2 and this section was not written at the time, so it is recorded here rather than described as new work. Migration `025` holds the tables and `main-site/api/_lib/webauthn.js` holds the implementation. Read those before changing anything here.

- Two credential tables, `gftvjobs_passkeys` for applicants and `gftvjobs_staff_passkeys` for staff, for the same reason 5c gives two code tables: the separation is structural, so a staff credential can never satisfy an applicant check. The challenge tables are shared, since a challenge is a short lived random string with no privileges of its own.
- A passkey is a public key. Nothing stored is secret, which is the opposite of `totp_secret`, and it is why passkeys can live in a `gftvjobs_` table while the account itself stays in `gftvhello_users` untouched.
- **A passkey is the second factor, not a replacement for the password.** The password is still asked for every login in both realms. This is deliberate and is not to be quietly upgraded to passwordless without a decision, because the staff account is shared with gftv.asia and this project does not get to weaken it unilaterally.
- No third set of recovery codes was added for passkeys. A lost passkey is a lost phone, which `gftvjobs_2fa_backup_codes` and `gftvhello_backup_codes` already answer.

**The relying party id, and why one passkey works on both sites.** WebAuthn allows a site to claim any registrable domain suffix of its own origin as the relying party id. `careers.globalfurry.tv` is a suffix of `docs.careers.globalfurry.tv` and is not a public suffix, so both sites use the portal's host as the relying party id and share credentials. The docs site therefore verifies a passkey the portal registered, and a staff member enrols once rather than twice.

- The relying party id comes from `SITE_URL` on both sites. The expected origin does not: each site checks the response against its own origin, `SITE_URL` on the portal and `DOCS_URL` on the docs site. Getting that pair the wrong way round either breaks the docs login or accepts an assertion from the wrong origin, so it is worth a test of its own.
- Two consequences stay true and are not bugs to fix later. A passkey registered here does not work on gftv.asia, which is a different domain. A passkey registered on a preview deployment does not work in production. Both are the rule doing its job.
- Never widen the relying party id to `globalfurry.tv`. That would offer every GFTV staff passkey to every site on the domain, including ones outside this project.

### 5f. Staff account settings, and its danger zone

Staff get the same account settings suite the applicant realm has in 7g, scoped to what this project is actually allowed to change. **Specify it once and mount it twice**: the portal serves it at `/admin/security` and the docs site at `/account`, from the same markup, the same copy, and the same endpoint shapes. Two separate implementations of one security page is how the two drift until one of them is wrong.

What it covers:

- **Profile, read only.** Username, display name, and email come from `gftvhello_users` and are edited at gftv.asia. Say that on the page with a link, rather than showing fields that cannot be saved.
- **Password change**, verifying the current password and writing the new bcrypt hash. See the note in 5g on what this costs.
- **Passkeys.** List with the name, when added, and when last used. Add, rename, and remove, each requiring the current password. Show which site each was registered from, since they work on both and a reader will otherwise wonder why one they made on the docs site appears on the portal.
- **Authenticator app.** Enrolment status and last used. Enrol and remove, per 5a.
- **2FA backup codes**, from `gftvhello_backup_codes`. Remaining count, regenerate, and the warning below three, per 5c.
- **Account recovery codes**, per 5g, carrying the strongest warning on the page.
- **Trusted devices**, listed per site with a label saying which, since the token cookie is host scoped and trusting the portal does not trust the docs site. Mark the current device. Revoke one, and revoke all, where revoke all covers both sites.
- **Sessions.** Where the account is signed in, on both sites, with sign out everywhere.

*Danger zone*

Bottom of the page, clearly separated, and every action goes through the same three steps as 7g, in this order and with no way to skip ahead: consequences spelled out with a cancel at least as prominent as the continue, then the account's own username typed in full, then the current password verified server side, plus a fresh second factor where the account has one.

The actions are: remove every passkey, remove the authenticator app, invalidate every remaining recovery code, invalidate every remaining backup code, revoke every trusted device on both sites, and sign out everywhere.

**There is no delete account.** The gftvhello account belongs to gftv.asia and is shared with it; this project does not get to delete it. Say so on the page and link across, rather than leaving a gap a reader reads as an oversight.

Rate limit these endpoints hard and lock the danger zone for an hour after several failed password attempts. Every destructive action writes an audit row to `gftvjobs_audit_log` before it executes, naming the account, the action, and which site it was performed from.

### 5g. Staff account recovery codes

Staff get a second set of codes, `gftvjobs_staff_recovery_codes`, working exactly as 5c describes for applicants: ten codes, CSPRNG, bcrypt hashed one row per code, shown once, single use, regenerating invalidates the set, and generating requires the current password. The forgot password flow mirrors 5c step for step, including the two proofs rule from migration `027`: where the account has a passkey or an authenticator app, the recovery code is checked first and the second factor after it, and only then is the reset ticket usable.

**State the cost of this plainly, because it is real.** Section 2 says never to write to a `gftvhello_*` table beyond the session, challenge, trusted device, and backup code rows the login flow owns, and 8.8 says password reset for these accounts belongs to gftv.asia. A staff recovery code sets `gftvhello_users.password_hash`, which is both of those rules broken. It was asked for deliberately and with the conflict on the table, so it is written down here as the one named exception rather than left as a surprise for whoever reads section 2 next:

- The exception covers `password_hash` and nothing else on that table. No other column is written from this project, ever.
- A staff password reset performed here changes the password at gftv.asia too, because it is one account. The confirmation screen must say that in those words. An admin who thinks they are resetting a careers portal password and finds themselves locked out of the main portal will not thank anybody.
- Every reset writes an audit row before it executes, naming the account, the time, and which site it came from, and notifies nothing, because this project has no email. That audit row is the only trace, so it is not optional.
- Both sets are separate credentials and never interchangeable, exactly as 5c requires: `gftvhello_backup_codes` gets past the second factor, `gftvjobs_staff_recovery_codes` gets past the password. A code lying in a chat log must not be able to do both.
- Somebody with no recovery codes and no second factor still cannot get back in alone. That path stays where it belongs, at gftv.asia.

### 5h. The docs site session

The docs site signs staff in itself rather than borrowing a session from the portal, per section 16.

- Its own functions under `docs-site/api/`, reading `gftvhello_users` exactly as 5a describes, with the same access check and the same second factor.
- Its own cookie, `gftv_docs_session`, and its own table, `gftvjobs_docs_sessions`, mirroring `gftvjobs_sessions`. It never writes `gftvhello_sessions`, so a docs sign in cannot appear as, or be revoked as, a gftv.asia session.
- Host scoped cookies throughout. Do not set anything on `.globalfurry.tv`: the parent domain carries other GFTV apps that have no business seeing this cookie.
- Trusted devices use the existing `gftvhello_trusted_devices` table with the docs site's own device cookie, so each site earns its own trust. Say so on the login form rather than letting a reader think the checkbox failed.
- Session length follows 5d unchanged: 12 hours off, 30 days on, two independent controls.
- The shared session helpers are duplicated into `docs-site/api/_lib/`, not imported across the two Vercel roots. Vercel builds each project from its own root directory and cannot reach outside it. Keep the two copies identical and change them together, and say in both READMEs that they are a pair.
