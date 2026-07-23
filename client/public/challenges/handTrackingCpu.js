import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/vision_bundle.mjs";

const TASKS_VERSION = "0.10.15";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MAX_INFERENCE_FPS = 15;

/**
 * Ejecuta MediaPipe en CPU/WASM. Three.js conserva su contexto WebGL/Vulkan
 * independiente, por lo que este rastreador no crea un segundo contexto GPU.
 */
export async function startCpuHandTracking(videoElement, onResults) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let animationFrameId;
  let lastVideoTime = -1;
  let lastInferenceAt = 0;
  const inferenceInterval = 1000 / MAX_INFERENCE_FPS;

  const processFrame = (now) => {
    if (
      videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoElement.currentTime !== lastVideoTime &&
      now - lastInferenceAt >= inferenceInterval
    ) {
      lastVideoTime = videoElement.currentTime;
      lastInferenceAt = now;

      try {
        onResults(handLandmarker.detectForVideo(videoElement, now));
      } catch (error) {
        console.error("Error al detectar manos con MediaPipe CPU:", error);
      }
    }

    animationFrameId = requestAnimationFrame(processFrame);
  };

  animationFrameId = requestAnimationFrame(processFrame);

  return () => {
    cancelAnimationFrame(animationFrameId);
    handLandmarker.close();
  };
}
