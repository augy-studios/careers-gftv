"""The status probe. Specification 0c and section 15. Phase 12 part 7.

Run it from this directory, in its own tmux window, beside the bot:

    python probe.py

**It has nothing to do with Telegram, and it is a second process on purpose.**
Section 15 puts it here for one reason: the status page in 0c needs a prober
outside Vercel, and this VPS is the only thing in the whole architecture that
is. A status page hosted on the thing it monitors is useless during the outage
it exists to report.

**Separate from the bot, where `security.py` and `outbox.py` are not.** Those
two send through Telethon and share its client, so they are tasks in `bot.py`.
This sends nothing and shares nothing, and section 15 requires it to keep
recording while Telethon is wedged: "the bot is broken" and "the portal is down"
are exactly the two things a status page has to tell apart, and a probe living
inside the bot could not tell them apart at all. `bot.py`'s own docstring has
named this exception since part 4.

**It needs no new configuration.** SUPABASE_URL, SUPABASE_SERVICE_KEY and
SITE_URL are already in the bot's `.env` and are all this reads. It does not
load the Telegram half at all, so a bot token that has been revoked stops the
bot and leaves the probe recording, which is the whole point of it being here.

**Four rules it does not bend**, all from 0c and section 15:

    It never writes to the portal. The four requests are public GETs and the
    row goes straight to Supabase.

    It never alerts. No message to anybody and no mention in any command.
    Alerting needs an on-call story and a decision about who gets woken, and
    neither exists.

    A failure to reach Supabase writes nothing. No local buffer, no backfill on
    reconnect: a gap is honest and the page draws it as unknown, and a row
    backfilled an hour late timestamped as though it were on time is not.

    It is not a command and it is not in the command list. Nothing about it is
    visible in Telegram.

Exit codes, the same four `bot.py` uses:

    0  a clean shutdown
    2  the environment is not usable, and every problem with it is listed
    3  another probe is already running, and its pid is named
    1  anything else, with the traceback in the log
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from config import BASE_DIR, ConfigError, load_env_file
from lock import AlreadyRunning, SingleInstance
from log import setup_logging
from supabase import Supabase, SupabaseError, now_iso

USER_AGENT = "careers-gftv-probe"

# Once a minute, per 0c and section 15. Four public requests, so this is four a
# minute against the portal in total.
INTERVAL = 60.0

# Long enough that a slow answer is recorded as slow rather than as a failure,
# short enough that a wedged endpoint cannot hold the cycle open. A request that
# takes longer than this is a request a reader would have given up on.
TIMEOUT = 20.0

# **The four addresses, and this list exists three times.** Here, as TARGETS in
# main-site/api/_lib/status.js, and as a check constraint in migration 037.
# `tests/phase12-test.mjs --only=status` reads all three and fails when they
# disagree, which is phase 11's commands.py lesson: a list copied into other
# files needs a check, not a docstring.
#
# `job_page` names a kind of page rather than one posting. Which posting it
# fetches is resolved from the live feed and changes the day the dev seed is
# cleared; ninety days of history has to survive that, so the id is never part
# of what is recorded.
TARGETS = ("feature_status", "search", "job_page", "jobs_feed")

# What each target must answer with. A 200 carrying the wrong kind of body is
# not a working page: the placeholder route, a login redirect that resolved, and
# an error page rendered as HTML all answer 200 with HTML, and only one of the
# four targets should be HTML at all.
CONTENT_TYPE = {
    "feature_status": "application/json",
    "search": "text/html",
    "job_page": "text/html",
    "jobs_feed": "application/json",
}

log = logging.getLogger("probe")


@dataclass(frozen=True)
class ProbeConfig:
    """The three variables this process needs, and nothing else.

    Deliberately not `config.load_config()`. That one requires the Telegram
    credentials, and a probe that refuses to start because a bot token is
    missing would be down for a reason that has nothing to do with what it
    watches.
    """

    supabase_url: str
    supabase_service_key: str
    site_url: str
    log_level: str

    lock_path: Path
    log_dir: Path

    @property
    def feature_status_url(self) -> str:
        return f"{self.site_url}/api/public/feature-status"

    @property
    def search_url(self) -> str:
        return f"{self.site_url}/search"

    @property
    def jobs_feed_url(self) -> str:
        return f"{self.site_url}/api/public/jobs.json"

    def job_url(self, job_id: str) -> str:
        return f"{self.site_url}/jobs/{job_id}"


def load_probe_config(env_file: Path | None = None) -> ProbeConfig:
    """Read the three variables, or raise ConfigError naming every problem."""
    load_env_file(env_file or BASE_DIR / ".env")

    problems: list[str] = []

    required = ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SITE_URL")
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        problems.append("missing or empty: " + ", ".join(missing))

    site_url = os.environ.get("SITE_URL", "").strip().rstrip("/")
    if site_url and not site_url.startswith(("http://", "https://")):
        problems.append("SITE_URL must start with http:// or https://")

    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if supabase_url and not supabase_url.startswith("https://"):
        problems.append("SUPABASE_URL must start with https://")

    if problems:
        raise ConfigError(
            "The probe cannot start with this environment.\n  "
            + "\n  ".join(problems)
            + f"\n\nEvery variable is documented in {BASE_DIR / '.env.example'}."
        )

    return ProbeConfig(
        supabase_url=supabase_url,
        supabase_service_key=os.environ["SUPABASE_SERVICE_KEY"].strip(),
        site_url=site_url,
        log_level=os.environ.get("LOG_LEVEL", "INFO").strip().upper() or "INFO",
        # Its own lock, so starting the probe never refuses because the bot is
        # running and killing the bot never releases the probe's.
        lock_path=BASE_DIR / "probe.lock",
        log_dir=BASE_DIR / "logs",
    )


class Probe:
    """One cycle of four requests, and the row each one becomes."""

    def __init__(self, config: ProbeConfig, http: httpx.AsyncClient, supabase: Supabase) -> None:
        self._config = config
        self._http = http
        self._supabase = supabase
        self._job_id: str | None = None

    async def job_id(self) -> str | None:
        """Which posting `job_page` fetches, taken from the live feed.

        Settled 31 August 2026, over a configured URL. The seeded postings are
        being deleted before part 8 flips indexing — section 5 item 6 — and a
        variable in a `.env` file pointing at one of them would quietly probe a
        404 forever afterwards and draw the portal as down. Reading it from the
        feed means the probe follows the board.

        Held until it stops working rather than fetched every cycle: one extra
        request a minute for a value that changes twice a year is a worse trade
        than a re-read on the failure that actually indicates it changed.
        """
        if self._job_id:
            return self._job_id

        try:
            response = await self._http.get(self._config.jobs_feed_url, timeout=TIMEOUT)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as cause:
            log.warning("could not read the feed to pick a posting: %s", cause)
            return None

        jobs = payload.get("jobs") if isinstance(payload, dict) else payload
        for job in jobs or []:
            job_id = (job or {}).get("id")
            if isinstance(job_id, str) and job_id:
                self._job_id = job_id
                log.info("probing %s as the posting page", job_id)
                return job_id

        # An empty board is not a fault in the posting page, and recording it as
        # one would draw a red bar for a site that is working perfectly. The
        # target is skipped for this cycle and the day reads as unknown, which
        # is what a day nothing measured means everywhere else on that page.
        log.warning("the feed carries no postings, so the posting page is not probed")
        return None

    async def one(self, target: str, url: str) -> dict:
        """Make one request and describe what happened, never raising."""
        started = time.perf_counter()

        try:
            response = await self._http.get(url, timeout=TIMEOUT)
            elapsed = int((time.perf_counter() - started) * 1000)

            wanted = CONTENT_TYPE[target]
            got = response.headers.get("content-type", "")
            ok = response.status_code == 200 and got.split(";")[0].strip() == wanted

            error = None
            if not ok:
                error = (
                    f"{response.status_code} {got.split(';')[0].strip() or 'no content type'}"
                )[:200]

            return {
                "target": target,
                "checked_at": now_iso(),
                "ok": ok,
                "status_code": response.status_code,
                "duration_ms": elapsed,
                "error": error,
            }
        except Exception as cause:  # noqa: BLE001 - anything at all is a failed check
            # No status code, because nothing answered. Migration 037 keeps that
            # null rather than zero: "nothing answered" and "answered badly" are
            # different facts and the page tells them apart.
            return {
                "target": target,
                "checked_at": now_iso(),
                "ok": False,
                "status_code": None,
                "duration_ms": int((time.perf_counter() - started) * 1000),
                "error": f"{type(cause).__name__}: {cause}"[:200],
            }

    async def cycle(self) -> None:
        """One pass over the four targets, written as one insert."""
        job_id = await self.job_id()

        planned = [
            ("feature_status", self._config.feature_status_url),
            ("search", self._config.search_url),
            ("jobs_feed", self._config.jobs_feed_url),
        ]
        if job_id:
            planned.append(("job_page", self._config.job_url(job_id)))

        # Together rather than one after another, so the four rows describe the
        # same moment. A serial pass would spread them over however long the
        # slowest one took, which is exactly the moment worth being precise
        # about.
        rows = await asyncio.gather(*(self.one(target, url) for target, url in planned))

        for row in rows:
            if not row["ok"]:
                log.warning("%s failed: %s", row["target"], row["error"])
                # The page's job_page target is a posting that may simply have
                # gone. Re-picking on the next cycle is what makes the probe
                # follow the board rather than a deleted row.
                if row["target"] == "job_page" and row["status_code"] == 404:
                    self._job_id = None

        try:
            # **One call, and the database decides what the results mean.**
            # Migration 037's function adds to the day's counters and opens,
            # extends or closes the outage row. Nothing here reads and then
            # writes, which is this file's rule as much as the bot's.
            await self._supabase.rpc("gftvjobs_status_record", {"p_checks": list(rows)})
        except (SupabaseError, httpx.HTTPError) as cause:
            # Dropped, and that is the specified behaviour rather than a
            # shortcut. Nothing is buffered and nothing is backfilled: a gap in
            # the data is honest and the page draws it as unknown.
            log.error("could not write %d checks, dropping them: %s", len(rows), cause)
            return

        failed = sum(1 for row in rows if not row["ok"])
        log.info(
            "wrote %d checks, %d failed, slowest %dms",
            len(rows),
            failed,
            max((row["duration_ms"] or 0) for row in rows),
        )


async def run(config: ProbeConfig) -> int:
    setup_logging(config.log_level, config.log_dir, filename="probe.log")

    log.info("starting as pid %d, watching %s", os.getpid(), config.site_url)
    log.info("writing to %s", config.supabase_url)

    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in ("SIGINT", "SIGTERM"):
        received = getattr(signal, name, None)
        if received is None:
            continue
        try:
            loop.add_signal_handler(received, stopping.set)
        except NotImplementedError:
            # Windows, where a developer may run this to read the output.
            pass

    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        # Redirects are not followed. A posting page that 302s somewhere is not
        # the posting page answering, and following one would record whatever it
        # landed on as a success.
        follow_redirects=False,
    ) as http:
        probe = Probe(config, http, Supabase(config.supabase_url, config.supabase_service_key, http))

        while not stopping.is_set():
            started = time.monotonic()

            try:
                await probe.cycle()
            except Exception:  # noqa: BLE001 - a cycle must never end the loop
                log.exception("a probe cycle failed")

            # Measured from the start of the cycle, so the interval is a minute
            # rather than a minute plus however long four requests took. A drift
            # of that kind is what turns "1,440 checks a day" into a number
            # nobody can reconcile with the coverage on the page.
            remaining = INTERVAL - (time.monotonic() - started)
            if remaining > 0:
                try:
                    await asyncio.wait_for(stopping.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    pass

    log.info("stopped cleanly")
    return 0


def main() -> int:
    try:
        config = load_probe_config()
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
        logging.getLogger("probe").info("interrupted, stopping")
        return 0
    except Exception:
        logging.getLogger("probe").exception("the probe stopped on an error")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
