// handGestures.js
// Detección de gestos de mano y lógica de interacción con el cubo
import { camera, cornerMarkers, createShape, setMainShape } from "./threeScene.js";

import { SHAPES } from "./sidebarShapes.js";

let draggingCornerIndex = -1;
let isPinching = false;
let pinchThreshold = 0.045;

// Detecta el arrastre de esquinas del cubo usando gestos de mano
export function detectDrag(handLandmarks) {
  // Obtiene la posición de la punta del índice
  const indexTip = handLandmarks[8];
  // Obtiene la posición de la punta del pulgar
  const thumbTip = handLandmarks[4];
  // Calcula la posición X en pantalla del índice
  const screenX = (1 - indexTip.x) * window.innerWidth;
  // Calcula la posición Y en pantalla del índice
  const screenY = indexTip.y * window.innerHeight;
  // Calcula la distancia entre la punta del índice y el pulgar (para detectar el "pinch")
  const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

  // Inicializa el índice del marcador sobre el que se está "hovering"
  let hoveringIndex = -1;
  // Recorre todos los marcadores de las esquinas
  for (let i = 0; i < cornerMarkers.length; i++) {
    const marker = cornerMarkers[i];
    // Proyecta la posición del marcador a coordenadas de pantalla
    const projected = marker.position.clone().project(camera);
    // Calcula la posición X del marcador en pantalla
    const markerX = ((projected.x + 1) / 2) * window.innerWidth;
    // Calcula la posición Y del marcador en pantalla
    const markerY = ((1 - projected.y) / 2) * window.innerHeight;
    // Calcula la distancia entre el dedo índice y el marcador
    const dist = Math.hypot(screenX - markerX, screenY - markerY);
    // Si la distancia es menor a 40px, se considera que está "hovering"
    if (dist < 40) {
      hoveringIndex = i;
      // Cambia el color del marcador para indicar "hover"
      marker.material.color.set(0xff9700);
    } else {
      // Restaura el color original si no está "hovering"
      marker.material.color.set(marker.userData.originalColor);
    }
  }

  // Determina si actualmente se está haciendo "pinch"
  const isCurrentlyPinching = pinchDist < pinchThreshold;

  // Detectar pinch en sidebar para cambiar formas
  if (isCurrentlyPinching) {
    // Verifica cada forma en el sidebar
    for (const shape of SHAPES) {
      const canvas = document.getElementById(shape.id);
      if (canvas) {
        // Obtiene las coordenadas del canvas
        const rect = canvas.getBoundingClientRect();
        // Verifica si el pinch está sobre esta forma
        if (
          screenX >= rect.left &&
          screenX <= rect.right &&
          screenY >= rect.top &&
          screenY <= rect.bottom
        ) {
          console.log("Cambiando forma a:", shape.name);
          setMainShape(shape.name);
          return; // Sale de la función para no procesar interacciones con marcadores
        }
      }
    }
  }

  // Reset estado hover para todas las formas
  for (const shape of SHAPES) {
    const canvas = document.getElementById(shape.id);
    if (canvas) {
      canvas.classList.remove("hover-effect");
    }
  }

  // Determina si los dedos están cerca, pero no necesariamente haciendo pinch (pre-pinch)
  const isApproachingPinch = pinchDist < 85; // Umbral más amplio que pinchThreshold

  // Aplicar efecto hover cuando los dedos se acerquen a hacer pinch sobre una forma
  if (isApproachingPinch) {
    // Verifica cada forma en el sidebar
    for (const shape of SHAPES) {
      const canvas = document.getElementById(shape.id);
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (
          screenX >= rect.left &&
          screenX <= rect.right &&
          screenY >= rect.top &&
          screenY <= rect.bottom
        ) {
          // Aplica clase para efecto hover
          canvas.classList.add("hover-effect");
          
          // Si además está haciendo pinch completo, cambia la forma
          if (isCurrentlyPinching) {
            console.log("Cambiando forma a:", shape.name);
            setMainShape(shape.name);
            return;
          }
          break; // Solo aplicamos efecto a una forma a la vez
        }
      }
    }
  }

  // Si no se está arrastrando ninguna esquina y se hace "pinch" sobre un marcador, comienza el arrastre
  if (draggingCornerIndex === -1 && isCurrentlyPinching && hoveringIndex !== -1) {
    draggingCornerIndex = hoveringIndex;
  }
  // Si se está arrastrando una esquina y se mantiene el "pinch", actualiza la posición del marcador
  if (draggingCornerIndex !== -1 && isCurrentlyPinching) {
    const marker = cornerMarkers[draggingCornerIndex];
    // Proyecta la posición actual del marcador
    const projected = marker.position.clone().project(camera);
    // Guarda la coordenada Z original en espacio normalizado
    const originalZ = projected.z;
    // Convierte la posición del dedo índice a coordenadas normalizadas de dispositivo (NDC)
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;
    // Calcula la nueva posición en el espacio 3D usando la cámara
    const newPosition = new THREE.Vector3(ndcX, ndcY, originalZ).unproject(camera);
    // Actualiza la posición del marcador
    marker.position.copy(newPosition);
    
    // Actualizar la forma
    createShape(); 
    
    // // Notificar al robot del arrastre de vértice (ocasionalmente)
    // if (window.robotShapeIntegration && Math.random() > 0.95) { // 5% de probabilidad por frame
    //   window.robotShapeIntegration.onVertexDragged(draggingCornerIndex);
    // }
  }
  // Si se deja de hacer "pinch" después de arrastrar, termina el arrastre
  if (!isCurrentlyPinching && isPinching) {
    draggingCornerIndex = -1;
  }
  // Actualiza el estado global de "pinch"
  isPinching = isCurrentlyPinching;
}

// Detecta si la mano está en forma de puño
export function isFist(landmarks) {
  const fingers = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  return fingers.every(([tip, pip]) => landmarks[tip].y > landmarks[pip].y);
}

// Exporta variables globales necesarias
export { draggingCornerIndex, isPinching, pinchThreshold };

