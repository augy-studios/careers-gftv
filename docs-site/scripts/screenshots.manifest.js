// THIS SITE'S OWN FILE. Not generated.
//
// 16g's manifest: every screenshot the documentation points at, as data.
//
//   "Drive it from a manifest file listing every shot: the page path, the
//    viewport, the theme and mode, the element to wait for before capturing,
//    whether to capture full page or a single selector, and any region to mask."
//
// **The list is written down here and checked against the pages, in both
// directions.** That is the one place this file departs from `pages.js`'s rule
// that a list somebody wrote is a list with something missing from it. A
// screenshot has no filesystem to be derived from before it is taken, so the
// manifest is the source and `scripts/build.js` is what stops it drifting: a
// `pending:` marker naming a shot that is not here fails the build, and an entry
// here that no page points at fails it too. Neither can be added alone.
//
// **What a name means, and it is not decoration.** 16g asks for "predictable
// names built from the manifest entry", and this build reads them:
//
//   portal-*   public. The applicant's half of the portal, and the only shots a
//              signed out reader may see. They land in `public/screenshots/` and
//              are written into a page as `/screenshots/<name>.webp`.
//   poster-*   gated at the poster tier. They land in `api/_content/poster/`
//              beside the pages that point at them, and are written as a bare
//              file name so they go through the same session check the page did.
//   admin-*    the same, at the admin tier, in `api/_content/admin/`.
//
// So the prefix and the directory say the same thing twice, and the build
// compares them. 16g asks for exactly that check: "a shot for a gated page that
// lands in the public directory is a build failure rather than a review
// comment."
//
// **Every shot is of the portal, and none is of this site.** The capture script
// lives here because the pictures are for these pages and the tiers are this
// site's idea; what it photographs is `main-site/` with seeded data in it.
//
// **25 entries, and they are the 25 slots the six guides already carry.**
// Settled 4 September 2026: the manifest is the list of names the pages
// reference, and not 16g's full desktop-and-phone, light-and-dark matrix. A shot
// nobody points at is a file nobody reviews. A page that wants a phone or a dark
// one writes the slot and adds the entry, and the two arrive together because
// neither passes the build without the other.

/**
 * The two viewports, named so a manifest entry carries a word and not a pair of
 * numbers. `scale` is the device pixel ratio, which is what makes small text in
 * a screenshot readable inside an article.
 *
 * The phone is 390 CSS pixels at 3x and not a 1170 pixel viewport. Those are
 * different pictures — the first is what a phone shows, the second is a desktop
 * layout shrunk into a tall window — and `gen-screenshots.js` learned that once
 * already for the install shots.
 */
export const VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900, scale: 2 },
  phone: { width: 390, height: 844, scale: 3 },
});

/**
 * The accounts a shot may be taken as.
 *
 * `null` is signed out, which is a state and not an absence: the sign in page
 * has to be photographed by somebody who is not signed in.
 *
 * `applicant` is one of `seed.mjs`'s invented people, and `staff` is a real
 * gftv.asia account, because 5g's one exception means this build only ever reads
 * that realm and cannot invent an account in it. That is the sentence `seed.mjs`
 * opens with, and it is why the capture run needs a person at a keyboard.
 */
export const ACTORS = Object.freeze(['applicant', 'staff']);

/**
 * The tier a shot is captured at, which decides where the file lands and who may
 * fetch it. Mirrors `api/_lib/tiers.js`, and the build checks the two agree.
 */
export const TIERS = Object.freeze(['public', 'poster', 'admin']);

/**
 * Selectors masked in every shot, because they change between runs everywhere
 * they appear and none of them is the subject of any picture.
 *
 * **Dates are not on this list, and that is deliberate.** 16g offers "freeze or
 * mask relative dates", and the capture script freezes the clock instead: a
 * masked date leaves a black bar where a reader is being told what a column
 * means, and a frozen one leaves the real column with the same value every run.
 * What is left here is the two things no clock can settle.
 */
export const ALWAYS_MASKED = Object.freeze([
  // A posting's uuid, shown in the editor for the Apps Script step. It is a
  // different string on every seed, and 13's checklist is about where to find it
  // rather than what it says.
  '#jobIdForScript',
  // An uploaded avatar is a real person's picture even on a seeded account,
  // because the file came from whoever uploaded it. The initials fallback is
  // fine and is what a seeded account draws; this covers the other case.
  'img.avatar-image',
  // Whoever ran the capture, in the dashboard's top right. A staff account is
  // gftv.asia's and cannot be seeded, per 5g, so this is a real volunteer's name
  // on all seventeen staff shots. It is a fact about the run and not about the
  // interface, and it would date every picture to whoever took it.
  '.admin-whoami-name',
]);

/**
 * Every shot, in the order a reader meets it.
 *
 * The keys, and every one of them is 16g's:
 *
 *   name      the file, without an extension, and the `pending:` marker the
 *             pages carry until the capture run swaps it.
 *   tier      public, poster or admin. Decides the directory and the check.
 *   sections  the gated section directories the file is written into. Absent on
 *             a public shot, which has one home.
 *   path      where the portal is asked to go first.
 *   as        the account, or null for signed out.
 *   viewport  a key of VIEWPORTS.
 *   theme     light or dark.
 *   waitFor   a selector that has to be on the page before anything is captured.
 *   gone      a selector that has to have left it. The admin and account shells
 *             remove their loading row rather than hiding it, so waiting for the
 *             list alone would photograph a skeleton beside it.
 *   act       a routine in capture.mjs that drives the page into the state, or
 *             null. Named and never written here: a manifest holding code is a
 *             manifest nobody can check.
 *   clip      a single selector to capture, or null for the viewport.
 *   full      true for the whole scrollable page.
 *   mask      selectors blacked out, on top of ALWAYS_MASKED.
 */
export const SHOTS = Object.freeze([
  /* --- The portal guide, public --------------------------------------- */

  {
    name: 'portal-login-desktop-light',
    tier: 'public',
    path: '/login',
    as: null,
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#loginForm',
    gone: null,
    act: null,
    // **Not clipped, and the dry run of 5 September 2026 is why it says so.**
    // The sign in form is a centred column about 420px wide, so a 1440 frame
    // around it is two thirds empty space and the form lands small inside an
    // article. `clip: '#main'` was tried and is worse: an element screenshot
    // captures the element's own box, and the sticky header draws over the top
    // of it — the "Sign in" heading came out sliced in half.
    //
    // The real question is whether `desktop` should be narrower for the
    // applicant pages, which are centred, while the dashboard's tables want the
    // width. That is one decision to take with all six portal shots in front of
    // you, and not six guesses from one page. It waits for the capture run.
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'portal-search-desktop-light',
    tier: 'public',
    path: '/search',
    as: null,
    viewport: 'desktop',
    theme: 'light',
    // Not "a .job-card exists": the loading state draws four skeleton cards
    // carrying that same class. The board drops aria-busy when the real results
    // land, which `gen-screenshots.js` found the hard way and wrote down.
    waitFor: '#results:not([aria-busy]) .job-card',
    gone: null,
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'portal-apply-dialog-desktop-light',
    tier: 'public',
    // The board and not a posting address. A seeded posting's uuid is different
    // on every run, so the routine opens the first card it finds instead of the
    // manifest naming a row that will not exist next time.
    path: '/search',
    as: 'applicant',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#applyDialogTitle',
    gone: null,
    act: 'openApplyDialog',
    clip: 'dialog[open]',
    full: false,
    mask: [],
  },
  {
    name: 'portal-applications-desktop-light',
    tier: 'public',
    path: '/account/applications',
    as: 'applicant',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#applicationList',
    gone: '#accountLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'portal-tasks-desktop-light',
    tier: 'public',
    path: '/account/tasks',
    as: 'applicant',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#taskList',
    gone: '#accountLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'portal-recovery-codes-desktop-light',
    tier: 'public',
    // **Nothing is registered to take this picture.** 16g forbids capturing a
    // live recovery code and asks for a seeded fake with a caption saying so,
    // and the page's caption already says the codes are invented. The routine
    // raises the real dialog with ten invented codes, so the picture is the
    // module's own markup and the run writes no account and no code anywhere.
    path: '/register',
    as: null,
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#codeDialogTitle',
    gone: null,
    act: 'showExampleCodes',
    clip: 'dialog[open]',
    full: false,
    mask: [],
  },

  /* --- The job poster guide, poster tier ------------------------------- */

  {
    name: 'poster-overview-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#adminBuckets',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-jobs-list-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/jobs',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#jobList tr',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-editor-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/jobs',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#editorShared',
    gone: '#adminLoading',
    act: 'openFirstPosting',
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-editor-tabs-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/jobs',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#editorTabBody',
    gone: '#adminLoading',
    act: 'openTranslationTab',
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-form-fields-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/jobs',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#jobForm',
    gone: '#adminLoading',
    // The three fields are consecutive `.field` blocks with no wrapper between
    // them, so there is no single selector to clip to and the shot is the
    // viewport scrolled to the first of them.
    act: 'scrollToFormFields',
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-applications-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/applications',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#applicationList tr',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-application-detail-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/applications',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: 'dialog[open]',
    gone: '#adminLoading',
    act: 'openFirstApplication',
    clip: 'dialog[open]',
    full: false,
    mask: [],
  },
  {
    name: 'poster-analytics-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/analytics',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#analyticsList tr',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-invites-desktop-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin/invites',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#shortlistList',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'poster-dashboard-phone-light',
    tier: 'poster',
    sections: ['poster'],
    path: '/admin',
    as: 'staff',
    // The one phone shot in the set, and the page it illustrates is about
    // reading applications at a convention. The sections drawer is what a
    // narrow screen puts the sidebar behind, so the routine opens it.
    viewport: 'phone',
    theme: 'light',
    waitFor: '#adminNav',
    gone: '#adminLoading',
    act: 'openSectionsDrawer',
    clip: null,
    full: false,
    mask: [],
  },

  /* --- The admin guide, admin tier ------------------------------------- */

  {
    name: 'admin-overview-desktop-light',
    tier: 'admin',
    // **Two directories, one capture.** An asset is gated at its section's own
    // level, per `pages.js`, so a file in `admin/` is not reachable from a
    // developer page even though the tiers are cumulative and the same accounts
    // read both. The developer guide's Playwright page points at this shot as
    // its worked example, so the file is written into both sections rather than
    // the same picture being captured twice under two names.
    sections: ['admin', 'developer'],
    path: '/admin',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#adminBuckets',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'admin-settings-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/settings',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#settingsForm',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    mask: [],
  },
  {
    name: 'admin-staff-access-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/admins',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#staffList tr',
    gone: '#adminLoading',
    act: null,
    clip: null,
    full: false,
    // **The one page in the set that lists real people.** Staff accounts are
    // gftv.asia's and cannot be seeded, per 5g, so this table is the live list
    // whatever the seed holds. The names and addresses go, and what the picture
    // is for — the three states and the second factor columns — stays.
    mask: ['#staffList .admin-row-title'],
  },
  {
    name: 'admin-access-row-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/admins',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#staffList tr',
    gone: '#adminLoading',
    act: 'openFirstStaffRow',
    clip: 'dialog[open]',
    full: false,
    mask: ['.admin-row-title'],
  },
  {
    name: 'admin-applicant-account-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/applicants',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: 'dialog[open]',
    gone: '#adminLoading',
    act: 'openFirstApplicant',
    clip: 'dialog[open]',
    full: false,
    mask: [],
  },
  {
    name: 'admin-unmatched-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/analytics',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#unmatchedSection',
    gone: '#adminLoading',
    act: 'scrollToUnmatched',
    clip: '#unmatchedSection',
    full: false,
    mask: [],
  },
  {
    name: 'admin-translations-queue-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/translations',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#queuePanel',
    gone: '#adminLoading',
    act: null,
    clip: '#queuePanel',
    full: false,
    mask: [],
  },
  {
    name: 'admin-needs-translation-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    path: '/admin/translations',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '#auditList',
    gone: '#adminLoading',
    act: 'openAuditPanel',
    clip: '#auditPanel',
    full: false,
    mask: [],
  },
  {
    name: 'admin-suggestions-desktop-light',
    tier: 'admin',
    sections: ['admin'],
    // The suggestion layer is a portal page with the layer switched on, and not
    // a dashboard screen. 7i puts the control on the posting itself.
    path: '/search',
    as: 'staff',
    viewport: 'desktop',
    theme: 'light',
    waitFor: '.annotate-underline',
    gone: null,
    act: 'openFirstPostingWithSuggestions',
    clip: null,
    full: false,
    mask: [],
  },
]);

/** Every shot by name, for the build's two way check. */
export const SHOTS_BY_NAME = new Map(SHOTS.map((shot) => [shot.name, shot]));

/**
 * Where a shot's file goes, relative to the docs site's root, as one or more
 * paths. A public shot has one; a gated one has a file per section it is
 * written into.
 *
 * **The only place the directory is decided.** `capture.mjs` writes what this
 * returns and `build.js` checks what this returns, so a shot cannot be captured
 * into one place and looked for in another.
 *
 * @param {{ name: string, tier: string, sections?: string[] }} shot
 * @returns {string[]}
 */
export function filesFor(shot) {
  if (shot.tier === 'public') return [`public/screenshots/${shot.name}.webp`];
  return (shot.sections ?? []).map((section) => `api/_content/${section}/${shot.name}.webp`);
}

/**
 * How a page writes the shot into its markdown, once the capture run has swapped
 * the `pending:` marker.
 *
 * A public page carries an absolute path into `public/`, and a gated page
 * carries a bare file name that resolves beside it and streams through the
 * authenticated route. `scripts/build.js` refuses each of those written the
 * other way round, so this is the one function that has to get it right.
 *
 * @param {{ name: string, tier: string }} shot
 * @returns {string}
 */
export function markdownSrc(shot) {
  return shot.tier === 'public' ? `/screenshots/${shot.name}.webp` : `${shot.name}.webp`;
}
