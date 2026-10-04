# API Foundation Implementation Plan

> Execution: native, sequential; independent review of the full diff before PR.

**Goal:** Nest/Fastify foundation with legacy HTTP compatibility and reversible deployment.
**Architecture:** One process, native health/OpenAPI, temporary Express adapter, empty domain modules.
**Tech Stack:** Node 22, pnpm 10.34.6, NestJS/Fastify, strict TypeScript.
**Spec:** `docs/architecture/api-foundation.md` and prompt 04.

## Constraints

Exact branch `refactor/api-nestjs-foundation` from `6dcbf94`; preserve other
worktrees. No UI, Clerk, PostgreSQL, MQTT, microservices or future functionality.
Commit/push/PR authorized; no merge. Explicit prompt authorizes continuous work.

## Tasks

- [x] 1. Characterize all existing HTTP endpoints, auth and three SSE streams in
  `test/contracts/legacy.test.js`. Run against the current Express entrypoint.
  Add failing assertions for independent app instances and shutdown cleanup;
  extract `createLegacyApp(options): { app, close }` to `server/src/legacy.js`.
  Centralize optional bridge, required bridge and control auth in `bridge-auth.js`.
- [x] 2. Add failing tests for validated config, native health/OpenAPI, sanitized
  errors/logs and adapted routes. Create `apps/api/src/app.ts` exporting
  `createApi(config)` and strict build config. Config parser accepts an env map;
  expose port, host, vision, tokens, runtime and log level. Create ten empty
  modules, exception filter and lifecycle cleanup. Document legacy routes in
  OpenAPI while marking the temporary bridge credentials as deprecated.
- [x] 3. Wire root scripts, Turbo, Docker and CI to build/test the API. Bootstrap
  reads `server/.env` without overwriting exported variables. Runtime flag
  chooses Nest (default) or Express; both use the same adapter/config.
  Test both launches, SIGTERM with active SSE, frontend assets and custom PORT.
- [x] 4. Update README, runbook, ADR implementation status, quality gates and
  progress; frozen install, lint, strict typecheck, tests, build and Docker smoke.
  Independent read-only review and regression fixes. Git delivery and remote CI
  are recorded in the PR description after local validation.

## Review focus

Tests must cover body parsing (malformed/oversized JSON), SSE disconnect/cleanup,
configured versus absent credentials (never allowing control without both),
logging of secrets in paths/bodies, and runtime rollback without stale listeners.
No hardware is required: MJPEG uses a local HTTP fixture, SSE uses real sockets.

## Execution evidence

- Baseline: frozen install and `pnpm check` passed before changes.
- Existing contract suite passed before extraction; factory/config/bootstrap
  assertions failed first and passed after implementation.
- New API uses Nest 12.1.2 and Fastify 5.12.5, compatible with existing Node 22.
- Existing dependency resolutions retained; no existing package removed from lock.
- Full `pnpm check`: 8 tasks, 27 test executions; Docker: both runtimes pass.
- `pnpm dev`: TypeScript watch, Vite proxy, OpenAPI and env propagation passed.
- Independent review found MJPEG shutdown and status-415 regressions. Both gained
  failing reproductions, fixes and passing regressions; full suite then passed.
- Deferred: inherited public routes/CORS, memory-only state, hardware/ARM64 and
  deployment administration. No new domain features were introduced.
- Final commit, PR and remote CI evidence are recorded in the PR description.
