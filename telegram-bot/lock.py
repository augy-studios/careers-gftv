"""One instance at a time, enforced by the operating system.

**Two bot instances is the ordinary failure on this VPS, not the rare one.** A
tmux restart that does not kill the old process cleanly leaves it polling, and
nobody notices, because the symptom is a second copy of a message that was going
to be sent anyway. Deviation 91 is explicit that the double send is one of the
two failures a scripted check would have caught here.

The database is the defence that matters. Part 4's drain claims a batch with one
conditional update, so two instances cannot send the same row twice however hard
they try. This file is the second, cheaper defence, and it covers what that one
does not: an old process still answering commands with code from last week.

It takes an exclusive advisory lock on `bot.lock` and holds it for the life of
the process. A second start does not wait, does not retry, and does not steal
it. It exits, and it says which process id is holding the lock, so the answer to
"is the old one definitely dead" is a line of output rather than a judgement.

The lock is released by the kernel when the process ends, including when it is
killed, so there is no stale lock file to clear by hand. The file itself stays
on disk and is gitignored.
"""

from __future__ import annotations

import os
from pathlib import Path
from types import TracebackType

try:  # POSIX, which is the VPS.
    import fcntl

    _HAS_FCNTL = True
except ImportError:  # Windows, where this only ever gets imported by a dev.
    import msvcrt

    _HAS_FCNTL = False


class AlreadyRunning(RuntimeError):
    """Another instance holds the lock."""


def _holder(path: Path, handle) -> str | None:
    """Read the pid out of a lock file somebody else is holding.

    **The read is allowed to fail and must not replace the real message.**
    `flock` on the VPS is advisory and leaves the file readable, but the
    Windows fallback locks a byte range and refuses the read outright, which
    turned a clear refusal into a traceback about a permission error on a lock
    file. The pid is the nice half of this message, not the point of it.
    """
    for read in (lambda: handle.read(), lambda: path.read_text(encoding="utf-8")):
        try:
            value = read().strip()
        except OSError:
            continue
        if value:
            return value
    return None


class SingleInstance:
    """Context manager holding the single instance lock.

    Used as `with SingleInstance(path):` around the whole run. The file handle
    is kept open on purpose: closing it drops the lock on every platform.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle = None

    def __enter__(self) -> "SingleInstance":
        # Opened r+ where possible so the previous pid survives long enough to
        # be read back in the failure message. Truncating on open would erase
        # the one piece of information this exists to report.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.touch()

        handle = open(self.path, "r+", encoding="utf-8")

        try:
            if _HAS_FCNTL:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            held_by = _holder(self.path, handle)
            handle.close()
            which = (
                f"as pid {held_by}"
                if held_by
                else f"and its pid could not be read from {self.path}"
            )
            raise AlreadyRunning(
                f"Another instance is already running, {which}.\n"
                f"Stop it before starting this one. Nothing has been started, "
                f"and the running instance has not been touched."
            ) from None

        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()))
        handle.flush()
        self._handle = handle
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._handle is not None:
            # No unlock call. Closing the handle releases the lock, and so does
            # the process ending for any other reason, which is the case that
            # matters: a kill -9 must not leave a lock nobody can take.
            self._handle.close()
            self._handle = None
