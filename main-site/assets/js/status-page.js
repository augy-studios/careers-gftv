// The /status page. Section 0c: public, linked from the footer and the notice
// bar, lists every phase with its status and description, marks the current
// one, and states plainly that dates are not promised. It doubles as the
// changelog, so a shipped phase also shows a short line about what became
// available.
//
// Everything on the page comes from /assets/build-status.json. Nothing here
// hardcodes a phase number, a phase name, or a status.

import { loadBuildStatus, currentPhase, allShipped } from './build-status.js';
import { hydrateIcons } from './icons.js';

const STATUS_LABEL = {
  shipped: 'Live',
  building: 'Being built now',
  planned: 'Planned',
};

const STATUS_ICON = {
  shipped: 'check',
  building: 'build',
  planned: 'clock',
};

function render(status) {
  const list = document.querySelector('#phaseList');
  const summary = document.querySelector('#statusSummary');
  if (!list) return;

  const phases = status.phases ?? [];

  if (phases.length === 0) {
    if (summary) {
      summary.textContent =
        'The status file could not be loaded. Try reloading the page.';
    }
    return;
  }

  const shipped = phases.filter((p) => p.status === 'shipped').length;
  const building = currentPhase(status);

  if (summary) {
    if (allShipped(status)) {
      summary.textContent =
        'Every phase has shipped. This page stays as the changelog.';
    } else if (building) {
      summary.textContent =
        `${shipped} of ${phases.length} phases are live. ` +
        `Phase ${building.number}, ${building.name}, is being built now.`;
    } else {
      summary.textContent = `${shipped} of ${phases.length} phases are live.`;
    }
  }

  list.replaceChildren(
    ...phases.map((phase) => {
      const item = document.createElement('li');
      item.className = 'glass-card phase-item';
      if (phase.status === 'building') item.setAttribute('data-current', 'true');

      item.innerHTML = `
        <div class="phase-item-head">
          <span class="phase-number tabular">Phase ${phase.number}</span>
          <span class="phase-name">${escapeHtml(phase.name)}</span>
          <span class="status-pill" data-status="${escapeAttr(phase.status)}">
            <span data-icon="${STATUS_ICON[phase.status] ?? 'clock'}" data-icon-size="14"></span>
            ${STATUS_LABEL[phase.status] ?? phase.status}
          </span>
        </div>
        <p>${escapeHtml(phase.description)}</p>
        ${
          phase.status === 'shipped' && phase.shipped_note
            ? `<p class="shipped-note">${escapeHtml(phase.shipped_note)}</p>`
            : ''
        }
      `;

      return item;
    })
  );

  hydrateIcons(list);

  document.title = building
    ? `Build status, phase ${building.number} | Careers@GFTV`
    : 'Build status | Careers@GFTV';
}

loadBuildStatus().then(render);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
