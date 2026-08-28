"""What has shipped, and what an admin has switched off. Section 0c and 8.12.

`build-status.json` says the site, the Telegram bot and the docs site all read
this one file, so the three stay in step. Settled 28 August 2026, phase 11 open
decision 2, is **which copy of it the bot reads**:

  1. The live site, `{SITE_URL}/assets/build-status.json`, because that is the
     build the applicant is actually looking at while they type a command. The
     bot is deployed by pulling this repository and restarting a process by
     hand, so the checkout beside it can be a day ahead of production or a week
     behind it, and the copy on disk is the one thing guaranteed not to be what
     the reader sees.
  2. The checkout, when the site cannot be reached. A bot that goes silent
     because the portal is down is a second outage on top of the first, and
     phase 12's status page exists precisely to tell those two apart.

The maintenance overrides come from `/api/public/feature-status` and have no
offline equivalent at all. **A failure to read them leaves every feature on**,
which is the direction the site itself fails in and for the same stated reason:
a client that blanks a control it could not get a status for turns a settings
blip into something that looks broken.

Two cache lifetimes, for the same reason the site keeps the two apart. The phase
list changes when somebody ships a phase, so five minutes is fine. The overrides
change when an admin is standing in the middle of an outage flipping a switch,
so thirty seconds.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass

import httpx

from config import Config

log = logging.getLogger("bot.status")

PHASES_TTL = 300.0
OVERRIDES_TTL = 30.0
TIMEOUT = 8.0

# Used only when neither the site nor the checkout can answer, which means the
# deployment is broken in a way this file cannot fix. English is the default
# locale everywhere else in the build.
FALLBACK_LOCALES = ("en",)


@dataclass(frozen=True)
class FeatureState:
    """One feature, as the reader would find it on the site right now."""

    key: str
    shipped: bool
    off: bool
    note: str | None
    phase: int | None

    @property
    def available(self) -> bool:
        return self.shipped and not self.off


class BuildStatus:
    """Reads the phase list and the overrides, and caches both."""

    def __init__(self, config: Config, client: httpx.AsyncClient) -> None:
        self._config = config
        self._client = client

        self._phases: dict | None = None
        self._phases_at = 0.0
        self._overrides: dict = {}
        self._overrides_at = 0.0

    # -- loading ---------------------------------------------------------

    async def _load_phases(self) -> dict:
        if self._phases is not None and time.monotonic() - self._phases_at < PHASES_TTL:
            return self._phases

        data = await self._fetch_json(self._config.build_status_url)

        if data is None:
            data = self._read_local()

        if data is None:
            # Keep whatever was last known rather than forgetting it. A cache
            # that empties itself the moment a fetch fails is a bot that starts
            # telling everybody nothing has shipped.
            if self._phases is not None:
                log.warning("build status could not be refreshed, using the last copy")
                self._phases_at = time.monotonic()
                return self._phases
            log.error("build status is unavailable from the site and from disk")
            data = {"phases": [], "features": {}, "locales": list(FALLBACK_LOCALES)}

        self._phases = data
        self._phases_at = time.monotonic()
        return data

    async def _load_overrides(self) -> dict:
        if time.monotonic() - self._overrides_at < OVERRIDES_TTL:
            return self._overrides

        payload = await self._fetch_json(self._config.feature_status_url)
        # The site's envelope is { ok, data }, and data is { off: { key: ... } }.
        off = {}
        if isinstance(payload, dict):
            data = payload.get("data") if payload.get("ok") is True else None
            if isinstance(data, dict) and isinstance(data.get("off"), dict):
                off = data["off"]
            elif payload.get("ok") is not True:
                log.warning("feature status answered without ok, treating as all on")

        self._overrides = off
        self._overrides_at = time.monotonic()
        return off

    async def _fetch_json(self, url: str) -> dict | None:
        try:
            response = await self._client.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as cause:
            log.warning("could not read %s: %s", url, cause)
            return None

    def _read_local(self) -> dict | None:
        path = self._config.local_build_status
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as cause:
            log.warning("could not read the checkout's copy at %s: %s", path, cause)
            return None

        log.warning("using the checkout's build status, the site could not be reached")
        return data

    # -- questions the rest of the bot asks ------------------------------

    async def locales(self) -> tuple[str, ...]:
        """The languages the build ships in, newest list first.

        Read from the file rather than hardcoded so phase 15's Malay and Tamil
        arrive here without a code change, exactly as they do on the site.
        """
        data = await self._load_phases()
        found = data.get("locales")
        if isinstance(found, list) and found:
            return tuple(str(item) for item in found)
        return FALLBACK_LOCALES

    async def phase_for_feature(self, key: str) -> int | None:
        data = await self._load_phases()
        number = (data.get("features") or {}).get(key)
        return number if isinstance(number, int) else None

    async def phase(self, number: int) -> dict | None:
        data = await self._load_phases()
        for entry in data.get("phases") or []:
            if entry.get("number") == number:
                return entry
        return None

    async def feature(self, key: str) -> FeatureState:
        """The state of one feature, the way the site would draw it.

        `shipped` compares against the string `shipped` exactly, which is what
        makes a phase marked `building` change nothing for anybody. `off` is
        only meaningful for something already shipped: the site ignores an
        override on a feature whose phase has not shipped, and so does this.
        """
        number = await self.phase_for_feature(key)
        entry = await self.phase(number) if number is not None else None
        shipped = bool(entry and entry.get("status") == "shipped")

        note = None
        off = False
        if shipped:
            overrides = await self._load_overrides()
            record = overrides.get(key)
            if isinstance(record, dict):
                off = True
                note = record.get("note") or None

        return FeatureState(key=key, shipped=shipped, off=off, note=note, phase=number)
