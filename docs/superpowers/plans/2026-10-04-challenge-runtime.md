# Challenge runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ejecutar fixture SDK en iframe aislado con grants y protocolo defendido.
**Architecture:** Contratos Zod compartidos; host browser y bootstrap hijo; harness dev separado.
**Tech Stack:** TypeScript, Zod, esbuild, node:test, Playwright Chromium/Firefox/WebKit.
**Spec:** docs/superpowers/specs/2026-10-04-challenge-runtime-design.md

## Global Constraints

- feat/challenge-sandbox-runtime desde origin/main con PR #8 fusionado.
- Sin migración de retos, UI de producto ni prompt 09; un PR, no merge.
- No exposición de Clerk/DB/motores/proveedores; grants no implícitos.
- TDD, revisión independiente, CI/browser/Docker verdes antes de terminar.

## Review Focus

- Origen opaco: source/sesión y canal no deben aceptar hermanos o ventanas externas.
- Cancel/revoke/timeout: un resultado tardío no revive instancia ni repite efectos.
- Payloads malformados, replay, límites y transición concurrente: sin ejecutar adaptador.
- CSP y sandbox: DOM/storage/red restringidos; navegación propia no hereda autoridad.
- Consumidor limpio: bundle bootstrap, tipos y CI con los tres engines.

### Task 1: Protocolo y política

**Files:** packages/contracts/src/runtime.ts; packages/challenge-runtime/{package.json,tsconfig.json,src/policy.ts,test/policy.test.js}.
**Interfaces:** Esquemas hello/connect, childMessage, hostMessage; resolveGrants(manifest,approved,available), validateBundle.
- [ ] Escribir tests de versiones/campos desconocidos, payloads, grants, bundle.
- [ ] Observar RED, implementar y ejecutar tests hasta GREEN.

### Task 2: Host y bootstrap

**Files:** packages/challenge-runtime/src/{host,child,frame,index}.ts; scripts/build.mjs; harness/*; test/browser/*.spec.ts.
**Interfaces:** mountChallenge(options)→RuntimeHandle con ready/state/start/pause/resume/dispose/cancel/revoke; HostAdapters con señal y requestId.
- [ ] Escribir prueba navegador fixture/estados y rechazo de hostiles; observar RED.
- [ ] Implementar framing/CSP/handshake, canal, RPC autorizado y lifecycle con deadlines.
- [ ] Añadir pruebas RED→GREEN de revocación, timeout, cancelación y aislamiento real.

### Task 3: Integración y entrega

**Files:** Dockerfile, package.json, turbo.json, .github/workflows/ci.yml, docs/architecture/challenge-runtime.md, docs/runbooks/challenge-runtime-verification.md.
- [ ] Gates congelados, unitarios/tipos, Chromium/Firefox/WebKit, smoke/Docker.
- [ ] Revisión independiente y correcciones importantes con regresión RED→GREEN.
- [ ] Commit/push, un PR adjunto, esperar CI final; documentar límites y rollback sin merge.
