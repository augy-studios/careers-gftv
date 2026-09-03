---
title: Signing in
access: public
order: 3
summary: The sign in page, the second step, and what stay signed in and trust this device each do.
---

# Signing in

Sign in at [careers.globalfurry.tv/login](https://careers.globalfurry.tv/login)
with your username or your email address, and your password. Both work; they
are two names for the same account.

If you are already signed in, that page says so and offers to take you on
instead of asking again.

## Stay signed in

A tickbox on the sign in page, reading **Stay signed in for 30 days on this
device**.

- Ticked, the session lasts 30 days on that browser.
- Left alone, it lasts 12 hours.

Leave it off on a shared or public computer. It is about that browser only and
has no effect anywhere else.

## The second step, if you have one

A new account has one step: your password. Signing in becomes two steps once
you add either of these, in [account settings](/portal/account-settings) or on
the **Sign in and security** page:

- **A passkey**, which is your fingerprint, your face, or a security key. There
  is nothing to type and nothing to copy, and it cannot be phished, because
  your device will only offer it on this site.
- **A code from the Telegram bot**, which is a six digit number sent to you in
  chat when you sign in.

Your password is always asked for. Neither of these replaces it, and both sit
after it.

If you have set up both, the site accepts either. If you can reach neither, one
of your **two factor backup codes** works in place of both, which is what that
set is for. See [Recovery codes](/portal/recovery-codes).

### The Telegram code

It lasts five minutes and works once. If it does not arrive, send `/code` to
the bot and it will issue another. A two factor backup code from your security
page works here as well.

### The one tap link

The bot can also send a link that signs you in without a code.

**It only works in the browser that asked for it.** Opening it somewhere else
does not sign that browser in. The link is cancelled, and you are asked to sign
in with the six digit code instead. This is deliberate. A link that signed in
whoever opened it would be a password sitting in a chat history.

## Trust this device

On the second step, a tickbox reading **Trust this device for 30 days**.

What it does, exactly:

- It skips **the second step** on that browser for 30 days.
- It never skips your password. That is asked for every single time.
- It never gets past anything in the danger zone, or any change to how signing
  in works. Those ask again regardless.

Tick it and the site asks you to name the device, so you can tell it apart from
your others later. Every trusted device is listed on the **Sign in and
security** page, with when it was last used and when it expires. Each can be
revoked from there, one at a time or all at once.

Do not tick it on a shared or public computer.

![The sign in page with the stay signed in option below the password field.](pending:portal-login-desktop-light "The sign in page. The second step, if the account has one, comes after this.")

## What signs you out

- **Signing out**, from the menu in the header.
- **Changing your password**, which signs out every other browser and removes
  every trusted device.
- **Setting a new password with a recovery code**, which does the same and uses
  the code up.
- **Turning the Telegram code on or off**, or **unlinking Telegram**, each of
  which makes every trusted device answer the second step once more.
- **Deleting your account**, which signs you out everywhere immediately.

## If you cannot get in

- Forgotten password: [recover your
  account](https://careers.globalfurry.tv/forgot-password) with one account
  recovery code. If the account has a passkey, that is asked for too. This is
  deliberate: one lost code should not be enough to take an account over.
- No codes left: nobody can get you back in on your own. An admin can reset the
  password once they are satisfied you are who you say you are. Ask in the GFTV
  Telegram group or wherever you normally reach the team.
- More symptoms and what each one means:
  [Troubleshooting](/portal/troubleshooting).

## Staff sign in is a different door

Careers@GFTV has two separate account systems. An applicant account is created
here and exists here. A staff account is a gftv.asia account, and it signs in
at
[careers.globalfurry.tv/admin/login](https://careers.globalfurry.tv/admin/login).
The two share nothing, including passwords, and having one does not give you
the other.
