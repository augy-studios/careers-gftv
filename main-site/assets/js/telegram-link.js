// The Telegram section of /account/settings. Specification section 15, the
// linking flow, steps 1 to 5.
//
// **The QR is drawn, not fetched.** api/_lib/qr.js answers a matrix of '0' and
// '1' and this builds one SVG path from it. Two reasons, and the second is the
// one that settled it: assigning server markup would break the rule that
// ts_headline is the only thing this build ever assigns as markup, and an image
// URL carrying the token would put a credential into something that gets logged
// by every proxy it passes.
//
// **The page polls, per section 15 step 4**, so it flips to linked without a
// refresh while somebody is looking at their phone. It stops the moment the
// token expires, the moment the link appears, and whenever the section is put
// away, because a poll nobody is watching is a request nobody asked for.
//
// **Part 3 added the three controls 7g asks for on a linked account**: the test
// message, the second factor switch, and the unlink that was already here. The
// switch is the only control on this page that changes how somebody signs in,
// which is why it puts itself back when the server refuses rather than sitting
// where it was left claiming a state the account does not have.
//
// **The token is shown once and is never stored.** It lives in a variable for
// as long as the panel is open. Nothing goes into localStorage or IndexedDB: it
// is a credential with a ten minute life, and phase 10's own rule is that what
// belongs to an applicant is wiped on sign out, which a token in storage would
// quietly outlive.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons } from './icons.js';
import { formatDate } from './format.js';
import { runAction, accountMessage } from './account-shell.js';
import { confirmAction } from './danger-confirm.js';

/** How often the page asks whether the link has appeared. */
const POLL_MS = 3000;

/** A quiet zone of four modules, which the standard asks for. */
const QUIET = 4;

let poll = null;
let expiresAt = null;
let countdown = null;

/**
 * Whether this account asks for a Telegram code at sign in.
 *
 * Read by the danger zone, which has to know whether to draw 7g step 3's fourth
 * panel. It answers false while the state is unknown, which is the safe
 * direction for exactly one reason: the endpoint asks the database the same
 * question and refuses without a code regardless, so being wrong here shows
 * somebody one panel too few rather than letting anything through.
 */
export function telegramTwofaOn() {
  return state.link?.twofaEnabled === true;
}

export function mountTelegram() {
  const section = document.querySelector('#telegramSection');
  if (!section) return;

  document.querySelector('#telegramStart')?.addEventListener('click', () => {
    runAction(start, 'start telegram link');
  });
  document.querySelector('#telegramRestart')?.addEventListener('click', () => {
    runAction(start, 'restart telegram link');
  });
  document.querySelector('#telegramUnlink')?.addEventListener('click', () => {
    runAction(remove, 'unlink telegram');
  });
  document.querySelector('#telegramCopy')?.addEventListener('click', () => {
    runAction(copyLink, 'copy telegram link');
  });
  document.querySelector('#telegramTest')?.addEventListener('click', () => {
    runAction(sendTest, 'send telegram test message');
  });

  // change rather than click, so the keyboard and the pointer both arrive here.
  document.querySelector('#telegramTwofaToggle')?.addEventListener('change', (event) => {
    runAction(() => setTwofa(event.target.checked === true), 'toggle telegram 2fa');
  });

  // The linked line and the countdown are written rather than translated in
  // place, so both are redrawn when the language changes.
  document.addEventListener('gftv:localechange', () => {
    if (state.link) showLinked(state.link);
    if (expiresAt) drawExpiry();
  });

  refresh();
}

const state = { link: null };

/* -------------------------------------------------------------------------
 * Reading where things stand
 * ---------------------------------------------------------------------- */

async function refresh() {
  const result = await api('/api/account/telegram');

  // **A failed read is a third state**, per the rule phase 10 left behind. This
  // page is precached and opens with no connection, and the two answers this
  // section can give are both claims about somebody's account. Saying "not
  // linked" because we could not ask would invite a linked person to link
  // again, and saying nothing at all would leave an empty box where a control
  // should be. So it says which of the three it is.
  if (!result.ok) {
    if (!state.link) showUnknown();
    return;
  }

  state.link = result.data.link ?? null;
  if (state.link) showLinked(state.link);
  else showUnlinked();
}

function showOnly(selector) {
  for (const id of ['#telegramUnlinked', '#telegramCode', '#telegramLinked', '#telegramUnknown']) {
    toggle(id, id === selector);
  }
}

function showUnknown() {
  stopPolling();
  showOnly('#telegramUnknown');
}

function showUnlinked() {
  stopPolling();
  expiresAt = null;
  showOnly('#telegramUnlinked');
}

function showLinked(link) {
  stopPolling();
  expiresAt = null;
  showOnly('#telegramLinked');

  const line = document.querySelector('#telegramLinkedLine');
  if (!line) return;

  // The handle if Telegram gave us one, the display name if not, and neither
  // if the account has neither, which is allowed: a Telegram account with no
  // username and no name set is unusual and not impossible.
  const who = link.username ? `@${link.username}` : link.displayName;
  line.textContent = who
    ? t('settings.telegramLinkedAs', { who, date: formatDate(link.linkedAt) })
    : t('settings.telegramLinkedOn', { date: formatDate(link.linkedAt) });

  const toggle = document.querySelector('#telegramTwofaToggle');
  if (toggle) toggle.checked = link.twofaEnabled === true;
  twofaError(null);
}

/* -------------------------------------------------------------------------
 * The second factor, and the test message
 * ---------------------------------------------------------------------- */

/**
 * Switch the code at sign in on or off.
 *
 * **The checkbox is put back when the server refuses.** A control that stays
 * where somebody left it while the account says otherwise is the worst kind of
 * wrong: it is a security setting reporting a state it does not have. The
 * refusal worth handling by name is 5c's, that a 2FA backup code set has to
 * exist first, and it is answered with the sentence and a way to the page that
 * generates one rather than with a generic failure.
 */
async function setTwofa(enabled) {
  twofaError(null);

  const result = await api('/api/account/telegram', {
    method: 'POST',
    body: { action: 'twofa', enabled },
  });

  if (!result.ok) {
    const toggle = document.querySelector('#telegramTwofaToggle');
    if (toggle) toggle.checked = state.link?.twofaEnabled === true;

    twofaError(
      result.error?.details?.reason === 'no_backup_codes'
        ? t('settings.telegramTwofaNeedsCodes')
        : (result.error?.message ?? t('error.unexpected'))
    );
    return;
  }

  if (state.link) state.link.twofaEnabled = result.data.twofaEnabled === true;

  accountMessage(
    'ok',
    result.data.twofaEnabled ? t('settings.telegramTwofaOn') : t('settings.telegramTwofaOff')
  );
}

/**
 * Ask for a test message.
 *
 * It says a message is on its way rather than that one has arrived, which is
 * the only thing this side knows: the site writes a row and returns, and the
 * bot sends it on its own schedule. Claiming delivery would be the page
 * asserting something no part of the site ever finds out.
 */
async function sendTest() {
  const result = await api('/api/account/telegram', {
    method: 'POST',
    body: { action: 'test' },
  });

  accountMessage(
    result.ok ? 'ok' : 'error',
    result.ok
      ? t('settings.telegramTestSent')
      : (result.error?.message ?? t('error.unexpected'))
  );
}

function twofaError(message) {
  const holder = document.querySelector('#telegramTwofaError');
  if (!holder) return;
  holder.textContent = message ?? '';
  holder.hidden = !message;
}

/* -------------------------------------------------------------------------
 * Starting a link
 * ---------------------------------------------------------------------- */

async function start() {
  const result = await api('/api/account/telegram', {
    method: 'POST',
    body: { action: 'start' },
  });

  if (!result.ok) {
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  if (result.data.linked) {
    // Somebody linked in another tab, or in the bot, while this page sat open.
    state.link = result.data.link;
    showLinked(result.data.link);
    return;
  }

  showOnly('#telegramCode');

  drawQr(result.data.qr);

  const open = document.querySelector('#telegramOpen');
  if (open) open.href = result.data.url;

  const url = document.querySelector('#telegramUrl');
  if (url) url.textContent = result.data.url;

  expiresAt = new Date(result.data.expiresAt).getTime();
  drawExpiry();
  startPolling();
}

/**
 * One path, one element, whatever the version.
 *
 * A rect per dark module would be up to two and a half thousand elements for a
 * version 9 symbol. One path costs one node and scales to any size without
 * blurring, and `shape-rendering: crispEdges` in the stylesheet is what stops a
 * browser antialiasing the module edges into something a scanner reads as grey.
 */
function drawQr(qr) {
  const holder = document.querySelector('#telegramQr');
  if (!holder || !qr?.rows?.length) return;

  const side = qr.size + QUIET * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('settings.telegramQrLabel'));

  // The quiet zone is white rather than transparent. A QR on a dark background
  // with a transparent margin is one a scanner will not see at all, and this
  // page has a dark theme.
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(side));
  background.setAttribute('height', String(side));
  background.setAttribute('fill', '#ffffff');
  svg.append(background);

  let d = '';
  qr.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '1') d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  });

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000000');
  svg.append(path);

  holder.replaceChildren(svg);
}

function drawExpiry() {
  const line = document.querySelector('#telegramExpiry');
  if (!line || !expiresAt) return;

  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    stopPolling();
    line.textContent = t('settings.telegramExpired');
    toggle('#telegramRestart', true);
    return;
  }

  toggle('#telegramRestart', false);
  line.textContent = t('settings.telegramExpiresIn', {
    minutes: Math.ceil(remaining / 60000),
  });

  clearTimeout(countdown);
  // On the next whole minute rather than every second. The number only changes
  // once a minute, and a timer per second on a page somebody leaves open is
  // work for nothing.
  countdown = setTimeout(drawExpiry, Math.min(remaining, 60000) + 250);
}

/* -------------------------------------------------------------------------
 * Polling for the flip
 * ---------------------------------------------------------------------- */

function startPolling() {
  stopPolling();
  poll = setInterval(() => {
    runAction(async () => {
      const result = await api('/api/account/telegram');
      if (!result.ok || !result.data.link) return;

      state.link = result.data.link;
      showLinked(result.data.link);
      accountMessage('ok', t('settings.telegramLinkedNow'));
    }, 'poll telegram link');
  }, POLL_MS);
}

/**
 * Stop asking, and stop counting down.
 *
 * **`expiresAt` deliberately survives this.** The expired panel is still on
 * screen after the timers stop, and the language can change while somebody is
 * looking at it: clearing the time here would leave the "this code has expired"
 * line stranded in whichever language it was written in.
 */
function stopPolling() {
  clearInterval(poll);
  clearTimeout(countdown);
  poll = null;
  countdown = null;
}

/* -------------------------------------------------------------------------
 * Unlinking
 * ---------------------------------------------------------------------- */

async function remove() {
  const confirmed = await confirmAction({
    title: t('settings.telegramUnlinkTitle'),
    body: t('settings.telegramUnlinkBody'),
    consequences: [
      t('settings.telegramUnlinkConsequence1'),
      t('settings.telegramUnlinkConsequence2'),
      // Added in part 3, and it belongs in the list whether or not the switch
      // is on today: unlinking revokes every trusted device either way, so a
      // panel that only mentioned it sometimes would surprise somebody the one
      // time it mattered.
      t('settings.telegramUnlinkConsequence3'),
    ],
    confirmLabel: t('settings.telegramUnlinkConfirm'),
  });
  if (!confirmed) return;

  const result = await api('/api/account/telegram', {
    method: 'POST',
    body: { action: 'unlink' },
  });

  if (!result.ok) {
    accountMessage('error', result.error?.message ?? t('error.unexpected'));
    return;
  }

  state.link = null;
  showUnlinked();
  accountMessage('ok', t('settings.telegramUnlinked'));
}

/* -------------------------------------------------------------------------
 * Small things
 * ---------------------------------------------------------------------- */

async function copyLink() {
  const code = document.querySelector('#telegramUrl');
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code.textContent.trim());
    accountMessage('ok', t('settings.telegramCopied'));
  } catch {
    // Blocked, or no clipboard at all over plain http. The link is on screen
    // already, so selecting it is a complete fallback rather than a apology.
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    accountMessage('error', t('settings.telegramCopyFailed'));
  }
}

function toggle(selector, shown) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.hidden = !shown;
  if (shown) hydrateIcons(element);
}
