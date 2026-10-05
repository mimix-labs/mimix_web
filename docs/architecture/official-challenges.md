# Retos oficiales v1 y transición

Matemáticas y Ciencias se construyen como `@mimix/challenge-mathematics` y
`@mimix/challenge-science`, ambos 1.0.0. Cada paquete exporta manifest v1 y
`createChallenge(ChallengeContext)` con initialize/start/pause/resume/dispose.
Incluye HTML/CSS, lógica de gestos/render, fixture de paridad y declaraciones de
entrada TypeScript. `@mimix/challenge-browser` contiene el lifecycle local y
utilidades visuales comunes, con Three 0.128.0 fijado y empaquetado con su loader.
Así se evita mezclar el motor 0.167 del mundo con el motor de los retos.

## Frontera de confianza

**Estos dos retos aún se ejecutan en un host first-party confiable, en el documento
principal. No están aislados por el sandbox.** El host importa exclusivamente los
dos paquetes seleccionados durante el build: nunca carga un plugin, URL o manifest
remoto. Validar un manifest no certifica seguridad del código.

El [runtime opaco v1](challenge-runtime.md) conserva CSP y permisos intactos.
Todavía no implementa camera/hand-tracking; no sería correcto agregar same-origin,
acceso a la webcam o una excepción de red para hacer funcionar estos paquetes.
Una integración sensorial aislada necesita contrato de vídeo/landmarks, assets,
permisos y nueva verificación. El host actual es un adaptador de transición,
no una alternativa para ejecutar código de terceros.

Los paquetes no obtienen cámara/red/credenciales ni singleton robot. Importan
Three explícitamente; sus efectos usan `context.mimix.agent.speak` y
`context.mimix.embodiment.perform`. El host posee webcam, MediaPipe, Jetson SSE/MJPEG,
contexto/navegación y personaje; entrega landmarks mediante `handleHands` del
lifecycle local solo cuando está running. No cambia la API pública del SDK v1.
`handleHands` es un punto de integración de las vistas oficiales confiables, no
un mensaje admitido por el bridge del sandbox ni una nueva capability universal.

El host concede únicamente agent/embodiment declarados por cada manifest. Camera
y hand-tracking son solicitudes opcionales: se gestionan fuera del SDK durante
esta transición. El permiso del navegador sigue siendo necesario para la webcam.
Los adaptadores actuales no añaden autenticación ni eluden políticas de backend.

## Comportamiento conservado

- Matemáticas: cuatro figuras, previews, vértices editables, aristas y medidas,
  pinch, rotación con puño, etiqueta de figura y compañero Wall-E, atajos Ctrl/Cmd.
- Ciencias: 118 elementos DOM, selección click/pinch, modelo atómico, electrones,
  carga limitada, rotación y regreso; sin rediseño del layout.
- Cámara local 640×480/30fps; MediaPipe CPU/WASM a 15fps; visión Jetson y recorte
  espejo conservados; navegación por comandos mantiene `vision=robot|browser`.
- Ayuda conserva textos y claves localStorage; rutas públicas y enlaces del mundo
  permanecen `/challenges/mathematics/` y `/challenges/science/`, también index.html.

No se registra `answer_submitted` ni `attempt_completed`: ambos son exploraciones
abiertas, sin evaluación existente que permita afirmar un acierto o desbloqueo.
Manifest expresa esa finalización visual, no un criterio pedagógico inventado.
El host conserva `lenvantarceja` únicamente como notificación legacy por cambio
real de figura. El código anterior también emitía strings al construir/deformar
geometría; esos diagnósticos redundantes no se convierten en llamadas SDK inválidas,
resultados de aprendizaje ni movimientos adicionales del personaje.

## Lifecycle y recursos

Los hooks se serializan; llamadas fuera de estado fallan INVALID_LIFECYCLE.
Pausa detiene el render principal y suprime landmarks y efectos SDK. Dispose es
idempotente incluso antes de inicializar; abort durante setup espera el recurso
pendiente y luego lo libera. Cada documento monta una vista oficial; esta capa
no proporciona un editor de múltiples vistas simultáneas.

El host cancela cámara, tracker, SSE, timers y personaje al salir. Restaurar desde
BFCache recarga una instancia nueva. Si getUserMedia
o el modelo terminan después de salir, sus recursos se liberan sin reactivar la
vista. Ante denegación/fallo de cámara, la vista y ayuda siguen disponibles con
un estado breve. La selección por click de Ciencias funciona sin cámara.
MediaPipe/modelo, fuentes y legacy CDN aún requieren red, igual que antes; no se
promete funcionamiento offline ni certificación de hardware Jetson real.

## Desarrollo, publicación y rollback

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm client
pnpm test:browser
```

Vite genera entradas multipágina para las mismas rutas. Scripts legacy permanecen
bajo `/challenges/` para compatibilidad; sus HTML de rollback están en
`/legacy/challenges/{id}/index.html` y mantienen referencias absolutas a assets.
No se retiraron las implementaciones originales.

Rollback por URL sin rebuild:
`/challenges/science/?challengeRuntime=legacy&vision=robot`.
El host conserva el query vision y redirige al HTML legacy. Para todo el build:

```bash
VITE_MIMIX_CHALLENGES_MODE=legacy pnpm build
docker build --build-arg VITE_MIMIX_CHALLENGES_MODE=legacy -t mimix:legacy-challenges .
```

El flag participa en la caché Turbo. Es una variable de **build**, no de arranque
Node. También se puede desplegar la imagen anterior o revertir el PR; no hay SQL,
secretos ni datos que migrar. Restaurar `package` y recompilar reactiva los paquetes.
La retirada futura del adaptador/legacy exige paridad sensorial aislada y rollback.
Prompt 10 queda fuera de este PR y requiere nueva instrucción después del merge.

Evidencia, límites y comandos: [verificación](../runbooks/official-challenges-verification.md).
