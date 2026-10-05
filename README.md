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
