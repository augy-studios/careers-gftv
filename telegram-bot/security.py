"""The fast loop: sign in codes, one tap links, and the test message.

**Why this exists at all.** Section 15 fixes two rules that pull in opposite
directions. The site never calls the bot, and security messages such as a login
code are "sent directly rather than queued". The outbox answers the first and
not the second: it is polled every fifteen to thirty seconds, which is a
reasonable wait for an invitation and an unreasonable one for somebody sitting
in front of a login form. So there are two loops rather than one. This is the
fast one, it runs every couple of seconds, and the only things it carries are
the ones somebody is actively waiting for. `outbox.py` is the slow one, and part
4 moved the outbox out of here entirely: this file drained one test kind while
the drain proper did not exist, and keeping a second copy of the claim after it
did would be two things doing one job.

**The bot generates the code, and that is not what section 15 reads like.** It
says the portal sends a code, and the portal cannot: nothing on the site's side
can reach Telegram. Whoever sends the message is therefore the only thing that
can know what it says, and `gftvjobs_telegram_tokens` stores hashes and never a
code. So the site writes a row meaning *somebody asked for a code*, and this
fills it in. The six digits exist in one process and one chat message. They are
never logged, here or anywhere else.

**Two instances cannot double send.** Every batch is claimed by one conditional
update that answers with the rows it moved, for codes and for outbox rows alike.
That is deviation 91's requirement rather than a preference: a double send after
a restart is one of the two failures a scripted check would have caught here, so
it is made impossible by the query.

**The link is re-read immediately before every send.** Phase 11 decision 3: the
site skips queued rows on an unlink and leaves claimed ones alone, and this is
the other half of that. A row claimed a second before somebody unlinked is
skipped here rather than delivered to a chat they have just walked away from.

**This loop does not read the maintenance switches, and `handlers.py` does.** A
command is a person asking for something and can be told to come back later; a
row in this queue is somebody already halfway through signing in, and refusing
to deliver their code would not degrade the feature, it would lock them out of
an account whose password they have already typed correctly. The switch still
does its work at both ends that matter: `/code` stops answering, and the site
refuses the one tap link, which has the code beside it as a fallback.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import secrets

import bcrypt
import httpx
from telethon import Button
from telethon.errors import FloodWaitError

from strings import DEFAULT_LOCALE, STRINGS, text
from supabase import SupabaseError

log = logging.getLogger("bot.security")

# How often the codes are looked for. Two seconds is what makes a pushed code
# feel like it arrived because somebody pressed a button rather than because a
# timer went off. It is one conditional update against an indexed prefix that
# matches nothing almost every time.
CODE_POLL_SECONDS = 2.0

# The same cost factor as main-site/api/_lib/password.js. Written down in both
# places because the two have to agree and neither can read the other.
BCRYPT_ROUNDS = 12


def six_digits() -> str:
    """A code, from the system CSPRNG, with every value equally likely.

    `randbelow` rather than a modulo of a random draw, for the reason the site's
    own `randomSixDigitCode` uses rejection sampling: a modulo over a range that
    does not divide evenly makes the low codes more likely than the high ones,
    which is a bias somebody can use.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


async def hash_code(code: str) -> str:
    """bcrypt the code, off the event loop.

    Cost 12 is about a quarter of a second of solid CPU. Doing that inline would
    stop every other conversation this process is having for as long as it takes,
    which on a bot answering several people at once is exactly the stall the
    async client exists to avoid.
    """
    return await asyncio.to_thread(
        lambda: bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("ascii")
    )


class SecurityLoop:
    """One task, owned by bot.py, that fails without taking the bot down."""

    def __init__(self, ctx, client) -> None:
        self.ctx = ctx
        self.client = client
        self._pass = 0

    async def run(self, stopping: asyncio.Event) -> None:
        """Poll until the process is asked to stop.

        **Nothing in here is allowed to end the loop.** A network blip, a
        PostgREST error, a chat that has blocked the bot: every one of those is
        logged and the next pass happens anyway. A security loop that exits on
        its first bad afternoon is worse than no loop, because the site keeps
        writing requests nobody drains and the failure is silent on both sides.
        """
        log.info("security loop started, polling every %.1fs", CODE_POLL_SECONDS)

        while not stopping.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 - the loop outlives every failure
                log.exception("security loop pass failed")

            try:
                await asyncio.wait_for(stopping.wait(), timeout=CODE_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass

        log.info("security loop stopped")

    async def tick(self) -> None:
        self._pass += 1

        claimed = await self.ctx.supabase.claim_code_requests()
        for row in claimed:
            await self.send_code(row)

    # -- codes ----------------------------------------------------------

    async def send_code(self, row: dict) -> None:
        """Generate, store, and send one code. And the link, when one was asked for.

        The order is deliberate and is the same one phase 9's webhook uses: the
        hash is written before the message goes out. A hash stored for a message
        that then failed to send is a code nobody holds, and it expires in five
        minutes; a message sent against a row with no hash is a code somebody is
        holding that can never be accepted.
        """
        applicant_id = row["applicant_id"]

        link = await self.ctx.supabase.link_for_applicant(applicant_id)
        if link is None:
            # Section 15: never send a code to a Telegram account that is not
            # currently linked to the account being signed into. Between the
            # site writing this row and this pass claiming it, the link can have
            # gone, and this is the check that catches it.
            log.info("a code request had no link by the time it was claimed")
            await self.ctx.supabase.fail_code_request(row["id"])
            return

        applicant = await self.safe_applicant(applicant_id)
        locale = self.locale_for(applicant)

        code = six_digits()
        stored = await self.ctx.supabase.store_code_hash(row["id"], await hash_code(code))

        if not stored:
            log.error("a claimed code request could not be written back to")
            return

        buttons = None
        nonce_hash = row.get("browser_nonce_hash")

        if nonce_hash:
            # The one tap half. Only ever for a request that came from a
            # browser, because the nonce is the only thing that makes a link in
            # a chat safe, and a request typed into the chat has no browser to
            # bind to.
            try:
                token = secrets.token_urlsafe(32)
                await self.ctx.supabase.create_magic_row(
                    applicant_id,
                    hashlib.sha256(token.encode("utf-8")).hexdigest(),
                    nonce_hash,
                    row["expires_at"],
                )
                url = f"{self.ctx.config.site_url}/api/auth/applicant/magic?token={token}"
                buttons = [[Button.url(text("button.signIn", locale), url)]]
            except (SupabaseError, httpx.HTTPError) as cause:
                # The code still works and the message still goes out. A one tap
                # link is the convenience half of this and is not worth failing a
                # sign in over.
                log.error("could not write the magic link row: %s", cause)

        message = text("code.message", locale, code=html.escape(code))

        try:
            await self.client.send_message(
                link["telegram_user_id"],
                message,
                buttons=buttons,
                link_preview=False,
            )
        except FloodWaitError as cause:
            # Rescheduling a login code is worse than dropping it: by the time
            # Telegram lets us talk again the five minutes are gone, and the
            # person has long since used /code or a backup code. Part 4
            # reschedules notifications, which are not being waited for.
            log.error("flood wait of %ss while sending a code", cause.seconds)
            await self.ctx.supabase.fail_code_request(row["id"])
            return
        except Exception as cause:  # noqa: BLE001 - a blocked chat is ordinary
            log.error("could not send a code: %s", cause)
            await self.ctx.supabase.fail_code_request(row["id"])
            return

        # Never the code, never the account, and no link between the two. What
        # is worth having in the log is that one went out at all.
        log.info("sent a sign in code%s", " with a one tap link" if buttons else "")

    # -- small shared things --------------------------------------------

    async def safe_applicant(self, applicant_id: str) -> dict | None:
        try:
            return await self.ctx.supabase.applicant(applicant_id)
        except (SupabaseError, httpx.HTTPError) as cause:
            log.warning("could not read an applicant while sending: %s", cause)
            return None

    def locale_for(self, applicant: dict | None) -> str:
        """The account's own language, and English when it names one we lack.

        There is no Telegram client language to fall back on here, unlike a
        command: nobody is typing, so there is no message to read a `lang_code`
        off. The account is the only evidence, which is exactly why migration
        020 put a locale on it.
        """
        stored = (applicant or {}).get("locale")
        return stored if stored in STRINGS else DEFAULT_LOCALE
