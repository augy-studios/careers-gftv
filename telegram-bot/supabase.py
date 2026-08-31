"""The bot's access to Supabase, over PostgREST.

**Supabase is the shared source of truth and SQLite never duplicates account
data**, per section 15. This file is the whole of the bot's reach into it, so
what the service key is used for is one file rather than a habit spread across
handlers.

**The key bypasses row level security.** Everything the site protects with RLS
plus the shape of PostgREST is wide open to this process, which is why the VPS
holding it is treated the way it is, and why nothing here selects `*`: every
query names its columns, so a column added later is not silently pulled into a
chat message.

**Nothing here reads and then writes.** Where a decision has to be made about a
row that another process might touch, it is made by the database in one
conditional update that returns what it changed. Spending a linking token and
claiming a batch from the outbox are both that shape, and deviation 91 says why
in full: the failure a scripted check would have caught here is a double send
after a restart, so it is made impossible by the query rather than unlikely.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from strings import DEFAULT_LOCALE

log = logging.getLogger("bot.supabase")

TIMEOUT = 15.0

# The same names api/_lib/supabase.js gives them, and the same warning: the
# three telegram tables are not named the way the rest of this schema is. The
# column is applicant_id rather than user_id, and linked_at rather than
# created_at.
TABLES = {
    "users": "gftvjobs_users",
    "telegram_links": "gftvjobs_telegram_links",
    "telegram_tokens": "gftvjobs_telegram_tokens",
    "notifications": "gftvjobs_notifications",
    "invites": "gftvjobs_invites",
    "audit_log": "gftvjobs_audit_log",
    # Part 6, and the whole of what the four list commands added. **Every one of
    # them is read only, is scoped by the applicant asking, and names its
    # columns**, which is what keeps this the narrow reach section 15 describes
    # rather than a service key with the run of the schema. Nothing in the bot
    # writes to any of these five.
    #
    # `/jobs` is deliberately absent from this list: the newest openings come
    # from the site's own public feed, so the board and the chat cannot disagree
    # about what is live. See feed.py.
    "jobs": "gftvjobs_jobs",
    "job_translations": "gftvjobs_job_translations",
    "applications": "gftvjobs_applications",
    "tasks": "gftvjobs_tasks",
    "analytics": "gftvjobs_analytics",
    # Phase 12 part 7, migration 037. **The only tables anything on this VPS
    # writes that the site never writes at all**, and the only ones written by
    # `probe.py` rather than by the bot: 0c puts the prober outside Vercel
    # because a status page hosted on the thing it monitors is useless during
    # the outage it exists to report.
    #
    # Neither is written through this map. The probe calls
    # `gftvjobs_status_record()` instead, because a check is a counter going up
    # and an outage being opened or closed rather than a row being inserted.
    # They are named here so the reach of this service key is one list.
    "status_days": "gftvjobs_status_days",
    "status_incidents": "gftvjobs_status_incidents",
}

# What counts as an invitation still worth answering, per migration 008's status
# list. **The same pair `decline_invite` filters on**, and that is the point: a
# list that offered a button for an invite the poster has withdrawn would be a
# list of buttons that answer "there is nothing here to decline".
OPEN_INVITE_STATUSES = ("invited", "seen")

# What `/account/tasks` counts as outstanding, from OPEN_STATUSES in
# api/_lib/tasks.js. A task at `awaiting_admin` is open and is waiting on us, and
# it still belongs in the count, because the page it links to lists it.
OPEN_TASK_STATUSES = ("open", "awaiting_admin")

# The analytics event an unanswered apply prompt is derived from, and the reason
# the filter is written out rather than left as "pending rows". api/_lib/apply.js
# says it at length: phase 8 writes `view` rows into the same table at
# `response_state` pending, and a count that forgot this would tell every reader
# they had thirty outstanding tasks.
APPLY_CLICK = "apply_click"

# Every column a link read hands back. **The three notify columns are read
# everywhere the link is**, because the drain's toggle check and the /notify
# command are the same question asked from two directions, and a select that
# named them in one place and not the other would answer "off" for a kind
# somebody had switched on. Migration 011 defaults all three to true.
LINK_COLUMNS = (
    "id, applicant_id, telegram_user_id, telegram_username, twofa_enabled, linked_at, "
    "notify_invite, notify_task_raised, notify_application_status_changed"
)

# Which column carries the toggle for each notification kind, per migration 011.
# **One dictionary, read by both sides of the toggle**: the drain checks it
# before it sends and `/notify` writes through it, so the switch somebody flips
# and the switch that is honoured are the same column by construction. A kind
# missing from here is a kind nobody can silence, which is what a security
# message is and what the test message from account settings is.
NOTIFY_COLUMN = {
    "invite": "notify_invite",
    "task_raised": "notify_task_raised",
    "application_status_changed": "notify_application_status_changed",
}

NOTIFY_COLUMNS = frozenset(NOTIFY_COLUMN.values())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseError(RuntimeError):
    """PostgREST answered with something other than success."""


class Supabase:
    """A small PostgREST client. Only the verbs this bot actually uses."""

    def __init__(self, url: str, service_key: str, client: httpx.AsyncClient) -> None:
        self._base = f"{url.rstrip('/')}/rest/v1"
        self._client = client
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> list[dict]:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer

        response = await self._client.request(
            method,
            f"{self._base}/{TABLES[table]}",
            params=params,
            json=json,
            headers=headers,
            timeout=TIMEOUT,
        )

        if response.status_code >= 400:
            # The body carries PostgREST's own message, which names the
            # constraint when one was violated. That is the useful half and it
            # is worth keeping in the log rather than reducing to a status code.
            raise SupabaseError(
                f"{method} {table} answered {response.status_code}: {response.text[:400]}"
            )

        if response.status_code == 204 or not response.content:
            return []

        payload = response.json()
        return payload if isinstance(payload, list) else [payload]

    async def select(
        self, table: str, columns: str, filters: dict[str, str], *, limit: int | None = None
    ) -> list[dict]:
        params = {"select": columns, **filters}
        if limit is not None:
            params["limit"] = str(limit)
        return await self._request("GET", table, params=params)

    async def one(self, table: str, columns: str, filters: dict[str, str]) -> dict | None:
        rows = await self.select(table, columns, filters, limit=1)
        return rows[0] if rows else None

    async def count(self, table: str, filters: dict[str, str]) -> int | None:
        """How many rows match, without reading any of them.

        PostgREST answers a count in `Content-Range` when it is asked for, which
        is why this makes its own request rather than going through `_request`:
        the number is in a header and nothing else here reads one.

        **A count that could not be established is None and never 0.** The site
        settled this for `api/admin/me` and phase 10 extended it: "the table
        could not be read" and "there is nothing there" are different claims, and
        only one of them is ours to make. Every caller here says so out loud
        rather than telling somebody their tasks page is empty.
        """
        headers = dict(self._headers)
        headers["Prefer"] = "count=exact"

        response = await self._client.get(
            f"{self._base}/{TABLES[table]}",
            params={"select": "id", "limit": "1", **filters},
            headers=headers,
            timeout=TIMEOUT,
        )

        if response.status_code >= 400:
            raise SupabaseError(
                f"count {table} answered {response.status_code}: {response.text[:400]}"
            )

        # `0-0/17`, or `*/17` when the range is empty. The total is what is
        # wanted either way, and a header that does not carry one is a count we
        # did not get rather than a zero we can report.
        total = response.headers.get("content-range", "").rpartition("/")[2]
        return int(total) if total.isdigit() else None

    async def insert(self, table: str, row: dict, *, returning: str = "representation") -> list[dict]:
        return await self._request(
            "POST", table, json=row, prefer=f"return={returning}"
        )

    async def rpc(self, name: str, payload: dict) -> None:
        """Call a Postgres function, and read nothing back.

        The probe's shape and nothing else's, and it is a function rather than
        an insert for the reason migration 037 gives at length: what a check
        means is a day counter going up and an outage row being opened,
        extended or closed, and all of that is one statement per check inside
        one function. Doing it from here would be a read and then a write,
        which is the thing this file's own docstring says nothing does.

        One request per cycle, carrying all four results, so the four
        observations of one moment land together or not at all.
        """
        response = await self._client.post(
            f"{self._base}/rpc/{name}",
            json=payload,
            headers={**self._headers, "Prefer": "return=minimal"},
            timeout=TIMEOUT,
        )

        if response.status_code >= 400:
            raise SupabaseError(
                f"rpc {name} answered {response.status_code}: {response.text[:400]}"
            )

    async def update(self, table: str, filters: dict[str, str], patch: dict) -> list[dict]:
        """Update, and answer with the rows that actually changed.

        The return is the point. A conditional update that answers with what it
        moved is how a claim is made safe: the filter is the condition, and the
        rows that come back are the ones this process now owns.
        """
        return await self._request(
            "PATCH",
            table,
            params={"select": "*", **filters},
            json=patch,
            prefer="return=representation",
        )

    async def delete(self, table: str, filters: dict[str, str]) -> list[dict]:
        return await self._request(
            "DELETE",
            table,
            params={"select": "*", **filters},
            prefer="return=representation",
        )

    # -- the things the bot asks for by name -----------------------------

    async def link_for_telegram_user(self, telegram_user_id: int) -> dict | None:
        """The portal account this Telegram account is linked to, if any."""
        return await self.one(
            "telegram_links",
            LINK_COLUMNS,
            {"telegram_user_id": f"eq.{telegram_user_id}"},
        )

    async def link_for_applicant(self, applicant_id: str) -> dict | None:
        return await self.one(
            "telegram_links",
            LINK_COLUMNS,
            {"applicant_id": f"eq.{applicant_id}"},
        )

    async def set_notify(self, applicant_id: str, column: str, wanted: bool) -> dict | None:
        """Turn one notification kind on or off for one account.

        **The column name is never taken from a message.** It comes from
        `NOTIFY_COLUMN` in outbox.py, which is the same dictionary the drain
        checks before it sends, so the switch somebody flips and the switch that
        is read are the same one by construction rather than by two lists
        agreeing. Anything else is refused here rather than sent to PostgREST as
        a filter, because a column name is not user input in any circumstances.
        """
        if column not in NOTIFY_COLUMNS:
            raise SupabaseError(f"{column} is not a notify column")

        rows = await self.update(
            "telegram_links",
            {"applicant_id": f"eq.{applicant_id}"},
            {column: bool(wanted)},
        )
        return rows[0] if rows else None

    async def decline_invite(self, job_id: str, applicant_id: str) -> bool:
        """The decline button on an invitation, per section 15.

        **Only a row that was sent and not answered can be declined**, which is
        the filter rather than a check above it: an invite already withdrawn by
        the poster, or one where the applicant has since applied, must not be
        rewritten by a button in a message from last month. Section 15 asks for
        the button to keep working forever, and this is what makes that safe.

        `seen` is accepted as well as `invited` and nothing writes `seen` yet, so
        the second half of that filter is for the day something does.
        """
        rows = await self.update(
            "invites",
            {
                "job_id": f"eq.{job_id}",
                "applicant_id": f"eq.{applicant_id}",
                "status": "in.(invited,seen)",
            },
            {"status": "declined"},
        )
        return len(rows) > 0

    async def applicant(self, applicant_id: str) -> dict | None:
        return await self.one(
            "users",
            "id, username, display_name, locale",
            {"id": f"eq.{applicant_id}"},
        )

    # -- login codes and magic links, section 15 -------------------------

    async def claim_code_requests(self, limit: int = 10) -> list[dict]:
        """Take every code request nobody has started sending, in one statement.

        **The claim and the send are two steps and this is the first**, exactly
        as the outbox works. The site writes `token_hash` as `pending:<random>`
        to mean *somebody wants a code*; this moves the whole batch to
        `sending:<random>` and answers with the rows it moved, so a second
        instance that starts polling a millisecond later claims nothing and
        sends nothing. Deviation 91: the double send is made impossible by the
        query rather than unlikely by there being one process.

        The filter is a prefix match rather than a list of ids, which is what
        makes it one statement for a whole batch. A bcrypt hash starts `$2` and
        can never match it.
        """
        rows = await self.update(
            "telegram_tokens",
            {
                "token_hash": "like.pending:*",
                "purpose": "eq.login_code",
                "used_at": "is.null",
                "expires_at": f"gt.{now_iso()}",
                "limit": str(limit),
                "order": "created_at.asc",
            },
            {"token_hash": f"sending:{uuid.uuid4().hex}"},
        )
        return rows

    async def store_code_hash(self, row_id: str, code_hash: str) -> bool:
        """Write the hash of the code that is about to be sent.

        Written before the message goes out, not after. A hash stored for a
        message that then failed to send is a code nobody can use, which expires
        in five minutes; a message sent against a row with no hash on it is a
        code that cannot be verified at all, and the person is holding it.
        """
        rows = await self.update(
            "telegram_tokens",
            {"id": f"eq.{row_id}"},
            {"token_hash": code_hash},
        )
        return len(rows) > 0

    async def create_code_row(
        self, applicant_id: str, code_hash: str, expires_at: str
    ) -> dict:
        """A code the bot issued on its own, for `/code` typed into the chat.

        No `browser_nonce_hash`, and that absence is the whole difference: no
        browser asked for this, so no magic link is ever made for it. A one tap
        sign in link produced by a chat message would be a credential with
        nothing to bind it to.
        """
        rows = await self.insert(
            "telegram_tokens",
            {
                "applicant_id": applicant_id,
                "token_hash": code_hash,
                "purpose": "login_code",
                "expires_at": expires_at,
            },
        )
        return rows[0]

    async def create_magic_row(
        self,
        applicant_id: str,
        token_hash: str,
        nonce_hash: str,
        expires_at: str,
    ) -> dict:
        """The one tap link that rides along with a pushed code.

        The nonce hash is copied from the request row rather than made here. It
        belongs to the browser that asked, the site is the only thing that ever
        saw the nonce itself, and a link this side bound to anything else would
        be a link bound to nothing.
        """
        rows = await self.insert(
            "telegram_tokens",
            {
                "applicant_id": applicant_id,
                "token_hash": token_hash,
                "purpose": "magic_link",
                "browser_nonce_hash": nonce_hash,
                "expires_at": expires_at,
            },
        )
        return rows[0]

    async def spend_codes(self, applicant_id: str) -> int:
        """Kill every outstanding code and link for one account.

        Section 15: invalidated on issuing a newer code. The site does this as
        it writes a request; `/code` does it here, and the two have to agree,
        which is why both spend the magic links as well as the codes. A newer
        code that left an older one tap link alive would be a sign in credential
        outliving the sign in it was issued for.
        """
        rows = await self.update(
            "telegram_tokens",
            {
                "applicant_id": f"eq.{applicant_id}",
                "purpose": "in.(login_code,magic_link)",
                "used_at": "is.null",
            },
            {"used_at": now_iso()},
        )
        return len(rows)

    async def fail_code_request(self, row_id: str) -> None:
        """Give up on a claimed request without leaving it half sent.

        Marked used rather than put back. A retry would mean a second message
        for one request, and the person is looking at a login form with a
        working fallback on it: `/code` in the chat, and their backup codes.
        """
        await self.update(
            "telegram_tokens", {"id": f"eq.{row_id}"}, {"used_at": now_iso()}
        )

    # -- the outbox -----------------------------------------------------

    async def claim_notifications(self, kinds: tuple[str, ...], limit: int = 20) -> list[dict]:
        """Move a batch from queued to claimed, in one conditional update.

        Section 15's rule, and the whole of the defence against a double send:
        two instances polling a second apart cannot both be handed a row,
        because the second one's update matches nothing.

        **The kinds filter is what makes an older bot safe.** The site and the
        bot are deployed separately, so the site can queue a kind this build has
        never heard of; naming the kinds this build can actually render means
        such a row is never claimed at all and waits, queued, for the pull that
        teaches this process what it is.
        """
        rows = await self.update(
            "notifications",
            {
                "status": "eq.queued",
                "kind": f"in.({','.join(kinds)})",
                "limit": str(limit),
                "order": "created_at.asc",
            },
            {"status": "claimed", "claimed_at": now_iso()},
        )
        return rows

    async def notification(self, row_id: str) -> dict | None:
        """One outbox row, read back before a scheduled retry is sent.

        The schedule lives in SQLite and the truth lives here, so a retry asks
        again rather than sending from the copy it took fifteen minutes ago. A
        row somebody has unlinked, an admin has touched, or another process has
        finished is one this pass must leave alone.
        """
        return await self.one(
            "notifications",
            "id, applicant_id, kind, payload, status, attempts, error, claimed_at, created_at",
            {"id": f"eq.{row_id}"},
        )

    async def stale_claims(self, claimed_before: str, limit: int = 50) -> list[dict]:
        """Rows claimed long enough ago that nobody can still be sending them.

        This is the restart mid drain, which section 15 names as the failure
        worth walking by hand. A claim is a lease rather than a permanent
        transfer: the process that took it can be killed between the claim and
        the send, and without this the row would sit `claimed` forever, which is
        the same shape as the queued row nobody drains that rule 3 exists to
        prevent.
        """
        return await self.select(
            "notifications",
            "id, applicant_id, kind, payload, status, attempts, error, claimed_at, created_at",
            {
                "status": "eq.claimed",
                "claimed_at": f"lt.{claimed_before}",
                "order": "claimed_at.asc",
            },
            limit=limit,
        )

    async def requeue_notification(
        self, row_id: str, attempts: int, error: str | None
    ) -> bool:
        """Put a row back in the queue, counting the attempt that was lost.

        **Filtered on still being claimed**, so this cannot resurrect a row that
        has since been sent or skipped by anything else. The attempt is counted
        because an abandoned claim is one delivery this row has already cost,
        and a row that abandons a claim every time has to reach `failed`
        eventually rather than circling for ever.
        """
        rows = await self.update(
            "notifications",
            {"id": f"eq.{row_id}", "status": "eq.claimed"},
            {
                "status": "queued",
                "claimed_at": None,
                "attempts": attempts,
                "error": error,
            },
        )
        return len(rows) > 0

    async def release_notification(self, row_id: str) -> bool:
        """Hand a claimed row back untouched, as though it was never taken.

        For a kind this build cannot render, which is the one case where nothing
        has been attempted and nothing is wrong: a newer site queued something a
        later pull will know how to send. No attempt is counted and no error is
        written, because neither would be true.
        """
        rows = await self.update(
            "notifications",
            {"id": f"eq.{row_id}", "status": "eq.claimed"},
            {"status": "queued", "claimed_at": None},
        )
        return len(rows) > 0

    async def mark_attempt(self, row_id: str, attempts: int, error: str) -> None:
        """Record a failed attempt on a row this process is still holding.

        The status stays `claimed`, which is the honest word for it: the row is
        owned, it is waiting out a backoff in SQLite, and nothing else should
        touch it. What this writes is the count and the reason, so the admin
        panel can say a row is being retried and why rather than showing a claim
        that looks stuck.
        """
        await self.update(
            "notifications",
            {"id": f"eq.{row_id}"},
            {"attempts": attempts, "error": error},
        )

    async def finish_notification(
        self,
        row_id: str,
        status: str,
        error: str | None = None,
        *,
        attempts: int | None = None,
    ) -> None:
        """Record how a claimed row ended: sent, failed, or skipped."""
        patch: dict[str, Any] = {"status": status, "error": error}
        if attempts is not None:
            patch["attempts"] = attempts
        if status == "sent":
            patch["sent_at"] = now_iso()
        await self.update("notifications", {"id": f"eq.{row_id}"}, patch)

    async def spend_link_token(self, token_hash: str) -> dict | None:
        """Take an unused, unexpired linking token, in one statement.

        **Claimed before the link is written, not after.** Section 15 step 3
        lists writing the link first and marking the token used after, and the
        other order is safer for the same reason the outbox claims a batch
        before sending it: two people opening the same deep link at the same
        moment must not both get a link, and the only way to guarantee that is
        to let the database decide which of them owns the token.

        The cost is that a failure after this point burns the token, and the
        person is told to ask for another. That is the right way round: a spare
        token is ten minutes of nothing, and a double link is a constraint
        violation somebody has to unpick by hand.
        """
        rows = await self.update(
            "telegram_tokens",
            {
                "token_hash": f"eq.{token_hash}",
                "purpose": "eq.link",
                "used_at": "is.null",
                "expires_at": f"gt.{now_iso()}",
            },
            {"used_at": now_iso()},
        )
        return rows[0] if rows else None

    async def create_link(
        self,
        applicant_id: str,
        telegram_user_id: int,
        username: str | None,
        display_name: str | None,
    ) -> dict:
        rows = await self.insert(
            "telegram_links",
            {
                "applicant_id": applicant_id,
                "telegram_user_id": telegram_user_id,
                "telegram_username": username,
                "telegram_display_name": display_name,
            },
        )
        return rows[0]

    async def remove_link(self, applicant_id: str) -> bool:
        rows = await self.delete(
            "telegram_links", {"applicant_id": f"eq.{applicant_id}"}
        )
        return len(rows) > 0

    async def skip_queued(self, applicant_id: str, reason: str) -> int:
        """Stop anything queued for somebody who can no longer receive it.

        **The same rule as api/_lib/telegram.js's unlink, and the two have to
        stay the same.** Queued rows are skipped and claimed rows are left
        alone, because a claimed row belongs to a drain that is about to send
        it, and the drain re-reads the link immediately before each send. Phase
        11 open decision 3, settled 28 August 2026.
        """
        rows = await self.update(
            "notifications",
            {"applicant_id": f"eq.{applicant_id}", "status": "eq.queued"},
            {"status": "skipped", "error": reason},
        )
        return len(rows)

    # -- the four list commands, part 6 ----------------------------------
    #
    # All read only, all scoped by the account asking, and none of them writes a
    # thing. A command is somebody typing a question now, so these read the
    # tables rather than a payload: deviation 107 keeps a *notification* to what
    # was true when it was queued, because nobody is standing there, and the
    # opposite is right when somebody has just asked.

    async def open_invites(self, applicant_id: str, limit: int = 10) -> list[dict]:
        """Invitations still worth answering, newest first.

        Filtered on the two open statuses rather than listing everything and
        letting the message decide, so a withdrawn invite is not something this
        process ever holds. `applied` and `declined` are answered and `withdrawn`
        was taken back, and none of the three is an invitation any more.
        """
        return await self.select(
            "invites",
            "id, job_id, note, status, created_at",
            {
                "applicant_id": f"eq.{applicant_id}",
                "status": f"in.({','.join(OPEN_INVITE_STATUSES)})",
                "order": "created_at.desc",
            },
            limit=limit,
        )

    async def applications_for(self, applicant_id: str, limit: int = 10) -> list[dict]:
        """This applicant's tracking rows, most recently moved first.

        **No filter on the posting's status at all**, which is the same rule
        api/_lib/dashboard.js opens with: these lists have to keep working for
        postings that are closed, expired or archived, because somebody can
        always reread what they applied for. The scope is the applicant's own
        rows and nothing else.
        """
        return await self.select(
            "applications",
            "id, job_id, status, applied_at, updated_at",
            {"applicant_id": f"eq.{applicant_id}", "order": "updated_at.desc"},
            limit=limit,
        )

    async def job_titles(self, job_ids: list[str], locale: str) -> dict[str, dict]:
        """What a set of postings are called, in one language.

        Two queries whatever the length of the list, and resolved exactly as
        `jobSummaries` resolves it: the base row holds the default language, a
        translation marked ready overrides it, and a blank field on the
        translation falls back rather than blanking the row. Settled 29 August
        2026 with part 6: a role reads in this chat the way it reads on
        `/account/applications`, because the same person is reading both.

        **A translation lookup that fails leaves the base rows standing**, which
        is the judgement dashboard.js, job-detail.js and facets.js all make: a
        list in English is a much better answer than no list.

        A posting missing from the answer has been hard deleted, and every caller
        drops that row rather than drawing a blank title.
        """
        ids = list({str(job_id) for job_id in job_ids if job_id})
        if not ids:
            return {}

        rows = await self.select(
            "jobs",
            "id, title, status, closes_at",
            {"id": f"in.({','.join(ids)})"},
            limit=len(ids),
        )

        found = {
            row["id"]: {
                "title": row.get("title"),
                "status": row.get("status"),
                "closes_at": row.get("closes_at"),
            }
            for row in rows
        }

        # Migration 014 forbids a translation row for the default language, so
        # the common path costs nothing rather than costing a query that can only
        # answer nothing.
        if locale == DEFAULT_LOCALE or not found:
            return found

        try:
            translated = await self.select(
                "job_translations",
                "job_id, title",
                {
                    "job_id": f"in.({','.join(ids)})",
                    "locale": f"eq.{locale}",
                    "is_ready": "is.true",
                },
                limit=len(ids),
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            log.warning("could not read job translations: %s", cause)
            return found

        for row in translated:
            title = (row.get("title") or "").strip()
            if title and row["job_id"] in found:
                found[row["job_id"]]["title"] = title

        return found

    async def open_task_count(self, applicant_id: str) -> int | None:
        """Admin raised items still waiting, which is half of what /tasks says."""
        return await self.count(
            "tasks",
            {
                "applicant_id": f"eq.{applicant_id}",
                "status": f"in.({','.join(OPEN_TASK_STATUSES)})",
            },
        )

    async def pending_prompt_count(self, applicant_id: str) -> int | None:
        """Unanswered apply prompts, which is the other half.

        7g and migration 008 both say these are derived live from
        `gftvjobs_analytics` and are never copied into `gftvjobs_tasks`, so a
        count of the tasks table alone is not the number `/account/tasks` shows.
        Settled 29 August 2026: the bot counts what the page counts, because a
        message saying two that links to a page showing five is a disagreement
        nobody would ever think to report.
        """
        return await self.count(
            "analytics",
            {
                "applicant_id": f"eq.{applicant_id}",
                "event_type": f"eq.{APPLY_CLICK}",
                "response_state": "eq.pending",
            },
        )

    async def audit(
        self,
        action: str,
        applicant: dict | None,
        metadata: dict | None = None,
        *,
        target_id: str | None = None,
        target_table: str = "telegram_links",
    ) -> None:
        """Write one audit row, and never fail the thing it was recording.

        The realm and the actor are the applicant's, not the bot's. It is still
        their action: they linked their own account, from the other end of it.
        api/_lib/audit.js says the same at its own call sites.
        """
        try:
            await self.insert(
                "audit_log",
                {
                    "actor_realm": "applicant",
                    "actor_id": (applicant or {}).get("id"),
                    "actor_label": (applicant or {}).get("username"),
                    "action": action,
                    "target_table": TABLES[target_table],
                    "target_id": target_id,
                    "metadata": metadata or {},
                },
                returning="minimal",
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("audit write failed for %s: %s", action, cause)
