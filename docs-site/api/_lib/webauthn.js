// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/webauthn.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// 5e's one real difference: the relying party id is the portal's host and the
// expected origin is this site's. Everything else, the credential tables
// included, is shared.
//
// What differs from the portal's copy, and why:
//   - docsUrl is imported for the expected origin
//   - the docblock says which host SITE_URL names on this site
//   - the expected origin is DOCS_URL while the id stays SITE_URL
//   - log lines are prefixed [careers-gftv-docs]
// Passkeys, for both realms.
//
// A passkey is a WebAuthn credential. The authenticator holds a private key
// that never leaves it, the server holds the matching public key, and signing
// in means answering a fresh random challenge with a signature over it. There
// is no shared secret, so there is nothing here for a database leak to reveal
// and nothing for a phishing page to capture: the browser will only sign a
// challenge for the domain that created the credential.
//
// Used here as the second factor, after the password, in both realms. That is
// what makes it worth having on the applicant side at all: until now the
// applicant realm had no second factor and was not going to get one until the
// Telegram bot ships in phase 11.
//
// Deliberately not passwordless, for now. The credentials are registered in a
// shape that could become passwordless later without anybody re-enrolling,
// which is why residentKey is "preferred" rather than "discouraged": a
// discoverable credential is what a passwordless sign in needs, and asking for
// it now costs nothing.
//
// The ceremonies themselves are @simplewebauthn/server rather than hand
// written. Verifying an assertion means parsing CBOR, decoding COSE keys, and
// checking signatures across three algorithm families, and that is not
// something to get subtly wrong in an auth path.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import { supabase, T } from './supabase.js';
import { siteUrl, docsUrl } from './env.js';
import { sha256 } from './tokens.js';

/** How long a ceremony may stay open. */
const CHALLENGE_MINUTES = 5;

/** The name shown in the operating system's passkey prompt. */
const RP_NAME = 'Careers@GFTV';

/**
 * The relying party id, which is the domain a passkey is bound to.
 *
 * Derived from SITE_URL rather than configured separately, so it is right in
 * every environment without a second variable to keep in step. **On this site
 * SITE_URL is the portal**, which is the point of it: both sites claim the
 * portal's host as the relying party id, because careers.globalfurry.tv is a
 * registrable suffix of docs.careers.globalfurry.tv and is not a public
 * suffix, so one enrolment covers both. Locally that is "localhost", which
 * WebAuthn permits over plain http as the one exception to its https
 * requirement.
 *
 * Two consequences, both by design and neither a bug to fix later:
 *
 *   A passkey registered here does not work on gftv.asia. Credentials are
 *   bound to a domain, and gftv.asia is a different one. Staff accounts are
 *   shared between the two sites, but their passkeys are not.
 *
 *   A passkey registered on a preview deployment does not work in production,
 *   because the host differs. That is the same rule doing its job.
 */
export function relyingParty() {
  // **The pair, and the one thing on this site that is not a copy.** The id is
  // the portal's host, so a passkey registered there is offered here. The
  // origin is this site's own, because a response is verified against where it
  // was actually created. Swapped, this either breaks the docs sign in loudly
  // or accepts an assertion from the wrong origin quietly.
  return {
    id: new URL(siteUrl()).hostname,
    origin: new URL(docsUrl()).origin,
    name: RP_NAME,
  };
}

/** Which realm a credential belongs to, and where it lives. */
const REALMS = Object.freeze({
  applicant: { table: T.passkeys, userColumn: 'user_id' },
  staff: { table: T.staffPasskeys, userColumn: 'staff_user_id' },
});

function realmConfig(realm) {
  const config = REALMS[realm];
  if (!config) throw new Error(`unknown realm: ${realm}`);
  return config;
}

/* -------------------------------------------------------------------------
 * Stored credentials
 * ---------------------------------------------------------------------- */

/**
 * Every passkey on an account.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 */
export async function listPasskeys(realm, userId) {
  const { table, userColumn } = realmConfig(realm);

  const { data, error } = await supabase
    .from(table)
    .select('id, credential_id, transports, aaguid, backed_up, device_type, label, created_at, last_used_at')
    .eq(userColumn, userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[careers-gftv-docs] listPasskeys:', error);
    return [];
  }

  return data ?? [];
}

/**
 * Whether an account has any passkey at all. This is what decides whether the
 * login flow asks for a second factor.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 */
export async function hasPasskeys(realm, userId) {
  const { table, userColumn } = realmConfig(realm);

  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(userColumn, userId);

  if (error) {
    // Fail closed on the side of asking for more, not less: if this cannot be
    // read, the caller treats the account as having no passkey, which means
    // the other factors still apply and nothing is skipped that should not be.
    console.error('[careers-gftv-docs] hasPasskeys:', error);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Remove one passkey, scoped to its owner.
 * @param {'staff'|'applicant'} realm
 * @param {string} userId
 * @param {string} passkeyId
 * @returns {Promise<boolean>}
 */
export async function deletePasskey(realm, userId, passkeyId) {
  const { table, userColumn } = realmConfig(realm);

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq(userColumn, userId)
    .eq('id', passkeyId)
    .select('id');

  if (error) {
    console.error('[careers-gftv-docs] deletePasskey:', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/* -------------------------------------------------------------------------
 * Challenges
 * ---------------------------------------------------------------------- */

async function storeChallenge({ realm, purpose, userId, challenge, loginToken = null }) {
  // One open ceremony per account and purpose. Starting a new one abandons the
  // last, which is what somebody clicking the button twice expects.
  await supabase
    .from(T.passkeyChallenges)
    .delete()
    .eq('realm', realm)
    .eq('purpose', purpose)
    .eq('user_id', userId);

  const { error } = await supabase.from(T.passkeyChallenges).insert({
    realm,
    purpose,
    user_id: userId,
    challenge,
    login_token_hash: loginToken ? sha256(loginToken) : null,
    expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000).toISOString(),
  });

  if (error) throw new Error(`could not store the passkey challenge: ${error.message}`);
}

/**
 * Take the open challenge for a ceremony, deleting it as it is read.
 *
 * Deleted before it is used rather than after, so a challenge cannot be
 * answered twice even if two requests arrive together.
 */
async function takeChallenge({ realm, purpose, userId, loginToken = null }) {
  const { data, error } = await supabase
    .from(T.passkeyChallenges)
    .select('id, challenge, login_token_hash, expires_at')
    .eq('realm', realm)
    .eq('purpose', purpose)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv-docs] takeChallenge:', error);
    return null;
  }
  if (!data) return null;

  await supabase.from(T.passkeyChallenges).delete().eq('id', data.id);

  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  // An authentication ceremony is bound to the sign in that started it. Without
  // this, a passkey assertion would be a complete credential on its own and the
  // password step could be skipped entirely.
  if (data.login_token_hash) {
    if (!loginToken || sha256(loginToken) !== data.login_token_hash) return null;
  }

  return data.challenge;
}

/* -------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------- */

/**
 * Start registering a passkey. Returns the options the browser passes to
 * navigator.credentials.create.
 *
 * @param {{ realm: 'staff'|'applicant', userId: string, username: string, displayName: string }} account
 */
export async function startRegistration({ realm, userId, username, displayName }) {
  const rp = relyingParty();
  const existing = await listPasskeys(realm, userId);

  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    // The account id, not the username. A username can change; what the
    // authenticator files the credential under should not.
    userID: new TextEncoder().encode(userId),
    userName: username,
    userDisplayName: displayName ?? username,
    // No attestation. Attestation identifies the make and model of the
    // authenticator, which is only useful to an organisation that enforces
    // which ones are allowed. Asking for it would mean handling certificate
    // chains and, on some platforms, an extra consent prompt, for nothing.
    attestationType: 'none',
    // So the same authenticator cannot be registered twice and appear as two
    // identical rows nobody can tell apart.
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: row.transports ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await storeChallenge({ realm, purpose: 'register', userId, challenge: options.challenge });

  return options;
}

/**
 * Finish registering a passkey.
 *
 * @param {{ realm: string, userId: string, response: object, label?: string|null }} input
 * @returns {Promise<{ ok: true, passkey: object } | { ok: false, reason: string }>}
 */
export async function finishRegistration({ realm, userId, response, label = null }) {
  const rp = relyingParty();
  const { table, userColumn } = realmConfig(realm);

  const expectedChallenge = await takeChallenge({ realm, purpose: 'register', userId });
  if (!expectedChallenge) return { ok: false, reason: 'challenge_expired' };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      // Not required. A security key without a PIN still gives a real second
      // factor, and demanding user verification would turn away hardware that
      // is doing its job. Platform authenticators verify anyway.
      requireUserVerification: false,
    });
  } catch (cause) {
    // A failed verification is an ordinary outcome here, not a server fault:
    // a mismatched origin, a stale challenge, or a malformed response all land
    // in this branch.
    console.warn('[careers-gftv-docs] passkey registration rejected:', cause?.message ?? cause);
    return { ok: false, reason: 'not_verified' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: 'not_verified' };
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
    verification.registrationInfo;

  const row = {
    [userColumn]: userId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    sign_count: credential.counter ?? 0,
    transports: credential.transports ?? null,
    aaguid: aaguid ?? null,
    backed_up: Boolean(credentialBackedUp),
    device_type: credentialDeviceType ?? null,
    label,
  };

  const { data, error } = await supabase
    .from(table)
    .insert(row)
    .select('id, credential_id, transports, aaguid, backed_up, device_type, label, created_at, last_used_at')
    .single();

  if (error) {
    // 23505 means this credential is already registered, which is what
    // excludeCredentials is meant to prevent and what a determined retry can
    // still produce.
    if (error.code === '23505') return { ok: false, reason: 'already_registered' };
    console.error('[careers-gftv-docs] finishRegistration insert:', error);
    return { ok: false, reason: 'not_stored' };
  }

  return { ok: true, passkey: data };
}

/* -------------------------------------------------------------------------
 * Authentication
 * ---------------------------------------------------------------------- */

/**
 * Start the passkey step of a sign in. Returns the options the browser passes
 * to navigator.credentials.get, or null when the account has no passkey.
 *
 * @param {{ realm: string, userId: string, loginToken: string }} input the
 *        loginToken is the challenge token issued by the password step, which
 *        this ceremony is bound to.
 */
export async function startAuthentication({ realm, userId, loginToken }) {
  const rp = relyingParty();
  const credentials = await listPasskeys(realm, userId);
  if (credentials.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    // Named rather than left open, because this is a second factor for an
    // account already identified by the password step. A discoverable sign in
    // would be a different flow.
    allowCredentials: credentials.map((row) => ({
      id: row.credential_id,
      transports: row.transports ?? undefined,
    })),
    userVerification: 'preferred',
  });

  await storeChallenge({
    realm,
    purpose: 'authenticate',
    userId,
    challenge: options.challenge,
    loginToken,
  });

  return options;
}

/**
 * Finish the passkey step.
 *
 * @param {{ realm: string, userId: string, response: object, loginToken: string }} input
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function finishAuthentication({ realm, userId, response, loginToken }) {
  const rp = relyingParty();
  const { table, userColumn } = realmConfig(realm);

  const expectedChallenge = await takeChallenge({
    realm,
    purpose: 'authenticate',
    userId,
    loginToken,
  });
  if (!expectedChallenge) return { ok: false, reason: 'challenge_expired' };

  const credentialId = typeof response?.id === 'string' ? response.id : '';
  if (credentialId === '') return { ok: false, reason: 'not_verified' };

  // Scoped to the account the password step identified. A valid assertion from
  // somebody else's passkey must not satisfy this sign in.
  const { data: stored, error } = await supabase
    .from(table)
    .select('id, credential_id, public_key, sign_count, transports')
    .eq(userColumn, userId)
    .eq('credential_id', credentialId)
    .maybeSingle();

  if (error) {
    console.error('[careers-gftv-docs] finishAuthentication lookup:', error);
    return { ok: false, reason: 'not_verified' };
  }
  if (!stored) return { ok: false, reason: 'unknown_credential' };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key, 'base64url')),
        counter: Number(stored.sign_count ?? 0),
        transports: stored.transports ?? undefined,
      },
      requireUserVerification: false,
    });
  } catch (cause) {
    console.warn('[careers-gftv-docs] passkey assertion rejected:', cause?.message ?? cause);
    return { ok: false, reason: 'not_verified' };
  }

  if (!verification.verified) return { ok: false, reason: 'not_verified' };

  // The counter is the only clone detection WebAuthn offers, and it only says
  // anything when it moves. Plenty of authenticators, including every Apple
  // passkey, report zero forever, so a zero is not a failure. The library
  // rejects a decrease before we get here.
  const newCounter = verification.authenticationInfo?.newCounter ?? 0;

  const { error: updateError } = await supabase
    .from(table)
    .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
    .eq('id', stored.id);

  if (updateError) console.error('[careers-gftv-docs] finishAuthentication update:', updateError);

  return { ok: true };
}

/**
 * A label for a newly registered passkey, when the browser gives us nothing
 * better. Coarse on purpose, like the trusted device label.
 * @param {import('http').IncomingMessage} req
 */
export function passkeyLabel(req) {
  const ua = String(req.headers?.['user-agent'] ?? '');

  if (/iPhone|iPad|iPod|Mac OS X/i.test(ua)) return 'Apple device';
  if (/Android/i.test(ua)) return 'Android device';
  if (/Windows/i.test(ua)) return 'Windows device';
  if (/Linux/i.test(ua)) return 'Linux device';
  return 'Passkey';
}
