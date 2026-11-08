// Every invented /api/ answer the mock portal gives.
//
// **Nothing here is real.** Every person, posting and applicant is made up and
// says SAMPLE, in the same way seed.mjs marks its rows, so a screenshot taken
// from this file can be recognised as a sample at a glance and can never
// contain somebody's personal data.
//
// Each answer has the same shape the real route in main-site/api/ sends: an
// object with ok: true and a data payload. When a route's real response changes,
// the matching function here needs the same change, and the capture script
// prints every route it had no answer for.

const CLOCK_NOW = '2026-09-07T01:30:00.000Z';

/* -------------------------------------------------------------------------
 * People
 * ---------------------------------------------------------------------- */

const SAMPLE_APPLICANT = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'sample-applicant',
  display_name: 'Sample Applicant',
  email: 'sample.applicant@example.invalid',
  avatar_url: null,
  phone: null,
  locale: 'en',
  must_change_password: false,
  created_at: '2026-08-01T02:00:00.000Z',
};

const SAMPLE_STAFF = {
  id: '00000000-0000-4000-8000-000000000002',
  username: 'sample-staff',
  display_name: 'Sample Staff Member',
  email: 'sample.staff@example.invalid',
  avatar_url: null,
};

/* -------------------------------------------------------------------------
 * Departments, tags and postings
 * ---------------------------------------------------------------------- */

const DEPARTMENTS = [
  { id: 'dept-1', slug: 'registration', name: 'Registration', count: 2 },
  { id: 'dept-2', slug: 'programming', name: 'Programming', count: 2 },
  { id: 'dept-3', slug: 'media', name: 'Media and Design', count: 1 },
];

const TAGS = [
  { id: 'tag-1', slug: 'beginner-friendly', name: 'Beginner friendly', colour: '#2f855a', count: 3 },
  { id: 'tag-2', slug: 'on-site', name: 'On site', colour: '#2b6cb0', count: 3 },
  { id: 'tag-3', slug: 'creative', name: 'Creative', colour: '#b83280', count: 2 },
];

const POSTINGS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'sample-registration-lead',
    title: 'Registration Desk Lead (SAMPLE POSTING)',
    summary: 'Run the check-in desk for the weekend, train the volunteers on it, and keep the queue moving.',
    department: 1,
    location: 'Singapore EXPO',
    is_remote: false,
    commitment_type: 'volunteer',
    is_paid: false,
    published_at: '2026-09-01T02:00:00.000Z',
    closes_at: '2026-10-15T15:59:00.000Z',
    tags: [0, 1],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    slug: 'sample-programming-coordinator',
    title: 'Programming Coordinator (SAMPLE POSTING)',
    summary: 'Schedule panels and workshops, liaise with guests, and keep the programme on time.',
    department: 2,
    location: 'Singapore EXPO',
    is_remote: false,
    commitment_type: 'part_time',
    is_paid: false,
    published_at: '2026-08-28T02:00:00.000Z',
    closes_at: null,
    tags: [1],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    slug: 'sample-social-media-designer',
    title: 'Social Media Designer (SAMPLE POSTING)',
    summary: 'Design posts, banners and short animations for the convention accounts, mostly from home.',
    department: 3,
    location: 'Remote',
    is_remote: true,
    commitment_type: 'part_time',
    is_paid: true,
    published_at: '2026-08-25T02:00:00.000Z',
    closes_at: '2026-09-30T15:59:00.000Z',
    tags: [2],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    slug: 'sample-guest-liaison',
    title: 'Guest Liaison (SAMPLE POSTING)',
    summary: 'Look after invited guests from arrival to departure and be their first point of contact.',
    department: 2,
    location: 'Singapore EXPO',
    is_remote: false,
    commitment_type: 'volunteer',
    is_paid: false,
    published_at: '2026-08-20T02:00:00.000Z',
    closes_at: '2026-10-01T15:59:00.000Z',
    tags: [0, 1],
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    slug: 'sample-badge-printing-volunteer',
    title: 'Badge Printing Volunteer (SAMPLE POSTING)',
    summary: 'Print and hand out attendee badges at the registration desk during the first morning.',
    department: 1,
    location: 'Singapore EXPO',
    is_remote: false,
    commitment_type: 'volunteer',
    is_paid: false,
    published_at: '2026-08-18T02:00:00.000Z',
    closes_at: '2026-10-10T15:59:00.000Z',
    tags: [0],
  },
];

/**
 * One posting as the public board sends it.
 *
 * @param {object} posting an entry from POSTINGS
 * @returns {object} the board's shape
 */
function publicPosting(posting) {
  const department = DEPARTMENTS[posting.department - 1];
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    summary: posting.summary,
    headline: '',
    department: { id: department.id, name: department.name, slug: department.slug },
    location: posting.location,
    is_remote: posting.is_remote,
    commitment_type: posting.commitment_type,
    is_paid: posting.is_paid,
    status: 'published',
    published_at: posting.published_at,
    closes_at: posting.closes_at,
    tags: posting.tags.map((index) => {
      const tag = TAGS[index];
      return { id: tag.id, name: tag.name, slug: tag.slug, colour: tag.colour };
    }),
    has_translation: false,
  };
}

/**
 * The posting summary the account pages draw on each row.
 *
 * @param {object} posting an entry from POSTINGS
 * @returns {object} the summary shape
 */
function postingSummary(posting) {
  const department = DEPARTMENTS[posting.department - 1];
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    status: 'published',
    location: posting.location,
    is_remote: posting.is_remote,
    is_paid: posting.is_paid,
    commitment_type: posting.commitment_type,
    published_at: posting.published_at,
    closes_at: posting.closes_at,
    is_open: true,
    is_archived: false,
    department: { id: department.id, slug: department.slug, name: department.name },
    has_translation: false,
  };
}

/* -------------------------------------------------------------------------
 * Wrapping
 * ---------------------------------------------------------------------- */

/**
 * The standard success envelope every real route uses.
 *
 * @param {object} data the payload
 * @returns {{ status: number, body: object }}
 */
function success(data) {
  return { status: 200, body: { ok: true, data } };
}

/* -------------------------------------------------------------------------
 * Applicant side
 * ---------------------------------------------------------------------- */

// **Applications are for the second, third and fourth postings, never the
// first.** The capture script opens the first card on the board to photograph
// the Apply dialog, and a posting the person has already applied to shows a
// cooldown notice instead of an Apply button.
const SAMPLE_APPLICATIONS = [
  {
    job_id: POSTINGS[1].id,
    status: 'submitted',
    started_at: '2026-09-02T03:00:00.000Z',
    applied_at: '2026-09-02T03:20:00.000Z',
    cooldown_until: '2026-12-01T03:20:00.000Z',
    in_cooldown: true,
    pending_id: null,
    bucket: 'submitted',
    rating: 4,
  },
  {
    job_id: POSTINGS[2].id,
    status: 'started',
    started_at: '2026-09-05T03:00:00.000Z',
    applied_at: null,
    cooldown_until: null,
    in_cooldown: false,
    pending_id: 'pending-1',
    bucket: 'in_progress',
    rating: null,
  },
  {
    job_id: POSTINGS[3].id,
    status: 'shortlisted',
    started_at: '2026-08-27T03:00:00.000Z',
    applied_at: '2026-08-27T03:40:00.000Z',
    cooldown_until: '2026-11-25T03:40:00.000Z',
    in_cooldown: true,
    pending_id: null,
    bucket: 'submitted',
    rating: 5,
  },
];

/**
 * The applicant's list of applications, thin or wide.
 *
 * @param {URLSearchParams} query the request's query string
 * @returns {object} the payload
 */
function applicationsMine(query) {
  const jobId = query.get('job_id');
  const withJobs = query.get('with_jobs') === 'true';
  const bucket = query.get('bucket') ?? 'all';

  let applications = SAMPLE_APPLICATIONS;
  if (jobId) applications = applications.filter((row) => row.job_id === jobId);

  if (!withJobs) return { applications, applications_open: true };

  const drawable = applications.map((row) => {
    const posting = POSTINGS.find((candidate) => candidate.id === row.job_id);
    return { ...row, job: postingSummary(posting) };
  });

  const counts = { all: drawable.length, in_progress: 0, submitted: 0, closed: 0 };
  for (const row of drawable) counts[row.bucket] += 1;

  return {
    applications: drawable.filter((row) => bucket === 'all' || row.bucket === bucket),
    applications_open: true,
    counts,
    bucket,
  };
}

const SAMPLE_TASKS = [
  {
    source: 'task',
    id: 'task-1',
    task_type: 'info_request',
    title: 'A quick question about your availability (SAMPLE)',
    body: 'Could you tell us which days of the convention weekend you could be at the desk?',
    status: 'open',
    is_open: true,
    questions: [],
    answers: null,
    needs_reply: true,
    response_text: null,
    responded_at: null,
    raised_by: 'Sample Staff Member',
    resolved_at: null,
    created_at: '2026-09-04T03:00:00.000Z',
    job: null,
  },
  {
    source: 'task',
    id: 'task-2',
    task_type: 'info_request',
    title: 'Please confirm your t-shirt size (SAMPLE)',
    body: 'We are ordering volunteer shirts this week.',
    status: 'resolved',
    is_open: false,
    questions: [],
    answers: null,
    needs_reply: false,
    response_text: 'Medium, thank you.',
    responded_at: '2026-08-30T03:00:00.000Z',
    raised_by: 'Sample Staff Member',
    resolved_at: '2026-08-31T03:00:00.000Z',
    created_at: '2026-08-29T03:00:00.000Z',
    job: null,
  },
];


/* -------------------------------------------------------------------------
 * Staff side
 * ---------------------------------------------------------------------- */

const LOCALES = [
  { code: 'en', english_name: 'English', native_name: 'English', is_default: true },
  { code: 'zh', english_name: 'Chinese', native_name: '华文', is_default: false },
];

const SAMPLE_APPLICANTS = [
  { id: '20000000-0000-4000-8000-000000000001', username: 'sample-applicant', display_name: 'Sample Applicant', email: 'sample.applicant@example.invalid' },
  { id: '20000000-0000-4000-8000-000000000002', username: 'sample-volunteer', display_name: 'Sample Volunteer', email: 'sample.volunteer@example.invalid' },
  { id: '20000000-0000-4000-8000-000000000003', username: 'sample-designer', display_name: 'Sample Designer', email: 'sample.designer@example.invalid' },
  { id: '20000000-0000-4000-8000-000000000004', username: 'sample-newcomer', display_name: 'Sample Newcomer', email: 'sample.newcomer@example.invalid' },
];

/**
 * A full account row as the staff pages read it.
 *
 * @param {object} person an entry from SAMPLE_APPLICANTS
 * @param {number} index the person's position, used to vary the dates
 * @returns {object} the account shape
 */
function accountRow(person, index) {
  return {
    id: person.id,
    username: person.username,
    display_name: person.display_name,
    email: person.email,
    phone: null,
    avatar_url: null,
    locale: 'en',
    is_active: true,
    must_change_password: false,
    created_at: `2026-08-0${index + 1}T02:00:00.000Z`,
    updated_at: `2026-08-1${index}T02:00:00.000Z`,
  };
}

const APPLICATION_STATUS_LIST = ['started', 'submitted', 'under_review', 'shortlisted', 'interview', 'offered', 'accepted', 'rejected', 'withdrawn'];

const ADMIN_APPLICATIONS = [
  { id: '30000000-0000-4000-8000-000000000001', person: 0, posting: 0, status: 'submitted', applied: '2026-09-02T03:20:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000002', person: 1, posting: 0, status: 'under_review', applied: '2026-09-03T05:10:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000003', person: 2, posting: 2, status: 'shortlisted', applied: '2026-08-27T03:40:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000004', person: 3, posting: 1, status: 'started', applied: null },
  { id: '30000000-0000-4000-8000-000000000005', person: 1, posting: 3, status: 'interview', applied: '2026-08-30T07:00:00.000Z' },
];

/**
 * One application as the staff tracking table sends it.
 *
 * @param {object} entry an entry from ADMIN_APPLICATIONS
 * @returns {object} the row shape
 */
function adminApplication(entry) {
  const person = SAMPLE_APPLICANTS[entry.person];
  const posting = POSTINGS[entry.posting];
  const startedAt = entry.applied ?? '2026-09-05T03:00:00.000Z';
  return {
    id: entry.id,
    status: entry.status,
    admin_note: entry.status === 'shortlisted' ? 'Strong portfolio. Ask about weekend availability.' : null,
    started_at: startedAt,
    applied_at: entry.applied,
    cooldown_until: entry.applied ? '2026-12-01T03:20:00.000Z' : null,
    in_cooldown: Boolean(entry.applied),
    updated_at: startedAt,
    applicant: {
      id: person.id,
      username: person.username,
      display_name: person.display_name,
      email: person.email,
      phone: null,
      locale: 'en',
      avatar_url: null,
      is_active: true,
    },
    job: {
      id: posting.id,
      title: posting.title,
      slug: posting.slug,
      status: 'published',
      application_form_url: 'https://forms.gle/sample-form',
      response_sheet_url: null,
    },
    open_tasks: [],
  };
}

/**
 * A posting as the staff postings list sends it.
 *
 * @param {object} posting an entry from POSTINGS
 * @param {number} index the posting's position, used for statuses
 * @returns {object} the list row shape
 */
function adminJob(posting, index) {
  const department = DEPARTMENTS[posting.department - 1];
  const statuses = ['published', 'published', 'published', 'draft', 'closed'];
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    status: statuses[index],
    department: { id: department.id, name: department.name, slug: department.slug },
    commitment_type: posting.commitment_type,
    location: posting.location,
    is_remote: posting.is_remote,
    is_paid: posting.is_paid,
    openings: 3,
    published_at: statuses[index] === 'draft' ? null : posting.published_at,
    closes_at: posting.closes_at,
    has_deadline: posting.closes_at !== null,
    created_at: '2026-08-10T02:00:00.000Z',
    updated_at: '2026-09-04T02:00:00.000Z',
    has_form: statuses[index] !== 'draft',
    form_check_state: 'ok',
    form_check_note: null,
    has_questions: index === 0,
    question_count: index === 0 ? 2 : 0,
    translations: [{ locale: 'zh', state: index === 0 ? 'complete' : 'in_progress' }],
  };
}

/**
 * One posting as the editor reads it, with its translations and tags.
 *
 * @param {object} posting an entry from POSTINGS
 * @returns {object} the editor shape
 */
function editorJob(posting) {
  const index = POSTINGS.indexOf(posting);
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    department_id: DEPARTMENTS[posting.department - 1].id,
    summary: posting.summary,
    description: 'This is a sample posting used only for documentation screenshots.\n\nThe real text would describe the role, the team and what a typical shift looks like.',
    responsibilities: '- Welcome attendees at the desk\n- Scan tickets and print badges\n- Escalate problems to the lead',
    requirements: '- Friendly and patient\n- Able to stand for several hours',
    nice_to_have: '- Previous convention experience',
    sections: [],
    og_description: posting.summary,
    commitment_type: posting.commitment_type,
    location: posting.location,
    is_remote: posting.is_remote,
    is_paid: posting.is_paid,
    compensation_note: null,
    openings: 3,
    status: 'published',
    application_form_url: 'https://forms.gle/sample-form',
    form_prefill: { email: 'entry.1111111111', display_name: 'entry.2222222222' },
    response_sheet_url: null,
    task_questions: [],
    form_check_state: 'ok',
    form_checked_at: '2026-09-06T18:00:00.000Z',
    form_check_note: null,
    published_at: posting.published_at,
    closes_at: posting.closes_at,
    created_by: SAMPLE_STAFF.id,
    created_at: '2026-08-10T02:00:00.000Z',
    updated_at: '2026-09-04T02:00:00.000Z',
    translations: {
      zh: {
        locale: 'zh',
        title: index === 0 ? '登记处负责人（示例职位）' : '',
        summary: index === 0 ? '负责周末的签到处，培训志愿者并保持队伍顺畅。' : '',
        description: '',
        responsibilities: '',
        requirements: '',
        nice_to_have: '',
        location: '',
        compensation_note: '',
        sections: [],
        og_description: '',
        is_ready: false,
      },
    },
    tags: posting.tags.map((tagIndex) => {
      const tag = TAGS[tagIndex];
      return { id: tag.id, name: tag.name, slug: tag.slug, colour: tag.colour };
    }),
  };
}

/**
 * The funnel row for one posting on the analytics page.
 *
 * @param {object} posting an entry from POSTINGS
 * @param {number} index the posting's position, used to vary the numbers
 * @returns {object} the funnel row shape
 */
function funnelRowFor(posting, index) {
  const views = [420, 310, 275, 150, 96][index];
  const clicks = [64, 41, 38, 6, 12][index];
  const yes = [48, 30, 31, 1, 9][index];
  return {
    job_id: posting.id,
    title: posting.title,
    slug: posting.slug,
    status: index === 4 ? 'closed' : 'published',
    published_at: posting.published_at,
    closes_at: posting.closes_at,
    views,
    apply_clicks: clicks,
    answered_yes: yes,
    answered_no: clicks - yes - 2,
    pending: 1,
    timed_out: 1,
    yes_by_source: { applicant: yes - 8, webhook: 7, admin: 1 },
    yes_rate: Number((yes / clicks).toFixed(3)),
    rate_is_floor: true,
    rating_count: [9, 6, 5, 2, 0][index],
    rating_average: [4.4, 4.0, 4.6, null, null][index],
    rating_suppressed: index === 3,
    needs_attention: index === 3,
  };
}

const SAMPLE_INVITES = [
  { id: 'invite-1', person: 0, status: 'invited', note: 'Great fit for the desk lead role.', created: '2026-09-04T03:00:00.000Z' },
  { id: 'invite-2', person: 1, status: 'shortlisted', note: null, created: '2026-09-05T03:00:00.000Z' },
  { id: 'invite-3', person: 2, status: 'applied', note: null, created: '2026-09-01T03:00:00.000Z' },
];

const SAMPLE_REPORTS = [
  {
    id: 'report-1',
    target_type: 'job',
    target_id: POSTINGS[0].id,
    target_key: null,
    target_label: POSTINGS[0].title,
    field: 'summary',
    locale: 'zh',
    reporter: { id: SAMPLE_APPLICANTS[1].id, username: 'sample-volunteer', display_name: 'Sample Volunteer' },
    note: 'This sounds unnatural in Chinese.',
    suggested_text: '负责周末的签到处，培训志愿者并保持队伍顺畅。',
    origin: 'form',
    quote: null,
    quote_prefix: null,
    quote_suffix: null,
    status: 'open',
    resolution_note: null,
    resolved_at: null,
    created_at: '2026-09-05T03:00:00.000Z',
    editable: true,
  },
  {
    id: 'report-2',
    target_type: 'interface',
    target_id: null,
    target_key: 'search.title',
    target_label: null,
    field: 'value',
    locale: 'zh',
    reporter: { id: SAMPLE_APPLICANTS[2].id, username: 'sample-designer', display_name: 'Sample Designer' },
    note: 'The heading is too literal.',
    suggested_text: null,
    origin: 'form',
    quote: null,
    quote_prefix: null,
    quote_suffix: null,
    status: 'accepted',
    resolution_note: null,
    resolved_at: null,
    created_at: '2026-09-03T03:00:00.000Z',
    editable: false,
  },
];

const SAMPLE_AUDIT = [
  { target_type: 'job', target_id: POSTINGS[1].id, locale: 'zh', label: POSTINGS[1].title, source_status: 'published', state: 'missing', missing_fields: ['title', 'summary', 'description'], updated_at: null },
  { target_type: 'job', target_id: POSTINGS[2].id, locale: 'zh', label: POSTINGS[2].title, source_status: 'published', state: 'drafted', missing_fields: ['description'], updated_at: '2026-09-02T03:00:00.000Z' },
  { target_type: 'department', target_id: DEPARTMENTS[2].id, locale: 'zh', label: DEPARTMENTS[2].name, source_status: 'active', state: 'missing', missing_fields: ['name'], updated_at: null },
  { target_type: 'tag', target_id: TAGS[2].id, locale: 'zh', label: TAGS[2].name, source_status: 'in_use', state: 'thin', missing_fields: [], updated_at: '2026-08-29T03:00:00.000Z' },
];

const SAMPLE_UNMATCHED = [
  { id: 'submission-1', job_id: POSTINGS[0].id, job_title: POSTINGS[0].title, email: 'someone.else@example.invalid', submitted_at: '2026-09-06T08:12:00.000Z', received_at: '2026-09-06T08:12:30.000Z' },
  { id: 'submission-2', job_id: POSTINGS[2].id, job_title: POSTINGS[2].title, email: 'another.person@example.invalid', submitted_at: '2026-09-05T13:40:00.000Z', received_at: '2026-09-05T13:40:20.000Z' },
];

const SAMPLE_STAFF_ACCESS = [
  { id: SAMPLE_STAFF.id, username: 'sample-staff', is_approved: true, is_admin: true, is_editor: false, role: 'admin', access_state: 'default', has_access: true, access_reason: null, access_changed_at: null, second_factor: { totp: true, passkeys: 1, backup_codes: 8 }, last_sign_in: '2026-09-07T01:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000010', username: 'sample-poster', is_approved: true, is_admin: false, is_editor: true, role: 'poster', access_state: 'granted', has_access: true, access_reason: 'Running the registration postings.', access_changed_at: '2026-08-20T03:00:00.000Z', second_factor: { totp: false, passkeys: 2, backup_codes: 10 }, last_sign_in: '2026-09-05T09:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000011', username: 'sample-former-poster', is_approved: true, is_admin: false, is_editor: true, role: 'poster', access_state: 'denied', has_access: false, access_reason: 'Left the team.', access_changed_at: '2026-08-30T03:00:00.000Z', second_factor: { totp: false, passkeys: 0, backup_codes: 0 }, last_sign_in: '2026-07-01T09:00:00.000Z' },
];

/**
 * Answer the staff half of the API.
 *
 * @param {{ method: string, path: string, query: URLSearchParams, body: object }} request
 * @returns {{ status?: number, body: object }|null}
 */
function answerStaffRequest(request) {
  const { path, query } = request;

  if (path === '/api/admin/me') {
    return success({
      staff: { id: SAMPLE_STAFF.id, username: SAMPLE_STAFF.username, role: 'admin', is_admin: true, is_editor: false },
      locales: LOCALES,
      counts: { open_tasks: 3, new_applications: 4, open_translation_reports: 2 },
    });
  }

  if (path === '/api/admin/stats') {
    return success({
      postings: { draft: 1, published: 3, closed: 1, archived: 0, closing_soon: 2, no_deadline: 1, draft_without_form: 0 },
      applications_by_status: Object.fromEntries(APPLICATION_STATUS_LIST.map((status, index) => [status, [1, 3, 2, 1, 1, 0, 0, 1, 0][index]])),
      recent_applications: ADMIN_APPLICATIONS.map((entry) => {
        const row = adminApplication(entry);
        return { id: row.id, status: row.status, started_at: row.started_at, applied_at: row.applied_at, updated_at: row.updated_at, applicant: { id: row.applicant.id, username: row.applicant.username, display_name: row.applicant.display_name, avatar_url: null }, job: { id: row.job.id, title: row.job.title } };
      }),
      recent_registrations: SAMPLE_APPLICANTS.map((person, index) => ({ id: person.id, username: person.username, display_name: person.display_name, avatar_url: null, created_at: accountRow(person, index).created_at, is_active: true })),
      cron: { readable: true, run: { started_at: '2026-09-06T18:00:00.000Z', finished_at: '2026-09-06T18:00:07.000Z', ok: true, results: {} } },
      outbox: { readable: true, summary: { pending: 0, sent: 12, failed: 0 } },
    });
  }

  if (path === '/api/admin/jobs') {
    const id = query.get('id');
    if (id) {
      const posting = POSTINGS.find((candidate) => candidate.id === id) ?? POSTINGS[0];
      const job = editorJob(posting);
      return success({ job, locales: LOCALES, publish_blockers: [] });
    }
    const jobs = POSTINGS.map(adminJob);
    return success({ jobs, locales: LOCALES, total: jobs.length, page: 1, limit: 25 });
  }

  if (path === '/api/admin/applications') {
    const id = query.get('id');
    if (id) {
      const entry = ADMIN_APPLICATIONS.find((candidate) => candidate.id === id) ?? ADMIN_APPLICATIONS[0];
      return success({
        application: adminApplication(entry),
        history: [
          { id: 'event-2', from_status: 'submitted', to_status: entry.status, note: null, source: 'admin', changed_by: SAMPLE_STAFF.id, created_at: '2026-09-04T03:00:00.000Z' },
          { id: 'event-1', from_status: null, to_status: 'submitted', note: null, source: 'applicant', changed_by: null, created_at: '2026-09-02T03:20:00.000Z' },
        ],
        tasks: [],
      });
    }
    const applications = ADMIN_APPLICATIONS.map(adminApplication);
    const counts = { all: applications.length };
    for (const status of APPLICATION_STATUS_LIST) {
      counts[status] = applications.filter((row) => row.status === status).length;
    }
    return success({ applications, counts, total: applications.length, page: 1, limit: 25, truncated: false });
  }

  if (path === '/api/admin/analytics') {
    const rules = { rating_minimum: 3, flag_min_clicks: 5, flag_max_rate: 0.2 };
    const jobId = query.get('job');
    if (jobId) {
      const index = Math.max(0, POSTINGS.findIndex((posting) => posting.id === jobId));
      const series = [];
      for (let day = 0; day < 30; day += 1) {
        const date = new Date(Date.UTC(2026, 7, 9 + day));
        series.push({ day: date.toISOString().slice(0, 10), views: 8 + ((day * 7) % 17), apply_clicks: 1 + (day % 4), answered_yes: day % 3 });
      }
      return success({ job: funnelRowFor(POSTINGS[index], index), series, series_days: 30, series_timezone: 'UTC', rules });
    }
    return success({
      jobs: POSTINGS.map(funnelRowFor),
      total: POSTINGS.length,
      page: 1,
      page_size: 25,
      pages: 1,
      sorts: ['views', 'apply_clicks', 'answered_yes', 'yes_rate', 'rating_average', 'published_at', 'title'],
      sort: 'views',
      direction: 'desc',
      rules,
    });
  }

  if (path === '/api/admin/invites') {
    if (query.has('jobs')) {
      return success({ jobs: POSTINGS.slice(0, 3).map((posting) => ({ id: posting.id, title: posting.title, status: 'published', published_at: posting.published_at })) });
    }
    if (query.has('applicants')) {
      return success({ applicants: SAMPLE_APPLICANTS.map((person) => ({ id: person.id, username: person.username, display_name: person.display_name, avatar_url: null, is_active: true })) });
    }
    const jobId = query.get('job');
    const invites = SAMPLE_INVITES.map((entry) => {
      const person = SAMPLE_APPLICANTS[entry.person];
      const posting = POSTINGS[0];
      return {
        id: entry.id,
        job_id: posting.id,
        applicant_id: person.id,
        status: entry.status,
        note: entry.note,
        created_at: entry.created,
        updated_at: entry.created,
        notified_at: entry.status === 'shortlisted' ? null : entry.created,
        invited_by: SAMPLE_STAFF.id,
        applicant: { id: person.id, username: person.username, display_name: person.display_name, avatar_url: null, is_active: true },
        job: { id: posting.id, title: posting.title, slug: posting.slug, status: 'published' },
      };
    });
    return success({ invites: jobId ? invites : invites, total: invites.length, page: 1, page_size: 50, pages: 1, statuses: ['shortlisted', 'invited', 'seen', 'applied', 'declined', 'withdrawn'], max_recipients: 50 });
  }

  if (path === '/api/admin/settings') {
    return success({
      locales: LOCALES,
      default_locale: 'en',
      settings: {
        portal_title: { en: 'Careers@GFTV' },
        hero_heading: { en: 'Find a role' },
        hero_body: { en: 'Every open role at GFTV, in one place.' },
        featured_job_ids: [POSTINGS[0].id, POSTINGS[2].id],
        applications_open: true,
        reapply_cooldown_days: 90,
      },
      featured: [POSTINGS[0], POSTINGS[2]].map((posting) => ({ id: posting.id, title: posting.title, status: 'published' })),
      featured_unavailable: 0,
      postings: POSTINGS.map((posting) => ({ id: posting.id, title: posting.title, status: 'published' })),
      limits: { max_featured: 3, max_cooldown_days: 365, default_cooldown_days: 90 },
    });
  }

  if (path === '/api/admin/admins') {
    if (query.has('search')) return success({ accounts: [] });
    return success({ accounts: SAMPLE_STAFF_ACCESS, self_id: SAMPLE_STAFF.id, states: ['granted', 'denied', 'default'] });
  }

  if (path === '/api/admin/applicants') {
    const id = query.get('id');
    if (id) {
      const index = Math.max(0, SAMPLE_APPLICANTS.findIndex((person) => person.id === id));
      const person = SAMPLE_APPLICANTS[index];
      return success({
        account: accountRow(person, index),
        applications: ADMIN_APPLICATIONS.filter((entry) => entry.person === index).map((entry) => {
          const row = adminApplication(entry);
          return { id: row.id, status: row.status, started_at: row.started_at, applied_at: row.applied_at, cooldown_until: row.cooldown_until, updated_at: row.updated_at, job: { id: row.job.id, title: row.job.title } };
        }),
        invites: [],
        open_tasks: 0,
        telegram: null,
        activity: [],
      });
    }
    const rows = SAMPLE_APPLICANTS.map(accountRow);
    return success({ applicants: rows, total: rows.length, page: 1, page_size: 25, pages: 1 });
  }

  if (path === '/api/admin/submissions') return success({ unmatched: SAMPLE_UNMATCHED });

  if (path === '/api/admin/translations') {
    const view = query.get('view');
    if (query.get('id')) return success({ report: SAMPLE_REPORTS[0], source_locale: 'en' });
    if (view === 'audit') {
      return success({ audit: SAMPLE_AUDIT, counts: { missing: 2, drafted: 1, thin: 1 }, total: SAMPLE_AUDIT.length, page: 1, page_size: 25, pages: 1, locale: 'zh', source_locale: 'en' });
    }
    if (view === 'helpers') return success({ helpers: [], total: 0, page: 1, pages: 1, locales: LOCALES });
    return success({ reports: SAMPLE_REPORTS, counts: { open: 1, accepted: 1, fixed: 4, rejected: 1 }, total: SAMPLE_REPORTS.length, page: 1, page_size: 25, pages: 1, source_locale: 'en' });
  }

  if (path === '/api/admin/departments') return success({ departments: DEPARTMENTS.map((department) => ({ id: department.id, name: department.name, slug: department.slug, is_active: true, sort_order: 1 })) });

  if (path === '/api/admin/tags') return success({ tags: TAGS.map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug, colour: tag.colour, usage_count: tag.count })) });

  if (path === '/api/admin/tasks') return success({ tasks: [], total: 0, page: 1, pages: 1 });

  if (path === '/api/translations/annotations') {
    // No query: asked whether the suggestion layer may load. With one: the
    // spans people have already flagged on a posting.
    if (!query.has('type')) {
      return success({ can: true, can_suggest: false, realm: 'staff', locales: ['zh'] });
    }
    return success({
      spans: [{ field: 'summary', quote: 'keep the queue moving', count: 2 }],
      locale: query.get('locale') ?? 'en',
    });
  }

  if (path === '/api/translations/helper') return success({ locales: ['zh'] });

  if (path === '/api/admin/maintenance') return success({ flags: {} });

  return null;
}

/* -------------------------------------------------------------------------
 * The router
 * ---------------------------------------------------------------------- */

/**
 * Answer one API request, or return null when there is no mock for it.
 *
 * @param {{ method: string, path: string, query: URLSearchParams, body: object,
 *           actor: 'applicant'|'staff'|null }} request
 * @returns {{ status?: number, body: object }|null}
 */
export function answerApiRequest(request) {
  const { path, query, actor } = request;

  if (path === '/api/auth/applicant/session') {
    if (actor !== 'applicant') return success({ user: null });
    return success({
      user: SAMPLE_APPLICANT,
      expires_at: '2026-09-14T01:30:00.000Z',
      two_factor_enabled: false,
      codes: { recovery: 10, backup: 0 },
      codes_low: false,
      low_code_threshold: 3,
    });
  }

  if (path === '/api/auth/staff/session') {
    if (actor !== 'staff') return success({ user: null });
    return success({
      user: SAMPLE_STAFF,
      expires_at: '2026-09-14T01:30:00.000Z',
      two_factor_enabled: true,
    });
  }

  if (path === '/api/public/search') {
    const jobs = POSTINGS.map(publicPosting);
    return success({
      jobs,
      total: jobs.length,
      page: 1,
      page_size: 12,
      pages: 1,
      match_mode: 'browse',
      query: query.get('q') ?? '',
      sort: 'newest',
      locale: 'en',
    });
  }

  if (path === '/api/public/facets') {
    const commitmentCounts = {};
    for (const posting of POSTINGS) {
      commitmentCounts[posting.commitment_type] = (commitmentCounts[posting.commitment_type] ?? 0) + 1;
    }
    return success({
      locale: 'en',
      total: POSTINGS.length,
      departments: DEPARTMENTS,
      tags: TAGS,
      commitments: Object.entries(commitmentCounts).map(([key, count]) => ({ key, count })),
      chips: { posted_today: 0, posted_week: 2, closing_soon: 1 },
      chip_days: { posted_today: 1, posted_week: 7, closing_soon: 14 },
    });
  }

  if (path === '/api/public/site-settings') {
    return success({ locale: 'en', portal_title: '', hero_heading: '', hero_body: '', featured: [] });
  }

  if (path === '/api/public/feature-status') return success({ off: {} });

  if (path === '/api/public/suggest') return success({ suggestions: [] });

  if (path === '/api/applications/mine') return success(applicationsMine(query));

  // Empty on purpose. A pending prompt opens a modal over whatever page is
  // showing, which would sit on top of every account screenshot. The prompt
  // itself has its own shot (portal-apply-dialog).
  if (path === '/api/applications/pending') return success({ prompts: [] });

  if (path === '/api/public/view') return success({ recorded: true });

  if (path === '/api/applications/start') {
    const posting = POSTINGS.find((candidate) => candidate.id === request.body?.job_id) ?? POSTINGS[0];
    return {
      status: 201,
      body: {
        ok: true,
        data: {
          analytics_id: 'analytics-sample-1',
          // A blank page stands in for the Google Form, which is not reachable
          // from a mock and is not the subject of the picture.
          form_url: 'about:blank',
          job: { id: posting.id, title: posting.title },
          application: {
            job_id: posting.id,
            status: 'started',
            started_at: '2026-09-07T01:30:00.000Z',
            applied_at: null,
            cooldown_until: null,
            in_cooldown: false,
            pending_id: null,
          },
        },
      },
    };
  }

  if (path === '/api/saved/mine') return success({ saved: [], job_ids: [] });

  if (path === '/api/tasks/count') return success({ tasks: 1, prompts: 1, total: 2 });

  if (path === '/api/tasks/mine') {
    return success({ tasks: SAMPLE_TASKS, open_count: SAMPLE_TASKS.filter((task) => task.is_open).length });
  }

  return answerStaffRequest(request);
}

/**
 * What the posting page's inline data block carries for one posting.
 *
 * @param {string} postingId the uuid in the address
 * @param {'applicant'|'staff'|null} actor who is looking
 * @returns {object|null} the block, or null when no such posting exists
 */
export function postingPageData(postingId, actor) {
  void actor;
  const posting = POSTINGS.find((candidate) => candidate.id === postingId);
  if (!posting) return null;

  const department = DEPARTMENTS[posting.department - 1];
  const editor = editorJob(posting);

  return {
    job: {
      id: posting.id,
      slug: posting.slug,
      status: 'published',
      is_paid: posting.is_paid,
      is_remote: posting.is_remote,
      commitment_type: posting.commitment_type,
      openings: 3,
      published_at: posting.published_at,
      closes_at: posting.closes_at,
      updated_at: '2026-09-04T02:00:00.000Z',
      is_open: true,
      is_expired: false,
      is_archived: false,
    },
    content: {
      en: {
        title: posting.title,
        summary: posting.summary,
        description: editor.description,
        responsibilities: editor.responsibilities,
        requirements: editor.requirements,
        nice_to_have: editor.nice_to_have,
        location: posting.location,
        compensation_note: null,
        og_description: posting.summary,
        sections: [],
        department: { id: department.id, slug: department.slug, name: department.name },
        tags: posting.tags.map((index) => ({ id: TAGS[index].id, slug: TAGS[index].slug, colour: TAGS[index].colour, name: TAGS[index].name })),
        locale: 'en',
      },
    },
    applications_open: true,
    preview: false,
  };
}

export { CLOCK_NOW, POSTINGS, DEPARTMENTS, TAGS, SAMPLE_STAFF, SAMPLE_APPLICANT, success, publicPosting, postingSummary };
