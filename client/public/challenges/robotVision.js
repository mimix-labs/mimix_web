// Modo robot: la cámara y MediaPipe se ejecutan en la Jetson. El navegador
// recibe solamente landmarks mediante SSE, con el mismo formato que Tasks API.
export function isRobotVisionMode() {
  return new URLSearchParams(window.location.search).get('vision') === 'robot';
}

export function startRobotHandTracking(onResults) {
  const stream = new EventSource('/api/vision/stream');

  stream.addEventListener('hand-landmarks', (event) => {
    try {
      onResults(JSON.parse(event.data));
    } catch (error) {
      console.error('No se pudieron leer los landmarks del robot:', error);
    }
  });

  stream.onerror = () => {
    // EventSource reconecta automáticamente. No lanzar una excepción evita que
    // una desconexión temporal de la Jetson detenga la actividad 3D.
    console.warn('Esperando la visión nativa de la Jetson…');
  };

  return () => stream.close();
}

export function startRobotVideo(imageElement) {
  imageElement.hidden = false;
  imageElement.src = '/api/vision/video';
  imageElement.onerror = () => {
    console.warn('El video de la Jetson todavia no esta disponible.');
  };
}
