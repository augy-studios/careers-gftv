// /account/tasks, from 7g.
//
// "A single inbox for anything the portal needs the applicant to deal with. It
// exists so a request from an admin has somewhere to land, now that
// notifications are in-portal only."
//
// The list unions two sources on the server and this draws them as one, which is
// the whole point: an applicant does not care that one of these is a row in
// gftvjobs_tasks and the other is derived from an analytics row.
//
// Three requirements shape it:
//
//   **Opening an apply prompt opens the modal from 7c in place.** Not a link to
//   the posting, not a second modal. openApplyDialog takes mode: 'resume' and
//   mounts anywhere.
//
//   **Opening an info request expands an inline panel with the admin's message
//   and a single reply box.** One round, per 7g: once the reply is in, the box
//   is replaced by what they wrote.
//
//   **Resolved items collapse under a recently completed section rather than
//   vanishing**, so somebody can check what they already dealt with.
//
// Deep links: /account/tasks?task={task_id} opens a specific item, and the
// parameter is stripped with history.replaceState once it has been handled, per
// 7g. Ownership is validated on the server by scoping the query to the session,
// so the parameter names a row rather than granting access to one.

import { api } from './api.js';
import { t } from './i18n.js';
import { hydrateIcons, iconMarkup } from './icons.js';
import { formatDate } from './format.js';
import { mountAccountPage, refreshTaskBadge } from './account-shell.js';
import { jobRowHead, escapeHtml } from './account-row.js';
import { openApplyDialog, applyDialogOpen } from './apply-dialog.js';
import { setWorking, showFormMessage, clearErrors, applyApiError } from './forms.js';

const PATH = '/account/tasks';

let payload = null;
// The item named by ?task=, held so a redraw on a language change does not
// collapse a panel somebody is typing into.
let expanded = null;

async function boot() {
  const session = await mountAccountPage({ current: PATH });
  if (!session) return;

  expanded = linkedTaskId();
  stripTaskParam();

  await load();

  document.addEventListener('gftv:localechange', () => {
    if (payload) draw();
  });

  // Answering a prompt from this page removes an item from the list.
  document.addEventListener('gftv:applychange', () => load());
}

function linkedTaskId() {
  try {
    return new URL(window.location.href).searchParams.get('task');
  } catch {
    return null;
  }
}

function stripTaskParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('task')) return;
    url.searchParams.delete('task');
    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}`);
  } catch {
    // A parameter left in the address bar is untidy, not broken.
  }
}

/* -------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------- */

async function load() {
  const list = document.querySelector('#taskList');
  list?.setAttribute('aria-busy', 'true');

  const result = await api('/api/tasks/mine');

  list?.removeAttribute('aria-busy');

  const error = document.querySelector('#tasksError');
  if (!result.ok) {
    if (error) {
      error.textContent = result.error?.message ?? t('error.unexpected');
      error.hidden = false;
    }
    return;
  }

  if (error) error.hidden = true;
  payload = result.data;
  draw();
  refreshTaskBadge();
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

function draw() {
  const items = payload.tasks ?? [];
  const open = items.filter((item) => item.is_open);
  const done = items.filter((item) => !item.is_open);

  const list = document.querySelector('#taskList');
  const empty = document.querySelector('#tasksEmpty');
  const doneBlock = document.querySelector('#taskDone');
  const doneList = document.querySelector('#taskDoneList');

  if (list) {
    list.innerHTML = open.map(itemMarkup).join('');
    hydrateIcons(list);
    wireItems(list);
  }

  if (doneBlock && doneList) {
    doneBlock.hidden = done.length === 0;
    doneList.innerHTML = done.map(itemMarkup).join('');
    hydrateIcons(doneList);
    wireItems(doneList);
  }

  // 7g: "Empty state that reads as a good thing, not an error." Shown only when
  // there is nothing at all, including nothing completed: a page with a
  // recently completed section on it is not empty.
  if (empty) empty.hidden = items.length > 0;
}

function itemMarkup(item) {
  const isPrompt = item.source === 'prompt';
  const isOpen = expanded === item.id;

  return `
    <article class="glass-card account-row task-row" data-task-id="${escapeHtml(item.id)}"
             data-task-source="${escapeHtml(item.source)}"
             data-task-type="${escapeHtml(item.task_type)}">
      <div class="account-row-head">
        <h3 class="account-row-title">${escapeHtml(itemTitle(item))}</h3>
        <div class="account-row-badges">
          <span class="badge badge-task-${escapeHtml(item.task_type)}">
            ${escapeHtml(typeLabel(item.task_type))}
          </span>
        </div>
      </div>

      <p class="account-row-note">
        ${iconMarkup('clock', { size: 16 })}
        <span>${escapeHtml(raisedLine(item))}</span>
      </p>

      ${item.job ? `<div class="task-job">${jobRowHead(item.job)}</div>` : ''}

      ${item.body ? `<p class="task-body">${escapeHtml(item.body)}</p>` : ''}

      ${
        item.response_text
          ? `<div class="task-reply-given">
               <p class="modal-section-label">${escapeHtml(t('tasks.yourReply'))}</p>
               <p>${escapeHtml(item.response_text)}</p>
             </div>`
          : ''
      }

      <div class="account-row-actions">
        ${
          isPrompt
            ? `<button type="button" class="btn btn-secondary" data-open-prompt>${escapeHtml(
                t('tasks.answerPrompt')
              )}</button>`
            : ''
        }
        ${
          canReply(item)
            ? `<button type="button" class="btn btn-secondary" data-toggle-reply
                       aria-expanded="${isOpen}">${escapeHtml(t('tasks.replyAction'))}</button>`
            : ''
        }
        ${
          canDismiss(item)
            ? `<button type="button" class="btn btn-quiet" data-dismiss>${escapeHtml(
                t('tasks.dismissAction')
              )}</button>`
            : ''
        }
      </div>

      ${canReply(item) ? replyFormMarkup(item, isOpen) : ''}
    </article>`;
}

function replyFormMarkup(item, isOpen) {
  return `
    <form method="post" class="form task-reply-form" data-reply-form ${isOpen ? '' : 'hidden'}
          novalidate>
      <div class="callout danger form-message" data-form-message role="alert" hidden></div>
      <div class="field">
        <label for="reply-${escapeHtml(item.id)}">${escapeHtml(t('tasks.replyLabel'))}</label>
        <textarea id="reply-${escapeHtml(item.id)}" name="text" rows="4"
                  maxlength="4000" required></textarea>
        <p class="field-hint">${escapeHtml(t('tasks.replyHint'))}</p>
        <p class="field-error" data-error-for="text" hidden></p>
      </div>
      <button class="btn btn-primary" type="submit">${escapeHtml(t('tasks.replySend'))}</button>
    </form>`;
}

/**
 * The title of an item.
 *
 * An admin raised task carries its own, written by a person. A prompt has none
 * to carry: the analytics row knows a posting and a time, so the sentence is a
 * dictionary string built from the posting's title, which is why the server
 * sends null rather than inventing English.
 */
function itemTitle(item) {
  if (item.source === 'prompt') {
    return t('tasks.promptTitle', { title: item.job?.title ?? '' });
  }
  return item.title ?? '';
}

function typeLabel(type) {
  const key = `tasks.type_${type}`;
  const label = t(key);
  return label === key ? '' : label;
}

function raisedLine(item) {
  const date = formatDate(item.created_at);
  if (item.source === 'prompt') return t('tasks.promptRaised', { date });
  return item.raised_by
    ? t('tasks.raisedBy', { who: item.raised_by, date })
    : t('tasks.raisedByTeam', { date });
}

/** Only an open info request with no reply on it yet. One round, per 7g. */
function canReply(item) {
  return (
    item.source === 'task' &&
    item.task_type === 'info_request' &&
    item.is_open &&
    !item.response_text
  );
}

/**
 * Only a notice. An info request is closed by the admin who read the reply, and
 * a prompt is closed by answering it or by the phase 9 cron giving up after
 * fourteen days. Neither is something to sweep off the list.
 */
function canDismiss(item) {
  return item.source === 'task' && item.task_type === 'notice' && item.is_open;
}

/* -------------------------------------------------------------------------
 * Acting on an item
 * ---------------------------------------------------------------------- */

function wireItems(root) {
  root.querySelectorAll('[data-task-id]').forEach((row) => {
    const id = row.getAttribute('data-task-id');
    const item = findItem(id);
    if (!item) return;

    row.querySelector('[data-open-prompt]')?.addEventListener('click', () => {
      if (applyDialogOpen()) return;
      openApplyDialog({
        mode: 'resume',
        jobId: item.job?.id ?? '',
        jobTitle: item.job?.title ?? '',
        analyticsId: item.id,
        rating: null,
      });
    });

    const toggle = row.querySelector('[data-toggle-reply]');
    const form = row.querySelector('[data-reply-form]');

    toggle?.addEventListener('click', () => {
      const nowOpen = form.hidden;
      form.hidden = !nowOpen;
      toggle.setAttribute('aria-expanded', String(nowOpen));
      expanded = nowOpen ? id : null;
      if (nowOpen) form.querySelector('textarea')?.focus();
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendReply(form, id);
    });

    row.querySelector('[data-dismiss]')?.addEventListener('click', (event) => {
      dismiss(event.currentTarget, id);
    });
  });
}

function findItem(id) {
  return (payload?.tasks ?? []).find((item) => item.id === id) ?? null;
}

async function sendReply(form, taskId) {
  clearErrors(form);
  setWorking(form, true);

  const text = form.querySelector('textarea')?.value ?? '';

  const result = await api('/api/tasks/respond', {
    method: 'POST',
    locale: false,
    body: { task_id: taskId, action: 'reply', text },
  });

  setWorking(form, false);

  if (!result.ok) {
    applyApiError(form, result.error, {
      conflict: t('tasks.alreadyClosed'),
    });
    return;
  }

  showFormMessage(form, 'ok', t('tasks.replySent'));
  expanded = null;
  await load();
}

async function dismiss(button, taskId) {
  button.disabled = true;

  const result = await api('/api/tasks/respond', {
    method: 'POST',
    locale: false,
    body: { task_id: taskId, action: 'dismiss' },
  });

  button.disabled = false;

  const error = document.querySelector('#tasksError');
  if (!result.ok) {
    if (error) {
      error.textContent = result.error?.message ?? t('error.unexpected');
      error.hidden = false;
    }
    return;
  }

  await load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
