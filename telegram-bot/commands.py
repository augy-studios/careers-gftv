"""The command list. One list, in one file, read by everything.

Deviation 91 names this as a requirement rather than a preference. With no
scripted checks, the second of the two failures nobody would notice is **drift
between what `start` lists and what actually works**, and it grows quietly over
six parts. So there is one list: `start` prints from it, the bot registers it
with Telegram from it, `setup.md` gives BotFather the same lines, and phase 14's
applicant guide takes its command reference from the same place.

Two keys per command, and they answer different questions.

**`handler` is whether it is built.** A command with none replies with the
sentence 0c fixes, naming the phase the bot itself arrives in. That is not a
placeholder pretending to be a feature: through phase 11 it is literally true,
and as each part lands it stops being true for one more command with no wording
to keep in step.

**`feature` is the switch it obeys once it is built**, which is not always the
bot's own key. `/jobs` reads the public board, so an admin switching `job_search`
off has to take `/jobs` with it, and it would be a poor kind of consistency for
the site to say the board is down while the bot cheerfully lists postings from
it. `start` obeys nothing: an explanation of what this is stays available when
every feature in it is off, or it is an outage with no explanation attached.

**The phase quoted for an unbuilt command comes from `BOT_FEATURE`**, never from
a number written down here. 0c: no copy anywhere hardcodes a phase number.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from strings import DEFAULT_LOCALE, STRINGS

# The bot's own key in build-status.json, and so the answer to "which phase does
# the Telegram side arrive in". Anchoring on a key rather than on the number 11
# is what keeps this file correct if the plan is ever renumbered.
BOT_FEATURE = "telegram_link"


@dataclass(frozen=True)
class Command:
    """One command, its switch, and the one line that describes it."""

    name: str
    feature: str | None
    summary: dict[str, str] = field(default_factory=dict)

    def describe(self, locale: str) -> str:
        return self.summary.get(locale) or self.summary[DEFAULT_LOCALE]


COMMANDS: tuple[Command, ...] = (
    Command(
        name="start",
        feature=None,
        summary={
            "en": "What this can do, and the full list.",
            "zh": "介绍本服务的功能，并列出全部指令。",
        },
    ),
    Command(
        name="link",
        feature="telegram_link",
        summary={
            "en": "Link this Telegram account to your portal account.",
            "zh": "将此 Telegram 账户与您的求职账户关联。",
        },
    ),
    Command(
        name="unlink",
        feature="telegram_link",
        summary={
            "en": "Remove the link, after a confirmation.",
            "zh": "解除关联，操作前会先请您确认。",
        },
    ),
    Command(
        name="code",
        feature="telegram_2fa",
        summary={
            "en": "Send a fresh one time sign in code.",
            "zh": "发送一个新的一次性登录验证码。",
        },
    ),
    Command(
        name="invites",
        feature="invites",
        summary={
            "en": "Your open invitations, with a link to each role.",
            "zh": "查看您收到的职位邀请，并附上各职位的链接。",
        },
    ),
    Command(
        name="tasks",
        feature="telegram_link",
        summary={
            "en": "What is waiting for you, and where to answer it.",
            "zh": "查看有哪些事项待您处理，以及在哪里回复。",
        },
    ),
    Command(
        name="applications",
        feature="telegram_link",
        summary={
            "en": "Your applications, and where each one stands.",
            "zh": "查看您的申请，以及每份申请的当前状态。",
        },
    ),
    Command(
        name="jobs",
        feature="job_search",
        summary={
            "en": "The newest openings, with a link to each posting.",
            "zh": "查看最新发布的职位，并附上各职位的链接。",
        },
    ),
    Command(
        name="notify",
        feature="telegram_notifications",
        summary={
            "en": "Choose which notifications you receive here.",
            "zh": "选择您希望在这里收到哪些通知。",
        },
    ),
)

BY_NAME: dict[str, Command] = {command.name: command for command in COMMANDS}


def _check_summaries() -> None:
    """Every command describes itself in every language, or the bot stops.

    The same guard `strings.py` puts on its own table. A command list that is
    complete in English and half written in 华文 is exactly the drift this file
    exists to prevent, and it would show up first in the one message every new
    reader sees.
    """
    for command in COMMANDS:
        for name in STRINGS:
            if not command.summary.get(name):
                raise RuntimeError(
                    f"commands.py: /{command.name} has no {name} summary"
                )


_check_summaries()


def botfather_lines(locale: str = DEFAULT_LOCALE) -> list[tuple[str, str]]:
    """The list as `name, description` pairs.

    Used to register the commands with Telegram at startup and to write the
    block `setup.md` asks somebody to paste into BotFather. Every command is
    listed, including one that is not built yet: a command missing from the menu
    and then answering when typed is worse than one that is listed and honest
    about where it has got to.
    """
    return [(command.name, command.describe(locale)) for command in COMMANDS]


def botfather_block(locale: str = DEFAULT_LOCALE) -> str:
    """The list in the exact shape BotFather's /setcommands wants.

    One `name - description` per line, no leading slash, nothing else in the
    message.
    """
    return "\n".join(f"{name} - {description}" for name, description in botfather_lines(locale))


def check_document(path: str) -> list[str]:
    """Which language blocks a document is missing or has stale.

    `setup.md` carries the list as text, because somebody pastes it into
    BotFather from there and a document that says "run this script" instead is a
    document that gets skipped. Carrying it means it can drift, so this is the
    check that it has not: every generated block must appear in the file
    verbatim. Empty list means the document agrees with this file.
    """
    try:
        with open(path, encoding="utf-8") as handle:
            document = handle.read()
    except OSError as cause:
        return [f"{path} could not be read: {cause}"]

    return [
        f"{path} does not carry the {name} list as this file generates it"
        for name in STRINGS
        if botfather_block(name) not in document
    ]


if __name__ == "__main__":
    # `python commands.py` prints the block for every language, which is what
    # setup.md pastes in. `python commands.py --check setup.md` is the other
    # half: writing that list into a document by hand is the drift deviation 91
    # exists to prevent, so it is generated, and the copy in the document is
    # checked against the generator rather than trusted.
    import sys

    if "--check" in sys.argv:
        target = sys.argv[sys.argv.index("--check") + 1]
        problems = check_document(target)
        for problem in problems:
            print(problem, file=sys.stderr)
        if problems:
            print("Regenerate with: python commands.py", file=sys.stderr)
        else:
            print(f"{target} carries every command list, unchanged.")
        raise SystemExit(1 if problems else 0)

    for name in STRINGS:
        print(f"# {name}")
        print(botfather_block(name))
        print()
