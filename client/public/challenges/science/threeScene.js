// threeScene.js
// Inicialización de Three.js y gestión de tarjetas 3D

import { createCards, clearCards } from "./sidebarShapes.js";

let scene,
camera,
renderer;

// Callback para cuando se crea una tarjeta
let onCardCreatedCallback = null;

// Integración con robot
let robotIntegration = null;

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

  // Crear las tarjetas 3D
  createCards(scene);
  
  animate(); // Inicia el bucle de animación
  
  // Inicializar integración con robot
  initRobotIntegration();
}

// Función para inicializar la integración con el robot
async function initRobotIntegration() {
  try {
    // Cargar dinámicamente el módulo de integración del robot
    const { default: RobotShapeIntegration } = await import('../../robot/robotShapeIntegration.js');
    robotIntegration = RobotShapeIntegration;
    await robotIntegration.init();
    console.log('✅ Robot integrado con las tarjetas 3D');
  } catch (error) {
    console.warn('⚠️ No se pudo cargar la integración del robot:', error);
  }
}

// Añadir esta función para registrar el callback
export function onCardCreated(callback) {
  if (callback && typeof callback === 'function') {
    onCardCreatedCallback = callback;
  }
}
// Bucle de animación para renderizar la escena
export function animate() {
  requestAnimationFrame(animate);
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
