"""The bot's own SQLite database.

Section 15 draws the line and it is worth restating rather than assuming:
**Supabase is the shared source of truth for accounts, links, tokens, invites
and the outbox, and SQLite never duplicates account data.** What lives here is
bot local only: the registry of active interaction buttons, and later the
scheduling, rate limits and dedupe that go with sending.

**Tables arrive with the part that reads them.** Phase 8 left the rule behind:
a migration applied is not a feature shipped, and `032` created a view that
nothing read for six parts. So part 1 creates the two it uses or is about to,
part 3's rate limit landed with `/code`, and part 4's send schedule landed with
the drain that reads it. `migrate()` is the mechanism for that, keyed on
`PRAGMA user_version`, and a later part appends to MIGRATIONS rather than
editing what is already applied on the VPS.

The callbacks registry is the reason the spec asks for SQLite at all: the
payload behind a button is stored here and looked up on click, so a button in a
message from six weeks ago still works after any number of restarts. Nothing
about a button's meaning is packed into the callback data itself.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
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
    # 2. Part 3. The per Telegram user half of section 15's rate limit.
    #
    # The site holds the per account half in gftvjobs_rate_limits and cannot
    # hold this one: it never learns which Telegram account is typing, and the
    # thing being bounded here is a person sending /code over and over. Same
    # shape as the site's table, deliberately, so the two read the same way.
    (
        """
        create table if not exists rate_limits (
          bucket       text not null,
          subject      text not null,
          window_start text not null,
          attempts     integer not null default 0,
          locked_until text,
          primary key (bucket, subject, window_start)
        )
        """,
        "create index if not exists rate_limits_locked_idx on rate_limits (locked_until)",
    ),
    # 3. Part 4. When a notification may next be tried, per section 15's
    # "handle flood wait errors by rescheduling in SQLite rather than sleeping
    # the whole worker".
    #
    # **A row in here is one the drain still owns.** It stays `claimed` in
    # Supabase for as long as it is scheduled, so no other claim can take it,
    # and this file says when it may next be handed to Telegram. The two halves
    # answer different questions on purpose: Supabase answers "who owns this
    # row", which has to survive this machine being replaced, and SQLite answers
    # "when may this process send again", which is worth nothing anywhere else.
    #
    # It is durable rather than in memory because the schedule outliving a
    # restart is the whole point: a bot restarted a minute into a fifteen minute
    # backoff should carry on waiting, not start again from nothing.
    (
        """
        create table if not exists outbox_schedule (
          notification_id text primary key,
          kind            text,
          attempts        integer not null default 0,
          not_before      text not null,
          reason          text,
          updated_at      text not null
        )
        """,
        "create index if not exists outbox_schedule_due_idx on outbox_schedule (not_before)",
    ),
)

# How many, how long a window, and how long the lock lasts.
#
# Deliberately looser than the site's telegramCode bucket at ten an hour. This
# one counts requests from one Telegram account, and somebody who has just
# linked and is trying the thing out is the ordinary case rather than the
# suspicious one. What it stops is a script holding a chat open and issuing
# codes at an account all afternoon, which would be a notification every few
# seconds on somebody's phone.
LIMITS: dict[str, tuple[int, int, int]] = {
    "code": (12, 60 * 60, 30 * 60),
}


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


def note_attempt(conn: sqlite3.Connection, bucket: str, subject: str) -> int:
    """Count one attempt, and answer how many seconds to wait, or zero.

    **Counted before the work rather than after**, because what is being limited
    here is asking rather than failing: every /code that answers puts a message
    on somebody's phone, so a successful one costs exactly what a pointless one
    does and should be counted the same.

    A fixed window, like the site's. The same slippage applies and matters even
    less: the worst case is a couple of extra codes on a limit of twelve.
    """
    limit, window, lock = LIMITS[bucket]
    now = int(datetime.now(timezone.utc).timestamp())
    window_start = str(now - (now % window))

    row = conn.execute(
        "select attempts, locked_until from rate_limits "
        "where bucket = ? and subject = ? and window_start = ?",
        (bucket, subject, window_start),
    ).fetchone()

    locked = conn.execute(
        "select max(locked_until) as until from rate_limits "
        "where bucket = ? and subject = ?",
        (bucket, subject),
    ).fetchone()

    until = int(locked["until"]) if locked and locked["until"] else 0
    if until > now:
        # Already locked out. Not counted again: an attempt that was refused
        # before it did anything must not extend the lock it just met, or a
        # lockout becomes something nobody can wait out.
        return until - now

    attempts = (row["attempts"] if row else 0) + 1
    locked_until = str(now + lock) if attempts >= limit else None

    conn.execute(
        "insert into rate_limits (bucket, subject, window_start, attempts, locked_until) "
        "values (?, ?, ?, ?, ?) "
        "on conflict (bucket, subject, window_start) do update set "
        "attempts = excluded.attempts, locked_until = excluded.locked_until",
        (bucket, subject, window_start, attempts, locked_until),
    )

    return lock if locked_until else 0


def clear_attempts(conn: sqlite3.Connection, bucket: str, subject: str) -> None:
    """Forget one subject's counters. Nothing calls this on a code request.

    It is here for the shape rather than for a caller: the site clears a bucket
    when somebody gets a password right, and there is no equivalent moment here,
    because asking for a code is not a guess at anything.
    """
    conn.execute(
        "delete from rate_limits where bucket = ? and subject = ?", (bucket, subject)
    )


# -- the outbox schedule, part 4 --------------------------------------------
#
# Every time in here is written by `later()` and compared as a string. That only
# works because they all carry the same shape and the same offset, UTC to the
# second, which is what `now_iso()` produces: an ISO timestamp sorts correctly
# as text only among timestamps written the same way. Nothing outside this file
# writes these columns.


def later(seconds: int) -> str:
    """A time this many seconds from now, in the one format this file uses."""
    return (
        datetime.now(timezone.utc) + timedelta(seconds=seconds)
    ).isoformat(timespec="seconds")


def schedule_send(
    conn: sqlite3.Connection,
    notification_id: str,
    *,
    kind: str | None,
    attempts: int,
    not_before: str,
    reason: str | None,
) -> None:
    """Say when this row may next be handed to Telegram.

    An upsert rather than an insert: a row that fails twice is one schedule
    entry moved forward, not two rows racing to be the next attempt.
    """
    conn.execute(
        "insert into outbox_schedule "
        "(notification_id, kind, attempts, not_before, reason, updated_at) "
        "values (?, ?, ?, ?, ?, ?) "
        "on conflict (notification_id) do update set "
        "kind = excluded.kind, attempts = excluded.attempts, "
        "not_before = excluded.not_before, reason = excluded.reason, "
        "updated_at = excluded.updated_at",
        (notification_id, kind, attempts, not_before, reason, now_iso()),
    )


def due_sends(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    """The scheduled rows whose wait is over, oldest deadline first."""
    rows = conn.execute(
        "select notification_id, kind, attempts, not_before, reason "
        "from outbox_schedule where not_before <= ? "
        "order by not_before asc limit ?",
        (now_iso(), limit),
    ).fetchall()
    return [dict(row) for row in rows]


def scheduled_ids(conn: sqlite3.Connection) -> set[str]:
    """Every notification this process is still holding a schedule for.

    The stale claim sweep asks for this before it decides a `claimed` row has
    been abandoned. A row waiting out a fifteen minute backoff is claimed, is
    older than the lease, and is not abandoned at all, and taking it back would
    turn this process's own patience into a second delivery attempt.
    """
    rows = conn.execute("select notification_id from outbox_schedule").fetchall()
    return {row["notification_id"] for row in rows}


def forget_send(conn: sqlite3.Connection, notification_id: str) -> None:
    """Drop the schedule entry, once the row has reached an ending."""
    conn.execute(
        "delete from outbox_schedule where notification_id = ?", (notification_id,)
    )


def pause_sends(conn: sqlite3.Connection, until: str) -> None:
    """Hold every send until this time, and never bring one forward.

    Telegram's flood wait is about this bot rather than about one chat, so the
    pause is global. It is written here rather than kept in a variable for the
    reason the schedule is: a restart during a flood wait must not be a way of
    starting the flooding again a second later.
    """
    current = get_meta(conn, "outbox_paused_until")
    if current and current >= until:
        return
    set_meta(conn, "outbox_paused_until", until)


def sends_paused_until(conn: sqlite3.Connection) -> str | None:
    """The pause, if one is still in force. None once it has passed."""
    until = get_meta(conn, "outbox_paused_until")
    if until and until > now_iso():
        return until
    return None


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
