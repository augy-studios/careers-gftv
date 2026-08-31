// One place a listener's unhandled failure becomes a sentence on screen.
//
// Both shells had a copy of this, identical apart from which message bar it
// wrote to — `adminMessage` in admin-shell.js, `accountMessage` in
// account-shell.js — and phase 12 part 6 merged them. The difference between
// the two copies was one argument, which is the shape a duplicate takes just
// before it drifts.
//
// **Why it exists at all**, which is worth keeping in front of the next person
// tempted to call an async function bare from a listener: `addEventListener`
// does not await what it is handed, so a rejected promise inside a click
// handler is an unhandled rejection in the console and *nothing at all* on the
// page. Somebody presses a button, the request fails, and the interface sits
// there looking as though the press did not register. That is the failure this
// wraps every write in.
//
// It is deliberately not a general error reporter: the message it shows is
// `error.unexpected`, because anything a caller could word better is a failure
// it should have caught and worded itself. This is the last resort.

import { t } from './i18n.js';

/**
 * Build the `runAction` for one area, given how that area shows a message.
 *
 * @param {(kind: string, text: string) => void} report the area's message bar
 * @returns {(action: () => unknown, label: string) => void}
 */
export function makeRunAction(report) {
  return function runAction(action, label) {
    try {
      const result = action();
      if (result && typeof result.catch === 'function') {
        result.catch((cause) => {
          console.error(`[careers-gftv] ${label}:`, cause);
          report('error', t('error.unexpected'));
        });
      }
    } catch (cause) {
      console.error(`[careers-gftv] ${label}:`, cause);
      report('error', t('error.unexpected'));
    }
  };
}
