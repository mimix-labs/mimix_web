// threeScene.js
// Inicialización de Three.js y gestión de formas y marcadores

import { SHAPES } from "./sidebarShapes.js";
import { CUBE_EDGES, OCTAHEDRON_EDGES, PRISM_EDGES, PYRAMID_EDGES } from "./constants.js";

let scene,
camera,
renderer,
cube,
cornerMarkers = [],
currentShape = "cubo",
activeColor = "#ff00ff";

// Callback para cuando se crea una forma
let onShapeCreatedCallback = null;

// Integración con robot
let robotIntegration = null;

// Array para almacenar las etiquetas de medidas
let measureLabels = [];

// Inicializa la escena Three.js
function initThree() {
  scene = new THREE.Scene(); // Crea la escena
  // Crea una cámara con perspectiva, simula cómo vemos en la vida real
  camera = new THREE.PerspectiveCamera(
    75, // Campo de visión
    window.innerWidth / window.innerHeight, // Relación de aspecto (ancho/alto)
    0.1, // Distancia mínima de visión
    1000 // Distancia máxima de visión
  );
  camera.position.z = 4; // Posiciona la cámara

  // Crea un renderizador WebGL para mostrar la escena
  renderer = new THREE.WebGLRenderer({ alpha: true }); // alpha: true -> Permite fondo transparente
  // Ajusta el tamaño del renderizador al tamaño de la ventana
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Añade el canvas del renderizador al DOM
  document.getElementById("three-canvas").appendChild(renderer.domElement);

  createShape(); // Crea una forma visible al iniciar el reto
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
    console.log('✅ Robot integrado con las formas 3D');
  } catch (error) {
    console.warn('⚠️ No se pudo cargar la integración del robot:', error);
  }
}

// Añadir esta función para registrar el callback
export function onShapeCreated(callback) {
  if (callback && typeof callback === 'function') {
    onShapeCreatedCallback = callback;
  }
}

// Función para cambiar la forma principal
function setMainShape(shapeName) {
  
  // Guardar la forma actual para compararla
  const previousShape = currentShape;
  
  // Actualizar a la nueva forma
  currentShape = shapeName;
    
  
  // Busca el color correspondiente a la forma seleccionada
  const selectedShape = SHAPES.find(shape => shape.name === shapeName);
  if (selectedShape) {
    // Si encuentra la forma, actualiza el color activo
    activeColor = '#' + selectedShape.color.toString(16).padStart(6, '0');
  }
  
  // Limpia los marcadores de esquina existentes
  cornerMarkers.forEach(marker => scene.remove(marker)); // Elimina los marcadores de esquina
  cornerMarkers = []; // Resetea el array de marcadores
  
  // Crea la nueva forma seleccionada
  createShape();

  // Notificar al robot del cambio de forma
  if (robotIntegration && previousShape !== currentShape) {
    robotIntegration.handleHandGesture('thumbsUp');
  }

  if (previousShape !== currentShape) {
    document.dispatchEvent(new CustomEvent('mimix:shape-selected', {
      detail: { shapeName: currentShape }
    }));
  }

  // Solo ejecutar el callback cuando hay un cambio real de forma
  if (previousShape !== currentShape && onShapeCreatedCallback) {
    onShapeCreatedCallback({ 
      tipo: 'A', 
      timestamp: Date.now() 
    });
  }
}

// Crea una nueva forma
function createShape() {
  // Elimina formas anteriores excepto marcadores
  if (cube) scene.remove(cube);
  scene.children = scene.children.filter(child => 
    child.name !== "filledCube"
  );

  // Si no hay marcadores, créalos primero
  if (cornerMarkers.length === 0) {
    const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xfffed6 });
    let corners = [];
    
    switch (currentShape) {
      case "cubo":
        const half = 1;
        corners = [
          [-half, -half, -half], // 0: frente-abajo-izquierda
          [half, -half, -half],  // 1: frente-abajo-derecha
          [-half, half, -half],  // 2: frente-arriba-izquierda
          [half, half, -half],   // 3: frente-arriba-derecha
          [-half, -half, half],  // 4: atrás-abajo-izquierda
          [half, -half, half],   // 5: atrás-abajo-derecha
          [-half, half, half],   // 6: atrás-arriba-izquierda
          [half, half, half]     // 7: atrás-arriba-derecha
        ];
        break;
      case "octaedro": // Antes "esfera"
        // Octaedro con 6 vértices
        corners = [
          [0, -1.2, 0],     // 0: punto inferior
          [1.2, 0, 0],      // 1: punto derecho
          [0, 0, -1.2],     // 2: punto frontal
          [-1.2, 0, 0],     // 3: punto izquierdo
          [0, 0, 1.2],      // 4: punto trasero
          [0, 1.2, 0]       // 5: punto superior
        ];
        break;
      case "prisma": // Antes "cilindro"
        // 12 vértices para un prisma hexagonal (6 arriba, 6 abajo)
        corners = [];
        
        // Generar 6 vértices para la base inferior
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          corners.push([Math.cos(angle), -1, Math.sin(angle)]);
        }
        
        // Generar 6 vértices para la base superior
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          corners.push([Math.cos(angle), 1, Math.sin(angle)]);
        }
        break;
      case "piramide": // Antes "cono"
        // 5 vértices (4 en base + 1 en punta)
        corners = [
          [-1, -1, -1],     // 0: base-frente-izquierda
          [1, -1, -1],      // 1: base-frente-derecha
          [1, -1, 1],       // 2: base-atrás-derecha
          [-1, -1, 1],      // 3: base-atrás-izquierda
          [0, 1, 0]         // 4: punta
        ];
        break;
      
    }
    
    // Crea los marcadores para cada vértice
    corners.forEach(([x, y, z]) => {
      const marker = new THREE.Mesh(markerGeo, markerMat.clone());
      marker.position.set(x, y, z);
      marker.userData.originalColor = 0xfffed6;
      scene.add(marker);
      cornerMarkers.push(marker);
    });
  }

  // Ahora SIEMPRE genera la geometría usando las posiciones de los marcadores
  let geometry = new THREE.BufferGeometry();
  const positions = [];
  cornerMarkers.forEach(marker => {
    positions.push(marker.position.x, marker.position.y, marker.position.z);
  });

  // Define los índices de las caras según la forma actual
  let indices = [];
  
  switch (currentShape) {
    case "cubo":
      indices = [
        0, 1, 2, 2, 1, 3,  // Cara frontal
        4, 6, 5, 5, 6, 7,  // Cara trasera
        0, 4, 1, 1, 4, 5,  // Cara inferior
        2, 3, 6, 6, 3, 7,  // Cara superior
        0, 2, 4, 4, 2, 6,  // Cara izquierda
        1, 5, 3, 3, 5, 7   // Cara derecha
      ];
      break;
    case "octaedro": // Antes "esfera"
      // Para un octaedro (representación manipulable)
      indices = [
        0, 1, 2,  // Cara 1
        0, 2, 3,  // Cara 2
        0, 3, 4,  // Cara 3
        0, 4, 1,  // Cara 4
        5, 2, 1,  // Cara 5
        5, 3, 2,  // Cara 6
        5, 4, 3,  // Cara 7
        5, 1, 4   // Cara 8
      ];
      break;
    case "prisma": // Antes "cilindro"
      // Para un prisma hexagonal con 12 vértices (6 abajo + 6 arriba)
      indices = [];
      
      // Base inferior (6 vértices conectados al centro)
      for (let i = 0; i < 6; i++) {
        const nextI = (i + 1) % 6;
        indices.push(i, nextI, (i + 3) % 6); // Triangulación de la base
      }
      
      // Base superior (6 vértices conectados al centro)
      for (let i = 0; i < 6; i++) {
        const nextI = (i + 1) % 6;
        indices.push(i + 6, (i + 3) % 6 + 6, nextI + 6); // Triangulación de la tapa
      }
      
      // Caras laterales (6 caras rectangulares, cada una hecha de 2 triángulos)
      for (let i = 0; i < 6; i++) {
        const nextI = (i + 1) % 6;
        indices.push(
          i, i + 6, nextI,       // Primer triángulo de la cara lateral
          nextI, i + 6, nextI + 6  // Segundo triángulo de la cara lateral
        );
      }
      break;
    case "piramide": // Antes "cono"
      // Para una pirámide con 5 vértices (4 en base + 1 en punta)
      indices = [
        0, 1, 4,  // Cara lateral 1
        1, 2, 4,  // Cara lateral 2
        2, 3, 4,  // Cara lateral 3
        3, 0, 4,  // Cara lateral 4
        0, 3, 1, 1, 3, 2  // Base (2 triángulos)
      ];
      break;
    case "poliedro": 
      // Para el poliedro simplificado con 6 vértices
      indices = [
        // Caras superiores (conectan el vértice superior con los vértices centrales)
        0, 1, 2,    // Superior-derecha-atrás
        0, 2, 3,    // Superior-atrás-izquierda
        0, 3, 4,    // Superior-izquierda-frente
        0, 4, 1,    // Superior-frente-derecha
        
        // Caras inferiores (conectan el vértice inferior con los vértices centrales)
        5, 2, 1,    // Inferior-atrás-derecha
        5, 3, 2,    // Inferior-izquierda-atrás
        5, 4, 3,    // Inferior-frente-izquierda
        5, 1, 4     // Inferior-derecha-frente
      ];
      break;
  }
  
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  // Crea el objeto relleno con la geometría actualizada
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(activeColor),
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const filledShape = new THREE.Mesh(geometry, material);
  filledShape.name = "filledCube";
  scene.add(filledShape);

  // Crea el objeto alámbrico con la misma geometría
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true
  });
  cube = new THREE.Mesh(geometry, wireMaterial);
  scene.add(cube);

  // Actualizar las medidas después de crear la forma
  updateMeasureLabels();
  
  // Notificar al robot que se creó una forma
  // if (robotIntegration) {
  //   robotIntegration.onShapeCreated(currentShape);
  // }
  
  // Llamar callback si existe
  if (onShapeCreatedCallback) {
    onShapeCreatedCallback(currentShape);
  }
}

// Función para crear etiquetas de texto 3D
function createTextLabel(text, position) {
  // Crear un canvas para el texto
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 128;
  canvas.height = 64;
  
  // Configurar el estilo del texto con mejor diseño
  context.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Fondo semi-transparente
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#00ffff'; // Color cyan para mejor contraste
  context.strokeStyle = '#000000';
  context.lineWidth = 2;
  context.font = 'bold 18px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  
  // Dibujar el texto con borde
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
  
  // Crear textura del canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  // Crear material y geometría para el sprite
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.scale.set(0.6, 0.3, 1); // Ajustar el tamaño del sprite
  
  return sprite;
}

// Función para actualizar las medidas de las aristas
function updateMeasureLabels() {
  // Remover etiquetas anteriores
  measureLabels.forEach(label => scene.remove(label));
  measureLabels = [];
  
  // Verificar que hay marcadores suficientes
  if (cornerMarkers.length === 0) return;
  
   // Seleccionar las aristas según la forma actual
  let edges = [];
  switch (currentShape) {
    case "cubo":
      if (cornerMarkers.length < 8) return;
      edges = CUBE_EDGES;
      break;
    case "octaedro":
      if (cornerMarkers.length < 6) return;
      edges = OCTAHEDRON_EDGES;
      break;
    case "prisma":
      if (cornerMarkers.length < 12) return;
      edges = PRISM_EDGES;
      break;
    case "piramide":
      if (cornerMarkers.length < 5) return;
      edges = PYRAMID_EDGES;
      break;
    default:
      return; // No mostrar medidas para formas no definidas
  }

  // Crear etiquetas para cada arista
  edges.forEach((edge, index) => {
    const [startIndex, endIndex] = edge;

    // Verificar que los índices sean válidos
    if (startIndex >= cornerMarkers.length || endIndex >= cornerMarkers.length) {
      return;
    }

    const startPos = cornerMarkers[startIndex].position;
    const endPos = cornerMarkers[endIndex].position;
    
    // Calcular la distancia entre los vértices
    const distance = startPos.distanceTo(endPos);
    
    // Calcular el punto medio de la arista
    const midPoint = new THREE.Vector3()
      .addVectors(startPos, endPos)
      .multiplyScalar(0.5);
    
    // Formatear la distancia a 2 decimales
    const distanceText = distance.toFixed(2);
    
    // Crear la etiqueta de texto
    const label = createTextLabel(distanceText, midPoint);
    
    // Añadir un pequeño offset para evitar que se superpongan con la geometría
    const offset = calculateLabelOffset(startPos, endPos, currentShape);
    label.position.add(offset);
    
    // Agregar a la escena y al array
    scene.add(label);
    measureLabels.push(label);
  });
}

// Función para calcular el offset de las etiquetas según la forma
function calculateLabelOffset(startPos, endPos, shape) {
  const baseOffset = new THREE.Vector3()
    .subVectors(endPos, startPos)
    .normalize()
    .cross(camera.position.clone().normalize())
    .multiplyScalar(0.2);
  
  // Ajustar el offset según la forma para mejor visibilidad
  switch (shape) {
    case "cubo":
      return baseOffset.multiplyScalar(1.2);
    case "octaedro":
      return baseOffset.multiplyScalar(1.5);
    case "prisma":
      // Para el prisma, usar un offset más grande para las aristas verticales
      const edgeVector = new THREE.Vector3().subVectors(endPos, startPos);
      if (Math.abs(edgeVector.y) > 0.5) { // Es una arista vertical
        return baseOffset.multiplyScalar(2.0);
      }
      return baseOffset.multiplyScalar(1.3);
    case "piramide":
      // Para la pirámide, ajustar según si la arista conecta con la punta
      if (startPos.y > 0.5 || endPos.y > 0.5) { // Una de las puntas está en la cima
        return baseOffset.multiplyScalar(1.8);
      }
      return baseOffset.multiplyScalar(1.1);
    default:
      return baseOffset;
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
  cube,
  cornerMarkers,
  currentShape,
  activeColor,
  initThree,
  createShape,
  setMainShape,
  updateMeasureLabels  // NUEVO: Exportar la función de actualización de medidas
};
