---
title: The official banner
access: developer
order: 5
summary: What the banner claims, what it must never claim, and why that file is the source and this page is the pointer.
---

# The official banner

**`gftv-official.md` at the repository root is the specification.** It is
portable across GFTV projects. It holds the behaviour, the copy in both
languages, the markup, the styling from the theme tokens, the responsive rules
and the accessibility notes.

**This page is the pointer, and that is deliberate.** The specification says so
outright for this file: treat it as the source and this page as the pointer.
Reproducing it here would make this site the third link in a chain, and the one
furthest from wherever the file is next updated.

## What it is

A slim, permanent, collapsible bar at the very top of every GFTV site. It states
that the site is official and teaches a reader how to check that themselves, and
it is modelled on the Singapore Government masthead.

It sits at the top of `<body>`, above the header and above everything else.

## Three things most likely to be softened by somebody in a hurry

**It cannot be dismissible.** No close control, no option to hide it, nothing
stored that suppresses it. A bar a reader can close is a bar they see once,
which defeats the education it exists for. Expanding it is remembered; hiding it
is not offered.

**It must never claim the site is safe or verified.** Any phishing site can copy
the banner exactly, in an afternoon. Its only real value is teaching the rule.
That knowledge is what protects somebody on the fake site, where the banner will
also be present and also lying.

**No link to a trusted sites page until that page exists.** A trust banner whose
link is a 404 is worse than one with no link at all.

## The rule it teaches

Official GFTV sites end with `globalfurry.tv` or `gftv.asia`. A domain is read
from the **end**, at the last dot before the first single slash.

| Address | Official |
|---|---|
| `careers.globalfurry.tv` | Yes |
| `docs.careers.globalfurry.tv` | Yes |
| `globalfurry.tv.example.com` | No |
| `globalfurry-tv.com` | No |
| `gftv.asia.login.example.net` | No |

**GFTV is a weaker case than the government one**, and the file says so. A
`.gov.sg` works as a signal because nobody outside the Singapore government can
hold one. These are ordinary domains that GFTV happens to own, so a lookalike is
a purchase away. That makes the "how to read a domain" half more important here,
and not less.

**Keep the domain list in one place per site**, and render the bar from it.
Adding a domain is then one edit and never a search through copy.

## Where it is

**It replaced the build notice**, per 0c, when the last phase shipped on 12
September 2026, phase 15 part 3. The phase notice was temporary and
dismissible; this one is permanent and is not. They occupy the same slot and
are never both present. `shell.js` draws the notice while a phase is building
and the banner once every phase reads `shipped`, in the same paint.

`main-site/assets/js/official-bar.js` is the implementation, and
`gen-docs-lib.js` copies it to this site, which mounts it below its skip link.
The domain list is the constant at the top of that file, the copy is in each
site's dictionary under `official.*`, and the styles are in `app.css` and
`docs.css` from theme tokens alone. Opening the panel is remembered per site,
in `localStorage`, because storage is per origin.

The trusted sites page exists now, at `https://gftv.asia/trusted-sites`, and
the domain point links to it. `tests/phase15-test.mjs --only=banner` opens the
portal in a browser twice, with the last phase shipped and with it building.
It checks the bar is there in one case and the notice in the other, along
with the rest of the file's acceptance list.

> [!NOTE]
> The banner was the same question the theme file asked: one implementation
> generated into both sites, or two. It got the answer everything else the
> two sites share has: one implementation, in `main-site/assets/js/`, copied
> across by `gen-docs-lib.js`.
