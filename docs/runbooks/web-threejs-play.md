# Mundo compartido y `/play` (prompt 21)

Base: `1e2440fa9fade050872eaf8b529bb4ab04d21952` (shell Next fusionado).
Rama: `refactor/web-threejs-play`. La migración no retira Vite ni cambia el despliegue
cloud/edge existente. No incluye el rediseño del prompt 22.

## Auditoría previa

El grafo anterior era `client/src/main → World → Engine/Loop/SteamMap/CharacterManager/
InputSystem/CameraFollower/ChallengeZone`, con LoadingScreen, Onboarding y dos
adaptadores legacy del robot. World creaba renderer, listeners, loaders y RAF sin
un ciclo de desmontaje. Eso impedía montarlo con seguridad en React StrictMode.

APIs de navegador: DOM/canvas/WebGL, teclado y ratón, resize, requestAnimationFrame,
performance, localStorage para la guía, location para los retos, fetch y EventSource
legacy. Draco usa workers y WASM locales. No hay import de sensores en el mundo.

Los cinco GLB únicos suman 36.351.080 bytes: home 11.919.488, mathematics 13.768.428,
sciencie 8.173.260, bridge 2.239.132 y walle 250.772. El puente se instancia dos veces.
Se conservan nombres (incluido `sciencie`), contenidos, luces, posiciones, escala,
colisiones, cámara, animaciones y controles. Los blobs Git de los modelos coinciden
con la base. Draco mantiene la versión de Three ya utilizada (0.167).

Antes de editar: bundle Vite world 643,16 kB / 167,25 kB gzip; carga dev 2,41 s,
heap 42,77 MB, 4,55 FPS en Chromium SwiftShader, 1280×800. Esta observación dev no se
mezcla con las mediciones de producción del [informe](web-threejs-play-evidence.md).

## Implementación

- `packages/world` contiene el mundo y sus GLB canónicos. Los scripts de build/dev
  copian activos a cada public; las copias no se versionan. Vite conserva su plugin
  Draco; Next copia los mismos decoders al standalone. No se requiere CDN de modelos.
- `mountWorld(root, {host})` tiene `ready` y `dispose()` idempotente. Cada montaje
  tiene su loader, AbortController, renderer y pool Draco. Descargas repetidas del
  puente comparten bytes; cada instancia se parsea independientemente.
- Dispose cancela downloads, RAF y listeners; libera geometrías, materiales,
  texturas, ImageBitmap, render targets, controles y contexto WebGL. Un decode ya
  iniciado se deja terminar y su resultado tardío se libera antes de cerrar workers:
  matar Draco a mitad de un decode dejaría promesas internas sin resolver.
- `/play/play.tsx` establece `dynamic(..., {ssr:false})` en una frontera Client
  Component. La importación pesada queda en ese chunk. El effect monta y desmonta;
  `pagehide` libera recursos y restauración BFCache recarga una instancia nueva.
- Next usa ShadowRoot para mantener exactamente la hoja visual del mundo sin que
  afecte el shell ni herede sus reglas para headings/dialogs. `(shell)` conserva
  header/main/footer en las rutas del shell. No se introduce un diseño nuevo.
- Vite usa el mismo runtime sobre su documento y conserva sus entradas de retos,
  guía, parámetros `vision=browser|robot`, controles legacy y conexión EventSource.
  Estos adaptadores de operador permanecen exclusivamente en edge.

## Contratos y límites reales

`createWorldHost` valida manifests instalados y solo construye destinos para sus
IDs conocidos en un origen fijo configurado. No acepta URLs del agente o de retos.
Los retos continúan siendo los artefactos Vite versionados; no se reescriben en React.

El catálogo es instalado por el host (`challenges`, validado al crear la instancia);
por defecto conserva los dos manifests oficiales. Solo el host llama
`apiFor(challengeId, {challengeId, challengeVersion, attemptId})` antes de entregar
la API al reto. El binding debe provenir de un intento ya autorizado y coincidir
con el manifest instalado; no es una credencial de autenticación. Cada llamada al
adapter recibe un contexto inmutable con esos identificadores y la señal de
cancelación. Los registros de aprendizaje no pueden aportar ni sustituir esa
atribución. Sin binding, `progress.record` falla incluso si tiene grant y adapter.

La superficie `MimixAPI` conserva los contratos `agent.speak`, `progress.record` y
`embodiment.perform`: valida entradas, exige tanto la capacidad del manifest como
una concesión del host y transmite cancelación. Las salidas virtuales requieren un
`EmbodimentState` validado y un permiso local vigente del coordinador; cambiar a
robot/closed, revocar el permiso o desmontar cancela y detiene las salidas. No se
serializa el permiso ni se transforma un lease recibido del navegador en autoridad.

`acceptTurn` consume `AgentTurn` validado, rechaza recomendaciones para versiones
no instaladas y no navega automáticamente. Una acción explícita puede seguir una
recomendación. La prueba usa Agent Core real con contexto y autorización de fixture.
No se importa Agent Core servidor ni credenciales en el bundle cliente.

**Estado de integración:** los hosts actuales no conceden agent/progress/embodiment
ni inyectan transportes. Esta base no tiene endpoint autenticado de Agent Core ni
feed de leases/conversación para el navegador. Los puertos quedan probados, pero
esas capacidades devuelven `CAPABILITY_UNAVAILABLE` hasta conectarse desde un host
autorizado. No se presentan como funciones cloud operativas. Los manifests actuales
son exploración abierta y no solicitan progress; entrar/salir del mundo nunca genera
una finalización. La lectura real de progreso sigue en `/progreso`, contra Nest.

Next no importa los controles legacy que envían motores con una clave de operador;
el prompt 00 exige intents autorizados. Esa superficie edge queda excluida de la
paridad cloud y bloquea la retirada, junto con los transportes anteriores. No se
pide trasladar secretos legacy al navegador cloud ni se inventa una API en este PR.

## Ejecución y selección

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@mimix/web... --filter=mimix-client...
pnpm --filter @mimix/web start       # puerto 3100; /play disponible
pnpm client                        # edge en 5173
```

`MIMIX_WORLD_MODE=legacy` es el valor predeterminado: inicio enlaza al origen Vite.
`MIMIX_WORLD_MODE=next` hace que ese enlace abra `/play`. Es configuración runtime:
no hace falta reconstruir para revertir. Un valor desconocido falla cerrado.
`MIMIX_LEGACY_ORIGIN` sigue siendo el destino fijo de retos y del rollback; el
servidor exige HTTPS cloud y no admite path, credenciales, query ni fragmento.

Docker Next: `docker build -f apps/web/Dockerfile -t mimix-web:ci .`.
El Dockerfile edge incorpora el manifest del paquete nuevo y sigue compilando Vite.
Las imágenes no dependen de un árbol local de desarrollo ni de assets externos.

## Gates y rollback

Los checks técnicos y las mediciones están en el informe. La aceptación operativa
no se deduce del éxito de tests. Para retirar el frontend cloud antiguo faltan:

1. Host cloud autenticado de conversaciones, Agent Core y embodiment; integración
   de retos/progreso autorizada cuando los manifests realmente la soliciten.
2. Paridad aceptada de las capacidades robot requeridas, sin copiar motores legacy.
3. Validación visual y de FPS/memoria en GPU y dispositivos objetivo; SwiftShader
   solo permite una comparación controlada local, no certifica experiencia de usuario.
4. Aceptación del rollout/rollback por el responsable del despliegue.

Hasta entonces se mantiene `legacy` como default y no se elimina ningún despliegue.
Para rollback del enlace: volver a `MIMIX_WORLD_MODE=legacy` y reiniciar Next, usando
el mismo `MIMIX_LEGACY_ORIGIN`. Para una regresión del paquete compartido en edge,
reimplantar la imagen inmutable anterior a este PR (base `1e2440f`); el selector Next
por sí solo no revierte una imagen Vite recién construida. No hay migración de datos.
No ejecutar merge ni prompt 22 como parte de esta entrega.
