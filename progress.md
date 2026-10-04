# Progreso de Mimix Web

Actualizado: 4 de octubre de 2026.

## Estado actual

Mimix Web contiene el mundo 3D, los retos de Matematicas y Ciencias, el
puente local con el robot y la visualizacion de vision nativa de la Jetson. El
backend Express corre en el puerto 4000 y el cliente Vite en el puerto 5173.

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

- Fase 0: workspace pnpm 10.34.6 y Turborepo 2.11.7 sobre `client/` y `server/`.
- Un único `pnpm-lock.yaml`; instalación con `pnpm install --frozen-lockfile`.
- `pnpm dev` inicia ambas aplicaciones y `pnpm check` ejecuta lint, typecheck,
  seis pruebas, build y smoke de producción. CI valida también Docker.
- No se movieron fuentes ni se migró Express/Vite. La siguiente fase es el
  prompt 04 (`refactor/api-nestjs-foundation`), solo tras el merge de este PR.
- Migración, límites actuales y rollback en `docs/pnpm-workspace.md`.

## Archivos de referencia

- `client/src/core/World.js`: mundo 3D y modo de vision del robot.
- `client/src/core/RobotWebBridge.js`: eventos entre Web y robot.
- `client/public/challenges/science/`: tabla periodica y modelo atomico.
- `server/`: API local, vision y puente de ordenes del robot.
