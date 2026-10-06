# Mimix Web

Mimix es una experiencia educativa 3D para explorar Matemáticas y Ciencias junto a Wall-E. Funciona en una laptop usando MediaPipe en el navegador y también puede conectarse a una NVIDIA Jetson para recibir detección de manos y comandos del robot.

Este README describe la implementación actual. La evolución acordada hacia plataforma extensible, Agent Core neutral, Next.js, NestJS y modo edge está en [arquitectura objetivo](docs/architecture/target-architecture.md), con ejecución dividida en [PRs secuenciales](docs/architecture/delivery-plan.md).

**Demo:** [mimix-web-production.up.railway.app](https://mimix-web-production.up.railway.app)

## Características

- Mundo 3D construido con Three.js.
- Movimiento con teclado y cámara controlada con ratón.
- Retos interactivos de Matemáticas y Ciencias.
- Detección de manos en el navegador para laptops.
- Integración opcional con visión nativa y robot en Jetson.
- Guía de primeros pasos accesible desde **Cómo jugar** y ayuda de gestos dentro de cada reto.
- Cliente y API desplegados como un único servicio en Railway.

## Controles

- `W`, `A`, `S`, `D` o flechas: mover a Wall-E.
- Arrastrar con el ratón: mover o rotar la cámara.
- Rueda del ratón: acercar o alejar.
- Caminar hacia un aro amarillo: entrar al reto correspondiente.

Dentro de los retos, la interacción por manos depende del modo de visión configurado. El navegador solicitará permiso para usar la cámara cuando el modo sea `browser`.

## Requisitos

- Node.js 22 o posterior.
- pnpm 10.34.6 (versión fijada en `packageManager`).
- Navegador moderno con WebGL; HTTPS o `localhost` para usar la webcam.

## Desarrollo local

Instala las dependencias:

```bash
npm install --global pnpm@10.34.6
pnpm install --frozen-lockfile
```

Copia las variables del servidor y conserva el modo para laptop:

```bash
cp server/.env.example server/.env
```

Inicia el backend y el cliente juntos:

```bash
pnpm dev
```

La aplicación quedará disponible en `http://localhost:5173` y Vite enviará las solicitudes `/api` al backend en `http://localhost:4000`.

También puedes usar `pnpm server` y `pnpm client` en terminales separadas.
`pnpm lint`, `pnpm typecheck` y `pnpm test` ejecutan los gates de la raíz;
`pnpm check` incluye además el build y el smoke de producción.
Consulta [el workspace pnpm/Turbo](docs/pnpm-workspace.md) para migración y rollback.

La API valida configuración al arrancar y publica OpenAPI en
`/api/openapi.json`. `MIMIX_API_RUNTIME=express` permite rollback temporal
tras reiniciar. Consulta el [runbook del backend](docs/runbooks/api-foundation.md).

La identidad Clerk/Google y la protección incremental de API se describen en el
[runbook de identidad](docs/runbooks/identity-clerk.md). El modo inicial conserva
la compatibilidad del cliente; activar Clerk requiere completar su checklist.

El almacén de intentos y eventos PostgreSQL se activa explícitamente con
`MIMIX_DATA_STORE=postgres`. Migración de UUID, contratos de progreso, backup y
rollback: [runbook de aprendizaje](docs/runbooks/learning-event-store.md).

## Challenge SDK

Los nuevos contratos y el SDK neutral se documentan en [Challenge SDK v1](docs/architecture/challenge-sdk.md). Incluyen manifest, CLI y fixture de referencia. Matemáticas y Ciencias se empaquetan ahora como retos oficiales v1.0.0, conservando sus rutas y comportamiento mediante un [host de transición confiable](docs/architecture/official-challenges.md), con rollback legacy.

El [runtime aislado](docs/architecture/challenge-runtime.md) añade iframe sandbox, bridge con grants y un harness local con pruebas hostiles en Chromium, Firefox y WebKit. La integración de sensores de los retos oficiales sigue en el host confiable; no se afirma aislamiento de esas vistas ni se relaja el sandbox.

## Campañas y progresión

La [API de campañas versionadas](docs/architecture/campaign-progression.md) deriva
desbloqueos y finalización desde eventos de aprendizaje. Incluye prerequisitos,
reintentos y una semilla técnica opt-in; no añade UI ni finalizaciones automáticas
a los retos exploratorios. [Migración, permisos y rollback](docs/runbooks/campaign-progression.md).

## Agent Core y personajes

La [fundación del agente](docs/architecture/agent-core.md) añade contexto y turnos
acotados, recomendaciones y herramientas de lectura autorizadas. Wall-E es un
perfil reemplazable separado del núcleo. El puerto LLM es opcional; todavía no hay
endpoint, proveedor externo ni voz activados. [Verificación y rollback](docs/runbooks/agent-core-verification.md).

## Voz opcional

El [VoiceProvider](docs/architecture/voice-provider.md) ofrece síntesis detrás del
servidor con subtítulos y fallback sin audio. ElevenLabs está desactivado por defecto
y requiere Clerk, configuración privada y política de retención explícita. No añade
UI ni conversación offline. [Activación, costos y rollback](docs/runbooks/voice-provider.md).

## Coordinación de embodiment

El [coordinador](docs/architecture/embodiment-coordinator.md) añade lease temporal
único, permisos web revocables y un stub físico. La API de voz conserva subtítulos
y evita síntesis web cuando el robot posee el lease. No conecta hardware ni modifica
la UI. [Límites, validación y rollback](docs/runbooks/embodiment-coordinator.md).

## Protocolo y simulador de robot

El [protocolo versionado](docs/architecture/robot-protocol.md) conserva los contratos
HTTP/SSE de `mimix_robot` y prepara presencia, capabilities, cámara e intenciones
semánticas. El [simulador sin hardware](docs/runbooks/robot-protocol-simulator.md)
permite probar autenticación, latencia, fallos y reconexión contra la API local.
El simulador conserva el flujo heredado; no conecta motores, MQTT o WebRTC.

## Sesiones de dispositivo

El [pairing revocable](docs/architecture/device-sessions.md) vincula un robot con
usuario, login y capabilities aprobadas sin entregarle credenciales Clerk.
Incluye presencia, heartbeat, caducidad y auditoría PostgreSQL. Está desactivado
por defecto; [activación y recuperación](docs/runbooks/device-sessions.md).
No añade UI ni despacho físico.

## Modos de visión

### Laptop o Railway

```env
MIMIX_VISION_MODE=browser
```

MediaPipe procesa la cámara directamente en el navegador. Este es el modo recomendado para Railway.

### NVIDIA Jetson

```env
MIMIX_VISION_MODE=jetson
MIMIX_VISION_VIDEO_URL=http://127.0.0.1:8081/stream.mjpg
MIMIX_ROBOT_BRIDGE_TOKEN=un-secreto-largo
```

La Jetson publica landmarks de manos hacia la API y puede enviar comandos de navegación mediante el puente del robot. La configuración completa de estas variables está documentada en [`server/.env.example`](server/.env.example).

## Compilar y ejecutar producción

```bash
pnpm build
pnpm start
```

Nest/Fastify monta temporalmente Express para servir el contenido compilado de `client/dist` y la API desde el mismo origen. El puerto se toma de `PORT` y, por defecto, es `4000`.

## Despliegue en Railway

El repositorio incluye un `Dockerfile` multi-stage y la configuración versionada en `.railway/railway.ts`.

```bash
railway link
railway variable set MIMIX_VISION_MODE=browser
railway up
```

El healthcheck es `/api/health`. Railway inyecta `PORT`, por lo que no debe configurarse manualmente. La guía completa está en [docs/deployment-railway.md](docs/deployment-railway.md).

## Estructura

```text
client/                    Aplicación Vite, mundo Three.js y retos
  src/                     Escena principal, entidades, sistemas y UI
  challenges/              Entradas públicas de Matemáticas y Ciencias
  public/challenges/       Scripts legacy y compatibilidad
  public/legacy/challenges/ HTML de rollback
apps/api/                  API Nest/Fastify, configuración, health y OpenAPI
packages/contracts/        Esquemas Zod compartidos de retos y aprendizaje
packages/challenge-sdk/    API pública de retos, CLI y fixture mínimo
packages/challenge-runtime/ Host aislado, bridge y harness de desarrollo
packages/challenge-mathematics/ Reto oficial de Matemáticas v1.0.0
packages/challenge-science/ Reto oficial de Ciencias v1.0.0
packages/challenge-browser/ Utilidades de vistas oficiales confiables
server/                    Adaptador Express temporal: SSE y puente de visión/robot
docs/                      Arquitectura, integración y despliegue
.railway/railway.ts        Infraestructura de Railway
pnpm-workspace.yaml        Workspace actual: client, server, apps/* y packages/*
pnpm-lock.yaml             Único lockfile del repositorio
turbo.json                 Orquestación de tareas y caché del build
Dockerfile                 Build de producción
```

## Variables del servidor

- `PORT`: puerto HTTP; Railway lo asigna automáticamente.
- `MIMIX_VISION_MODE`: `browser` o `jetson`.
- `MIMIX_VISION_VIDEO_URL`: stream MJPEG opcional de la Jetson.
- `MIMIX_ROBOT_BRIDGE_TOKEN`: protege los endpoints de comandos del robot.

No publiques archivos `.env` ni tokens reales en el repositorio.

## Media WebRTC (opt-in)

El backend ofrece `@mimix/media-contract` y un adaptador LiveKit con tokens de sala
acotados por DeviceSession, cámara/micrófono/altavoz explícitos y fallback MJPEG LAN.
Configuración, límites de revocación, pruebas y gate Jetson: [runbook MediaProvider](docs/runbooks/media-livekit.md).
Desactivado por defecto; no incorpora todavía un consumidor de medios en la UI o el robot.

### Semantic robot control (opt-in)

`MIMIX_ROBOT_TRANSPORT=mqtt` enables authorized `BehaviorIntent` delivery through
MQTT 5, with TTL, scoped ACK, durable audit and gateway stopping. Requires Clerk,
PostgreSQL, DeviceSessions and a single API process; credentials stay on the
backend/gateway. Default `legacy` retains HTTP/SSE rollback. No physical motor
integration is included. See [MQTT runbook](docs/runbooks/robot-control-mqtt.md).

## Runtime edge ARM64

[Build multi-platform, perfiles cloud/edge/simulator y operación Jetson](docs/runbooks/edge-arm64.md).
El runtime actual sirve Vite y gateway local en un proceso, con imágenes precargadas,
healthchecks, límites y actualización con rollback. Incluye Draco local para arranque
sin Internet; no modifica el launcher del robot. La cola SQLite de progreso y su
sincronización requieren activación explícita; ver [protocolo](docs/architecture/offline-sync.md)
y [operación y recuperación](docs/runbooks/offline-progress-sync.md).

## Shell web Next.js (opt-in)

`apps/web` incorpora inicio, acceso Clerk, catálogo, perfil y progreso en el puerto
3100 (`pnpm web`). El despliegue Vite/API y `pnpm start` permanecen operativos.
Build Turbopack, imagen standalone, configuración de identidad, límites de transición,
pruebas y rollback: [runbook del shell](docs/runbooks/web-nextjs-shell.md).
No migra el mundo Three.js ni añade `/play` en este PR.
