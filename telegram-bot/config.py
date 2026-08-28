"""Configuration for the Careers@GFTV Telegram bot. Specification section 15.

Every value comes from the environment, and `.env` beside this file is read
into the environment first. A variable already set in the environment wins over
the file, so running the bot with an override in front of it works the way it
does everywhere else.

**Everything the whole phase needs is required at startup, not at first use.**
Part 1 reads none of the Supabase values, and it demands them anyway. The bot is
one process deployed all at once: a skeleton that started happily without a
service key would move the failure from "it refuses to start and says which
variable is missing" to "somebody's linking attempt died halfway", which is the
same trade the site makes when it validates a request before touching a table.

**Missing variables are reported together.** One at a time means one restart per
variable, which on a VPS over SSH is how a five minute setup becomes twenty.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent

# The site's own copy of the phase list, in the checkout this bot was deployed
# from. Used only when the live site cannot be reached. See build_status.py.
LOCAL_BUILD_STATUS = REPO_ROOT / "main-site" / "assets" / "build-status.json"

REQUIRED = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "SITE_URL",
)


class ConfigError(RuntimeError):
    """Raised when the environment cannot produce a usable configuration."""


def load_env_file(path: Path) -> None:
    """Read a `.env` file into os.environ without overwriting what is set.

    Deliberately not python-dotenv. This is twenty lines, it is the only thing
    the dependency would have been used for, and a dependency that reads
    secrets is a dependency worth not having.
    """
    if not path.is_file():
        return

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue

        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()

        # A quoted value keeps its inner spaces and loses its quotes. An
        # unquoted one is taken as typed, trailing comment included, because
        # guessing where a comment starts is how a token loses its last word.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        if key and key not in os.environ:
            os.environ[key] = value


@dataclass(frozen=True)
class Config:
    """Everything the bot needs to run, validated once at startup."""

    bot_token: str
    api_id: int
    api_hash: str

    supabase_url: str
    supabase_service_key: str

    site_url: str
    donation_url: str | None

    log_level: str

    # Bot local paths. All four are gitignored.
    db_path: Path
    session_path: Path
    lock_path: Path
    log_dir: Path

    local_build_status: Path

    @property
    def build_status_url(self) -> str:
        return f"{self.site_url}/assets/build-status.json"

    @property
    def feature_status_url(self) -> str:
        return f"{self.site_url}/api/public/feature-status"

    @property
    def jobs_feed_url(self) -> str:
        """The public openings feed, which `/jobs` reads instead of the tables.

        `vercel.json` rewrites this address onto `api/public/jobs-feed`, and the
        address rather than the file is the contract: the site is free to move
        the handler and this is what section 4 promised anybody aggregating
        openings.
        """
        return f"{self.site_url}/api/public/jobs.json"

    def job_url(self, job_id: str) -> str:
        """A posting's canonical address, which is its uuid rather than its slug.

        One definition for the whole bot, because a message outlives the wording
        it was written from: the slug is a 301 alias generated once, and a link
        built from one would still work while quietly being the old name for a
        role somebody has since renamed.
        """
        return f"{self.site_url}/jobs/{job_id}"


def load_config(env_file: Path | None = None) -> Config:
    """Build the configuration, or raise ConfigError naming every problem."""
    load_env_file(env_file or BASE_DIR / ".env")

    problems: list[str] = []

    missing = [name for name in REQUIRED if not os.environ.get(name, "").strip()]
    if missing:
        problems.append("missing or empty: " + ", ".join(missing))

    api_id_raw = os.environ.get("TELEGRAM_API_ID", "").strip()
    api_id = 0
    if api_id_raw:
        try:
            api_id = int(api_id_raw)
        except ValueError:
            problems.append("TELEGRAM_API_ID must be a number, from my.telegram.org")

    # A trailing slash here would build every link with a double slash in it.
    site_url = os.environ.get("SITE_URL", "").strip().rstrip("/")
    if site_url and not site_url.startswith(("http://", "https://")):
        problems.append("SITE_URL must start with http:// or https://")

    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if supabase_url and not supabase_url.startswith("https://"):
        problems.append("SUPABASE_URL must start with https://")

    if problems:
        raise ConfigError(
            "The bot cannot start with this environment.\n  "
            + "\n  ".join(problems)
            + f"\n\nEvery variable is documented in {BASE_DIR / '.env.example'}."
        )

    # DONATION_URL is optional and its absence is not a problem to report. The
    # start message simply does not draw the button, which is the same rule the
    # site follows for the official banner: a link must not ship before the
    # thing it points at exists.
    donation_url = os.environ.get("DONATION_URL", "").strip() or None

    return Config(
        bot_token=os.environ["TELEGRAM_BOT_TOKEN"].strip(),
        api_id=api_id,
        api_hash=os.environ["TELEGRAM_API_HASH"].strip(),
        supabase_url=supabase_url,
        supabase_service_key=os.environ["SUPABASE_SERVICE_KEY"].strip(),
        site_url=site_url,
        donation_url=donation_url,
        log_level=os.environ.get("LOG_LEVEL", "INFO").strip().upper() or "INFO",
        db_path=BASE_DIR / "bot.sqlite3",
        session_path=BASE_DIR / "careersbot.session",
        lock_path=BASE_DIR / "bot.lock",
        log_dir=BASE_DIR / "logs",
        local_build_status=LOCAL_BUILD_STATUS,
    )
