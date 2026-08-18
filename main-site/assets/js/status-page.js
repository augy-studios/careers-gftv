// The /status page. Section 0c: public, linked from the footer and the notice
// bar, lists every phase with its status and description, marks the current
// one, and states plainly that dates are not promised. It doubles as the
// changelog, so a shipped phase also shows a short line about what became
// available.
//
// Everything on the page comes from /assets/build-status.json. Nothing here
// hardcodes a phase number, a phase name, or a status.
//
// The page builds its own markup rather than carrying data-i18n attributes,
// so it redraws on a language change instead of being retranslated in place.

import { loadBuildStatus, currentPhase, allShipped, phaseText } from './build-status.js';
import { hydrateIcons } from './icons.js';
import { t } from './i18n.js';

const STATUS_LABEL_KEY = {
  shipped: 'status.live',
  building: 'status.beingBuilt',
  planned: 'status.planned',
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
    if (summary) summary.textContent = t('status.loadError');
    return;
  }

  const shipped = phases.filter((p) => p.status === 'shipped').length;
  const building = currentPhase(status);

  if (summary) {
    if (allShipped(status)) {
      summary.textContent = t('status.summaryAllShipped');
    } else if (building) {
      summary.textContent = t('status.summaryBuilding', {
        shipped,
        total: phases.length,
        number: building.number,
        name: phaseText(building, 'name'),
      });
    } else {
      summary.textContent = t('status.summaryPlain', {
        shipped,
        total: phases.length,
      });
    }
  }

  list.replaceChildren(
    ...phases.map((phase) => {
      const item = document.createElement('li');
      item.className = 'glass-card phase-item';
      if (phase.status === 'building') item.setAttribute('data-current', 'true');

      const note = phaseText(phase, 'shipped_note');

      item.innerHTML = `
        <div class="phase-item-head">
          <span class="phase-number tabular">${escapeHtml(
            t('status.phaseNumber', { number: phase.number })
          )}</span>
          <span class="phase-name">${escapeHtml(phaseText(phase, 'name'))}</span>
          <span class="status-pill" data-status="${escapeAttr(phase.status)}">
            <span data-icon="${STATUS_ICON[phase.status] ?? 'clock'}" data-icon-size="14"></span>
            ${escapeHtml(t(STATUS_LABEL_KEY[phase.status] ?? 'status.planned'))}
          </span>
        </div>
        <p>${escapeHtml(phaseText(phase, 'description'))}</p>
        ${
          phase.status === 'shipped' && note
            ? `<p class="shipped-note">${escapeHtml(note)}</p>`
            : ''
        }
      `;

      return item;
    })
  );

  hydrateIcons(list);

  document.title = building
    ? t('status.pageTitlePhase', { number: building.number })
    : t('status.pageTitle');
}

let loaded = null;

function draw() {
  if (!loaded) return;
  render(loaded);
}

loadBuildStatus().then((status) => {
  loaded = status;
  draw();
});

// The shell applies the stored language after this module has already run, and
// the language can change again at any time, so redraw on both.
document.addEventListener('gftv:localechange', draw);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
