# Plan de evolución

## Regla de entrega

La migración se hará en este repositorio mediante PRs pequeños, secuenciales y desplegables. Cada PR tendrá rama propia, pruebas proporcionales al riesgo, documentación y rollback. Backend, contratos, datos, robot y edge se estabilizarán antes de migrar o rediseñar frontend. `mimix_robot` permanece separado.

Cada chat está autorizado para crear su rama, implementar, producir commits ordenados, hacer push y abrir o actualizar el PR. El merge a `main` pertenece exclusivamente al usuario.

Convenciones completas y prompts ejecutables viven en `/home/edwar/Escritorio/mimix/Prompts`.

## Fase 0: base verificable

1. `docs/architecture-baseline`: lenguaje, arquitectura, ADRs, reglas y orden de trabajo.
2. `ci/quality-gates`: CI, smoke tests, plantilla de PR y gates.
3. `chore/pnpm-turborepo-workspace`: pnpm workspaces, Turborepo y comandos homogéneos.

## Fase 1: backend y datos

4. `refactor/api-nestjs-foundation`: NestJS/Fastify, OpenAPI y migración incremental de Express.
5. `feat/identity-clerk-google`: usuario interno, Clerk y Google.
6. `feat/learning-event-store`: PostgreSQL, eventos append-only y proyección de progreso.

## Fase 2: plataforma de retos

7. `feat/challenge-sdk-manifest`: manifest, SDK, contratos y validador.
8. `feat/challenge-sandbox-runtime`: iframe sandbox, bridge y capabilities.
9. `refactor/challenges-package-migration`: Matemáticas y Ciencias como paquetes oficiales.
10. `feat/campaign-progression`: secuencias, desbloqueos y reglas de progresión.

## Fase 3: agente, voz y presencia

11. `feat/agent-core-foundation`: Agent Core neutral y personajes reemplazables.
12. `feat/voice-provider-elevenlabs`: contrato de voz y primer adaptador.
13. `feat/embodiment-coordinator`: lease único, embodiment virtual y stub físico.

## Fase 4: integración opcional con robot

14. `feat/robot-protocol-simulator`: contratos versionados y simulador sin hardware.
15. `feat/device-session-pairing`: pairing, grants y presencia de dispositivo.
16. `feat/media-provider-livekit`: WebRTC/LiveKit y fallback MJPEG local.
17. `feat/robot-control-mqtt`: intenciones semánticas, MQTT y rollback HTTP/SSE.

## Fase 5: edge y offline

18. `feat/edge-arm64-runtime`: imágenes multi-platform y perfiles Compose para Jetson.
19. `feat/offline-progress-sync`: SQLite, idempotencia y reconciliación cloud.

## Fase 6: frontend

20. `feat/web-nextjs-shell`: Next.js, Turbopack, Clerk y superficies de producto.
21. `refactor/web-threejs-play`: mundo Three.js bajo `/play` y runtime compartido con Vite edge.

## Fase 7: UI opcional

22. `<feat-o-fix>/ui-<superficie>-<resultado>`: una mejora visual o de interacción por PR, solo cuando auditoría y evidencia demuestren necesidad.

## Gates de cada PR

- Instalación congelada.
- Lint y typecheck.
- Pruebas unitarias, integración y contratos aplicables.
- Build y smoke test.
- Pruebas `linux/arm64` cuando cambie edge o robot.
- Migración y rollback cuando cambien datos o infraestructura.
- Feature flag para cambios relevantes de comportamiento.
- Autoría exclusiva del desarrollador configurado; sin atribución a Codex, agentes o IA.

## Criterio para separar repositorios o microservicios

Se mantendrán monorepo y modular monolith hasta que un componente tenga ciclo de publicación, permisos, escala o runtime realmente independiente. Un nuevo repositorio o servicio necesita evidencia operativa; no se crea solo por organización visual.
