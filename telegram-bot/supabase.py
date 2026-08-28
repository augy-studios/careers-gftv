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
    "audit_log": "gftvjobs_audit_log",
}


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

    async def insert(self, table: str, row: dict, *, returning: str = "representation") -> list[dict]:
        return await self._request(
            "POST", table, json=row, prefer=f"return={returning}"
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
            "id, applicant_id, telegram_user_id, telegram_username, twofa_enabled, linked_at",
            {"telegram_user_id": f"eq.{telegram_user_id}"},
        )

    async def link_for_applicant(self, applicant_id: str) -> dict | None:
        return await self.one(
            "telegram_links",
            "id, applicant_id, telegram_user_id, telegram_username, twofa_enabled, linked_at",
            {"applicant_id": f"eq.{applicant_id}"},
        )

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

    # -- the outbox, part 3's corner of it -------------------------------

    async def claim_notifications(self, kinds: tuple[str, ...], limit: int = 20) -> list[dict]:
        """Move a batch from queued to claimed, in one conditional update.

        Section 15's rule, and part 4 widens the `kinds` filter rather than
        writing this again: part 3 drains `telegram_test` alone, because that is
        the only kind anything writes yet, and the claim it uses is already the
        one the three real kinds need.
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

    async def finish_notification(
        self, row_id: str, status: str, error: str | None = None
    ) -> None:
        """Record how a claimed row ended: sent, failed, or skipped."""
        patch: dict[str, Any] = {"status": status, "error": error}
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

    async def audit(
        self,
        action: str,
        applicant: dict | None,
        metadata: dict | None = None,
        *,
        target_id: str | None = None,
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
                    "target_table": TABLES["telegram_links"],
                    "target_id": target_id,
                    "metadata": metadata or {},
                },
                returning="minimal",
            )
        except (SupabaseError, httpx.HTTPError) as cause:
            log.error("audit write failed for %s: %s", action, cause)
