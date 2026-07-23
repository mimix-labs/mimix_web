// webcam.js
// Inicialización de la webcam y MediaPipe Hands
// Comentario
import { detectDrag, isFist } from "./handGestures.js";
import { cornerMarkers, camera } from "./threeScene.js";
import { drawLandmarks } from "./drawUtils.js";
import { startCpuHandTracking } from "../handTrackingCpu.js";
import { startRobotHandTracking } from "../robotVision.js";

let draggingCornerIndex = -1;
let previousLeftFistX = null;
let previousLeftFistY = null;
let isLeftFist = false;

// Inicializa la webcam y espera a que esté lista
export async function initWebcam(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
  videoElement.srcObject = stream;
  return new Promise(
    (resolve) => (videoElement.onloadedmetadata = () => resolve())
  );
}

// Lógica principal de MediaPipe Hands
export async function setupHands(canvasElement, canvasCtx, videoElement) {
  return startCpuHandTracking(videoElement, (results) =>
    handleHandResults(canvasElement, canvasCtx, results)
  );
}

// Usa la misma lógica de gestos, pero los landmarks llegan desde la cámara de
// la Jetson en vez de crear otro contexto WebGL/MediaPipe en Chromium.
export function setupRobotHands(canvasElement, canvasCtx) {
  return startRobotHandTracking((results) =>
    handleHandResults(canvasElement, canvasCtx, results)
  );
}

function handleHandResults(canvasElement, canvasCtx, results) {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    const handsLandmarks = results.landmarks;
    if (!handsLandmarks || handsLandmarks.length === 0) {
      // Si no hay manos detectadas
      
      draggingCornerIndex = -1;
      previousLeftFistX = null;
      cornerMarkers.forEach((marker) =>
        marker.material.color.set(marker.userData.originalColor)
      );
      return;
    }
    drawLandmarks(handsLandmarks, canvasElement, canvasCtx);
    let rightHand = null, leftHand = null;
    if (results.handedness.length === 2) {
      results.handedness.forEach((categories, i) => {
        if (categories[0]?.categoryName === "Right") leftHand = handsLandmarks[i];
        else rightHand = handsLandmarks[i];
      });
    } else if (results.handedness.length === 1) {
      if (results.handedness[0][0]?.categoryName === "Right")
        leftHand = handsLandmarks[0];
      else rightHand = handsLandmarks[0];
    }
    if (rightHand) {
      detectDrag(rightHand);
    } else {      
      draggingCornerIndex = -1;
      cornerMarkers.forEach((marker) =>
        marker.material.color.set(marker.userData.originalColor)
      );
    }
    if (leftHand && isFist(leftHand)) {
      isLeftFist = true;
      const x = (1 - leftHand[9].x) * window.innerWidth;
      const y = leftHand[9].y * window.innerHeight;
      if (previousLeftFistX !== null && previousLeftFistY !== null) {
        const deltaX = x - previousLeftFistX;
        const deltaY = y - previousLeftFistY;
        const radius = camera.position.length();
        const theta =
          Math.atan2(camera.position.x, camera.position.z) + deltaX * -0.005;
        const phi =
          Math.atan2(
            camera.position.y,
            Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2)
          ) -
          deltaY * -0.005;
        const clampedPhi = Math.max(
          -Math.PI / 2 + 0.1,
          Math.min(Math.PI / 2 - 0.1, phi)
        );
        camera.position.x = radius * Math.sin(theta) * Math.cos(clampedPhi);
        camera.position.z = radius * Math.cos(theta) * Math.cos(clampedPhi);
        camera.position.y = radius * Math.sin(clampedPhi);
        camera.lookAt(0, 0, 0);
      }
      previousLeftFistX = x;
      previousLeftFistY = y;
    } else {
      isLeftFist = false;
      previousLeftFistX = null;
      previousLeftFistY = null;
    }
}

