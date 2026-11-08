// The /status page. Section 0c: public, linked from the footer and the notice
// bar, lists every phase with its status and description, marks the current
// one, and states plainly that dates are not promised. It doubles as the
// changelog, so a shipped phase also shows a short line about what became
// available.
//
// Everything on the page comes from /assets/build-status.json. Nothing here
// hardcodes a phase number, a phase name, or a status.
//
// The page does not carry data-i18n attributes on the phase cards, so it
// redraws on a language change instead of being retranslated in place. The card
// structure lives in <template> elements inside the page's HTML (see
// renderBuildBody in api/_lib/status.js). This script only clones those
// templates, fills in text, and toggles the hidden attribute.

import {
  loadBuildStatus,
  loadFeatureOverrides,
  currentPhase,
  allShipped,
  phaseText,
} from './build-status.js';
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

/**
 * Find the element inside a cloned template (or a container) that is marked
 * with a given data-field name.
 *
 * @param {ParentNode} container the cloned template or an existing element
 * @param {string} fieldName the value of the data-field attribute to look for
 * @returns {Element} the matching element
 */
function findField(container, fieldName) {
  return container.querySelector(`[data-field="${fieldName}"]`);
}

/**
 * Work out which sentence the summary banner should show.
 *
 * @param {object} status the parsed build status file
 * @param {object[]} phases every phase in the file
 * @param {object|null} buildingPhase the phase being built right now, if any
 * @returns {string} the translated summary sentence
 */
function summaryText(status, phases, buildingPhase) {
  const shippedCount = phases.filter((phase) => phase.status === 'shipped').length;

  if (allShipped(status)) {
    return t('status.summaryAllShipped');
  }

  if (buildingPhase) {
    return t('status.summaryBuilding', {
      shipped: shippedCount,
      total: phases.length,
      number: buildingPhase.number,
      name: phaseText(buildingPhase, 'name'),
    });
  }

  return t('status.summaryPlain', {
    shipped: shippedCount,
    total: phases.length,
  });
}

/**
 * Build one phase card by cloning the phase template and filling it in.
 *
 * @param {HTMLTemplateElement} template the #phaseItemTemplate element
 * @param {object} phase one entry from the build status file
 * @returns {DocumentFragment} the finished card, ready to insert
 */
function buildPhaseCard(template, phase) {
  const card = template.content.cloneNode(true);
  const cardElement = card.firstElementChild;

  if (phase.status === 'building') {
    cardElement.setAttribute('data-current', 'true');
  }

  findField(card, 'phaseNumber').textContent = t('status.phaseNumber', { number: phase.number });
  findField(card, 'phaseName').textContent = phaseText(phase, 'name');
  findField(card, 'phaseDescription').textContent = phaseText(phase, 'description');

  const statusPill = findField(card, 'statusPill');
  statusPill.setAttribute('data-status', phase.status);

  const iconName = STATUS_ICON[phase.status] ?? 'clock';
  findField(card, 'statusIcon').setAttribute('data-icon', iconName);

  const labelKey = STATUS_LABEL_KEY[phase.status] ?? 'status.planned';
  findField(card, 'statusLabel').textContent = t(labelKey);

  // The shipped note is only shown for a phase that has shipped and has one.
  const shippedNote = phaseText(phase, 'shipped_note');
  if (phase.status === 'shipped' && shippedNote) {
    const noteElement = findField(card, 'shippedNote');
    noteElement.textContent = shippedNote;
    noteElement.hidden = false;
  }

  return card;
}

/**
 * Draw the phase list and the summary banner.
 *
 * @param {object} status the parsed build status file
 */
function render(status) {
  const phaseList = document.querySelector('#phaseList');
  const summary = document.querySelector('#statusSummary');
  const phaseTemplate = document.querySelector('#phaseItemTemplate');
  if (!phaseList || !phaseTemplate) return;

  const phases = status.phases ?? [];

  if (phases.length === 0) {
    // The file did not load. Drop the skeletons instead of leaving them
    // pulsing forever, which would suggest something is still on its way.
    phaseList.replaceChildren();
    phaseList.removeAttribute('aria-busy');
    if (summary) {
      summary.textContent = t('status.loadError');
    }
    return;
  }

  const buildingPhase = currentPhase(status);

  if (summary) {
    summary.textContent = summaryText(status, phases, buildingPhase);
  }

  const phaseCards = phases.map((phase) => buildPhaseCard(phaseTemplate, phase));
  phaseList.replaceChildren(...phaseCards);

  phaseList.removeAttribute('aria-busy');
  hydrateIcons(phaseList);

  if (buildingPhase) {
    document.title = t('status.pageTitlePhase', { number: buildingPhase.number });
  } else {
    document.title = t('status.pageTitle');
  }
}

/**
 * Anything switched off right now, per 8.12: "A feature that is off appears on
 * /status as currently unavailable with its note, since that page is already
 * where somebody goes to find out what is going on."
 *
 * Above the phase list and not inside it, because it is a different kind of
 * fact: the list says what has been built, and this says what is working. The
 * two are deliberately not merged, for the same reason an override never edits
 * build-status.json.
 *
 * Hidden entirely when nothing is off, which is almost always.
 *
 * @param {object|null} overrides feature key to override details
 */
function renderOutages(overrides) {
  const holder = document.querySelector('#statusOutages');
  const itemTemplate = document.querySelector('#outageItemTemplate');
  if (!holder || !itemTemplate) return;

  const allOverrides = overrides ?? {};

  // Held is not broken: phase 15's Malay and Tamil are off until somebody
  // switches them on, and this list is what is being fixed, per the lede.
  const outageKeys = Object.keys(allOverrides).filter((key) => {
    return allOverrides[key]?.held !== true;
  });

  holder.hidden = outageKeys.length === 0;

  const outageList = findField(holder, 'outageList');

  if (outageKeys.length === 0) {
    outageList.replaceChildren();
    return;
  }

  findField(holder, 'outagesHeading').textContent = t('status.outagesHeading');
  findField(holder, 'outagesLede').textContent = t('status.outagesLede');

  const outageItems = outageKeys.map((key) => {
    const item = itemTemplate.content.cloneNode(true);
    findField(item, 'featureName').textContent = t(`featureName.${key}`);
    findField(item, 'outageNote').textContent = allOverrides[key]?.note ?? '';
    return item;
  });

  outageList.replaceChildren(...outageItems);
}

let loadedStatus = null;
let currentOutages = null;

/** Redraw both parts of the page from whatever has loaded so far. */
function draw() {
  if (!loadedStatus) return;
  render(loadedStatus);
  renderOutages(currentOutages);
}

loadBuildStatus().then((status) => {
  loadedStatus = status;
  draw();
});

// Separate and not awaited with the file above: a failure to read the overrides
// must leave the page working with everything on, which is exactly what an
// empty answer does here.
loadFeatureOverrides().then((featuresSwitchedOff) => {
  currentOutages = featuresSwitchedOff;
  draw();
});

// The shell applies the stored language after this module has already run, and
// the language can change again at any time, so redraw on both.
document.addEventListener('gftv:localechange', draw);
