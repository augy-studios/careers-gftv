# GFTV theme system reference (portable)

Canonical source: GFTV PolicySpot. This file is the drop-in spec for every
other GFTV PWA (HelloQueue, HelloTrace, HelloShare, GFTV Forms, FURST, the
gftv.asia portal). Copy it into the repo as `gftv-theme.md` or paste it into
the Claude Code prompt and follow it exactly. Update this file when the
canonical implementation changes.

This borrows the *architecture* and the *contrast rules* from the uwuapps
theme system and none of its palette. GFTV keeps its own colours, its own
token names, and Inter. Do not import Jua, `.glass`, `--ink`, or the seven
pastel swatches.

Two independent axes that combine freely:
**colour theme** (`data-color-theme` on `<html>`) and
**mode** (light/dark, `data-mode` on `<html>`).

## What changes

Today GFTV apps have a single axis: `data-theme` on `<body>`, with values
that mix colour identity and lightness together (`light`, `hello`).

| Axis | Attribute | Values |
|---|---|---|
| Colour theme | `data-color-theme` | `classic` (default), `hello` |
| Mode | `data-mode` | `light`, `dark` |

Both attributes are always present, both on `<html>`, not `<body>`. Every
colour block selects on both.

For PolicySpot that is 2 colour themes x 2 modes = 4 combinations. Other
GFTV repos may define a different set. Carry forward whatever that repo
already states; do not invent new brand colours anywhere.

## Non-negotiable rules

- **No gradients, orbs, or blobs.** Flat tints and glass surfaces only.
- **Glassmorphism, not flat cards.** Card-like surfaces use the
  `.glass-card` primitive with `--glass-blur` and `--radius`. Smaller
  nested controls (buttons, chips, badges) use `--surface-active` so they
  read one level above the card.
- **Never hardcode a colour in component CSS.** Reference a token so it
  stays correct in every combination.
- **Font is Inter everywhere**, loaded via the existing `@import` and set
  once through `--font`. No per-component `font-family`.
- **No emoji as icons.** Inline SVG, coloured with `currentColor`.
- **No em dashes** in UI copy, code comments, or docs. Use a comma,
  semicolon, colon, or period.
- **Light mode is the default.** Do not read `prefers-color-scheme` on
  first load. Users opt into dark explicitly in the theme modal.
- **Every text pair meets WCAG AA** in all four combinations: 4.5:1 for
  body text, 3:1 for large text (18.66px bold or 24px and up) and for UI
  boundaries that carry meaning. The audit table below lists the measured
  ratio for every pair. Exactly two pairs are exempt, both listed under
  Documented exceptions with their scope. A new pair under 4.5:1 is a bug,
  not a third exception.
- **Accent text and accent fills are different tokens.** Body-size accent
  text uses `--brand-text`. Accent fills use `--brand-dark`, with
  `--brand-on` for the label sitting on them. Mixing these is what breaks
  contrast in the `hello` theme.
- **Everything that opens, closes, or switches state animates**, 150 to
  220ms. Show and hide is a single `.hidden` class flip in JS; timing
  lives in CSS. Honour `prefers-reduced-motion: reduce`.
- **Radii come from `--radius` and `--radius-sm`**, not fixed pixel values.
- Layout, header height, and sidebar behaviour are out of scope.

## Token contract

Token **names stay exactly as they are**. Hundreds of declarations depend
on them and renaming buys nothing:

`--brand`, `--brand-dark`, `--brand-text`, `--bg`, `--bg-alt`,
`--surface`, `--surface-hover`, `--surface-active`, `--border`,
`--border-strong`, `--text`, `--text-muted`, `--text-light`, `--shadow`,
`--glass-blur`, `--radius`, `--radius-sm`, `--font`

Roles worth stating, since three of these are misleading:

- `--brand` is the swatch identity colour, the one shown on the dot in the
  theme modal. Same value in both modes. Display only, no text ever sits
  on it, so it needs no paired foreground.
- `--brand-dark` is not "a dark colour", it is **the primary accent fill**,
  used around 37 times. In dark mode it gets lighter, not darker. It is no
  longer the accent *text* colour; see `--brand-text` below.
- `--brand-text` was defined and never used. It now has a job: **accent
  text at body size**, headings, and active-state labels sitting on a page
  or card background. This is what fixes `hello` light, where
  `--brand-dark` (`#9e8800`) reaches 3.41:1 on `--bg` and 2.88:1 on a
  nested surface, both short of AA for body text. Accent text on a
  background is `--brand-text`; text on an accent fill is `--brand-on`.
- `--brand-mid` is defined, never used, and has no role in the new model.
  Drop it rather than carry a dead token. See open question 3.

### New tokens to add

| Token | Why |
|---|---|
| `--brand-on` | foreground on `--brand-dark` fills. Six rules currently hardcode `color: white`, which breaks the moment `--brand-dark` becomes a light tint in dark mode. |
| `--brand-dark-hover` | the hover step above `--brand-dark`, derived rather than picked, so it stays correct in both modes. |
| `--text-muted-strong` | secondary text sitting on `--surface-active`. Plain `--text-light` drops to 3.74:1 there in dark mode, since the stacked overlays lighten the backdrop. |
| `--link`, `--link-visited` | `:link { color: #EF3340 }` and `:visited { color: #66f }` sit outside the token system. Note `:link` at (0,1,0) beats `a { color: var(--brand-dark) }` at (0,0,1), so in-content links are GFTV red today, not the accent. That is current behaviour and the new tokens preserve it. |
| `--danger`, `--danger-hover`, `--danger-on`, `--ok`, `--warn` | `.btn-danger` hardcodes `#c0392b` / `#a93226`, plus `#c62828` and `#8a2a2a` elsewhere. Status colours belong on one definition. |
| `--callout-danger-bg`, `--callout-ok-bg` | the `rgba(200,60,60,...)` and `rgba(60,180,60,0.15)` callout tints, now derived from the status tokens at 14%. |
| `--glass-highlight` | the inset `rgba(255,255,255,0.6)` highlight inside `.glass-card` reads as a white scar on dark surfaces. |
| `--focus-ring` | every border token lands under 3:1 in every combination, so focus indicators cannot rely on `--border-strong`. |

## Structure of the token blocks

```css
/* structural tokens, no colour, no axis */
:root {
  --glass-blur: 16px;
  --radius: 14px;
  --radius-sm: 8px;
  --font: 'Inter', sans-serif;
}

/* one block per colour theme x mode combination */
:root[data-color-theme="classic"][data-mode="light"] { ... }
:root[data-color-theme="classic"][data-mode="dark"]  { ... }
:root[data-color-theme="hello"][data-mode="light"]   { ... }
:root[data-color-theme="hello"][data-mode="dark"]    { ... }
```

Both attributes go in every selector. That keeps specificity uniform at
(0,3,0) and removes any dependence on source order. A pre-paint script
guarantees both attributes exist before first paint, so there is no
attribute-missing fallback to reason about.

The default colour theme is renamed from `light` to `classic`, since
`light` now means a mode.

## Colour values

Brand values below are carried over verbatim. Nothing in the established
GFTV palette changes. The tokens that move are the ones that were never
brand colours to begin with: links, status colours, and the foregrounds
that were hardcoded to `white`.

### classic, light

```css
--brand: #ffffff;
--brand-dark: #4a6a8a;
--brand-text: #1a3a5a;
--brand-on: #ffffff;
--bg: #ffffff;
--bg-alt: #f5f5f5;
--surface: rgba(255, 255, 255, 0.6);
--surface-hover: rgba(245, 245, 245, 0.8);
--surface-active: rgba(235, 235, 235, 0.95);
--border: rgba(180, 190, 200, 0.4);
--border-strong: rgba(140, 155, 170, 0.6);
--text: #1a1a2e;
--text-muted: #4a5568;
--text-light: #6b7280;
--shadow: rgba(100, 120, 140, 0.12);
--glass-highlight: rgba(255, 255, 255, 0.6);
--link: #EF3340;
--link-visited: #4b4bd6;
--danger: #b03325;
--danger-hover: #8a2a2a;
--danger-on: #ffffff;
--ok: #177038;
--warn: #8a5200;
```

### hello, light

```css
--brand: #fedc00;
--brand-dark: #9e8800;
--brand-text: #3a3000;
--brand-on: #ffffff;
--bg: #fffde0;
--bg-alt: #fff9c4;
--surface: rgba(254, 220, 0, 0.35);
--surface-hover: rgba(254, 220, 0, 0.55);
--surface-active: rgba(254, 220, 0, 0.7);
--border: rgba(200, 170, 0, 0.3);
--border-strong: rgba(160, 130, 0, 0.5);
--text: #2e2800;
--text-muted: #5a4e00;
--text-light: #7a6c00;
--shadow: rgba(160, 130, 0, 0.15);
--glass-highlight: rgba(255, 255, 255, 0.5);
--link: #EF3340;
--link-visited: #4b4bd6;
--danger: #b03325;
--danger-hover: #8a2a2a;
--danger-on: #ffffff;
--ok: #177038;
--warn: #8a5200;
```

### classic, dark

Dark mode has never existed in GFTV, so these values are new. They are
derived from the colours GFTV already states (the `#4a6a8a` blue-grey
family and the `#fedc00` yellow), not invented from scratch. Signed off,
treat as canonical.

Derivation used:
- `--brand` keeps the swatch identity, unchanged across modes.
- `--brand-dark` flips to a light tint of the same hue so it reads as an
  accent fill on a dark background.
- `--brand-text` becomes a lighter tint of the same hue for accent text.
- `--brand-on` flips to a dark ink, since it now sits on a light fill.
- Neutral surfaces become low-opacity white overlays, tinted with the
  swatch hue where the light theme was already tinted.
- Text ramps invert: near-white primary, two muted steps down.

```css
--brand: #ffffff;
--brand-dark: #8fb0cf;
--brand-text: #cfe0f0;
--brand-on: #10161d;
--bg: #0f1317;
--bg-alt: #161b21;
--surface: rgba(255, 255, 255, 0.06);
--surface-hover: rgba(255, 255, 255, 0.10);
--surface-active: rgba(255, 255, 255, 0.14);
--border: rgba(160, 180, 200, 0.18);
--border-strong: rgba(160, 180, 200, 0.32);
--text: #eceff3;
--text-muted: #a7b2be;
--text-light: #7d8794;
--shadow: rgba(0, 0, 0, 0.5);
--glass-highlight: rgba(255, 255, 255, 0.08);
--link: #ff6b74;
--link-visited: #a9a9ff;
--danger: #ff8a80;
--danger-hover: #ffb3ac;
--danger-on: #1a0f0e;
--ok: #6ee7a0;
--warn: #fbbf24;
```

### hello, dark

```css
--brand: #fedc00;
--brand-dark: #fedc00;
--brand-text: #ffe873;
--brand-on: #2e2800;
--bg: #14120a;
--bg-alt: #1c1a0e;
--surface: rgba(254, 220, 0, 0.10);
--surface-hover: rgba(254, 220, 0, 0.16);
--surface-active: rgba(254, 220, 0, 0.22);
--border: rgba(254, 220, 0, 0.20);
--border-strong: rgba(254, 220, 0, 0.36);
--text: #f5f0dc;
--text-muted: #c4ba8e;
--text-light: #9a9270;
--shadow: rgba(0, 0, 0, 0.55);
--glass-highlight: rgba(255, 255, 255, 0.06);
--link: #ff6b74;
--link-visited: #a9a9ff;
--danger: #ff8a80;
--danger-hover: #ffb3ac;
--danger-on: #1a0f0e;
--ok: #6ee7a0;
--warn: #fbbf24;
```

## Derived tokens

These resolve against the per-combination blocks above, so they stay
correct in all four without being restated four times.

```css
:root {
  /* Hover step above --brand-dark, both modes. */
  --brand-dark-hover: color-mix(in srgb, var(--brand-dark) 85%, var(--text));
  /* Secondary text on --surface-active. */
  --text-muted-strong: color-mix(in srgb, var(--text) 70%, transparent);
  /* Callout tints, 14% of the status colour. */
  --callout-danger-bg: color-mix(in srgb, var(--danger) 14%, transparent);
  --callout-ok-bg: color-mix(in srgb, var(--ok) 14%, transparent);
  --callout-warn-bg: color-mix(in srgb, var(--warn) 14%, transparent);
  /* Focus indicator. Border tokens are all under 3:1, brand-dark is not. */
  --focus-ring: var(--brand-dark);
}
```

The status colours are tuned so each reads at or above 4.5:1 against a 14%
tint of itself, which is the standard callout and badge treatment:

```css
.callout.danger {
  background: var(--callout-danger-bg);
  color: var(--danger);
}
```

Measured on that pattern: danger 5.02 light and 6.52 dark, ok 5.02 light
and 8.94 dark, warn 5.21 light and 8.47 dark. The previous `#c0392b` sat
at 4.40 against its own tint, which is the reason for the small shift to
`#b03325`.

Any fill that tracked the colour theme before the mode axis existed must
still track it after. If a surface changed colour when the user switched
between `classic` and `hello`, it keeps doing that in both light and dark.
The `hello` surface tokens are already brand tints, so this holds as long
as component CSS points at `--surface` and friends rather than a hex.

## WCAG audit

Measured against the values above. Body text target 4.5:1, large text and
meaningful UI boundaries 3:1.

| Pair | classic light | hello light | classic dark | hello dark |
|---|---|---|---|---|
| `--text` on `--bg` | 17.06 | 14.35 | 16.17 | 16.40 |
| `--text-muted` on `--bg` | 7.53 | 8.07 | 8.66 | 9.60 |
| `--text-light` on `--bg` | 4.83 | 5.13 | 5.12 | 6.00 |
| `--text-light` on stacked `--surface-active` | 4.83 | 4.33 | **3.74** | **3.76** |
| `--text-muted-strong` on stacked `--surface-active` | 6.28 | 5.03 | 6.63 | 5.95 |
| `--brand-text` on `--bg` | 11.69 | 12.72 | 13.83 | 15.21 |
| `--brand-dark` on `--bg` (as a fill, 3:1 target) | 5.65 | 3.41 | 8.24 | 13.79 |
| `--brand-on` on `--brand-dark` | 5.65 | **3.51** | 8.04 | 10.88 |
| `--link` on `--bg` | **4.02** | **3.91** | 6.76 | 6.79 |
| `--link-visited` on `--bg` | 6.41 | 6.22 | 8.71 | 8.75 |
| `--border-strong` on `--bg` | 1.78 | 1.78 | 1.97 | 2.76 |

Four consequences, each of which is a rule rather than a note:

1. **`--text-light` never carries meaning on a nested control.** It fails
   AA on `--surface-active` in both dark themes. Use `--text-muted-strong`
   for placeholders, chip labels, badge captions, and icon-button glyphs
   that sit on `--surface-active`. Set `opacity: 1` on placeholders using
   it; a stacked opacity multiplier puts the pair back under AA.
2. **`--brand-dark` is a fill, not body text.** In `hello` light it reaches
   3.41:1 on `--bg` and 2.88:1 on a nested surface. Fine as a fill, fine
   for large headings on `--bg`, short of AA for body-size text anywhere.
   Body-size accent text uses `--brand-text`.
3. **Borders are decorative.** No border token clears 3:1 in any
   combination, and lifting them would change the established look. So
   dividers and card edges stay as they are, and anything where the
   boundary is the whole affordance (focus rings, input outlines, selected
   states) uses `--focus-ring` plus the containment ring below.
4. **Two pairs are documented exceptions, not passes.** `--link` in light
   mode and `--brand-on` in `hello` light both sit under 4.5:1 and stay
   that way on purpose. They are bounded in the section below. Nothing
   else in the system is allowed to join them.

### Documented exceptions

Two pairs fail AA and are kept anyway, because the colour is GFTV identity
and the alternative changes a look that already ships. Both are scoped. If
a new pair fails, it is a bug, not a third exception.

**1. `--link` in light mode.** GFTV red `#EF3340` measures 4.02:1 on the
`classic` background and 3.91:1 on `hello`. Kept verbatim. Scope and
mitigation:

- Keep the underline on in-content links. The underline is the affordance,
  not the colour, so the link is still identifiable at 3.9:1.
- Do not reuse `--link` for anything other than links. It is not a status
  colour and not an accent.
- Dark mode is not an exception. `#EF3340` on near-black is 4.63:1, which
  passes, but it reads muddy, so dark mode uses `#ff6b74` at 6.76:1.
  `--link-visited` `#6666ff` is 4.28:1 and has no brand identity to
  preserve, so it moves to `#4b4bd6` at 6.41:1 in light mode.

```css
:link {
  color: var(--link);
  text-decoration: underline;
  text-underline-offset: 2px;
}
```

**2. `--brand-on` on `--brand-dark` in `hello` light.** White on `#9e8800`
is 3.51:1. Kept verbatim, so Hello primary buttons look exactly as they do
today. Scope:

- Clears the 3:1 bar for large text and for non-text UI contrast, so it is
  fine for button labels, chips, badges, and toasts, which is everywhere it
  is used now.
- Never put paragraph-length or caption-size text on `--brand-dark` in
  `hello`. If a new surface needs body copy on the accent, use
  `--brand-text` on `--bg` instead of inventing a fill.
- The fill itself is fine: `--brand-dark` against `--bg` is 3.41:1, which
  clears the 3:1 non-text bar, so the button boundary is visible without a
  border.
- The other three combinations are comfortable (5.65, 8.04, 10.88), so this
  is a `hello` light exception only.

Focus indicator, which needs to survive `hello` light where `--brand-dark`
against a nested surface is 2.88:1:

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--text) 45%, transparent);
}
```

The outer ring is what carries the state in the weakest combination. The
same trick applies to the active swatch in the theme modal, since the
`classic` swatch is `#ffffff` and vanishes on a light modal without a
containment ring.

## Shape conventions

- `.glass-card`: `border-radius: var(--radius)`, `--glass-blur` backdrop
- Chip-style buttons: `999px`; rectangular buttons and inputs:
  `var(--radius-sm)`
- Icon buttons: `40px` square, `32px` with `.small`
- Single breakpoint: `@media (max-width: 480px)`

---

## 1. CSS to add (`css/theme.css`, or the top of `style.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* structural, no colour */
:root {
  --glass-blur: 16px;
  --radius: 14px;
  --radius-sm: 8px;
  --font: 'Inter', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; font-family: var(--font); }
html, body { height: 100%; }

body {
  background: var(--bg);
  color: var(--text);
  transition: background-color 0.25s ease, color 0.25s ease;
}

:link {
  color: var(--link);
  text-decoration: underline;
  text-underline-offset: 2px;
}
:visited { color: var(--link-visited); }
a:hover { text-decoration: none; }

button { cursor: pointer; border: none; background: none; color: inherit; }
button:disabled { cursor: not-allowed; opacity: 0.6; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}

/* one block per colour theme x mode, values from the section above */
:root[data-color-theme="classic"][data-mode="light"] { /* ... */ }
:root[data-color-theme="classic"][data-mode="dark"]  { /* ... */ }
:root[data-color-theme="hello"][data-mode="light"]   { /* ... */ }
:root[data-color-theme="hello"][data-mode="dark"]    { /* ... */ }

/* derived, resolves per combination */
:root {
  --brand-dark-hover: color-mix(in srgb, var(--brand-dark) 85%, var(--text));
  --text-muted-strong: color-mix(in srgb, var(--text) 70%, transparent);
  --callout-danger-bg: color-mix(in srgb, var(--danger) 14%, transparent);
  --callout-ok-bg: color-mix(in srgb, var(--ok) 14%, transparent);
  --callout-warn-bg: color-mix(in srgb, var(--warn) 14%, transparent);
  --focus-ring: var(--brand-dark);
}

/* glass primitive */
.glass-card {
  background: var(--surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow) 0 8px 24px, inset 0 1px 0 var(--glass-highlight);
}

/* accent fill and its label */
.btn-primary {
  background: var(--brand-dark);
  color: var(--brand-on);
  border-radius: var(--radius-sm);
}
.btn-primary:hover { background: var(--brand-dark-hover); }

.btn-danger { background: var(--danger); color: var(--danger-on); }
.btn-danger:hover { background: var(--danger-hover); }

/* focus, see the audit section */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--text) 45%, transparent);
}

/* theme modal */
.swatch { background: var(--surface); border: 1px solid var(--border); }
.swatch.active {
  border-color: var(--swatch-color);
  box-shadow:
    0 0 0 2px var(--swatch-color),
    0 0 0 3px color-mix(in srgb, var(--text) 50%, transparent);
}
.swatch-dot {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--swatch-color);
  border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
}
.mode-btn.active { background: var(--brand-dark); color: var(--brand-on); }
```

## 2. `js/theme.js` (copy verbatim, change `APP_KEY` only)

```js
// Two axes: colour theme and light/dark mode.
// Default is always classic + light, regardless of OS preference.

const APP_KEY = "gftv-appname"; // e.g. gftv-policyspot

export const COLOR_THEMES = [
  { id: "classic", label: "Classic", hex: "#ffffff" },
  { id: "hello", label: "Hello", hex: "#fedc00" },
];

// Page background per combination, for meta[name=theme-color].
const THEME_COLOR = {
  "classic:light": "#ffffff",
  "classic:dark": "#0f1317",
  "hello:light": "#fffde0",
  "hello:dark": "#14120a",
};

const KEY_COLOR = `${APP_KEY}.colorTheme`;
const KEY_MODE = `${APP_KEY}.mode`;
const LEGACY_KEY = "gftv-theme";

// Old single key mapped onto the two axes.
const LEGACY_MAP = {
  light: { colorTheme: "classic", mode: "light" },
  hello: { colorTheme: "hello", mode: "light" },
};

function migrateLegacy() {
  if (localStorage.getItem(KEY_COLOR)) return;
  const old = localStorage.getItem(LEGACY_KEY);
  const mapped = LEGACY_MAP[old] || { colorTheme: "classic", mode: "light" };
  localStorage.setItem(KEY_COLOR, mapped.colorTheme);
  localStorage.setItem(KEY_MODE, mapped.mode);
  localStorage.removeItem(LEGACY_KEY);
}

export function getStoredColorTheme() {
  const v = localStorage.getItem(KEY_COLOR);
  return COLOR_THEMES.some((t) => t.id === v) ? v : "classic";
}

export function getStoredMode() {
  return localStorage.getItem(KEY_MODE) === "dark" ? "dark" : "light";
}

function syncMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const key = `${getStoredColorTheme()}:${getStoredMode()}`;
  meta.setAttribute("content", THEME_COLOR[key]);
}

export function applyColorTheme(id) {
  const theme = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
  document.documentElement.setAttribute("data-color-theme", theme.id);
  localStorage.setItem(KEY_COLOR, theme.id);
  syncMeta();
  return theme;
}

export function applyMode(mode) {
  const resolved = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-mode", resolved);
  localStorage.setItem(KEY_MODE, resolved);
  syncMeta();
  return resolved;
}

export function initTheme() {
  migrateLegacy();
  applyColorTheme(getStoredColorTheme());
  applyMode(getStoredMode());
}

// PDF export forces a light document, then restores both axes.
export function withLightMode(fn) {
  const mode = getStoredMode();
  const theme = getStoredColorTheme();
  document.documentElement.setAttribute("data-color-theme", "classic");
  document.documentElement.setAttribute("data-mode", "light");
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      document.documentElement.setAttribute("data-color-theme", theme);
      document.documentElement.setAttribute("data-mode", mode);
    });
}
```

`withLightMode` writes the attributes directly and never touches
localStorage, so an export cannot overwrite the user's choice if it throws
partway through.

## 3. HTML

In `<head>`, before the stylesheet:

```html
<meta name="theme-color" content="#ffffff" />
<script>
  (function () {
    var k = "gftv-appname";
    var m = localStorage.getItem(k + ".mode") || "light";
    var c = localStorage.getItem(k + ".colorTheme") || "classic";
    document.documentElement.setAttribute("data-mode", m);
    document.documentElement.setAttribute("data-color-theme", c);
  })();
</script>
```

This runs before first paint and guarantees both attributes exist, which is
what lets every colour block select on both without a fallback. Keep the key
in sync with `APP_KEY`.

Modal at the end of `<body>`, starting with `.hidden`:

```html
<div class="modal-backdrop hidden" id="themeModal">
  <div class="modal glass-card" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
    <div class="modal-head">
      <h2 id="themeModalTitle">Theme</h2>
      <button class="icon-btn small" type="button" data-close-modal="themeModal" aria-label="Close">
        <span data-icon="close"></span>
      </button>
    </div>
    <p class="modal-section-label">Mode</p>
    <div class="mode-toggle" id="modeToggle">
      <button class="mode-btn" type="button" data-mode="light" aria-pressed="false"><span data-icon="sun"></span>Light</button>
      <button class="mode-btn" type="button" data-mode="dark" aria-pressed="false"><span data-icon="moon"></span>Dark</button>
    </div>
    <p class="modal-section-label">Colour theme</p>
    <div class="swatch-grid" id="swatchGrid"></div>
  </div>
</div>
```

Selecting a swatch or a mode updates the modal in place. It never closes the
modal; closing is a separate explicit action (close button, or the backdrop).

## localStorage

Keys are namespaced per app, `gftv-<app>.colorTheme` and `gftv-<app>.mode`.
GFTV apps live on different subdomains, so localStorage is per-origin and a
shared key would not sync between them anyway.

Migration from the old single key `gftv-theme`:

| Old value | New colorTheme | New mode |
|---|---|---|
| `light` | `classic` | `light` |
| `hello` | `hello` | `light` |
| missing or unknown | `classic` | `light` |

Migration runs once, on the first `initTheme()` after the update, and
removes the old key.

## Acceptance checklist

- [ ] Every colour theme renders in both modes with readable text
- [ ] Fresh profile with the OS in dark mode still loads light
- [ ] Choice survives reload and applies on every page in the app
- [ ] Theme button icon matches the active mode
- [ ] Search modal, callouts, danger buttons, and toasts all follow the
      mode, with no white boxes left in dark
- [ ] PDF export still produces a light document and restores both axes
      afterwards, including when the export throws
- [ ] `meta[name="theme-color"]` tracks the active combination, not the
      colour theme alone
- [ ] Zero hardcoded colour values left outside the token blocks
- [ ] Old `gftv-theme` value migrates without the user losing their pick
- [ ] Every text pair clears AA 4.5:1 in all four combinations, except the
      two logged exceptions
- [ ] The two exceptions stay in scope: links keep their underline, and
      nothing body-size sits on `--brand-dark` in `hello` light
- [ ] Nothing body-size uses `--brand-dark` as a text colour
- [ ] Secondary text on `--surface-active` uses `--text-muted-strong`
- [ ] Focus is visible in `hello` light, where the accent against a nested
      surface is 2.88:1 on its own
- [ ] The active `classic` swatch is still visibly ringed on a white modal
- [ ] No gradients, no emoji, no em dashes

## Open questions

1. **`--brand-mid`.** Dropped above, since `--brand-dark-hover` covers the
   one role it could have had. Confirm nothing downstream reads it.
2. **Colour theme set per repo.** PolicySpot has `classic` and `hello`. Do
   HelloQueue, HelloTrace, HelloShare, GFTV Forms, FURST, and the portal
   all carry the same two, or does any of them state a third?

Settled, kept here so the reasoning is not relitigated:

- In-content links stay GFTV red `#EF3340` in light mode, as a documented
  exception with the underline carrying the affordance.
- `--brand-on` stays white on `hello` light, as a documented exception
  bounded to button, chip, and badge labels.
- Both dark palettes are approved as written.