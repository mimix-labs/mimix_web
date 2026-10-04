# Challenge SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Entregar contratos versionados, SDK neutral, CLI y fixture del prompt 07.
**Architecture:** Dos paquetes ESM, esquemas compartidos con learning; host diferido.
**Tech Stack:** TypeScript estricto, Zod 4.6.5, node:test, pnpm/Turbo.
**Spec:** `docs/superpowers/specs/2026-10-04-challenge-sdk-design.md`

## Global Constraints

- Base actualizada con PR #7; rama exacta feat/challenge-sdk-manifest.
- Sin sandbox, migración de retos ni exposición de Clerk/DB/motores/proveedores.
- Un PR a main; no merge ni inicio de prompt 08.
- Ejecutar sin pedir aprobación adicional; TDD y revisión independiente.

## Review Focus

- Versiones no soportadas y metadatos/rutas inválidos: rechazar explícitamente.
- Capacidades duplicadas/solapadas: sin permisos implícitos.
- Payloads SDK/API: misma aceptación estricta y conservación del wire format.
- Entrypoint symlink fuera de raíz: CLI rechaza sin ejecutar archivos.
- Consumidor limpio y Docker: exports, tipos y dependencias disponibles.

### Task 1: Contratos compartidos y compatibilidad learning

**Files:** packages/contracts/{package.json,tsconfig.json,src/*,test/*}; apps/api/src/modules/learning/contract.ts; configuración workspace/Turbo/ESLint/Docker.
**Interfaces:** Produce challengeManifestSchema, learningRecordSchema, speakInputSchema, behaviorIntentSchema, challengeErrorSchema y tipos inferidos; API añade eventId/sequence.

- [ ] Escribir tests de manifest válido/inválido, capabilities, payloads e imports públicos.
- [ ] Ejecutar node:test y observar RED por contrato ausente.
- [ ] Implementar esquemas estrictos y extracción de learning sin alterar HTTP.
- [ ] Ejecutar build/tests de contratos y API: todo verde; commit.

### Task 2: SDK, CLI y fixture

**Files:** packages/challenge-sdk/{package.json,tsconfig*.json,src/*,test/*,fixtures/minimal/*}.
**Interfaces:** Consume esquemas Task 1; produce defineChallenge(manifest, factory), ChallengeContext, ChallengeLifecycle, MimixAPI y validateManifest(input); CLI con JSON/exit codes.

- [ ] Escribir pruebas de definición/fixture, CLI (válido, JSON roto, versión, ruta, symlink, sin ejecución), y consumidor TS con usos negativos.
- [ ] Ejecutar y observar RED por SDK/CLI ausentes.
- [ ] Implementar API/tipos, validador, CLI y fixture sin runtime.
- [ ] Ejecutar pruebas y typecheck de SDK: todo verde; commit.

### Task 3: Documentación y gates de entrega

**Files:** README.md, docs/architecture/challenge-sdk.md, docs/runbooks/challenge-sdk-verification.md, plan.
**Interfaces:** Consume los exports/CLI anteriores; documenta compatibilidad, lifecycle, errores, host futuro y rollback.

- [ ] Documentar API, comandos, matriz previa y responsabilidades pendientes exactas.
- [ ] Ejecutar instalación congelada, lint/typecheck/tests/build/smoke/check, PostgreSQL y Docker aplicables.
- [ ] Revisión independiente de diff completo; corregir importantes con RED→GREEN.
- [ ] Commit, push, un PR a main, adjuntar y esperar CI. Registrar evidencia y riesgos sin merge.
