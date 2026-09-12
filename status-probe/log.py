"""Logging for the probe. A copy of the bot's log.py, with the Telethon lines
taken out, made when the probe moved into its own directory on 13 September
2026. Two files that are alike on purpose: the probe is a second process on
its own machine and must not import the bot to write a log line.

**The log is the only account of what happened here.** Deviation 91 settled
that the bot has no scripted checks, so where the site has
`tests/phaseN-test.mjs` this has a person with a checklist and this file. That
raises the bar on it rather than lowering it: anything worth asserting in a test
is worth logging, and the probe logs every cycle it wrote and every one it
dropped for exactly that reason.

Two destinations, because they answer different questions. Standard output is
what a person watching the tmux pane sees while they walk the checklist. The
rotating file is what somebody reads the next morning, when the pane has
scrolled or the session has been killed.

Times are UTC, to match everything the database records. A log in local time
next to a `claimed_at` in UTC is two clocks and one of them is a guess.
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
import time
from pathlib import Path

FORMAT = "%(asctime)s %(levelname)-7s %(name)-16s %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

MAX_BYTES = 2 * 1024 * 1024
BACKUP_COUNT = 5

# httpx logs a line per request at INFO, and this process makes five a minute.
# A failed request is logged by the caller with what it was for, which is the
# half worth keeping.
NOISY = (
    "httpx",
    "httpcore",
)


def setup_logging(level: str, log_dir: Path, filename: str = "probe.log") -> logging.Logger:
    """Configure the root logger and return the probe's own.

    Idempotent: calling it twice does not double every line, which matters
    because a failed startup path may well configure logging before the thing
    that failed gets a chance to report itself.

    The file is `probe.log`, in this directory's own `logs/`. The bot writes
    its own file in its own directory, and two processes appending to one
    rotating file is how a rotation loses somebody's lines: the handler
    renames the file underneath the other writer, which keeps writing to a file
    with no name.
    """
    formatter = logging.Formatter(FORMAT, DATE_FORMAT)
    formatter.converter = time.gmtime

    root = logging.getLogger()
    root.setLevel(getattr(logging, level, logging.INFO))
    for handler in list(root.handlers):
        root.removeHandler(handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    # A log directory that cannot be created is not a reason to refuse to run.
    # Standard output is still there, and a probe that will not start because it
    # could not open a log file has turned its own diagnostics into an outage.
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        rotating = logging.handlers.RotatingFileHandler(
            log_dir / filename,
            maxBytes=MAX_BYTES,
            backupCount=BACKUP_COUNT,
            encoding="utf-8",
        )
        rotating.setFormatter(formatter)
        root.addHandler(rotating)
    except OSError as cause:
        logging.getLogger("probe").warning(
            "logging to file is off, %s could not be opened: %s", log_dir, cause
        )

    for name in NOISY:
        logging.getLogger(name).setLevel(logging.WARNING)

    return logging.getLogger("probe")
