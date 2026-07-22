// webcam.js
// Inicialización de la webcam y MediaPipe Hands
import { detectDrag, isFist } from "./handGestures.js";
import { camera } from "./threeScene.js";
import { drawLandmarks } from "./drawUtils.js";

let draggingCardIndex = -1;
let previousLeftFistX = null;
let previousLeftFistY = null;
let isLeftFist = false;

// Inicializa la webcam y espera a que esté lista
export async function initWebcam(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
  });
  videoElement.srcObject = stream;
  return new Promise(
    (resolve) => (videoElement.onloadedmetadata = () => resolve())
  );
}

// Lógica principal de MediaPipe Hands
export function setupHands(canvasElement, canvasCtx, videoElement) {
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });
  hands.onResults((results) => {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    const handsLandmarks = results.multiHandLandmarks;
    if (!handsLandmarks || handsLandmarks.length === 0) {
      // Si no hay manos detectadas
      draggingCardIndex = -1;
      previousLeftFistX = null;
      return;
    }
    drawLandmarks(handsLandmarks, canvasElement, canvasCtx);
    let rightHand = null, leftHand = null;
    if (results.multiHandedness.length === 2) {
      results.multiHandedness.forEach((handedness, i) => {
        if (handedness.label === "Right") leftHand = handsLandmarks[i];
        else rightHand = handsLandmarks[i];
      });
    } else if (results.multiHandedness.length === 1) {
      if (results.multiHandedness[0].label === "Right")
        leftHand = handsLandmarks[0];
      else rightHand = handsLandmarks[0];
    }
    if (rightHand) {
      detectDrag(rightHand);
    } else {      
      draggingCardIndex = -1;
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
  });
  const cam = new Camera(videoElement, {
    onFrame: async () => await hands.send({ image: videoElement }),
    width: 1280,
    height: 960,
  });
  cam.start();
}
