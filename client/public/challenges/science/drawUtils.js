// drawUtils.js
// Funciones de dibujo y utilidades de canvas

// Dibuja los puntos de referencia de las manos en el canvas
export function drawLandmarks(hands, canvasElement, canvasCtx) {
  hands.forEach((landmarks) => {
    for (const landmark of landmarks) {
      const x = landmark.x * canvasElement.width;
      const y = landmark.y * canvasElement.height;
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
      canvasCtx.fillStyle = "cyan";
      canvasCtx.fill();
    }
  });
}

//******************* PALETA DE COLORES ***********************//
// Dibuja la rueda de selección de color en el canvas
// export function drawColorPickerWheel() {
//   const canvas = document.getElementById("color-picker-canvas");
//   const ctx = canvas.getContext("2d");
//   const radius = canvas.width / 2;
//   const toRad = Math.PI / 180;
//   for (let angle = 0; angle < 360; angle++) {
//     ctx.beginPath();
//     ctx.moveTo(radius, radius);
//     ctx.arc(radius, radius, radius, angle * toRad, (angle + 1) * toRad);
//     ctx.closePath();
//     ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
//     ctx.fill();
//   }
// }

// Verifica si el punto (x, y) está sobre el control de color
// export function isHoveringColorControl(x, y) {
//   const rect = document.getElementById("color-control").getBoundingClientRect();
//   return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
// }
