"""The guides, read from Supabase and rendered for a chat window.

Phase 14 part 10. `/docs` browses the documentation site with inline buttons and
sends a page as formatted text in the reader's own language. Phase 15 part 2
made the page a rich message: its headings are headings, its tables are tables
and its callouts are quotes, drawn by the client, with a plain text half beside
them for a client that cannot. `reply.py` says what a rich message is.

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
cannot render. The cap is measured on the plain half, which is the one that
goes in the request's `message` field and is the one the limit is stated for.

Pages break on heading boundaries, so a page break never lands mid sentence, and
each carries a "2 of 5" and a pager that says which part it is on. A single section longer than the
budget is split again on paragraph boundaries, because a heading with four
thousand characters under it has to go somewhere.

---------------------------------------------------------------------------
What it renders, and what it refuses to pretend it rendered
---------------------------------------------------------------------------

Bold, italic, code, links, block quotes, tables, callouts and tabbed blocks
are all drawn now. An image is not, and **a block silently dropped is a
procedure with a step missing**, so it is still one line saying what is there,
with a link to that page on the site where DOCS_URL is set. The other three
notes in `strings.py` stay for a container this does not recognise.
"""

from __future__ import annotations

import html
import re

from reply import code_block, from_html, heading, join_rich, quote, rich, table

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


def render(body: str, *, note, base: str | None = None) -> list[tuple[str | None, int, dict]]:
    """A page's markdown as a list of `(heading, level, part)` sections.

    `note` builds the one line that replaces a block this cannot draw. It takes
    a kind and returns a sentence, so the wording stays in `strings.py` and this
    file holds no copy in either language. `base` is the docs site's own origin,
    used to make a relative link absolute.

    Each part is a rich reply, both halves, built block by block so the two
    halves break in the same places and can be paged together.

    The front matter is not here: the view stores title, summary and body as
    three columns, so what arrives is already the body alone.

    **Lines inside a paragraph are joined, not kept.** These files are wrapped at
    eighty columns, and sending them line for line puts a ragged column of short
    lines in a chat that is already narrow. `markdown.js` learned this on the
    site and states it in as many words; this is the same rule for the same
    files, arriving at the other reader.
    """
    lines = body.replace("\r\n", "\n").split("\n")
    sections: list[tuple[str | None, int, list]] = [(None, 0, [])]
    _render_lines(lines, sections, note, base)

    out: list[tuple[str | None, int, dict]] = []
    for title, level, blocks in sections:
        part = _join_blocks(blocks)
        if part["fallback"].strip() or title:
            out.append((title, level, part))
    return out


def _join_blocks(blocks: list) -> dict:
    """Blocks joined line by line, a blank marker being a paragraph break."""
    md: list[str] = []
    plain: list[str] = []
    for block in blocks:
        if block == "":
            md.append("")
            plain.append("")
        else:
            md.append(block["markdown"])
            plain.append(block["fallback"])
    # A tab's own trailing break next to the block's is two breaks, and two
    # breaks in a row is a gap no page asked for.
    return rich(
        re.sub(r"\n{3,}", "\n\n", "\n".join(md)).strip("\n"),
        re.sub(r"\n{3,}", "\n\n", "\n".join(plain)).strip("\n"),
    )


def _render_lines(lines: list[str], sections: list, note, base: str | None) -> None:
    """Walk a run of markdown lines, appending blocks to the open section.

    Called once for the page and once per tab of a tabbed block, whose lines are
    rendered the same way under the tab's own bold title.
    """
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        # A fenced block goes across whole, inside a fence, because a command
        # with its indentation removed is a command that does not run.
        if _FENCE.match(line):
            index += 1
            block: list[str] = []
            while index < len(lines) and not _FENCE.match(lines[index]):
                block.append(lines[index])
                index += 1
            index += 1  # the closing fence
            sections[-1][2].append(code_block("\n".join(block)))
            continue

        found = _HEADING.match(line)
        if found:
            # h1 is the page title, which the caller already has from the view's
            # own column, so it never opens a section of its own.
            if len(found.group(1)) == 1:
                index += 1
                continue
            sections.append((found.group(2).strip(), len(found.group(1)), []))
            index += 1
            continue

        # A table is a header row, an alignment rule, and its body. It is
        # recognised the same way the site's renderer recognises it, and drawn
        # as one since phase 15 part 2: the rich half is the pipe table itself
        # and the plain half is a line per row.
        if "|" in stripped and index + 1 < len(lines) and re.match(
            r"^\s*\|?[\s:|-]+\|[\s:|-]*$", lines[index + 1]
        ):
            rows: list[list[str]] = []
            while index < len(lines) and "|" in lines[index]:
                rows.append(_cells(lines[index]))
                index += 1
            headers = [from_html(inline(cell, base)) for cell in rows[0]]
            body = [[from_html(inline(cell, base)) for cell in row] for row in rows[2:]]
            sections[-1][2].append(table(headers, body))
            continue

        if stripped.startswith(":::tabs"):
            index += 1
            tabs: list[tuple[str, list[str]]] = []
            while index < len(lines) and not lines[index].strip().startswith(":::"):
                flat = lines[index].strip()
                if flat.startswith("::tab"):
                    tabs.append((flat[len("::tab") :].strip(), []))
                elif tabs:
                    tabs[-1][1].append(lines[index])
                index += 1
            index += 1
            if not tabs:
                sections[-1][2].append(from_html(note("tabs")))
                continue
            # Each tab is its own run of lines under its own bold title, which
            # is what the site's tab strip labels it with.
            for title, tab_lines in tabs:
                sections[-1][2].append(from_html(f"<b>{html.escape(title)}</b>"))
                _render_lines(tab_lines, sections, note, base)
                sections[-1][2].append("")
            continue

        if stripped.startswith(":::"):
            index += 1
            while index < len(lines) and not lines[index].strip().startswith(":::"):
                index += 1
            index += 1
            sections[-1][2].append(from_html(note("block")))
            continue

        image = _IMAGE.match(stripped)
        if image:
            sections[-1][2].append(from_html(note("image")))
            index += 1
            continue

        # A callout is its marker line and the quoted lines under it, drawn as
        # one quote with the kind as its first line in bold. A plain quote is
        # the same without the label.
        if stripped.startswith(">"):
            label = None
            callout = _CALLOUT.match(stripped)
            if callout:
                label = callout.group(1).title()
                index += 1
            quoted = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quoted.append(lines[index].strip().lstrip(">").strip())
                index += 1
            inner = [from_html(f"<b>{html.escape(label)}</b>")] if label else []
            joined = " ".join(q for q in quoted if q)
            if joined:
                inner.append(from_html(inline(joined, base)))
            if inner:
                sections[-1][2].append(quote(join_rich(inner, "\n")))
            continue

        if stripped == "":
            sections[-1][2].append("")
            index += 1
            continue

        bullet = _BULLET.match(line)
        if bullet:
            indent = "  " if len(bullet.group(1)) >= 2 else ""
            item = from_html(inline(bullet.group(2), base))
            sections[-1][2].append(
                rich(f"{indent}- {item['markdown']}", f"{indent}• {item['fallback']}")
            )
            index += 1
            continue

        number = _NUMBER.match(line)
        if number:
            indent = "  " if len(number.group(1)) >= 2 else ""
            item = from_html(inline(number.group(3), base))
            sections[-1][2].append(
                rich(
                    f"{indent}{number.group(2)}. {item['markdown']}",
                    f"{indent}{number.group(2)}. {item['fallback']}",
                )
            )
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

        sections[-1][2].append(from_html(inline(" ".join(paragraph), base)))


def _cells(row: str) -> list[str]:
    """A table row's cells, the outer pipes and the padding dropped."""
    trimmed = row.strip()
    if trimmed.startswith("|"):
        trimmed = trimmed[1:]
    if trimmed.endswith("|"):
        trimmed = trimmed[:-1]
    return [cell.strip() for cell in trimmed.split("|")]


def _pack(units: list[dict], glue: str) -> list[dict]:
    """Greedily fill messages from `units`, joined by `glue`, both halves alike.

    The budget is measured on the plain half, which is the one Telegram's cap
    is stated for. A unit longer than the budget on its own comes back
    oversized, for the caller to break down further.
    """
    out: list[dict] = []
    buffer: list[dict] = []
    length = 0

    for unit in units:
        if buffer and length + len(unit["fallback"]) + len(glue) > BUDGET:
            out.append(join_rich(buffer, glue))
            buffer, length = [], 0
        buffer.append(unit)
        length += len(unit["fallback"]) + len(glue)

    if buffer:
        out.append(join_rich(buffer, glue))
    return out


def _split_both(piece: dict, glue: str) -> list[dict] | None:
    """Both halves split on `glue`, when they break into the same number of pieces.

    They do for paragraphs, since every block contributes one to each half. They
    may not for lines, since a table's markdown carries two rows its plain text
    does not, and then the caller goes on to the next level down.
    """
    md = piece["markdown"].split(glue)
    plain = piece["fallback"].split(glue)
    if len(md) != len(plain):
        return None
    return [rich(m, p) for m, p in zip(md, plain)]


def _split(piece: dict) -> list[dict]:
    """One oversized section, broken down as gently as it can be.

    **Three levels, and the order is the whole point.** Paragraphs first,
    because a blank line is where a reader already expects a pause. Then single
    lines, because section 6's schema list is one continuous run of bullets with
    no blank line anywhere in it, and a pager that only knew about paragraphs
    handed back a twelve thousand character message that Telegram would refuse.
    Then a hard cut, which only a single line longer than the budget can reach
    and which is still better than a message that never sends.

    The hard cut is the one place the two halves can part company: the plain
    half is cut at the budget and the rich half at the same fraction of its own
    length, which is reached only by a line with no whitespace in three
    thousand characters, which no page here has.
    """
    out: list[dict] = []
    for chunk in _pack(_split_both(piece, "\n\n") or [piece], "\n\n"):
        if len(chunk["fallback"]) <= BUDGET:
            out.append(chunk)
            continue
        # The line level, when the halves agree on where the lines are; the
        # plain half decides, `chunk.split("\n")` over its lines.
        by_line = _split_both(chunk, "\n") or [chunk]
        for line_chunk in _pack(by_line, "\n"):
            if len(line_chunk["fallback"]) <= BUDGET:
                out.append(line_chunk)
                continue
            plain = line_chunk["fallback"]
            md = line_chunk["markdown"]
            ratio = len(md) / max(1, len(plain))
            for at in range(0, len(plain), BUDGET):
                out.append(rich(md[int(at * ratio) : int((at + BUDGET) * ratio)], plain[at : at + BUDGET]))
    return out


def paginate(sections: list[tuple[str | None, int, dict]]) -> list[dict]:
    """Sections packed into messages, breaking on heading boundaries.

    **A heading is the preferred break and a paragraph is the fallback.** A
    section on its own longer than the budget still has to be sent, and splitting
    it mid sentence to keep the rule would be the rule beating the reader.

    Each page is a rich reply. The heading is drawn at its own level, under the
    page title the caller puts above everything.
    """
    pages: list[dict] = []
    current: list[dict] = []
    size = 0

    def flush() -> None:
        nonlocal current, size
        if current:
            pages.append(join_rich(current, "\n\n"))
        current = []
        size = 0

    for title, level, part in sections:
        piece = join_rich([heading(html.escape(title), max(2, level)), part]) if title else part
        if not piece["fallback"].strip():
            continue

        if len(piece["fallback"]) > BUDGET:
            flush()
            pages.extend(_split(piece))
            continue

        if size + len(piece["fallback"]) > BUDGET and current:
            flush()

        current.append(piece)
        size += len(piece["fallback"]) + 2

    flush()
    return pages or [rich("", "")]
