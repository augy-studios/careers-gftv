---
title: Phases and build status
access: developer
order: 4
summary: One file deciding what has shipped, the disabled control pattern, the placeholder route, and how the mechanism retires.
---

# Phases and build status

**`main-site/assets/build-status.json` is the single source of truth for what
has shipped.** The notice bar reads it, the disabled controls read it, and the
placeholder pages read it. So do `/status`, the Telegram bot and this
documentation site.

Flipping a phase to `shipped` in that file is the only edit needed when it goes
live. **No copy anywhere hardcodes a phase number.**

## What the file holds

Two things. A list of phases, each with a number, a short name, and a status of
`shipped`, `building` or `planned`. Each carries a plain description in both
languages. Then a map of feature keys to phase numbers, such as `saved_jobs: 6`,
`offline: 10` and `telegram_2fa: 11`.

**A shipped phase gains a short note** saying what became available. That is
what makes the file the changelog as well as the switchboard.

## The disabled control pattern

A control for a feature that has not shipped stays visible and disabled, with
the reason on it.

```html
<button data-feature="saved_jobs">Save this role</button>
```

`assets/js/build-status.js` looks the key up in the feature map, disables the
control, and writes the sentence: **Will be available in Phase 6. Sorry for the
inconvenience caused.**

**Hiding it teaches people the feature does not exist.** Showing it disabled
tells them it is coming, which is the whole argument for the pattern.

## Three reasons a control can be disabled, and they are never mixed

| Reason | The claim | Where it comes from |
|---|---|---|
| Not built yet | This arrives in a later phase | `build-status.json` |
| Switched off | It shipped, and it is broken right now | `gftvjobs_settings`, per 8.12 |
| Offline | Your connection, not us | `assets/js/offline.js` |

**The second never edits the first.** `build-status.json` records what has been
built; an override records what is working right now. Conflating the two would
let a deploy silently undo an outage response.

**And each gets its own sentence.** Telling somebody a feature they used last
week will arrive in phase 6 is a lie about a shipped feature. It also makes a
real outage indistinguishable from an unbuilt one.

> [!WARNING]
> A control already disabled for another reason keeps that reason. Coming back
> online re-enables only what the offline pass disabled, and only when nothing
> else still holds the control down.

## Off means off, including the API

A disabled button stops nobody holding the endpoint, a stale tab, or a queued
offline action. So every route behind a flipped feature answers 503 with the
same sentence, through `unavailable()` in `api/_lib/maintenance.js`.

**Some features can never be flipped.** The denylist is in code and not in a
setting: signing in and registration in both realms, and anything the
maintenance page itself depends on. Flipping sign in off would lock everybody
out, including whoever would undo it.

## The placeholder route

A route belonging to a later phase renders `main-site/placeholder.html` in the
normal layout. It carries the same sentence, a line on what that phase covers,
and links to `/status` and `/search`. Never a 404 and never a blank page, and
marked `noindex`.

**`vercel.json` sends unbuilt routes there, and every real page wins anyway**,
because Vercel matches the filesystem before it consults rewrites. That rule is
worth remembering. It is why there is no `main-site/robots.txt` and no
`status/index.html`, and it has caught this build out more than once.

> [!TIP]
> Check a rewrite on a deployment and never locally. A route returning 200 in
> `vercel dev` is not evidence that the platform routes it.

## `/status`, and the two pages behind one address

`api/status-page.js` is rewritten onto `/status`. It has two jobs and shows one
of them at a time.

- **During the build** it lists every phase with its status and description,
  marks the current one, and states plainly that no dates are promised.
- **Once everything has shipped** it becomes a service status page. A headline,
  the features and whether any is switched off, ninety days of uptime, and past
  incidents.

**The switchover is a derivation and not a deploy step.** `everyPhaseShipped()`
in `api/_lib/status.js` reads the same file, so the last phase flipping to
`shipped` is the switchover. There is nothing to remember on the day.

**The two are never on screen together.** A page listing both what is unbuilt
and what is degraded gives a reader two reasons a thing might not work. It gives
them no way to tell which they are looking at.

Staff can see the service page early at `/status?view=service`. It is refused to
anybody with no portal session and it is never cached.

## Retiring the mechanism

When every phase is `shipped`, the notice bar and the placeholder handling come
out. `build-status.json` stays, with its shipped notes, because it is the
changelog and the same mechanism will be useful for whatever comes next.

**The notice bar is replaced and not simply removed.** [The official
banner](/staff/developer/the-official-banner) takes the same slot, and the two
must never both be present.
