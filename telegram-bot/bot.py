"""The Careers@GFTV Telegram bot. Specification section 15.

Run it from this directory, inside your own tmux session:

    python bot.py

**One process, three loops.** Settled 28 August 2026, phase 11 open decision 4.
Telethon's event loop, `security.py` from part 3 and `outbox.py` from part 4 all
live in this one process and share one client and one session file. Both of
those have to send through Telethon anyway, and a second process would mean a
second session for the same bot token; safety against a double send comes from
the conditional claim in the database, not from there happening to be one
process. Phase 12's status probe is the
exception and stays separate, because section 15 requires it to keep recording
while Telethon is wedged: telling "the bot is broken" apart from "the portal is
down" is the entire job of a status page.

**Starting a second copy is refused, not raced.** `lock.py` takes an exclusive
lock and this process exits naming the pid that holds it, so the old instance is
never left polling quietly beside the new one. Nothing here starts, stops or
knows about tmux; the session is yours to manage.

Exit codes, so a failed start says which kind of failure it was:

    0  a clean shutdown
    2  the environment is not usable, and every problem with it is listed
    3  another instance is already running, and its pid is named
    1  anything else, with the traceback in the log
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
import sys

import httpx
from telethon import TelegramClient, events
from telethon.tl.functions.bots import SetBotCommandsRequest
from telethon.tl.types import BotCommand, BotCommandScopeDefault

import db
from build_status import BuildStatus
from commands import BOT_FEATURE, BY_NAME, COMMANDS, botfather_lines
from config import Config, ConfigError, load_config
from handlers import CALLBACKS, HANDLERS, Context, availability
from lang import locale_for
from lock import AlreadyRunning, SingleInstance
from log import setup_logging
from outbox import OutboxLoop
from security import SecurityLoop
from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import Supabase

# `/name`, optionally addressed to the bot in a group, optionally with the rest
# of the line as an argument. The deep link payload arrives as `/start <token>`.
COMMAND = re.compile(r"^/([A-Za-z][A-Za-z0-9_]*)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$")

USER_AGENT = "careers-gftv-bot"


async def resolve_locale(event, status: BuildStatus) -> str:
    """Which language to answer in, for somebody who may not be linked.

    Part 2 puts the linked account's own locale in front of this. Until then,
    and forever for anybody who has linked nothing, it is the language their
    Telegram client is set to. See lang.py.
    """
    supported = await status.locales()
    # Only languages this file actually carries copy for. The site can ship a
    # locale before the bot does, and answering in a language with no strings
    # would render English with a Chinese heading on top.
    usable = tuple(name for name in supported if name in STRINGS) or (DEFAULT_LOCALE,)

    sender = None
    try:
        sender = await event.get_sender()
    except Exception:  # noqa: BLE001 - never let this decide whether we reply
        pass

    return locale_for(getattr(sender, "lang_code", None), usable)


async def register_commands(client: TelegramClient, status: BuildStatus) -> None:
    """Publish the command list to Telegram, in every language it has.

    The same list `start` prints and `setup.md` gives BotFather, from
    `commands.py`. Registering it here rather than only pasting it into
    BotFather is what makes the menu a consequence of the list rather than a
    copy of it.

    A failure is logged and does not stop the bot. The menu is a convenience;
    every command works whether Telegram has been told about it or not.
    """
    locales = [name for name in await status.locales() if name in STRINGS]
    if DEFAULT_LOCALE not in locales:
        locales.append(DEFAULT_LOCALE)

    # An empty lang_code is Telegram's default, shown to everybody whose
    # language has no list of its own.
    targets = [("", DEFAULT_LOCALE)] + [(name, name) for name in locales]

    for lang_code, source in targets:
        try:
            await client(
                SetBotCommandsRequest(
                    scope=BotCommandScopeDefault(),
                    lang_code=lang_code,
                    commands=[
                        BotCommand(command=name, description=description)
                        for name, description in botfather_lines(source)
                    ],
                )
            )
        except Exception as cause:  # noqa: BLE001 - a menu is not worth a crash
            logging.getLogger("bot").warning(
                "could not register the command list for %r: %s",
                lang_code or "default",
                cause,
            )


async def log_command_states(ctx: Context, log: logging.Logger) -> None:
    """Write out what answers today and what does not.

    With no scripted checks the log is the account of what happened, and the
    first thing somebody walking the checklist wants to know is whether the
    build they just restarted has the part they just pulled.
    """
    for command in COMMANDS:
        state = await availability(command, ctx, DEFAULT_LOCALE)
        log.info(
            "  /%-13s %s",
            command.name,
            "ready" if state.available else f"not answering: {state.sentence}",
        )


def build_dispatcher(ctx: Context, log: logging.Logger):
    """The one message handler. Every command is routed from `commands.py`."""

    async def dispatch(event) -> None:
        locale = await resolve_locale(event, ctx.status)
        message = (event.raw_text or "").strip()
        match = COMMAND.match(message)

        if not match:
            await event.respond(text("plain.message", locale), link_preview=False)
            return

        name = match.group(1).lower()
        args = match.group(2) or ""

        command = BY_NAME.get(name)
        if command is None:
            await event.respond(text("unknown.command", locale), link_preview=False)
            return

        state = await availability(command, ctx, locale)
        if not state.available:
            log.info("/%s asked for and not answering", name)
            await event.respond(state.sentence, link_preview=False)
            return

        # Never call an async handler bare, which is the rule `runAction` exists
        # for on the site. Here the cost of getting it wrong is a person left
        # looking at a chat that never replies, with the reason only in a log
        # they cannot see.
        try:
            await HANDLERS[name](ctx, event, args, locale)
        except Exception:  # noqa: BLE001 - the reply matters more than the type
            log.exception("/%s failed", name)
            await event.respond(text("generic.error", locale), link_preview=False)

    return dispatch


def build_callbacks(ctx: Context, log: logging.Logger):
    """Inline buttons coming back.

    **The payload is looked up, never trusted.** What travels in the callback
    data is an opaque id; what it means is a row in SQLite written when the
    button was drawn. Section 15 asks for exactly this, so a button in an old
    message keeps working across every restart, and it has a second effect worth
    naming: a button cannot be forged by editing what is in it, because there is
    nothing in it to edit.
    """

    async def dispatch(event) -> None:
        raw = (event.data or b"").decode("utf-8", "replace")

        if raw == "cb:cancel":
            await event.answer()
            await event.delete()
            return

        if not raw.startswith("cb:"):
            await event.answer()
            return

        record = db.read_callback(ctx.conn, raw[3:])
        if record is None:
            # The registry is bot local and the database file could have been
            # replaced. Saying so is better than a button that does nothing.
            await event.answer(text("callback.unknown", DEFAULT_LOCALE), alert=True)
            return

        handler = CALLBACKS.get(record["kind"])
        if handler is None:
            await event.answer(text("callback.unknown", DEFAULT_LOCALE), alert=True)
            return

        try:
            await handler(ctx, event, record)
        except Exception:  # noqa: BLE001 - the reply matters more than the type
            log.exception("callback %s failed", record["kind"])
            await event.answer(text("generic.error", DEFAULT_LOCALE), alert=True)

    return dispatch


async def run(config: Config) -> int:
    log = setup_logging(config.log_level, config.log_dir)

    conn = db.connect(config.db_path)
    schema = db.migrate(conn, config.db_path)
    starts = db.record_start(conn, os.getpid())
    log.info(
        "starting as pid %d, start number %d, sqlite schema %d",
        os.getpid(),
        starts,
        schema,
    )

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as http:
        status = BuildStatus(config, http)

        phase_number = await status.phase_for_feature(BOT_FEATURE)
        phase = await status.phase(phase_number) if phase_number is not None else None
        log.info(
            "site is %s, phase %s is %s",
            config.site_url,
            phase_number if phase_number is not None else "unknown",
            (phase or {}).get("status", "unknown"),
        )

        client = TelegramClient(
            str(config.session_path), config.api_id, config.api_hash
        )
        client.parse_mode = "html"

        await client.start(bot_token=config.bot_token)
        me = await client.get_me()
        log.info("connected as @%s", getattr(me, "username", "unknown"))

        ctx = Context(
            config=config,
            status=status,
            conn=conn,
            http=http,
            supabase=Supabase(config.supabase_url, config.supabase_service_key, http),
        )

        client.add_event_handler(
            build_dispatcher(ctx, log),
            events.NewMessage(incoming=True, func=lambda e: e.is_private),
        )
        client.add_event_handler(build_callbacks(ctx, log), events.CallbackQuery())

        await register_commands(client, status)
        log.info("commands:")
        await log_command_states(ctx, log)

        stopping = asyncio.Event()
        loop = asyncio.get_running_loop()
        for name in ("SIGINT", "SIGTERM"):
            received = getattr(signal, name, None)
            if received is None:
                continue
            try:
                loop.add_signal_handler(received, stopping.set)
            except NotImplementedError:
                # Windows, where a developer may run this to read the output and
                # ctrl-c is handled as KeyboardInterrupt instead.
                pass

        log.info("ready")

        # The other tasks decision 4 settled on. They share this client and this
        # session file, because they send through Telethon anyway, and they are
        # tasks rather than processes for the same reason: what stops a double
        # send is the conditional claim in the database, not there happening to
        # be one of anything.
        #
        # Two of them rather than one, because what they carry is waited for
        # differently. `security.py` polls every two seconds and carries the
        # things somebody is sitting in front of; `outbox.py` polls every twenty
        # and carries what section 15 queues. Splitting them is also what lets
        # the drain stop for a flood wait or a maintenance switch without a login
        # code stopping with it.
        loops = [
            asyncio.ensure_future(SecurityLoop(ctx, client).run(stopping)),
            asyncio.ensure_future(OutboxLoop(ctx, client).run(stopping)),
        ]

        disconnected = asyncio.ensure_future(client.run_until_disconnected())
        waiting = asyncio.ensure_future(stopping.wait())
        await asyncio.wait(
            [disconnected, waiting], return_when=asyncio.FIRST_COMPLETED
        )

        log.info("stopping")

        # The loops are asked before they are cancelled, so a send already in
        # flight finishes rather than being torn off halfway. Section 15's
        # restart mid drain is the one failure nothing else here would catch,
        # and this is the side of it this process controls. The other side is
        # the drain's own lease: a row claimed by a process that did not get
        # this far is swept back into the queue rather than left claimed.
        stopping.set()
        for loop in loops:
            try:
                await asyncio.wait_for(asyncio.shield(loop), timeout=10)
            except Exception:  # noqa: BLE001 - a stuck send must not stop the stop
                loop.cancel()

        for task in (disconnected, waiting):
            task.cancel()
        # Awaited rather than abandoned, so a cancellation does not surface
        # later as an exception nobody retrieved, in a log somebody is reading
        # to find out why the process would not stop.
        await asyncio.gather(disconnected, waiting, *loops, return_exceptions=True)
        await client.disconnect()

    conn.close()
    log.info("stopped cleanly")
    return 0


def main() -> int:
    """Start once, or say exactly why not.

    The configuration is read before the lock is taken, so a missing variable is
    reported as a missing variable rather than as a lock that could not be
    acquired for reasons nobody can see.
    """
    try:
        config = load_config()
    except ConfigError as cause:
        print(str(cause), file=sys.stderr)
        return 2

    try:
        with SingleInstance(config.lock_path):
            return asyncio.run(run(config))
    except AlreadyRunning as cause:
        print(str(cause), file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        logging.getLogger("bot").info("interrupted, stopping")
        return 0
    except Exception:
        logging.getLogger("bot").exception("the bot stopped on an error")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
