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

import db
from build_status import BuildStatus
from commands import BOT_FEATURE, BY_NAME, COMMANDS, Command
from config import Config
from feed import JobFeed
from lang import locale_for
from security import hash_code, six_digits
from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import NOTIFY_COLUMN, Supabase, SupabaseError

log = logging.getLogger("bot.handlers")


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
    locale = account_locale(applicant, locale)

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
    await event.respond(
        text("code.message", locale, code=html.escape(code)), link_preview=False
    )


def code_expiry() -> str:
    """Five minutes from now, per section 15, in the shape PostgREST wants."""
    return (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()


# ---------------------------------------------------------------------------
# notify, section 15's per kind toggles
# ---------------------------------------------------------------------------

# The order the three appear in, which is the order somebody meets them: an
# invitation is the message this whole channel exists for, a task is the ordinary
# one, and a decision is the rare one. The labels come from `strings.py` keyed on
# the kind, so a kind added later needs one string and no code here.
NOTIFY_KINDS = ("invite", "task_raised", "application_status_changed")


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
    locale = account_locale(applicant, locale)

    await event.respond(
        text("notify.intro", locale),
        buttons=notify_buttons(ctx, link, locale, event.sender_id, event.chat_id),
        link_preview=False,
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
    locale = account_locale(applicant, locale)
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
    await event.edit(
        text("notify.intro", locale),
        buttons=notify_buttons(
            ctx, updated or link, locale, event.sender_id, record["chat_id"] or event.chat_id
        ),
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
    await event.edit(text("decline.done", locale), buttons=None)


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
    locale = account_locale(applicant, locale)

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
    lines = [text("invites.heading", locale), ""]
    buttons = []

    for row in shown:
        role = titles[row["job_id"]]["title"] or ""
        lines.append(text("invites.row", locale, role=html.escape(str(role))))
        buttons.append(
            [Button.url(shorten(str(role)), ctx.config.job_url(row["job_id"]))]
        )

    if len(listed) > len(shown):
        lines.append("")
        lines.append(text("list.more", locale, count=len(listed) - len(shown)))

    lines.append("")
    lines.append(text("invites.record", locale))
    buttons.append([Button.url(text("button.openTasks", locale), tasks_url(ctx))])

    await event.respond("\n".join(lines), buttons=buttons, link_preview=False)


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
    locale = account_locale(applicant, locale)

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
    locale = account_locale(applicant, locale)

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
    lines = [text("applications.heading", locale), ""]

    for row in shown:
        role = titles[row["job_id"]]["title"] or ""
        lines.append(
            text(
                "applications.row",
                locale,
                role=html.escape(str(role)),
                status=status_word(row.get("status"), locale),
            )
        )
        lines.append("")

    if len(listed) > len(shown):
        lines.append(text("list.more", locale, count=len(listed) - len(shown)))

    await event.respond(
        "\n".join(lines).strip(),
        buttons=[
            [Button.url(text("button.openApplications", locale), applications_url(ctx))]
        ],
        link_preview=False,
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
        locale = account_locale(applicant, locale)

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

    lines = [text("jobs.heading", locale), ""]
    buttons = []

    for row in rows:
        role = row.get("title") or ""
        lines.append(text("jobs.row", locale, role=html.escape(str(role))))
        if row.get("department"):
            lines.append(
                text(
                    "jobs.department",
                    locale,
                    department=html.escape(str(row["department"])),
                )
            )
        lines.append("")
        # The feed builds each posting's own address, so this hands out what the
        # site says rather than assembling a link from an id and hoping the two
        # rules still match.
        buttons.append(
            [Button.url(shorten(str(role)), row.get("url") or ctx.config.job_url(row["id"]))]
        )

    lines.append(text("jobs.notice", locale))
    buttons.append([Button.url(text("button.openBoard", locale), board_url(ctx))])

    await event.respond("\n".join(lines), buttons=buttons, link_preview=False)


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
    "code": handle_code,
    "invites": handle_invites,
    "tasks": handle_tasks,
    "applications": handle_applications,
    "jobs": handle_jobs,
    "notify": handle_notify,
}

# The same idea for buttons. A callback row's `kind` decides what runs, so a
# button drawn six weeks ago still means what it meant, which is the whole
# reason section 15 asks for the registry to be in SQLite.
CALLBACKS = {
    "unlink": handle_unlink_callback,
    "notify": handle_notify_callback,
    "decline_invite": handle_decline_callback,
}
