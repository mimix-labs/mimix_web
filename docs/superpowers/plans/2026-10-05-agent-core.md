# Agent Core Implementation Plan

> Ejecución nativa en este chat, TDD y revisión independiente final. El prompt autoriza continuar sin otra aprobación.

**Goal:** núcleo pedagógico neutral con personajes sustituibles y tools autorizadas.
**Architecture:** cuatro paquetes workspace; contratos Zod; core sin almacenamiento;
LLM opcional inyectado. Biblioteca inactiva en la API desplegada.
**Tech Stack:** TypeScript estricto, Zod 4.6.5, node:test, pnpm/Turbo.
**Spec:** `docs/superpowers/specs/2026-10-05-agent-core-design.md`.

## Global Constraints

Solo prompt 11, rama exacta y base verificada. No voz, motores, robot, UI ni
memoria ilimitada. No merge. Sin dependencias externas nuevas.

## Review Focus

- Identidad y conversación cruzadas: rechazar antes de llamar al proveedor.
- Grants mutados durante await: snapshot independiente por turno.
- LLM que inventa tools o argumentos: denegar sin ejecutar.
- Proveedor bloqueado o con salida inválida: fallback acotado y sin secretos.
- Cambio de personaje: mismas recomendaciones y mismos permisos.

### Task 1: contratos y personaje

Archivos: `packages/{agent-contract,character-contract}/src/index.ts`, sus tests,
`characters/wall-e/src/index.ts`, workspace y configuración de build/lint.
Interfaces: schemas v1 y tipos públicos Context, Authorization, TurnInput,
Recommendation, ToolCall, ToolResult, AgentTurn, CharacterProfile y LlmProvider.
- [x] Escribir pruebas de validación estricta, límites y perfil sustituible.
- [x] Ejecutar node:test contra exports vacíos; observar RED por APIs ausentes.
- [x] Implementar contratos y perfil, compilar y verificar GREEN.
- [x] Commit de contratos y configuración.

### Task 2: recomendaciones, autorización y turnos

Archivos: `packages/agent-core/src/{index,recommendations,tools,core}.ts`, tests.
Interfaces: `recommendNext(context)`, `listTools(authorization)`,
`executeTool(call, context, authorization)` y `AgentCore.turn(input, context,
authorization, character)`; dependencia opcional LlmProvider en constructor.
- [x] Pruebas de recomendación, denegación, turnos, reemplazo y proveedor.
- [x] Observar RED; implementar y ejecutar suite completa hasta GREEN.
- [x] Commit del núcleo probado.

### Task 3: documentación y entrega

Archivos: arquitectura/runbook, README y Dockerfile (manifests de workspace).
- [x] Documentar autoridad del host, límites, ejemplo, rollout y rollback.
- [x] Instalación frozen, lint, typecheck, test, build y smoke.
- [x] Build/smoke de contenedor por cambio de manifest Docker.
- [x] Revisión independiente; hallazgos importantes con regresión RED→GREEN.
- [x] Commit, push, PR contra main y adjuntarlo.
- Seguimiento de CI en el PR #12; no fusionar.

## Evidencia de ejecución

Contratos 6/6 y núcleo 10/10 RED→GREEN. Suite global 99/99, smoke 1/1 y
`pnpm check` verdes. Revisión independiente sin hallazgos accionables. Contratos y
núcleo se entregan en un commit coherente con workspace/lockfile/Docker alineados.

Docker build y smoke: 5/5 pruebas de contenedor pasan, incluida restauración
PostgreSQL. PR: https://github.com/mimix-labs/mimix_web/pull/12.
