# Runtime edge ARM64 — fase 18

El target Docker `production` conserva Nest/Fastify y el adaptador Express que
sirven el build Vite actual. En Jetson ese proceso es el gateway HTTP local;
no es un nuevo driver ROS/MQTT ni un reemplazo del launcher de `mimix_robot`.
El target `simulator` empaqueta el simulador contractual existente y solo registra
intenciones. La integración física y su safety supervisor siguen en el robot.

## Matriz y presupuesto inicial

Ambas imágenes tienen variantes `linux/amd64` y `linux/arm64`, Node 22.23.2,
usuario 1000, filesystem de solo lectura, capacidades Linux eliminadas y sin GPU.
Los límites son presupuestos de despliegue, no mediciones de rendimiento en Jetson.

| Perfil / servicio | Imagen | Puertos host → contenedor | Volúmenes | CPU / RAM / PIDs |
| --- | --- | --- | --- | --- |
| cloud / cloud | mimix-runtime:release | 127.0.0.1:4000 → 4000 | ninguno; DB cloud externa | 2 / 1 GiB / 128 |
| edge / edge-gateway | mimix-runtime:release | 127.0.0.1:4080 → 4000 | solo /tmp tmpfs 32 MiB | 1 / 512 MiB / 128 |
| simulator / edge-gateway | igual que edge | igual que edge | igual que edge | 1 / 512 MiB / 128 |
| simulator / robot-simulator | mimix-simulator:release | ninguno; namespace del gateway | solo /tmp tmpfs 32 MiB | 0,5 / 384 MiB / 64 |

Cloud también usa `/tmp` tmpfs de 32 MiB. El tmpfs se carga al límite de memoria.
Edge total: 512 MiB, o 896 MiB con simulador. Sin swap adicional. Logs JSON stdout /
stderr: rotación `10m × 3` por servicio (hasta 60 MiB en perfil simulator).
Reservar además RAM para Ubuntu/JetPack, navegador Three.js, visión y ROS: sus
consumos **no** están incluidos. Conservar al menos 2 GiB de RAM disponibles tras
levantar el robot; medir `tegrastats` antes de admitir este presupuesto en hardware.
Reservar disco para dos releases, archivos de traslado y logs; medir imágenes con
`docker image inspect --format '{{.Size}}' IMAGE` y no podar la versión anterior.

`edge` y `simulator` comparten un gateway; elegir un perfil por instalación.
Cloud puede coexistir en otro proyecto Compose. No hay `container_name`, host
network, dispositivos, volúmenes ROS ni publicación de 8081, MQTT o DDS.

## Build y traslado antes de desconectar

Requiere Docker CLI/Engine con API >= 1.49 (`image inspect --platform`),
Buildx y Compose >= 2.24; operación de releases requiere Bash,
`flock`, `sync`, `sed` y `realpath` (Ubuntu/Jetson). Build e instalación de herramientas requieren
Internet; el **arranque de imágenes ya cargadas no**.

```sh
pnpm install --frozen-lockfile
# Construye las dos imágenes y ambas arquitecturas en un registro propio.
REGISTRY=registry.example/mimix RELEASE=git-sha docker buildx bake --push
# Alternativa de traslado sin registro: construir cada arquitectura y cargarla.
docker buildx bake --load --set '*.platform=linux/arm64' \
  --set runtime.tags=mimix-runtime:git-sha \
  --set simulator.tags=mimix-simulator:git-sha
docker save -o mimix-arm64.tar mimix-runtime:git-sha mimix-simulator:git-sha
sha256sum mimix-arm64.tar > mimix-arm64.tar.sha256
# Copiar tar, checksum, compose.yaml y edge-release.sh mediante canal confiable.
# En Jetson, antes de desconectar:
sha256sum -c mimix-arm64.tar.sha256
docker load -i mimix-arm64.tar
```

Las instalaciones usan lockfile congelado, caché pnpm de BuildKit y reintentos
de red acotados. La caché acelera reconstrucciones y no forma parte del runtime.
Buildx ejecuta pnpm/TypeScript/Vite sobre `BUILDPLATFORM`; el runtime usa la
plataforma destino. Los paquetes de producción copiados actualmente son JS/WASM
independientes de arquitectura. Si se añade un addon nativo hay que cambiar esa
estrategia y probarlo por plataforma. CI construye y ejecuta amd64 y arm64 en
runners nativos separados con Docker Engine/CLI 29.1.3 y el almacén de imágenes
containerd. El workflow instala esa versión antes de configurar Buildx, porque
Docker 28.0/API 1.48 de los runners no ofrece `image inspect --platform`.
No se publica automáticamente desde un PR.

Mantener los tags únicos por commit o usar referencias de digest del registro.
No utilizar `latest` para operación. Dockerfile conserva `production` como target
final, compatible con Railway y sus variables/puerto dinámico.

## Arranque local sin Internet

```sh
mkdir -p .edge-release
chmod 700 .edge-release
cp infra/docker/edge.env.example .edge-release/runtime.env
chmod 600 .edge-release/runtime.env
# Editar runtime.env: imágenes cargadas, plataforma, puerto/orígenes y tokens privados distintos.
bash infra/docker/edge-release.sh "$PWD/.edge-release" deploy mimix-runtime:git-sha
curl --fail http://127.0.0.1:4080/api/health
```

Abrir `http://localhost:4080` en el navegador de la Jetson. El gateway usa una
red bridge propia para publicar el puerto local y `pull_policy: never`; no hay
build, instalación, login Clerk, DB cloud o broker en el arranque edge. Draco se
sirve desde `/vendor/draco/` tanto en Vite dev como en producción. Mundo y retos
se pueden abrir usando teclado/ratón. Fuentes web caen a las fuentes de reserva.

No se promete cámara MediaPipe sin Internet: su modelo/WASM aún son remotos.
El perfil edge selecciona visión `jetson` para consumir landmarks locales,
sin descargar MediaPipe. Requiere el publicador de visión existente. No hay
voz ElevenLabs, Clerk, LiveKit, sincronización ni persistencia de progreso offline
nueva; SQLite/reconciliación pertenece exclusivamente al prompt 19.

Sin tokens, las rutas de movimiento que requieren puente configurado fallan
cerradas. El simulador exige `MIMIX_ROBOT_BRIDGE_TOKEN`; provisionar además un
`MIMIX_ROBOT_CONTROL_TOKEN` distinto. No son credenciales Clerk ni MQTT. Mantener
los ficheros privados fuera de Git. `docker compose config` puede mostrar secretos;
no adjuntar su salida a incidentes o PRs.

## Convivencia con mimix_robot

1. Inventariar `ss -lntup`, `docker ps`, procesos ROS y `tegrastats` antes del cambio.
2. Conservar launcher, puertos, parámetros de visión y procesos existentes. Cambiar
   solo `MIMIX_EDGE_PORT` si 4080 está ocupado, y ajustar `MIMIX_EDGE_ORIGINS`.
3. El robot puede publicar al puerto loopback 4080 del host. La dirección de vídeo
   `host.docker.internal:8081` llega al host mediante `host-gateway`; un servicio
   enlazado exclusivamente a 127.0.0.1 **no** es accesible allí. Configurar una
   dirección LAN/bridge ya autorizada y su firewall, o mantener desactivado el
   vídeo. No cambiar automáticamente el bind ni el launcher de visión.
4. Bind web por defecto solo loopback. Para clientes LAN, configurar dirección
   explícita, orígenes exactos, TLS/reverse proxy y firewall del operador. No
   publicar el perfil legacy anónimo directamente en Internet.
5. No arrancar consumidores físicos duplicados. El simulador solo observa; la
   integración MQTT física y sus leases conservan el runbook de fase 17.

Prueba sin hardware, en proyecto separado:

```sh
# Crear un archivo privado a partir de edge.env.example y asignar ambos tokens.
docker compose -p mimix-sim --env-file .edge-release/runtime.env \
  -f infra/docker/compose.yaml --profile simulator up -d --wait --pull never
# Esperar registro {"type":"connected",...}; no ejecuta motores.
docker compose -p mimix-sim -f infra/docker/compose.yaml logs robot-simulator
```

El simulador comparte solamente el namespace del gateway para mantener el contrato
HTTPS/loopback existente. Retirarlo antes de actualizar/recrear ese gateway; el
script de releases rechaza un proyecto que todavía contenga el simulador.

## Cloud

El perfil `cloud` conserva la configuración existente y acceso externo. Crear
`infra/docker/cloud.env` privado con las variables del despliegue autorizado:
Clerk, `MIMIX_DATA_STORE=postgres`, `DATABASE_URL`, orígenes y flags necesarios.
Aplicar migraciones mediante el procedimiento existente **antes** de activar ese
modo; no se añade PostgreSQL local en Jetson. Sin archivo, cloud queda en el modo
legacy de compatibilidad, únicamente loopback, no en un servicio autenticado de
producción. Para despliegue real seguir también los runbooks de identidad/datos.

```sh
MIMIX_PLATFORM=linux/amd64 MIMIX_RUNTIME_IMAGE=mimix-runtime:git-sha \
  docker compose -p mimix-cloud -f infra/docker/compose.yaml --profile cloud up -d --wait --pull never
```

## Salud, logs y fallos

Health de runtime comprueba `/api/health` y que Vite sirva el HTML; no certifica
ROS, vídeo, proveedores cloud ni conexión física. El simulador exige un token
bridge no vacío y expone su presencia real por un socket Unix privado en `/tmp`.
Su healthcheck consulta ese mismo proceso y exige un stream online sin expirar;
una credencial rechazada, desconexión o receptor bloqueado deja de dar healthy.
La presencia es una observación local, no una garantía de ejecución física. Docker marca `unhealthy`, pero no
reinicia automáticamente por ese estado; `unless-stopped` solo cubre salida del
proceso. El operador debe investigar estados unhealthy persistentes.

```sh
docker compose -p mimix-edge -f infra/docker/compose.yaml ps
docker compose -p mimix-edge -f infra/docker/compose.yaml logs --tail 100 edge-gateway
docker stats --no-stream
```

## Actualización y rollback sin red

Cargar primero el nuevo tar/digest y conservar la imagen actual. Detener actividad
física y confirmar parada mediante el procedimiento del robot antes de actualizar;
este script no controla hardware. El script administra **solo** `edge-gateway`
en el proyecto `mimix-edge` (override `MIMIX_EDGE_PROJECT`); no usa `down`, prune,
volúmenes ni comandos del launcher.

```sh
bash infra/docker/edge-release.sh "$PWD/.edge-release" deploy mimix-runtime:new-sha
bash infra/docker/edge-release.sh "$PWD/.edge-release" rollback
# Tras kill -9, corte eléctrico o rollback fallido que dejó pending:
bash infra/docker/edge-release.sh "$PWD/.edge-release" recover
```

Cada release se resuelve a referencia local inmutable de la plataforma configurada antes
de alterar el contenedor (digest de repositorio para índices multiarch, ID para
imágenes locales sin digest);
imagen ausente aborta sin parar la actual. `flock` excluye operaciones concurrentes.
Registros `current`, `previous`, `pending` se reemplazan mediante rename,
sincronizando el archivo y el directorio; la eliminación del journal también se
sincroniza. Si falla una escritura durante restauración, se conserva `pending`. El script
espera health (90s por defecto, `MIMIX_WAIT_TIMEOUT`), y ante error/señal intenta
restaurar la referencia anterior con las mismas variables y sin pull. Si el primer arranque
falla, retira solo ese gateway. Un `pending` tras interrupción bloquea nuevas
actualizaciones hasta `recover`; conservar estado e imágenes hasta recuperación.
Si también falla la restauración, informa fallo y mantiene `pending` para intervención.

Rollback es de **imagen**, no de Compose/configuración/datos. Conservar una copia
de esta versión de Compose y `runtime.env`; no editarlos durante la transacción.
No hay migración de datos en esta fase. No ejecutar prune sobre las imágenes
referenciadas. No adoptar con el script un proyecto creado manualmente: elegir
otro proyecto/puerto o detenerlo y migrarlo con la evidencia del operador.

## Validación y gate Jetson

Resultados locales y digests: [evidencia de esta fase](edge-arm64-verification.md).

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:smoke
MIMIX_TEST_PLATFORM=linux/amd64 pnpm test:edge
# Con el perfil edge saludable en localhost:4080:
pnpm test:edge:browser
```

`test:edge` exige imágenes `mimix-runtime:edge-test` y `mimix-simulator:edge-test`
y prueba contenedores reales, arranque con `network_mode: none`, reinicio, límites, simulador,
imagen inexistente, actualización inválida, rollback y recuperación de journal.
La prueba de navegador usa contexto frío y bloquea orígenes externos. La red
bridge de operación permite conectividad cuando existe WAN; no es un firewall.
La variante de prueba sin interfaces verifica que API/Vite arrancan sin ella;
no se usa para publicar el puerto (Docker 29 omite publicaciones en redes internal).

Antes de habilitar hardware registrar modelo Jetson, JetPack, Docker/Compose,
release/digests y launcher vigente. Desconectar WAN, reiniciar host, verificar
mundo/retos y landmarks locales; comparar inventario de puertos/procesos antes y
después. Medir CPU/RAM/temperatura 15 min con visión/ROS/navegador activos, comprobar
margen de memoria y ausencia de OOM/throttling. Ensayar rollback y parada física
según `mimix_robot`. La prueba emulada y CI no sustituyen este gate físico.
