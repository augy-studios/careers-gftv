// A tab strip's keyboard, in one place.
//
// **Six strips, two of which had arrow keys.** The applicant's translation
// helper strip got them in phase 11 part 7 and the admin translations strip
// copied them; the four bucket strips — applications, saved roles, the admin
// application board and the posting editor's language tabs — had a roving
// tabindex and nothing to rove with, so a keyboard reader could tab *to* the
// strip and then had no way to move along it. Tab went straight past to the
// list below, which is what the roving tabindex is for and is exactly why the
// missing half was invisible: the strip behaved correctly right up to the
// point where somebody tried to use it.
//
// Per the WAI-ARIA tabs pattern, and the two decisions in it that matter here:
//
//   **Manual activation.** Arrowing moves the focus and selects nothing. Every
//   strip in this build reloads a list when a tab is chosen, so following the
//   focus would fire a request per keypress and leave somebody arrowing to the
//   fourth bucket having asked for three they never wanted.
//
//   **One stop for the whole strip.** The selected tab is the only one with
//   tabindex="0"; arrowing moves that too, so tabbing back into the strip
//   returns to where the keyboard left it rather than to the selected tab.
//
// **And the redraw, which is where the defect was.** Every one of these strips
// is rebuilt by innerHTML whenever its counts change, which destroys the button
// the keyboard was standing on. The two strips that thought about it at all
// restored focus to the *selected* tab, so a reader arrowing from Open to
// Closed was thrown back to Open the moment a count arrived: correct-looking
// code that undoes the reader's last action. What is restored now is the tab
// that had the focus, whether or not it is the selected one.

/**
 * Wire an existing strip's keyboard and clicks.
 *
 * For a strip drawn as part of something larger, where the caller owns the
 * markup. `drawTabStrip` is the one to use when the strip is drawn on its own.
 *
 * @param {HTMLElement} holder the element carrying role="tablist"
 * @param {{ key: string, onSelect: (value: string, tab: HTMLElement) => void }} options
 *        `key` is the data attribute a tab carries its value in, without the
 *        `data-` prefix: 'bucket', 'filter', 'locale', 'tab'.
 */
export function wireTabStrip(holder, options) {
  const selector = `[data-${options.key}]`;
  const tabs = [...holder.querySelectorAll(selector)];
  if (tabs.length === 0) return;

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      options.onSelect(tab.getAttribute(`data-${options.key}`), tab);
    });

    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;

      event.preventDefault();
      focusTab(tabs, next);
    });
  });
}

/**
 * Draw a strip, keep the keyboard's place, and wire it.
 *
 * The redraw is inside this function rather than beside it on purpose: where
 * the focus was has to be read *before* the innerHTML that destroys it, and a
 * rule of the form "call this first" is a rule that gets forgotten on the
 * fifth strip.
 *
 * @param {HTMLElement} holder the element carrying role="tablist"
 * @param {{ key: string, html: string, onSelect: (value: string, tab: HTMLElement) => void }} options
 */
export function drawTabStrip(holder, options) {
  const attribute = `data-${options.key}`;

  // Read before the redraw, and it is the value rather than the element,
  // because the element itself is about to stop existing.
  const focused =
    holder.contains(document.activeElement) && document.activeElement.hasAttribute(attribute)
      ? document.activeElement.getAttribute(attribute)
      : null;

  holder.innerHTML = options.html;
  wireTabStrip(holder, options);

  if (focused === null) return;

  const tabs = [...holder.querySelectorAll(`[${attribute}]`)];
  // The same tab if it is still there; the selected one if that bucket has
  // gone, which is the only case where moving somebody is better than dropping
  // them onto the document body.
  const target =
    tabs.find((tab) => tab.getAttribute(attribute) === focused) ??
    holder.querySelector('[aria-selected="true"]') ??
    tabs[0];

  if (target) focusTab(tabs, target);
}

/** Move the strip's single tab stop to one tab, and put the focus on it. */
function focusTab(tabs, target) {
  tabs.forEach((tab) => {
    tab.tabIndex = tab === target ? 0 : -1;
  });
  target.focus();
}
