---
title: 0c. Shipping in public
access: developer
order: 3
summary: Each phase gets pushed to GitHub and deployed to production as it finishes.
---

# 0c. Shipping in public

Each phase gets pushed to GitHub and deployed to production as it finishes. The site is live and usable from phase 3 onward while later phases are still unbuilt. So the interface has to be honest about what is not there yet.

### Rules for shipping mid build

- `main` is always deployable. A phase lands as a branch merged when it works, never as a half finished commit on `main`.
- The full migration set from phase 1 is run on day one, so the database runs ahead of the interface. That is deliberate. It means a feature switching on in a later phase needs no new SQL.
- Never ship a control that calls an endpoint that does not exist yet. Unbuilt features are shown in the disabled state described below, and the click handler does nothing but explain.

### Build status source of truth

- One file, `main-site/assets/build-status.json`, holding the phase list. Each entry has a number, a short name, a status of `shipped`, `building`, or `planned`, and a plain description. Alongside it, a map of feature keys to phase numbers, for example `saved_jobs: 6`, `telegram_2fa: 11`, `offline: 10`.
- Everything else reads from that file. Flipping a phase to `shipped` is the only edit needed when it goes live, and no copy anywhere hardcodes a phase number.
- The Telegram bot and the docs site read the same file, so the three stay in step.

### How it appears

- **Site wide notice.** A slim, dismissible bar at the top reading that Careers@GFTV is being built and released in phases, with a link to the status page. Dismissal is remembered locally and resets when a phase ships. Keep it quiet, one line, no colour shouting.
- **Disabled controls.** Any control for a feature that has not shipped stays visible and disabled, and is never hidden. The reason goes on it: "Will be available in Phase 5. Sorry for the inconvenience caused." Use that wording exactly, with the phase number pulled from the feature map. Hiding it teaches people the feature does not exist; showing it disabled tells them it is coming.

### Maintenance switches

A second reason a control can be disabled, added 21 August 2026 and built in phase 7, per 8.12. A feature that has shipped can break, or need taking down while something is fixed. Until now the only lever for that was a deploy.

- **An admin can flip any shipped feature off temporarily.** It goes back on the same way. This is not a phase change and it never edits `build-status.json`. That file is the record of what has been built, and an override is the record of what is working right now. Conflating the two would make a deploy silently undo an outage response.
- **The override lives in the database**, in `gftvjobs_settings`, because an admin cannot edit a file in the repo from a dashboard. The phase list stays a static file read by all three consumers; the override is read alongside it and merged at the point of use.
- **"Off" means off, including the API.** Every route behind a flipped feature answers 503 with the same sentence. A disabled button stops nobody who has the endpoint, a stale tab, or a queued offline action from phase 10. And if a feature is off because it is broken, then the endpoint is the broken thing.
- **It gets its own sentence, not the phase one.** "Temporarily unavailable while we fix something", plus whatever note the admin wrote, which is optional and is shown to the public as typed. Telling somebody a feature they used last week "will be available in Phase 6" is a lie about a shipped feature. It also makes a real outage indistinguishable from an unbuilt one.
- **Some features can never be flipped.** They are held in a fixed denylist in code, and never as a setting. That covers signing in and registration in both realms, and anything the maintenance page itself depends on. Flipping sign in off locks every applicant out with no way back and can lock the admin out of the page that would undo it. The page shows those switches as permanently unavailable and says why, instead of hiding them.
- **The status page says so.** A feature that is off appears on `/status` as currently unavailable with its note. That page is already where somebody goes to find out what is going on.
- **Unbuilt routes.** A route belonging to a later phase renders a placeholder page in the normal layout. It carries the same sentence, a line on what that phase covers, and links to the status page and to `/search`. Never a 404, never a blank page, and mark these `noindex`.
- **Status page at `/status`.** Public, linked from the footer and the notice bar. Lists every phase with its status and description, marks the current one, and states plainly that dates are not promised. It doubles as the changelog: when a phase ships, its entry gains a short line about what became available.
- **Admin dashboard.** Same treatment. A staff member clicking an unbuilt section gets the same message instead of an empty screen.
- **Telegram bot.** A command whose backing feature has not shipped replies with the same sentence, instead of failing or going quiet.
- **Docs site.** Any page documenting an unshipped feature carries a note callout at the top with the same sentence. So the documentation can be written ahead of the build without misleading anyone.

### Retiring it

When every phase is `shipped`, remove the notice bar and the placeholder route handling. Leave `build-status.json` in place, since the same mechanism will be useful for whatever comes after, and keep the shipped notes on it as the changelog.

**`/status` is repurposed and not retired**, and this is the one part of the build status mechanism that outlives the build. Once nothing is unbuilt, the question the page answers changes. It goes from "what is not here yet" to "is it working right now". That is the question people actually arrive at a status page with. Added 26 August 2026, and specified in full below.

### The service status page, after the build

Modelled on how Atlassian's status pages read: a headline state, a component list, uptime history, and past incidents. Public, unauthenticated, still linked from the footer.

**The one rule everything else here follows: the page never claims to know more than it does.** A status page that says "all systems operational" because it could not reach anything is worse than no page. That is the specific failure mode this section exists to prevent. Every panel below distinguishes three states, not two: working, not working, and no answer.

#### Four panels

1. **The headline.** One sentence and one colour: everything is working, something is degraded, or something is down. Derived, never typed by hand, so it cannot disagree with the panels beneath it.

2. **Components, live.** Every flippable feature from the feature map, drawn from the same `feature_overrides` the maintenance switches write, through the existing `api/public/feature-status`. A feature switched off shows as unavailable with the admin's note, exactly as it does mid build. The denylisted features are listed too, and always as available. They cannot be switched off, and omitting them would make the list look shorter than the site.

3. **Uptime, ninety days.** A bar per component, one segment per day, from real probe data and not from anything the portal says about itself. See the probe below.

4. **Incidents.** Two sources, labelled differently, because they are different claims:
   - **Declared.** An admin flipped a feature off and on again. The start, the end, the note, and the duration, all derivable from the `FEATURE_DISABLED` and `FEATURE_ENABLED` audit rows that already exist. 8.12 logs both directions for exactly this reason: an outage nobody recorded the end of is one nobody can measure.
   - **Observed.** The probe could not reach something, with nobody declaring anything. These are the ones worth having, because they are the outages nobody was awake for.

#### The probe, and why it is not on Vercel

**A status page hosted on the thing it monitors is useless during the outage it exists to report.** That is the whole reason Statuspage is a separate service, and it is not a problem that can be solved by being careful.

So the probe runs on the Debian VPS that already hosts the Telegram bot, per section 15. That machine is the only component in this architecture genuinely outside Vercel. It already runs continuously, it already holds `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, and it is already in this repository. It is a loop in a process that exists, and not a new service.

- **Every sixty seconds**, request a small fixed set of public endpoints. Record the status code and the response time for each: `/api/public/feature-status`, `/search`, one seeded posting page, and `/api/public/jobs.json`. Public and read only, all four, so the probe never writes anything to the portal and never needs a credential to it.
- **Write to `gftvjobs_status_days` and `gftvjobs_status_incidents`**, which are new tables. Write direct from the VPS with the service key, through the one function that owns them. Not through an endpoint on the portal, since an endpoint on the portal is unreachable in exactly the case that matters.
- **Keep ninety days.** The daily cron in section 11 sweeps beyond that, alongside everything else it deletes.
- **A probe that cannot reach Supabase writes nothing and says nothing.** It does not retry into a backlog and it does not buffer locally. A gap in the data is an honest gap, and the page draws it as "no data" and never as either state.
- **The bot is not the monitor.** It does not message anybody about a failed probe. Alerting is a separate decision with a separate on-call story attached, and it is out of scope here. What this buys is a page somebody can look at, which is what was asked for.

#### What the page must not do

- **Never show a green day it did not measure.** A day with no probe data is drawn as unknown, in a neutral colour, and the legend names that state.
- **Never compute a headline uptime percentage across a period with gaps** without saying what the coverage was. "99.9% over 90 days" from 60 days of data is a fabrication with a decimal point on it.
- **Never report on the docs site or the Telegram bot from this page** unless they are probed too. A component list that quietly covers only the portal, while looking like it covers the project, is the same lie in a different shape.
- **Keep it readable with no JavaScript and no session**, and cache it briefly at the edge. It is the page people load when things are going wrong, and it should be the cheapest page on the site.

#### When

The probe, the table, and the rebuilt page belong to **phase 12**. They sit alongside the other things that only make sense once the build is finished. The switchover itself is dropping the phase list from the page. It is gated on every phase being `shipped`, so the two halves can be built and then turned over, and never raced.

Until then `/status` keeps its current job. The two must not be shown at once. A page listing both what is unbuilt and what is degraded gives a reader two different reasons a thing might not work. It gives them no way to tell which they are looking at. That is the same confusion the maintenance switches got their own sentence to avoid.

**The notice bar is replaced and not simply removed.** The official site banner in `gftv-official.md` takes the same slot at the top of every page. It is a slim, permanent, collapsible bar. It states that this is an official Global Furry Television site, and teaches a reader how to check that themselves. It is modelled on the Singapore Government masthead.

The two must never both be present. One is temporary and dismissible, the other is permanent and is not, and two stacked bars above the header is worse than either alone.

That file is portable across GFTV projects and holds the full specification. That is behaviour, markup, styling from the theme tokens, responsive rules, accessibility, and the copy in both languages. Three things from it are worth repeating here, because they are the parts most likely to be softened by someone implementing it in a hurry:

- **It cannot be dismissible.** A bar a reader can close is a bar they see once, which defeats the education it exists for.
- **It must not claim the site is safe or verified.** Any phishing site can copy the banner exactly. Its only real value is teaching the rule: official GFTV sites end with `globalfurry.tv` or `gftv.asia`, and a domain is read from the end. That knowledge is what protects someone on the fake site, where the banner will also be present and also lying.
- **No link to a trusted sites page until that page exists.** A trust banner whose "see the full list" link 404s is worse than one with no link.
