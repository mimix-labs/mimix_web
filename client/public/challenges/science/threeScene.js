// threeScene.js
// Inicialización de Three.js y gestión de tarjetas 3D

import { animateAtomLab, initAtomLab } from "./atomLab.js";

let scene,
camera,
renderer;

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

  initAtomLab(scene);
  
  animate(); // Inicia el bucle de animación
  
}
// Bucle de animación para renderizar la escena
export function animate() {
  requestAnimationFrame(animate);
  animateAtomLab();
  renderer.render(scene, camera);
}

// Actualiza el tamaño del canvas y la cámara al cambiar el tamaño de la ventana
export function updateCanvasSize(canvasElement) {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// Exporta variables globales necesarias
export {
  scene,
  camera,
  renderer,
  initThree
};
