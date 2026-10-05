# Robot protocol v1 and legacy compatibility

`@mimix/robot-protocol` (package 1.0.0) publishes runtime schemas and TypeScript
inference types. This PR adds contracts and a simulator; production endpoints and
payloads remain unchanged. The embodiment coordinator stays authoritative for
output. Parsing a message never grants permission to speak or act.

## Evidence and observed divergences

Inspected on 2026-10-05, read-only:
`mimix_robot` commit `16dd305fa08939a828a441197bffa721f4d0e32b`, specifically:

- `ros_ws/src/mimix_runtime/mimix_runtime/web_bridge_node.py`: `request_json`,
  `on_command`, `handle_motion_event`, `stream_motion_commands`.
- `services/speech_service/elevenlabs_service.py`: `MimixWebClient`.
- `services/vision/vision_service.py`: `hand_payload`, `publish`.

The existing untracked robot `package-lock.json` was not touched. Fixtures in
`packages/robot-protocol/test/fixtures/legacy.json` are synthetic, derived from
these functions and `server/src/legacy.js`; they contain no captured user data.
The optional Python test extracts just `handle_motion_event` and its allowlist
with AST, executes it with in-memory publishers and fixed time, and compares its
results to the TypeScript parser. It does not import ROS or execute robot startup.

| Boundary | Executable behavior | Divergence / consequence |
| --- | --- | --- |
| Context | Robot GET `/api/robot/context`; page `world`/`challenge`, optional selection represented as null | Global legacy context, not owned per device/session |
| Navigation | Robot POST `/api/robot/commands`, `navigate_to` → `world`, `mathematics`, `science`; 409 without web SSE client, 202 otherwise | Browser navigation, not physical movement |
| Motion | Robot GET `/api/robot/motion/stream`, event `robot-motion`; bridge accepts nonempty id, five actions, integer duration 100–500 ms, `expiresAt >= now` | Web emits only 300 ms movement / 100 ms stop and a separate 3000 ms delivery TTL; `issuedAt` is ignored by Python |
| Reconnect | Python waits 1000 ms, emits a local stop after disconnect and on shutdown | No acknowledgements, deduplication, event IDs or replay; reconnection cannot prove hardware execution |
| Vision | Python POSTs 0–2 hands, 21 XYZ points/hand, nested handedness classifications, epoch-ms timestamp, `jetson-native` | Producer sends no token; it fails in Clerk mode until robot is updated separately |
| Vision freshness | Web replaces timestamp with receive clock, retains `producerTimestamp`, replays only frames received in last 5000 ms | Producer timestamp must not grant freshness |
| Presence | Web reports connected stream counts | No device identity/heartbeat/capabilities negotiation on existing wire |
| Camera | MJPEG through `/api/vision/video` and local HTTP upstream | No WebRTC track discovery yet; v1 WebRTC descriptor is preparatory |
| Auth | Header tokens for robot HTTP and SSE | Standalone legacy differs from secured Nest/Express; see matrix below |

Legacy schemas intentionally preserve extension fields. `legacyMotionSchema`
mirrors the consumer, while `parseLegacyMotion(payload, receiverNow)` also checks
expiry. It does not add deduplication absent in Python. `legacyHandFrameSchema`
validates the producer shape, more narrowly than the server's current array-only
check; it is not installed as a new production gate. XYZ values can lie outside
0–1 (MediaPipe permits out-of-image coordinates and negative depth).

## Versioning

Two explicit profiles coexist:

- `mimix-http-sse/legacy`: unversioned existing JSON and named SSE events. The
  profile name is metadata, **never inserted into Python's wire envelope**.
- v1: strict `schemaVersion: 1` DTOs for future transport adapters. Unknown
  versions/fields are rejected; incompatible shape or semantics require a new
  version and adapter. No endpoint starts accepting v1 through this PR.

| v1 schema / type | Meaning and limits |
| --- | --- |
| `robotCapabilitiesSchema` / `RobotCapabilities` | Device ID, unique allowed behaviors, camera transports, hand landmarks and speech availability. Advertisement is not a grant. |
| `robotPresenceSchema` / `RobotPresence` | Device ID, connection UUID, positive sequence, online/offline/degraded, receiver-clock observation and TTL 1–60000 ms. Later receivers must authenticate, enforce ordering and expire it. |
| `robotCameraSchema` / `RobotCamera` | Unavailable, local MJPEG fixed path `/api/vision/video`, or WebRTC opaque track ID. No URL credentials, room secrets or video bytes. |
| `behaviorIntentSchema` / `BehaviorIntent` | Intent UUID, device/conversation/lease IDs, `greet`, `celebrate`, `attend`, `stop`, issued/expiry timestamps with maximum 10000 ms TTL. No arbitrary payload, motor direction, PWM or actuator values. |

`BehaviorIntent` is a proposed semantic vocabulary; `mimix_robot` does not yet
implement it. A future authorized adapter must check device ownership, current
lease, capability, expiration and idempotency before dispatch. Safety/ROS/ESP32
remain final physical authority. Legacy directional motion is confined to the
legacy compatibility profile and is never converted from v1 in this PR.

## Temporary HTTP/SSE authentication

`bridgeHeaders(token, stream)` supplies the same `X-Mimix-Robot-Token` for JSON and
SSE, with the appropriate Accept and cache headers. Empty token omits the header
for legacy local compatibility. The simulator sends it for vision too, preparing
the missing Python producer behavior without changing that repository.

| Route | Standalone legacy / secured runtime in legacy mode | Secured Nest/Express in Clerk mode |
| --- | --- | --- |
| GET robot context; POST robot commands | Bridge header required if configured; otherwise open | Configured bridge header required |
| GET robot motion SSE | Configured bridge header required (503 absent; 401 wrong) | Same role; policy can reject before handler |
| POST vision landmarks | Legacy handler open | Configured bridge header required |
| POST robot motion | Both secrets configured, control header required | Same control role and handler limits |
| POST robot context; GET commands SSE, robot status, vision status/SSE/video | Legacy handlers open | Configured control header required |
| GET vision config / health | Public | Public |

`X-Mimix-Control-Token` is an operator credential, distinct from the bridge
secret. Clerk Bearer tokens and query parameters are not substitutes for either.
The simulator never holds the control secret or user credentials. Use header-aware
fetch/HTTP clients for protected SSE; native browser EventSource cannot set these
headers. Do not move secrets into query strings as a workaround. Simulator fetch
rejects redirects, accepts HTTPS origins or loopback HTTP, and prints no token.
Tokens remain shared compatibility secrets without scoped device expiry; they are
**not DeviceSession grants**. Existing legacy openness is preserved, not expanded.

## Deprecation gates

1. This PR freezes/document-tests current HTTP/SSE and provides reproducible
   compatibility scenarios. No removal date or new production flag is needed.
2. Prompt 15 may add pairing, revocable scoped DeviceSession grants and identified
   presence. The robot must adopt the new grant transport in its own reviewed PR;
   the vision publisher's missing header is a migration prerequisite.
3. Prompt 16 may add MediaProvider/WebRTC; retain explicit local MJPEG fallback.
4. Prompt 17 may add authorized semantic MQTT dispatch and an HTTP/SSE rollback
   switch. Prove expiry, duplicate handling and lease enforcement on both sides.
5. Remove shared secrets/legacy endpoints only after supported robots negotiate
   the successor, migration metrics show no legacy usage for an agreed observation
   window, and a separate removal PR has an operator-approved rollback plan.

Operation, tests and rollback: [runbook](../runbooks/robot-protocol-simulator.md).
