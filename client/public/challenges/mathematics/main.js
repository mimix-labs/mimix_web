// main.js
// Punto de entrada del proyecto, inicializa todo y conecta los módulos
import { initThree, updateCanvasSize, onShapeCreated } from "./threeScene.js";
import { initWebcam, setupHands, setupRobotHands } from "./webcam.js";
import { isRobotVisionMode, startRobotVideo } from "../robotVision.js";
import { startRobotWebBridge } from "../robotWebBridge.js";
// import { drawColorPickerWheel } from "./drawUtils.js";

// Inicializar Socket.io
const socket = io();

// Obtiene el elemento de video de la webcam
const videoElement = document.getElementById("webcam");
const robotCameraElement = document.getElementById("robot-camera");
// Obtiene el elemento canvas para dibujar
const canvasElement = document.getElementById("canvas");
// Obtiene el contexto 2D del canvas
const canvasCtx = canvasElement.getContext("2d");
let robotBridge;

document.addEventListener('mimix:shape-selected', ({ detail }) => {
  robotBridge?.updateContext({ selectedObject: detail?.shapeName || null });
});

// Registrar el callback para cuando se crea una forma
onShapeCreated((data) => {
  console.log("Forma creada:", data);
  // Aquí puedes emitir un evento a través de Socket.io
  socket.emit("lenvantarceja", data);
});

// Función principal que inicializa todo
async function main() {
  robotBridge = startRobotWebBridge('mathematics');
  const robotVision = await isRobotVisionMode();
  document.body.dataset.visionSource = robotVision ? "robot" : "browser";
  if (robotVision) {
    // La cámara pertenece al proceso nativo de la Jetson, no al navegador.
    videoElement.hidden = true;
    startRobotVideo(robotCameraElement);
  } else {
    await initWebcam(videoElement);
  }
  initThree(); // Inicializa la escena 3D
  updateCanvasSize(canvasElement); // Ajusta el tamaño de los canvas
  window.addEventListener("resize", () => updateCanvasSize(canvasElement)); // Actualiza el tamaño al cambiar la ventana
  // drawColorPickerWheel(); // Dibuja la rueda de color
  if (robotVision) {
    setupRobotHands(canvasElement, canvasCtx);
  } else {
    await setupHands(canvasElement, canvasCtx, videoElement);
  }
}

main(); // Ejecuta la función principal

