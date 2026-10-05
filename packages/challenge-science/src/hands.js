// webcam.js
// Inicialización de la webcam y MediaPipe Hands
import { detectDrag, isFist } from "./handGestures.js";
import { camera } from "./threeScene.js";
import { drawLandmarks } from "./drawUtils.js";
import { landmarkToMirroredScreen } from "@mimix/challenge-browser/cameraViewport.js";

let draggingCardIndex = -1;
let previousLeftFistX = null;
let previousLeftFistY = null;
let isLeftFist = false;

export function handleHandResults(canvasElement, canvasCtx, results) {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    const handsLandmarks = results.landmarks;
    if (!handsLandmarks || handsLandmarks.length === 0) {
      // Si no hay manos detectadas
      draggingCardIndex = -1;
      previousLeftFistX = null;
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
      draggingCardIndex = -1;
    }
    if (leftHand && isFist(leftHand)) {
      isLeftFist = true;
      const { x, y } = landmarkToMirroredScreen(leftHand[9]);
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
