// handGestures.js
// Detección de gestos de mano y lógica de interacción con tarjetas 3D
import { camera } from "./threeScene.js";
import { detectCardInteraction } from "./sidebarShapes.js";
import { changeAtomCharge, detectAtomControl, hasSelectedAtom, rotateAtomBy } from './atomLab.js';

let draggingCardIndex = -1;
let isPinching = false;
let pinchThreshold = 0.045;
let previousPinchPosition = null;
let isDragging = false;
let activePinchAction = null;

// Detecta la interacción con tarjetas usando gestos de mano
export function detectDrag(handLandmarks) {
  // Obtiene la posición de la punta del índice
  const indexTip = handLandmarks[8];
  // Obtiene la posición de la punta del pulgar
  const thumbTip = handLandmarks[4];
  
  // Calcular distancia de pinch
  const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
  const isCurrentlyPinching = pinchDist < pinchThreshold;
  
  // Calcular posición promedio del pinch (punto medio entre pulgar e índice)
  const pinchX = (indexTip.x + thumbTip.x) / 2;
  const pinchY = (indexTip.y + thumbTip.y) / 2;
  const currentPinchPosition = { x: pinchX, y: pinchY };
  
  // Detectar inicio del pinch
  if (isCurrentlyPinching && !isPinching) {
    isPinching = true;
    previousPinchPosition = currentPinchPosition;
    const chargeDelta = detectAtomControl(indexTip);
    if (chargeDelta !== null) {
      changeAtomCharge(chargeDelta);
      activePinchAction = 'control';
      return;
    }
    // Las tarjetas ahora eligen un átomo; no se desplazan por el escenario.
    const selectedCard = detectCardInteraction(indexTip, camera, true);
    if (selectedCard) activePinchAction = 'card';
    else if (hasSelectedAtom()) {
      activePinchAction = 'atom';
      isDragging = true;
    }
  }
  // Mantener el pinch sobre el modelo permite observarlo desde otros ángulos.
  else if (isCurrentlyPinching && isPinching && activePinchAction === 'atom') {
    if (previousPinchPosition) {
      const deltaX = currentPinchPosition.x - previousPinchPosition.x;
      const deltaY = currentPinchPosition.y - previousPinchPosition.y;
      
      rotateAtomBy(deltaX, deltaY);
    }
    previousPinchPosition = currentPinchPosition;
  }
  // Finalizar el pinch
  else if (!isCurrentlyPinching && isPinching) {
    isPinching = false;
    isDragging = false;
    draggingCardIndex = -1;
    activePinchAction = null;
    previousPinchPosition = null;
  }
  // Sin pinch - solo hover
  else {
    detectCardInteraction(indexTip, camera, false);
  }
}

// Detecta si la mano está en puño (para rotación de cámara)
export function isFist(landmarks) {
  // Verifica si todos los dedos están doblados
  const fingerTips = [8, 12, 16, 20]; // Índice, medio, anular, meñique
  const fingerBases = [6, 10, 14, 18];
  
  let foldedFingers = 0;
  
  for (let i = 0; i < fingerTips.length; i++) {
    if (landmarks[fingerTips[i]].y > landmarks[fingerBases[i]].y) {
      foldedFingers++;
    }
  }
  
  // También verifica el pulgar
  if (landmarks[4].x > landmarks[3].x) {
    foldedFingers++;
  }
  
  return foldedFingers >= 4; // Al menos 4 dedos doblados
}

// Exporta variables globales necesarias
export { draggingCardIndex, isPinching, pinchThreshold, isDragging };
