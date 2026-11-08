// A local copy of the portal with every /api/ answer invented, for taking guide
// screenshots without a database.
//
//   node mock-portal.mjs             serves on http://localhost:4173
//   node capture.mjs --mock          starts it for you, then captures
//
// **What is real and what is not.** The pages, scripts, stylesheets, fonts and
// translations are the real files from main-site/, served as they would be on
// Vercel. Every answer from /api/ is made up in mock-data.mjs, and every person,
// posting and applicant in it is marked SAMPLE. Nothing here reads a database,
// so a screenshot taken from it can never contain a real applicant.
//
// Who the visitor is comes from one cookie, gftv-mock-actor, set by the capture
// script: "applicant", "staff", or absent for signed out.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// page-shell.js asks for the site address when it writes the page head. Nothing
// here is deployed, so any value will do.
process.env.SITE_URL ??= 'http://localhost';

import { answerApiRequest } from './mock-data.mjs';
import { postingPageData } from './mock-data.mjs';
const { renderDocument } = await import('../../main-site/api/_lib/page-shell.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(HERE, '..', '..', 'main-site');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/** The loading skeleton job-page.js draws the posting into. */
const POSTING_BODY = `<main class="page job-page" id="main">
  <p class="back-link"><a href="/search" id="backToResults"><span data-icon="chevron-left" data-icon-size="16"></span><span data-i18n="job.backToResults">Back to results</span></a></p>
  <article class="job-detail" id="jobDetail" aria-busy="true"></article>
</main>`;

/** Every /api/ path a page asked for that mock-data.mjs had no answer for. */
export const unansweredRequests = new Set();

/**
 * Read the actor out of the Cookie header.
 *
 * @param {string|undefined} cookieHeader the raw Cookie header
 * @returns {'applicant'|'staff'|null} who the visitor is pretending to be
 */
function actorFromCookie(cookieHeader) {
  const match = /(?:^|;\s*)gftv-mock-actor=([a-z]+)/.exec(cookieHeader ?? '');
  if (!match) return null;
  if (match[1] === 'applicant' || match[1] === 'staff') return match[1];
  return null;
}

/**
 * Find the file a URL path maps to, the way Vercel's cleanUrls setting does:
 * /search is search/index.html and /status is a rewrite.
 *
 * @param {string} urlPath the path part of the request URL
 * @returns {Promise<string|null>} an absolute file path, or null when none exists
 */
async function fileForPath(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    join(SITE_ROOT, safePath),
    join(SITE_ROOT, safePath, 'index.html'),
    join(SITE_ROOT, `${safePath}.html`),
  ];

  for (const candidate of candidates) {
    try {
      const information = await stat(candidate);
      if (information.isFile()) return candidate;
    } catch {
      // Not there. Try the next spelling.
    }
  }
  return null;
}

/**
 * Read a request body into a parsed JSON value.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<object>} the parsed body, or an empty object
 */
async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Start the mock portal.
 *
 * @param {number} port the port to listen on, or 0 for any free one
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
export async function startMockPortal(port = 0) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      const body = request.method === 'GET' || request.method === 'HEAD' ? {} : await readJsonBody(request);
      const answer = answerApiRequest({
        method: request.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        body,
        actor: actorFromCookie(request.headers.cookie),
      });

      if (answer === null) {
        unansweredRequests.add(`${request.method} ${url.pathname}`);
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: { code: 'not_found', message: 'No mock for this route.' } }));
        return;
      }

      response.writeHead(answer.status ?? 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(answer.body));
      return;
    }

    // /jobs/{uuid} is a Vercel rewrite to a server rendered page. The mock
    // renders the same shell with the same inline data block, and the real
    // job-page.js script draws the posting from it.
    const postingMatch = /^\/jobs\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (postingMatch) {
      const pageData = postingPageData(postingMatch[1], actorFromCookie(request.headers.cookie));
      if (pageData) {
        const html = renderDocument({
          title: `${pageData.content.en.title} | Careers@GFTV`,
          description: pageData.content.en.summary,
          canonicalPath: `/jobs/${postingMatch[1]}`,
          ogType: 'article',
          inlineJson: { id: 'jobData', data: pageData },
          modules: ['/assets/js/shell.js', '/assets/js/job-page.js'],
          bodyHtml: POSTING_BODY,
        });
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(html);
        return;
      }
    }

    const file = await fileForPath(url.pathname);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
      return;
    }

    const contents = await readFile(file);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(contents);
  });

  await new Promise((resolveListening) => server.listen(port, '127.0.0.1', resolveListening));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClosed) => server.close(() => resolveClosed())),
  };
}

// Run directly: serve until stopped.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { baseUrl } = await startMockPortal(4173);
  console.log(`Mock portal on ${baseUrl}  (actor cookie: gftv-mock-actor=applicant|staff)`);
}
