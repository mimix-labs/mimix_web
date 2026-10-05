import { landmarkToMirroredScreen } from '@mimix/challenge-browser/cameraViewport.js';
import { CATEGORY_LABELS, ELEMENTS } from './periodicData.js';
import { selectAtom } from './atomLab.js';

let cells = [];
let listeners;
let canSelect = () => false;
let onSelect = () => {};
export function onElementSelected(callback) { onSelect = callback; }

function chooseElement(symbol) {
  if (!canSelect()) return;
  selectAtom(symbol);
  onSelect(symbol);
}

function makeCell(element) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = `element-cell category-${element.category}`;
  cell.style.gridColumn = element.group;
  cell.style.gridRow = element.period;
  cell.dataset.symbol = element.symbol;
  cell.setAttribute('aria-label', `${element.name}, ${CATEGORY_LABELS[element.category]}`);
  cell.innerHTML = `<span class="element-number">${element.atomicNumber}</span><strong>${element.symbol}</strong><small>${element.name}</small>`;
  cell.addEventListener('click', () => chooseElement(element.symbol), { signal: listeners.signal });
  return cell;
}

function makeSeriesCell(label, row, category) {
  const cell = document.createElement('div');
  cell.className = `element-cell element-series category-${category}`;
  cell.style.gridColumn = 3;
  cell.style.gridRow = row;
  cell.innerHTML = `<strong>${label}</strong><small>serie interna</small>`;
  return cell;
}

export function disposePeriodicTable() {
  listeners?.abort();
  cells = [];
  canSelect = () => false;
}

export function initPeriodicTable(isRunning) {
  disposePeriodicTable();
  listeners = new AbortController();
  canSelect = isRunning;
  const table = document.getElementById('periodic-table');
  table.replaceChildren();
  cells = ELEMENTS.map((element) => {
    const cell = makeCell(element);
    table.appendChild(cell);
    return cell;
  });
  table.append(makeSeriesCell('La–Lu', 6, 'lanthanide'), makeSeriesCell('Ac–Lr', 7, 'actinide'));
}

export function detectCardInteraction(indexTip, _camera, isStartingPinch = false) {
  const { x, y } = landmarkToMirroredScreen(indexTip);
  let hovered = null;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    cell.classList.toggle('is-hovered', inside);
    if (inside) hovered = cell;
  }
  if (hovered && isStartingPinch) {
    chooseElement(hovered.dataset.symbol);
    return hovered;
  }
  return hovered;
}
