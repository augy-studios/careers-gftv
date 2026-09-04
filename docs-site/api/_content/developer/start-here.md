---
title: Start here
access: developer
order: 1
summary: The two sites, the two account realms, the two Vercel projects, and the shape of the repository.
---

# Start here

One page to orient somebody with no context. Read it before anything else here.

**Careers@GFTV is the careers portal for Global Furry Television**, at
[careers.globalfurry.tv](https://careers.globalfurry.tv). It is a public job
board with search and filters, a posting page per role, and an application flow
behind a login. Applications themselves are collected in Google Forms.

**So the portal's job is narrow.** It gates access to a form, hands the
applicant over, logs the handoff, and tracks what happened next. It stores no
answers and no resumes.

Every role on the board is voluntary and unpaid, and the interface says so in
five places. That is a statement about the postings that exist and not a promise
about the future. `gftvjobs_jobs.is_paid` lets a paid posting say otherwise for
itself.

## The stack, in one table

| Layer | What it is |
|---|---|
| Frontend | Plain HTML, CSS and JavaScript. No framework. |
| Backend | Vercel serverless functions, Node 20 or later. |
| Database | Supabase Postgres, reached with the service role key from the functions only. |
| Passwords | bcrypt, at cost 12, matching the hashes already in `gftvhello_users`. |
| Bot | Telethon and Python on a Debian VPS, with SQLite for its own local state. |

**The portal has no build step**, and that is a rule and not an accident. The
documentation site has one, which section 16e of the specification states as the
single exception. Nothing else in this repository is compiled, bundled or
transformed.

## Two sites

| Site | Directory | Domain |
|---|---|---|
| The portal | `main-site/` | `careers.globalfurry.tv` |
| This documentation site | `docs-site/` | `docs.careers.globalfurry.tv` |

They are **two Vercel projects on one repository**, each with its own root
directory. That is the fact most likely to catch you out. A Vercel project
builds from its own root and cannot reach outside it, so `docs-site/` cannot
import a single file from `main-site/`.

**What the two share is duplicated in, by a generator.** `node gen-docs-lib.js`
writes the docs site's copies of the portal's shared modules, and
`node gen-docs-lib.js --check` fails when one is out of date. See
[Vercel](/staff/developer/vercel).

> [!WARNING]
> Nothing under `docs-site/api/_lib/`, `docs-site/api/auth/staff/` or the
> generated files in `docs-site/assets/js/` is ever edited. Every one of them
> opens by saying it is generated and naming the file it came from.

## Two account realms

They are fully separate: separate tables, separate cookies, separate helpers.
Nothing lets a session in one satisfy a check in the other, and there is no
shared idea of a current user.

| | Staff | Applicant |
|---|---|---|
| Accounts | `gftvhello_users`, shared with gftv.asia | `gftvjobs_users`, this project's own |
| Sessions | `gftvjobs_staff_sessions`, and `gftvjobs_docs_sessions` here | `gftvjobs_sessions` |
| Cookie | `gftv_staff_session` | `gftv_applicant_session` |
| Second factor | A passkey, or an authenticator app | A passkey, or a Telegram code |
| Getting in | Approved at gftv.asia, then this project's access overlay | Immediate, no approval |

**Staff accounts belong to gftv.asia and are only read from here.** This project
decides whether an account may come in through this door, and writes that
decision to its own table. See [Authentication](/staff/developer/authentication).

## The repository

| Directory | What is in it |
|---|---|
| `main-site/` | The portal. Static files plus `api/`. Vercel's root for that project. |
| `docs-site/` | This site. Two content trees, its own `api/`, and the one build step. |
| `migrations/` | Numbered SQL, run by hand in the Supabase SQL editor. |
| `telegram-bot/` | The bot and the status probe. Runs on a VPS, not on Vercel. |
| `apps-script/` | The script pasted into each job's Google Form. |
| `tests/` | Playwright checks, run by hand. Not a CI suite. |

At the root beside them are eight plain `node` scripts, none of which is part of
a build. Four are checkers to run before a push, and
[Conventions](/staff/developer/conventions) lists them.

## The five READMEs

There are five, plus the one in `migrations/`, and no others. Do not scatter a
README into every directory.

| Where | What it covers |
|---|---|
| The repository root | The project, the directories, the migrations, and the environment variables. |
| `main-site/README.md` | Local development, the auth realms, the route map, and the offline checklist. |
| `docs-site/README.md` | The two pipelines, the gate, adding a page, and the screenshot rules. |
| `telegram-bot/README.md` | The commands, running it under tmux, and the by-hand checklist. |
| `migrations/README.md` | Every migration in order, and the rules about running them. |
| `tests/README.md` | Running the checks, what a run writes, and what it cannot cover. |

**Keep them current in the same change**, never as a cleanup pass afterwards. A
stale README is worse than no README, because it is read with the same trust as
a current one.

## Running it locally

```bash
cd main-site
npm install
cp .env.example .env.local   # then fill it in
npx vercel dev
```

The docs site runs the same way from `docs-site/`, on a different port, **after
its build has been run once**:

```bash
cd docs-site
npm install
node scripts/build.js
npx vercel dev
```

**A function throws at import time when a variable is missing**, naming the
variable. That is deliberate: a loud failure at startup beats an undefined value
three calls deep.
