// The two modals every page's header opens: theme, and language.
//
// **Its own file since phase 14 part 1, and the reason is the docs site.**
// `gftv-theme.md` does not only settle colour. Its section 3 is markup — the
// modal, the `.icon-btn` that opens it, a Mode section and a Colour theme
// section — and its acceptance checklist asks that the theme button be an icon
// button. The docs site had `theme.css` generated into it and none of that, so
// it was shipping the tokens of a contract and not the chrome of one.
//
// The two ways out of that were a second implementation written in the docs
// site's own language, or one implementation moved somewhere both sites can
// have it. These four functions were the whole of what stood in the way of the
// second, because they lived inside `shell.js`, which draws a portal header, a
// footer, a build status notice and a navigation drawer that the docs site
// wants none of. So they come out here, `gen-docs-lib.js` copies this file
// across unchanged, and there is one implementation of a control the theme file
// prescribes exactly.
//
// **The buttons are found by id and never passed in.** `#themeButton` and
// `#languageButton` are the portal's ids and are now the docs header's ids too,
// which is what lets this file be copied with no transform rule at all.
// Identical means identical.
//
// What is deliberately not here: the navigation drawer's focus trap and scroll
// lock. Those belong to a panel that becomes an inline nav above 1024px, they
// are the portal's alone, and phase 12 part 6 already took the modals off them.

import {
  applyColorTheme,
  applyMode,
  getStoredColorTheme,
  getStoredMode,
  getModePreference,
  COLOR_THEMES,
} from './theme.js';
import { applyLocale, getLocale, t, LOCALES } from './i18n.js';
import { createDialog } from './dialog.js';

// **Both modals are built by dialog.js since phase 12 part 6.** They were the
// two hand-rolled ones — each with its own copy of the focus trap, the Escape
// handler, the backdrop click and the scroll lock, all of which now come from a
// native <dialog> and from one shell. What is left here is what is actually
// particular to them: the markup inside and the wiring for it.
export function renderThemeModal() {
  return createDialog({
    id: 'themeModal',
    titleKey: 'theme.title',
    bodyHtml: `
      <p class="modal-section-label" data-i18n="theme.mode"></p>
      <!-- Three options, not two. The third is a preference and not a
           mode: it resolves to light or dark from the device clock, and
           data-mode is still only ever one of those two. Part of
           gftv-theme.md, and optional for an app that wants the two button
           toggle instead. -->
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-btn" type="button" data-mode="light" aria-pressed="false">
          <span data-icon="sun" data-icon-size="18"></span><span data-i18n="theme.light"></span>
        </button>
        <button class="mode-btn" type="button" data-mode="dark" aria-pressed="false">
          <span data-icon="moon" data-icon-size="18"></span><span data-i18n="theme.dark"></span>
        </button>
        <button class="mode-btn mode-btn-wide" type="button" data-mode="time" aria-pressed="false">
          <span data-icon="clock" data-icon-size="18"></span><span data-i18n="theme.timeBased"></span>
        </button>
      </div>
      <p class="mode-note" id="modeNote" hidden></p>
      <p class="modal-section-label" data-i18n="theme.colourTheme"></p>
      <div class="swatch-grid" id="swatchGrid"></div>
    `,
  });
}

// Same structure and same behaviour as the theme modal, deliberately.
//
// Each language is named in its own script, never translated. A reader looking
// for Chinese looks for the characters, not for the English word "Chinese",
// so both options read the same whichever language the interface is currently
// in. That is why these two labels are hardcoded instead of dictionary keys.
export function renderLanguageModal() {
  return createDialog({
    id: 'languageModal',
    titleKey: 'language.title',
    bodyHtml: `
      <div class="locale-list" id="localeList">
        ${LOCALES.map(
          (locale) => `
          <button class="locale-btn" type="button" data-locale="${locale.id}"
                  lang="${locale.htmlLang}" aria-pressed="false">
            <span class="locale-native">${locale.native}</span>
            <span class="locale-check" data-icon="check" data-icon-size="18"></span>
          </button>`
        ).join('')}
      </div>
      <p class="locale-note" data-i18n="language.description"></p>
    `,
  });
}

export function wireThemeModal(dialog) {
  const modal = dialog.element;
  const button = document.querySelector('#themeButton');
  const grid = modal.querySelector('#swatchGrid');
  const modeButtons = [...modal.querySelectorAll('.mode-btn')];

  // The label is a dictionary key and not theme.label, so the swatch names
  // follow the language. translateDom refills them on every change, which is
  // why the grid is built once here and never rebuilt.
  grid.innerHTML = COLOR_THEMES.map(
    (theme) => `
      <button type="button" class="swatch" data-color-theme="${theme.id}"
              style="--swatch-color: ${theme.hex}" aria-pressed="false">
        <span class="swatch-dot" aria-hidden="true"></span>
        <span data-i18n="theme.${theme.id}">${theme.label}</span>
      </button>`
  ).join('');

  function sync() {
    const colour = getStoredColorTheme();
    // The preference decides which button is pressed; the resolved mode
    // decides what the label says the page is currently in. On "time" those
    // two are different, which is the whole point of the option.
    const preference = getModePreference();
    const mode = getStoredMode();

    grid.querySelectorAll('.swatch').forEach((el) => {
      const active = el.getAttribute('data-color-theme') === colour;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });

    modeButtons.forEach((el) => {
      const active = el.getAttribute('data-mode') === preference;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });

    const note = modal.querySelector('#modeNote');
    if (note) {
      note.hidden = preference !== 'time';
      if (preference === 'time') {
        note.textContent = t('theme.timeBasedNote', {
          mode: t(mode === 'dark' ? 'common.modeDark' : 'common.modeLight'),
        });
      }
    }

    if (button) {
      button.setAttribute(
        'aria-label',
        t('common.appearanceWithMode', {
          mode: t(mode === 'dark' ? 'common.modeDark' : 'common.modeLight'),
        })
      );
    }
  }

  button?.addEventListener('click', dialog.open);

  // Selecting a swatch or a mode updates the modal in place and never closes
  // it. Closing is a separate explicit action.
  grid.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color-theme]');
    if (!swatch) return;
    applyColorTheme(swatch.getAttribute('data-color-theme'));
    sync();
  });

  modeButtons.forEach((el) => {
    el.addEventListener('click', () => {
      applyMode(el.getAttribute('data-mode'));
      sync();
    });
  });

  sync();

  // The clock can move the mode under a tab that is just sitting open. When it
  // does, theme.js says so and the modal redraws instead of showing yesterday
  // evening's answer.
  document.addEventListener('gftv:modechange', sync);

  // And again once the dictionary has loaded.
  //
  // sync() writes two strings that are not in the markup and so carry no
  // data-i18n attribute: the mode note and the theme button's label. It first
  // runs from boot(), which is before initI18n(), so at that point t() has no
  // dictionary and returns the key itself. translateDom() cannot rescue them
  // afterwards precisely because they are not attributes on an element, which
  // is how "theme.timeBasedNote" ended up on screen.
  //
  // The language modal already listened for this. The theme modal did not,
  // and did not visibly need to until it gained a string of its own.
  document.addEventListener('gftv:localechange', sync);
}

export function wireLanguageModal(dialog) {
  const modal = dialog.element;
  const button = document.querySelector('#languageButton');
  const list = modal.querySelector('#localeList');

  function sync() {
    const current = getLocale();
    list.querySelectorAll('.locale-btn').forEach((el) => {
      const active = el.getAttribute('data-locale') === current;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
  }

  button?.addEventListener('click', dialog.open);

  // Choosing a language updates the modal in place and leaves it open, exactly
  // as the theme modal does. Closing stays a separate, explicit action, so
  // somebody who picked the wrong one can correct it without reopening.
  list.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-locale]');
    if (!choice) return;
    applyLocale(choice.getAttribute('data-locale')).then(sync);
  });

  document.addEventListener('gftv:localechange', sync);
  sync();
}
