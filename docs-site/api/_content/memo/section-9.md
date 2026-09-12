---
title: 9. After the build
access: developer
order: 9
summary: Changes to a finished site, dated, in the order they were made.
---

# 9. After the build

Changes to a finished site, dated, in the order they were made. None is a
phase and none is a part. Each says what it touched and which check holds it.

1. **13 September 2026, the day after. The docs deploy, the flag, the way
   back to the phase list, the word "Status", and the probe.** Five things,
   found one after another by looking at the live site the morning after the
   flip. The first two are in part 3's write-up and deviation 143, because
   they are corrections to part 3 and rode with it. The other three are
   below.

   **The phase list had no address.** `viewFor()` served the service page
   once every phase read `shipped`, and the only hatch, `?view=service`, went
   the other way. So `?view=build` is its mirror. The same staff session, the
   build page after the flip, `private, no-store` and `Vary: Cookie` like the
   preview, and nothing for anybody else. The navigation and footer items
   say "Status" in both languages now, with a heartbeat for the icon. The
   hammer said build, and the page is about whether the site works. Five
   guide passages that sent readers to "the build status page" for the phase
   list are in the past tense, in both languages. `--only=banner` fails on a
   guide that still uses the phrase.

   **The status page showed one green square in ninety days.** Every other
   day was blank, and the page was right. The probe had recorded one check,
   on 31 August when part 7 was tested, and nothing since. `probe.py` lived
   in `telegram-bot/` because the VPS is the only machine outside Vercel.
   That got it read as part of the bot, which was started, while the probe
   was not. **It moved to `status-probe/` at the repository root**, asked for
   the same day. Its own virtualenv, `.env` with the same three values, lock,
   log, `run.sh` and a README. And a `setup.md` with a tmux window and a
   systemd unit. A process whose job is to be there when nobody is looking
   should survive a reboot without anybody remembering. It imports nothing
   from the bot; `lock.py` and `log.py` are copies, and the headers of both
   say so. The one Supabase call it makes is its own forty line client, so
   the bot's `strings.py` does not come with it. `tests/phase12-test.mjs
   --only=status` reads the new path. **Until it is started on the VPS, the
   ninety day bars stay blank**, and that is the page telling the truth.
