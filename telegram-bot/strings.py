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
        "button.signIn": "Sign in",
        # Telegram copies the digits itself when this is tapped, so the label
        # says what happens rather than what to do next. Not "Copy and sign in":
        # the button copies, and where the code is typed is the sentence above.
        "button.copyCode": "Copy the code",
        # The code is on its own line and nothing follows it on that line, so
        # tapping to copy on a phone takes the code and not a sentence around it.
        "code.message": (
            "<b>{code}</b>\n\n"
            "Your sign in code. It works once and lasts five minutes.\n\n"
            "If you did not just try to sign in, somebody has your password. "
            "Do not enter this code, and change your password on the portal."
        ),
        "code.notLinked": (
            "This Telegram account is not linked to a portal account, so there "
            "is nothing to sign in to. Send /link to see how to link one."
        ),
        "code.notEnabled": (
            "This account does not ask for a code when it signs in, so there is "
            "nowhere to type one. You can turn that on in account settings, "
            "under Telegram."
        ),
        "code.tooMany": (
            "That is a lot of codes. Try again in about {minutes} minutes, or "
            "use one of your two factor backup codes to sign in."
        ),
        "code.failed": (
            "We could not reach the portal just now, so no code was issued. "
            "Please try that again in a moment."
        ),
        "test.message": (
            "This is the test message you asked for in account settings. "
            "Everything is working, and this is what a notification from the "
            "portal will look like."
        ),
        # The three notification kinds. The role and the department inside them
        # are the posting's own words in the language it is stored in, exactly as
        # the same task reads on the dashboard, and only the sentences around
        # them are translated.
        "notify.inviteHeading": "<b>You have been invited to apply</b>",
        "notify.inviteRole": "Role: <b>{role}</b>",
        "notify.inviteDepartment": "Department: {department}",
        "notify.inviteNote": "{note}",
        "notify.taskHeading": "<b>Something is waiting for you</b>",
        "notify.taskTitle": "{title}",
        "notify.decisionHeading": "<b>An update on your application</b>",
        "notify.decisionRole": "Role: <b>{role}</b>",
        # Section 15: always include an unsubscribe hint in the footer of a
        # notification. It names the command rather than describing where a
        # setting lives, because the command is one tap from reading this.
        "notify.footer": "<i>Send /notify to choose what arrives here.</i>",
        "button.viewRole": "View the role",
        "button.decline": "Decline",
        "button.openTasks": "Open your tasks",
        "button.openApplications": "Open your applications",
        "decline.done": (
            "Declined, and the team has been told. The invitation stays on your "
            "tasks page as a record, and you can still apply to the role yourself "
            "if you change your mind."
        ),
        "decline.nothing": (
            "There is nothing to decline here any more. The invitation may have "
            "been withdrawn, or you may have answered it already."
        ),
        "notify.intro": (
            "<b>What arrives here</b>\n\n"
            "Tap one to switch it on or off. Everything keeps appearing on the "
            "portal either way, so nothing is lost by turning a kind off here.\n\n"
            "Sign in codes are not on this list. Those only ever arrive because "
            "somebody is signing in to your account, so they cannot be switched "
            "off."
        ),
        "notify.kind.invite": "Invitations to apply",
        "notify.kind.task_raised": "Things waiting for you",
        "notify.kind.application_status_changed": "Updates on your applications",
        "notify.state.on": "{kind}: on",
        "notify.state.off": "{kind}: off",
        "notify.word.on": "on",
        "notify.word.off": "off",
        "notify.changed": "{kind} is now {state}.",
        "notify.notLinked": (
            "This Telegram account is not linked to a portal account, so nothing "
            "is being sent here. Send /link to see how to link one."
        ),
        "notify.gone": (
            "This Telegram account is no longer linked to that portal account, so "
            "there is nothing to change."
        ),
        "notify.failed": (
            "We could not reach the portal just now. Nothing has changed."
        ),
        # The four list commands. Three of them answer about one account and say
        # the same thing when there is no link, so they say it once: three
        # wordings for one rule is how the rule stops being one rule.
        "list.notLinked": (
            "This Telegram account is not linked to a portal account, so there "
            "is nothing to look up. Send /link to see how to link one."
        ),
        # Never "you have none". A read that could not be made is not an empty
        # list, and the difference matters most on the pages that are about
        # somebody's own account.
        "list.unavailable": (
            "We could not reach the portal just now, so there is nothing to "
            "show. Please try that again in a moment."
        ),
        "list.more": "There are {count} more on the portal.",
        "button.openBoard": "See every opening",
        "invites.heading": "<b>Your open invitations</b>",
        "invites.row": "<b>{role}</b>",
        "invites.none": (
            "You have no open invitations right now. Every role that is taking "
            "applications is on the board, and you can apply to any of them "
            "yourself."
        ),
        "invites.record": (
            "<i>Each one is on your tasks page too, with the note whoever sent "
            "it wrote.</i>"
        ),
        "tasks.none": (
            "Nothing is waiting for you. That is the state that page is meant "
            "to be in."
        ),
        "tasks.one": "One thing is waiting for you.",
        "tasks.many": "{count} things are waiting for you.",
        "applications.heading": "<b>Your applications</b>",
        "applications.row": "<b>{role}</b>\n{status}",
        "applications.none": (
            "You have not applied for anything yet. The board has every role "
            "that is open."
        ),
        # A status this file has no word for. It says where to look rather than
        # inventing a sentence about somebody's application, which is the one
        # thing a chat window has no business doing.
        "applications.statusUnknown": "Open the portal to see where this one stands.",
        # The same words /account/applications uses, from status.* in en.json.
        # A status called one thing on the page and another in the chat is two
        # answers to one question.
        "application.status.started": "Started",
        "application.status.submitted": "Applied",
        "application.status.under_review": "Being read",
        "application.status.shortlisted": "Shortlisted",
        "application.status.interview": "Interviewing",
        "application.status.offered": "Offered",
        "application.status.accepted": "Accepted",
        "application.status.rejected": "Not this time",
        "application.status.withdrawn": "Withdrawn",
        "jobs.heading": "<b>The newest openings</b>",
        "jobs.row": "<b>{role}</b>",
        "jobs.department": "Department: {department}",
        "jobs.none": (
            "There is nothing listed right now. New roles go up on the board as "
            "they open."
        ),
        # The same line the feed carries for anybody reprinting it. A list of
        # roles with no word about pay reads as a list of jobs.
        "jobs.notice": (
            "<i>Roles at GFTV are voluntary and unpaid unless the posting says "
            "otherwise.</i>"
        ),
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
            "这里是国际兽视 Careers 求职网站的 Telegram 服务。关联您的求职账户后，"
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
        "button.signIn": "登录",
        "button.copyCode": "复制验证码",
        "code.message": (
            "<b>{code}</b>\n\n"
            "这是您的登录验证码，只能使用一次，有效期五分钟。\n\n"
            "如果这不是您本人正在登录，说明有人知道了您的密码。"
            "请不要输入此验证码，并立即到求职网站上修改密码。"
        ),
        "code.notLinked": (
            "这个 Telegram 账户尚未关联任何求职账户，因此没有可以登录的账户。"
            "发送 /link 可以了解如何关联。"
        ),
        "code.notEnabled": (
            "这个账户在登录时不需要验证码，因此没有地方可以输入。"
            "您可以在账户设置的 Telegram 部分开启这项功能。"
        ),
        "code.tooMany": (
            "验证码请求次数过多。请在大约 {minutes} 分钟后再试，"
            "或使用您的双重验证备用码登录。"
        ),
        "code.failed": "我们暂时无法连接到求职网站，因此没有生成验证码。请稍后再试一次。",
        "test.message": (
            "这是您在账户设置中请求的测试消息。一切正常，"
            "求职网站发来的通知就是这个样子。"
        ),
        "notify.inviteHeading": "<b>您收到了一份职位邀请</b>",
        "notify.inviteRole": "职位：<b>{role}</b>",
        "notify.inviteDepartment": "部门：{department}",
        "notify.inviteNote": "{note}",
        "notify.taskHeading": "<b>有事项等待您处理</b>",
        "notify.taskTitle": "{title}",
        "notify.decisionHeading": "<b>您的申请有新进展</b>",
        "notify.decisionRole": "职位：<b>{role}</b>",
        "notify.footer": "<i>发送 /notify 可以选择在这里收到哪些通知。</i>",
        "button.viewRole": "查看职位",
        "button.decline": "婉拒邀请",
        "button.openTasks": "打开待办事项",
        "button.openApplications": "打开我的申请",
        "decline.done": (
            "已婉拒，我们也已经通知了团队。这份邀请仍会保留在您的待办事项页面上作为记录；"
            "如果您改变主意，随时可以自行申请这个职位。"
        ),
        "decline.nothing": (
            "这份邀请已经无法婉拒了。可能是招聘方已经撤回，也可能是您之前已经回复过。"
        ),
        "notify.intro": (
            "<b>这里会收到哪些通知</b>\n\n"
            "点击任意一项即可开启或关闭。无论开关如何，所有内容在求职网站上都能查看，"
            "关闭某一类通知不会遗漏任何信息。\n\n"
            "登录验证码不在此列。验证码只有在有人登录您的账户时才会发出，因此无法关闭。"
        ),
        "notify.kind.invite": "职位邀请",
        "notify.kind.task_raised": "待处理事项",
        "notify.kind.application_status_changed": "申请进展",
        "notify.state.on": "{kind}：已开启",
        "notify.state.off": "{kind}：已关闭",
        "notify.word.on": "已开启",
        "notify.word.off": "已关闭",
        "notify.changed": "{kind}{state}。",
        "notify.notLinked": (
            "这个 Telegram 账户尚未关联任何求职账户，因此不会收到任何通知。"
            "发送 /link 可以了解如何关联。"
        ),
        "notify.gone": "这个 Telegram 账户已不再关联那个求职账户，因此没有可以更改的设置。",
        "notify.failed": "我们暂时无法连接到求职网站，设置没有任何改动。",
        "list.notLinked": (
            "这个 Telegram 账户尚未关联任何求职账户，因此没有可以查询的内容。"
            "发送 /link 可以了解如何关联。"
        ),
        "list.unavailable": "我们暂时无法连接到求职网站，因此无法显示内容。请稍后再试一次。",
        "list.more": "还有 {count} 项，可以在求职网站上查看。",
        "button.openBoard": "查看全部职位",
        "invites.heading": "<b>您收到的职位邀请</b>",
        "invites.row": "<b>{role}</b>",
        "invites.none": (
            "您目前没有待回复的职位邀请。所有正在招聘的职位都列在职位板上，您也可以自行申请。"
        ),
        "invites.record": (
            "<i>每一份邀请在您的待办事项页面上也有记录，并附有邀请人写下的留言。</i>"
        ),
        "tasks.none": "目前没有需要您处理的事项。这正是该页面应有的状态。",
        "tasks.one": "有 1 项事项等待您处理。",
        "tasks.many": "有 {count} 项事项等待您处理。",
        "applications.heading": "<b>我的申请</b>",
        "applications.row": "<b>{role}</b>\n{status}",
        "applications.none": "您还没有提交任何申请。职位板上列出了所有正在招聘的职位。",
        "applications.statusUnknown": "请在求职网站上查看这份申请的最新状态。",
        "application.status.started": "已开始",
        "application.status.submitted": "已申请",
        "application.status.under_review": "审阅中",
        "application.status.shortlisted": "已入围",
        "application.status.interview": "面试中",
        "application.status.offered": "已录取",
        "application.status.accepted": "已接受",
        "application.status.rejected": "这次未获选",
        "application.status.withdrawn": "已撤回",
        "jobs.heading": "<b>最新职位</b>",
        "jobs.row": "<b>{role}</b>",
        "jobs.department": "部门：{department}",
        "jobs.none": "目前没有正在招聘的职位。新职位开放后会发布在职位板上。",
        "jobs.notice": (
            "<i>除非职位说明另有注明，国际兽视的职位均为义务性质，不提供薪酬。</i>"
        ),
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
