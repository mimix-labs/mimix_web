# Mimix Web

Mimix es una experiencia educativa 3D para explorar Matemáticas y Ciencias junto a Wall-E. Funciona en una laptop usando MediaPipe en el navegador y también puede conectarse a una NVIDIA Jetson para recibir detección de manos y comandos del robot.

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
- npm.
- Navegador moderno con WebGL; HTTPS o `localhost` para usar la webcam.

## Desarrollo local

Instala las dependencias:

```bash
npm run install:all
```

Copia las variables del servidor y conserva el modo para laptop:

```bash
cp server/.env.example server/.env
```

Inicia el backend y el cliente en dos terminales:

```bash
npm run server
npm run client
```

La aplicación quedará disponible en `http://localhost:5173` y Vite enviará las solicitudes `/api` al backend en `http://localhost:4000`.

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
npm run build
npm start
```

Express sirve el contenido compilado de `client/dist` y la API desde el mismo origen. El puerto se toma de `PORT` y, por defecto, es `4000`.

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
  public/challenges/       Experiencias de Matemáticas y Ciencias
server/                    API Express, SSE y puente de visión/robot
docs/                      Arquitectura, integración y despliegue
.railway/railway.ts        Infraestructura de Railway
Dockerfile                 Build de producción
```

## Variables del servidor

- `PORT`: puerto HTTP; Railway lo asigna automáticamente.
- `MIMIX_VISION_MODE`: `browser` o `jetson`.
- `MIMIX_VISION_VIDEO_URL`: stream MJPEG opcional de la Jetson.
- `MIMIX_ROBOT_BRIDGE_TOKEN`: protege los endpoints de comandos del robot.

No publiques archivos `.env` ni tokens reales en el repositorio.
