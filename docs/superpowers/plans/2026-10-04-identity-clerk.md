# Identity Clerk Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task.

**Goal:** Verificar sesiones Clerk y mapearlas a usuarios internos sin migrar UI.
**Architecture:** Puerto de identidad, repositorio durable de una réplica y política
HTTP común delante de Nest/Express. Compatibilidad explícita con flag de activación.
**Tech Stack:** TypeScript, Nest/Fastify, Clerk backend SDK, Node test runner.
**Spec:** `docs/architecture/identity-clerk.md`; prompt externo 05 y contexto 00.

## Global Constraints

Rama `feat/identity-clerk-google`; solo worktree preparado; no prompt 06 ni merge.
No secretos, cambios de autoría, frontend o tokens Clerk para robot.

## Review Focus

- Sesiones revocadas/firma inválida: rechazo antes de crear usuarios.
- Concurrencia/reinicio: UUID estable, sin pérdida de vínculos.
- Rutas Express/case/trailing slash: ninguna evasión de política.
- CORS/OPTIONS: política igual en runtime normal y rollback.
- Credenciales cruzadas/estado global: usuario no obtiene permisos de operador.

## Task 1: Identidad y persistencia

Files: `apps/api/src/modules/identity/*`, `apps/api/test/identity.test.js`.
Interfaces: `IdentityProvider.authenticate(token): Promise<VerifiedIdentity>`;
`IdentityRepository.resolve(identity): User`; adapter Clerk y archivo durable.
- [x] Tests de alta/login/concurrencia/reinicio, corrupción y tokens negativos; observar RED.
- [x] Implementar contratos, adapter y repositorio; verificar GREEN.

## Task 2: Frontera HTTP y configuración

Files: `apps/api/src/{app,main,app.module,openapi}.ts`, config, identity guard,
`server/src/legacy.{js,d.ts}`, tests de política y runtime.
- [x] Escribir tests HTTP: /me, default deny, ambos runtimes, roles, CORS y límites; RED.
- [x] Implementar flag, config validada, política compartida, guard y endpoint; GREEN.
- [x] Ejecutar suite completa y corregir regresiones contractuales explícitas.

## Task 3: Entrega y operación

Files: `.env.example`, Docker/Turbo si aplica, runbook, README, evidencia.
- [x] Documentar Google, volumen, límites, activación, migración y rollback.
- [x] Frozen install; lint; typecheck; tests; build; smoke; Docker.
- [x] Revisión independiente, corregir hallazgos con RED/GREEN.
- Entrega: commit convencional, push y CI registrados en el PR; no hacer merge.
- Crear único PR main, adjuntar, esperar CI y reportar evidencia/deudas.

Evidencia y decisiones finales: [verificación](../../runbooks/identity-clerk-verification.md).
