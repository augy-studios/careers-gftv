// The seed script, per section 17: "a few sample departments and job postings
// for local testing", and per 16g the accounts phase 14's screenshot capture
// signs in as.
//
//   node seed.mjs                 say what it would write, and write nothing
//   node seed.mjs --yes           write it
//   node seed.mjs --clear --yes   remove it, and the phase 3 dev seed with it
//
// **Node rather than SQL, and the reason is bcrypt.** Every other piece of data
// in this build arrives through a numbered file pasted into the Supabase
// editor, and the postings below could have. An account could not: a password
// is stored as a bcrypt hash produced by `api/_lib/password.js`, and Postgres
// cannot make one that this build's own sign in will accept. 16g asks for
// screenshots taken while signed in as invented people, so the script that
// invents them has to be able to hash a password the way the site does.
// Everything else follows from that one constraint, and the script imports the
// site's own client and its own hashing rather than reimplementing either.
//
// ---------------------------------------------------------------------------
// There is one database, and this writes to it
// ---------------------------------------------------------------------------
//
// `main-site/.env.example` says to use the existing GFTV Supabase project
// rather than a new one, so "local testing" and "the live site" are the same
// rows. That is the fact everything below is shaped around:
//
//   **Every posting says SAMPLE POSTING in both languages**, the same rule the
//   phase 3 dev seed set for itself. Without it, posting 2 is a paid broadcast
//   engineering contract on GFTV's real careers domain that anybody can find
//   and nobody can apply to, which is a more convincing lie than any of this is
//   worth.
//
//   **It refuses to write while the site may be indexed.** `INDEXING` in
//   `api/_lib/discovery.js` is the switch phase 12 part 8 turned on, and a
//   sample posting on a crawlable board is the exact thing `robots.txt` spent
//   eleven phases preventing. `--anyway` is there for somebody who has read
//   that sentence and means it.
//
//   **Nothing here writes to a `gftvhello_` table.** Staff accounts are that
//   realm's and this build only ever reads them, per 5g's one exception, which
//   is not this. A capture run signs in as a real staff account.
//
//   **Nothing here creates reference data.** The departments and tags come from
//   migration `013` and are referenced by slug, so clearing this seed leaves
//   the database exactly as `013` left it.
//
// ---------------------------------------------------------------------------
// What --clear removes
// ---------------------------------------------------------------------------
//
// This seed's own rows, by fixed uuid, **and the nine the phase 3 dev seed
// wrote**, by theirs. Two seeds and one board: section 5 item 6 of the working
// memo says the dev seed goes before this is a real site, and the person doing
// that should not have to find a commented out block at the bottom of an
// unnumbered SQL file to do it. `migrations/dev-seed-jobs.sql` keeps its own
// delete block; this is the same list in the place somebody will look.
//
// The accounts go too. Everything hanging off a posting or an applicant
// cascades — tags, translations, applications, saved rows, ratings — so the
// deletes below are the two tables that own the rest.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, 'main-site');

const CLEAR = process.argv.includes('--clear');
const YES = process.argv.includes('--yes');
const ANYWAY = process.argv.includes('--anyway');

/* -------------------------------------------------------------------------
 * The environment, from .env.local when it is there
 *
 * The two variables are the ones every function in api/ needs, and the file
 * they live in locally is main-site/.env.local. Read here rather than required
 * from the shell, because a person who has just set up the project has already
 * written them down once and being asked for them again is how a service key
 * ends up in a shell history.
 * ---------------------------------------------------------------------- */

function loadEnvFile() {
  const file = join(SITE, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name, raw] = match;
    if (process.env[name]) continue;
    process.env[name] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[name]) {
    console.error(
      `Set ${name}. It goes in main-site/.env.local, and main-site/.env.example ` +
        `says where to get the value.`
    );
    process.exit(1);
  }
}

// After the environment, because api/_lib/supabase.js reads it at import time
// and answers with a message naming the variable rather than a stack trace.
const { supabase, T } = await import('./main-site/api/_lib/supabase.js');
const { hashSecret } = await import('./main-site/api/_lib/password.js');
const { INDEXING } = await import('./main-site/api/_lib/discovery.js');

/* -------------------------------------------------------------------------
 * The postings
 *
 * Fixed uuids, for the two reasons the dev seed gives: re-running updates the
 * same rows rather than making more of them, and the delete is exact rather
 * than matching on a title somebody may have edited.
 *
 * Spread so each surface has something to show — one posted today and one this
 * week for the chips, one closing inside a fortnight, several with no closing
 * date at all, one paid, a remote mix, all five commitment types from migration
 * 021, and one draft that must never appear anywhere public.
 * ---------------------------------------------------------------------- */

const SAMPLE = 'SAMPLE POSTING, NOT A REAL OPENING. Seeded by seed.mjs for local testing.';
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdSEEDsample/viewform';

const id = (n) => `b0000000-0000-4000-8000-00000000000${n}`;

const HOURS = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();
const DAYS = (n) => new Date(Date.now() - n * 86400 * 1000).toISOString();
const IN_DAYS = (n) => new Date(Date.now() + n * 86400 * 1000).toISOString();

const POSTINGS = [
  {
    id: id(1),
    slug: 'sample-video-editor',
    title: '[SAMPLE] Video Editor, Weekly Highlights',
    department: 'post-production',
    summary: `${SAMPLE} Cut the weekly highlights reel from our live broadcasts. Around four hours a week, entirely from home.`,
    description: `${SAMPLE}\n\nEvery week GFTV goes live several times and almost nobody watches all of it. The highlights reel is how most of the audience sees what happened.\n\nThis is a voluntary role. Nobody here is paid.`,
    responsibilities: 'Watch back the week and pull the moments worth keeping.\nAssemble a six to eight minute reel to the channel template.',
    requirements: 'Comfortable in any non linear editor.\nAbout four hours a week, reliably.',
    nice_to_have: 'Motion graphics, if you have them.',
    commitment_type: 'part_time',
    location: 'Remote',
    is_remote: true,
    is_paid: false,
    openings: 1,
    status: 'published',
    published_at: HOURS(2),
    closes_at: IN_DAYS(9),
    tags: ['video-editing', 'motion-graphics', 'remote-friendly'],
  },
  {
    id: id(2),
    slug: 'sample-broadcast-engineer',
    title: '[SAMPLE] Broadcast Engineer, Playout Rebuild',
    department: 'broadcast-engineering',
    summary: `${SAMPLE} A fixed scope contract to rebuild the playout chain. This one is paid, which is not true of anything else on this board.`,
    description: `${SAMPLE}\n\nA defined piece of work with a defined end, and it is paid. Everything else listed here is voluntary, and this posting says so rather than leaving somebody to find out later.`,
    responsibilities: 'Audit the current encoder and playout configuration.\nBuild a replacement that survives a stream dropping.',
    requirements: 'Real experience with streaming infrastructure.\nAble to work to a written scope.',
    nice_to_have: 'Experience with redundant ingest.',
    commitment_type: 'contract',
    location: 'Singapore',
    is_remote: false,
    is_paid: true,
    openings: 1,
    status: 'published',
    published_at: DAYS(3),
    closes_at: IN_DAYS(30),
    tags: ['live-streaming', 'obs'],
  },
  {
    id: id(3),
    slug: 'sample-camera-operator',
    title: '[SAMPLE] Camera Operator, Studio',
    department: 'production',
    summary: `${SAMPLE} Operate a camera during studio recordings. Training given, so no prior experience is needed.`,
    description: `${SAMPLE}\n\nWe record in studio most weekends and always need another pair of hands behind a camera. If you have never done it before, somebody will show you.\n\nThis is a voluntary, unpaid role.`,
    responsibilities: 'Set up and operate a camera during studio sessions.\nHelp strike the set afterwards.',
    requirements: 'Able to get to the studio on a weekend.\nWilling to be shown how.',
    nice_to_have: 'Any camera experience at all.',
    commitment_type: 'volunteer',
    location: 'Singapore',
    is_remote: false,
    is_paid: false,
    openings: 3,
    status: 'published',
    published_at: DAYS(11),
    closes_at: null,
    tags: ['camera', 'lighting', 'beginner-welcome'],
  },
  {
    id: id(4),
    slug: 'sample-production-coordinator',
    title: '[SAMPLE] Production Coordinator',
    department: 'operations',
    summary: `${SAMPLE} Keep shoots, people and schedules pointing the same way. Full time hours, and still an unpaid volunteer role.`,
    description: `${SAMPLE}\n\nThe person who knows what is happening on Saturday and who is meant to be there. It is listed as full time because that is honestly how much time it takes, not because it comes with a salary.`,
    responsibilities: 'Hold the shooting schedule and keep it current.\nConfirm crew before each shoot.',
    requirements: 'Organised in a way other people can rely on.\nAvailable on weekends.',
    nice_to_have: 'Previous coordination work of any kind.',
    commitment_type: 'full_time',
    location: 'Singapore',
    is_remote: false,
    is_paid: false,
    openings: 1,
    status: 'published',
    published_at: DAYS(20),
    closes_at: null,
    tags: ['project-management'],
  },
  {
    id: id(5),
    slug: 'sample-social-media-assistant',
    title: '[SAMPLE] Social Media Assistant',
    department: 'community',
    summary: `${SAMPLE} Help run the channel's social accounts. Beginner welcome, remote, a few hours a week.`,
    description: `${SAMPLE}\n\nPosting, scheduling and replying to people. Most of it can be done from a phone.\n\nThis is a voluntary, unpaid role.`,
    responsibilities: 'Schedule posts across the channels.\nFlag anything that needs moderation.',
    requirements: 'Reads and writes English comfortably.\nAround three hours a week.',
    nice_to_have: 'Chinese as well as English.',
    commitment_type: 'internship',
    location: 'Remote',
    is_remote: true,
    is_paid: false,
    openings: 2,
    status: 'published',
    published_at: DAYS(5),
    closes_at: IN_DAYS(45),
    tags: ['social-media', 'moderation', 'beginner-welcome', 'remote-friendly'],
  },
  {
    id: id(6),
    slug: 'sample-convention-crew',
    title: '[SAMPLE] Convention Camera Crew',
    department: 'events',
    summary: `${SAMPLE} Film panels and the show floor at this year's convention. One weekend, applications close shortly.`,
    description: `${SAMPLE}\n\nOne weekend, long days, and a short application window because the convention is not far away.\n\nThis is a voluntary, unpaid role. Passes are covered.`,
    responsibilities: 'Film panels, interviews and the show floor.\nHand cards to the post team each evening.',
    requirements: 'Available for the whole weekend.\nAble to carry your own kit all day.',
    nice_to_have: 'Your own camera.',
    commitment_type: 'volunteer',
    location: 'Singapore',
    is_remote: false,
    is_paid: false,
    openings: 4,
    status: 'published',
    published_at: DAYS(6),
    closes_at: IN_DAYS(5),
    tags: ['camera', 'audio', 'event-based', 'fursuiting'],
  },
  {
    id: id(7),
    slug: 'sample-thumbnail-designer',
    title: '[SAMPLE] Thumbnail Designer',
    department: 'creative-and-design',
    summary: `${SAMPLE} Design thumbnails for uploads. A couple of hours a week, entirely remote.`,
    description: `${SAMPLE}\n\nThumbnails are the first thing anybody sees. This role owns them.\n\nThis is a voluntary, unpaid role.`,
    responsibilities: 'Design a thumbnail for each upload, to the channel template.',
    requirements: 'Any competent design tool.\nAbout two hours a week.',
    nice_to_have: 'An eye for what gets clicked without lying about the content.',
    commitment_type: 'part_time',
    location: 'Remote',
    is_remote: true,
    is_paid: false,
    openings: 1,
    status: 'published',
    published_at: DAYS(31),
    closes_at: null,
    tags: ['graphic-design', 'remote-friendly'],
  },
  {
    // A draft. It must never appear on the board, in suggestions, in the facet
    // counts or in the sitemap, and it is here so that is something somebody
    // checked rather than something somebody assumed.
    id: id(8),
    slug: 'sample-draft-never-visible',
    title: '[SAMPLE] Draft posting, should never be visible',
    department: 'programming',
    summary: 'If you can see this on the public site, the status filter is not being applied.',
    description: 'Seeded by seed.mjs so that "a draft is invisible" is a thing somebody checked.',
    responsibilities: null,
    requirements: null,
    nice_to_have: null,
    commitment_type: 'volunteer',
    location: 'Singapore',
    is_remote: false,
    is_paid: false,
    openings: 1,
    status: 'draft',
    published_at: null,
    closes_at: null,
    tags: [],
  },
];

/** One ready Chinese translation, and exactly one.
 *
 *  Every other posting then has no ready translation, which is what puts the
 *  English only badge and the untranslated notice on screen where they can be
 *  seen. A board where everything is translated proves half of 3a.
 *
 *  3a again: a translation marked ready carries a title, a summary and a
 *  description. A translated heading over an untranslated body is worse than
 *  plainly untranslated, so this one is complete.
 *
 *  Singapore Mandarin, per the same section: 义工 rather than 志愿者, and the
 *  sample marker is in Chinese too. A row marked only in English reads as a
 *  genuine posting to precisely the readers the translation exists for.
 */
const TRANSLATION = {
  job_id: id(1),
  locale: 'zh',
  title: '[样本] 视频剪辑师，每周精华',
  summary:
    '样本职位，并非真实招募。这是 seed.mjs 写入的测试数据。将我们的直播内容剪辑成每周精华短片。每周约四小时，完全在家完成。',
  description:
    '样本职位，并非真实招募。这是 seed.mjs 写入的测试数据。\n\n' +
    '国际兽视每周都会开好几场直播，但几乎没有人会全部看完。每周精华短片就是大部分观众了解我们内容的方式。\n\n' +
    '这是一个义工职位。我们是一个由义工营运的频道，这里没有人拿薪水。',
  responsibilities: '看完当周的直播录像，挑出值得保留的片段。\n剪出六到八分钟的短片。',
  requirements: '会使用任何一款非线性剪辑软件。\n每周稳定投入约四小时。',
  nice_to_have: '如果您会动态图像设计，那更好。',
  location: '远程',
  is_ready: true,
};

/* -------------------------------------------------------------------------
 * The accounts
 *
 * Two, and the second one is not a spare. 16g's screenshots have to show the
 * Chinese pages as well as the English ones, and the language a page renders in
 * comes from the reader's own browser rather than from the URL — so the only
 * way to capture the 华文 dashboard of somebody who has applied to something is
 * to have an account whose stored locale says so.
 *
 * `@example.invalid` is a reserved TLD that can never resolve, so nothing
 * addressed to either of these can leave the building. Phase 9's unmatched
 * submissions use the same domain for the same reason.
 * ---------------------------------------------------------------------- */

const ACCOUNTS = [
  {
    username: 'sample-applicant',
    display_name: 'Sample Applicant',
    email: 'sample-applicant@example.invalid',
    locale: 'en',
    // What makes the account worth capturing: a dashboard with rows on it.
    // A freshly registered account measures the chrome, which is the finding
    // tests/create-applicant.mjs was written around.
    saves: [id(3), id(5), id(7)],
    application: { job: id(1), status: 'submitted' },
    rating: { job: id(1), rating: 4 },
    prompt: id(6),
  },
  {
    username: 'sample-yiwen',
    display_name: 'Sample Reader',
    email: 'sample-yiwen@example.invalid',
    locale: 'zh',
    saves: [id(1)],
    application: null,
    rating: null,
    prompt: null,
  },
];

/** The phase 3 dev seed, which --clear takes with it. */
const DEV_SEED = Array.from({ length: 9 }, (_, index) => `a0000000-0000-4000-8000-00000000000${index + 1}`);

/* -------------------------------------------------------------------------
 * Doing it
 * ---------------------------------------------------------------------- */

/** Fail loudly. A half written seed is worse than none, since the next run
 *  upserts over whatever landed and nothing says which half is missing. */
function stop(step, error) {
  console.error(`\n${step} failed: ${error.message ?? error}`);
  process.exit(1);
}

async function slugIds(table, slugs) {
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase.from(table).select('id, slug').in('slug', slugs);
  if (error) stop(`reading ${table}`, error);
  return new Map((data ?? []).map((row) => [row.slug, row.id]));
}

async function seed() {
  const departments = await slugIds(T.departments, [...new Set(POSTINGS.map((p) => p.department))]);
  const missingDepartments = POSTINGS.filter((p) => !departments.has(p.department));
  if (missingDepartments.length > 0) {
    stop(
      'matching departments',
      new Error(
        `no department with slug ${missingDepartments.map((p) => p.department).join(', ')}. ` +
          `Run migration 013 first: this script seeds postings and accounts, never reference data.`
      )
    );
  }

  const rows = POSTINGS.map((posting) => ({
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    department_id: departments.get(posting.department),
    summary: posting.summary,
    description: posting.description,
    responsibilities: posting.responsibilities,
    requirements: posting.requirements,
    nice_to_have: posting.nice_to_have,
    commitment_type: posting.commitment_type,
    location: posting.location,
    is_remote: posting.is_remote,
    is_paid: posting.is_paid,
    openings: posting.openings,
    status: posting.status,
    // gftvjobs_jobs_published_needs_form forbids publishing without one, so a
    // draft is the only row that may carry null here. The address is a Google
    // Form that does not exist, which is correct for seeded data and is also
    // why phase 9's form health check flags every one of these.
    application_form_url: posting.status === 'published' ? FORM : null,
    published_at: posting.published_at,
    closes_at: posting.closes_at,
  }));

  const { error: jobsError } = await supabase.from(T.jobs).upsert(rows, { onConflict: 'id' });
  if (jobsError) stop('writing the postings', jobsError);
  console.log(`  postings          ${rows.length} written`);

  // Deleted and reinserted rather than upserted, so a run after changing which
  // tags a posting carries does not leave the old ones behind. The usage_count
  // triggers from 009 maintain the counts, so nothing here writes them.
  const { error: untagError } = await supabase.from(T.jobTags).delete().in('job_id', POSTINGS.map((p) => p.id));
  if (untagError) stop('clearing the tags', untagError);

  const tags = await slugIds(T.tags, [...new Set(POSTINGS.flatMap((p) => p.tags))]);
  const tagRows = POSTINGS.flatMap((posting) =>
    posting.tags
      .filter((slug) => tags.has(slug))
      .map((slug) => ({ job_id: posting.id, tag_id: tags.get(slug) }))
  );
  if (tagRows.length > 0) {
    const { error } = await supabase.from(T.jobTags).insert(tagRows);
    if (error) stop('writing the tags', error);
  }
  console.log(`  tags on postings  ${tagRows.length} written`);

  const { error: translationError } = await supabase
    .from(T.jobTranslations)
    .upsert([TRANSLATION], { onConflict: 'job_id,locale' });
  if (translationError) stop('writing the translation', translationError);
  console.log('  translations      1 written, marked ready');

  // The accounts, one at a time: each one needs its own id back before
  // anything can hang off it.
  const passwords = [];
  for (const account of ACCOUNTS) {
    // A password with a default in a committed file is a password in the
    // repository, so this generates one and prints it once. SEED_PASSWORD sets
    // the same one for both, which is what a capture run wants.
    const password = process.env.SEED_PASSWORD ?? randomBytes(12).toString('base64url');
    const password_hash = await hashSecret(password);

    const { data: existing, error: findError } = await supabase
      .from(T.users)
      .select('id')
      .eq('username', account.username)
      .maybeSingle();
    if (findError) stop('looking for the account', findError);

    let userId = existing?.id ?? null;
    if (userId) {
      const { error } = await supabase
        .from(T.users)
        .update({
          display_name: account.display_name,
          email: account.email,
          password_hash,
          locale: account.locale,
        })
        .eq('id', userId);
      if (error) stop(`updating ${account.username}`, error);
    } else {
      const { data, error } = await supabase
        .from(T.users)
        .insert({
          username: account.username,
          display_name: account.display_name,
          email: account.email,
          password_hash,
          locale: account.locale,
        })
        .select('id')
        .single();
      if (error) stop(`creating ${account.username}`, error);
      userId = data.id;
    }
    passwords.push([account.username, password]);

    if (account.saves.length > 0) {
      const { error } = await supabase
        .from(T.savedJobs)
        .upsert(
          account.saves.map((job) => ({ applicant_id: userId, job_id: job })),
          { onConflict: 'applicant_id,job_id' }
        );
      if (error) stop('saving postings', error);
    }

    if (account.application) {
      const { error } = await supabase.from(T.applications).upsert(
        [
          {
            job_id: account.application.job,
            applicant_id: userId,
            status: account.application.status,
            started_at: DAYS(4),
            applied_at: DAYS(4),
          },
        ],
        { onConflict: 'job_id,applicant_id' }
      );
      if (error) stop('writing the application', error);
    }

    if (account.rating) {
      const { error } = await supabase
        .from(T.ratings)
        .upsert([{ job_id: account.rating.job, applicant_id: userId, rating: account.rating.rating }], {
          onConflict: 'job_id,applicant_id',
        });
      if (error) stop('writing the rating', error);
    }

    // An apply click nobody has answered yet, so /account/tasks and the
    // handoff prompt both have something real to draw. `pending` is the
    // build's third state and never a No: see migration 007's header.
    if (account.prompt) {
      const { data: already, error: readError } = await supabase
        .from(T.analytics)
        .select('id')
        .eq('applicant_id', userId)
        .eq('job_id', account.prompt)
        .eq('event_type', 'apply_click')
        .limit(1);
      if (readError) stop('reading the analytics rows', readError);
      if ((already ?? []).length === 0) {
        const { error } = await supabase.from(T.analytics).insert({
          job_id: account.prompt,
          applicant_id: userId,
          event_type: 'apply_click',
          did_apply: false,
          response_state: 'pending',
        });
        if (error) stop('writing the apply click', error);
      }
    }
  }

  console.log(`  accounts          ${ACCOUNTS.length} written\n`);
  console.log('  Sign in with:');
  for (const [username, password] of passwords) console.log(`    ${username}  ${password}`);
  console.log(
    '\n  Printed once. Re-running writes a new password unless SEED_PASSWORD is set,\n' +
      '  and neither account can receive mail: example.invalid never resolves.'
  );
}

async function clear() {
  const ours = POSTINGS.map((p) => p.id);
  const { error: jobsError } = await supabase.from(T.jobs).delete().in('id', [...ours, ...DEV_SEED]);
  if (jobsError) stop('deleting the postings', jobsError);
  console.log(`  postings          up to ${ours.length + DEV_SEED.length} removed, this seed and the dev seed`);

  const { error: usersError } = await supabase
    .from(T.users)
    .delete()
    .in('username', ACCOUNTS.map((a) => a.username));
  if (usersError) stop('deleting the accounts', usersError);
  console.log(`  accounts          up to ${ACCOUNTS.length} removed`);
  console.log(
    '\n  Reference data is untouched: the departments and tags are migration 013\'s.\n' +
      '  Run node gen-screenshots.js if the install screenshots still show a seeded board.'
  );
}

/* -------------------------------------------------------------------------
 * The two guards, then the work
 * ---------------------------------------------------------------------- */

const target = new URL(process.env.SUPABASE_URL).host;

if (!CLEAR && INDEXING && !ANYWAY) {
  console.error(
    `Refusing to seed: INDEXING is true in main-site/api/_lib/discovery.js, so this\n` +
      `site is open to search engines and a sample posting written now is a sample\n` +
      `posting in somebody's search results. Clear it instead:\n\n` +
      `    node seed.mjs --clear --yes\n\n` +
      `Or, if you have read that sentence and mean it, add --anyway.`
  );
  process.exit(1);
}

if (!YES) {
  console.log(`\n${CLEAR ? 'Would remove' : 'Would write'}, against ${target}:\n`);
  if (CLEAR) {
    console.log(`  ${POSTINGS.length} seeded postings and the ${DEV_SEED.length} the phase 3 dev seed wrote`);
    console.log(`  ${ACCOUNTS.length} sample accounts, and everything cascading from all of it`);
  } else {
    for (const posting of POSTINGS) console.log(`  ${posting.status.padEnd(9)} ${posting.title}`);
    console.log(`  1 ready Chinese translation`);
    for (const account of ACCOUNTS) console.log(`  account   ${account.username} (${account.locale})`);
  }
  console.log('\nNothing written. Add --yes to do it.');
  process.exit(0);
}

console.log(`\n${CLEAR ? 'Clearing' : 'Seeding'} ${target}\n`);
if (CLEAR) await clear();
else await seed();
console.log(`\n${CLEAR ? 'Cleared' : 'Seeded'}.`);
