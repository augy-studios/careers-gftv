---
title: The test scripts
access: developer
order: 12
summary: What each script in tests/ covers, what a run writes, and the download for every one of them.
data: test-scripts.json
---

# The test scripts

**There is no CI suite and no test database.** What there is: Playwright scripts
in `tests/`, run by hand against a deployment, one file per phase, plus a
handful of small tools.

`tests/README.md` is the full account of running them. This page is the
orientation and the download.

> [!DANGER]
> **These run against a real site and write real rows.** There is no fixture
> database and no test mode. A run signs in as a real staff account, creates real
> postings, raises real tasks, and deletes what it made on the way out. Read
> `tests/README.md` before the first one.

## Before the first run

You need three things.

1. **Node 20 or later, and Playwright's Chromium.** From the repository root:

   ```sh
   npm install
   npx playwright install chromium
   ```

2. **A staff account with portal access.** The guard re-reads the session and
   re-checks the access rule on every request, so there is no way to fake one.
   Run each phase file once as an admin and once as a job poster: the account's
   role decides which half of several sections runs.

3. **Somewhere to point them.** Production is the default because usually there
   is no preview. **Point them at a preview deployment where there is one**, with
   `BASE=`.

```sh
STAFF_USER=yourname STAFF_PASS='...' node tests/phase7-test.mjs
STAFF_USER=yourname STAFF_PASS='...' node tests/phase7-test.mjs --only=editor
```

**Every file takes `--only=`**, naming one or more sections. That is how you
re-run the part you just changed instead of half an hour of everything.

## What does not need a credential

Four things run against nothing but the working tree, and they are the ones to
run before a push.

| Command | What it proves |
|---|---|
| `node tests/phase10-test.mjs` | The portal's service worker, in a real browser, offline. |
| `node tests/phase12-test.mjs --only=responsive,landscape,a11y,a11y-keyboard` | Layout and accessibility at every width. |
| `node tests/phase13-test.mjs --only=live` | What the docs deployment answers a stranger. |
| `node tests/phase14-test.mjs` | Both sites' chrome, and this site's worker. |

**`PATCH_ASSETS=1` serves the working tree's stylesheets, scripts and pages** in
place of the deployment's, so a fix can be proved before it is pushed.

## A clean run is not full coverage

Anything needing SQL, a staff second account, a redeploy, a real form or a
person at a keyboard is **skipped and never silently passed**. The count at the
end says how many, and each skip prints what it could not do.

**The bot has none of this.** `tests/phase11-test.mjs` is the site half of that
phase and nothing else. The Python on the VPS is checked by a person walking the
checklist in `telegram-bot/README.md`, which was a decision and not an omission.

## What a run writes, and cleaning up after one

Everything a phase file creates is prefixed and deleted on the way out. What the
ten an hour deletion budget cannot reach is unpublished and listed, so it can be
removed afterwards.

```sh
STAFF_USER=... STAFF_PASS='...' node tests/cleanup-smoke.mjs --dry-run
STAFF_USER=... STAFF_PASS='...' node tests/cleanup-smoke.mjs
```

**`create-applicant.mjs` makes the applicant account** several sections need,
and gives it something to be a list of. An empty dashboard passes every
accessibility rule there is, which is why the account is seeded with history.

## The three debug scripts

`debug-prompt.mjs`, `debug-register.mjs` and `debug-slug.mjs` are each the
shortest way to reproduce one specific failure. **They are kept as much for the
shape as for the bug**: a new one starts as a copy of whichever is closest.

## The scripts

Every file in `tests/`, with its own description and the command that runs it,
taken from the comment the file opens with. **Nothing here is written by hand**:
`docs-site/scripts/embed-tests.mjs` reads the directory, and
`--check` fails when this table is out of date.

> [!NOTE]
> **The download has no address of its own.** The file travels inside this page,
> and the link your browser saves is built in this tab and dies with it. Nothing
> in `tests/` is a secret and none of it holds a credential: every script takes
> those from the environment. If one ever needs to hold something that must not
> be read, it does not belong in `tests/`.

**Read a script before you run it against a live database.** The text is in this
page, so that costs nothing.
