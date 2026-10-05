# DeviceSession pairing implementation plan — prompt 15

Base: origin/main e27845a. Branch: feat/device-session-pairing. Execute with TDD;
prompt explicitly authorizes proceeding without approval pauses. Fresh independent
review before publishing, no merge or prompt 16.

## Design and threat decisions (before implementation)

Opt-in `MIMIX_DEVICE_SESSIONS_ENABLED=true` requires Clerk + PostgreSQL. Default
legacy behavior is unchanged. A robot locally generates a 256-bit verifier and
shows its SHA256 challenge over a trusted local/out-of-band channel. An
authenticated user approves that challenge and a bounded capability list. The
server issues a 128-bit one-time pairing code (5 min); the robot exchanges code
and verifier over HTTPS for a 256-bit opaque DeviceSession token (15 min absolute).
The backend stores only code/token hashes. It stores verified identity metadata
privately to check the originating Clerk session; no user JWT reaches the robot.
The proof challenge is a trust-on-first-use ceremony, not hardware attestation.

Pairing/heartbeat/authorization transitions serialize under PostgreSQL locks.
Five failed pairing attempts lock the invitation. Only approved capabilities may
be granted, and they must be supported by the robot's advertised v1 capabilities.
Device/session IDs are server-generated. Authorization binds device session,
internal user and originating verified user session. Any valid login of the owner
may inspect/revoke for recovery, but another login cannot authorize its use.

Heartbeat recommended every 10s; 30s presence TTL, monotonic sequence (replay never
extends presence). Missing heartbeat, explicit disconnect, absolute expiration or
originating identity-session revocation ends authority. No automatic renewal;
repeat pairing for recovery or lost exchange response. No physical lease/output
is acquired in this phase. Authorization responses are observations, not durable
grants for future dispatch; future adapters must authorize at operation time.

Append-only PostgreSQL audit records lifecycle, heartbeat, replay and denials,
without credentials. A bounded sweeper expires idle records; every protected
operation also checks expiry in the transaction using the database clock. User
and unauthenticated/device routes have quotas; invalid credentials never fall
through to legacy or user authorization. HTTPS is a deployment prerequisite.

## Work packages

1. Protocol: versioned pairing/session/heartbeat/capability schemas; unit tests
   RED→GREEN. Files: packages/robot-protocol/src/devices.ts and test.
2. Persistence/service: migration/schema, transactional pairing, single-use
   exchange, proof binding, scoped authorization, revocation, heartbeat and audit.
   Real PostgreSQL tests RED→GREEN, including concurrent exchange/revocation,
   identity outage/revocation, stolen codes and persistent restart.
3. HTTP: disabled-by-default config, shared security policy with verified identity
   metadata, Nest + Express parity, OpenAPI, integration tests for role separation,
   no-store, owner/session/capability isolation and safe errors.
4. Operations: migration/rollback, threat model, TTL/recovery and reproducible
   protocol examples; frozen install, lint/typecheck/full test/build/smoke,
   PostgreSQL, Docker, independent review, conventional commits/push/PR.

## Review focus

- Theft of code without verifier; substituted challenge outside trusted ceremony.
- Atomic consumption across replicas, revocation against in-flight authorization.
- No heartbeat replay/old connection resurrection or TTL extension.
- Revoked originating Clerk session and unavailable identity/database fail closed.
- No tokens, proof verifier, code or identity metadata in robot responses/audit/logs.

## Review corrections

Independent review found proxy-IP quota starvation, audit sequence/commit ordering
and missing pairing replay audit. Regression tests reproduced each; fixes isolate
verified device quotas, serialize all lifecycle transactions per owner before row
locks, and record valid-proof replays against terminal pairings.

Additional review: a random-token flood still spent SQL before anonymous quota.
Device tokens now have a domain-separated HMAC over their random 256-bit nonce,
using a dedicated shared server key. Canonical signature verification and per-token
quota happen before SQL; no positive-token cache or shared IP allowance is needed
on cold replicas. Database checks still own authority/revocation. Only exchanged
pairings record replay; other terminal states retain their audit cause.
