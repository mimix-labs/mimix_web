// La cámara nativa publica 640x480 (4:3). En modo robot la imagen se muestra
// con object-fit: cover, así que hay que aplicar el mismo recorte a los
// landmarks antes de dibujarlos o usarlos como coordenadas de interacción.
const ROBOT_CAMERA_ASPECT = 4 / 3;

export function landmarkToCanvas(landmark, width, height) {
  if (document.body.dataset.visionSource !== "robot") {
    return { x: landmark.x * width, y: landmark.y * height };
  }

  const viewportAspect = width / height;
  const renderedWidth = viewportAspect > ROBOT_CAMERA_ASPECT
    ? width
    : height * ROBOT_CAMERA_ASPECT;
  const renderedHeight = viewportAspect > ROBOT_CAMERA_ASPECT
    ? width / ROBOT_CAMERA_ASPECT
    : height;

  return {
    x: landmark.x * renderedWidth - (renderedWidth - width) / 2,
    y: landmark.y * renderedHeight - (renderedHeight - height) / 2,
  };
}

export function landmarkToMirroredScreen(landmark) {
  const point = landmarkToCanvas(landmark, window.innerWidth, window.innerHeight);
  return { x: window.innerWidth - point.x, y: point.y };
}
