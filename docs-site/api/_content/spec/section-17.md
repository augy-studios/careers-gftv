---
title: 17. Deliverables
access: developer
order: 20
---

# 17. Deliverables

- Full working repo following the structure above.
- The `migrations/` directory with every numbered SQL file, its README, and the rollback blocks.
- `sitemap.xml`, `robots.txt`, and `llms.txt` on both sites, per section 4.
- Root README covering setup, environment variables, Supabase configuration, Vercel deployment, and the custom domain setup for `careers.globalfurry.tv`.
- `main-site/.env.example` as specified in section 2, with a how-to-obtain comment on every variable.
- The four READMEs described in section 2, kept current through every phase.
- Seed script with a few sample departments and job postings for local testing.
- The `telegram-bot` directory per section 15, with its own README, setup.md, .gitignore, and .env.example, delivered as individual files.
- `next-steps.md` kept current through every phase, per section 0b, and gitignored.
- `build-status.json` kept current as phases ship, per section 0c.
- The `docs-site` directory per section 16, with its own README and its own `.env.example`. It has its own `api/` and staff login per 5h, and the role gate per 16a. Then the four guides per 16h, the Playwright capture script, and the screenshot manifest.
- The staff account settings suite and its danger zone per 5f, built once and mounted on both sites, plus staff account recovery codes per 5g.
- The `assets/i18n/` dictionaries, kept in key parity across every language, and the locale and translation tables per 3a.
- The `/admin/docs` redirect per 8a. No in-portal admin documentation, and no `main-site/api/_admin-docs/`.
- A short offline test checklist in the README. Install the app, load the board, then go offline. Browse a cached posting, rate it, and answer the modal. Come back online and confirm the queue flushed.
- Deliver files individually, never as a zip.
