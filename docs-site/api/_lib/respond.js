// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/respond.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The same status codes and the same JSON shapes.
//
// What differs from the portal's copy, and why:
//   - log lines are prefixed [careers-gftv-docs]
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
export const ERROR_CODES = Object.freeze({
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
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.UNAUTHORISED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.NOT_YET_AVAILABLE]: 503,
  [ERROR_CODES.SERVER_ERROR]: 500,
};

/**
 * Send a success response.
 * @param {import('http').ServerResponse} res
 * @param {unknown} data
 * @param {{ status?: number, headers?: Record<string,string> }} [options]
 */
export function ok(response, data, options = {}) {
  const status = options.status ?? 200;
  applyHeaders(response, options.headers);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.statusCode = status;
  response.end(JSON.stringify({ ok: true, data: data ?? null }));
}

/**
 * Send a failure response. Never pass a caught error object as message.
 * @param {import('http').ServerResponse} res
 * @param {string} code one of ERR
 * @param {string} message written for a person to read
 * @param {{ status?: number, headers?: Record<string,string>, details?: unknown }} [options]
 */
export function fail(response, code, message, options = {}) {
  const status = options.status ?? STATUS_FOR[code] ?? 400;
  applyHeaders(response, options.headers);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.statusCode = status;

  const error = { code, message };
  // details is only ever field level validation feedback that we generated
  // ourselves. Nothing from the database goes in here.
  if (options.details !== undefined) error.details = options.details;

  response.end(JSON.stringify({ ok: false, error }));
}

/**
 * Log the real cause on the server, return a generic message to the caller.
 * @param {import('http').ServerResponse} res
 * @param {unknown} cause
 * @param {string} where a short label naming the route, for the log line
 */
export function failInternal(response, cause, where) {
  console.error(`[careers-gftv-docs] ${where}:`, cause);
  return fail(
    response,
    ERROR_CODES.SERVER_ERROR,
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
export function methodNotAllowed(request, response, allowed) {
  if (allowed.includes(request.method ?? '')) return false;

  response.setHeader('Allow', allowed.join(', '));
  fail(response, ERROR_CODES.METHOD_NOT_ALLOWED, `This endpoint accepts ${allowed.join(' and ')}.`);
  return true;
}

/**
 * A feature whose phase has not shipped yet. Section 0c: the interface has to
 * be honest about what is not there, and so does the API behind it.
 * @param {import('http').ServerResponse} res
 * @param {number} phase
 */
export function notYetAvailable(response, phase) {
  return fail(
    response,
    ERROR_CODES.NOT_YET_AVAILABLE,
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
export async function readJson(request, response, maximumBytes = 64 * 1024) {
  // Vercel parses JSON bodies for us when the content type says so.
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === 'object') return request.body;
    if (typeof request.body === 'string') {
      try {
        return JSON.parse(request.body);
      } catch {
        fail(response, ERROR_CODES.BAD_REQUEST, 'The request body was not valid JSON.');
        return null;
      }
    }
  }

  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maximumBytes) {
        fail(response, ERROR_CODES.PAYLOAD_TOO_LARGE, 'That request was too large.');
        return null;
      }
      chunks.push(chunk);
    }
  } catch (cause) {
    failInternal(response, cause, 'readJson');
    return null;
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(response, ERROR_CODES.BAD_REQUEST, 'The request body was not valid JSON.');
    return null;
  }
}

function applyHeaders(response, headers) {
  if (!headers) return;
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
}
