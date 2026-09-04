---
title: The multilingual layer
access: developer
order: 14
summary: Base rows and translation rows, is_ready, the dictionaries, why search differs by language, and what adding a language costs.
---

# The multilingual layer

**English lives on the base rows as the source language. Every other language is
a row in a translation table.** That is the whole shape of it, and section 3a of
the specification is the reference.

The portal is English and Simplified Chinese today, one shown at a time. Both
are complete: every posting, every interface string and the whole dashboard
exist in both.

## Content: two tables, one flag

| Piece | Where it lives |
|---|---|
| The source | The base row, in English, on `gftvjobs_jobs` and its friends |
| Every other language | A row in the matching translation table, keyed by locale |
| The active languages | `gftvjobs_locales` |

**A translation is shown only when `is_ready` is set**, so an unreviewed one can
sit in the table without going live.

**A posting may publish with no translation at all.** It reads in English with a
notice. A translation cannot be shown without at least a title.

**Slugs are never translated.** Tag and department slugs are URL identifiers,
and translating one breaks every shared link the moment somebody switches
language.

## Interface strings: two dictionaries

`main-site/assets/i18n/en.json` and `zh.json`, flat dotted keys, with a matching
pair on this site. Adding or changing a string:

1. **Add the key to both files.** English is the fallback layer, so a key missing
   from `zh.json` renders English. A key missing from `en.json` renders as the
   raw key.
2. Reference it with `data-i18n` for text, `data-i18n-attr` for an attribute, or
   `data-i18n-html` for a string containing a link.
3. **Leave the English in the markup** as the element's own content. It is the
   fallback with no JavaScript, and what shows before the dictionary resolves.
4. `{placeholders}` must match between the two files.
5. Run `node check-i18n.js`.

> [!WARNING]
> `data-i18n-html` is safe only because every string it renders comes from these
> files. Never point it at anything a user can write.

**A missing key renders as its own name on screen**, in both languages. That
fallback is deliberate, because a missing string should degrade to something
searchable and not to a blank element. It is also how a key sat in the footer
for eleven phases reading as its own name.

Two things catch it, and neither catches the other failure. `check-i18n.js`
reads every attribute and every literal call and exits non-zero on a key not in
`en.json`. `t()` warns to the console once per key. **What neither sees is a
string written by JavaScript before the dictionary loads.** Anything calling
`t()` outside the translation pass has to redraw on the locale change event.

## The Chinese is Singapore Mandarin

GFTV is a Singapore organisation, and the document is tagged `zh-Hans-SG`. The
vocabulary rules are the ones a Singapore reader expects, and they are listed
with examples on [the Singapore Mandarin
page](/translations/singapore-mandarin) in the translations guide.

**Do not check new copy against that list by hand.** The list itself is `USAGE`
in `gen-review.js`, and that is the only copy. The review page's brief is
written from it. `node check-copy.js` measures every string in the build against
it, and `tests/phase12-test.mjs --only=zh` measures the rest.

**Each reader's own system font draws the Chinese.** No CJK face is named in
`theme.css`, so Han characters fall past the Latin families to the platform
default.

> [!DANGER]
> What makes that correct is the `lang` attribute and not the font stack. Han
> characters are shared with Japanese. A browser with no language to go on may
> pick a Japanese face that draws a number of them differently. Every page
> sets `lang="zh-Hans-SG"` in the pre-paint script. If that ever stops being set,
> the Chinese renders with the wrong glyph forms and nothing else looks broken.

## The language is not in the URL

It lives in `localStorage`, and that has three consequences worth knowing before
somebody reports one as a bug:

- **A shared link opens in the recipient's stored language.**
- **Search engines only ever see English**, so the sitemap and the structured
  data describe English only.
- **Link embeds are always English**, because a crawler has no `localStorage` to
  read. The same is true of the install manifest.

## Search differs by language, and has to

**Postgres cannot segment Han script.** A run of Han characters is one token to
`to_tsvector`, so searching for part of a word never matches. The extensions
that fix it are not available on Supabase.

| Language | How it matches | What a reader gets |
|---|---|---|
| English | The weighted `tsvector` from migration `009` | Ranked by relevance, with a highlighted snippet |
| Everything else | Trigram matching on the generated `search_text` column | Everything containing what was typed, ordered by title closeness |

**Both work, and only English ranks well.** That is written down in
`migrations/README.md` in full, because it looks like a defect from the outside.

## What adding a language costs

**A row in `gftvjobs_locales`, a dictionary file, and the content itself.** No
migration and no schema change.

What is not free is everything around it:

- Every interface string, in both sites' dictionaries, at key parity.
- Every posting, department and tag translation somebody has to write.
- A read through by somebody who reads that language, which is what
  `node gen-review.js` builds a page for.
- **The service worker precaches the dictionaries**, so a new language is a
  change to what is cached and a `VERSION` bump with it.

## The review page

```sh
node gen-review.js
```

It writes `zh-review.html`, every Chinese string in the build beside its
English, for a fluent reader to go through. That is the dictionaries, the seeded
departments and tags, the hero copy, the phase list, and the bot's messages and
profile text.

**It also fails on any file shipping Han characters that is on neither of its
lists.** The next file putting Chinese in front of a reader cannot quietly miss
the round trip. Its output is gitignored: regenerate it instead of committing
it.

It reads the bot's strings by importing the Python and never by parsing it, so
it needs Python on the path.
