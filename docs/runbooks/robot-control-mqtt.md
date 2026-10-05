# Semantic robot control over MQTT

Phase 17 adds an opt-in transport. The default `MIMIX_ROBOT_TRANSPORT=legacy`
keeps the existing HTTP/SSE behavior. No browser changes and no physical robot
integration are included. MQTT mode requires Clerk, PostgreSQL and DeviceSessions.
The gateway simulator records semantic intentions; it never executes motors.

## Broker and credentials

Use MQTT 5 over TLS. The reference configuration is
[infra/mqtt/mosquitto.conf](../../infra/mqtt/mosquitto.conf) and the exact ACL is
[infra/mqtt/acl](../../infra/mqtt/acl). Tested with Mosquitto 2.0.22.
Mount the password file and CA-signed server certificate/key with permissions
readable by the broker service account. Do not commit credentials. Provision
passwords interactively with `mosquitto_passwd`; do not put production passwords
in command arguments, logs, topics or browser configuration.

- Backend username: `mimix-backend`, with a unique private password.
- Gateway username: the **DeviceSession UUID returned by pairing**, with another
  unique private password. Device ID is also the server-returned UUID. Neither
  the user JWT nor the Device credential is a broker password.
- Provision gateway credentials out of band after pairing, for that session only.
  Remove its password entry and disconnect its broker client when retiring it.
  A new DeviceSession needs a new username/password; never reuse an old session.
- `use_username_as_clientid true` prevents a gateway spoofing another client's ID.
  One connected process per username; duplicated credentials disconnect each other.
- `allow_anonymous false`, `retain_available false`, `max_qos 1`, `persistence false`
  are required. Restrict broker ingress to backend/gateway networks.

| Topic under `mimix/v1/devices/<DeviceSessionId>/` | Publisher | Subscriber | QoS |
| --- | --- | --- | --- |
| `intents` | backend | that gateway | 1 |
| `ack` | that gateway | backend | 1 |
| `presence` | that gateway | backend | 0 |

All publications are non-retained. Clients use clean MQTT sessions with session
expiry zero. Each reconnect destroys the previous MQTT.js client and outgoing
store; no automatic application retry or offline command queue. Gateway reconnect
creates a fresh connection UUID. Old envelopes cannot target the new connection.
An ACK is a semantic driver handoff or rejection, **not physical completion**.
PUBACK only acknowledges broker delivery and does not establish gateway acceptance.

## Enable and use

Apply migrations through `pnpm --filter @mimix/api db:migrate`, including additive
`0007_robot-control.sql`. Use separate migration and runtime DB roles in production;
the runtime needs table/sequence access, not schema-owner privileges. Keep the
append-only audit trigger installed; table ownership can bypass database controls.

Set server-only variables:

```dotenv
MIMIX_ROBOT_TRANSPORT=mqtt
MIMIX_MQTT_URL=mqtts://broker.example:8883
MIMIX_MQTT_PASSWORD=<private backend password from secret storage>
# Optional private CA, PEM text; standard system trust is used otherwise.
# MIMIX_MQTT_CA_PEM=...
```

The backend username is fixed. TLS certificate verification cannot be disabled.
`MIMIX_MQTT_ALLOW_LOOPBACK=true` permits `mqtt://` only on localhost/loopback for
tests. Never put these variables in `VITE_*` or browser bundles.

Run exactly **one MQTT-enabled API process per database**. A dedicated PostgreSQL
advisory lock `(105,1)` rejects a second process at startup. Orderly shutdown
awaits PostgreSQL acknowledgement of lock release before returning; TCP connection
closure alone does not establish that the next process can acquire it. Lock connection loss
closes transport and the shared voice coordinator. All replicas serving the same
users must use this mode and database; do not run a separate legacy-mode API or
voice process alongside it. General multi-replica embodiment control is deferred.

1. Pair and exchange a DeviceSession with `presence:heartbeat`, `behavior:stop`
   and the desired `behavior:greet`, `behavior:celebrate` or `behavior:attend`.
   Continue the existing authenticated Device heartbeat (at least every 30s).
2. Provision the session's MQTT credentials. Start the simulator with server-issued
   `MIMIX_DEVICE_SESSION_ID`, `MIMIX_DEVICE_ID`, `MIMIX_MQTT_URL`,
   `MIMIX_MQTT_PASSWORD`, optional `MIMIX_MQTT_CA_PEM`:
   `pnpm --filter @mimix/robot-simulator start mqtt`.
3. Original owner login calls `POST /api/robot-control/leases` with
   `{"schemaVersion":1,"deviceSessionId":"<UUID>"}`.
4. Renew with `POST /api/robot-control/leases/<id>/heartbeat` and
   `{"schemaVersion":1}` before its returned `expiresAt` (lease at most 15s,
   bounded by DeviceSession/presence). The shared voice coordinator mutes web
   output on acquisition and aborts pending web permits.
5. Call `POST /api/robot-control/intents` with
   `{"schemaVersion":1,"id":"<new UUID>","controlSessionId":"<UUID>","behavior":"greet","ttlMs":1500}`.
   Only the four semantic behaviors are accepted; no topics, PWM, raw motors or
   client-selected lease/device/timestamps. Defaults to 2000ms; max 2000ms.
6. Read `GET /api/robot-control/intents/<id>` for delivery state. A retry with the
   same request ID and contents does not republish while its authority remains
   valid; changed contents conflict. On `unknown`, do not automatically submit a
   new ID: the remote effect may already have happened.
7. Release via `DELETE /api/robot-control/leases/<id>`. A later login of the same
   owner may release or read history, but cannot dispatch/renew the original grant.
   `GET /api/robot-control/audit?after=<cursor>` provides owner-scoped audit pages.

OpenAPI documents requests and responses without broker secrets. Every control
route is no-store and uses the existing CORS, user authentication and rate limits.

## Failure behavior and physical boundary

Intents are durably prepared before publish and reauthorized under the DeviceStore
owner lock immediately before delivery. Revocation and publication are serialized.
Persisted sequence, intent UUID, DeviceSession, connection nonce and lease ID
correlate ACK. Duplicate ACKs cannot change terminal outcomes. Crash recovery marks
uncertain commands unknown and closes old leases; it never replays them.

Acquisition and the complete close/stop operation are serialized per owner in the
single control process. A new lease cannot overtake a previously persisted stop
between its preparation and delivery transactions, even if the gateway reconnects.
Queued acquisitions recheck authority when admitted. Other owners remain independent.

Gateway presence is emitted every second; the backend requires an observation
within three seconds. Broker loss, missing presence, device expiry/revocation,
lease expiry and missing ACK close control and request a bounded stop when possible.
The local gateway aborts output on disconnect, malformed/retained traffic, wrong
scope, expiry, ordering violations, conflicting replay and driver failure. It also
arms an elapsed-time watchdog for every accepted action, at most two seconds.
The 256-entry per-connection dedup cache never evicts an intent to make it replayable;
capacity fails closed. Reconnect the gateway to start a fresh nonce/cache.

Synchronize database, API and gateway clocks with NTP. The gateway rejects any
future-issued intent; clock skew can cause safe rejections. Once accepted, wall
clock changes cannot extend its elapsed-time watchdog. MQTT message expiry is an
additional broker bound, not a replacement for the gateway TTL check.

The Node watchdog depends on a responsive process/event loop. The real adapter
must map only approved semantic behaviors to ROS 2 services/actions and implement
abort/stop locally. Independent ROS/safety supervisor and firmware watchdogs own
hard motor limits and physical emergency stopping. This PR proves no hardware
behavior, motor stop latency, ROS mapping or ARM64 execution; those need the robot
repository/hardware acceptance in the following phase.

Inspect command backlog and recent audit events operationally. Prepared/published
rows older than their TTL should become unknown on the next sweep (one second).
Persistent old rows or loss of the API leader require intervention, not replay.
Audit contains bounded event/reason codes, IDs and timestamps, no credentials.
Archive audit/history through a separately reviewed retention procedure; do not
remove the append-only trigger to clean up normal runtime data.

## Rollback

1. Stop creating/renewing leases and release active leases; confirm local gateway
   output stopped. Stop the MQTT gateway and MQTT API process. If delivery is
   uncertain, establish local physical stop before switching transports.
2. Start the API with `MIMIX_ROBOT_TRANSPORT=legacy` and the existing separate
   operator/bridge credentials. Then start the legacy gateway integration.
3. Verify the legacy HTTP/SSE contract/simulator smoke. Never keep both physical
   consumers active. MQTT mode returns 404 for legacy motion POST/SSE even in the
   standalone legacy server; there is no automatic downgrade during broker outage.

The additive tables may stay installed on rollback. Uncertain MQTT intentions
must never be translated into legacy movement pulses.

## Reproduce verification

```sh
pnpm install --frozen-lockfile
pnpm check
docker pull eclipse-mosquitto:2.0.22
pnpm --filter @mimix/robot-mqtt test:broker
# Set MIMIX_TEST_DATABASE_URL to a disposable local PostgreSQL 17 instance.
pnpm --filter @mimix/api test:postgres
```

The broker tests create and remove their own loopback Docker containers and
synthetic password files. PostgreSQL tests create and drop isolated databases;
MQTT HTTP tests exercise both Nest and Express against real Mosquitto and a
recording driver. They cover ACL isolation, PUBACK versus ACK, expiry, retained
rejection, duplicate/reordered packets, reconnect nonce fencing, outage stopping,
owner/login/capabilities, revocation races, durable idempotency, late ACK, immutable
audit and database leader loss. CI runs the same proofs.
