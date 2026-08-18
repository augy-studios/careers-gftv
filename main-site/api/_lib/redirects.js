// Redirect validation.
//
// Section 4: a ?redirect= is carried through login and registration, including
// through the automatic sign in that follows registration, so a new applicant
// lands back on the posting they started from. It must be validated against a
// strict allowlist of relative paths on this origin, or the parameter becomes
// an open redirect.
//
// The rule here is allowlist by shape, not blocklist by pattern. Anything that
// is not a single leading slash followed by an allowed path is rejected
// outright, which is why absolute URLs, protocol relative URLs, backslash
// tricks, and encoded hosts all fail without needing a rule each.

const FALLBACK = '/account';

// Path prefixes an applicant may be returned to. A posting, the board, and
// their own account area. Never /admin, never /api, never a placeholder route.
const ALLOWED_PREFIXES = [
  '/jobs/',
  '/search',
  '/account',
  '/about',
  '/faq',
  '/',
];

/**
 * Validate a redirect target. Returns a safe relative path, always.
 *
 * @param {string|null|undefined} value the raw ?redirect= parameter
 * @returns {string} a relative path on this origin
 */
export function safeRedirect(value) {
  if (typeof value !== 'string' || value === '') return FALLBACK;
  if (value.length > 512) return FALLBACK;

  // Must be a relative path starting with exactly one slash. This single check
  // rejects https://evil.example and //evil.example.
  if (!value.startsWith('/')) return FALLBACK;
  if (value.startsWith('//')) return FALLBACK;

  // No control characters, and no backslash anywhere, since some browsers
  // normalise a backslash to a slash after the fact. Written as a loop rather
  // than a regex so no control character has to appear in this source file.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const isControl = code <= 0x1f || code === 0x7f;
    const isBackslash = code === 0x5c;
    if (isControl || isBackslash) return FALLBACK;
  }

  // Reject anything that could be read as a scheme or a userinfo section
  // before the path is even parsed.
  if (value.includes(':') || value.includes('@')) return FALLBACK;

  let parsed;
  try {
    // A dummy base, purely to normalise dot segments. The origin is discarded.
    parsed = new URL(value, 'https://careers.invalid');
  } catch {
    return FALLBACK;
  }

  if (parsed.origin !== 'https://careers.invalid') return FALLBACK;

  const path = parsed.pathname;

  const allowed = ALLOWED_PREFIXES.some((prefix) =>
    prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix)
  );
  if (!allowed) return FALLBACK;

  // Query and hash are preserved, so returning to /search keeps the filters and
  // returning to a posting keeps its state. Section 4 requires the round trip
  // to reproduce what the sender was looking at.
  return `${path}${parsed.search}${parsed.hash}`;
}

/**
 * Whether a value would survive safeRedirect unchanged. Used to decide whether
 * to carry the parameter forward at all.
 * @param {string} value
 */
export function isSafeRedirect(value) {
  return typeof value === 'string' && value !== '' && safeRedirect(value) === value;
}
