// GET /jobs/{uuid}, rewritten here by vercel.json.
//
// The one server rendered page in the portal. Section 4 is explicit about why,
// and the reason is worth restating because it is the thing somebody will
// "simplify" later: unfurlers fetch the URL and read the markup as delivered,
// and none of them run JavaScript. A page that fetched its posting after load
// would unfurl as whatever the static shell said, so every posting on the site
// would embed with identical, generic text. Rendering the tags server side is
// the only way a posting link can carry its own title and description.
//
// What is rendered here and what is not:
//
//   Server   the title, the meta description, the Open Graph and Twitter card
//            tags, the JobPosting JSON-LD, the canonical link, and the posting
//            itself as inline JSON.
//   Client   the visible page, from that JSON, in the reader's language.
//
// The body hydrates rather than being rendered twice. Section 4 permits it
// outright, and the alternative is two renderers for one page: one in Node
// against a dictionary the function cannot read, one in the browser. Two
// renderers drift, and the second one would be maintained only by accident. So
// the crawler gets the head, which is what a crawler reads, the reader gets the
// hydrated page, and a reader with no JavaScript gets the noscript block below,
// which carries the posting's real title and summary rather than an apology.
//
// **The application form URL never appears here.** Not in the JSON, not in the
// JSON-LD, not in the markup. api/_lib/job-detail.js does not even select the
// column. Phase 5 serves it from an authenticated endpoint of its own, which is
// what stops a logged out visitor lifting it and stepping around the gate.
//
// **Embeds are always English.** A crawler has no localStorage, so it has no
// language preference, and section 3a keeps the language out of the URL. The
// per language embed line is stored on the translation row and is ready for a
// ?lang= parameter that does not exist. Phase 7's admin help text has to say
// so, or an admin will write a Chinese embed line and wonder why nobody sees it.

import { siteUrl } from './_lib/env.js';
import { renderDocument, sendHtml, escapeHtml } from './_lib/page-shell.js';
import { getApplicantSession, getStaffSession, hasPortalAccess } from './_lib/session.js';
import { searchParams } from './_lib/jobs.js';
import {
  fetchJobRecord,
  hasHistoryWithJob,
  isVisible,
  isUuid,
  isSlug,
  jobFacts,
  resolveContent,
  embedDescription,
  stripMarkdown,
} from './_lib/job-detail.js';
// The global applications toggle only. Nothing else from the apply flow reaches
// this file, and above all not the form URL: that stays behind
// api/applications/start.js and its session check.
import { applicationsOpen } from './_lib/apply.js';

// Every language the portal offers. The page inlines the posting in each one it
// is ready in, so the globe redraws from memory rather than costing a request.
// Kept in step with LOCALES in api/_lib/validate.js and assets/js/i18n.js.
const LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';

// Published postings are the same for every caller, so the edge may hold one
// briefly. Sixty seconds is short enough that an edit appears within a minute.
const CACHE_PUBLIC = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

// An archived posting renders only for an applicant with history, per 7g, so
// the answer depends on the session cookie and must never be shared. This is
// the one branch where getting the header wrong would show one applicant's
// archived posting to everybody.
const CACHE_PRIVATE = 'private, no-store';

/**
 * Whether the caller may preview a posting that is not otherwise visible.
 *
 * The same two questions requireStaff asks, asked the same way: a real session
 * row, and the portal access rule re-checked on this request. It answers a
 * boolean rather than writing to the response, because a caller who is not
 * staff must fall through to the ordinary 404 rather than be told that a
 * preview mode exists at all.
 *
 * Not gated on is_admin. A job poster writes postings, so previewing one before
 * publishing it is the ordinary case rather than an admin's privilege.
 */
async function isStaffPreviewer(req) {
  try {
    const session = await getStaffSession(req);
    if (!session) return false;
    return await hasPortalAccess(session.user);
  } catch (cause) {
    // Fail closed. A preview that cannot prove who is asking is a 404.
    console.warn('[careers-gftv] preview check:', cause);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.end();
    return;
  }

  const segment = segmentFrom(req);
  const params = searchParams(req);

  try {
    // A uuid is the canonical address. Anything else that looks like a slug is
    // an older link, and section 4 wants exactly one canonical address per
    // posting, so it is a 301 rather than a second page that renders the same
    // thing. Anything that is neither shape never touches the database.
    if (!isUuid(segment)) {
      if (!isSlug(segment)) return notFound(res);

      const record = await fetchJobRecord({ slug: segment });
      if (!record) return notFound(res);

      // The redirect is issued before the visibility check on purpose. It
      // reveals only that a slug maps to a uuid, which the /jobs/{uuid} answer
      // then decides on properly, and doing it the other way round would mean
      // a draft's slug 404ing while its uuid also 404s, which is the same
      // information by a longer route.
      res.setHeader('Location', `/jobs/${record.job.id}`);
      res.setHeader('Cache-Control', CACHE_PUBLIC);
      res.statusCode = 301;
      res.end();
      return;
    }

    const record = await fetchJobRecord({ id: segment });
    if (!record) return notFound(res);

    const { job } = record;

    // A session is read only when the answer could depend on it. A published or
    // closed posting is public, so asking who is calling would cost a database
    // round trip on the hottest page of the site to change nothing, and would
    // make the response uncacheable into the bargain.
    let hasHistory = false;
    if (job.status === 'archived') {
      const session = await getApplicantSession(req);
      hasHistory = await hasHistoryWithJob(job.id, session?.user?.id ?? null);
    }

    // Phase 7's preview, per 8.2's editor. A draft 404s for everybody,
    // deliberately and including the person writing it, which left an admin no
    // way to see what they had written before publishing it to the board.
    //
    // Four things make this safe to add to the one public page on the site:
    //
    //   **It is asked for explicitly.** Without ?preview=1 nothing here runs,
    //   so the ordinary path is byte for byte what it was.
    //   **It is a real staff session with portal access**, checked against the
    //   database on this request. There is no token in the URL to share or
    //   leak, and a signed out caller gets the same 404 as before.
    //   **It never widens what is rendered.** The same record, the same
    //   allowlist, the same body. What changes is only whether the 404 happens.
    //   **The response is never cached**, which is the part that would be a
    //   real leak if it were missed: without it a CDN could hold a draft and
    //   hand it to the next person who asked for that uuid.
    const previewing =
      params.get('preview') === '1' && !isVisible(job, hasHistory)
        ? await isStaffPreviewer(req)
        : false;

    if (!previewing && !isVisible(job, hasHistory)) return notFound(res);

    const facts = jobFacts(record);

    // Every language this posting is ready in, plus the default, which is the
    // base row and always resolves. A language with no ready translation is
    // absent rather than duplicated: the client falls back to the default and
    // knows, from the absence, to show the untranslated notice.
    const content = {};
    for (const locale of LOCALES) {
      const resolved = resolveContent(record, locale);
      if (resolved) content[locale] = resolved;
    }

    const english = content[DEFAULT_LOCALE];
    const title = String(english.title ?? 'Role').trim();
    const description = embedDescription(english, DEFAULT_LOCALE);

    const html = renderDocument({
      title: `${title} | Careers@GFTV`,
      description,
      canonicalPath: `/jobs/${job.id}`,
      ogType: 'article',
      ogTitle: title,
      ogDescription: description,
      // A posting that is no longer open should not be offered to a search
      // engine even once the global block in vercel.json comes off in phase 12.
      // This rule is permanent and only looks redundant while that one is
      // there. An open posting carries nothing, so phase 12 decides for it.
      robots: facts.is_open ? null : 'noindex, follow',
      jsonLd: facts.is_open ? jobPostingLd(facts, english, job.id) : null,
      // applications_open rides along so the Apply button is right at first
      // paint rather than after a request, per 7a's "the Apply button is
      // disabled with an explanatory label ... once the global toggle is off".
      //
      // It is public information, and putting it in a document cached for 60
      // seconds means flipping the toggle takes a few minutes to reach a page
      // somebody is already looking at. That is the right trade: the button is
      // a hint, and the enforcement is in api/applications/start.js, which
      // reads the setting itself on every call and refuses immediately.
      inlineJson: {
        id: 'jobData',
        data: {
          job: facts,
          content,
          applications_open: await applicationsOpen(),
          // The client draws the banner from this rather than the server
          // writing the sentence, because the sentence is a dictionary string
          // and this function has no dictionary, which is the same rule every
          // other endpoint in the build follows.
          preview: previewing,
        },
      },
      modules: ['/assets/js/shell.js', '/assets/js/job-page.js'],
      bodyHtml: bodyFor(english, facts),
    });

    return sendHtml(res, html, {
      headers: {
        // A preview is never cached, by anything. This is the line that would
        // turn the preview into a leak if it were dropped: a shared cache
        // holding a draft would hand it to the next caller who asked for that
        // uuid, with no session and no 404.
        'Cache-Control':
          previewing || facts.is_archived ? CACHE_PRIVATE : CACHE_PUBLIC,
        // An archived posting's visibility depends on the session cookie, and
        // so does a preview, so any shared cache in front of this has to be
        // told that too.
        ...(previewing || facts.is_archived ? { Vary: 'Cookie' } : {}),
        // Belt and braces against an unfurler or a crawler that somehow has a
        // staff cookie. The whole site is noindex until phase 12 anyway, and
        // this one must stay noindex after that.
        ...(previewing ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
      },
    });
  } catch (cause) {
    console.error('[careers-gftv] job page:', cause);
    return serverError(res);
  }
}

/**
 * The posting id from the URL.
 *
 * The rewrite in vercel.json turns `/jobs/:id` into `/api/job-page?id=:id`, and
 * the request's own query string is merged into that. So a reader following
 * `/jobs/{uuid}?id=something-else` arrives with two `id` values, and which one
 * comes first is the platform's business rather than ours.
 *
 * Rather than guess, this refuses to answer when they disagree. A posting URL
 * has no legitimate reason to carry an `id` parameter, so the only request this
 * turns away is somebody trying to make the route read one segment while the
 * address bar shows another.
 */
function segmentFrom(req) {
  const values = [...new Set(searchParams(req).getAll('id').map((v) => String(v).trim()))];
  if (values.length !== 1) return '';
  return values[0];
}

/* -------------------------------------------------------------------------
 * The page body
 * ---------------------------------------------------------------------- */

/**
 * The skeleton the client renders into, plus the no-JavaScript view.
 *
 * The skeleton is the shape of a posting rather than a spinner, per section 3:
 * the shape is known here, so the page does not jump when the content lands.
 */
function bodyFor(content, facts) {
  const summary = stripMarkdown(content.summary ?? '');

  return `    <main class="page job-page" id="main">
        <p class="back-link">
            <a href="/search" id="backToResults">
                <span data-icon="chevron-left" data-icon-size="16"></span>
                <span data-i18n="job.backToResults">Back to results</span>
            </a>
        </p>

        <article class="job-detail" id="jobDetail" aria-busy="true">
            <div class="skeleton skeleton-line title delayed"></div>
            <div class="skeleton skeleton-line long delayed"></div>
            <div class="skeleton skeleton-line long delayed"></div>
            <div class="skeleton skeleton-line short delayed"></div>
        </article>

        <noscript>
            <!-- The real posting, in the language it was written in. A reader
                 with no JavaScript gets the role rather than an apology, and
                 the rest of the page says plainly what they are missing. -->
            <article class="job-detail">
                <h1>${escapeHtml(content.title ?? '')}</h1>
                ${summary ? `<p class="lede">${escapeHtml(summary)}</p>` : ''}
                <div class="callout warn">
                    <p>
                        The full posting, the tag links, and the language switch
                        need JavaScript. Every posting is public in full, so
                        nothing here is behind an account:
                        <a href="/search">browse the other roles</a> or turn
                        JavaScript on to read this one.
                    </p>
                </div>
                ${
                  facts.is_open
                    ? ''
                    : `<p>This role is no longer accepting applications.</p>`
                }
            </article>
        </noscript>
    </main>`;
}

/* -------------------------------------------------------------------------
 * JSON-LD
 * ---------------------------------------------------------------------- */

// schema.org spells employment types this way, and the five keys migration 021
// allows spell them another. Volunteer roles are the ordinary case at GFTV and
// VOLUNTEER is a real schema.org value, so nothing here has to pretend.
const EMPLOYMENT_TYPE = Object.freeze({
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
  volunteer: 'VOLUNTEER',
});

/**
 * The JobPosting structured data, so postings are eligible for Google Jobs.
 *
 * English only, and only for a posting that is open. Section 3a records the
 * consequence and accepts it: search engines only ever see the English version
 * of a page, because the language is not in the URL and there is no second URL
 * to point hreflang at.
 *
 * Nothing here is invented. There is no baseSalary, because a value would be a
 * claim about pay, and every posting on this board is unpaid unless is_paid
 * says otherwise. A posting that is paid still carries no figure, since the
 * schema has nowhere honest to put "the amount is agreed with the contractor".
 */
function jobPostingLd(facts, content, id) {
  const site = siteUrl();

  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: content.title ?? '',
    // Google reads this field and accepts HTML. Plain text is what we have and
    // is always valid, so the small markdown subset is stripped rather than
    // converted: a stray asterisk in a search result is worse than a lost bold.
    description: stripMarkdown(
      [content.summary, content.description, content.responsibilities, content.requirements]
        .filter(Boolean)
        .join('\n\n')
    ),
    identifier: {
      '@type': 'PropertyValue',
      name: 'Careers@GFTV',
      value: id,
    },
    datePosted: facts.published_at,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Global Furry Television',
      sameAs: 'https://globalfurry.tv',
      logo: `${site}/HLC-512.png`,
    },
    url: `${site}/jobs/${id}`,
    // Applications are handled in Google Forms, off this site, so directApply
    // would be a lie and Google treats it as one worth penalising.
    directApply: false,
  };

  // Null means open until filled, per migration 005, and validThrough is
  // omitted rather than given a far future date. A date invented to fill a
  // field is a date that expires the posting for no reason.
  if (facts.closes_at) ld.validThrough = facts.closes_at;

  const employmentType = EMPLOYMENT_TYPE[facts.commitment_type ?? ''];
  if (employmentType) ld.employmentType = employmentType;

  if (facts.is_remote) {
    ld.jobLocationType = 'TELECOMMUTE';
    // Google requires this alongside TELECOMMUTE, and without it a remote
    // posting is rejected rather than treated as open to everybody.
    ld.applicantLocationRequirements = { '@type': 'Country', name: 'SG' };
  }

  if (content.location) {
    ld.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: content.location,
        addressCountry: 'SG',
      },
    };
  }

  if (content.department?.name) ld.occupationalCategory = content.department.name;
  if (facts.openings > 1) ld.totalJobOpenings = facts.openings;

  return ld;
}

/* -------------------------------------------------------------------------
 * The two failure pages
 * ---------------------------------------------------------------------- */

// The markup mirrors 404.html, because a reader who reaches a missing posting
// and a reader who mistypes an address should land on the same page. It is
// duplicated rather than read off disk: a serverless function has no reliable
// access to a sibling static file, and the alternative is a redirect, which
// would turn a 404 into a 200 somewhere else and lose the status code that
// matters. Keep the two in step.
function notFoundBody() {
  return `    <main class="page" id="main">
        <div class="glass-card placeholder">
            <p class="eyebrow">
                <span data-icon="info" data-icon-size="16"></span>
                <span data-i18n="notFound.eyebrow">404</span>
            </p>

            <h1 data-i18n="notFound.heading">That page does not exist</h1>

            <p class="sentence" data-i18n="notFound.body">
                The address you followed does not match anything on
                Careers@GFTV. This is different from a part of the site that has
                not been built yet, which says so plainly instead.
            </p>

            <p class="covers" data-i18n="notFound.removed">
                If you followed a link to a role, the posting may have been
                removed. Postings that have merely closed stay readable, so a
                closed role is not what caused this.
            </p>

            <div class="actions">
                <a class="btn btn-primary" href="/search"
                   data-i18n="common.browseRoles">Browse roles</a>
                <a class="btn btn-secondary" href="/status"
                   data-i18n="common.buildStatus">Build status</a>
                <a class="btn btn-quiet" href="/"
                   data-i18n="common.backHome">Back to the home page</a>
            </div>
        </div>
    </main>`;
}

function notFound(res) {
  const html = renderDocument({
    title: 'Page not found | Careers@GFTV',
    description: 'That posting does not exist on Careers@GFTV.',
    canonicalPath: '/search',
    robots: 'noindex, follow',
    modules: ['/assets/js/shell.js'],
    bodyHtml: notFoundBody(),
  });

  // Never cached. A draft published a minute from now would otherwise 404 at
  // the edge for as long as the entry survived.
  return sendHtml(res, html, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function serverError(res) {
  const html = renderDocument({
    title: 'Something went wrong | Careers@GFTV',
    description: 'This posting could not be loaded.',
    canonicalPath: '/search',
    robots: 'noindex, follow',
    modules: ['/assets/js/shell.js'],
    bodyHtml: `    <main class="page" id="main">
        <div class="glass-card placeholder">
            <p class="eyebrow">
                <span data-icon="info" data-icon-size="16"></span>
                <span data-i18n="error.eyebrow">Error</span>
            </p>
            <h1 data-i18n="error.pageHeading">This posting could not be loaded</h1>
            <p class="sentence" data-i18n="error.pageBody">
                Something went wrong at our end rather than with the address you
                followed. Try again in a moment, or browse the other roles.
            </p>
            <div class="actions">
                <a class="btn btn-primary" href="/search"
                   data-i18n="common.browseRoles">Browse roles</a>
                <a class="btn btn-quiet" href="/"
                   data-i18n="common.backHome">Back to the home page</a>
            </div>
        </div>
    </main>`,
  });

  return sendHtml(res, html, {
    status: 500,
    headers: { 'Cache-Control': 'no-store' },
  });
}
