// One JSON shape for every response from this API, and one place that decides
// what a caller is allowed to see.
//
// Section 9: "Consistent JSON error shape with proper status codes. Never leak
// stack traces or database errors to the client."
//
// Success:  { "ok": true,  "data": ... }
// Failure:  { "ok": false, "error": { "code": "...", "message": "..." } }
//
// The message is written for a person to read. The code is stable and is what
// the client branches on. Anything the database or a library threw is logged
// on the server and never travels to the browser.

/** Error codes the client is allowed to branch on. */
export const ERR = Object.freeze({
  BAD_REQUEST: 'bad_request',
  UNAUTHORISED: 'unauthorised',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  NOT_YET_AVAILABLE: 'not_yet_available',
  SERVER_ERROR: 'server_error',
});

const STATUS_FOR = {
  [ERR.BAD_REQUEST]: 400,
  [ERR.UNAUTHORISED]: 401,
  [ERR.FORBIDDEN]: 403,
  [ERR.NOT_FOUND]: 404,
  [ERR.METHOD_NOT_ALLOWED]: 405,
  [ERR.CONFLICT]: 409,
  [ERR.PAYLOAD_TOO_LARGE]: 413,
  [ERR.RATE_LIMITED]: 429,
  [ERR.NOT_YET_AVAILABLE]: 503,
  [ERR.SERVER_ERROR]: 500,
};

/**
 * Send a success response.
 * @param {import('http').ServerResponse} res
 * @param {unknown} data
 * @param {{ status?: number, headers?: Record<string,string> }} [options]
 */
export function ok(res, data, options = {}) {
  const status = options.status ?? 200;
  applyHeaders(res, options.headers);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify({ ok: true, data: data ?? null }));
}

/**
 * Send a failure response. Never pass a caught error object as message.
 * @param {import('http').ServerResponse} res
 * @param {string} code one of ERR
 * @param {string} message written for a person to read
 * @param {{ status?: number, headers?: Record<string,string>, details?: unknown }} [options]
 */
export function fail(res, code, message, options = {}) {
  const status = options.status ?? STATUS_FOR[code] ?? 400;
  applyHeaders(res, options.headers);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;

  const error = { code, message };
  // details is only ever field level validation feedback that we generated
  // ourselves. Nothing from the database goes in here.
  if (options.details !== undefined) error.details = options.details;

  res.end(JSON.stringify({ ok: false, error }));
}

/**
 * Log the real cause on the server, return a generic message to the caller.
 * @param {import('http').ServerResponse} res
 * @param {unknown} cause
 * @param {string} where a short label naming the route, for the log line
 */
export function failInternal(res, cause, where) {
  console.error(`[careers-gftv] ${where}:`, cause);
  return fail(
    res,
    ERR.SERVER_ERROR,
    'Something went wrong at our end. Try again in a moment.'
  );
}

/**
 * Guard the HTTP method. Returns true when the request should stop here.
 *
 * **List HEAD alongside GET on anything a stranger may fetch.** RFC 9110 says a
 * server supporting GET on a resource should support HEAD on it, and the things
 * that actually send one are monitors, link checkers, and some unfurlers
 * deciding whether to follow a URL at all. Node discards the body of a HEAD
 * response by itself, so allowing it costs nothing and the handler needs no
 * branch. The phase 3 public routes answered 405 to HEAD until the phase 4 test
 * run noticed, which is also why `curl -I` against them looked like a caching
 * bug: it was reading the headers of a 405.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string[]} allowed
 */
export function methodNotAllowed(req, res, allowed) {
  if (allowed.includes(req.method ?? '')) return false;

  res.setHeader('Allow', allowed.join(', '));
  fail(
    res,
    ERR.METHOD_NOT_ALLOWED,
    `This endpoint accepts ${allowed.join(' and ')}.`
  );
  return true;
}

/**
 * A feature whose phase has not shipped yet. Section 0c: the interface has to
 * be honest about what is not there, and so does the API behind it.
 * @param {import('http').ServerResponse} res
 * @param {number} phase
 */
export function notYetAvailable(res, phase) {
  return fail(
    res,
    ERR.NOT_YET_AVAILABLE,
    `Will be available in Phase ${phase}. Sorry for the inconvenience caused.`
  );
}

/**
 * Read and parse a JSON body, with a size cap. Returns null and answers the
 * request itself on anything malformed or oversized.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {number} [maxBytes]
 */
export async function readJson(req, res, maxBytes = 64 * 1024) {
  // Vercel parses JSON bodies for us when the content type says so.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        fail(res, ERR.BAD_REQUEST, 'The request body was not valid JSON.');
        return null;
      }
    }
  }

  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        fail(res, ERR.PAYLOAD_TOO_LARGE, 'That request was too large.');
        return null;
      }
      chunks.push(chunk);
    }
  } catch (cause) {
    failInternal(res, cause, 'readJson');
    return null;
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(res, ERR.BAD_REQUEST, 'The request body was not valid JSON.');
    return null;
  }
}

function applyHeaders(res, headers) {
  if (!headers) return;
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
}
