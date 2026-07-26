// threeScene.js
// Inicialización de Three.js y gestión de tarjetas 3D

import { animateAtomLab, initAtomLab } from "./atomLab.js";

let scene,
camera,
renderer;
let renderWidth = 0;
let renderHeight = 0;

// Inicializa la escena Three.js
function initThree() {
  scene = new THREE.Scene(); // Crea la escena
  // Crea una cámara con perspectiva
  camera = new THREE.PerspectiveCamera(
    75, // Campo de visión
    window.innerWidth / window.innerHeight, // Relación de aspecto (ancho/alto)
    0.1, // Distancia mínima de visión
    1000 // Distancia máxima de visión
  );
  camera.position.set(0, 0, 8); // Posiciona la cámara para ver las tarjetas

  // Crea un renderizador WebGL para mostrar la escena
  renderer = new THREE.WebGLRenderer({ alpha: true }); // alpha: true -> Permite fondo transparente
  // Ajusta el tamaño del renderizador al tamaño de la ventana
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Añade el canvas del renderizador al DOM
  document.getElementById("three-canvas").appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  initAtomLab(scene);
  
  animate(); // Inicia el bucle de animación
  
}
// Bucle de animación para renderizar la escena
export function animate() {
  requestAnimationFrame(animate);
  animateAtomLab();
  renderScene();
}

function renderScene() {
  const renderLayer = document.getElementById('three-canvas');
  const renderRegion = document.body.classList.contains('atom-focus-open')
    ? document.getElementById('atom-render-region')
    : null;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let left = 0;
  let top = 0;
  if (renderRegion) {
    const rect = renderRegion.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    left = Math.floor(rect.left);
    top = Math.floor(rect.top);
  }

  renderLayer.style.left = `${left}px`;
  renderLayer.style.top = `${top}px`;
  renderLayer.style.width = `${width}px`;
  renderLayer.style.height = `${height}px`;
  if (width !== renderWidth || height !== renderHeight) {
    renderer.setSize(width, height, false);
    renderWidth = width;
    renderHeight = height;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// Actualiza el tamaño del canvas y la cámara al cambiar el tamaño de la ventana
export function updateCanvasSize(canvasElement) {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
  renderWidth = 0;
  renderHeight = 0;
}

// Exporta variables globales necesarias
export {
  scene,
  camera,
  renderer,
  initThree
};
