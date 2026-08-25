// The daily form health check, section 11.
//
//   "Health check each published job's application_form_url with a HEAD or
//    lightweight GET. If the form is deleted, private, or no longer accepting
//    responses, flag the job in the admin list with a warning badge rather than
//    unpublishing it silently."
//
// **Why this is a GET and not a HEAD.** Of the three states that sentence names,
// exactly one is visible in a status line. A deleted form 404s. A form that is
// no longer accepting responses answers **200**, and so does a private one,
// which redirects to a Google sign in page that is itself a perfectly healthy
// document. A HEAD-only check would report both of those as fine, which are the
// two an admin most needs to hear about, so the check reads the page.
//
// **The rule that makes reading Google's HTML safe to rely on.** A page that
// loads and matches no marker leaves form_check_state exactly as it was, rather
// than claiming 'ok'. Everything here is pattern matching against wording
// Google owns and may reword without telling anybody, so the failure that has
// to be designed for is not "the check breaks" but "the check quietly starts
// lying". Keeping the previous state means a rewording degrades to no new
// information — the badge and the date stop advancing, which is visible — while
// overwriting with 'ok' would turn every closed form green on the same morning
// and nobody would ever know.
//
// The three writes it will make, and nothing else:
//
//   error    the form is gone. 404 or 410, and only that.
//   warning  the form loaded but cannot be applied to: closed to responses, or
//            asking for a sign in.
//   ok       the form loaded and looks like a live form.
//
// **It never unpublishes anything**, per section 11 and the comment on the
// column in migration 005. A posting whose form is broken is a posting somebody
// has to look at, not one the site should take down at three in the morning
// with nobody watching.

/** How long one form is given before it is treated as no answer. */
const TIMEOUT_MS = 8000;

/**
 * How much of the page is read.
 *
 * Every marker below appears in the first screenful of markup, and a live
 * Google Form's payload runs to several hundred kilobytes of script that is of
 * no interest here. Reading a bounded prefix means a form check cannot become a
 * memory problem, and the cron checks every published posting in one invocation.
 */
const MAX_BYTES = 96 * 1024;

/**
 * Wording that means "this form is closed", in the languages this portal runs
 * postings in.
 *
 * Matched case insensitively against the page text. Chinese appears in both
 * scripts because the respondent's own Google interface language decides which
 * one is served, and that is not a setting this portal controls.
 *
 * **When one of these stops matching, that is a wording change and not a bug in
 * the caller.** Add the new phrase here; do not relax the unknown-keeps-prior-
 * state rule at the bottom of runFormCheck to compensate.
 */
const CLOSED_MARKERS = Object.freeze([
  'no longer accepting responses',
  'not accepting responses',
  'is no longer accepting',
  '不再接受回复',
  '不再接受回覆',
  '已停止接受回复',
  '已停止接受回覆',
]);

/** Hosts that mean the form is asking whoever fetched it to sign in. */
const SIGN_IN_HOSTS = Object.freeze(['accounts.google.com', 'accounts.youtube.com']);

/**
 * The result of checking one form.
 *
 * state is null when nothing was learned, which is the case the caller must
 * handle by leaving the stored columns alone. It is not an error and it is not
 * ok, and collapsing it into either is the mistake this whole file is shaped
 * around.
 *
 * @typedef {{ state: 'ok'|'warning'|'error'|null, note: string|null }} FormCheckResult
 */

/**
 * Check one application form URL.
 *
 * Never throws. Every failure mode — a bad URL, a timeout, a refused
 * connection, Google having an outage — comes back as a null state with a note
 * saying what happened, because none of those are facts about the form.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options] the
 *        injection points exist for tests/phase9-test.mjs, which cannot reach
 *        Google from a check run and should not try.
 * @returns {Promise<FormCheckResult>}
 */
export async function checkFormUrl(url, options = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Not a fact about the form's health, but it is a fact: nothing will ever
    // load this, so a posting carrying it can never be applied to. This is the
    // one malformed case that is an error rather than an unknown.
    return { state: 'error', note: 'The form address is not a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { state: 'error', note: 'The form address is not https.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await doFetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Google serves a very different page to something that does not look
        // like a browser, and an English one to something that expresses no
        // preference. Asking for English keeps the markers above in the
        // language most of them are written in; the Chinese ones stay because a
        // redirect can still land on a localised page.
        'accept-language': 'en',
        'user-agent': 'careers-gftv form health check (+https://careers.globalfurry.tv)',
      },
    });

    // Where it actually ended up, after any redirect. A forms.gle short link
    // resolves to docs.google.com here, which is deviation 35 working as
    // intended rather than anything to flag.
    const finalHost = hostOf(response.url) ?? parsed.hostname;

    if (SIGN_IN_HOSTS.includes(finalHost)) {
      return {
        state: 'warning',
        note: 'The form is asking for a Google sign in, so applicants outside the organisation cannot open it.',
      };
    }

    if (response.status === 404 || response.status === 410) {
      return { state: 'error', note: 'The form could not be found. It may have been deleted.' };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        state: 'warning',
        note: 'The form refused the request, which usually means it is private.',
      };
    }

    if (response.status >= 500) {
      // Google's problem, and probably a passing one. Nothing is learned about
      // the form.
      return { state: null, note: `The form did not load: ${response.status}.` };
    }

    if (!response.ok) {
      return { state: null, note: `The form answered ${response.status}.` };
    }

    const body = await readCapped(response, MAX_BYTES);

    if (body === null) {
      return { state: null, note: 'The form loaded but could not be read.' };
    }

    const haystack = body.toLowerCase();

    if (CLOSED_MARKERS.some((marker) => haystack.includes(marker))) {
      return { state: 'warning', note: 'The form is no longer accepting responses.' };
    }

    // A live Google Form carries its response payload under this name. Finding
    // it is positive evidence that this is a working form rather than merely
    // "some page loaded", which is what stops an ISP interception page or a
    // parked domain being recorded as a healthy form.
    if (haystack.includes('fb_public_load_data_') || haystack.includes('/forms/d/e/')) {
      return { state: 'ok', note: null };
    }

    if (isGoogleForms(finalHost, response.url ?? parsed.toString())) {
      // On Google, served a 200, no closed marker. Live, most likely, and the
      // markup simply changed shape.
      return { state: 'ok', note: null };
    }

    // Somewhere else entirely, and nothing recognisable. Leaving the state
    // alone is the honest answer: this check knows how to read Google Forms and
    // has just been handed something else.
    return { state: null, note: 'The form loaded but was not recognisable as a Google Form.' };
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError';
    return {
      state: null,
      note: timedOut
        ? `The form did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : 'The form could not be reached.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The hostname of a URL, or null when it will not parse. */
function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** Whether a final address is a Google Forms one. */
function isGoogleForms(host, url) {
  if (host === 'docs.google.com') return String(url).includes('/forms/');
  return host === 'forms.gle';
}

/**
 * Read at most maxBytes of a response body as text.
 *
 * The stream is cancelled once the cap is reached rather than the whole body
 * being buffered and sliced, so a very large page costs the cap and not its own
 * size. Returns null when the body cannot be read at all.
 */
async function readCapped(response, maxBytes) {
  try {
    if (!response.body) {
      const text = await response.text();
      return text.slice(0, maxBytes);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;

    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }

    // Whatever is left is of no interest, and leaving it unread would hold the
    // connection open for the rest of the cron's run.
    await reader.cancel().catch(() => {});

    return Buffer.concat(chunks.map(Buffer.from), Math.min(size, maxBytes)).toString('utf8');
  } catch {
    return null;
  }
}
