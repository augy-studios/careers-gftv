---
title: Developer guide
access: developer
order: 3
summary: For whoever works on this project after the people who built it.
---

# Developer guide

This is the guide to the code. It is for whoever works on Careers@GFTV after
the people who built it, and it assumes you have the repository open beside it.

**Admins are the developers of this project.** There is no separate developer
account and none is to be invented, so if you can read the [admin
guide](/staff/admin) you can read this one.

## What this guide is, and what it is not

**It explains the shape of things and points at the file.** Where this project
owns a document, that document is reproduced here in full. Where a document
travels between GFTV repositories, this guide points at it and never copies it.

> [!NOTE]
> A copy that can drift is a copy that will. So the theme file and the official
> banner file are pointed at here and never reproduced: this repository's copy
> of each is already a copy.

**It is not a tutorial and it is not an API reference.** The route map lives in
`main-site/README.md`, every environment variable is documented in the
`.env.example` beside it, and every migration is listed in `migrations/README.md`.
Those files are current because they are part of the change that moves them.

## Before you change anything

Five things in this build fail silently when they are got wrong. Each has a
page here, and each has a script that catches it.

| If you touch | Run |
|---|---|
| `main-site/api/_lib/` or `main-site/assets/js/` | `node gen-docs-lib.js --check` |
| Anything under `main-site/` | bump `VERSION` in `main-site/sw.js` |
| Anything under `docs-site/` | bump `VERSION` in `docs-site/sw.js` |
| A dictionary key | `node check-i18n.js` |
| Any English a reader sees | `node check-copy.js` |

[Conventions worth not relearning](/staff/developer/conventions) is the short
version of all of it. If you are only reading one page here, read that one.

## What is in this guide

1. [Start here](/staff/developer/start-here): the two sites, the two account
   realms, and the shape of the repository.
2. [The specification](/staff/developer/the-specification), which is the brief
   the whole build answers to.
3. [The working memo](/staff/developer/the-working-memo), and why a gitignored
   file is a deliverable.
4. [Phases and build status](/staff/developer/phases-and-build-status): one file
   deciding what is on.
5. [The official banner](/staff/developer/the-official-banner), which replaces
   the build notice at the end.
6. [The theme](/staff/developer/the-theme): two axes, tokens, and the rules that
   are not preferences.
7. [The avatars bucket](/staff/developer/the-avatars-bucket), the one file this
   portal stores.
8. [The database](/staff/developer/the-database): the namespace, the row level
   security rule, and how to write a migration.
9. [Authentication](/staff/developer/authentication): two realms, passkeys, and
   the codes.
10. [Vercel](/staff/developer/vercel): two projects on one repository.
11. [Playwright](/staff/developer/playwright), and the screenshot pipeline.
12. [The test scripts](/staff/developer/the-test-scripts), which you can download
    from that page.
13. [The service worker](/staff/developer/the-service-worker), on both sites.
14. [The multilingual layer](/staff/developer/the-multilingual-layer): base rows,
    translation rows, and dictionaries.
15. [The Telegram bot](/staff/developer/the-telegram-bot), which is the one part
    that is not on Vercel.
16. [Conventions worth not relearning](/staff/developer/conventions).
