# Robot protocol simulator implementation plan

> Execute natively with executing-plans and TDD; review the whole branch with a fresh reviewer. Prompt 14 explicitly authorizes continuing without approval pauses.

**Goal:** versioned contracts and a hardware-free compatible robot simulator.
**Architecture:** additive schemas + HTTP/SSE robot-side client; production wire unchanged.
**Tech Stack:** TypeScript strict, Zod 4, Node 22 fetch/test, pnpm/Turbo.
**Spec:** `docs/superpowers/specs/2026-10-05-robot-protocol-simulator-design.md`

## Global constraints

Exact branch `feat/robot-protocol-simulator`, origin/main base; robot read-only;
no UI, ROS, motors, pairing, MQTT, LiveKit; Conventional Commits without attribution.

## Review focus

- Expiry at boundary, invalid duration and unknown version: explicit schema tests.
- Wrong credential role and URL tokens: live auth matrix against both runtimes.
- Fragmented/oversized SSE and disconnect while latency pending: parser/lifecycle tests.
- Cancellation during retry and silent connection: bounded I/O and shutdown tests.
- Workspace and container builds: frozen installation, Turbo ordering and Docker smoke.

### Task 1: protocol contracts

Files: `packages/robot-protocol/{src,test,package.json,tsconfig.json}`, lockfile.
Produces legacy schemas, v1 presence/capabilities/camera/BehaviorIntent schemas,
`parseLegacyMotion(value, now)` and `bridgeHeaders(token, stream)`.
- [x] Write fixture-driven schema/auth tests; run and observe missing exports.
- [x] Implement contracts preserving observed legacy limits, strict v1 boundaries.
- [x] Build/test package, then commit protocol and design/plan.

### Task 2: simulator and executable compatibility

Files: `tools/robot-simulator/{src,test,package.json,tsconfig.json}`, workspace,
ESLint/Docker manifests, optional Python conformance helper.
Consumes task 1 schemas; produces `RobotSimulator` HTTP methods and cancellable
`run(signal, onEvent)` motion consumer; local presence observation and CLI.
- [x] Write failing HTTP/SSE compatibility, latency/fault/reconnect/shutdown tests.
- [x] Implement client, bounded SSE parser and CLI without hardware dependencies.
- [x] Run tests against real Express and Nest; run robot consumer conformance.
- [x] Commit only after relevant checks pass.

### Task 3: operations and final gates

Files: architecture/runbook docs, README.
- [x] Document route auth matrix, divergence provenance, protocol evolution,
      simulator usage/scenarios, migration/deprecation gates and rollback.
- [x] Run frozen install, lint, typecheck, test, build, smoke and Docker checks.
- [x] Fresh branch review; reproduce important findings before fixes.
- Publication: Conventional Commits, push exact branch, complete PR; no merge.

## Execution record

- Baseline: frozen install and 25 Turbo test/build tasks passed on origin/main.
- Protocol: 7 new tests RED → GREEN; optional actual Python consumer probe passes
  10 vectors (8 test cases total with probe).
- Simulator: missing implementation RED → GREEN; live legacy and secured contracts,
  CLI and fault scenarios verified. Final suite has 18 cases.
- Found receiver presence TTL too short for legacy 15-second keepalive; reproduced
  in both runtimes, changed to bounded idle timeout, tests GREEN.
- Fresh independent whole-change review: no critical/minor findings; one P2 remote
  socket failure during pending latency. Reproduced RED (one late motion), fixed by
  observing the reader's rejected closed promise, GREEN (zero late motions).
- Post-fix pnpm check: 47/47 tasks; full repository tests included.
- Implementation commit: eb6d72c. Contract/tool/build wiring committed together
  because they form one additive, executable delivery; documentation separately.
- Review scope rulings: hardware safety, pairing/grants, lease authorization,
  MQTT/WebRTC and changing legacy auth openness are deferred by prompt 14. No
  hardware safety or production migration is claimed; these need later PRs.
- No deferred minor findings. Robot tracked tree and HEAD unchanged; its existing
  untracked package-lock.json remains untouched.
- Browser verification complete: runtime 63/63 and client 51/51; isolated local
  WebKit libraries required on Ubuntu 26.04, as in prior repository runbooks.
- Docker amd64 build and 5/5 container smoke tests passed, including both runtimes,
  Clerk policy and PostgreSQL persistence/backup restore. ARM64 probe unavailable
  (`exec format error`); no hardware/edge certification claimed.
