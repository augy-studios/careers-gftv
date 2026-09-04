---
title: Conventions worth not relearning
access: developer
order: 16
summary: No framework, no build step, the house style, the four checkers, and the rule about prompting instead of choosing.
---

# Conventions worth not relearning

Everything on this page was learned by getting it wrong once. If you read one
page of this guide, read this one.

## The stack rules

**No framework, and no build step on the portal.** Plain HTML, CSS and
JavaScript, ES modules, served as they are. The documentation site's build is
the single stated exception and it uses Node built-ins only, with no dependency
of any kind.

**Inline SVG, never emoji**, coloured with `currentColor`. **No gradients, orbs
or blobs.** Both are the theme file's rules and they apply to anything anybody
adds.

**No em dashes**, anywhere: copy, comments, and documentation. Use a comma, a
semicolon, a colon or a full stop.

**Never hardcode a colour.** Reference a token, or it stops being correct in
three of the four theme combinations.

## The house style in copy

**One banned phrase, and it applies to every English string a reader can see.**
That is the dictionaries, the pages, the phase list, `llms.txt`, and every
string in the bot's Python including its profile text.

> [!WARNING]
> **One two word phrase meaning "in preference to" is banned.** Run `node
> check-copy.js --list` to see it. The seven alternatives are: instead of, in
> place of, as opposed to, over, in preference to, without, and not.

The rule is enforced over these pages too, which is why this one names the
phrase by describing it. The script is the copy of the rule that matters.

Source comments, the READMEs and the migrations are not copy and are left alone.

**Sentences are capped at 25 words** in everything a reader meets. The cap was
chosen by measuring: when it arrived, the whole portal dictionary held seven
sentences over it. The portal's own average is under seven words, so the cap is
not the target.

**Name the technical term, then explain it.** Passkey, recovery code, two
factor, cooldown: keep the word, because it is the word on the button and in the
browser's own prompt. Give it a plain explanation where the reader first meets
it. Replacing the term leaves the page and the screen saying different things.

`node check-copy.js` enforces all of it over eight sources, and `--list` prints
what it reads.

## The four checkers

None needs a credential, a database or a network. **Run them before a push.**

| Command | What it catches |
|---|---|
| `node check-i18n.js` | A key that would render as its own name on screen. |
| `node check-copy.js` | A banned phrase, an overlong sentence, and the Chinese vocabulary rules. |
| `node check-precache.js` | A precache entry that is not on disk, on both sites. |
| `node gen-docs-lib.js --check` | A change that landed in one copy of a shared module only. |

Two more before a documentation deploy: `node docs-site/scripts/build.js`, which
is also the deploy, and `node docs-site/scripts/embed-tests.mjs --check
docs-site/api/_content/developer/test-scripts.json`.

And `node gen-review.js`, which fails on any file shipping Han characters that is
on neither of its lists.

## The things that fail silently

Each of these has a page in this guide, and each is here because the failure is
invisible until somebody reports something strange.

- **A `VERSION` that was not bumped.** Returning readers keep the old build. See
  [the service worker](/staff/developer/the-service-worker).
- **A generated copy that was not regenerated.** A fix lands on one site and not
  the other, months apart. See [Vercel](/staff/developer/vercel).
- **A rewrite checked locally.** The filesystem wins over rewrites on the
  platform and does not locally.
- **A `lang` attribute that stopped being set.** The Chinese renders with
  Japanese glyph forms and nothing else looks broken.
- **A second copy of a rule.** The worker's queue verdict, the pre-paint theme
  constants, and the bot's tier logic are each a second copy on purpose. Each has
  a check whose only job is to catch the pair drifting.

## Checked copies

**A copy nothing compares is the copy that goes stale.** Where this build could
not avoid writing something twice, the second copy is compared by a script:

| The copy | What compares it |
|---|---|
| The bot's command list, in three documents | `python commands.py --check` |
| The Apps Script steps, in the dashboard and a guide | `phase14-test.mjs --only=guide` |
| The access rule, in two modules and a guide | `phase14-test.mjs --only=admin-guide` |
| Every shared module, on two sites | `gen-docs-lib.js --check` |
| Every script in `tests/`, in this guide | `embed-tests.mjs --check` |

**Prefer no second copy at all.** These exist because the alternative was worse,
and each one's reason is written beside it.

## Nothing hardcodes a phase number

**One file decides what has shipped**, and everything reads it. That rule has
been broken exactly once, by a test file listing which features were unbuilt.
Three checks then reported a build that had moved on as a defect.

**A test naming which features are unbuilt is that mistake wearing a different
hat.** Read the state off the page and skip with a sentence when there is
nothing to check.

## Prompt with options instead of choosing

**Where the specification and anything else disagree, ask.** The brief says so
in its seventh line.

Offer concrete options, say which one you would choose and why in one line, and
let the person who owns the project pick. Do not write an open ended question
and wait.

**That habit is why the working memo can be read back.** Every decision in it
has the declined alternatives written beside it. That is the only thing making a
decision reviewable a year later.

## Two habits that are part of the work

**Update the README in the same change.** A README goes stale the moment it
stops matching the code. A stale one is worse than none, because it is read with
the same trust as a current one.

**Write the memo entry as you go.** `next-steps.md` is rewritten at the start and
the end of every phase, and a deviation recorded later is a deviation half
remembered. See [the working memo](/staff/developer/the-working-memo).
