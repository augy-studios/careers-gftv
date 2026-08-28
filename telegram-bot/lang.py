"""Which language a reply is written in.

**Not called `locale.py`, deliberately.** This directory is on `sys.path` ahead
of everything else, so a module of that name would be handed to any library that
imports the standard library's `locale`, which is most of them eventually. The
failure would arrive weeks later, inside somebody else's code, looking like
anything but a naming decision made here.

Section 15 says a bot message follows the language stored on the account, and
before anybody has linked anything there is no account to read. Settled
28 August 2026, phase 11 open decision 1: **fall back to the language the person
has their Telegram client set to.**

It is the only evidence there is at that moment, and the alternative is worse in
a specific way rather than merely blander. Somebody arriving from a QR code has
been reading the portal in 华文; answering them in English is the build
introducing itself in a language it has already agreed not to assume.

The mapping is by prefix against the locales the build actually ships in, which
come from `build-status.json` rather than a list here, so phase 15's Malay and
Tamil need no edit. `zh-hans`, `zh-CN`, `zh-SG` and bare `zh` all land on `zh`;
so does `zh-hant`, because the portal ships one Chinese and Singapore Mandarin
in simplified script is closer to a traditional reader than English is.

**The account wins the moment there is one.** This is a fallback, not a
preference, and part 2 is where the linked account's locale takes over.
"""

from __future__ import annotations

DEFAULT = "en"


def locale_for(language_code: str | None, supported: tuple[str, ...]) -> str:
    """Pick a shipped locale for a Telegram `language_code`.

    Telegram sends things like `en`, `en-GB`, `zh-hans`, or nothing at all.
    """
    if not supported:
        return DEFAULT

    fallback = DEFAULT if DEFAULT in supported else supported[0]
    if not language_code:
        return fallback

    code = language_code.strip().lower().replace("_", "-")
    if not code:
        return fallback

    # An exact match first, then the language subtag on its own, so `en-GB`
    # finds `en` without `e` ever matching anything.
    for candidate in supported:
        if code == candidate.lower():
            return candidate

    primary = code.split("-", 1)[0]
    for candidate in supported:
        if primary == candidate.lower().split("-", 1)[0]:
            return candidate

    return fallback
