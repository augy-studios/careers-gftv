// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/assets/js/passkeys.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The WebAuthn ceremony in the browser, which needs no imports
// and nothing site specific: 5e settles the relying party pair on the
// server, and this file only carries what the API answered to the platform
// and back.
//
// Nothing differs from the portal's copy but this banner.
// Passkeys, browser side.
//
// WebAuthn is a browser API and not a library, so this file is only the
// conversion work around it: the server speaks base64url JSON, and
// navigator.credentials speaks ArrayBuffer. Roughly eighty lines, which is why
// nothing is bundled here. The site has no build step, and adding one so a
// dependency could do this would be a poor trade.
//
// The server side is @simplewebauthn/server, because verifying an assertion
// means parsing CBOR and COSE keys and checking signatures, which is not the
// same kind of work at all.
//
// Nothing here is a security boundary. Everything this file produces is
// verified again on the server against a challenge the server issued.

/**
 * Whether this browser can do passkeys at all.
 *
 * Feature detected, not assumed, because the answer decides whether the
 * account page offers to register one. Offering a control that cannot work is
 * exactly what section 0c says not to do.
 */
export function passkeysSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function'
  );
}

/**
 * Whether this device has a built in authenticator, such as Touch ID, Face ID,
 * or Windows Hello. Used only to word the button: a phone says "use your
 * fingerprint", a desktop with nothing built in says "use your security key".
 * @returns {Promise<boolean>}
 */
export async function platformAuthenticatorAvailable() {
  if (!passkeysSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------
 * base64url, both ways
 * ---------------------------------------------------------------------- */

function fromBase64url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* -------------------------------------------------------------------------
 * The two ceremonies
 * ---------------------------------------------------------------------- */

/**
 * Create a credential. Returns what the server's finishRegistration expects.
 *
 * @param {object} options the server's generateRegistrationOptions output
 * @returns {Promise<object>}
 */
export async function createPasskey(options) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      user: { ...options.user, id: fromBase64url(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((item) => ({
        ...item,
        id: fromBase64url(item.id),
      })),
    },
  });

  if (!credential) throw new Error('no credential was created');

  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64url(credential.response.clientDataJSON),
      attestationObject: toBase64url(credential.response.attestationObject),
      transports: credential.response.getTransports?.() ?? [],
    },
  };
}

/**
 * Sign a challenge with an existing credential.
 *
 * @param {object} options the server's generateAuthenticationOptions output
 * @returns {Promise<object>}
 */
export async function usePasskey(options) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromBase64url(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((item) => ({
        ...item,
        id: fromBase64url(item.id),
      })),
    },
  });

  if (!assertion) throw new Error('no assertion was produced');

  return {
    id: assertion.id,
    rawId: toBase64url(assertion.rawId),
    type: assertion.type,
    clientExtensionResults: assertion.getClientExtensionResults(),
    authenticatorAttachment: assertion.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64url(assertion.response.clientDataJSON),
      authenticatorData: toBase64url(assertion.response.authenticatorData),
      signature: toBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? toBase64url(assertion.response.userHandle)
        : undefined,
    },
  };
}

/**
 * Whether a thrown error means the person simply cancelled.
 *
 * Worth telling apart. Closing the system prompt is not a failure and must not
 * be reported as one: it produces the same NotAllowedError as a genuine
 * timeout, and treating both as an error leaves somebody who changed their
 * mind staring at a red message.
 * @param {unknown} error
 */
export function wasCancelled(error) {
  return error?.name === 'NotAllowedError' || error?.name === 'AbortError';
}
