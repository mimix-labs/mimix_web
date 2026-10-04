---
status: proposed
---

# ADR 0004: backend NestJS sobre Fastify

El backend objetivo será NestJS con adaptador Fastify, separado del runtime de Next.js. Mimix necesita módulos claros, guards, inyección de dependencias, OpenAPI, WebSocket y futura integración MQTT; mantener estas capacidades en Route Handlers de Next.js acoplaría dominio y frontend, mientras continuar con un único archivo Express dificultaría crecer con límites verificables. Se migrarán endpoints gradualmente y se mantendrá un solo despliegue lógico hasta que la operación justifique separar procesos.


## Implementación incremental — prompt 04

`apps/api` incorpora NestJS/Fastify y TypeScript estricto. Health y OpenAPI son
nativos; las rutas restantes usan un adaptador Express en el mismo proceso.
Los módulos de dominio aún están vacíos. La bandera `MIMIX_API_RUNTIME=express`
permite volver temporalmente al adaptador standalone sin cambiar la imagen.
La decisión arquitectónica sigue su estado de aprobación existente; este PR
implementa únicamente la fundación autorizada por el prompt 04.

Inventario, contratos y cortes: [fundación API](../architecture/api-foundation.md).
Operación: [runbook](../runbooks/api-foundation.md).
