# Offline progress and synchronization — prompt 19

Scope: only prompt 19, based on merged edge runtime `91ccb932e1738901778309084395bddb33847e2c`, branch `feat/offline-progress-sync`. Continue without further approval as explicitly authorized. Preserve current UI and cloud behavior behind disabled-by-default flags.

## Protocol

The edge API uses Node 22.23.2's bundled SQLite, WAL, FULL synchronous writes, foreign keys and transactions. No architecture-specific npm addon. SQLite is a local durable event queue, not the cloud source of truth.

`POST /api/offline/sessions` creates a random session UUID and a random local capability (only its hash is stored). A distinct random claim key is stored privately for cloud reconciliation. `Authorization: Local <capability>` authorizes attempt creation, event recording, status, bind and sync. No secrets in URL, logs or challenge sandbox. Normal origin checks and bounded request quotas still apply. Edge stays loopback by default; LAN deployments require the documented trusted transport/operator policy.

Attempts and events have random UUIDs and immutable challenge references. `attempt_started` is sequence 1; subsequent learning records use sequences 2 onward. Exact replay returns the original result. Reused IDs with other data, sequence gaps, records after closure and cross-session access fail. Timestamps are diagnostic only and never assign identity, order or idempotency.

Binding is an explicit caller operation after Clerk login, never inferred from a cached name or requested user UUID. A local request supplies its local capability plus an ephemeral `X-Mimix-Sync-Token` Clerk bearer. The gateway forwards that bearer only to the configured cloud origin, over HTTPS with redirects refused (explicit loopback HTTP option for tests/development). It never persists the Clerk bearer. Binding seals the local session before network I/O; no new attempts/events can be added afterwards. Further offline work uses a new session. Lost binding responses are retryable; another account cannot claim an already bound session.

Cloud `POST /api/sync/bind` uses the existing Clerk verification, live-session check and internal identity mapping. A PostgreSQL session binding permanently associates local session UUID + claim-key hash with one internal user. No caller-supplied user IDs. Cloud `POST /api/sync/batch` checks that binding on every request and atomically maps the local attempt, appends learning events and updates existing learning projections. Per-session locks serialize concurrent imports. Maximum 50 records per batch, preserving local sequence. Start-event IDs remain stable across import. Cloud mapping cannot adopt an unrelated online attempt.

SQLite marks only the exact returned event IDs/sequences acknowledged after validating the receipt and pinned owner. Lost ACKs resend the same IDs and content. A failed batch has no partial cloud writes. No last-write-wins, event renumbering, attempt transfer, campaign unlock import or deletion of cloud learning history.

## Retention, failures and recovery

Queue capacity is bounded (1,000 sessions / 10,000 events); full storage returns an explicit error and never deletes pending data. Acknowledged payloads may be pruned only after 30 days measured using a later trusted cloud receipt time, never the local wall clock. IDs, hashes and binding tombstones remain to reject conflicting replay. Manual backup/archive is required when metadata capacity is reached.

Check SQLite integrity and schema version on open. A corrupt database is retained and local progress endpoints return storage-unavailable; the existing world/gateway can still operate. Provide offline check/backup/restore commands with integrity checks, consistent SQLite snapshots and preservation of the original files. Restore retains IDs and bindings so replay against PostgreSQL stays idempotent. Do not claim to salvage unbacked corrupted data.

Network loss/503/429 retain pending work; 401 requires login; 409 stops reconciliation for operator-visible conflict. The trusted host adapter retries using monotonic delays and an ephemeral token callback, never exporting credentials to a challenge. It exposes status rather than silently claiming success.

## Deployment and boundaries

`MIMIX_OFFLINE_ENABLED` enables local storage only in edge legacy mode; `MIMIX_SYNC_ENABLED` enables cloud import only with Clerk and PostgreSQL. They cannot be enabled together in one process. Local DB path must be absolute. A separate Compose override mounts an owned persistent SQLite volume; default edge/cloud deployment remains unchanged. Additive PostgreSQL migration stores bindings/mappings; rollback disables flags and preserves all files/rows.

Offline means WAN unavailable while the local gateway is reachable. No Clerk login, ElevenLabs, cloud LLM, cloud campaign authorization or browser-only SQLite promise. Official exploratory challenges do not currently produce completion records; no synthetic completion or UI redesign is introduced. The host adapter is the integration boundary for subsequent product UI work, not prompt 20 implementation.

## Acceptance

Real SQLite persistence/reopen, exact/conflicting replay, sequence/closure, wrong wall clock, quota, retention and corrupted-file preservation. Real PostgreSQL import, duplicate/concurrent batches, atomic failure, owner/claim mismatch and online-attempt collision. Nest/Express authorization parity, disabled flags, rejected origins, no secret persistence, lost network/ACK/retry and restored backup. Host-adapter tests prove queued retry IDs and explicit degraded states. Edge tests verify mounted volume persistence and native amd64/ARM64 runtime. Full frozen install, lint, typecheck, tests, build, smoke, relevant integration/browser checks and independent review before PR.
