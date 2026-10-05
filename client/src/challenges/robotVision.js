const VISION_OVERRIDES = new Set(['browser', 'robot']);

export function getVisionOverride() {
  const requestedMode = new URLSearchParams(window.location.search).get('vision');
  return VISION_OVERRIDES.has(requestedMode) ? requestedMode : null;
}

export function getVisionOverrideQuery() {
  const override = getVisionOverride();
  return override ? `?vision=${override}` : '';
}

// La fuente de visión se configura al desplegar el backend. Los parámetros de
// URL se mantienen únicamente como overrides explícitos para depuración.
export async function resolveVisionMode() {
  const override = getVisionOverride();
  if (override === 'robot') return 'jetson';
  if (override === 'browser') return 'browser';

  try {
    const response = await fetch('/api/vision/config', { cache: 'no-store' });
    if (!response.ok) return 'browser';

    const config = await response.json();
    return config.mode === 'jetson' ? 'jetson' : 'browser';
  } catch {
    // Si el backend todavía no está disponible, la laptop conserva el flujo
    // local de webcam y MediaPipe.
    return 'browser';
  }
}

// Modo robot: la cámara y MediaPipe se ejecutan en la Jetson. El navegador
// recibe solamente landmarks mediante SSE, con el mismo formato que Tasks API.
export async function isRobotVisionMode() {
  return (await resolveVisionMode()) === 'jetson';
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
