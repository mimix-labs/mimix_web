# Robot control MQTT — prompt 17

Base `ce217f6a2a18d6a37dfac63381d9af9f1c46710e`, branch
`feat/robot-control-mqtt`. Prompt 17 and 00 authorize implementation, commits, push
and PR after presenting the design; no additional approval pause. No merge or
prompt 18. No changes in the separate robot repository or frontend.

## Boundary and authority

Extend robot-protocol with strict control DTOs and a hardware-independent gateway
acceptance/watchdog state machine. Put MQTT.js 5.16.0 in a Node-only robot-mqtt
package with backend and gateway adapters. The simulator supplies a recording
output driver; actual ROS/safety/firmware integration remains in mimix_robot.
Only BehaviorIntent greet/celebrate/attend/stop may reach the output driver.
Never expose raw directions, PWM, arbitrary payloads or broker credentials in HTTP.

Backend DeviceStore scoped callbacks must check owner, originating Clerk login,
active device, heartbeat and capability immediately around dispatch. Acquiring a
robot lease additionally requires behavior:stop, so every enabled device can stop.
Share the same EmbodimentSessions as VoiceService; robot acquisition mutes new web
voice output and invalidates pending voice permits. Lease operations are audited.

The existing embodiment coordinator is process-local. Enforce one MQTT control
process per database using a dedicated PostgreSQL advisory lock (105,1); do not
pretend to distribute that coordinator. Losing that connection closes control and
voice authority, stops publishing and invalidates local permits. Other replicas
must not serve the same robot conversation with legacy/non-MQTT configuration.
Cold restart invalidates old control leases and pending commands, never replays
motion; the gateway watchdog bounds already-delivered intent output. Boot must
complete before admitting robot operations. No physical safety claim.

## Wire and broker

Topics: `mimix/v1/devices/<DeviceSession UUID>/intents`, `/ack`, `/presence`.
Backend role writes only intents, reads ack/presence. Gateway username is its
DeviceSession UUID and its ACL reads own intents and writes own ack/presence.
Broker binds client ID to authenticated username, disallows anonymous access,
retained publications and QoS2. Ship explicit Mosquitto configuration/ACL and test
cross-device and wrong-direction denial with actual broker credentials.
Credentials are provisioned out of band. No API generates/returns MQTT secrets.

MQTT5, QoS1 for command/ACK, QoS0 for periodic gateway presence, clean start,
sessionExpiryInterval=0, retain=false, queueQoSZero=false. Use fresh MQTT clients
on reconnect, destroy old outgoing stores after disconnect/publish timeout;
no offline motion queue or application retries. Subscription readiness must be
confirmed before publishing. Reject retained incoming messages. MQTT packet expiry
is defense in depth; gateway independently checks absolute expiry and bounds local
watchdogs. Publish callback/PUBACK is not gateway ACK and never hardware completion.
TLS mandatory except explicit loopback test mode, never rejectUnauthorized=false.

## Correlation, deduplication and ordering

HTTP request selects only UUID request/intent ID, control session and allowed
behavior, TTL 1..2000ms. Backend supplies device/conversation/lease IDs, current
issued/expiry timestamps, persistent increasing sequence and current gateway
connection nonce. Cap expiry by DeviceSession absolute/presence and embodiment
lease. A command envelope includes the v1 BehaviorIntent and its authenticated
session/connection routing context; arbitrary MQTT topics are not request inputs.

Each gateway connection gets a fresh UUID. Old connection packets cannot act
following reconnect or process restart. Within a connection, accept increasing
sequences (gaps allowed), reject lower/out-of-order ones; cache a bounded set of
accepted intent IDs/results and resend duplicate ACK without repeating output.
A reused ID with changed content is rejected. Cache saturation fails closed,
never evicts IDs to permit re-execution. Expired duplicates cannot renew output.
A command replaces/stops the previous semantic output and arms a local monotonic
watchdog for the original remaining deadline. Local disconnect/shutdown, malformed
or stale control, driver failure and watchdog expiry stop synchronously.
Driver must honor stop and abort; no software layer can force broken hardware.

Gateway presence heartbeat every 1s, backend freshness at most 3s. Identity comes
from provisioned broker ACL/topic; advertisements never widen DeviceSession grants.
ACK binds intent ID, sequence, device session, gateway connection and lease; accept
only matching nonterminal work, enforce one terminal outcome, audit bounded reason
enums and reject forged/cross-session/duplicate/conflicting outcomes. ACK means
accepted/rejected/stopped at the semantic driver boundary, not a physical sensor
confirmation. Timeout is unknown outcome and forces lease cancellation/stop.

## Persistence and HTTP

Add robot control sessions/commands/append-only audit tables in additive migration.
Use owner-before-row lock order (104,user hash) as DeviceStore. Persist command
intent before external publish; revalidate when publishing. A timeout/crash must
not make an ambiguous command eligible for automatic replay. Idempotent request
lookup binds user ID + request UUID to the exact session/behavior/TTL, returning
existing state without duplicate publish. Server-selected sequences survive API
restart. Persist lease scope, gateway connection and instance identity.

Expose strict no-store user routes under `/api/robot-control` for lease acquire,
heartbeat, release, intent submission, status and audit. User origin/login is
required to acquire/renew/act; same-owner new-login recovery may release. Owners
cannot inspect another user's control sessions or audit. Nest/Express parity.
No browser control credentials or arbitrary client-supplied lease authority.
Safety stop after revocation is a separate internal operation confined to stop
for an already-bound device/session/connection, audited even if delivery fails.

`MIMIX_ROBOT_TRANSPORT=legacy|mqtt` defaults legacy. MQTT requires DeviceSessions
(therefore Clerk and PostgreSQL) and private broker config. Disable legacy physical
motion request/stream when MQTT is enabled, including standalone legacy path;
keep navigation, context and vision compatibility. Rollback explicitly selects
legacy after draining MQTT leases and stopping gateways, never translates semantic
intents into old directional pulses and never runs both movement channels.

## Proof and operational limits

Tests: unauthorized user/login/capability; stale/expired device/lease; idempotency
conflict; concurrent commands/revocation; broker down during/before publish;
PUBACK without application ACK; duplicate/out-of-order/expired/wrong-nonce frames;
retained frames; gateway/API restart; lost leader connection; driver failure;
watchdog stopping; broker ACL cross-device and backend/gateway direction denial.
Use disposable PostgreSQL and Mosquitto. Full frozen-install/check, protocol and
simulator tests, real-broker smoke, Docker/migration smoke, independent review.
No ARM64 execution claim on this x86_64 host; architecture support belongs to the
next explicitly separate phase and physical stop timing requires hardware evidence.

Official references: https://github.com/mqttjs/MQTT.js and
https://mosquitto.org/man/mosquitto-conf-5.html. Read MQTT5 expiry, clean sessions,
callback semantics, retain flags, ACL patterns and username/client-ID binding.
