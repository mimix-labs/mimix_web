// Modelo atómico ligero para el laboratorio de Ciencia.
// Se monta dentro de la escena Three.js existente: no crea otro renderer.
import { landmarkToMirroredScreen } from '../cameraViewport.js';
import { ELEMENT_BY_SYMBOL } from './periodicData.js';

const SHELL_CAPACITIES = [2, 8, 18, 32, 32, 18, 8];
const ORBIT_TILTS = [0.15, -0.45, 0.55, -0.7, 0.3, -0.25, 0.6];

let atomGroup;
let electronGroup;
let electrons = [];
let selectedElement = null;
let charge = 0;
let focusOpen = false;

function disposeGroup(group) {
  group.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

function electronDistribution(count) {
  const distribution = [];
  let remaining = Math.max(0, count);
  for (const capacity of SHELL_CAPACITIES) {
    if (!remaining) break;
    const inShell = Math.min(capacity, remaining);
    distribution.push(inShell);
    remaining -= inShell;
  }
  return distribution;
}

function displayCharge(value) {
  if (value === 0) return '0 (átomo neutro)';
  return `${value > 0 ? '+' : ''}${value}`;
}

function updatePanel() {
  if (!selectedElement) return;

  const electronCount = Math.max(0, selectedElement.atomicNumber - charge);
  document.getElementById('atom-symbol').textContent = selectedElement.symbol;
  document.getElementById('atom-name').textContent = selectedElement.name;
  document.getElementById('atom-protons').textContent = selectedElement.atomicNumber;
  document.getElementById('atom-neutrons').textContent = selectedElement.massNumber - selectedElement.atomicNumber;
  document.getElementById('atom-electrons').textContent = electronCount;
  document.getElementById('atom-charge').textContent = displayCharge(charge);
  document.getElementById('atom-shells').textContent = electronDistribution(electronCount).join(' · ');
  document.getElementById('atom-mass-number').textContent = selectedElement.massNumber;
  document.getElementById('atom-atomic-number').textContent = selectedElement.atomicNumber;
  document.getElementById('atom-charge-down').disabled = charge <= -3;
  document.getElementById('atom-charge-up').disabled = charge >= 3 || electronCount === 0;
}

function createNucleus(element) {
  const nucleus = new THREE.Group();
  const particles = [];
  const neutrons = element.massNumber - element.atomicNumber;
  const visibleParticles = Math.min(80, element.massNumber);
  const visibleProtons = Math.round((element.atomicNumber / element.massNumber) * visibleParticles);
  for (let i = 0; i < visibleProtons; i += 1) particles.push(0xff4f5e);
  for (let i = visibleProtons; i < visibleParticles; i += 1) particles.push(0x94a3b8);

  const geometry = new THREE.SphereGeometry(0.16, 14, 14);
  const materials = {
    0xff4f5e: new THREE.MeshStandardMaterial({ color: 0xff4f5e, emissive: 0x4f1019, roughness: 0.35 }),
    0x94a3b8: new THREE.MeshStandardMaterial({ color: 0x94a3b8, emissive: 0x182335, roughness: 0.3 }),
  };
  const radius = Math.max(0.24, Math.cbrt(particles.length) * 0.14);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  particles.forEach((color, index) => {
    const y = 1 - (index / Math.max(1, particles.length - 1)) * 2;
    const horizontalRadius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * index;
    const particle = new THREE.Mesh(geometry, materials[color]);
    particle.position.set(
      Math.cos(theta) * horizontalRadius * radius,
      y * radius,
      Math.sin(theta) * horizontalRadius * radius,
    );
    nucleus.add(particle);
  });
  atomGroup.add(nucleus);
}

function createElectrons(element) {
  electronGroup = new THREE.Group();
  atomGroup.add(electronGroup);
  electrons = [];
  const electronCount = Math.max(0, element.atomicNumber - charge);
  const distribution = electronDistribution(electronCount);
  const electronGeometry = new THREE.SphereGeometry(0.075, 12, 12);
  const electronMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    emissive: 0x0a1e6a,
    emissiveIntensity: 0.55,
    roughness: 0.2,
  });

  distribution.forEach((count, shellIndex) => {
    const radius = 0.75 + shellIndex * 0.48;
    const shell = new THREE.Group();
    shell.rotation.x = Math.PI / 2 + ORBIT_TILTS[shellIndex];
    shell.rotation.z = shellIndex * 0.55;
    electronGroup.add(shell);

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.7 }),
    );
    shell.add(orbit);

    for (let index = 0; index < count; index += 1) {
      const electron = new THREE.Mesh(electronGeometry, electronMaterial);
      electron.userData = {
        angle: (index / count) * Math.PI * 2,
        radius,
        speed: 0.012 + shellIndex * 0.003,
        direction: shellIndex % 2 ? -1 : 1,
      };
      shell.add(electron);
      electrons.push(electron);
    }
  });
}

function rebuildAtom() {
  if (!atomGroup || !selectedElement) return;
  while (atomGroup.children.length) {
    const child = atomGroup.children.pop();
    disposeGroup(child);
  }
  createNucleus(selectedElement);
  createElectrons(selectedElement);
  updatePanel();
}

export function initAtomLab(scene) {
  atomGroup = new THREE.Group();
  atomGroup.position.set(0, 1.55, 0);
  atomGroup.visible = false;
  scene.add(atomGroup);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.8));
  const atomLight = new THREE.DirectionalLight(0xffffff, 1.2);
  atomLight.position.set(3, 5, 6);
  scene.add(atomLight);
  document.getElementById('atom-charge-down').addEventListener('click', () => changeAtomCharge(-1));
  document.getElementById('atom-charge-up').addEventListener('click', () => changeAtomCharge(1));
  document.getElementById('atom-back').addEventListener('click', closeAtomFocus);
  updatePanel();
}

export function selectAtom(symbol) {
  const element = ELEMENT_BY_SYMBOL[symbol];
  if (!element) return;
  selectedElement = { ...element, symbol };
  charge = 0;
  atomGroup.visible = true;
  atomGroup.rotation.set(0, 0, 0);
  rebuildAtom();
  openAtomFocus();
}

export function openAtomFocus() {
  if (!selectedElement) return;
  focusOpen = true;
  atomGroup.position.set(2.15, 0.1, 0);
  atomGroup.scale.setScalar(2.2);
  document.body.classList.add('atom-focus-open');
  document.getElementById('atom-focus').hidden = false;
  document.dispatchEvent(new Event('mimix:atom-focus-open'));
}

export function closeAtomFocus() {
  focusOpen = false;
  atomGroup.visible = false;
  atomGroup.position.set(0, 1.55, 0);
  atomGroup.scale.setScalar(1);
  document.body.classList.remove('atom-focus-open');
  document.getElementById('atom-focus').hidden = true;
  document.dispatchEvent(new Event('mimix:atom-focus-close'));
}

export function rotateAtomBy(deltaX, deltaY) {
  if (!atomGroup?.visible) return;
  atomGroup.rotation.y += deltaX * 5;
  atomGroup.rotation.x = Math.max(-0.8, Math.min(0.8, atomGroup.rotation.x + deltaY * 5));
}

export function changeAtomCharge(delta) {
  if (!selectedElement) return;
  const nextCharge = Math.max(-3, Math.min(3, charge + delta));
  if (nextCharge === charge || selectedElement.atomicNumber - nextCharge < 0) return;
  charge = nextCharge;
  rebuildAtom();
}

export function hasSelectedAtom() {
  return focusOpen;
}

export function detectAtomControl(landmark) {
  const { x, y } = landmarkToMirroredScreen(landmark);
  for (const id of ['atom-back', 'atom-charge-down', 'atom-charge-up']) {
    const button = document.getElementById(id);
    const rect = button.getBoundingClientRect();
    if (!button.disabled && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      if (id === 'atom-back') return 'back';
      return id === 'atom-charge-down' ? -1 : 1;
    }
  }
  return null;
}

export function animateAtomLab() {
  if (!atomGroup?.visible) return;
  electrons.forEach((electron) => {
    const { angle, radius, speed, direction } = electron.userData;
    electron.userData.angle = angle + speed * direction;
    electron.position.set(
      Math.cos(electron.userData.angle) * radius,
      Math.sin(electron.userData.angle) * radius,
      0,
    );
  });
}
