# Progreso de Mimix Web

## Retos locales y revisión de PRs — 9 de noviembre de 2026

- Los portales usan `MIMIX_LEGACY_ORIGIN=http://localhost:5173`. Solo estaba
  encendido Next; se levantó Vite en 5173 y ambas entradas oficiales responden 200.
  No se cambian los métodos de acceso ni se integra la carrera Cuy.
- Hay tres PRs abiertos vigentes: #24 cuenta/datos, #25 preparación de producción,
  #26 UI. #24 y #25 tienen ocho checks verdes; #26 pasó siete y falló únicamente
  al esperar el retorno del cursor en WebGL por software durante cinco segundos.
- El test conserva el umbral angular y permite 30 segundos para ese asentamiento,
  con presupuesto de caso de 120 segundos. Damping sigue usando su paso de 80 ms;
  no cambia el movimiento de producto. Chromium/Firefox: seis casos aprobados;
  WebKit local no arranca por dependencias del sistema ausentes (CI sí las instala).
- El merge a main requiere la revisión y confirmación explícita de Edwar según
  `.cursor/rules/git-workflow.mdc`; no se cierran PRs que contienen trabajo vigente.

## UI-01 preparada para entrega separada — 9 de noviembre de 2026

- Selección limpia sobre `7598cf3` en `feat/ui-01-platform-welcome`, apilada sobre
  el PR #24 de servicios. Contiene bienvenida Wall-E, acceso/cuenta nativos,
  retorno al mundo y dependencias visuales/pruebas; no integra la carrera Cuy.
- Checkout de origen preservado. Contrato y límites en `docs/design/ui-01-delivery.md`.
- Validaciones: install congelado, build 20/20, check secuencial 60/60 tareas
  (281 comprobaciones entre suites), web Chromium 15/15 y mundo Chromium 7/7.
  Corregida reentrada automática en portales al restaurar contexto, con regresión.
- Render/mundo en `8f45b80`; la segunda unidad incluye rutas, Clerk y documentación.
  Revisión independiente sin bloqueos tras corregir el portal. Revisión visual
  final y producción pendientes; sin merge ni despliegue.

Actualizado: 4 de octubre de 2026.

## Estado actual

Mimix Web contiene el mundo 3D, los retos de Matematicas y Ciencias, el
puente local con el robot y la visualizacion de vision nativa de la Jetson. El
backend Nest/Fastify con adaptador Express corre en el puerto 4000 y el cliente Vite en el puerto 5173.

## Entregas realizadas

- **Mundo 3D y navegacion:** se corrigieron la carga del mundo, la posicion
  inicial de Wall-E, los limites del mapa, el terreno y la continuidad del
  cruce por el puente.
- **Entradas a retos:** las entradas de Matematicas y Ciencias se ubicaron
  cerca del mundo inicial para que la navegacion sea directa.
- **Integracion con robot:** el cliente mantiene un puente de eventos con el
  backend para recibir ordenes semanticas y conectar los retos con la vision
  de la Jetson.
- **Vision configurable:** el backend usa `MIMIX_VISION_MODE=jetson` para
  recibir el flujo nativo de la Jetson. Sin esa variable utiliza `browser` y
  los retos ejecutan MediaPipe en la webcam de la laptop. `?vision=robot` y
  `?vision=browser` quedan disponibles como overrides de depuracion.
- **Tabla periodica:** se eliminaron los contenedores visuales sobrantes y el
  mensaje flotante de ayuda. El encabezado ahora dice **Explora los
  elementos**.
- **Modelo atomico:** el lienzo Three.js ahora se ajusta al panel de foco y
  el escalado de orbitas depende de las capas visibles. Los atomos grandes ya
  no se deforman ni desbordan el panel.

## Ejecucion en desarrollo

Desde este repositorio se pueden iniciar los dos procesos de forma separada:

```bash
pnpm server
pnpm client
```

En la demostracion fisica,
`mimix_robot/deploy/jetson/start_mimix.sh --physical` debe iniciar el backend
con `MIMIX_VISION_MODE=jetson`.

## Acceso desde un celular en la red local

Con el cliente iniciado en la Jetson y el telefono en la misma red Wi-Fi:

```bash
hostname -I
```

Abrir en el telefono:

```text
http://IP_DE_LA_JETSON:5173/?vision=robot
```

La camara y el procesamiento de manos continuan en la Jetson; el telefono se
usa como pantalla e interfaz remota.

## Dependencias y control de cambios

- Fase 0: workspace pnpm 10.34.6 y Turborepo 2.11.7.
- Prompt 04: `apps/api` con NestJS/Fastify, TypeScript estricto, health nativo,
  OpenAPI, configuración validada y módulos de dominio vacíos.
- Las rutas de producto permanecen en un adaptador Express dentro del mismo
  proceso. Tokens bridge/control centralizados; sin cambios de frontend.
- `pnpm check` cubre contratos Express/Nest, lint/typecheck, build y smoke.
  CI prueba ambas variantes de la imagen y apagado con SSE activo.
- Rollback: `MIMIX_API_RUNTIME=express`; guía en `docs/runbooks/api-foundation.md`.
- Siguiente fase: prompt 05 de identidad, únicamente después del merge de este
  PR. No se introdujo Clerk, PostgreSQL, MQTT ni funciones futuras.

## Archivos de referencia

- `client/src/core/World.js`: mundo 3D y modo de vision del robot.
- `client/src/core/RobotWebBridge.js`: eventos entre Web y robot.
- `client/public/challenges/science/`: tabla periodica y modelo atomico.
- `server/`: API local, vision y puente de ordenes del robot.
