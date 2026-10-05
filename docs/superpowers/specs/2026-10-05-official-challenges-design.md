# Retos oficiales: inventario y diseño de transición

## Intención y base

Prompt 09 únicamente, rama `refactor/challenges-package-migration` desde
`origin/main` `8a28e37` (merge runtime #9). Sin rediseño, campañas ni merge.
Trabajo arquitectónico: empaquetar dos experiencias existentes con fronteras SDK,
conservar rutas/cámara/gestos y demostrar paridad antes de retirar código.

## Inventario antes de editar

| Superficie | Comportamiento ejecutable | Dependencias actuales |
| --- | --- | --- |
| Matemáticas | Cubo inicial; previews Cubo/Octaedro/Prisma/Pirámide; pinch elige figura y deforma vértices; aristas/medidas; puño gira cámara; etiqueta 3200ms y reacción Wall-E | THREE 0.128 global CDN, GLTFLoader global, io global envía lenvantarceja, robotShapeIntegration, DOM events |
| Ciencias | 118 elementos HTML/CSS (ADR0001), click/pinch abre átomo, protones/neutrones/electrones/capas, carga -3..+3 sin electrones negativos, volver, pinch rota átomo y puño cámara | THREE global, io no utilizado, periodicData, DOM events |
| Ambos | Webcam 640×480/30fps o Jetson MJPEG+SSE; MediaPipe CPU 15fps; coordenadas espejo/letterbox; ayuda persistente; robot navega entre mundo y retos | getUserMedia, MediaPipe CDN 0.10.15/model, fetch config/context, EventSource visión/comandos, localStorage ayuda |
| Rutas | /challenges/{mathematics,science}/ y /index.html; ?vision=browser/robot; enlaces desde mundo y comandos | scripts estáticos en public; producción sirve client/dist |

Evidencia baseline Chromium antes de edición: ambas páginas cargan sin pageerror
con proveedor de landmarks simulado; Matemáticas selecciona Pirámide y muestra
ese texto; Ciencias contiene 118 botones, seleccionar Mg y quitar electrón da
11 electrones/carga +1. Capturas en /tmp/mimix-{mathematics,science}-baseline.png
y resultados en /tmp/mimix-migration-baseline.json. Las pruebas anteriores solo
comprobaban shell HTTP; faltaba regresión ejecutable de gestos/cámara.

## Alternativas y decisión

1. **Paquetes ESM versionados y host de compatibilidad confiable (elegido).**
   Preserva DOM/CSS/WebGL y sensores. Código del reto recibe ChallengeContext y
   usa agent/embodiment del SDK, importa Three explícitamente y no obtiene
   cámara, red, credenciales ni singleton robot por globales. Host de producto
   conserva integración cámara/Jetson y entrega resultados al manejador local.
2. Migrar ahora todo a iframe opaco exigiría nuevo protocolo de vídeo/landmarks,
   assets/modelos y persistencia de ayuda. Runtime v1 no soporta sensores: inventar
   esa frontera aquí o permitir same-origin/cámara rompería el alcance y amenaza.
3. Solo copiar archivos manteniendo io/THREE/robot globales no satisface el SDK.

La ruta oficial se sirve con paquetes por defecto y un adaptador temporal de
confianza en el documento principal. **No se presenta como aislamiento del reto**:
solo se cargan los dos paquetes propios del build, nunca URLs/manifests arbitrarios.
El runtime opaco sigue separado e intacto; rechaza camera/hand-tracking required.
Eliminación de este host exige un futuro contrato sensorial y nueva paridad.

## Fronteras y archivos

- `packages/challenge-{mathematics,science}` v1.0.0: manifest v1, factory lifecycle
  SDK, vista/gestos existentes, HTML/CSS conservados, fixtures y contratos.
- `packages/challenge-browser`: utilidades visuales compartidas y lifecycle local
  para estos paquetes confiables; no reemplaza challenge-runtime ni acepta plugins.
- `client/src/challenges`: host de confianza para sensores, agente/robot visual,
  telemetría legacy y contexto/navegación; permisos/grants y teardown explícitos.
- Rutas Vite multipágina mantienen URLs públicas. Copias HTML de rollback en
  `/legacy/challenges/...` apuntan a scripts originales conservados.
- `?challengeRuntime=legacy` y flag de build `VITE_MIMIX_CHALLENGES_MODE=legacy`
  permiten rollback sin migraciones de datos; conservan override vision.

No se inventan respuestas correctas ni finalización de exploraciones abiertas:
manifest describe objetivos sin evaluación automática. Progreso evaluable y
campañas están fuera. lenvantarceja queda únicamente como compatibilidad del host;
los paquetes usan intenciones neutrales. Dependencia Three se fija a 0.128.0 para
no introducir cambios de render por actualizar motor durante la migración.

## Aceptación y riesgos

Paridad ejecutable legacy/paquete para cuatro figuras, drag/puño, 118 elementos,
Mg/iones/límites/volver, gestos, ayuda, rutas, cámara browser y Jetson. Capturas y
DOM/texto/geometría observables; fixtures de landmarks reproducibles, no hardware
real. Lifecycle cancela loops/listeners y libera recursos; navegación cierra cámara
SSE y previene continuaciones tardías. Rechazo de cámara deja salida/ayuda visible.
Riesgos principales: orden de init, coordenadas espejo, geometría/Three, estado
singleton por página, carga tardía de cámara/modelo y rollback Vite/Docker.

Gates: frozen install, manifests/contratos, lint/types/tests/build, browsers/paridad,
smoke HTTP, PostgreSQL y Docker aplicables; revisión independiente y CI final.
No se retiran scripts legacy en este PR: conservarlos es la ruta de rollback.
