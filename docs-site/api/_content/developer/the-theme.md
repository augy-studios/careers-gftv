---
title: The theme
access: developer
order: 6
summary: Two axes, the token contract, the loading primitives, and the rules that are not preferences.
---

# The theme

**`gftv-theme.md` at the repository root is the specification**, and its own
first lines say the canonical source is GFTV PolicySpot. So this repository's
copy is already a copy, and this page describes the rules and never reproduces
the file.

**The implementation is `main-site/assets/css/theme.css`**, which is committed
and is generated into `docs-site/` by `gen-docs-lib.js`. That file is the
practical reference. The tokens, every colour value and the measured contrast
ratios are all in it, or in the comments at the top of it.

> [!WARNING]
> `theme.css` is generated into both sites, so a token edit made for one of them
> lands on the other. Run `node tests/phase12-test.mjs --only=contrast` whenever
> it moves.

## Two axes

They combine freely, and both attributes are always present on `<html>` and
never on `<body>`.

| Axis | Attribute | Values |
|---|---|---|
| Colour theme | `data-color-theme` | `classic` (default), `hello` |
| Mode | `data-mode` | `light`, `dark` |
| Mode preference | `data-mode-preference` | `light` (default), `dark`, `time` |

That is four combinations, and every one of them is measured. Every colour block
selects on the first two attributes and on nothing else.

**`data-mode` is only ever `light` or `dark`.** A third value would match no
colour block and the page would render unstyled. Anything that is a rule for
picking a mode is a preference, and it resolves before it is written.

**`data-mode-preference` is read by no stylesheet.** It exists so the theme
modal can show the right button pressed after a reload. It is also what tells
"dark because you asked" from "dark because it is nine in the evening".

## The rules that are not preferences

- **No gradients, orbs or blobs.** Flat tints and glass surfaces only.
- **Card-like surfaces use `.glass-card`**, with `--glass-blur` and `--radius`.
  Smaller nested controls use `--surface-active` so they read one level above the
  card.
- **Never hardcode a colour in component CSS.** Reference a token, or it stops
  being correct in three of the four combinations.
- **Proxima Nova everywhere**, set once through `--font`. No per component
  `font-family`.
- **No emoji as icons.** Inline SVG, coloured with `currentColor`.
- **No em dashes**, in copy, in comments, or in documentation.
- **Light mode is the default**, and `prefers-color-scheme` is never read on
  first load. A reader opts into dark explicitly in the theme modal.
- **Every text pair meets WCAG AA** in all four combinations. Exactly two pairs
  are exempt and both are documented in the theme file with their scope. A new
  pair under the threshold is a bug and not a third exception.
- **Accent text and accent fills are different tokens.** Body sized accent text
  uses `--brand-text`; fills use `--brand-dark` with `--brand-on` for the label.
  Mixing them is what breaks contrast in the `hello` theme.
- **Everything that opens, closes or switches state animates**, at 150 to 220ms,
  honouring `prefers-reduced-motion`.
- **Radii come from `--radius` and `--radius-sm`**, never from a pixel value.

## The font

Proxima Nova is licensed and is not on Google Fonts, so it is self hosted under
`main-site/assets/fonts/`. That is also what the offline requirement needs. A
font on a third party host cannot be precached, and an installed copy of the
site would load unstyled.

**Only the regular weight is supplied.** It is the one `@font-face` declared,
and the browser synthesises the heavier weights. The blocks for medium, semibold
and bold are in `theme.css`, commented out. Drop the files in, uncomment the
matching block, and nothing else changes.

## The loading primitives

Three, because loading is not one situation.

| Primitive | For |
|---|---|
| `.spinner` | An action is in flight and the result has no shape yet. |
| `.skeleton` | Content is coming whose shape is already known. |
| `.delayed` | Wraps either, and shows nothing for the first 250ms. |

**The delay is the part most often left out.** A spinner that appears for 80ms
and vanishes reads as a flicker, and most same origin fetches finish inside
that. `animation-fill-mode: both` holds it at zero opacity through the delay, so
it needs no JavaScript and no timers.

**No shimmer sweep**, because the usual effect is a sliding gradient and
gradients are forbidden. A flat tint with an opacity pulse does the same job.

**Every one of them carries text for a screen reader.** An animation announces
nothing: pair a spinner with a label, put `aria-busy` on a container holding
skeletons, and give a live region `role="status"`.

**The spinner and the skeleton are the one exception to the reduced motion
rule.** They slow down instead of stopping, because a loading indicator that
does not move indicates nothing and a stopped spinner reads as a failed one.
`.delayed` drops its fade entirely. A third exception is almost certainly a bug.

## Links, and other shape conventions

**Links carry no underline in any state**, and a link inside body copy is one
weight step heavier than the text around it. That weight is what identifies it.

- `.glass-card`: `--radius`, with the `--glass-blur` backdrop.
- Chip style buttons are fully rounded; rectangular buttons and inputs use
  `--radius-sm`.
- Icon buttons are 40px square, and 32px with `.small`.
- One breakpoint in the theme file itself, at 480px. Layout is out of its scope.

## The theme control

`gftv-theme.md` prescribes the modal markup, so there is one implementation of
it: `main-site/assets/js/chrome-modals.js`, generated into this site by
`gen-docs-lib.js`. Both sites open the same two modals from the same two icon
buttons, `#themeButton` and `#languageButton`.

> [!NOTE]
> This site shipped for a phase with the token contract applied and the chrome
> half applied. It had a text button, a bare `<select>`, and `.icon-btn` styles
> it never used. Applying a theme is applying both halves.
