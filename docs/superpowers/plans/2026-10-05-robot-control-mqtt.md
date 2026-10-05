# Robot Control MQTT Implementation Plan

> Native implementation in this session using executing-plans, with one fresh
> independent whole-branch reviewer. User explicitly authorizes continuing after
> the design; no approval pause. Track test evidence and decisions below.

**Goal:** Dispatch only authorized semantic robot intentions through MQTT, with
bounded delivery, correlated ACK, durable audit and safe local stopping.

**Architecture:** Protocol schemas + pure gateway guard, Node MQTT adapters,
PostgreSQL-backed API control service sharing the voice embodiment registry, and
an opt-in MQTT simulator. A database leader lock enforces the coordinator's current
single-process limit. HTTP/SSE remains an exclusive rollback path.

**Tech Stack:** TypeScript/Zod, MQTT.js 5.16.0, Mosquitto, Drizzle/PostgreSQL,
Nest/Fastify and Express.

**Spec:** ../specs/2026-10-05-robot-control-mqtt-design.md

## Global constraints

- Base ce217f6; branch feat/robot-control-mqtt only; keep developer author.
- No user JWT/broker credentials in robot/browser crossover, no direct motor data.
- Topic namespace per DeviceSession; strict message and ACK scope.
- Intent TTL <=2000ms, gateway heartbeat1s/freshness3s, lease <=15s bounded by device.
- MQTT5 QoS1 intent/ACK; no retained/offline replay; PUBACK is not an application ACK.
- Existing owner lock104 precedes rows; singleton control leader lock105,1.
- Do not edit mimix_robot, redesign UI, merge or start prompt18.

## Review focus

- Remote effect before SQL commit: durable record, no automatic ambiguous replay.
- Lease/device expiry between authorization and publish: fence under authority locks.
- MQTT reconnect automatically retransmitting stored QoS1: destroy old clients/stores.
- Gateway restart resetting dedup state: new connection UUID rejects old packets.
- Broker ACK/malformed response mistaken for physical execution: bounded correlated ACK.

### Task 1 — Control contracts and local gateway guard

Files: packages/robot-protocol/src/{control,gateway,index}.ts;
packages/robot-protocol/test/{control,gateway}.test.js.
Interfaces: strict request/envelope/ACK/presence schemas; topic builders/parsers;
RobotControlTransport server port; GatewayGuard receiving validated scopes and
semantic output driver, with monotonic watchdog and stop lifecycle.
- [x] Write rejection, TTL/correlation, duplicate/conflict/order/nonce and stop tests.
- [x] Observe RED, implement only that behavior, observe GREEN; build/typecheck.
- [x] Keep protocol, adapter and API in one coherent feature commit with the matching workspace lockfile.

### Task 2 — Real MQTT adapters and broker fixture

Files: packages/robot-mqtt/{package.json,tsconfig.json,src/*,test/*};
infra/mqtt/{mosquitto.conf,acl}; API/tool manifests, Dockerfile, lockfile.
Interfaces: backend transport publish/events/readiness/close; gateway transport
binds fresh connection UUID, presence/ACK and GatewayGuard. TLS and bounded startup,
publish deadlines; new clients on reconnect; retained rejection, safe shutdown.
- [x] Real Mosquitto integration RED for ACL direction, cross-device, PUBACK vs ACK,
  reconnect/retained/outage, duplicate/expired/reordered delivery.
- [x] Implement adapters/config and broker fixture, then GREEN.
- [x] Verify frozen install and Node-only dependency boundary.

### Task 3 — Authorized durable control service and leader

Files: apps/api/src/modules/robot-control/{config,leader,service}.ts;
database/schema.ts, migrations; database/services.ts; shared voice registry wiring;
apps/api/test/postgres/robot-control*.js.
Interfaces: service acquire/renew/release/dispatch/get/audit, transport port injected;
leader readiness/loss; commands persist request UUID, sequence and exact scope;
worker expires commands and sessions and records internal stop attempts.
- [x] PostgreSQL RED for owner/login/caps, concurrent revoke/dispatch, leader fencing,
  restart/unknown outcome, dedup/conflict, broker loss and mismatched/late ACK.
- [x] Implement minimal schema/service with owner lock ordering and shared coordinator.
- [x] GREEN focused + full PG; inspect migration SQL, verify drift.

### Task 4 — HTTP, rollback and executable gateway simulator

Files: robot-control HTTP/controller/module/Express/OpenAPI; app and security wiring;
server legacy motion guards/env; tools/robot-simulator MQTT CLI/driver; tests.
- [x] RED Nest/Express parity, default flag, no-store, actor separation, strict bodies,
  exclusive legacy motion guard and CLI no-secret/no-hardware behavior.
- [x] Implement and GREEN; retain existing legacy compatibility tests unchanged.
- [x] Real API→broker→simulated driver→ACK roundtrip and outage/TTL stop test.

### Task 5 — Operational proof and delivery

Files: docs/architecture + runbook, README, server/.env.example, CI MQTT smoke.
- [x] Document ACL provisioning, single control process, clocks/watchdog limits,
  migration roles, backlog monitoring, gateway/hardware handoff and drain rollback.
- [x] Frozen install, pnpm check, PG, real broker smoke, image build/container smoke.
- [x] Fresh independent review of branch, fix substantive findings with RED→GREEN.
- [x] Named staging, Conventional Commits, push and PR main; attach PR, report HEAD.

## Execution record

- Preflight: clean worktree; origin/main verified ce217f6; branch created exactly.
- Design presented before code. Native implementation, final independent review.

- Protocol: missing-export RED before implementation; 21 tests, 20 passed and the
  pre-existing optional Python/robot-repo check skipped. Gateway tests cover
  dedup/no deadline extension, scope, future/expired/retained/order, failures and
  bounded cache saturation.
- MQTT adapters: private TLS config RED then GREEN; real Mosquitto tests verify
  ACL isolation, delivery ACK separation, packet rejection, outage and reconnect.
  The restart fixture reserves its loopback port so Docker cannot reassign it.
- Control service: missing-module RED then GREEN, nine PostgreSQL tests plus two
  full HTTP→Mosquitto→recording-driver→ACK tests across Nest and Express.
- Independent review found two sweep races: expiry between passes could strand
  authority, and a stale sweep snapshot could close a freshly renewed lease.
  Both reproduced; external timeout resolution now stays in the parent-session
  path, and closing conditions are rechecked under the DeviceStore owner lock.
  Fresh reviewer reran all nine control tests and confirmed both fixes, no
  remaining findings. Test teardown closes service/leader before its DB pool.
- Final PostgreSQL suite: 85/85 passed. Frozen install passed. Drizzle generation
  reports no schema drift after additive migration0007 + audit trigger.
- MQTT simulator records behavior/stop only. Hardware, ROS and ARM64 execution are
  explicitly deferred; no frontend or mimix_robot source was changed.
- Final workspace gate: `pnpm check` 53/53 tasks passed (lint, typechecks,
  contracts/unit suites, builds and production smoke dependencies). Real MQTT
  broker proof: 2/2 passed. Full PostgreSQL after both race fixes: 85/85 passed.
- Final production image `mimix:mqtt-phase17` built successfully after review
  fixes; 5/5 container smoke tests passed, including Nest/Express behavior and
  PostgreSQL migration/persistence/backup restoration. Temporary phase PostgreSQL
  and broker fixtures were removed. Delivery is one coherent Conventional Commit
  on feat/robot-control-mqtt followed by a PR; no merge or prompt18 execution.

## PR18 follow-up

- Remote run37389514352, Quality gates job112030978332 failed in the PostgreSQL
  restart test: next leader admission returned `robot control leader unavailable`.
  `PoolClient.release(true)` completed before PostgreSQL processed TCP closure.
  Added delayed-close regression (RED), then explicit acknowledged advisory unlock
  before destroying the connection. This corrects orderly shutdown, not a CI retry.
- External P2 review identified a new acquire/dispatch overtaking the previous
  lease's stop between close transactions. Two regressions (same gateway connection
  and fresh reconnect nonce) failed before the fix. A per-owner lifecycle gate now
  serializes acquisition against the full close/revoke/stop operation. Existing DB
  leader enforces the single-process premise; authorization is sampled after waiting.
- Focused control regressions including both fixes: 12/12 passed.
- Focused independent review confirmed acquisition/stop gating and found a
  concurrent-close variant: a second close could return before the first unlock.
  Added a paused-unlock RED regression; all close callers now share the same
  pending completion promise.
- Independent re-review confirmed the shared close promise resolves the remaining
  finding; 13/13 focused control tests passed. Final full PostgreSQL suite after
  the follow-up: 89/89 passed.
- Final follow-up workspace gate: `pnpm check` 53/53 tasks passed. No migration,
  dependency or protocol wire change is needed for these lifecycle corrections.
