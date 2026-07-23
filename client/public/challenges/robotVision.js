// Modo robot: la cámara y MediaPipe se ejecutan en la Jetson. El navegador
// recibe solamente landmarks mediante SSE, con el mismo formato que Tasks API.
export async function isRobotVisionMode() {
  const requestedMode = new URLSearchParams(window.location.search).get('vision');
  if (requestedMode === 'robot') return true;
  if (requestedMode === 'browser') return false;

  // En la Jetson no se debe pedir getUserMedia: el proceso nativo ya posee
  // la cámara. Detectarlo evita que el usuario tenga que recordar una URL.
  try {
    const response = await fetch('/api/vision/status', { cache: 'no-store' });
    if (!response.ok) return false;

    const status = await response.json();
    const recentNativeFrame =
      status.source === 'jetson-native' &&
      Number.isFinite(status.lastFrameAt) &&
      Date.now() - status.lastFrameAt < 5000;
    return recentNativeFrame;
  } catch {
    // En una laptop sin servicio de robot se conserva el modo webcam actual.
    return false;
  }
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
