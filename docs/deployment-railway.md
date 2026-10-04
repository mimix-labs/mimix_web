# Despliegue en Railway

Mimix Web se despliega como un solo servicio. El `Dockerfile` compila el
cliente Vite y la API TypeScript; Nest/Fastify monta el adaptador Express temporal. De
esta forma la web, la API y los streams SSE comparten el mismo dominio.

El build usa pnpm 10.34.6 y el lockfile único con `--frozen-lockfile`. La imagen
final conserva los enlaces de pnpm, incluye solo dependencias de producción de
API/adaptador y arranca Node directamente como usuario `node`. No necesita pnpm,
Turbo ni acceso al registro npm al arrancar. El puerto y el healthcheck no cambian.

Para comprobar la imagen antes de desplegar:

```bash
docker build -t mimix:local .
docker run --rm -p 4000:4000 -e MIMIX_VISION_MODE=browser mimix:local
# En otra terminal:
curl --fail http://localhost:4000/api/health
```

Consulta [migración y rollback](pnpm-workspace.md#rollback) para volver a npm.

## Configuración del servicio

1. Crear un proyecto en Railway desde el repositorio de GitHub
   `mimix-labs/mimix_web`.
2. Mantener la raíz del servicio en `/`. Railway detectará automáticamente el
   `Dockerfile`.
3. Agregar esta variable en **Variables**:

   ```text
   MIMIX_VISION_MODE=browser
   ```

   MediaPipe se ejecutará en el navegador del usuario. No se debe configurar
   `PORT`; Railway lo inyecta automáticamente.
4. El archivo `.railway/railway.ts` configura automáticamente el healthcheck:

   ```text
   /api/health
   ```

5. En **Settings > Networking**, generar un dominio público si el servicio aún
   no tiene uno.

## Despliegue mediante CLI

Con la CLI autenticada y el directorio vinculado al proyecto:

```bash
railway link
railway variable set MIMIX_VISION_MODE=browser
railway up
railway domain
```

Para sincronizar la configuración de infraestructura versionada:

```bash
railway config plan
railway config apply
```

El dominio HTTPS de Railway permite que `getUserMedia` solicite la webcam en
los navegadores compatibles.

El despliegue actual está disponible en:

```text
https://mimix-web-production.up.railway.app
```

## Modo Jetson

Railway no sustituye el despliegue físico de la Jetson. Para ejecutar Mimix en
la Jetson se mantiene `MIMIX_VISION_MODE=jetson`; para Railway debe conservarse
`browser`.

## Control remoto del robot

El modal **Control robot** puede operar una única Jetson conectada a Railway.
La Jetson abre la conexión hacia Internet; no se exponen puertos del robot ni
se requiere una IP pública.

Mantén **una sola réplica** del servicio mientras este canal use memoria y SSE;
con varias réplicas el POST del navegador podría caer en una instancia distinta
de aquella donde está conectado el robot.

Configura en Railway dos secretos diferentes:

```text
MIMIX_ROBOT_BRIDGE_TOKEN=token-largo-para-la-jetson
MIMIX_ROBOT_CONTROL_TOKEN=otra-clave-larga-para-el-operador
```

- `MIMIX_ROBOT_BRIDGE_TOKEN` autentica exclusivamente a `mimix_robot`.
- `MIMIX_ROBOT_CONTROL_TOKEN` se escribe en el modal y vive solo en memoria
  durante esa pestaña; no se incluye en el JavaScript compilado.

En la Jetson configura la misma URL y el mismo token del puente:

```text
MIMIX_WEB_URL=https://mimix-web-production.up.railway.app
MIMIX_ROBOT_BRIDGE_TOKEN=token-largo-para-la-jetson
```

El navegador nunca envía PWM ni pulsos de motores. Solo puede pedir `forward`,
`backward`, `left`, `right` o `stop`. Cada movimiento vence en 300 ms y pasa por
el nodo ROS `safety` antes de llegar al ESP32.

## Fundación API

El runtime por defecto es Nest/Fastify. `MIMIX_API_RUNTIME=express` restaura
temporalmente Express con un reinicio. Health, puerto, assets y contratos de
producto permanecen estables. OpenAPI existe solo en Nest. Validación, auth
temporal y rollback completo: [runbook API](runbooks/api-foundation.md).

## Identidad incremental

Para activar Clerk/Google, montar primero el volumen de identidad, configurar los
orígenes del despliegue y completar el [runbook de identidad](runbooks/identity-clerk.md).
El default `MIMIX_AUTH_MODE=legacy` conserva el cliente actual. El rollback Express
del entrypoint API mantiene la política de autenticación configurada.
