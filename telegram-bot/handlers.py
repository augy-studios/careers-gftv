"""The command handlers, and the one rule that decides what answers.

Part 1 builds `start` and nothing else, which is the whole point of a skeleton:
the eight other commands are listed, are registered with Telegram, and answer
with the sentence 0c fixes rather than going quiet or apologising vaguely. Each
later part replaces exactly one entry in `HANDLERS` and no wording anywhere
moves.

**How a command is decided to be available, and why it is not the phase.**
The obvious reading of 0c is that a bot command follows `isFeatureShipped`, the
way a button on the site does. It cannot: `telegram_link`, `telegram_2fa`,
`telegram_notifications` and `invites` all stay unshipped until phase 11 itself
is flipped, and the phase cannot be flipped until the bot has been walked
through by hand, which is impossible if every command refuses until the flip.
That is deviation 92.

So the bot asks two questions in this order:

  1. **Is it built?** Which is `name in HANDLERS`, and nothing else. Through the
     phase this is the honest answer, and it is the one that cannot drift,
     because the check is the registry the dispatcher itself uses.
  2. **Has an admin switched its feature off?** Which only means anything for a
     feature that has shipped, exactly as on the site. Then it is the
     maintenance sentence, never the phase one: telling somebody a feature they
     used last week arrives in phase 11 is a lie about a shipped feature, and it
     makes a real outage indistinguishable from an unbuilt one.

The site's own gate is unaffected and stays where it is. The Link control in
account settings is still disabled until the phase ships, so no ordinary
applicant reaches a half built command by accident; somebody who deliberately
messages the bot during the build reaches one that works, which is the point.
"""

from __future__ import annotations

import html
import logging
import sqlite3
from dataclasses import dataclass

import httpx
from telethon import Button

from build_status import BuildStatus
from commands import BOT_FEATURE, BY_NAME, COMMANDS, Command
from config import Config
from strings import text

log = logging.getLogger("bot.handlers")


@dataclass
class Context:
    """What every handler is given. One object so a new part adds a field."""

    config: Config
    status: BuildStatus
    conn: sqlite3.Connection
    http: httpx.AsyncClient


@dataclass(frozen=True)
class Availability:
    """Whether a command answers, and the sentence to send when it does not."""

    available: bool
    sentence: str | None = None


async def availability(command: Command, ctx: Context, locale: str) -> Availability:
    """Apply the two questions above, in that order."""
    if command.name not in HANDLERS:
        phase = await ctx.status.phase_for_feature(BOT_FEATURE)
        if phase is None:
            # The phase list could not be read from the site or from the
            # checkout. Say so without a number rather than inventing one.
            return Availability(False, text("feature.unavailableUnknown", locale))
        return Availability(False, text("feature.unavailable", locale, phase=phase))

    if command.feature:
        state = await ctx.status.feature(command.feature)
        if state.off:
            sentence = text("feature.maintenance", locale)
            if state.note:
                # Typed by an admin in the middle of an outage and shown as
                # typed, so it is escaped rather than trusted as markup.
                sentence = f"{sentence} {html.escape(state.note)}"
            return Availability(False, sentence)

    return Availability(True)


# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------


async def handle_start(ctx: Context, event, args: str, locale: str) -> None:
    """What this is, what you can ask for, and where to go next.

    There is no `help` command anywhere in this build and this is why: section
    15 puts that content here, so the first thing somebody sends is also the
    thing that explains the rest.

    The command list is drawn from `commands.py` and split by what actually
    answers today, so the message cannot claim more than the bot does.
    """
    parts: list[str] = []

    if args.strip():
        # A deep link payload, from t.me/<bot>?start=<token>. Part 2 turns this
        # into the linking flow. Until then it is answered rather than dropped,
        # because somebody who scanned a QR code deserves to know what happened
        # to it. The payload is a single use secret and is never logged.
        #
        # It goes above the introduction rather than below it: this is the
        # answer to the thing they just did, and burying it under a paragraph
        # about what the portal is reads as no answer at all.
        link_state = await availability(BY_NAME["link"], ctx, locale)
        if not link_state.available:
            separator = text("join.sentence", locale)
            parts.append(
                separator.join([text("start.payload", locale), link_state.sentence])
            )
            log.info("start carried a payload and linking is not built yet")

    parts.append(text("start.intro", locale))

    ready: list[str] = []
    blocked: dict[str, list[str]] = {}

    for command in COMMANDS:
        state = await availability(command, ctx, locale)
        line = f"/{command.name}  {html.escape(command.describe(locale))}"
        if state.available:
            ready.append(line)
        else:
            blocked.setdefault(state.sentence or "", []).append(line)

    if ready:
        parts.append(text("start.commandsHeading", locale) + "\n" + "\n".join(ready))

    for sentence, lines in blocked.items():
        parts.append(
            text("start.unavailableHeading", locale)
            + "\n"
            + "\n".join(lines)
            + f"\n\n{sentence}"
        )

    buttons = [Button.url(text("button.portal", locale), ctx.config.site_url)]
    if ctx.config.donation_url:
        buttons.append(Button.url(text("button.donate", locale), ctx.config.donation_url))

    # No docs link, deliberately. The applicant's guide to this is phase 14's on
    # a site that has nothing on it yet, and section 16's rule is that the link
    # must not ship before the page does.
    await event.respond("\n\n".join(parts), buttons=[buttons], link_preview=False)


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------

# One entry per built command. A part lands by adding its name here, which is
# also what stops `start` from listing it as unbuilt: the registry and the
# message read the same dictionary, so there is nothing to keep in step.
HANDLERS = {
    "start": handle_start,
}
