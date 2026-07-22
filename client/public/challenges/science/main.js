// main.js
// Punto de entrada del proyecto, inicializa todo y conecta los módulos
import { initThree, updateCanvasSize, onCardCreated } from "./threeScene.js";
import { initWebcam, setupHands } from "./webcam.js";

// Inicializar Socket.io
const socket = io();

// Obtiene el elemento de video de la webcam
const videoElement = document.getElementById("webcam");
// Obtiene el elemento canvas para dibujar
const canvasElement = document.getElementById("canvas");
// Obtiene el contexto 2D del canvas
const canvasCtx = canvasElement.getContext("2d");

// Registrar el callback para cuando se selecciona una tarjeta
onCardCreated((data) => {
  console.log("Tarjeta seleccionada:", data);
  // Aquí puedes emitir un evento a través de Socket.io
  socket.emit("cardSelected", data);
});

// Función principal que inicializa todo
async function main() {
  await initWebcam(videoElement); // Inicializa la webcam
  initThree(); // Inicializa la escena 3D
  updateCanvasSize(canvasElement); // Ajusta el tamaño de los canvas
  window.addEventListener("resize", () => updateCanvasSize(canvasElement)); // Actualiza el tamaño al cambiar la ventana
  setupHands(canvasElement, canvasCtx, videoElement); // Inicializa MediaPipe Hands
}

main(); // Ejecuta la función principal
