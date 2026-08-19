// Two axes: colour theme and light/dark mode.
// Default is always classic + light, regardless of OS preference.
//
// This is the module from gftv-theme.md, with APP_KEY set for this app. Keep
// it in sync with the pre-paint script in every <head>, which reads the same
// two localStorage keys before first paint so both attributes exist on <html>
// before any colour block is evaluated.
//
// The "time" mode started here as an experiment for this app and has since
// been adopted into gftv-theme.md, so it is part of the shared system and a
// re-sync from the canonical version will carry it. It is optional per app:
// the shared file marks the pieces an app can leave out if it ships the two
// button toggle.
//
// It works by separating two things the original design conflated:
//
//   the preference   what the person chose. light, dark, or time.
//   the mode         what the document is actually in. Only ever light or
//                    dark, because every colour block in theme.css selects on
//                    data-mode and a third value would match none of them.
//
// So data-mode is unchanged and no stylesheet knows this feature exists.

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

/**
 * The daylight window for the time based mode. Light from 09:00 up to but not
 * including 18:00, dark the rest of the day.
 *
 * Read from the device clock, in the device's own timezone, which is the
 * point: somebody's evening is their evening wherever they are, and the site
 * never has to ask where that is.
 *
 * Duplicated in the pre-paint script in every head, which has to resolve this
 * before first paint and cannot import anything. Change both together.
 */
export const LIGHT_FROM_HOUR = 9;
export const LIGHT_UNTIL_HOUR = 18;

export const MODE_PREFERENCES = ['light', 'dark', 'time'];
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

/**
 * What the person chose: light, dark, or time.
 * @returns {'light'|'dark'|'time'}
 */
export function getModePreference() {
  const v = localStorage.getItem(KEY_MODE);
  return MODE_PREFERENCES.includes(v) ? v : 'light';
}

/**
 * Whether the device clock currently says light.
 * @param {Date} [now]
 */
export function isDaylightHours(now = new Date()) {
  const hour = now.getHours();
  return hour >= LIGHT_FROM_HOUR && hour < LIGHT_UNTIL_HOUR;
}

/**
 * Turn a preference into the mode the document is actually in.
 * @param {string} preference
 * @returns {'light'|'dark'}
 */
export function resolveMode(preference) {
  if (preference === 'time') return isDaylightHours() ? 'light' : 'dark';
  return preference === 'dark' ? 'dark' : 'light';
}

/**
 * The mode the document is in right now, resolved. This is what the meta
 * theme-color and the "currently light mode" label want, and what
 * withLightMode restores.
 * @returns {'light'|'dark'}
 */
export function getStoredMode() {
  return resolveMode(getModePreference());
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

/**
 * Store a preference and put the document into the mode it resolves to.
 *
 * @param {'light'|'dark'|'time'} preference
 * @returns {'light'|'dark'} the mode actually applied
 */
export function applyMode(preference) {
  const chosen = MODE_PREFERENCES.includes(preference) ? preference : 'light';
  const resolved = resolveMode(chosen);

  document.documentElement.setAttribute('data-mode', resolved);
  // data-mode-preference is read by nothing in any stylesheet. It exists so
  // the theme modal can show which of the three is chosen after a reload, and
  // so anything inspecting the page can tell "dark because you asked" apart
  // from "dark because it is nine in the evening".
  document.documentElement.setAttribute('data-mode-preference', chosen);
  localStorage.setItem(KEY_MODE, chosen);

  syncMeta();
  scheduleModeCheck();

  return resolved;
}

/* -------------------------------------------------------------------------
 * Keeping the time based mode honest while the page stays open
 * ---------------------------------------------------------------------- */

let modeTimer = null;
let watchingVisibility = false;

/** Milliseconds until the next 09:00 or 18:00, whichever comes first. */
function msUntilNextBoundary(now = new Date()) {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);

  const hour = now.getHours();
  if (hour < LIGHT_FROM_HOUR) {
    next.setHours(LIGHT_FROM_HOUR);
  } else if (hour < LIGHT_UNTIL_HOUR) {
    next.setHours(LIGHT_UNTIL_HOUR);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(LIGHT_FROM_HOUR);
  }

  // A second of slack, so a timer that fires a fraction early does not land
  // back in the hour it just left and reschedule itself in a tight loop.
  return Math.max(1000, next.getTime() - now.getTime() + 1000);
}

/**
 * Re-resolve when the clock crosses a boundary, for a tab left open across six
 * in the evening.
 *
 * Scheduled to the boundary rather than polled every minute, so an idle tab
 * costs one timer rather than 1,440 wakeups a day. A laptop that sleeps
 * through the boundary fires its timer late, which is what the visibility
 * listener is for: coming back to a tab re-checks straight away.
 */
function scheduleModeCheck() {
  if (modeTimer !== null) {
    clearTimeout(modeTimer);
    modeTimer = null;
  }

  if (getModePreference() !== 'time') return;

  modeTimer = setTimeout(() => {
    modeTimer = null;
    refreshTimeMode();
  }, msUntilNextBoundary());

  if (!watchingVisibility && typeof document !== 'undefined') {
    watchingVisibility = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshTimeMode();
    });
  }
}

/**
 * Re-apply the time based mode if the hour has moved it, and tell the page so
 * the theme modal can redraw. Does nothing unless the preference is "time".
 */
export function refreshTimeMode() {
  if (getModePreference() !== 'time') return;

  const resolved = resolveMode('time');
  const current = document.documentElement.getAttribute('data-mode');

  if (resolved !== current) {
    document.documentElement.setAttribute('data-mode', resolved);
    syncMeta();
    document.dispatchEvent(
      new CustomEvent('gftv:modechange', {
        detail: { mode: resolved, preference: 'time' },
      })
    );
  }

  scheduleModeCheck();
}

export function initTheme() {
  migrateLegacy();
  applyColorTheme(getStoredColorTheme());
  // The preference, not the resolved mode. Passing the resolved one would
  // quietly rewrite a stored "time" into "dark" the first evening somebody
  // loaded the page.
  applyMode(getModePreference());
}

// Forces a light document for a print or export path, then restores both axes.
// Writes the attributes directly and never touches localStorage, so it cannot
// overwrite the user's choice if it throws partway through.
export function withLightMode(fn) {
  // The resolved mode, not the preference. The attribute is what is being put
  // back, and the stored preference is never touched here.
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
