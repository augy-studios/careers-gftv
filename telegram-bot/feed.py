"""The public openings feed, which is where `/jobs` gets its list.

**The bot asks the site rather than the database, and that is a decision rather
than a convenience.** Settled 29 August 2026 with part 6.

`/api/public/jobs.json` reads through `gftvjobs_search_jobs`, the same function
the board itself uses, so the list in a chat window and the list on `/search` can
never disagree about which postings are live. Querying `gftvjobs_jobs` with the
service key would mean a second implementation of *which postings are published,
unexpired and ready in this language*, in a second runtime, kept in step by
nothing. It would also widen what a compromised VPS can read, and section 15 is
deliberately narrow about that: accounts, links, tokens, invites and the outbox.

**Everything here is public and read only**, which is what makes it the right
half of the build for this. It needs no credential, and there is nothing it could
be talked into changing.

**A feed that could not be read answers `None`, not an empty list.** "There are
no openings" and "we could not ask" are different claims and only one of them is
ours to make. That is the same rule as a count being `null` rather than `0`, and
the same rule the account pages learned offline in phase 10.
"""

from __future__ import annotations

import logging
import time
from urllib.parse import quote

import httpx

from config import Config

log = logging.getLogger("bot.feed")

TIMEOUT = 8.0

# A minute, which is the board's own freshness rather than the feed's. The feed
# is cached at the edge for five minutes for aggregators polling on their own
# schedule; somebody typing /jobs after being told about a new role is a person
# waiting, so this holds a copy only long enough to absorb a burst of commands.
TTL = 60.0

# How many the command draws. Section 15 asks for "the newest openings" and does
# not give a number, and a chat window is not a board: five roles with a button
# each is a message somebody reads, and twenty is a wall they scroll past on the
# way to the portal, which is where the whole board already is.
SHOWN = 5


class JobFeed:
    """Reads `{SITE_URL}/api/public/jobs.json`, with a short cache per language."""

    def __init__(self, config: Config, client: httpx.AsyncClient) -> None:
        self._config = config
        self._client = client
        # Keyed by locale. The feed resolves translations itself, so a Chinese
        # reader and an English one are asking for different documents rather
        # than for the same one rendered twice.
        self._cache: dict[str, tuple[float, list[dict]]] = {}

    def url(self, locale: str) -> str:
        # The locale is a query parameter because that is what
        # `localeFromRequest` reads, and it is the only way to ask this endpoint
        # for a language: a feed fetched by a server carries no localStorage and
        # the site deliberately never puts a language in the path.
        return f"{self._config.jobs_feed_url}?locale={quote(locale)}"

    async def newest(self, locale: str, limit: int = SHOWN) -> list[dict] | None:
        """The newest openings, or None when the site could not be reached.

        The feed's own order is newest first with no query and no filters, which
        is exactly what this command wants, so nothing here re-sorts it. A
        posting that has closed since the copy was taken is at worst a minute
        old, and its own page says so the moment somebody opens it.
        """
        cached = self._cache.get(locale)
        if cached and time.monotonic() - cached[0] < TTL:
            return cached[1][:limit]

        try:
            response = await self._client.get(self.url(locale), timeout=TIMEOUT)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as cause:
            log.warning("could not read the openings feed: %s", cause)
            if cached:
                # A stale copy beats no answer, for the same reason the build
                # status keeps its last one: the alternative is a bot that goes
                # quiet because the portal had a bad minute.
                log.info("answering /jobs from the last copy of the feed")
                return cached[1][:limit]
            return None

        jobs = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(jobs, list):
            # A 200 that is not the feed. Treated as unreachable rather than as
            # an empty board: something is answering on that address and it is
            # not this site.
            log.warning("the openings feed answered something that is not a feed")
            return cached[1][:limit] if cached else None

        rows = [row for row in jobs if isinstance(row, dict) and row.get("id")]
        self._cache[locale] = (time.monotonic(), rows)
        return rows[:limit]
