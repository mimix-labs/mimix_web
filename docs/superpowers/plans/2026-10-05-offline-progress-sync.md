# Offline Progress Sync Implementation Plan

> Implement natively in this chat using executing-plans and TDD; finish with independent review. User explicitly authorized design, implementation, commit, push and PR without additional confirmation.

**Goal:** Persist edge learning events in SQLite and reconcile them once with the authenticated cloud owner.
**Architecture:** Local capability-protected queue; immutable Clerk-backed cloud binding; atomic import into existing learning event/projection tables. Host adapter owns retry lifecycle. Flags preserve current deployment.
**Tech Stack:** TypeScript, Node 22.23.2 SQLite, PostgreSQL/Drizzle, Nest/Fastify and Express, pnpm/Turbo, Docker Compose.
**Spec:** `docs/superpowers/specs/2026-10-05-offline-progress-sync-design.md`.

## Global constraints

- Base merge `91ccb932e1738901778309084395bddb33847e2c`; exact branch `feat/offline-progress-sync`.
- Only prompt 19; no merge, prompt 20, robot launcher changes, UI redesign or cloud promises offline.
- No stored Clerk bearer, secrets in logs, user ID supplied by client, or automatic reassignment.
- Existing events/projections remain cloud authority; unacknowledged data is never purged.
- 50 records/batch, 1,000 sessions, 10,000 events; 30-day acknowledged-payload retention based on trusted cloud time.

## Review focus

- Lost cloud ACK and concurrent imports must not increase progress twice.
- Rebinding after login/account change must not transfer a sealed local session.
- Restoring a backup and repeating IDs must preserve idempotency and content conflicts.
- Local clock moving forward/backward must not reorder events or delete pending data.
- SQLite corruption/disk exhaustion and cloud rejection must remain visible without silently resetting storage.

### 1. Durable queue and contracts

Files: `packages/contracts/src/offline.ts`, contracts index; `apps/api/src/modules/sync/{contract,local-store}.ts`; `apps/api/test/offline-store.test.js`.
Interfaces: strict session/attempt/event/bind/batch/receipt schemas; `LocalStore.createSession/createAttempt/append/status/seal/batch/acknowledge/prune/close` with session capability checks.
- [x] Write failing real-SQLite tests for reopen, sequence, duplicate/conflicting IDs, closure, owner capability, sealing, wrong clock, limits and corruption.
- [x] Implement schema, WAL/FULL durability, transactions, capability hashing, immutable records, capacity and retention; run tests.

### 2. Atomic cloud import and identity binding

Files: sync `cloud-store.ts`, learning `store.ts`, database schema and additive migration; `apps/api/test/postgres/sync.test.js`.
Interfaces: `CloudSyncStore.bind(userId,input)` and `importBatch(userId,input)`; learning `appendInTransaction` and optional stable start-event ID.
- [x] Write failing PostgreSQL tests for replay, atomic rollback, ordering, changed content, cross-owner/claim, concurrency and online-attempt collision.
- [x] Implement permanent bindings and mappings, locking and transaction reuse; run tests and existing learning/campaign suites.

### 3. HTTP, reconnect and host integration

Files: sync service/controller/module/Express/OpenAPI, API config/security/data services/error handling; `packages/challenge-runtime/src/offline.ts`; HTTP/adapter tests.
Interfaces: local capability endpoints and Clerk-backed cloud endpoints from spec; ephemeral sync token forwarded only to configured origin. Host adapter serializes records and retries retained IDs with explicit state.
- [x] Test disabled endpoints, role/origin/capability separation, lost bind/ACK responses, revoked login, bad receipts, failed network and redirects.
- [x] Wire both server adapters and lifecycle; implement bounded batch runner and host adapter; verify parity.

### 4. Operations and acceptance

Files: local SQLite maintenance CLI, Dockerfile/Compose opt-in override, env example, edge tests, architecture/runbook/README.
- [ ] Test consistent backup/restore, corruption preservation and Docker volume restart on both architectures.
- [x] Document protocol, defaults, retention, conflicts, migration/rollback, explicit degraded states and physical/browser limits.
- [ ] Frozen install, full lint/typecheck/test/build/smoke/check plus relevant PostgreSQL/MQTT/browser/edge checks.
- [ ] Independent review; named-file commits, push exact branch, open/attach PR against main; leave clean worktree and report evidence. No merge.
