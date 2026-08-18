// Two axes: colour theme and light/dark mode.
// Default is always classic + light, regardless of OS preference.
//
// This is the module from gftv-theme.md, with APP_KEY set for this app. Keep
// it in sync with the pre-paint script in every <head>, which reads the same
// two localStorage keys before first paint so both attributes exist on <html>
// before any colour block is evaluated.

const APP_KEY = 'gftv-careers';

export const COLOR_THEMES = [
  { id: 'classic', label: 'Classic', hex: '#ffffff' },
  { id: 'hello', label: 'Hello', hex: '#fedc00' },
];

// Page background per combination, for meta[name=theme-color].
const THEME_COLOR = {
  'classic:light': '#ffffff',
  'classic:dark': '#0f1317',
  'hello:light': '#fffde0',
  'hello:dark': '#14120a',
};

const KEY_COLOR = `${APP_KEY}.colorTheme`;
const KEY_MODE = `${APP_KEY}.mode`;
const LEGACY_KEY = 'gftv-theme';

// Old single key mapped onto the two axes.
const LEGACY_MAP = {
  light: { colorTheme: 'classic', mode: 'light' },
  hello: { colorTheme: 'hello', mode: 'light' },
};

function migrateLegacy() {
  if (localStorage.getItem(KEY_COLOR)) return;
  const old = localStorage.getItem(LEGACY_KEY);
  const mapped = LEGACY_MAP[old] || { colorTheme: 'classic', mode: 'light' };
  localStorage.setItem(KEY_COLOR, mapped.colorTheme);
  localStorage.setItem(KEY_MODE, mapped.mode);
  localStorage.removeItem(LEGACY_KEY);
}

export function getStoredColorTheme() {
  const v = localStorage.getItem(KEY_COLOR);
  return COLOR_THEMES.some((t) => t.id === v) ? v : 'classic';
}

export function getStoredMode() {
  return localStorage.getItem(KEY_MODE) === 'dark' ? 'dark' : 'light';
}

function syncMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const key = `${getStoredColorTheme()}:${getStoredMode()}`;
  meta.setAttribute('content', THEME_COLOR[key]);
}

export function applyColorTheme(id) {
  const theme = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
  document.documentElement.setAttribute('data-color-theme', theme.id);
  localStorage.setItem(KEY_COLOR, theme.id);
  syncMeta();
  return theme;
}

export function applyMode(mode) {
  const resolved = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-mode', resolved);
  localStorage.setItem(KEY_MODE, resolved);
  syncMeta();
  return resolved;
}

export function initTheme() {
  migrateLegacy();
  applyColorTheme(getStoredColorTheme());
  applyMode(getStoredMode());
}

// Forces a light document for a print or export path, then restores both axes.
// Writes the attributes directly and never touches localStorage, so it cannot
// overwrite the user's choice if it throws partway through.
export function withLightMode(fn) {
  const mode = getStoredMode();
  const theme = getStoredColorTheme();
  document.documentElement.setAttribute('data-color-theme', 'classic');
  document.documentElement.setAttribute('data-mode', 'light');
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      document.documentElement.setAttribute('data-color-theme', theme);
      document.documentElement.setAttribute('data-mode', mode);
    });
}
