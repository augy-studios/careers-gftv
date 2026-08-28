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
