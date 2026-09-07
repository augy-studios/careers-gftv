"""The guides, read from Supabase and rendered for a chat window.

Phase 14 part 10. `/docs` browses the documentation site with inline buttons and
sends a page as formatted text in the reader's own language.

---------------------------------------------------------------------------
It reads one view and never a table, and that is the whole tier story
---------------------------------------------------------------------------

`gftvjobs_docs_public` inner joins `gftvjobs_docs_translations` to
`gftvjobs_docs_pages`. The mirror carries public pages only, so a gated page has
no row there, so its 华文 joins to nothing and is not in the view at all.

**There is therefore no tier logic in this file.** That is not a copy of the
site's rule that is kept in step with it; it is the absence of a second copy.
Section 2 of the working memo carried the worry from 3 September 2026 that "the
tier rule is implemented twice, once in reader.js and once in Python, and the
copies can disagree", and migration `042` discharged it rather than paying it.
The inner join is the load bearing word. If anybody ever widens this to read
`gftvjobs_docs_translations` directly, the admin guide goes to whoever asks.

---------------------------------------------------------------------------
Paging, because rich text does not raise the limit
---------------------------------------------------------------------------

Telegram caps a message at 4096 characters **after** entity parsing, so
`parse_mode` changes formatting and not length, and Telethon raises
`MessageTooLongError` instead of splitting. Settled: page it, and name what it
cannot render.

Pages break on heading boundaries, so a page break never lands mid sentence, and
each carries a "2 of 5" and a pager that says which part it is on. A single section longer than the
budget is split again on paragraph boundaries, because a heading with four
thousand characters under it has to go somewhere.

---------------------------------------------------------------------------
What it renders, and what it refuses to pretend it rendered
---------------------------------------------------------------------------

Bold, italic, code, links and blockquote are Telegram's own tags. A table, a
tabbed block, a callout's markers and an image are not, and **a block silently
dropped is a procedure with a step missing**. So each becomes one line saying
what is there, with a link to that page on the site where DOCS_URL is set.
"""

from __future__ import annotations

import html
import re

# Telegram's own cap is 4096 after entity parsing. The budget is lower on
# purpose: the header, the "2 of 5" line and the footer are added after the body
# is measured, and a page that fitted exactly would then not.
BUDGET = 3400

# A path is the site's own address and is what everything here is keyed by. The
# shape is migration 042's own check constraint, restated so a malformed path
# from a caller never reaches PostgREST as a filter.
PATH = re.compile(r"^(/[a-z0-9][a-z0-9-]*){1,3}$")


def is_page_path(value: str) -> bool:
    """Whether a string is a page address this may ask the view for."""
    return value == "/" or bool(PATH.match(value))


# ---------------------------------------------------------------------------
# Markdown, as far as a chat window can take it
# ---------------------------------------------------------------------------

# Inline markers, applied to text that has already been HTML escaped. Order
# matters: the code span goes first so that a `**` inside backticks is left
# alone, and the link is taken before emphasis so a title carrying an asterisk
# does not lose it.
_CODE = re.compile(r"`([^`\n]+)`")
_LINK = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)")
_BOLD = re.compile(r"\*\*([^*\n]+)\*\*")
_ITALIC = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?!\w)")

# A fenced block opens and closes on its own line. The language, where there is
# one, is dropped: Telegram's <pre> takes no language and inventing a <code
# class> would be markup no client here renders.
_FENCE = re.compile(r"^\s*(```|~~~)")

# The four callout kinds the site's renderer draws. In a chat the marker line is
# the only part worth keeping, as a bold word, because the box it names is not
# available.
_CALLOUT = re.compile(r"^>\s*\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION)\]\s*$", re.I)

_IMAGE = re.compile(r"^!\[([^\]]*)\]\(([^)\s]+)")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_NUMBER = re.compile(r"^(\s*)(\d+)[.)]\s+(.*)$")


def inline(text: str, base: str | None = None) -> str:
    """One line of markdown as Telegram HTML, escaping first.

    **Escaping happens before any tag is inserted**, which is the only order
    that is safe: a guide page is a committed file, but it is still text this
    file turns into markup, and doing it the other way round would let a page
    containing `<b>` decide how a message is formatted.

    **A relative link needs a base or it is not a link.** The guides link to each
    other by address, `[Linking your account](/bot/linking)`, which is exactly
    right on the site and is not a URL anywhere else. Telegram wants an absolute
    one and quietly refuses anything else. So a relative href is joined to
    `base`, and where there is no base the anchor is dropped and **the words are
    kept**: losing the sentence would be a worse answer than losing the link.
    """

    def anchor(match: re.Match) -> str:
        label, href = match.group(1), match.group(2)
        if href.startswith(("http://", "https://")):
            return f'<a href="{href}">{label}</a>'
        if href.startswith("/") and base:
            return f'<a href="{base}{href}">{label}</a>'
        # An in-page anchor, a mailto, or a relative link with nowhere to go.
        return label

    out = html.escape(text, quote=True)
    out = _CODE.sub(lambda m: f"<code>{m.group(1)}</code>", out)
    out = _LINK.sub(anchor, out)
    out = _BOLD.sub(lambda m: f"<b>{m.group(1)}</b>", out)
    out = _ITALIC.sub(lambda m: f"<i>{m.group(1)}</i>", out)
    return out


def render(body: str, *, note, base: str | None = None) -> list[tuple[str | None, str]]:
    """A page's markdown as a list of `(heading, html)` sections.

    `note` builds the one line that replaces a block this cannot draw. It takes
    a kind and returns a sentence, so the wording stays in `strings.py` and this
    file holds no copy in either language. `base` is the docs site's own origin,
    used to make a relative link absolute.

    The front matter is not here: the view stores title, summary and body as
    three columns, so what arrives is already the body alone.

    **Lines inside a paragraph are joined, not kept.** These files are wrapped at
    eighty columns, and sending them line for line puts a ragged column of short
    lines in a chat that is already narrow. `markdown.js` learned this on the
    site and states it in as many words; this is the same rule for the same
    files, arriving at the other reader.
    """
    lines = body.replace("\r\n", "\n").split("\n")
    sections: list[tuple[str | None, list[str]]] = [(None, [])]

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        # A fenced block goes across whole, inside <pre>, because a command with
        # its indentation removed is a command that does not run.
        if _FENCE.match(line):
            index += 1
            block: list[str] = []
            while index < len(lines) and not _FENCE.match(lines[index]):
                block.append(lines[index])
                index += 1
            index += 1  # the closing fence
            sections[-1][1].append(
                "<pre>" + html.escape("\n".join(block), quote=False) + "</pre>"
            )
            continue

        heading = _HEADING.match(line)
        if heading:
            # h1 is the page title, which the caller already has from the view's
            # own column, so it never opens a section of its own.
            if len(heading.group(1)) == 1:
                index += 1
                continue
            sections.append((heading.group(2).strip(), []))
            index += 1
            continue

        # A table is a header row, an alignment rule, and its body. It is
        # recognised the same way the site's renderer recognises it, and then
        # named rather than drawn: a chat window has no column that stays put.
        if "|" in stripped and index + 1 < len(lines) and re.match(
            r"^\s*\|?[\s:|-]+\|[\s:|-]*$", lines[index + 1]
        ):
            while index < len(lines) and "|" in lines[index]:
                index += 1
            sections[-1][1].append(note("table"))
            continue

        if stripped.startswith("::tab") or stripped.startswith(":::"):
            marker = stripped
            index += 1
            while index < len(lines) and not lines[index].strip().startswith(":::"):
                index += 1
            index += 1
            sections[-1][1].append(note("tabs" if "tab" in marker else "block"))
            continue

        image = _IMAGE.match(stripped)
        if image:
            sections[-1][1].append(note("image"))
            index += 1
            continue

        callout = _CALLOUT.match(stripped)
        if callout:
            sections[-1][1].append(f"<b>{html.escape(callout.group(1).title())}</b>")
            index += 1
            continue

        if stripped.startswith(">"):
            quoted = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quoted.append(lines[index].strip().lstrip(">").strip())
                index += 1
            sections[-1][1].append(
                "<blockquote>"
                + inline(" ".join(q for q in quoted if q), base)
                + "</blockquote>"
            )
            continue

        if stripped == "":
            sections[-1][1].append("")
            index += 1
            continue

        bullet = _BULLET.match(line)
        if bullet:
            indent = "  " if len(bullet.group(1)) >= 2 else ""
            sections[-1][1].append(f"{indent}• {inline(bullet.group(2), base)}")
            index += 1
            continue

        number = _NUMBER.match(line)
        if number:
            indent = "  " if len(number.group(1)) >= 2 else ""
            sections[-1][1].append(f"{indent}{number.group(2)}. {inline(number.group(3), base)}")
            index += 1
            continue

        # A run of plain lines is one paragraph that happened to be wrapped.
        # Anything with its own shape ends the run: a blank line, a heading, a
        # bullet, a fence, a quote, a table row, or a container marker.
        paragraph = []
        while index < len(lines):
            nxt = lines[index]
            flat = nxt.strip()
            if (
                flat == ""
                or _FENCE.match(nxt)
                or _HEADING.match(nxt)
                or _BULLET.match(nxt)
                or _NUMBER.match(nxt)
                or flat.startswith(">")
                or flat.startswith(":::")
                or flat.startswith("::tab")
                or flat.startswith("|")
                or _IMAGE.match(flat)
            ):
                break
            paragraph.append(flat)
            index += 1

        sections[-1][1].append(inline(" ".join(paragraph), base))

    out: list[tuple[str | None, str]] = []
    for title, block in sections:
        text = "\n".join(block).strip()
        if text or title:
            out.append((title, text))
    return out


def _pack(units: list[str], glue: str) -> list[str]:
    """Greedily fill messages from `units`, joined by `glue`.

    A unit longer than the budget on its own comes back oversized, for the
    caller to break down further.
    """
    out: list[str] = []
    buffer: list[str] = []
    length = 0

    for unit in units:
        if buffer and length + len(unit) + len(glue) > BUDGET:
            out.append(glue.join(buffer))
            buffer, length = [], 0
        buffer.append(unit)
        length += len(unit) + len(glue)

    if buffer:
        out.append(glue.join(buffer))
    return out


def _split(piece: str) -> list[str]:
    """One oversized section, broken down as gently as it can be.

    **Three levels, and the order is the whole point.** Paragraphs first,
    because a blank line is where a reader already expects a pause. Then single
    lines, because section 6's schema list is one continuous run of bullets with
    no blank line anywhere in it, and a pager that only knew about paragraphs
    handed back a twelve thousand character message that Telegram would refuse.
    Then a hard cut, which only a single line longer than the budget can reach
    and which is still better than a message that never sends.

    A tag opened before a cut and closed after it would be markup Telegram
    rejects, so the hard cut is the one place this could produce that. It is
    reached only by a line with no whitespace in three thousand characters,
    which no page here has and which a fenced block would have to be to get
    there.
    """
    out: list[str] = []
    for chunk in _pack(piece.split("\n\n"), "\n\n"):
        if len(chunk) <= BUDGET:
            out.append(chunk)
            continue
        for line_chunk in _pack(chunk.split("\n"), "\n"):
            if len(line_chunk) <= BUDGET:
                out.append(line_chunk)
                continue
            out.extend(
                line_chunk[at : at + BUDGET] for at in range(0, len(line_chunk), BUDGET)
            )
    return out


def paginate(sections: list[tuple[str | None, str]]) -> list[str]:
    """Sections packed into messages, breaking on heading boundaries.

    **A heading is the preferred break and a paragraph is the fallback.** A
    section on its own longer than the budget still has to be sent, and splitting
    it mid sentence to keep the rule would be the rule beating the reader.
    """
    pages: list[str] = []
    current: list[str] = []
    size = 0

    def flush() -> None:
        nonlocal current, size
        if current:
            pages.append("\n\n".join(current).strip())
        current = []
        size = 0

    for title, text in sections:
        piece = f"<b>{html.escape(title)}</b>\n\n{text}".strip() if title else text
        if not piece:
            continue

        if len(piece) > BUDGET:
            flush()
            pages.extend(_split(piece))
            continue

        if size + len(piece) > BUDGET and current:
            flush()

        current.append(piece)
        size += len(piece) + 2

    flush()
    return pages or [""]
