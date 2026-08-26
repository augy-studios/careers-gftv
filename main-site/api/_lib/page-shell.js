// The HTML document, built by a serverless function.
//
// There is exactly one server rendered page in this portal, `/jobs/{uuid}`, and
// section 4 gives the reason at length: unfurlers fetch the URL and read the
// markup as delivered, and none of them run JavaScript. A page that fetched its
// posting after load would embed with the same generic text for every role on
// the site. Everything else stays a static page with a client side fetch.
//
// Because of that, this file is the only copy of the `<head>` that is not an
// HTML file. Section 0.2 makes the root index.html the template for every head
// in the repo, and this mirrors it: the same meta order, the same pre-paint
// theme and locale script, the same stylesheets, the same manifest and icons.
// **When index.html's head changes, change this too.** Nothing enforces that,
// so it is written here rather than left to be noticed.
//
// The pre-paint script is duplicated rather than moved to a file on purpose. It
// has to run before first paint, and an external script would be a round trip
// during which the page renders in the wrong theme and the wrong language.

import { siteUrl } from './env.js';

/**
 * Build a complete HTML document.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   canonicalPath: string,
 *   ogTitle?: string,
 *   ogDescription?: string,
 *   ogImage?: string,
 *   ogType?: string,
 *   robots?: string|null,
 *   jsonLd?: object|null,
 *   inlineJson?: { id: string, data: unknown }|null,
 *   modules?: string[],
 *   bodyHtml: string
 * }} page
 * @returns {string}
 */
export function renderDocument(page) {
  const site = siteUrl();
  const canonical = `${site}${page.canonicalPath}`;
  const image = page.ogImage ?? `${site}/HLC-main.png`;

  const ogTitle = page.ogTitle ?? page.title;
  const ogDescription = page.ogDescription ?? page.description;

  return `<!doctype html>
<html lang="en">

<head>
    <!-- Server rendered. The head is the whole reason this route is a function
         rather than a static page: the title, the description, the Open Graph
         tags, and the JobPosting JSON-LD below describe this posting rather
         than the site, and every one of them is here before the response is
         sent. See section 4. -->

    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeAttr(page.description)}">
${page.robots ? `    <meta name="robots" content="${escapeAttr(page.robots)}">\n` : ''}
    <!-- Theme, before the stylesheet. Mirrors the block in index.html exactly.
         Keep the key in sync with APP_KEY in /assets/js/theme.js. -->
    <meta name="theme-color" content="#ffffff">
    <script>
        (function () {
            var k = "gftv-careers";
            var m = localStorage.getItem(k + ".mode") || "light";
            if (m === "time") {
                var h = new Date().getHours();
                m = h >= 9 && h < 18 ? "light" : "dark";
                document.documentElement.setAttribute("data-mode-preference", "time");
            }
            var c = localStorage.getItem(k + ".colorTheme") || "classic";
            var l = localStorage.getItem(k + ".locale") || "en";
            document.documentElement.setAttribute("data-mode", m);
            document.documentElement.setAttribute("data-color-theme", c);
            document.documentElement.setAttribute("data-locale", l);
            document.documentElement.setAttribute("lang", l === "zh" ? "zh-Hans-SG" : "en");
            if (l !== "en") {
                document.documentElement.setAttribute("data-i18n-pending", "true");
                setTimeout(function () {
                    document.documentElement.removeAttribute("data-i18n-pending");
                }, 1200);
            }
        })();
    </script>

    <link rel="stylesheet" href="/assets/css/theme.css">
    <link rel="stylesheet" href="/assets/css/app.css">

    <link rel="manifest" href="/manifest.json">
    <link rel="canonical" href="${escapeAttr(canonical)}">

    <meta property="og:type" content="${escapeAttr(page.ogType ?? 'website')}">
    <meta property="og:site_name" content="Careers@GFTV">
    <meta property="og:title" content="${escapeAttr(ogTitle)}">
    <meta property="og:description" content="${escapeAttr(ogDescription)}">
    <meta property="og:url" content="${escapeAttr(canonical)}">
    <meta property="og:image" content="${escapeAttr(image)}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeAttr(ogTitle)}">
    <meta name="twitter:description" content="${escapeAttr(ogDescription)}">
    <meta name="twitter:image:src" content="${escapeAttr(image)}">

    <link rel="apple-touch-icon" href="/HLC-180.png">
    <link rel="icon" href="/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
${page.jsonLd ? `\n    <script type="application/ld+json">${jsonScript(page.jsonLd)}</script>\n` : ''}${
    page.inlineJson
      ? `\n    <!-- The posting itself, so the page draws without a second round
         trip and switching language redraws from memory. Every language this
         posting is ready in is here; the Google Form URL is not, and never is,
         per section 4. -->
    <script type="application/json" id="${escapeAttr(page.inlineJson.id)}">${jsonScript(
          page.inlineJson.data
        )}</script>\n`
      : ''
  }
${(page.modules ?? []).map((src) => `    <script type="module" src="${escapeAttr(src)}"></script>`).join('\n')}
</head>

<body>
    <!-- Shown only while a non default language is loading its dictionary. The
         body is held hidden during that window so nothing paints in English
         first; this is what shows instead of a blank page. -->
    <div class="boot-loader" aria-hidden="true">
        <span class="spinner delayed"></span>
    </div>
    <a class="skip-link" href="#main" data-i18n="common.skipToContent">Skip to content</a>

${page.bodyHtml}

    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
    </script>
</body>

</html>
`;
}

/**
 * Send a rendered document.
 * @param {import('http').ServerResponse} res
 * @param {string} html
 * @param {{ status?: number, headers?: Record<string,string> }} [options]
 */
export function sendHtml(res, html, options = {}) {
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    res.setHeader(name, value);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.statusCode = options.status ?? 200;
  res.end(html);
}

/**
 * JSON safe to sit inside a <script> element.
 *
 * The one character that matters is the less than sign. A JSON string
 * containing the literal text `</script>` ends the element early, whatever the
 * quoting around it, and an admin writing about HTML in a posting description
 * is not a far fetched way for that to happen. A unicode escape is valid JSON,
 * parses back to the same string, and cannot close anything.
 */
function jsonScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function escapeAttr(value) {
  return escapeHtml(value);
}
