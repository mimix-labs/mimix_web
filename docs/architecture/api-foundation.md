# Fundación API: diseño y migración incremental

Base: `6dcbf94`, después del workspace pnpm/Turbo. Alcance: prompt 04.

## Corte elegido

Un proceso NestJS sobre Fastify en `apps/api`, con TypeScript estricto,
configuración validada antes de escuchar, logs JSON, errores sin detalles
internos y OpenAPI. Health se implementa en Nest; el resto conserva handlers
Express mediante un hook `onRequest` sobre las peticiones/respuestas HTTP
crudas. Las rutas registradas en Fastify permanecen en su ciclo nativo; para
las demás, `reply.hijack()` entrega a Express la responsabilidad de completar
la respuesta, incluido el 404 final. Un cuerpo nunca pasa por ambos parsers.
Así no se duplican estados ni se agrega un salto de red.

Reescribir todos los handlers a la vez ampliaría el riesgo en SSE y control
físico. Mantener dos servidores obligaría a coordinar estado y despliegue.
El adaptador en el mismo proceso permite sustituir grupos de rutas después,
cuando sus contratos y módulos de dominio estén listos.

Los módulos identity, challenges, learning, campaigns, agent, conversations,
embodiments, devices, media y sync solo declaran fronteras. No implementan
Clerk, datos, MQTT, herramientas del agente ni funciones futuras.

## Inventario previo de endpoints

| Método y ruta | Consumidor | Estado y autorización actual |
| --- | --- | --- |
| GET `/api/health` | Railway, smoke | Sin estado, público. |
| GET `/api/vision/config` | `robotVision.js` | Modo del despliegue, público. |
| POST `/api/vision/hand-landmarks` | Productor Jetson externo | Último frame; reloj del servidor, público legacy. |
| GET `/api/vision/stream` | `robotVision.js` | Set SSE; replay de frame menor de 5 s, público. |
| GET `/api/vision/status` | Diagnóstico externo | Clientes y último frame, público. |
| GET `/api/vision/video` | Imagen de `robotVision.js` | Proxy HTTP MJPEG; se cierra al desconectar, público. |
| POST `/api/robot/context` | `RobotWebBridge.js`, `robotWebBridge.js` | Último contexto, público. |
| GET `/api/robot/context` | Guía/bridge externo | Lectura del contexto; token bridge si está configurado. |
| POST `/api/robot/commands` | Guía/bridge externo | Broadcast navigate_to; token bridge si está configurado. |
| GET `/api/robot/commands/stream` | Ambos bridges web | Set SSE de navegación, público. |
| GET `/api/robot/status` | `RobotControls.js` | Contadores y contexto, público. |
| POST `/api/robot/motion` | `RobotControls.js` | Requiere ambos tokens configurados y token de operador. |
| GET `/api/robot/motion/stream` | Jetson externa | Requiere token bridge configurado; Set SSE y heartbeat. |
| POST `/api/challenges/events` | `socketBridge.js` de ambos retos | Aceptación y log; no almacena eventos. |
| GET assets, retos y fallback SPA | Navegador | `client/dist`; caché de assets conservada. |

La evidencia de consumidores externos es el contrato del servidor y la guía
Railway; este PR no inspecciona ni modifica `mimix_robot`.

Memoria por instancia: tres sets de respuestas SSE, último frame, contexto,
mapa de secuencias (máximo 1000), lease de movimiento. Se conserva una réplica.
Movimiento: máximo 300 ms, stop 100 ms, TTL de evento 3000 ms, lease 1200 ms.
No cambian nombres SSE (`hand-landmarks`, `robot-command`, `robot-motion`).

## Criterios de aceptación

- Mismos cuerpos/códigos de las rutas existentes, estáticos y SSE.
- Auth temporal compartida, roles bridge/control separados y fallos 401/503
  conservados; no introducir tokens en URL, frontend ni logs.
- Config inválida impide arrancar sin imprimir valores secretos.
- Health y documento OpenAPI accesibles en el mismo origen.
- Errores inesperados devuelven JSON genérico; fallos legacy de validación
  conservan su contrato. Los logs no incluyen cuerpos ni credenciales.
- Contratos ejecutados contra Express y Nest/Fastify; smoke de ambos runtimes,
  incluyendo imagen Docker y cierre de SSE en apagado.

## Rollback previsto

`MIMIX_API_RUNTIME=express` selecciona el adaptador standalone de la misma
imagen y conserva el puerto, assets y configuración. Cambiar requiere reinicio;
SSE se reconecta y el estado efímero se pierde como antes. No hay doble proceso.
Si la extracción legacy fuera la causa, revertir los commits del PR y desplegar
la imagen anterior. No hay migraciones de datos.
