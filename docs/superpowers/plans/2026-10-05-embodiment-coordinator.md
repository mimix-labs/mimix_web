# Embodiment Coordinator Implementation Plan

> **For agentic workers:** Use executing-plans; native implementation. User requests self-review and a stop before commit/push/PR.

**Goal:** Lease temporal único con fallback virtual y exclusión de voz.
**Architecture:** Contrato neutral; coordinador síncrono en API; adaptadores con permisos revocables y guardia en VoiceService.
**Tech Stack:** TypeScript estricto, Zod, node:test, pnpm/Turbo.
**Spec:** `docs/superpowers/specs/2026-10-05-embodiment-coordinator-design.md`.

## Global Constraints

- Rama exacta desde `24c26d72e60a12573b9ee1640151ab64f6561b45`.
- TTL 15 s; rango 100–60000 ms; 256 utterances/conversación; 1000 conversaciones; idle virtual 5 min.
- Sin UI, hardware, MQTT, LiveKit ni endpoints de adquisición física.
- Sin commit, push ni PR.

## Review Focus

- Dos adquisiciones con el mismo lease: exactamente una gana (tarea 2).
- Heartbeat atrasado al límite de expiración: no resucita (tarea 2).
- Reconexión y respuesta de síntesis tardía: no devuelven audio obsoleto (tareas 2–3).
- Mutación de snapshots y fallos de salida: no alteran autoridad ni habilitan replay (tareas 1–2).
- Agotamiento de memoria/cierre: rechaza o limpia sin transferir autoridad física (tareas 2–3).

## Tarea 1 — Contrato

Files: `packages/embodiment-contract/{package.json,tsconfig.json,src/index.ts,test/contracts.test.js}`.
Interfaces: `embodimentLeaseSchema`, `embodimentStateSchema`, tipos `EmbodimentLease`, `EmbodimentPermit`.
- [x] RED: validar lease estricto, estado virtual/robot/cerrado y límites, rechazar combinaciones incoherentes.
- [x] Implementar esquemas y puerto; `pnpm --filter @mimix/embodiment-contract build && pnpm --filter @mimix/embodiment-contract test` verde.

## Tarea 2 — Autoridad y adaptadores

Files: `apps/api/src/modules/embodiments/{coordinator,adapters,sessions}.ts`, `apps/api/test/embodiment.test.js`.
Interfaces: `EmbodimentCoordinator.snapshot/acquireRobot/heartbeat/revoke/permit/claimUtterance/close`, `WebEmbodiment.permit/present/close`, `RobotEmbodiment.perform`, `EmbodimentSessions.forUser/close`.
- [x] RED: transiciones con reloj/scheduler controlados, carrera CAS, límites temporales, reconexión, snapshots aislados, salida única, capacidad y cierre.
- [x] Implementar y ejecutar `node --test apps/api/test/embodiment.test.js` hasta verde.

## Tarea 3 — Integración y entrega

Files: VoiceService, voice-contract reason, API/package.json, Dockerfile, lockfile, tests voice-embodiment/HTTP, README, architecture y runbook.
- [x] RED: robot evita llamada/costo; transición aborta proveedor; respuesta tardía no produce audio; otro usuario sigue normal; fallback recupera web.
- [x] Integrar registro en VoiceService (constructor opcional, instancia compartida por servicio), mantener contrato HTTP salvo nuevo motivo text_only.
- [x] Gates: frozen install, lint, typecheck, test, build, smoke, check y Docker con 5 smokes.
- [x] Revisión propia, corregir regresiones, documentar evidencia y dejar sin commit/push/PR.
