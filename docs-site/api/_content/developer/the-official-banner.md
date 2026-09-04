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

## When it lands here

**It replaces the build notice**, per 0c, when the last phase ships. The phase
notice is temporary and dismissible; this one is permanent and is not. They
occupy the same slot and must never both be present, because two stacked bars
above the header is worse than either alone.

Until then, this portal ships the phase notice and nothing else. See [phases and
build status](/staff/developer/phases-and-build-status).

> [!NOTE]
> The banner is the same question the theme file asks: one implementation
> generated into both sites, or two. This build's answer for everything else it
> shares has been one implementation, in `main-site/assets/js/`, copied across by
> `gen-docs-lib.js`.
