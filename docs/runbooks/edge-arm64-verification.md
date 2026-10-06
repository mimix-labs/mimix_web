# Evidencia de fase 18 — 2026-10-05

Base: `c324ed857e611301a9ca216c8b36baad20e60b39` (`origin/main`).
Rama: `feat/edge-arm64-runtime`. El PR identifica el commit final.
Host de validación: Linux amd64, Node 22.23.2, pnpm 10.34.6,
Docker 29.1.3, Compose 2.40.3, Buildx 0.37.2.
ARM64 se ejecutó mediante QEMU registrado temporalmente, **no en Jetson física**.

## Imágenes definitivas locales

Build con `docker buildx bake --load`, ambas plataformas en cada índice:

| Imagen local | Digest del índice multiarch |
| --- | --- |
| mimix-runtime:edge-final | sha256:037305d6f59e877a19e86d6f41c0ab1479314c8be7515106b7778f938b0cb892 |
| mimix-simulator:edge-final | sha256:7e6c122dd98371af5d02339a2f686b8a0c3e8a14da5eca37879626847aea259d |

Son imágenes de validación, no publicadas. Para una release distribuible,
reconstruir desde el commit aprobado con tags únicos/digests y el runbook.
El primer build fue cancelado tras timeouts de npm y una interrupción del chat.
El build definitivo usó instalación congelada, caché pnpm precargada localmente,
435 paquetes reutilizados y 3 descargados; el CI prueba el camino sin precarga.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Instalación congelada | PASS |
| Lint, typecheck, test, build, smoke | PASS |
| `pnpm check` | 53 tareas correctas |
| Contratos MQTT con Mosquitto real | 2/2 |
| PostgreSQL real | 89/89 |
| Runtime en Chromium, Firefox y WebKit | 63/63 |
| Retos en Chromium, Firefox y WebKit | 51/51 |
| Rutas de producción | 2/2 |
| Smoke Docker Nest/Express, autorización y persistencia/restore PostgreSQL | 5/5 |
| Despliegue amd64 | 5/5 |
| Despliegue ARM64 emulado | 5/5 |
| Navegador frío contra runtime amd64 y ARM64 | PASS en ambas plataformas |
| Revisión independiente y diff whitespace | Sin hallazgos pendientes |

El navegador bloqueó todos los orígenes externos, esperó el mundo listo y los
retos en `running` con visión `robot`, y verificó bytes WASM del decoder local.
La suite de despliegue prueba perfiles cloud/edge/simulator, reinicio, límites,
plataforma ejecutada, rollback automático/manual, imagen ausente sin interrupción,
fallo real de escritura del journal, recuperación, conflicto de puerto conservando
el servicio existente, bloqueo concurrente y arranque con `network_mode: none`.

WebKit no arrancaba inicialmente por `libevent-2.1.so.7` ausente. Se repitieron
las suites usando los browsers/bibliotecas ya disponibles en
`/tmp/mimix-migration-browser-libs` (`PLAYWRIGHT_BROWSERS_PATH`), sin modificar
la aplicación; las 114 pruebas terminaron correctas. CI instala sus dependencias.

## Hallazgos corregidos

- Journal: rename sin sincronización y error de escritura dentro de un trap
  podían perder el punto de recuperación. Se reprodujo el fallo y se verificó
  que `pending` se conserva y permite recuperar tras corregir el filesystem.
- Multiarch: la selección implícita devolvía amd64 al pedir ARM64; además un ID
  de configuración de variante no siempre era ejecutable. Se usa plataforma
  explícita y digest de índice (fallback ID para imágenes locales sin digest).
- Docker 29 omite puertos publicados en redes `internal`: bridge operativo y
  prueba de arranque sin interfaces separada.
- Simulador bajo QEMU: el límite inicial 128 MiB causó OOM. Se elevó a 384 MiB
  y se redujo el árbol de imports del healthcheck. Gateway permanece en 512 MiB.

La suite ARM64 detectó además una aserción que consultaba un ID de contenedor
anterior tras reconciliar Compose. El test ahora comprueba el reinicio antes de
reconciliar y verifica salud/HTTP del contenedor vigente después. La suite ARM64
completa pasó 5/5; la prueba afectada se repitió también en amd64 y pasó.

Muestra puntual bajo emulación, no benchmark Jetson: gateway 220,3 MiB/512 MiB;
simulador 152,5 MiB/384 MiB. El pico incluye probes; no extrapolar a carga física.

## Límite de la evidencia y handoff

No se validaron JetPack, GPU, ROS, cámaras, temperaturas, latencia de parada ni
coexistencia real con el launcher del robot. Esos ensayos físicos siguen el gate
al final de [edge-arm64.md](edge-arm64.md). Los tests de puertos/aislamiento y la
emulación no sustituyen esa aceptación. Clerk/voz cloud/MediaPipe remoto y
persistencia de progreso offline conservan las limitaciones del runbook.

El chat orquestador revisa CI y este PR antes del merge. No se inicia el prompt 19.
