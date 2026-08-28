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

import hashlib
import html
import logging
import sqlite3
import uuid
from dataclasses import dataclass

import httpx
from telethon import Button

import db
from build_status import BuildStatus
from commands import BOT_FEATURE, BY_NAME, COMMANDS, Command
from config import Config
from lang import locale_for
from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import Supabase, SupabaseError

log = logging.getLogger("bot.handlers")


@dataclass
class Context:
    """What every handler is given. One object so a new part adds a field."""

    config: Config
    status: BuildStatus
    conn: sqlite3.Connection
    http: httpx.AsyncClient
    supabase: Supabase


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
        # A deep link payload, from t.me/<bot>?start=<token>, which is what the
        # QR in account settings encodes. The payload is a single use credential
        # and is never logged, here or anywhere else.
        #
        # The answer goes above the introduction rather than below it: this is
        # the answer to the thing they just did, and burying it under a
        # paragraph about what the portal is reads as no answer at all.
        link_state = await availability(BY_NAME["link"], ctx, locale)

        if not link_state.available:
            parts.append(
                join(locale, text("start.payload", locale), link_state.sentence)
            )
            log.info("start carried a payload and linking is not answering")
        else:
            outcome = await consume_link_token(ctx, event, args.strip())
            locale = outcome.locale or locale

            if outcome.linked:
                # Somebody who has just linked does not need the whole
                # introduction underneath the confirmation. They came from the
                # settings page, so they know what this is, and the command list
                # is one keystroke away.
                await event.respond(outcome.message, link_preview=False)
                return

            parts.append(outcome.message)

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
# Linking, section 15 steps 2 to 5
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LinkOutcome:
    """What happened to a deep link payload, and what to say about it."""

    linked: bool
    message: str
    locale: str | None = None


async def consume_link_token(ctx: Context, event, payload: str) -> LinkOutcome:
    """Turn a `/start <token>` into a link, or explain why not.

    **The token is claimed before the link is written**, in one conditional
    update that answers with the row it moved. Section 15 step 3 lists the other
    order, and this is the safer half of the same thing: two people opening the
    same link in the same second cannot both be handed an account, because only
    one of them owns the token afterwards. See `spend_link_token`.

    **A token that is used, expired or unknown gets one sentence and no
    detail**, per step 5. The three cases are deliberately indistinguishable
    from outside: telling somebody which of them it was tells anybody holding a
    stolen link whether it is worth trying again.
    """
    sender = await event.get_sender()
    telegram_user_id = event.sender_id
    fallback = await client_locale(ctx, sender)

    # Hex SHA-256 of the payload, which is what api/_lib/tokens.js stored. The
    # token itself is never written down anywhere on this side.
    token_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    try:
        existing = await ctx.supabase.link_for_telegram_user(telegram_user_id)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read the link for this telegram account: %s", cause)
        return LinkOutcome(False, text("link.unavailable", fallback), fallback)

    if existing:
        # Already linked. Answered before the token is spent, so somebody who
        # taps an old link twice does not burn a fresh one to be told this.
        applicant = await safe_applicant(ctx, existing["applicant_id"])
        locale = account_locale(applicant, fallback)
        key = "link.alreadyThis" if applicant else "link.alreadyOther"
        return LinkOutcome(False, text(key, locale), locale)

    try:
        token = await ctx.supabase.spend_link_token(token_hash)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not spend a linking token: %s", cause)
        return LinkOutcome(False, text("link.unavailable", fallback), fallback)

    if token is None:
        log.info("a linking token was refused: used, expired or unknown")
        return LinkOutcome(False, text("link.refused", fallback), fallback)

    applicant = await safe_applicant(ctx, token["applicant_id"])
    locale = account_locale(applicant, fallback)

    try:
        link = await ctx.supabase.create_link(
            token["applicant_id"],
            telegram_user_id,
            getattr(sender, "username", None),
            display_name(sender),
        )
    except (SupabaseError, httpx.HTTPError) as cause:
        # The token is spent and there is no link. Migration 011's unique
        # constraint on applicant_id is the likely cause: the account linked a
        # different Telegram account while this token was in flight.
        log.error("could not write the link: %s", cause)
        return LinkOutcome(False, text("link.failed", locale), locale)

    log.info("linked telegram %s to an applicant account", telegram_user_id)

    await ctx.supabase.audit(
        "telegram_linked",
        applicant,
        {"source": "bot", "telegram_user_id": telegram_user_id},
        target_id=link.get("id"),
    )

    who = (applicant or {}).get("display_name") or (applicant or {}).get("username")
    message = (
        text("link.done", locale, who=html.escape(str(who)))
        if who
        else text("link.doneNoName", locale)
    )
    return LinkOutcome(True, message, locale)


async def handle_link(ctx: Context, event, args: str, locale: str) -> None:
    """For somebody who found the bot before the site. Section 15's command list.

    There is nothing this end can do on its own, and that is not a gap. The bot
    has no way to know which portal account is asking, and a bot that accepted a
    username here would be a bot that could be talked into linking somebody
    else's account. So it says where the button is, and the button is on a page
    that already knows who is signed in.
    """
    link = await current_link(ctx, event)
    if link is not None:
        await event.respond(text("link.alreadyThis", locale), link_preview=False)
        return

    await event.respond(
        text("link.instructions", locale),
        buttons=[[Button.url(text("button.settings", locale), settings_url(ctx))]],
        link_preview=False,
    )


async def handle_unlink(ctx: Context, event, args: str, locale: str) -> None:
    """Remove the link, behind a confirmation button. Section 15's command list.

    The button's meaning is stored in SQLite and looked up on click, per section
    15, so it keeps working across every restart. What is packed into the
    callback data is an opaque id and nothing else: a button that carried an
    account id in its payload would be a button somebody could forge.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("unlink.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(applicant, locale)

    callback_id = uuid.uuid4().hex
    db.remember_callback(
        ctx.conn,
        callback_id,
        "unlink",
        {"applicant_id": link["applicant_id"], "locale": locale},
        telegram_user_id=event.sender_id,
        chat_id=event.chat_id,
    )

    await event.respond(
        text("unlink.confirm", locale),
        buttons=[
            [
                Button.inline(text("button.unlinkYes", locale), f"cb:{callback_id}".encode()),
                Button.inline(text("button.unlinkNo", locale), b"cb:cancel"),
            ]
        ],
        link_preview=False,
    )


async def handle_unlink_callback(ctx: Context, event, record: dict) -> None:
    """The confirmation button coming back.

    **Who clicked is checked against who was offered the button.** A message can
    be forwarded, and an inline button in a forwarded message is still live for
    whoever taps it. The registry stores the Telegram account the button was
    drawn for, and a click from anybody else is answered and ignored.
    """
    locale = record["payload"].get("locale") or DEFAULT_LOCALE

    if record["telegram_user_id"] not in (None, event.sender_id):
        await event.answer(text("callback.notYours", locale), alert=True)
        return

    applicant_id = record["payload"].get("applicant_id")
    applicant = await safe_applicant(ctx, applicant_id)

    try:
        removed = await ctx.supabase.remove_link(applicant_id)
        skipped = (
            await ctx.supabase.skip_queued(
                applicant_id, "telegram unlinked before it was sent"
            )
            if removed
            else 0
        )
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not unlink: %s", cause)
        await event.answer(text("unlink.failed", locale), alert=True)
        return

    if removed:
        log.info("unlinked an applicant from telegram, %d queued rows skipped", skipped)
        await ctx.supabase.audit(
            "telegram_unlinked", applicant, {"source": "bot", "skipped": skipped}
        )

    await event.answer()
    await event.edit(text("unlink.done" if removed else "unlink.notLinked", locale))


# ---------------------------------------------------------------------------
# Small shared things
# ---------------------------------------------------------------------------


def settings_url(ctx: Context) -> str:
    return f"{ctx.config.site_url}/account/settings"


def join(locale: str, *sentences: str) -> str:
    """Two sentences on one line, spaced the way the language wants."""
    return text("join.sentence", locale).join(s for s in sentences if s)


def display_name(sender) -> str | None:
    first = getattr(sender, "first_name", None) or ""
    last = getattr(sender, "last_name", None) or ""
    full = f"{first} {last}".strip()
    return full or None


async def client_locale(ctx: Context, sender) -> str:
    """The language to use for somebody with no account to read one from."""
    supported = tuple(name for name in await ctx.status.locales() if name in STRINGS)
    return locale_for(getattr(sender, "lang_code", None), supported or (DEFAULT_LOCALE,))


def account_locale(applicant: dict | None, fallback: str) -> str:
    """The account's own language, which wins the moment there is an account."""
    stored = (applicant or {}).get("locale")
    return stored if stored in STRINGS else fallback


async def safe_applicant(ctx: Context, applicant_id: str | None) -> dict | None:
    """Read the account, and treat a failure as not knowing rather than as no."""
    if not applicant_id:
        return None
    try:
        return await ctx.supabase.applicant(applicant_id)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.warning("could not read applicant %s: %s", applicant_id, cause)
        return None


async def current_link(ctx: Context, event) -> dict | None:
    try:
        return await ctx.supabase.link_for_telegram_user(event.sender_id)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read the link: %s", cause)
        return None


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------

# One entry per built command. A part lands by adding its name here, which is
# also what stops `start` from listing it as unbuilt: the registry and the
# message read the same dictionary, so there is nothing to keep in step.
HANDLERS = {
    "start": handle_start,
    "link": handle_link,
    "unlink": handle_unlink,
}

# The same idea for buttons. A callback row's `kind` decides what runs, so a
# button drawn six weeks ago still means what it meant, which is the whole
# reason section 15 asks for the registry to be in SQLite.
CALLBACKS = {
    "unlink": handle_unlink_callback,
}
