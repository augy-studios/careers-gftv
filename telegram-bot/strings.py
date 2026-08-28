"""Everything the bot says, in every language the build ships in.

**These are the bot's own strings and not the site's.** `main-site/assets/i18n`
is loaded by a browser on every page and shipped to every reader; nothing there
is written for a chat window, and adding chat wording to it would send eleven
kilobytes of bot copy to somebody reading the FAQ. The two files that matter are
kept identical on purpose all the same: the sentence 0c fixes word for word is
reproduced here exactly as `feature.unavailable` and `feature.maintenance` have
it in `en.json` and `zh.json`, because a reader turned away by a button and then
by a command must be told the same thing twice, not two different things.

`check-i18n.js` covers the site and cannot see this file, so the same job is done
at import: the locales must carry exactly the same keys, and a mismatch stops the
bot rather than rendering a raw key at somebody. That is the cheap half of the
rule deviation 91 leans on, that the drift a person cannot see is the one worth
making structurally impossible.

Formatting is HTML, which is what the client is configured with. Avoid em
dashes, per section 15, and rephrase rather than leaving a sentence that only
worked with one.
"""

from __future__ import annotations

STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "start.intro": (
            "<b>Careers@GFTV</b>\n\n"
            "This is the Telegram side of the Careers@GFTV job portal. With your "
            "portal account linked you can sign in with one tap, hear about "
            "invitations to a role, and be told when one of your applications "
            "moves.\n\n"
            "Everything sent here is in the portal too, so nothing ever arrives "
            "only in this chat."
        ),
        "start.commandsHeading": "<b>What you can ask for</b>",
        "start.unavailableHeading": "<b>Not built yet</b>",
        "start.payload": "That was an account linking link.",
        # What goes between two sentences on one line. English wants a space
        # after a full stop and 华文 wants nothing at all after 。, so joining
        # with a hardcoded space puts a gap in the middle of a Chinese sentence
        # that reads as a typo to everybody who can see it.
        "join.sentence": " ",
        "button.portal": "Open the portal",
        "button.donate": "Support GFTV",
        "feature.unavailable": (
            "Will be available in Phase {phase}. Sorry for the inconvenience caused."
        ),
        "feature.unavailableUnknown": (
            "This is not available yet. Sorry for the inconvenience caused."
        ),
        "feature.maintenance": "Temporarily unavailable while we fix something.",
        "unknown.command": (
            "That is not one of the commands here. Send /start for the list."
        ),
        "plain.message": "Send /start to see what you can ask for.",
        "generic.error": (
            "Something went wrong at our end. Please try that again in a moment."
        ),
    },
    "zh": {
        "start.intro": (
            "<b>国际兽视 Careers</b>\n\n"
            "这里是 国际兽视 Careers 求职网站的 Telegram 服务。关联您的求职账户后，"
            "您可以一键登录、收到职位邀请，并在您的申请有进展时收到通知。\n\n"
            "这里发送的所有内容，在网站上同样可以查看，不会只出现在这个聊天里。"
        ),
        "start.commandsHeading": "<b>您可以使用的功能</b>",
        "start.unavailableHeading": "<b>尚未推出</b>",
        "start.payload": "这是一个账户关联链接。",
        "join.sentence": "",
        "button.portal": "打开求职网站",
        "button.donate": "支持国际兽视",
        "feature.unavailable": "此功能将在第 {phase} 阶段推出，给您带来不便，敬请谅解。",
        "feature.unavailableUnknown": "此功能尚未推出，给您带来不便，敬请谅解。",
        "feature.maintenance": "此功能暂时无法使用，我们正在修复。",
        "unknown.command": "这不是可用的指令。发送 /start 查看指令列表。",
        "plain.message": "发送 /start 查看您可以使用的功能。",
        "generic.error": "我们这边出了一点问题，请稍后再试一次。",
    },
}

DEFAULT_LOCALE = "en"


def _check_keys() -> None:
    """Every locale carries every key, or the bot does not start."""
    expected = set(STRINGS[DEFAULT_LOCALE])
    for name, table in STRINGS.items():
        keys = set(table)
        missing = expected - keys
        extra = keys - expected
        if missing or extra:
            raise RuntimeError(
                f"strings.py: locale {name} does not match {DEFAULT_LOCALE}. "
                f"missing={sorted(missing)} unexpected={sorted(extra)}"
            )


_check_keys()


def text(key: str, locale: str = DEFAULT_LOCALE, **values: object) -> str:
    """One string, in one language, with `{placeholders}` filled in.

    An unknown locale falls back to English rather than failing: a language the
    site has begun shipping before this file caught up should degrade to a
    sentence somebody can read, not to a stack trace in a chat window.
    """
    table = STRINGS.get(locale) or STRINGS[DEFAULT_LOCALE]

    # Membership rather than truthiness. A string that is deliberately empty,
    # `join.sentence` in 华文 being the one that exists today, is a real answer,
    # and `or` reads it as a missing key and hands back the English one. Found
    # by the empty separator producing a space in the middle of a Chinese line.
    if key in table:
        template = table[key]
    else:
        template = STRINGS[DEFAULT_LOCALE].get(key, key)
    if not values:
        return template
    try:
        return template.format(**values)
    except (KeyError, IndexError):
        return template
