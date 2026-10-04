# Learning event store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persist owned attempts and append-only learning events with reconstructible progress.
**Architecture:** PostgreSQL is the source of truth behind MIMIX_DATA_STORE=postgres. Drizzle repositories and a shared learning service support native Nest and Express rollback with the same security policy.
**Tech Stack:** TypeScript, Nest/Fastify, PostgreSQL 17, Drizzle, pg, Zod, node:test.
**Spec:** `docs/superpowers/specs/2026-10-04-learning-event-store-design.md`

## Global Constraints

- Exact branch feat/learning-event-store; main base da3f6f1; one PR, no merge/prompt07.
- No frontend, campaigns, achievements, robot changes or speculative analytics.
- Preserve UUID on identity migration; file mode remains default; postgres requires Clerk.
- Only named git add, existing developer authorship, no force push.

## Review Focus

- An unavailable database must fail closed without memory fallback or leaked connection strings.
- Identity import conflicts must roll back entirely and retain original UUID.
- Duplicate after terminal transition must return the original event, not become an error.
- Rebuild concurrent with append must not lose a committed event.
- Dynamic URL and cursor variations must not bypass ownership or actor rate quotas.

### Task 1: Transactional storage and migration

**Files:** `apps/api/src/database/*`, `apps/api/src/modules/learning/{contract,projection,store}.ts`, `apps/api/src/modules/identity/postgres.repository.ts`, `apps/api/migrations/*`, `apps/api/test/postgres/store.test.js`, `apps/api/package.json`, lockfile.
**Interfaces:** Produces Database with db/pool/close; PostgresIdentityRepository.resolve; LearningStore.create(userId,input), append(userId,attemptId,input), get(userId,id), progress(userId,after), rebuild(). Strict Zod contracts and LearningError(status,message).

- [x] Write real PostgreSQL tests: import/migration repetition, concurrency, exact/conflicting idempotency, ownership 404, ordering 409, terminal retries, rollback, immutable history and reconstruction; tests fail before implementation.
- [x] Implement schema, SQL migration, DB lifecycle, snapshot import/export, reducer and transaction repository.
- [x] Run `pnpm --filter @mimix/api build && pnpm --filter @mimix/api test:postgres` with disposable test URL. Expected: all storage assertions pass.
- [x] Commit storage as a coherent unit.

### Task 2: Protected HTTP integration

**Files:** `apps/api/src/modules/learning/{learning.module,learning.controller,http}.ts`, `apps/api/src/{app,app.module,main,openapi}.ts`, `apps/api/src/security/*`, environment, identity port; `apps/api/test/postgres/http.test.js`.
**Interfaces:** Consumes Task 1 store/contracts; produces createApi/config and secured legacy handler using async identity repository with owned database lifecycle.

- [x] Write HTTP tests for feature flag, strict config, both runtimes, request validation, owner isolation, pagination, no-store, unavailable DB, template quotas and legacy compatibility. Expected before implementation: learning routes 404.
- [x] Implement native Nest controller, shared service contract, Express rollback adapter, dynamic route policy and OpenAPI.
- [x] Run build, postgres tests and `pnpm check`. Expected: all assertions pass, existing contracts preserved.
- [x] Commit API integration.

### Task 3: Operations, release gates and review

**Files:** `apps/api/src/database/cli.ts`, Dockerfile, Compose, CI, env example, README, architecture/runbook/evidence, tests for restore and container PostgreSQL.
**Interfaces:** Consumes migrate/import/export/rebuild and HTTP contracts. Produces documented one-off CLI operations in production image and repeatable CI/PostgreSQL tests.

- [x] Exercise CLI in disposable database and container: migration twice, snapshot import/export, reconstruction and backup/restore preserve progress.
- [x] Configure PostgreSQL service and mandatory integration tests in CI; migrations included in image.
- [x] Document activation, data policy, backup/restore and rollback; record actual evidence.
- [x] Run frozen install, lint/typecheck/tests/build/smoke via check, PostgreSQL suite, Docker build and all container smoke tests. Expected: exit 0.
- [x] Independent whole-branch review; reproduce important findings RED, fix, then repeat affected/full gates.
- Publication gate: commit, push, create/attach one PR to main and wait for CI on exact HEAD; the PR records the final commit and CI result.

## Execution record

Pre-flight: storage contracts feed HTTP and CLI; runtime flag preserves legacy. No shared-interface conflict.
Task 1: ea11faa, PostgreSQL transactions/migrations and RED→GREEN history checks.
Task 2: 573371f, five HTTP regressions RED→GREEN; existing 58 tests pass.
Task 3 and final review evidence: `docs/runbooks/learning-event-store-verification.md`.
Ruling: skill bookkeeping scripts were not executable; manual versioned evidence used without modifying global permissions (no product effect).
Ruling: tsx dev health returned 500 after the Turbo fix; explicit Reflector injection included because the required development workflow must work (same injection under tsc).
