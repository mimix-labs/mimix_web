# Operación de la fundación API

## Ejecución

Node.js 22 y pnpm 10.34.6. Instalar desde raíz con
`pnpm install --frozen-lockfile`. `pnpm dev` inicia Vite y Nest/Fastify;
`pnpm server` inicia solo la API con recarga TypeScript. `pnpm build` genera
`apps/api/dist` y `client/dist`; `pnpm start` ejecuta la API compilada.

`server/.env` conserva su ubicación y se lee con ruta absoluta, tanto desde
raíz como desde `apps/api`. Variables exportadas tienen prioridad. Docker no
copia `.env`; Railway sigue inyectando variables y usa el mismo Dockerfile,
puerto y healthcheck. Mantener una sola réplica: el estado aún es efímero.

## Configuración validada al arrancar

| Variable | Default / contrato |
| --- | --- |
| `PORT` | 4000; entero 1–65535, sin sufijos. |
| `HOST` | `0.0.0.0`; no vacío ni con espacios exteriores. |
| `MIMIX_API_RUNTIME` | `nest`; alternativa temporal `express`. |
| `MIMIX_VISION_MODE` | `browser`; alternativa `jetson`, sin distinción de mayúsculas. |
| `MIMIX_VISION_VIDEO_URL` | `http://127.0.0.1:8081/stream.mjpg`; HTTP sin credenciales en URL, igual al transporte legacy. |
| `MIMIX_ROBOT_BRIDGE_TOKEN` | Opcional; secreto del bridge. |
| `MIMIX_ROBOT_CONTROL_TOKEN` | Opcional; debe diferir del bridge si ambos están configurados. |
| `LOG_LEVEL` | `info`; fatal/error/warn/info/debug/trace/silent. |

Un valor inválido detiene el proceso antes de escuchar y registra solamente el
nombre del campo. No se imprimen secretos. Los logs de requests son JSON,
con request ID generado por el servidor, método, ruta sin query, estado y tiempo.
Los eventos de retos registran aceptación sin payload ni datos de estudiante.
El rollback Express mantiene logs JSON de arranque/eventos; no ofrece los logs
HTTP ni OpenAPI propios de Nest. `LOG_LEVEL` gobierna el logger HTTP Fastify;
los logs de ciclo de vida de Nest usan su logger JSON.

## Health, OpenAPI y errores

- `GET /api/health`: conserva `{ "status": "ok", "project": "mimix" }`.
- `GET /api/openapi.json`: documento OpenAPI en runtime Nest, con health y todas
  las rutas legacy, cuerpos, credenciales y respuestas principales. No incluye UI.
- Errores inesperados: 500 JSON genérico sin stack ni valores recibidos.
- JSON malformado: 400; cuerpo JSON >100 KiB en legacy: 413; charset o
  codificación no soportados: 415.
- Los errores funcionales legacy (400/401/409/423/503) mantienen sus cuerpos.
- API inexistente: 404; en Nest devuelve JSON. HTML de errores de Express no
  constituye un contrato cliente; su sustitución evita filtrar detalles internos.
- Un método sin handler también devuelve 404, incluso con cuerpo JSON. El
  adaptador completa la respuesta sin devolver el stream consumido a Fastify.

## Autenticación temporal y deprecación

Las políticas se centralizan en `server/src/bridge-auth.js`, con comparación de
hashes en tiempo constante. Se mantienen **dos roles distintos**:

- `X-Mimix-Robot-Token`: GET contexto y POST navegación lo requieren cuando
  `MIMIX_ROBOT_BRIDGE_TOKEN` está configurado. GET motion/stream lo requiere
  siempre; sin configuración devuelve 503.
- `X-Mimix-Control-Token`: POST motion exige bridge y control configurados;
  sin ambos devuelve 503. Credencial ausente o incorrecta devuelve 401.
- Los secretos no se sustituyen entre roles. Nunca se aceptan por query string.
- El piloto sin token solo conserva GET contexto/POST navegación abiertos.
  No abre control físico. Las publicaciones de contexto/landmarks, eventos de
  retos y streams de navegador siguen públicos por compatibilidad.

Estos secretos compartidos están deprecados como mecanismo final. No se fija
fecha de retirada: las fases Identity y DeviceSession deben introducir identidad,
grants acotados y migración de consumidores primero. No se añade Clerk ni JWT en
este PR. El productor Jetson externo no se modifica. Las rutas públicas legacy,
CORS permisivo y estado de una réplica son deuda explícita, no garantías nuevas.

## Cortes siguientes

Extraer grupos de handlers a sus módulos solo cuando su fase entregue contratos
revisados. Las rutas registradas en Fastify tienen prioridad antes del parsing.
Al migrar una ruta, retirar su handler del adaptador de compatibilidad y de la
sección manual de OpenAPI, preservando el contrato o versionándolo explícitamente.
La fundación actual migra health; el siguiente PR autorizado corresponde al
prompt 05, no implementado aquí. Los diez módulos vacíos no exponen endpoints.

## Validación y rollback

`pnpm check` ejecuta lint JS/TS, typecheck estricto API y checkJs legacy/tests,
contratos contra ambos runtimes, build y smoke de producción. Los contratos usan
HTTP, SSE y un upstream MJPEG local, sin hardware. Docker se verifica con:

```bash
docker build -t mimix:ci .
node --test test/smoke/container.test.js
```

El smoke arranca Nest y Express desde la misma imagen con `PORT` personalizado,
valida health, frontend, retos, 404 y usuario no root, y comprueba SIGTERM con SSE
activo. Los clientes, heartbeats y upstreams se cierran antes de cerrar Fastify.
Un corte abrupto del upstream MJPEG termina la respuesta downstream; su registro
se conserva hasta el cierre downstream para que el apagado pueda drenarla.

Rollback inmediato, autorizado por el responsable de despliegue:

1. Configurar `MIMIX_API_RUNTIME=express` y reiniciar el mismo despliegue.
2. Comprobar health, ambas experiencias y reconexión de SSE. OpenAPI ya no está
   disponible; los contratos de producto permanecen en el mismo puerto.
3. Si la causa está en el adaptador compartido, revertir los commits de este PR
   mediante un PR y desplegar la imagen anterior (`main` en `6dcbf94`).
4. Reinstalar con lockfile congelado y correr `pnpm check` sobre el revert.

Reiniciar pierde contexto, último frame, secuencias y lease de memoria igual que
antes. No hay datos persistidos que migrar ni secretos que rotar por el cambio.
No se despliega ni se hace merge automáticamente. Hardware y ARM64 quedan fuera
de la validación de esta fase; ninguna implementación del robot se modifica.

## Referencias

- [Adaptador Fastify de Nest y middleware HTTP crudo](https://docs.nestjs.com/techniques/performance).
- [OpenAPI en Nest](https://docs.nestjs.com/openapi/introduction).
