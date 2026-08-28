"""The bot's own SQLite database.

Section 15 draws the line and it is worth restating rather than assuming:
**Supabase is the shared source of truth for accounts, links, tokens, invites
and the outbox, and SQLite never duplicates account data.** What lives here is
bot local only: the registry of active interaction buttons, and later the
scheduling, rate limits and dedupe that go with sending.

**Tables arrive with the part that reads them.** Phase 8 left the rule behind:
a migration applied is not a feature shipped, and `032` created a view that
nothing read for six parts. So part 1 creates the two it uses or is about to,
and part 4's schedule table lands in part 4. `migrate()` is the mechanism for
that, keyed on `PRAGMA user_version`, and a later part appends to MIGRATIONS
rather than editing what is already applied on the VPS.

The callbacks registry is the reason the spec asks for SQLite at all: the
payload behind a button is stored here and looked up on click, so a button in a
message from six weeks ago still works after any number of restarts. Nothing
about a button's meaning is packed into the callback data itself.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("bot.db")

# Appended to, never edited. Index + 1 is the user_version it produces.
#
# A migration is a tuple of statements rather than one script on purpose.
# `executescript` commits whatever transaction is open before it runs a single
# line, so a migration written that way is not inside the transaction it appears
# to be inside, and a failure halfway leaves the schema changed and the version
# not. Found on the first run of this file, which is the entire argument for
# running it once before it ever reaches the VPS.
MIGRATIONS: tuple[tuple[str, ...], ...] = (
    # 1. Part 1. The skeleton's own record, and the button registry.
    (
        """
        create table if not exists bot_meta (
          key        text primary key,
          value      text not null,
          updated_at text not null
        )
        """,
        """
        create table if not exists callbacks (
          id               text primary key,
          kind             text not null,
          payload          text not null,
          telegram_user_id integer,
          chat_id          integer,
          created_at       text not null
        )
        """,
        "create index if not exists callbacks_kind_idx on callbacks (kind)",
    ),
)


def now_iso() -> str:
    """UTC, to the second, matching what the log and Supabase both record."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path) -> sqlite3.Connection:
    """Open the database with the settings this process needs.

    WAL because a reader must never block the drain, and `foreign_keys` on
    because SQLite leaves it off by default and a constraint nothing enforces is
    the failure this build keeps hitting.
    """
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma journal_mode = wal")
    conn.execute("pragma foreign_keys = on")
    conn.execute("pragma busy_timeout = 5000")
    return conn


def migrate(conn: sqlite3.Connection, path: Path | None = None) -> int:
    """Apply every migration this build has that the file does not.

    Returns the version it ends on. Each one runs inside a transaction with the
    version bump, so a migration that throws leaves the version where it was
    rather than half applied.
    """
    version = conn.execute("pragma user_version").fetchone()[0]

    if version > len(MIGRATIONS):
        # The file was written by a newer build than this one. Refusing is the
        # only safe answer: an older bot writing to a newer schema is exactly
        # the drift a rollback is supposed to avoid, not cause.
        raise RuntimeError(
            f"{path or 'the database'} is at schema version {version} and this "
            f"build only knows {len(MIGRATIONS)}. It was written by a newer "
            f"bot. Check out the matching revision rather than running this one."
        )

    for index in range(version, len(MIGRATIONS)):
        target = index + 1
        log.info("applying sqlite migration %d", target)
        conn.execute("begin")
        try:
            for statement in MIGRATIONS[index]:
                conn.execute(statement)
            # user_version is part of the database header and is written inside
            # the transaction with everything else, which is what makes a failed
            # migration a no-op rather than a half applied one.
            conn.execute(f"pragma user_version = {target}")
            conn.execute("commit")
        except Exception:
            conn.execute("rollback")
            raise

    return len(MIGRATIONS)


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "insert into bot_meta (key, value, updated_at) values (?, ?, ?) "
        "on conflict (key) do update set value = excluded.value, "
        "updated_at = excluded.updated_at",
        (key, value, now_iso()),
    )


def get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("select value from bot_meta where key = ?", (key,)).fetchone()
    return row["value"] if row else None


def record_start(conn: sqlite3.Connection, pid: int) -> int:
    """Record this start, and return how many there have been.

    Small, and it earns its place. With no scripted checks, "did the process I
    am looking at actually restart" is a question somebody walking the checklist
    asks several times an hour, and a durable counter answers it without
    trusting a scrollback buffer.
    """
    previous = get_meta(conn, "starts")
    count = (int(previous) if previous and previous.isdigit() else 0) + 1
    set_meta(conn, "starts", str(count))
    set_meta(conn, "last_started_at", now_iso())
    set_meta(conn, "last_pid", str(pid))
    return count


def remember_callback(
    conn: sqlite3.Connection,
    callback_id: str,
    kind: str,
    payload: dict,
    *,
    telegram_user_id: int | None = None,
    chat_id: int | None = None,
) -> None:
    """Store what a button means, so the click can be understood later.

    **Nothing here expires.** Section 15 asks that buttons keep working forever
    across restarts, and a swept registry would turn an old message's button
    into a dead one with no explanation on screen. The rows are tiny and the
    volume is one per button drawn.
    """
    conn.execute(
        "insert or replace into callbacks "
        "(id, kind, payload, telegram_user_id, chat_id, created_at) "
        "values (?, ?, ?, ?, ?, ?)",
        (
            callback_id,
            kind,
            json.dumps(payload, ensure_ascii=False),
            telegram_user_id,
            chat_id,
            now_iso(),
        ),
    )


def read_callback(conn: sqlite3.Connection, callback_id: str) -> dict | None:
    """Look a button's meaning up on click. None when it is not ours."""
    row = conn.execute(
        "select id, kind, payload, telegram_user_id, chat_id, created_at "
        "from callbacks where id = ?",
        (callback_id,),
    ).fetchone()
    if row is None:
        return None

    return {
        "id": row["id"],
        "kind": row["kind"],
        "payload": json.loads(row["payload"]),
        "telegram_user_id": row["telegram_user_id"],
        "chat_id": row["chat_id"],
        "created_at": row["created_at"],
    }
