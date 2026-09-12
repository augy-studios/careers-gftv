"""Rich messages, phase 15 part 2. Everything structured the bot sends goes here.

Telegram's rich messages, Bot API 10.1 and TL layer 227, are a second body on a
message: headings, tables, lists, block quotes and fenced code, drawn natively
by a current client instead of approximated with bold and bullets. Telethon
1.44 carries the constructors and the `rich_message` field on the two raw
requests, and nothing higher up: `send_message` and `edit_message` do not
expose it, so the sends below are raw requests. Asked for on 12 September 2026,
with a design that is followed here and is worth stating in full because two of
its rules are the kind that look optional and are not.

**The contract.** A structured reply is a dict, `{"markdown": ..., "fallback":
...}`. `markdown` is Telegram's Rich Markdown, the GitHub flavour with embedded
HTML: `#` headings, `**bold**`, `*italic*`, bullet lists and pipe tables.
`fallback` is plain text saying the same thing. It goes in the request's
required `message=` field, is what an older client shows, and is what is sent
when the rich body is refused. **It is never empty and never parsed**: no
`parse_mode` is applied to it, so it is written plain and the HTML the bot's
strings carry is stripped, not sent.

**One-line notices stay ordinary.** "Nothing found", a confirmation, a refusal:
those are `event.respond` with the client's HTML parse mode, as before. Only
content with a heading, a table or sections takes this path, which is `/start`,
the three lists, the guides, and the four notification kinds.

**The strings stay HTML.** `strings.py` is read by `check-copy.js`,
`commands.py --check` and `gen-review.js`, and it is translated. Rewriting two
hundred and forty strings into a second markup so the rich body could be built
from them directly would put every one of those in front of a reviewer again.
So `from_html` below reads the string as Telegram HTML and answers both halves
of the contract from it, and a builder assembles a reply from those halves. The
dynamic data the strings are formatted with arrives HTML escaped, exactly as
before, and leaves as text escaped for markdown, which is the escaping rule the
design asks for, applied at the one point every string passes through.

**A rich send that fails falls back to plain text and logs why**, with two
exceptions the design's own reason supports: a flood wait and the four answers
that mean the chat cannot be reached are re-raised, because the plain send
would meet the same answer and the drain has its own handling for each.
"""

from __future__ import annotations

import logging
import re
from html.parser import HTMLParser

from telethon import types
from telethon.errors import (
    FloodWaitError,
    InputUserDeactivatedError,
    MessageNotModifiedError,
    PeerIdInvalidError,
    UserIsBlockedError,
    UserIsBotError,
)
from telethon.tl import functions

log = logging.getLogger("bot.reply")

# Telegram answers a rich send would get from the plain one too. Re-raised, so
# the caller's own handling of each still runs: the drain reschedules a flood
# wait and marks a blocked chat failed, and a fallback send in between would
# only cost a second request for the same answer.
PASS_THROUGH = (
    FloodWaitError,
    UserIsBlockedError,
    UserIsBotError,
    InputUserDeactivatedError,
    PeerIdInvalidError,
)

# ---------------------------------------------------------------------------
# Escaping
# ---------------------------------------------------------------------------

_MD_SPECIAL = re.compile(r"([\\*_~`|\[\]#>=])")


def escape_md(text) -> str:
    """Escape user or data text for Telegram's Rich Markdown dialect."""
    return _MD_SPECIAL.sub(r"\\\1", str(text))


def escape_cell(text) -> str:
    """Escape for a table cell; also flattens newlines so the row stays intact."""
    return escape_md(str(text).replace("\n", " "))


# ---------------------------------------------------------------------------
# Building a reply
# ---------------------------------------------------------------------------


def rich(markdown: str, fallback: str) -> dict:
    """The contract, as a value."""
    return {"markdown": markdown, "fallback": fallback}


def join_rich(parts, sep: str = "\n\n") -> dict:
    """Parts in order, empty ones dropped, both halves joined the same way."""
    kept = [part for part in parts if part and (part["markdown"] or part["fallback"])]
    return rich(
        sep.join(part["markdown"] for part in kept),
        sep.join(part["fallback"] for part in kept),
    )


# What each Telegram HTML tag becomes. Bold and italic are GitHub's; underline
# has no markdown and is passed through as the tag, which the rich dialect
# accepts; strikethrough is GitHub's too.
_INLINE = {
    "b": ("**", "**"),
    "strong": ("**", "**"),
    "i": ("*", "*"),
    "em": ("*", "*"),
    "u": ("<u>", "</u>"),
    "s": ("~~", "~~"),
    "del": ("~~", "~~"),
    "strike": ("~~", "~~"),
}


class _Converter(HTMLParser):
    """Telegram HTML in, the two halves out.

    Text nodes are escaped for markdown on the way through and left alone on the
    plain side. Inside `<code>` and `<pre>` nothing is escaped, since a backtick
    span is literal by definition. An emphasis marker is placed against the
    text and not against a space, because `** bold **` is not bold in GitHub's
    dialect, so the whitespace inside a tag is moved outside it.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.md: list[str] = []
        self.plain: list[str] = []
        self._open: list[tuple[str, int, str | None]] = []
        self._literal = 0

    # -- tags ---------------------------------------------------------

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in _INLINE:
            self._open.append((tag, len(self.md), None))
        elif tag == "code" and not self._literal:
            self._open.append((tag, len(self.md), None))
            self._literal += 1
        elif tag == "pre":
            self._open.append((tag, len(self.md), None))
            self._literal += 1
        elif tag == "a":
            href = dict(attrs).get("href")
            self._open.append((tag, len(self.md), href))
        elif tag == "blockquote":
            self._open.append((tag, len(self.md), None))
        elif tag == "br":
            self.md.append("\n")
            self.plain.append("\n")

    def handle_endtag(self, tag: str) -> None:
        for at in range(len(self._open) - 1, -1, -1):
            if self._open[at][0] != tag:
                continue
            _, start, href = self._open.pop(at)
            inner = "".join(self.md[start:])
            del self.md[start:]
            self.md.append(self._wrap(tag, inner, href))
            if tag in ("code", "pre"):
                self._literal -= 1
            return

    @staticmethod
    def _wrap(tag: str, inner: str, href: str | None) -> str:
        if tag in _INLINE:
            before, after = _INLINE[tag]
            lead = inner[: len(inner) - len(inner.lstrip())]
            trail = inner[len(inner.rstrip()) :]
            core = inner.strip()
            if not core:
                return inner
            return f"{lead}{before}{core}{after}{trail}"
        if tag == "code":
            fence = "``" if "`" in inner else "`"
            return f"{fence}{inner}{fence}"
        if tag == "pre":
            return f"```\n{inner.strip(chr(10))}\n```"
        if tag == "a":
            if href:
                return f"[{inner}]({href})"
            return inner
        if tag == "blockquote":
            return "\n".join(f"> {line}" if line else ">" for line in inner.strip("\n").split("\n"))
        return inner

    # -- text ---------------------------------------------------------

    def handle_data(self, data: str) -> None:
        self.md.append(data if self._literal else escape_md(data))
        self.plain.append(data)

    def result(self) -> dict:
        while self._open:
            self.handle_endtag(self._open[-1][0])
        return rich("".join(self.md), "".join(self.plain))


def from_html(markup: str) -> dict:
    """One string from `strings.py`, formatted, as both halves of the contract."""
    converter = _Converter()
    converter.feed(markup)
    converter.close()
    return converter.result()


def plain_of(markup: str) -> str:
    """The text of a Telegram HTML string, for a label or a fallback line."""
    return from_html(markup)["fallback"]


def heading(markup: str, level: int = 1) -> dict:
    """A heading from a string that is usually `<b>...</b>` today.

    The bold is redundant inside a heading and is dropped: the heading is the
    text, escaped for markdown. The plain side keeps the text as it is.
    """
    text = plain_of(markup).strip()
    return rich(f"{'#' * level} {escape_md(text)}", text)


def paragraph(markup: str) -> dict:
    """A formatted string as a paragraph."""
    return from_html(markup)


_TITLE_LINE = re.compile(r"^<b>(.+?)</b>\s*\n\n", re.S)


def titled(markup: str, level: int = 1) -> dict:
    """A string that opens with a bold line and a blank line, as heading and body.

    Several strings are written that way, `start.intro`, `docs.intro` and
    `notify.intro` among them, because bold was the only heading a chat had.
    The bold line becomes the heading and the rest stays paragraphs. A string
    that does not open that way is one paragraph, unchanged.
    """
    match = _TITLE_LINE.match(markup)
    if not match:
        return from_html(markup)
    return join_rich([heading(match.group(1), level), from_html(markup[match.end() :])])


def bullets(items) -> dict:
    """A bullet list. Each item is a rich part; a multi line one is indented."""
    md = []
    plain = []
    for item in items:
        lines = item["markdown"].split("\n")
        md.append("- " + "\n  ".join(lines))
        plain.append("• " + item["fallback"].replace("\n", "\n  "))
    return rich("\n".join(md), "\n".join(plain))


def numbered(items) -> dict:
    """A numbered list, the same way."""
    md = []
    plain = []
    for number, item in enumerate(items, start=1):
        lines = item["markdown"].split("\n")
        md.append(f"{number}. " + "\n   ".join(lines))
        plain.append(f"{number}. " + item["fallback"].replace("\n", "\n   "))
    return rich("\n".join(md), "\n".join(plain))


def table(headers, rows) -> dict:
    """A pipe table. Headers and cells are rich parts or plain strings.

    A cell's markdown is flattened onto one line and a bare `|` in it is
    escaped, which `escape_md` already does for text that came through
    `from_html`; a plain string cell is escaped here. The plain side is one
    line per row with the cells separated, which reads as a list on a client
    that cannot draw the table.
    """

    def cell(value) -> tuple[str, str]:
        if isinstance(value, dict):
            return value["markdown"].replace("\n", " "), value["fallback"].replace("\n", " ")
        return escape_cell(value), str(value).replace("\n", " ")

    head = [cell(value) for value in headers]
    body = [[cell(value) for value in row] for row in rows]

    md = ["| " + " | ".join(md for md, _ in head) + " |", "| " + " | ".join("---" for _ in head) + " |"]
    for row in body:
        md.append("| " + " | ".join(md for md, _ in row) + " |")

    plain = [" · ".join(text for _, text in row) for row in body]
    return rich("\n".join(md), "\n".join(plain))


def code_block(text: str) -> dict:
    """A fenced block, kept exactly, in both halves."""
    body = text.strip("\n")
    return rich(f"```\n{body}\n```", body)


def quote(part: dict) -> dict:
    """A block quote around a part."""
    md = "\n".join(f"> {line}" if line else ">" for line in part["markdown"].split("\n"))
    return rich(md, part["fallback"])


def lines(parts) -> dict:
    """Parts joined by single newlines, for a run of short lines."""
    return join_rich(parts, "\n")


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------


def _rich_markdown(reply: dict) -> types.InputRichMessageMarkdown:
    return types.InputRichMessageMarkdown(markdown=reply["markdown"])


# Editing without reply_markup keeps the old keyboard; an empty inline keyboard
# is what actually removes it.
_NO_BUTTONS = types.ReplyInlineMarkup(rows=[])


def sent_message_id(result) -> int | None:
    """Id of the message a raw send created. Bot sends come back as Updates."""
    if isinstance(result, (types.Message, types.UpdateShortSentMessage)):
        return result.id
    for update in getattr(result, "updates", []):
        if isinstance(update, types.UpdateMessageID):
            return update.id
        if isinstance(update, (types.UpdateNewMessage, types.UpdateNewChannelMessage)):
            return update.message.id
    return None


def _fallback_note(where: str, reply: dict, err: BaseException) -> None:
    # A line in the log, not the console: the checklist in the README asks the
    # person walking it to look for exactly this line and find none.
    log.warning(
        "%s: rich send refused, sending the plain text instead (%s): %r",
        where,
        reply["fallback"][:40].replace("\n", " "),
        err,
    )


async def send_rich_message(client, entity, reply: dict, buttons=None):
    """Send a structured reply, falling back to its plain text if refused."""
    if not reply["fallback"].strip():
        raise ValueError("a rich message needs a fallback, and this one is empty")
    markup = client.build_reply_markup(buttons) if buttons else None
    try:
        return await client(
            functions.messages.SendMessageRequest(
                peer=entity,
                message=reply["fallback"],
                rich_message=_rich_markdown(reply),
                reply_markup=markup,
                no_webpage=True,
            )
        )
    except PASS_THROUGH:
        raise
    except Exception as err:  # noqa: BLE001 - the plain text is the answer to every other refusal
        _fallback_note("send", reply, err)
        return await client.send_message(
            entity, reply["fallback"], buttons=buttons, parse_mode=None, link_preview=False
        )


async def edit_rich_message_at(client, peer, msg_id: int, reply: dict, buttons=None) -> None:
    """Edit by chat and message id. No buttons means the keyboard is removed."""
    markup = client.build_reply_markup(buttons) if buttons else _NO_BUTTONS
    try:
        await client(
            functions.messages.EditMessageRequest(
                peer=peer,
                id=msg_id,
                message=reply["fallback"],
                rich_message=_rich_markdown(reply),
                reply_markup=markup,
                no_webpage=True,
            )
        )
    except MessageNotModifiedError:
        return
    except PASS_THROUGH:
        raise
    except Exception as err:  # noqa: BLE001
        _fallback_note("edit", reply, err)
        try:
            await client.edit_message(
                peer, msg_id, text=reply["fallback"], buttons=buttons, parse_mode=None, link_preview=False
            )
        except MessageNotModifiedError:
            return


async def edit_rich_message(client, event, reply: dict, buttons=None) -> None:
    """Edit the message a callback came from, in a chat or from inline mode."""
    markup = client.build_reply_markup(buttons) if buttons else None
    is_inline = isinstance(event.query, types.UpdateInlineBotCallbackQuery)
    try:
        if is_inline:
            await client(
                functions.messages.EditInlineBotMessageRequest(
                    id=event.query.msg_id,
                    message=reply["fallback"],
                    rich_message=_rich_markdown(reply),
                    reply_markup=markup,
                    no_webpage=True,
                )
            )
        else:
            await client(
                functions.messages.EditMessageRequest(
                    peer=event.query.peer,
                    id=event.query.msg_id,
                    message=reply["fallback"],
                    rich_message=_rich_markdown(reply),
                    reply_markup=markup,
                    no_webpage=True,
                )
            )
    except MessageNotModifiedError:
        return
    except PASS_THROUGH:
        raise
    except Exception as err:  # noqa: BLE001
        _fallback_note("callback edit", reply, err)
        try:
            if is_inline:
                await client.edit_message(
                    event.query.msg_id, text=reply["fallback"], buttons=buttons, parse_mode=None
                )
            else:
                await client.edit_message(
                    event.query.peer,
                    event.query.msg_id,
                    text=reply["fallback"],
                    buttons=buttons,
                    parse_mode=None,
                    link_preview=False,
                )
        except MessageNotModifiedError:
            return
