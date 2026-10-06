# Evidencia de fase 18 — 2026-10-05

Base: `c324ed857e611301a9ca216c8b36baad20e60b39` (`origin/main`).
Rama: `feat/edge-arm64-runtime`. El PR identifica el commit final.
Host de validación: Linux amd64, Node 22.23.2, pnpm 10.34.6,
Docker 29.1.3, Compose 2.40.3, Buildx 0.37.2.
ARM64 se ejecutó mediante QEMU registrado temporalmente, **no en Jetson física**.

## Imágenes locales de la primera entrega

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

## Corrección del entorno CI

El run [37397273642](https://github.com/mimix-labs/mimix_web/actions/runs/37397273642)
construyó ambas imágenes nativas, pero los jobs edge amd64 y ARM64 fallaron en
`image inspect --platform` con `unknown flag: --platform`. Los logs de ambos
runners muestran Docker Engine/CLI 28.0.4 y API 1.48, por debajo del mínimo 1.49
documentado; el host local usaba Docker 29.1.3. No fue un fallo intermitente ni
específico de ARM64.

El workflow ahora instala Engine y CLI 29.1.3 mediante la acción oficial de Docker
antes de Buildx, con el almacén containerd habilitado como en la validación local.
Se conservan la selección explícita de plataforma y todas las aserciones de
rollback y aislamiento. El nuevo run verifica ambas arquitecturas nativas. La CLI oficial 28.0.4 también
reprodujo localmente el mismo rechazo del flag antes de acceder al daemon.

## Corrección de salud del simulador

Una prueba con contenedores reales reprodujo un falso healthy cuando gateway y
simulador tenían token vacío: el contexto era público, pero el stream de movimiento
no estaba disponible. El receptor motion ahora exige credencial no vacía y expone
su presencia en un socket Unix privado. El healthcheck consulta al proceso real,
con timeout, límite de respuesta y comprobación de estado online no expirado.

Tres pruebas nuevas cubren credencial ausente, incorrecta y conexión válida; esta
última también detiene el receptor con SIGSTOP manteniendo el gateway disponible,
lo reanuda y corta el stream para comprobar que la salud sigue al receptor.
No se añade un consumidor de movimiento paralelo ni se cambian contratos robot.

Verificación de la corrección: build multiarch correcto, `pnpm check` 53/53,
5/5 pruebas de despliegue y 3/3 pruebas de salud en amd64, lint y YAML correctos.
La primera ejecución del test de receptor bloqueado usó una señal inefectiva contra
PID 1 desde su mismo namespace. Se corrigió para enviarla mediante el daemon y
se repitieron las tres pruebas de salud correctamente.

| Imagen corregida local | Digest del índice multiarch |
| --- | --- |
| mimix-runtime:edge-reviewed | sha256:680fc89df6e4dd38395af1274c283a489249a8f67292b11e14e3ebd746b439af |
| mimix-simulator:edge-reviewed | sha256:685996c60f74db641d881c17d536122c93b16e6adb26e5544720fa0f0f39d6e1 |

## Límite de la evidencia y handoff

No se validaron JetPack, GPU, ROS, cámaras, temperaturas, latencia de parada ni
coexistencia real con el launcher del robot. Esos ensayos físicos siguen el gate
al final de [edge-arm64.md](edge-arm64.md). Los tests de puertos/aislamiento y la
emulación no sustituyen esa aceptación. Clerk/voz cloud/MediaPipe remoto y
persistencia de progreso offline conservan las limitaciones del runbook.

El chat orquestador revisa CI y este PR antes del merge. No se inicia el prompt 19.
