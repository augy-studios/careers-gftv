---
title: Authentication
access: developer
order: 9
summary: Two realms, passkeys and the shared relying party id, the second factor flow, trusted devices, four sets of codes, and the two proofs rule.
---

# Authentication

**Two realms, fully separate.** Separate tables, separate cookies, separate
helpers, and no shared idea of a current user. Nothing lets a session in one
satisfy a check in the other.

Section 5 of the specification is the reference, in seven lettered parts.
`main-site/api/_lib/session.js` holds the session handling for both realms and
`webauthn.js` holds the passkeys.

## The two realms

| | Staff | Applicant |
|---|---|---|
| Accounts | `gftvhello_users`, shared with gftv.asia | `gftvjobs_users` |
| Sessions | `gftvjobs_staff_sessions`, `gftvjobs_docs_sessions` | `gftvjobs_sessions` |
| Session cookie | `gftv_staff_session` | `gftv_applicant_session` |
| Device cookie | `gftv_staff_device` | `gftv_applicant_device` |
| Second factor | A passkey, or an authenticator app | A passkey, or a Telegram code |
| Backup codes | `gftvhello_backup_codes` | `gftvjobs_2fa_backup_codes` |
| Recovery codes | `gftvjobs_staff_recovery_codes` | `gftvjobs_recovery_codes` |
| Getting in | `is_approved`, then this project's overlay | Immediate |

**Staff accounts are created at gftv.asia and never here.** What this project
decides is whether an account may come in through this door, and that decision
is a row in `gftvjobs_admin_access`. It is never a write to `gftvhello_users`.

**Sessions moved out of `gftvhello_sessions` in migration `038`.** One set of
rows was serving two applications, so signing in on either site ended the
session on the other. The accounts stay shared; the sessions do not.

## Two controls at every login, and they are never one checkbox

- **Stay signed in for 30 days on this device** sets how long the session
  lasts. Off is 12 hours, on is 30 days.
- **Trust this device** sets whether the second factor is asked for again. The
  password is still required every single time.

**Collapsing them into one control is the mistake to avoid.** They answer two
different questions, and one of them is about a credential.

## Passkeys

Migration `025` holds the tables and `api/_lib/webauthn.js` holds the
implementation. Read both before changing anything.

**A passkey is the second factor and not a replacement for the password.** The
password is asked for at every login in both realms. This is deliberate, and it
is not to be upgraded to passwordless without a decision. The staff account is
shared with gftv.asia, and this project does not get to weaken it alone.

**Two credential tables**, `gftvjobs_passkeys` and `gftvjobs_staff_passkeys`.
The reason is the reason there are two code tables: the separation is
structural, so a staff credential can never satisfy an applicant check. The
challenge tables are shared, because a challenge is a short lived random string
with no privileges.

**A passkey is a public key.** Nothing stored is secret, which is the opposite of
`totp_secret`. That is why passkeys live in this project's own tables while the
account itself stays untouched.

### One relying party id, two sites

WebAuthn lets a site claim any registrable domain suffix of its own origin.
`careers.globalfurry.tv` is a suffix of `docs.careers.globalfurry.tv`, and it is
not a public suffix. So **both sites use the portal's host as the relying party
id and share credentials**, and a staff member enrols once.

> [!WARNING]
> The relying party id comes from `SITE_URL` on both sites. The expected origin
> does not: each site checks the response against its own origin, `SITE_URL` on
> the portal and `DOCS_URL` here. The wrong way round either breaks the docs
> sign in or accepts an assertion made somewhere else. Only one of those two
> failures is loud.

**Two consequences that are the rule working, and not defects.** A passkey
registered here does not work on gftv.asia, which is a different domain. And a
passkey registered against production does not work on a preview deployment,
which is a different host; password plus a code still does.

**Never widen the relying party id to `globalfurry.tv`.** That would offer every
GFTV staff passkey to every site on the domain, including ones outside this
project.

**Migration `039` added `registered_on`**, so the account page can say which
site a passkey came from. Nothing in the schema could tell them apart before. A
reader who enrolled here and then saw it on the portal would otherwise wonder
what had happened.

## Four sets of codes, and the difference matters

There is no email anywhere in this build, so codes are the only self serve way
back into an account. Each realm has two sets, and they are never the same
codes.

| Set | What it gets you past |
|---|---|
| 2FA backup codes | The second step of signing in. Never the password. |
| Account recovery codes | A password reset. A full account credential. |

**That is why they are two sets.** A backup code lying in a chat log should not
also be a password reset.

Both sets are ten codes, from a CSPRNG, bcrypt hashed one row per code, shown
once, single use. Regenerating invalidates the set, and generating requires the
current password. **Below three remaining, the interface pushes for a
regenerate.**

## The two proofs rule

**On a password reset, a recovery code is not enough where the account has a
second factor.** Migration `027` added the column that enforces it. The recovery
code is checked first and the second factor after it, and only then is the reset
ticket usable.

The rest of the reset flow, in order:

1. A valid recovery code is verified, and **not consumed**. Migration `024`
   added the reference so a code is not burned on a reset somebody abandoned.
2. The second factor, where the account has one.
3. On the new password being set: consume the code, invalidate every session,
   revoke every trusted device, and message Telegram if it is linked.
4. Fewer than three codes left afterwards pushes straight to regenerate.

## The staff exception, stated plainly

**A staff recovery code sets `gftvhello_users.password_hash`**, which is the
gftv.asia password. That breaks section 2's rule about writing to those tables
and 8.8's rule that staff password reset belongs at gftv.asia.

It was asked for deliberately, with the conflict on the table, and it is written
down in 5g as the one named exception. The flow says so on screen.

**Somebody with no codes and no second factor still cannot get back in alone.**
That path stays at gftv.asia, which is where the accounts live.

## The account settings suite

**Specified once and mounted twice.** The portal serves it at `/admin/security`
and this site at `/account`, from the same modules, copied across by
`gen-docs-lib.js`. Two implementations of one security page is how the two drift
until one is wrong.

**The danger zone is three steps, in this order, with no way to skip ahead.**
First the consequences, with a cancel at least as prominent as the continue.
Then the account's own username, typed in full. Then the current password and a
fresh second factor.

**There is no delete account**, and the page says so with a link across. The
account belongs to gftv.asia.

Every destructive action writes an audit row before it executes, naming the
account, the action, and which site it was performed from.

## Rate limiting

**Table backed, in `gftvjobs_rate_limits`.** Section 9 allowed an in-memory
limiter as well, and it would not work. Each Vercel function instance has its
own memory, so such a limiter resets constantly. It could not hold the one hour
lockouts that 5c and 7g require.
