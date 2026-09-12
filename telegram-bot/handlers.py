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
from datetime import datetime, timedelta, timezone

import httpx
from telethon import Button
from telethon.errors import MessageNotModifiedError

import db
import docs
from build_status import BuildStatus
from commands import BOT_FEATURE, BY_NAME, COMMANDS, Command
from config import Config
from feed import JobFeed
from lang import locale_for
from reply import (
    bullets,
    edit_rich_message,
    from_html,
    heading,
    join_rich,
    lines as rich_lines,
    send_rich_message,
    table,
    titled,
)
from security import copy_code_row, hash_code, six_digits
from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import NOTIFY_COLUMN, Supabase, SupabaseError

log = logging.getLogger("bot.handlers")


async def redraw(event, body: str, **kwargs) -> None:
    """Edit the message a button was on, and accept that it may already say so.

    Telegram refuses an edit that changes nothing, with `MessageNotModifiedError`.
    A keyboard redrawn after a tap can be identical to the one already there:
    the language button somebody is already on, the docs page they are already
    reading. Found on 11 September 2026 by tapping the current language under
    `/language`, which logged a traceback for a message that was correct as it
    stood. A redraw that draws what is there is a redraw that worked.
    """
    try:
        await event.edit(body, **kwargs)
    except MessageNotModifiedError:
        pass


@dataclass
class Context:
    """What every handler is given. One object so a new part adds a field."""

    config: Config
    status: BuildStatus
    conn: sqlite3.Connection
    http: httpx.AsyncClient
    supabase: Supabase
    # Part 6. `/jobs` reads the site's public feed rather than the postings
    # table, so the board and the chat cannot disagree about what is live.
    feed: JobFeed


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
    parts: list[dict] = []

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
                from_html(join(locale, text("start.payload", locale), link_state.sentence))
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

            parts.append(from_html(outcome.message))

    # The introduction is the heading and two paragraphs, and the command list
    # is a table under its own heading: a rich message since phase 15 part 2,
    # so a current client draws the list as columns instead of a run of lines.
    parts.append(titled(text("start.intro", locale)))

    ready: list[list] = []
    blocked: dict[str, list[list]] = {}
    columns = [text("table.command", locale), text("table.describe", locale)]

    for command in COMMANDS:
        state = await availability(command, ctx, locale)
        row = [from_html(f"<code>/{command.name}</code>"), from_html(html.escape(command.describe(locale)))]
        if state.available:
            ready.append(row)
        else:
            blocked.setdefault(state.sentence or "", []).append(row)

    if ready:
        parts.append(
            join_rich([heading(text("start.commandsHeading", locale), 2), table(columns, ready)])
        )

    for sentence, rows in blocked.items():
        parts.append(
            join_rich(
                [
                    heading(text("start.unavailableHeading", locale), 2),
                    table(columns, rows),
                    from_html(sentence),
                ]
            )
        )

    buttons = [Button.url(text("button.portal", locale), ctx.config.site_url)]
    if ctx.config.donation_url:
        buttons.append(Button.url(text("button.donate", locale), ctx.config.donation_url))

    # **The docs link, held back since phase 11 and drawn from part 10.** 16's
    # cross link rule is that a link must not ship before the page does, and the
    # bot guide is live now. It is still conditional, on the same rule read the
    # other way: DOCS_URL is what says where the site is, and a button built
    # without it would point at nothing.
    if ctx.config.docs_url:
        buttons.append(Button.url(text("button.docs", locale), ctx.config.docs_url))

    await send_rich_message(event.client, event.chat_id, join_rich(parts), [buttons])


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
        locale = account_locale(ctx, event, applicant, fallback)
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
    locale = account_locale(ctx, event, applicant, fallback)

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
    locale = account_locale(ctx, event, applicant, locale)

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
    await redraw(event, text("unlink.done" if removed else "unlink.notLinked", locale))


# ---------------------------------------------------------------------------
# code, section 15's login codes
# ---------------------------------------------------------------------------


async def handle_code(ctx: Context, event, args: str, locale: str) -> None:
    """Issue a sign in code on request. Section 15's command list.

    **This one generates and sends in place rather than through the loop**, and
    the difference is who is waiting. `security.py` exists because the site
    cannot send and has to leave a request for something that can; here the
    person is in this chat, the bot is already holding the message, and going
    through a table to talk to itself two seconds later would be a round trip
    for nothing.

    What it does not skip is any of the rules. The link is read now rather than
    assumed, the older codes are spent before a new one is written, the hash is
    stored and the digits are not, and no magic link is ever made: nothing here
    came from a browser, and a one tap sign in link with nothing to bind it to
    is a credential anybody who sees the message can use.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("code.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)

    if link.get("twofa_enabled") is not True:
        # A code for an account that does not ask for one has nowhere to be
        # typed: the sign in never reaches a second step, and the danger zone
        # only asks when the switch is on. Issuing one anyway would be handing
        # somebody a credential that cannot be used, which is worse than a
        # sentence saying where the switch is.
        await event.respond(text("code.notEnabled", locale), link_preview=False)
        return

    # Section 15's per Telegram user limit. The site holds the per account half
    # and cannot hold this one, because it never learns who is typing.
    wait = db.note_attempt(ctx.conn, "code", str(event.sender_id))
    if wait:
        # Named rather than silent, per section 15: "back off after repeated
        # failures rather than silently ignoring them."
        await event.respond(
            text("code.tooMany", locale, minutes=max(1, wait // 60)),
            link_preview=False,
        )
        return

    code = six_digits()

    try:
        await ctx.supabase.spend_codes(link["applicant_id"])
        await ctx.supabase.create_code_row(
            link["applicant_id"],
            await hash_code(code),
            code_expiry(),
        )
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not issue a code: %s", cause)
        await event.respond(text("code.failed", locale), link_preview=False)
        return

    log.info("issued a sign in code on request")
    # The same copy button the pushed code carries, from the same helper. No
    # sign in button ever goes on this one: nothing here came from a browser,
    # and the docstring above says why that matters.
    copy_row = copy_code_row(code, locale)
    await event.respond(
        text("code.message", locale, code=html.escape(code)),
        buttons=[copy_row] if copy_row else None,
        link_preview=False,
    )


def code_expiry() -> str:
    """Five minutes from now, per section 15, in the shape PostgREST wants."""
    return (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()


# ---------------------------------------------------------------------------
# notify, section 15's per kind toggles
# ---------------------------------------------------------------------------

# The order the four appear in, which is the order somebody meets them: an
# invitation is the message this whole channel exists for, a task is the ordinary
# one, a decision is the rare one, and a confirmation is the one the portal
# makes on their behalf. The labels come from `strings.py` keyed on the kind, so
# a kind added later needs one string and no code here. The fourth is phase
# 14's, and the column behind it is migration 043's.
NOTIFY_KINDS = ("invite", "task_raised", "application_status_changed", "application_confirmed")


async def handle_notify(ctx: Context, event, args: str, locale: str) -> None:
    """Choose which notifications arrive here. Section 15's command list.

    **The toggles are only here, and that is a decision rather than an
    omission.** The site could carry the same three switches on the settings
    panel; two places writing one row is how two sentences about one rule drift
    apart, and this is the place section 15 names.

    **Security messages are not in the list**, per section 15, and the message
    says so rather than leaving somebody hunting for the switch that turns a
    login code off. Silencing those is what an attacker would want.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("notify.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)

    await send_rich_message(
        event.client,
        event.chat_id,
        titled(text("notify.intro", locale)),
        notify_buttons(ctx, link, locale, event.sender_id, event.chat_id),
    )


def notify_buttons(ctx: Context, link: dict, locale: str, telegram_user_id: int, chat_id: int):
    """One row per kind, each button showing the state it is in now.

    **A button's meaning is the kind and never the value.** The registry row says
    "this button toggles invitations for this account", so a message from six
    weeks ago still does the right thing when the switch has been flipped twice
    since, and the redraw after a click reuses the same three ids rather than
    writing three more rows for every tap.
    """
    rows = []

    for kind in NOTIFY_KINDS:
        column = NOTIFY_COLUMN[kind]
        # A column PostgREST did not return reads as on, exactly as the drain
        # treats it: migration 011 defaults all three to true, and the state
        # drawn here has to be the state that decides whether a message is sent.
        on = link.get(column) is not False

        callback_id = notify_callback_id(ctx, link, kind, locale, telegram_user_id, chat_id)
        label = text(f"notify.state.{'on' if on else 'off'}", locale, kind=text(f"notify.kind.{kind}", locale))
        rows.append([Button.inline(label, f"cb:{callback_id}".encode())])

    return rows


def notify_callback_id(
    ctx: Context, link: dict, kind: str, locale: str, telegram_user_id: int, chat_id: int
) -> str:
    """A stable id per account and kind, so a redraw does not grow the registry.

    Derived rather than random, which is the one place in this build a callback
    id is: the three buttons on this message are redrawn on every tap, and a
    fresh uuid each time would write three rows per click for ever. It is a hash
    of the account, the kind and a per install secret, so it is not guessable
    from outside and the click check below still decides who may use it.
    """
    material = f"notify:{link['applicant_id']}:{kind}:{telegram_user_id}"
    callback_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

    db.remember_callback(
        ctx.conn,
        callback_id,
        "notify",
        {"applicant_id": link["applicant_id"], "kind": kind, "locale": locale},
        telegram_user_id=telegram_user_id,
        chat_id=chat_id,
    )
    return callback_id


async def handle_notify_callback(ctx: Context, event, record: dict) -> None:
    """One toggle, flipped, and the whole keyboard redrawn from what is stored.

    **The value is read live rather than carried in the button**, so two taps
    from two devices end with the switch in the state the second one asked for
    rather than in whatever the older message thought it was.
    """
    locale = record["payload"].get("locale") or DEFAULT_LOCALE

    if record["telegram_user_id"] not in (None, event.sender_id):
        await event.answer(text("callback.notYours", locale), alert=True)
        return

    kind = record["payload"].get("kind")
    column = NOTIFY_COLUMN.get(kind)
    if column is None:
        await event.answer(text("callback.unknown", locale), alert=True)
        return

    # The link is re-read rather than trusted, which also answers the case that
    # matters: somebody who unlinked since this message was sent has no row to
    # write to, and telling them the switch moved would be a lie.
    link = await current_link(ctx, event)
    if link is None or link["applicant_id"] != record["payload"].get("applicant_id"):
        await event.answer(text("notify.gone", locale), alert=True)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)
    wanted = link.get(column) is False

    try:
        updated = await ctx.supabase.set_notify(link["applicant_id"], column, wanted)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not change a notify toggle: %s", cause)
        await event.answer(text("notify.failed", locale), alert=True)
        return

    await event.answer(
        text(
            "notify.changed",
            locale,
            kind=text(f"notify.kind.{kind}", locale),
            state=text(f"notify.word.{'on' if wanted else 'off'}", locale),
        )
    )
    await edit_rich_message(
        event.client,
        event,
        titled(text("notify.intro", locale)),
        notify_buttons(
            ctx, updated or link, locale, event.sender_id, record["chat_id"] or event.chat_id
        ),
    )


# ---------------------------------------------------------------------------
# language, phase 14. A language for this chat, in front of the account's.
# ---------------------------------------------------------------------------


async def handle_language(ctx: Context, event, args: str, locale: str) -> None:
    """Choose the language this chat is written in, or go back to the account's.

    **The portal's own setting is untouched, and by default it decides.**
    Section 15 has the bot follow the language stored on the account, and it
    still does: an absent row in `chat_locales` is the ordinary state and it
    means exactly that. What this adds is a choice that belongs to the chat,
    for somebody who reads the portal in one language and wants the guides, or
    everything else the bot says, in another. Asked for on 11 September 2026,
    and extended from `/docs` alone to the whole bot the same day.

    **It needs no account and obeys no feature switch.** A stranger can choose
    a language before linking anything, and a person turned away from a
    language control during an outage is a person who cannot read the sentence
    telling them about it. `start` and `docs` obey nothing for the same reason.
    """
    await event.respond(
        language_intro(ctx, event, locale),
        buttons=await language_buttons(ctx, event, locale),
        link_preview=False,
    )


def language_intro(ctx: Context, event, locale: str) -> str:
    """The message above the buttons, saying which rule is in force now."""
    chosen = chat_locale_for(ctx, event)
    if chosen is None:
        return text("language.intro", locale) + "\n\n" + text("language.followingAccount", locale)
    return text("language.intro", locale) + "\n\n" + text(
        "language.chosen", locale, name=text(f"language.name.{chosen}", locale)
    )


async def language_buttons(ctx: Context, event, locale: str):
    """One button per language the bot can speak, and one to follow the account.

    The list is the build's shipped locales filtered by what `strings.py`
    carries, which is the same list `resolve_locale` answers from: a language
    the site ships before the bot does is not offered here, because choosing it
    would render English under a heading in another script.
    """
    supported = tuple(name for name in await ctx.status.locales() if name in STRINGS) or (DEFAULT_LOCALE,)
    chosen = chat_locale_for(ctx, event)

    rows = []
    for name in supported:
        label = text(f"language.name.{name}", locale)
        if name == chosen:
            label = text("language.current", locale, name=label)
        callback_id = language_callback_id(ctx, name, event.sender_id, event.chat_id)
        rows.append([Button.inline(label, f"cb:{callback_id}".encode())])

    follow = text("language.follow", locale)
    if chosen is None:
        follow = text("language.current", locale, name=follow)
    callback_id = language_callback_id(ctx, None, event.sender_id, event.chat_id)
    rows.append([Button.inline(follow, f"cb:{callback_id}".encode())])
    return rows


def language_callback_id(ctx: Context, name: str | None, telegram_user_id: int, chat_id: int) -> str:
    """A stable id per user and choice, so a redraw does not grow the registry.

    The same shape as `/notify`'s: the keyboard is redrawn on every tap, and a
    fresh uuid each time would write a row per button per click for ever.
    """
    material = f"language:{name or '-'}:{telegram_user_id}"
    callback_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]
    db.remember_callback(
        ctx.conn,
        callback_id,
        "language",
        {"locale": name},
        telegram_user_id=telegram_user_id,
        chat_id=chat_id,
    )
    return callback_id


async def handle_language_callback(ctx: Context, event, record: dict) -> None:
    """One language chosen, or the choice cleared, and the keyboard redrawn.

    The reply is written in the language just chosen, which is the one piece of
    evidence that the choice took: a confirmation in the old language would be
    the bot saying it changed while demonstrating that it had not.
    """
    if record["telegram_user_id"] not in (None, event.sender_id):
        await event.answer(text("callback.notYours", DEFAULT_LOCALE), alert=True)
        return

    wanted = record["payload"].get("locale")
    if wanted is not None and wanted not in STRINGS:
        await event.answer(text("callback.unknown", DEFAULT_LOCALE), alert=True)
        return

    db.set_chat_locale(ctx.conn, event.sender_id, wanted)

    if wanted is None:
        # Back to the account's language, or the client's for a stranger, which
        # is what the dispatcher would resolve for the next message.
        link = await current_link(ctx, event)
        applicant = await safe_applicant(ctx, link["applicant_id"]) if link else None
        sender = None
        try:
            sender = await event.get_sender()
        except Exception:  # noqa: BLE001 - never let this decide whether we reply
            pass
        locale = account_locale(ctx, event, applicant, await client_locale(ctx, sender))
        await event.answer(text("language.cleared", locale))
    else:
        locale = wanted
        await event.answer(text("language.changed", locale, name=text(f"language.name.{locale}", locale)))

    await redraw(
        event,
        language_intro(ctx, event, locale),
        buttons=await language_buttons(ctx, event, locale),
        link_preview=False,
    )


async def handle_decline_callback(ctx: Context, event, record: dict) -> None:
    """The decline button on an invitation, per section 15.

    **It writes to `gftvjobs_invites` and to nothing else.** The task on the
    dashboard is left exactly where it is, because it is the record that this
    person was invited and that record does not change when they say no thank
    you. What changes is the invite's status, which is what an admin reads.

    A row already withdrawn, applied to, or declined is answered without being
    written, and the filter rather than a check is what makes that true even for
    two taps a second apart.
    """
    locale = record["payload"].get("locale") or DEFAULT_LOCALE

    if record["telegram_user_id"] not in (None, event.sender_id):
        await event.answer(text("callback.notYours", locale), alert=True)
        return

    job_id = record["payload"].get("job_id")
    applicant_id = record["payload"].get("applicant_id")

    try:
        declined = await ctx.supabase.decline_invite(job_id, applicant_id)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not decline an invite: %s", cause)
        await event.answer(text("notify.failed", locale), alert=True)
        return

    if not declined:
        # Withdrawn by the poster, applied to already, or declined a moment ago
        # on another device. All three are "there is nothing here to decline",
        # and none of them is an error worth an alert about our own tables.
        await event.answer(text("decline.nothing", locale), alert=True)
        return

    applicant = await safe_applicant(ctx, applicant_id)
    log.info("an invitation was declined from telegram")
    await ctx.supabase.audit(
        "invite_declined",
        applicant,
        {"source": "bot", "job_id": job_id},
        target_table="invites",
    )

    await event.answer()
    await redraw(event, text("decline.done", locale), buttons=None)


# ---------------------------------------------------------------------------
# The four list commands, part 6
# ---------------------------------------------------------------------------
#
# **These read, and they are the only commands that read anything wide.** Three
# of them answer about the account this chat is linked to and one of them,
# `/jobs`, answers about the public board and needs no link at all.
#
# Three things they share, and each one is a rule the build already had:
#
#   **A read that failed is not an empty list.** Every one of them tells the
#   difference between "there is nothing" and "we could not ask", because the
#   first is a claim about somebody's own account and getting it wrong tells
#   them they have no invitations when they have three.
#
#   **They show a few and point at the portal for the rest.** A chat window is
#   not a dashboard. Section 15 asks `/tasks` for a count and a link rather than
#   a list at all, and the other three follow the same instinct: enough to know
#   whether to open the portal, and a button that opens it.
#
#   **Nothing here writes.** The one write a list could plausibly do is
#   declining an invitation, and that button lives on the invitation itself
#   where section 15 puts it.

# How many rows a message draws before it starts pointing at the portal instead.
SHOWN = 5

# Telegram will take a longer button label and squeeze it. A role named in full
# on a phone pushes everything else out of the row, so the label is cut here
# where the ellipsis can be put somewhere sensible.
LABEL_LIMIT = 32


async def handle_invites(ctx: Context, event, args: str, locale: str) -> None:
    """Open invitations, with a button through to each posting. Section 15.

    **Only the two open statuses**, which is the filter rather than a judgement
    made here: an invitation the poster has withdrawn, or one already answered,
    is not an invitation, and offering a button for it would produce a list of
    links to roles nobody is being invited to any more.

    The poster's note is not repeated here on purpose. It arrived with the
    invitation and it is on the tasks page, and five notes stacked in one message
    is the point at which somebody stops reading the list they asked for.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("list.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)

    try:
        rows = await ctx.supabase.open_invites(link["applicant_id"], limit=SHOWN + 5)
        titles = await ctx.supabase.job_titles([row["job_id"] for row in rows], locale)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read invitations: %s", cause)
        await event.respond(text("list.unavailable", locale), link_preview=False)
        return

    # A posting that has been hard deleted leaves an invite row pointing at
    # nothing. The site's own lists drop such a row rather than drawing a blank
    # title, and a button to a 404 would be worse than an absence.
    listed = [row for row in rows if titles.get(row["job_id"])]

    if not listed:
        await event.respond(
            text("invites.none", locale),
            buttons=[[Button.url(text("button.openBoard", locale), board_url(ctx))]],
            link_preview=False,
        )
        return

    shown = listed[:SHOWN]
    parts = [heading(text("invites.heading", locale), 2)]
    items = []
    buttons = []

    for row in shown:
        role = titles[row["job_id"]]["title"] or ""
        items.append(from_html(text("invites.row", locale, role=html.escape(str(role)))))
        buttons.append(
            [Button.url(shorten(str(role)), ctx.config.job_url(row["job_id"]))]
        )
    parts.append(bullets(items))

    if len(listed) > len(shown):
        parts.append(from_html(text("list.more", locale, count=len(listed) - len(shown))))

    parts.append(from_html(text("invites.record", locale)))
    buttons.append([Button.url(text("button.openTasks", locale), tasks_url(ctx))])

    await send_rich_message(event.client, event.chat_id, join_rich(parts), buttons)


async def handle_tasks(ctx: Context, event, args: str, locale: str) -> None:
    """What is waiting, as a count and a link. Section 15's command list.

    **A count and not a list, which is what section 15 asks for and is also the
    honest shape.** A task can carry a set of questions that has been frozen
    since it was sent and that has to be answered accurately; a chat window
    paraphrasing it would be the worst of both, and `render_task` in the drain
    says the same thing for the same reason.

    **Both sources, because that is what the page counts.** 7g derives
    unanswered apply prompts live from `gftvjobs_analytics` and never copies them
    into `gftvjobs_tasks`, so counting the tasks table alone would put a two in
    this chat above a link to a page showing five. Settled 29 August 2026.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("list.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)

    try:
        tasks = await ctx.supabase.open_task_count(link["applicant_id"])
        prompts = await ctx.supabase.pending_prompt_count(link["applicant_id"])
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not count outstanding tasks: %s", cause)
        await event.respond(text("list.unavailable", locale), link_preview=False)
        return

    if tasks is None or prompts is None:
        # A count that could not be established is not zero. Telling somebody
        # nothing is waiting for them is a claim, and this is not the moment to
        # make it on a header PostgREST did not send.
        log.warning("a task count came back without a number")
        await event.respond(text("list.unavailable", locale), link_preview=False)
        return

    total = tasks + prompts
    if total == 0:
        key = "tasks.none"
    elif total == 1:
        key = "tasks.one"
    else:
        key = "tasks.many"

    await event.respond(
        text(key, locale, count=total),
        buttons=[[Button.url(text("button.openTasks", locale), tasks_url(ctx))]],
        link_preview=False,
    )


async def handle_applications(ctx: Context, event, args: str, locale: str) -> None:
    """The applicant's own applications and where each one stands. Section 15.

    **No filter on the posting's status**, which is dashboard.js's opening rule:
    these lists have to keep working for postings that are closed, expired or
    archived, because somebody can always reread what they applied for.

    **The status is the word the portal uses**, taken from the same `status.*`
    strings `/account/applications` draws. A status called one thing on the page
    and another in the chat is two answers to one question, and the one in the
    chat is the one nobody can check against anything.
    """
    link = await current_link(ctx, event)
    if link is None:
        await event.respond(text("list.notLinked", locale), link_preview=False)
        return

    applicant = await safe_applicant(ctx, link["applicant_id"])
    locale = account_locale(ctx, event, applicant, locale)

    try:
        rows = await ctx.supabase.applications_for(link["applicant_id"], limit=SHOWN + 5)
        titles = await ctx.supabase.job_titles([row["job_id"] for row in rows], locale)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read applications: %s", cause)
        await event.respond(text("list.unavailable", locale), link_preview=False)
        return

    listed = [row for row in rows if titles.get(row["job_id"])]

    if not listed:
        await event.respond(
            text("applications.none", locale),
            buttons=[[Button.url(text("button.openBoard", locale), board_url(ctx))]],
            link_preview=False,
        )
        return

    shown = listed[:SHOWN]
    # A table, role beside status, which is what the page draws and what a
    # rich message can draw too. `applications.row` still exists for the plain
    # half: the table's fallback is one line per row, role then status.
    rows = [
        [
            from_html(f"<b>{html.escape(str(titles[row['job_id']]['title'] or ''))}</b>"),
            from_html(status_word(row.get("status"), locale)),
        ]
        for row in shown
    ]
    parts = [
        heading(text("applications.heading", locale), 2),
        table([text("table.role", locale), text("table.status", locale)], rows),
    ]

    if len(listed) > len(shown):
        parts.append(from_html(text("list.more", locale, count=len(listed) - len(shown))))

    await send_rich_message(
        event.client,
        event.chat_id,
        join_rich(parts),
        [[Button.url(text("button.openApplications", locale), applications_url(ctx))]],
    )


async def handle_jobs(ctx: Context, event, args: str, locale: str) -> None:
    """The newest openings, with a button through to each. Section 15.

    **The one list command that needs no link**, and that is worth saying rather
    than leaving as an accident of the code: the board is public, somebody who
    found the bot before the site can ask what is going, and requiring an account
    to read a list of openings would be the portal being coy about the one thing
    it exists to advertise.

    **It reads the site's feed rather than the database.** Settled 29 August
    2026, and feed.py carries the reasoning: one implementation of which
    postings are live, resolved into the reader's language by the site's own
    rules, and nothing added to what the service key on a VPS can reach.
    """
    # Only to pick the language. An unlinked reader gets the one their Telegram
    # client is set to, which is what part 1 settled and what this falls back to.
    link = await current_link(ctx, event)
    if link is not None:
        applicant = await safe_applicant(ctx, link["applicant_id"])
        locale = account_locale(ctx, event, applicant, locale)

    rows = await ctx.feed.newest(locale, limit=SHOWN)

    if rows is None:
        # The feed could not be read. Not "there are no openings": this bot is
        # on a different machine from the site and a bad minute on either is not
        # news about GFTV's hiring.
        await event.respond(text("list.unavailable", locale), link_preview=False)
        return

    if not rows:
        await event.respond(
            text("jobs.none", locale),
            buttons=[[Button.url(text("button.openBoard", locale), board_url(ctx))]],
            link_preview=False,
        )
        return

    table_rows = []
    buttons = []

    for row in rows:
        role = row.get("title") or ""
        table_rows.append(
            [
                from_html(text("jobs.row", locale, role=html.escape(str(role)))),
                from_html(html.escape(str(row.get("department") or ""))),
            ]
        )
        # The feed builds each posting's own address, so this hands out what the
        # site says rather than assembling a link from an id and hoping the two
        # rules still match.
        buttons.append(
            [Button.url(shorten(str(role)), row.get("url") or ctx.config.job_url(row["id"]))]
        )

    parts = [
        heading(text("jobs.heading", locale), 2),
        table([text("table.role", locale), text("table.department", locale)], table_rows),
        from_html(text("jobs.notice", locale)),
    ]
    buttons.append([Button.url(text("button.openBoard", locale), board_url(ctx))])

    await send_rich_message(event.client, event.chat_id, join_rich(parts), buttons)


# ---------------------------------------------------------------------------
# docs, part 10's tenth command
# ---------------------------------------------------------------------------

# **Nothing here checks a tier, and that is the design.** `/docs` reads
# `gftvjobs_docs_public`, which inner joins the translations to the public
# mirror, so a gated page has no mirror row and is not in the view at all.
# Migration 042 carries the whole argument, and the inner join is the load
# bearing word. There is no second copy of the site's rule in Python to keep in
# step with it, which is what section 2 of the working memo worried about from
# 3 September 2026 and what 042 discharged instead of paying.
#
# It needs no linked account either. The guides are the public tier and the view
# holds nothing else, so this is the one list command that answers a stranger.


def docs_sections(rows):
    """The view's flat page list, grouped into its sections.

    A section is a page whose path has one segment, and its pages are the paths
    under it. The home page belongs to no section and is dropped: it is a
    landing page for the site and says nothing a chat window needs.

    Derived from the paths rather than configured, so a section added to the
    site appears here without anybody editing this file.
    """
    indexes = {}
    children = {}

    for row in rows:
        path = row.get("page_path") or ""
        if path in ("", "/"):
            continue
        parts = path.strip("/").split("/")
        if len(parts) == 1:
            indexes[parts[0]] = row
        else:
            children.setdefault(parts[0], []).append(row)

    return [
        (indexes[slug], children.get(slug, []))
        for slug in sorted(indexes)
        if children.get(slug)
    ]


def docs_callback_id(ctx, action, path, page, locale, event, total=0):
    """A stable id per button, so redrawing a menu does not grow the registry.

    Derived the way `notify_callback_id` is and for the same reason: paging
    through a guide redraws the same keyboard many times, and a fresh uuid per
    tap would write a row per tap for ever.

    **The Telegram account is deliberately not stored on a docs button.** Every
    other callback in this file answers about somebody's own account and checks
    who clicked. A guide page is public, so a forwarded message whose button
    still works is a forwarded link to a public page, which is what a link is.

    `total` is carried for the pager's middle button alone, which says where the
    reader is and goes nowhere. It is in the payload so that answering the tap
    costs nothing: the alternative is reading the page back out of Supabase and
    paginating it again to learn a number the button already had when it was
    drawn.
    """
    material = f"docs:{action}:{path}:{page}:{total}:{locale}"
    callback_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

    db.remember_callback(
        ctx.conn,
        callback_id,
        "docs",
        {"action": action, "path": path, "page": page, "total": total, "locale": locale},
        chat_id=getattr(event, "chat_id", None),
    )
    return callback_id


async def read_docs_pages(ctx, locale):
    """Every public page in one language, falling back to English as a whole.

    **The fallback is per request and not per row.** A language nobody has
    started leaves the view empty for that locale, and a menu half in each
    language would be worse than a menu in one.
    """
    rows = await ctx.supabase.docs_pages(locale)
    if not rows and locale != DEFAULT_LOCALE:
        rows = await ctx.supabase.docs_pages(DEFAULT_LOCALE)
    return rows


async def docs_index(ctx, event, locale, *, edit):
    """The section list, which is what `/docs` opens on."""
    try:
        rows = await read_docs_pages(ctx, locale)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read the guides: %s", cause)
        await docs_say(event, text("docs.unavailable", locale), None, edit=edit)
        return

    sections = docs_sections(rows)
    if not sections:
        await docs_say(event, text("docs.empty", locale), None, edit=edit)
        return

    buttons = [
        [
            Button.inline(
                shorten(str(index.get("title") or index["page_path"])),
                f"cb:{docs_callback_id(ctx, 'section', index['page_path'], 0, locale, event)}".encode(),
            )
        ]
        for index, _ in sections
    ]

    await docs_say(event, titled(text("docs.intro", locale)), buttons, edit=edit)


async def docs_section(ctx, event, path, locale):
    """One section's pages, as a button each."""
    try:
        rows = await read_docs_pages(ctx, locale)
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read the guides: %s", cause)
        await event.answer(text("docs.unavailable", locale), alert=True)
        return

    slug = path.strip("/")
    index = next((row for row in rows if (row.get("page_path") or "") == path), None)
    pages = [row for row in rows if (row.get("page_path") or "").startswith(f"/{slug}/")]

    if index is None or not pages:
        await event.answer(text("docs.gone", locale), alert=True)
        return

    buttons = [
        [
            Button.inline(
                shorten(str(row.get("title") or row["page_path"])),
                f"cb:{docs_callback_id(ctx, 'page', row['page_path'], 0, locale, event)}".encode(),
            )
        ]
        for row in pages
    ]
    buttons.append(
        [
            Button.inline(
                text("button.docsBack", locale),
                f"cb:{docs_callback_id(ctx, 'index', '/', 0, locale, event)}".encode(),
            )
        ]
    )

    title = text("docs.section", locale, title=html.escape(str(index.get("title") or "")))
    summary = html.escape(str(index.get("summary") or "").strip())
    body = join_rich(
        [
            heading(title, 1),
            from_html(summary) if summary else None,
            from_html(text("docs.pick", locale)),
        ]
    )

    await event.answer()
    await edit_rich_message(event.client, event, body, buttons)


async def docs_page(ctx, event, path, page, locale):
    """One page of one guide page, with the three seat pager where there are more."""
    try:
        row = await ctx.supabase.docs_page(path, locale)
        fallback = False
        if row is None and locale != DEFAULT_LOCALE:
            row = await ctx.supabase.docs_page(path, DEFAULT_LOCALE)
            fallback = row is not None
    except (SupabaseError, httpx.HTTPError) as cause:
        log.error("could not read a guide page: %s", cause)
        await event.answer(text("docs.unavailable", locale), alert=True)
        return

    if row is None:
        await event.answer(text("docs.gone", locale), alert=True)
        return

    sections = docs.render(
        str(row.get("body") or ""),
        note=lambda kind: text(f"docs.has{kind.title()}", locale),
        base=ctx.config.docs_url,
    )
    parts = docs.paginate(sections)
    total = len(parts)
    index = max(0, min(page, total - 1))

    # The page title is the one heading, the guide's own headings sit under it,
    # and its tables are drawn as tables: phase 15 part 2, and the reason /docs
    # was worth the rich path most of all.
    header = [heading(f"<b>{html.escape(str(row.get('title') or ''))}</b>", 1)]
    if fallback:
        header.append(from_html(text("docs.english", locale)))
    if total > 1:
        header.append(from_html(text("docs.page", locale, count=index + 1, total=total)))
    body = join_rich([rich_lines(header), parts[index]])

    buttons = []

    # **The pager is three buttons and never two**, so the row does not move
    # under a thumb that is already resting on it: the left seat steps back, the
    # right seat steps on, and the middle one says where the reader is. At the
    # two ends the seat that has nowhere to go wraps instead of disappearing —
    # Last on the first page, First on the last — which is the same width, in
    # the same place, and is what somebody who has read to the end of a nine
    # part page actually wants next.
    if total > 1:
        at_start = index == 0
        at_end = index + 1 >= total

        back_label = "button.docsLast" if at_start else "button.docsPrev"
        back_target = total - 1 if at_start else index - 1
        on_label = "button.docsFirst" if at_end else "button.docsNext"
        on_target = 0 if at_end else index + 1

        buttons.append(
            [
                Button.inline(
                    text(back_label, locale),
                    f"cb:{docs_callback_id(ctx, 'page', path, back_target, locale, event)}".encode(),
                ),
                # It goes nowhere on purpose. Telegram gives an inline button no
                # way to be inert, so it answers with the same sentence the
                # message already carries instead of editing anything.
                Button.inline(
                    text("button.docsPage", locale, count=index + 1, total=total),
                    f"cb:{docs_callback_id(ctx, 'where', path, index, locale, event, total)}".encode(),
                ),
                Button.inline(
                    text(on_label, locale),
                    f"cb:{docs_callback_id(ctx, 'page', path, on_target, locale, event)}".encode(),
                ),
            ]
        )

    on_site = ctx.config.docs_page_url(path)
    if on_site:
        buttons.append([Button.url(text("button.docsOnSite", locale), on_site)])

    buttons.append(
        [
            Button.inline(
                text("button.docsBack", locale),
                f"cb:{docs_callback_id(ctx, 'section', '/' + path.strip('/').split('/')[0], 0, locale, event)}".encode(),
            )
        ]
    )

    await event.answer()
    await edit_rich_message(event.client, event, body, buttons)


async def docs_say(event, body, buttons, *, edit):
    """Answer a command, or edit the message a button was on.

    `body` is a rich part, or a string for the one-line refusals, which stay
    plain messages as every other one-line notice does.
    """
    if isinstance(body, str):
        if edit:
            await event.answer()
            await redraw(event, body, buttons=buttons, link_preview=False)
        else:
            await event.respond(body, buttons=buttons, link_preview=False)
        return
    if edit:
        await event.answer()
        await edit_rich_message(event.client, event, body, buttons)
    else:
        await send_rich_message(event.client, event.chat_id, body, buttons)


async def handle_docs(ctx: Context, event, args: str, locale: str) -> None:
    """The guides, browsed with buttons. Phase 14 part 10.

    **This is the one list command that answers a stranger**, because the view
    it reads carries the public tier and nothing else. There is no link check
    and nothing to scope by an account.

    A linked account still gets its own language, the same way every other
    command here does: the choice on the account beats whatever Telegram says
    the client is set to.
    """
    link = await current_link(ctx, event)
    if link is not None:
        applicant = await safe_applicant(ctx, link["applicant_id"])
        locale = account_locale(ctx, event, applicant, locale)

    await docs_index(ctx, event, locale, edit=False)


async def handle_docs_callback(ctx: Context, event, record: dict) -> None:
    """A guide button coming back: a section, a page, or back to the index.

    The path is checked against migration 042's own shape before it is used as
    a filter, so a registry row edited by hand cannot turn a button into an
    arbitrary query.
    """
    payload = record["payload"]
    locale = payload.get("locale") or DEFAULT_LOCALE
    action = payload.get("action")
    path = payload.get("path") or "/"

    if not docs.is_page_path(path):
        await event.answer(text("docs.gone", locale), alert=True)
        return

    if action == "index":
        await docs_index(ctx, event, locale, edit=True)
    elif action == "section":
        await docs_section(ctx, event, path, locale)
    elif action == "page":
        await docs_page(ctx, event, path, int(payload.get("page") or 0), locale)
    elif action == "where":
        # The pager's middle button. It edits nothing: the numbers were written
        # into the payload when the keyboard was drawn, so this is a toast and
        # not a read.
        await event.answer(
            text(
                "docs.page",
                locale,
                count=int(payload.get("page") or 0) + 1,
                total=int(payload.get("total") or 1),
            )
        )
    else:
        await event.answer(text("docs.gone", locale), alert=True)


def status_word(status: str | None, locale: str) -> str:
    """What to call an application's status, or where to look instead.

    An unknown status is a real possibility rather than a defensive flourish: the
    check constraint on `gftvjobs_applications` can gain a value in a later phase
    and this process is pulled by hand. The build's rule is that an unknown enum
    falls back rather than being refused, and the fallback here says to open the
    portal rather than inventing a sentence about somebody's application.
    """
    key = f"application.status.{status}"
    if status and key in STRINGS[DEFAULT_LOCALE]:
        return text(key, locale)
    return text("applications.statusUnknown", locale)


def shorten(value: str, limit: int = LABEL_LIMIT) -> str:
    """A button label that fits on a phone."""
    trimmed = value.strip()
    return trimmed if len(trimmed) <= limit else trimmed[: limit - 1].rstrip() + "…"


# ---------------------------------------------------------------------------
# Small shared things
# ---------------------------------------------------------------------------


def settings_url(ctx: Context) -> str:
    return f"{ctx.config.site_url}/account/settings"


def tasks_url(ctx: Context) -> str:
    return f"{ctx.config.site_url}/account/tasks"


def applications_url(ctx: Context) -> str:
    return f"{ctx.config.site_url}/account/applications"


def board_url(ctx: Context) -> str:
    """The one browse surface. `/search` is the listing and the results page."""
    return f"{ctx.config.site_url}/search"


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


def account_locale(ctx: Context, event, applicant: dict | None, fallback: str) -> str:
    """The account's own language, which wins the moment there is an account.

    **Unless this chat chose one with /language**, phase 14. That choice is a
    fact about the chat, kept in SQLite against the Telegram user, and it beats
    the account's setting for everything the bot says: the person asked for it
    here, in so many words, and the portal's own setting is untouched. An
    absent row is the ordinary case and means the account decides, which is
    section 7's rule as it has stood since phase 11 part 2.
    """
    chosen = chat_locale_for(ctx, event)
    if chosen is not None:
        return chosen
    stored = (applicant or {}).get("locale")
    return stored if stored in STRINGS else fallback


def chat_locale_for(ctx: Context, event) -> str | None:
    """The language chosen for this chat, if the bot can still speak it."""
    chosen = db.chat_locale(ctx.conn, getattr(event, "sender_id", None))
    return chosen if chosen in STRINGS else None


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
    "code": handle_code,
    "invites": handle_invites,
    "tasks": handle_tasks,
    "applications": handle_applications,
    "jobs": handle_jobs,
    "notify": handle_notify,
    "docs": handle_docs,
    "language": handle_language,
}

# The same idea for buttons. A callback row's `kind` decides what runs, so a
# button drawn six weeks ago still means what it meant, which is the whole
# reason section 15 asks for the registry to be in SQLite.
CALLBACKS = {
    "unlink": handle_unlink_callback,
    "notify": handle_notify_callback,
    "decline_invite": handle_decline_callback,
    "docs": handle_docs_callback,
    "language": handle_language_callback,
}
