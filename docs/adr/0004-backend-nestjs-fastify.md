---
status: proposed
---

# ADR 0004: backend NestJS sobre Fastify

El backend objetivo será NestJS con adaptador Fastify, separado del runtime de Next.js. Mimix necesita módulos claros, guards, inyección de dependencias, OpenAPI, WebSocket y futura integración MQTT; mantener estas capacidades en Route Handlers de Next.js acoplaría dominio y frontend, mientras continuar con un único archivo Express dificultaría crecer con límites verificables. Se migrarán endpoints gradualmente y se mantendrá un solo despliegue lógico hasta que la operación justifique separar procesos.
