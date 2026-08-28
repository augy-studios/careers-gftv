"""The outbox drain. Section 15's notifications, and part 4 of phase 11.

**What this is for.** The site never calls the bot. It writes a row into
`gftvjobs_notifications` and returns, and this loop is the other end of that:
it claims a batch, sends it, and records how each row ended. Everything the
site queues arrives through here, so the failures this file has to survive are
the ones nobody is sitting in front of.

**Four things it is built around, in the order they matter.**

1. **The claim is one conditional update, and nothing reads then writes.** Two
   instances polling a second apart cannot both be handed a row, because the
   second update matches nothing. Deviation 91 requires this rather than
   suggesting it: a double send after a restart that did not kill cleanly is one
   of the two failures a scripted check would have caught here, so it is made
   impossible by the query instead.

2. **A claim is a lease, not a transfer.** The process can be killed between
   claiming a row and sending it, and a row left `claimed` forever is the same
   failure as a queued row nobody drains. So a claim older than the lease is
   swept back into the queue with the attempt counted, and once a row has spent
   its attempts it lands in `failed` where an admin can see it. Settled
   29 August 2026: re-queue, then fail. A duplicate message is a small cost paid
   in the open, and a notification that silently never arrives is not.

3. **A flood wait reschedules, it never sleeps the worker.** Section 15 says so
   outright. The wait is written into SQLite as a pause on sending, the row is
   given a time it may next be tried, and this loop goes back to waiting.
   Commands keep answering and login codes keep going out the whole time,
   because those are a different loop.

4. **A kind this build cannot render is never claimed.** The site deploys itself
   and the bot is pulled by hand, so the site can queue a kind this process has
   never heard of. The claim names the kinds `RENDERERS` holds, so such a row
   waits, queued and untouched, for the pull that teaches this process what it
   is. That is the outbox doing the job section 2 of the memo gives it: every
   kind has to be one an older bot can leave alone safely.

**What it deliberately does not do.** It does not retry a chat that has blocked
the bot, or an account that no longer exists: those answers are permanent, and
three more attempts is three more of the same answer. And it stops entirely
while an admin has `telegram_notifications` switched off, leaving rows queued
rather than skipping them, because a maintenance switch is a pause and not a
delete. That is the opposite of `security.py`, which ignores the switches
because the person there is halfway through signing in.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx
from telethon.errors import FloodWaitError
from telethon.errors.rpcerrorlist import (
    InputUserDeactivatedError,
    PeerIdInvalidError,
    UserIsBlockedError,
    UserIsBotError,
)

import db
from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import SupabaseError

log = logging.getLogger("bot.outbox")

# Section 15 asks for fifteen to thirty seconds. Twenty is the middle of it, and
# the middle is the right place: this is a claim against an indexed status that
# matches nothing almost every pass, and an invitation that arrives twenty
# seconds after an admin sent it is indistinguishable from an instant one.
POLL_SECONDS = 20.0

# How many rows one pass takes. Twenty at the pacing below is about seven
# seconds of sending, which is comfortably inside one poll and leaves a burst of
# invitations arriving in a couple of passes rather than in an hour.
BATCH = 20

# A gap between sends, per section 15's "pace sends". Telegram's documented
# ceiling for a bot talking to different people is around thirty messages a
# second and the flood waits start well before anybody reaches it; a third of a
# second is unhurried enough that the handling below should be a rarity rather
# than the normal path.
SEND_GAP_SECONDS = 0.35

# How long a claim is good for. Long enough that a slow batch is never swept out
# from under itself, short enough that a restart mid drain costs one delay
# rather than one lost message. The batch above cannot take more than a few
# seconds, so five minutes is entirely slack.
LEASE_MINUTES = 5

# How often the sweep for abandoned claims runs. Every fifteenth pass is once
# every five minutes, which matches the lease: sweeping more often than a claim
# can expire is a query that can only ever answer nothing.
SWEEP_EVERY = 15

# Attempts before a row is left `failed` for an admin, and how long to wait
# between them. Section 15: "Retry failures a few times with backoff, then leave
# them failed for an admin to see." Four attempts spread over twenty one minutes
# outlasts an ordinary blip without keeping a broken row alive all afternoon.
MAX_ATTEMPTS = 4
BACKOFF_SECONDS = (60, 300, 900)

# The maintenance key this loop obeys. `telegram_notifications` only means
# anything once phase 11 has shipped, exactly as on the site.
NOTIFICATIONS_FEATURE = "telegram_notifications"

# Telegram answers that will not change on a retry. A chat that has blocked the
# bot answers the same way in fifteen minutes, and counting three more attempts
# against a row only delays the honest `failed` an admin needs to see.
PERMANENT_ERRORS = (
    UserIsBlockedError,
    UserIsBotError,
    InputUserDeactivatedError,
    PeerIdInvalidError,
)


@dataclass(frozen=True)
class Rendered:
    """One message, ready to send. Buttons are optional and usually absent."""

    message: str
    buttons: list | None = None


async def render_test(ctx, row: dict, applicant: dict | None, locale: str) -> Rendered:
    """The test message from the Telegram panel in account settings.

    Not one of section 15's three kinds and not subject to the `notify` toggles,
    because nobody subscribed to it: somebody pressed a button a moment ago and
    is watching this chat for the result. It is the kind part 3 wrote so that
    the drain had something real to carry before the real kinds existed.
    """
    return Rendered(text("test.message", locale))


# One entry per kind this build can actually send. **The claim reads this
# dictionary**, so adding a kind here is the whole of making it deliverable, and
# leaving one out is the whole of making an older bot leave it alone. Part 5
# adds `invite`, `task_raised` and `application_status_changed`, and the
# unsubscribe footer section 15 asks for arrives with them, since it is the
# `notify` toggles it points at.
RENDERERS = {
    "telegram_test": render_test,
}


@dataclass
class Tally:
    """What one pass did, for the log line that is this loop's only account."""

    claimed: int = 0
    sent: int = 0
    skipped: int = 0
    failed: int = 0
    retried: int = 0
    released: int = 0
    recovered: int = 0
    notes: list[str] = field(default_factory=list)

    def happened(self) -> bool:
        return bool(
            self.claimed
            or self.sent
            or self.skipped
            or self.failed
            or self.retried
            or self.released
            or self.recovered
        )

    def describe(self) -> str:
        return (
            f"claimed={self.claimed} sent={self.sent} skipped={self.skipped} "
            f"failed={self.failed} retried={self.retried} "
            f"released={self.released} recovered={self.recovered}"
        )


class OutboxLoop:
    """The third task in this process, owned by bot.py.

    It fails without taking the bot down, in the same way `security.py` does and
    for the same reason: a drain that exits on its first bad afternoon leaves
    the site queueing rows nobody reads, and the failure is silent at both ends.
    """

    def __init__(self, ctx, client) -> None:
        self.ctx = ctx
        self.client = client
        self._pass = 0
        # Rows this pass is working on. The sweep reads it so that a claim taken
        # ten seconds ago is never mistaken for one abandoned by a process that
        # died, which matters on the first pass after a slow start.
        self._in_flight: set[str] = set()

    async def run(self, stopping: asyncio.Event) -> None:
        log.info("outbox drain started, polling every %.0fs", POLL_SECONDS)

        while not stopping.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 - the loop outlives every failure
                log.exception("outbox pass failed")

            try:
                await asyncio.wait_for(stopping.wait(), timeout=POLL_SECONDS)
            except asyncio.TimeoutError:
                pass

        log.info("outbox drain stopped")

    async def tick(self) -> None:
        """One pass: recover, retry what is due, then claim what is new."""
        self._pass += 1

        paused = db.sends_paused_until(self.ctx.conn)
        if paused:
            # A flood wait is in force. Nothing is claimed and nothing is sent,
            # and the loop keeps running so it notices the moment it may again.
            if self._pass % SWEEP_EVERY == 0:
                log.info("outbox is holding off until %s", paused)
            return

        state = await self.ctx.status.feature(NOTIFICATIONS_FEATURE)
        if state.off:
            # Switched off by an admin. Rows stay queued rather than being
            # skipped: this is a pause, and turning it back on has to deliver
            # what waited, which is deviation 89's rule about a switch that only
            # works in one direction.
            if self._pass % SWEEP_EVERY == 0:
                log.info("outbox is switched off, leaving everything queued")
            return

        tally = Tally()

        if self._pass % SWEEP_EVERY == 1:
            # On the first pass as well as every fifteenth, because the claims
            # worth recovering are exactly the ones the previous process left
            # behind when it stopped.
            await self.recover_stale_claims(tally)

        await self.send_due_retries(tally)
        await self.claim_and_send(tally)

        if tally.happened():
            # Deviation 91: with no scripted checks the log is the account of
            # what happened, and `gftvjobs_notifications` keeps the durable half.
            log.info("outbox pass: %s", tally.describe())
            for note in tally.notes:
                log.info("  %s", note)

    # -- the three things a pass does ------------------------------------

    async def recover_stale_claims(self, tally: Tally) -> None:
        """Take back rows claimed by a process that is no longer sending them."""
        cutoff = (
            datetime.now(timezone.utc) - timedelta(minutes=LEASE_MINUTES)
        ).isoformat()

        try:
            rows = await self.ctx.supabase.stale_claims(cutoff)
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("could not look for abandoned claims: %s", cause)
            return

        held = db.scheduled_ids(self.ctx.conn) | self._in_flight

        for row in rows:
            if row["id"] in held:
                # Ours, and waiting out a backoff. Patience is not abandonment.
                continue

            attempts = (row.get("attempts") or 0) + 1
            reason = "claimed and never finished, most likely a restart mid send"

            try:
                if attempts >= MAX_ATTEMPTS:
                    await self.ctx.supabase.finish_notification(
                        row["id"], "failed", reason, attempts=attempts
                    )
                    tally.failed += 1
                else:
                    await self.ctx.supabase.requeue_notification(
                        row["id"], attempts, reason
                    )
                    tally.recovered += 1
            except (SupabaseError, httpx.HTTPError) as cause:
                log.error("could not recover an abandoned claim: %s", cause)
                return

        if tally.recovered or tally.failed:
            tally.notes.append(
                f"{tally.recovered} abandoned claim(s) requeued, "
                f"{tally.failed} past the attempt cap"
            )

    async def send_due_retries(self, tally: Tally) -> None:
        """Rows this process is holding whose backoff has run out."""
        for entry in db.due_sends(self.ctx.conn, limit=BATCH):
            row_id = entry["notification_id"]

            try:
                row = await self.ctx.supabase.notification(row_id)
            except (SupabaseError, httpx.HTTPError) as cause:
                log.error("could not re-read a scheduled notification: %s", cause)
                return

            if row is None or row.get("status") != "claimed":
                # Finished, requeued or deleted by something else while this was
                # waiting. The schedule is the stale copy here, so it goes.
                db.forget_send(self.ctx.conn, row_id)
                continue

            tally.retried += 1
            if not await self.send_one(row, tally):
                return

    async def claim_and_send(self, tally: Tally) -> None:
        """The ordinary path: take a batch, send it, record each ending."""
        try:
            rows = await self.ctx.supabase.claim_notifications(
                tuple(RENDERERS), limit=BATCH
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("could not claim a batch: %s", cause)
            return

        tally.claimed += len(rows)

        for row in rows:
            if not await self.send_one(row, tally):
                # A flood wait. Everything still claimed stays claimed and gets
                # a schedule, so the rest of this batch is not lost by being
                # abandoned halfway.
                await self.hold_remaining(rows, row, tally)
                return

    async def hold_remaining(self, rows: list[dict], stopped_at: dict, tally: Tally) -> None:
        """Give the untouched rest of an interrupted batch a time to be tried.

        Without this they would sit `claimed` with nothing holding them until
        the lease expired, which works and takes five minutes longer than it
        needs to. The pause is already written, so they all wake at the same
        moment the paused row does.
        """
        until = db.sends_paused_until(self.ctx.conn) or db.later(60)
        seen = False

        for row in rows:
            if row["id"] == stopped_at["id"]:
                seen = True
                continue
            if not seen:
                continue
            db.schedule_send(
                self.ctx.conn,
                row["id"],
                kind=row.get("kind"),
                attempts=row.get("attempts") or 0,
                not_before=until,
                reason="waiting out a flood wait",
            )
            tally.notes.append(f"held {row['id']} until {until}")

    # -- one row ---------------------------------------------------------

    async def send_one(self, row: dict, tally: Tally) -> bool:
        """Send one claimed row. False means stop the pass, a flood wait is on.

        Every ending is written to the row, which is what makes the outbox the
        durable half of deviation 91's account: the log says what a pass did and
        the table says what became of each message.
        """
        row_id = row["id"]
        kind = row.get("kind")
        render = RENDERERS.get(kind)

        if render is None:
            # Claimed by a filter that named this kind, so this should be
            # unreachable. It is here for the one way it is not: a row claimed
            # by a newer build that was then rolled back, found by the sweep and
            # handed to this one. Released untouched rather than failed.
            log.warning("outbox holds a kind this build cannot render: %r", kind)
            await self.ctx.supabase.release_notification(row_id)
            db.forget_send(self.ctx.conn, row_id)
            tally.released += 1
            return True

        self._in_flight.add(row_id)
        try:
            return await self.deliver(row, render, tally)
        finally:
            self._in_flight.discard(row_id)

    async def deliver(self, row: dict, render, tally: Tally) -> bool:
        row_id = row["id"]
        applicant_id = row["applicant_id"]

        try:
            link = await self.ctx.supabase.link_for_applicant(applicant_id)
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("could not read a link while draining: %s", cause)
            await self.retry_or_fail(row, f"could not read the link: {cause}", tally)
            return True

        if link is None:
            # Section 15: an applicant with no link gets their rows marked
            # skipped rather than left queued forever. Read now rather than at
            # claim time, which is phase 11 decision 3: the site leaves a
            # claimed row alone on an unlink, and this is the check that keeps a
            # message out of a chat somebody has just walked away from.
            await self.finish(row, "skipped", "no telegram link when it was sent")
            tally.skipped += 1
            return True

        applicant = await self.safe_applicant(applicant_id)
        locale = self.locale_for(applicant)

        try:
            rendered = await render(self.ctx, row, applicant, locale)
        except Exception as cause:  # noqa: BLE001 - a bad payload is not a crash
            # A row whose payload is missing something the message needs. It
            # will be missing it in fifteen minutes too, so this is `failed`
            # rather than a retry, and the error names what went wrong.
            log.exception("could not render a %s notification", row.get("kind"))
            await self.finish(row, "failed", f"could not be rendered: {cause}"[:400])
            tally.failed += 1
            return True

        if rendered is None:
            # A renderer's own decision that this row should not be sent, which
            # is how part 5's `notify` toggles will answer. Skipped, because
            # nothing failed and nothing is owed.
            await self.finish(row, "skipped", "the applicant has this kind switched off")
            tally.skipped += 1
            return True

        try:
            await self.client.send_message(
                link["telegram_user_id"],
                rendered.message,
                buttons=rendered.buttons,
                link_preview=False,
            )
        except FloodWaitError as cause:
            await self.handle_flood_wait(row, cause, tally)
            return False
        except PERMANENT_ERRORS as cause:
            # Nothing about this chat will be different in fifteen minutes.
            log.warning("a %s notification cannot be delivered: %s", row.get("kind"), cause)
            await self.finish(row, "failed", str(cause)[:400])
            tally.failed += 1
            return True
        except Exception as cause:  # noqa: BLE001 - a blip is the ordinary case
            log.error("could not send a %s notification: %s", row.get("kind"), cause)
            await self.retry_or_fail(row, str(cause)[:400], tally)
            return True

        await self.finish(row, "sent", None)
        tally.sent += 1

        # Pacing, per section 15. Cheap, and it is the difference between a
        # burst of twenty invitations and a flood wait that delays all of them.
        await asyncio.sleep(SEND_GAP_SECONDS)
        return True

    async def handle_flood_wait(self, row: dict, cause: FloodWaitError, tally: Tally) -> None:
        """Reschedule in SQLite rather than sleeping the worker. Section 15.

        The attempt is deliberately not counted. A flood wait is this process
        being told to slow down, not this message being undeliverable, and
        spending a row's attempts on our own pacing would eventually mark a
        perfectly good notification `failed` because the bot was busy.
        """
        seconds = int(getattr(cause, "seconds", 0) or 0)
        # A little past what Telegram asked for. Coming back at the exact second
        # is how a flood wait becomes two flood waits.
        until = db.later(seconds + 5)
        db.pause_sends(self.ctx.conn, until)
        db.schedule_send(
            self.ctx.conn,
            row["id"],
            kind=row.get("kind"),
            attempts=row.get("attempts") or 0,
            not_before=until,
            reason=f"flood wait {seconds}s",
        )

        log.warning(
            "flood wait of %ss while draining, sending is held until %s", seconds, until
        )
        tally.notes.append(f"flood wait {seconds}s, holding until {until}")

        try:
            await self.ctx.supabase.mark_attempt(
                row["id"], row.get("attempts") or 0, f"waiting out a flood wait of {seconds}s"
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("could not record a flood wait on the row: %s", cause)

    async def retry_or_fail(self, row: dict, error: str, tally: Tally) -> None:
        """One more go later, or `failed` once the attempts are spent.

        **The row stays `claimed` while it waits.** It is owned by this process,
        the schedule that says when to try again is in SQLite beside it, and
        putting it back in the queue would invite the next pass to send it
        immediately, which is the opposite of a backoff.
        """
        attempts = (row.get("attempts") or 0) + 1

        if attempts >= MAX_ATTEMPTS:
            await self.finish(row, "failed", error, attempts=attempts)
            tally.failed += 1
            log.error("a %s notification is failed after %d attempts", row.get("kind"), attempts)
            return

        wait = BACKOFF_SECONDS[min(attempts, len(BACKOFF_SECONDS)) - 1]
        until = db.later(wait)
        db.schedule_send(
            self.ctx.conn,
            row["id"],
            kind=row.get("kind"),
            attempts=attempts,
            not_before=until,
            reason=error,
        )
        tally.notes.append(f"attempt {attempts} failed, next at {until}")

        try:
            await self.ctx.supabase.mark_attempt(row["id"], attempts, error)
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("could not record an attempt: %s", cause)

    async def finish(
        self,
        row: dict,
        status: str,
        error: str | None,
        *,
        attempts: int | None = None,
    ) -> None:
        """Write the ending, and drop any schedule this row was carrying.

        A send counts the attempt it took. A skip does not: nothing was
        attempted, and an attempt count on a skipped row would read as a message
        that was tried and did not arrive.
        """
        if attempts is None and status == "sent":
            attempts = (row.get("attempts") or 0) + 1

        try:
            await self.ctx.supabase.finish_notification(
                row["id"], status, error, attempts=attempts
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            # The message may well have gone out. Saying so in the log is all
            # this process can do; the lease is what stops the row being stuck,
            # since the sweep will find it and count the attempt.
            log.error("could not record a %s ending: %s", status, cause)
            return

        db.forget_send(self.ctx.conn, row["id"])

    # -- small shared things ---------------------------------------------

    async def safe_applicant(self, applicant_id: str) -> dict | None:
        try:
            return await self.ctx.supabase.applicant(applicant_id)
        except (SupabaseError, httpx.HTTPError) as cause:
            log.warning("could not read an applicant while draining: %s", cause)
            return None

    def locale_for(self, applicant: dict | None) -> str:
        """The account's own language. Nobody is typing, so there is no other."""
        stored = (applicant or {}).get("locale")
        return stored if stored in STRINGS else DEFAULT_LOCALE
