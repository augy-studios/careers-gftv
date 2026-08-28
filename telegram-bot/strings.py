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
        "button.settings": "Open account settings",
        "button.unlinkYes": "Yes, unlink",
        "button.unlinkNo": "Keep it linked",
        "link.instructions": (
            "To link this Telegram account, open account settings on the portal "
            "and press <b>Link Telegram</b>. You will get a code to scan, or a "
            "link to tap if you are already reading this on the same phone.\n\n"
            "It has to start there and not here, because that page already "
            "knows which account is signed in and this chat does not."
        ),
        # Section 15 step 5: used, expired and unknown are one answer, on
        # purpose. Which of the three it was is exactly what somebody holding a
        # link that is not theirs would like to be told.
        "link.refused": (
            "That code did not work. Open account settings on the portal and ask "
            "for a new one, and it will be ready to use straight away."
        ),
        "link.failed": (
            "Something went wrong while linking and nothing has been changed. "
            "Ask for a new code in account settings and try once more."
        ),
        "link.unavailable": (
            "We could not reach the portal just now. Nothing has changed. Please "
            "try that again in a moment."
        ),
        "link.done": "Done. This Telegram account is now linked to {who}.",
        "link.doneNoName": "Done. This Telegram account is now linked.",
        "link.alreadyThis": (
            "This Telegram account is already linked. Send /unlink first if you "
            "want to link it to a different portal account."
        ),
        "link.alreadyOther": (
            "This Telegram account is already linked to a portal account. Send "
            "/unlink first if you want to link it to a different one."
        ),
        "unlink.notLinked": "This Telegram account is not linked to anything.",
        "unlink.confirm": (
            "Unlink this Telegram account?\n\n"
            "Your portal account and everything in it stays exactly as it is. "
            "This only stops us sending you anything here, and invitations and "
            "updates keep arriving on your tasks page as they always do."
        ),
        "unlink.done": "Unlinked. You can link this account again whenever you like.",
        "unlink.failed": "We could not reach the portal just now. Nothing has changed.",
        "callback.unknown": "That button is too old to act on. Send the command again.",
        "callback.notYours": "That button belongs to somebody else's conversation.",
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
        "button.settings": "打开账户设置",
        "button.unlinkYes": "是的，解除关联",
        "button.unlinkNo": "保持关联",
        "link.instructions": (
            "要关联这个 Telegram 账户，请在求职网站上打开账户设置，然后点击"
            "<b>关联 Telegram</b>。系统会给您一个二维码，如果您正是在同一台手机上"
            "阅读这条消息，也可以直接点击链接。\n\n"
            "关联必须从那里开始，而不是从这里开始，因为那个页面已经知道是哪个账户"
            "登录了，而这个聊天并不知道。"
        ),
        "link.refused": (
            "这个二维码无法使用。请在求职网站的账户设置中重新获取一个，新的可以立即使用。"
        ),
        "link.failed": (
            "关联过程中出了问题，您的账户没有任何改动。请在账户设置中重新获取一个二维码再试一次。"
        ),
        "link.unavailable": "我们暂时无法连接到求职网站，您的账户没有任何改动。请稍后再试一次。",
        "link.done": "已完成。这个 Telegram 账户现在已关联到 {who}。",
        "link.doneNoName": "已完成。这个 Telegram 账户现在已关联。",
        "link.alreadyThis": (
            "这个 Telegram 账户已经关联过了。如果您想关联到另一个求职账户，请先发送 /unlink。"
        ),
        "link.alreadyOther": (
            "这个 Telegram 账户已经关联到某个求职账户。如果您想关联到另一个账户，请先发送 /unlink。"
        ),
        "unlink.notLinked": "这个 Telegram 账户目前没有关联任何账户。",
        "unlink.confirm": (
            "要解除这个 Telegram 账户的关联吗？\n\n"
            "您的求职账户及其中的所有内容都不会改变。这只会让我们不再通过这里向您发送信息；"
            "邀请和进度更新仍会像往常一样，送到您的待办事项页面。"
        ),
        "unlink.done": "已解除关联。您随时可以重新关联这个账户。",
        "unlink.failed": "我们暂时无法连接到求职网站，您的账户没有任何改动。",
        "callback.unknown": "这个按钮太旧了，无法继续操作。请重新发送该指令。",
        "callback.notYours": "这个按钮属于其他人的对话。",
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
